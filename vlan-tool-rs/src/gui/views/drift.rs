//! Fliken Drift: skillnaden mellan sparade konfigar och CSV, rad för rad eller sida vid sida.

#![allow(unused_imports)]

use super::*;
use vlantool::generator;

#[derive(Default)]
pub(crate) struct DriftState {
    side_by_side: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Side {
    Same,
    Changed,
    /// Hunk-rubrik ("@@ … @@").
    Hunk,
}

/// En rad i sida-vid-sida-läget: vänster = sparad, höger = från CSV.
pub(crate) type SideRow = (Option<String>, Option<String>, Side);

/// Gör om diffens rader ("- x", "+ x", "  x", "@@ …") till par där borttagna och tillagda rader
/// i samma block står mitt emot varandra.
pub(crate) fn side_rows(lines: &[String]) -> Vec<SideRow> {
    let mut out: Vec<SideRow> = Vec::new();
    let (mut left, mut right): (Vec<String>, Vec<String>) = (Vec::new(), Vec::new());
    fn flush(out: &mut Vec<SideRow>, left: &mut Vec<String>, right: &mut Vec<String>) {
        for i in 0..left.len().max(right.len()) {
            out.push((left.get(i).cloned(), right.get(i).cloned(), Side::Changed));
        }
        left.clear();
        right.clear();
    }
    for l in lines {
        if let Some(t) = l.strip_prefix("- ") {
            left.push(t.to_string());
        } else if let Some(t) = l.strip_prefix("+ ") {
            right.push(t.to_string());
        } else {
            flush(&mut out, &mut left, &mut right);
            if l.starts_with("@@") {
                out.push((Some(l.clone()), Some(l.clone()), Side::Hunk));
            } else {
                let t = l.strip_prefix("  ").unwrap_or(l).to_string();
                out.push((Some(t.clone()), Some(t), Side::Same));
            }
        }
    }
    flush(&mut out, &mut left, &mut right);
    out
}

/// Skriver bara den här enhetens konfig från CSV och läser om projektet.
pub(crate) fn overwrite_one(app: &mut App, hostname: &str) {
    let Some(project) = app.project.clone() else { return };
    let Some(inv) = &app.inventory else {
        app.error("Hittade inga CSV-filer i samples/");
        return;
    };
    if let Some(f) = app.csv_findings.iter().find(|f| f.severity >= Severity::Critical) {
        let msg = format!("CSV-filerna har kritiska fel: {}", f.message);
        app.error(msg);
        return;
    }
    let result = generator::generate_all(inv, &app.settings).and_then(|configs| {
        let g = configs.iter().find(|g| g.hostname == hostname).ok_or_else(|| anyhow::anyhow!("{hostname} finns inte i CSV-filerna"))?;
        std::fs::create_dir_all(project.configs())?;
        std::fs::write(project.configs().join(format!("{}.cfg", g.hostname)), format!("{}\n", g.text))?;
        Ok(())
    });
    match result {
        Ok(()) => {
            app.reload();
            app.toast(format!("✔ Skrev över {hostname}"));
        }
        Err(e) => app.error(format!("Kunde inte skriva över {hostname}: {e:#}")),
    }
}

pub(crate) fn drift(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    heading(ui, "Drift", "Skiljer sig de sparade konfigarna från vad CSV-filerna säger att de ska vara?", &p);
    if app.drift.is_empty() {
        ui.label(RichText::new("Inga CSV-filer att jämföra med.").color(p.muted));
        return;
    }
    let mut regenerate = false;
    let mut only: Option<String> = None;
    let mut side = app.sb.drift.side_by_side;
    ui.horizontal(|ui| {
        ui.selectable_value(&mut side, false, "Rad för rad");
        ui.selectable_value(&mut side, true, "Sida vid sida");
    });
    ui.add_space(8.0);
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        for e in &app.drift {
            theme::card(dark).show(ui, |ui| {
                ui.set_width(ui.available_width());
                let changed = !e.saved || e.added + e.removed > 0;
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
                    if changed {
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if ui.button("Skriv över bara denna").on_hover_text("Bygger om den här enhetens konfig från CSV och lämnar de andra").clicked() {
                                only = Some(e.hostname.clone());
                            }
                        });
                    }
                });
                if e.lines.is_empty() {
                    return;
                }
                ui.add_space(6.0);
                egui::Frame::new().fill(p.code_bg).corner_radius(CornerRadius::same(8)).inner_margin(Margin::same(10)).show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    if side {
                        side_by_side(ui, e, dark);
                    } else {
                        unified(ui, e, dark);
                    }
                });
            });
            ui.add_space(10.0);
        }
        if app.drift.iter().any(|e| !e.saved || e.added + e.removed > 0) && theme::primary_button(ui, "⚡ Skriv över alla med konfigar från CSV", dark).clicked() {
            regenerate = true;
        }
    });
    app.sb.drift.side_by_side = side;
    if let Some(host) = only {
        overwrite_one(app, &host);
    } else if regenerate {
        app.generate();
    }
}

fn unified(ui: &mut Ui, e: &crate::app::DriftEntry, dark: bool) {
    let p = palette(dark);
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
}

fn side_by_side(ui: &mut Ui, e: &crate::app::DriftEntry, dark: bool) {
    let p = palette(dark);
    let bad = theme::sev_color(Severity::Critical, dark);
    let col_w = ((ui.available_width() - 12.0) / 2.0).max(100.0);
    let font = FontId::monospace(13.0);
    let row_h = 18.0;
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 12.0;
        ui.add_sized([col_w, 18.0], egui::Label::new(RichText::new("Sparad konfig").strong().color(bad)));
        ui.add_sized([col_w, 18.0], egui::Label::new(RichText::new("Från CSV").strong().color(p.good)));
    });
    ui.spacing_mut().item_spacing.y = 0.0;
    for (l, r, kind) in side_rows(&e.lines).into_iter().take(400) {
        ui.horizontal(|ui| {
            ui.spacing_mut().item_spacing.x = 12.0;
            for (text, color) in [(l, bad), (r, p.good)] {
                let (rect, _) = ui.allocate_exact_size(Vec2::new(col_w, row_h), Sense::hover());
                let painter = ui.painter_at(rect);
                let (fg, bg) = match (kind, &text) {
                    (Side::Hunk, _) => (p.accent, None),
                    (Side::Same, _) => (p.muted, None),
                    (Side::Changed, Some(_)) => (color, Some(theme::alpha(color, 0.10))),
                    (Side::Changed, None) => (p.muted, Some(theme::alpha(p.muted, 0.06))),
                };
                if let Some(bg) = bg {
                    painter.rect_filled(rect, CornerRadius::same(3), bg);
                }
                if let Some(t) = text {
                    painter.text(rect.left_center() + Vec2::new(4.0, 0.0), Align2::LEFT_CENTER, t, font.clone(), fg);
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn pairs_removed_and_added_lines() {
        let rows = side_rows(&lines(&["@@ -1,3 +1,3 @@", "  hostname SW", "- ip a", "- ip b", "+ ip c", "  end"]));
        assert_eq!(rows.len(), 5);
        assert_eq!(rows[0].2, Side::Hunk);
        assert_eq!(rows[1], (Some("hostname SW".into()), Some("hostname SW".into()), Side::Same));
        assert_eq!(rows[2], (Some("ip a".into()), Some("ip c".into()), Side::Changed));
        assert_eq!(rows[3], (Some("ip b".into()), None, Side::Changed));
        assert_eq!(rows[4].2, Side::Same);
        let only_added = side_rows(&lines(&["+ x"]));
        assert_eq!(only_added, vec![(None, Some("x".into()), Side::Changed)]);
    }

    #[test]
    fn overwrite_only_one_device() {
        let dir = std::env::temp_dir().join(format!("vlantool-drift-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut app = App::empty(crate::app::Prefs::default());
        app.create_example(&dir);
        for host in ["SW-Nordvik-1", "SW-Nordvik-2"] {
            let cfg = dir.join(format!("configs/{host}.cfg"));
            let text = std::fs::read_to_string(&cfg).unwrap().replace(" transport input ssh", " transport input ssh telnet");
            std::fs::write(&cfg, text).unwrap();
        }
        app.reload();
        assert!(app.drift.iter().filter(|d| d.added + d.removed > 0).count() >= 2);
        overwrite_one(&mut app, "SW-Nordvik-1");
        let drifted: Vec<_> = app.drift.iter().filter(|d| d.added + d.removed > 0).map(|d| d.hostname.as_str()).collect();
        assert_eq!(drifted, ["SW-Nordvik-2"], "bara SW-Nordvik-1 ska vara i fas igen");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
