//! En enkel mappväljare ritad med egui, så att programmet inte behöver GTK.

use crate::theme::{self, palette};
use eframe::egui::{self, RichText, Vec2};
use std::path::{Path, PathBuf};
use vlantool::project::Project;

pub enum Outcome {
    Pending,
    Open(PathBuf),
    Cancel,
}

pub struct FolderDialog {
    current: PathBuf,
    typed: String,
    new_name: String,
    entries: Vec<PathBuf>,
    show_hidden: bool,
    error: Option<String>,
}

impl FolderDialog {
    pub fn new(start: Option<PathBuf>) -> Self {
        let start = start.filter(|p| p.is_dir()).or_else(dirs::home_dir).unwrap_or_else(|| PathBuf::from("/"));
        let mut d = FolderDialog { current: PathBuf::new(), typed: String::new(), new_name: String::new(), entries: Vec::new(), show_hidden: false, error: None };
        d.go(start);
        d
    }

    fn go(&mut self, dir: PathBuf) {
        match std::fs::read_dir(&dir) {
            Ok(rd) => {
                let mut entries: Vec<PathBuf> = rd
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .filter(|p| self.show_hidden || !p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')))
                    .collect();
                entries.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));
                self.entries = entries;
                self.typed = dir.display().to_string();
                self.current = dir;
                self.error = None;
            }
            Err(e) => self.error = Some(format!("{}: {e}", dir.display())),
        }
    }

    pub fn show(&mut self, ctx: &egui::Context, dark: bool) -> Outcome {
        let p = palette(dark);
        let mut outcome = Outcome::Pending;
        let mut open = true;
        egui::Window::new("Välj projektmapp")
            .open(&mut open)
            .collapsible(false)
            .resizable(true)
            .default_size(Vec2::new(620.0, 480.0))
            .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
            .show(ctx, |ui| {
                let mut target: Option<PathBuf> = None;
                ui.horizontal(|ui| {
                    if ui.button("⬆").on_hover_text("Upp en nivå").clicked() {
                        target = self.current.parent().map(Path::to_path_buf);
                    }
                    if ui.button("Hem").on_hover_text("Hemmapp").clicked() {
                        target = dirs::home_dir();
                    }
                    if let Some(docs) = dirs::document_dir()
                        && ui.button("Dokument").clicked() {
                            target = Some(docs);
                        }
                    let resp = ui.add(egui::TextEdit::singleline(&mut self.typed).desired_width(f32::INFINITY));
                    if resp.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                        target = Some(PathBuf::from(self.typed.trim()));
                    }
                });
                if let Some(e) = &self.error {
                    ui.label(RichText::new(e).color(theme::sev_color(vlantool::finding::Severity::High, dark)));
                }
                let valid = Project::looks_valid(&self.current);
                ui.label(
                    RichText::new(if valid {
                        "✔ Den här mappen är ett vlantool-projekt"
                    } else {
                        "Ingen samples/ eller configs/ här – väljer du mappen skapas ett nytt projekt med exempelfiler"
                    })
                    .size(12.0)
                    .color(if valid { p.good } else { p.muted }),
                );
                ui.add_space(4.0);
                egui::Frame::new().fill(p.code_bg).corner_radius(egui::CornerRadius::same(10)).inner_margin(egui::Margin::same(6)).show(ui, |ui| {
                    egui::ScrollArea::vertical().auto_shrink([false, false]).max_height(300.0).show(ui, |ui| {
                        if self.entries.is_empty() {
                            ui.label(RichText::new("(inga undermappar)").color(p.muted));
                        }
                        for dir in &self.entries {
                            let name = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                            let project = Project::looks_valid(dir);
                            let text = if project { format!("◆  {name}") } else { format!("▸  {name}") };
                            let resp = ui.add_sized(
                                Vec2::new(ui.available_width(), 26.0),
                                egui::Button::new(RichText::new(text).color(if project { p.violet } else { p.text })).frame(false),
                            );
                            if resp.clicked() {
                                target = Some(dir.clone());
                            }
                        }
                    });
                });
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    ui.add(egui::TextEdit::singleline(&mut self.new_name).hint_text("Ny mapp …").desired_width(180.0));
                    if ui.add_enabled(!self.new_name.trim().is_empty(), egui::Button::new("Skapa")).clicked() {
                        let dir = self.current.join(self.new_name.trim());
                        match std::fs::create_dir_all(&dir) {
                            Ok(()) => {
                                self.new_name.clear();
                                target = Some(dir);
                            }
                            Err(e) => self.error = Some(e.to_string()),
                        }
                    }
                    if ui.checkbox(&mut self.show_hidden, "Dolda").changed() {
                        target = Some(self.current.clone());
                    }
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if theme::primary_button(ui, "Välj den här mappen", dark).clicked() {
                            outcome = Outcome::Open(self.current.clone());
                        }
                        if ui.button("Avbryt").clicked() {
                            outcome = Outcome::Cancel;
                        }
                    });
                });
                if let Some(t) = target {
                    self.go(t);
                }
            });
        if !open {
            outcome = Outcome::Cancel;
        }
        outcome
    }
}
