//! Programmets tillstånd och allt det kan göra: öppna projekt, generera,
//! granska, exportera och spara inställningar.

use crate::folder::FolderDialog;
use crate::theme::{self, palette};
use crate::views;
use eframe::egui::{self, Align, Color32, CornerRadius, Key, Layout, Margin, RichText, Stroke, Ui, Vec2};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use vlantool::audit::{self, FleetReport};
use vlantool::finding::{Finding, Severity};
use vlantool::generator;
use vlantool::inventory::Inventory;
use vlantool::project::Project;
use vlantool::report::{self, Format, Options};
use vlantool::settings::Settings;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tab {
    Overview,
    Findings,
    Ports,
    Vlans,
    Topology,
    Config,
    Drift,
    Csv,
    Subnet,
    Settings,
}

impl Tab {
    pub const ALL: [Tab; 10] =
        [Tab::Overview, Tab::Findings, Tab::Ports, Tab::Vlans, Tab::Topology, Tab::Config, Tab::Drift, Tab::Csv, Tab::Subnet, Tab::Settings];

    pub fn label(self) -> &'static str {
        match self {
            Tab::Overview => "Översikt",
            Tab::Findings => "Fynd",
            Tab::Ports => "Portar",
            Tab::Vlans => "VLAN",
            Tab::Topology => "Topologi",
            Tab::Config => "Konfig",
            Tab::Drift => "Drift",
            Tab::Csv => "CSV-data",
            Tab::Subnet => "Subnät",
            Tab::Settings => "Inställningar",
        }
    }

    pub fn icon(self) -> &'static str {
        match self {
            Tab::Overview => "◈",
            Tab::Findings => "⚠",
            Tab::Ports => "⇄",
            Tab::Vlans => "▦",
            Tab::Topology => "☁",
            Tab::Config => "≣",
            Tab::Drift => "±",
            Tab::Csv => "▤",
            Tab::Subnet => "⊞",
            Tab::Settings => "⚙",
        }
    }

    /// Flikar som visar en enhet i taget.
    pub fn per_device(self) -> bool {
        matches!(self, Tab::Findings | Tab::Ports | Tab::Config)
    }
}

/// Sparas mellan körningar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Prefs {
    pub dark: bool,
    pub last_project: Option<PathBuf>,
    pub recent: Vec<PathBuf>,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs { dark: true, last_project: None, recent: Vec::new() }
    }
}

pub struct Toast {
    pub text: String,
    pub error: bool,
    pub born: Instant,
}

pub struct DriftEntry {
    pub hostname: String,
    pub saved: bool,
    pub added: usize,
    pub removed: usize,
    pub lines: Vec<String>,
}

pub struct App {
    pub prefs: Prefs,
    pub project: Option<Project>,
    pub settings: Settings,
    pub settings_draft: Settings,
    pub fleet: FleetReport,
    pub inventory: Option<Inventory>,
    pub csv_findings: Vec<Finding>,
    pub drift: Vec<DriftEntry>,
    pub tab: Tab,
    pub device: usize,
    pub finding: usize,
    pub min_sev: Severity,
    pub search: String,
    pub jump_to_line: Option<usize>,
    pub subnet_input: String,
    pub split_prefix: u8,
    pub plan_input: String,
    pub folder: Option<FolderDialog>,
    pub toasts: Vec<Toast>,
    pub show_about: bool,
    pub scene_rect: egui::Rect,
    /// Tillstånd för flikarna i views/state_a.rs respektive views/state_b.rs.
    pub sa: crate::views::state_a::StateA,
    pub sb: crate::views::state_b::StateB,
    applied_dark: Option<bool>,
}

const PREFS_KEY: &str = "vlantool-prefs";

impl App {
    pub fn new(cc: &eframe::CreationContext<'_>, start: Option<PathBuf>) -> Self {
        theme::install_fonts(&cc.egui_ctx);
        let prefs: Prefs = cc.storage.and_then(|s| eframe::get_value(s, PREFS_KEY)).unwrap_or_default();
        let mut app = App::empty(prefs);
        let target = start.or_else(|| app.prefs.last_project.clone().filter(|p| p.is_dir()));
        if let Some(dir) = target {
            app.open_project(&dir);
        }
        // För skärmbilder och felsökning: VLANTOOL_TAB=topologi, VLANTOOL_DEVICE=1, VLANTOOL_THEME=light.
        if let Ok(tab) = std::env::var("VLANTOOL_TAB")
            && let Some(t) = Tab::ALL.iter().find(|t| t.label().eq_ignore_ascii_case(&tab)) {
                app.tab = *t;
            }
        if let Some(d) = std::env::var("VLANTOOL_DEVICE").ok().and_then(|d| d.parse().ok()) {
            app.select_device(d);
        }
        if let Ok(theme) = std::env::var("VLANTOOL_THEME") {
            app.prefs.dark = theme != "light";
        }
        app
    }

    pub fn empty(prefs: Prefs) -> Self {
        App {
            prefs,
            project: None,
            settings: Settings::default(),
            settings_draft: Settings::default(),
            fleet: audit::audit_fleet(Vec::new(), &[]),
            inventory: None,
            csv_findings: Vec::new(),
            drift: Vec::new(),
            tab: Tab::Overview,
            device: 0,
            finding: 0,
            min_sev: Severity::Info,
            search: String::new(),
            jump_to_line: None,
            subnet_input: "192.168.1.0/24".into(),
            split_prefix: 26,
            plan_input: "KONTOR:50, EKONOMI:20, GAST:40, DRIFT:10".into(),
            folder: None,
            toasts: Vec::new(),
            show_about: false,
            scene_rect: egui::Rect::ZERO,
            sa: Default::default(),
            sb: Default::default(),
            applied_dark: None,
        }
    }

    pub fn dark(&self) -> bool {
        self.prefs.dark
    }

    pub fn toast(&mut self, text: impl Into<String>) {
        self.toasts.push(Toast { text: text.into(), error: false, born: Instant::now() });
    }

    pub fn error(&mut self, text: impl Into<String>) {
        self.toasts.push(Toast { text: text.into(), error: true, born: Instant::now() });
    }

    // -----------------------------------------------------------------------
    // Projekt
    // -----------------------------------------------------------------------

    pub fn default_example_dir() -> PathBuf {
        dirs::document_dir().or_else(dirs::home_dir).unwrap_or_else(|| PathBuf::from(".")).join("vlantool-nordvik")
    }

    pub fn create_example(&mut self, dir: &Path) {
        match Project::create_example(dir) {
            Ok(p) => {
                self.open_project(&p.root);
                self.generate();
            }
            Err(e) => self.error(format!("Kunde inte skapa exempelprojektet: {e:#}")),
        }
    }

    pub fn open_project(&mut self, dir: &Path) {
        let project = Project::new(dir);
        self.settings = match Settings::load(&project.settings_path()) {
            Ok(s) => s,
            Err(e) => {
                self.error(format!("{e:#}"));
                Settings::default()
            }
        };
        self.settings_draft = self.settings.clone();
        self.prefs.last_project = Some(dir.to_path_buf());
        self.prefs.recent.retain(|p| p != dir);
        self.prefs.recent.insert(0, dir.to_path_buf());
        self.prefs.recent.truncate(6);
        self.project = Some(project);
        self.device = 0;
        self.finding = 0;
        self.scene_rect = egui::Rect::ZERO;
        self.reload();
    }

    pub fn close_project(&mut self) {
        self.project = None;
        self.prefs.last_project = None;
        self.fleet = audit::audit_fleet(Vec::new(), &[]);
        self.inventory = None;
        self.csv_findings.clear();
        self.drift.clear();
    }

    /// Läser om CSV-filer och konfigar och granskar allt.
    pub fn reload(&mut self) {
        let Some(project) = self.project.clone() else { return };
        self.inventory = None;
        self.csv_findings.clear();
        if project.samples().is_dir() {
            match Inventory::load_dir(&project.samples()) {
                Ok(inv) => {
                    self.csv_findings = inv.validate(self.settings.native_vlan, self.settings.mgmt_vlan);
                    self.inventory = Some(inv);
                }
                Err(e) => self.error(format!("CSV: {e:#}")),
            }
        }
        let configs = if project.configs().is_dir() { audit::load_configs(&[project.configs()]) } else { Ok(Vec::new()) };
        match configs {
            Ok(configs) => self.fleet = audit::audit_fleet(configs, &[]),
            Err(e) => self.error(format!("{e:#}")),
        }
        self.device = self.device.min(self.fleet.devices.len().saturating_sub(1));
        self.finding = 0;
        self.compute_drift();
    }

    pub fn generate(&mut self) {
        let Some(project) = self.project.clone() else { return };
        let Some(inv) = &self.inventory else {
            self.error("Hittade inga CSV-filer i samples/");
            return;
        };
        if let Some(f) = self.csv_findings.iter().find(|f| f.severity >= Severity::Critical) {
            self.error(format!("CSV-filerna har kritiska fel: {}", f.message));
            self.tab = Tab::Csv;
            return;
        }
        let result = generator::generate_all(inv, &self.settings).and_then(|configs| {
            std::fs::create_dir_all(project.configs())?;
            for g in &configs {
                std::fs::write(project.configs().join(format!("{}.cfg", g.hostname)), format!("{}\n", g.text))?;
            }
            Ok(configs.len())
        });
        match result {
            Ok(n) => {
                self.reload();
                self.toast(format!("✔ Genererade {n} konfigar"));
            }
            Err(e) => self.error(format!("Kunde inte generera: {e:#}")),
        }
    }

    fn compute_drift(&mut self) {
        self.drift.clear();
        let (Some(project), Some(inv)) = (&self.project, &self.inventory) else { return };
        let Ok(generated) = generator::generate_all(inv, &self.settings) else { return };
        for g in generated {
            let path = project.configs().join(format!("{}.cfg", g.hostname));
            let entry = match std::fs::read_to_string(&path) {
                Err(_) => DriftEntry { hostname: g.hostname, saved: false, added: 0, removed: 0, lines: Vec::new() },
                Ok(saved) => {
                    let (text, stats) = vlantool::diff::diff("sparad", &saved, "från CSV", &g.text, report::Paint(false));
                    DriftEntry {
                        hostname: g.hostname,
                        saved: true,
                        added: stats.added,
                        removed: stats.removed,
                        lines: text.lines().skip(2).map(str::to_string).collect(),
                    }
                }
            };
            self.drift.push(entry);
        }
    }

    pub fn save_settings(&mut self) {
        let Some(project) = &self.project else { return };
        let text = format!("# Inställningar för vlantool\n\n{}", self.settings_draft.to_toml());
        match std::fs::write(project.settings_path(), text) {
            Ok(()) => {
                self.settings = self.settings_draft.clone();
                self.toast("✔ Sparade nordvik.toml – generera om för att använda inställningarna");
                self.reload();
            }
            Err(e) => self.error(format!("Kunde inte spara: {e}")),
        }
    }

    pub fn export(&mut self, format: Format) {
        let Some(project) = &self.project else { return };
        if self.fleet.devices.is_empty() {
            self.error("Det finns inget att exportera ännu");
            return;
        }
        let ext = match format {
            Format::Markdown => "md",
            Format::Json => "json",
            Format::Csv => "csv",
            Format::Html => "html",
            _ => "txt",
        };
        let path = project.reports().join(format!("rapport.{ext}"));
        let opt = Options { color: false, verbose: true, fixes: true, min: Severity::Info };
        let text = report::render(&self.fleet, format, opt);
        let result = std::fs::create_dir_all(project.reports()).and_then(|_| std::fs::write(&path, text));
        match result {
            Ok(()) => {
                self.toast(format!("✔ Sparade {}", path.display()));
                if format == Format::Html {
                    open_path(&path);
                }
            }
            Err(e) => self.error(format!("Kunde inte spara: {e}")),
        }
    }

    pub fn export_fix_scripts(&mut self) {
        let Some(project) = &self.project else { return };
        let mut written = 0;
        for d in &self.fleet.devices {
            let lines: Vec<&String> = d.findings().flat_map(|f| f.fix.iter()).collect();
            if lines.is_empty() {
                continue;
            }
            let mut script = format!("! Rättningsskript för {} – granska innan du klistrar in!\nconfigure terminal\n", d.name);
            for l in lines {
                script.push_str(l);
                script.push('\n');
            }
            script.push_str("end\nwrite memory\n");
            let path = project.reports().join(format!("{}_fix.txt", d.name));
            if std::fs::create_dir_all(project.reports()).and_then(|_| std::fs::write(path, script)).is_ok() {
                written += 1;
            }
        }
        let dir = project.reports();
        self.toast(format!("✔ Skrev {written} rättningsskript till {}", dir.display()));
        open_path(&dir);
    }

    // -----------------------------------------------------------------------
    // Ritning
    // -----------------------------------------------------------------------

    fn shortcuts(&mut self, ctx: &egui::Context) {
        let (reload, generate, open, theme, tabs) = ctx.input(|i| {
            let ctrl = i.modifiers.command;
            let mut tab = None;
            for (n, key) in [Key::Num1, Key::Num2, Key::Num3, Key::Num4, Key::Num5, Key::Num6, Key::Num7, Key::Num8, Key::Num9].iter().enumerate() {
                if ctrl && i.key_pressed(*key) {
                    tab = Some(n);
                }
            }
            (
                i.key_pressed(Key::F5) || (ctrl && i.key_pressed(Key::R)),
                ctrl && i.key_pressed(Key::G),
                ctrl && i.key_pressed(Key::O),
                ctrl && i.key_pressed(Key::T),
                tab,
            )
        });
        if reload {
            self.reload();
            self.toast("Läste om projektet");
        }
        if generate {
            self.generate();
        }
        if open {
            self.folder = Some(FolderDialog::new(self.project.as_ref().map(|p| p.root.clone())));
        }
        if theme {
            self.prefs.dark = !self.prefs.dark;
        }
        if let Some(n) = tabs {
            self.tab = Tab::ALL[n];
        }
        if self.tab.per_device() && !self.fleet.devices.is_empty() {
            let n = self.fleet.devices.len();
            let (up, down) = ctx.input(|i| (i.modifiers.command && i.key_pressed(Key::ArrowUp), i.modifiers.command && i.key_pressed(Key::ArrowDown)));
            if down {
                self.select_device((self.device + 1) % n);
            }
            if up {
                self.select_device((self.device + n - 1) % n);
            }
        }
    }

    pub fn select_device(&mut self, d: usize) {
        if d != self.device {
            self.device = d;
            self.finding = 0;
            self.jump_to_line = None;
        }
    }

    fn header(&mut self, ui: &mut Ui) {
        let dark = self.dark();
        let p = palette(dark);
        egui::Panel::top("header")
            .frame(egui::Frame::new().fill(p.bg).inner_margin(Margin::symmetric(16, 10)).stroke(Stroke::new(1.0, p.line)))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("◆").size(22.0).color(p.violet));
                    ui.label(RichText::new("vlantool").size(19.0).strong());
                    ui.add_space(10.0);
                    if let Some(project) = &self.project {
                        let name = project.root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                        let resp = ui
                            .add(egui::Button::new(RichText::new(format!("◆ {name}  ▾")).color(p.text)).fill(p.raised).corner_radius(CornerRadius::same(8)))
                            .on_hover_text(project.root.display().to_string());
                        if resp.clicked() {
                            self.folder = Some(FolderDialog::new(Some(project.root.clone())));
                        }
                    }
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        let icon = if dark { "☀" } else { "◐" };
                        if ui.add(egui::Button::new(RichText::new(icon).size(16.0)).frame(false)).on_hover_text("Byt tema (Ctrl+T)").clicked() {
                            self.prefs.dark = !dark;
                        }
                        if ui.add(egui::Button::new(RichText::new("?").size(16.0)).frame(false)).on_hover_text("Om vlantool").clicked() {
                            self.show_about = true;
                        }
                        if self.project.is_none() {
                            return;
                        }
                        ui.add_space(8.0);
                        ui.menu_button("⇩ Exportera", |ui| {
                            for (label, f) in [
                                ("HTML-rapport (öppnas i webbläsaren)", Format::Html),
                                ("Markdown", Format::Markdown),
                                ("JSON", Format::Json),
                                ("CSV", Format::Csv),
                                ("Text", Format::Text),
                            ] {
                                if ui.button(label).clicked() {
                                    self.export(f);
                                    ui.close();
                                }
                            }
                            ui.separator();
                            if ui.button("Rättningsskript per enhet").clicked() {
                                self.export_fix_scripts();
                                ui.close();
                            }
                            if ui.button("Öppna rapportmappen").clicked() {
                                if let Some(p) = &self.project {
                                    let _ = std::fs::create_dir_all(p.reports());
                                    open_path(&p.reports());
                                }
                                ui.close();
                            }
                        });
                        if ui.button("⟳ Läs om").on_hover_text("Läs om CSV och konfigar (F5)").clicked() {
                            self.reload();
                            self.toast("Läste om projektet");
                        }
                        if theme::primary_button(ui, "⚡ Generera från CSV", dark).on_hover_text("Bygg konfigar från CSV-filerna och granska dem (Ctrl+G)").clicked() {
                            self.generate();
                        }
                        ui.add_space(12.0);
                        let fleet = &self.fleet;
                        if !fleet.devices.is_empty() {
                            theme::chip(ui, &format!("Betyg {}", fleet.grade), theme::score_color(fleet.score, dark));
                            ui.label(RichText::new(format!("{}", fleet.score)).size(18.0).strong().color(theme::score_color(fleet.score, dark)));
                            ui.label(RichText::new("Hela nätet").color(p.muted));
                        }
                    });
                });
            });
    }

    fn sidebar(&mut self, ui: &mut Ui) {
        let dark = self.dark();
        let p = palette(dark);
        egui::Panel::left("nav")
            .resizable(false)
            .exact_size(212.0)
            .frame(egui::Frame::new().fill(p.panel).inner_margin(Margin::symmetric(10, 14)).stroke(Stroke::new(1.0, p.line)))
            .show(ui, |ui| {
                for tab in Tab::ALL {
                    if tab == Tab::Csv {
                        ui.add_space(6.0);
                        ui.label(RichText::new("DATA OCH VERKTYG").size(11.0).color(p.muted));
                    }
                    let badge = match tab {
                        Tab::Findings => Some((self.fleet.all_findings().filter(|f| f.severity >= Severity::Medium).count(), self.fleet.worst())),
                        Tab::Csv => Some((self.csv_findings.iter().filter(|f| f.severity >= Severity::Medium).count(), self.csv_findings.first().map(|f| f.severity))),
                        Tab::Drift => Some((self.drift.iter().filter(|d| !d.saved || d.added + d.removed > 0).count(), Some(Severity::Medium))),
                        _ => None,
                    };
                    let selected = self.tab == tab;
                    let (rect, resp) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 34.0), egui::Sense::click());
                    if selected || resp.hovered() {
                        ui.painter().rect_filled(rect, CornerRadius::same(8), if selected { theme::alpha(p.accent, 0.18) } else { p.raised });
                    }
                    if selected {
                        ui.painter().rect_filled(egui::Rect::from_min_size(rect.min + Vec2::new(0.0, 8.0), Vec2::new(3.0, 18.0)), CornerRadius::same(2), p.accent);
                    }
                    let color = if selected { p.accent } else { p.text };
                    ui.painter().text(rect.left_center() + Vec2::new(14.0, 0.0), egui::Align2::LEFT_CENTER, tab.icon(), egui::FontId::proportional(15.0), if selected { p.accent } else { p.muted });
                    ui.painter().text(rect.left_center() + Vec2::new(40.0, 0.0), egui::Align2::LEFT_CENTER, tab.label(), egui::FontId::proportional(14.5), color);
                    if let Some((n, sev)) = badge.filter(|(n, _)| *n > 0) {
                        let c = sev.map_or(p.muted, |s| theme::sev_color(s, dark));
                        let center = rect.right_center() - Vec2::new(20.0, 0.0);
                        ui.painter().rect_filled(egui::Rect::from_center_size(center, Vec2::new(28.0, 18.0)), CornerRadius::same(9), theme::alpha(c, 0.2));
                        ui.painter().text(center, egui::Align2::CENTER_CENTER, n.to_string(), egui::FontId::proportional(11.5), c);
                    }
                    if resp.clicked() {
                        self.tab = tab;
                    }
                }
                ui.with_layout(Layout::bottom_up(Align::Min), |ui| {
                    ui.label(RichText::new(format!("vlantool {}", env!("CARGO_PKG_VERSION"))).size(11.0).color(p.muted));
                    if self.project.is_some() && ui.add(egui::Button::new(RichText::new("Stäng projektet").size(12.0).color(p.muted)).frame(false)).clicked() {
                        self.close_project();
                    }
                });
            });
    }

    fn toasts(&mut self, ctx: &egui::Context) {
        self.toasts.retain(|t| t.born.elapsed() < Duration::from_secs(if t.error { 7 } else { 4 }));
        if self.toasts.is_empty() {
            return;
        }
        ctx.request_repaint_after(Duration::from_millis(250));
        let dark = self.dark();
        let p = palette(dark);
        egui::Area::new(egui::Id::unique("toasts"))
            .anchor(egui::Align2::RIGHT_BOTTOM, Vec2::new(-18.0, -18.0))
            .order(egui::Order::Foreground)
            .show(ctx, |ui| {
                for t in &self.toasts {
                    let c = if t.error { theme::sev_color(Severity::Critical, dark) } else { p.good };
                    egui::Frame::new()
                        .fill(p.card)
                        .stroke(Stroke::new(1.0, theme::alpha(c, 0.6)))
                        .corner_radius(CornerRadius::same(10))
                        .inner_margin(Margin::symmetric(14, 10))
                        .shadow(egui::Shadow { offset: [0, 4], blur: 16, spread: 0, color: Color32::from_black_alpha(80) })
                        .show(ui, |ui| {
                            ui.set_max_width(420.0);
                            ui.label(RichText::new(&t.text).color(c));
                        });
                    ui.add_space(6.0);
                }
            });
    }

    fn about(&mut self, ctx: &egui::Context) {
        if !self.show_about {
            return;
        }
        let dark = self.dark();
        let p = palette(dark);
        let mut open = true;
        egui::Window::new("Om vlantool").open(&mut open).collapsible(false).resizable(false).anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO).show(ctx, |ui| {
            ui.set_width(420.0);
            ui.label(RichText::new("◆ vlantool").size(24.0).strong().color(p.violet));
            ui.label(format!("Version {}", env!("CARGO_PKG_VERSION")));
            ui.add_space(6.0);
            ui.label("Genererar och granskar Cisco IOS-konfigar för Nordvik-nätet från CSV-filer. Rust-version av gruppens Python-verktyg (Felix, Attila, Patrik och Jonathan).");
            ui.add_space(10.0);
            ui.label(RichText::new("Kortkommandon").strong());
            egui::Grid::new("keys").num_columns(2).spacing([16.0, 4.0]).show(ui, |ui| {
                for (k, v) in [
                    ("Ctrl+G", "Generera från CSV"),
                    ("F5 / Ctrl+R", "Läs om"),
                    ("Ctrl+O", "Öppna projektmapp"),
                    ("Ctrl+1 … 9", "Byt flik"),
                    ("Ctrl+↑ / ↓", "Byt enhet"),
                    ("Ctrl+T", "Byt tema"),
                ] {
                    ui.label(RichText::new(k).monospace().color(p.accent));
                    ui.label(v);
                    ui.end_row();
                }
            });
        });
        self.show_about = open;
    }
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        if self.applied_dark != Some(self.prefs.dark) {
            theme::apply(&ctx, self.prefs.dark);
            self.applied_dark = Some(self.prefs.dark);
        }
        self.shortcuts(&ctx);
        let p = palette(self.dark());

        self.header(ui);
        if self.project.is_some() {
            self.sidebar(ui);
        }
        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(p.bg).inner_margin(Margin::same(20)))
            .show(ui, |ui| {
                if self.project.is_none() {
                    views::welcome(self, ui);
                } else {
                    views::show(self, ui);
                }
            });

        if let Some(dialog) = &mut self.folder {
            match dialog.show(&ctx, self.prefs.dark) {
                crate::folder::Outcome::Open(dir) => {
                    self.folder = None;
                    if Project::looks_valid(&dir) {
                        self.open_project(&dir);
                        self.toast(format!("Öppnade {}", dir.display()));
                    } else {
                        self.create_example(&dir);
                        self.toast(format!("Skapade ett nytt projekt i {}", dir.display()));
                    }
                }
                crate::folder::Outcome::Cancel => self.folder = None,
                crate::folder::Outcome::Pending => {}
            }
        }
        self.about(&ctx);
        self.toasts(&ctx);
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        eframe::set_value(storage, PREFS_KEY, &self.prefs);
    }

    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        palette(self.prefs.dark).bg.to_normalized_gamma_f32()
    }
}

/// Öppnar en fil eller mapp i skrivbordets standardprogram.
pub fn open_path(path: &Path) {
    if cfg!(test) {
        return;
    }
    let _ = std::process::Command::new("xdg-open").arg(path).spawn();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn example_project_round_trip() {
        let dir = std::env::temp_dir().join(format!("vlantool-gui-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut app = App::empty(Prefs::default());
        app.create_example(&dir);
        assert_eq!(app.fleet.devices.len(), 3, "exempelprojektet ska ge tre enheter");
        assert!(app.drift.iter().all(|d| d.saved && d.added + d.removed == 0), "nygenererat ska vara i fas med CSV");
        assert!(app.csv_findings.iter().all(|f| f.severity < Severity::Medium));

        app.export(Format::Html);
        assert!(dir.join("reports/rapport.html").exists());

        app.settings_draft.secret = "Hemligt123".into();
        app.save_settings();
        app.generate();
        assert_eq!(app.fleet.score, 100, "med riktigt lösenord ska allt vara grönt");

        // Ändra en sparad konfig för hand: drift ska märka det.
        let cfg = dir.join("configs/SW-Nordvik-1.cfg");
        let text = std::fs::read_to_string(&cfg).unwrap().replace(" transport input ssh", " transport input ssh telnet");
        std::fs::write(&cfg, text).unwrap();
        app.reload();
        assert!(app.drift.iter().any(|d| d.hostname == "SW-Nordvik-1" && d.added + d.removed > 0));
        assert!(app.fleet.worst() == Some(Severity::Critical));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
