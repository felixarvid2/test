//! Tolkar en sparad Cisco IOS-konfig (running-config) till block och interface.
//!
//! Ett block är en rubrikrad utan indrag följd av rader MED indrag, t.ex.
//! `interface FastEthernet0/1` + ` switchport mode access`.

use crate::inventory::{normalize_port, split_vlans};
use crate::net::{parse_ip, Subnet};
use serde::Serialize;
use std::collections::BTreeMap;
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
        let d = self.description.as_str();
        let idx = d.find(" mot ").map(|i| i + 5).or_else(|| d.to_ascii_lowercase().find(" to ").map(|i| i + 4))?;
        d[idx..].split_whitespace().next()
    }
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
}

impl Config {
    pub fn load(path: &Path) -> std::io::Result<Self> {
        let text = std::fs::read_to_string(path)?;
        let name = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        Ok(Config::parse(&name, &path.display().to_string(), &text))
    }

    pub fn parse(name: &str, path: &str, text: &str) -> Self {
        let lines: Vec<Line> = text
            .lines()
            .enumerate()
            .map(|(i, l)| Line { no: i + 1, text: l.trim_end().to_string() })
            .collect();

        let mut blocks: Vec<Block> = Vec::new();
        let mut open = false;
        for line in &lines {
            let indented = line.text.starts_with(' ');
            if indented && open {
                blocks.last_mut().unwrap().body.push(Line { no: line.no, text: line.text.trim().to_string() });
            } else if !indented && !line.text.is_empty() && !line.text.starts_with('!') {
                blocks.push(Block { header: line.clone(), body: Vec::new() });
                open = true;
            } else {
                open = false;
            }
        }

        let hostname = blocks
            .iter()
            .find_map(|b| b.header.text.strip_prefix("hostname ").map(|h| h.trim().to_string()));

        let mut vlans = BTreeMap::new();
        for b in &blocks {
            if let Some(list) = b.header.text.strip_prefix("vlan ") {
                for v in split_vlans(list) {
                    vlans.insert(v, b.rest("name").unwrap_or("").to_string());
                }
            }
        }

        let interfaces: Vec<Interface> = blocks
            .iter()
            .filter(|b| b.header.text.starts_with("interface "))
            .map(parse_interface)
            .collect();

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

        Config { name: name.to_string(), path: path.to_string(), lines, blocks, hostname, kind, interfaces, vlans }
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

fn parse_interface(b: &Block) -> Interface {
    let name = normalize_port(b.name());
    let mode = match b.value("switchport mode") {
        Some("access") => IfMode::Access,
        Some("trunk") => IfMode::Trunk,
        _ if b.find("ip address").is_some_and(|l| l.text != "ip address dhcp") || b.find("encapsulation").is_some() => IfMode::Routed,
        // En switchport utan "mode" räknas som access (det är vad den blir i praktiken mot en dator).
        _ if b.find("switchport access vlan").is_some() => IfMode::Access,
        _ => IfMode::Other,
    };
    let ip = b.find("ip address ").and_then(|l| {
        let mut w = l.text.split_whitespace().skip(2);
        Some((parse_ip(w.next()?)?, parse_ip(w.next()?)?))
    });
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
        allowed: b.rest("switchport trunk allowed vlan").and_then(|v| {
            let v = v.trim_start_matches("add ").trim();
            if v == "all" { None } else { Some(split_vlans(v)) }
        }),
        ip,
        dot1q: dot1q.and_then(|d| d.0),
        dot1q_native: dot1q.is_some_and(|d| d.1),
        shutdown: b.has("shutdown"),
        portfast: b.body.iter().any(|l| l.text.starts_with("spanning-tree portfast")),
        bpduguard: b.has("spanning-tree bpduguard enable"),
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
}
