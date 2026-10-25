//! Fliken Konfig.

#![allow(unused_imports)]

use super::*;

/// Radnummer (1-baserade) för rader som innehåller sökningen, utan hänsyn till versaler.
pub(crate) fn search_lines(lines: &[vlantool::parser::Line], needle: &str) -> Vec<usize> {
    let needle = needle.trim().to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }
    lines.iter().filter(|l| l.text.to_lowercase().contains(&needle)).map(|l| l.no).collect()
}

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
    let matches = search_lines(&d.config.lines, &app.sa.cfg_search);
    app.sa.cfg_match = app.sa.cfg_match.min(matches.len().saturating_sub(1));
    let font = app.prefs.cfg_font;
    let mut step: i32 = 0;
    let mut font_delta = 0.0;

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
            ui.add_space(8.0);
            if ui.small_button("A+").on_hover_text("Större text (Ctrl+=)").clicked() {
                font_delta = 1.0;
            }
            ui.label(RichText::new(format!("{font:.0}")).color(p.muted));
            if ui.small_button("A−").on_hover_text("Mindre text (Ctrl+−)").clicked() {
                font_delta = -1.0;
            }
        });
    });
    ui.add_space(8.0);
    // Sökfält med träffräknare och föregående/nästa (140).
    ui.horizontal(|ui| {
        let edit = egui::TextEdit::singleline(&mut app.sa.cfg_search).id(egui::Id::unique("cfg_search")).hint_text("Sök i konfigen (Ctrl+F) …").desired_width(260.0);
        let resp = ui.add(edit);
        if resp.changed() {
            app.sa.cfg_match = 0;
            if let Some(first) = search_lines(&d.config.lines, &app.sa.cfg_search).first() {
                app.sa.cfg_scroll = Some(*first);
            }
        }
        if resp.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
            step = if ui.input(|i| i.modifiers.shift) { -1 } else { 1 };
            resp.request_focus();
        }
        if ui.add_enabled(!matches.is_empty(), egui::Button::new("▲")).on_hover_text("Föregående träff (Skift+Enter)").clicked() {
            step = -1;
        }
        if ui.add_enabled(!matches.is_empty(), egui::Button::new("▼")).on_hover_text("Nästa träff (Enter)").clicked() {
            step = 1;
        }
        if app.sa.cfg_search.trim().is_empty() {
            // ingen räknare
        } else if matches.is_empty() {
            ui.label(RichText::new("inga träffar").color(p.muted));
        } else {
            ui.label(RichText::new(format!("{} / {}", app.sa.cfg_match + 1, matches.len())).color(p.muted));
        }
        if !app.sa.cfg_search.is_empty() && ui.small_button("✖").on_hover_text("Rensa sökningen").clicked() {
            app.sa.cfg_search.clear();
        }
    });
    if step != 0 && !matches.is_empty() {
        let n = matches.len();
        app.sa.cfg_match = if step > 0 { (app.sa.cfg_match + 1) % n } else { (app.sa.cfg_match + n - 1) % n };
        app.sa.cfg_scroll = Some(matches[app.sa.cfg_match]);
    }
    ui.add_space(8.0);

    let row_h = (font + 6.0).round();
    let current_match = matches.get(app.sa.cfg_match).copied();
    let jump = app.jump_to_line.take();
    let scroll_to = app.sa.cfg_scroll.take().or(jump);
    let match_color = Color32::from_rgb(240, 200, 80);
    let total_lines = d.config.lines.len();
    egui::Frame::new().fill(p.code_bg).stroke(Stroke::new(1.0, p.line)).corner_radius(CornerRadius::same(12)).inner_margin(Margin::same(10)).show(ui, |ui| {
        // Smal remsa till höger med en markering per fynd och sökträff (142); klick hoppar dit.
        let full = ui.available_rect_before_wrap();
        let strip = Rect::from_min_max(Pos2::new(full.right() - 10.0, full.top()), full.right_bottom());
        let main = Rect::from_min_max(full.min, Pos2::new(full.right() - 16.0, full.bottom()));
        let mut area = egui::ScrollArea::vertical().auto_shrink([false, false]).id_salt(("cfg", app.device));
        if let Some(line) = scroll_to {
            area = area.vertical_scroll_offset((line as f32 - 6.0).max(0.0) * row_h);
        }
        ui.scope_builder(egui::UiBuilder::new().max_rect(main), |ui| {
            ui.spacing_mut().item_spacing.y = 0.0;
            area.show_rows(ui, row_h, total_lines, |ui, range| {
                for l in &d.config.lines[range] {
                    // Exakt radhöjd så att rullningen (som räknar med row_h) stämmer.
                    ui.allocate_ui_with_layout(Vec2::new(ui.available_width(), row_h), Layout::left_to_right(Align::Center), |ui| {
                        ui.set_height(row_h);
                        let (rect, _) = ui.allocate_exact_size(Vec2::new(18.0, row_h), Sense::hover());
                        if let Some((s, msg)) = marks.get(&l.no) {
                            ui.painter().text(rect.center(), Align2::CENTER_CENTER, s.icon(), FontId::proportional(font), theme::sev_color(*s, dark));
                            ui.interact(rect, ui.scope_id().with(l.no), Sense::hover()).on_hover_text(msg);
                        }
                        let mut job = LayoutJob::default();
                        let hit = jump == Some(l.no);
                        job.append(&format!("{:>4}  ", l.no), 0.0, fmt_sized(if hit { p.accent } else { theme::alpha(p.muted, 0.7) }, true, font));
                        highlight_sized(&mut job, &l.text, &p, dark, font);
                        let resp = ui.label(job);
                        let band = Rect::from_min_max(Pos2::new(rect.left(), resp.rect.top()), Pos2::new(ui.max_rect().right(), resp.rect.bottom()));
                        if hit || marks.contains_key(&l.no) {
                            let c = marks.get(&l.no).map_or(p.accent, |(s, _)| theme::sev_color(*s, dark));
                            ui.painter().rect_filled(band, 0.0, theme::alpha(c, 0.08));
                        }
                        if matches.binary_search(&l.no).is_ok() {
                            ui.painter().rect_filled(band, 0.0, theme::alpha(match_color, if current_match == Some(l.no) { 0.4 } else { 0.18 }));
                        }
                    });
                }
            });
        });
        let strip_resp = ui.interact(strip, ui.scope_id().with("cfg-strip"), Sense::click_and_drag());
        let painter = ui.painter_at(strip.expand2(Vec2::new(2.0, 0.0)));
        painter.rect_filled(strip, CornerRadius::same(3), theme::alpha(p.line, 0.35));
        let y_of = |line: usize| strip.top() + strip.height() * (line.saturating_sub(1) as f32 / total_lines.max(1) as f32);
        for (&line, (s, _)) in &marks {
            painter.rect_filled(Rect::from_min_size(Pos2::new(strip.left(), y_of(line)), Vec2::new(strip.width(), 3.0)), CornerRadius::same(1), theme::sev_color(*s, dark));
        }
        for &line in &matches {
            painter.rect_filled(Rect::from_min_size(Pos2::new(strip.left() + 2.0, y_of(line)), Vec2::new(strip.width() - 4.0, 3.0)), CornerRadius::same(1), match_color);
        }
        if (strip_resp.clicked() || strip_resp.dragged())
            && let Some(pos) = strip_resp.interact_pointer_pos()
        {
            let frac = ((pos.y - strip.top()) / strip.height()).clamp(0.0, 1.0);
            app.sa.cfg_scroll = Some(((frac * total_lines as f32) as usize + 1).min(total_lines.max(1)));
        }
        strip_resp.on_hover_text("Markeringar: fynd och sökträffar. Klicka för att hoppa.");
    });
    if font_delta != 0.0 {
        app.cfg_font_by(font_delta);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vlantool::parser::Config;

    #[test]
    fn search_finds_lines_case_insensitively() {
        let c = Config::parse("R", "R.cfg", "hostname R1\ninterface Fa0/1\n description Port mot SW\n shutdown\n");
        assert_eq!(search_lines(&c.lines, "PORT"), vec![3]);
        assert_eq!(search_lines(&c.lines, "SHUT"), vec![4]);
        assert_eq!(search_lines(&c.lines, "host"), vec![1]);
        assert!(search_lines(&c.lines, "").is_empty());
        assert!(search_lines(&c.lines, "finns inte").is_empty());
    }
}
