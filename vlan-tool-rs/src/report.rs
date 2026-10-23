//! Gör läsbara rapporter av granskningen: terminal (med färg), text, Markdown,
//! JSON, CSV och en fristående HTML-sida.

use crate::audit::{DeviceReport, FleetReport};
use crate::finding::{Finding, Severity};
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
        Format::Text => terminal(fleet, Options { color: false, ..opt }),
        Format::Markdown => markdown(fleet, opt),
        Format::Json => serde_json::to_string_pretty(fleet).unwrap_or_default(),
        Format::Csv => csv(fleet),
        Format::Html => html(fleet),
    }
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

fn finding_lines(p: Paint, f: &Finding, opt: Options, out: &mut String) {
    let line = f.line.map(|l| format!("rad {l}")).unwrap_or_default();
    let _ = writeln!(
        out,
        "      {} {} {}",
        p.sev(&pad(&format!("{} {}", f.severity.icon(), f.severity.label()), 10), f.severity),
        p.dim(&pad(&line, 8)),
        f.message
    );
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

fn device_terminal(d: &DeviceReport, opt: Options, out: &mut String) {
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
            }
            continue;
        }
        let worst = shown.iter().map(|f| f.severity).max().unwrap();
        let _ = writeln!(out, "  {} {} {}", p.sev(worst.icon(), worst), p.bold(&pad(r.id, 15)), r.title);
        for f in shown {
            finding_lines(p, f, opt, out);
        }
    }
    let _ = writeln!(out, "\n  {}  {}\n", p.bold(&format!("{}/{} regler godkända", d.passed(), d.results.len())), counts_line(p, |s| d.count(s)));
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
    let p = Paint(opt.color);
    let mut out = String::new();
    for d in &fleet.devices {
        device_terminal(d, opt, &mut out);
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
            finding_lines(p, f, opt, &mut out);
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
    let mut body = String::new();
    let _ = write!(
        body,
        r#"<header><div><h1>Granskningsrapport</h1><p class="muted">{} enheter · {} länkar · vlantool {}</p></div><div class="hero">{}<div><div class="grade">{}</div><div class="muted">hela nätet</div></div></div></header>"#,
        fleet.devices.len(),
        fleet.links.iter().filter(|l| l.b_port.is_some()).count(),
        env!("CARGO_PKG_VERSION"),
        ring(fleet.score, 92),
        fleet.grade
    );
    body.push_str(r#"<section class="stats">"#);
    for s in Severity::ALL {
        let _ = write!(body, r#"<div class="stat" style="--c:{}"><b>{}</b><span>{}</span></div>"#, hex(s.rgb()), fleet.count(s), s.label());
    }
    body.push_str("</section><section class=\"cards\">");
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
        r#"<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Granskningsrapport</title><style>{CSS}</style></head><body><main>{body}</main></body></html>"#
    )
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
            "<tr><td>{}</td><td><code>{}</code></td><td>{}{fix}</td><td class=\"muted\">{}</td></tr>",
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
.ring{flex:none}
@media (max-width:640px){.stats{grid-template-columns:repeat(3,1fr)}}
"#;
