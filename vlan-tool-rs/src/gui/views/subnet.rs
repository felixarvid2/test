//! Fliken Subnät: kalkylator, uppdelning, VLSM-plan (som kan skrivas till dhcp.csv).

#![allow(unused_imports)]

use super::csv_edit::{self, CsvTable, PlanPool, TableKind};
use super::*;
use std::net::Ipv4Addr;
use vlantool::net::VlsmRow;

/// Bekräftelsen innan VLSM-planen skriver över dhcp.csv.
pub(crate) struct PlanConfirm {
    pools: Vec<(String, u16, Subnet)>,
    skipped: Vec<String>,
}

#[derive(Default)]
pub(crate) struct SubnetState {
    confirm: Option<PlanConfirm>,
}

/// En IPv4-adress som fyra bytes i binärt, "11000000.10101000.00000001.01000110".
pub(crate) fn binary(ip: Ipv4Addr) -> String {
    ip.octets().iter().map(|o| format!("{o:08b}")).collect::<Vec<_>>().join(".")
}

/// Adressen som typats in (kan ha värdbitar) innan den görs om till nätets första adress.
fn typed_address(input: &str) -> Option<Ipv4Addr> {
    net::parse_ip(input.split(['/', ' ']).next()?.trim())
}

/// Binär text där nätbitarna är accentfärgade och värdbitarna dämpade.
fn binary_job(ip: Ipv4Addr, prefix: u8, p: &Palette) -> LayoutJob {
    let mut job = LayoutJob::default();
    let text = binary(ip);
    let mut bit = 0u8;
    for ch in text.chars() {
        if ch == '.' {
            job.append(".", 0.0, fmt(p.muted, true));
            continue;
        }
        job.append(&ch.to_string(), 0.0, fmt(if bit < prefix { p.accent } else { p.muted }, true));
        bit += 1;
    }
    job
}

/// Delnäten som text, ett per rad med tabb mellan kolumnerna.
pub(crate) fn split_text(parts: &[Subnet]) -> String {
    let mut s = String::from("Nr\tNät\tVärdar\tBroadcast\n");
    for (i, n) in parts.iter().enumerate() {
        s.push_str(&format!("{}\t{n}\t{} - {}\t{}\n", i + 1, n.first_host(), n.last_host(), n.broadcast()));
    }
    s
}

pub(crate) fn plan_text(rows: &[VlsmRow]) -> String {
    let mut s = String::from("Namn\tBehov\tNät\tMask\tVärdar\tLedigt\n");
    for r in rows {
        match r.subnet {
            Some(n) => s.push_str(&format!("{}\t{}\t{n}\t{}\t{} - {}\t{}\n", r.name, r.hosts, n.mask(), n.first_host(), n.last_host(), n.usable_hosts() - r.hosts)),
            None => s.push_str(&format!("{}\t{}\tfår inte plats\n", r.name, r.hosts)),
        }
    }
    s
}

pub(crate) fn calc_text(n: &Subnet) -> String {
    format!(
        "Nät: {n}\nMask: {}\nWildcard: {}\nBroadcast: {}\nVärdar: {} - {}\nAnvändbara adresser: {}\n",
        n.mask(),
        n.wildcard(),
        n.broadcast(),
        n.first_host(),
        n.last_host(),
        n.usable_hosts()
    )
}

/// VLAN-nummer för planens rader: samma poolnamn som i dhcp.csv behåller sitt VLAN, övriga får
/// lediga nummer i tiotal (10, 20, …).
pub(crate) fn assign_vlans(rows: &[VlsmRow], existing: &[(String, u16)]) -> (Vec<(String, u16, Subnet)>, Vec<String>) {
    let mut used: Vec<u16> = rows
        .iter()
        .filter_map(|r| existing.iter().find(|(n, _)| n.eq_ignore_ascii_case(&r.name)).map(|(_, v)| *v))
        .collect();
    let mut next = 10u16;
    let mut pools = Vec::new();
    let mut skipped = Vec::new();
    for r in rows {
        let Some(s) = r.subnet else {
            skipped.push(r.name.clone());
            continue;
        };
        let vlan = match existing.iter().find(|(n, _)| n.eq_ignore_ascii_case(&r.name)) {
            Some((_, v)) => *v,
            None => {
                while used.contains(&next) {
                    next += 10;
                }
                used.push(next);
                next
            }
        };
        pools.push((r.name.clone(), vlan, s));
    }
    (pools, skipped)
}

/// Skriver poolerna som hela dhcp.csv (rubrikerna behålls om filen finns). Returnerar sökvägen.
pub(crate) fn write_plan(samples: &std::path::Path, pools: &[(String, u16, Subnet)]) -> anyhow::Result<std::path::PathBuf> {
    let tables = csv_edit::load_all(samples);
    let existing = tables.into_iter().find(|t| t.kind == TableKind::Dhcp);
    let mut table = existing.unwrap_or_else(|| CsvTable::new(samples.join("dhcp.csv"), TableKind::Dhcp, csv_edit::DHCP_HEADERS.iter().map(|h| h.to_string()).collect()));
    let dns = table.col("dns").and_then(|c| table.rows.first().and_then(|r| r.get(c))).and_then(|v| net::parse_ip(v)).unwrap_or(Ipv4Addr::new(8, 8, 8, 8));
    let plan: Vec<PlanPool> = pools.iter().map(|(name, vlan, subnet)| PlanPool { name: name.clone(), vlan: *vlan, subnet: *subnet }).collect();
    table.rows = csv_edit::dhcp_rows(&table.headers, &plan, dns);
    table.save()?;
    Ok(table.path)
}

pub(crate) fn subnet(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let mut copy: Option<String> = None;
    let mut ask_confirm = false;
    heading(ui, "Subnätskalkylator", "Räkna på ett nät, dela det i lika delar eller gör en VLSM-plan", &p);
    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.label("Nät");
                ui.add(egui::TextEdit::singleline(&mut app.subnet_input).desired_width(220.0).font(egui::TextStyle::Monospace));
                ui.label(RichText::new("t.ex. 192.168.1.0/24 eller 10.0.0.0 255.255.0.0").size(12.0).color(p.muted));
            });
            ui.add_space(8.0);
            let Some(n) = Subnet::parse(&app.subnet_input) else {
                ui.label(RichText::new("Ogiltigt nät").color(theme::sev_color(Severity::High, dark)));
                return;
            };
            let w = ((ui.available_width() - 3.0 * 10.0) / 4.0).max(120.0);
            ui.horizontal(|ui| {
                theme::stat_tile(ui, &n.to_string(), "NÄT", p.accent, dark, w);
                theme::stat_tile(ui, &n.mask().to_string(), "MASK", p.violet, dark, w);
                theme::stat_tile(ui, &n.usable_hosts().to_string(), "ANVÄNDBARA ADRESSER", p.good, dark, w);
                theme::stat_tile(ui, &n.broadcast().to_string(), "BROADCAST", theme::sev_color(Severity::Medium, dark), dark, w);
            });
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                ui.label(RichText::new(format!("Värdar {} – {}   ·   wildcard {}", n.first_host(), n.last_host(), n.wildcard())).monospace().color(p.muted));
                if ui.button("Kopiera som text").clicked() {
                    copy = Some(calc_text(&n));
                }
            });
            ui.add_space(8.0);
            ui.label(RichText::new("Binärt").strong());
            egui::Grid::new("binary").num_columns(2).spacing([14.0, 3.0]).show(ui, |ui| {
                let typed = typed_address(&app.subnet_input).filter(|a| *a != n.network);
                let mut rows = vec![];
                if let Some(a) = typed {
                    rows.push(("Adress", a));
                }
                rows.extend([("Nät", n.network), ("Mask", n.mask()), ("Broadcast", n.broadcast())]);
                for (label, ip) in rows {
                    ui.label(RichText::new(label).color(p.muted));
                    ui.label(binary_job(ip, n.prefix, &p));
                    ui.end_row();
                }
            });
            ui.label(RichText::new(format!("Blått är de {} nätbitarna, grått är de {} värdbitarna.", n.prefix, 32 - n.prefix)).size(12.0).color(p.muted));
        });
        let Some(n) = Subnet::parse(&app.subnet_input) else { return };
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "Dela i lika stora delar", dark);
            let lo = n.prefix.min(30);
            app.split_prefix = app.split_prefix.clamp(lo, 30);
            ui.horizontal(|ui| {
                ui.add(egui::Slider::new(&mut app.split_prefix, lo..=30).prefix("/").text("prefix"));
                if ui.button("Kopiera tabellen").on_hover_text("Alla delnät, tabbseparerade (klistras in i Excel)").clicked() {
                    copy = Some(split_text(&n.split(app.split_prefix)));
                }
            });
            let parts = n.split(app.split_prefix);
            ui.label(RichText::new(format!("{} delnät med {} användbara adresser var", parts.len(), parts.first().map_or(0, |s| s.usable_hosts()))).color(p.muted));
            egui::Grid::new("split").striped(true).spacing([18.0, 4.0]).show(ui, |ui| {
                for (i, s) in parts.iter().enumerate().take(32) {
                    ui.label(RichText::new(format!("{}", i + 1)).color(p.muted));
                    ui.label(RichText::new(s.to_string()).monospace().color(p.accent));
                    ui.label(RichText::new(format!("{} – {}", s.first_host(), s.last_host())).monospace());
                    ui.label(RichText::new(format!("bc {}", s.broadcast())).monospace().color(p.muted));
                    ui.end_row();
                }
            });
            if parts.len() > 32 {
                ui.label(RichText::new(format!("… och {} till (alla följer med när du kopierar)", parts.len() - 32)).color(p.muted));
            }
        });
        ui.add_space(12.0);
        theme::card(dark).show(ui, |ui| {
            ui.set_width(ui.available_width());
            theme::section_title(ui, "VLSM-plan", dark);
            ui.horizontal(|ui| {
                ui.label("Behov");
                ui.add(egui::TextEdit::singleline(&mut app.plan_input).desired_width(f32::INFINITY).hint_text("NAMN:värdar, NAMN:värdar"));
            });
            ui.add_space(6.0);
            match net::parse_plan(&app.plan_input) {
                Err(e) => {
                    ui.label(RichText::new(e).color(theme::sev_color(Severity::High, dark)));
                }
                Ok(wants) => {
                    let rows = net::vlsm(n, &wants);
                    let used: u64 = rows.iter().filter_map(|r| r.subnet).map(|s| s.size()).sum();
                    egui::Grid::new("vlsm").striped(true).spacing([18.0, 6.0]).show(ui, |ui| {
                        for h in ["Namn", "Behov", "Nät", "Mask", "Värdar", "Ledigt"] {
                            ui.label(RichText::new(h).strong().color(p.muted));
                        }
                        ui.end_row();
                        for (i, r) in rows.iter().enumerate() {
                            ui.label(RichText::new(&r.name).strong().color(theme::vlan_color(i as u16 * 10 + 10, dark)));
                            ui.label(r.hosts.to_string());
                            match r.subnet {
                                Some(s) => {
                                    ui.label(RichText::new(s.to_string()).monospace().color(p.accent));
                                    ui.label(RichText::new(s.mask().to_string()).monospace());
                                    ui.label(RichText::new(format!("{} – {}", s.first_host(), s.last_host())).monospace());
                                    ui.label(RichText::new((s.usable_hosts() - r.hosts).to_string()).color(p.muted));
                                }
                                None => {
                                    ui.label(RichText::new("får inte plats").color(theme::sev_color(Severity::Critical, dark)));
                                }
                            }
                            ui.end_row();
                        }
                    });
                    ui.add_space(8.0);
                    // Stapel som visar hur nätet fylls.
                    let (rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 22.0), Sense::hover());
                    ui.painter().rect_filled(rect, CornerRadius::same(6), p.raised);
                    let base = u32::from(n.network) as f32;
                    for (i, r) in rows.iter().enumerate() {
                        if let Some(s) = r.subnet {
                            let x0 = rect.left() + rect.width() * (u32::from(s.network) as f32 - base) / n.size() as f32;
                            let w = rect.width() * s.size() as f32 / n.size() as f32;
                            let seg = Rect::from_min_size(Pos2::new(x0, rect.top()), Vec2::new(w, rect.height())).shrink2(Vec2::new(1.0, 0.0));
                            ui.painter().rect_filled(seg, CornerRadius::same(5), theme::alpha(theme::vlan_color(i as u16 * 10 + 10, dark), 0.75));
                            if w > 50.0 {
                                ui.painter().text(seg.center(), Align2::CENTER_CENTER, &r.name, FontId::proportional(11.5), Color32::WHITE);
                            }
                        }
                    }
                    ui.label(RichText::new(format!("{used} av {} adresser används ({:.0} %)", n.size(), used as f32 * 100.0 / n.size() as f32)).color(p.muted));
                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        if ui.button("Kopiera tabellen").clicked() {
                            copy = Some(plan_text(&rows));
                        }
                        let can = app.project.is_some() && rows.iter().any(|r| r.subnet.is_some());
                        if ui.add_enabled(can, egui::Button::new(RichText::new("Använd planen …").strong())).on_hover_text("Skriver planen som DHCP-pooler till samples/dhcp.csv (efter bekräftelse)").clicked() {
                            ask_confirm = true;
                        }
                    });
                }
            }
        });
    });
    if let Some(text) = copy {
        ui.ctx().copy_text(text);
        app.toast("✔ Kopierade till urklipp");
    }
    if ask_confirm
        && let Ok(wants) = net::parse_plan(&app.plan_input)
        && let Some(n) = Subnet::parse(&app.subnet_input) {
            let rows = net::vlsm(n, &wants);
            let existing: Vec<(String, u16)> = app.inventory.iter().flat_map(|i| i.dhcp.iter().map(|d| (d.name.clone(), d.vlan))).collect();
            let (pools, skipped) = assign_vlans(&rows, &existing);
            app.sb.subnet.confirm = Some(PlanConfirm { pools, skipped });
        }
    confirm_window(app, ui.ctx());
}

fn confirm_window(app: &mut App, ctx: &egui::Context) {
    let Some(c) = &mut app.sb.subnet.confirm else { return };
    let dark = app.prefs.dark;
    let p = palette(dark);
    let Some(samples) = app.project.as_ref().map(|p| p.samples()) else {
        app.sb.subnet.confirm = None;
        return;
    };
    let path = samples.join("dhcp.csv");
    let mut open = true;
    let (mut go, mut cancel) = (false, false);
    egui::Window::new("Skriva över dhcp.csv?").open(&mut open).collapsible(false).resizable(false).anchor(Align2::CENTER_CENTER, Vec2::ZERO).show(ctx, |ui| {
        ui.set_width(520.0);
        ui.label(format!("Hela {} ersätts av VLSM-planen. Poolerna som finns där nu försvinner (generera om konfigarna efteråt).", path.display()));
        ui.add_space(8.0);
        egui::Grid::new("plan-confirm").striped(true).spacing([18.0, 4.0]).show(ui, |ui| {
            for h in ["VLAN", "Pool", "Nät"] {
                ui.label(RichText::new(h).strong().color(p.muted));
            }
            ui.end_row();
            for (name, vlan, s) in &mut c.pools {
                ui.add(egui::DragValue::new(vlan).range(1..=4094));
                ui.label(RichText::new(name.as_str()).strong());
                ui.label(RichText::new(s.to_string()).monospace().color(p.accent));
                ui.end_row();
            }
        });
        if !c.skipped.is_empty() {
            ui.add_space(6.0);
            ui.label(RichText::new(format!("Får inte plats och hoppas över: {}", c.skipped.join(", "))).color(theme::sev_color(Severity::Medium, dark)));
        }
        let mut vlans: Vec<u16> = c.pools.iter().map(|(_, v, _)| *v).collect();
        vlans.sort_unstable();
        vlans.dedup();
        let dup = vlans.len() != c.pools.len();
        if dup {
            ui.label(RichText::new("Två pooler har samma VLAN-nummer.").color(theme::sev_color(Severity::High, dark)));
        }
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if ui.add_enabled(!dup, egui::Button::new(RichText::new("Skriv över dhcp.csv").strong().color(Color32::WHITE)).fill(theme::sev_color(Severity::High, dark))).clicked() {
                go = true;
            }
            if ui.button("Avbryt").clicked() {
                cancel = true;
            }
        });
    });
    if go {
        let pools = c.pools.clone();
        app.sb.subnet.confirm = None;
        match write_plan(&samples, &pools) {
            Ok(path) => {
                app.reload();
                app.toast(format!("✔ Skrev {} pooler till {}", pools.len(), path.display()));
            }
            Err(e) => app.error(format!("Kunde inte skriva dhcp.csv: {e:#}")),
        }
    } else if cancel || !open {
        app.sb.subnet.confirm = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_text() {
        assert_eq!(binary("192.168.1.70".parse().unwrap()), "11000000.10101000.00000001.01000110");
        assert_eq!(typed_address("192.168.1.70/26"), Some("192.168.1.70".parse().unwrap()));
        assert_eq!(typed_address("10.0.0.0 255.0.0.0"), Some("10.0.0.0".parse().unwrap()));
    }

    #[test]
    fn copy_texts() {
        let n = Subnet::parse("192.168.1.0/24").unwrap();
        let t = split_text(&n.split(26));
        assert_eq!(t.lines().count(), 5);
        assert!(t.contains("2\t192.168.1.64/26\t192.168.1.65 - 192.168.1.126\t192.168.1.127"));
        let rows = net::vlsm(n, &net::parse_plan("KONTOR:50,STOR:900").unwrap());
        let t = plan_text(&rows);
        assert!(t.contains("KONTOR\t50\t192.168.1.0/26\t255.255.255.192\t192.168.1.1 - 192.168.1.62\t12"));
        assert!(t.contains("STOR\t900\tfår inte plats"));
        assert!(calc_text(&n).contains("Broadcast: 192.168.1.255"));
    }

    #[test]
    fn plan_to_dhcp_csv() {
        let dir = std::env::temp_dir().join(format!("vlantool-plan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::copy(concat!(env!("CARGO_MANIFEST_DIR"), "/samples/dhcp.csv"), dir.join("dhcp.csv")).unwrap();
        let n = Subnet::parse("192.168.1.0/24").unwrap();
        let rows = net::vlsm(n, &net::parse_plan("KONTOR:50, NYTT:20, FÖR_STORT:1000").unwrap());
        let existing = vec![("KONTOR".to_string(), 10u16), ("GAST".to_string(), 30)];
        let (pools, skipped) = assign_vlans(&rows, &existing);
        assert_eq!(skipped, ["FÖR_STORT"]);
        assert_eq!(pools.len(), 2);
        assert_eq!(pools[0].1, 10, "KONTOR behåller sitt VLAN");
        assert_eq!(pools[1].1, 20, "NYTT får första lediga tiotal");
        let path = write_plan(&dir, &pools).unwrap();
        assert!(path.ends_with("dhcp.csv"));
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.starts_with("vlan_id,pool_name,network,mask,pool_start,pool_end,excluded_start,excluded_end,gateway,dns\n"));
        let inv = vlantool::inventory::Inventory::load_dir(&dir).unwrap();
        assert!(inv.problems.is_empty());
        assert_eq!(inv.dhcp.len(), 2);
        assert_eq!(inv.dhcp[0].name, "KONTOR");
        assert_eq!(inv.dhcp[0].network.to_string(), "192.168.1.0/26");
        assert_eq!(inv.dhcp[1].network.to_string(), "192.168.1.64/27");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
