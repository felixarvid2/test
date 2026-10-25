//! Fliken Fynd.

#![allow(unused_imports)]

use super::*;

pub(crate) fn findings(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    let needle = app.search.to_lowercase();
    let mut list: Vec<&Finding> =
        d.findings().filter(|f| f.severity >= app.min_sev).filter(|f| needle.is_empty() || f.message.to_lowercase().contains(&needle) || f.rule.contains(&needle)).collect();
    list.sort_by_key(|f| std::cmp::Reverse(f.severity));
    let total = d.findings().count();

    ui.horizontal(|ui| {
        theme::score_ring(ui, d.score, 54.0, dark);
        ui.vertical(|ui| {
            ui.label(RichText::new(&d.name).size(22.0).strong());
            ui.label(RichText::new(format!("{} · {} · {total} fynd · {}/{} regler godkända", d.kind, file_name(&d.path), d.passed(), d.results.len())).color(p.muted));
        });
    });
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        ui.add(egui::TextEdit::singleline(&mut app.search).hint_text("Sök i fynden …").desired_width(240.0));
        ui.label(RichText::new("Visa från").color(p.muted));
        egui::ComboBox::from_id_salt("minsev").selected_text(app.min_sev.label()).show_ui(ui, |ui| {
            for s in Severity::ALL.iter().rev() {
                ui.selectable_value(&mut app.min_sev, *s, s.label());
            }
        });
    });
    ui.add_space(8.0);

    if list.is_empty() {
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(RichText::new(if total == 0 { "✔ Inga fynd – allt ser bra ut!" } else { "Inga fynd matchar filtret." }).size(16.0).color(p.good));
        });
        rule_overview(app, ui);
        return;
    }
    let selected = app.finding.min(list.len() - 1);
    let mut new_sel = None;
    let mut jump = None;

    let avail = ui.available_size();
    ui.horizontal_top(|ui| {
        let left_w = (avail.x * 0.48).max(320.0);
        ui.allocate_ui_with_layout(Vec2::new(left_w, avail.y), Layout::top_down(Align::Min), |ui| {
            egui::ScrollArea::vertical().id_salt("findings").auto_shrink([false, false]).show(ui, |ui| {
                for (i, f) in list.iter().enumerate() {
                    let sel = i == selected;
                    let c = theme::sev_color(f.severity, dark);
                    let resp = egui::Frame::new()
                        .fill(if sel { theme::alpha(c, 0.12) } else { p.card })
                        .stroke(Stroke::new(1.0, if sel { theme::alpha(c, 0.7) } else { p.line }))
                        .corner_radius(CornerRadius::same(10))
                        .inner_margin(Margin::symmetric(12, 8))
                        .show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            ui.horizontal(|ui| {
                                theme::sev_chip(ui, f.severity, dark);
                                ui.label(RichText::new(&f.rule).monospace().size(12.0).color(p.muted));
                                if let Some(l) = f.line {
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| ui.label(RichText::new(format!("rad {l}")).size(12.0).color(p.muted)));
                                }
                            });
                            ui.label(&f.message);
                        })
                        .response
                        .interact(Sense::click());
                    if resp.clicked() {
                        new_sel = Some(i);
                    }
                    ui.add_space(4.0);
                }
            });
        });
        ui.add_space(12.0);
        ui.allocate_ui_with_layout(Vec2::new(ui.available_width(), avail.y), Layout::top_down(Align::Min), |ui| {
            let f = list[selected];
            egui::ScrollArea::vertical().id_salt("detail").auto_shrink([false, false]).show(ui, |ui| {
                theme::card(dark).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    let rule = rules::find(&f.rule);
                    ui.label(RichText::new(rule.map_or(f.rule.as_str(), |r| r.title)).size(18.0).strong());
                    ui.horizontal(|ui| {
                        theme::sev_chip(ui, f.severity, dark);
                        ui.label(RichText::new(format!("regel {}{}", f.rule, rule.map(|r| format!(" · {}", r.category)).unwrap_or_default())).color(p.muted));
                    });
                    ui.add_space(8.0);
                    ui.label(RichText::new(&f.message).size(15.0));
                    if let Some(r) = rule {
                        ui.add_space(10.0);
                        ui.label(RichText::new("Varför?").strong().color(p.violet));
                        ui.label(RichText::new(r.why).color(p.muted));
                    }
                    if !f.fix.is_empty() {
                        ui.add_space(10.0);
                        ui.horizontal(|ui| {
                            ui.label(RichText::new("Rättning").strong().color(p.violet));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if ui.small_button("Kopiera").clicked() {
                                    ui.ctx().copy_text(format!("configure terminal\n{}\nend", f.fix.join("\n")));
                                    jump = Some(None);
                                }
                            });
                        });
                        code_block(ui, &f.fix.join("\n"), dark);
                    }
                    if let Some(no) = f.line {
                        ui.add_space(10.0);
                        ui.horizontal(|ui| {
                            ui.label(RichText::new(format!("I konfigen (rad {no})")).strong().color(p.violet));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if ui.small_button("Visa i konfig →").clicked() {
                                    jump = Some(Some(no));
                                }
                            });
                        });
                        egui::Frame::new().fill(p.code_bg).corner_radius(CornerRadius::same(8)).inner_margin(Margin::same(8)).show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            let from = no.saturating_sub(3).max(1);
                            for l in d.config.lines.iter().filter(|l| l.no >= from && l.no <= no + 3) {
                                let hit = l.no == no;
                                let mut job = LayoutJob::default();
                                job.append(&format!("{:>4}  ", l.no), 0.0, fmt(if hit { theme::sev_color(f.severity, dark) } else { p.muted }, true));
                                highlight_into(&mut job, &l.text, &p, dark);
                                let resp = ui.label(job);
                                if hit {
                                    ui.painter().rect_filled(resp.rect.expand2(Vec2::new(4.0, 0.0)), CornerRadius::same(4), theme::alpha(theme::sev_color(f.severity, dark), 0.12));
                                }
                            }
                        });
                    }
                });
            });
        });
    });
    if let Some(i) = new_sel {
        app.finding = i;
    }
    match jump {
        Some(Some(line)) => {
            app.jump_to_line = Some(line);
            app.tab = Tab::Config;
        }
        Some(None) => app.toast("✔ Kopierat till urklipp"),
        None => {}
    }
}

pub(crate) fn rule_overview(app: &App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    ui.add_space(12.0);
    theme::section_title(ui, "Regler", dark);
    ui.horizontal_wrapped(|ui| {
        for r in &d.results {
            let c = if r.findings.is_empty() { p.good } else { theme::sev_color(r.findings[0].severity, dark) };
            theme::chip(ui, &format!("{} {}", if r.findings.is_empty() { "✔" } else { "✖" }, r.title), c);
        }
    });
}
