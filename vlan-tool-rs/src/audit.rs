//! Kör alla regler på varje konfig och kontrollerar sedan att enheterna passar
//! ihop med varandra (trunkar, native-VLAN, IP-krockar).

use crate::finding::{grade, score, Finding, Severity};
use crate::inventory::{join_vlans, short_port};
use crate::parser::{Config, IfMode, Interface, Kind};
use crate::rules::{Rule, ALL_RULES};
use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct RuleResult {
    pub id: &'static str,
    pub title: &'static str,
    pub category: &'static str,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceReport {
    pub name: String,
    pub path: String,
    pub kind: &'static str,
    pub score: u32,
    pub grade: &'static str,
    pub results: Vec<RuleResult>,
    #[serde(skip)]
    pub config: Config,
}

impl DeviceReport {
    pub fn findings(&self) -> impl Iterator<Item = &Finding> {
        self.results.iter().flat_map(|r| r.findings.iter())
    }

    pub fn count(&self, sev: Severity) -> usize {
        self.findings().filter(|f| f.severity == sev).count()
    }

    pub fn passed(&self) -> usize {
        self.results.iter().filter(|r| r.findings.is_empty()).count()
    }

    pub fn worst(&self) -> Option<Severity> {
        self.findings().map(|f| f.severity).max()
    }
}

/// En länk mellan två enheter, hittad via portbeskrivningarna.
#[derive(Debug, Clone, Serialize)]
pub struct Link {
    pub a: String,
    pub a_port: String,
    pub b: String,
    /// None = andra änden är ingen enhet vi har konfig för (t.ex. en dator).
    pub b_port: Option<String>,
    pub vlans: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FleetReport {
    pub devices: Vec<DeviceReport>,
    pub cross: Vec<Finding>,
    pub links: Vec<Link>,
    pub score: u32,
    pub grade: &'static str,
}

impl FleetReport {
    pub fn all_findings(&self) -> impl Iterator<Item = &Finding> {
        self.devices.iter().flat_map(|d| d.findings()).chain(self.cross.iter())
    }

    pub fn count(&self, sev: Severity) -> usize {
        self.all_findings().filter(|f| f.severity == sev).count()
    }

    pub fn worst(&self) -> Option<Severity> {
        self.all_findings().map(|f| f.severity).max()
    }
}

pub fn audit_config(config: Config, only: &[String]) -> DeviceReport {
    let rules: Vec<&Rule> = ALL_RULES
        .iter()
        .filter(|r| r.applies_to(config.kind))
        .filter(|r| only.is_empty() || only.iter().any(|o| o == r.id))
        .collect();
    let results: Vec<RuleResult> = rules
        .iter()
        .map(|r| {
            let mut findings = (r.check)(&config);
            findings.sort_by_key(|f| std::cmp::Reverse(f.severity));
            RuleResult { id: r.id, title: r.title, category: r.category, findings }
        })
        .collect();
    let all: Vec<Finding> = results.iter().flat_map(|r| r.findings.clone()).collect();
    let s = score(&all);
    DeviceReport {
        name: config.display_name().to_string(),
        path: config.path.clone(),
        kind: config.kind.label(),
        score: s,
        grade: grade(s),
        results,
        config,
    }
}

/// Alla .cfg/.txt-filer i en mapp, eller filen själv om `path` är en fil.
pub fn config_paths(path: &Path) -> Result<Vec<PathBuf>> {
    if path.is_file() {
        return Ok(vec![path.to_path_buf()]);
    }
    let mut paths: Vec<PathBuf> = std::fs::read_dir(path)
        .with_context(|| format!("hittade inte {}", path.display()))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|e| e == "cfg" || e == "txt" || e == "conf"))
        .collect();
    paths.sort();
    Ok(paths)
}

pub fn load_configs(paths: &[PathBuf]) -> Result<Vec<Config>> {
    let mut configs = Vec::new();
    for p in paths {
        if p.is_dir() {
            for f in config_paths(p)? {
                configs.push(Config::load(&f).with_context(|| format!("kunde inte läsa {}", f.display()))?);
            }
        } else {
            configs.push(Config::load(p).with_context(|| format!("kunde inte läsa {}", p.display()))?);
        }
    }
    Ok(configs)
}

pub fn audit_fleet(configs: Vec<Config>, only: &[String]) -> FleetReport {
    let (cross, links) = cross_check(&configs);
    let devices: Vec<DeviceReport> = configs.into_iter().map(|c| audit_config(c, only)).collect();
    let fleet_score = if devices.is_empty() {
        100
    } else {
        // Snittet för enheterna, minus avdrag (högst 50) för fel mellan enheterna.
        let avg = devices.iter().map(|d| d.score).sum::<u32>() / devices.len() as u32;
        avg.saturating_sub(cross.iter().map(|f| f.severity.penalty()).sum::<u32>().min(50))
    };
    FleetReport { devices, cross, links, score: fleet_score, grade: grade(fleet_score) }
}

fn allowed_text(i: &Interface) -> String {
    match (&i.mode, &i.allowed) {
        (IfMode::Trunk, Some(v)) => format!("trunk {}", join_vlans(v)),
        (IfMode::Trunk, None) => "trunk alla".into(),
        (IfMode::Access, _) => format!("access {}", i.access_vlan.unwrap_or(1)),
        (IfMode::Routed, _) => "routad".into(),
        _ => String::new(),
    }
}

/// Kontroller som kräver mer än en konfig.
pub fn cross_check(configs: &[Config]) -> (Vec<Finding>, Vec<Link>) {
    let mut out = Vec::new();
    let mut links = Vec::new();
    let by_name: HashMap<&str, &Config> = configs.iter().map(|c| (c.display_name(), c)).collect();

    // --- Länkar ---------------------------------------------------------------
    let mut seen: BTreeSet<(String, String)> = BTreeSet::new();
    for c in configs {
        let me = c.display_name();
        for i in c.interfaces.iter().filter(|i| !i.name.contains('.')) {
            let Some(peer) = i.peer() else { continue };
            let Some(other) = by_name.get(peer) else {
                links.push(Link { a: me.into(), a_port: short_port(&i.name), b: peer.into(), b_port: None, vlans: allowed_text(i) });
                continue;
            };
            let back = other.interfaces.iter().find(|j| !j.name.contains('.') && j.peer() == Some(me));
            let key = if me < peer { (me.to_string(), peer.to_string()) } else { (peer.to_string(), me.to_string()) };
            let Some(back) = back else {
                out.push(Finding::new(
                    "link",
                    Severity::Low,
                    format!("{me} {} säger att den går till {peer}, men {peer} har ingen port tillbaka", short_port(&i.name)),
                ));
                continue;
            };
            if !seen.insert(key) {
                continue;
            }
            // Visa trunksidans VLAN-lista, routerns sida är bara "routad".
            let vlans = if i.mode == IfMode::Trunk || back.mode != IfMode::Trunk { allowed_text(i) } else { allowed_text(back) };
            links.push(Link { a: me.into(), a_port: short_port(&i.name), b: peer.into(), b_port: Some(short_port(&back.name)), vlans });
            check_link(c, i, other, back, &mut out);
        }
    }

    // --- IP-krockar mellan enheter ---------------------------------------------
    let mut ips: BTreeMap<Ipv4Addr, Vec<String>> = BTreeMap::new();
    for c in configs {
        for (i, a) in c.addresses() {
            ips.entry(a).or_default().push(format!("{} {}", c.display_name(), short_port(&i.name)));
        }
    }
    for (ip, owners) in ips.iter().filter(|(_, o)| o.len() > 1) {
        out.push(Finding::new("dup-ip", Severity::Critical, format!("{ip} används på flera ställen: {}", owners.join(", "))));
    }

    // --- Samma VLAN ska heta samma sak överallt ---------------------------------
    let mut names: BTreeMap<u16, BTreeSet<String>> = BTreeMap::new();
    for c in configs {
        for (v, n) in &c.vlans {
            if !n.is_empty() {
                names.entry(*v).or_default().insert(n.clone());
            }
        }
    }
    for (v, set) in names.iter().filter(|(_, s)| s.len() > 1) {
        out.push(Finding::new("vlan-names", Severity::Low, format!("VLAN {v} har olika namn: {}", set.iter().cloned().collect::<Vec<_>>().join(", "))));
    }

    // --- Switcharnas gateway ska vara en router-adress ---------------------------
    let router_ips: BTreeSet<Ipv4Addr> = configs.iter().filter(|c| c.kind == Kind::Router).flat_map(|c| c.addresses().into_iter().map(|(_, a)| a)).collect();
    if !router_ips.is_empty() {
        for c in configs.iter().filter(|c| c.kind == Kind::Switch) {
            if let Some(gw) = c.global("ip default-gateway").and_then(|l| l.text.split_whitespace().nth(2)).and_then(crate::net::parse_ip)
                && !router_ips.contains(&gw) {
                    out.push(Finding::new("gateway", Severity::High, format!("{}: default-gateway {gw} finns inte på någon router", c.display_name())));
                }
        }
    }

    out.sort_by_key(|f| std::cmp::Reverse(f.severity));
    (out, links)
}

fn check_link(a: &Config, ai: &Interface, b: &Config, bi: &Interface, out: &mut Vec<Finding>) {
    let an = format!("{} {}", a.display_name(), short_port(&ai.name));
    let bn = format!("{} {}", b.display_name(), short_port(&bi.name));
    // Router-on-a-stick: jämför trunken med routerns subinterface.
    let (sw, swi, router, ri) = match (ai.mode, bi.mode) {
        (IfMode::Trunk, IfMode::Trunk) => {
            if ai.native_vlan.unwrap_or(1) != bi.native_vlan.unwrap_or(1) {
                out.push(Finding::new(
                    "link",
                    Severity::High,
                    format!("Native-VLAN skiljer: {an} har {} men {bn} har {}", ai.native_vlan.unwrap_or(1), bi.native_vlan.unwrap_or(1)),
                ));
            }
            if ai.allowed != bi.allowed {
                let show = |i: &Interface| i.allowed.as_ref().map_or("alla".into(), |v| join_vlans(v));
                out.push(Finding::new("link", Severity::Medium, format!("Tillåtna VLAN skiljer: {an} [{}] ≠ {bn} [{}]", show(ai), show(bi))));
            }
            return;
        }
        (IfMode::Trunk, _) if b.kind == Kind::Router => (a, ai, b, bi),
        (_, IfMode::Trunk) if a.kind == Kind::Router => (b, bi, a, ai),
        (IfMode::Access, IfMode::Trunk) | (IfMode::Trunk, IfMode::Access) => {
            out.push(Finding::new("link", Severity::High, format!("Läget skiljer: {an} och {bn} – ena sidan är access, andra trunk")));
            return;
        }
        (IfMode::Access, IfMode::Access) if ai.access_vlan != bi.access_vlan => {
            out.push(Finding::new("link", Severity::Medium, format!("{an} och {bn} ligger i olika VLAN")));
            return;
        }
        _ => return,
    };
    let subs: Vec<&Interface> = router.interfaces.iter().filter(|i| i.name.starts_with(&format!("{}.", ri.name))).collect();
    let tags: BTreeSet<u16> = subs.iter().filter(|s| !s.dot1q_native).filter_map(|s| s.dot1q).collect();
    if let Some(allowed) = &swi.allowed {
        let missing: Vec<u16> = tags.iter().copied().filter(|t| !allowed.contains(t)).collect();
        if !missing.is_empty() {
            out.push(Finding::new(
                "link",
                Severity::High,
                format!("{} har subinterface för VLAN {} som trunken på {} {} inte släpper igenom", router.display_name(), join_vlans(&missing), sw.display_name(), short_port(&swi.name)),
            ));
        }
    }
    let router_native = subs.iter().find(|s| s.dot1q_native).and_then(|s| s.dot1q).unwrap_or(1);
    if swi.native_vlan.unwrap_or(1) != router_native {
        out.push(Finding::new(
            "link",
            Severity::High,
            format!("Native-VLAN skiljer: {} {} har {} men {} har {}", sw.display_name(), short_port(&swi.name), swi.native_vlan.unwrap_or(1), router.display_name(), router_native),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{generator, inventory::Inventory, settings::Settings};

    fn root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    }

    fn rules_hit(d: &DeviceReport) -> BTreeSet<&'static str> {
        d.results.iter().filter(|r| !r.findings.is_empty()).map(|r| r.id).collect()
    }

    #[test]
    fn generated_configs_are_clean() {
        let inv = Inventory::load_dir(&root().join("samples")).unwrap();
        let s = Settings { secret: "Hemligt123".into(), ..Settings::default() };
        assert!(inv.validate(s.native_vlan, s.mgmt_vlan).iter().all(|f| f.severity < Severity::Medium));
        let configs: Vec<Config> = generator::generate_all(&inv, &s)
            .unwrap()
            .into_iter()
            .map(|g| Config::parse(&g.hostname, "mem", &g.text))
            .collect();
        let fleet = audit_fleet(configs, &[]);
        for d in &fleet.devices {
            let left: Vec<String> = d.findings().map(|f| format!("{}: {}", f.rule, f.message)).collect();
            assert!(left.is_empty(), "{} har fynd: {left:?}", d.name);
        }
        assert!(fleet.cross.is_empty(), "{:?}", fleet.cross);
        assert_eq!(fleet.links.iter().filter(|l| l.b_port.is_some()).count(), 2);
        assert_eq!(fleet.score, 100);
    }

    #[test]
    fn bad_switch_is_caught() {
        let d = audit_config(Config::load(&root().join("examples-cfg/bad.cfg")).unwrap(), &[]);
        let hit = rules_hit(&d);
        for rule in ["hostname", "ssh", "vty-ssh", "vlans", "trunk"] {
            assert!(hit.contains(rule), "{rule} hittades inte: {hit:?}");
        }
        assert!(d.score < 50);
    }

    #[test]
    fn good_switch_passes_core_rules() {
        let d = audit_config(Config::load(&root().join("examples-cfg/good.cfg")).unwrap(), &[]);
        let hit = rules_hit(&d);
        for rule in ["hostname", "ssh", "vty-ssh", "vlans", "trunk", "login"] {
            assert!(!hit.contains(rule), "{rule} borde vara OK: {hit:?}");
        }
    }

    #[test]
    fn cross_checks_find_native_mismatch() {
        let a = "hostname A\ninterface Gi0/1\n description Trunk mot B\n switchport mode trunk\n switchport trunk native vlan 999\n switchport trunk allowed vlan 10\n!\n";
        let b = "hostname B\ninterface Gi0/2\n description Trunk mot A\n switchport mode trunk\n switchport trunk native vlan 1\n switchport trunk allowed vlan 10,20\n!\n";
        let (cross, links) = cross_check(&[Config::parse("A", "a", a), Config::parse("B", "b", b)]);
        assert_eq!(links.len(), 1);
        assert!(cross.iter().any(|f| f.message.contains("Native-VLAN")));
        assert!(cross.iter().any(|f| f.message.contains("Tillåtna VLAN")));
    }
}
