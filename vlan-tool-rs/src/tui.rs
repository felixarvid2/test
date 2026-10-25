//! Interaktiv översikt i terminalen.
//!
//! Tangenter: 1–9 / ←→ byter flik, Tab byter enhet, ↑↓ bläddrar, / söker, f filtrerar på nivå,
//! Enter hoppar till raden, c kopierar rättningen, t byter tema, g genererar om från CSV,
//! r läser om, e sparar HTML-rapport, ? hjälp (alla tangenter), q avslutar. Musen klickar och scrollar.
//! Filer som ändras läses om automatiskt.

use crate::audit::{self, FleetReport};
use crate::finding::Severity;
use crate::inventory::{short_port, Inventory};
use crate::parser::{IfMode, Kind};
use crate::settings::Settings;
use crate::{generator, report, rules, topology};
use anyhow::Result;
use crossterm::event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind, KeyModifiers, MouseButton, MouseEvent, MouseEventKind};
use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::symbols;
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{
    Bar, BarChart, BarGroup, Block, BorderType, Borders, Cell, Clear, Gauge, List, ListItem, ListState, Padding, Paragraph, Row, Scrollbar,
    ScrollbarOrientation, ScrollbarState, Table, Wrap,
};
use ratatui::{DefaultTerminal, Frame};
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

// Färgpalett: mörkt tema som standard, ljust med `t`.
static LIGHT: AtomicBool = AtomicBool::new(false);

fn pick(dark: (u8, u8, u8), light: (u8, u8, u8)) -> Color {
    let (r, g, b) = if LIGHT.load(Ordering::Relaxed) { light } else { dark };
    Color::Rgb(r, g, b)
}

fn bg() -> Color {
    pick((16, 19, 27), (240, 243, 249))
}
fn panel_bg() -> Color {
    pick((24, 28, 39), (255, 255, 255))
}
fn line() -> Color {
    pick((52, 60, 80), (196, 204, 222))
}
fn text() -> Color {
    pick((226, 230, 240), (28, 32, 44))
}
fn muted() -> Color {
    pick((132, 140, 160), (96, 104, 124))
}
fn accent() -> Color {
    pick((122, 162, 255), (36, 86, 200))
}
fn violet() -> Color {
    pick((190, 160, 255), (112, 66, 196))
}
fn good() -> Color {
    pick((110, 210, 140), (24, 134, 66))
}
/// Markerad rad i listor och enhetspanelen.
fn sel_bg() -> Color {
    pick((36, 44, 64), (214, 226, 250))
}
fn sel_bg2() -> Color {
    pick((40, 50, 75), (206, 220, 248))
}
/// Tom del av mätare.
fn track() -> Color {
    pick((36, 42, 58), (216, 222, 236))
}
/// Raden ett fynd eller en sökträff pekar på.
fn hit_bg() -> Color {
    pick((60, 36, 44), (252, 222, 226))
}
fn find_bg() -> Color {
    pick((58, 52, 24), (255, 240, 176))
}
fn comment() -> Color {
    pick((90, 98, 120), (140, 148, 168))
}

fn rgb((r, g, b): (u8, u8, u8)) -> Color {
    Color::Rgb(r, g, b)
}

fn sev_color(s: Severity) -> Color {
    rgb(s.rgb())
}

fn score_color(score: u32) -> Color {
    rgb(report::score_rgb(score))
}

const TABS: [&str; 9] = ["Översikt", "Fynd", "Portar", "VLAN", "Topologi", "Konfig", "Drift", "CSV", "Regler"];
const TAB_FINDINGS: usize = 1;
const TAB_CONFIG: usize = 5;

/// Filer som TUI:t och `vlantool watch` bevakar: konfigfiler och CSV-filer i de angivna sökvägarna,
/// med ändringstid. Två lika listor betyder att inget har ändrats.
pub fn watch_snapshot(paths: &[PathBuf]) -> Vec<(PathBuf, Option<std::time::SystemTime>)> {
    const EXT: [&str; 4] = ["cfg", "txt", "conf", "csv"];
    let mut files = Vec::new();
    for p in paths {
        if p.is_dir() {
            if let Ok(rd) = std::fs::read_dir(p) {
                files.extend(rd.flatten().map(|e| e.path()).filter(|f| f.extension().is_some_and(|e| EXT.iter().any(|x| e.eq_ignore_ascii_case(x)))));
            }
        } else if p.is_file() {
            files.push(p.clone());
        }
    }
    files.sort();
    files.into_iter().map(|f| { let t = std::fs::metadata(&f).and_then(|m| m.modified()).ok(); (f, t) }).collect()
}

/// Base64 (RFC 4648) – bara för OSC 52, så ingen extra crate behövs.
fn base64(data: &[u8]) -> String {
    const ABC: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ABC[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Escape-sekvens som ber terminalen lägga texten i urklipp.
fn osc52(text: &str) -> String {
    format!("\x1b]52;c;{}\x07", base64(text.as_bytes()))
}

/// Resultatet av jämförelsen mellan CSV-filerna och sparade konfigar för en enhet.
struct DriftRow {
    host: String,
    /// None = konfigen finns inte sparad än, annars (tillagda, borttagna) rader.
    change: Option<(usize, usize)>,
    diff: Vec<String>,
}

/// Vad tangenttryckningar just nu skrivs till.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Input {
    FindingSearch,
    ConfigSearch,
}

/// Områden som senaste bilden ritade, så att musklick kan översättas till val.
#[derive(Default)]
struct Hits {
    tabs: Vec<Rect>,
    devices: Rect,
    list: Rect,
    list_offset: usize,
}

fn contains(r: Rect, x: u16, y: u16) -> bool {
    x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
}

pub struct App {
    paths: Vec<PathBuf>,
    samples: PathBuf,
    settings: Settings,
    fleet: FleetReport,
    csv_findings: usize,
    csv_list: Vec<crate::finding::Finding>,
    drift: std::result::Result<Vec<DriftRow>, String>,
    tab: usize,
    device: usize,
    finding: ListState,
    scroll: u16,
    help: bool,
    status: String,
    quit: bool,
    // Sök, filter och markeringar
    input: Option<Input>,
    query: String,
    cfg_query: String,
    min_level: Option<Severity>,
    focus_line: Option<usize>,
    // Filbevakning och statusrad
    watched: Vec<(PathBuf, Option<std::time::SystemTime>)>,
    last_check: Instant,
    loaded: Instant,
    auto_reload: bool,
    // Text som ska skickas till terminalen (OSC 52) nästa varv i huvudloopen.
    pending_osc: Option<String>,
    hits: Hits,
}

impl App {
    pub fn new(paths: Vec<PathBuf>, samples: PathBuf, settings: Settings) -> Result<Self> {
        let mut app = App {
            paths,
            samples,
            settings,
            fleet: audit::audit_fleet(Vec::new(), &[]),
            csv_findings: 0,
            csv_list: Vec::new(),
            drift: Ok(Vec::new()),
            tab: 0,
            device: 0,
            finding: ListState::default().with_selected(Some(0)),
            scroll: 0,
            help: false,
            status: String::new(),
            quit: false,
            input: None,
            query: String::new(),
            cfg_query: String::new(),
            min_level: None,
            focus_line: None,
            watched: Vec::new(),
            last_check: Instant::now(),
            loaded: Instant::now(),
            auto_reload: true,
            pending_osc: None,
            hits: Hits::default(),
        };
        app.reload()?;
        if app.fleet.devices.is_empty() && app.samples.is_dir() {
            app.generate();
        }
        Ok(app)
    }

    fn watch_paths(&self) -> Vec<PathBuf> {
        let mut v = self.paths.clone();
        v.push(self.samples.clone());
        v
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
        match Inventory::load_dir(&self.samples) {
            Ok(inv) => {
                self.csv_list = inv.validate(self.settings.native_vlan, self.settings.mgmt_vlan);
                self.csv_findings = self.csv_list.iter().filter(|f| f.severity >= Severity::Low).count();
            }
            Err(_) => {
                self.csv_list.clear();
                self.csv_findings = 0;
            }
        }
        self.drift = self.compute_drift();
        self.device = self.device.min(self.fleet.devices.len().saturating_sub(1));
        let len = self.findings_sorted().len();
        self.finding.select(Some(self.finding.selected().unwrap_or(0).min(len.saturating_sub(1))));
        self.focus_line = None;
        self.status = format!("Läste {} konfigar", self.fleet.devices.len());
        self.loaded = Instant::now();
        self.watched = watch_snapshot(&self.watch_paths());
        Ok(())
    }

    /// Jämför det CSV-filerna säger med de sparade konfigarna (samma sak som `vlantool drift`).
    fn compute_drift(&self) -> std::result::Result<Vec<DriftRow>, String> {
        let inv = Inventory::load_dir(&self.samples).map_err(|e| format!("{e:#}"))?;
        let dir = self.paths.first().cloned().unwrap_or_else(|| PathBuf::from("configs"));
        let generated = generator::generate_all(&inv, &self.settings).map_err(|e| format!("{e:#}"))?;
        Ok(generated
            .into_iter()
            .map(|g| {
                let path = dir.join(format!("{}.cfg", g.hostname));
                match std::fs::read_to_string(&path) {
                    Err(_) => DriftRow { host: g.hostname, change: None, diff: Vec::new() },
                    Ok(saved) => {
                        let (text, stats) = crate::diff::diff(&path.display().to_string(), &saved, "från CSV", &g.text, report::Paint(false));
                        let diff = if stats.added + stats.removed == 0 { Vec::new() } else { text.lines().map(str::to_string).collect() };
                        DriftRow { host: g.hostname, change: Some((stats.added, stats.removed)), diff }
                    }
                }
            })
            .collect())
    }

    /// Anropas ofta från huvudloopen: läser om automatiskt en gång i sekunden om en fil ändrats.
    fn tick(&mut self) {
        if self.last_check.elapsed() < Duration::from_secs(1) {
            return;
        }
        self.last_check = Instant::now();
        if !self.auto_reload || watch_snapshot(&self.watch_paths()) == self.watched {
            return;
        }
        match self.reload() {
            Ok(()) => self.status = format!("↻ Filer ändrades – läste om {} konfigar", self.fleet.devices.len()),
            Err(e) => {
                self.watched = watch_snapshot(&self.watch_paths());
                self.status = format!("✖ {e:#}");
            }
        }
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

    /// Fynden för vald enhet, allvarligast först, med nivåfilter (`f`) och sökning (`/`) tillämpade.
    fn findings_sorted(&self) -> Vec<&crate::finding::Finding> {
        let Some(d) = self.fleet.devices.get(self.device) else { return Vec::new() };
        let q = self.query.to_lowercase();
        let mut list: Vec<_> = d
            .findings()
            .filter(|f| self.min_level.is_none_or(|m| f.severity >= m))
            .filter(|f| q.is_empty() || f.message.to_lowercase().contains(&q) || f.rule.to_lowercase().contains(&q) || f.fix.iter().any(|l| l.to_lowercase().contains(&q)))
            .collect();
        list.sort_by_key(|f| std::cmp::Reverse(f.severity));
        list
    }

    /// Radnummer (1-baserade) i vald enhets konfig som innehåller sökordet i konfigfliken.
    fn config_matches(&self) -> Vec<usize> {
        let q = self.cfg_query.to_lowercase();
        let Some(d) = self.fleet.devices.get(self.device) else { return Vec::new() };
        if q.is_empty() {
            return Vec::new();
        }
        d.config.lines.iter().filter(|l| l.text.to_lowercase().contains(&q)).map(|l| l.no).collect()
    }

    fn jump_to_line(&mut self, no: usize) {
        self.scroll = no.saturating_sub(4).min(u16::MAX as usize) as u16;
    }

    /// Hoppa till nästa (`forward`) eller föregående sökträff i konfigfliken.
    fn next_match(&mut self, forward: bool) {
        let m = self.config_matches();
        if m.is_empty() {
            self.status = if self.cfg_query.is_empty() { "Sök i konfigen med /".into() } else { format!("Inga träffar på '{}'", self.cfg_query) };
            return;
        }
        let cur = self.scroll as usize + 4;
        let target = if forward { m.iter().find(|&&l| l > cur).or(m.first()) } else { m.iter().rev().find(|&&l| l < cur).or(m.last()) };
        if let Some(&no) = target {
            self.focus_line = Some(no);
            self.jump_to_line(no);
            let idx = m.iter().position(|&l| l == no).map_or(0, |i| i + 1);
            self.status = format!("Träff {idx}/{} på '{}'", m.len(), self.cfg_query);
        }
    }

    /// Skriver tangenttryckningar till sökfältet; Enter bekräftar, Esc rensar.
    fn on_input_key(&mut self, code: KeyCode, target: Input) {
        let field = match target {
            Input::FindingSearch => &mut self.query,
            Input::ConfigSearch => &mut self.cfg_query,
        };
        match code {
            KeyCode::Enter => self.input = None,
            KeyCode::Esc => {
                field.clear();
                self.input = None;
            }
            KeyCode::Backspace => {
                field.pop();
            }
            KeyCode::Char(c) => field.push(c),
            _ => return,
        }
        match target {
            Input::FindingSearch => self.finding.select(Some(0)),
            Input::ConfigSearch => {
                // Hoppa till första träffen medan man skriver.
                if let Some(&no) = self.config_matches().first() {
                    self.focus_line = Some(no);
                    self.jump_to_line(no);
                }
            }
        }
    }

    fn on_key(&mut self, code: KeyCode, mods: KeyModifiers) {
        if let Some(target) = self.input {
            self.on_input_key(code, target);
            return;
        }
        if self.help {
            self.help = false;
            return;
        }
        let n = self.fleet.devices.len().max(1);
        match code {
            KeyCode::Esc if !self.query.is_empty() || self.min_level.is_some() => {
                self.query.clear();
                self.min_level = None;
                self.finding.select(Some(0));
                self.status = "Rensade sök och filter".into();
            }
            KeyCode::Char('q') | KeyCode::Esc => self.quit = true,
            KeyCode::Char('c') if mods.contains(KeyModifiers::CONTROL) => self.quit = true,
            KeyCode::Char('?') => self.help = true,
            KeyCode::Char(c @ '1'..='9') if (c as usize - '1' as usize) < TABS.len() => self.set_tab(c as usize - '1' as usize),
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
            KeyCode::Char('/') => match self.tab {
                TAB_FINDINGS => self.input = Some(Input::FindingSearch),
                TAB_CONFIG => self.input = Some(Input::ConfigSearch),
                _ => self.status = "Sök fungerar i flikarna Fynd (2) och Konfig (6)".into(),
            },
            KeyCode::Char('n') if self.tab == TAB_CONFIG => self.next_match(true),
            KeyCode::Char('N') if self.tab == TAB_CONFIG => self.next_match(false),
            KeyCode::Char('f') => self.cycle_level(),
            KeyCode::Enter if self.tab == TAB_FINDINGS => self.open_finding_in_config(),
            KeyCode::Char('c') => self.copy_fix(),
            KeyCode::Char('t') => {
                let light = !LIGHT.load(Ordering::Relaxed);
                LIGHT.store(light, Ordering::Relaxed);
                self.status = format!("{} tema", if light { "Ljust" } else { "Mörkt" });
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

    /// `f`: visa alla fynd -> minst låg -> medel -> hög -> kritisk -> alla.
    fn cycle_level(&mut self) {
        self.min_level = match self.min_level {
            None => Some(Severity::Low),
            Some(Severity::Low) => Some(Severity::Medium),
            Some(Severity::Medium) => Some(Severity::High),
            Some(Severity::High) => Some(Severity::Critical),
            _ => None,
        };
        self.finding.select(Some(0));
        self.status = match self.min_level {
            Some(s) => format!("Visar fynd från nivå {} och uppåt", s.label()),
            None => "Visar alla nivåer".into(),
        };
    }

    /// Enter på ett fynd: hoppa till dess rad i konfigfliken.
    fn open_finding_in_config(&mut self) {
        let findings = self.findings_sorted();
        let Some(f) = findings.get(self.finding.selected().unwrap_or(0)) else { return };
        match f.line {
            Some(no) => {
                self.set_tab(TAB_CONFIG);
                self.focus_line = Some(no);
                self.jump_to_line(no);
                self.status = format!("Rad {no} i konfigen");
            }
            None => self.status = "Fyndet pekar inte på någon rad".into(),
        }
    }

    /// `c`: lägg det valda fyndets rättning i urklipp via OSC 52.
    fn copy_fix(&mut self) {
        if self.tab != TAB_FINDINGS {
            self.status = "c kopierar rättningen för valt fynd i fliken Fynd (2)".into();
            return;
        }
        let findings = self.findings_sorted();
        let Some(f) = findings.get(self.finding.selected().unwrap_or(0)) else { return };
        if f.fix.is_empty() {
            self.status = "Fyndet har ingen rättning att kopiera".into();
            return;
        }
        let text = f.fix.join("\n");
        let n = f.fix.len();
        self.pending_osc = Some(osc52(&text));
        self.status = format!("✔ Kopierade {n} rader till urklipp (OSC 52)");
    }

    fn set_tab(&mut self, tab: usize) {
        self.tab = tab;
        self.scroll = 0;
    }

    fn set_device(&mut self, d: usize) {
        self.device = d;
        self.scroll = 0;
        self.focus_line = None;
        self.finding.select(Some(0));
    }

    fn step(&mut self, delta: i32) {
        if self.tab == TAB_FINDINGS {
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

    pub fn on_mouse(&mut self, ev: MouseEvent) {
        if self.help {
            if matches!(ev.kind, MouseEventKind::Down(_)) {
                self.help = false;
            }
            return;
        }
        match ev.kind {
            MouseEventKind::ScrollDown => self.scroll_by(3),
            MouseEventKind::ScrollUp => self.scroll_by(-3),
            MouseEventKind::Down(MouseButton::Left) => {
                let (x, y) = (ev.column, ev.row);
                if let Some(i) = self.hits.tabs.iter().position(|r| contains(*r, x, y)) {
                    self.set_tab(i);
                } else if contains(self.hits.devices, x, y) {
                    // Varje enhet tar fyra rader i panelen.
                    let i = (y - self.hits.devices.y) as usize / 4;
                    if i < self.fleet.devices.len() {
                        self.set_device(i);
                    }
                } else if self.tab == TAB_FINDINGS && contains(self.hits.list, x, y) {
                    let i = self.hits.list_offset + (y - self.hits.list.y) as usize;
                    if i < self.findings_sorted().len() {
                        self.finding.select(Some(i));
                    }
                }
            }
            _ => {}
        }
    }

    /// Hjulet: flytta valet i fyndlistan, annars bläddra.
    fn scroll_by(&mut self, delta: i32) {
        if self.tab == 0 {
            return;
        }
        self.step(delta);
    }
}

pub fn run(paths: Vec<PathBuf>, samples: PathBuf, settings: Settings) -> Result<()> {
    let mut app = App::new(paths, samples, settings)?;
    let mut terminal = ratatui::init();
    let _ = crossterm::execute!(std::io::stdout(), EnableMouseCapture);
    let result = main_loop(&mut terminal, &mut app);
    let _ = crossterm::execute!(std::io::stdout(), DisableMouseCapture);
    ratatui::restore();
    result
}

fn main_loop(terminal: &mut DefaultTerminal, app: &mut App) -> Result<()> {
    while !app.quit {
        terminal.draw(|f| draw(f, app))?;
        if let Some(osc) = app.pending_osc.take() {
            use std::io::Write;
            let mut out = std::io::stdout();
            out.write_all(osc.as_bytes())?;
            out.flush()?;
        }
        // Vänta högst 250 ms på tangent så att filbevakningen får köra.
        if event::poll(Duration::from_millis(250))? {
            match event::read()? {
                Event::Key(key) if key.kind == KeyEventKind::Press => app.on_key(key.code, key.modifiers),
                Event::Mouse(m) => app.on_mouse(m),
                _ => {}
            }
        }
        app.tick();
    }
    Ok(())
}

fn panel(title: &str) -> Block<'static> {
    Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::new().fg(line()))
        .title(Span::styled(format!(" {title} "), Style::new().fg(accent()).bold()))
        .style(Style::new().bg(panel_bg()).fg(text()))
        .padding(Padding::horizontal(1))
}

pub fn draw(f: &mut Frame, app: &mut App) {
    let area = f.area();
    f.render_widget(Block::default().style(Style::new().bg(bg())), area);
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Min(5), Constraint::Length(2)]).split(area);
    draw_header(f, app, rows[0]);

    // Smalt fönster: ingen sidopanel (byt enhet med Tab).
    let main = if area.width < 100 {
        app.hits.devices = Rect::default();
        rows[1]
    } else {
        let cols = Layout::horizontal([Constraint::Length(30), Constraint::Min(40)]).split(rows[1]);
        draw_devices(f, app, cols[0]);
        cols[1]
    };
    app.hits.list = Rect::default();
    match app.tab {
        0 => draw_overview(f, app, main),
        1 => draw_findings(f, app, main),
        2 => draw_ports(f, app, main),
        3 => draw_vlans(f, app, main),
        4 => draw_topology(f, app, main),
        5 => draw_config(f, app, main),
        6 => draw_drift(f, app, main),
        7 => draw_csv(f, app, main),
        _ => draw_rules(f, app, main),
    }
    draw_footer(f, app, rows[2]);
    if app.help {
        draw_help(f, area);
    }
}

fn draw_header(f: &mut Frame, app: &mut App, area: Rect) {
    let block = Block::default().borders(Borders::BOTTOM).border_style(Style::new().fg(line())).style(Style::new().bg(bg()));
    let inner = block.inner(area);
    f.render_widget(block, area);
    let cols = Layout::horizontal([Constraint::Length(18), Constraint::Min(10), Constraint::Length(16)]).split(inner);
    let title = Line::from(vec![
        Span::styled(" ◆ ", Style::new().fg(violet()).bold()),
        Span::styled("vlantool", Style::new().fg(text()).bold()),
        Span::styled(format!(" v{}", env!("CARGO_PKG_VERSION")), Style::new().fg(muted())),
    ]);
    f.render_widget(Paragraph::new(title), cols[0]);
    // Flikarna ritas för hand så att varje flik får en klickyta. Får de inte plats
    // visas bara numret, utom för den valda fliken.
    let full: usize = TABS.iter().enumerate().map(|(i, t)| format!(" {} {t} ", i + 1).chars().count() + 1).sum();
    let compact = full > cols[1].width as usize;
    let mut spans = Vec::new();
    app.hits.tabs.clear();
    let mut x = cols[1].x;
    for (i, t) in TABS.iter().enumerate() {
        let label = if !compact || i == app.tab { format!(" {} {t} ", i + 1) } else { format!(" {} ", i + 1) };
        let w = label.chars().count() as u16;
        let style = if i == app.tab { Style::new().fg(bg()).bg(accent()).bold() } else { Style::new().fg(muted()) };
        app.hits.tabs.push(Rect::new(x, cols[1].y, w, 1));
        spans.push(Span::styled(label, style));
        spans.push(Span::styled("│", Style::new().fg(line())));
        x += w + 1;
    }
    f.render_widget(Paragraph::new(Line::from(spans)), cols[1]);
    let score = Line::from(vec![
        Span::styled("Nätet ", Style::new().fg(muted())),
        Span::styled(format!("{} ", app.fleet.score), Style::new().fg(score_color(app.fleet.score)).bold()),
        Span::styled(format!("{} ", app.fleet.grade), Style::new().fg(bg()).bg(score_color(app.fleet.score)).bold()),
    ])
    .alignment(Alignment::Right);
    f.render_widget(Paragraph::new(score), cols[2]);
}

fn draw_devices(f: &mut Frame, app: &mut App, area: Rect) {
    let block = panel("Enheter");
    let inner = block.inner(area);
    f.render_widget(block, area);
    app.hits.devices = inner;
    if app.fleet.devices.is_empty() {
        f.render_widget(Paragraph::new("Inga konfigar.\n\nTryck g för att\ngenerera från CSV.").fg(muted()), inner);
        return;
    }
    let mut lines: Vec<Line> = Vec::new();
    for (i, d) in app.fleet.devices.iter().enumerate() {
        let sel = i == app.device;
        let icon = if d.config.kind == Kind::Router { "◉" } else { "▣" };
        let base = if sel { Style::new().bg(sel_bg()) } else { Style::new() };
        let width = inner.width.saturating_sub(2) as usize;
        let name: String = d.name.chars().take(width.saturating_sub(4)).collect();
        lines.push(Line::from(vec![
            Span::styled(if sel { "▌" } else { " " }, Style::new().fg(accent())),
            Span::styled(format!("{icon} "), Style::new().fg(if sel { accent() } else { muted() })),
            Span::styled(format!("{name:<w$}", w = width.saturating_sub(3)), Style::new().fg(text()).bold()),
        ]).style(base));
        let (full, empty) = report::bar(d.score, 12);
        let mut meta = vec![
            Span::raw("   "),
            Span::styled(full, Style::new().fg(score_color(d.score))),
            Span::styled(empty, Style::new().fg(line())),
            Span::styled(format!(" {:>3} {}", d.score, d.grade), Style::new().fg(score_color(d.score)).bold()),
        ];
        if let Some(w) = d.worst() {
            meta.push(Span::styled(format!(" {}", w.icon()), Style::new().fg(sev_color(w))));
        }
        lines.push(Line::from(meta).style(base));
        lines.push(Line::from(Span::styled(format!("   {} · {} fynd", d.kind, d.findings().count()), Style::new().fg(muted()))).style(base));
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
        .gauge_style(Style::new().fg(score_color(fleet.score)).bg(track()))
        .percent(fleet.score as u16)
        .label(Span::styled(format!("{}/100 · betyg {}", fleet.score, fleet.grade), Style::new().fg(text()).bold()))
        .use_unicode(true);
    f.render_widget(gauge, top[0]);

    let links = fleet.links.iter().filter(|l| l.b_port.is_some()).count();
    let rules_total: usize = fleet.devices.iter().map(|d| d.results.len()).sum();
    let rules_ok: usize = fleet.devices.iter().map(|d| d.passed()).sum();
    let stats = Paragraph::new(vec![
        Line::from(vec![
            Span::styled(format!("{} ", fleet.devices.len()), Style::new().fg(accent()).bold()),
            Span::styled("enheter   ", Style::new().fg(muted())),
            Span::styled(format!("{links} "), Style::new().fg(accent()).bold()),
            Span::styled("länkar   ", Style::new().fg(muted())),
            Span::styled(format!("{rules_ok}/{rules_total} "), Style::new().fg(good()).bold()),
            Span::styled("regler OK", Style::new().fg(muted())),
        ]),
        Line::from(vec![
            Span::styled(format!("{} ", app.csv_findings), Style::new().fg(if app.csv_findings == 0 { good() } else { sev_color(Severity::Medium) }).bold()),
            Span::styled(format!("anmärkningar i CSV-filerna ({}/)", app.samples.file_name().map_or_else(|| app.samples.display().to_string(), |n| n.to_string_lossy().to_string())), Style::new().fg(muted())),
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
                .value_style(Style::new().fg(bg()).bg(sev_color(s)).bold())
        })
        .collect();
    let chart = BarChart::default()
        .block(panel("Fynd per nivå"))
        .data(BarGroup::default().bars(&bars))
        .bar_width(9)
        .bar_gap(3)
        .label_style(Style::new().fg(muted()));
    f.render_widget(chart, rows[1]);

    let mut items: Vec<ListItem> = Vec::new();
    for l in fleet.links.iter().filter(|l| l.b_port.is_some()) {
        items.push(ListItem::new(Line::from(vec![
            Span::styled(" ⇄ ", Style::new().fg(accent())),
            Span::styled(format!("{} {}", l.a, l.a_port), Style::new().fg(text())),
            Span::styled(" ── ", Style::new().fg(line())),
            Span::styled(format!("{} {}", l.b, l.b_port.as_deref().unwrap_or("")), Style::new().fg(text())),
            Span::styled(format!("  {}", l.vlans), Style::new().fg(muted())),
        ])));
    }
    if fleet.cross.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(" ✔ Alla länkar och adresser stämmer överens", Style::new().fg(good())))));
    }
    for c in &fleet.cross {
        items.push(ListItem::new(Line::from(vec![
            Span::styled(format!(" {} ", c.severity.icon()), Style::new().fg(sev_color(c.severity))),
            Span::styled(c.message.clone(), Style::new().fg(text())),
        ])));
    }
    f.render_widget(List::new(items).block(panel("Mellan enheterna")), rows[2]);
}

fn draw_findings(f: &mut Frame, app: &mut App, area: Rect) {
    let cols = Layout::horizontal([Constraint::Percentage(48), Constraint::Percentage(52)]).split(area);
    let findings = app.findings_sorted();
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    let total = d.findings().count();
    let mut title = format!("Fynd – {} ({})", d.name, findings.len());
    if findings.len() != total {
        title = format!("Fynd – {} ({} av {total})", d.name, findings.len());
    }
    if let Some(m) = app.min_level {
        title.push_str(&format!(" · nivå ≥ {}", m.label()));
    }
    if !app.query.is_empty() {
        title.push_str(&format!(" · sök '{}'", app.query));
    }
    if findings.is_empty() {
        let msg = if total == 0 { "\n  ✔ Inga fynd – allt ser bra ut!" } else { "\n  Inga fynd matchar filtret – Esc rensar, f byter nivå, / söker" };
        f.render_widget(Paragraph::new(msg).fg(if total == 0 { good() } else { muted() }).block(panel(&title)), area);
        return;
    }
    let items: Vec<ListItem> = findings
        .iter()
        .map(|fi| {
            ListItem::new(Line::from(vec![
                Span::styled(format!("{} {:<8}", fi.severity.icon(), fi.severity.label()), Style::new().fg(sev_color(fi.severity)).bold()),
                Span::styled(fi.message.clone(), Style::new().fg(text())),
            ]))
        })
        .collect();
    let selected = app.finding.selected().unwrap_or(0).min(findings.len() - 1);
    let fi = findings[selected];
    let list = List::new(items)
        .block(panel(&title))
        .highlight_style(Style::new().bg(sel_bg2()).add_modifier(Modifier::BOLD))
        .highlight_symbol("▌");
    let mut state = app.finding.clone();
    f.render_stateful_widget(list, cols[0], &mut state);
    let (list_rect, list_offset) = (panel(&title).inner(cols[0]), state.offset());

    // Detaljer om valt fynd.
    let rule = rules::find(&fi.rule);
    let mut lines = vec![
        Line::from(Span::styled(rule.map_or(fi.rule.as_str(), |r| r.title), Style::new().fg(text()).bold())),
        Line::from(vec![
            Span::styled(format!(" {} {} ", fi.severity.icon(), fi.severity.label()), Style::new().fg(bg()).bg(sev_color(fi.severity)).bold()),
            Span::styled(format!("  regel {}", fi.rule), Style::new().fg(muted())),
            Span::styled(rule.map(|r| format!(" · {}", r.category)).unwrap_or_default(), Style::new().fg(muted())),
        ]),
        Line::raw(""),
        Line::from(Span::styled(fi.message.clone(), Style::new().fg(text()))),
    ];
    if let Some(r) = rule {
        lines.push(Line::raw(""));
        lines.push(Line::from(Span::styled("Varför?", Style::new().fg(violet()).bold())));
        lines.push(Line::from(Span::styled(r.why, Style::new().fg(muted()))));
    }
    if !fi.fix.is_empty() {
        lines.push(Line::raw(""));
        lines.push(Line::from(vec![Span::styled("Rättning", Style::new().fg(violet()).bold()), Span::styled("   c kopierar", Style::new().fg(muted()))]));
        for l in &fi.fix {
            lines.push(Line::from(Span::styled(format!("  {l}"), Style::new().fg(accent()))));
        }
    }
    if let Some(no) = fi.line {
        lines.push(Line::raw(""));
        lines.push(Line::from(vec![Span::styled(format!("I konfigen (rad {no})"), Style::new().fg(violet()).bold()), Span::styled("   Enter hoppar dit", Style::new().fg(muted()))]));
        let from = no.saturating_sub(3).max(1);
        for l in d.config.lines.iter().filter(|l| l.no >= from && l.no <= no + 3) {
            let hit = l.no == no;
            lines.push(Line::from(vec![
                Span::styled(format!("{:>4} ", l.no), Style::new().fg(if hit { sev_color(fi.severity) } else { line() })),
                Span::styled(
                    l.text.clone(),
                    if hit { Style::new().fg(text()).bg(hit_bg()) } else { Style::new().fg(muted()) },
                ),
            ]));
        }
    }
    f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }).block(panel("Detaljer")), cols[1]);
    // Klickytan för listan (inuti ramen) och hur långt den är scrollad.
    app.hits.list = list_rect;
    app.hits.list_offset = list_offset;
}

fn draw_ports(f: &mut Frame, app: &App, area: Rect) {
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    let header = Row::new(["Port", "Läge", "VLAN", "Beskrivning", "Status", "Skydd"].map(|h| Cell::from(h).style(Style::new().fg(muted()).bold())));
    let rows: Vec<Row> = d
        .config
        .interfaces
        .iter()
        .skip(app.scroll as usize)
        .map(|i| {
            let (mode, color) = match i.mode {
                IfMode::Access => ("access", good()),
                IfMode::Trunk => ("trunk", violet()),
                IfMode::Routed => ("routad", accent()),
                IfMode::Other => ("–", muted()),
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
            let status = if i.shutdown { Span::styled("● nere", Style::new().fg(sev_color(Severity::Critical))) } else { Span::styled("● uppe", Style::new().fg(good())) };
            let guard = match (i.mode, i.portfast, i.bpduguard) {
                (IfMode::Access, true, true) => Span::styled("✔ portfast+bpdu", Style::new().fg(good())),
                (IfMode::Access, _, _) => Span::styled("✖ saknas", Style::new().fg(sev_color(Severity::Low))),
                _ => Span::raw(""),
            };
            Row::new(vec![
                Cell::from(short_port(&i.name)).style(Style::new().fg(text()).bold()),
                Cell::from(mode).style(Style::new().fg(color)),
                Cell::from(vlan),
                Cell::from(i.description.clone()).style(Style::new().fg(muted())),
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

    let mut header = vec![Cell::from("VLAN").style(Style::new().fg(muted()).bold()), Cell::from("Namn").style(Style::new().fg(muted()).bold())];
    header.extend(devices.iter().map(|d| Cell::from(d.name.clone()).style(Style::new().fg(muted()).bold())));
    let rows: Vec<Row> = vlans
        .iter()
        .skip(app.scroll as usize)
        .map(|&v| {
            let mut cells = vec![Cell::from(v.to_string()).style(Style::new().fg(accent()).bold()), Cell::from(name_of(v)).style(Style::new().fg(text()))];
            for d in devices {
                let access = d.config.interfaces.iter().filter(|i| i.mode == IfMode::Access && i.access_vlan == Some(v)).count();
                let trunk = d.config.interfaces.iter().filter(|i| i.mode == IfMode::Trunk && i.allowed.as_ref().is_none_or(|a| a.contains(&v))).count();
                let native = d.config.interfaces.iter().any(|i| (i.mode == IfMode::Trunk && i.native_vlan == Some(v)) || (i.dot1q == Some(v) && i.dot1q_native));
                let gw = d.config.interfaces.iter().find(|i| (i.dot1q == Some(v) && !i.dot1q_native) || i.svi_vlan() == Some(v)).and_then(|i| i.ip);
                let defined = d.config.vlans.contains_key(&v);
                let mut spans = Vec::new();
                if access > 0 {
                    spans.push(Span::styled(format!("■{access} "), Style::new().fg(good())));
                }
                if trunk > 0 {
                    spans.push(Span::styled(format!("⇅{trunk} "), Style::new().fg(violet())));
                }
                if native {
                    spans.push(Span::styled("native ", Style::new().fg(sev_color(Severity::Medium))));
                }
                if let Some((ip, _)) = gw {
                    spans.push(Span::styled(format!("◉{ip}"), Style::new().fg(accent())));
                }
                if spans.is_empty() {
                    spans.push(Span::styled(if defined { "· definierat" } else { "–" }, Style::new().fg(line())));
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
                Some(Kind::Router) => ("◉", accent()),
                Some(Kind::Switch) => ("▣", violet()),
                Some(Kind::Unknown) => ("◇", muted()),
                None => ("○", muted()),
            };
            let mut spans = vec![Span::styled(l.prefix.clone(), Style::new().fg(line()))];
            if !l.port.is_empty() {
                spans.push(Span::styled(format!("{} ", l.port), Style::new().fg(Color::Rgb(200, 170, 255))));
            }
            let name_style = if l.device { Style::new().fg(color).bold() } else { Style::new().fg(text()) };
            spans.push(Span::styled(format!("{icon} {}", l.peer), name_style));
            if l.device
                && let Some(k) = l.kind {
                    spans.push(Span::styled(format!(" ({})", k.label()), Style::new().fg(muted())));
                }
            spans.push(Span::styled(format!("  {}", l.info), Style::new().fg(muted())));
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
fn highlight(row: &str) -> Vec<Span<'static>> {
    if row.starts_with('!') {
        return vec![Span::styled(row.to_string(), Style::new().fg(comment()).italic())];
    }
    let indent = row.len() - row.trim_start().len();
    let t = row.trim_start();
    let mut spans = vec![Span::raw(" ".repeat(indent))];
    let (first, rest) = t.split_once(' ').unwrap_or((t, ""));
    let head = if t.starts_with("no ") { Style::new().fg(sev_color(Severity::High)) } else if indent == 0 { Style::new().fg(accent()).bold() } else { Style::new().fg(violet()) };
    spans.push(Span::styled(first.to_string(), head));
    for word in rest.split(' ') {
        let style = if crate::net::parse_ip(word).is_some() {
            Style::new().fg(Color::Rgb(240, 200, 110))
        } else if word.chars().all(|c| c.is_ascii_digit() || c == ',' || c == '-') && !word.is_empty() {
            Style::new().fg(Color::Rgb(250, 160, 120))
        } else if word.contains("Ethernet") || word.starts_with("Vlan") {
            Style::new().fg(good())
        } else {
            Style::new().fg(text())
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
    let found: BTreeSet<usize> = app.config_matches().into_iter().collect();
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
                Span::styled(format!("{:>4} │ ", l.no), Style::new().fg(line())),
            ];
            spans.extend(highlight(&l.text));
            let row = Line::from(spans);
            if app.focus_line == Some(l.no) {
                row.style(Style::new().bg(hit_bg()))
            } else if found.contains(&l.no) {
                row.style(Style::new().bg(find_bg()))
            } else {
                row
            }
        })
        .collect();
    let total = lines.len();
    let scroll = (app.scroll as usize).min(total.saturating_sub(1));
    let mut title = format!("{}  ·  {} rader", d.config.path, total);
    if !app.cfg_query.is_empty() {
        title.push_str(&format!("  ·  sök '{}': {} träffar (n/N)", app.cfg_query, found.len()));
    }
    f.render_widget(Paragraph::new(lines).scroll((scroll as u16, 0)).block(panel(&title)), area);
    let mut sb = ScrollbarState::new(total).position(scroll);
    f.render_stateful_widget(
        Scrollbar::new(ScrollbarOrientation::VerticalRight).symbols(symbols::scrollbar::VERTICAL).style(Style::new().fg(line())).thumb_style(Style::new().fg(accent())),
        area.inner(ratatui::layout::Margin { vertical: 1, horizontal: 0 }),
        &mut sb,
    );
}

/// Flik 7: CSV-filerna mot sparade konfigar, som `vlantool drift`.
fn draw_drift(f: &mut Frame, app: &App, area: Rect) {
    let rows = match &app.drift {
        Ok(r) => r,
        Err(e) => {
            f.render_widget(Paragraph::new(format!("\n  ✖ Kan inte jämföra: {e}")).fg(sev_color(Severity::Critical)).wrap(Wrap { trim: false }).block(panel("Drift")), area);
            return;
        }
    };
    let changed = rows.iter().filter(|r| r.change != Some((0, 0))).count();
    let mut lines: Vec<Line> = Vec::new();
    for r in rows {
        let (icon, color, note) = match r.change {
            None => ("✚", sev_color(Severity::Medium), "finns inte sparad än – tryck g".to_string()),
            Some((0, 0)) => ("✔", good(), "i fas med CSV-filerna".to_string()),
            Some((a, d)) => ("≠", sev_color(Severity::Medium), format!("+{a} −{d} rader mot CSV-filerna")),
        };
        lines.push(Line::from(vec![
            Span::styled(format!(" {icon} "), Style::new().fg(color).bold()),
            Span::styled(format!("{:<16}", r.host), Style::new().fg(text()).bold()),
            Span::styled(note, Style::new().fg(muted())),
        ]));
        for l in &r.diff {
            let c = match l.chars().next() {
                Some('+') => good(),
                Some('-') => sev_color(Severity::Critical),
                Some('@') => accent(),
                _ => muted(),
            };
            lines.push(Line::from(Span::styled(format!("     {l}"), Style::new().fg(c))));
        }
    }
    if rows.is_empty() {
        lines.push(Line::from(Span::styled("  CSV-filerna beskriver inga enheter", Style::new().fg(muted()))));
    }
    let total = lines.len() as u16;
    let title = format!("Drift – {changed} av {} avviker (↑↓ bläddrar)", rows.len());
    f.render_widget(Paragraph::new(lines).scroll((app.scroll.min(total.saturating_sub(1)), 0)).block(panel(&title)), area);
}

/// Flik 8: kontrollen av CSV-filerna.
fn draw_csv(f: &mut Frame, app: &App, area: Rect) {
    let title = format!("CSV-kontroll – {} ({} anmärkningar)", app.samples.display(), app.csv_list.len());
    if app.csv_list.is_empty() {
        f.render_widget(Paragraph::new("\n  ✔ CSV-filerna ser bra ut").fg(good()).block(panel(&title)), area);
        return;
    }
    let mut list: Vec<&crate::finding::Finding> = app.csv_list.iter().collect();
    list.sort_by_key(|x| std::cmp::Reverse(x.severity));
    let lines: Vec<Line> = list
        .iter()
        .skip(app.scroll as usize)
        .map(|x| {
            Line::from(vec![
                Span::styled(format!(" {} {:<8}", x.severity.icon(), x.severity.label()), Style::new().fg(sev_color(x.severity)).bold()),
                Span::styled(x.message.clone(), Style::new().fg(text())),
            ])
        })
        .collect();
    f.render_widget(Paragraph::new(lines).block(panel(&title)), area);
}

/// Flik 9: varje regel och hur den gick på varje enhet.
fn draw_rules(f: &mut Frame, app: &App, area: Rect) {
    let devices = &app.fleet.devices;
    let mut header = vec![Cell::from("Regel").style(Style::new().fg(muted()).bold()), Cell::from("").style(Style::new().fg(muted()))];
    header.extend(devices.iter().map(|d| Cell::from(d.name.clone()).style(Style::new().fg(muted()).bold())));
    let rows: Vec<Row> = rules::ALL_RULES
        .iter()
        .skip(app.scroll as usize)
        .map(|r| {
            let mut cells = vec![
                Cell::from(r.id).style(Style::new().fg(text()).bold()),
                Cell::from(r.severity.icon()).style(Style::new().fg(sev_color(r.severity))),
            ];
            for d in devices {
                cells.push(match d.results.iter().find(|x| x.id == r.id) {
                    None => Cell::from("–").style(Style::new().fg(line())),
                    Some(x) if x.findings.is_empty() => Cell::from("✔").style(Style::new().fg(good())),
                    Some(x) => {
                        let worst = x.findings.iter().map(|f| f.severity).max().unwrap_or(Severity::Info);
                        Cell::from(format!("{} {}", worst.icon(), x.findings.len())).style(Style::new().fg(sev_color(worst)).bold())
                    }
                });
            }
            Row::new(cells)
        })
        .collect();
    let mut widths = vec![Constraint::Length(16), Constraint::Length(2)];
    widths.extend(devices.iter().map(|_| Constraint::Min(10)));
    let ok: usize = devices.iter().map(|d| d.passed()).sum();
    let all: usize = devices.iter().map(|d| d.results.len()).sum();
    let table = Table::new(rows, widths).header(Row::new(header)).column_spacing(2).block(panel(&format!("Regler per enhet – {ok}/{all} OK   ✔ godkänd  ▲ fynd (värsta nivå, antal)  – gäller ej")));
    f.render_widget(table, area);
}

fn draw_footer(f: &mut Frame, app: &App, area: Rect) {
    let rows = Layout::vertical([Constraint::Length(1), Constraint::Length(1)]).split(area);
    let keys = [
        ("1-9", "flik"),
        ("Tab", "enhet"),
        ("/", "sök"),
        ("f", "nivå"),
        ("c", "kopiera"),
        ("t", "tema"),
        ("g", "generera"),
        ("r", "läs om"),
        ("e", "HTML"),
        ("?", "hjälp"),
        ("q", "avsluta"),
    ];
    let mut spans = Vec::new();
    for (k, v) in keys {
        spans.push(Span::styled(format!(" {k} "), Style::new().fg(bg()).bg(muted()).bold()));
        spans.push(Span::styled(format!(" {v} "), Style::new().fg(muted())));
    }
    f.render_widget(Paragraph::new(Line::from(spans)).style(Style::new().bg(bg())), rows[0]);

    // Statusrad: sökfält när man skriver, annars projektmapp, enhet och tid sedan inläsningen.
    if let Some(target) = app.input {
        let q = if target == Input::FindingSearch { &app.query } else { &app.cfg_query };
        let line = Line::from(vec![
            Span::styled(" / ", Style::new().fg(bg()).bg(accent()).bold()),
            Span::styled(format!(" {q}"), Style::new().fg(text())),
            Span::styled("▏", Style::new().fg(accent())),
            Span::styled("   Enter bekräftar · Esc rensar", Style::new().fg(muted())),
        ]);
        f.render_widget(Paragraph::new(line).style(Style::new().bg(bg())), rows[1]);
        return;
    }
    let dir = std::env::current_dir().map(|d| d.display().to_string()).unwrap_or_default();
    let secs = app.loaded.elapsed().as_secs();
    let ago = if secs < 60 { format!("{secs} s") } else { format!("{} min", secs / 60) };
    let device = app.fleet.devices.get(app.device).map_or("–", |d| d.name.as_str());
    let left = Line::from(vec![
        Span::styled(format!(" {dir} "), Style::new().fg(accent())),
        Span::styled(format!("· {device} · inläst för {ago} sedan{}", if app.auto_reload { " · bevakar filer" } else { "" }), Style::new().fg(muted())),
    ]);
    let cols = Layout::new(Direction::Horizontal, [Constraint::Min(10), Constraint::Length(48)]).split(rows[1]);
    f.render_widget(Paragraph::new(left).style(Style::new().bg(bg())), cols[0]);
    let color = if app.status.starts_with('✖') { sev_color(Severity::Critical) } else { good() };
    f.render_widget(Paragraph::new(Line::from(Span::styled(app.status.clone(), Style::new().fg(color))).alignment(Alignment::Right)).style(Style::new().bg(bg())), cols[1]);
}

fn draw_help(f: &mut Frame, area: Rect) {
    let rows = [
        ("1 – 9, ← →  h l", "Byt flik"),
        ("Tab / Shift+Tab", "Nästa / föregående enhet"),
        ("↑ ↓  j k", "Välj fynd / bläddra"),
        ("PgUp PgDn  Home", "Bläddra en sida / till början"),
        ("/", "Sök i fynden (flik 2) eller konfigen (flik 6)"),
        ("n  N", "Nästa / föregående sökträff i konfigen"),
        ("f", "Filtrera fynd på nivå (låg, medel, hög, kritisk)"),
        ("Esc", "Rensa sök och filter, sedan avsluta"),
        ("Enter", "Hoppa från fynd till raden i konfigen"),
        ("c", "Kopiera fyndets rättning till urklipp (OSC 52)"),
        ("t", "Växla mellan mörkt och ljust tema"),
        ("g", "Generera konfigar från CSV och granska"),
        ("r", "Läs om filerna (sker också automatiskt)"),
        ("e", "Spara HTML-rapport i reports/"),
        ("?", "Den här hjälpen"),
        ("q", "Avsluta"),
        ("Mus", "Klicka på flikar, enheter och fynd; hjulet bläddrar"),
    ];
    let w = 72.min(area.width);
    let h = (rows.len() as u16 + 8).min(area.height);
    let rect = Rect::new(area.x + (area.width - w) / 2, area.y + (area.height - h) / 2, w, h);
    f.render_widget(Clear, rect);
    let mut lines = vec![Line::raw("")];
    for (k, v) in rows {
        lines.push(Line::from(vec![Span::styled(format!("  {k:<18}"), Style::new().fg(accent()).bold()), Span::styled(v, Style::new().fg(text()))]));
    }
    lines.push(Line::raw(""));
    lines.push(Line::from(Span::styled("  Nivåer", Style::new().fg(violet()).bold())));
    lines.push(Line::from(
        Severity::ALL
            .iter()
            .flat_map(|s| [Span::styled(format!("  {} {}", s.icon(), s.label()), Style::new().fg(sev_color(*s)))])
            .collect::<Vec<_>>(),
    ));
    lines.push(Line::raw(""));
    lines.push(Line::from(Span::styled("  Tryck valfri tangent för att stänga", Style::new().fg(muted()))));
    f.render_widget(Paragraph::new(Text::from(lines)).block(panel("Hjälp").border_style(Style::new().fg(accent()))), rect);
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

    fn example_app() -> App {
        let samples = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("samples");
        let cfgs = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("examples-cfg");
        App::new(vec![cfgs], samples, Settings::default()).unwrap()
    }

    fn screen(term: &Terminal<TestBackend>) -> String {
        let buf = term.backend().buffer();
        (0..buf.area.height).map(|y| (0..buf.area.width).map(|x| buf[(x, y)].symbol().to_string()).collect::<String>()).collect::<Vec<_>>().join("\n")
    }

    #[test]
    fn base64_matches_rfc4648() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foob"), "Zm9vYg==");
        assert_eq!(base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(osc52("hej"), "\x1b]52;c;aGVq\x07");
    }

    #[test]
    fn search_filter_and_jump() {
        let mut app = example_app();
        // Välj en enhet som har fynd med rad och rättning.
        let dev = app.fleet.devices.iter().position(|d| d.findings().any(|f| f.line.is_some() && !f.fix.is_empty())).expect("exempelkonfigarna har fynd");
        app.set_device(dev);
        app.set_tab(TAB_FINDINGS);
        let all = app.findings_sorted().len();
        // Nivåfilter minskar (eller behåller) listan och Esc rensar.
        app.on_key(KeyCode::Char('f'), KeyModifiers::NONE);
        assert_eq!(app.min_level, Some(Severity::Low));
        assert!(app.findings_sorted().len() <= all);
        app.on_key(KeyCode::Esc, KeyModifiers::NONE);
        assert_eq!(app.min_level, None);
        assert!(!app.quit, "Esc rensar filtret först");
        // Sök med / som inte matchar något.
        app.on_key(KeyCode::Char('/'), KeyModifiers::NONE);
        for c in "zzzqqq".chars() {
            app.on_key(KeyCode::Char(c), KeyModifiers::NONE);
        }
        app.on_key(KeyCode::Enter, KeyModifiers::NONE);
        assert!(app.findings_sorted().is_empty());
        app.on_key(KeyCode::Esc, KeyModifiers::NONE);
        assert_eq!(app.findings_sorted().len(), all);
        // Kopiera rättningen och hoppa till raden.
        let sel = app.findings_sorted().iter().position(|f| f.line.is_some() && !f.fix.is_empty()).unwrap();
        app.finding.select(Some(sel));
        app.on_key(KeyCode::Char('c'), KeyModifiers::NONE);
        assert!(app.pending_osc.as_ref().is_some_and(|o| o.starts_with("\x1b]52;c;")));
        app.on_key(KeyCode::Enter, KeyModifiers::NONE);
        assert_eq!(app.tab, TAB_CONFIG);
        assert!(app.focus_line.is_some());
        // Sök i konfigen.
        app.on_key(KeyCode::Char('/'), KeyModifiers::NONE);
        for c in "hostname".chars() {
            app.on_key(KeyCode::Char(c), KeyModifiers::NONE);
        }
        app.on_key(KeyCode::Enter, KeyModifiers::NONE);
        assert!(!app.config_matches().is_empty());
        app.on_key(KeyCode::Char('n'), KeyModifiers::NONE);
        assert!(app.status.contains("hostname"));
    }

    #[test]
    fn narrow_light_and_mouse() {
        let mut app = example_app();
        // Smalt fönster: ingen enhetspanel, men flikarna syns och går att klicka på.
        let mut term = Terminal::new(TestBackend::new(80, 30)).unwrap();
        for tab in 0..TABS.len() {
            app.set_tab(tab);
            term.draw(|f| draw(f, &mut app)).unwrap();
            assert!(!screen(&term).contains("Enheter"), "sidopanelen ska döljas under 100 kolumner");
        }
        let tab3 = app.hits.tabs[2];
        app.on_mouse(MouseEvent { kind: MouseEventKind::Down(MouseButton::Left), column: tab3.x, row: tab3.y, modifiers: KeyModifiers::NONE });
        assert_eq!(app.tab, 2);
        // Brett fönster: klick på andra enheten.
        let mut term = Terminal::new(TestBackend::new(140, 40)).unwrap();
        term.draw(|f| draw(f, &mut app)).unwrap();
        assert!(screen(&term).contains("Enheter"));
        let d = app.hits.devices;
        app.on_mouse(MouseEvent { kind: MouseEventKind::Down(MouseButton::Left), column: d.x + 2, row: d.y + 4, modifiers: KeyModifiers::NONE });
        assert_eq!(app.device, 1);
        // Ljust tema ritar alla flikar.
        app.on_key(KeyCode::Char('t'), KeyModifiers::NONE);
        for tab in 0..TABS.len() {
            app.set_tab(tab);
            term.draw(|f| draw(f, &mut app)).unwrap();
        }
        app.on_key(KeyCode::Char('t'), KeyModifiers::NONE);
        assert!(!LIGHT.load(Ordering::Relaxed));
    }

    #[test]
    fn reloads_when_files_change() {
        let dir = std::env::temp_dir().join(format!("vlantool-watch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let samples = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("samples");
        let mut app = App::new(vec![dir.clone()], samples, Settings::default()).unwrap();
        let n = app.fleet.devices.len();
        assert!(n >= 3);
        std::fs::remove_file(dir.join(format!("{}.cfg", app.fleet.devices[0].name))).unwrap();
        app.last_check = Instant::now() - Duration::from_secs(2);
        app.tick();
        assert_eq!(app.fleet.devices.len(), n - 1);
        assert!(app.status.contains("ändrades"));
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
