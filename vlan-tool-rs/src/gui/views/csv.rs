//! Fliken CSV-data.

#![allow(unused_imports)]

use super::*;

pub(crate) fn csv(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let samples = app.project.as_ref().map(|p| p.samples());
    ui.horizontal(|ui| {
        ui.label(RichText::new("CSV-data").size(24.0).strong());
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if let Some(dir) = &samples
                && ui.button("Öppna samples/").clicked() {
                    open_path(dir);
                }
        });
    });
    let Some(inv) = &app.inventory else {
        ui.label(RichText::new("Hittade inga CSV-filer i samples/.").color(p.muted));
        return;
    };
    ui.label(RichText::new(format!("{} portar · {} DHCP-pooler · {} enheter från {} filer", inv.ports.len(), inv.dhcp.len(), inv.devices.len(), inv.files.len())).color(p.muted));
    ui.add_space(10.0);
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Kontroll", dark);
            if app.csv_findings.is_empty() {
                ui.label(RichText::new("✔ CSV-filerna ser bra ut").color(p.good));
            }
            for f in &app.csv_findings {
                ui.horizontal_wrapped(|ui| {
                    theme::sev_chip(ui, f.severity, dark);
                    ui.label(&f.message);
                });
            }
        });
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Portar (ports.csv)", dark);
            egui::Grid::new("ports-csv").striped(true).spacing([18.0, 6.0]).show(ui, |ui| {
                for h in ["Switch", "Port", "Läge", "VLAN", "Tillåtna", "Native", "Beskrivning", "Status"] {
                    ui.label(RichText::new(h).strong().color(p.muted));
                }
                ui.end_row();
                for r in &inv.ports {
                    ui.label(&r.switch);
                    ui.label(RichText::new(short_port(&r.port)).monospace());
                    ui.label(if r.mode == PortMode::Access { "access" } else { "trunk" });
                    match r.vlan {
                        Some(v) if r.mode == PortMode::Access => {
                            theme::chip(ui, &format!("{v} {}", r.vlan_name), theme::vlan_color(v, dark));
                        }
                        _ => {
                            ui.label("–");
                        }
                    }
                    ui.label(RichText::new(join_vlans(&r.allowed)).monospace());
                    ui.label(r.native.map(|n| n.to_string()).unwrap_or_default());
                    ui.label(RichText::new(&r.description).color(p.muted));
                    ui.label(if r.up { RichText::new("Up").color(p.good) } else { RichText::new("Down").color(theme::sev_color(Severity::High, dark)) });
                    ui.end_row();
                }
            });
        });
        ui.add_space(12.0);
        ui.horizontal_top(|ui| {
            let w = (ui.available_width() - 12.0) / 2.0;
            ui.allocate_ui(Vec2::new(w, 0.0), |ui| {
                theme::card(dark).show(ui, |ui| {
                    ui.set_width(w - 34.0);
                    theme::section_title(ui, "DHCP (dhcp.csv)", dark);
                    egui::Grid::new("dhcp-csv").striped(true).spacing([14.0, 6.0]).show(ui, |ui| {
                        for h in ["VLAN", "Pool", "Nät", "Gateway", "Utdelas"] {
                            ui.label(RichText::new(h).strong().color(p.muted));
                        }
                        ui.end_row();
                        for d in &inv.dhcp {
                            theme::chip(ui, &d.vlan.to_string(), theme::vlan_color(d.vlan, dark));
                            ui.label(RichText::new(&d.name).strong());
                            ui.label(RichText::new(d.network.to_string()).monospace());
                            ui.label(RichText::new(d.gateway.to_string()).monospace());
                            let free = net::range_len(d.pool_start, d.pool_end).saturating_sub(net::range_len(d.excluded_start, d.excluded_end));
                            ui.label(format!("{free} adresser"));
                            ui.end_row();
                        }
                    });
                });
            });
            ui.allocate_ui(Vec2::new(w, 0.0), |ui| {
                theme::card(dark).show(ui, |ui| {
                    ui.set_width(w - 34.0);
                    theme::section_title(ui, "Hantering (devices.csv)", dark);
                    egui::Grid::new("dev-csv").striped(true).spacing([14.0, 6.0]).show(ui, |ui| {
                        for h in ["Enhet", "IP", "Mask", "Gateway"] {
                            ui.label(RichText::new(h).strong().color(p.muted));
                        }
                        ui.end_row();
                        for d in &inv.devices {
                            ui.label(RichText::new(&d.hostname).strong());
                            ui.label(RichText::new(d.mgmt_ip.to_string()).monospace());
                            ui.label(RichText::new(d.mgmt_mask.to_string()).monospace());
                            ui.label(RichText::new(d.gateway.to_string()).monospace());
                            ui.end_row();
                        }
                    });
                });
            });
        });
    });
}
