//! Kommandopaletten (Ctrl+K, punkt 136) och hjälpfönstret med kortkommandon (F1, punkt 182).

use crate::app::{App, Tab};
use crate::theme::{self, palette as colors};
use eframe::egui::{self, Align, Key, Layout, Margin, Modifiers, RichText, Stroke, Vec2};
use std::path::PathBuf;
use vlantool::report::Format;

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Tab(Tab),
    Device(usize),
    OpenRecent(PathBuf),
    Generate,
    Reload,
    OpenFolder,
    CloseProject,
    CycleTheme,
    Export(Format),
    FixScripts,
    CopySummary,
    OpenReports,
    ZoomIn,
    ZoomOut,
    ZoomReset,
    Help,
}

pub struct Cmd {
    pub label: String,
    pub hint: String,
    pub action: Action,
}

fn cmd(label: impl Into<String>, hint: impl Into<String>, action: Action) -> Cmd {
    Cmd { label: label.into(), hint: hint.into(), action }
}

/// Alla kommandon som passar läget just nu.
pub fn commands(app: &App) -> Vec<Cmd> {
    let mut v = Vec::new();
    if app.project.is_some() {
        for (n, t) in Tab::ALL.iter().enumerate() {
            let hint = if n < 9 { format!("Ctrl+{}", n + 1) } else { String::new() };
            v.push(cmd(format!("Gå till {}", t.label()), hint, Action::Tab(*t)));
        }
        for (i, d) in app.fleet.devices.iter().enumerate() {
            v.push(cmd(format!("Enhet {}", d.name), format!("{} · betyg {}", d.kind, d.score), Action::Device(i)));
        }
        v.push(cmd("Generera från CSV", "Ctrl+G", Action::Generate));
        v.push(cmd("Läs om projektet", "F5", Action::Reload));
        v.push(cmd("Kopiera sammanfattning (Markdown)", "", Action::CopySummary));
        for (label, f) in [
            ("HTML-rapport", Format::Html),
            ("Markdown", Format::Markdown),
            ("JSON", Format::Json),
            ("CSV", Format::Csv),
            ("Text", Format::Text),
        ] {
            v.push(cmd(format!("Exportera {label}"), "", Action::Export(f)));
        }
        v.push(cmd("Exportera rättningsskript per enhet", "", Action::FixScripts));
        v.push(cmd("Öppna rapportmappen", "", Action::OpenReports));
        v.push(cmd("Stäng projektet", "", Action::CloseProject));
    }
    for dir in app.prefs.recent.iter().filter(|d| d.is_dir()) {
        if app.project.as_ref().is_some_and(|p| p.root == *dir) {
            continue;
        }
        v.push(cmd(
            format!("Öppna projekt {}", dir.file_name().map_or_else(|| dir.display().to_string(), |n| n.to_string_lossy().to_string())),
            dir.display().to_string(),
            Action::OpenRecent(dir.clone()),
        ));
    }
    v.push(cmd("Öppna projektmapp …", "Ctrl+O", Action::OpenFolder));
    v.push(cmd("Byt tema (mörkt, ljust, högkontrast)", "Ctrl+T", Action::CycleTheme));
    v.push(cmd("Större text", "Ctrl+=", Action::ZoomIn));
    v.push(cmd("Mindre text", "Ctrl+−", Action::ZoomOut));
    v.push(cmd("Standardstorlek på texten", "Ctrl+0", Action::ZoomReset));
    v.push(cmd("Visa kortkommandon", "F1", Action::Help));
    v
}

/// Träffens rangordning (lägre är bättre) eller `None` om något sökord saknas.
/// Alla ord i sökningen ska finnas i etiketten eller tipset; träff i början av etiketten rankas högst.
pub fn rank(query: &str, label: &str, hint: &str) -> Option<usize> {
    let label = label.to_lowercase();
    let hint = hint.to_lowercase();
    let mut score = 0;
    for word in query.to_lowercase().split_whitespace() {
        if let Some(pos) = label.find(word) {
            let at_word_start = pos == 0 || label[..pos].ends_with(' ');
            score += if at_word_start { pos } else { 40 + pos };
        } else if hint.contains(word) {
            score += 200;
        } else {
            return None;
        }
    }
    Some(score)
}

/// Kommandon som matchar sökningen, bäst först (bibehåller ursprunglig ordning vid lika).
pub fn filter(cmds: Vec<Cmd>, query: &str) -> Vec<Cmd> {
    let mut ranked: Vec<(usize, Cmd)> = cmds.into_iter().filter_map(|c| rank(query, &c.label, &c.hint).map(|r| (r, c))).collect();
    ranked.sort_by_key(|(r, _)| *r);
    ranked.into_iter().map(|(_, c)| c).collect()
}

pub fn run(app: &mut App, ctx: &egui::Context, action: Action) {
    match action {
        Action::Tab(t) => app.tab = t,
        Action::Device(i) => {
            app.sa.all_devices = false;
            app.select_device(i);
            if !app.tab.per_device() {
                app.tab = Tab::Findings;
            }
        }
        Action::OpenRecent(dir) => app.open_project(&dir),
        Action::Generate => app.generate(),
        Action::Reload => {
            app.reload();
            app.toast("Läste om projektet");
        }
        Action::OpenFolder => app.folder = Some(crate::folder::FolderDialog::new(app.project.as_ref().map(|p| p.root.clone()))),
        Action::CloseProject => app.close_project(),
        Action::CycleTheme => app.cycle_theme(),
        Action::Export(f) => app.export(f),
        Action::FixScripts => app.export_fix_scripts(),
        Action::CopySummary => app.copy_summary(ctx),
        Action::OpenReports => {
            if let Some(p) = &app.project {
                let _ = std::fs::create_dir_all(p.reports());
                crate::app::open_path(&p.reports());
            }
        }
        Action::ZoomIn => app.zoom_by(0.1),
        Action::ZoomOut => app.zoom_by(-0.1),
        Action::ZoomReset => app.prefs.zoom = 1.0,
        Action::Help => app.sa.help_open = true,
    }
}

const VISIBLE: usize = 9;

pub fn show(app: &mut App, ctx: &egui::Context) {
    if !app.sa.palette_open {
        return;
    }
    let p = colors(app.dark());
    let dark = app.dark();
    let results = filter(commands(app), &app.sa.palette_query);
    // Piltangenter och Enter konsumeras före textfältet så att markören inte hoppar.
    let (down, up, enter, esc) = ctx.input_mut(|i| {
        (
            i.consume_key(Modifiers::NONE, Key::ArrowDown),
            i.consume_key(Modifiers::NONE, Key::ArrowUp),
            i.consume_key(Modifiers::NONE, Key::Enter),
            i.consume_key(Modifiers::NONE, Key::Escape),
        )
    });
    let n = results.len();
    if n > 0 {
        if down {
            app.sa.palette_sel = (app.sa.palette_sel + 1) % n;
        }
        if up {
            app.sa.palette_sel = (app.sa.palette_sel + n - 1) % n;
        }
    }
    app.sa.palette_sel = app.sa.palette_sel.min(n.saturating_sub(1));
    let sel = app.sa.palette_sel;
    let mut chosen: Option<usize> = None;
    let mut close = esc;
    let first_frame = !ctx.memory(|m| m.has_focus(egui::Id::unique("palette_input")));

    let area = egui::Area::new(egui::Id::unique("palette"))
        .anchor(egui::Align2::CENTER_TOP, Vec2::new(0.0, 80.0))
        .order(egui::Order::Foreground)
        .show(ctx, |ui| {
            theme::card(dark).inner_margin(Margin::same(12)).stroke(Stroke::new(1.5, theme::alpha(p.accent, 0.7))).show(ui, |ui| {
                ui.set_width(560.0);
                let edit = egui::TextEdit::singleline(&mut app.sa.palette_query)
                    .id(egui::Id::unique("palette_input"))
                    .hint_text("Skriv ett kommando, en flik eller ett enhetsnamn …")
                    .desired_width(f32::INFINITY);
                let resp = ui.add(edit);
                if first_frame {
                    resp.request_focus();
                }
                if resp.changed() {
                    app.sa.palette_sel = 0;
                }
                ui.add_space(6.0);
                if results.is_empty() {
                    ui.label(RichText::new("Inga kommandon matchar.").color(p.muted));
                }
                // Visa fönstret av träffar runt det markerade kommandot.
                let start = sel.saturating_sub(VISIBLE - 1).min(n.saturating_sub(VISIBLE));
                for (i, c) in results.iter().enumerate().skip(start).take(VISIBLE) {
                    let selected = i == sel;
                    let (rect, r) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 28.0), egui::Sense::click());
                    if selected || r.hovered() {
                        ui.painter().rect_filled(
                            rect,
                            egui::CornerRadius::same(6),
                            if selected { theme::alpha(p.accent, 0.22) } else { p.raised },
                        );
                    }
                    ui.painter().text(
                        rect.left_center() + Vec2::new(10.0, 0.0),
                        egui::Align2::LEFT_CENTER,
                        &c.label,
                        egui::FontId::proportional(14.5),
                        p.text,
                    );
                    ui.painter().text(
                        rect.right_center() - Vec2::new(10.0, 0.0),
                        egui::Align2::RIGHT_CENTER,
                        &c.hint,
                        egui::FontId::proportional(12.0),
                        p.muted,
                    );
                    if selected && (down || up) {
                        r.scroll_to_me(None);
                    }
                    if r.clicked() {
                        chosen = Some(i);
                    }
                }
                if n > VISIBLE {
                    ui.label(RichText::new(format!("{} till – fortsätt skriva för att smalna av", n - VISIBLE)).size(11.5).color(p.muted));
                }
            });
        });
    if enter && n > 0 {
        chosen = Some(sel);
    }
    if ctx.input(|i| i.pointer.any_pressed()) && ctx.pointer_interact_pos().is_some_and(|pos| !area.response.rect.contains(pos)) {
        close = true;
    }
    if let Some(i) = chosen {
        let action = results.into_iter().nth(i).map(|c| c.action);
        app.sa.palette_open = false;
        if let Some(a) = action {
            run(app, ctx, a);
        }
    } else if close {
        app.sa.palette_open = false;
    }
}

pub const SHORTCUTS: &[(&str, &str)] = &[
    ("Ctrl+K", "Kommandopalett: flikar, enheter och åtgärder"),
    ("F1", "Det här fönstret"),
    ("Ctrl+G", "Generera från CSV"),
    ("F5 / Ctrl+R", "Läs om"),
    ("Ctrl+O", "Öppna projektmapp"),
    ("Ctrl+1 … 9", "Byt flik"),
    ("Ctrl+↑ / ↓", "Byt enhet"),
    ("↑ / ↓", "Fynd: markera föregående eller nästa fynd"),
    ("Ctrl+F", "Sök i fynden eller i konfigen"),
    ("Enter / Skift+Enter", "Konfig: nästa eller föregående sökträff"),
    ("Ctrl+= / Ctrl+−", "Större eller mindre text (i Konfig bara konfigtexten)"),
    ("Ctrl+0", "Standardstorlek på texten"),
    ("Ctrl+T", "Byt tema: mörkt, ljust, högkontrast"),
    ("Esc", "Stäng paletten eller ett fönster"),
];

pub fn show_help(app: &mut App, ctx: &egui::Context) {
    if !app.sa.help_open {
        return;
    }
    let p = colors(app.dark());
    let mut open = true;
    let mut about = false;
    egui::Window::new("Kortkommandon")
        .open(&mut open)
        .collapsible(false)
        .resizable(false)
        .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
        .show(ctx, |ui| {
            ui.set_width(520.0);
            egui::Grid::new("help-keys").num_columns(2).spacing([20.0, 6.0]).show(ui, |ui| {
                for (k, v) in SHORTCUTS {
                    ui.label(RichText::new(*k).monospace().color(p.accent));
                    ui.label(*v);
                    ui.end_row();
                }
            });
            ui.add_space(8.0);
            ui.label(RichText::new("Dra och släpp .cfg-filer på fönstret för att lägga dem i configs/.").color(p.muted));
            ui.add_space(6.0);
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if ui.button("Om vlantool").clicked() {
                    about = true;
                }
            });
        });
    if about {
        open = false;
        app.show_about = true;
    }
    if ctx.input(|i| i.key_pressed(Key::Escape)) && !app.sa.palette_open {
        open = false;
    }
    app.sa.help_open = open;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(q: &str) -> Vec<String> {
        let cmds = vec![
            cmd("Gå till Översikt", "Ctrl+1", Action::Tab(Tab::Overview)),
            cmd("Gå till Fynd", "Ctrl+2", Action::Tab(Tab::Findings)),
            cmd("Enhet SW-Nordvik-1", "Switch · betyg 90", Action::Device(0)),
            cmd("Generera från CSV", "Ctrl+G", Action::Generate),
        ];
        filter(cmds, q).into_iter().map(|c| c.label).collect()
    }

    #[test]
    fn empty_query_keeps_everything_in_order() {
        assert_eq!(labels("").len(), 4);
        assert_eq!(labels("")[0], "Gå till Översikt");
    }

    #[test]
    fn every_word_must_match_and_prefix_wins() {
        assert_eq!(labels("fynd"), vec!["Gå till Fynd"]);
        assert_eq!(labels("gen csv"), vec!["Generera från CSV"]);
        assert_eq!(labels("nordvik 1"), vec!["Enhet SW-Nordvik-1"]);
        assert_eq!(labels("g"), vec!["Gå till Översikt", "Gå till Fynd", "Generera från CSV", "Enhet SW-Nordvik-1"]);
        assert!(labels("zzz").is_empty());
        // tipset (kortkommandot) räknas också, men lägre än etiketten
        assert_eq!(labels("ctrl+g"), vec!["Generera från CSV"]);
    }
}
