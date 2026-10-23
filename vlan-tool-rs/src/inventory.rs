//! Läser CSV-filerna i samples/ och kontrollerar att de hänger ihop innan någon
//! konfig byggs. Vilken sorts fil det är avgörs av rubrikraden, precis som i
//! Python-versionen, så filerna får heta vad som helst.

use crate::finding::{Finding, Severity};
use crate::net::{parse_ip, range_len, Subnet};
use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PortMode {
    Access,
    Trunk,
}

#[derive(Debug, Clone, Serialize)]
pub struct PortRow {
    pub switch: String,
    pub port: String,
    pub mode: PortMode,
    pub vlan: Option<u16>,
    pub vlan_name: String,
    pub allowed: Vec<u16>,
    pub native: Option<u16>,
    pub description: String,
    pub up: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DhcpRow {
    pub vlan: u16,
    pub name: String,
    pub network: Subnet,
    pub pool_start: Ipv4Addr,
    pub pool_end: Ipv4Addr,
    pub excluded_start: Ipv4Addr,
    pub excluded_end: Ipv4Addr,
    pub gateway: Ipv4Addr,
    pub dns: Ipv4Addr,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceRow {
    pub hostname: String,
    pub mgmt_ip: Ipv4Addr,
    pub mgmt_mask: Ipv4Addr,
    pub gateway: Ipv4Addr,
    pub source: String,
}

#[derive(Debug, Default, Serialize)]
pub struct Inventory {
    pub ports: Vec<PortRow>,
    pub dhcp: Vec<DhcpRow>,
    pub devices: Vec<DeviceRow>,
    pub files: Vec<PathBuf>,
    /// Rader som inte gick att tolka alls.
    pub problems: Vec<Finding>,
}

/// En CSV-rad som en ordlista rubrik -> värde, med radnumret i filen.
struct Row {
    fields: HashMap<String, String>,
    where_: String,
}

impl Row {
    fn get(&self, key: &str) -> &str {
        self.fields.get(key).map(String::as_str).unwrap_or("")
    }

    fn ip(&self, key: &str) -> Result<Ipv4Addr, String> {
        parse_ip(self.get(key)).ok_or_else(|| format!("{}: '{}' är ingen giltig IP-adress i kolumnen {key}", self.where_, self.get(key)))
    }
}

/// Gör om "Gi0/1" till "GigabitEthernet0/1" och "fa0/2" till "FastEthernet0/2".
pub fn normalize_port(name: &str) -> String {
    let name = name.trim();
    let split = name.find(|c: char| c.is_ascii_digit()).unwrap_or(name.len());
    let (kind, number) = name.split_at(split);
    let kind = kind.trim();
    let full = match kind.to_ascii_lowercase().as_str() {
        "gi" | "gig" | "gigabitethernet" => "GigabitEthernet",
        "fa" | "fas" | "fastethernet" => "FastEthernet",
        "te" | "ten" | "tengigabitethernet" => "TenGigabitEthernet",
        "eth" | "e" | "ethernet" => "Ethernet",
        "po" | "port-channel" => "Port-channel",
        "vl" | "vlan" => "Vlan",
        _ => kind,
    };
    format!("{full}{number}")
}

/// Kortnamn för tabeller: "GigabitEthernet0/1" -> "Gi0/1".
pub fn short_port(name: &str) -> String {
    for (long, short) in [
        ("TenGigabitEthernet", "Te"),
        ("GigabitEthernet", "Gi"),
        ("FastEthernet", "Fa"),
        ("Ethernet", "Eth"),
        ("Port-channel", "Po"),
    ] {
        if let Some(rest) = name.strip_prefix(long) {
            return format!("{short}{rest}");
        }
    }
    name.to_string()
}

/// "10;20,99" -> [10, 20, 99]. Ord som inte är siffror (t.ex. "Trunk") hoppas över.
pub fn split_vlans(text: &str) -> Vec<u16> {
    let mut out = Vec::new();
    for part in text.split([',', ';']) {
        let part = part.trim();
        if let Some((a, b)) = part.split_once('-') {
            if let (Ok(a), Ok(b)) = (a.trim().parse::<u16>(), b.trim().parse::<u16>()) {
                out.extend(a..=b.min(4094));
            }
        } else if let Ok(v) = part.parse() {
            out.push(v);
        }
    }
    out
}

/// Gör om [10, 11, 12, 20] till "10-12,20" som IOS skriver det.
pub fn join_vlans(vlans: &[u16]) -> String {
    let set: BTreeSet<u16> = vlans.iter().copied().collect();
    let mut parts = Vec::new();
    let mut iter = set.into_iter().peekable();
    while let Some(start) = iter.next() {
        let mut end = start;
        while iter.peek() == Some(&(end + 1)) {
            end = iter.next().unwrap();
        }
        parts.push(if end >= start + 2 { format!("{start}-{end}") } else if end == start + 1 { format!("{start},{end}") } else { start.to_string() });
    }
    parts.join(",")
}

fn read_rows(path: &Path) -> Result<Vec<Row>> {
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("kunde inte öppna {}", path.display()))?;
    let headers: Vec<String> = reader.headers()?.iter().map(|h| h.trim_start_matches('\u{feff}').trim().to_string()).collect();
    let file = path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
    let mut rows = Vec::new();
    for (i, record) in reader.records().enumerate() {
        let record = record.with_context(|| format!("{file}: rad {} går inte att läsa", i + 2))?;
        let fields = headers.iter().cloned().zip(record.iter().map(|v| v.trim().to_string())).collect();
        rows.push(Row { fields, where_: format!("{file}:{}", i + 2) });
    }
    Ok(rows)
}

impl Inventory {
    /// Läser alla .csv-filer i mappen.
    pub fn load_dir(dir: &Path) -> Result<Self> {
        let mut paths: Vec<PathBuf> = std::fs::read_dir(dir)
            .with_context(|| format!("hittade inte mappen {}", dir.display()))?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("csv")))
            .collect();
        paths.sort();

        let mut inv = Inventory::default();
        for path in paths {
            let rows = read_rows(&path)?;
            let Some(first) = rows.first() else { continue };
            if first.fields.contains_key("Switch") {
                for row in &rows {
                    inv.parse_port(row);
                }
            } else if first.fields.contains_key("pool_name") {
                for row in &rows {
                    inv.parse_dhcp(row);
                }
            } else if first.fields.contains_key("Mgmt_IP") {
                for row in &rows {
                    inv.parse_device(row);
                }
            } else {
                inv.problems.push(Finding::new(
                    "csv-format",
                    Severity::Info,
                    format!("{}: okänd CSV-fil, hoppas över", path.display()),
                ));
                continue;
            }
            inv.files.push(path);
        }
        Ok(inv)
    }

    fn bad(&mut self, message: String) {
        self.problems.push(Finding::new("csv-format", Severity::High, message));
    }

    fn parse_port(&mut self, row: &Row) {
        let mode = match row.get("Lage").to_ascii_lowercase().as_str() {
            "access" => PortMode::Access,
            "trunk" => PortMode::Trunk,
            other => return self.bad(format!("{}: okänt läge '{other}', ska vara access eller trunk", row.where_)),
        };
        if row.get("Switch").is_empty() || row.get("Port").is_empty() {
            return self.bad(format!("{}: Switch och Port måste fyllas i", row.where_));
        }
        self.ports.push(PortRow {
            switch: row.get("Switch").to_string(),
            port: normalize_port(row.get("Port")),
            mode,
            vlan: row.get("Vlan_Id").parse().ok(),
            vlan_name: row.get("Vlan_Namn").to_string(),
            allowed: split_vlans(row.get("Tillatna_Vlan")),
            native: row.get("Native_Vlan").parse().ok(),
            description: row.get("Beskrivning").to_string(),
            up: !row.get("Status").eq_ignore_ascii_case("down"),
            source: row.where_.clone(),
        });
    }

    fn parse_dhcp(&mut self, row: &Row) {
        let parsed = (|| -> Result<DhcpRow, String> {
            let vlan = row.get("vlan_id").parse().map_err(|_| format!("{}: vlan_id '{}' är inget nummer", row.where_, row.get("vlan_id")))?;
            let network = Subnet::from_addr_mask(row.ip("network")?, row.ip("mask")?)
                .ok_or_else(|| format!("{}: masken {} är ogiltig", row.where_, row.get("mask")))?;
            Ok(DhcpRow {
                vlan,
                name: row.get("pool_name").to_string(),
                network,
                pool_start: row.ip("pool_start")?,
                pool_end: row.ip("pool_end")?,
                excluded_start: row.ip("excluded_start")?,
                excluded_end: row.ip("excluded_end")?,
                gateway: row.ip("gateway")?,
                dns: row.ip("dns")?,
                source: row.where_.clone(),
            })
        })();
        match parsed {
            Ok(d) => self.dhcp.push(d),
            Err(e) => self.bad(e),
        }
    }

    fn parse_device(&mut self, row: &Row) {
        let parsed = (|| -> Result<DeviceRow, String> {
            Ok(DeviceRow {
                hostname: row.get("Hostname").to_string(),
                mgmt_ip: row.ip("Mgmt_IP")?,
                mgmt_mask: row.ip("Mgmt_mask")?,
                gateway: row.ip("Gateway")?,
                source: row.where_.clone(),
            })
        })();
        match parsed {
            Ok(d) => self.devices.push(d),
            Err(e) => self.bad(e),
        }
    }

    /// Portarna grupperade per switch, i den ordning switcharna står i filen.
    pub fn switches(&self) -> Vec<(String, Vec<&PortRow>)> {
        let mut order: Vec<String> = Vec::new();
        let mut map: HashMap<&str, Vec<&PortRow>> = HashMap::new();
        for p in &self.ports {
            if !map.contains_key(p.switch.as_str()) {
                order.push(p.switch.clone());
            }
            map.entry(&p.switch).or_default().push(p);
        }
        order.into_iter().map(|s| {
            let ports = map.remove(s.as_str()).unwrap_or_default();
            (s, ports)
        }).collect()
    }

    /// VLAN-nummer -> namn från alla källor. Namnet i ports.csv går före dhcp.csv.
    pub fn vlan_names(&self) -> BTreeMap<u16, String> {
        let mut names = BTreeMap::new();
        for d in &self.dhcp {
            names.insert(d.vlan, d.name.clone());
        }
        for p in &self.ports {
            if let (PortMode::Access, Some(v)) = (p.mode, p.vlan)
                && !p.vlan_name.is_empty() {
                    names.insert(v, p.vlan_name.clone());
                }
        }
        names
    }

    pub fn device(&self, hostname: &str) -> Option<&DeviceRow> {
        self.devices.iter().find(|d| d.hostname == hostname)
    }

    /// Kontrollerar att CSV-filerna är rimliga och hänger ihop med varandra.
    pub fn validate(&self, native_vlan: u16, mgmt_vlan: u16) -> Vec<Finding> {
        let mut out = self.problems.clone();
        let rule = "csv";

        // --- ports.csv -------------------------------------------------------
        let mut seen: HashMap<(String, String), &str> = HashMap::new();
        for p in &self.ports {
            if let Some(first) = seen.insert((p.switch.clone(), p.port.clone()), &p.source) {
                out.push(Finding::new(rule, Severity::High, format!("{}: {} {} finns redan på {first}", p.source, p.switch, p.port)));
            }
            match p.mode {
                PortMode::Access => match p.vlan {
                    None => out.push(Finding::new(rule, Severity::High, format!("{}: accessporten {} saknar VLAN-nummer", p.source, p.port))),
                    Some(1) => out.push(Finding::new(rule, Severity::Medium, format!("{}: {} ligger i VLAN 1 (standard-VLAN)", p.source, p.port))),
                    Some(v) if !(1..=4094).contains(&v) => out.push(Finding::new(rule, Severity::High, format!("{}: VLAN {v} är utanför 1–4094", p.source))),
                    _ => {}
                },
                PortMode::Trunk => {
                    if p.allowed.is_empty() {
                        out.push(Finding::new(rule, Severity::Medium, format!("{}: trunken {} saknar tillåtna VLAN", p.source, p.port)));
                    }
                    match p.native {
                        None => out.push(Finding::new(rule, Severity::High, format!("{}: trunken {} saknar native-VLAN", p.source, p.port))),
                        Some(n) if n != native_vlan => out.push(Finding::new(
                            rule,
                            Severity::High,
                            format!("{}: native-VLAN {n} på {} matchar inte routerns {native_vlan}", p.source, p.port),
                        )),
                        _ => {}
                    }
                }
            }
            if p.description.is_empty() {
                out.push(Finding::new(rule, Severity::Info, format!("{}: {} saknar beskrivning", p.source, p.port)));
            }
        }

        // Varje VLAN som används på en accessport ska finnas på switchens trunkar.
        for (switch, ports) in self.switches() {
            let trunk_vlans: BTreeSet<u16> = ports.iter().filter(|p| p.mode == PortMode::Trunk).flat_map(|p| p.allowed.iter().copied()).collect();
            if trunk_vlans.is_empty() {
                continue;
            }
            let access: BTreeSet<u16> = ports.iter().filter(|p| p.mode == PortMode::Access).filter_map(|p| p.vlan).collect();
            for v in access.difference(&trunk_vlans) {
                out.push(Finding::new(rule, Severity::Medium, format!("{switch}: VLAN {v} används på accessportar men går inte på någon trunk")));
            }
        }

        // Samma VLAN-nummer ska ha samma namn överallt.
        let mut names: BTreeMap<u16, BTreeSet<&str>> = BTreeMap::new();
        for p in self.ports.iter().filter(|p| p.mode == PortMode::Access) {
            if let Some(v) = p.vlan {
                names.entry(v).or_default().insert(&p.vlan_name);
            }
        }
        for d in &self.dhcp {
            names.entry(d.vlan).or_default().insert(&d.name);
        }
        for (v, set) in names {
            if set.len() > 1 {
                let list: Vec<&str> = set.into_iter().collect();
                out.push(Finding::new(rule, Severity::Low, format!("VLAN {v} har olika namn: {}", list.join(", "))));
            }
        }

        // --- dhcp.csv --------------------------------------------------------
        for d in &self.dhcp {
            let net = d.network;
            for (label, ip) in [
                ("gateway", d.gateway),
                ("pool_start", d.pool_start),
                ("pool_end", d.pool_end),
                ("excluded_start", d.excluded_start),
                ("excluded_end", d.excluded_end),
            ] {
                if !net.contains(ip) {
                    out.push(Finding::new(rule, Severity::High, format!("{}: {label} {ip} ligger utanför {net}", d.source)));
                } else if ip == net.network || ip == net.broadcast() {
                    out.push(Finding::new(rule, Severity::High, format!("{}: {label} {ip} är nät- eller broadcastadress", d.source)));
                }
            }
            if range_len(d.pool_start, d.pool_end) == 0 {
                out.push(Finding::new(rule, Severity::High, format!("{}: pool_start är efter pool_end", d.source)));
            }
            let gw = u32::from(d.gateway);
            if gw < u32::from(d.excluded_start) || gw > u32::from(d.excluded_end) {
                out.push(Finding::new(rule, Severity::Medium, format!("{}: gatewayen {} är inte undantagen från DHCP", d.source, d.gateway)));
            }
            let free = range_len(d.pool_start, d.pool_end).saturating_sub(range_len(d.excluded_start, d.excluded_end));
            if free < 5 {
                out.push(Finding::new(rule, Severity::Low, format!("{}: bara {free} adresser kvar att dela ut i {}", d.source, d.name)));
            }
        }
        for (i, a) in self.dhcp.iter().enumerate() {
            for b in &self.dhcp[i + 1..] {
                if a.network.overlaps(&b.network) {
                    out.push(Finding::new(rule, Severity::Critical, format!("{} ({}) och {} ({}) överlappar", a.name, a.network, b.name, b.network)));
                }
                if a.vlan == b.vlan {
                    out.push(Finding::new(rule, Severity::High, format!("VLAN {} har två DHCP-pooler: {} och {}", a.vlan, a.name, b.name)));
                }
            }
        }
        let dhcp_vlans: BTreeSet<u16> = self.dhcp.iter().map(|d| d.vlan).collect();
        let used: BTreeSet<u16> = self.ports.iter().filter(|p| p.mode == PortMode::Access).filter_map(|p| p.vlan).collect();
        for v in used.difference(&dhcp_vlans) {
            out.push(Finding::new(rule, Severity::Low, format!("VLAN {v} används men har ingen DHCP-pool eller router-gateway")));
        }

        // --- devices.csv -----------------------------------------------------
        let mgmt = self.dhcp.iter().find(|d| d.vlan == mgmt_vlan);
        for dev in &self.devices {
            if !self.ports.iter().any(|p| p.switch == dev.hostname) {
                out.push(Finding::new(rule, Severity::Low, format!("{}: {} finns inte i ports.csv", dev.source, dev.hostname)));
            }
            let Some(own) = Subnet::from_addr_mask(dev.mgmt_ip, dev.mgmt_mask) else {
                out.push(Finding::new(rule, Severity::High, format!("{}: ogiltig mask {}", dev.source, dev.mgmt_mask)));
                continue;
            };
            if !own.contains(dev.gateway) {
                out.push(Finding::new(rule, Severity::High, format!("{}: gatewayen {} ligger inte i {own}", dev.source, dev.gateway)));
            }
            if let Some(m) = mgmt {
                if !m.network.contains(dev.mgmt_ip) {
                    out.push(Finding::new(rule, Severity::High, format!("{}: {} ligger inte i hanterings-VLAN:ets nät {}", dev.source, dev.mgmt_ip, m.network)));
                }
                if dev.gateway != m.gateway {
                    out.push(Finding::new(rule, Severity::Medium, format!("{}: gatewayen {} är inte routerns {}", dev.source, dev.gateway, m.gateway)));
                }
                let (s, e) = (u32::from(dev.mgmt_ip), (u32::from(m.excluded_start), u32::from(m.excluded_end)));
                let in_pool = s >= u32::from(m.pool_start) && s <= u32::from(m.pool_end);
                if in_pool && (s < e.0 || s > e.1) {
                    out.push(Finding::new(
                        rule,
                        Severity::High,
                        format!("{}: {} kan delas ut av DHCP-poolen {} (inte undantagen)", dev.source, dev.mgmt_ip, m.name),
                    ));
                }
            }
        }
        let mut ips: HashMap<Ipv4Addr, &str> = HashMap::new();
        for dev in &self.devices {
            if let Some(other) = ips.insert(dev.mgmt_ip, &dev.hostname) {
                out.push(Finding::new(rule, Severity::Critical, format!("{} och {} har samma IP {}", other, dev.hostname, dev.mgmt_ip)));
            }
        }
        for d in &self.dhcp {
            if let Some(dev) = ips.get(&d.gateway) {
                out.push(Finding::new(rule, Severity::Critical, format!("{dev} har samma IP som routerns gateway {}", d.gateway)));
            }
        }

        out.sort_by_key(|f| std::cmp::Reverse(f.severity));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ports_and_vlans() {
        assert_eq!(normalize_port("Gi0/1"), "GigabitEthernet0/1");
        assert_eq!(normalize_port("fa0/10"), "FastEthernet0/10");
        assert_eq!(normalize_port("vlan 99"), "Vlan99");
        assert_eq!(short_port("FastEthernet0/10"), "Fa0/10");
        assert_eq!(split_vlans("10;20, 30-32,Trunk"), vec![10, 20, 30, 31, 32]);
        assert_eq!(join_vlans(&[10, 20, 30, 31, 32, 99, 98]), "10,20,30-32,98,99");
    }
}
