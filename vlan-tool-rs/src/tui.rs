//! Interaktiv översikt i terminalen.
//!
//! Tangenter: 1–6 / ←→ byter flik, Tab byter enhet, ↑↓ bläddrar, g genererar
//! om från CSV, r läser om, e sparar HTML-rapport, ? hjälp, q avslutar.

use crate::audit::{self, FleetReport};
use crate::finding::Severity;
use crate::inventory::{short_port, Inventory};
use crate::parser::{IfMode, Kind};
use crate::settings::Settings;
use crate::{generator, report, rules, topology};
use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::symbols;
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{
    Bar, BarChart, BarGroup, Block, BorderType, Borders, Cell, Clear, Gauge, List, ListItem, ListState, Padding, Paragraph, Row, Scrollbar,
    ScrollbarOrientation, ScrollbarState, Table, Tabs, Wrap,
};
use ratatui::{DefaultTerminal, Frame};
use std::collections::BTreeSet;
use std::path::PathBuf;

// Färgpalett (fungerar på mörk terminal).
const BG: Color = Color::Rgb(16, 19, 27);
const PANEL: Color = Color::Rgb(24, 28, 39);
const LINE: Color = Color::Rgb(52, 60, 80);
const TEXT: Color = Color::Rgb(226, 230, 240);
const MUTED: Color = Color::Rgb(132, 140, 160);
const ACCENT: Color = Color::Rgb(122, 162, 255);
const VIOLET: Color = Color::Rgb(190, 160, 255);
const GOOD: Color = Color::Rgb(110, 210, 140);

fn rgb((r, g, b): (u8, u8, u8)) -> Color {
    Color::Rgb(r, g, b)
}

fn sev_color(s: Severity) -> Color {
    rgb(s.rgb())
}

fn score_color(score: u32) -> Color {
    rgb(report::score_rgb(score))
}

const TABS: [&str; 6] = ["Översikt", "Fynd", "Portar", "VLAN", "Topologi", "Konfig"];

pub struct App {
    paths: Vec<PathBuf>,
    samples: PathBuf,
    settings: Settings,
    fleet: FleetReport,
    csv_findings: usize,
    tab: usize,
    device: usize,
    finding: ListState,
    scroll: u16,
    help: bool,
    status: String,
    quit: bool,
}

impl App {
    pub fn new(paths: Vec<PathBuf>, samples: PathBuf, settings: Settings) -> Result<Self> {
        let mut app = App {
            paths,
            samples,
            settings,
            fleet: audit::audit_fleet(Vec::new(), &[]),
            csv_findings: 0,
            tab: 0,
            device: 0,
            finding: ListState::default().with_selected(Some(0)),
            scroll: 0,
            help: false,
            status: String::new(),
            quit: false,
        };
        app.reload()?;
        if app.fleet.devices.is_empty() && app.samples.is_dir() {
            app.generate();
        }
        Ok(app)
    }

    fn reload(&mut self) -> Result<()> {
        let mut paths = Vec::new();
        for p in &self.paths {
            if p.exists() {
                paths.push(p.clone());
            }
        }
        let configs = audit::load_configs(&paths)?;
        self.fleet = audit::audit_fleet(configs, &[]);
        if let Ok(inv) = Inventory::load_dir(&self.samples) {
            self.csv_findings = inv.validate(self.settings.native_vlan, self.settings.mgmt_vlan).iter().filter(|f| f.severity >= Severity::Low).count();
        }
        self.device = self.device.min(self.fleet.devices.len().saturating_sub(1));
        self.finding.select(Some(0));
        self.status = format!("Läste {} konfigar", self.fleet.devices.len());
        Ok(())
    }

    fn generate(&mut self) {
        let result = (|| -> Result<usize> {
            let inv = Inventory::load_dir(&self.samples)?;
            let out = self.paths.first().cloned().unwrap_or_else(|| PathBuf::from("configs"));
            std::fs::create_dir_all(&out)?;
            let configs = generator::generate_all(&inv, &self.settings)?;
            for g in &configs {
                std::fs::write(out.join(format!("{}.cfg", g.hostname)), format!("{}\n", g.text))?;
            }
            if !self.paths.contains(&out) {
                self.paths.push(out);
            }
            Ok(configs.len())
        })();
        match result.and_then(|n| self.reload().map(|_| n)) {
            Ok(n) => self.status = format!("✔ Genererade {n} konfigar från {}", self.samples.display()),
            Err(e) => self.status = format!("✖ {e:#}"),
        }
    }

    fn export(&mut self) {
        let path = PathBuf::from("reports/rapport.html");
        let result = std::fs::create_dir_all("reports").and_then(|_| std::fs::write(&path, report::html(&self.fleet)));
        self.status = match result {
            Ok(()) => format!("✔ Sparade {}", path.display()),
            Err(e) => format!("✖ {e}"),
        };
    }

    fn findings_sorted(&self) -> Vec<&crate::finding::Finding> {
        let Some(d) = self.fleet.devices.get(self.device) else { return Vec::new() };
        let mut list: Vec<_> = d.findings().collect();
        list.sort_by_key(|f| std::cmp::Reverse(f.severity));
        list
    }

    fn on_key(&mut self, code: KeyCode, mods: KeyModifiers) {
        if self.help {
            self.help = false;
            return;
        }
        let n = self.fleet.devices.len().max(1);
        match code {
            KeyCode::Char('q') | KeyCode::Esc => self.quit = true,
            KeyCode::Char('c') if mods.contains(KeyModifiers::CONTROL) => self.quit = true,
            KeyCode::Char('?') => self.help = true,
            KeyCode::Char(c @ '1'..='6') => self.set_tab(c as usize - '1' as usize),
            KeyCode::Right | KeyCode::Char('l') => self.set_tab((self.tab + 1) % TABS.len()),
            KeyCode::Left | KeyCode::Char('h') => self.set_tab((self.tab + TABS.len() - 1) % TABS.len()),
            KeyCode::Tab => self.set_device((self.device + 1) % n),
            KeyCode::BackTab => self.set_device((self.device + n - 1) % n),
            KeyCode::Down | KeyCode::Char('j') => self.step(1),
            KeyCode::Up | KeyCode::Char('k') => self.step(-1),
            KeyCode::PageDown => self.step(15),
            KeyCode::PageUp => self.step(-15),
            KeyCode::Home => {
                self.scroll = 0;
                self.finding.select(Some(0));
            }
            KeyCode::Char('g') => self.generate(),
            KeyCode::Char('r') => {
                if let Err(e) = self.reload() {
                    self.status = format!("✖ {e:#}");
                }
            }
            KeyCode::Char('e') => self.export(),
            _ => {}
        }
    }

    fn set_tab(&mut self, tab: usize) {
        self.tab = tab;
        self.scroll = 0;
    }

    fn set_device(&mut self, d: usize) {
        self.device = d;
        self.scroll = 0;
        self.finding.select(Some(0));
    }

    fn step(&mut self, delta: i32) {
        if self.tab == 1 {
            let len = self.findings_sorted().len();
            if len > 0 {
                let cur = self.finding.selected().unwrap_or(0) as i32;
                self.finding.select(Some((cur + delta).clamp(0, len as i32 - 1) as usize));
            }
        } else if self.tab == 0 && (delta == 1 || delta == -1) {
            let n = self.fleet.devices.len().max(1) as i32;
            self.device = (self.device as i32 + delta).rem_euclid(n) as usize;
        } else {
            self.scroll = (self.scroll as i32 + delta).max(0) as u16;
        }
    }
}

pub fn run(paths: Vec<PathBuf>, samples: PathBuf, settings: Settings) -> Result<()> {
    let mut app = App::new(paths, samples, settings)?;
    let mut terminal = ratatui::init();
    let result = main_loop(&mut terminal, &mut app);
    ratatui::restore();
    result
}

fn main_loop(terminal: &mut DefaultTerminal, app: &mut App) -> Result<()> {
    while !app.quit {
        terminal.draw(|f| draw(f, app))?;
        if let Event::Key(key) = event::read()?
            && key.kind == KeyEventKind::Press {
                app.on_key(key.code, key.modifiers);
            }
    }
    Ok(())
}

fn panel(title: &str) -> Block<'static> {
    Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::new().fg(LINE))
        .title(Span::styled(format!(" {title} "), Style::new().fg(ACCENT).bold()))
        .style(Style::new().bg(PANEL).fg(TEXT))
        .padding(Padding::horizontal(1))
}

pub fn draw(f: &mut Frame, app: &mut App) {
    let area = f.area();
    f.render_widget(Block::default().style(Style::new().bg(BG)), area);
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Min(5), Constraint::Length(1)]).split(area);
    draw_header(f, app, rows[0]);

    let cols = Layout::horizontal([Constraint::Length(30), Constraint::Min(40)]).split(rows[1]);
    draw_devices(f, app, cols[0]);
    match app.tab {
        0 => draw_overview(f, app, cols[1]),
        1 => draw_findings(f, app, cols[1]),
        2 => draw_ports(f, app, cols[1]),
        3 => draw_vlans(f, app, cols[1]),
        4 => draw_topology(f, app, cols[1]),
        _ => draw_config(f, app, cols[1]),
    }
    draw_footer(f, app, rows[2]);
    if app.help {
        draw_help(f, area);
    }
}

fn draw_header(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::default().borders(Borders::BOTTOM).border_style(Style::new().fg(LINE)).style(Style::new().bg(BG));
    let inner = block.inner(area);
    f.render_widget(block, area);
    let cols = Layout::horizontal([Constraint::Length(24), Constraint::Min(10), Constraint::Length(22)]).split(inner);
    let title = Line::from(vec![
        Span::styled(" ◆ ", Style::new().fg(VIOLET).bold()),
        Span::styled("vlantool", Style::new().fg(TEXT).bold()),
        Span::styled(format!(" v{}", env!("CARGO_PKG_VERSION")), Style::new().fg(MUTED)),
    ]);
    f.render_widget(Paragraph::new(title), cols[0]);
    let tabs = Tabs::new(TABS.iter().enumerate().map(|(i, t)| Line::from(format!("{} {t}", i + 1))))
        .select(app.tab)
        .style(Style::new().fg(MUTED))
        .highlight_style(Style::new().fg(BG).bg(ACCENT).bold())
        .divider(Span::styled("│", Style::new().fg(LINE)));
    f.render_widget(tabs, cols[1]);
    let score = Line::from(vec![
        Span::styled("Nätet ", Style::new().fg(MUTED)),
        Span::styled(format!("{} ", app.fleet.score), Style::new().fg(score_color(app.fleet.score)).bold()),
        Span::styled(format!("{} ", app.fleet.grade), Style::new().fg(BG).bg(score_color(app.fleet.score)).bold()),
    ])
    .alignment(Alignment::Right);
    f.render_widget(Paragraph::new(score), cols[2]);
}

fn draw_devices(f: &mut Frame, app: &App, area: Rect) {
    let block = panel("Enheter");
    let inner = block.inner(area);
    f.render_widget(block, area);
    if app.fleet.devices.is_empty() {
        f.render_widget(Paragraph::new("Inga konfigar.\n\nTryck g för att\ngenerera från CSV.").fg(MUTED), inner);
        return;
    }
    let mut lines: Vec<Line> = Vec::new();
    for (i, d) in app.fleet.devices.iter().enumerate() {
        let sel = i == app.device;
        let icon = if d.config.kind == Kind::Router { "◉" } else { "▣" };
        let base = if sel { Style::new().bg(Color::Rgb(36, 44, 64)) } else { Style::new() };
        let width = inner.width.saturating_sub(2) as usize;
        let name: String = d.name.chars().take(width.saturating_sub(4)).collect();
        lines.push(Line::from(vec![
            Span::styled(if sel { "▌" } else { " " }, Style::new().fg(ACCENT)),
            Span::styled(format!("{icon} "), Style::new().fg(if sel { ACCENT } else { MUTED })),
            Span::styled(format!("{name:<w$}", w = width.saturating_sub(3)), Style::new().fg(TEXT).bold()),
        ]).style(base));
        let (full, empty) = report::bar(d.score, 12);
        let mut meta = vec![
            Span::raw("   "),
            Span::styled(full, Style::new().fg(score_color(d.score))),
            Span::styled(empty, Style::new().fg(LINE)),
            Span::styled(format!(" {:>3} {}", d.score, d.grade), Style::new().fg(score_color(d.score)).bold()),
        ];
        if let Some(w) = d.worst() {
            meta.push(Span::styled(format!(" {}", w.icon()), Style::new().fg(sev_color(w))));
        }
        lines.push(Line::from(meta).style(base));
        lines.push(Line::from(Span::styled(format!("   {} · {} fynd", d.kind, d.findings().count()), Style::new().fg(MUTED))).style(base));
        lines.push(Line::raw(""));
    }
    f.render_widget(Paragraph::new(lines), inner);
}

fn draw_overview(f: &mut Frame, app: &App, area: Rect) {
    let rows = Layout::vertical([Constraint::Length(5), Constraint::Length(9), Constraint::Min(4)]).split(area);
    let top = Layout::horizontal([Constraint::Percentage(50), Constraint::Percentage(50)]).split(rows[0]);

    let fleet = &app.fleet;
    let gauge = Gauge::default()
        .block(panel("Hela nätet"))
        .gauge_style(Style::new().fg(score_color(fleet.score)).bg(Color::Rgb(36, 42, 58)))
        .percent(fleet.score as u16)
        .label(Span::styled(format!("{}/100 · betyg {}", fleet.score, fleet.grade), Style::new().fg(TEXT).bold()))
        .use_unicode(true);
    f.render_widget(gauge, top[0]);

    let links = fleet.links.iter().filter(|l| l.b_port.is_some()).count();
    let rules_total: usize = fleet.devices.iter().map(|d| d.results.len()).sum();
    let rules_ok: usize = fleet.devices.iter().map(|d| d.passed()).sum();
    let stats = Paragraph::new(vec![
        Line::from(vec![
            Span::styled(format!("{} ", fleet.devices.len()), Style::new().fg(ACCENT).bold()),
            Span::styled("enheter   ", Style::new().fg(MUTED)),
            Span::styled(format!("{links} "), Style::new().fg(ACCENT).bold()),
            Span::styled("länkar   ", Style::new().fg(MUTED)),
            Span::styled(format!("{rules_ok}/{rules_total} "), Style::new().fg(GOOD).bold()),
            Span::styled("regler OK", Style::new().fg(MUTED)),
        ]),
        Line::from(vec![
            Span::styled(format!("{} ", app.csv_findings), Style::new().fg(if app.csv_findings == 0 { GOOD } else { sev_color(Severity::Medium) }).bold()),
            Span::styled(format!("anmärkningar i CSV-filerna ({}/)", app.samples.file_name().map_or_else(|| app.samples.display().to_string(), |n| n.to_string_lossy().to_string())), Style::new().fg(MUTED)),
        ]),
    ])
    .block(panel("Status"));
    f.render_widget(stats, top[1]);

    let bars: Vec<Bar> = Severity::ALL
        .iter()
        .map(|&s| {
            Bar::default()
                .value(fleet.count(s) as u64)
                .label(Line::from(s.label()))
                .style(Style::new().fg(sev_color(s)))
                .value_style(Style::new().fg(BG).bg(sev_color(s)).bold())
        })
        .collect();
    let chart = BarChart::default()
        .block(panel("Fynd per nivå"))
        .data(BarGroup::default().bars(&bars))
        .bar_width(9)
        .bar_gap(3)
        .label_style(Style::new().fg(MUTED));
    f.render_widget(chart, rows[1]);

    let mut items: Vec<ListItem> = Vec::new();
    for l in fleet.links.iter().filter(|l| l.b_port.is_some()) {
        items.push(ListItem::new(Line::from(vec![
            Span::styled(" ⇄ ", Style::new().fg(ACCENT)),
            Span::styled(format!("{} {}", l.a, l.a_port), Style::new().fg(TEXT)),
            Span::styled(" ── ", Style::new().fg(LINE)),
            Span::styled(format!("{} {}", l.b, l.b_port.as_deref().unwrap_or("")), Style::new().fg(TEXT)),
            Span::styled(format!("  {}", l.vlans), Style::new().fg(MUTED)),
        ])));
    }
    if fleet.cross.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(" ✔ Alla länkar och adresser stämmer överens", Style::new().fg(GOOD)))));
    }
    for c in &fleet.cross {
        items.push(ListItem::new(Line::from(vec![
            Span::styled(format!(" {} ", c.severity.icon()), Style::new().fg(sev_color(c.severity))),
            Span::styled(c.message.clone(), Style::new().fg(TEXT)),
        ])));
    }
    f.render_widget(List::new(items).block(panel("Mellan enheterna")), rows[2]);
}

fn draw_findings(f: &mut Frame, app: &mut App, area: Rect) {
    let cols = Layout::horizontal([Constraint::Percentage(48), Constraint::Percentage(52)]).split(area);
    let findings = app.findings_sorted();
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    let title = format!("Fynd – {} ({})", d.name, findings.len());
    if findings.is_empty() {
        f.render_widget(Paragraph::new("\n  ✔ Inga fynd – allt ser bra ut!").fg(GOOD).block(panel(&title)), area);
        return;
    }
    let items: Vec<ListItem> = findings
        .iter()
        .map(|fi| {
            ListItem::new(Line::from(vec![
                Span::styled(format!("{} {:<8}", fi.severity.icon(), fi.severity.label()), Style::new().fg(sev_color(fi.severity)).bold()),
                Span::styled(fi.message.clone(), Style::new().fg(TEXT)),
            ]))
        })
        .collect();
    let selected = app.finding.selected().unwrap_or(0).min(findings.len() - 1);
    let fi = findings[selected];
    let list = List::new(items)
        .block(panel(&title))
        .highlight_style(Style::new().bg(Color::Rgb(40, 50, 75)).add_modifier(Modifier::BOLD))
        .highlight_symbol("▌");
    let mut state = app.finding.clone();
    f.render_stateful_widget(list, cols[0], &mut state);

    // Detaljer om valt fynd.
    let rule = rules::find(&fi.rule);
    let mut lines = vec![
        Line::from(Span::styled(rule.map_or(fi.rule.as_str(), |r| r.title), Style::new().fg(TEXT).bold())),
        Line::from(vec![
            Span::styled(format!(" {} {} ", fi.severity.icon(), fi.severity.label()), Style::new().fg(BG).bg(sev_color(fi.severity)).bold()),
            Span::styled(format!("  regel {}", fi.rule), Style::new().fg(MUTED)),
            Span::styled(rule.map(|r| format!(" · {}", r.category)).unwrap_or_default(), Style::new().fg(MUTED)),
        ]),
        Line::raw(""),
        Line::from(Span::styled(fi.message.clone(), Style::new().fg(TEXT))),
    ];
    if let Some(r) = rule {
        lines.push(Line::raw(""));
        lines.push(Line::from(Span::styled("Varför?", Style::new().fg(VIOLET).bold())));
        lines.push(Line::from(Span::styled(r.why, Style::new().fg(MUTED))));
    }
    if !fi.fix.is_empty() {
        lines.push(Line::raw(""));
        lines.push(Line::from(Span::styled("Rättning", Style::new().fg(VIOLET).bold())));
        for l in &fi.fix {
            lines.push(Line::from(Span::styled(format!("  {l}"), Style::new().fg(ACCENT))));
        }
    }
    if let Some(no) = fi.line {
        lines.push(Line::raw(""));
        lines.push(Line::from(Span::styled(format!("I konfigen (rad {no})"), Style::new().fg(VIOLET).bold())));
        let from = no.saturating_sub(3).max(1);
        for l in d.config.lines.iter().filter(|l| l.no >= from && l.no <= no + 3) {
            let hit = l.no == no;
            lines.push(Line::from(vec![
                Span::styled(format!("{:>4} ", l.no), Style::new().fg(if hit { sev_color(fi.severity) } else { LINE })),
                Span::styled(
                    l.text.clone(),
                    if hit { Style::new().fg(TEXT).bg(Color::Rgb(60, 36, 44)) } else { Style::new().fg(MUTED) },
                ),
            ]));
        }
    }
    f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }).block(panel("Detaljer")), cols[1]);
}

fn draw_ports(f: &mut Frame, app: &App, area: Rect) {
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    let header = Row::new(["Port", "Läge", "VLAN", "Beskrivning", "Status", "Skydd"].map(|h| Cell::from(h).style(Style::new().fg(MUTED).bold())));
    let rows: Vec<Row> = d
        .config
        .interfaces
        .iter()
        .skip(app.scroll as usize)
        .map(|i| {
            let (mode, color) = match i.mode {
                IfMode::Access => ("access", GOOD),
                IfMode::Trunk => ("trunk", VIOLET),
                IfMode::Routed => ("routad", ACCENT),
                IfMode::Other => ("–", MUTED),
            };
            let vlan = match i.mode {
                IfMode::Access => i.access_vlan.unwrap_or(1).to_string(),
                IfMode::Trunk => format!(
                    "{} (n{})",
                    i.allowed.as_ref().map_or("alla".into(), |v| crate::inventory::join_vlans(v)),
                    i.native_vlan.unwrap_or(1)
                ),
                _ => i
                    .dot1q
                    .map(|v| format!("dot1Q {v}{}", if i.dot1q_native { " native" } else { "" }))
                    .or_else(|| i.ip.map(|(a, m)| format!("{a}/{}", crate::net::mask_to_prefix(m).unwrap_or(0))))
                    .unwrap_or_default(),
            };
            let status = if i.shutdown { Span::styled("● nere", Style::new().fg(sev_color(Severity::Critical))) } else { Span::styled("● uppe", Style::new().fg(GOOD)) };
            let guard = match (i.mode, i.portfast, i.bpduguard) {
                (IfMode::Access, true, true) => Span::styled("✔ portfast+bpdu", Style::new().fg(GOOD)),
                (IfMode::Access, _, _) => Span::styled("✖ saknas", Style::new().fg(sev_color(Severity::Low))),
                _ => Span::raw(""),
            };
            Row::new(vec![
                Cell::from(short_port(&i.name)).style(Style::new().fg(TEXT).bold()),
                Cell::from(mode).style(Style::new().fg(color)),
                Cell::from(vlan),
                Cell::from(i.description.clone()).style(Style::new().fg(MUTED)),
                Cell::from(status),
                Cell::from(guard),
            ])
        })
        .collect();
    let table = Table::new(
        rows,
        [Constraint::Length(10), Constraint::Length(8), Constraint::Length(18), Constraint::Min(16), Constraint::Length(8), Constraint::Length(16)],
    )
    .header(header)
    .column_spacing(2)
    .block(panel(&format!("Portar – {} ({} st)", d.name, d.config.interfaces.len())));
    f.render_widget(table, area);
}

fn draw_vlans(f: &mut Frame, app: &App, area: Rect) {
    let devices = &app.fleet.devices;
    let mut vlans: BTreeSet<u16> = BTreeSet::new();
    for d in devices {
        vlans.extend(d.config.vlans.keys());
        vlans.extend(d.config.interfaces.iter().filter_map(|i| i.access_vlan.or(i.dot1q)));
    }
    let name_of = |v: u16| devices.iter().find_map(|d| d.config.vlans.get(&v).filter(|n| !n.is_empty()).cloned()).unwrap_or_default();

    let mut header = vec![Cell::from("VLAN").style(Style::new().fg(MUTED).bold()), Cell::from("Namn").style(Style::new().fg(MUTED).bold())];
    header.extend(devices.iter().map(|d| Cell::from(d.name.clone()).style(Style::new().fg(MUTED).bold())));
    let rows: Vec<Row> = vlans
        .iter()
        .skip(app.scroll as usize)
        .map(|&v| {
            let mut cells = vec![Cell::from(v.to_string()).style(Style::new().fg(ACCENT).bold()), Cell::from(name_of(v)).style(Style::new().fg(TEXT))];
            for d in devices {
                let access = d.config.interfaces.iter().filter(|i| i.mode == IfMode::Access && i.access_vlan == Some(v)).count();
                let trunk = d.config.interfaces.iter().filter(|i| i.mode == IfMode::Trunk && i.allowed.as_ref().is_none_or(|a| a.contains(&v))).count();
                let native = d.config.interfaces.iter().any(|i| (i.mode == IfMode::Trunk && i.native_vlan == Some(v)) || (i.dot1q == Some(v) && i.dot1q_native));
                let gw = d.config.interfaces.iter().find(|i| (i.dot1q == Some(v) && !i.dot1q_native) || i.svi_vlan() == Some(v)).and_then(|i| i.ip);
                let defined = d.config.vlans.contains_key(&v);
                let mut spans = Vec::new();
                if access > 0 {
                    spans.push(Span::styled(format!("■{access} "), Style::new().fg(GOOD)));
                }
                if trunk > 0 {
                    spans.push(Span::styled(format!("⇅{trunk} "), Style::new().fg(VIOLET)));
                }
                if native {
                    spans.push(Span::styled("native ", Style::new().fg(sev_color(Severity::Medium))));
                }
                if let Some((ip, _)) = gw {
                    spans.push(Span::styled(format!("◉{ip}"), Style::new().fg(ACCENT)));
                }
                if spans.is_empty() {
                    spans.push(Span::styled(if defined { "· definierat" } else { "–" }, Style::new().fg(LINE)));
                } else if !defined && d.config.kind == Kind::Switch {
                    spans.push(Span::styled(" ✖saknas", Style::new().fg(sev_color(Severity::High))));
                }
                cells.push(Cell::from(Line::from(spans)));
            }
            Row::new(cells)
        })
        .collect();
    let mut widths = vec![Constraint::Length(6), Constraint::Length(12)];
    widths.extend(devices.iter().map(|_| Constraint::Min(19)));
    let table = Table::new(rows, widths).header(Row::new(header)).column_spacing(2).block(panel("VLAN-matris   ■ accessportar  ⇅ trunkar  ◉ gateway"));
    f.render_widget(table, area);
}

fn draw_topology(f: &mut Frame, app: &App, area: Rect) {
    let configs: Vec<_> = app.fleet.devices.iter().map(|d| d.config.clone()).collect();
    let lines: Vec<Line> = topology::tree(&configs)
        .into_iter()
        .map(|l| {
            let (icon, color) = match l.kind {
                Some(Kind::Router) => ("◉", ACCENT),
                Some(Kind::Switch) => ("▣", VIOLET),
                Some(Kind::Unknown) => ("◇", MUTED),
                None => ("○", MUTED),
            };
            let mut spans = vec![Span::styled(l.prefix.clone(), Style::new().fg(LINE))];
            if !l.port.is_empty() {
                spans.push(Span::styled(format!("{} ", l.port), Style::new().fg(Color::Rgb(200, 170, 255))));
            }
            let name_style = if l.device { Style::new().fg(color).bold() } else { Style::new().fg(TEXT) };
            spans.push(Span::styled(format!("{icon} {}", l.peer), name_style));
            if l.device
                && let Some(k) = l.kind {
                    spans.push(Span::styled(format!(" ({})", k.label()), Style::new().fg(MUTED)));
                }
            spans.push(Span::styled(format!("  {}", l.info), Style::new().fg(MUTED)));
            if l.down {
                spans.push(Span::styled("  [avstängd]", Style::new().fg(sev_color(Severity::Critical))));
            }
            Line::from(spans)
        })
        .collect();
    let total = lines.len() as u16;
    f.render_widget(Paragraph::new(lines).scroll((app.scroll.min(total.saturating_sub(1)), 0)).block(panel("Topologi (från portbeskrivningar)")), area);
}

/// Enkel syntaxfärgning för IOS-rader.
fn highlight(text: &str) -> Vec<Span<'static>> {
    if text.starts_with('!') {
        return vec![Span::styled(text.to_string(), Style::new().fg(Color::Rgb(90, 98, 120)).italic())];
    }
    let indent = text.len() - text.trim_start().len();
    let t = text.trim_start();
    let mut spans = vec![Span::raw(" ".repeat(indent))];
    let (first, rest) = t.split_once(' ').unwrap_or((t, ""));
    let head = if t.starts_with("no ") { Style::new().fg(sev_color(Severity::High)) } else if indent == 0 { Style::new().fg(ACCENT).bold() } else { Style::new().fg(VIOLET) };
    spans.push(Span::styled(first.to_string(), head));
    for word in rest.split(' ') {
        let style = if crate::net::parse_ip(word).is_some() {
            Style::new().fg(Color::Rgb(240, 200, 110))
        } else if word.chars().all(|c| c.is_ascii_digit() || c == ',' || c == '-') && !word.is_empty() {
            Style::new().fg(Color::Rgb(250, 160, 120))
        } else if word.contains("Ethernet") || word.starts_with("Vlan") {
            Style::new().fg(GOOD)
        } else {
            Style::new().fg(TEXT)
        };
        spans.push(Span::raw(" "));
        spans.push(Span::styled(word.to_string(), style));
    }
    spans
}

fn draw_config(f: &mut Frame, app: &App, area: Rect) {
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    let marks: std::collections::HashMap<usize, Severity> = d.findings().filter_map(|fi| fi.line.map(|l| (l, fi.severity))).fold(Default::default(), |mut m, (l, s)| {
        let e = m.entry(l).or_insert(s);
        *e = (*e).max(s);
        m
    });
    let lines: Vec<Line> = d
        .config
        .lines
        .iter()
        .map(|l| {
            let mut spans = vec![
                match marks.get(&l.no) {
                    Some(s) => Span::styled(format!("{} ", s.icon()), Style::new().fg(sev_color(*s))),
                    None => Span::raw("  "),
                },
                Span::styled(format!("{:>4} │ ", l.no), Style::new().fg(LINE)),
            ];
            spans.extend(highlight(&l.text));
            Line::from(spans)
        })
        .collect();
    let total = lines.len();
    let scroll = (app.scroll as usize).min(total.saturating_sub(1));
    f.render_widget(
        Paragraph::new(lines).scroll((scroll as u16, 0)).block(panel(&format!("{}  ·  {} rader", d.config.path, total))),
        area,
    );
    let mut sb = ScrollbarState::new(total).position(scroll);
    f.render_stateful_widget(
        Scrollbar::new(ScrollbarOrientation::VerticalRight).symbols(symbols::scrollbar::VERTICAL).style(Style::new().fg(LINE)).thumb_style(Style::new().fg(ACCENT)),
        area.inner(ratatui::layout::Margin { vertical: 1, horizontal: 0 }),
        &mut sb,
    );
}

fn draw_footer(f: &mut Frame, app: &App, area: Rect) {
    let keys = [("1-6", "flik"), ("Tab", "enhet"), ("↑↓", "bläddra"), ("g", "generera"), ("r", "läs om"), ("e", "HTML"), ("?", "hjälp"), ("q", "avsluta")];
    let mut spans = Vec::new();
    for (k, v) in keys {
        spans.push(Span::styled(format!(" {k} "), Style::new().fg(BG).bg(MUTED).bold()));
        spans.push(Span::styled(format!(" {v}  "), Style::new().fg(MUTED)));
    }
    let cols = Layout::new(Direction::Horizontal, [Constraint::Min(10), Constraint::Length(44)]).split(area);
    f.render_widget(Paragraph::new(Line::from(spans)).style(Style::new().bg(BG)), cols[0]);
    let color = if app.status.starts_with('✖') { sev_color(Severity::Critical) } else { GOOD };
    f.render_widget(Paragraph::new(Line::from(Span::styled(app.status.clone(), Style::new().fg(color))).alignment(Alignment::Right)).style(Style::new().bg(BG)), cols[1]);
}

fn draw_help(f: &mut Frame, area: Rect) {
    let w = 58.min(area.width);
    let h = 20.min(area.height);
    let rect = Rect::new(area.x + (area.width - w) / 2, area.y + (area.height - h) / 2, w, h);
    f.render_widget(Clear, rect);
    let rows = [
        ("1 – 6, ← →", "Byt flik"),
        ("Tab / Shift+Tab", "Nästa / föregående enhet"),
        ("↑ ↓  j k", "Välj fynd / bläddra"),
        ("PgUp PgDn", "Bläddra en sida"),
        ("g", "Generera konfigar från CSV och granska"),
        ("r", "Läs om konfigfilerna"),
        ("e", "Spara HTML-rapport i reports/"),
        ("q  Esc", "Avsluta"),
    ];
    let mut lines = vec![Line::raw("")];
    for (k, v) in rows {
        lines.push(Line::from(vec![Span::styled(format!("  {k:<18}"), Style::new().fg(ACCENT).bold()), Span::styled(v, Style::new().fg(TEXT))]));
    }
    lines.push(Line::raw(""));
    lines.push(Line::from(Span::styled("  Nivåer", Style::new().fg(VIOLET).bold())));
    lines.push(Line::from(
        Severity::ALL
            .iter()
            .flat_map(|s| [Span::styled(format!("  {} {}", s.icon(), s.label()), Style::new().fg(sev_color(*s)))])
            .collect::<Vec<_>>(),
    ));
    lines.push(Line::raw(""));
    lines.push(Line::from(Span::styled("  Tryck valfri tangent för att stänga", Style::new().fg(MUTED))));
    f.render_widget(Paragraph::new(Text::from(lines)).block(panel("Hjälp").border_style(Style::new().fg(ACCENT))), rect);
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;

    #[test]
    fn renders_every_tab() {
        let dir = std::env::temp_dir().join(format!("vlantool-tui-{}", std::process::id()));
        let samples = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("samples");
        let mut app = App::new(vec![dir.clone()], samples, Settings::default()).unwrap();
        assert!(app.fleet.devices.len() >= 3, "TUI:t ska generera konfigar om inga finns");
        let mut term = Terminal::new(TestBackend::new(140, 40)).unwrap();
        for tab in 0..TABS.len() {
            app.set_tab(tab);
            term.draw(|f| draw(f, &mut app)).unwrap();
        }
        app.help = true;
        term.draw(|f| draw(f, &mut app)).unwrap();
        let _ = std::fs::remove_dir_all(dir);
    }

    /// `cargo test snapshot -- --ignored --nocapture` skriver ut varje flik som text.
    #[test]
    #[ignore]
    fn snapshot() {
        let samples = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("samples");
        let cfgs = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("examples-cfg");
        let mut app = App::new(vec![cfgs], samples, Settings::default()).unwrap();
        let mut term = Terminal::new(TestBackend::new(130, 38)).unwrap();
        for tab in 0..TABS.len() {
            app.set_tab(tab);
            term.draw(|f| draw(f, &mut app)).unwrap();
            let buf = term.backend().buffer().clone();
            for y in 0..buf.area.height {
                let line: String = (0..buf.area.width).map(|x| buf[(x, y)].symbol().to_string()).collect();
                println!("{line}");
            }
        }
    }
}
