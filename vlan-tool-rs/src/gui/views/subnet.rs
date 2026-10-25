//! Fliken Subnät.

#![allow(unused_imports)]

use super::*;

pub(crate) fn subnet(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    heading(ui, "Subnätskalkylator", "Räkna på ett nät, dela det i lika delar eller gör en VLSM-plan", &p);
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.label("Nät");
                ui.add(egui::TextEdit::singleline(&mut app.subnet_input).desired_width(220.0).font(egui::TextStyle::Monospace));
                ui.label(RichText::new("t.ex. 192.168.1.0/24 eller 10.0.0.0 255.255.0.0").size(12.0).color(p.muted));
            });
            ui.add_space(8.0);
            let Some(n) = Subnet::parse(&app.subnet_input) else {
                ui.label(RichText::new("Ogiltigt nät").color(theme::sev_color(Severity::High, dark)));
                return;
            };
            let w = ((ui.available_width() - 3.0 * 10.0) / 4.0).max(120.0);
            ui.horizontal(|ui| {
                theme::stat_tile(ui, &n.to_string(), "NÄT", p.accent, dark, w);
                theme::stat_tile(ui, &n.mask().to_string(), "MASK", p.violet, dark, w);
                theme::stat_tile(ui, &n.usable_hosts().to_string(), "ANVÄNDBARA ADRESSER", p.good, dark, w);
                theme::stat_tile(ui, &n.broadcast().to_string(), "BROADCAST", theme::sev_color(Severity::Medium, dark), dark, w);
            });
            ui.add_space(6.0);
            ui.label(RichText::new(format!("Värdar {} – {}   ·   wildcard {}", n.first_host(), n.last_host(), n.wildcard())).monospace().color(p.muted));
        });
        let Some(n) = Subnet::parse(&app.subnet_input) else { return };
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Dela i lika stora delar", dark);
            let lo = n.prefix.min(30);
            app.split_prefix = app.split_prefix.clamp(lo, 30);
            ui.add(egui::Slider::new(&mut app.split_prefix, lo..=30).prefix("/").text("prefix"));
            let parts = n.split(app.split_prefix);
            ui.label(RichText::new(format!("{} delnät med {} användbara adresser var", parts.len(), parts.first().map_or(0, |s| s.usable_hosts()))).color(p.muted));
            egui::Grid::new("split").striped(true).spacing([18.0, 4.0]).show(ui, |ui| {
                for (i, s) in parts.iter().enumerate().take(32) {
                    ui.label(RichText::new(format!("{}", i + 1)).color(p.muted));
                    ui.label(RichText::new(s.to_string()).monospace().color(p.accent));
                    ui.label(RichText::new(format!("{} – {}", s.first_host(), s.last_host())).monospace());
                    ui.label(RichText::new(format!("bc {}", s.broadcast())).monospace().color(p.muted));
                    ui.end_row();
                }
            });
            if parts.len() > 32 {
                ui.label(RichText::new(format!("… och {} till", parts.len() - 32)).color(p.muted));
            }
        });
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "VLSM-plan", dark);
            ui.horizontal(|ui| {
                ui.label("Behov");
                ui.add(egui::TextEdit::singleline(&mut app.plan_input).desired_width(f32::INFINITY).hint_text("NAMN:värdar, NAMN:värdar"));
            });
            ui.add_space(6.0);
            match net::parse_plan(&app.plan_input) {
                Err(e) => {
                    ui.label(RichText::new(e).color(theme::sev_color(Severity::High, dark)));
                }
                Ok(wants) => {
                    let rows = net::vlsm(n, &wants);
                    let used: u64 = rows.iter().filter_map(|r| r.subnet).map(|s| s.size()).sum();
                    egui::Grid::new("vlsm").striped(true).spacing([18.0, 6.0]).show(ui, |ui| {
                        for h in ["Namn", "Behov", "Nät", "Mask", "Värdar", "Ledigt"] {
                            ui.label(RichText::new(h).strong().color(p.muted));
                        }
                        ui.end_row();
                        for (i, r) in rows.iter().enumerate() {
                            ui.label(RichText::new(&r.name).strong().color(theme::vlan_color(i as u16 * 10 + 10, dark)));
                            ui.label(r.hosts.to_string());
                            match r.subnet {
                                Some(s) => {
                                    ui.label(RichText::new(s.to_string()).monospace().color(p.accent));
                                    ui.label(RichText::new(s.mask().to_string()).monospace());
                                    ui.label(RichText::new(format!("{} – {}", s.first_host(), s.last_host())).monospace());
                                    ui.label(RichText::new((s.usable_hosts() - r.hosts).to_string()).color(p.muted));
                                }
                                None => {
                                    ui.label(RichText::new("får inte plats").color(theme::sev_color(Severity::Critical, dark)));
                                }
                            }
                            ui.end_row();
                        }
                    });
                    ui.add_space(8.0);
                    // Stapel som visar hur nätet fylls.
                    let (rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 22.0), Sense::hover());
                    ui.painter().rect_filled(rect, CornerRadius::same(6), p.raised);
                    let base = u32::from(n.network) as f32;
                    for (i, r) in rows.iter().enumerate() {
                        if let Some(s) = r.subnet {
                            let x0 = rect.left() + rect.width() * (u32::from(s.network) as f32 - base) / n.size() as f32;
                            let w = rect.width() * s.size() as f32 / n.size() as f32;
                            let seg = Rect::from_min_size(Pos2::new(x0, rect.top()), Vec2::new(w, rect.height())).shrink2(Vec2::new(1.0, 0.0));
                            ui.painter().rect_filled(seg, CornerRadius::same(5), theme::alpha(theme::vlan_color(i as u16 * 10 + 10, dark), 0.75));
                            if w > 50.0 {
                                ui.painter().text(seg.center(), Align2::CENTER_CENTER, &r.name, FontId::proportional(11.5), Color32::WHITE);
                            }
                        }
                    }
                    ui.label(RichText::new(format!("{used} av {} adresser används ({:.0} %)", n.size(), used as f32 * 100.0 / n.size() as f32)).color(p.muted));
                }
            }
        });
    });
}
