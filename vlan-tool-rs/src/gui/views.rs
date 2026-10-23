//! Innehållet i varje flik.

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
        Tab::Overview => overview(app, ui),
        Tab::Findings => findings(app, ui),
        Tab::Ports => ports(app, ui),
        Tab::Vlans => vlans(app, ui),
        Tab::Topology => topology_view(app, ui),
        Tab::Config => config(app, ui),
        Tab::Drift => drift(app, ui),
        Tab::Csv => csv(app, ui),
        Tab::Subnet => subnet(app, ui),
        Tab::Settings => settings(app, ui),
    }
}

fn file_name(path: &str) -> String {
    std::path::Path::new(path).file_name().map_or_else(|| path.to_string(), |n| n.to_string_lossy().to_string())
}

fn heading(ui: &mut Ui, title: &str, subtitle: &str, p: &Palette) {
    ui.label(RichText::new(title).size(24.0).strong());
    if !subtitle.is_empty() {
        ui.label(RichText::new(subtitle).color(p.muted));
    }
    ui.add_space(12.0);
}

// ---------------------------------------------------------------------------
// Välkommen / tomt
// ---------------------------------------------------------------------------

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

fn empty_state(app: &mut App, ui: &mut Ui) {
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

fn device_list(app: &mut App, ui: &mut Ui) {
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

// ---------------------------------------------------------------------------
// Översikt
// ---------------------------------------------------------------------------

fn overview(app: &mut App, ui: &mut Ui) {
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

// ---------------------------------------------------------------------------
// Fynd
// ---------------------------------------------------------------------------

fn findings(app: &mut App, ui: &mut Ui) {
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

fn rule_overview(app: &App, ui: &mut Ui) {
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

fn code_block(ui: &mut Ui, text: &str, dark: bool) {
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

fn fmt(color: Color32, mono: bool) -> TextFormat {
    TextFormat { font_id: if mono { FontId::monospace(13.0) } else { FontId::proportional(14.0) }, color, ..Default::default() }
}

/// Syntaxfärgning för en IOS-rad.
fn highlight_into(job: &mut LayoutJob, text: &str, p: &Palette, dark: bool) {
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

// ---------------------------------------------------------------------------
// Portar
// ---------------------------------------------------------------------------

fn ports(app: &mut App, ui: &mut Ui) {
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

// ---------------------------------------------------------------------------
// VLAN
// ---------------------------------------------------------------------------

fn vlans(app: &mut App, ui: &mut Ui) {
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

// ---------------------------------------------------------------------------
// Topologi
// ---------------------------------------------------------------------------

struct Node {
    label: String,
    sub: String,
    kind: Option<Kind>,
    port: String,
    children: Vec<usize>,
    /// Ändpunkter (datorer m.m.) samlade under en switch.
    endpoints: Vec<(String, String, Option<u16>, bool)>,
    pos: Pos2,
    size: Vec2,
    width: f32,
}

fn build_graph(app: &App) -> Vec<Node> {
    let configs: Vec<_> = app.fleet.devices.iter().map(|d| d.config.clone()).collect();
    let lines = topology::tree(&configs);
    let mut nodes: Vec<Node> = Vec::new();
    let mut stack: Vec<(usize, usize)> = Vec::new(); // (djup, nod)
    let mut roots = Vec::new();
    for l in lines {
        let depth = l.prefix.chars().count() / 3;
        while stack.last().is_some_and(|(d, _)| *d >= depth) {
            stack.pop();
        }
        let parent = stack.last().map(|(_, n)| *n);
        let vlan = l.info.strip_prefix("vlan ").and_then(|v| v.parse().ok());
        // Datorer och liknande samlas i en lista under switchen istället för egna noder.
        if !l.device && vlan.is_some()
            && let Some(par) = parent {
                nodes[par].endpoints.push((l.port.clone(), l.peer.clone(), vlan, l.down));
                continue;
            }
        let idx = nodes.len();
        nodes.push(Node {
            label: l.peer.clone(),
            sub: l.info.clone(),
            kind: l.kind.filter(|_| l.device),
            port: l.port.clone(),
            children: Vec::new(),
            endpoints: Vec::new(),
            pos: Pos2::ZERO,
            size: Vec2::ZERO,
            width: 0.0,
        });
        match parent {
            Some(par) => nodes[par].children.push(idx),
            None => roots.push(idx),
        }
        stack.push((depth, idx));
    }
    for n in &mut nodes {
        n.size = if n.kind.is_some() { Vec2::new(200.0, 62.0) } else { Vec2::new(160.0, 48.0) };
        if !n.endpoints.is_empty() {
            n.size.y += 14.0 + 19.0 * n.endpoints.len() as f32;
            n.size.x = 250.0;
        }
    }
    const GAP_X: f32 = 46.0;
    const GAP_Y: f32 = 90.0;
    fn measure(nodes: &mut Vec<Node>, i: usize) -> f32 {
        let kids = nodes[i].children.clone();
        let sum: f32 = kids.iter().map(|&k| measure(nodes, k)).sum::<f32>() + GAP_X * kids.len().saturating_sub(1) as f32;
        nodes[i].width = nodes[i].size.x.max(sum);
        nodes[i].width
    }
    fn place(nodes: &mut Vec<Node>, i: usize, left: f32, top: f32) {
        let w = nodes[i].width;
        nodes[i].pos = Pos2::new(left + w / 2.0, top);
        let kids = nodes[i].children.clone();
        let total: f32 = kids.iter().map(|&k| nodes[k].width).sum::<f32>() + GAP_X * kids.len().saturating_sub(1) as f32;
        let mut x = left + (w - total) / 2.0;
        let y = top + nodes[i].size.y + GAP_Y;
        for k in kids {
            place(nodes, k, x, y);
            x += nodes[k].width + GAP_X;
        }
    }
    let mut x = 0.0;
    for r in roots {
        measure(&mut nodes, r);
        place(&mut nodes, r, x, 0.0);
        x += nodes[r].width + GAP_X * 2.0;
    }
    nodes
}

fn topology_view(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    ui.horizontal(|ui| {
        ui.label(RichText::new("Topologi").size(24.0).strong());
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.button("◎ Anpassa").clicked() {
                app.scene_rect = Rect::ZERO;
            }
            ui.label(RichText::new("Dra för att flytta · Ctrl+scroll för att zooma").size(12.0).color(p.muted));
        });
    });
    ui.add_space(8.0);
    let nodes = build_graph(app);
    let scores: std::collections::HashMap<String, u32> = app.fleet.devices.iter().map(|d| (d.name.clone(), d.score)).collect();
    let mut open: Option<String> = None;
    egui::Frame::new().fill(p.panel).stroke(Stroke::new(1.0, p.line)).corner_radius(CornerRadius::same(14)).show(ui, |ui| {
        ui.set_min_size(ui.available_size());
        if nodes.is_empty() {
            ui.centered_and_justified(|ui| ui.label(RichText::new("Inga portbeskrivningar som 'Port mot X' – topologin går inte att rita.").color(p.muted)));
            return;
        }
        let mut rect = app.scene_rect;
        egui::Scene::new().zoom_range(0.2..=2.0).show(ui, &mut rect, |ui| {
            let painter = ui.painter().clone();
            let bounds = nodes.iter().fold(Rect::NOTHING, |r, n| r.union(Rect::from_center_size(n.pos + Vec2::new(0.0, n.size.y / 2.0), n.size)));
            ui.allocate_rect(bounds.expand(40.0), Sense::hover());
            // Kanter först så att noderna hamnar ovanpå.
            for n in &nodes {
                for &k in &n.children {
                    let c = &nodes[k];
                    let a = n.pos + Vec2::new(0.0, n.size.y);
                    let b = c.pos;
                    let mid = (a.y + b.y) / 2.0;
                    let pts = [a, Pos2::new(a.x, mid), Pos2::new(b.x, mid), b];
                    let curve = egui::epaint::CubicBezierShape::from_points_stroke(pts, false, Color32::TRANSPARENT, Stroke::new(2.0, theme::alpha(p.accent, 0.55)));
                    painter.add(curve);
                    if !c.port.is_empty() {
                        let lp = Pos2::new(b.x, mid + 14.0);
                        let galley = painter.layout_no_wrap(c.port.clone(), FontId::monospace(11.5), p.violet);
                        let r = Rect::from_center_size(lp, galley.size() + Vec2::new(12.0, 6.0));
                        painter.rect_filled(r, CornerRadius::same(8), p.raised);
                        painter.galley(r.center() - galley.size() / 2.0, galley, p.violet);
                    }
                }
            }
            for n in &nodes {
                let r = Rect::from_min_size(n.pos - Vec2::new(n.size.x / 2.0, 0.0), n.size);
                let (icon, color) = match n.kind {
                    Some(Kind::Router) => ("◉", p.accent),
                    Some(Kind::Switch) => ("▣", p.violet),
                    Some(Kind::Unknown) => ("◇", p.muted),
                    None => ("☁", p.muted),
                };
                painter.rect(r, CornerRadius::same(14), p.card, Stroke::new(if n.kind.is_some() { 1.5 } else { 1.0 }, theme::alpha(color, 0.75)), egui::StrokeKind::Inside);
                painter.text(r.left_top() + Vec2::new(16.0, 20.0), Align2::LEFT_CENTER, icon, FontId::proportional(20.0), color);
                painter.text(r.left_top() + Vec2::new(42.0, 20.0), Align2::LEFT_CENTER, &n.label, FontId::proportional(15.5), p.text);
                let sub = match n.kind {
                    Some(k) => k.label().to_string(),
                    None => n.sub.clone(),
                };
                painter.text(r.left_top() + Vec2::new(42.0, 41.0), Align2::LEFT_CENTER, sub, FontId::proportional(12.0), p.muted);
                if let Some(score) = scores.get(&n.label) {
                    let c = r.right_top() + Vec2::new(-26.0, 30.0);
                    painter.circle_filled(c, 16.0, theme::alpha(theme::score_color(*score, dark), 0.18));
                    painter.text(c, Align2::CENTER_CENTER, score.to_string(), FontId::proportional(13.0), theme::score_color(*score, dark));
                }
                let mut y = r.top() + if n.kind.is_some() { 66.0 } else { 52.0 };
                if !n.endpoints.is_empty() {
                    painter.line_segment([Pos2::new(r.left() + 12.0, y - 6.0), Pos2::new(r.right() - 12.0, y - 6.0)], Stroke::new(1.0, p.line));
                }
                for (port, name, vlan, down) in &n.endpoints {
                    let vc = vlan.map_or(p.muted, |v| theme::vlan_color(v, dark));
                    painter.circle_filled(Pos2::new(r.left() + 18.0, y + 6.0), 4.0, if *down { theme::sev_color(Severity::Critical, dark) } else { vc });
                    painter.text(Pos2::new(r.left() + 30.0, y + 6.0), Align2::LEFT_CENTER, port, FontId::monospace(11.5), p.muted);
                    painter.text(Pos2::new(r.left() + 92.0, y + 6.0), Align2::LEFT_CENTER, name, FontId::proportional(12.5), p.text);
                    if let Some(v) = vlan {
                        painter.text(Pos2::new(r.right() - 14.0, y + 6.0), Align2::RIGHT_CENTER, format!("VLAN {v}"), FontId::proportional(11.5), vc);
                    }
                    y += 19.0;
                }
                if n.kind.is_some() && ui.interact(r, ui.scope_id().with(&n.label), Sense::click()).on_hover_text("Dubbelklicka för att visa fynden").double_clicked() {
                    open = Some(n.label.clone());
                }
            }
        });
        app.scene_rect = rect;
    });
    if let Some(name) = open
        && let Some(i) = app.fleet.devices.iter().position(|d| d.name == name) {
            app.select_device(i);
            app.tab = Tab::Findings;
        }
}

// ---------------------------------------------------------------------------
// Konfig
// ---------------------------------------------------------------------------

fn config(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    let marks: std::collections::HashMap<usize, (Severity, String)> = d.findings().filter_map(|f| f.line.map(|l| (l, (f.severity, f.message.clone())))).fold(
        Default::default(),
        |mut m, (l, (s, msg))| {
            let e = m.entry(l).or_insert((s, msg.clone()));
            if s > e.0 {
                *e = (s, msg);
            }
            m
        },
    );
    ui.horizontal(|ui| {
        ui.vertical(|ui| {
            ui.label(RichText::new(&d.name).size(22.0).strong());
            ui.label(RichText::new(format!("{} · {} rader", file_name(&d.path), d.config.lines.len())).color(p.muted));
        });
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.button("Öppna i redigerare").clicked() {
                open_path(std::path::Path::new(&d.path));
            }
            if ui.button("Kopiera").clicked() {
                ui.ctx().copy_text(d.config.lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n"));
            }
        });
    });
    ui.add_space(8.0);
    let row_h = 19.0;
    let jump = app.jump_to_line.take();
    egui::Frame::new().fill(p.code_bg).stroke(Stroke::new(1.0, p.line)).corner_radius(CornerRadius::same(12)).inner_margin(Margin::same(10)).show(ui, |ui| {
        let mut area = egui::ScrollArea::vertical().auto_shrink([false, false]).id_salt(("cfg", app.device));
        if let Some(line) = jump {
            area = area.vertical_scroll_offset((line as f32 - 6.0).max(0.0) * row_h);
        }
        ui.spacing_mut().item_spacing.y = 0.0;
        area.show_rows(ui, row_h, d.config.lines.len(), |ui, range| {
            for l in &d.config.lines[range] {
                ui.horizontal(|ui| {
                    ui.set_height(row_h);
                    let (rect, _) = ui.allocate_exact_size(Vec2::new(18.0, row_h), Sense::hover());
                    if let Some((s, msg)) = marks.get(&l.no) {
                        ui.painter().text(rect.center(), Align2::CENTER_CENTER, s.icon(), FontId::proportional(13.0), theme::sev_color(*s, dark));
                        ui.interact(rect, ui.scope_id().with(l.no), Sense::hover()).on_hover_text(msg);
                    }
                    let mut job = LayoutJob::default();
                    let hit = jump == Some(l.no);
                    job.append(&format!("{:>4}  ", l.no), 0.0, fmt(if hit { p.accent } else { theme::alpha(p.muted, 0.7) }, true));
                    highlight_into(&mut job, &l.text, &p, dark);
                    let resp = ui.label(job);
                    if hit || marks.contains_key(&l.no) {
                        let c = marks.get(&l.no).map_or(p.accent, |(s, _)| theme::sev_color(*s, dark));
                        ui.painter().rect_filled(Rect::from_min_max(Pos2::new(rect.left(), resp.rect.top()), Pos2::new(ui.max_rect().right(), resp.rect.bottom())), 0.0, theme::alpha(c, 0.08));
                    }
                });
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Drift
// ---------------------------------------------------------------------------

fn drift(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    heading(ui, "Drift", "Skiljer sig de sparade konfigarna från vad CSV-filerna säger att de ska vara?", &p);
    if app.drift.is_empty() {
        ui.label(RichText::new("Inga CSV-filer att jämföra med.").color(p.muted));
        return;
    }
    let mut regenerate = false;
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        for e in &app.drift {
            theme::card(dark).show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    ui.label(RichText::new(&e.hostname).size(16.0).strong());
                    if !e.saved {
                        theme::chip(ui, "✚ inte genererad än", theme::sev_color(Severity::Medium, dark));
                    } else if e.added + e.removed == 0 {
                        theme::chip(ui, "✔ i fas med CSV", p.good);
                    } else {
                        theme::chip(ui, &format!("+{}", e.added), p.good);
                        theme::chip(ui, &format!("−{}", e.removed), theme::sev_color(Severity::Critical, dark));
                    }
                });
                if !e.lines.is_empty() {
                    ui.add_space(6.0);
                    egui::Frame::new().fill(p.code_bg).corner_radius(CornerRadius::same(8)).inner_margin(Margin::same(10)).show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        for l in e.lines.iter().take(400) {
                            let (c, bg) = if l.starts_with("+ ") {
                                (p.good, Some(theme::alpha(p.good, 0.08)))
                            } else if l.starts_with("- ") {
                                (theme::sev_color(Severity::Critical, dark), Some(theme::alpha(theme::sev_color(Severity::Critical, dark), 0.08)))
                            } else if l.starts_with("@@") {
                                (p.accent, None)
                            } else {
                                (p.muted, None)
                            };
                            let resp = ui.label(RichText::new(l).monospace().color(c));
                            if let Some(bg) = bg {
                                ui.painter().rect_filled(resp.rect.expand2(Vec2::new(4.0, 0.0)), CornerRadius::same(3), bg);
                            }
                        }
                    });
                }
            });
            ui.add_space(10.0);
        }
        if app.drift.iter().any(|e| !e.saved || e.added + e.removed > 0) && theme::primary_button(ui, "⚡ Skriv över med konfigar från CSV", dark).clicked() {
            regenerate = true;
        }
    });
    if regenerate {
        app.generate();
    }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

fn csv(app: &mut App, ui: &mut Ui) {
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

// ---------------------------------------------------------------------------
// Subnät
// ---------------------------------------------------------------------------

fn subnet(app: &mut App, ui: &mut Ui) {
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

// ---------------------------------------------------------------------------
// Inställningar
// ---------------------------------------------------------------------------

fn settings(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    heading(ui, "Inställningar", "Sparas i nordvik.toml i projektmappen och används när konfigarna genereras", &p);
    let mut save = false;
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        let s = &mut app.settings_draft;
        let text = |ui: &mut Ui, label: &str, v: &mut String, hint: &str| {
            ui.label(label);
            ui.add(egui::TextEdit::singleline(v).desired_width(320.0).hint_text(hint));
            ui.end_row();
        };
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Grund", dark);
            egui::Grid::new("set-base").num_columns(2).spacing([24.0, 10.0]).show(ui, |ui| {
                text(ui, "Domännamn", &mut s.domain, "nordvik.example");
                text(ui, "Loggserver", &mut s.log_server, "192.168.1.17");
                text(ui, "NTP-server", &mut s.ntp_server, "192.168.1.16");
                text(ui, "Banner", &mut s.banner, "Endast behörig personal");
            });
        });
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Inloggning", dark);
            egui::Grid::new("set-login").num_columns(2).spacing([24.0, 10.0]).show(ui, |ui| {
                text(ui, "Användarnamn", &mut s.username, "drift");
                ui.label("Lösenord (secret)");
                ui.horizontal(|ui| {
                    ui.add(egui::TextEdit::singleline(&mut s.secret).password(true).desired_width(320.0));
                    if s.secret == "CHANGE_ME" {
                        theme::chip(ui, "▲ platshållare", theme::sev_color(Severity::Medium, dark));
                    }
                });
                ui.end_row();
                ui.label("Exec-timeout");
                ui.add(egui::Slider::new(&mut s.exec_timeout, 1..=60).suffix(" min"));
                ui.end_row();
            });
        });
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Nät", dark);
            egui::Grid::new("set-net").num_columns(2).spacing([24.0, 10.0]).show(ui, |ui| {
                ui.label("Hanterings-VLAN");
                ui.add(egui::DragValue::new(&mut s.mgmt_vlan).range(1..=4094));
                ui.end_row();
                ui.label("Native-VLAN");
                ui.add(egui::DragValue::new(&mut s.native_vlan).range(1..=4094));
                ui.end_row();
                text(ui, "Routerns namn", &mut s.router_hostname, "R-Nordvik-1");
                text(ui, "Trunkport mot switch", &mut s.router_trunk_interface, "GigabitEthernet0/0");
                text(ui, "Port mot internet", &mut s.router_wan_interface, "GigabitEthernet0/1");
                text(ui, "WAN-adress", &mut s.wan_ip, "203.0.113.10");
                text(ui, "WAN-mask", &mut s.wan_mask, "255.255.255.0");
                text(ui, "WAN-gateway", &mut s.wan_gateway, "203.0.113.1");
                ui.label("Portskydd");
                ui.checkbox(&mut s.edge_protection, "portfast + BPDU guard på accessportar");
                ui.end_row();
            });
        });
        ui.add_space(14.0);
        ui.horizontal(|ui| {
            let changed = toml_eq(&app.settings_draft, &app.settings);
            if ui.add_enabled(!changed, egui::Button::new(RichText::new("Spara").strong())).clicked() {
                save = true;
            }
            if ui.add_enabled(!changed, egui::Button::new("Ångra ändringar")).clicked() {
                app.settings_draft = app.settings.clone();
            }
            if ui.button("Standardvärden").clicked() {
                app.settings_draft = vlantool::settings::Settings::default();
            }
        });
    });
    if save {
        app.save_settings();
    }
}

fn toml_eq(a: &vlantool::settings::Settings, b: &vlantool::settings::Settings) -> bool {
    a.to_toml() == b.to_toml()
}
