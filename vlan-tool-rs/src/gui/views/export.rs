//! Exportdialogen: kryssrutor för format, rättningsskript och topologi, och "öppna mappen efteråt".

use super::topo;
use crate::app::{open_path, App};
use crate::theme::{self, palette};
use eframe::egui::{self, Align2, RichText, Vec2};
use std::path::PathBuf;
use vlantool::audit::FleetReport;
use vlantool::finding::Severity;
use vlantool::project::Project;
use vlantool::report::{self, Format, Options};

/// Vad som ska skrivas.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Selection {
    pub html: bool,
    pub markdown: bool,
    pub json: bool,
    pub csv: bool,
    pub text: bool,
    pub fix_scripts: bool,
    pub svg: bool,
}

impl Selection {
    fn any(&self) -> bool {
        self.html || self.markdown || self.json || self.csv || self.text || self.fix_scripts || self.svg
    }
}

pub(crate) struct ExportState {
    open: bool,
    sel: Selection,
    open_folder: bool,
}

impl Default for ExportState {
    fn default() -> Self {
        ExportState {
            open: false,
            sel: Selection { html: true, markdown: false, json: false, csv: false, text: false, fix_scripts: false, svg: false },
            open_folder: true,
        }
    }
}

/// Öppnar dialogen (anropas från rubrikens Exportera-knapp).
pub(crate) fn open(app: &mut App) {
    app.sb.export.open = true;
}

/// Rättningsskriptet för en enhet, färdigt att klistra in i CLI:t. `None` om det inte finns några rättningar.
pub(crate) fn fix_script(name: &str, fix_lines: &[&String]) -> Option<String> {
    if fix_lines.is_empty() {
        return None;
    }
    let mut script = format!("! Rättningsskript för {name} – granska innan du klistrar in!\nconfigure terminal\n");
    for l in fix_lines {
        script.push_str(l);
        script.push('\n');
    }
    script.push_str("end\nwrite memory\n");
    Some(script)
}

/// Skriver rapporterna och rättningsskripten (inte SVG, som kräver grafen) till `reports/`.
pub(crate) fn write_reports(project: &Project, fleet: &FleetReport, sel: &Selection) -> std::io::Result<Vec<PathBuf>> {
    let dir = project.reports();
    std::fs::create_dir_all(&dir)?;
    let mut written = Vec::new();
    let opt = Options { color: false, verbose: true, fixes: true, min: Severity::Info };
    for (on, format, ext) in [
        (sel.html, Format::Html, "html"),
        (sel.markdown, Format::Markdown, "md"),
        (sel.json, Format::Json, "json"),
        (sel.csv, Format::Csv, "csv"),
        (sel.text, Format::Text, "txt"),
    ] {
        if on {
            let path = dir.join(format!("rapport.{ext}"));
            std::fs::write(&path, report::render(fleet, format, opt))?;
            written.push(path);
        }
    }
    if sel.fix_scripts {
        for d in &fleet.devices {
            let lines: Vec<&String> = d.findings().flat_map(|f| f.fix.iter()).collect();
            if let Some(script) = fix_script(&d.name, &lines) {
                let path = dir.join(format!("{}_fix.txt", d.name));
                std::fs::write(&path, script)?;
                written.push(path);
            }
        }
    }
    Ok(written)
}

/// Visas en gång per bildruta; gör ingenting när dialogen är stängd.
pub(crate) fn show(app: &mut App, ctx: &egui::Context) {
    if !app.sb.export.open {
        return;
    }
    let dark = app.dark();
    let p = palette(dark);
    let mut open = true;
    let (mut go, mut cancel) = (false, false);
    let empty = app.fleet.devices.is_empty();
    let st = &mut app.sb.export;
    egui::Window::new("Exportera").open(&mut open).collapsible(false).resizable(false).anchor(Align2::CENTER_CENTER, Vec2::ZERO).show(ctx, |ui| {
        ui.set_width(400.0);
        ui.label(RichText::new("Välj vad som ska sparas i reports/").color(p.muted));
        ui.add_space(6.0);
        if empty {
            ui.label(RichText::new("Det finns inget att exportera ännu – generera eller läs in konfigar först.").color(theme::sev_color(Severity::Medium, dark)));
            ui.add_space(6.0);
        }
        ui.label(RichText::new("Rapport").strong());
        ui.checkbox(&mut st.sel.html, "HTML (rapport.html)");
        ui.checkbox(&mut st.sel.markdown, "Markdown (rapport.md)");
        ui.checkbox(&mut st.sel.json, "JSON (rapport.json)");
        ui.checkbox(&mut st.sel.csv, "CSV (rapport.csv)");
        ui.checkbox(&mut st.sel.text, "Text (rapport.txt)");
        ui.add_space(6.0);
        ui.label(RichText::new("Övrigt").strong());
        ui.checkbox(&mut st.sel.fix_scripts, "Rättningsskript per enhet (<enhet>_fix.txt)");
        ui.checkbox(&mut st.sel.svg, "Topologin som bild (topologi.svg)");
        ui.add_space(8.0);
        ui.checkbox(&mut st.open_folder, "Öppna mappen efteråt");
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            let can = !empty && st.sel.any();
            if ui.add_enabled(can, egui::Button::new(RichText::new("Exportera").strong().color(egui::Color32::WHITE)).fill(p.accent)).clicked() {
                go = true;
            }
            if ui.button("Avbryt").clicked() {
                cancel = true;
            }
        });
    });
    if go {
        run(app);
    } else if cancel || !open {
        app.sb.export.open = false;
    }
}

fn run(app: &mut App) {
    let Some(project) = app.project.clone() else { return };
    let sel = app.sb.export.sel;
    let mut written = match write_reports(&project, &app.fleet, &sel) {
        Ok(w) => w,
        Err(e) => {
            app.error(format!("Kunde inte spara: {e}"));
            return;
        }
    };
    if sel.svg {
        match topo::export_svg(app) {
            Ok(path) => written.push(path),
            Err(e) => app.error(e),
        }
    }
    app.sb.export.open = false;
    if written.is_empty() {
        return;
    }
    app.toast(format!("✔ Exporterade {} fil(er) till {}", written.len(), project.reports().display()));
    if app.sb.export.open_folder {
        open_path(&project.reports());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_only_the_selected_formats() {
        let dir = std::env::temp_dir().join(format!("vlantool-export-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut app = App::empty(crate::app::Prefs::default());
        app.create_example(&dir);
        let project = app.project.clone().unwrap();
        let none = Selection { html: false, markdown: false, json: false, csv: false, text: false, fix_scripts: false, svg: false };
        let w = write_reports(&project, &app.fleet, &Selection { markdown: true, json: true, fix_scripts: true, ..none }).unwrap();
        assert!(dir.join("reports/rapport.md").exists());
        assert!(dir.join("reports/rapport.json").exists());
        assert!(!dir.join("reports/rapport.html").exists());
        let has_fixes = app.fleet.devices.iter().any(|d| d.findings().any(|f| !f.fix.is_empty()));
        assert_eq!(w.iter().any(|p| p.to_string_lossy().ends_with("_fix.txt")), has_fixes);
        let line = "no ip http server".to_string();
        let fix = fix_script("SW-1", &[&line]).unwrap();
        assert!(fix.starts_with("! Rättningsskript för SW-1") && fix.contains("configure terminal\nno ip http server\n") && fix.ends_with("end\nwrite memory\n"));
        assert_eq!(fix_script("X", &[]), None);

        // SVG-export via appen.
        let svg = topo::export_svg(&mut app).unwrap();
        assert!(std::fs::read_to_string(svg).unwrap().contains("<svg"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
