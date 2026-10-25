//! Fliken Konfig.

#![allow(unused_imports)]

use super::*;

pub(crate) fn config(app: &mut App, ui: &mut Ui) {
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
