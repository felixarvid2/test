//! Fliken Fynd.

#![allow(unused_imports)]

use super::*;

/// Ett fynd i listan och vilken enhet det hör till (`None` = kontroll mellan enheter).
pub(crate) struct Item<'a> {
    pub dev: Option<usize>,
    pub f: &'a Finding,
}

pub(crate) struct Filter<'a> {
    pub needle: &'a str,
    /// Vilka nivåer som visas, indexerat med `Severity as usize`.
    pub sev_on: &'a [bool; 5],
    pub group: bool,
}

/// Fynden som ska visas: en enhets (`scope = Some(index)`) eller hela nätets (`None`, med
/// kontrollerna mellan enheterna sist). Allvarligast först, eller grupperade per regel.
pub(crate) fn build_items<'a>(fleet: &'a FleetReport, scope: Option<usize>, flt: &Filter) -> Vec<Item<'a>> {
    let needle = flt.needle.trim().to_lowercase();
    let mut items: Vec<Item<'a>> = Vec::new();
    let mut push = |dev: Option<usize>, f: &'a Finding| {
        if !flt.sev_on[f.severity as usize] {
            return;
        }
        if !needle.is_empty() {
            let who = if scope.is_none() {
                dev.map_or("mellan enheter", |d| fleet.devices[d].name.as_str()).to_lowercase()
            } else {
                String::new()
            };
            if !(f.message.to_lowercase().contains(&needle) || f.rule.contains(&needle) || who.contains(&needle)) {
                return;
            }
        }
        items.push(Item { dev, f });
    };
    match scope {
        Some(i) => {
            if let Some(d) = fleet.devices.get(i) {
                d.findings().for_each(|f| push(Some(i), f));
            }
        }
        None => {
            for (i, d) in fleet.devices.iter().enumerate() {
                d.findings().for_each(|f| push(Some(i), f));
            }
            fleet.cross.iter().for_each(|f| push(None, f));
        }
    }
    if flt.group {
        let mut worst: std::collections::HashMap<&str, Severity> = Default::default();
        for it in &items {
            let e = worst.entry(it.f.rule.as_str()).or_insert(it.f.severity);
            *e = (*e).max(it.f.severity);
        }
        items.sort_by(|a, b| {
            worst[b.f.rule.as_str()]
                .cmp(&worst[a.f.rule.as_str()])
                .then_with(|| a.f.rule.cmp(&b.f.rule))
                .then_with(|| b.f.severity.cmp(&a.f.severity))
        });
    } else {
        items.sort_by_key(|it| std::cmp::Reverse(it.f.severity));
    }
    items
}

enum Act {
    Copy,
    Show(usize, usize),
    Ignore(usize, String),
}

pub(crate) fn findings(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let all = app.sa.all_devices;
    if !all && app.fleet.devices.get(app.device).is_none() {
        return;
    }
    let scope = if all { None } else { Some(app.device) };
    // En annan vy (t.ex. Översikt) kan be om att ett visst fynd ska visas: släpp då filtren.
    let focus = app.sa.focus.take();
    if focus.is_some() {
        app.sa.sev_on = [true; 5];
        app.search.clear();
    }
    let group = app.sa.group_by_rule;
    let list = build_items(&app.fleet, scope, &Filter { needle: &app.search, sev_on: &app.sa.sev_on, group });
    let counts = {
        let base = build_items(&app.fleet, scope, &Filter { needle: &app.search, sev_on: &[true; 5], group: false });
        let mut c = [0usize; 5];
        base.iter().for_each(|it| c[it.f.severity as usize] += 1);
        c
    };
    let total: usize = match scope {
        Some(i) => app.fleet.devices[i].findings().count(),
        None => app.fleet.all_findings().count(),
    };
    if let Some(fo) = &focus
        && let Some(i) = list.iter().position(|it| it.f.rule == fo.rule && it.f.message == fo.message)
    {
        app.finding = i;
        app.sa.scroll_to_selected = true;
    }
    // Piltangenterna flyttar markeringen när ingen textruta har fokus (169).
    if !list.is_empty() && !ui.ctx().egui_wants_keyboard_input() {
        let (up, down) = ui.ctx().input(|i| {
            (!i.modifiers.any() && i.key_pressed(egui::Key::ArrowUp), !i.modifiers.any() && i.key_pressed(egui::Key::ArrowDown))
        });
        let cur = app.finding.min(list.len() - 1);
        if down && cur + 1 < list.len() {
            app.finding = cur + 1;
            app.sa.scroll_to_selected = true;
        }
        if up && cur > 0 {
            app.finding = cur - 1;
            app.sa.scroll_to_selected = true;
        }
    }
    let scroll_to_selected = std::mem::take(&mut app.sa.scroll_to_selected);

    ui.horizontal(|ui| {
        if let Some(d) = app.fleet.devices.get(app.device).filter(|_| !all) {
            theme::score_ring(ui, d.score, 54.0, dark);
            ui.vertical(|ui| {
                ui.label(RichText::new(&d.name).size(22.0).strong());
                ui.label(
                    RichText::new(format!(
                        "{} · {} · {total} fynd · {}/{} regler godkända",
                        d.kind,
                        file_name(&d.path),
                        d.passed(),
                        d.results.len()
                    ))
                    .color(p.muted),
                );
            });
        } else {
            theme::score_ring(ui, app.fleet.score, 54.0, dark);
            ui.vertical(|ui| {
                ui.label(RichText::new("Hela nätet").size(22.0).strong());
                ui.label(
                    RichText::new(format!(
                        "{} enheter · {total} fynd · {} mellan enheterna",
                        app.fleet.devices.len(),
                        app.fleet.cross.len()
                    ))
                    .color(p.muted),
                );
            });
        }
    });
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        ui.selectable_value(&mut app.sa.all_devices, false, "Vald enhet");
        ui.selectable_value(&mut app.sa.all_devices, true, "Alla enheter");
        ui.add_space(6.0);
        ui.add(
            egui::TextEdit::singleline(&mut app.search)
                .id(egui::Id::unique("findings_search"))
                .hint_text("Sök i fynden (Ctrl+F) …")
                .desired_width(220.0),
        );
        ui.checkbox(&mut app.sa.group_by_rule, "Gruppera per regel");
    });
    ui.add_space(4.0);
    // Nivåetiketterna är filterknappar (181): klick döljer/visar, högerklick visar bara den nivån.
    ui.horizontal_wrapped(|ui| {
        for s in Severity::ALL {
            let on = app.sa.sev_on[s as usize];
            let c = theme::sev_color(s, dark);
            let text = RichText::new(format!("{} {} {}", s.icon(), s.label(), counts[s as usize])).size(12.0).strong().color(if on {
                c
            } else {
                p.muted
            });
            let btn = egui::Button::new(text)
                .fill(if on { theme::alpha(c, 0.18) } else { Color32::TRANSPARENT })
                .stroke(Stroke::new(1.0, if on { theme::alpha(c, 0.7) } else { p.line }))
                .corner_radius(CornerRadius::same(255));
            let r = ui.add(btn).on_hover_text("Klicka för att visa eller dölja nivån. Högerklick: visa bara den.");
            if r.clicked() {
                app.sa.sev_on[s as usize] = !on;
            }
            if r.secondary_clicked() {
                app.sa.sev_on = [false; 5];
                app.sa.sev_on[s as usize] = true;
            }
        }
        if app.sa.sev_on.iter().any(|on| !on) && ui.small_button("Visa alla").clicked() {
            app.sa.sev_on = [true; 5];
        }
    });
    ui.add_space(8.0);

    if list.is_empty() {
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(
                RichText::new(if total == 0 { "✔ Inga fynd – allt ser bra ut!" } else { "Inga fynd matchar filtret." })
                    .size(16.0)
                    .color(p.good),
            );
        });
        if !all {
            rule_overview(app, ui);
        }
        return;
    }
    let selected = app.finding.min(list.len() - 1);
    let mut new_sel = None;
    let mut act: Option<Act> = None;
    let fleet = &app.fleet;

    let avail = ui.available_size();
    ui.horizontal_top(|ui| {
        let left_w = (avail.x * 0.48).max(320.0);
        ui.allocate_ui_with_layout(Vec2::new(left_w, avail.y), Layout::top_down(Align::Min), |ui| {
            egui::ScrollArea::vertical().id_salt("findings").auto_shrink([false, false]).show(ui, |ui| {
                let mut last_rule: Option<&str> = None;
                for (i, it) in list.iter().enumerate() {
                    let f = it.f;
                    if group && last_rule != Some(f.rule.as_str()) {
                        last_rule = Some(f.rule.as_str());
                        let n = list.iter().filter(|o| o.f.rule == f.rule).count();
                        ui.add_space(4.0);
                        ui.horizontal(|ui| {
                            ui.label(RichText::new(rules::find(&f.rule).map_or(f.rule.as_str(), |r| r.title)).strong().color(p.violet));
                            theme::chip(ui, &n.to_string(), p.muted);
                        });
                    }
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
                                if all {
                                    ui.label(RichText::new(it.dev.map_or("Mellan enheter", |d| fleet.devices[d].name.as_str())).strong());
                                }
                                ui.label(RichText::new(&f.rule).monospace().size(12.0).color(p.muted));
                                if let Some(l) = f.line {
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        ui.label(RichText::new(format!("rad {l}")).size(12.0).color(p.muted))
                                    });
                                }
                            });
                            ui.label(&f.message);
                        })
                        .response
                        .interact(Sense::click());
                    if resp.clicked() {
                        new_sel = Some(i);
                    }
                    if sel && scroll_to_selected {
                        resp.scroll_to_me(None);
                    }
                    ui.add_space(4.0);
                }
            });
        });
        ui.add_space(12.0);
        ui.allocate_ui_with_layout(Vec2::new(ui.available_width(), avail.y), Layout::top_down(Align::Min), |ui| {
            let f = list[selected].f;
            let dev = list[selected].dev;
            let d = dev.and_then(|i| fleet.devices.get(i));
            egui::ScrollArea::vertical().id_salt("detail").auto_shrink([false, false]).show(ui, |ui| {
                theme::card(dark).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    let rule = rules::find(&f.rule);
                    ui.label(RichText::new(rule.map_or(f.rule.as_str(), |r| r.title)).size(18.0).strong());
                    ui.horizontal(|ui| {
                        theme::sev_chip(ui, f.severity, dark);
                        let who = if all { format!("{} · ", d.map_or("mellan enheter", |d| d.name.as_str())) } else { String::new() };
                        ui.label(
                            RichText::new(format!(
                                "{who}regel {}{}",
                                f.rule,
                                rule.map(|r| format!(" · {}", r.category)).unwrap_or_default()
                            ))
                            .color(p.muted),
                        );
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
                                    act = Some(Act::Copy);
                                }
                            });
                        });
                        code_block(ui, &f.fix.join("\n"), dark);
                    }
                    if let (Some(d), Some(no)) = (d, f.line) {
                        ui.add_space(10.0);
                        ui.horizontal(|ui| {
                            ui.label(RichText::new(format!("I konfigen (rad {no})")).strong().color(p.violet));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if ui.small_button("Visa i konfig →").clicked() {
                                    act = Some(Act::Show(dev.unwrap_or(0), no));
                                }
                            });
                        });
                        egui::Frame::new().fill(p.code_bg).corner_radius(CornerRadius::same(8)).inner_margin(Margin::same(8)).show(
                            ui,
                            |ui| {
                                ui.set_width(ui.available_width());
                                let from = no.saturating_sub(3).max(1);
                                for l in d.config.lines.iter().filter(|l| l.no >= from && l.no <= no + 3) {
                                    let hit = l.no == no;
                                    let mut job = LayoutJob::default();
                                    job.append(
                                        &format!("{:>4}  ", l.no),
                                        0.0,
                                        fmt(if hit { theme::sev_color(f.severity, dark) } else { p.muted }, true),
                                    );
                                    highlight_into(&mut job, &l.text, &p, dark);
                                    let resp = ui.label(job);
                                    if hit {
                                        ui.painter().rect_filled(
                                            resp.rect.expand2(Vec2::new(4.0, 0.0)),
                                            CornerRadius::same(4),
                                            theme::alpha(theme::sev_color(f.severity, dark), 0.12),
                                        );
                                    }
                                }
                            },
                        );
                    }
                    if let Some(i) = dev {
                        ui.add_space(12.0);
                        ui.separator();
                        ui.horizontal(|ui| {
                            if ui
                                .button("Ignorera regeln för enheten")
                                .on_hover_text(format!("Skriver '! vlantool:ignore {}' överst i konfigfilen och läser om", f.rule))
                                .clicked()
                            {
                                act = Some(Act::Ignore(i, f.rule.clone()));
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
    match act {
        Some(Act::Show(dev, line)) => {
            app.select_device(dev);
            app.jump_to_line = Some(line);
            app.tab = Tab::Config;
        }
        Some(Act::Copy) => app.toast("✔ Kopierat till urklipp"),
        Some(Act::Ignore(dev, rule)) => app.ignore_rule(dev, &rule),
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

#[cfg(test)]
mod tests {
    use super::*;
    use vlantool::audit::audit_fleet;
    use vlantool::parser::Config;

    fn fleet() -> FleetReport {
        let cfg = |name: &str, extra: &str| Config::parse(name, &format!("{name}.cfg"), &format!("hostname {name}\n{extra}"));
        audit_fleet(vec![cfg("SW-A", "line vty 0 4\n transport input telnet\n"), cfg("SW-B", "")], &[])
    }

    fn all_on() -> [bool; 5] {
        [true; 5]
    }

    #[test]
    fn scope_one_device_or_whole_network() {
        let f = fleet();
        let one = build_items(&f, Some(0), &Filter { needle: "", sev_on: &all_on(), group: false });
        assert_eq!(one.len(), f.devices[0].findings().count());
        assert!(one.iter().all(|it| it.dev == Some(0)));
        let net = build_items(&f, None, &Filter { needle: "", sev_on: &all_on(), group: false });
        assert_eq!(net.len(), f.all_findings().count(), "hela nätet inkluderar alla enheters fynd");
        assert!(net.windows(2).all(|w| w[0].f.severity >= w[1].f.severity));
        assert!(net.iter().any(|it| it.dev == Some(1)));
    }

    #[test]
    fn severity_buttons_and_search_filter() {
        let f = fleet();
        let mut on = [false; 5];
        on[Severity::Critical as usize] = true;
        let crit = build_items(&f, None, &Filter { needle: "", sev_on: &on, group: false });
        assert!(!crit.is_empty() && crit.iter().all(|it| it.f.severity == Severity::Critical));
        let none = build_items(&f, None, &Filter { needle: "", sev_on: &[false; 5], group: false });
        assert!(none.is_empty());
        let ssh = build_items(&f, None, &Filter { needle: " VTY-SSH ", sev_on: &all_on(), group: false });
        assert!(ssh.iter().all(|it| it.f.rule == "vty-ssh") && !ssh.is_empty());
        let by_dev = build_items(&f, None, &Filter { needle: "sw-b", sev_on: &all_on(), group: false });
        assert!(by_dev.iter().all(|it| it.dev == Some(1)));
    }

    #[test]
    fn grouping_puts_a_rule_together_worst_group_first() {
        let f = fleet();
        let items = build_items(&f, None, &Filter { needle: "", sev_on: &all_on(), group: true });
        let mut seen: Vec<&str> = Vec::new();
        for it in &items {
            if seen.last() != Some(&it.f.rule.as_str()) {
                assert!(!seen.contains(&it.f.rule.as_str()), "regeln {} är splittrad", it.f.rule);
                seen.push(&it.f.rule);
            }
        }
        assert_eq!(items[0].f.severity, f.all_findings().map(|x| x.severity).max().unwrap());
    }
}
