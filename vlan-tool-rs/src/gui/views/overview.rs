//! Fliken Översikt.

#![allow(unused_imports)]

use super::*;
use crate::history::{self, Point};
use state_a::FocusFinding;
use vlantool::audit::FleetReport;

/// Hur många fynd "Viktigast att åtgärda" visar.
const TOP_N: usize = 5;
/// Så många betygspunkter ritas i diagrammet.
const CHART_POINTS: usize = 40;

/// Fynd per kategori och nivå (indexerat med `Severity as usize`). Kontrollerna mellan
/// enheterna räknas som kategorin "Mellan enheter". Kategorier utan fynd tas med sist.
pub(crate) fn category_counts(fleet: &FleetReport) -> Vec<(String, [usize; 5])> {
    let mut map: Vec<(String, [usize; 5])> = Vec::new();
    let mut add = |cat: &str, sev: Severity, n: usize| {
        let idx = match map.iter().position(|(c, _)| c == cat) {
            Some(i) => i,
            None => {
                map.push((cat.to_string(), [0; 5]));
                map.len() - 1
            }
        };
        map[idx].1[sev as usize] += n;
    };
    for r in rules::ALL_RULES {
        add(r.category, Severity::Info, 0);
    }
    for d in &fleet.devices {
        for res in &d.results {
            for f in &res.findings {
                add(res.category, f.severity, 1);
            }
        }
    }
    for f in &fleet.cross {
        add("Mellan enheter", f.severity, 1);
    }
    let total = |c: &[usize; 5]| c.iter().sum::<usize>();
    map.sort_by_key(|(_, c)| std::cmp::Reverse(total(c)));
    map
}

/// De `n` allvarligaste fynden i nätet (enhetens index, eller `None` för kontroller mellan enheter).
pub(crate) fn top_findings(fleet: &FleetReport, n: usize) -> Vec<(Option<usize>, &Finding)> {
    let mut all: Vec<(Option<usize>, &Finding)> =
        fleet.devices.iter().enumerate().flat_map(|(i, d)| d.findings().map(move |f| (Some(i), f))).collect();
    all.extend(fleet.cross.iter().map(|f| (None, f)));
    all.sort_by_key(|(_, f)| std::cmp::Reverse(f.severity));
    all.truncate(n);
    all
}

/// Markdown-sammanfattning för urklipp (178).
pub(crate) fn summary_markdown(project: &str, fleet: &FleetReport) -> String {
    let total = fleet.all_findings().count();
    let mut out = format!("# Granskning av {project}\n\n");
    out.push_str(&format!(
        "Betyg för hela nätet: **{} ({})** · {} enheter · {total} fynd\n\n",
        fleet.score,
        fleet.grade,
        fleet.devices.len()
    ));
    out.push_str("| Enhet | Typ | Betyg |");
    for s in Severity::ALL {
        out.push_str(&format!(" {} |", s.label()));
    }
    out.push_str("\n|---|---|---|");
    out.push_str(&"---|".repeat(Severity::ALL.len()));
    out.push('\n');
    for d in &fleet.devices {
        out.push_str(&format!("| {} | {} | {} ({}) |", d.name, d.kind, d.score, d.grade));
        for s in Severity::ALL {
            out.push_str(&format!(" {} |", d.count(s)));
        }
        out.push('\n');
    }
    let top = top_findings(fleet, TOP_N);
    if !top.is_empty() {
        out.push_str("\n## Viktigast att åtgärda\n\n");
        for (i, (dev, f)) in top.iter().enumerate() {
            let who = dev.map_or("Mellan enheter", |d| fleet.devices[d].name.as_str());
            out.push_str(&format!("{}. **{}** {who}: {} (`{}`)\n", i + 1, f.severity.label(), f.message, f.rule));
        }
    }
    if !fleet.cross.is_empty() {
        out.push_str("\n## Mellan enheterna\n\n");
        for f in &fleet.cross {
            out.push_str(&format!("- **{}** {}\n", f.severity.label(), f.message));
        }
    }
    out
}

pub(crate) fn overview(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let mut go: Option<(Option<usize>, Tab, Option<FocusFinding>)> = None;
    let mut copy = false;
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
                ui.label(
                    RichText::new(format!(
                        "{} enheter · {links} länkar · {ok}/{total} regler godkända · betyg {}",
                        fleet.devices.len(),
                        fleet.grade
                    ))
                    .color(p.muted),
                );
            });
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if ui.button("Kopiera sammanfattning").on_hover_text("Lägger en Markdown-sammanfattning i urklipp").clicked() {
                    copy = true;
                }
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

        // Viktigast att åtgärda (153)
        let top = top_findings(fleet, TOP_N);
        if !top.is_empty() {
            theme::section_title(ui, "Viktigast att åtgärda", dark);
            theme::card(dark).show(ui, |ui| {
                ui.set_width(ui.available_width());
                for (dev, f) in &top {
                    let who = dev.map_or("Mellan enheter", |d| fleet.devices[d].name.as_str());
                    let resp = ui
                        .horizontal(|ui| {
                            theme::sev_chip(ui, f.severity, dark);
                            ui.label(RichText::new(who).strong());
                            ui.label(RichText::new(&f.message).color(p.text));
                        })
                        .response
                        .interact(Sense::click())
                        .on_hover_cursor(egui::CursorIcon::PointingHand)
                        .on_hover_text("Visa fyndet");
                    if resp.clicked() {
                        go = Some((*dev, Tab::Findings, Some(FocusFinding { rule: f.rule.clone(), message: f.message.clone() })));
                    }
                    ui.add_space(2.0);
                }
            });
            ui.add_space(18.0);
        }

        // Betygshistorik (151) och staplar per kategori (152)
        ui.columns(2, |cols| {
            theme::section_title(&mut cols[0], "Betyg över tid", dark);
            theme::card(dark).show(&mut cols[0], |ui| {
                ui.set_width(ui.available_width());
                history_chart(ui, &app.sa.history, dark);
            });
            theme::section_title(&mut cols[1], "Fynd per kategori", dark);
            theme::card(dark).show(&mut cols[1], |ui| {
                ui.set_width(ui.available_width());
                category_bars(ui, fleet, dark);
            });
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
                                    ui.label(
                                        RichText::new(format!("{} · {}/{} regler", d.kind, d.passed(), d.results.len()))
                                            .size(12.5)
                                            .color(p.muted),
                                    );
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
                        go = Some((Some(idx), Tab::Findings, None));
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
    if copy {
        app.copy_summary(&ui.ctx().clone());
    }
    if let Some((d, tab, focus)) = go {
        match d {
            Some(d) => {
                app.sa.all_devices = false;
                app.select_device(d);
            }
            // Kontroller mellan enheter hör inte till någon enhet.
            None => app.sa.all_devices = true,
        }
        app.sa.focus = focus;
        app.tab = tab;
    }
}

/// Linjediagram över betyget för hela nätet vid varje inläsning där det ändrats.
fn history_chart(ui: &mut Ui, points: &[Point], dark: bool) {
    let p = palette(dark);
    let shown = &points[points.len().saturating_sub(CHART_POINTS)..];
    let (rect, resp) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 150.0), Sense::hover());
    let painter = ui.painter_at(rect.expand(4.0));
    let plot = Rect::from_min_max(rect.min + Vec2::new(30.0, 8.0), rect.max - Vec2::new(8.0, 20.0));
    let y_of = |score: u32| plot.bottom() - plot.height() * (score.min(100) as f32 / 100.0);
    for g in [0u32, 50, 100] {
        painter
            .line_segment([Pos2::new(plot.left(), y_of(g)), Pos2::new(plot.right(), y_of(g))], Stroke::new(1.0, theme::alpha(p.line, 0.8)));
        painter.text(Pos2::new(plot.left() - 6.0, y_of(g)), Align2::RIGHT_CENTER, g.to_string(), FontId::proportional(11.0), p.muted);
    }
    if shown.is_empty() {
        painter.text(plot.center(), Align2::CENTER_CENTER, "Historiken fylls på när betyget ändras", FontId::proportional(13.0), p.muted);
        return;
    }
    let x_of = |i: usize| if shown.len() == 1 { plot.center().x } else { plot.left() + plot.width() * i as f32 / (shown.len() - 1) as f32 };
    let pts: Vec<Pos2> = shown.iter().enumerate().map(|(i, pt)| Pos2::new(x_of(i), y_of(pt.betyg))).collect();
    if pts.len() > 1 {
        painter.add(egui::Shape::line(pts.clone(), Stroke::new(2.0, p.accent)));
    }
    for (pt, pos) in shown.iter().zip(&pts) {
        painter.circle_filled(*pos, 4.0, theme::score_color(pt.betyg, dark));
        painter.circle_stroke(*pos, 4.0, Stroke::new(1.0, p.card));
    }
    painter.text(
        Pos2::new(plot.left(), rect.bottom()),
        Align2::LEFT_BOTTOM,
        history::format_time(shown[0].tid).split(' ').next().unwrap_or(""),
        FontId::proportional(11.0),
        p.muted,
    );
    if shown.len() > 1 {
        painter.text(
            Pos2::new(plot.right(), rect.bottom()),
            Align2::RIGHT_BOTTOM,
            history::format_time(shown[shown.len() - 1].tid).split(' ').next().unwrap_or(""),
            FontId::proportional(11.0),
            p.muted,
        );
    }
    let nearest = resp.hover_pos().and_then(|hover| {
        pts.iter().enumerate().min_by(|a, b| (a.1.x - hover.x).abs().total_cmp(&(b.1.x - hover.x).abs())).map(|(i, _)| i)
    });
    if let Some(i) = nearest {
        painter.circle_stroke(pts[i], 7.0, Stroke::new(1.5, p.text));
        let pt = &shown[i];
        resp.on_hover_ui_at_pointer(|ui| {
            ui.label(format!("Betyg {} ({})", pt.betyg, vlantool::finding::grade(pt.betyg)));
            ui.label(RichText::new(format!("{} UTC", history::format_time(pt.tid))).color(p.muted));
        });
    }
}

/// En stapel per kategori, uppdelad på nivå.
fn category_bars(ui: &mut Ui, fleet: &FleetReport, dark: bool) {
    let p = palette(dark);
    let cats = category_counts(fleet);
    let max = cats.iter().map(|(_, c)| c.iter().sum::<usize>()).max().unwrap_or(0).max(1);
    let label_w = 112.0;
    for (name, counts) in &cats {
        let total: usize = counts.iter().sum();
        let (rect, resp) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 18.0), Sense::hover());
        let painter = ui.painter_at(rect);
        painter.text(rect.left_center(), Align2::LEFT_CENTER, name, FontId::proportional(12.5), if total == 0 { p.muted } else { p.text });
        let bar = Rect::from_min_max(rect.min + Vec2::new(label_w, 3.0), rect.max - Vec2::new(30.0, 3.0));
        painter.rect_filled(bar, CornerRadius::same(4), theme::alpha(p.line, 0.5));
        let mut x = bar.left();
        for s in Severity::ALL {
            let n = counts[s as usize];
            if n > 0 {
                let w = bar.width() * n as f32 / max as f32;
                painter.rect_filled(
                    Rect::from_min_size(Pos2::new(x, bar.top()), Vec2::new(w, bar.height())),
                    CornerRadius::ZERO,
                    theme::sev_color(s, dark),
                );
                x += w;
            }
        }
        painter.text(
            rect.right_center(),
            Align2::RIGHT_CENTER,
            total.to_string(),
            FontId::proportional(12.0),
            if total == 0 { p.good } else { p.text },
        );
        if total > 0 {
            let detail: Vec<String> = Severity::ALL
                .iter()
                .filter(|s| counts[**s as usize] > 0)
                .map(|s| format!("{} {}", s.label(), counts[*s as usize]))
                .collect();
            resp.on_hover_text(detail.join(" · "));
        }
    }
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

    #[test]
    fn top_findings_are_sorted_and_limited() {
        let f = fleet();
        let top = top_findings(&f, 5);
        assert_eq!(top.len(), 5);
        assert!(top.windows(2).all(|w| w[0].1.severity >= w[1].1.severity));
        assert_eq!(top[0].1.severity, f.all_findings().map(|x| x.severity).max().unwrap());
        assert_eq!(top_findings(&f, 1).len(), 1);
    }

    #[test]
    fn category_counts_add_up() {
        let f = fleet();
        let cats = category_counts(&f);
        let sum: usize = cats.iter().map(|(_, c)| c.iter().sum::<usize>()).sum();
        assert_eq!(sum, f.all_findings().count());
        assert!(cats.windows(2).all(|w| w[0].1.iter().sum::<usize>() >= w[1].1.iter().sum::<usize>()), "flest fynd överst");
        assert!(cats.iter().any(|(c, _)| c == "Åtkomst"));
    }

    #[test]
    fn summary_is_markdown_with_every_device() {
        let f = fleet();
        let md = summary_markdown("Nordvik", &f);
        assert!(md.starts_with("# Granskning av Nordvik"));
        assert!(md.contains("| SW-A |") && md.contains("| SW-B |"));
        assert!(md.contains("## Viktigast att åtgärda"));
        assert!(md.contains("1. **"));
    }
}
