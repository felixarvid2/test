//! Läser CSV-filerna i samples/ och kontrollerar att de hänger ihop innan någon
//! konfig byggs. Vilken sorts fil det är avgörs av rubrikraden, precis som i
//! Python-versionen, så filerna får heta vad som helst.

use crate::finding::{Finding, Severity};
use crate::net::{Subnet, parse_ip, range_len};
use crate::parser::peer_of;
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
    /// Valfri kolumn `Voice_Vlan`.
    pub voice_vlan: Option<u16>,
    /// Valfri kolumn `Port_Security`: högsta antal MAC-adresser.
    pub port_security: Option<u16>,
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
    /// Nätadressen exakt som den stod i filen (kan avvika från `network.network`).
    pub network_addr: Ipv4Addr,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceRow {
    pub hostname: String,
    pub mgmt_ip: Ipv4Addr,
    pub mgmt_mask: Ipv4Addr,
    pub gateway: Ipv4Addr,
    pub source: String,
    /// Valfri kolumn `Plats`.
    pub location: String,
    /// Valfri kolumn `Modell`.
    pub model: String,
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
    /// Rubriker matchas utan hänsyn till versaler/gemener (nycklarna är lagrade som gemener).
    fn get(&self, key: &str) -> &str {
        self.fields.get(&key.to_ascii_lowercase()).map(String::as_str).unwrap_or("")
    }

    fn has(&self, key: &str) -> bool {
        self.fields.contains_key(&key.to_ascii_lowercase())
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
    for (long, short) in
        [("TenGigabitEthernet", "Te"), ("GigabitEthernet", "Gi"), ("FastEthernet", "Fa"), ("Ethernet", "Eth"), ("Port-channel", "Po")]
    {
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
        parts.push(if end >= start + 2 {
            format!("{start}-{end}")
        } else if end == start + 1 {
            format!("{start},{end}")
        } else {
            start.to_string()
        });
    }
    parts.join(",")
}

/// Tolkar Up/Down/Upp/Nere/Ja/Nej/On/Off (och några till). None = känns inte igen.
pub fn parse_status(text: &str) -> Option<bool> {
    match text.trim().to_lowercase().as_str() {
        "up" | "upp" | "ja" | "on" | "yes" | "true" | "1" | "aktiv" => Some(true),
        "down" | "nere" | "nej" | "off" | "no" | "false" | "0" | "inaktiv" => Some(false),
        _ => None,
    }
}

/// Tillåtna tecken i ett hostname på IOS, och högst 63 tecken. None = giltigt.
pub fn hostname_problem(name: &str) -> Option<String> {
    if name.chars().count() > 63 {
        return Some(format!("hostnamnet '{name}' är längre än 63 tecken"));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Some(format!("hostnamnet '{name}' innehåller otillåtna tecken (tillåtna: bokstäver, siffror och bindestreck)"));
    }
    if !name.starts_with(|c: char| c.is_ascii_alphabetic()) {
        return Some(format!("hostnamnet '{name}' måste börja med en bokstav"));
    }
    None
}

/// Siffror i en VLAN-lista som ligger utanför 1–4094 (annars tappas de tyst).
fn vlans_out_of_range(text: &str) -> Vec<u32> {
    text.split(|c: char| !c.is_ascii_digit()).filter_map(|n| n.parse::<u32>().ok()).filter(|n| !(1..=4094).contains(n)).collect()
}

/// Semikolon eller komma: det som förekommer mest på rubrikraden.
fn detect_delimiter(text: &str) -> u8 {
    let first = text.lines().next().unwrap_or("");
    if first.matches(';').count() > first.matches(',').count() { b';' } else { b',' }
}

fn rows_from_text(file: &str, text: &str) -> Result<Vec<Row>> {
    let text = text.trim_start_matches('\u{feff}');
    let mut reader =
        csv::ReaderBuilder::new().trim(csv::Trim::All).flexible(true).delimiter(detect_delimiter(text)).from_reader(text.as_bytes());
    let headers: Vec<String> = reader.headers()?.iter().map(|h| h.trim().to_ascii_lowercase()).collect();
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
            let bytes = std::fs::read(&path).with_context(|| format!("kunde inte öppna {}", path.display()))?;
            let file = path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
            if inv.load_text(&file, &path.display().to_string(), &String::from_utf8_lossy(&bytes))? {
                inv.files.push(path);
            }
        }
        Ok(inv)
    }

    /// Bygger en inventarie av CSV-texter `(filnamn, innehåll)` utan att röra disken.
    pub fn from_csv_texts(texts: &[(&str, &str)]) -> Result<Self> {
        let mut inv = Inventory::default();
        for (file, text) in texts {
            if inv.load_text(file, file, text)? {
                inv.files.push(PathBuf::from(file));
            }
        }
        Ok(inv)
    }

    /// Läser en CSV-text. Ger false om filen hoppades över.
    fn load_text(&mut self, file: &str, shown_path: &str, text: &str) -> Result<bool> {
        let rows = rows_from_text(file, text)?;
        let Some(first) = rows.first() else { return Ok(false) };
        if first.has("Switch") {
            for row in &rows {
                self.parse_port(row);
            }
        } else if first.has("pool_name") {
            for row in &rows {
                self.parse_dhcp(row);
            }
        } else if first.has("Mgmt_IP") {
            for row in &rows {
                self.parse_device(row);
            }
        } else {
            self.problems.push(Finding::new("csv-format", Severity::Info, format!("{shown_path}: okänd CSV-fil, hoppas över")));
            return Ok(false);
        }
        Ok(true)
    }

    fn warn(&mut self, severity: Severity, message: String) {
        self.problems.push(Finding::new("csv-format", severity, message));
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
        let mut optional = |key: &str, what: &str| -> Option<u16> {
            let v = row.get(key);
            if v.is_empty() {
                return None;
            }
            let parsed = v.parse::<u16>().ok().filter(|n| *n > 0);
            if parsed.is_none() {
                self.problems.push(Finding::new("csv-format", Severity::Medium, format!("{}: '{v}' i {key} är {what}", row.where_)));
            }
            parsed
        };
        let voice_vlan = optional("Voice_Vlan", "inget VLAN-nummer");
        let port_security = optional("Port_Security", "inget antal MAC-adresser");
        let allowed_text = row.get("Tillatna_Vlan");
        let bad_vlans = vlans_out_of_range(allowed_text);
        if !bad_vlans.is_empty() {
            let list: Vec<String> = bad_vlans.iter().map(u32::to_string).collect();
            self.warn(Severity::High, format!("{}: tillåtna VLAN innehåller {} som är utanför 1–4094", row.where_, list.join(", ")));
        }
        let status = row.get("Status");
        let up = parse_status(status).unwrap_or_else(|| {
            if !status.is_empty() {
                self.problems.push(Finding::new(
                    "csv-format",
                    Severity::Low,
                    format!("{}: okänd status '{status}', tolkas som Up", row.where_),
                ));
            }
            true
        });
        self.ports.push(PortRow {
            switch: row.get("Switch").to_string(),
            port: normalize_port(row.get("Port")),
            mode,
            vlan: row.get("Vlan_Id").parse().ok(),
            vlan_name: row.get("Vlan_Namn").to_string(),
            allowed: split_vlans(allowed_text).into_iter().filter(|v| (1..=4094).contains(v)).collect(),
            native: row.get("Native_Vlan").parse().ok(),
            description: row.get("Beskrivning").to_string(),
            up,
            source: row.where_.clone(),
            voice_vlan,
            port_security,
        });
    }

    fn parse_dhcp(&mut self, row: &Row) {
        let parsed = (|| -> Result<DhcpRow, String> {
            let vlan =
                row.get("vlan_id").parse().map_err(|_| format!("{}: vlan_id '{}' är inget nummer", row.where_, row.get("vlan_id")))?;
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
                network_addr: row.ip("network")?,
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
                location: row.get("Plats").to_string(),
                model: row.get("Modell").to_string(),
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
        order
            .into_iter()
            .map(|s| {
                let ports = map.remove(s.as_str()).unwrap_or_default();
                (s, ports)
            })
            .collect()
    }

    /// VLAN-nummer -> namn från alla källor. Namnet i ports.csv går före dhcp.csv.
    pub fn vlan_names(&self) -> BTreeMap<u16, String> {
        let mut names = BTreeMap::new();
        for d in &self.dhcp {
            names.insert(d.vlan, d.name.clone());
        }
        for p in &self.ports {
            if let (PortMode::Access, Some(v)) = (p.mode, p.vlan)
                && !p.vlan_name.is_empty()
            {
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
                    None => {
                        out.push(Finding::new(rule, Severity::High, format!("{}: accessporten {} saknar VLAN-nummer", p.source, p.port)))
                    }
                    Some(1) => {
                        out.push(Finding::new(rule, Severity::Medium, format!("{}: {} ligger i VLAN 1 (standard-VLAN)", p.source, p.port)))
                    }
                    Some(v) if !(1..=4094).contains(&v) => {
                        out.push(Finding::new(rule, Severity::High, format!("{}: VLAN {v} är utanför 1–4094", p.source)))
                    }
                    _ => {}
                },
                PortMode::Trunk => {
                    if p.allowed.is_empty() {
                        out.push(Finding::new(rule, Severity::Medium, format!("{}: trunken {} saknar tillåtna VLAN", p.source, p.port)));
                    }
                    match p.native {
                        None => {
                            out.push(Finding::new(rule, Severity::High, format!("{}: trunken {} saknar native-VLAN", p.source, p.port)))
                        }
                        Some(n) if n != native_vlan => out.push(Finding::new(
                            rule,
                            Severity::High,
                            format!("{}: native-VLAN {n} på {} matchar inte routerns {native_vlan}", p.source, p.port),
                        )),
                        _ => {}
                    }
                }
            }
            if let Some(v) = p.voice_vlan.filter(|v| !(1..=4094).contains(v)) {
                out.push(Finding::new(rule, Severity::High, format!("{}: röst-VLAN {v} är utanför 1–4094", p.source)));
            }
            if p.description.is_empty() {
                out.push(Finding::new(rule, Severity::Info, format!("{}: {} saknar beskrivning", p.source, p.port)));
            }
        }

        // Hostnames: tillåtna tecken och längd.
        let mut checked: BTreeSet<&str> = BTreeSet::new();
        for (name, source) in self.ports.iter().map(|p| (&p.switch, &p.source)).chain(self.devices.iter().map(|d| (&d.hostname, &d.source)))
        {
            if checked.insert(name)
                && let Some(why) = hostname_problem(name)
            {
                out.push(Finding::new(rule, Severity::Medium, format!("{source}: {why}")));
            }
        }

        // Trunkar ska se likadana ut i båda ändar (beskrivningen "mot X" pekar på andra enheten).
        for (i, a) in self.ports.iter().enumerate().filter(|(_, p)| p.mode == PortMode::Trunk) {
            let Some(peer) = peer_of(&a.description) else { continue };
            let back = self.ports.iter().enumerate().find(|(_, b)| {
                b.mode == PortMode::Trunk
                    && b.switch.eq_ignore_ascii_case(peer)
                    && peer_of(&b.description).is_some_and(|x| x.eq_ignore_ascii_case(&a.switch))
            });
            let Some((j, b)) = back else { continue };
            if i > j {
                continue; // varje par rapporteras en gång
            }
            let (sa, sb): (BTreeSet<u16>, BTreeSet<u16>) = (a.allowed.iter().copied().collect(), b.allowed.iter().copied().collect());
            if sa != sb {
                out.push(Finding::new(
                    rule,
                    Severity::High,
                    format!(
                        "{}: trunken {} {} tillåter {} men {} {} ({}) tillåter {}",
                        a.source,
                        a.switch,
                        short_port(&a.port),
                        join_vlans(&a.allowed),
                        b.switch,
                        short_port(&b.port),
                        b.source,
                        join_vlans(&b.allowed)
                    ),
                ));
            }
            if a.native != b.native {
                let show = |n: Option<u16>| n.map_or("saknas".to_string(), |n| n.to_string());
                out.push(Finding::new(
                    rule,
                    Severity::High,
                    format!(
                        "{}: native-VLAN {} på {} {} skiljer sig från {} på {} {} ({})",
                        a.source,
                        show(a.native),
                        a.switch,
                        short_port(&a.port),
                        show(b.native),
                        b.switch,
                        short_port(&b.port),
                        b.source
                    ),
                ));
            }
        }

        // Varje VLAN som används på en accessport ska finnas på switchens trunkar.
        for (switch, ports) in self.switches() {
            let trunk_vlans: BTreeSet<u16> =
                ports.iter().filter(|p| p.mode == PortMode::Trunk).flat_map(|p| p.allowed.iter().copied()).collect();
            if trunk_vlans.is_empty() {
                continue;
            }
            let access: BTreeSet<u16> =
                ports.iter().filter(|p| p.mode == PortMode::Access).flat_map(|p| p.vlan.into_iter().chain(p.voice_vlan)).collect();
            for v in access.difference(&trunk_vlans) {
                out.push(Finding::new(
                    rule,
                    Severity::Medium,
                    format!("{switch}: VLAN {v} används på accessportar men går inte på någon trunk"),
                ));
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
            if d.network_addr != net.network {
                out.push(Finding::new(
                    rule,
                    Severity::Medium,
                    format!("{}: nätadressen {} är inte nätets första adress, nätet blir {net}", d.source, d.network_addr),
                ));
            }
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
                out.push(Finding::new(
                    rule,
                    Severity::Medium,
                    format!("{}: gatewayen {} är inte undantagen från DHCP", d.source, d.gateway),
                ));
            }
            let free = range_len(d.pool_start, d.pool_end).saturating_sub(range_len(d.excluded_start, d.excluded_end));
            let (lo, hi) = (u32::from(d.pool_start).max(u32::from(d.excluded_start)), u32::from(d.pool_end).min(u32::from(d.excluded_end)));
            let leased = range_len(d.pool_start, d.pool_end).saturating_sub(if hi >= lo { u64::from(hi - lo) + 1 } else { 0 });
            let access_ports = self.ports.iter().filter(|p| p.mode == PortMode::Access && p.vlan == Some(d.vlan)).count() as u64;
            if leased < access_ports {
                out.push(Finding::new(
                    rule,
                    Severity::Medium,
                    format!("{}: {} har bara {leased} lediga adresser men {access_ports} accessportar i VLAN {}", d.source, d.name, d.vlan),
                ));
            }
            if free < 5 {
                out.push(Finding::new(rule, Severity::Low, format!("{}: bara {free} adresser kvar att dela ut i {}", d.source, d.name)));
            }
        }
        for (i, a) in self.dhcp.iter().enumerate() {
            for b in &self.dhcp[i + 1..] {
                if a.network.overlaps(&b.network) {
                    out.push(Finding::new(
                        rule,
                        Severity::Critical,
                        format!("{} ({}) och {} ({}) överlappar", a.name, a.network, b.name, b.network),
                    ));
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
                    out.push(Finding::new(
                        rule,
                        Severity::High,
                        format!("{}: {} ligger inte i hanterings-VLAN:ets nät {}", dev.source, dev.mgmt_ip, m.network),
                    ));
                }
                if dev.gateway != m.gateway {
                    out.push(Finding::new(
                        rule,
                        Severity::Medium,
                        format!("{}: gatewayen {} är inte routerns {}", dev.source, dev.gateway, m.gateway),
                    ));
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

    const PORTS_HEAD: &str = "Switch,Port,Lage,Vlan_Id,Vlan_Namn,Tillatna_Vlan,Native_Vlan,Beskrivning,Status\n";

    fn ports(rows: &str) -> Inventory {
        Inventory::from_csv_texts(&[("ports.csv", &format!("{PORTS_HEAD}{rows}"))]).unwrap()
    }

    fn messages(inv: &Inventory) -> Vec<String> {
        inv.validate(999, 99).into_iter().map(|f| f.message).collect()
    }

    #[test]
    fn semicolon_and_case_insensitive_headers() {
        let text = "SWITCH;port;LAGE;vlan_id;Vlan_Namn;Tillatna_Vlan;native_vlan;BESKRIVNING;status\nSW1;Fa0/1;Access;10;KONTOR;10;999;Port mot PC;Nere\nSW1;Gi0/1;trunk;;;\"10;20\";999;Port mot SW2;Upp\n";
        let inv = Inventory::from_csv_texts(&[("ports.csv", text)]).unwrap();
        assert!(inv.problems.is_empty(), "{:?}", inv.problems);
        assert_eq!(inv.ports.len(), 2);
        assert_eq!(inv.ports[0].port, "FastEthernet0/1");
        assert!(!inv.ports[0].up);
        assert!(inv.ports[1].up);
        assert_eq!(inv.ports[1].allowed, vec![10, 20]);
        let dev = "HOSTNAME;mgmt_ip;MGMT_MASK;gateway;PLATS;modell\nSW1;10.0.0.2;255.255.255.0;10.0.0.1;Serverrum;C2960\n";
        let inv = Inventory::from_csv_texts(&[("devices.csv", dev)]).unwrap();
        assert_eq!(inv.devices[0].location, "Serverrum");
        assert_eq!(inv.devices[0].model, "C2960");
    }

    #[test]
    fn bom_and_missing_optional_columns() {
        let text = format!("\u{feff}{PORTS_HEAD}SW1,Fa0/1,access,10,KONTOR,10,999,x,Up\n");
        let inv = Inventory::from_csv_texts(&[("ports.csv", &text)]).unwrap();
        assert_eq!(inv.ports[0].voice_vlan, None);
        assert_eq!(inv.ports[0].port_security, None);
        let inv =
            Inventory::from_csv_texts(&[("devices.csv", "Hostname,Mgmt_IP,Mgmt_mask,Gateway\nSW1,10.0.0.2,255.255.255.0,10.0.0.1\n")])
                .unwrap();
        assert_eq!((inv.devices[0].location.as_str(), inv.devices[0].model.as_str()), ("", ""));
    }

    #[test]
    fn status_words() {
        for (word, up) in [
            ("Up", true),
            ("DOWN", false),
            ("upp", true),
            ("Nere", false),
            ("Ja", true),
            ("nej", false),
            ("On", true),
            ("off", false),
            ("", true),
        ] {
            let status = if word.is_empty() { None } else { parse_status(word) };
            assert_eq!(status.unwrap_or(true), up, "{word}");
        }
        assert_eq!(parse_status("kanske"), None);
        let inv = ports("SW1,Fa0/1,access,10,K,10,999,x,kanske\n");
        assert!(inv.ports[0].up);
        assert!(inv.problems.iter().any(|f| f.message.contains("okänd status 'kanske'")));
    }

    #[test]
    fn voice_vlan_and_port_security_columns() {
        let text = "Switch,Port,Lage,Vlan_Id,Vlan_Namn,Tillatna_Vlan,Native_Vlan,Beskrivning,Status,Voice_Vlan,Port_Security\nSW1,Fa0/1,access,10,K,10,999,x,Up,150,2\nSW1,Fa0/2,access,10,K,10,999,x,Up,,\nSW1,Fa0/3,access,10,K,10,999,x,Up,abc,0\n";
        let inv = Inventory::from_csv_texts(&[("ports.csv", text)]).unwrap();
        assert_eq!((inv.ports[0].voice_vlan, inv.ports[0].port_security), (Some(150), Some(2)));
        assert_eq!((inv.ports[1].voice_vlan, inv.ports[1].port_security), (None, None));
        assert_eq!((inv.ports[2].voice_vlan, inv.ports[2].port_security), (None, None));
        assert_eq!(inv.problems.len(), 2, "abc och 0 är inga giltiga värden: {:?}", inv.problems);
    }

    #[test]
    fn network_not_first_address_warns() {
        let dhcp = "vlan_id,pool_name,network,mask,pool_start,pool_end,excluded_start,excluded_end,gateway,dns\n10,K,192.168.1.5,255.255.255.192,192.168.1.1,192.168.1.62,192.168.1.1,192.168.1.10,192.168.1.1,8.8.8.8\n";
        let inv = Inventory::from_csv_texts(&[("dhcp.csv", dhcp)]).unwrap();
        assert!(messages(&inv).iter().any(|m| m.contains("192.168.1.5 är inte nätets första adress")
            && m.contains("192.168.1.0/26")
            && m.starts_with("dhcp.csv:2")));
        let ok = dhcp.replace("192.168.1.5,", "192.168.1.0,");
        let inv = Inventory::from_csv_texts(&[("dhcp.csv", &ok)]).unwrap();
        assert!(!messages(&inv).iter().any(|m| m.contains("första adress")));
    }

    #[test]
    fn hostnames_are_checked() {
        assert!(hostname_problem("SW-Nordvik-1").is_none());
        assert!(hostname_problem("SW Nordvik").unwrap().contains("otillåtna"));
        assert!(hostname_problem("SW_1").is_some());
        assert!(hostname_problem(&"A".repeat(64)).unwrap().contains("63"));
        assert!(hostname_problem("1SW").unwrap().contains("bokstav"));
        let inv = ports("Switch ett,Fa0/1,access,10,K,10,999,x,Up\nSwitch ett,Fa0/2,access,10,K,10,999,x,Up\n");
        let bad: Vec<String> = messages(&inv).into_iter().filter(|m| m.contains("otillåtna tecken")).collect();
        assert_eq!(bad.len(), 1, "en gång per enhet: {bad:?}");
        assert!(bad[0].starts_with("ports.csv:2"));
    }

    #[test]
    fn allowed_vlans_out_of_range() {
        let inv = ports(
            "SW1,Gi0/1,trunk,,,\"10,5000,0\",999,x,Up\nSW1,Gi0/2,trunk,,,\"4000-5000\",999,x,Up\nSW1,Gi0/3,trunk,,,\"10-20\",999,x,Up\n",
        );
        let bad: Vec<String> = messages(&inv).into_iter().filter(|m| m.contains("utanför 1–4094")).collect();
        assert_eq!(bad.len(), 2, "{bad:?}");
        assert!(bad[0].contains("5000") || bad[1].contains("5000"));
        assert!(bad.iter().any(|m| m.starts_with("ports.csv:3") && m.contains("5000")));
        // Ogiltiga värden följer inte med in i konfigen.
        assert_eq!(inv.ports[0].allowed, vec![10]);
        assert!(inv.ports.iter().all(|p| p.allowed.iter().all(|v| (1..=4094).contains(v))));
    }

    #[test]
    fn trunks_must_match_both_ways() {
        let inv = ports(concat!("SW1,Gi0/2,trunk,,,\"10,20\",999,Port mot SW2,Up\n", "SW2,Gi0/1,trunk,,,\"10,30\",888,Port mot SW1,Up\n",));
        let m = messages(&inv);
        let allowed: Vec<&String> = m.iter().filter(|m| m.contains("tillåter")).collect();
        assert_eq!(allowed.len(), 1, "{m:?}");
        assert!(allowed[0].starts_with("ports.csv:2") && allowed[0].contains("SW2") && allowed[0].contains("ports.csv:3"));
        assert_eq!(m.iter().filter(|m| m.contains("native-VLAN 999 på SW1 Gi0/2 skiljer sig")).count(), 1);
        // Likadana ändar ger inga fynd.
        let same = ports("SW1,Gi0/2,trunk,,,\"10,20\",999,Port mot SW2,Up\nSW2,Gi0/1,trunk,,,\"20,10\",999,Port mot SW1,Up\n");
        assert!(!messages(&same).iter().any(|m| m.contains("tillåter") || m.contains("skiljer sig")));
    }

    #[test]
    fn dhcp_pool_smaller_than_access_ports() {
        let dhcp = "vlan_id,pool_name,network,mask,pool_start,pool_end,excluded_start,excluded_end,gateway,dns\n10,K,10.0.0.0,255.255.255.0,10.0.0.1,10.0.0.12,10.0.0.1,10.0.0.10,10.0.0.1,8.8.8.8\n";
        let rows: String = (1..=4).map(|n| format!("SW1,Fa0/{n},access,10,K,10,999,x,Up\n")).collect();
        let inv = Inventory::from_csv_texts(&[("dhcp.csv", dhcp), ("ports.csv", &format!("{PORTS_HEAD}{rows}"))]).unwrap();
        let m = messages(&inv);
        assert!(m.iter().any(|m| m.starts_with("dhcp.csv:2") && m.contains("2 lediga adresser men 4 accessportar i VLAN 10")), "{m:?}");
        let rows: String = (1..=2).map(|n| format!("SW1,Fa0/{n},access,10,K,10,999,x,Up\n")).collect();
        let inv = Inventory::from_csv_texts(&[("dhcp.csv", dhcp), ("ports.csv", &format!("{PORTS_HEAD}{rows}"))]).unwrap();
        assert!(!messages(&inv).iter().any(|m| m.contains("lediga adresser men")));
    }

    #[test]
    fn voice_vlan_must_be_on_trunk() {
        let text = "Switch,Port,Lage,Vlan_Id,Vlan_Namn,Tillatna_Vlan,Native_Vlan,Beskrivning,Status,Voice_Vlan\nSW1,Gi0/1,trunk,,,\"10\",999,x,Up,\nSW1,Fa0/1,access,10,K,10,999,x,Up,150\n";
        let inv = Inventory::from_csv_texts(&[("ports.csv", text)]).unwrap();
        assert!(messages(&inv).iter().any(|m| m.contains("VLAN 150 används på accessportar men går inte på någon trunk")));
    }

    #[test]
    fn sample_files_have_no_new_warnings() {
        let inv = Inventory::from_csv_texts(&[
            ("ports.csv", include_str!("../samples/ports.csv")),
            ("dhcp.csv", include_str!("../samples/dhcp.csv")),
            ("devices.csv", include_str!("../samples/devices.csv")),
        ])
        .unwrap();
        let m = messages(&inv);
        for needle in ["otillåtna", "första adress", "lediga adresser men", "skiljer sig", "tillåter", "utanför 1–4094", "okänd status"]
        {
            assert!(!m.iter().any(|m| m.contains(needle)), "{needle}: {m:?}");
        }
    }
}
