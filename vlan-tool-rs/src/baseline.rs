//! Spara fynden från en körning (baslinje) och jämför en senare körning mot den, så att
//! man ser vad som är nytt och vad som är åtgärdat sedan sist.
//!
//! Fynd känns igen på [`Finding::id`] (enhet + regel + meddelande), inte på radnummer, så
//! en konfig där rader flyttat sig ger inga falska nya fynd.

use crate::audit::FleetReport;
use crate::finding::{Finding, Severity};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::Path;

/// Enhetsnamnet som används för fynd mellan enheter.
pub const CROSS_DEVICE: &str = "(nätet)";

/// Ett sparat fynd.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub device: String,
    pub rule: String,
    pub severity: Severity,
    pub message: String,
}

impl Entry {
    fn new(device: &str, f: &Finding) -> Self {
        Entry { id: f.id(device), device: device.to_string(), rule: f.rule.clone(), severity: f.severity, message: f.message.clone() }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Baseline {
    pub version: u32,
    /// Sekunder sedan 1970-01-01 när baslinjen sparades (0 om klockan saknas).
    pub created: u64,
    pub findings: Vec<Entry>,
}

/// Fynd och enhet i den ordning de visas i rapporten.
fn entries(fleet: &FleetReport) -> Vec<Entry> {
    let mut out: Vec<Entry> = fleet.devices.iter().flat_map(|d| d.findings().map(|f| Entry::new(&d.name, f))).collect();
    out.extend(fleet.cross.iter().map(|f| Entry::new(CROSS_DEVICE, f)));
    out
}

impl Baseline {
    /// Gör en baslinje av en körning.
    pub fn from_fleet(fleet: &FleetReport) -> Self {
        let created = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
        Baseline { version: 1, created, findings: entries(fleet) }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }

    pub fn from_json(text: &str) -> Result<Self> {
        serde_json::from_str(text).context("baslinjen är inte giltig JSON från vlantool")
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        std::fs::write(path, self.to_json() + "\n").with_context(|| format!("kunde inte skriva {}", path.display()))
    }

    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path).with_context(|| format!("kunde inte läsa {}", path.display()))?;
        Self::from_json(&text)
    }

    /// Jämför en körning mot den här baslinjen.
    pub fn compare(&self, fleet: &FleetReport) -> Comparison {
        // Samma id kan förekomma flera gånger; varje sparat fynd räknas bort högst en gång.
        let mut left: HashMap<&str, usize> = HashMap::new();
        for e in &self.findings {
            *left.entry(e.id.as_str()).or_default() += 1;
        }
        let mut new = Vec::new();
        let mut unchanged = 0;
        for e in entries(fleet) {
            match left.get_mut(e.id.as_str()) {
                Some(n) if *n > 0 => {
                    *n -= 1;
                    unchanged += 1;
                }
                _ => new.push(e),
            }
        }
        let mut fixed = Vec::new();
        for e in &self.findings {
            if let Some(n) = left.get_mut(e.id.as_str())
                && *n > 0
            {
                *n -= 1;
                fixed.push(e.clone());
            }
        }
        Comparison { new, fixed, unchanged }
    }
}

/// Skillnaden mellan en körning och en baslinje.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Comparison {
    /// Finns nu men fanns inte i baslinjen.
    pub new: Vec<Entry>,
    /// Fanns i baslinjen men är borta nu.
    pub fixed: Vec<Entry>,
    pub unchanged: usize,
}

impl Comparison {
    /// Finns det nya fynd på nivån `min` eller högre? (För `--fail-on` mot en baslinje.)
    pub fn has_new_at_least(&self, min: Severity) -> bool {
        self.new.iter().any(|e| e.severity >= min)
    }

    /// Läsbar text med nya och åtgärdade fynd.
    pub fn render(&self) -> String {
        let mut out = String::new();
        let _ = writeln!(out, "Mot baslinjen: {} nya, {} åtgärdade, {} oförändrade", self.new.len(), self.fixed.len(), self.unchanged);
        for (title, list, sign) in [("Nya fynd", &self.new, '+'), ("Åtgärdade fynd", &self.fixed, '-')] {
            if list.is_empty() {
                continue;
            }
            let _ = writeln!(out, "\n{title}:");
            let mut sorted: Vec<&Entry> = list.iter().collect();
            sorted.sort_by_key(|e| std::cmp::Reverse(e.severity));
            for e in sorted {
                let _ = writeln!(out, "  {sign} {:<8} {} {} – {}", e.severity.label(), e.device, e.rule, e.message);
            }
        }
        out
    }
}

/// Genväg: jämför en körning mot en baslinje.
pub fn compare(baseline: &Baseline, fleet: &FleetReport) -> Comparison {
    baseline.compare(fleet)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::audit_fleet;
    use crate::parser::Config;

    fn fleet(extra: &str) -> FleetReport {
        let text = format!(
            "hostname SW1\n!\nvlan 10\n name A\n!\ninterface Fa0/1\n switchport mode access\n switchport access vlan 10\n!\n{extra}"
        );
        audit_fleet(vec![Config::parse("sw1", "sw1.cfg", &text)], &[])
    }

    #[test]
    fn same_run_is_unchanged() {
        let f = fleet("");
        let b = Baseline::from_fleet(&f);
        assert!(!b.findings.is_empty());
        let c = b.compare(&f);
        assert!(c.new.is_empty() && c.fixed.is_empty());
        assert_eq!(c.unchanged, b.findings.len());
    }

    #[test]
    fn new_and_fixed_are_found() {
        let before = fleet("");
        let b = Baseline::from_fleet(&before);
        // Ny kommentar flyttar rader men ändrar inga fynd; ett ignorerat fynd räknas som åtgärdat.
        let after = fleet("! vlantool:ignore banner\n");
        let c = b.compare(&after);
        assert!(c.new.is_empty(), "{:?}", c.new);
        assert_eq!(c.fixed.len(), 1);
        assert_eq!(c.fixed[0].rule, "banner");
        // Åt andra hållet: bannern är ett nytt fynd.
        let c2 = Baseline::from_fleet(&after).compare(&before);
        assert_eq!(c2.new.len(), 1);
        assert!(c2.fixed.is_empty());
        assert!(c2.has_new_at_least(Severity::Info));
        assert!(!c2.has_new_at_least(Severity::Low));
        let text = c2.render();
        assert!(text.contains("1 nya, 0 åtgärdade"), "{text}");
        assert!(text.contains("Nya fynd:") && !text.contains("Åtgärdade fynd:"));
    }

    #[test]
    fn json_roundtrip_and_files() {
        let f = fleet("");
        let b = Baseline::from_fleet(&f);
        assert_eq!(Baseline::from_json(&b.to_json()).unwrap(), b);
        let path = std::env::temp_dir().join(format!("vlantool-baseline-test-{}.json", std::process::id()));
        b.save(&path).unwrap();
        let back = Baseline::load(&path).unwrap();
        let _ = std::fs::remove_file(&path);
        assert_eq!(back, b);
        assert!(Baseline::from_json("inte json").is_err());
        assert!(Baseline::load(&path).is_err());
    }

    #[test]
    fn duplicate_findings_are_matched_one_to_one() {
        let f = fleet("");
        let mut b = Baseline::from_fleet(&f);
        let first = b.findings[0].clone();
        b.findings.push(first.clone());
        let c = compare(&b, &f);
        assert_eq!(c.fixed, vec![first]);
    }
}
