//! Gör läsbara rapporter av granskningen: terminal (med färg), text, Markdown,
//! JSON, CSV och en fristående HTML-sida.

use crate::audit::{DeviceReport, FleetReport, CROSS_CATEGORY};
use crate::finding::{Finding, Severity};
use serde_json::json;
use owo_colors::OwoColorize;
use std::fmt::Write as _;

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum Format {
    Terminal,
    Text,
    Markdown,
    Json,
    Csv,
    Html,
    /// SARIF 2.1.0 (GitHub code scanning m.fl.).
    Sarif,
    /// JUnit-XML för CI-system.
    Junit,
}

#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub color: bool,
    /// Visa även godkända regler.
    pub verbose: bool,
    pub fixes: bool,
    pub min: Severity,
}

pub fn render(fleet: &FleetReport, format: Format, opt: Options) -> String {
    match format {
        Format::Terminal => terminal(fleet, opt),
        Format::Text => terminal_with_width(fleet, Options { color: false, ..opt }, None),
        Format::Markdown => markdown(fleet, opt),
        Format::Json => serde_json::to_string_pretty(fleet).unwrap_or_default(),
        Format::Csv => csv(fleet),
        Format::Html => html(fleet),
        Format::Sarif => sarif(fleet, opt),
        Format::Junit => junit(fleet, opt),
    }
}

/// En mening som sammanfattar läget, t.ex. "Nätet får 87/100 (B): 3 enheter, 12 fynd
/// (1 kritiskt, 2 höga …); lägst betyg har SW1 (45/100)."
pub fn summary_text(fleet: &FleetReport) -> String {
    if fleet.devices.is_empty() {
        return "Inga enheter granskades.".to_string();
    }
    let total = fleet.all_findings().count();
    let mut s = format!("Nätet får {}/100 ({}): {} enheter", fleet.score, fleet.grade, fleet.devices.len());
    if total == 0 {
        s.push_str(" och inga fynd");
    } else {
        let parts: Vec<String> = Severity::ALL
            .iter()
            .filter_map(|&sev| {
                let n = fleet.count(sev);
                let word = match sev {
                    Severity::Critical => "kritiska",
                    Severity::High => "höga",
                    Severity::Medium => "medel",
                    Severity::Low => "låga",
                    Severity::Info => "info",
                };
                (n > 0).then(|| format!("{n} {word}"))
            })
            .collect();
        let _ = write!(s, ", {total} fynd ({})", parts.join(", "));
        if let Some(worst) = fleet.devices.iter().min_by_key(|d| d.score)
            && fleet.devices.len() > 1
            && worst.score < 100
        {
            let _ = write!(s, "; lägst betyg har {} ({}/100)", worst.name, worst.score);
        }
    }
    s.push('.');
    s
}

/// Terminalens bredd om utdata går till en terminal (eller `COLUMNS` är satt), annars None
/// så att filer och pipes inte radbryts.
pub fn terminal_width() -> Option<usize> {
    use std::io::IsTerminal;
    if let Some(w) = std::env::var("COLUMNS").ok().and_then(|c| c.trim().parse::<usize>().ok()).filter(|w| *w > 0) {
        return Some(w);
    }
    if std::io::stdout().is_terminal() {
        return crossterm::terminal::size().ok().map(|(w, _)| w as usize).filter(|w| *w > 0);
    }
    None
}

/// Radbryter vid blanksteg så att ingen rad blir längre än `width` tecken (ett ord som är
/// längre än så behålls helt).
fn wrap(text: &str, width: usize) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut cur = String::new();
    for word in text.split_whitespace() {
        let (have, add) = (cur.chars().count(), word.chars().count());
        if have > 0 && have + 1 + add > width {
            lines.push(std::mem::take(&mut cur));
        }
        if !cur.is_empty() {
            cur.push(' ');
        }
        cur.push_str(word);
    }
    if !cur.is_empty() || lines.is_empty() {
        lines.push(cur);
    }
    lines
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

/// Färglägger bara när det är påslaget, så samma kod ger även textfilen.
#[derive(Clone, Copy)]
pub struct Paint(pub bool);

impl Paint {
    pub fn rgb(self, s: &str, (r, g, b): (u8, u8, u8)) -> String {
        if self.0 { s.truecolor(r, g, b).to_string() } else { s.to_string() }
    }
    pub fn bold(self, s: &str) -> String {
        if self.0 { s.bold().to_string() } else { s.to_string() }
    }
    pub fn dim(self, s: &str) -> String {
        if self.0 { s.truecolor(130, 138, 156).to_string() } else { s.to_string() }
    }
    pub fn sev(self, s: &str, sev: Severity) -> String {
        self.rgb(s, sev.rgb())
    }
    pub fn ok(self, s: &str) -> String {
        self.rgb(s, (110, 210, 140))
    }
    pub fn accent(self, s: &str) -> String {
        self.rgb(s, (120, 170, 255))
    }
}

pub fn score_rgb(score: u32) -> (u8, u8, u8) {
    match score {
        90..=100 => (110, 210, 140),
        75..=89 => (190, 210, 90),
        50..=74 => (240, 190, 70),
        _ => (240, 80, 90),
    }
}

pub fn bar(score: u32, width: usize) -> (String, String) {
    let filled = (score as usize * width).div_ceil(100).min(width);
    ("█".repeat(filled), "░".repeat(width - filled))
}

fn pad(s: &str, width: usize) -> String {
    let len = s.chars().count();
    if len >= width { s.to_string() } else { format!("{s}{}", " ".repeat(width - len)) }
}

/// Bredden på kolumnerna före meddelandet i `finding_lines`.
const MSG_INDENT: usize = 26;

fn finding_lines(p: Paint, f: &Finding, opt: Options, width: Option<usize>, out: &mut String) {
    let line = f.line.map(|l| format!("rad {l}")).unwrap_or_default();
    let msg = match width {
        Some(w) => wrap(&f.message, w.saturating_sub(MSG_INDENT).max(30)),
        None => vec![f.message.clone()],
    };
    let _ = writeln!(
        out,
        "      {} {} {}",
        p.sev(&pad(&format!("{} {}", f.severity.icon(), f.severity.label()), 10), f.severity),
        p.dim(&pad(&line, 8)),
        msg[0]
    );
    for more in &msg[1..] {
        let _ = writeln!(out, "{:MSG_INDENT$}{more}", "");
    }
    if opt.fixes && !f.fix.is_empty() {
        for (n, l) in f.fix.iter().enumerate().take(6) {
            let arrow = if n == 0 { "↳" } else { " " };
            let _ = writeln!(out, "      {:20}{} {}", "", p.dim(arrow), p.accent(l));
        }
        if f.fix.len() > 6 {
            let _ = writeln!(out, "      {:20}  {}", "", p.dim(&format!("… +{} rader (se `vlantool fix`)", f.fix.len() - 6)));
        }
    }
}

fn device_terminal(d: &DeviceReport, opt: Options, term: Option<usize>, out: &mut String) {
    let p = Paint(opt.color);
    let width = 72;
    let mut title = format!(" {}  ·  {}  ·  {}", d.name, d.kind, d.path);
    if title.chars().count() > width {
        // Korta sökvägen från vänster så att rutan inte går sönder.
        let keep: String = d.path.chars().rev().take(width.saturating_sub(d.name.chars().count() + d.kind.len() + 12)).collect();
        title = format!(" {}  ·  {}  ·  …{}", d.name, d.kind, keep.chars().rev().collect::<String>());
    }
    let _ = writeln!(out, "{}", p.dim(&format!("╭{}╮", "─".repeat(width))));
    let _ = writeln!(out, "{}{}{}", p.dim("│"), p.bold(&pad(&title, width)), p.dim("│"));
    let (full, empty) = bar(d.score, 30);
    let score = format!("{:>3}/100  {}", d.score, d.grade);
    let plain = format!(" Betyg  {full}{empty}  {score}");
    let _ = writeln!(
        out,
        "{} Betyg  {}{}  {}{}{}",
        p.dim("│"),
        p.rgb(&full, score_rgb(d.score)),
        p.dim(&empty),
        p.bold(&p.rgb(&score, score_rgb(d.score))),
        " ".repeat(width.saturating_sub(plain.chars().count())),
        p.dim("│")
    );
    let _ = writeln!(out, "{}", p.dim(&format!("╰{}╯", "─".repeat(width))));

    for r in &d.results {
        let shown: Vec<&Finding> = r.findings.iter().filter(|f| f.severity >= opt.min).collect();
        if shown.is_empty() {
            if opt.verbose {
                let _ = writeln!(out, "  {} {} {}", p.ok("✔"), p.dim(&pad(r.id, 15)), p.dim(r.title));
                why_lines(p, r.why, term, out);
            }
            continue;
        }
        let worst = shown.iter().map(|f| f.severity).max().unwrap();
        let _ = writeln!(out, "  {} {} {}", p.sev(worst.icon(), worst), p.bold(&pad(r.id, 15)), r.title);
        if opt.verbose {
            why_lines(p, r.why, term, out);
        }
        for f in shown {
            finding_lines(p, f, opt, term, out);
        }
    }
    let _ = writeln!(out, "\n  {}  {}\n", p.bold(&format!("{}/{} regler godkända", d.passed(), d.results.len())), counts_line(p, |s| d.count(s)));
}

/// Regelns förklaring, dämpad och indragen under regelraden (bara i utförligt läge).
fn why_lines(p: Paint, why: &str, width: Option<usize>, out: &mut String) {
    if why.is_empty() {
        return;
    }
    let lines = match width {
        Some(w) => wrap(why, w.saturating_sub(6).max(30)),
        None => vec![why.to_string()],
    };
    for l in lines {
        let _ = writeln!(out, "      {}", p.dim(&l));
    }
}

fn counts_line(p: Paint, count: impl Fn(Severity) -> usize) -> String {
    Severity::ALL
        .iter()
        .filter_map(|&s| {
            let n = count(s);
            (n > 0).then(|| p.sev(&format!("{} {n} {}", s.icon(), s.label().to_lowercase()), s))
        })
        .collect::<Vec<_>>()
        .join(p.dim("  ·  ").as_str())
}

pub fn terminal(fleet: &FleetReport, opt: Options) -> String {
    terminal_with_width(fleet, opt, terminal_width())
}

/// Som [`terminal`] men med given bredd; långa meddelanden radbryts om bredden är satt.
pub fn terminal_with_width(fleet: &FleetReport, opt: Options, width: Option<usize>) -> String {
    let p = Paint(opt.color);
    let mut out = String::new();
    for d in &fleet.devices {
        device_terminal(d, opt, width, &mut out);
    }

    if !fleet.cross.is_empty() || !fleet.links.is_empty() {
        let _ = writeln!(out, "{}", p.bold("  Mellan enheterna"));
        let _ = writeln!(out, "  {}", p.dim(&"─".repeat(72)));
        for l in fleet.links.iter().filter(|l| l.b_port.is_some()) {
            let _ = writeln!(
                out,
                "  {} {} {} {}   {}",
                p.accent("⇄"),
                pad(&format!("{} {}", l.a, l.a_port), 24),
                p.dim("──"),
                pad(&format!("{} {}", l.b, l.b_port.as_deref().unwrap_or("")), 24),
                p.dim(&l.vlans)
            );
        }
        let shown: Vec<&Finding> = fleet.cross.iter().filter(|f| f.severity >= opt.min).collect();
        if shown.is_empty() {
            let _ = writeln!(out, "  {} Alla länkar och adresser stämmer överens", p.ok("✔"));
        }
        for f in shown {
            finding_lines(p, f, opt, width, &mut out);
        }
        out.push('\n');
    }

    if fleet.devices.len() > 1 {
        summary_table(fleet, p, &mut out);
    }
    out
}

fn summary_table(fleet: &FleetReport, p: Paint, out: &mut String) {
    let _ = writeln!(out, "{}", p.bold("  Sammanfattning"));
    let _ = writeln!(out, "  {}", p.dim(&"─".repeat(72)));
    let _ = writeln!(
        out,
        "  {}",
        p.dim(&format!("{}{}{}{}", pad("Enhet", 18), pad("Typ", 9), pad("Betyg", 22), "K  H  M  L  I"))
    );
    for d in &fleet.devices {
        let (full, empty) = bar(d.score, 14);
        let nums: Vec<String> = Severity::ALL
            .iter()
            .map(|&s| {
                let n = d.count(s);
                let t = pad(&n.to_string(), 2);
                if n == 0 { p.dim(&t) } else { p.sev(&t, s) }
            })
            .collect();
        let _ = writeln!(
            out,
            "  {}{}{}{} {}  {}",
            p.bold(&pad(&d.name, 18)),
            pad(d.kind, 9),
            p.rgb(&full, score_rgb(d.score)),
            p.dim(&empty),
            p.rgb(&format!("{:>3} {}", d.score, d.grade), score_rgb(d.score)),
            nums.join(" ")
        );
    }
    let (full, empty) = bar(fleet.score, 14);
    let _ = writeln!(out, "  {}", p.dim(&"─".repeat(72)));
    let _ = writeln!(
        out,
        "  {}{}{}{} {}  {}\n",
        p.bold(&pad("Hela nätet", 18)),
        pad(&format!("{} st", fleet.devices.len()), 9),
        p.rgb(&full, score_rgb(fleet.score)),
        p.dim(&empty),
        p.bold(&p.rgb(&format!("{:>3} {}", fleet.score, fleet.grade), score_rgb(fleet.score))),
        counts_line(p, |s| fleet.count(s))
    );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/// Ankaret GitHub ger en rubrik: gemener, bara bokstäver/siffror/bindestreck/understreck,
/// blanksteg blir bindestreck.
fn slug(heading: &str) -> String {
    heading
        .to_lowercase()
        .chars()
        .filter_map(|c| match c {
            ' ' => Some('-'),
            '-' | '_' => Some(c),
            c if c.is_alphanumeric() => Some(c),
            _ => None,
        })
        .collect()
}

pub fn markdown(fleet: &FleetReport, opt: Options) -> String {
    let mut out = String::from("# Granskningsrapport\n\n");
    let _ = writeln!(out, "**Hela nätet: {}/100 ({})** – {} enheter\n", fleet.score, fleet.grade, fleet.devices.len());
    out.push_str("| Enhet | Typ | Betyg | Kritisk | Hög | Medel | Låg | Info |\n|---|---|---|---|---|---|---|---|\n");
    for d in &fleet.devices {
        let _ = writeln!(
            out,
            "| {} | {} | {} {} | {} | {} | {} | {} | {} |",
            d.name,
            d.kind,
            d.score,
            d.grade,
            d.count(Severity::Critical),
            d.count(Severity::High),
            d.count(Severity::Medium),
            d.count(Severity::Low),
            d.count(Severity::Info)
        );
    }
    out.push_str("\n## Innehåll\n\n");
    for d in &fleet.devices {
        let _ = writeln!(out, "- [{} ({}) – {}/100](#{})", d.name, d.kind, d.score, slug(&format!("{} ({}) – {}/100", d.name, d.kind, d.score)));
    }
    if !fleet.cross.is_empty() || !fleet.links.is_empty() {
        let _ = writeln!(out, "- [Mellan enheterna](#{})", slug("Mellan enheterna"));
    }
    for d in &fleet.devices {
        let _ = writeln!(out, "\n## {} ({}) – {}/100\n\n`{}`\n", d.name, d.kind, d.score, d.path);
        out.push_str("| | Regel | Fynd |\n|---|---|---|\n");
        for r in &d.results {
            let shown: Vec<&Finding> = r.findings.iter().filter(|f| f.severity >= opt.min).collect();
            if shown.is_empty() {
                let _ = writeln!(out, "| ✅ | {} | OK |", r.title);
            } else {
                let text: Vec<String> = shown
                    .iter()
                    .map(|f| format!("**{}** {}{}", f.severity.label(), f.message.replace('|', "\\|"), f.line.map(|l| format!(" (rad {l})")).unwrap_or_default()))
                    .collect();
                let _ = writeln!(out, "| ❌ | {} | {} |", r.title, text.join("<br>"));
            }
        }
        let fixes: Vec<&String> = d.findings().filter(|f| f.severity >= opt.min).flat_map(|f| f.fix.iter()).collect();
        if opt.fixes && !fixes.is_empty() {
            out.push_str("\n<details><summary>Förslag på rättning</summary>\n\n```\nconfigure terminal\n");
            for l in fixes {
                let _ = writeln!(out, "{l}");
            }
            out.push_str("end\n```\n</details>\n");
        }
    }
    if !fleet.cross.is_empty() || !fleet.links.is_empty() {
        out.push_str("\n## Mellan enheterna\n\n");
        for l in fleet.links.iter().filter(|l| l.b_port.is_some()) {
            let _ = writeln!(out, "- {} {} ⇄ {} {} – {}", l.a, l.a_port, l.b, l.b_port.as_deref().unwrap_or(""), l.vlans);
        }
        for f in &fleet.cross {
            let _ = writeln!(out, "- **{}** {}", f.severity.label(), f.message);
        }
    }
    out
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

pub fn csv(fleet: &FleetReport) -> String {
    let mut w = ::csv::Writer::from_writer(Vec::new());
    let _ = w.write_record(["enhet", "regel", "allvarlighet", "rad", "fynd", "rättning"]);
    for d in &fleet.devices {
        for f in d.findings() {
            let _ = w.write_record([&d.name, &f.rule, f.severity.label(), &f.line.map(|l| l.to_string()).unwrap_or_default(), &f.message, &f.fix.join("\n")]);
        }
    }
    for f in &fleet.cross {
        let _ = w.write_record(["(nätet)", &f.rule, f.severity.label(), "", &f.message, &f.fix.join("\n")]);
    }
    String::from_utf8(w.into_inner().unwrap_or_default()).unwrap_or_default()
}

/// CSV för svenskt Excel: semikolon som avskiljare och BOM först så att å, ä, ö visas rätt.
pub fn csv_excel(fleet: &FleetReport) -> String {
    let mut w = ::csv::WriterBuilder::new().delimiter(b';').from_writer(Vec::new());
    let _ = w.write_record(["enhet", "regel", "allvarlighet", "rad", "fynd", "rättning"]);
    for d in &fleet.devices {
        for f in d.findings() {
            let _ = w.write_record([&d.name, &f.rule, f.severity.label(), &f.line.map(|l| l.to_string()).unwrap_or_default(), &f.message, &f.fix.join("\n")]);
        }
    }
    for f in &fleet.cross {
        let _ = w.write_record(["(nätet)", &f.rule, f.severity.label(), "", &f.message, &f.fix.join("\n")]);
    }
    format!("\u{feff}{}", String::from_utf8(w.into_inner().unwrap_or_default()).unwrap_or_default())
}

// ---------------------------------------------------------------------------
// SARIF och JUnit
// ---------------------------------------------------------------------------

/// Titel och förklaring till reglerna för fynd mellan enheter (de ligger inte i `ALL_RULES`).
pub const CROSS_RULES: [(&str, &str, &str); 9] = [
    ("link", "Länkar mellan enheter stämmer", "Trunkens båda sidor måste ha samma native-VLAN och tillåtna VLAN, och mot en router måste subinterfacen finnas."),
    ("dup-ip", "Inga IP-krockar mellan enheter", "Samma adress på två enheter gör att trafiken hamnar hos fel enhet."),
    ("vlan-names", "VLAN heter samma sak överallt", "Olika namn på samma VLAN-nummer gör nätet svårt att felsöka."),
    ("gateway", "Switchens gateway finns på en router", "En default-gateway som ingen router har gör att switchen inte kan administreras utifrån."),
    ("dup-hostname", "Unika hostnames", "Två enheter med samma namn går inte att skilja åt i loggar, SSH och topologin."),
    ("svi-subif", "SVI och subinterface har samma nät", "Switchens SVI och routerns subinterface för samma VLAN måste ligga i samma nät."),
    ("native-mix", "Samma native-VLAN på alla trunkar", "Olika native-VLAN på trunkarna tyder på en miss och kan läcka trafik mellan VLAN."),
    ("vlan-subnet", "Ett nät per VLAN", "Samma nät i två VLAN gör routingen oförutsägbar."),
    ("loop", "Inga slingor i nätet", "Redundanta länkar ger en loop om spanning-tree inte är på."),
];

fn cross_rule(id: &str) -> (&str, &str) {
    CROSS_RULES.iter().find(|(r, _, _)| *r == id).map_or((id, ""), |(_, t, w)| (t, w))
}

fn sarif_level(sev: Severity) -> &'static str {
    match sev {
        Severity::Critical | Severity::High => "error",
        Severity::Medium => "warning",
        Severity::Low | Severity::Info => "note",
    }
}

/// GitHub rangordnar code scanning-fynd efter detta tal (0–10).
fn security_severity(sev: Severity) -> &'static str {
    match sev {
        Severity::Critical => "9.5",
        Severity::High => "8.0",
        Severity::Medium => "5.0",
        Severity::Low => "3.0",
        Severity::Info => "1.0",
    }
}

/// SARIF 2.1.0. Ett resultat per fynd; fynd mellan enheterna saknar filplats.
pub fn sarif(fleet: &FleetReport, opt: Options) -> String {
    // (regel-id, titel, förklaring, kategori, högsta nivå)
    let mut rules: Vec<(String, String, String, String, Severity)> = Vec::new();
    let mut note = |id: &str, title: &str, why: &str, cat: &str, sev: Severity| match rules.iter_mut().find(|r| r.0 == id) {
        Some(r) => r.4 = r.4.max(sev),
        None => rules.push((id.into(), title.into(), why.into(), cat.into(), sev)),
    };
    for d in &fleet.devices {
        for r in &d.results {
            note(r.id, r.title, r.why, r.category, Severity::Info);
        }
    }
    let mut results = Vec::new();
    let shown = |f: &Finding| f.severity >= opt.min;
    let mut result = |device: &str, f: &Finding, uri: Option<&str>, meta: (&str, &str, &str)| {
        note(&f.rule, meta.0, meta.1, meta.2, f.severity);
        let mut r = json!({
            "ruleId": f.rule,
            "level": sarif_level(f.severity),
            "message": { "text": f.message },
            "partialFingerprints": { "vlantool/id": f.id(device) },
            "properties": { "device": device, "severity": f.severity.label(), "fix": f.fix },
        });
        if let Some(uri) = uri {
            let mut loc = json!({ "physicalLocation": { "artifactLocation": { "uri": uri.replace('\\', "/") } } });
            if let Some(line) = f.line {
                loc["physicalLocation"]["region"] = json!({ "startLine": line });
            }
            r["locations"] = json!([loc]);
        }
        results.push(r);
    };
    for d in &fleet.devices {
        for r in &d.results {
            for f in r.findings.iter().filter(|f| shown(f)) {
                // En regel kan lägga fynd under ett annat id än sitt eget; slå upp titeln på fyndets id.
                let own = d.results.iter().find(|x| x.id == f.rule).unwrap_or(r);
                result(&d.name, f, Some(&d.path), (own.title, own.why, own.category));
            }
        }
    }
    for f in fleet.cross.iter().filter(|f| shown(f)) {
        let (t, w) = cross_rule(&f.rule);
        result("(nätet)", f, None, (t, w, CROSS_CATEGORY));
    }
    // Regelindex först när alla regler är kända.
    for r in &mut results {
        let id = r["ruleId"].as_str().unwrap_or_default().to_string();
        if let Some(i) = rules.iter().position(|x| x.0 == id) {
            r["ruleIndex"] = json!(i);
        }
    }
    let rules_json: Vec<serde_json::Value> = rules
        .iter()
        .map(|(id, title, why, cat, sev)| {
            json!({
                "id": id,
                "name": title,
                "shortDescription": { "text": title },
                "fullDescription": { "text": if why.is_empty() { title } else { why } },
                "defaultConfiguration": { "level": sarif_level(*sev) },
                "properties": { "category": cat, "security-severity": security_severity(*sev) },
            })
        })
        .collect();
    let doc = json!({
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": { "driver": { "name": "vlantool", "version": env!("CARGO_PKG_VERSION"), "rules": rules_json } },
            "results": results,
        }],
    });
    serde_json::to_string_pretty(&doc).unwrap_or_default()
}

fn xml(s: &str) -> String {
    s.chars()
        .filter(|c| matches!(c, '\t' | '\n' | '\r') || *c >= ' ')
        .map(|c| match c {
            '&' => "&amp;".to_string(),
            '<' => "&lt;".to_string(),
            '>' => "&gt;".to_string(),
            '"' => "&quot;".to_string(),
            '\'' => "&apos;".to_string(),
            c => c.to_string(),
        })
        .collect()
}

/// JUnit-XML: en testsuite per enhet med en testcase per regel. En regel med fynd på nivån
/// Låg eller högre är ett `failure`; en regel med bara Info-fynd godkänns och fynden hamnar i
/// `system-out`. Fynden mellan enheterna blir en egen testsuite med en testcase per kontroll.
pub fn junit(fleet: &FleetReport, opt: Options) -> String {
    struct Case {
        name: String,
        findings: Vec<Finding>,
    }
    let mut suites: Vec<(String, Vec<Case>)> = Vec::new();
    for d in &fleet.devices {
        let cases = d
            .results
            .iter()
            .map(|r| Case { name: format!("{} – {}", r.id, r.title), findings: r.findings.iter().filter(|f| f.severity >= opt.min).cloned().collect() })
            .collect();
        suites.push((d.name.clone(), cases));
    }
    if !fleet.devices.is_empty() || !fleet.cross.is_empty() {
        let cases = CROSS_RULES
            .iter()
            .map(|(id, title, _)| Case {
                name: format!("{id} – {title}"),
                findings: fleet.cross.iter().filter(|f| f.rule == *id && f.severity >= opt.min).cloned().collect(),
            })
            .collect();
        suites.push((CROSS_CATEGORY.to_string(), cases));
    }
    let fails = |c: &Case| c.findings.iter().any(|f| f.severity >= Severity::Low);
    let total: usize = suites.iter().map(|(_, c)| c.len()).sum();
    let failed: usize = suites.iter().flat_map(|(_, c)| c.iter()).filter(|c| fails(c)).count();
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    let _ = writeln!(out, "<testsuites name=\"vlantool\" tests=\"{total}\" failures=\"{failed}\" errors=\"0\" time=\"0\">");
    for (name, cases) in &suites {
        let f = cases.iter().filter(|c| fails(c)).count();
        let _ = writeln!(out, "  <testsuite name=\"{}\" tests=\"{}\" failures=\"{f}\" errors=\"0\" skipped=\"0\" time=\"0\">", xml(name), cases.len());
        for c in cases {
            let _ = write!(out, "    <testcase classname=\"{}\" name=\"{}\" time=\"0\"", xml(name), xml(&c.name));
            if c.findings.is_empty() {
                out.push_str("/>\n");
                continue;
            }
            out.push_str(">\n");
            let text: Vec<String> = c.findings.iter().map(|f| format!("[{}] {}{}", f.severity.label(), f.message, f.line.map(|l| format!(" (rad {l})")).unwrap_or_default())).collect();
            if fails(c) {
                let worst = c.findings.iter().map(|f| f.severity).max().unwrap_or(Severity::Low);
                let _ = writeln!(out, "      <failure message=\"{}\" type=\"{}\">{}</failure>", xml(&c.findings[0].message), worst.label(), xml(&text.join("\n")));
            } else {
                let _ = writeln!(out, "      <system-out>{}</system-out>", xml(&text.join("\n")));
            }
            out.push_str("    </testcase>\n");
        }
        out.push_str("  </testsuite>\n");
    }
    out.push_str("</testsuites>\n");
    out
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn hex((r, g, b): (u8, u8, u8)) -> String {
    format!("#{r:02x}{g:02x}{b:02x}")
}

fn ring(score: u32, size: u32) -> String {
    let r = 42.0;
    let c = 2.0 * std::f64::consts::PI * r;
    let dash = c * f64::from(score) / 100.0;
    format!(
        r#"<svg class="ring" width="{size}" height="{size}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="{r}" fill="none" stroke="var(--track)" stroke-width="9"/><circle cx="50" cy="50" r="{r}" fill="none" stroke="{}" stroke-width="9" stroke-linecap="round" stroke-dasharray="{dash:.1} {c:.1}" transform="rotate(-90 50 50)"/><text x="50" y="57" text-anchor="middle" font-size="24" font-weight="700" fill="currentColor">{score}</text></svg>"#,
        hex(score_rgb(score))
    )
}

fn chip(sev: Severity) -> String {
    format!(r#"<span class="chip" style="--c:{}">{} {}</span>"#, hex(sev.rgb()), sev.icon(), sev.label())
}

pub fn html(fleet: &FleetReport) -> String {
    html_with_meta(fleet, "Granskningsrapport", "")
}

/// Fristående HTML-rapport (ingen extern resurs) med egen rubrik, t.ex. projektnamnet, och
/// en tidsstämpel som visas under den. Tom tidsstämpel döljs.
pub fn html_with_meta(fleet: &FleetReport, title: &str, timestamp: &str) -> String {
    let title = if title.trim().is_empty() { "Granskningsrapport" } else { title };
    let stamp = if timestamp.trim().is_empty() { String::new() } else { format!(" · {}", esc(timestamp)) };
    let mut body = String::new();
    let _ = write!(
        body,
        r#"<header><div><h1>{}</h1><p class="muted">{} enheter · {} länkar · vlantool {}{stamp}</p><p class="muted summary">{}</p></div><div class="hero">{}<div><div class="grade">{}</div><div class="muted">hela nätet</div></div></div></header>"#,
        esc(title),
        fleet.devices.len(),
        fleet.links.iter().filter(|l| l.b_port.is_some()).count(),
        env!("CARGO_PKG_VERSION"),
        esc(&summary_text(fleet)),
        ring(fleet.score, 92),
        fleet.grade
    );
    body.push_str(
        r#"<div class="filter hidden" id="filter"><input type="search" id="q" placeholder="Sök i fynden …" aria-label="Sök i fynden"><span id="levels">"#,
    );
    for s in Severity::ALL {
        let _ = write!(body, r#"<button type="button" class="lvl on" data-sev="{}" style="--c:{}">{}</button>"#, sev_key(s), hex(s.rgb()), s.label());
    }
    body.push_str(r#"</span><span class="muted" id="count"></span></div>"#);
    body.push_str(r#"<section class="stats">"#);
    for s in Severity::ALL {
        let _ = write!(body, r#"<div class="stat" style="--c:{}"><b>{}</b><span>{}</span></div>"#, hex(s.rgb()), fleet.count(s), s.label());
    }
    body.push_str("</section>");
    body.push_str(&topology_svg(fleet));
    body.push_str("<section class=\"cards\">");
    for d in &fleet.devices {
        let _ = write!(
            body,
            r##"<a class="card" href="#{id}">{}<div><h3>{}</h3><p class="muted">{} · {}/{} OK</p></div><span class="grade small">{}</span></a>"##,
            ring(d.score, 56),
            esc(&d.name),
            d.kind,
            d.passed(),
            d.results.len(),
            d.grade,
            id = esc(&d.name)
        );
    }
    body.push_str("</section>");

    if !fleet.links.is_empty() || !fleet.cross.is_empty() {
        body.push_str(r#"<section class="panel"><h2>Mellan enheterna</h2><ul class="links">"#);
        for l in fleet.links.iter().filter(|l| l.b_port.is_some()) {
            let _ = write!(
                body,
                "<li><b>{}</b> <code>{}</code> <span class=\"muted\">⇄</span> <b>{}</b> <code>{}</code> <span class=\"muted\">{}</span></li>",
                esc(&l.a),
                esc(&l.a_port),
                esc(&l.b),
                esc(l.b_port.as_deref().unwrap_or("")),
                esc(&l.vlans)
            );
        }
        body.push_str("</ul>");
        findings_table(&fleet.cross.iter().collect::<Vec<_>>(), &mut body);
        body.push_str("</section>");
    }

    for d in &fleet.devices {
        let _ = write!(
            body,
            r#"<section class="panel" id="{}"><div class="dev-head">{}<div><h2>{}</h2><p class="muted">{} · <code>{}</code></p></div></div><div class="rules">"#,
            esc(&d.name),
            ring(d.score, 64),
            esc(&d.name),
            d.kind,
            esc(&d.path)
        );
        for r in &d.results {
            let cls = if r.findings.is_empty() { "ok" } else { "bad" };
            let _ = write!(body, r#"<span class="rule {cls}" title="{}">{}</span>"#, esc(r.title), r.id);
        }
        body.push_str("</div>");
        body.push_str(&category_bars(d));
        let all: Vec<&Finding> = d.findings().collect();
        if all.is_empty() {
            body.push_str(r#"<p class="good">✔ Inga fynd – allt ser bra ut.</p>"#);
        } else {
            findings_table(&all, &mut body);
        }
        let fixes: Vec<&String> = all.iter().flat_map(|f| f.fix.iter()).collect();
        if !fixes.is_empty() {
            body.push_str("<details><summary>Rättningsskript</summary><pre>configure terminal\n");
            for l in fixes {
                let _ = writeln!(body, "{}", esc(l));
            }
            body.push_str("end\nwrite memory</pre></details>");
        }
        body.push_str("</section>");
    }

    format!(
        r#"<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{}</title><style>{CSS}</style></head><body><main>{body}</main><script>{JS}</script></body></html>"#,
        esc(title)
    )
}

fn sev_key(sev: Severity) -> &'static str {
    match sev {
        Severity::Info => "info",
        Severity::Low => "low",
        Severity::Medium => "medium",
        Severity::High => "high",
        Severity::Critical => "critical",
    }
}

/// Staplar med betyg per kategori för en enhet.
fn category_bars(d: &DeviceReport) -> String {
    let scores = d.category_scores();
    if scores.is_empty() {
        return String::new();
    }
    let mut s = String::from(r#"<div class="cats">"#);
    for (cat, score) in scores {
        let _ = write!(
            s,
            r#"<div class="cat"><span>{}</span><div class="catbar" role="img" aria-label="{}: {score} av 100"><i style="width:{score}%;background:{}"></i></div><b>{score}</b></div>"#,
            esc(cat),
            esc(cat),
            hex(score_rgb(score))
        );
    }
    s.push_str("</div>");
    s
}

/// Nätet som inbäddad SVG: enheterna i lager utifrån routern (eller första enheten), med
/// länkarna mellan dem. Tom sträng om det inte finns några länkar mellan enheter.
fn topology_svg(fleet: &FleetReport) -> String {
    use crate::topology::edges;
    let configs: Vec<crate::parser::Config> = fleet.devices.iter().map(|d| d.config.clone()).collect();
    let all = edges(&configs);
    let names: Vec<&str> = fleet.devices.iter().map(|d| d.name.as_str()).collect();
    let idx = |n: &str| names.iter().position(|x| *x == n);
    let links: Vec<_> = all.iter().filter(|e| e.b_device).filter_map(|e| Some((idx(&e.a)?, idx(&e.b)?, e))).filter(|(a, b, _)| a != b).collect();
    if links.is_empty() {
        return String::new();
    }
    // Lager med bredden först; routrar först som rötter.
    let mut depth: Vec<Option<usize>> = vec![None; names.len()];
    let mut order: Vec<usize> = (0..names.len()).filter(|&i| fleet.devices[i].config.kind == crate::parser::Kind::Router).collect();
    let rest: Vec<usize> = (0..names.len()).filter(|i| !order.contains(i)).collect();
    order.extend(rest);
    let mut layers: Vec<Vec<usize>> = Vec::new();
    for root in order {
        if depth[root].is_some() {
            continue;
        }
        let base = layers.len();
        depth[root] = Some(base);
        let mut queue = std::collections::VecDeque::from([root]);
        while let Some(n) = queue.pop_front() {
            let dn = depth[n].unwrap_or(base);
            while layers.len() <= dn {
                layers.push(Vec::new());
            }
            layers[dn].push(n);
            for (a, b, _) in &links {
                let other = if *a == n { *b } else if *b == n { *a } else { continue };
                if depth[other].is_none() {
                    depth[other] = Some(dn + 1);
                    queue.push_back(other);
                }
            }
        }
    }
    let (nw, nh, gx, gy) = (150.0_f64, 50.0_f64, 30.0_f64, 70.0_f64);
    let cols = layers.iter().map(Vec::len).max().unwrap_or(1) as f64;
    let width = (cols * (nw + gx) + gx).max(360.0);
    let height = layers.len() as f64 * (nh + gy) + gy - 10.0;
    let mut pos = vec![(0.0, 0.0); names.len()];
    for (l, nodes) in layers.iter().enumerate() {
        let row = nodes.len() as f64 * (nw + gx) - gx;
        for (k, &n) in nodes.iter().enumerate() {
            pos[n] = ((width - row) / 2.0 + k as f64 * (nw + gx) + nw / 2.0, gy / 2.0 + l as f64 * (nh + gy) + nh / 2.0);
        }
    }
    let mut s = format!(
        r#"<section class="panel topo"><h2>Topologi</h2><svg viewBox="0 0 {width:.0} {height:.0}" width="100%" style="max-width:{width:.0}px" role="img" aria-label="Nätets topologi">"#
    );
    for (a, b, e) in &links {
        let ((x1, y1), (x2, y2)) = (pos[*a], pos[*b]);
        let dash = if e.b_port.is_none() { r#" stroke-dasharray="5 4""# } else { "" };
        let label = match &e.b_port {
            Some(bp) => format!("{} ⇄ {bp}", e.a_port),
            None => e.a_port.clone(),
        };
        let label = if e.info.is_empty() { label } else { format!("{label} · {}", e.info) };
        let _ = write!(
            s,
            r#"<line x1="{x1:.0}" y1="{y1:.0}" x2="{x2:.0}" y2="{y2:.0}" stroke="var(--muted)" stroke-width="2"{dash}/><text class="elabel" x="{:.0}" y="{:.0}" text-anchor="middle">{}</text>"#,
            (x1 + x2) / 2.0,
            (y1 + y2) / 2.0 - 4.0,
            esc(&label)
        );
    }
    for (i, d) in fleet.devices.iter().enumerate() {
        let (cx, cy) = pos[i];
        let loose = all.iter().filter(|e| !e.b_device && e.a == d.name).count();
        let extra = if loose > 0 { format!(" · +{loose}") } else { String::new() };
        let _ = write!(
            s,
            r##"<a href="#{id}"><rect x="{:.0}" y="{:.0}" width="{nw:.0}" height="{nh:.0}" rx="10" fill="var(--panel)" stroke="{}" stroke-width="3"/><text x="{cx:.0}" y="{:.0}" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">{}</text><text x="{cx:.0}" y="{:.0}" text-anchor="middle" font-size="11" fill="var(--muted)">{} · {}/100{extra}</text></a>"##,
            cx - nw / 2.0,
            cy - nh / 2.0,
            hex(score_rgb(d.score)),
            cy - 3.0,
            esc(&d.name),
            cy + 13.0,
            d.kind,
            d.score,
            id = esc(&d.name)
        );
    }
    s.push_str("</svg></section>");
    s
}

fn findings_table(list: &[&Finding], body: &mut String) {
    if list.is_empty() {
        return;
    }
    let mut sorted = list.to_vec();
    sorted.sort_by_key(|f| std::cmp::Reverse(f.severity));
    body.push_str("<table><thead><tr><th>Nivå</th><th>Regel</th><th>Fynd</th><th>Rad</th></tr></thead><tbody>");
    for f in sorted {
        let fix = if f.fix.is_empty() { String::new() } else { format!("<pre class=\"fix\">{}</pre>", esc(&f.fix.join("\n"))) };
        let _ = write!(
            body,
            "<tr data-sev=\"{}\"><td>{}</td><td><code>{}</code></td><td>{}{fix}</td><td class=\"muted\">{}</td></tr>",
            sev_key(f.severity),
            chip(f.severity),
            esc(&f.rule),
            esc(&f.message),
            f.line.map(|l| l.to_string()).unwrap_or_default()
        );
    }
    body.push_str("</tbody></table>");
}

const CSS: &str = r#"
:root{--bg:#f5f6fa;--panel:#fff;--text:#1c2030;--muted:#6b7389;--line:#e3e6ef;--track:#e6e8f0;--code:#eef0f7;--accent:#4a7dff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1219;--panel:#171b26;--text:#e6e9f2;--muted:#8a93a8;--line:#262c3b;--track:#262c3b;--code:#1f2433;--accent:#7aa2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 16px 64px}h1{margin:0;font-size:28px}h2{margin:0 0 4px;font-size:20px}h3{margin:0;font-size:16px}
.muted{color:var(--muted);margin:0}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}code{background:var(--code);padding:1px 6px;border-radius:6px}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:24px}.hero{display:flex;align-items:center;gap:12px}
.grade{font-size:40px;font-weight:800;line-height:1}.grade.small{font-size:22px;margin-left:auto;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px}.stat{background:var(--panel);border:1px solid var(--line);border-top:4px solid var(--c);border-radius:12px;padding:12px 16px}
.stat b{display:block;font-size:26px;color:var(--c)}.stat span{color:var(--muted);font-size:12px;letter-spacing:.06em}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:24px}
.card{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 16px;color:inherit;text-decoration:none;transition:transform .15s,border-color .15s}
.card:hover{transform:translateY(-2px);border-color:var(--accent)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:20px;overflow-x:auto}
.dev-head{display:flex;align-items:center;gap:14px;margin-bottom:12px}.rules{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.rule{font:12px ui-monospace,monospace;padding:3px 8px;border-radius:999px;border:1px solid var(--line)}.rule.ok{color:#3aa76d}.rule.bad{color:#e5484d;border-color:#e5484d55}
table{width:100%;border-collapse:collapse}th{text-align:left;color:var(--muted);font-weight:600;font-size:12px;letter-spacing:.04em;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:none}
.chip{display:inline-block;white-space:nowrap;font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);padding:2px 8px;border-radius:999px}
pre{background:var(--code);padding:10px 12px;border-radius:10px;overflow-x:auto;margin:8px 0 0}pre.fix{color:var(--accent)}
details summary{cursor:pointer;color:var(--accent);margin-top:12px;font-weight:600}.links{padding-left:18px}.good{color:#3aa76d;font-weight:600}
.ring{flex:none}.summary{margin-top:4px}.hidden{display:none!important}
.filter{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--bg);padding:8px 0 12px}
.filter input{flex:1 1 220px;min-width:0;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);font:inherit}
.lvl{font:600 11px system-ui,sans-serif;letter-spacing:.04em;padding:5px 10px;border-radius:999px;border:1px solid var(--c);background:transparent;color:var(--c);cursor:pointer;margin-right:4px}
.lvl.on{background:var(--c);color:#fff}
.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 18px;margin-bottom:14px}
.cat{display:grid;grid-template-columns:96px 1fr 28px;align-items:center;gap:8px;font-size:13px}.cat span{color:var(--muted)}.cat b{text-align:right}
.catbar{height:8px;background:var(--track);border-radius:999px;overflow:hidden}.catbar i{display:block;height:100%;border-radius:999px}
.topo svg{display:block;margin:8px auto 0}.topo a{cursor:pointer}.elabel{font-size:10px;fill:var(--muted);paint-order:stroke;stroke:var(--panel);stroke-width:4px}
@media (max-width:640px){.stats{grid-template-columns:repeat(3,1fr)}}
@media print{
:root{--bg:#fff;--panel:#fff;--text:#000;--muted:#444;--line:#bbb;--track:#ddd;--code:#f2f2f2}
body{font-size:11pt}main{max-width:none;padding:0}.filter{display:none!important}
.panel,.stat,.card{box-shadow:none;break-inside:avoid;overflow:visible}.panel{page-break-inside:auto}tr{break-inside:avoid}
.chip,.lvl,.catbar i,.ring circle{-webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:inherit;text-decoration:none}pre{white-space:pre-wrap}
}
"#;

/// Sök och nivåfilter. Utan JavaScript syns allt och filterraden är dold.
const JS: &str = r#"
(function(){
var bar=document.getElementById('filter');if(!bar)return;bar.classList.remove('hidden');
var q=document.getElementById('q'),count=document.getElementById('count');
var rows=[].slice.call(document.querySelectorAll('tr[data-sev]'));
var btns=[].slice.call(document.querySelectorAll('.lvl'));
function apply(){
 var on={};btns.forEach(function(b){if(b.classList.contains('on'))on[b.getAttribute('data-sev')]=1});
 var t=q.value.toLowerCase(),shown=0;
 rows.forEach(function(r){var ok=on[r.getAttribute('data-sev')]&&(!t||r.textContent.toLowerCase().indexOf(t)>=0);r.hidden=!ok;if(ok)shown++});
 [].forEach.call(document.querySelectorAll('table'),function(tb){var any=tb.querySelector('tbody tr:not([hidden])');tb.hidden=!any});
 count.textContent=shown+' av '+rows.length+' fynd';
}
btns.forEach(function(b){b.addEventListener('click',function(){b.classList.toggle('on');apply()})});
q.addEventListener('input',apply);apply();
var opened=[];
window.addEventListener('beforeprint',function(){opened=[];[].forEach.call(document.querySelectorAll('details'),function(d){if(!d.open){d.open=true;opened.push(d)}})});
window.addEventListener('afterprint',function(){opened.forEach(function(d){d.open=false})});
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::audit_fleet;
    use crate::parser::Config;

    const R: &str = "hostname R1\ninterface Gi0/0\n description Trunk mot SW1\n!\ninterface Gi0/0.10\n encapsulation dot1Q 10\n ip address 10.0.10.1 255.255.255.0\n!\nip route 0.0.0.0 0.0.0.0 10.0.0.2\n";
    const SW: &str = "hostname SW1\nvlan 10\n name A\ninterface Gi0/1\n description Trunk mot R1\n switchport mode trunk\n switchport trunk native vlan 1\n!\ninterface Fa0/1\n description Port mot PC1\n switchport mode access\n switchport access vlan 10\n!\n! vlantool:ignore banner\n";

    fn fleet() -> FleetReport {
        audit_fleet(vec![Config::parse("r1", "cfg\\r1.cfg", R), Config::parse("sw1", "cfg/sw1.cfg", SW)], &[])
    }

    fn opt() -> Options {
        Options { color: false, verbose: false, fixes: false, min: Severity::Info }
    }

    #[test]
    fn format_variants_are_appended_last() {
        // Ordningen är en del av API:t (clap listar värdena i den).
        use clap::ValueEnum;
        let names: Vec<String> = Format::value_variants().iter().map(|f| f.to_possible_value().unwrap().get_name().to_string()).collect();
        assert_eq!(names, ["terminal", "text", "markdown", "json", "csv", "html", "sarif", "junit"]);
    }

    #[test]
    fn summary_sentence() {
        let f = fleet();
        let s = summary_text(&f);
        assert!(s.starts_with(&format!("Nätet får {}/100 ({})", f.score, f.grade)), "{s}");
        assert!(s.contains("2 enheter") && s.contains("fynd") && s.ends_with('.'), "{s}");
        assert!(s.contains("lägst betyg har"), "{s}");
        assert_eq!(s.matches('.').count(), 1, "en enda mening: {s}");
        let empty = audit_fleet(vec![], &[]);
        assert_eq!(summary_text(&empty), "Inga enheter granskades.");
        let clean = audit_fleet(vec![Config::parse("x", "x", "hostname X\n! vlantool:ignore banner\n")], &["banner".to_string()]);
        assert_eq!(summary_text(&clean), "Nätet får 100/100 (A): 1 enheter och inga fynd.");
    }

    #[test]
    fn sarif_is_valid_2_1_0() {
        let f = fleet();
        let v: serde_json::Value = serde_json::from_str(&render(&f, Format::Sarif, opt())).unwrap();
        assert_eq!(v["version"], "2.1.0");
        assert!(v["$schema"].as_str().unwrap().contains("sarif-2.1.0"));
        let run = &v["runs"][0];
        assert_eq!(run["tool"]["driver"]["name"], "vlantool");
        let rules = run["tool"]["driver"]["rules"].as_array().unwrap();
        let results = run["results"].as_array().unwrap();
        assert_eq!(results.len(), f.all_findings().count());
        assert!(!results.is_empty());
        for r in results {
            let i = r["ruleIndex"].as_u64().unwrap() as usize;
            assert_eq!(rules[i]["id"], r["ruleId"]);
            assert!(["error", "warning", "note"].contains(&r["level"].as_str().unwrap()));
            assert!(r["message"]["text"].as_str().is_some_and(|t| !t.is_empty()));
            assert_eq!(r["partialFingerprints"]["vlantool/id"].as_str().unwrap().len(), 16);
            if let Some(loc) = r["locations"].get(0) {
                assert!(!loc["physicalLocation"]["artifactLocation"]["uri"].as_str().unwrap().contains('\\'));
            }
        }
        // Regler har titel och beskrivning, och fynd med radnummer får en region.
        assert!(rules.iter().all(|r| r["shortDescription"]["text"].as_str().is_some() && r["fullDescription"]["text"].as_str().is_some()));
        assert!(results.iter().any(|r| r["locations"][0]["physicalLocation"]["region"]["startLine"].is_u64()));
        let ids: std::collections::BTreeSet<&str> = rules.iter().map(|r| r["id"].as_str().unwrap()).collect();
        assert_eq!(ids.len(), rules.len(), "unika regel-id");
    }

    #[test]
    fn sarif_respects_min_level() {
        let high = Options { min: Severity::High, ..opt() };
        let v: serde_json::Value = serde_json::from_str(&sarif(&fleet(), high)).unwrap();
        for r in v["runs"][0]["results"].as_array().unwrap() {
            assert_eq!(r["level"], "error");
        }
    }

    /// Minimal kontroll att XML:en är välformad: taggarna är balanserade och texten escapad.
    fn assert_well_formed(xml: &str) {
        assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        let mut stack: Vec<String> = Vec::new();
        let mut rest = &xml[xml.find("?>").unwrap() + 2..];
        while let Some(i) = rest.find('<') {
            assert!(!rest[..i].contains('>') && !rest[..i].contains('&') || rest[..i].contains("&amp;") || rest[..i].contains("&lt;") || rest[..i].contains("&gt;") || rest[..i].contains("&quot;") || rest[..i].contains("&apos;"), "oescapad text: {}", &rest[..i]);
            let end = rest[i..].find('>').expect("tagg utan slut") + i;
            let tag = &rest[i + 1..end];
            assert!(!tag.contains('<'));
            if let Some(name) = tag.strip_prefix('/') {
                assert_eq!(stack.pop().as_deref(), Some(name), "fel stängning");
            } else if !tag.ends_with('/') {
                stack.push(tag.split_whitespace().next().unwrap().to_string());
            }
            rest = &rest[end + 1..];
        }
        assert!(stack.is_empty(), "ostängda taggar: {stack:?}");
    }

    #[test]
    fn junit_has_one_testcase_per_rule_and_device() {
        let f = fleet();
        let x = render(&f, Format::Junit, opt());
        assert_well_formed(&x);
        let rules: usize = f.devices.iter().map(|d| d.results.len()).sum();
        assert_eq!(x.matches("<testcase ").count(), rules + CROSS_RULES.len());
        assert_eq!(x.matches("<testsuite ").count(), f.devices.len() + 1);
        assert!(x.contains(r#"<testsuite name="SW1""#) && x.contains(r#"<testsuite name="R1""#));
        let failures = x.matches("<failure ").count();
        assert!(failures > 0);
        assert!(x.contains(&format!("failures=\"{failures}\" errors=\"0\" time=\"0\">")), "summan stämmer");
    }

    #[test]
    fn junit_escapes_and_info_does_not_fail() {
        let mut f = fleet();
        f.cross.push(Finding::new("link", Severity::High, "a <b> & \"c\" \u{1}"));
        f.cross.push(Finding::new("loop", Severity::Info, "bara info"));
        let x = junit(&f, opt());
        assert_well_formed(&x);
        assert!(x.contains("a &lt;b&gt; &amp; &quot;c&quot; "));
        assert!(!x.contains('\u{1}'));
        let loop_case = &x[x.find("name=\"loop").unwrap()..];
        assert!(loop_case[..loop_case.find("</testcase>").unwrap()].contains("<system-out>"));
        assert!(!loop_case[..loop_case.find("</testcase>").unwrap()].contains("<failure"));
    }

    #[test]
    fn csv_excel_uses_semicolon_and_bom() {
        let f = fleet();
        let c = csv_excel(&f);
        assert!(c.starts_with('\u{feff}'));
        let header = c.trim_start_matches('\u{feff}').lines().next().unwrap();
        assert_eq!(header, "enhet;regel;allvarlighet;rad;fynd;rättning");
        assert!(c.trim_start_matches('\u{feff}').lines().filter(|l| l.contains(';')).count() >= 2);
        // Det vanliga CSV-formatet är oförändrat.
        assert!(csv(&f).starts_with("enhet,regel,"));
    }

    #[test]
    fn markdown_has_table_of_contents() {
        let f = fleet();
        let m = markdown(&f, opt());
        let toc = &m[m.find("## Innehåll").unwrap()..m.find("## R1").unwrap()];
        for d in &f.devices {
            let h = format!("{} ({}) – {}/100", d.name, d.kind, d.score);
            assert!(toc.contains(&format!("[{h}](#{})", slug(&h))), "{toc}");
            assert!(m.contains(&format!("## {h}")));
        }
        assert_eq!(slug("SW-Nordvik-1 (Switch) – 90/100"), "sw-nordvik-1-switch--90100");
        assert_eq!(slug("Mellan enheterna"), "mellan-enheterna");
    }

    #[test]
    fn json_results_carry_rule_title_category_and_why() {
        let v: serde_json::Value = serde_json::from_str(&render(&fleet(), Format::Json, opt())).unwrap();
        for d in v["devices"].as_array().unwrap() {
            for r in d["results"].as_array().unwrap() {
                for k in ["id", "title", "category", "why"] {
                    assert!(r[k].as_str().is_some_and(|s| !s.is_empty()), "{k} saknas i {r}");
                }
            }
        }
        // `ignored` visas bara när något ignorerats (SW1 ignorerar bannern).
        let devs = v["devices"].as_array().unwrap();
        assert_eq!(devs.iter().find(|d| d["name"] == "SW1").unwrap()["ignored"], 1);
        assert!(devs.iter().find(|d| d["name"] == "R1").unwrap().get("ignored").is_none());
    }

    #[test]
    fn wrap_breaks_at_words() {
        assert_eq!(wrap("aaa bbb ccc", 7), ["aaa bbb", "ccc"]);
        assert_eq!(wrap("enormtlångtord x", 5), ["enormtlångtord", "x"]);
        assert_eq!(wrap("", 5), [""]);
        assert!(wrap("ett två tre fyra fem sex sju", 10).iter().all(|l| l.chars().count() <= 10));
    }

    #[test]
    fn terminal_wraps_long_messages_only_with_a_width() {
        let mut f = fleet();
        let long = "ord ".repeat(60);
        f.cross.push(Finding::new("link", Severity::High, long.trim()));
        let wide = terminal_with_width(&f, opt(), None);
        assert!(wide.lines().any(|l| l.chars().count() > 200));
        let narrow = terminal_with_width(&f, opt(), Some(80));
        let over: Vec<&str> = narrow.lines().filter(|l| l.chars().count() > 80 && l.contains("ord ord")).collect();
        assert!(over.is_empty(), "{over:?}");
        // Fortsättningsraderna dras in under meddelandet.
        assert!(narrow.lines().any(|l| l.starts_with(&" ".repeat(MSG_INDENT)) && l.contains("ord ord")));
        // Alla ord finns kvar.
        assert_eq!(narrow.matches("ord").count(), wide.matches("ord").count());
    }

    #[test]
    fn verbose_terminal_shows_rule_explanations() {
        let f = fleet();
        let quiet = terminal_with_width(&f, opt(), None);
        let verbose = terminal_with_width(&f, Options { verbose: true, ..opt() }, None);
        let why = f.devices[0].results[0].why;
        assert!(!why.is_empty());
        assert!(verbose.contains(why));
        assert!(!quiet.contains(why));
    }

    #[test]
    fn html_is_offline_with_extras() {
        let f = fleet();
        let h = html_with_meta(&f, "Nordvik <test>", "2026-10-25 12:00");
        assert!(h.contains("<title>Nordvik &lt;test&gt;</title>") && h.contains("<h1>Nordvik &lt;test&gt;</h1>"));
        assert!(h.contains("2026-10-25 12:00"));
        // Inga externa resurser: varken src/href till http eller url(...) i stilen.
        assert!(!h.contains("src=\"http") && !h.contains("href=\"http") && !h.contains("url(http") && !h.contains("@import"));
        assert!(!h.contains("<link ") && !h.contains("<script src"));
        // 85: staplar per kategori
        assert!(h.contains("class=\"cats\"") && h.contains("class=\"catbar\""));
        // 86: sök och filter
        assert!(h.contains("id=\"q\"") && h.contains("data-sev=\"high\"") && h.contains("<script>"));
        // 87: utskrift
        assert!(h.contains("@media print"));
        // 88: topologi som SVG med båda enheterna
        let svg = &h[h.find("<section class=\"panel topo\">").unwrap()..];
        let svg = &svg[..svg.find("</section>").unwrap()];
        assert!(svg.contains("<svg") && svg.contains("R1") && svg.contains("SW1") && svg.contains("<line"));
        assert!(svg.contains("Gi0/0 ⇄ Gi0/1"), "{svg}");
        assert!(svg.contains("+1"), "PC1 räknas som enhet utan konfig");
        // Utan metadata är det samma sida som förr, med standardrubrik.
        let plain = html(&f);
        assert!(plain.contains("<h1>Granskningsrapport</h1>"));
        assert!(!plain.contains("2026-10-25"));
    }

    #[test]
    fn html_without_links_has_no_topology() {
        let f = audit_fleet(vec![Config::parse("x", "x", "hostname X\n")], &[]);
        assert!(!html(&f).contains("class=\"panel topo\""));
    }
}
