//! Reglerna som granskar en konfig. En regel får en tolkad konfig och returnerar
//! en lista med fynd. Tom lista = regeln är OK.
//!
//! Lägg till en regel: skriv en funktion `fn x(c: &Config) -> Vec<Finding>` och
//! lägg in den i `ALL_RULES` längst ner.

use crate::finding::{Finding, Severity};
use crate::inventory::{join_vlans, short_port};
use crate::net::{Subnet, parse_ip};
use crate::parser::{Block, Config, IfMode, Interface, Kind, Line};
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
            vec![
                Finding::new("hostname", Severity::Medium, format!("Hostname är fortfarande standardnamnet '{h}'"))
                    .at(c.global("hostname").map_or(0, |l| l.no)),
            ]
        }
        _ => vec![],
    }
}

fn timestamps(c: &Config) -> Vec<Finding> {
    if c.global("service timestamps log datetime").is_none() {
        return vec![
            Finding::new("timestamps", Severity::Low, "Loggmeddelanden saknar tidsstämplar")
                .fix(["service timestamps log datetime msec", "service timestamps debug datetime msec"]),
        ];
    }
    vec![]
}

fn domain_lookup(c: &Config) -> Vec<Finding> {
    if c.global("no ip domain-lookup").is_none() && c.global("no ip domain lookup").is_none() {
        return vec![
            Finding::new("domain-lookup", Severity::Info, "DNS-uppslag av felstavade kommandon är på (terminalen hänger)")
                .fix(["no ip domain-lookup"]),
        ];
    }
    vec![]
}

// ---------------------------------------------------------------------------
// Åtkomst och lösenord
// ---------------------------------------------------------------------------

fn ssh_enabled(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    if c.global("ip domain-name ").is_none() && c.global("ip domain name ").is_none() {
        out.push(
            Finding::new("ssh", Severity::High, "Inget domännamn (behövs för att skapa SSH-nycklar)")
                .fix(["ip domain-name nordvik.example", "crypto key generate rsa modulus 2048"]),
        );
    }
    if c.global("ip ssh version 2").is_none() {
        out.push(
            Finding::new("ssh", Severity::High, "SSH version 2 är inte påtvingat")
                .fix(["ip ssh version 2", "crypto key generate rsa modulus 2048"]),
        );
    }
    out
}

fn vty_transport(c: &Config) -> Vec<Finding> {
    let vtys: Vec<_> = c.blocks_of("line").filter(|b| b.name().starts_with("vty")).collect();
    if vtys.is_empty() {
        return vec![Finding::new("vty-ssh", Severity::High, "Inga vty-linjer är konfigurerade (standard kan tillåta telnet)").fix([
            "line vty 0 15",
            " transport input ssh",
            " login local",
        ])];
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
                    out.push(
                        Finding::new("vty-ssh", Severity::Medium, format!("{}: SSH är inte tillåtet ('{}')", b.header.text, l.text))
                            .at(l.no),
                    );
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
        } else if b.name().starts_with("con") && !b.body.iter().any(|l| l.text.starts_with("login")) {
            out.push(
                Finding::new("login", Severity::Medium, format!("{}: ingen inloggning på konsolen ('login' saknas)", b.header.text))
                    .at(b.header.no)
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
        out.push(
            Finding::new("users", Severity::High, "Inga lokala användare finns (login local fungerar inte)")
                .fix(["username drift privilege 15 secret <lösenord>"]),
        );
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
        out.push(
            Finding::new("enable", Severity::High, "'enable password' är svagt krypterat, använd 'enable secret'")
                .at(l.no)
                .fix(["no enable password", "enable secret <lösenord>"]),
        );
    }
    if c.global("enable secret").is_none() {
        out.push(
            Finding::new("enable", Severity::Medium, "Inget 'enable secret' – privilegierat läge är oskyddat från konsolen")
                .fix(["enable secret <lösenord>"]),
        );
    }
    out
}

fn placeholder_secret(c: &Config) -> Vec<Finding> {
    let hits: Vec<_> = c.lines.iter().filter(|l| l.text.contains("CHANGE_ME")).collect();
    match hits.first() {
        Some(first) => vec![
            Finding::new(
                "placeholder",
                Severity::Medium,
                format!("{} rad(er) har kvar platshållarlösenordet CHANGE_ME – sätt riktiga lösenord i nordvik.toml", hits.len()),
            )
            .at(first.no),
        ],
        None => vec![],
    }
}

fn password_encryption(c: &Config) -> Vec<Finding> {
    if c.global("service password-encryption").is_none() {
        return vec![
            Finding::new("pw-encryption", Severity::Low, "Lösenord i konfigen visas i klartext").fix(["service password-encryption"]),
        ];
    }
    vec![]
}

fn banner(c: &Config) -> Vec<Finding> {
    if c.global("banner motd").is_none() && c.global("banner login").is_none() {
        return vec![
            Finding::new("banner", Severity::Info, "Ingen varningsbanner vid inloggning").fix(["banner motd ^Endast behorig personal^"]),
        ];
    }
    vec![]
}

fn http_server(c: &Config) -> Vec<Finding> {
    match c.lines.iter().find(|l| l.text == "ip http server") {
        Some(l) => {
            vec![Finding::new("http", Severity::Medium, "Okrypterad webbserver (ip http server) är på").at(l.no).fix(["no ip http server"])]
        }
        None => vec![],
    }
}

// ---------------------------------------------------------------------------
// Drift: loggning och tid
// ---------------------------------------------------------------------------

fn ntp(c: &Config) -> Vec<Finding> {
    if c.global("ntp server").is_none() {
        return vec![
            Finding::new("ntp", Severity::Medium, "Ingen NTP-server – loggarnas tider går inte att lita på").fix(["ntp server <adress>"]),
        ];
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
                    Finding::new(
                        "vlans",
                        Severity::High,
                        format!("{}: VLAN {v} används ({how}) men är inte definierat", short_port(&i.name)),
                    )
                    .at(i.line)
                    .fix([format!("vlan {v}"), format!(" name VLAN{v}")]),
                );
            }
        }
        if let (IfMode::Trunk, Some(allowed)) = (i.mode, &i.allowed) {
            let missing: Vec<u16> = allowed.iter().copied().filter(|v| !defined.contains(v)).collect();
            if !missing.is_empty() {
                out.push(
                    Finding::new(
                        "vlans",
                        Severity::Medium,
                        format!("{}: trunken tillåter VLAN {} som inte finns på switchen", short_port(&i.name), join_vlans(&missing)),
                    )
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
    vec![
        Finding::new("unused-vlans", Severity::Info, format!("VLAN {} är definierade men används inte", join_vlans(&unused)))
            .fix(unused.iter().map(|v| format!("no vlan {v}"))),
    ]
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
    let missing: Vec<_> =
        c.interfaces.iter().filter(|i| i.mode == IfMode::Access && !i.shutdown && (!i.portfast || !i.bpduguard)).collect();
    if missing.is_empty() {
        return vec![];
    }
    let names: Vec<String> = missing.iter().map(|i| short_port(&i.name)).collect();
    let mut fix = Vec::new();
    for i in &missing {
        fix.extend([format!("interface {}", i.name), " spanning-tree portfast".into(), " spanning-tree bpduguard enable".into()]);
    }
    vec![
        Finding::new(
            "edge",
            Severity::Low,
            format!("{} accessport(ar) saknar portfast/bpduguard: {}", missing.len(), compact_list(&names)),
        )
        .at(missing[0].line)
        .fix(fix),
    ]
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
        None => out.push(Finding::new(
            "mgmt",
            Severity::Medium,
            "Switchen har ingen hanterings-IP (interface VlanX) och går inte att nå med SSH",
        )),
        Some(i) => {
            if i.shutdown {
                out.push(
                    Finding::new("mgmt", Severity::High, format!("{} är avstängt", i.name))
                        .at(i.line)
                        .fix([format!("interface {}", i.name), " no shutdown".into()]),
                );
            }
            match c.global("ip default-gateway") {
                None => {
                    out.push(Finding::new("mgmt", Severity::Medium, "Ingen 'ip default-gateway' – switchen nås bara från sitt eget nät"))
                }
                Some(l) => {
                    let gw = l.text.split_whitespace().nth(2).and_then(parse_ip);
                    if let (Some(gw), Some(net)) = (gw, i.subnet())
                        && !net.contains(gw)
                    {
                        out.push(
                            Finding::new("mgmt", Severity::High, format!("Default-gateway {gw} ligger inte i hanteringsnätet {net}"))
                                .at(l.no),
                        );
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
                Finding::new("subif", Severity::Low, format!("{}: taggar VLAN {v} – förvirrande när numret inte matchar", i.name))
                    .at(i.line),
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
            None => out.push(
                Finding::new("dhcp", Severity::High, format!("Poolen {name} saknar default-router – klienterna når inget annat nät"))
                    .at(b.header.no),
            ),
            Some(gw) => {
                if !net.contains(gw) {
                    out.push(
                        Finding::new("dhcp", Severity::High, format!("Poolen {name}: default-router {gw} ligger inte i {net}"))
                            .at(b.header.no),
                    );
                } else if !c.addresses().iter().any(|(_, a)| *a == gw) {
                    out.push(
                        Finding::new("dhcp", Severity::High, format!("Poolen {name}: ingen egen interface har adressen {gw}"))
                            .at(b.header.no),
                    );
                }
                if !excluded.iter().any(|(s, e)| (*s..=*e).contains(&u32::from(gw))) {
                    out.push(
                        Finding::new(
                            "dhcp",
                            Severity::Medium,
                            format!("Poolen {name}: gatewayen {gw} är inte undantagen och kan delas ut"),
                        )
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
            out.push(
                Finding::new("dhcp", Severity::Medium, format!("Poolen {name} ({net}) matchar inget interface på routern")).at(b.header.no),
            );
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
                let has_acl =
                    c.global(&format!("access-list {acl} ")).is_some() || c.global(&format!("ip access-list standard {acl}")).is_some();
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
                && x.overlaps(&y)
            {
                out.push(Finding::new("dup-ip", Severity::High, format!("{} ({x}) och {} ({y}) överlappar", i.name, j.name)).at(j.line));
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Hjälpfunktioner för de nyare reglerna (läser direkt ur blockens rader)
// ---------------------------------------------------------------------------

/// Varje interface tillsammans med sitt block (de skapas i samma ordning i parsern).
fn iface_blocks(c: &Config) -> Vec<(&Interface, &Block)> {
    c.interfaces.iter().zip(c.blocks_of("interface")).collect()
}

fn line_blocks<'a>(c: &'a Config, prefix: &'a str) -> impl Iterator<Item = &'a Block> + 'a {
    c.blocks_of("line").filter(move |b| b.name().starts_with(prefix))
}

/// Första ordet efter `start` som tal, t.ex. `ip ssh time-out 60` -> 60.
fn number_after(l: &Line, start: &str) -> Option<u32> {
    l.text.strip_prefix(start)?.split_whitespace().next()?.parse().ok()
}

/// Fysiska portar (inte VLAN-, loopback- eller subinterface).
fn is_physical(name: &str) -> bool {
    !name.contains(['.', ' ']) && ["FastEthernet", "GigabitEthernet", "TenGigabitEthernet", "Ethernet"].iter().any(|p| name.starts_with(p))
}

/// Interface-raderna som ett fix ska skriva för en lista portar.
fn port_fix(ports: &[&Interface], lines: &[&str]) -> Vec<String> {
    let mut fix = Vec::new();
    for i in ports {
        fix.push(format!("interface {}", i.name));
        fix.extend(lines.iter().map(|l| l.to_string()));
    }
    fix
}

fn lookup_off(c: &Config) -> bool {
    c.global("no ip domain-lookup").is_some() || c.global("no ip domain lookup").is_some()
}

/// Bannertexterna i konfigen (även flerradiga): (radnummer, text).
fn banner_texts(c: &Config) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    let mut it = c.lines.iter();
    while let Some(l) = it.next() {
        if !l.text.starts_with("banner ") {
            continue;
        }
        let rest = l.text.splitn(3, ' ').nth(2).unwrap_or("");
        let Some(delim) = rest.chars().next() else { continue };
        let mut text = rest[delim.len_utf8()..].to_string();
        let mut done = text.contains(delim);
        while !done {
            let Some(n) = it.next() else { break };
            text.push('\n');
            text.push_str(&n.text);
            done = n.text.contains(delim);
        }
        out.push((l.no, text));
    }
    out
}

/// ACL:er som definieras: (namn eller nummer, radnummer, definitionsrad som tas bort).
fn acl_defs(c: &Config) -> Vec<(String, usize, String)> {
    let mut out: Vec<(String, usize, String)> = Vec::new();
    for l in &c.lines {
        let w: Vec<&str> = l.text.split_whitespace().collect();
        let found = match w.as_slice() {
            ["access-list", id, ..] => Some((id.to_string(), format!("no access-list {id}"))),
            ["ip", "access-list", kind @ ("standard" | "extended"), name, ..] => {
                Some((name.to_string(), format!("no ip access-list {kind} {name}")))
            }
            _ => None,
        };
        if let Some((name, remove)) = found
            && !out.iter().any(|(n, _, _)| *n == name)
        {
            out.push((name, l.no, remove));
        }
    }
    out
}

/// Namn/nummer på ACL:er som refereras av interface, vty, NAT, route-map, SNMP m.m.
fn acl_refs(c: &Config) -> BTreeSet<String> {
    // Rader i en ACL:s egen definition räknas inte som användning.
    let mut skip: BTreeSet<usize> = BTreeSet::new();
    for b in c.blocks_of("ip") {
        if b.header.text.starts_with("ip access-list ") {
            skip.insert(b.header.no);
            skip.extend(b.body.iter().map(|l| l.no));
        }
    }
    let mut out = BTreeSet::new();
    for l in c.lines.iter().filter(|l| !skip.contains(&l.no) && !l.text.starts_with("access-list ")) {
        let w: Vec<String> = l.text.split_whitespace().map(str::to_ascii_lowercase).collect();
        let orig: Vec<&str> = l.text.split_whitespace().collect();
        for n in 1..w.len() {
            let prev = w[n - 1].as_str();
            let hit = matches!(
                prev,
                "access-group"
                    | "access-class"
                    | "list"
                    | "address"
                    | "distribute-list"
                    | "ro"
                    | "rw"
                    | "peer"
                    | "serve"
                    | "serve-only"
                    | "query-only"
            ) || (prev == "name" && w.contains(&"access-group".to_string()));
            if hit {
                out.insert(orig[n].to_string());
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Åtkomst: SSH, inloggningsskydd och farliga tjänster
// ---------------------------------------------------------------------------

fn ssh_timeout(c: &Config) -> Vec<Finding> {
    match c.global("ip ssh time-out") {
        None => vec![
            Finding::new("ssh-timeout", Severity::Low, "SSH-inloggningen har ingen 'ip ssh time-out' (standard är 120 s)")
                .fix(["ip ssh time-out 60"]),
        ],
        Some(l) => match number_after(l, "ip ssh time-out") {
            Some(n) if n > 60 => {
                vec![
                    Finding::new("ssh-timeout", Severity::Low, format!("SSH time-out är {n} s (max 60 s rekommenderas)"))
                        .at(l.no)
                        .fix(["ip ssh time-out 60"]),
                ]
            }
            _ => vec![],
        },
    }
}

fn ssh_retries(c: &Config) -> Vec<Finding> {
    match c.global("ip ssh authentication-retries") {
        None => vec![
            Finding::new(
                "ssh-retries",
                Severity::Low,
                "Antalet SSH-inloggningsförsök är inte begränsat ('ip ssh authentication-retries' saknas)",
            )
            .fix(["ip ssh authentication-retries 3"]),
        ],
        Some(l) => match number_after(l, "ip ssh authentication-retries") {
            Some(n) if n > 3 => vec![
                Finding::new("ssh-retries", Severity::Low, format!("{n} SSH-inloggningsförsök tillåts (max 3 rekommenderas)"))
                    .at(l.no)
                    .fix(["ip ssh authentication-retries 3"]),
            ],
            _ => vec![],
        },
    }
}

fn aaa_model(c: &Config) -> Vec<Finding> {
    if c.global("aaa new-model").is_none() {
        return vec![Finding::new("aaa", Severity::Info, "AAA är inte aktiverat ('aaa new-model' saknas)").fix([
            "aaa new-model",
            "aaa authentication login default local",
            "aaa authorization exec default local",
        ])];
    }
    vec![]
}

fn login_block(c: &Config) -> Vec<Finding> {
    if c.global("login block-for").is_none() {
        return vec![
            Finding::new("login-block", Severity::Low, "Inget skydd mot lösenordsgissning ('login block-for' saknas)")
                .fix(["login block-for 120 attempts 3 within 60"]),
        ];
    }
    vec![]
}

fn cdp_wan(c: &Config) -> Vec<Finding> {
    iface_blocks(c)
        .into_iter()
        .filter(|(_, b)| b.has("ip nat outside") && !b.has("no cdp enable"))
        .map(|(i, _)| {
            Finding::new(
                "cdp-wan",
                Severity::Low,
                format!("{}: CDP är på mot det yttre nätet (avslöjar modell och version för operatören)", short_port(&i.name)),
            )
            .at(i.line)
            .fix([format!("interface {}", i.name), " no cdp enable".into()])
        })
        .collect()
}

fn source_route(c: &Config) -> Vec<Finding> {
    if c.global("no ip source-route").is_none() {
        return vec![
            Finding::new("source-route", Severity::Low, "IP source routing är på ('no ip source-route' saknas)")
                .fix(["no ip source-route"]),
        ];
    }
    vec![]
}

fn small_servers(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for (cmd, off) in [
        ("service tcp-small-servers", "no service tcp-small-servers"),
        ("service udp-small-servers", "no service udp-small-servers"),
        ("ip finger", "no ip finger"),
        ("service finger", "no service finger"),
    ] {
        if let Some(l) = c.lines.iter().find(|l| l.text == cmd) {
            out.push(Finding::new("small-servers", Severity::Medium, format!("Onödig tjänst är på ('{cmd}')")).at(l.no).fix([off]));
        }
    }
    out
}

fn vty_acl(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for b in line_blocks(c, "vty").filter(|b| b.find("access-class").is_none()) {
        out.push(
            Finding::new("vty-acl", Severity::Low, format!("{}: ingen 'access-class' – alla adresser får försöka logga in", b.header.text))
                .at(b.header.no)
                .fix(["access-list 10 permit <hanteringsnät> <wildcard>".to_string(), b.header.text.clone(), " access-class 10 in".into()]),
        );
    }
    out
}

fn aux_port(c: &Config) -> Vec<Finding> {
    line_blocks(c, "aux")
        .filter(|b| !b.has("no exec"))
        .map(|b| {
            Finding::new("aux", Severity::Low, format!("{} är på (modemingång som sällan behövs)", b.header.text))
                .at(b.header.no)
                .fix([b.header.text.clone(), " no exec".into()])
        })
        .collect()
}

fn snmp(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for l in c.globals("snmp-server community ") {
        let w: Vec<&str> = l.text.split_whitespace().collect();
        let Some(name) = w.get(2) else { continue };
        let rw = w.iter().skip(3).any(|x| x.eq_ignore_ascii_case("rw"));
        let default = ["public", "private"].iter().any(|d| name.eq_ignore_ascii_case(d));
        if default || rw {
            let why = match (default, rw) {
                (true, true) => "standardnamn och skrivrättighet (RW)",
                (true, false) => "standardnamnet",
                _ => "skrivrättighet (RW)",
            };
            out.push(
                Finding::new("snmp", Severity::High, format!("SNMP-communityn '{name}' har {why}"))
                    .at(l.no)
                    .fix([format!("no snmp-server community {name}"), "snmp-server community <hemligt-namn> RO 10".into()]),
            );
        }
    }
    out
}

fn https_auth(c: &Config) -> Vec<Finding> {
    match c.global("ip http secure-server") {
        Some(l) if c.global("ip http authentication").is_none() => vec![
            Finding::new("https-auth", Severity::Low, "Webbservern (HTTPS) saknar 'ip http authentication local'")
                .at(l.no)
                .fix(["ip http authentication local"]),
        ],
        _ => vec![],
    }
}

// ---------------------------------------------------------------------------
// Switchportar och spanning tree
// ---------------------------------------------------------------------------

fn unused_ports(c: &Config) -> Vec<Finding> {
    let free: Vec<&Interface> = iface_blocks(c)
        .into_iter()
        .filter(|(i, b)| {
            is_physical(&i.name)
                && !b.has("shutdown")
                && !b.body.iter().any(|l| {
                    ["switchport", "no switchport", "ip address", "description", "channel-group", "encapsulation"]
                        .iter()
                        .any(|p| l.text.starts_with(p))
                })
        })
        .map(|(i, _)| i)
        .collect();
    if free.is_empty() {
        return vec![];
    }
    let names: Vec<String> = free.iter().map(|i| short_port(&i.name)).collect();
    vec![
        Finding::new(
            "unused-ports",
            Severity::Low,
            format!("{} ledig(a) port(ar) är inte avstängda: {}", free.len(), compact_list(&names)),
        )
        .at(free[0].line)
        .fix(port_fix(&free, &[" shutdown"])),
    ]
}

fn blackhole_vlan(c: &Config) -> Vec<Finding> {
    let ports: Vec<&Interface> =
        c.interfaces.iter().filter(|i| i.mode == IfMode::Access && i.shutdown && matches!(i.access_vlan, None | Some(1))).collect();
    if ports.is_empty() {
        return vec![];
    }
    let names: Vec<String> = ports.iter().map(|i| short_port(&i.name)).collect();
    let mut fix = vec!["vlan 998".to_string(), " name BLACKHOLE".into()];
    fix.extend(port_fix(&ports, &[" switchport access vlan 998"]));
    vec![
        Finding::new("blackhole-vlan", Severity::Info, format!("Avstängda accessportar ligger i VLAN 1: {}", compact_list(&names)))
            .at(ports[0].line)
            .fix(fix),
    ]
}

fn dtp(c: &Config) -> Vec<Finding> {
    let ports: Vec<&Interface> = iface_blocks(c)
        .into_iter()
        .filter(|(i, b)| matches!(i.mode, IfMode::Access | IfMode::Trunk) && !i.shutdown && !b.has("switchport nonegotiate"))
        .map(|(i, _)| i)
        .collect();
    if ports.is_empty() {
        return vec![];
    }
    let names: Vec<String> = ports.iter().map(|i| short_port(&i.name)).collect();
    vec![
        Finding::new(
            "dtp",
            Severity::Low,
            format!("{} port(ar) förhandlar trunk automatiskt (DTP): {}", ports.len(), compact_list(&names)),
        )
        .at(ports[0].line)
        .fix(port_fix(&ports, &[" switchport nonegotiate"])),
    ]
}

fn port_security(c: &Config) -> Vec<Finding> {
    let ports: Vec<&Interface> = iface_blocks(c)
        .into_iter()
        .filter(|(i, b)| i.mode == IfMode::Access && !i.shutdown && !b.body.iter().any(|l| l.text.starts_with("switchport port-security")))
        .map(|(i, _)| i)
        .collect();
    if ports.is_empty() {
        return vec![];
    }
    let names: Vec<String> = ports.iter().map(|i| short_port(&i.name)).collect();
    vec![
        Finding::new(
            "port-security",
            Severity::Info,
            format!("{} accessport(ar) saknar port-security: {}", ports.len(), compact_list(&names)),
        )
        .at(ports[0].line)
        .fix(port_fix(
            &ports,
            &[" switchport port-security", " switchport port-security maximum 2", " switchport port-security violation restrict"],
        )),
    ]
}

fn vtp(c: &Config) -> Vec<Finding> {
    let mode = c.global("vtp mode ").and_then(|l| l.text.split_whitespace().nth(2));
    if matches!(mode, Some("server" | "client")) && c.global("vtp domain ").is_some() && c.global("vtp password ").is_none() {
        let l = c.global("vtp mode ").unwrap();
        return vec![
            Finding::new(
                "vtp",
                Severity::Low,
                format!("VTP ({}) har domän men inget lösenord – en främmande switch kan skriva över VLAN-databasen", mode.unwrap()),
            )
            .at(l.no)
            .fix(["vtp password <lösenord>", "! eller helt utan VTP: vtp mode transparent"]),
        ];
    }
    vec![]
}

fn stp_root(c: &Config) -> Vec<Finding> {
    let trunks = c.interfaces.iter().filter(|i| i.mode == IfMode::Trunk).count();
    let set = c.globals("spanning-tree vlan ").any(|l| l.text.contains(" priority ") || l.text.contains(" root "));
    if trunks > 1 && !set {
        let vlans: Vec<u16> = if c.vlans.is_empty() { vec![1] } else { c.vlans.keys().copied().collect() };
        return vec![
            Finding::new(
                "stp-root",
                Severity::Info,
                format!("Switchen har {trunks} trunkar men ingen vald root bridge (spanning-tree priority saknas)"),
            )
            .fix([format!("spanning-tree vlan {} priority 4096", join_vlans(&vlans))]),
        ];
    }
    vec![]
}

fn dhcp_snooping(c: &Config) -> Vec<Finding> {
    let access: Vec<&Interface> = c.interfaces.iter().filter(|i| i.mode == IfMode::Access).collect();
    if access.is_empty() || c.global("ip dhcp snooping").is_some() {
        return vec![];
    }
    let vlans: Vec<u16> = access.iter().filter_map(|i| i.access_vlan).collect();
    let mut fix = vec!["ip dhcp snooping".to_string(), format!("ip dhcp snooping vlan {}", join_vlans(&vlans))];
    for i in c.interfaces.iter().filter(|i| i.mode == IfMode::Trunk) {
        fix.extend([format!("interface {}", i.name), " ip dhcp snooping trust".into()]);
    }
    vec![Finding::new("dhcp-snooping", Severity::Info, "DHCP snooping är inte på – en falsk DHCP-server kan dela ut fel gateway").fix(fix)]
}

fn mgmt_vlan1(c: &Config) -> Vec<Finding> {
    iface_blocks(c)
        .into_iter()
        .filter(|(i, b)| i.svi_vlan() == Some(1) && b.find("ip address ").is_some())
        .map(|(i, _)| {
            Finding::new("mgmt-vlan1", Severity::Medium, "Hanteringen ligger i VLAN 1 (interface Vlan1 har en IP-adress)").at(i.line).fix([
                "interface Vlan1",
                " no ip address",
                " shutdown",
            ])
        })
        .collect()
}

fn vlan1_shutdown(c: &Config) -> Vec<Finding> {
    let other_svi = c.interfaces.iter().any(|i| matches!(i.svi_vlan(), Some(v) if v != 1));
    c.interfaces
        .iter()
        .filter(|i| other_svi && i.svi_vlan() == Some(1) && !i.shutdown)
        .map(|i| {
            Finding::new("vlan1-shutdown", Severity::Low, "interface Vlan1 är inte avstängt fast ett annat VLAN används för hantering")
                .at(i.line)
                .fix(["interface Vlan1", " shutdown"])
        })
        .collect()
}

fn duplex(c: &Config) -> Vec<Finding> {
    iface_blocks(c)
        .into_iter()
        .filter_map(|(i, b)| b.find("duplex half").map(|l| (i, l)))
        .map(|(i, l)| {
            Finding::new("duplex", Severity::Medium, format!("{}: 'duplex half' ger kollisioner och låg hastighet", short_port(&i.name)))
                .at(l.no)
                .fix([format!("interface {}", i.name), " duplex auto".into()])
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Grund, drift och lösenordstyper
// ---------------------------------------------------------------------------

fn hostname_format(c: &Config) -> Vec<Finding> {
    let Some(h) = c.hostname.as_deref() else { return vec![] };
    let bad_char = h.chars().any(|ch| !(ch.is_ascii_alphanumeric() || ch == '-'));
    let edge = h.starts_with('-') || h.ends_with('-');
    let long = h.chars().count() > 63;
    if !(bad_char || edge || long) {
        return vec![];
    }
    let why = if long {
        "är längre än 63 tecken"
    } else if bad_char {
        "innehåller otillåtna tecken (bara A–Z, 0–9 och bindestreck går bra)"
    } else {
        "får inte börja eller sluta med bindestreck"
    };
    let fixed: String = h.chars().map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' { ch } else { '-' }).take(63).collect();
    let fixed = fixed.trim_matches('-');
    let fixed = if fixed.is_empty() { "switch1" } else { fixed };
    vec![
        Finding::new("hostname-format", Severity::Medium, format!("Hostname '{h}' {why}"))
            .at(c.global("hostname").map_or(0, |l| l.no))
            .fix([format!("hostname {fixed}")]),
    ]
}

fn name_server(c: &Config) -> Vec<Finding> {
    if !lookup_off(c) && c.global("ip name-server").is_none() {
        return vec![
            Finding::new("name-server", Severity::Info, "DNS-uppslag är på men ingen 'ip name-server' finns")
                .fix(["ip name-server <adress>"]),
        ];
    }
    vec![]
}

fn clock_zone(c: &Config) -> Vec<Finding> {
    if c.global("clock timezone").is_none() {
        return vec![
            Finding::new("clock", Severity::Info, "Ingen tidszon satt ('clock timezone' saknas) – loggarna visar UTC")
                .fix(["clock timezone CET 1 0"]),
        ];
    }
    vec![]
}

fn logging_trap(c: &Config) -> Vec<Finding> {
    c.globals("logging trap ")
        .filter(|l| matches!(l.text.split_whitespace().nth(2), Some("debugging" | "7")))
        .map(|l| {
            Finding::new("logging-trap", Severity::Low, "'logging trap debugging' skickar all felsökningstrafik till loggservern")
                .at(l.no)
                .fix(["logging trap informational"])
        })
        .collect()
}

fn banner_welcome(c: &Config) -> Vec<Finding> {
    banner_texts(c)
        .into_iter()
        .filter(|(_, t)| {
            let t = t.to_lowercase();
            t.contains("välkommen") || t.contains("welcome")
        })
        .map(|(no, _)| {
            Finding::new(
                "banner-welcome",
                Severity::Low,
                "Bannern hälsar användaren välkommen – juridiskt en inbjudan, skriv en varning istället",
            )
            .at(no)
            .fix(["banner motd ^Endast behorig personal. All aktivitet loggas.^"])
        })
        .collect()
}

fn secret_type(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for l in c.globals("enable secret ").chain(c.globals("username ")) {
        let w: Vec<&str> = l.text.split_whitespace().collect();
        let Some(p) = w.iter().position(|x| *x == "secret") else { continue };
        if w.get(p + 1) != Some(&"5") {
            continue;
        }
        let fix = if w[0] == "enable" {
            "enable algorithm-type scrypt secret <lösenord>".to_string()
        } else {
            format!("username {} algorithm-type scrypt secret <lösenord>", w.get(1).unwrap_or(&"<namn>"))
        };
        let who = if w[0] == "enable" { "enable secret".to_string() } else { format!("Användaren {}", w.get(1).unwrap_or(&"?")) };
        out.push(
            Finding::new("secret-type", Severity::Info, format!("{who} använder typ 5 (MD5), använd scrypt (typ 9)")).at(l.no).fix([fix]),
        );
    }
    out
}

// ---------------------------------------------------------------------------
// Routing, ACL:er och adressering
// ---------------------------------------------------------------------------

fn static_routes(c: &Config) -> Vec<Finding> {
    let nets: Vec<Subnet> = c.interfaces.iter().filter(|i| !i.shutdown).filter_map(|i| i.subnet()).collect();
    let mut out = Vec::new();
    for l in c.globals("ip route ") {
        let w: Vec<&str> = l.text.split_whitespace().collect();
        let (Some(_), Some(_), Some(nh)) =
            (w.get(2).and_then(|x| parse_ip(x)), w.get(3).and_then(|x| parse_ip(x)), w.get(4).and_then(|x| parse_ip(x)))
        else {
            continue;
        };
        if !nets.iter().any(|n| n.contains(nh)) {
            out.push(
                Finding::new("static-route", Severity::Medium, format!("Nästa hopp {nh} i '{}' ligger inte i något anslutet nät", l.text))
                    .at(l.no),
            );
        }
    }
    out
}

fn acl_unused(c: &Config) -> Vec<Finding> {
    let refs = acl_refs(c);
    acl_defs(c)
        .into_iter()
        .filter(|(name, _, _)| !refs.contains(name))
        .map(|(name, no, remove)| {
            Finding::new("acl-unused", Severity::Info, format!("ACL {name} används inte av något interface, NAT eller vty"))
                .at(no)
                .fix([remove])
        })
        .collect()
}

fn acl_missing(c: &Config) -> Vec<Finding> {
    let defined: BTreeSet<String> = acl_defs(c).into_iter().map(|(n, _, _)| n).collect();
    let mut out = Vec::new();
    for l in &c.lines {
        let t = l.text.trim_start();
        let (kind, rest) = if let Some(r) = t.strip_prefix("ip access-group ") {
            ("ip access-group", r)
        } else if let Some(r) = t.strip_prefix("access-class ") {
            ("access-class", r)
        } else {
            continue;
        };
        let Some(name) = rest.split_whitespace().next() else { continue };
        if defined.contains(name) {
            continue;
        }
        let fix = if name.chars().all(|ch| ch.is_ascii_digit()) {
            vec![format!("access-list {name} permit <nät> <wildcard>")]
        } else {
            vec![format!("ip access-list standard {name}"), " permit <nät> <wildcard>".into()]
        };
        out.push(
            Finding::new("acl-missing", Severity::High, format!("'{kind} {name}' pekar på en ACL som inte finns – ingen filtrering sker"))
                .at(l.no)
                .fix(fix),
        );
    }
    out
}

fn dhcp_overlap(c: &Config) -> Vec<Finding> {
    let pools: Vec<(&str, Subnet, usize)> = c
        .blocks_of("ip dhcp pool")
        .filter_map(|b| {
            Some((b.header.text.trim_start_matches("ip dhcp pool").trim(), b.rest("network").and_then(Subnet::parse)?, b.header.no))
        })
        .collect();
    let mut out = Vec::new();
    for (n, (a, x, _)) in pools.iter().enumerate() {
        for (b, y, line) in &pools[n + 1..] {
            if x.overlaps(y) {
                out.push(
                    Finding::new(
                        "dhcp-overlap",
                        Severity::High,
                        format!("DHCP-poolerna {a} ({x}) och {b} ({y}) överlappar – samma adress kan delas ut två gånger"),
                    )
                    .at(*line),
                );
            }
        }
    }
    out
}

fn dhcp_excluded(c: &Config) -> Vec<Finding> {
    let nets: Vec<Subnet> = c.blocks_of("ip dhcp pool").filter_map(|b| b.rest("network").and_then(Subnet::parse)).collect();
    let mut out = Vec::new();
    for l in c.globals("ip dhcp excluded-address") {
        let w: Vec<&str> = l.text.split_whitespace().collect();
        let Some(a) = w.get(3).and_then(|x| parse_ip(x)) else { continue };
        let b = w.get(4).and_then(|x| parse_ip(x)).unwrap_or(a);
        if !nets.iter().any(|n| n.contains(a) || n.contains(b)) {
            let range = if a == b { a.to_string() } else { format!("{a} – {b}") };
            out.push(
                Finding::new("dhcp-excluded", Severity::Low, format!("Undantagna adresser {range} ligger inte i någon DHCP-pool"))
                    .at(l.no)
                    .fix([format!("no {}", l.text)]),
            );
        }
    }
    out
}

fn ip_netaddr(c: &Config) -> Vec<Finding> {
    let mut out = Vec::new();
    for i in &c.interfaces {
        let (Some((addr, mask)), Some(net)) = (i.ip, i.subnet()) else { continue };
        if net.prefix >= 31 {
            continue;
        }
        let what = if addr == net.network {
            "nätadressen"
        } else if addr == net.broadcast() {
            "broadcastadressen"
        } else {
            continue;
        };
        out.push(
            Finding::new(
                "ip-netaddr",
                Severity::High,
                format!("{}: adressen {addr} är {what} i {net} och kan inte användas på ett interface", short_port(&i.name)),
            )
            .at(i.line)
            .fix([format!("interface {}", i.name), format!(" ip address {} {mask}", net.first_host())]),
        );
    }
    out
}

/// Kortar listor: ["Fa0/1", ..., "Fa0/9"] -> "Fa0/1, Fa0/2, Fa0/3 … (+6)".
fn compact_list(items: &[String]) -> String {
    if items.len() <= 5 { items.join(", ") } else { format!("{} … (+{})", items[..4].join(", "), items.len() - 4) }
}

pub static ALL_RULES: &[Rule] = &[
    Rule {
        id: "hostname",
        title: "Hostname är satt",
        category: "Grund",
        severity: Severity::High,
        applies: Applies::All,
        why: "Utan hostname går det inte att se vilken enhet man är inloggad på, och SSH-nycklar kräver ett namn.",
        check: hostname,
    },
    Rule {
        id: "ssh",
        title: "SSH v2 med domännamn",
        category: "Åtkomst",
        severity: Severity::High,
        applies: Applies::All,
        why: "SSH-nycklar skapas från hostname + domännamn. Version 1 har kända säkerhetshål.",
        check: ssh_enabled,
    },
    Rule {
        id: "vty-ssh",
        title: "Bara SSH på vty",
        category: "Åtkomst",
        severity: Severity::Critical,
        applies: Applies::All,
        why: "Telnet skickar lösenord i klartext över nätet.",
        check: vty_transport,
    },
    Rule {
        id: "login",
        title: "Inloggning med lokala konton",
        category: "Åtkomst",
        severity: Severity::Critical,
        applies: Applies::All,
        why: "'login local' kräver användarnamn + lösenord och loggar vem som loggade in.",
        check: line_login,
    },
    Rule {
        id: "exec-timeout",
        title: "Inaktiva sessioner loggas ut",
        category: "Åtkomst",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "En bortglömd inloggad session kan användas av någon annan.",
        check: exec_timeout,
    },
    Rule {
        id: "users",
        title: "Lokala användare med secret",
        category: "Lösenord",
        severity: Severity::High,
        applies: Applies::All,
        why: "'password' sparas i klartext eller med typ 7 som knäcks på sekunder.",
        check: local_users,
    },
    Rule {
        id: "enable",
        title: "Enable secret",
        category: "Lösenord",
        severity: Severity::High,
        applies: Applies::All,
        why: "Skyddar privilegierat läge (konfigurationsrättigheter).",
        check: enable_secret,
    },
    Rule {
        id: "placeholder",
        title: "Inga platshållarlösenord",
        category: "Lösenord",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "CHANGE_ME är ett känt lösenord som alla som läst koden vet om.",
        check: placeholder_secret,
    },
    Rule {
        id: "pw-encryption",
        title: "service password-encryption",
        category: "Lösenord",
        severity: Severity::Low,
        applies: Applies::All,
        why: "Döljer lösenord om någon tittar över axeln på 'show run'.",
        check: password_encryption,
    },
    Rule {
        id: "banner",
        title: "Inloggningsbanner",
        category: "Grund",
        severity: Severity::Info,
        applies: Applies::All,
        why: "En varningstext gör det juridiskt tydligt att intrång inte är tillåtet.",
        check: banner,
    },
    Rule {
        id: "http",
        title: "Ingen okrypterad webbserver",
        category: "Åtkomst",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "HTTP-gränssnittet skickar inloggningen i klartext.",
        check: http_server,
    },
    Rule {
        id: "timestamps",
        title: "Tidsstämplar i loggen",
        category: "Drift",
        severity: Severity::Low,
        applies: Applies::All,
        why: "Utan tidsstämplar går det inte att följa vad som hände när.",
        check: timestamps,
    },
    Rule {
        id: "domain-lookup",
        title: "Inga DNS-uppslag av kommandon",
        category: "Grund",
        severity: Severity::Info,
        applies: Applies::All,
        why: "Ett felstavat kommando tolkas annars som ett värdnamn och terminalen hänger.",
        check: domain_lookup,
    },
    Rule {
        id: "ntp",
        title: "NTP-server",
        category: "Drift",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "Rätt tid behövs för loggar, certifikat och felsökning mellan enheter.",
        check: ntp,
    },
    Rule {
        id: "logging",
        title: "Extern loggserver",
        category: "Drift",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "Loggar som bara finns lokalt försvinner vid omstart.",
        check: logging,
    },
    Rule {
        id: "vlans",
        title: "Använda VLAN är definierade",
        category: "VLAN",
        severity: Severity::High,
        applies: Applies::Switch,
        why: "En port i ett VLAN som inte finns blir inaktiv och trafiken går ingenstans.",
        check: vlans_defined,
    },
    Rule {
        id: "unused-vlans",
        title: "Inga oanvända VLAN",
        category: "VLAN",
        severity: Severity::Info,
        applies: Applies::Switch,
        why: "Gamla VLAN gör konfigen svårläst och kan tas i bruk av misstag.",
        check: unused_vlans,
    },
    Rule {
        id: "trunk",
        title: "Säkra trunkar",
        category: "VLAN",
        severity: Severity::High,
        applies: Applies::Switch,
        why: "Native-VLAN 1 möjliggör VLAN-hopping; 'allowed all' släpper igenom VLAN som inte ska dit.",
        check: trunks,
    },
    Rule {
        id: "access-vlan1",
        title: "Accessportar inte i VLAN 1",
        category: "VLAN",
        severity: Severity::Medium,
        applies: Applies::Switch,
        why: "VLAN 1 används för kontrolltrafik och ska inte ha vanliga datorer.",
        check: access_ports,
    },
    Rule {
        id: "edge",
        title: "Portfast + BPDU guard",
        category: "Switching",
        severity: Severity::Low,
        applies: Applies::Switch,
        why: "Datorer får nät direkt, och en inkopplad switch stänger porten istället för att skapa en loop.",
        check: edge_protection,
    },
    Rule {
        id: "stp",
        title: "Rapid spanning tree",
        category: "Switching",
        severity: Severity::Low,
        applies: Applies::Switch,
        why: "Rapid-PVST går över på sekunder istället för ~50 s vid förändringar.",
        check: stp_mode,
    },
    Rule {
        id: "mgmt",
        title: "Hanterings-IP och gateway",
        category: "Switching",
        severity: Severity::High,
        applies: Applies::Switch,
        why: "Switchen måste ha en IP och en gateway för att kunna administreras över nätet.",
        check: switch_mgmt,
    },
    Rule {
        id: "description",
        title: "Portbeskrivningar",
        category: "Dokumentation",
        severity: Severity::Info,
        applies: Applies::All,
        why: "Beskrivningar visar vad som sitter i porten och används för att rita topologin.",
        check: descriptions,
    },
    Rule {
        id: "subif",
        title: "Router-on-a-stick",
        category: "Routing",
        severity: Severity::Critical,
        applies: Applies::Router,
        why: "Varje subinterface behöver rätt dot1Q-tagg och en IP, och den fysiska porten måste vara på.",
        check: subinterfaces,
    },
    Rule {
        id: "dhcp",
        title: "DHCP-pooler",
        category: "Routing",
        severity: Severity::High,
        applies: Applies::Router,
        why: "Fel default-router eller saknade undantag ger klienter som inte når ut eller IP-krockar.",
        check: dhcp_pools,
    },
    Rule {
        id: "nat",
        title: "NAT är komplett",
        category: "Routing",
        severity: Severity::High,
        applies: Applies::Router,
        why: "NAT kräver inside, outside, en regel och en ACL som finns.",
        check: nat,
    },
    Rule {
        id: "route",
        title: "Standardväg",
        category: "Routing",
        severity: Severity::Medium,
        applies: Applies::Router,
        why: "Utan standardväg vet routern inte vart internettrafik ska.",
        check: default_route,
    },
    Rule {
        id: "dup-ip",
        title: "Inga IP-krockar",
        category: "Routing",
        severity: Severity::Critical,
        applies: Applies::All,
        why: "Samma eller överlappande nät på två interface gör routingen oförutsägbar.",
        check: duplicate_ips,
    },
    Rule {
        id: "ssh-timeout",
        title: "SSH time-out högst 60 s",
        category: "Åtkomst",
        severity: Severity::Low,
        applies: Applies::All,
        why: "Ett långt time-out låter en angripare hålla halvöppna inloggningar uppe.",
        check: ssh_timeout,
    },
    Rule {
        id: "ssh-retries",
        title: "Högst 3 SSH-inloggningsförsök",
        category: "Åtkomst",
        severity: Severity::Low,
        applies: Applies::All,
        why: "Färre försök per anslutning gör lösenordsgissning långsammare.",
        check: ssh_retries,
    },
    Rule {
        id: "aaa",
        title: "AAA aktiverat",
        category: "Åtkomst",
        severity: Severity::Info,
        applies: Applies::All,
        why: "aaa new-model ger central styrning av inloggning, behörighet och loggning.",
        check: aaa_model,
    },
    Rule {
        id: "login-block",
        title: "Skydd mot lösenordsgissning",
        category: "Åtkomst",
        severity: Severity::Low,
        applies: Applies::All,
        why: "login block-for stänger inloggningen en stund efter flera misslyckade försök.",
        check: login_block,
    },
    Rule {
        id: "cdp-wan",
        title: "Inget CDP mot yttre nätet",
        category: "Åtkomst",
        severity: Severity::Low,
        applies: Applies::Router,
        why: "CDP berättar modell, IOS-version och adresser för vem som lyssnar på länken mot operatören.",
        check: cdp_wan,
    },
    Rule {
        id: "source-route",
        title: "Ingen IP source routing",
        category: "Åtkomst",
        severity: Severity::Low,
        applies: Applies::Router,
        why: "Source routing låter avsändaren välja väg och kan användas för att runda brandväggar.",
        check: source_route,
    },
    Rule {
        id: "small-servers",
        title: "Inga onödiga småtjänster",
        category: "Åtkomst",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "TCP/UDP small servers och finger är gamla tjänster som läcker information och kan missbrukas.",
        check: small_servers,
    },
    Rule {
        id: "vty-acl",
        title: "Begränsa vty med access-class",
        category: "Åtkomst",
        severity: Severity::Low,
        applies: Applies::All,
        why: "En ACL på vty gör att bara hanteringsnätet kan försöka logga in.",
        check: vty_acl,
    },
    Rule {
        id: "aux",
        title: "AUX-porten avstängd",
        category: "Åtkomst",
        severity: Severity::Low,
        applies: Applies::All,
        why: "Ett oanvänt modem- eller konsolspår är en onödig väg in till enheten.",
        check: aux_port,
    },
    Rule {
        id: "unused-ports",
        title: "Lediga portar avstängda",
        category: "Switching",
        severity: Severity::Low,
        applies: Applies::Switch,
        why: "En ofylld port som är på kan användas av vem som helst som kopplar in en kabel.",
        check: unused_ports,
    },
    Rule {
        id: "blackhole-vlan",
        title: "Avstängda portar i eget VLAN",
        category: "VLAN",
        severity: Severity::Info,
        applies: Applies::Switch,
        why: "Ligger avstängda portar i ett oanvänt VLAN hamnar ingen där av misstag i VLAN 1.",
        check: blackhole_vlan,
    },
    Rule {
        id: "dtp",
        title: "Ingen DTP-förhandling",
        category: "Switching",
        severity: Severity::Low,
        applies: Applies::Switch,
        why: "switchport nonegotiate hindrar att en inkopplad enhet förhandlar upp en trunk.",
        check: dtp,
    },
    Rule {
        id: "port-security",
        title: "Port security på accessportar",
        category: "Switching",
        severity: Severity::Info,
        applies: Applies::Switch,
        why: "Begränsar hur många MAC-adresser en port lär sig och stoppar okända enheter.",
        check: port_security,
    },
    Rule {
        id: "vtp",
        title: "VTP med lösenord",
        category: "VLAN",
        severity: Severity::Low,
        applies: Applies::Switch,
        why: "Utan VTP-lösenord kan en främmande switch med högre revision skriva över hela VLAN-databasen.",
        check: vtp,
    },
    Rule {
        id: "stp-root",
        title: "Vald root bridge",
        category: "Switching",
        severity: Severity::Info,
        applies: Applies::Switch,
        why: "Utan prioritet väljs root bridge efter MAC-adress, ofta den äldsta switchen.",
        check: stp_root,
    },
    Rule {
        id: "dhcp-snooping",
        title: "DHCP snooping",
        category: "Switching",
        severity: Severity::Info,
        applies: Applies::Switch,
        why: "Släpper bara igenom DHCP-svar från betrodda portar och stoppar falska DHCP-servrar.",
        check: dhcp_snooping,
    },
    Rule {
        id: "mgmt-vlan1",
        title: "Ingen hantering i VLAN 1",
        category: "VLAN",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "VLAN 1 finns på alla portar och är det första en angripare provar.",
        check: mgmt_vlan1,
    },
    Rule {
        id: "vlan1-shutdown",
        title: "Vlan1 avstängt",
        category: "VLAN",
        severity: Severity::Low,
        applies: Applies::All,
        why: "När hanteringen ligger i ett annat VLAN ska SVI:n för VLAN 1 vara avstängd.",
        check: vlan1_shutdown,
    },
    Rule {
        id: "duplex",
        title: "Ingen halv duplex",
        category: "Switching",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "Half duplex ger kollisioner och dålig prestanda, oftast efter en felaktig manuell inställning.",
        check: duplex,
    },
    Rule {
        id: "hostname-format",
        title: "Giltigt hostname",
        category: "Grund",
        severity: Severity::Medium,
        applies: Applies::All,
        why: "Hostname används i DNS, SSH-nycklar och prompten och ska bara ha bokstäver, siffror och bindestreck (max 63 tecken).",
        check: hostname_format,
    },
    Rule {
        id: "name-server",
        title: "DNS-server vid DNS-uppslag",
        category: "Grund",
        severity: Severity::Info,
        applies: Applies::All,
        why: "Är DNS-uppslag på utan namnserver väntar terminalen på en time-out efter varje felskrivet kommando.",
        check: name_server,
    },
    Rule {
        id: "clock",
        title: "Tidszon satt",
        category: "Drift",
        severity: Severity::Info,
        applies: Applies::All,
        why: "Utan tidszon visar loggarna UTC och går inte att jämföra med lokal tid.",
        check: clock_zone,
    },
    Rule {
        id: "logging-trap",
        title: "Lagom loggnivå till loggservern",
        category: "Drift",
        severity: Severity::Low,
        applies: Applies::All,
        why: "Nivån debugging skickar enorma mängder meddelanden och kan belasta enheten och loggservern.",
        check: logging_trap,
    },
    Rule {
        id: "banner-welcome",
        title: "Ingen välkomsthälsning i bannern",
        category: "Grund",
        severity: Severity::Low,
        applies: Applies::All,
        why: "En banner som hälsar välkommen kan tolkas som tillstånd att logga in; den ska varna.",
        check: banner_welcome,
    },
    Rule {
        id: "secret-type",
        title: "Stark hash för lösenord",
        category: "Lösenord",
        severity: Severity::Info,
        applies: Applies::All,
        why: "Typ 5 (MD5) är snabb att knäcka; typ 9 (scrypt) är avsevärt starkare.",
        check: secret_type,
    },
    Rule {
        id: "snmp",
        title: "Säker SNMP",
        category: "Åtkomst",
        severity: Severity::High,
        applies: Applies::All,
        why: "public/private är kända och RW låter vem som helst ändra konfigen över nätet.",
        check: snmp,
    },
    Rule {
        id: "https-auth",
        title: "HTTPS med inloggning",
        category: "Åtkomst",
        severity: Severity::Low,
        applies: Applies::All,
        why: "Webbservern ska använda lokala konton och inte stå öppen eller med ett delat lösenord.",
        check: https_auth,
    },
    Rule {
        id: "static-route",
        title: "Statiska vägar når ett anslutet nät",
        category: "Routing",
        severity: Severity::Medium,
        applies: Applies::Router,
        why: "Är nästa hopp inte i ett anslutet nät kan routern inte skicka paketet och vägen blir aldrig aktiv.",
        check: static_routes,
    },
    Rule {
        id: "acl-unused",
        title: "Inga oanvända ACL:er",
        category: "Åtkomst",
        severity: Severity::Info,
        applies: Applies::All,
        why: "En ACL som inget använder är oftast kvarglömd och förvirrar den som läser konfigen.",
        check: acl_unused,
    },
    Rule {
        id: "acl-missing",
        title: "Använda ACL:er finns",
        category: "Åtkomst",
        severity: Severity::High,
        applies: Applies::All,
        why: "Pekar ip access-group eller access-class på en ACL som saknas släpps all trafik igenom.",
        check: acl_missing,
    },
    Rule {
        id: "dhcp-overlap",
        title: "DHCP-pooler överlappar inte",
        category: "Routing",
        severity: Severity::High,
        applies: Applies::Router,
        why: "Överlappande pooler kan dela ut samma adress i två nät och ge IP-krockar.",
        check: dhcp_overlap,
    },
    Rule {
        id: "dhcp-excluded",
        title: "Undantag ligger i en pool",
        category: "Routing",
        severity: Severity::Low,
        applies: Applies::All,
        why: "Ett undantag utanför alla pooler gör ingenting och är oftast ett skrivfel eller en rest.",
        check: dhcp_excluded,
    },
    Rule {
        id: "ip-netaddr",
        title: "Interface-IP är en värdadress",
        category: "Routing",
        severity: Severity::High,
        applies: Applies::All,
        why: "Nät- och broadcastadressen går inte att använda som adress på ett interface.",
        check: ip_netaddr,
    },
];

/// Reglerna grupperade per kategori, i den ordning kategorierna först förekommer.
pub fn by_category() -> Vec<(&'static str, Vec<&'static Rule>)> {
    let mut groups: Vec<(&'static str, Vec<&'static Rule>)> = Vec::new();
    for r in ALL_RULES {
        match groups.iter_mut().find(|(c, _)| *c == r.category) {
            Some((_, list)) => list.push(r),
            None => groups.push((r.category, vec![r])),
        }
    }
    groups
}

pub fn find(id: &str) -> Option<&'static Rule> {
    ALL_RULES.iter().find(|r| r.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(id: &str, text: &str) -> Vec<Finding> {
        let c = Config::parse("t", "t.cfg", text);
        let rule = find(id).unwrap_or_else(|| panic!("regeln {id} finns inte"));
        (rule.check)(&c)
    }

    /// Dålig konfig ger fynd från regeln, bra konfig ger inga.
    fn bad_good(id: &str, bad: &str, good: &str) -> Vec<Finding> {
        let hits = run(id, bad);
        assert!(!hits.is_empty(), "{id} borde slå till på:\n{bad}");
        assert!(hits.iter().all(|f| f.rule == id));
        let none = run(id, good);
        assert!(none.is_empty(), "{id} borde tiga på:\n{good}\nmen gav {none:?}");
        hits
    }

    #[test]
    fn every_new_rule_is_registered_with_a_why() {
        for id in [
            "ssh-timeout",
            "ssh-retries",
            "aaa",
            "login-block",
            "cdp-wan",
            "source-route",
            "small-servers",
            "vty-acl",
            "aux",
            "unused-ports",
            "blackhole-vlan",
            "dtp",
            "port-security",
            "vtp",
            "stp-root",
            "dhcp-snooping",
            "mgmt-vlan1",
            "vlan1-shutdown",
            "duplex",
            "hostname-format",
            "name-server",
            "clock",
            "logging-trap",
            "banner-welcome",
            "secret-type",
            "snmp",
            "https-auth",
            "static-route",
            "acl-unused",
            "acl-missing",
            "dhcp-overlap",
            "dhcp-excluded",
            "ip-netaddr",
        ] {
            let r = find(id).unwrap_or_else(|| panic!("{id} saknas"));
            assert!(!r.why.is_empty() && !r.title.is_empty());
        }
        let mut ids: Vec<&str> = ALL_RULES.iter().map(|r| r.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), ALL_RULES.len(), "dubbla regel-id");
    }

    #[test]
    fn ssh_timeout_and_retries() {
        bad_good("ssh-timeout", "hostname A\n", "ip ssh time-out 60\n");
        assert_eq!(run("ssh-timeout", "ip ssh time-out 120\n")[0].line, Some(1));
        bad_good("ssh-retries", "hostname A\n", "ip ssh authentication-retries 3\n");
        bad_good("ssh-retries", "ip ssh authentication-retries 5\n", "ip ssh authentication-retries 2\n");
    }

    #[test]
    fn ssh_fix_reminds_about_keys() {
        let f = run("ssh", "hostname A\n");
        assert!(f.iter().all(|f| f.fix.iter().any(|l| l == "crypto key generate rsa modulus 2048")));
    }

    #[test]
    fn aaa_login_block_source_route() {
        bad_good("aaa", "hostname A\n", "aaa new-model\n");
        bad_good("login-block", "hostname A\n", "login block-for 120 attempts 3 within 60\n");
        bad_good("source-route", "hostname A\n", "no ip source-route\n");
    }

    #[test]
    fn cdp_wan_needs_no_cdp_on_nat_outside() {
        let bad = "interface Gi0/1\n ip address 203.0.113.10 255.255.255.0\n ip nat outside\n!\n";
        let good = "interface Gi0/1\n ip address 203.0.113.10 255.255.255.0\n ip nat outside\n no cdp enable\n!\ninterface Gi0/0\n ip nat inside\n";
        let f = bad_good("cdp-wan", bad, good);
        assert_eq!(f[0].line, Some(1));
        assert!(f[0].fix.contains(&" no cdp enable".to_string()));
    }

    #[test]
    fn small_servers_on() {
        bad_good("small-servers", "service tcp-small-servers\nip finger\n", "no service tcp-small-servers\nno ip finger\n");
        assert_eq!(run("small-servers", "service tcp-small-servers\nip finger\n").len(), 2);
    }

    #[test]
    fn vty_acl_requires_access_class() {
        let bad = "line vty 0 4\n transport input ssh\nline vty 5 15\n access-class 10 in\n";
        let good = "line vty 0 4\n access-class 10 in\nline vty 5 15\n access-class 10 in\n";
        let f = bad_good("vty-acl", bad, good);
        assert_eq!(f.len(), 1);
        assert!(f[0].fix.contains(&" access-class 10 in".to_string()));
    }

    #[test]
    fn console_needs_login() {
        let f = run("login", "line con 0\n logging synchronous\n");
        assert!(f.iter().any(|f| f.severity == Severity::Medium && f.message.contains("line con 0")));
        assert!(run("login", "line con 0\n login local\n").is_empty());
        assert!(run("login", "line con 0\n password x\n login\n").is_empty());
    }

    #[test]
    fn aux_needs_no_exec() {
        bad_good("aux", "line aux 0\n", "line aux 0\n no exec\n");
        assert!(run("aux", "line con 0\n login local\n").is_empty());
    }

    #[test]
    fn unused_ports_are_found() {
        let bad = "interface FastEthernet0/1\n!\ninterface FastEthernet0/2\n description Port mot PC\n switchport mode access\n";
        let good = "interface FastEthernet0/1\n shutdown\n!\ninterface FastEthernet0/2\n switchport mode access\n!\ninterface Vlan99\n ip address 10.0.0.1 255.255.255.0\n";
        let f = bad_good("unused-ports", bad, good);
        assert!(f[0].message.contains("Fa0/1") && !f[0].message.contains("Fa0/2"));
        assert!(f[0].fix.contains(&" shutdown".to_string()));
    }

    #[test]
    fn blackhole_vlan_for_shutdown_access_ports() {
        let bad = "interface Fa0/1\n switchport mode access\n shutdown\n";
        let good = "interface Fa0/1\n switchport mode access\n switchport access vlan 998\n shutdown\n!\ninterface Fa0/2\n switchport mode access\n";
        bad_good("blackhole-vlan", bad, good);
    }

    #[test]
    fn dtp_nonegotiate() {
        let bad = "interface Gi0/1\n switchport mode trunk\n!\ninterface Fa0/1\n switchport mode access\n switchport nonegotiate\n";
        let good = "interface Gi0/1\n switchport mode trunk\n switchport nonegotiate\n!\ninterface Fa0/1\n switchport mode access\n switchport nonegotiate\n";
        let f = bad_good("dtp", bad, good);
        assert!(f[0].message.contains("Gi0/1") && !f[0].message.contains("Fa0/1"));
    }

    #[test]
    fn port_security_on_access_ports() {
        let bad = "interface Fa0/1\n switchport mode access\n";
        let good =
            "interface Fa0/1\n switchport mode access\n switchport port-security\n!\ninterface Fa0/2\n switchport mode access\n shutdown\n";
        bad_good("port-security", bad, good);
    }

    #[test]
    fn vtp_needs_password() {
        bad_good("vtp", "vtp mode server\nvtp domain NORDVIK\n", "vtp mode server\nvtp domain NORDVIK\nvtp password hemligt\n");
        assert!(run("vtp", "vtp mode transparent\n").is_empty());
        assert!(run("vtp", "vtp mode client\n").is_empty());
    }

    #[test]
    fn stp_root_with_several_trunks() {
        let trunks = "vlan 10\n!\ninterface Gi0/1\n switchport mode trunk\n!\ninterface Gi0/2\n switchport mode trunk\n";
        let f = bad_good("stp-root", trunks, &format!("spanning-tree vlan 10,20,30,99,999 priority 4096\n{trunks}"));
        assert_eq!(f[0].fix, ["spanning-tree vlan 10 priority 4096"]);
        assert!(run("stp-root", "interface Gi0/1\n switchport mode trunk\n").is_empty());
    }

    #[test]
    fn dhcp_snooping_when_access_ports_exist() {
        let bad = "interface Fa0/1\n switchport mode access\n switchport access vlan 10\n!\ninterface Gi0/1\n switchport mode trunk\n";
        let f = bad_good("dhcp-snooping", bad, &format!("ip dhcp snooping\n{bad}"));
        assert!(f[0].fix.contains(&" ip dhcp snooping trust".to_string()));
        assert!(run("dhcp-snooping", "interface Gi0/1\n switchport mode trunk\n").is_empty());
    }

    #[test]
    fn vlan1_management() {
        let bad = "interface Vlan1\n ip address 192.168.1.5 255.255.255.0\n";
        let good = "interface Vlan1\n no ip address\n shutdown\n";
        bad_good("mgmt-vlan1", bad, good);
        let bad = "interface Vlan1\n no ip address\n!\ninterface Vlan99\n ip address 10.0.0.2 255.255.255.0\n";
        let good = "interface Vlan1\n no ip address\n shutdown\n!\ninterface Vlan99\n ip address 10.0.0.2 255.255.255.0\n";
        bad_good("vlan1-shutdown", bad, good);
        // Inget annat SVI: Vlan1 är kanske det enda sättet att nå enheten.
        assert!(run("vlan1-shutdown", "interface Vlan1\n no ip address\n").is_empty());
    }

    #[test]
    fn half_duplex() {
        let f = bad_good("duplex", "interface Fa0/1\n duplex half\n", "interface Fa0/1\n duplex full\n");
        assert_eq!(f[0].line, Some(2));
    }

    #[test]
    fn hostname_format_rules() {
        bad_good("hostname-format", "hostname SW_1\n", "hostname SW-Nordvik-1\n");
        assert!(!run("hostname-format", "hostname A!B\n")[0].fix.is_empty());
        assert!(!run("hostname-format", &format!("hostname {}\n", "a".repeat(64))).is_empty());
        assert!(run("hostname-format", &format!("hostname {}\n", "a".repeat(63))).is_empty());
        assert!(run("hostname-format", "no ip domain-lookup\n").is_empty());
    }

    #[test]
    fn name_server_with_lookup_on() {
        bad_good("name-server", "hostname A\n", "no ip domain-lookup\n");
        assert!(run("name-server", "hostname A\nip name-server 8.8.8.8\n").is_empty());
    }

    #[test]
    fn clock_and_logging_trap() {
        bad_good("clock", "hostname A\n", "clock timezone CET 1 0\n");
        bad_good("logging-trap", "logging trap debugging\n", "logging trap informational\n");
        assert!(run("logging-trap", "hostname A\n").is_empty());
    }

    #[test]
    fn banner_welcome_single_and_multiline() {
        bad_good(
            "banner-welcome",
            "banner motd ^Välkommen till Nordvik^\n",
            "banner motd ^Endast behorig personal. All aktivitet loggas.^\n",
        );
        let f = run("banner-welcome", "banner motd ^C\nWelcome!\nHer ser vi\n^C\n");
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].line, Some(1));
        assert!(run("banner-welcome", "banner motd ^C\nEndast behorig\n^C\nhostname Welcome\n").is_empty());
    }

    #[test]
    fn secret_type_5() {
        let f = bad_good(
            "secret-type",
            "enable secret 5 $1$abcd$xyz\nusername drift secret 5 $1$abcd$xyz\n",
            "enable secret 9 $9$abc\nusername drift secret CHANGE_ME\n",
        );
        assert_eq!(f.len(), 2);
        assert!(f[1].fix[0].contains("username drift algorithm-type scrypt secret"));
    }

    #[test]
    fn snmp_defaults_and_rw() {
        let bad = "snmp-server community public RO\nsnmp-server community hemlig RW 10\n";
        let f = bad_good("snmp", bad, "snmp-server community hemlig RO 10\n");
        assert_eq!(f.len(), 2);
        assert!(f.iter().all(|f| f.severity == Severity::High));
        assert!(!run("snmp", "snmp-server community Private RO\n").is_empty());
    }

    #[test]
    fn https_needs_local_auth() {
        bad_good("https-auth", "ip http secure-server\n", "ip http secure-server\nip http authentication local\n");
        assert!(run("https-auth", "no ip http server\n").is_empty());
    }

    #[test]
    fn static_route_next_hop_must_be_connected() {
        let ifc = "interface Gi0/1\n ip address 203.0.113.10 255.255.255.0\n!\n";
        bad_good(
            "static-route",
            &format!("{ifc}ip route 0.0.0.0 0.0.0.0 198.51.100.1\n"),
            &format!("{ifc}ip route 0.0.0.0 0.0.0.0 203.0.113.1\n"),
        );
        assert!(run("static-route", &format!("{ifc}ip route 10.0.0.0 255.0.0.0 Gi0/1\n")).is_empty());
    }

    #[test]
    fn acl_unused_and_missing() {
        let used = "access-list 1 permit 10.0.0.0 0.0.0.255\nip nat inside source list 1 interface Gi0/1 overload\nip access-list standard MGMT\n permit 10.0.0.0 0.0.0.255\nline vty 0 4\n access-class MGMT in\ninterface Gi0/2\n ip access-group 101 in\naccess-list 101 deny ip any any\n";
        assert!(run("acl-unused", used).is_empty());
        let f = run("acl-unused", "access-list 5 permit any\nip access-list standard OLD\n permit any\n");
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].line, Some(1));
        assert_eq!(f[0].fix, ["no access-list 5"]);

        let bad = "interface Gi0/1\n ip access-group 101 in\nline vty 0 4\n access-class 10 in\n";
        let f = run("acl-missing", bad);
        assert_eq!(f.len(), 2);
        assert!(f.iter().all(|f| f.severity == Severity::High));
        assert_eq!(f[0].line, Some(2));
        assert!(run("acl-missing", &format!("access-list 101 permit ip any any\naccess-list 10 permit any\n{bad}")).is_empty());
    }

    #[test]
    fn dhcp_overlap_and_excluded() {
        let pool = |n: &str, net: &str| format!("ip dhcp pool {n}\n network {net}\n default-router 10.0.0.1\n");
        let bad = format!("{}{}", pool("A", "10.0.0.0 255.255.255.0"), pool("B", "10.0.0.128 255.255.255.128"));
        let good = format!("{}{}", pool("A", "10.0.0.0 255.255.255.0"), pool("B", "10.0.1.0 255.255.255.0"));
        let f = bad_good("dhcp-overlap", &bad, &good);
        assert_eq!(f[0].line, Some(4));

        let pools = pool("A", "10.0.0.0 255.255.255.0");
        bad_good(
            "dhcp-excluded",
            &format!("ip dhcp excluded-address 192.168.9.1 192.168.9.5\n{pools}"),
            &format!("ip dhcp excluded-address 10.0.0.1 10.0.0.19\nip dhcp excluded-address 10.0.0.50\n{pools}"),
        );
        assert!(!run("dhcp-excluded", "ip dhcp excluded-address 10.0.0.1\n").is_empty());
    }

    #[test]
    fn interface_ip_must_be_host_address() {
        let f = bad_good(
            "ip-netaddr",
            "interface Gi0/1\n ip address 192.168.1.0 255.255.255.0\n!\ninterface Gi0/2\n ip address 192.168.1.255 255.255.255.0\n",
            "interface Gi0/1\n ip address 192.168.1.1 255.255.255.0\n!\ninterface Gi0/2\n ip address 10.0.0.0 255.255.255.254\n!\ninterface Gi0/3\n ip address 10.0.0.5 255.255.255.255\n",
        );
        assert_eq!(f.len(), 2);
        assert!(f[0].fix.contains(&" ip address 192.168.1.1 255.255.255.0".to_string()));
    }

    #[test]
    fn switch_only_rules_skip_routers() {
        for id in ["unused-ports", "blackhole-vlan", "dtp", "port-security", "vtp", "stp-root", "dhcp-snooping"] {
            assert_eq!(find(id).unwrap().applies, Applies::Switch, "{id}");
        }
        for id in ["cdp-wan", "source-route", "static-route", "dhcp-overlap"] {
            assert_eq!(find(id).unwrap().applies, Applies::Router, "{id}");
        }
    }
}
