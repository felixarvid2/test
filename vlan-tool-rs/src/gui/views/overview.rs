//! Fliken Översikt.

#![allow(unused_imports)]

use super::*;

pub(crate) fn overview(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let mut go: Option<(usize, Tab)> = None;
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        let fleet = &app.fleet;
        ui.horizontal(|ui| {
            theme::score_ring(ui, fleet.score, 92.0, dark);
            ui.add_space(8.0);
            ui.vertical(|ui| {
                ui.add_space(8.0);
                ui.label(RichText::new("Översikt").size(26.0).strong());
                let links = fleet.links.iter().filter(|l| l.b_port.is_some()).count();
                let ok: usize = fleet.devices.iter().map(|d| d.passed()).sum();
                let total: usize = fleet.devices.iter().map(|d| d.results.len()).sum();
                ui.label(RichText::new(format!("{} enheter · {links} länkar · {ok}/{total} regler godkända · betyg {}", fleet.devices.len(), fleet.grade)).color(p.muted));
            });
        });
        ui.add_space(16.0);

        let w = ((ui.available_width() - 4.0 * 10.0) / 5.0).max(110.0);
        ui.horizontal(|ui| {
            for s in Severity::ALL {
                theme::stat_tile(ui, &fleet.count(s).to_string(), s.label(), theme::sev_color(s, dark), dark, w);
            }
        });
        ui.add_space(18.0);

        theme::section_title(ui, "Enheter", dark);
        let card_w = 300.0;
        let cols = ((ui.available_width() + 12.0) / (card_w + 12.0)).floor().max(1.0) as usize;
        for row in fleet.devices.chunks(cols).enumerate() {
            ui.horizontal_top(|ui| {
                for (j, d) in row.1.iter().enumerate() {
                    let idx = row.0 * cols + j;
                    let resp = theme::card(dark)
                        .show(ui, |ui| {
                            ui.set_width(card_w - 34.0);
                            ui.set_min_height(92.0);
                            ui.horizontal(|ui| {
                                theme::score_ring(ui, d.score, 58.0, dark);
                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&d.name).size(16.0).strong());
                                    ui.label(RichText::new(format!("{} · {}/{} regler", d.kind, d.passed(), d.results.len())).size(12.5).color(p.muted));
                                    ui.horizontal(|ui| {
                                        ui.spacing_mut().item_spacing.x = 4.0;
                                        for s in Severity::ALL {
                                            let n = d.count(s);
                                            if n > 0 {
                                                theme::chip(ui, &format!("{} {n}", s.icon()), theme::sev_color(s, dark));
                                            }
                                        }
                                        if d.findings().next().is_none() {
                                            theme::chip(ui, "✔ inga fynd", p.good);
                                        }
                                    });
                                });
                            });
                        })
                        .response
                        .interact(Sense::click())
                        .on_hover_text("Visa fynden");
                    if resp.clicked() {
                        go = Some((idx, Tab::Findings));
                    }
                }
            });
            ui.add_space(10.0);
        }
        ui.add_space(8.0);

        theme::section_title(ui, "Mellan enheterna", dark);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            let links: Vec<_> = fleet.links.iter().filter(|l| l.b_port.is_some()).collect();
            if links.is_empty() {
                ui.label(RichText::new("Inga länkar hittades (portbeskrivningar som 'Port mot X' saknas).").color(p.muted));
            }
            for l in links {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("⇄").color(p.accent));
                    ui.label(RichText::new(&l.a).strong());
                    ui.label(RichText::new(&l.a_port).monospace().color(p.violet));
                    ui.label(RichText::new("──").color(p.line));
                    ui.label(RichText::new(&l.b).strong());
                    ui.label(RichText::new(l.b_port.as_deref().unwrap_or("")).monospace().color(p.violet));
                    ui.label(RichText::new(&l.vlans).color(p.muted));
                });
            }
            ui.add_space(6.0);
            if fleet.cross.is_empty() {
                ui.label(RichText::new("✔ Alla länkar och adresser stämmer överens").color(p.good));
            }
            for f in &fleet.cross {
                ui.horizontal_wrapped(|ui| {
                    theme::sev_chip(ui, f.severity, dark);
                    ui.label(&f.message);
                });
            }
        });
    });
    if let Some((d, tab)) = go {
        app.select_device(d);
        app.tab = tab;
    }
}
