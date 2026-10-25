//! Programmets tillstånd och allt det kan göra: öppna projekt, generera,
//! granska, exportera och spara inställningar.

use crate::files;
use crate::folder::FolderDialog;
use crate::history;
use crate::palette;
use crate::theme::{self, palette};
use crate::views;
use eframe::egui::{self, Align, Color32, CornerRadius, Key, Layout, Margin, RichText, Stroke, Ui, Vec2};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
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
    Rules,
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
    pub const ALL: [Tab; 11] =
        [Tab::Overview, Tab::Findings, Tab::Rules, Tab::Ports, Tab::Vlans, Tab::Topology, Tab::Config, Tab::Drift, Tab::Csv, Tab::Subnet, Tab::Settings];

    pub fn label(self) -> &'static str {
        match self {
            Tab::Overview => "Översikt",
            Tab::Findings => "Fynd",
            Tab::Rules => "Regler",
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
            Tab::Rules => "✔",
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
    /// Högkontrast; gäller bara när `dark` är sant (det är ett läge av det mörka temat).
    pub contrast: bool,
    /// Textstorlek för hela programmet (Ctrl+= / Ctrl+−).
    pub zoom: f32,
    /// Textstorlek i konfigvyn.
    pub cfg_font: f32,
    /// Senaste flik och enhet per projektmapp.
    pub per_project: BTreeMap<String, ProjView>,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs { dark: true, last_project: None, recent: Vec::new(), contrast: false, zoom: 1.0, cfg_font: 13.0, per_project: BTreeMap::new() }
    }
}

/// Vad som var öppet sist i ett projekt.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjView {
    pub tab: String,
    pub device: String,
}

pub const MAX_TOASTS: usize = 4;
const WATCH_EVERY: Duration = Duration::from_secs(2);

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
    applied_theme: Option<(bool, bool)>,
}

const PREFS_KEY: &str = "vlantool-prefs";

impl App {
    pub fn new(cc: &eframe::CreationContext<'_>, start: Option<PathBuf>) -> Self {
        theme::install_fonts(&cc.egui_ctx);
        // Ctrl+= / Ctrl+− hanteras av programmet själv (egui:s egen zoom vet inte om konfigvyn).
        cc.egui_ctx.options_mut(|o| o.zoom_with_keyboard = false);
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
        // VLANTOOL_STATE=palette=gen,help,all,group,cfgsearch=telnet,close öppnar vyer för skärmbilder.
        for token in std::env::var("VLANTOOL_STATE").unwrap_or_default().split(',') {
            let (key, value) = token.split_once('=').unwrap_or((token, ""));
            match key {
                "palette" => {
                    app.sa.palette_open = true;
                    app.sa.palette_query = value.to_string();
                }
                "help" => app.sa.help_open = true,
                "all" => app.sa.all_devices = true,
                "group" => app.sa.group_by_rule = true,
                "cfgsearch" => app.sa.cfg_search = value.to_string(),
                "cfgscroll" => app.sa.cfg_scroll = value.parse().ok(),
                "close" => app.close_project(),
                _ => {}
            }
        }
        if let Ok(theme) = std::env::var("VLANTOOL_THEME") {
            app.prefs.dark = theme != "light";
            app.prefs.contrast = theme == "contrast";
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
            applied_theme: None,
        }
    }

    pub fn dark(&self) -> bool {
        self.prefs.dark
    }

    pub fn toast(&mut self, text: impl Into<String>) {
        self.push_toast(text.into(), false);
    }

    pub fn error(&mut self, text: impl Into<String>) {
        self.push_toast(text.into(), true);
    }

    /// Högst `MAX_TOASTS` notiser åt gången; den äldsta försvinner när en femte kommer.
    fn push_toast(&mut self, text: String, error: bool) {
        self.toasts.push(Toast { text, error, born: Instant::now() });
        let extra = self.toasts.len().saturating_sub(MAX_TOASTS);
        self.toasts.drain(..extra);
    }

    pub fn project_name(&self) -> String {
        self.project.as_ref().and_then(|p| p.root.file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_default()
    }

    pub fn theme_label(&self) -> &'static str {
        match (self.prefs.dark, self.prefs.contrast) {
            (false, _) => "Ljust",
            (true, false) => "Mörkt",
            (true, true) => "Kontrast",
        }
    }

    /// Mörkt, ljust, högkontrast, mörkt …
    pub fn cycle_theme(&mut self) {
        match (self.prefs.dark, self.prefs.contrast) {
            (true, false) => self.prefs.dark = false,
            (false, _) => {
                self.prefs.dark = true;
                self.prefs.contrast = true;
            }
            (true, true) => self.prefs.contrast = false,
        }
    }

    pub fn zoom_by(&mut self, delta: f32) {
        self.prefs.zoom = (((self.prefs.zoom + delta) * 10.0).round() / 10.0).clamp(0.7, 2.0);
    }

    pub fn cfg_font_by(&mut self, delta: f32) {
        self.prefs.cfg_font = (self.prefs.cfg_font + delta).clamp(9.0, 26.0);
    }

    /// Enheternas ordning i listan enligt sortering och textfilter.
    pub fn device_order(&self) -> Vec<usize> {
        views::device_order(&self.fleet, &self.sa.dev_filter, self.sa.dev_sort)
    }

    /// Fönstertiteln: projekt och betyg.
    pub fn window_title(&self) -> String {
        if self.project.is_none() {
            return "vlantool".into();
        }
        if self.fleet.devices.is_empty() {
            return format!("{} – vlantool", self.project_name());
        }
        format!("{} – betyg {} ({}) – vlantool", self.project_name(), self.fleet.score, self.fleet.grade)
    }

    pub fn copy_summary(&mut self, ctx: &egui::Context) {
        ctx.copy_text(views::summary_markdown(&self.project_name(), &self.fleet));
        self.toast("✔ Kopierade sammanfattningen (Markdown) till urklipp");
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
        self.sa.history = history::load(&project.root);
        self.project = Some(project);
        self.device = 0;
        self.finding = 0;
        self.scene_rect = egui::Rect::ZERO;
        self.sa.all_devices = false;
        self.sa.cfg_search.clear();
        self.reload();
        self.restore_view(dir);
    }

    /// Går tillbaka till fliken och enheten som var öppen sist i projektet.
    fn restore_view(&mut self, dir: &Path) {
        let Some(view) = self.prefs.per_project.get(&dir.to_string_lossy().to_string()).cloned() else { return };
        if let Some(t) = Tab::ALL.iter().find(|t| t.label() == view.tab) {
            self.tab = *t;
        }
        if let Some(i) = self.fleet.devices.iter().position(|d| d.name == view.device) {
            self.select_device(i);
        }
    }

    fn remember_view(&mut self) {
        let Some(project) = &self.project else { return };
        let key = project.root.to_string_lossy().to_string();
        let want = ProjView { tab: self.tab.label().to_string(), device: self.fleet.devices.get(self.device).map(|d| d.name.clone()).unwrap_or_default() };
        if self.prefs.per_project.get(&key) != Some(&want) {
            self.prefs.per_project.insert(key, want);
        }
    }

    fn watch_dirs(&self) -> Vec<PathBuf> {
        self.project.iter().flat_map(|p| [p.samples(), p.configs()]).collect()
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
        self.sa.last_load = Some(Instant::now());
        self.sa.watch_stamp = files::scan(&self.watch_dirs());
        self.sa.watch_checked = Instant::now();
        if !self.fleet.devices.is_empty() && history::record(&mut self.sa.history, history::now(), self.fleet.score) {
            let _ = history::save(&project.root, &self.sa.history);
        }
    }

    /// Skriver `! vlantool:ignore <regel>` överst i enhetens konfig och läser om.
    pub fn ignore_rule(&mut self, dev: usize, rule: &str) {
        let Some(d) = self.fleet.devices.get(dev) else { return };
        let (path, name) = (PathBuf::from(&d.path), d.name.clone());
        let text = match std::fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) => return self.error(format!("Kunde inte läsa {}: {e}", path.display())),
        };
        let Some(new) = files::insert_ignore(&text, rule) else {
            return self.toast(format!("Regeln {rule} är redan ignorerad för {name}"));
        };
        match std::fs::write(&path, new) {
            Ok(()) => {
                self.reload();
                self.toast(format!("✔ Ignorerar {rule} för {name} (skrivs över om du genererar om från CSV)"));
            }
            Err(e) => self.error(format!("Kunde inte skriva {}: {e}", path.display())),
        }
    }

    /// Läser om när filer i samples/ eller configs/ ändrats (kollar högst varannan sekund).
    fn watch(&mut self, ctx: &egui::Context) {
        if self.project.is_none() {
            return;
        }
        ctx.request_repaint_after(WATCH_EVERY);
        if self.sa.watch_checked.elapsed() < WATCH_EVERY {
            return;
        }
        self.sa.watch_checked = Instant::now();
        if files::scan(&self.watch_dirs()) != self.sa.watch_stamp {
            self.reload();
            self.toast("Filer i projektet ändrades – läste om");
        }
    }

    /// Konfigfiler som släpps på fönstret kopieras till configs/.
    fn dropped(&mut self, ctx: &egui::Context) {
        let dropped = ctx.input(|i| i.raw.dropped_files.clone());
        if dropped.is_empty() {
            return;
        }
        let Some(project) = self.project.clone() else {
            return self.error("Öppna ett projekt först, så kan du släppa konfigar på fönstret");
        };
        let paths: Vec<PathBuf> = dropped.into_iter().map(|f| f.path().to_path_buf()).collect();
        let (copied, skipped) = files::copy_dropped(&project.configs(), &paths);
        if !copied.is_empty() {
            self.reload();
            self.toast(format!("✔ Kopierade {} till configs/", copied.join(", ")));
        }
        if !skipped.is_empty() {
            self.error(format!("Hoppade över {} (bara .cfg, .txt och .conf kopieras)", skipped.join(", ")));
        }
    }

    fn drop_overlay(&self, ctx: &egui::Context) {
        if !ctx.input(|i| !i.raw.hovered_files.is_empty()) {
            return;
        }
        let p = palette(self.dark());
        let painter = ctx.layer_painter(egui::LayerId::new(egui::Order::Foreground, egui::Id::unique("drop-overlay")));
        let rect = ctx.content_rect();
        painter.rect_filled(rect, 0.0, theme::alpha(p.bg, 0.85));
        painter.rect_stroke(rect.shrink(18.0), CornerRadius::same(16), Stroke::new(2.5, p.accent), egui::StrokeKind::Inside);
        painter.text(rect.center(), egui::Align2::CENTER_CENTER, "Släpp .cfg-filer här för att lägga dem i configs/", egui::FontId::proportional(24.0), p.text);
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
        let generated = match generator::generate_all(inv, &self.settings) {
            Ok(g) => g,
            Err(e) => return self.error(format!("Kunde inte generera: {e:#}")),
        };
        let new: Vec<(String, String)> = generated.iter().map(|g| (format!("{}.cfg", g.hostname), format!("{}\n", g.text))).collect();
        // Det som skrivs över sparas först i configs/.backup/<tid>/.
        let result = std::fs::create_dir_all(project.configs())
            .and_then(|_| files::backup_configs(&project.configs(), &new, &history::stamp(history::now())))
            .and_then(|saved| {
                for (name, text) in &new {
                    std::fs::write(project.configs().join(name), text)?;
                }
                Ok(saved)
            });
        match result {
            Ok(saved) => {
                self.reload();
                let backup = if saved > 0 { format!(" ({saved} gamla sparade i configs/.backup/)") } else { String::new() };
                self.toast(format!("✔ Genererade {} konfigar{backup}", new.len()));
            }
            Err(e) => self.error(format!("Kunde inte generera: {e}")),
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

    /// Används av testerna och reserv för kommandon; rubrikens Exportera-knapp öppnar views::export.
    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
        let (reload, generate, open, theme, tabs, palette_key, help, find, zoom, zoom_reset) = ctx.input(|i| {
            let ctrl = i.modifiers.command;
            let mut tab = None;
            for (n, key) in [Key::Num1, Key::Num2, Key::Num3, Key::Num4, Key::Num5, Key::Num6, Key::Num7, Key::Num8, Key::Num9].iter().enumerate() {
                if ctrl && i.key_pressed(*key) {
                    tab = Some(n);
                }
            }
            let mut zoom = 0;
            if ctrl && (i.key_pressed(Key::Equals) || i.key_pressed(Key::Plus)) {
                zoom = 1;
            }
            if ctrl && i.key_pressed(Key::Minus) {
                zoom = -1;
            }
            (
                i.key_pressed(Key::F5) || (ctrl && i.key_pressed(Key::R)),
                ctrl && i.key_pressed(Key::G),
                ctrl && i.key_pressed(Key::O),
                ctrl && i.key_pressed(Key::T),
                tab,
                ctrl && i.key_pressed(Key::K),
                i.key_pressed(Key::F1),
                ctrl && i.key_pressed(Key::F),
                zoom,
                ctrl && i.key_pressed(Key::Num0),
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
            self.cycle_theme();
        }
        if palette_key {
            self.sa.palette_open = !self.sa.palette_open;
            self.sa.palette_query.clear();
            self.sa.palette_sel = 0;
        }
        if help {
            self.sa.help_open = !self.sa.help_open;
        }
        if let Some(n) = tabs {
            self.tab = Tab::ALL[n];
        }
        if find {
            match self.tab {
                Tab::Config => ctx.memory_mut(|m| m.request_focus(egui::Id::unique("cfg_search"))),
                Tab::Findings => ctx.memory_mut(|m| m.request_focus(egui::Id::unique("findings_search"))),
                _ => {}
            }
        }
        // I konfigvyn ändrar Ctrl+= / Ctrl+− bara konfigtexten, annars hela programmet.
        if zoom != 0 {
            if self.tab == Tab::Config {
                self.cfg_font_by(zoom as f32);
            } else {
                self.zoom_by(0.1 * zoom as f32);
            }
        }
        if zoom_reset {
            self.prefs.zoom = 1.0;
            self.prefs.cfg_font = 13.0;
        }
        if self.tab.per_device() && !self.fleet.devices.is_empty() && !(self.tab == Tab::Findings && self.sa.all_devices) {
            let order = self.device_order();
            let (up, down) = ctx.input(|i| (i.modifiers.command && i.key_pressed(Key::ArrowUp), i.modifiers.command && i.key_pressed(Key::ArrowDown)));
            if !order.is_empty() && (up || down) {
                let n = order.len();
                let pos = order.iter().position(|&d| d == self.device);
                let next = match (pos, down) {
                    (None, _) => 0,
                    (Some(p), true) => (p + 1) % n,
                    (Some(p), false) => (p + n - 1) % n,
                };
                self.select_device(order[next]);
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
                    if let Some(root) = self.project.as_ref().map(|p| p.root.clone()) {
                        let name = self.project_name();
                        let recent: Vec<PathBuf> = self.prefs.recent.iter().filter(|r| r.is_dir()).cloned().collect();
                        let (mut open, mut browse, mut close) = (None, false, false);
                        ui.menu_button(RichText::new(format!("◆ {name}  ▾")).color(p.text), |ui| {
                            ui.label(RichText::new("SENASTE PROJEKT").size(11.0).color(p.muted));
                            for dir in &recent {
                                let current = *dir == root;
                                let label = format!("{} {}", if current { "✔" } else { "  " }, dir.file_name().map_or_else(|| dir.display().to_string(), |n| n.to_string_lossy().to_string()));
                                if ui.button(label).on_hover_text(dir.display().to_string()).clicked() {
                                    open = Some(dir.clone());
                                    ui.close();
                                }
                            }
                            ui.separator();
                            if ui.button("Öppna mapp …   Ctrl+O").clicked() {
                                browse = true;
                                ui.close();
                            }
                            if ui.button("Stäng projektet").clicked() {
                                close = true;
                                ui.close();
                            }
                        })
                        .response
                        .on_hover_text(root.display().to_string());
                        if let Some(dir) = open.filter(|d| *d != root) {
                            self.open_project(&dir);
                        }
                        if browse {
                            self.folder = Some(FolderDialog::new(Some(root)));
                        }
                        if close {
                            self.close_project();
                        }
                    }
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if ui.add(egui::Button::new(RichText::new("?").size(16.0)).frame(false)).on_hover_text("Kortkommandon (F1)").clicked() {
                            self.sa.help_open = true;
                        }
                        if ui.add(egui::Button::new(RichText::new(format!("◐ {}", self.theme_label())).size(14.0)).frame(false)).on_hover_text("Byt tema: mörkt, ljust, högkontrast (Ctrl+T)").clicked() {
                            self.cycle_theme();
                        }
                        if self.project.is_none() {
                            return;
                        }
                        ui.add_space(8.0);
                        if ui.button("⇩ Exportera …").on_hover_text("Välj format och spara i reports/").clicked() {
                            views::export::open(self);
                        }
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
        // Osparade inställningar markeras med en prick vid fliken Inställningar (163).
        let settings_dirty = self.settings_draft.to_toml() != self.settings.to_toml();
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
                    if tab == Tab::Settings && settings_dirty {
                        let c = theme::sev_color(Severity::Medium, dark);
                        ui.painter().circle_filled(rect.right_center() - Vec2::new(20.0, 0.0), 5.0, c);
                        resp.clone().on_hover_text("Osparade ändringar i inställningarna");
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
                    if ui.add(egui::Button::new(RichText::new("Ctrl+K  Kommandon").size(12.0).color(p.muted)).frame(false)).clicked() {
                        self.sa.palette_open = true;
                        self.sa.palette_query.clear();
                    }
                });
            });
    }

    /// Statusrad längst ner (175): projektmapp, senaste inläsning och antal fynd.
    fn statusbar(&mut self, ui: &mut Ui) {
        let Some(project) = &self.project else { return };
        let dark = self.dark();
        let p = palette(dark);
        ui.ctx().request_repaint_after(Duration::from_secs(1));
        let total = self.fleet.all_findings().count();
        let critical = self.fleet.count(Severity::Critical);
        let ago = self.sa.last_load.map(|t| ago_text(t.elapsed().as_secs()));
        egui::Panel::bottom("status")
            .frame(egui::Frame::new().fill(p.panel).inner_margin(Margin::symmetric(14, 4)).stroke(Stroke::new(1.0, p.line)))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(format!("◆ {}", project.root.display())).size(12.0).color(p.muted));
                    if let Some(ago) = ago {
                        ui.label(RichText::new("·").color(p.line));
                        ui.label(RichText::new(format!("Inläst {ago}")).size(12.0).color(p.muted));
                    }
                    ui.label(RichText::new("·").color(p.line));
                    ui.label(RichText::new(format!("{total} fynd")).size(12.0).color(p.muted));
                    if critical > 0 {
                        ui.label(RichText::new(format!("{critical} kritiska")).size(12.0).strong().color(theme::sev_color(Severity::Critical, dark)));
                    }
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.label(RichText::new(format!("{} · text {:.0} %", self.theme_label(), self.prefs.zoom * 100.0)).size(12.0).color(p.muted));
                    });
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
        let mut close = None;
        egui::Area::new(egui::Id::unique("toasts"))
            .anchor(egui::Align2::RIGHT_BOTTOM, Vec2::new(-18.0, -40.0))
            .order(egui::Order::Foreground)
            .show(ctx, |ui| {
                for (i, t) in self.toasts.iter().enumerate() {
                    let c = if t.error { theme::sev_color(Severity::Critical, dark) } else { p.good };
                    let resp = egui::Frame::new()
                        .fill(p.card)
                        .stroke(Stroke::new(1.0, theme::alpha(c, 0.6)))
                        .corner_radius(CornerRadius::same(10))
                        .inner_margin(Margin::symmetric(14, 10))
                        .shadow(egui::Shadow { offset: [0, 4], blur: 16, spread: 0, color: Color32::from_black_alpha(80) })
                        .show(ui, |ui| {
                            ui.set_max_width(420.0);
                            ui.label(RichText::new(&t.text).color(c));
                        })
                        .response
                        .interact(egui::Sense::click())
                        .on_hover_text("Klicka för att stänga");
                    if resp.clicked() {
                        close = Some(i);
                    }
                    ui.add_space(6.0);
                }
            });
        if let Some(i) = close {
            self.toasts.remove(i);
        }
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
            if ui.button("Visa alla kortkommandon (F1)").clicked() {
                self.sa.help_open = true;
            }
        });
        self.show_about = open;
    }
}

impl App {
    /// Tema, textstorlek och fönstertitel följer inställningarna.
    fn apply_look(&mut self, ctx: &egui::Context) {
        let key = (self.prefs.dark, self.prefs.dark && self.prefs.contrast);
        if self.applied_theme != Some(key) {
            theme::set_high_contrast(key.1);
            theme::apply(ctx, key.0);
            self.applied_theme = Some(key);
        }
        if (self.sa.applied_zoom - self.prefs.zoom).abs() > 0.001 {
            ctx.set_zoom_factor(self.prefs.zoom);
            self.sa.applied_zoom = self.prefs.zoom;
        }
    }

    fn update_title(&mut self, ctx: &egui::Context) {
        let title = self.window_title();
        if title != self.sa.last_title {
            ctx.send_viewport_cmd(egui::ViewportCommand::Title(title.clone()));
            self.sa.last_title = title;
        }
    }
}

/// "för 12 s sedan", "för 3 min sedan", "för 2 h sedan".
pub fn ago_text(secs: u64) -> String {
    match secs {
        0..=4 => "just nu".into(),
        5..=59 => format!("för {secs} s sedan"),
        60..=3599 => format!("för {} min sedan", secs / 60),
        _ => format!("för {} h sedan", secs / 3600),
    }
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.apply_look(&ctx);
        self.shortcuts(&ctx);
        self.dropped(&ctx);
        self.watch(&ctx);
        let p = palette(self.dark());

        self.header(ui);
        if self.project.is_some() {
            self.statusbar(ui);
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
        views::export::show(self, &ctx);
        self.about(&ctx);
        palette::show_help(self, &ctx);
        palette::show(self, &ctx);
        self.drop_overlay(&ctx);
        self.toasts(&ctx);
        self.remember_view();
        self.update_title(&ctx);
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

    fn example(name: &str) -> (App, PathBuf) {
        let dir = std::env::temp_dir().join(format!("vlantool-gui-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut app = App::empty(Prefs::default());
        app.create_example(&dir);
        (app, dir)
    }

    #[test]
    fn at_most_four_toasts_and_title_shows_grade() {
        let (mut app, dir) = example("toasts");
        for i in 0..7 {
            app.toast(format!("n{i}"));
        }
        assert_eq!(app.toasts.len(), MAX_TOASTS);
        assert_eq!(app.toasts[0].text, "n3", "den äldsta ska ha fallit bort");
        let title = app.window_title();
        assert!(title.contains(&app.project_name()) && title.contains(&format!("betyg {}", app.fleet.score)), "{title}");
        assert_eq!(App::empty(Prefs::default()).window_title(), "vlantool");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn history_is_saved_when_grade_changes_and_view_is_remembered() {
        let (mut app, dir) = example("history");
        let saved = history::load(&dir);
        assert_eq!(saved.len(), 1, "första inläsningen ger en punkt");
        app.reload();
        assert_eq!(history::load(&dir).len(), 1, "oförändrat betyg ger ingen ny punkt");
        app.settings_draft.secret = "Hemligt123".into();
        app.save_settings();
        app.generate();
        let after = history::load(&dir);
        assert!(after.len() >= 2 && after.last().unwrap().betyg == 100, "{after:?}");

        app.tab = Tab::Rules;
        app.select_device(1);
        app.remember_view();
        let name = app.fleet.devices[1].name.clone();
        app.close_project();
        app.tab = Tab::Overview;
        app.open_project(&dir);
        assert_eq!(app.tab, Tab::Rules);
        assert_eq!(app.fleet.devices[app.device].name, name);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn generate_backs_up_changed_configs_and_ignore_rule_rewrites_file() {
        let (mut app, dir) = example("backup");
        let cfg = dir.join("configs/SW-Nordvik-1.cfg");
        let edited = format!("{}! min egen rad\n", std::fs::read_to_string(&cfg).unwrap());
        std::fs::write(&cfg, &edited).unwrap();
        app.reload();
        app.generate();
        let backups: Vec<_> = std::fs::read_dir(dir.join("configs/.backup")).unwrap().flatten().collect();
        assert_eq!(backups.len(), 1);
        let saved = std::fs::read_to_string(backups[0].path().join("SW-Nordvik-1.cfg")).unwrap();
        assert_eq!(saved, edited, "den handredigerade konfigen ska ligga kvar i säkerhetskopian");
        assert!(!backups[0].path().join("SW-Nordvik-2.cfg").exists(), "oförändrade filer kopieras inte");

        let dev = app.fleet.devices.iter().position(|d| d.name == "SW-Nordvik-1").unwrap();
        app.ignore_rule(dev, "banner");
        let text = std::fs::read_to_string(&cfg).unwrap();
        assert_eq!(text.matches("! vlantool:ignore banner").count(), 1);
        app.ignore_rule(dev, "banner");
        assert_eq!(std::fs::read_to_string(&cfg).unwrap().matches("! vlantool:ignore banner").count(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn theme_cycles_through_three_looks() {
        let mut app = App::empty(Prefs::default());
        let seen: Vec<_> = (0..4).map(|_| {
            let l = app.theme_label();
            app.cycle_theme();
            l
        }).collect();
        assert_eq!(seen, vec!["Mörkt", "Ljust", "Kontrast", "Mörkt"]);
        assert_eq!(ago_text(2), "just nu");
        assert_eq!(ago_text(75), "för 1 min sedan");
    }
}
