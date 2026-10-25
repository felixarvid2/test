//! Fliken VLAN.

#![allow(unused_imports)]

use super::*;

pub(crate) fn vlans(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let devices = &app.fleet.devices;
    let mut all: BTreeSet<u16> = BTreeSet::new();
    for d in devices {
        all.extend(d.config.vlans.keys());
        all.extend(d.config.interfaces.iter().filter_map(|i| i.access_vlan.or(i.dot1q)));
    }
    let name_of = |v: u16| devices.iter().find_map(|d| d.config.vlans.get(&v).filter(|n| !n.is_empty()).cloned()).unwrap_or_default();
    heading(ui, "VLAN", "Var varje VLAN finns: ■ accessportar  ⇅ trunkar  ◉ gateway  · native", &p);
    egui::ScrollArea::both().auto_shrink([false, false]).show(ui, |ui| {
        theme::card(dark).show(ui, |ui| {
            egui::Grid::new("vlan-matrix").striped(true).spacing([28.0, 10.0]).min_col_width(60.0).show(ui, |ui| {
                ui.label(RichText::new("VLAN").strong().color(p.muted));
                ui.label(RichText::new("Namn").strong().color(p.muted));
                for d in devices {
                    ui.label(RichText::new(&d.name).strong().color(p.muted));
                }
                ui.end_row();
                for &v in &all {
                    theme::chip(ui, &v.to_string(), theme::vlan_color(v, dark));
                    ui.label(RichText::new(name_of(v)).strong());
                    for d in devices {
                        let c = &d.config;
                        let access = c.interfaces.iter().filter(|i| i.mode == IfMode::Access && i.access_vlan == Some(v)).count();
                        let trunk = c.interfaces.iter().filter(|i| i.mode == IfMode::Trunk && i.allowed.as_ref().is_none_or(|a| a.contains(&v))).count();
                        let native = c.interfaces.iter().any(|i| (i.mode == IfMode::Trunk && i.native_vlan == Some(v)) || (i.dot1q == Some(v) && i.dot1q_native));
                        let gw = c.interfaces.iter().find(|i| (i.dot1q == Some(v) && !i.dot1q_native) || i.svi_vlan() == Some(v)).and_then(|i| i.ip);
                        let defined = c.vlans.contains_key(&v);
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 6.0;
                            let mut any = false;
                            if access > 0 {
                                ui.label(RichText::new(format!("■ {access}")).color(p.good)).on_hover_text(format!("{access} accessportar"));
                                any = true;
                            }
                            if trunk > 0 {
                                ui.label(RichText::new(format!("⇅ {trunk}")).color(p.violet)).on_hover_text(format!("tillåts på {trunk} trunkar"));
                                any = true;
                            }
                            if native {
                                ui.label(RichText::new("native").color(theme::sev_color(Severity::Medium, dark)));
                                any = true;
                            }
                            if let Some((ip, _)) = gw {
                                ui.label(RichText::new(format!("◉ {ip}")).color(p.accent));
                                any = true;
                            }
                            if !any {
                                ui.label(RichText::new(if defined { "· definierat" } else { "–" }).color(p.muted));
                            } else if !defined && c.kind == Kind::Switch {
                                ui.label(RichText::new("✖ saknas").color(theme::sev_color(Severity::High, dark)));
                            }
                        });
                    }
                    ui.end_row();
                }
            });
        });
    });
}
