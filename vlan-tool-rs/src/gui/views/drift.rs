//! Fliken Drift.

#![allow(unused_imports)]

use super::*;

pub(crate) fn drift(app: &mut App, ui: &mut Ui) {
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
