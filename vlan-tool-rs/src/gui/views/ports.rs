//! Fliken Portar.

#![allow(unused_imports)]

use super::*;

pub(crate) fn ports(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    heading(ui, &format!("Portar – {}", d.name), &format!("{} interface", d.config.interfaces.len()), &p);
    theme::card(dark).inner_margin(Margin::same(8)).show(ui, |ui| {
        ui.set_width(ui.available_width());
        TableBuilder::new(ui)
            .striped(true)
            .cell_layout(Layout::left_to_right(Align::Center))
            .column(Column::exact(90.0))
            .column(Column::exact(80.0))
            .column(Column::exact(200.0))
            .column(Column::remainder().at_least(160.0))
            .column(Column::exact(80.0))
            .column(Column::exact(140.0))
            .header(26.0, |mut h| {
                for t in ["Port", "Läge", "VLAN / adress", "Beskrivning", "Status", "Skydd"] {
                    h.col(|ui| {
                        ui.label(RichText::new(t).size(12.0).strong().color(p.muted));
                    });
                }
            })
            .body(|mut body| {
                for i in &d.config.interfaces {
                    body.row(28.0, |mut row| {
                        row.col(|ui| {
                            ui.label(RichText::new(short_port(&i.name)).monospace().strong());
                        });
                        row.col(|ui| {
                            let (t, c) = match i.mode {
                                IfMode::Access => ("access", p.good),
                                IfMode::Trunk => ("trunk", p.violet),
                                IfMode::Routed => ("routad", p.accent),
                                IfMode::Other => ("–", p.muted),
                            };
                            theme::chip(ui, t, c);
                        });
                        row.col(|ui| match i.mode {
                            IfMode::Access => {
                                let v = i.access_vlan.unwrap_or(1);
                                theme::chip(ui, &format!("VLAN {v}"), theme::vlan_color(v, dark));
                            }
                            IfMode::Trunk => {
                                ui.label(RichText::new(format!("{}  (native {})", i.allowed.as_ref().map_or("alla".into(), |v| join_vlans(v)), i.native_vlan.unwrap_or(1))).monospace());
                            }
                            _ => {
                                let t = i
                                    .dot1q
                                    .map(|v| format!("dot1Q {v}{}", if i.dot1q_native { " native" } else { "" }))
                                    .into_iter()
                                    .chain(i.ip.map(|(a, m)| format!("{a}/{}", net::mask_to_prefix(m).unwrap_or(0))))
                                    .collect::<Vec<_>>()
                                    .join("  ");
                                ui.label(RichText::new(t).monospace());
                            }
                        });
                        row.col(|ui| {
                            ui.label(RichText::new(&i.description).color(p.muted));
                        });
                        row.col(|ui| {
                            if i.shutdown {
                                ui.label(RichText::new("● nere").color(theme::sev_color(Severity::Critical, dark)));
                            } else {
                                ui.label(RichText::new("● uppe").color(p.good));
                            }
                        });
                        row.col(|ui| match (i.mode, i.portfast && i.bpduguard) {
                            (IfMode::Access, true) => {
                                ui.label(RichText::new("✔ portfast + bpdu").color(p.good));
                            }
                            (IfMode::Access, false) => {
                                ui.label(RichText::new("✖ saknas").color(theme::sev_color(Severity::Low, dark)));
                            }
                            _ => {}
                        });
                    });
                }
            });
    });
}
