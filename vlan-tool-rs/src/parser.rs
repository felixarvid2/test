//! Tolkar en sparad Cisco IOS-konfig (running-config) till block och interface.
//!
//! Ett block är en rubrikrad utan indrag följd av rader MED indrag, t.ex.
//! `interface FastEthernet0/1` + ` switchport mode access`.

use crate::inventory::{normalize_port, split_vlans};
use crate::net::{Subnet, parse_ip};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::net::Ipv4Addr;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct Line {
    pub no: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Block {
    pub header: Line,
    pub body: Vec<Line>,
}

impl Block {
    /// Första raden i blocket som börjar med `start`.
    pub fn find(&self, start: &str) -> Option<&Line> {
        self.body.iter().find(|l| l.text.starts_with(start))
    }

    pub fn has(&self, exact: &str) -> bool {
        self.body.iter().any(|l| l.text == exact)
    }

    /// Sista ordet på första raden som börjar med `start`.
    pub fn value(&self, start: &str) -> Option<&str> {
        self.find(start).and_then(|l| l.text[start.len()..].split_whitespace().last())
    }

    /// Resten av raden efter `start`.
    pub fn rest(&self, start: &str) -> Option<&str> {
        self.find(start).map(|l| l.text[start.len()..].trim())
    }

    /// Ordet efter nyckelordet i rubriken: "interface Gi0/1" -> "Gi0/1".
    pub fn name(&self) -> &str {
        self.header.text.split_once(' ').map(|(_, n)| n.trim()).unwrap_or("")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Kind {
    Switch,
    Router,
    Unknown,
}

impl Kind {
    pub fn label(self) -> &'static str {
        match self {
            Kind::Switch => "Switch",
            Kind::Router => "Router",
            Kind::Unknown => "Okänd",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum IfMode {
    Access,
    Trunk,
    Routed,
    Other,
}

/// Det viktigaste om ett interface, utplockat ur dess block.
#[derive(Debug, Clone, Serialize)]
pub struct Interface {
    pub name: String,
    pub line: usize,
    pub description: String,
    pub mode: IfMode,
    pub access_vlan: Option<u16>,
    pub native_vlan: Option<u16>,
    /// None = alla VLAN tillåts (standard på en trunk utan lista).
    pub allowed: Option<Vec<u16>>,
    pub ip: Option<(Ipv4Addr, Ipv4Addr)>,
    pub dot1q: Option<u16>,
    pub dot1q_native: bool,
    pub shutdown: bool,
    pub portfast: bool,
    pub bpduguard: bool,
    pub voice_vlan: Option<u16>,
    /// Extra adresser (`ip address … secondary`).
    pub secondary: Vec<(Ipv4Addr, Ipv4Addr)>,
    /// `ip helper-address`.
    pub helpers: Vec<Ipv4Addr>,
    /// `channel-group N mode …`.
    pub channel_group: Option<u16>,
    pub speed: Option<String>,
    pub duplex: Option<String>,
    /// Någon `switchport port-security …`-rad finns.
    pub port_security: bool,
    /// `ip access-group X in`.
    pub acl_in: Option<String>,
    /// `ip access-group X out`.
    pub acl_out: Option<String>,
}

impl Interface {
    pub fn subnet(&self) -> Option<Subnet> {
        self.ip.and_then(|(a, m)| Subnet::from_addr_mask(a, m))
    }

    /// "Vlan99" -> Some(99)
    pub fn svi_vlan(&self) -> Option<u16> {
        self.name.strip_prefix("Vlan").and_then(|n| n.parse().ok())
    }

    /// Enheten i andra änden enligt beskrivningen ("Port mot SW-Nordvik-2" -> "SW-Nordvik-2").
    pub fn peer(&self) -> Option<&str> {
        peer_of(&self.description)
    }
}

/// Enheten i andra änden enligt en beskrivning ("Port mot SW-Nordvik-2" -> "SW-Nordvik-2").
pub fn peer_of(description: &str) -> Option<&str> {
    let idx = description.find(" mot ").map(|i| i + 5).or_else(|| description.to_ascii_lowercase().find(" to ").map(|i| i + 4))?;
    description[idx..].split_whitespace().next()
}

#[derive(Debug, Clone, Serialize)]
pub struct Config {
    pub name: String,
    pub path: String,
    pub lines: Vec<Line>,
    pub blocks: Vec<Block>,
    pub hostname: Option<String>,
    pub kind: Kind,
    pub interfaces: Vec<Interface>,
    /// VLAN-nummer -> namn (tomt om inget namn).
    pub vlans: BTreeMap<u16, String>,
    /// `ip routing` är påslaget.
    pub ip_routing: bool,
    /// `version 15.1` -> "15.1".
    pub version: Option<String>,
}

impl Config {
    pub fn load(path: &Path) -> std::io::Result<Self> {
        let text = std::fs::read_to_string(path)?;
        let name = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        Ok(Config::parse(&name, &path.display().to_string(), &text))
    }

    pub fn parse(name: &str, path: &str, text: &str) -> Self {
        // Tabbar blir mellanslag; CRLF försvinner i trim_end. Radnumren följer originalfilen
        // även när `show running-config`-brus tas bort.
        let text = text.replace('\t', " ");
        let lines: Vec<Line> = text
            .lines()
            .enumerate()
            .map(|(i, l)| Line { no: i + 1, text: l.trim_end().to_string() })
            .filter(|l| !is_show_noise(&l.text))
            .collect();

        let mut blocks: Vec<Block> = Vec::new();
        let mut open = false;
        // Avslutande tecken om vi är mitt i en flerradig banner.
        let mut banner_end: Option<String> = None;
        for line in &lines {
            if let Some(delim) = &banner_end {
                blocks.last_mut().unwrap().body.push(Line { no: line.no, text: line.text.trim().to_string() });
                if line.text.contains(delim.as_str()) {
                    banner_end = None;
                    open = false;
                }
                continue;
            }
            let indented = line.text.starts_with(' ');
            if indented && open {
                blocks.last_mut().unwrap().body.push(Line { no: line.no, text: line.text.trim().to_string() });
            } else if !indented && !line.text.is_empty() && !line.text.starts_with('!') {
                blocks.push(Block { header: line.clone(), body: Vec::new() });
                open = true;
                if line.text.starts_with("banner ") {
                    banner_end = banner_delimiter(&line.text);
                }
            } else {
                open = false;
            }
        }

        let hostname = blocks.iter().find_map(|b| b.header.text.strip_prefix("hostname ").map(|h| h.trim().to_string()));

        let mut vlans = BTreeMap::new();
        for b in &blocks {
            if let Some(list) = b.header.text.strip_prefix("vlan ") {
                for v in split_vlans(list) {
                    vlans.insert(v, b.rest("name").unwrap_or("").to_string());
                }
            }
        }

        let interfaces: Vec<Interface> =
            blocks.iter().filter(|b| b.header.text.starts_with("interface ")).flat_map(parse_interfaces).collect();

        let has = |p: &str| lines.iter().any(|l| l.text.trim_start().starts_with(p));
        let kind = if interfaces.iter().any(|i| i.mode == IfMode::Access || i.mode == IfMode::Trunk) || has("ip default-gateway") {
            Kind::Switch
        } else if has("ip dhcp pool") || has("ip route ") || has("router ") || interfaces.iter().any(|i| i.dot1q.is_some()) {
            Kind::Router
        } else if !vlans.is_empty() {
            Kind::Switch
        } else {
            Kind::Unknown
        };

        let ip_routing = lines.iter().any(|l| l.text.trim() == "ip routing");
        let version = lines.iter().find_map(|l| l.text.strip_prefix("version ").map(|v| v.trim().to_string()));

        Config { name: name.to_string(), path: path.to_string(), lines, blocks, hostname, kind, interfaces, vlans, ip_routing, version }
    }

    /// Alla ACL-namn och nummer som definieras (`access-list 10 …`, `ip access-list extended NAMN`).
    pub fn acl_names(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for l in self.lines.iter().filter(|l| !l.text.starts_with(' ')) {
            let w: Vec<&str> = l.text.split_whitespace().collect();
            let name = match w.as_slice() {
                ["access-list", n, ..] => *n,
                ["ip", "access-list", "standard" | "extended", n, ..] => *n,
                _ => continue,
            };
            if !out.iter().any(|o| o == name) {
                out.push(name.to_string());
            }
        }
        out
    }

    /// Enhetens namn: hostname om det finns, annars filnamnet.
    pub fn display_name(&self) -> &str {
        self.hostname.as_deref().unwrap_or(&self.name)
    }

    /// Alla block vars rubrik börjar med `keyword` + mellanslag.
    pub fn blocks_of<'a>(&'a self, keyword: &'a str) -> impl Iterator<Item = &'a Block> + 'a {
        self.blocks.iter().filter(move |b| b.header.text.starts_with(keyword) && b.header.text[keyword.len()..].starts_with(' '))
    }

    /// Första raden utan indrag som börjar med `start`.
    pub fn global(&self, start: &str) -> Option<&Line> {
        self.lines.iter().find(|l| l.text.starts_with(start))
    }

    pub fn globals<'a>(&'a self, start: &'a str) -> impl Iterator<Item = &'a Line> + 'a {
        self.lines.iter().filter(move |l| l.text.starts_with(start))
    }

    /// Alla IP-adresser som är satta på enhetens interface.
    pub fn addresses(&self) -> Vec<(&Interface, Ipv4Addr)> {
        self.interfaces.iter().filter_map(|i| i.ip.map(|(a, _)| (i, a))).collect()
    }

    #[cfg(test)]
    pub fn interface(&self, name: &str) -> Option<&Interface> {
        let name = normalize_port(name);
        self.interfaces.iter().find(|i| i.name.eq_ignore_ascii_case(&name))
    }
}

/// Utdata från `show running-config` som inte är konfig.
fn is_show_noise(line: &str) -> bool {
    let t = line.trim();
    t.starts_with("Building configuration") || t.starts_with("Current configuration") || (t.starts_with("Using ") && t.contains(" out of "))
}

/// Avslutande tecken för en banner som fortsätter på nästa rad, annars None.
/// `banner motd ^C text ^C` (en rad) och `banner motd ^text^` ger None.
fn banner_delimiter(header: &str) -> Option<String> {
    let rest = header.strip_prefix("banner ")?.trim_start();
    let body = rest.split_once(char::is_whitespace)?.1.trim_start();
    let delim = if body.starts_with("^C") { "^C" } else { &body[..body.chars().next()?.len_utf8()] };
    (!body[delim.len()..].contains(delim)).then(|| delim.to_string())
}

/// `Fa0/1 - 24, Gi0/1` -> enskilda portnamn.
fn expand_range(spec: &str) -> Vec<String> {
    let mut out = Vec::new();
    for part in spec.split(',').map(str::trim).filter(|p| !p.is_empty()) {
        let dash = part.char_indices().find(|&(i, c)| c == '-' && part[..i].trim_end().ends_with(|d: char| d.is_ascii_digit()));
        let expanded = dash.and_then(|(i, _)| {
            let (left, right) = (part[..i].trim(), part[i + 1..].trim());
            let split = left.char_indices().rev().find(|(_, c)| !c.is_ascii_digit()).map_or(0, |(p, c)| p + c.len_utf8());
            let (head, start) = left.split_at(split);
            let start: u32 = start.parse().ok()?;
            let end: u32 = right.rsplit(|c: char| !c.is_ascii_digit()).next()?.parse().ok()?;
            Some((start..=end.min(start + 4095)).map(|n| normalize_port(&format!("{head}{n}"))).collect::<Vec<_>>())
        });
        match expanded {
            Some(names) => out.extend(names),
            None => out.push(normalize_port(part)),
        }
    }
    out
}

/// Ett interface, eller flera för `interface range`.
fn parse_interfaces(b: &Block) -> Vec<Interface> {
    match b.name().strip_prefix("range ") {
        Some(spec) => {
            let base = parse_interface(b, String::new());
            expand_range(spec).into_iter().map(|name| Interface { name, ..base.clone() }).collect()
        }
        None => vec![parse_interface(b, normalize_port(b.name()))],
    }
}

/// Räknar ihop alla `switchport trunk allowed vlan`-rader (utan nyckelord, add, remove, except, all, none).
fn parse_allowed(b: &Block) -> Option<Vec<u16>> {
    const KEY: &str = "switchport trunk allowed vlan";
    let all = || (1..=4094).collect::<BTreeSet<u16>>();
    let mut cur: Option<BTreeSet<u16>> = None;
    let mut seen = false;
    for l in b.body.iter().filter(|l| l.text.starts_with(KEY)) {
        let rest = l.text[KEY.len()..].trim();
        let (op, list) = match rest.split_once(' ') {
            Some((o @ ("add" | "remove" | "except"), l)) => (o, l.trim()),
            _ => ("", rest),
        };
        let vlans: BTreeSet<u16> = split_vlans(list).into_iter().collect();
        match op {
            "add" => match &mut cur {
                Some(set) => set.extend(vlans),
                None if !seen => cur = Some(vlans),
                None => {}
            },
            "remove" => {
                let mut set = cur.take().unwrap_or_else(all);
                set.retain(|v| !vlans.contains(v));
                cur = Some(set);
            }
            "except" => cur = Some(all().difference(&vlans).copied().collect()),
            _ => {
                cur = match list {
                    "all" => None,
                    "none" => Some(BTreeSet::new()),
                    _ => Some(vlans),
                }
            }
        }
        seen = true;
    }
    cur.map(|s| s.into_iter().collect())
}

fn parse_interface(b: &Block, name: String) -> Interface {
    let mode = match b.value("switchport mode") {
        Some("access") => IfMode::Access,
        Some("trunk") => IfMode::Trunk,
        _ if b.find("ip address").is_some_and(|l| l.text != "ip address dhcp") || b.find("encapsulation").is_some() => IfMode::Routed,
        // En switchport utan "mode" räknas som access (det är vad den blir i praktiken mot en dator).
        _ if b.find("switchport access vlan").is_some() => IfMode::Access,
        _ => IfMode::Other,
    };
    let addr = |l: &Line| {
        let mut w = l.text.split_whitespace().skip(2);
        Some((parse_ip(w.next()?)?, parse_ip(w.next()?)?))
    };
    let is_secondary = |l: &&Line| l.text.starts_with("ip address ") && l.text.trim_end().ends_with(" secondary");
    let ip = b.body.iter().find(|l| l.text.starts_with("ip address ") && !is_secondary(l)).and_then(addr);
    let secondary = b.body.iter().filter(is_secondary).filter_map(addr).collect();
    let helpers = b
        .body
        .iter()
        .filter_map(|l| l.text.strip_prefix("ip helper-address ").and_then(|v| parse_ip(v.split_whitespace().next()?)))
        .collect();
    let acl = |dir: &str| {
        b.body.iter().find_map(|l| {
            let w: Vec<&str> = l.text.split_whitespace().collect();
            match w.as_slice() {
                ["ip", "access-group", name, d] if *d == dir => Some(name.to_string()),
                _ => None,
            }
        })
    };
    let dot1q = b.find("encapsulation dot1Q").or_else(|| b.find("encapsulation dot1q")).map(|l| {
        let words: Vec<&str> = l.text.split_whitespace().collect();
        (words.get(2).and_then(|v| v.parse().ok()), words.get(3) == Some(&"native"))
    });
    Interface {
        line: b.header.no,
        description: b.rest("description").unwrap_or("").to_string(),
        mode,
        access_vlan: b.value("switchport access vlan").and_then(|v| v.parse().ok()),
        native_vlan: b.value("switchport trunk native vlan").and_then(|v| v.parse().ok()),
        allowed: parse_allowed(b),
        ip,
        dot1q: dot1q.and_then(|d| d.0),
        dot1q_native: dot1q.is_some_and(|d| d.1),
        shutdown: b.has("shutdown"),
        portfast: b.body.iter().any(|l| l.text.starts_with("spanning-tree portfast")),
        bpduguard: b.has("spanning-tree bpduguard enable"),
        voice_vlan: b.value("switchport voice vlan").and_then(|v| v.parse().ok()),
        secondary,
        helpers,
        channel_group: b.rest("channel-group ").and_then(|v| v.split_whitespace().next()?.parse().ok()),
        speed: b.rest("speed ").map(str::to_string),
        duplex: b.rest("duplex ").map(str::to_string),
        port_security: b.body.iter().any(|l| l.text.starts_with("switchport port-security")),
        acl_in: acl("in"),
        acl_out: acl("out"),
        name,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "hostname SW1\n!\nvlan 10\n name KONTOR\n!\ninterface Fa0/1\n description Port mot PC1\n switchport mode access\n switchport access vlan 10\n!\ninterface Gi0/1\n description Trunk mot R1 (uplink)\n switchport mode trunk\n switchport trunk allowed vlan 10,20-21\n!\nend\n";

    #[test]
    fn parses_blocks_and_interfaces() {
        let c = Config::parse("x", "x.cfg", SAMPLE);
        assert_eq!(c.hostname.as_deref(), Some("SW1"));
        assert_eq!(c.kind, Kind::Switch);
        assert_eq!(c.vlans.get(&10).map(String::as_str), Some("KONTOR"));
        let fa = c.interface("Fa0/1").unwrap();
        assert_eq!(fa.mode, IfMode::Access);
        assert_eq!(fa.access_vlan, Some(10));
        assert_eq!(fa.peer(), Some("PC1"));
        let gi = c.interface("GigabitEthernet0/1").unwrap();
        assert_eq!(gi.allowed, Some(vec![10, 20, 21]));
        assert_eq!(gi.peer(), Some("R1"));
        assert_eq!(gi.line, 11);
    }

    fn parse(text: &str) -> Config {
        Config::parse("x", "x.cfg", text)
    }

    #[test]
    fn multiline_banner_is_one_block() {
        let c = parse("hostname R1\nbanner motd ^C\nVarning!\nendast personal\n^C\nline vty 0 4\n login local\n!\nend\n");
        let b = c.blocks.iter().find(|b| b.header.text.starts_with("banner")).unwrap();
        assert_eq!(b.body.len(), 3);
        assert_eq!(b.body[2].text, "^C");
        assert!(!c.blocks.iter().any(|b| b.header.text == "Varning!" || b.header.text == "endast personal"));
        assert!(c.blocks.iter().any(|b| b.header.text == "line vty 0 4" && b.has("login local")));
        // Enradiga bannrar skapar inget öppet block.
        let c = parse("banner motd ^Hej^\nbanner login ^C Hej ^C\nhostname X\n");
        assert_eq!(c.blocks.len(), 3);
        assert_eq!(c.hostname.as_deref(), Some("X"));
    }

    #[test]
    fn interface_range_is_expanded() {
        let c = parse(
            "interface range Fa0/1 - 3, Gi0/1\n switchport mode access\n switchport access vlan 10\n!\ninterface range FastEthernet0/10 - FastEthernet0/11\n shutdown\n",
        );
        let names: Vec<&str> = c.interfaces.iter().map(|i| i.name.as_str()).collect();
        assert_eq!(
            names,
            ["FastEthernet0/1", "FastEthernet0/2", "FastEthernet0/3", "GigabitEthernet0/1", "FastEthernet0/10", "FastEthernet0/11"]
        );
        assert!(c.interfaces[..4].iter().all(|i| i.access_vlan == Some(10) && i.mode == IfMode::Access));
        assert!(c.interfaces[5].shutdown);
        assert_eq!(expand_range("port-channel1 - 2"), ["Port-channel1", "Port-channel2"]);
    }

    #[test]
    fn new_interface_fields() {
        let c = parse(concat!(
            "interface Fa0/1\n switchport voice vlan 150\n switchport port-security maximum 2\n speed 100\n duplex full\n channel-group 3 mode active\n ip access-group SKYDD in\n ip access-group UT out\n",
            "interface Vlan10\n ip address 10.0.0.1 255.255.255.0 secondary\n ip address 10.0.1.1 255.255.255.0\n ip helper-address 10.9.9.9\n ip helper-address 10.9.9.8\n"
        ));
        let fa = c.interface("Fa0/1").unwrap();
        assert_eq!(fa.voice_vlan, Some(150));
        assert!(fa.port_security);
        assert_eq!((fa.speed.as_deref(), fa.duplex.as_deref()), (Some("100"), Some("full")));
        assert_eq!(fa.channel_group, Some(3));
        assert_eq!((fa.acl_in.as_deref(), fa.acl_out.as_deref()), (Some("SKYDD"), Some("UT")));
        let svi = c.interface("Vlan10").unwrap();
        assert_eq!(svi.ip.unwrap().0.to_string(), "10.0.1.1", "primär adress även om secondary står först");
        assert_eq!(svi.secondary.len(), 1);
        assert_eq!(svi.helpers.len(), 2);
        assert!(!svi.port_security && svi.voice_vlan.is_none());
    }

    #[test]
    fn allowed_vlan_add_remove() {
        let allowed = |lines: &str| parse(&format!("interface Gi0/1\n switchport mode trunk\n{lines}")).interfaces[0].allowed.clone();
        assert_eq!(
            allowed(" switchport trunk allowed vlan 10,20\n switchport trunk allowed vlan add 30,40-41\n"),
            Some(vec![10, 20, 30, 40, 41])
        );
        assert_eq!(allowed(" switchport trunk allowed vlan 10,20,30\n switchport trunk allowed vlan remove 20\n"), Some(vec![10, 30]));
        assert_eq!(allowed(" switchport trunk allowed vlan none\n switchport trunk allowed vlan add 5\n"), Some(vec![5]));
        assert_eq!(allowed(" switchport trunk allowed vlan all\n"), None);
        assert_eq!(allowed(""), None);
        let except = allowed(" switchport trunk allowed vlan except 1-4000\n").unwrap();
        assert_eq!(except.first(), Some(&4001));
        assert_eq!(except.len(), 94);
        let removed = allowed(" switchport trunk allowed vlan remove 1-4093\n").unwrap();
        assert_eq!(removed, vec![4094]);
    }

    #[test]
    fn show_run_noise_crlf_and_tabs() {
        let text = "Building configuration...\r\n\r\nCurrent configuration : 1234 bytes\r\n!\r\nversion 15.1\r\nhostname SW9\r\nip routing\r\ninterface Fa0/1\r\n\tswitchport mode access\r\n\tswitchport access vlan 7\r\n";
        let c = parse(text);
        assert_eq!(c.hostname.as_deref(), Some("SW9"));
        assert_eq!(c.version.as_deref(), Some("15.1"));
        assert!(c.ip_routing);
        assert!(!c.lines.iter().any(|l| l.text.contains("Building") || l.text.contains("Current configuration") || l.text.contains('\r')));
        let fa = c.interface("Fa0/1").unwrap();
        assert_eq!(fa.access_vlan, Some(7));
        assert_eq!(fa.line, 8, "radnumret följer originalfilen");
        assert!(!parse("no ip routing\nhostname A\n").ip_routing);
        assert!(parse("hostname A\n").version.is_none());
    }

    #[test]
    fn acl_names_lists_numbers_and_names() {
        let c = parse(
            "access-list 1 permit 10.0.0.0 0.0.0.255\naccess-list 1 permit 10.1.0.0 0.0.0.255\naccess-list 110 deny ip any any\nip access-list extended FILTER\n permit ip any any\nip access-list standard MGMT\n permit 10.0.0.0 0.0.0.255\n",
        );
        assert_eq!(c.acl_names(), ["1", "110", "FILTER", "MGMT"]);
        assert!(parse("hostname A\n").acl_names().is_empty());
    }
}
