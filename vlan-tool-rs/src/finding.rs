//! Ett fynd är ett problem som en regel eller valideringen hittade.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, clap::ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

impl Severity {
    pub const ALL: [Severity; 5] = [Severity::Critical, Severity::High, Severity::Medium, Severity::Low, Severity::Info];

    pub fn label(self) -> &'static str {
        match self {
            Severity::Info => "INFO",
            Severity::Low => "LÅG",
            Severity::Medium => "MEDEL",
            Severity::High => "HÖG",
            Severity::Critical => "KRITISK",
        }
    }

    /// Hur många poäng ett fynd drar av från enhetens betyg (max 100).
    pub fn penalty(self) -> u32 {
        match self {
            Severity::Info => 0,
            Severity::Low => 2,
            Severity::Medium => 5,
            Severity::High => 10,
            Severity::Critical => 25,
        }
    }

    /// Tolkar svenska och engelska namn utan hänsyn till gemener/versaler:
    /// "kritisk"/"critical", "hög"/"high", "medel"/"medium", "låg"/"low", "info"/"information".
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(text: &str) -> Option<Severity> {
        match text.trim().to_lowercase().as_str() {
            "critical" | "kritisk" | "krit" => Some(Severity::Critical),
            "high" | "hög" | "hog" => Some(Severity::High),
            "medium" | "medel" | "med" => Some(Severity::Medium),
            "low" | "låg" | "lag" => Some(Severity::Low),
            "info" | "information" => Some(Severity::Info),
            _ => None,
        }
    }

    pub fn rgb(self) -> (u8, u8, u8) {
        match self {
            Severity::Info => (120, 160, 200),
            Severity::Low => (110, 200, 140),
            Severity::Medium => (240, 200, 80),
            Severity::High => (245, 140, 60),
            Severity::Critical => (240, 70, 90),
        }
    }

    pub fn icon(self) -> &'static str {
        match self {
            Severity::Info => "ℹ",
            Severity::Low => "▪",
            Severity::Medium => "▲",
            Severity::High => "◆",
            Severity::Critical => "✖",
        }
    }
}

impl std::str::FromStr for Severity {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        Severity::from_str(text).ok_or_else(|| format!("okänd allvarlighetsgrad: {text}"))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Finding {
    pub rule: String,
    pub severity: Severity,
    pub message: String,
    /// Radnummer i konfig- eller CSV-filen (1-baserat), om det går att peka ut.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
    /// IOS-rader som rättar till problemet.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub fix: Vec<String>,
}

impl Finding {
    pub fn new(rule: &str, severity: Severity, message: impl Into<String>) -> Self {
        Finding { rule: rule.to_string(), severity, message: message.into(), line: None, fix: Vec::new() }
    }

    pub fn at(mut self, line: usize) -> Self {
        self.line = Some(line);
        self
    }

    pub fn fix<I, S>(mut self, lines: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.fix = lines.into_iter().map(Into::into).collect();
        self
    }

    /// Stabilt id (16 hex-tecken) av enhet, regel och meddelande. Samma fynd på samma
    /// enhet ger samma id mellan körningar, oavsett radnummer, så att fynd går att jämföra.
    pub fn id(&self, device: &str) -> String {
        // FNV-1a: till skillnad från DefaultHasher är den fast mellan Rust-versioner.
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for part in [device, &self.rule, &self.message] {
            for b in part.bytes().chain(std::iter::once(0)) {
                h ^= u64::from(b);
                h = h.wrapping_mul(0x0100_0000_01b3);
            }
        }
        format!("{h:016x}")
    }
}

/// Största avdrag en enskild regel kan ge. Annars nollar en regel med många fynd (t.ex. en
/// beskrivning som saknas på varje port) hela enheten.
pub const MAX_RULE_PENALTY: u32 = 25;

/// Betyg 0–100 utifrån fynden. Avdraget räknas per regel och är högst [`MAX_RULE_PENALTY`].
pub fn score(findings: &[Finding]) -> u32 {
    let mut per_rule: std::collections::BTreeMap<&str, u32> = std::collections::BTreeMap::new();
    for f in findings {
        *per_rule.entry(f.rule.as_str()).or_default() += f.severity.penalty();
    }
    100u32.saturating_sub(per_rule.values().map(|p| (*p).min(MAX_RULE_PENALTY)).sum())
}

pub fn grade(score: u32) -> &'static str {
    match score {
        95..=100 => "A",
        85..=94 => "B",
        70..=84 => "C",
        50..=69 => "D",
        _ => "F",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn severity_names_in_both_languages() {
        for (text, sev) in [
            ("kritisk", Severity::Critical),
            ("CRITICAL", Severity::Critical),
            ("Hög", Severity::High),
            ("high", Severity::High),
            ("medel", Severity::Medium),
            (" medium ", Severity::Medium),
            ("låg", Severity::Low),
            ("low", Severity::Low),
            ("info", Severity::Info),
        ] {
            assert_eq!(Severity::from_str(text), Some(sev), "{text}");
            assert_eq!(text.parse::<Severity>().ok(), Some(sev));
        }
        assert_eq!(Severity::from_str("hmm"), None);
        assert!("hmm".parse::<Severity>().is_err());
    }

    #[test]
    fn finding_id_is_stable_and_ignores_line() {
        let a = Finding::new("ssh", Severity::High, "SSH saknas");
        assert_eq!(a.id("SW1"), Finding::new("ssh", Severity::High, "SSH saknas").at(12).id("SW1"));
        assert_eq!(a.id("SW1").len(), 16);
        assert_ne!(a.id("SW1"), a.id("SW2"));
        assert_ne!(a.id("SW1"), Finding::new("ssh", Severity::High, "SSH saknas!").id("SW1"));
        assert_ne!(a.id("SW1"), Finding::new("telnet", Severity::High, "SSH saknas").id("SW1"));
        // Fast värde så att sparade baslinjer fortsätter fungera mellan versioner.
        assert_eq!(a.id("SW1"), "516414f37a101c6d");
    }

    #[test]
    fn penalty_per_rule_is_capped() {
        let many: Vec<Finding> = (0..20).map(|i| Finding::new("description", Severity::Medium, format!("port {i}"))).collect();
        assert_eq!(score(&many), 75);
        let mut mixed = many.clone();
        mixed.push(Finding::new("ssh", Severity::High, "x"));
        assert_eq!(score(&mixed), 65);
        assert_eq!(score(&[]), 100);
        let crit: Vec<Finding> = (0..8).map(|i| Finding::new(&format!("r{i}"), Severity::Critical, "x")).collect();
        assert_eq!(score(&crit), 0);
    }
}
