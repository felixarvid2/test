//! Fliken Portar: filter på läge och VLAN, sortering per kolumn och kopiering som CSV.

#![allow(unused_imports)]

use super::*;
use vlantool::parser::Interface;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum ModeFilter {
    #[default]
    All,
    Access,
    Trunk,
    Routed,
}

#[derive(Default)]
pub(crate) struct PortsState {
    mode: ModeFilter,
    vlan: Option<u16>,
    text: String,
    /// (kolumn, stigande)
    sort: Option<(usize, bool)>,
}

const HEADERS: [&str; 6] = ["Port", "Läge", "VLAN / adress", "Beskrivning", "Status", "Skydd"];

/// En rad i tabellen, färdigräknad så att filter, sortering och CSV använder samma data.
pub(crate) struct PortLine {
    name: String,
    short: String,
    mode: IfMode,
    mode_label: &'static str,
    vlan_text: String,
    /// VLAN som raden hör till (accessporten eller trunkens tillåtna) för filtret.
    vlans: Option<Vec<u16>>,
    access_vlan: Option<u16>,
    description: String,
    down: bool,
    protected: Option<bool>,
}

fn mode_label(m: IfMode) -> &'static str {
    match m {
        IfMode::Access => "access",
        IfMode::Trunk => "trunk",
        IfMode::Routed => "routad",
        IfMode::Other => "–",
    }
}

pub(crate) fn port_line(i: &Interface) -> PortLine {
    let vlan_text = match i.mode {
        IfMode::Access => format!("VLAN {}", i.access_vlan.unwrap_or(1)),
        IfMode::Trunk => format!("{}  (native {})", i.allowed.as_ref().map_or("alla".into(), |v| join_vlans(v)), i.native_vlan.unwrap_or(1)),
        _ => i
            .dot1q
            .map(|v| format!("dot1Q {v}{}", if i.dot1q_native { " native" } else { "" }))
            .into_iter()
            .chain(i.ip.map(|(a, m)| format!("{a}/{}", net::mask_to_prefix(m).unwrap_or(0))))
            .collect::<Vec<_>>()
            .join("  "),
    };
    PortLine {
        name: i.name.clone(),
        short: short_port(&i.name),
        mode: i.mode,
        mode_label: mode_label(i.mode),
        vlan_text,
        vlans: match i.mode {
            IfMode::Access => Some(vec![i.access_vlan.unwrap_or(1)]),
            IfMode::Trunk => i.allowed.clone(),
            _ => i.dot1q.map(|v| vec![v]),
        },
        access_vlan: i.access_vlan,
        description: i.description.clone(),
        down: i.shutdown,
        protected: (i.mode == IfMode::Access).then_some(i.portfast && i.bpduguard),
    }
}

fn status_text(l: &PortLine) -> &'static str {
    if l.down { "nere" } else { "uppe" }
}

fn shield_text(l: &PortLine) -> &'static str {
    match l.protected {
        Some(true) => "portfast + bpdu",
        Some(false) => "saknas",
        None => "",
    }
}

/// "Gi0/10" ska komma efter "Gi0/2": text och tal jämförs för sig.
fn natural_key(s: &str) -> Vec<(String, u32)> {
    let mut out = Vec::new();
    let mut text = String::new();
    let mut num = String::new();
    for c in s.chars() {
        if c.is_ascii_digit() {
            num.push(c);
        } else {
            if !num.is_empty() {
                out.push((std::mem::take(&mut text), num.parse().unwrap_or(0)));
                num.clear();
            }
            text.push(c);
        }
    }
    out.push((text, num.parse().unwrap_or(0)));
    out
}

pub(crate) fn matches(l: &PortLine, mode: ModeFilter, vlan: Option<u16>, text: &str) -> bool {
    let mode_ok = match mode {
        ModeFilter::All => true,
        ModeFilter::Access => l.mode == IfMode::Access,
        ModeFilter::Trunk => l.mode == IfMode::Trunk,
        ModeFilter::Routed => l.mode == IfMode::Routed,
    };
    // En trunk utan begränsning (alla VLAN) bär alla VLAN.
    let vlan_ok = vlan.is_none_or(|v| match (&l.vlans, l.mode) {
        (Some(vs), _) => vs.contains(&v),
        (None, IfMode::Trunk) => true,
        _ => false,
    });
    let t = text.trim().to_lowercase();
    let text_ok = t.is_empty() || [&l.name, &l.description, &l.vlan_text].iter().any(|s| s.to_lowercase().contains(&t));
    mode_ok && vlan_ok && text_ok
}

pub(crate) fn sort_lines(lines: &mut [PortLine], col: usize, asc: bool) {
    lines.sort_by(|a, b| {
        let o = match col {
            0 => natural_key(&a.name).cmp(&natural_key(&b.name)),
            1 => a.mode_label.cmp(b.mode_label),
            2 => a.access_vlan.cmp(&b.access_vlan).then_with(|| a.vlan_text.cmp(&b.vlan_text)),
            3 => a.description.to_lowercase().cmp(&b.description.to_lowercase()),
            4 => a.down.cmp(&b.down),
            _ => shield_text(a).cmp(shield_text(b)),
        };
        if asc { o } else { o.reverse() }
    });
}

/// Tabellen som CSV (kommaseparerad, med rubrikrad).
pub(crate) fn lines_csv(lines: &[PortLine]) -> String {
    let mut w = ::csv::Writer::from_writer(Vec::new());
    let _ = w.write_record(HEADERS);
    for l in lines {
        let _ = w.write_record([l.short.as_str(), l.mode_label, l.vlan_text.as_str(), l.description.as_str(), status_text(l), shield_text(l)]);
    }
    String::from_utf8(w.into_inner().unwrap_or_default()).unwrap_or_default()
}

pub(crate) fn ports(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let Some(d) = app.fleet.devices.get(app.device) else { return };
    let name = d.name.clone();
    let all: Vec<PortLine> = d.config.interfaces.iter().map(port_line).collect();
    let mut vlans: BTreeSet<u16> = BTreeSet::new();
    for l in &all {
        if let Some(vs) = &l.vlans {
            vlans.extend(vs.iter().copied());
        }
    }
    let st = &mut app.sb.ports;
    let mut lines: Vec<PortLine> = all.into_iter().filter(|l| matches(l, st.mode, st.vlan, &st.text)).collect();
    if let Some((col, asc)) = st.sort {
        sort_lines(&mut lines, col, asc);
    }
    let total = d.config.interfaces.len();
    heading(ui, &format!("Portar – {name}"), &format!("{} av {total} interface", lines.len()), &p);

    let mut copy = false;
    ui.horizontal_wrapped(|ui| {
        for (m, label) in [(ModeFilter::All, "Alla"), (ModeFilter::Access, "access"), (ModeFilter::Trunk, "trunk"), (ModeFilter::Routed, "routad")] {
            if ui.selectable_label(st.mode == m, label).clicked() {
                st.mode = m;
            }
        }
        ui.add_space(8.0);
        egui::ComboBox::from_id_salt("ports-vlan")
            .selected_text(st.vlan.map_or("Alla VLAN".to_string(), |v| format!("VLAN {v}")))
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut st.vlan, None, "Alla VLAN");
                for v in &vlans {
                    ui.selectable_value(&mut st.vlan, Some(*v), format!("VLAN {v}"));
                }
            });
        ui.add(egui::TextEdit::singleline(&mut st.text).hint_text("Sök port eller beskrivning …").desired_width(220.0));
        if (st.mode != ModeFilter::All || st.vlan.is_some() || !st.text.is_empty() || st.sort.is_some())
            && ui.button("Återställ").on_hover_text("Visa alla portar i ursprunglig ordning").clicked()
        {
            *st = PortsState::default();
        }
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.button("Kopiera som CSV").on_hover_text("Kopierar tabellen som den visas nu").clicked() {
                copy = true;
            }
        });
    });
    ui.add_space(8.0);
    if copy {
        ui.ctx().copy_text(lines_csv(&lines));
        app.toast(format!("✔ Kopierade {} rader som CSV", lines.len()));
    }
    let st = &mut app.sb.ports;
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
                for (c, t) in HEADERS.iter().enumerate() {
                    h.col(|ui| {
                        let arrow = match st.sort {
                            Some((sc, true)) if sc == c => " ▲",
                            Some((sc, false)) if sc == c => " ▼",
                            _ => "",
                        };
                        let active = st.sort.is_some_and(|(sc, _)| sc == c);
                        let resp = ui
                            .add(egui::Label::new(RichText::new(format!("{t}{arrow}")).size(12.0).strong().color(if active { p.accent } else { p.muted })).sense(Sense::click()))
                            .on_hover_text("Klicka för att sortera");
                        if resp.clicked() {
                            st.sort = match st.sort {
                                Some((sc, true)) if sc == c => Some((c, false)),
                                Some((sc, false)) if sc == c => None,
                                _ => Some((c, true)),
                            };
                        }
                    });
                }
            })
            .body(|body| {
                body.rows(28.0, lines.len(), |mut row| {
                    let l = &lines[row.index()];
                    row.col(|ui| {
                        ui.label(RichText::new(&l.short).monospace().strong());
                    });
                    row.col(|ui| {
                        let c = match l.mode {
                            IfMode::Access => p.good,
                            IfMode::Trunk => p.violet,
                            IfMode::Routed => p.accent,
                            IfMode::Other => p.muted,
                        };
                        theme::chip(ui, l.mode_label, c);
                    });
                    row.col(|ui| match l.mode {
                        IfMode::Access => {
                            let v = l.access_vlan.unwrap_or(1);
                            theme::chip(ui, &l.vlan_text, theme::vlan_color(v, dark));
                        }
                        _ => {
                            ui.label(RichText::new(&l.vlan_text).monospace());
                        }
                    });
                    row.col(|ui| {
                        ui.label(RichText::new(&l.description).color(p.muted));
                    });
                    row.col(|ui| {
                        if l.down {
                            ui.label(RichText::new("● nere").color(theme::sev_color(Severity::Critical, dark)));
                        } else {
                            ui.label(RichText::new("● uppe").color(p.good));
                        }
                    });
                    row.col(|ui| match l.protected {
                        Some(true) => {
                            ui.label(RichText::new("✔ portfast + bpdu").color(p.good));
                        }
                        Some(false) => {
                            ui.label(RichText::new("✖ saknas").color(theme::sev_color(Severity::Low, dark)));
                        }
                        None => {}
                    });
                });
            });
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use vlantool::parser::Config;

    fn lines() -> Vec<PortLine> {
        let cfg = "hostname SW\ninterface GigabitEthernet0/1\n description Port mot R\n switchport mode trunk\n switchport trunk allowed vlan 10,20\n!\n\
                   interface FastEthernet0/10\n description Dator\n switchport mode access\n switchport access vlan 20\n spanning-tree portfast\n spanning-tree bpduguard enable\n!\n\
                   interface FastEthernet0/2\n description Dator, två\n switchport mode access\n switchport access vlan 10\n shutdown\n!\n";
        Config::parse("SW", "SW.cfg", cfg).interfaces.iter().map(port_line).collect()
    }

    #[test]
    fn filters_by_mode_and_vlan() {
        let all = lines();
        assert_eq!(all.len(), 3);
        let n = |m, v, t: &str| all.iter().filter(|l| matches(l, m, v, t)).count();
        assert_eq!(n(ModeFilter::All, None, ""), 3);
        assert_eq!(n(ModeFilter::Access, None, ""), 2);
        assert_eq!(n(ModeFilter::All, Some(20), ""), 2, "accessporten i VLAN 20 och trunken");
        assert_eq!(n(ModeFilter::Access, Some(10), ""), 1);
        assert_eq!(n(ModeFilter::All, None, "två"), 1);
    }

    #[test]
    fn sorts_naturally_and_copies_csv() {
        let mut all = lines();
        sort_lines(&mut all, 0, true);
        let order: Vec<_> = all.iter().map(|l| l.short.as_str()).collect();
        assert_eq!(order, ["Fa0/2", "Fa0/10", "Gi0/1"]);
        sort_lines(&mut all, 0, false);
        assert_eq!(all[0].short, "Gi0/1");
        let csv = lines_csv(&all);
        assert!(csv.starts_with("Port,Läge,VLAN / adress,Beskrivning,Status,Skydd\n"));
        assert!(csv.contains("Fa0/2,access,VLAN 10,\"Dator, två\",nere,saknas"));
        assert!(csv.contains("Fa0/10,access,VLAN 20,Dator,uppe,portfast + bpdu"));
    }
}
