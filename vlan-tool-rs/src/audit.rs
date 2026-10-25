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
    /// Regelns förklaring (varför den finns), så att JSON-resultatet är självförklarande.
    pub why: &'static str,
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
    /// Antal fynd som togs bort med `! vlantool:ignore`.
    #[serde(skip_serializing_if = "is_zero")]
    pub ignored: usize,
    #[serde(skip)]
    pub config: Config,
}

fn is_zero(n: &usize) -> bool {
    *n == 0
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

    /// Betyg 0–100 per kategori (Åtkomst, VLAN …), i den ordning kategorierna första gången
    /// förekommer bland reglerna. Beräknas som enhetens betyg men bara på kategorins regler.
    pub fn category_scores(&self) -> Vec<(&'static str, u32)> {
        let mut out: Vec<(&'static str, Vec<Finding>)> = Vec::new();
        for r in &self.results {
            match out.iter_mut().find(|(c, _)| *c == r.category) {
                Some((_, v)) => v.extend(r.findings.iter().cloned()),
                None => out.push((r.category, r.findings.clone())),
            }
        }
        out.into_iter().map(|(c, v)| (c, score(&v))).collect()
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

    /// Totaler per nivå och kategori för hela nätet. Fynd mellan enheterna räknas som
    /// kategorin "Mellan enheter".
    pub fn summary(&self) -> Summary {
        let mut by_severity: BTreeMap<Severity, usize> = Severity::ALL.iter().map(|&s| (s, 0)).collect();
        let mut by_category: BTreeMap<String, usize> = BTreeMap::new();
        for d in &self.devices {
            for r in &d.results {
                for f in &r.findings {
                    *by_severity.entry(f.severity).or_default() += 1;
                    *by_category.entry(r.category.to_string()).or_default() += 1;
                }
            }
        }
        for f in &self.cross {
            *by_severity.entry(f.severity).or_default() += 1;
            *by_category.entry(CROSS_CATEGORY.to_string()).or_default() += 1;
        }
        Summary {
            devices: self.devices.len(),
            links: self.links.iter().filter(|l| l.b_port.is_some()).count(),
            findings: by_severity.values().sum(),
            ignored: self.devices.iter().map(|d| d.ignored).sum(),
            by_severity,
            by_category,
        }
    }
}

/// Kategorin som fynd mellan enheter hamnar under i [`Summary`].
pub const CROSS_CATEGORY: &str = "Mellan enheter";

/// Totaler för en körning, se [`FleetReport::summary`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Summary {
    pub devices: usize,
    pub links: usize,
    pub findings: usize,
    /// Fynd som dolts med `! vlantool:ignore`.
    pub ignored: usize,
    /// Alla nivåer finns med, även med 0.
    pub by_severity: BTreeMap<Severity, usize>,
    pub by_category: BTreeMap<String, usize>,
}

impl Summary {
    pub fn count(&self, sev: Severity) -> usize {
        self.by_severity.get(&sev).copied().unwrap_or(0)
    }
}

/// En rad `! vlantool:ignore <regel> [text]` i en konfig.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ignore {
    pub rule: String,
    /// Om satt hoppas bara fynd vars meddelande innehåller texten över.
    pub text: Option<String>,
}

impl Ignore {
    pub fn matches(&self, f: &Finding) -> bool {
        f.rule == self.rule && self.text.as_ref().is_none_or(|t| f.message.contains(t.as_str()))
    }
}

/// Läser `! vlantool:ignore`-kommentarerna ur konfigen.
pub fn ignore_directives(config: &Config) -> Vec<Ignore> {
    config
        .lines
        .iter()
        .filter_map(|l| {
            let rest = l.text.trim().strip_prefix('!')?.trim_start().strip_prefix("vlantool:ignore")?;
            if !rest.is_empty() && !rest.starts_with(char::is_whitespace) {
                return None;
            }
            let rest = rest.trim();
            let (rule, text) = match rest.split_once(char::is_whitespace) {
                Some((r, t)) => (r, t.trim()),
                None => (rest, ""),
            };
            (!rule.is_empty()).then(|| Ignore { rule: rule.to_string(), text: (!text.is_empty()).then(|| text.to_string()) })
        })
        .collect()
}

pub fn audit_config(config: Config, only: &[String]) -> DeviceReport {
    let rules: Vec<&Rule> = ALL_RULES
        .iter()
        .filter(|r| r.applies_to(config.kind))
        .filter(|r| only.is_empty() || only.iter().any(|o| o == r.id))
        .collect();
    let ignores = ignore_directives(&config);
    let mut ignored = 0;
    let results: Vec<RuleResult> = rules
        .iter()
        .map(|r| {
            let mut findings = (r.check)(&config);
            let before = findings.len();
            findings.retain(|f| !ignores.iter().any(|i| i.matches(f)));
            ignored += before - findings.len();
            findings.sort_by_key(|f| std::cmp::Reverse(f.severity));
            RuleResult { id: r.id, title: r.title, category: r.category, why: r.why, findings }
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
        ignored,
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

    // --- Samma hostname på två konfigar -------------------------------------------
    let mut hostnames: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for c in configs {
        hostnames.entry(c.display_name()).or_default().push(&c.path);
    }
    for (name, paths) in hostnames.iter().filter(|(_, p)| p.len() > 1) {
        out.push(Finding::new("dup-hostname", Severity::High, format!("Hostname {name} används av {} konfigar: {}", paths.len(), paths.join(", "))));
    }

    // --- Switchens SVI-nät mot routerns subinterface för samma VLAN --------------
    for sw in configs.iter().filter(|c| c.kind == Kind::Switch) {
        for svi in sw.interfaces.iter().filter(|i| i.svi_vlan().is_some()) {
            let (Some(vlan), Some(net)) = (svi.svi_vlan(), svi.subnet()) else { continue };
            for r in configs.iter().filter(|c| c.kind == Kind::Router) {
                for sub in r.interfaces.iter().filter(|i| i.name.contains('.') && i.dot1q == Some(vlan)) {
                    if let Some(rnet) = sub.subnet()
                        && rnet != net
                    {
                        out.push(Finding::new(
                            "svi-subif",
                            Severity::High,
                            format!(
                                "VLAN {vlan}: {} {} har nät {}/{} men {} {} har {}/{}",
                                sw.display_name(), short_port(&svi.name), net.network, net.prefix,
                                r.display_name(), short_port(&sub.name), rnet.network, rnet.prefix
                            ),
                        ));
                    }
                }
            }
        }
    }

    // --- Olika native-VLAN på olika trunkar i nätet ---------------------------------
    let mut natives: BTreeMap<u16, Vec<String>> = BTreeMap::new();
    for c in configs.iter().filter(|c| c.kind != Kind::Router) {
        for i in c.interfaces.iter().filter(|i| i.mode == IfMode::Trunk) {
            natives.entry(i.native_vlan.unwrap_or(1)).or_default().push(format!("{} {}", c.display_name(), short_port(&i.name)));
        }
    }
    if natives.len() > 1 {
        let parts: Vec<String> = natives.iter().map(|(v, w)| format!("VLAN {v}: {}", w.join(", "))).collect();
        out.push(Finding::new("native-mix", Severity::Low, format!("Trunkarna i nätet har olika native-VLAN ({})", parts.join("; "))));
    }

    // --- Samma nät i två olika VLAN --------------------------------------------------
    let mut nets: BTreeMap<(Ipv4Addr, u8), BTreeMap<u16, Vec<String>>> = BTreeMap::new();
    for c in configs {
        for i in &c.interfaces {
            let vlan = i.svi_vlan().or(if i.name.contains('.') { i.dot1q } else { None });
            if let (Some(vlan), Some(n)) = (vlan, i.subnet()) {
                nets.entry((n.network, n.prefix)).or_default().entry(vlan).or_default().push(format!("{} {}", c.display_name(), short_port(&i.name)));
            }
        }
    }
    for ((network, prefix), vlans) in nets.iter().filter(|(_, v)| v.len() > 1) {
        let parts: Vec<String> = vlans.iter().map(|(v, w)| format!("VLAN {v} ({})", w.join(", "))).collect();
        out.push(Finding::new("vlan-subnet", Severity::High, format!("Nätet {network}/{prefix} används i flera VLAN: {}", parts.join(", "))));
    }

    // --- Slingor (redundanta länkar) --------------------------------------------------
    for e in crate::topology::loops(configs) {
        out.push(Finding::new(
            "loop",
            Severity::Info,
            format!(
                "Slinga i nätet: {} {} – {} {} ger en andra väg mellan enheterna (kontrollera att spanning-tree är på)",
                e.a, e.a_port, e.b, e.b_port.as_deref().unwrap_or("")
            ),
        ));
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
            // Trunken släpper igenom VLAN som inte finns på switchen i andra änden.
            for (from, fi, to) in [(a, ai, b), (b, bi, a)] {
                if let Some(allowed) = &fi.allowed
                    && to.kind != Kind::Router
                {
                    let missing: Vec<u16> = allowed.iter().copied().filter(|v| *v != 1 && !to.vlans.contains_key(v)).collect();
                    if !missing.is_empty() {
                        out.push(Finding::new(
                            "link",
                            Severity::Medium,
                            format!("{} {} släpper igenom VLAN {} som inte finns på {}", from.display_name(), short_port(&fi.name), join_vlans(&missing), to.display_name()),
                        ));
                    }
                }
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

    fn sw(name: &str, body: &str) -> Config {
        Config::parse(name, &format!("{name}.cfg"), &format!("hostname {name}\n{body}"))
    }

    fn rules_of(cross: &[Finding], rule: &str) -> Vec<String> {
        cross.iter().filter(|f| f.rule == rule).map(|f| f.message.clone()).collect()
    }

    #[test]
    fn ignore_rule_for_whole_device() {
        let base = "hostname SW1\nvlan 10\n name A\ninterface Fa0/1\n switchport mode access\n switchport access vlan 10\n!\n";
        let plain = audit_config(Config::parse("sw1", "sw1.cfg", base), &[]);
        assert!(plain.findings().any(|f| f.rule == "ssh"));
        let ignored = audit_config(Config::parse("sw1", "sw1.cfg", &format!("{base}! vlantool:ignore ssh\n")), &[]);
        assert!(!ignored.findings().any(|f| f.rule == "ssh"));
        assert!(ignored.ignored >= 1);
        assert!(ignored.score > plain.score, "betyget räknas efter att fynden tagits bort");
        // Andra regler påverkas inte, och själva regeln finns kvar i listan (som godkänd).
        assert!(ignored.results.iter().any(|r| r.id == "ssh" && r.findings.is_empty()));
        assert_eq!(plain.findings().count() - ignored.findings().count(), ignored.ignored);
    }

    #[test]
    fn ignore_with_text_only_hides_matching_findings() {
        let base = "hostname SW1\ninterface Fa0/1\n switchport mode access\n switchport access vlan 10\n!\ninterface Fa0/2\n switchport mode access\n switchport access vlan 20\n!\n";
        let before = audit_config(Config::parse("sw1", "x", base), &[]);
        let vlan_findings: Vec<&Finding> = before.findings().filter(|f| f.rule == "vlans").collect();
        assert!(vlan_findings.len() >= 2, "{vlan_findings:?}");
        let text = format!("{base}!   vlantool:ignore vlans VLAN 10 \n");
        let after = audit_config(Config::parse("sw1", "x", &text), &[]);
        let left: Vec<&Finding> = after.findings().filter(|f| f.rule == "vlans").collect();
        assert!(left.len() < vlan_findings.len() && !left.is_empty(), "{left:?}");
        assert!(left.iter().all(|f| !f.message.contains("VLAN 10")));
    }

    #[test]
    fn ignore_directive_parsing() {
        let c = Config::parse("x", "x", "hostname X\n! vlantool:ignore ssh\n!vlantool:ignore vlans VLAN 10 finns inte\n! vlantool:ignored foo\n! vanlig kommentar\n ! vlantool:ignore\n");
        assert_eq!(
            ignore_directives(&c),
            vec![
                Ignore { rule: "ssh".into(), text: None },
                Ignore { rule: "vlans".into(), text: Some("VLAN 10 finns inte".into()) },
            ]
        );
        assert!(ignore_directives(&c)[1].matches(&Finding::new("vlans", Severity::High, "VLAN 10 finns inte")));
        assert!(!ignore_directives(&c)[1].matches(&Finding::new("ssh", Severity::High, "VLAN 10 finns inte")));
    }

    #[test]
    fn many_findings_in_one_rule_do_not_zero_the_device() {
        let mut body = String::new();
        for i in 1..=30 {
            body.push_str(&format!("interface Fa0/{i}\n switchport mode access\n switchport access vlan 1\n!\n"));
        }
        let d = audit_config(Config::parse("sw", "sw", &format!("hostname SW\n{body}")), &["access-vlan1".to_string()]);
        assert!(d.findings().count() >= 30);
        assert_eq!(d.score, 75, "30 × Medel räknas som högst 25 poäng");
    }

    #[test]
    fn summary_counts_levels_and_categories() {
        let a = sw("A", "interface Gi0/1\n description Trunk mot B\n switchport mode trunk\n switchport trunk native vlan 999\n!\n");
        let b = sw("B", "interface Gi0/2\n description Trunk mot A\n switchport mode trunk\n!\n");
        let fleet = audit_fleet(vec![a, b], &[]);
        let s = fleet.summary();
        assert_eq!(s.devices, 2);
        assert_eq!(s.links, 1);
        assert_eq!(s.findings, fleet.all_findings().count());
        assert_eq!(s.by_severity.len(), 5);
        for sev in Severity::ALL {
            assert_eq!(s.count(sev), fleet.count(sev));
        }
        assert_eq!(s.by_category.values().sum::<usize>(), s.findings);
        assert_eq!(s.by_category.get(CROSS_CATEGORY).copied(), Some(fleet.cross.len()));
        assert!(s.by_category.contains_key("Åtkomst"));
    }

    #[test]
    fn category_scores_per_category() {
        let d = audit_config(Config::load(&root().join("examples-cfg/bad.cfg")).unwrap(), &[]);
        let cats = d.category_scores();
        let cat_names: Vec<&str> = cats.iter().map(|(c, _)| *c).collect();
        let unique: BTreeSet<&&str> = cat_names.iter().collect();
        assert_eq!(unique.len(), cat_names.len(), "en post per kategori");
        let get = |n: &str| cats.iter().find(|(c, _)| *c == n).map(|(_, s)| *s).unwrap();
        assert!(get("Åtkomst") < 100);
        assert!(get("VLAN") < 100);
        assert!(cats.iter().all(|(_, s)| *s >= d.score), "en kategori kan inte ha lägre betyg än hela enheten");
        let clean = audit_config(Config::parse("x", "x", "hostname X\n"), &["banner".to_string()]);
        assert!(clean.category_scores().iter().all(|(_, s)| *s == 100));
    }

    #[test]
    fn trunk_allowing_vlans_missing_on_the_other_switch() {
        let a = sw("A", "vlan 10\n name X\nvlan 20\n name Y\ninterface Gi0/1\n description Trunk mot B\n switchport mode trunk\n switchport trunk allowed vlan 10,20,30\n!\n");
        let b = sw("B", "vlan 10\n name X\ninterface Gi0/2\n description Trunk mot A\n switchport mode trunk\n switchport trunk allowed vlan 10,20,30\n!\n");
        let (cross, _) = cross_check(&[a, b]);
        let m = rules_of(&cross, "link");
        // A släpper igenom 20 och 30 som B saknar; B släpper igenom 30 som A saknar.
        assert!(m.iter().any(|t| t.contains("A Gi0/1") && t.contains("VLAN 20,30") && t.contains("inte finns på B")), "{m:?}");
        assert!(m.iter().any(|t| t.contains("B Gi0/2") && t.contains("VLAN 30 ") && t.contains("inte finns på A")), "{m:?}");
    }

    #[test]
    fn duplicate_hostnames_are_reported() {
        let a = Config::parse("a", "a.cfg", "hostname SW\n");
        let b = Config::parse("b", "b.cfg", "hostname SW\n");
        let c = Config::parse("c", "c.cfg", "hostname OTHER\n");
        let (cross, _) = cross_check(&[a, b, c]);
        let m = rules_of(&cross, "dup-hostname");
        assert_eq!(m.len(), 1);
        assert!(m[0].contains("SW") && m[0].contains("a.cfg") && m[0].contains("b.cfg"), "{m:?}");
        assert!(rules_of(&cross_check(&[Config::parse("c", "c", "hostname OTHER\n")]).0, "dup-hostname").is_empty());
    }

    #[test]
    fn svi_network_must_match_router_subinterface() {
        let router = |ip: &str| sw("R", &format!("interface Gi0/0\n no shutdown\n!\ninterface Gi0/0.99\n encapsulation dot1Q 99\n ip address {ip} 255.255.255.0\n!\nip route 0.0.0.0 0.0.0.0 1.1.1.1\n"));
        let switch = sw("S", "interface Vlan99\n ip address 10.0.99.2 255.255.255.0\n!\ninterface Fa0/1\n switchport mode access\n!\n");
        let (ok, _) = cross_check(&[router("10.0.99.1"), switch.clone()]);
        assert!(rules_of(&ok, "svi-subif").is_empty(), "{ok:?}");
        let (bad, _) = cross_check(&[router("10.0.98.1"), switch]);
        let m = rules_of(&bad, "svi-subif");
        assert_eq!(m.len(), 1, "{bad:?}");
        assert!(m[0].contains("VLAN 99") && m[0].contains("10.0.99.0/24") && m[0].contains("10.0.98.0/24"), "{m:?}");
    }

    #[test]
    fn different_native_vlans_across_trunks() {
        let trunk = |n: &str, native: &str| format!("interface {n}\n switchport mode trunk\n{native}!\n");
        let a = sw("A", &(trunk("Gi0/1", " switchport trunk native vlan 999\n") + &trunk("Gi0/2", " switchport trunk native vlan 999\n")));
        let b = sw("B", &trunk("Gi0/1", " switchport trunk native vlan 999\n"));
        assert!(rules_of(&cross_check(&[a.clone(), b]).0, "native-mix").is_empty());
        let c = sw("C", &trunk("Gi0/1", ""));
        let m = rules_of(&cross_check(&[a, c]).0, "native-mix");
        assert_eq!(m.len(), 1);
        assert!(m[0].contains("VLAN 999") && m[0].contains("VLAN 1:"), "{m:?}");
    }

    #[test]
    fn same_network_in_two_vlans() {
        let r = sw("R", "interface Gi0/0.10\n encapsulation dot1Q 10\n ip address 10.0.0.1 255.255.255.0\n!\ninterface Gi0/0.20\n encapsulation dot1Q 20\n ip address 10.0.0.129 255.255.255.0\n!\ninterface Gi0/0.30\n encapsulation dot1Q 30\n ip address 10.0.30.1 255.255.255.0\n!\n");
        let m = rules_of(&cross_check(&[r]).0, "vlan-subnet");
        assert_eq!(m.len(), 1);
        assert!(m[0].contains("10.0.0.0/24") && m[0].contains("VLAN 10") && m[0].contains("VLAN 20") && !m[0].contains("VLAN 30"), "{m:?}");
        // Samma nät i samma VLAN på switch (SVI) och router är bra.
        let r2 = sw("R", "interface Gi0/0.10\n encapsulation dot1Q 10\n ip address 10.0.0.1 255.255.255.0\n!\n");
        let s2 = sw("S", "interface Vlan10\n ip address 10.0.0.2 255.255.255.0\n!\n");
        assert!(rules_of(&cross_check(&[r2, s2]).0, "vlan-subnet").is_empty());
    }

    #[test]
    fn loops_are_reported_as_info() {
        let t = |me: &str, a: &str, b: &str| sw(me, &format!("interface Gi0/1\n description Trunk mot {a}\n switchport mode trunk\n!\ninterface Gi0/2\n description Trunk mot {b}\n switchport mode trunk\n!\n"));
        let (cross, links) = cross_check(&[t("A", "B", "C"), t("B", "A", "C"), t("C", "A", "B")]);
        let hits: Vec<&Finding> = cross.iter().filter(|f| f.rule == "loop").collect();
        assert_eq!(hits.len(), 1, "{cross:?}");
        assert_eq!(hits[0].severity, Severity::Info);
        assert!(links.len() >= 2);
        // En kedja är ingen slinga.
        let chain = [sw("A", "interface Gi0/1\n description Trunk mot B\n switchport mode trunk\n!\n"), sw("B", "interface Gi0/1\n description Trunk mot A\n switchport mode trunk\n!\n")];
        assert!(rules_of(&cross_check(&chain).0, "loop").is_empty());
    }
}
