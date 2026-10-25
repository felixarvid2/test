//! Fliken VLAN: matris över var varje VLAN används, med detaljer för det valda VLAN:et.

#![allow(unused_imports)]

use super::*;
use std::hash::{Hash, Hasher};
use std::net::Ipv4Addr;
use vlantool::audit::FleetReport;

#[derive(Default)]
pub(crate) struct VlansState {
    selected: Option<u16>,
    /// Matrisen och nyckeln den räknades för, se `fleet_key`.
    cache: Option<(u64, Matrix)>,
}

#[derive(Default, Clone)]
struct Cell {
    access: usize,
    trunk: usize,
    native: bool,
    gateway: Option<Ipv4Addr>,
    defined: bool,
    switch: bool,
}

struct Row {
    vlan: u16,
    name: String,
    cells: Vec<Cell>,
}

#[derive(Default)]
struct Matrix {
    devices: Vec<String>,
    rows: Vec<Row>,
}

/// Nyckel för grafen och matrisen: ändras bara när granskningen gett något nytt. Den räknas på
/// antal enheter, betyg, antal länkar och det som matrisen/grafen ritas av (interface, beskrivningar,
/// läge, VLAN), så att också en ändrad beskrivning eller port ger en ny nyckel utan att något ritas om i onödan.
pub(crate) fn fleet_key(fleet: &FleetReport) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    fleet.devices.len().hash(&mut h);
    fleet.links.len().hash(&mut h);
    fleet.score.hash(&mut h);
    for d in &fleet.devices {
        d.name.hash(&mut h);
        d.score.hash(&mut h);
        d.config.vlans.hash(&mut h);
        d.config.interfaces.len().hash(&mut h);
        for i in &d.config.interfaces {
            (&i.name, &i.description, i.mode as u8, i.access_vlan, i.native_vlan, &i.allowed, i.dot1q, i.dot1q_native, i.shutdown, i.ip).hash(&mut h);
        }
    }
    h.finish()
}

fn build_matrix(fleet: &FleetReport) -> Matrix {
    let devices = &fleet.devices;
    let mut all: BTreeSet<u16> = BTreeSet::new();
    for d in devices {
        all.extend(d.config.vlans.keys());
        all.extend(d.config.interfaces.iter().filter_map(|i| i.access_vlan.or(i.dot1q)));
    }
    let name_of = |v: u16| devices.iter().find_map(|d| d.config.vlans.get(&v).filter(|n| !n.is_empty()).cloned()).unwrap_or_default();
    let rows = all
        .into_iter()
        .map(|v| {
            let cells = devices
                .iter()
                .map(|d| {
                    let c = &d.config;
                    Cell {
                        access: c.interfaces.iter().filter(|i| i.mode == IfMode::Access && i.access_vlan == Some(v)).count(),
                        trunk: c.interfaces.iter().filter(|i| i.mode == IfMode::Trunk && i.allowed.as_ref().is_none_or(|a| a.contains(&v))).count(),
                        native: c.interfaces.iter().any(|i| (i.mode == IfMode::Trunk && i.native_vlan == Some(v)) || (i.dot1q == Some(v) && i.dot1q_native)),
                        gateway: c.interfaces.iter().find(|i| (i.dot1q == Some(v) && !i.dot1q_native) || i.svi_vlan() == Some(v)).and_then(|i| i.ip).map(|(ip, _)| ip),
                        defined: c.vlans.contains_key(&v),
                        switch: c.kind == Kind::Switch,
                    }
                })
                .collect();
            Row { vlan: v, name: name_of(v), cells }
        })
        .collect();
    Matrix { devices: devices.iter().map(|d| d.name.clone()).collect(), rows }
}

pub(crate) fn vlans(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let key = fleet_key(&app.fleet);
    if app.sb.vlans.cache.as_ref().is_none_or(|(k, _)| *k != key) {
        app.sb.vlans.cache = Some((key, build_matrix(&app.fleet)));
    }
    let Some((_, matrix)) = app.sb.vlans.cache.take() else { return };
    let mut selected = app.sb.vlans.selected;
    if selected.is_some_and(|v| !matrix.rows.iter().any(|r| r.vlan == v)) {
        selected = None;
    }
    if let Some(v) = selected {
        egui::Panel::right("vlan-detail")
            .resizable(true)
            .default_size(360.0)
            .size_range(280.0..=560.0)
            .frame(egui::Frame::new().inner_margin(Margin { left: 16, right: 0, top: 0, bottom: 0 }))
            .show(ui, |ui| {
                if detail(app, ui, v, &matrix) {
                    selected = None;
                }
            });
    }
    heading(ui, "VLAN", "Var varje VLAN finns: ■ accessportar  ⇅ trunkar  ◉ gateway  · native. Klicka på ett VLAN för detaljer.", &p);
    egui::ScrollArea::both().auto_shrink([false, false]).show(ui, |ui| {
        theme::card(dark).show(ui, |ui| {
            egui::Grid::new("vlan-matrix").striped(true).spacing([28.0, 10.0]).min_col_width(60.0).show(ui, |ui| {
                ui.label(RichText::new("VLAN").strong().color(p.muted));
                ui.label(RichText::new("Namn").strong().color(p.muted));
                for d in &matrix.devices {
                    ui.label(RichText::new(d).strong().color(p.muted));
                }
                ui.end_row();
                for r in &matrix.rows {
                    let v = r.vlan;
                    let is_sel = selected == Some(v);
                    let color = theme::vlan_color(v, dark);
                    let btn = egui::Button::new(RichText::new(v.to_string()).size(11.5).strong().color(color))
                        .fill(theme::alpha(color, if is_sel { 0.38 } else { 0.16 }))
                        .stroke(if is_sel { Stroke::new(1.5, color) } else { Stroke::NONE })
                        .corner_radius(CornerRadius::same(255));
                    if ui.add(btn).on_hover_text("Visa detaljer").clicked() {
                        selected = if is_sel { None } else { Some(v) };
                    }
                    ui.label(RichText::new(&r.name).strong());
                    for c in &r.cells {
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 6.0;
                            let mut any = false;
                            if c.access > 0 {
                                ui.label(RichText::new(format!("■ {}", c.access)).color(p.good)).on_hover_text(format!("{} accessportar", c.access));
                                any = true;
                            }
                            if c.trunk > 0 {
                                ui.label(RichText::new(format!("⇅ {}", c.trunk)).color(p.violet)).on_hover_text(format!("tillåts på {} trunkar", c.trunk));
                                any = true;
                            }
                            if c.native {
                                ui.label(RichText::new("native").color(theme::sev_color(Severity::Medium, dark)));
                                any = true;
                            }
                            if let Some(ip) = c.gateway {
                                ui.label(RichText::new(format!("◉ {ip}")).color(p.accent));
                                any = true;
                            }
                            if !any {
                                ui.label(RichText::new(if c.defined { "· definierat" } else { "–" }).color(p.muted));
                            } else if !c.defined && c.switch {
                                ui.label(RichText::new("✖ saknas").color(theme::sev_color(Severity::High, dark)));
                            }
                        });
                    }
                    ui.end_row();
                }
            });
        });
    });
    app.sb.vlans.selected = selected;
    app.sb.vlans.cache = Some((key, matrix));
}

/// Panelen med detaljer. Returnerar true när den ska stängas.
fn detail(app: &App, ui: &mut Ui, v: u16, matrix: &Matrix) -> bool {
    let dark = app.dark();
    let p = palette(dark);
    let mut close = false;
    let color = theme::vlan_color(v, dark);
    let name = matrix.rows.iter().find(|r| r.vlan == v).map(|r| r.name.clone()).unwrap_or_default();
    ui.horizontal(|ui| {
        theme::chip(ui, &format!("VLAN {v}"), color);
        ui.label(RichText::new(&name).size(18.0).strong());
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.add(egui::Button::new("✖").frame(false)).on_hover_text("Stäng").clicked() {
                close = true;
            }
        });
    });
    ui.add_space(8.0);
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        // Nät: gateway-adresser på routern (subinterface) eller switchens SVI.
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Nät", dark);
            let mut any = false;
            for d in &app.fleet.devices {
                for i in d.config.interfaces.iter().filter(|i| (i.dot1q == Some(v) && !i.dot1q_native) || i.svi_vlan() == Some(v)) {
                    if let Some((ip, mask)) = i.ip {
                        let net = i.subnet().map_or(String::new(), |s| format!("  ({s})"));
                        ui.label(RichText::new(format!("{} {}: {ip}/{}{net}", d.name, short_port(&i.name), net::mask_to_prefix(mask).unwrap_or(0))).monospace());
                        any = true;
                    }
                }
            }
            if !any {
                ui.label(RichText::new("Ingen gateway-adress hittades i konfigarna.").color(p.muted));
            }
        });
        ui.add_space(10.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "DHCP-pool", dark);
            let pools: Vec<_> = app.inventory.iter().flat_map(|inv| inv.dhcp.iter().filter(|d| d.vlan == v)).collect();
            if pools.is_empty() {
                ui.label(RichText::new("Ingen pool i dhcp.csv.").color(p.muted));
            }
            for d in pools {
                let free = net::range_len(d.pool_start, d.pool_end).saturating_sub(net::range_len(d.excluded_start, d.excluded_end));
                ui.label(RichText::new(&d.name).strong());
                egui::Grid::new(("vlan-pool", v)).num_columns(2).spacing([14.0, 3.0]).show(ui, |ui| {
                    for (k, val) in [
                        ("Nät", d.network.to_string()),
                        ("Pool", format!("{} – {}", d.pool_start, d.pool_end)),
                        ("Undantas", format!("{} – {}", d.excluded_start, d.excluded_end)),
                        ("Gateway", d.gateway.to_string()),
                        ("DNS", d.dns.to_string()),
                        ("Utdelas", format!("{free} adresser")),
                    ] {
                        ui.label(RichText::new(k).color(p.muted));
                        ui.label(RichText::new(val).monospace());
                        ui.end_row();
                    }
                });
            }
        });
        ui.add_space(10.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Portar", dark);
            let mut any = false;
            for d in &app.fleet.devices {
                let access: Vec<_> = d.config.interfaces.iter().filter(|i| i.mode == IfMode::Access && i.access_vlan == Some(v)).collect();
                let trunks: Vec<_> = d.config.interfaces.iter().filter(|i| i.mode == IfMode::Trunk && i.allowed.as_ref().is_none_or(|a| a.contains(&v))).collect();
                if access.is_empty() && trunks.is_empty() {
                    continue;
                }
                any = true;
                ui.label(RichText::new(&d.name).strong().color(p.accent));
                for i in access {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(format!("■ {}", short_port(&i.name))).monospace().color(p.good));
                        ui.label(RichText::new(&i.description).color(p.muted));
                        if i.shutdown {
                            ui.label(RichText::new("nere").color(theme::sev_color(Severity::Critical, dark)));
                        }
                    });
                }
                for i in trunks {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(format!("⇅ {}", short_port(&i.name))).monospace().color(p.violet));
                        let native = if i.native_vlan == Some(v) { "  native" } else { "" };
                        ui.label(RichText::new(format!("{}{native}", i.description)).color(p.muted));
                    });
                }
                ui.add_space(4.0);
            }
            if !any {
                ui.label(RichText::new("Inga portar använder VLAN:et.").color(p.muted));
            }
        });
    });
    close
}

#[cfg(test)]
mod tests {
    use super::*;
    use vlantool::parser::Config;

    fn fleet(desc: &str) -> FleetReport {
        let cfg = format!("hostname SW\nvlan 10\n name KONTOR\ninterface FastEthernet0/1\n description {desc}\n switchport mode access\n switchport access vlan 10\n");
        vlantool::audit::audit_fleet(vec![Config::parse("SW", "SW.cfg", &cfg)], &[])
    }

    #[test]
    fn key_is_stable_and_follows_content() {
        assert_eq!(fleet_key(&fleet("Port mot A")), fleet_key(&fleet("Port mot A")));
        assert_ne!(fleet_key(&fleet("Port mot A")), fleet_key(&fleet("Port mot B")));
    }

    #[test]
    fn matrix_counts_access_ports() {
        let m = build_matrix(&fleet("Dator"));
        let r = m.rows.iter().find(|r| r.vlan == 10).unwrap();
        assert_eq!(r.name, "KONTOR");
        assert_eq!(r.cells[0].access, 1);
        assert!(r.cells[0].defined);
    }
}
