//! Innehållet i varje flik. En fil per flik; gemensamma hjälpfunktioner ligger här.

use crate::app::{open_path, App, Tab};
use crate::theme::{self, palette, Palette};
use eframe::egui::{
    self, text::LayoutJob, Align, Align2, Color32, CornerRadius, FontId, Layout, Margin, Pos2, Rect, RichText, Sense, Stroke, TextFormat, Ui,
    Vec2,
};
use egui_extras::{Column, TableBuilder};
use std::collections::BTreeSet;
use vlantool::finding::{Finding, Severity};
use vlantool::inventory::{join_vlans, short_port, PortMode};
use vlantool::net::{self, Subnet};
use vlantool::parser::{IfMode, Kind};
use vlantool::{rules, topology};

mod overview;
mod findings;
mod ports;
mod vlans;
mod topo;
mod config;
mod drift;
mod csv;
mod subnet;
mod settings;
pub mod state_a;
pub mod state_b;

pub fn show(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    if app.fleet.devices.is_empty() && !matches!(app.tab, Tab::Csv | Tab::Subnet | Tab::Settings | Tab::Drift) {
        empty_state(app, ui);
        return;
    }
    if app.tab.per_device() {
        egui::Panel::left("devices")
            .resizable(false)
            .exact_size(230.0)
            .frame(egui::Frame::new().inner_margin(Margin { left: 0, right: 16, top: 0, bottom: 0 }))
            .show(ui, |ui| device_list(app, ui));
    }
    let _ = dark;
    match app.tab {
        Tab::Overview => overview::overview(app, ui),
        Tab::Findings => findings::findings(app, ui),
        Tab::Ports => ports::ports(app, ui),
        Tab::Vlans => vlans::vlans(app, ui),
        Tab::Topology => topo::topology_view(app, ui),
        Tab::Config => config::config(app, ui),
        Tab::Drift => drift::drift(app, ui),
        Tab::Csv => csv::csv(app, ui),
        Tab::Subnet => subnet::subnet(app, ui),
        Tab::Settings => settings::settings(app, ui),
    }
}

pub(crate) fn file_name(path: &str) -> String {
    std::path::Path::new(path).file_name().map_or_else(|| path.to_string(), |n| n.to_string_lossy().to_string())
}

pub(crate) fn heading(ui: &mut Ui, title: &str, subtitle: &str, p: &Palette) {
    ui.label(RichText::new(title).size(24.0).strong());
    if !subtitle.is_empty() {
        ui.label(RichText::new(subtitle).color(p.muted));
    }
    ui.add_space(12.0);
}

pub fn welcome(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    ui.vertical_centered(|ui| {
        ui.add_space((ui.available_height() * 0.12).max(10.0));
        ui.label(RichText::new("◆").size(56.0).color(p.violet));
        ui.label(RichText::new("Välkommen till vlantool").size(30.0).strong());
        ui.label(RichText::new("Bygg och granska Cisco-konfigar för Nordvik-nätet direkt från CSV-filer.").size(16.0).color(p.muted));
        ui.add_space(26.0);
        let example = App::default_example_dir();
        ui.allocate_ui_with_layout(Vec2::new(560.0, 0.0), Layout::top_down(Align::Center), |ui| {
            theme::card(dark).show(ui, |ui| {
                ui.set_width(520.0);
                ui.horizontal(|ui| {
                    ui.vertical(|ui| {
                        ui.label(RichText::new("Kom igång med gruppens exempel").size(17.0).strong());
                        ui.label(RichText::new(format!("Skapar {} med ports.csv, dhcp.csv och devices.csv och genererar konfigarna.", example.display())).color(p.muted));
                    });
                });
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if theme::primary_button(ui, "⚡ Skapa exempelprojekt", dark).clicked() {
                        app.create_example(&example);
                    }
                    if ui.button("Öppna mapp …").clicked() {
                        app.folder = Some(crate::folder::FolderDialog::new(None));
                    }
                });
            });
            let recent: Vec<_> = app.prefs.recent.iter().filter(|p| p.is_dir()).cloned().collect();
            if !recent.is_empty() {
                ui.add_space(14.0);
                theme::card(dark).show(ui, |ui| {
                    ui.set_width(520.0);
                    ui.label(RichText::new("Senaste projekt").strong());
                    for dir in recent {
                        if ui.add(egui::Button::new(RichText::new(format!("◆  {}", dir.display())).color(p.accent)).frame(false)).clicked() {
                            app.open_project(&dir);
                        }
                    }
                });
            }
        });
    });
}

pub(crate) fn empty_state(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    ui.vertical_centered(|ui| {
        ui.add_space(ui.available_height() * 0.2);
        ui.label(RichText::new("≣").size(48.0).color(p.muted));
        ui.label(RichText::new("Inga konfigar än").size(22.0).strong());
        ui.label(RichText::new("Generera dem från CSV-filerna i samples/ eller lägg .cfg-filer i configs/.").color(p.muted));
        ui.add_space(12.0);
        if app.inventory.is_some() {
            if theme::primary_button(ui, "⚡ Generera från CSV", dark).clicked() {
                app.generate();
            }
        } else if theme::primary_button(ui, "Lägg in gruppens exempelfiler här", dark).clicked()
            && let Some(root) = app.project.as_ref().map(|p| p.root.clone()) {
                app.create_example(&root);
            }
    });
}

pub(crate) fn device_list(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    ui.label(RichText::new("ENHETER").size(11.0).color(p.muted));
    ui.add_space(4.0);
    let mut clicked = None;
    egui::ScrollArea::vertical().id_salt("devlist").show(ui, |ui| {
        for (i, d) in app.fleet.devices.iter().enumerate() {
            let selected = i == app.device;
            let frame = egui::Frame::new()
                .fill(if selected { theme::alpha(p.accent, 0.14) } else { p.card })
                .stroke(Stroke::new(1.0, if selected { theme::alpha(p.accent, 0.8) } else { p.line }))
                .corner_radius(CornerRadius::same(12))
                .inner_margin(Margin::symmetric(10, 8));
            let resp = frame
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.horizontal(|ui| {
                        theme::score_ring(ui, d.score, 40.0, dark);
                        ui.vertical(|ui| {
                            ui.label(RichText::new(&d.name).strong());
                            let icon = if d.config.kind == Kind::Router { "◉" } else { "▣" };
                            let n = d.findings().count();
                            ui.label(RichText::new(format!("{icon} {} · {n} fynd", d.kind)).size(12.0).color(p.muted));
                        });
                    });
                })
                .response
                .interact(Sense::click());
            if resp.clicked() {
                clicked = Some(i);
            }
            ui.add_space(6.0);
        }
    });
    if let Some(i) = clicked {
        app.select_device(i);
    }
}

pub(crate) fn code_block(ui: &mut Ui, text: &str, dark: bool) {
    let p = palette(dark);
    egui::Frame::new().fill(p.code_bg).corner_radius(CornerRadius::same(8)).inner_margin(Margin::same(10)).show(ui, |ui| {
        ui.set_width(ui.available_width());
        for line in text.lines() {
            let mut job = LayoutJob::default();
            highlight_into(&mut job, line, &p, dark);
            ui.label(job);
        }
    });
}

pub(crate) fn fmt(color: Color32, mono: bool) -> TextFormat {
    TextFormat { font_id: if mono { FontId::monospace(13.0) } else { FontId::proportional(14.0) }, color, ..Default::default() }
}

/// Syntaxfärgning för en IOS-rad.
pub(crate) fn highlight_into(job: &mut LayoutJob, text: &str, p: &Palette, dark: bool) {
    if text.trim_start().starts_with('!') {
        job.append(text, 0.0, TextFormat { italics: true, ..fmt(p.muted, true) });
        return;
    }
    let indent = text.len() - text.trim_start().len();
    let t = text.trim_start();
    job.append(&" ".repeat(indent), 0.0, fmt(p.text, true));
    let (first, rest) = t.split_once(' ').unwrap_or((t, ""));
    let head = if first == "no" {
        theme::sev_color(Severity::High, dark)
    } else if indent == 0 {
        p.accent
    } else {
        p.violet
    };
    job.append(first, 0.0, fmt(head, true));
    let number = if dark { Color32::from_rgb(250, 165, 120) } else { Color32::from_rgb(190, 90, 40) };
    let ip = if dark { Color32::from_rgb(240, 205, 110) } else { Color32::from_rgb(160, 110, 0) };
    for word in rest.split(' ') {
        let c = if net::parse_ip(word).is_some() {
            ip
        } else if !word.is_empty() && word.chars().all(|c| c.is_ascii_digit() || c == ',' || c == '-') {
            number
        } else if word.contains("Ethernet") || word.starts_with("Vlan") {
            p.good
        } else {
            p.text
        };
        job.append(" ", 0.0, fmt(p.text, true));
        job.append(word, 0.0, fmt(c, true));
    }
}
