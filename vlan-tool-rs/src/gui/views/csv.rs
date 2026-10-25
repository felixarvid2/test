//! Fliken CSV-data: kontroll av filerna och redigering av ports.csv, dhcp.csv och devices.csv.

#![allow(unused_imports)]

use super::csv_edit::{self, CsvTable, TableKind};
use super::*;
use std::path::PathBuf;
use std::time::SystemTime;

#[derive(Default)]
pub(crate) struct CsvState {
    tables: Vec<CsvTable>,
    stamp: Vec<(PathBuf, Option<SystemTime>)>,
    root: Option<PathBuf>,
    /// Vald tabell (index i `tables`).
    current: usize,
    /// Markerad rad (tabell, rad) efter klick på ett valideringsfel.
    mark: Option<(usize, usize)>,
    scroll_to: Option<usize>,
}

/// Läser om tabellerna när projektet byts eller filerna ändrats på disk och inget är osparat.
fn sync(app: &mut App) {
    let Some(samples) = app.project.as_ref().map(|p| p.samples()) else { return };
    let st = &mut app.sb.csv;
    let root = Some(samples.clone());
    let stamp = csv_edit::stamp(&samples);
    let same_project = st.root == root;
    if same_project && stamp == st.stamp {
        return;
    }
    if same_project && st.tables.iter().any(CsvTable::dirty) {
        return; // osparade ändringar vinner tills de sparas eller ångras
    }
    st.tables = csv_edit::load_all(&samples);
    st.stamp = stamp;
    st.root = root;
    st.current = st.current.min(st.tables.len().saturating_sub(1));
    if !same_project {
        st.mark = None;
        st.scroll_to = None;
    }
}

fn col_width(t: &CsvTable, c: usize) -> f32 {
    let longest = t.rows.iter().filter_map(|r| r.get(c)).map(|s| s.chars().count()).chain([t.headers[c].chars().count()]).max().unwrap_or(4);
    (longest as f32 * 7.6 + 22.0).clamp(64.0, 260.0)
}

pub(crate) fn csv(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let samples = app.project.as_ref().map(|p| p.samples());
    sync(app);
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

    // --- Kontroll: klick på ett fel markerar raden i tabellen -----------------------
    let mut jump: Option<(usize, usize)> = None;
    theme::card(dark).show(ui, |ui| {
        ui.set_width(ui.available_width());
        theme::section_title(ui, "Kontroll", dark);
        if app.csv_findings.is_empty() {
            ui.label(RichText::new("✔ CSV-filerna ser bra ut").color(p.good));
        }
        egui::ScrollArea::vertical().id_salt("csv-findings").max_height(130.0).auto_shrink([false, true]).show(ui, |ui| {
            for f in &app.csv_findings {
                let target = csv_edit::parse_source(&f.message).and_then(|(file, line)| {
                    let ti = app.sb.csv.tables.iter().position(|t| t.file_name() == file)?;
                    let row = line - 2;
                    (row < app.sb.csv.tables[ti].rows.len()).then_some((ti, row))
                });
                ui.horizontal_wrapped(|ui| {
                    theme::sev_chip(ui, f.severity, dark);
                    if target.is_some() {
                        let resp = ui.add(egui::Label::new(RichText::new(&f.message).color(p.text)).sense(Sense::click())).on_hover_text("Klicka för att markera raden i tabellen").on_hover_cursor(egui::CursorIcon::PointingHand);
                        if resp.clicked() {
                            jump = target;
                        }
                    } else {
                        ui.label(&f.message);
                    }
                });
            }
        });
    });
    if let Some((ti, row)) = jump {
        let st = &mut app.sb.csv;
        st.current = ti;
        st.mark = Some((ti, row));
        st.scroll_to = Some(row);
    }
    ui.add_space(12.0);
    editor(app, ui);
}

/// Tabellväljare, verktygsrad och själva redigeringstabellen.
fn editor(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let st = &mut app.sb.csv;
    if st.tables.is_empty() {
        ui.label(RichText::new("Inga redigerbara CSV-filer hittades.").color(p.muted));
        return;
    }
    let mut save = false;
    let mut revert = false;
    let mut add_row = false;
    let mut delete: Option<usize> = None;
    ui.horizontal(|ui| {
        for (i, t) in st.tables.iter().enumerate() {
            let dirty = if t.dirty() { " ●" } else { "" };
            let label = format!("{} ({}){dirty}", t.kind.label(), t.file_name());
            if ui.selectable_label(st.current == i, label).clicked() {
                st.current = i;
            }
        }
    });
    ui.add_space(4.0);
    let cur = st.current.min(st.tables.len() - 1);
    let any_dirty = st.tables.iter().any(CsvTable::dirty);
    ui.horizontal(|ui| {
        if ui.button("+ Lägg till rad").clicked() {
            add_row = true;
        }
        if ui.add_enabled(any_dirty, egui::Button::new(RichText::new("Spara").strong())).on_hover_text("Skriver ändrade tabeller till samples/ och läser om projektet").clicked() {
            save = true;
        }
        if ui.add_enabled(any_dirty, egui::Button::new("Ångra ändringar")).clicked() {
            revert = true;
        }
        if any_dirty {
            ui.label(RichText::new("● osparade ändringar").color(theme::sev_color(Severity::Medium, dark)));
        } else {
            ui.label(RichText::new("Redigera direkt i tabellen. Rubrikerna i filen ändras aldrig.").size(12.0).color(p.muted));
        }
    });
    ui.add_space(6.0);
    if add_row {
        let t = &mut st.tables[cur];
        let row = t.blank_row();
        t.rows.push(row);
        st.mark = Some((cur, st.tables[cur].rows.len() - 1));
        st.scroll_to = st.mark.map(|(_, r)| r);
    }

    let mark = st.mark.filter(|(t, _)| *t == cur).map(|(_, r)| r);
    let scroll_to = st.scroll_to.take();
    let t = &mut st.tables[cur];
    let n_cols = t.headers.len();
    let widths: Vec<f32> = (0..n_cols).map(|c| col_width(t, c)).collect();
    let desc_col = t.col("Beskrivning");
    let lage_col = t.col("Lage");
    let status_col = t.col("Status");
    let is_ports = t.kind == TableKind::Ports;
    theme::card(dark).inner_margin(Margin::same(8)).show(ui, |ui| {
        ui.set_width(ui.available_width());
        let mut tb = TableBuilder::new(ui)
            .striped(true)
            .resizable(true)
            .cell_layout(Layout::left_to_right(Align::Center))
            .max_scroll_height(f32::INFINITY)
            .min_scrolled_height(120.0)
            .column(Column::exact(34.0));
        for (c, w) in widths.iter().enumerate() {
            tb = tb.column(if Some(c) == desc_col { Column::remainder().at_least(*w).clip(true) } else { Column::initial(*w).at_least(48.0).clip(true) });
        }
        if let Some(r) = scroll_to {
            tb = tb.scroll_to_row(r, Some(Align::Center));
        }
        tb.header(26.0, |mut h| {
            h.col(|_| {});
            for name in &t.headers {
                h.col(|ui| {
                    ui.label(RichText::new(name).size(12.0).strong().color(p.muted));
                });
            }
        })
        .body(|mut body| {
            let n_rows = t.rows.len();
            for ri in 0..n_rows {
                body.row(28.0, |mut row| {
                    row.set_selected(mark == Some(ri));
                    row.col(|ui| {
                        if ui.add(egui::Button::new(RichText::new("✖").color(p.muted)).frame(false)).on_hover_text("Ta bort raden").clicked() {
                            delete = Some(ri);
                        }
                    });
                    for c in 0..n_cols {
                        row.col(|ui| {
                            let cell = &mut t.rows[ri][c];
                            if is_ports && Some(c) == lage_col {
                                let cur = if cell.eq_ignore_ascii_case("trunk") { "trunk" } else { "access" };
                                egui::ComboBox::from_id_salt(("lage", ri)).selected_text(if cell.is_empty() { cur } else { cell.as_str() }).width(ui.available_width() - 8.0).show_ui(ui, |ui| {
                                    for o in ["access", "trunk"] {
                                        if ui.selectable_label(cell.eq_ignore_ascii_case(o), o).clicked() {
                                            *cell = o.to_string();
                                        }
                                    }
                                });
                            } else if is_ports && Some(c) == status_col {
                                let up = !cell.eq_ignore_ascii_case("down");
                                egui::ComboBox::from_id_salt(("status", ri)).selected_text(if up { "Up" } else { "Down" }).width(ui.available_width() - 8.0).show_ui(ui, |ui| {
                                    for o in ["Up", "Down"] {
                                        if ui.selectable_label(cell.eq_ignore_ascii_case(o), o).clicked() {
                                            *cell = o.to_string();
                                        }
                                    }
                                });
                            } else {
                                ui.add(egui::TextEdit::singleline(cell).desired_width(f32::INFINITY).frame(egui::Frame::NONE).font(egui::TextStyle::Monospace));
                            }
                        });
                    }
                });
            }
        });
    });
    if let Some(ri) = delete {
        st.tables[cur].rows.remove(ri);
        st.mark = None;
    }
    if revert {
        for t in &mut st.tables {
            t.revert();
        }
        st.mark = None;
    }
    if save {
        let mut written = Vec::new();
        let mut failed = None;
        for t in st.tables.iter_mut().filter(|t| t.dirty()) {
            match t.save() {
                Ok(()) => written.push(t.file_name()),
                Err(e) => {
                    failed = Some(format!("{e:#}"));
                    break;
                }
            }
        }
        match failed {
            Some(e) => app.error(format!("Kunde inte spara: {e}")),
            None => {
                app.toast(format!("✔ Sparade {}", written.join(", ")));
                app.reload();
            }
        }
    }
}
