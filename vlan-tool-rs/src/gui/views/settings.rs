//! Fliken Inställningar.

#![allow(unused_imports)]

use super::*;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Check {
    Ip,
    Mask,
}

/// Förklaring om fältet är ifyllt men inte går att tolka. Tomt fält är tillåtet.
pub(crate) fn ip_problem(text: &str, mask: bool) -> Option<&'static str> {
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    let Some(ip) = vlantool::net::parse_ip(t) else { return Some("ogiltig IP-adress") };
    (mask && vlantool::net::mask_to_prefix(ip).is_none()).then_some("ogiltig nätmask")
}

pub(crate) fn settings(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    heading(ui, "Inställningar", "Sparas i nordvik.toml i projektmappen och används när konfigarna genereras", &p);
    let mut save = false;
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        let s = &mut app.settings_draft;
        let text = |ui: &mut Ui, label: &str, v: &mut String, hint: &str| {
            ui.label(label);
            ui.add(egui::TextEdit::singleline(v).desired_width(320.0).hint_text(hint));
            ui.end_row();
        };
        let bad = theme::sev_color(Severity::High, dark);
        // Som `text`, men fältet får röd ram och en förklaring så fort innehållet inte är en giltig adress.
        let ip_text = |ui: &mut Ui, label: &str, v: &mut String, hint: &str, check: Check| {
            ui.label(label);
            ui.horizontal(|ui| {
                let resp = ui.add(egui::TextEdit::singleline(v).desired_width(320.0).hint_text(hint));
                if let Some(why) = ip_problem(v, check == Check::Mask) {
                    ui.painter().rect_stroke(
                        resp.rect.expand(1.0),
                        CornerRadius::same(4),
                        Stroke::new(1.5, bad),
                        egui::StrokeKind::Outside,
                    );
                    ui.label(RichText::new(format!("✖ {why}")).size(12.0).color(bad));
                }
            });
            ui.end_row();
        };
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Grund", dark);
            egui::Grid::new("set-base").num_columns(2).spacing([24.0, 10.0]).show(ui, |ui| {
                text(ui, "Domännamn", &mut s.domain, "nordvik.example");
                ip_text(ui, "Loggserver", &mut s.log_server, "192.168.1.17", Check::Ip);
                ip_text(ui, "NTP-server", &mut s.ntp_server, "192.168.1.16", Check::Ip);
                text(ui, "Banner", &mut s.banner, "Endast behörig personal");
            });
        });
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Inloggning", dark);
            egui::Grid::new("set-login").num_columns(2).spacing([24.0, 10.0]).show(ui, |ui| {
                text(ui, "Användarnamn", &mut s.username, "drift");
                ui.label("Lösenord (secret)");
                ui.horizontal(|ui| {
                    ui.add(egui::TextEdit::singleline(&mut s.secret).password(true).desired_width(320.0));
                    if s.secret == "CHANGE_ME" {
                        theme::chip(ui, "▲ platshållare", theme::sev_color(Severity::Medium, dark));
                    }
                });
                ui.end_row();
                ui.label("Exec-timeout");
                ui.add(egui::Slider::new(&mut s.exec_timeout, 1..=60).suffix(" min"));
                ui.end_row();
            });
        });
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Nät", dark);
            egui::Grid::new("set-net").num_columns(2).spacing([24.0, 10.0]).show(ui, |ui| {
                ui.label("Hanterings-VLAN");
                ui.add(egui::DragValue::new(&mut s.mgmt_vlan).range(1..=4094));
                ui.end_row();
                ui.label("Native-VLAN");
                ui.add(egui::DragValue::new(&mut s.native_vlan).range(1..=4094));
                ui.end_row();
                text(ui, "Routerns namn", &mut s.router_hostname, "R-Nordvik-1");
                text(ui, "Trunkport mot switch", &mut s.router_trunk_interface, "GigabitEthernet0/0");
                text(ui, "Port mot internet", &mut s.router_wan_interface, "GigabitEthernet0/1");
                ip_text(ui, "WAN-adress", &mut s.wan_ip, "203.0.113.10", Check::Ip);
                ip_text(ui, "WAN-mask", &mut s.wan_mask, "255.255.255.0", Check::Mask);
                ip_text(ui, "WAN-gateway", &mut s.wan_gateway, "203.0.113.1", Check::Ip);
                ui.label("Portskydd");
                ui.checkbox(&mut s.edge_protection, "portfast + BPDU guard på accessportar");
                ui.end_row();
            });
        });
        ui.add_space(14.0);
        ui.horizontal(|ui| {
            let changed = toml_eq(&app.settings_draft, &app.settings);
            if ui.add_enabled(!changed, egui::Button::new(RichText::new("Spara").strong())).clicked() {
                save = true;
            }
            if ui.add_enabled(!changed, egui::Button::new("Ångra ändringar")).clicked() {
                app.settings_draft = app.settings.clone();
            }
            if ui.button("Standardvärden").clicked() {
                app.settings_draft = vlantool::settings::Settings::default();
            }
        });
    });
    if save {
        app.save_settings();
    }
}

pub(crate) fn toml_eq(a: &vlantool::settings::Settings, b: &vlantool::settings::Settings) -> bool {
    a.to_toml() == b.to_toml()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_invalid_addresses() {
        assert_eq!(ip_problem("192.168.1.17", false), None);
        assert_eq!(ip_problem("", false), None);
        assert_eq!(ip_problem("192.168.1.300", false), Some("ogiltig IP-adress"));
        assert_eq!(ip_problem("abc", true), Some("ogiltig IP-adress"));
        assert_eq!(ip_problem("255.255.255.0", true), None);
        assert_eq!(ip_problem("255.0.255.0", true), Some("ogiltig nätmask"));
    }
}
