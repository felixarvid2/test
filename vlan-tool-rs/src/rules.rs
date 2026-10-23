//! Reglerna som granskar en konfig. En regel får en tolkad konfig och returnerar
//! en lista med fynd. Tom lista = regeln är OK.
//!
//! Lägg till en regel: skriv en funktion `fn x(c: &Config) -> Vec<Finding>` och
//! lägg in den i `ALL_RULES` längst ner.

use crate::finding::{Finding, Severity};
use crate::inventory::{join_vlans, short_port};
use crate::net::{parse_ip, Subnet};
use crate::parser::{Config, IfMode, Kind};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Applies {
    All,
    Switch,
    Router,
}

pub struct Rule {
    pub id: &'static str,
    pub title: &'static str,
    pub category: &'static str,
    /// Allvarligast möjliga fynd från regeln (för listan i `vlantool rules`).
    pub severity: Severity,
    pub applies: Applies,
    pub why: &'static str,
    pub check: fn(&Config) -> Vec<Finding>,
}

impl Rule {
    pub fn applies_to(&self, kind: Kind) -> bool {
        match self.applies {
            Applies::All => true,
            Applies::Switch => kind != Kind::Router,
            Applies::Router => kind != Kind::Switch,
        }
    }
}

// ---------------------------------------------------------------------------
// Grund
// ---------------------------------------------------------------------------

fn hostname(c: &Config) -> Vec<Finding> {
    match c.hostname.as_deref() {
        None => vec![Finding::new("hostname", Severity::High, "Inget hostname är satt").fix([format!("hostname {}", c.name)])],
        Some(h @ ("Switch" | "Router" | "switch" | "router")) => {
            vec![Finding::new("hostname", Severity::Medium, format!("Hostname är fortfarande standardnamnet '{h}'"))
                .at(c.global("hostname").map_or(0, |l| l.no))]
        }
        _ => vec![],
    }
}

fn timestamps(c: &Config) -> Vec<Finding> {
    if c.global("service timestamps log datetime").is_none() {
        return vec![Finding::new("timestamps", Severity::Low, "Loggmeddelanden saknar tidsstämplar")
            .fix(["service timestamps log datetime msec", "service timestamps debug datetime msec"])];
    }
    vec![]
}

fn domain_lookup(c: &Config) -> Vec<Finding> {
    if c.global("no ip domain-lookup").is_none() && c.global("no ip domain lookup").is_none() {
        return vec![Finding::new("domain-lookup", Severity::Info, "DNS-uppslag av felstavade kommandon är på (terminalen hänger)")
            .fix(["no ip domain-lookup"])];
    }
    vec![]
}

// ---------------------------------------------------------------------------
// Åtkomst och lösenord
// ---------------------------------------------------------------------------

fn ssh_enabled(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    if c.global("ip domain-name ").is_none() && c.global("ip domain name ").is_none() {
        out.push(Finding::new("ssh", Severity::High, "Inget domännamn (behövs för att skapa SSH-nycklar)").fix(["ip domain-name nordvik.example"]));
    }
    if c.global("ip ssh version 2").is_none() {
        out.push(Finding::new("ssh", Severity::High, "SSH version 2 är inte påtvingat").fix(["ip ssh version 2"]));
    }
    out
}

fn vty_transport(c: &Config) -> Vec<Finding> {
    let vtys: Vec<_> = c.blocks_of("line").filter(|b| b.name().starts_with("vty")).collect();
    if vtys.is_empty() {
        return vec![Finding::new("vty-ssh", Severity::High, "Inga vty-linjer är konfigurerade (standard kan tillåta telnet)")
            .fix(["line vty 0 15", " transport input ssh", " login local"])];
    }
    let mut out = Vec::new();
    for b in vtys {
        match b.find("transport input") {
            None => out.push(
                Finding::new("vty-ssh", Severity::High, format!("{}: 'transport input ssh' saknas", b.header.text))
                    .at(b.header.no)
                    .fix([b.header.text.clone(), " transport input ssh".into()]),
            ),
            Some(l) => {
                let words: Vec<&str> = l.text.split_whitespace().collect();
                if words.contains(&"telnet") || words.contains(&"all") {
                    out.push(
                        Finding::new("vty-ssh", Severity::Critical, format!("{}: telnet är tillåtet ('{}')", b.header.text, l.text))
                            .at(l.no)
                            .fix([b.header.text.clone(), " transport input ssh".into()]),
                    );
                } else if !words.contains(&"ssh") {
                    out.push(Finding::new("vty-ssh", Severity::Medium, format!("{}: SSH är inte tillåtet ('{}')", b.header.text, l.text)).at(l.no));
                }
            }
        }
    }
    out
}

fn line_login(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for b in c.blocks_of("line").filter(|b| b.name().starts_with("vty") || b.name().starts_with("con")) {
        if b.has("no login") {
            out.push(
                Finding::new("login", Severity::Critical, format!("{}: 'no login' – vem som helst kommer in utan lösenord", b.header.text))
                    .at(b.find("no login").unwrap().no)
                    .fix([b.header.text.clone(), " login local".into()]),
            );
        } else if b.find("login local").is_none() && b.name().starts_with("vty") {
            let sev = if b.find("password").is_some() { Severity::Medium } else { Severity::High };
            out.push(
                Finding::new("login", sev, format!("{}: använder inte lokala användarkonton ('login local' saknas)", b.header.text))
                    .at(b.header.no)
                    .fix([b.header.text.clone(), " login local".into()]),
            );
        }
    }
    out
}

fn exec_timeout(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for b in c.blocks_of("line").filter(|b| b.name().starts_with("vty") || b.name().starts_with("con")) {
        match b.find("exec-timeout") {
            Some(l) if l.text.split_whitespace().skip(1).all(|w| w == "0") => out.push(
                Finding::new("exec-timeout", Severity::Medium, format!("{}: sessioner loggas aldrig ut ('{}')", b.header.text, l.text))
                    .at(l.no)
                    .fix([b.header.text.clone(), " exec-timeout 10 0".into()]),
            ),
            None => out.push(
                Finding::new("exec-timeout", Severity::Low, format!("{}: ingen exec-timeout satt", b.header.text))
                    .at(b.header.no)
                    .fix([b.header.text.clone(), " exec-timeout 10 0".into()]),
            ),
            _ => {}
        }
    }
    out
}

fn local_users(c: &Config) -> Vec<Finding> {
    let users: Vec<_> = c.globals("username ").collect();
    let mut out = Vec::new();
    if users.is_empty() {
        out.push(Finding::new("users", Severity::High, "Inga lokala användare finns (login local fungerar inte)").fix(["username drift privilege 15 secret <lösenord>"]));
    }
    for u in users {
        let words: Vec<&str> = u.text.split_whitespace().collect();
        if let Some(i) = words.iter().position(|w| *w == "password") {
            // "password 7 ..." är svagt krypterat, "password text" är klartext.
            let weak = if words.get(i + 1) == Some(&"7") { "svag typ 7-kryptering" } else { "klartext" };
            out.push(
                Finding::new("users", Severity::High, format!("Användaren {} har lösenord med {weak}, använd 'secret'", words[1]))
                    .at(u.no)
                    .fix([format!("username {} secret <lösenord>", words[1])]),
            );
        }
    }
    out
}

fn enable_secret(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    if let Some(l) = c.global("enable password") {
        out.push(Finding::new("enable", Severity::High, "'enable password' är svagt krypterat, använd 'enable secret'").at(l.no).fix(["no enable password", "enable secret <lösenord>"]));
    }
    if c.global("enable secret").is_none() {
        out.push(Finding::new("enable", Severity::Medium, "Inget 'enable secret' – privilegierat läge är oskyddat från konsolen").fix(["enable secret <lösenord>"]));
    }
    out
}

fn placeholder_secret(c: &Config) -> Vec<Finding> {
    let hits: Vec<_> = c.lines.iter().filter(|l| l.text.contains("CHANGE_ME")).collect();
    match hits.first() {
        Some(first) => vec![Finding::new(
            "placeholder",
            Severity::Medium,
            format!("{} rad(er) har kvar platshållarlösenordet CHANGE_ME – sätt riktiga lösenord i nordvik.toml", hits.len()),
        )
        .at(first.no)],
        None => vec![],
    }
}

fn password_encryption(c: &Config) -> Vec<Finding> {
    if c.global("service password-encryption").is_none() {
        return vec![Finding::new("pw-encryption", Severity::Low, "Lösenord i konfigen visas i klartext").fix(["service password-encryption"])];
    }
    vec![]
}

fn banner(c: &Config) -> Vec<Finding> {
    if c.global("banner motd").is_none() && c.global("banner login").is_none() {
        return vec![Finding::new("banner", Severity::Info, "Ingen varningsbanner vid inloggning").fix(["banner motd ^Endast behorig personal^"])];
    }
    vec![]
}

fn http_server(c: &Config) -> Vec<Finding> {
    match c.lines.iter().find(|l| l.text == "ip http server") {
        Some(l) => vec![Finding::new("http", Severity::Medium, "Okrypterad webbserver (ip http server) är på").at(l.no).fix(["no ip http server"])],
        None => vec![],
    }
}

// ---------------------------------------------------------------------------
// Drift: loggning och tid
// ---------------------------------------------------------------------------

fn ntp(c: &Config) -> Vec<Finding> {
    if c.global("ntp server").is_none() {
        return vec![Finding::new("ntp", Severity::Medium, "Ingen NTP-server – loggarnas tider går inte att lita på").fix(["ntp server <adress>"])];
    }
    vec![]
}

fn logging(c: &Config) -> Vec<Finding> {
    // Packet Tracer visar loggservern som "logging 1.2.3.4" utan "host".
    let remote = c.globals("logging ").any(|l| {
        let w: Vec<&str> = l.text.split_whitespace().collect();
        (w.get(1) == Some(&"host") && w.len() >= 3) || w.get(1).is_some_and(|a| parse_ip(a).is_some())
    });
    if !remote {
        return vec![Finding::new("logging", Severity::Medium, "Ingen extern loggserver (logging host)").fix(["logging host <adress>"])];
    }
    vec![]
}

// ---------------------------------------------------------------------------
// VLAN och switchportar
// ---------------------------------------------------------------------------

fn vlans_defined(c: &Config) -> Vec<Finding> {
    let mut defined: BTreeSet<u16> = c.vlans.keys().copied().collect();
    defined.insert(1);
    let mut out = Vec::new();
    for i in &c.interfaces {
        let used = match i.mode {
            IfMode::Access => i.access_vlan.into_iter().map(|v| (v, "access")).collect::<Vec<_>>(),
            IfMode::Trunk => i.native_vlan.into_iter().map(|v| (v, "native")).collect(),
            _ => i.svi_vlan().into_iter().map(|v| (v, "SVI")).collect(),
        };
        for (v, how) in used {
            if !defined.contains(&v) {
                out.push(
                    Finding::new("vlans", Severity::High, format!("{}: VLAN {v} används ({how}) men är inte definierat", short_port(&i.name)))
                        .at(i.line)
                        .fix([format!("vlan {v}"), format!(" name VLAN{v}")]),
                );
            }
        }
        if let (IfMode::Trunk, Some(allowed)) = (i.mode, &i.allowed) {
            let missing: Vec<u16> = allowed.iter().copied().filter(|v| !defined.contains(v)).collect();
            if !missing.is_empty() {
                out.push(
                    Finding::new("vlans", Severity::Medium, format!("{}: trunken tillåter VLAN {} som inte finns på switchen", short_port(&i.name), join_vlans(&missing)))
                        .at(i.line)
                        .fix(missing.iter().flat_map(|v| [format!("vlan {v}"), format!(" name VLAN{v}")])),
                );
            }
        }
    }
    out
}

fn unused_vlans(c: &Config) -> Vec<Finding> {
    let mut used: BTreeSet<u16> = BTreeSet::new();
    for i in &c.interfaces {
        used.extend(i.access_vlan);
        used.extend(i.native_vlan);
        used.extend(i.svi_vlan());
        if let Some(a) = &i.allowed {
            used.extend(a.iter().copied());
        }
    }
    // Ingen trunk med lista betyder att alla VLAN kan gå på trunken.
    if c.interfaces.iter().any(|i| i.mode == IfMode::Trunk && i.allowed.is_none()) {
        return vec![];
    }
    let unused: Vec<u16> = c.vlans.keys().copied().filter(|v| !used.contains(v)).collect();
    if unused.is_empty() {
        return vec![];
    }
    vec![Finding::new("unused-vlans", Severity::Info, format!("VLAN {} är definierade men används inte", join_vlans(&unused)))
        .fix(unused.iter().map(|v| format!("no vlan {v}")))]
}

fn trunks(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for i in c.interfaces.iter().filter(|i| i.mode == IfMode::Trunk) {
        let port = short_port(&i.name);
        let header = format!("interface {}", i.name);
        match i.native_vlan {
            None | Some(1) => out.push(
                Finding::new("trunk", Severity::High, format!("{port}: native-VLAN är 1 (risk för VLAN-hopping)"))
                    .at(i.line)
                    .fix([header.clone(), " switchport trunk native vlan 999".into()]),
            ),
            _ => {}
        }
        if i.allowed.is_none() {
            out.push(
                Finding::new("trunk", Severity::Medium, format!("{port}: trunken släpper igenom alla VLAN"))
                    .at(i.line)
                    .fix([header.clone(), " switchport trunk allowed vlan <lista>".into()]),
            );
        }
    }
    out
}

fn access_ports(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for i in c.interfaces.iter().filter(|i| i.mode == IfMode::Access) {
        let port = short_port(&i.name);
        if matches!(i.access_vlan, None | Some(1)) && !i.shutdown {
            out.push(
                Finding::new("access-vlan1", Severity::Medium, format!("{port}: accessporten ligger i VLAN 1"))
                    .at(i.line)
                    .fix([format!("interface {}", i.name), " switchport access vlan <vlan>".into()]),
            );
        }
    }
    out
}

fn edge_protection(c: &Config) -> Vec<Finding> {
    let missing: Vec<_> = c.interfaces.iter().filter(|i| i.mode == IfMode::Access && !i.shutdown && (!i.portfast || !i.bpduguard)).collect();
    if missing.is_empty() {
        return vec![];
    }
    let names: Vec<String> = missing.iter().map(|i| short_port(&i.name)).collect();
    let mut fix = Vec::new();
    for i in &missing {
        fix.extend([format!("interface {}", i.name), " spanning-tree portfast".into(), " spanning-tree bpduguard enable".into()]);
    }
    vec![Finding::new(
        "edge",
        Severity::Low,
        format!("{} accessport(ar) saknar portfast/bpduguard: {}", missing.len(), compact_list(&names)),
    )
    .at(missing[0].line)
    .fix(fix)]
}

fn descriptions(c: &Config) -> Vec<Finding> {
    let missing: Vec<String> = c
        .interfaces
        .iter()
        .filter(|i| !i.shutdown && i.description.is_empty() && matches!(i.mode, IfMode::Access | IfMode::Trunk | IfMode::Routed))
        .map(|i| short_port(&i.name))
        .collect();
    if missing.is_empty() {
        return vec![];
    }
    vec![Finding::new("description", Severity::Info, format!("Aktiva portar utan beskrivning: {}", compact_list(&missing)))]
}

fn stp_mode(c: &Config) -> Vec<Finding> {
    if c.kind == Kind::Switch && c.global("spanning-tree mode rapid-pvst").is_none() && c.global("spanning-tree mode mst").is_none() {
        return vec![Finding::new("stp", Severity::Low, "Spanning tree kör långsam klassisk PVST").fix(["spanning-tree mode rapid-pvst"])];
    }
    vec![]
}

fn switch_mgmt(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    let svi = c.interfaces.iter().find(|i| i.svi_vlan().is_some() && i.ip.is_some());
    match svi {
        None => out.push(Finding::new("mgmt", Severity::Medium, "Switchen har ingen hanterings-IP (interface VlanX) och går inte att nå med SSH")),
        Some(i) => {
            if i.shutdown {
                out.push(Finding::new("mgmt", Severity::High, format!("{} är avstängt", i.name)).at(i.line).fix([format!("interface {}", i.name), " no shutdown".into()]));
            }
            match c.global("ip default-gateway") {
                None => out.push(Finding::new("mgmt", Severity::Medium, "Ingen 'ip default-gateway' – switchen nås bara från sitt eget nät")),
                Some(l) => {
                    let gw = l.text.split_whitespace().nth(2).and_then(parse_ip);
                    if let (Some(gw), Some(net)) = (gw, i.subnet())
                        && !net.contains(gw) {
                            out.push(Finding::new("mgmt", Severity::High, format!("Default-gateway {gw} ligger inte i hanteringsnätet {net}")).at(l.no));
                        }
                }
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

fn subinterfaces(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for i in c.interfaces.iter().filter(|i| i.name.contains('.')) {
        let tag: Option<u16> = i.name.rsplit('.').next().and_then(|t| t.parse().ok());
        match i.dot1q {
            None => out.push(
                Finding::new("subif", Severity::High, format!("{}: subinterface utan 'encapsulation dot1Q'", i.name))
                    .at(i.line)
                    .fix([format!("interface {}", i.name), format!(" encapsulation dot1Q {}", tag.unwrap_or(0))]),
            ),
            Some(v) if Some(v) != tag => out.push(
                Finding::new("subif", Severity::Low, format!("{}: taggar VLAN {v} – förvirrande när numret inte matchar", i.name)).at(i.line),
            ),
            _ => {}
        }
        if i.ip.is_none() && !i.dot1q_native {
            out.push(Finding::new("subif", Severity::High, format!("{}: subinterface utan IP-adress", i.name)).at(i.line));
        }
    }
    // Den fysiska porten under subinterfacen måste vara på.
    for parent in c.interfaces.iter().filter(|i| !i.name.contains('.') && i.shutdown) {
        if c.interfaces.iter().any(|i| i.name.starts_with(&format!("{}.", parent.name))) {
            out.push(
                Finding::new("subif", Severity::Critical, format!("{} är avstängd – inga subinterface kommer upp", parent.name))
                    .at(parent.line)
                    .fix([format!("interface {}", parent.name), " no shutdown".into()]),
            );
        }
    }
    out
}

fn dhcp_pools(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    let excluded: Vec<(u32, u32)> = c
        .globals("ip dhcp excluded-address")
        .filter_map(|l| {
            let w: Vec<&str> = l.text.split_whitespace().collect();
            let a = parse_ip(w.get(3)?)?;
            let b = w.get(4).and_then(|x| parse_ip(x)).unwrap_or(a);
            Some((u32::from(a), u32::from(b)))
        })
        .collect();
    for b in c.blocks_of("ip dhcp pool") {
        let name = b.header.text.trim_start_matches("ip dhcp pool").trim();
        let Some(net) = b.rest("network").and_then(Subnet::parse) else {
            out.push(Finding::new("dhcp", Severity::High, format!("Poolen {name} saknar 'network'")).at(b.header.no));
            continue;
        };
        match b.value("default-router").and_then(parse_ip) {
            None => out.push(Finding::new("dhcp", Severity::High, format!("Poolen {name} saknar default-router – klienterna når inget annat nät")).at(b.header.no)),
            Some(gw) => {
                if !net.contains(gw) {
                    out.push(Finding::new("dhcp", Severity::High, format!("Poolen {name}: default-router {gw} ligger inte i {net}")).at(b.header.no));
                } else if !c.addresses().iter().any(|(_, a)| *a == gw) {
                    out.push(Finding::new("dhcp", Severity::High, format!("Poolen {name}: ingen egen interface har adressen {gw}")).at(b.header.no));
                }
                if !excluded.iter().any(|(s, e)| (*s..=*e).contains(&u32::from(gw))) {
                    out.push(
                        Finding::new("dhcp", Severity::Medium, format!("Poolen {name}: gatewayen {gw} är inte undantagen och kan delas ut"))
                            .at(b.header.no)
                            .fix([format!("ip dhcp excluded-address {gw}")]),
                    );
                }
            }
        }
        if b.find("dns-server").is_none() {
            out.push(Finding::new("dhcp", Severity::Low, format!("Poolen {name} delar inte ut någon DNS-server")).at(b.header.no));
        }
        if !c.interfaces.iter().any(|i| i.subnet() == Some(net)) {
            out.push(Finding::new("dhcp", Severity::Medium, format!("Poolen {name} ({net}) matchar inget interface på routern")).at(b.header.no));
        }
    }
    out
}

fn nat(c: &Config) -> Vec<Finding> {
    if !c.blocks_of("interface").any(|b| b.has("ip nat inside")) {
        return vec![];
    }
    let mut out = Vec::new();
    let outside = c.blocks_of("interface").any(|b| b.has("ip nat outside"));
    if !outside {
        out.push(Finding::new("nat", Severity::High, "NAT: inget interface är 'ip nat outside'"));
    }
    match c.global("ip nat inside source") {
        None => out.push(Finding::new("nat", Severity::High, "NAT: 'ip nat inside source' saknas – inget översätts")),
        Some(l) => {
            let w: Vec<&str> = l.text.split_whitespace().collect();
            if let Some(i) = w.iter().position(|x| *x == "list") {
                let acl = w.get(i + 1).copied().unwrap_or("");
                let has_acl = c.global(&format!("access-list {acl} ")).is_some() || c.global(&format!("ip access-list standard {acl}")).is_some();
                if !has_acl {
                    out.push(Finding::new("nat", Severity::High, format!("NAT använder ACL {acl} som inte finns")).at(l.no));
                }
            }
        }
    }
    out
}

fn default_route(c: &Config) -> Vec<Finding> {
    if c.kind == Kind::Router && c.global("ip route 0.0.0.0 0.0.0.0").is_none() && c.blocks_of("router").next().is_none() {
        return vec![Finding::new("route", Severity::Medium, "Ingen standardväg (ip route 0.0.0.0 0.0.0.0) – internet nås inte")];
    }
    vec![]
}

fn duplicate_ips(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    let addrs = c.addresses();
    for (n, (i, a)) in addrs.iter().enumerate() {
        for (j, b) in &addrs[n + 1..] {
            if a == b {
                out.push(Finding::new("dup-ip", Severity::Critical, format!("{a} finns på både {} och {}", i.name, j.name)).at(j.line));
            } else if let (Some(x), Some(y)) = (i.subnet(), j.subnet())
                && x.overlaps(&y) {
                    out.push(Finding::new("dup-ip", Severity::High, format!("{} ({x}) och {} ({y}) överlappar", i.name, j.name)).at(j.line));
                }
        }
    }
    out
}

/// Kortar listor: ["Fa0/1", ..., "Fa0/9"] -> "Fa0/1, Fa0/2, Fa0/3 … (+6)".
fn compact_list(items: &[String]) -> String {
    if items.len() <= 5 {
        items.join(", ")
    } else {
        format!("{} … (+{})", items[..4].join(", "), items.len() - 4)
    }
}

pub static ALL_RULES: &[Rule] = &[
    Rule { id: "hostname", title: "Hostname är satt", category: "Grund", severity: Severity::High, applies: Applies::All, why: "Utan hostname går det inte att se vilken enhet man är inloggad på, och SSH-nycklar kräver ett namn.", check: hostname },
    Rule { id: "ssh", title: "SSH v2 med domännamn", category: "Åtkomst", severity: Severity::High, applies: Applies::All, why: "SSH-nycklar skapas från hostname + domännamn. Version 1 har kända säkerhetshål.", check: ssh_enabled },
    Rule { id: "vty-ssh", title: "Bara SSH på vty", category: "Åtkomst", severity: Severity::Critical, applies: Applies::All, why: "Telnet skickar lösenord i klartext över nätet.", check: vty_transport },
    Rule { id: "login", title: "Inloggning med lokala konton", category: "Åtkomst", severity: Severity::Critical, applies: Applies::All, why: "'login local' kräver användarnamn + lösenord och loggar vem som loggade in.", check: line_login },
    Rule { id: "exec-timeout", title: "Inaktiva sessioner loggas ut", category: "Åtkomst", severity: Severity::Medium, applies: Applies::All, why: "En bortglömd inloggad session kan användas av någon annan.", check: exec_timeout },
    Rule { id: "users", title: "Lokala användare med secret", category: "Lösenord", severity: Severity::High, applies: Applies::All, why: "'password' sparas i klartext eller med typ 7 som knäcks på sekunder.", check: local_users },
    Rule { id: "enable", title: "Enable secret", category: "Lösenord", severity: Severity::High, applies: Applies::All, why: "Skyddar privilegierat läge (konfigurationsrättigheter).", check: enable_secret },
    Rule { id: "placeholder", title: "Inga platshållarlösenord", category: "Lösenord", severity: Severity::Medium, applies: Applies::All, why: "CHANGE_ME är ett känt lösenord som alla som läst koden vet om.", check: placeholder_secret },
    Rule { id: "pw-encryption", title: "service password-encryption", category: "Lösenord", severity: Severity::Low, applies: Applies::All, why: "Döljer lösenord om någon tittar över axeln på 'show run'.", check: password_encryption },
    Rule { id: "banner", title: "Inloggningsbanner", category: "Grund", severity: Severity::Info, applies: Applies::All, why: "En varningstext gör det juridiskt tydligt att intrång inte är tillåtet.", check: banner },
    Rule { id: "http", title: "Ingen okrypterad webbserver", category: "Åtkomst", severity: Severity::Medium, applies: Applies::All, why: "HTTP-gränssnittet skickar inloggningen i klartext.", check: http_server },
    Rule { id: "timestamps", title: "Tidsstämplar i loggen", category: "Drift", severity: Severity::Low, applies: Applies::All, why: "Utan tidsstämplar går det inte att följa vad som hände när.", check: timestamps },
    Rule { id: "domain-lookup", title: "Inga DNS-uppslag av kommandon", category: "Grund", severity: Severity::Info, applies: Applies::All, why: "Ett felstavat kommando tolkas annars som ett värdnamn och terminalen hänger.", check: domain_lookup },
    Rule { id: "ntp", title: "NTP-server", category: "Drift", severity: Severity::Medium, applies: Applies::All, why: "Rätt tid behövs för loggar, certifikat och felsökning mellan enheter.", check: ntp },
    Rule { id: "logging", title: "Extern loggserver", category: "Drift", severity: Severity::Medium, applies: Applies::All, why: "Loggar som bara finns lokalt försvinner vid omstart.", check: logging },
    Rule { id: "vlans", title: "Använda VLAN är definierade", category: "VLAN", severity: Severity::High, applies: Applies::Switch, why: "En port i ett VLAN som inte finns blir inaktiv och trafiken går ingenstans.", check: vlans_defined },
    Rule { id: "unused-vlans", title: "Inga oanvända VLAN", category: "VLAN", severity: Severity::Info, applies: Applies::Switch, why: "Gamla VLAN gör konfigen svårläst och kan tas i bruk av misstag.", check: unused_vlans },
    Rule { id: "trunk", title: "Säkra trunkar", category: "VLAN", severity: Severity::High, applies: Applies::Switch, why: "Native-VLAN 1 möjliggör VLAN-hopping; 'allowed all' släpper igenom VLAN som inte ska dit.", check: trunks },
    Rule { id: "access-vlan1", title: "Accessportar inte i VLAN 1", category: "VLAN", severity: Severity::Medium, applies: Applies::Switch, why: "VLAN 1 används för kontrolltrafik och ska inte ha vanliga datorer.", check: access_ports },
    Rule { id: "edge", title: "Portfast + BPDU guard", category: "Switching", severity: Severity::Low, applies: Applies::Switch, why: "Datorer får nät direkt, och en inkopplad switch stänger porten istället för att skapa en loop.", check: edge_protection },
    Rule { id: "stp", title: "Rapid spanning tree", category: "Switching", severity: Severity::Low, applies: Applies::Switch, why: "Rapid-PVST går över på sekunder istället för ~50 s vid förändringar.", check: stp_mode },
    Rule { id: "mgmt", title: "Hanterings-IP och gateway", category: "Switching", severity: Severity::High, applies: Applies::Switch, why: "Switchen måste ha en IP och en gateway för att kunna administreras över nätet.", check: switch_mgmt },
    Rule { id: "description", title: "Portbeskrivningar", category: "Dokumentation", severity: Severity::Info, applies: Applies::All, why: "Beskrivningar visar vad som sitter i porten och används för att rita topologin.", check: descriptions },
    Rule { id: "subif", title: "Router-on-a-stick", category: "Routing", severity: Severity::Critical, applies: Applies::Router, why: "Varje subinterface behöver rätt dot1Q-tagg och en IP, och den fysiska porten måste vara på.", check: subinterfaces },
    Rule { id: "dhcp", title: "DHCP-pooler", category: "Routing", severity: Severity::High, applies: Applies::Router, why: "Fel default-router eller saknade undantag ger klienter som inte når ut eller IP-krockar.", check: dhcp_pools },
    Rule { id: "nat", title: "NAT är komplett", category: "Routing", severity: Severity::High, applies: Applies::Router, why: "NAT kräver inside, outside, en regel och en ACL som finns.", check: nat },
    Rule { id: "route", title: "Standardväg", category: "Routing", severity: Severity::Medium, applies: Applies::Router, why: "Utan standardväg vet routern inte vart internettrafik ska.", check: default_route },
    Rule { id: "dup-ip", title: "Inga IP-krockar", category: "Routing", severity: Severity::Critical, applies: Applies::All, why: "Samma eller överlappande nät på två interface gör routingen oförutsägbar.", check: duplicate_ips },
];

pub fn find(id: &str) -> Option<&'static Rule> {
    ALL_RULES.iter().find(|r| r.id == id)
}
