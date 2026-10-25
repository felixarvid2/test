//! Fliken Regler: alla regler med status per enhet (164).

#![allow(unused_imports)]

use super::*;
use vlantool::rules::Rule;

/// Reglerna som passar filtret (sökning på id, rubrik och kategori). Med `only_failing`
/// visas bara regler som ger fynd på minst en enhet.
pub(crate) fn rule_rows(fleet: &FleetReport, filter: &str, only_failing: bool) -> Vec<&'static Rule> {
    let needle = filter.trim().to_lowercase();
    rules::ALL_RULES
        .iter()
        .filter(|r| {
            needle.is_empty()
                || r.id.contains(&needle)
                || r.title.to_lowercase().contains(&needle)
                || r.category.to_lowercase().contains(&needle)
        })
        .filter(|r| !only_failing || fleet.devices.iter().any(|d| d.results.iter().any(|res| res.id == r.id && !res.findings.is_empty())))
        .collect()
}

pub(crate) fn rules(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    heading(
        ui,
        "Regler",
        &format!("{} regler granskar varje enhet. ✔ godkänd, siffran är antal fynd, – gäller inte enheten.", rules::ALL_RULES.len()),
        &p,
    );
    ui.horizontal(|ui| {
        ui.add(egui::TextEdit::singleline(&mut app.sa.rules_filter).hint_text("Sök regel eller kategori …").desired_width(240.0));
        ui.checkbox(&mut app.sa.rules_only_failing, "Bara regler med fynd");
    });
    ui.add_space(8.0);
    let rows = rule_rows(&app.fleet, &app.sa.rules_filter, app.sa.rules_only_failing);
    let mut go: Option<(usize, &'static str)> = None;
    let fleet = &app.fleet;
    egui::ScrollArea::both().auto_shrink([false, false]).show(ui, |ui| {
        theme::card(dark).show(ui, |ui| {
            egui::Grid::new("rules-grid").striped(true).spacing([22.0, 10.0]).min_col_width(100.0).show(ui, |ui| {
                ui.label(RichText::new("REGEL").size(11.0).color(p.muted));
                ui.label(RichText::new("NIVÅ").size(11.0).color(p.muted));
                for d in &fleet.devices {
                    ui.vertical(|ui| {
                        ui.label(RichText::new(&d.name).strong());
                        ui.label(RichText::new(format!("{}/{} godkända", d.passed(), d.results.len())).size(11.5).color(p.muted));
                    });
                }
                ui.end_row();
                for r in &rows {
                    ui.vertical(|ui| {
                        ui.set_min_width(300.0);
                        ui.label(RichText::new(r.title).strong()).on_hover_text(r.why);
                        ui.label(RichText::new(format!("{} · {}", r.id, r.category)).monospace().size(11.5).color(p.muted));
                    });
                    ui.with_layout(Layout::left_to_right(Align::Center), |ui| theme::sev_chip(ui, r.severity, dark));
                    for (i, d) in fleet.devices.iter().enumerate() {
                        match d.results.iter().find(|res| res.id == r.id) {
                            None => {
                                ui.label(RichText::new("–").color(p.muted)).on_hover_text("Regeln gäller inte den här typen av enhet");
                            }
                            Some(res) if res.findings.is_empty() => {
                                ui.label(RichText::new("✔").strong().color(p.good));
                            }
                            Some(res) => {
                                let worst = res.findings.iter().map(|f| f.severity).max().unwrap_or(Severity::Info);
                                let c = theme::sev_color(worst, dark);
                                let btn =
                                    egui::Button::new(RichText::new(format!("{} {}", worst.icon(), res.findings.len())).strong().color(c))
                                        .fill(theme::alpha(c, 0.16))
                                        .stroke(Stroke::NONE)
                                        .corner_radius(CornerRadius::same(255));
                                if ui
                                    .add(btn)
                                    .on_hover_text(format!("{} fynd, värst {} – visa dem", res.findings.len(), worst.label()))
                                    .clicked()
                                {
                                    go = Some((i, r.id));
                                }
                            }
                        }
                    }
                    ui.end_row();
                }
            });
            if rows.is_empty() {
                ui.label(RichText::new("Inga regler matchar.").color(p.muted));
            }
        });
    });
    if let Some((i, id)) = go {
        app.sa.all_devices = false;
        app.select_device(i);
        app.sa.sev_on = [true; 5];
        app.search = id.to_string();
        app.tab = Tab::Findings;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vlantool::audit::audit_fleet;
    use vlantool::parser::Config;

    #[test]
    fn rows_filter_by_text_and_failing() {
        let cfg = Config::parse("SW-A", "SW-A.cfg", "hostname SW-A\nline vty 0 4\n transport input telnet\n");
        let fleet = audit_fleet(vec![cfg], &[]);
        assert_eq!(rule_rows(&fleet, "", false).len(), rules::ALL_RULES.len());
        let failing = rule_rows(&fleet, "", true);
        assert!(failing.iter().any(|r| r.id == "vty-ssh"));
        assert!(failing.len() < rules::ALL_RULES.len());
        assert_eq!(rule_rows(&fleet, "vty-ssh", false).len(), 1);
        assert!(rule_rows(&fleet, "ÅTKOMST", false).iter().all(|r| r.category == "Åtkomst"));
        assert!(rule_rows(&fleet, "finns inte", false).is_empty());
    }
}
