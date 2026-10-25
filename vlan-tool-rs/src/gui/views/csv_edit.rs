//! Redigerbara CSV-tabeller: läser och skriver ports.csv, dhcp.csv och devices.csv själva
//! (med `csv`-craten) och behåller rubrikernas ordning och namn exakt. Ingen fönsterkod här.

use anyhow::{Context, Result};
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use vlantool::net::Subnet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TableKind {
    Ports,
    Dhcp,
    Devices,
}

impl TableKind {
    pub fn label(self) -> &'static str {
        match self {
            TableKind::Ports => "Portar",
            TableKind::Dhcp => "DHCP",
            TableKind::Devices => "Enheter",
        }
    }

    /// Vilken sorts fil det är avgörs av rubrikraden, precis som i biblioteket.
    pub fn detect(headers: &[String]) -> Option<TableKind> {
        let has = |name: &str| headers.iter().any(|h| h.trim().eq_ignore_ascii_case(name));
        if has("Switch") {
            Some(TableKind::Ports)
        } else if has("pool_name") {
            Some(TableKind::Dhcp)
        } else if has("Mgmt_IP") {
            Some(TableKind::Devices)
        } else {
            None
        }
    }
}

/// Rubrikerna i en ny dhcp.csv, i samma ordning som exempelfilen.
pub(crate) const DHCP_HEADERS: [&str; 10] =
    ["vlan_id", "pool_name", "network", "mask", "pool_start", "pool_end", "excluded_start", "excluded_end", "gateway", "dns"];

#[derive(Debug, Clone)]
pub(crate) struct CsvTable {
    pub path: PathBuf,
    pub kind: TableKind,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    delimiter: u8,
    bom: bool,
    crlf: bool,
    /// Raderna som de såg ut på disk, för att veta om något ändrats.
    saved: Vec<Vec<String>>,
}

fn detect_delimiter(first_line: &str) -> u8 {
    if first_line.matches(';').count() > first_line.matches(',').count() { b';' } else { b',' }
}

impl CsvTable {
    /// Läser filen. `None` om den inte är någon av de tre kända sorterna.
    pub fn read(path: &Path) -> Result<Option<CsvTable>> {
        let bytes = std::fs::read(path).with_context(|| format!("kunde inte läsa {}", path.display()))?;
        let bom = bytes.starts_with(&[0xEF, 0xBB, 0xBF]);
        let text = String::from_utf8_lossy(if bom { &bytes[3..] } else { &bytes[..] }).into_owned();
        let first = text.lines().next().unwrap_or("");
        let delimiter = detect_delimiter(first);
        let crlf = first.len() < text.split('\n').next().map_or(0, str::len);
        let mut reader =
            ::csv::ReaderBuilder::new().delimiter(delimiter).flexible(true).trim(::csv::Trim::Fields).from_reader(text.as_bytes());
        let headers: Vec<String> = reader
            .headers()
            .with_context(|| format!("{}: rubrikraden går inte att läsa", path.display()))?
            .iter()
            .map(str::to_string)
            .collect();
        let Some(kind) = TableKind::detect(&headers) else { return Ok(None) };
        let mut rows = Vec::new();
        for (i, record) in reader.records().enumerate() {
            let record = record.with_context(|| format!("{}: rad {} går inte att läsa", path.display(), i + 2))?;
            let mut row: Vec<String> = record.iter().map(str::to_string).collect();
            if row.len() < headers.len() {
                row.resize(headers.len(), String::new());
            }
            rows.push(row);
        }
        Ok(Some(CsvTable { path: path.to_path_buf(), kind, headers, saved: rows.clone(), rows, delimiter, bom, crlf }))
    }

    /// En tom tabell med givna rubriker (för en dhcp.csv som inte finns än).
    pub fn new(path: PathBuf, kind: TableKind, headers: Vec<String>) -> CsvTable {
        CsvTable { path, kind, headers, rows: Vec::new(), delimiter: b',', bom: false, crlf: false, saved: Vec::new() }
    }

    pub fn file_name(&self) -> String {
        self.path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()
    }

    pub fn dirty(&self) -> bool {
        self.rows != self.saved
    }

    /// Kolumnnumret för en rubrik (utan hänsyn till versaler).
    pub fn col(&self, name: &str) -> Option<usize> {
        self.headers.iter().position(|h| h.trim().eq_ignore_ascii_case(name))
    }

    /// En ny rad som liknar den sista: samma switch och native-VLAN, läge access och status Up.
    pub fn blank_row(&self) -> Vec<String> {
        let mut row = vec![String::new(); self.headers.len()];
        if self.kind == TableKind::Ports {
            let last = self.rows.last();
            for (c, h) in self.headers.iter().enumerate() {
                match h.trim().to_ascii_lowercase().as_str() {
                    "lage" | "läge" => row[c] = "access".into(),
                    "status" => row[c] = "Up".into(),
                    "switch" | "native_vlan" => row[c] = last.and_then(|l| l.get(c)).cloned().unwrap_or_default(),
                    _ => {}
                }
            }
        }
        row
    }

    /// Texten som skrivs till filen: rubrikerna först, helt tomma rader hoppas över.
    pub fn render(&self) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        if self.bom {
            out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
        }
        let mut w = ::csv::WriterBuilder::new()
            .delimiter(self.delimiter)
            .flexible(true)
            .terminator(if self.crlf { ::csv::Terminator::CRLF } else { ::csv::Terminator::Any(b'\n') })
            .from_writer(&mut out);
        w.write_record(&self.headers)?;
        for row in self.rows.iter().filter(|r| r.iter().any(|c| !c.trim().is_empty())) {
            w.write_record(row.iter().map(|c| c.trim()))?;
        }
        w.flush()?;
        drop(w);
        Ok(out)
    }

    pub fn save(&mut self) -> Result<()> {
        let bytes = self.render()?;
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(&self.path, bytes).with_context(|| format!("kunde inte skriva {}", self.path.display()))?;
        self.rows.retain(|r| r.iter().any(|c| !c.trim().is_empty()));
        for r in &mut self.rows {
            r.iter_mut().for_each(|c| *c = c.trim().to_string());
        }
        self.saved = self.rows.clone();
        Ok(())
    }

    pub fn revert(&mut self) {
        self.rows = self.saved.clone();
    }
}

/// Alla kända CSV-tabeller i mappen, sorterade på filnamn.
pub(crate) fn load_all(dir: &Path) -> Vec<CsvTable> {
    let Ok(rd) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut paths: Vec<PathBuf> =
        rd.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("csv"))).collect();
    paths.sort();
    paths.iter().filter_map(|p| CsvTable::read(p).ok().flatten()).collect()
}

/// Ändringstiderna för CSV-filerna: ändras de har något skrivit till dem utanför programmet.
pub(crate) fn stamp(dir: &Path) -> Vec<(PathBuf, Option<SystemTime>)> {
    let Ok(rd) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut v: Vec<_> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("csv")))
        .map(|p| {
            let t = std::fs::metadata(&p).and_then(|m| m.modified()).ok();
            (p, t)
        })
        .collect();
    v.sort();
    v
}

/// "ports.csv:5: …" -> ("ports.csv", 5). Radnumret är radens plats i filen (rubriken är rad 1).
pub(crate) fn parse_source(message: &str) -> Option<(&str, usize)> {
    let (file, rest) = message.split_once(':')?;
    let (line, _) = rest.split_once(':')?;
    let line: usize = line.trim().parse().ok()?;
    (!file.is_empty() && !file.contains(' ') && line >= 2).then_some((file, line))
}

/// En rad i VLSM-planen som ska bli en DHCP-pool.
pub(crate) struct PlanPool {
    pub name: String,
    pub vlan: u16,
    pub subnet: Subnet,
}

fn add(ip: Ipv4Addr, n: u32) -> Ipv4Addr {
    Ipv4Addr::from(u32::from(ip).wrapping_add(n))
}

/// Gör poolerna till rader i given rubrikordning. Gatewayen är första värdadressen och
/// undantas tillsammans med några adresser till; resten delas ut.
pub(crate) fn dhcp_rows(headers: &[String], pools: &[PlanPool], dns: Ipv4Addr) -> Vec<Vec<String>> {
    pools
        .iter()
        .map(|p| {
            let s = p.subnet;
            let first = s.first_host();
            let reserved = (s.usable_hosts() / 2).clamp(1, 10) as u32;
            headers
                .iter()
                .map(|h| match h.trim().to_ascii_lowercase().as_str() {
                    "vlan_id" => p.vlan.to_string(),
                    "pool_name" => p.name.clone(),
                    "network" => s.network.to_string(),
                    "mask" => s.mask().to_string(),
                    "pool_start" | "excluded_start" | "gateway" => first.to_string(),
                    "pool_end" => s.last_host().to_string(),
                    "excluded_end" => add(first, reserved - 1).to_string(),
                    "dns" => dns.to_string(),
                    _ => String::new(),
                })
                .collect()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vlantool-csvedit-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn round_trip_keeps_headers_and_extra_columns() {
        let dir = tmp("rt");
        let path = dir.join("ports.csv");
        let src = "Switch,Port,Lage,Vlan_Id,Vlan_Namn,Tillatna_Vlan,Native_Vlan,Beskrivning,Status,Voice_Vlan\n\
                   SW-1,Gi0/1,trunk,Trunk,Trunk,\"10,20\",999,Port mot R-1,Up,\n\
                   SW-1,Fa0/1,access,10,KONTOR,10,999,\"Dator, kontor\",Up,50\n";
        std::fs::write(&path, src).unwrap();
        let mut t = CsvTable::read(&path).unwrap().unwrap();
        assert_eq!(t.kind, TableKind::Ports);
        assert_eq!(t.rows.len(), 2);
        assert!(!t.dirty());
        t.save().unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), src, "oförändrad tabell ska ge identisk fil");

        t.rows[1][7] = "Port mot AP".into();
        let blank = t.blank_row();
        t.rows.push(blank);
        assert!(t.dirty());
        t.rows.push(vec![String::new(); t.headers.len()]);
        t.save().unwrap();
        let again = CsvTable::read(&path).unwrap().unwrap();
        assert_eq!(again.headers, t.headers, "rubrikerna ska vara oförändrade");
        assert_eq!(again.rows.len(), 3, "tomma rader skrivs inte");
        assert_eq!(again.rows[1][7], "Port mot AP");
        assert_eq!(again.rows[1][9], "50", "okända kolumner följer med");
        assert_eq!(again.rows[2][2], "access");
        assert_eq!(again.rows[2][0], "SW-1");
        // Biblioteket ska fortfarande kunna läsa filen.
        let inv = vlantool::inventory::Inventory::load_dir(&dir).unwrap();
        assert_eq!(inv.ports.len(), 2, "den nya raden saknar port och ska avvisas av valideringen");
        assert_eq!(inv.problems.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn semicolon_bom_and_crlf_are_kept() {
        let dir = tmp("semi");
        let path = dir.join("devices.csv");
        let src = "\u{feff}Hostname;Mgmt_IP;Mgmt_mask;Gateway\r\nSW-1;192.168.1.2;255.255.255.0;192.168.1.1\r\n";
        std::fs::write(&path, src).unwrap();
        let mut t = CsvTable::read(&path).unwrap().unwrap();
        assert_eq!(t.kind, TableKind::Devices);
        t.rows[0][1] = "192.168.1.3".into();
        t.save().unwrap();
        let out = std::fs::read_to_string(&path).unwrap();
        assert_eq!(out, src.replace("1.2;", "1.3;"));
        t.revert();
        assert!(!t.dirty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn source_of_a_finding() {
        assert_eq!(parse_source("ports.csv:5: Gi0/1 finns redan på ports.csv:3"), Some(("ports.csv", 5)));
        assert_eq!(parse_source("dhcp.csv:2: pool_start är efter pool_end"), Some(("dhcp.csv", 2)));
        assert_eq!(parse_source("Native-VLAN skiljer: a har 1 men b har 2"), None);
        assert_eq!(parse_source("fil.csv:x: fel"), None);
    }

    #[test]
    fn vlsm_plan_becomes_dhcp_rows() {
        let headers: Vec<String> = DHCP_HEADERS.iter().map(|h| h.to_string()).collect();
        let pools = [
            PlanPool { name: "KONTOR".into(), vlan: 10, subnet: Subnet::parse("192.168.1.0/26").unwrap() },
            PlanPool { name: "DRIFT".into(), vlan: 99, subnet: Subnet::parse("192.168.1.64/28").unwrap() },
        ];
        let rows = dhcp_rows(&headers, &pools, "8.8.8.8".parse().unwrap());
        assert_eq!(
            rows[0],
            [
                "10",
                "KONTOR",
                "192.168.1.0",
                "255.255.255.192",
                "192.168.1.1",
                "192.168.1.62",
                "192.168.1.1",
                "192.168.1.10",
                "192.168.1.1",
                "8.8.8.8"
            ]
        );
        assert_eq!(rows[1][8], "192.168.1.65");
        assert_eq!(rows[1][5], "192.168.1.78");

        // Skrivs till en fil och läses tillbaka av biblioteket utan fel.
        let dir = tmp("plan");
        let mut t = CsvTable::new(dir.join("dhcp.csv"), TableKind::Dhcp, headers);
        t.rows = rows;
        t.save().unwrap();
        let inv = vlantool::inventory::Inventory::load_dir(&dir).unwrap();
        assert_eq!(inv.dhcp.len(), 2);
        assert!(inv.problems.is_empty());
        assert_eq!(inv.dhcp[1].network.to_string(), "192.168.1.64/28");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn vlsm_rows_keep_reordered_headers() {
        let headers: Vec<String> = [
            "pool_name",
            "vlan_id",
            "dns",
            "network",
            "mask",
            "pool_start",
            "pool_end",
            "excluded_start",
            "excluded_end",
            "gateway",
            "kommentar",
        ]
        .map(String::from)
        .to_vec();
        let pools = [PlanPool { name: "A".into(), vlan: 5, subnet: Subnet::parse("10.0.0.0/30").unwrap() }];
        let rows = dhcp_rows(&headers, &pools, "1.1.1.1".parse().unwrap());
        assert_eq!(rows[0][0], "A");
        assert_eq!(rows[0][1], "5");
        assert_eq!(rows[0][2], "1.1.1.1");
        assert_eq!(rows[0][10], "");
        assert_eq!(rows[0][8], "10.0.0.1", "en /30 undantar bara gatewayen");
    }
}
