//! Ett fynd är ett problem som en regel eller valideringen hittade.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, clap::ValueEnum)]
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
}

/// Betyg 0–100 utifrån fynden.
pub fn score(findings: &[Finding]) -> u32 {
    100u32.saturating_sub(findings.iter().map(|f| f.severity.penalty()).sum())
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
