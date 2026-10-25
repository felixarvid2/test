//! Innehållet i varje flik. En fil per flik; gemensamma hjälpfunktioner ligger här.

use crate::app::{open_path, App, Tab};
use state_a::DevSort;
use vlantool::audit::{DeviceReport, FleetReport};
use crate::theme::{self, palette, Palette};
use eframe::egui::{
    self, text::LayoutJob, Align, Align2, Color32, CornerRadius, FontId, Layout, Margin, Pos2, Rect, RichText, Sense, Stroke, TextFormat, Ui,
    Vec2,
};
use egui_extras::{Column, TableBuilder};
use std::collections::BTreeSet;
use vlantool::finding::{Finding, Severity};
use vlantool::inventory::{join_vlans, short_port};
use vlantool::net::{self, Subnet};
use vlantool::parser::{IfMode, Kind};
use vlantool::{rules, topology};

mod overview;
mod findings;
#[path = "rules.rs"]
mod rules_tab;
mod ports;
mod vlans;
mod topo;
mod config;
mod drift;
mod csv;
mod csv_edit;
pub mod export;
mod subnet;
mod settings;
pub(crate) use overview::summary_markdown;
pub mod state_a;
pub mod state_b;

pub fn show(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    if app.fleet.devices.is_empty() && !matches!(app.tab, Tab::Csv | Tab::Subnet | Tab::Settings | Tab::Drift) {
        empty_state(app, ui);
        return;
    }
    if app.tab.per_device() && !(app.tab == Tab::Findings && app.sa.all_devices) {
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
        Tab::Rules => rules_tab::rules(app, ui),
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
        // Ett stort tryck för att fortsätta där du slutade (176).
        let latest = app.prefs.recent.iter().find(|d| d.is_dir()).cloned();
        if let Some(dir) = &latest {
            let name = dir.file_name().map_or_else(|| dir.display().to_string(), |n| n.to_string_lossy().to_string());
            let big = egui::Button::new(RichText::new(format!("▶  Öppna senaste: {name}")).size(20.0).strong().color(p.on_accent))
                .fill(p.accent)
                .stroke(Stroke::NONE)
                .corner_radius(CornerRadius::same(12))
                .min_size(Vec2::new(560.0, 60.0));
            if ui.add(big).on_hover_text(dir.display().to_string()).clicked() {
                app.open_project(dir);
            }
            ui.label(RichText::new(dir.display().to_string()).size(12.0).color(p.muted));
            ui.add_space(16.0);
        }
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
                    let create = if latest.is_some() {
                        ui.button("⚡ Skapa exempelprojekt").clicked()
                    } else {
                        theme::primary_button(ui, "⚡ Skapa exempelprojekt", dark).clicked()
                    };
                    if create {
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

/// Enheternas ordning i listan: filtrerad på namn och sorterad på namn eller betyg (sämst först).
pub(crate) fn device_order(fleet: &FleetReport, filter: &str, sort: DevSort) -> Vec<usize> {
    let needle = filter.trim().to_lowercase();
    let mut order: Vec<usize> = (0..fleet.devices.len()).filter(|&i| needle.is_empty() || fleet.devices[i].name.to_lowercase().contains(&needle)).collect();
    let by_name = |d: &DeviceReport| d.name.to_lowercase();
    match sort {
        DevSort::Name => order.sort_by_key(|&i| by_name(&fleet.devices[i])),
        DevSort::Grade => order.sort_by_key(|&i| (fleet.devices[i].score, by_name(&fleet.devices[i]))),
    }
    order
}

pub(crate) fn device_list(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    ui.label(RichText::new("ENHETER").size(11.0).color(p.muted));
    ui.add_space(4.0);
    ui.add(egui::TextEdit::singleline(&mut app.sa.dev_filter).hint_text("Filtrera enheter …").desired_width(f32::INFINITY));
    ui.horizontal(|ui| {
        ui.label(RichText::new("Sortera").size(12.0).color(p.muted));
        ui.selectable_value(&mut app.sa.dev_sort, DevSort::Name, "Namn");
        ui.selectable_value(&mut app.sa.dev_sort, DevSort::Grade, "Betyg");
    });
    ui.add_space(4.0);
    let order = app.device_order();
    let mut clicked = None;
    egui::ScrollArea::vertical().id_salt("devlist").show(ui, |ui| {
        if order.is_empty() {
            ui.label(RichText::new("Ingen enhet matchar.").color(p.muted));
        }
        for &i in &order {
            let d = &app.fleet.devices[i];
            let selected = i == app.device;
            // Kanten visar det allvarligaste fyndet; grön om enheten är ren (180).
            let edge = d.worst().map_or(p.good, |s| theme::sev_color(s, dark));
            let frame = egui::Frame::new()
                .fill(if selected { theme::alpha(p.accent, 0.14) } else { p.card })
                .stroke(Stroke::new(if selected { 2.0 } else { 1.5 }, if selected { edge } else { theme::alpha(edge, 0.65) }))
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
    fmt_sized(color, mono, if mono { 13.0 } else { 14.0 })
}

pub(crate) fn fmt_sized(color: Color32, mono: bool, size: f32) -> TextFormat {
    TextFormat { font_id: if mono { FontId::monospace(size) } else { FontId::proportional(size) }, color, ..Default::default() }
}

/// Syntaxfärgning för en IOS-rad.
pub(crate) fn highlight_into(job: &mut LayoutJob, text: &str, p: &Palette, dark: bool) {
    highlight_sized(job, text, p, dark, 13.0);
}

/// Som `highlight_into` men med egen teckenstorlek (konfigvyn kan zoomas).
pub(crate) fn highlight_sized(job: &mut LayoutJob, text: &str, p: &Palette, dark: bool, size: f32) {
    let fmt = |color: Color32, mono: bool| fmt_sized(color, mono, size);
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

#[cfg(test)]
mod tests {
    use super::*;
    use vlantool::audit::audit_fleet;
    use vlantool::parser::Config;

    fn fleet() -> FleetReport {
        let cfg = |name: &str, extra: &str| Config::parse(name, &format!("{name}.cfg"), &format!("hostname {name}\n{extra}"));
        audit_fleet(vec![cfg("SW-B", "line vty 0 4\n transport input telnet\n"), cfg("SW-A", ""), cfg("R-C", "")], &[])
    }

    #[test]
    fn device_order_sorts_and_filters() {
        let f = fleet();
        let by_name: Vec<&str> = device_order(&f, "", DevSort::Name).iter().map(|&i| f.devices[i].name.as_str()).collect();
        assert_eq!(by_name, vec!["R-C", "SW-A", "SW-B"]);
        let worst_first = device_order(&f, "", DevSort::Grade);
        assert_eq!(f.devices[worst_first[0]].name, "SW-B", "telnet drar ner betyget: sämst först");
        let only_sw: Vec<&str> = device_order(&f, " sw", DevSort::Name).iter().map(|&i| f.devices[i].name.as_str()).collect();
        assert_eq!(only_sw, vec!["SW-A", "SW-B"]);
        assert!(device_order(&f, "zzz", DevSort::Name).is_empty());
    }
}
