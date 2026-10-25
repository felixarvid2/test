//! Fliken Topologi (filen heter topo.rs för att inte krocka med vlantool::topology).

#![allow(unused_imports)]

use super::*;

pub(crate) struct Node {
    label: String,
    sub: String,
    kind: Option<Kind>,
    port: String,
    children: Vec<usize>,
    /// Ändpunkter (datorer m.m.) samlade under en switch.
    endpoints: Vec<(String, String, Option<u16>, bool)>,
    pos: Pos2,
    size: Vec2,
    width: f32,
}

pub(crate) fn build_graph(app: &App) -> Vec<Node> {
    let configs: Vec<_> = app.fleet.devices.iter().map(|d| d.config.clone()).collect();
    let lines = topology::tree(&configs);
    let mut nodes: Vec<Node> = Vec::new();
    let mut stack: Vec<(usize, usize)> = Vec::new(); // (djup, nod)
    let mut roots = Vec::new();
    for l in lines {
        let depth = l.prefix.chars().count() / 3;
        while stack.last().is_some_and(|(d, _)| *d >= depth) {
            stack.pop();
        }
        let parent = stack.last().map(|(_, n)| *n);
        let vlan = l.info.strip_prefix("vlan ").and_then(|v| v.parse().ok());
        // Datorer och liknande samlas i en lista under switchen istället för egna noder.
        if !l.device && vlan.is_some()
            && let Some(par) = parent {
                nodes[par].endpoints.push((l.port.clone(), l.peer.clone(), vlan, l.down));
                continue;
            }
        let idx = nodes.len();
        nodes.push(Node {
            label: l.peer.clone(),
            sub: l.info.clone(),
            kind: l.kind.filter(|_| l.device),
            port: l.port.clone(),
            children: Vec::new(),
            endpoints: Vec::new(),
            pos: Pos2::ZERO,
            size: Vec2::ZERO,
            width: 0.0,
        });
        match parent {
            Some(par) => nodes[par].children.push(idx),
            None => roots.push(idx),
        }
        stack.push((depth, idx));
    }
    for n in &mut nodes {
        n.size = if n.kind.is_some() { Vec2::new(200.0, 62.0) } else { Vec2::new(160.0, 48.0) };
        if !n.endpoints.is_empty() {
            n.size.y += 14.0 + 19.0 * n.endpoints.len() as f32;
            n.size.x = 250.0;
        }
    }
    const GAP_X: f32 = 46.0;
    const GAP_Y: f32 = 90.0;
    fn measure(nodes: &mut Vec<Node>, i: usize) -> f32 {
        let kids = nodes[i].children.clone();
        let sum: f32 = kids.iter().map(|&k| measure(nodes, k)).sum::<f32>() + GAP_X * kids.len().saturating_sub(1) as f32;
        nodes[i].width = nodes[i].size.x.max(sum);
        nodes[i].width
    }
    fn place(nodes: &mut Vec<Node>, i: usize, left: f32, top: f32) {
        let w = nodes[i].width;
        nodes[i].pos = Pos2::new(left + w / 2.0, top);
        let kids = nodes[i].children.clone();
        let total: f32 = kids.iter().map(|&k| nodes[k].width).sum::<f32>() + GAP_X * kids.len().saturating_sub(1) as f32;
        let mut x = left + (w - total) / 2.0;
        let y = top + nodes[i].size.y + GAP_Y;
        for k in kids {
            place(nodes, k, x, y);
            x += nodes[k].width + GAP_X;
        }
    }
    let mut x = 0.0;
    for r in roots {
        measure(&mut nodes, r);
        place(&mut nodes, r, x, 0.0);
        x += nodes[r].width + GAP_X * 2.0;
    }
    nodes
}

pub(crate) fn topology_view(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    ui.horizontal(|ui| {
        ui.label(RichText::new("Topologi").size(24.0).strong());
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.button("◎ Anpassa").clicked() {
                app.scene_rect = Rect::ZERO;
            }
            ui.label(RichText::new("Dra för att flytta · Ctrl+scroll för att zooma").size(12.0).color(p.muted));
        });
    });
    ui.add_space(8.0);
    let nodes = build_graph(app);
    let scores: std::collections::HashMap<String, u32> = app.fleet.devices.iter().map(|d| (d.name.clone(), d.score)).collect();
    let mut open: Option<String> = None;
    egui::Frame::new().fill(p.panel).stroke(Stroke::new(1.0, p.line)).corner_radius(CornerRadius::same(14)).show(ui, |ui| {
        ui.set_min_size(ui.available_size());
        if nodes.is_empty() {
            ui.centered_and_justified(|ui| ui.label(RichText::new("Inga portbeskrivningar som 'Port mot X' – topologin går inte att rita.").color(p.muted)));
            return;
        }
        let mut rect = app.scene_rect;
        egui::Scene::new().zoom_range(0.2..=2.0).show(ui, &mut rect, |ui| {
            let painter = ui.painter().clone();
            let bounds = nodes.iter().fold(Rect::NOTHING, |r, n| r.union(Rect::from_center_size(n.pos + Vec2::new(0.0, n.size.y / 2.0), n.size)));
            ui.allocate_rect(bounds.expand(40.0), Sense::hover());
            // Kanter först så att noderna hamnar ovanpå.
            for n in &nodes {
                for &k in &n.children {
                    let c = &nodes[k];
                    let a = n.pos + Vec2::new(0.0, n.size.y);
                    let b = c.pos;
                    let mid = (a.y + b.y) / 2.0;
                    let pts = [a, Pos2::new(a.x, mid), Pos2::new(b.x, mid), b];
                    let curve = egui::epaint::CubicBezierShape::from_points_stroke(pts, false, Color32::TRANSPARENT, Stroke::new(2.0, theme::alpha(p.accent, 0.55)));
                    painter.add(curve);
                    if !c.port.is_empty() {
                        let lp = Pos2::new(b.x, mid + 14.0);
                        let galley = painter.layout_no_wrap(c.port.clone(), FontId::monospace(11.5), p.violet);
                        let r = Rect::from_center_size(lp, galley.size() + Vec2::new(12.0, 6.0));
                        painter.rect_filled(r, CornerRadius::same(8), p.raised);
                        painter.galley(r.center() - galley.size() / 2.0, galley, p.violet);
                    }
                }
            }
            for n in &nodes {
                let r = Rect::from_min_size(n.pos - Vec2::new(n.size.x / 2.0, 0.0), n.size);
                let (icon, color) = match n.kind {
                    Some(Kind::Router) => ("◉", p.accent),
                    Some(Kind::Switch) => ("▣", p.violet),
                    Some(Kind::Unknown) => ("◇", p.muted),
                    None => ("☁", p.muted),
                };
                painter.rect(r, CornerRadius::same(14), p.card, Stroke::new(if n.kind.is_some() { 1.5 } else { 1.0 }, theme::alpha(color, 0.75)), egui::StrokeKind::Inside);
                painter.text(r.left_top() + Vec2::new(16.0, 20.0), Align2::LEFT_CENTER, icon, FontId::proportional(20.0), color);
                painter.text(r.left_top() + Vec2::new(42.0, 20.0), Align2::LEFT_CENTER, &n.label, FontId::proportional(15.5), p.text);
                let sub = match n.kind {
                    Some(k) => k.label().to_string(),
                    None => n.sub.clone(),
                };
                painter.text(r.left_top() + Vec2::new(42.0, 41.0), Align2::LEFT_CENTER, sub, FontId::proportional(12.0), p.muted);
                if let Some(score) = scores.get(&n.label) {
                    let c = r.right_top() + Vec2::new(-26.0, 30.0);
                    painter.circle_filled(c, 16.0, theme::alpha(theme::score_color(*score, dark), 0.18));
                    painter.text(c, Align2::CENTER_CENTER, score.to_string(), FontId::proportional(13.0), theme::score_color(*score, dark));
                }
                let mut y = r.top() + if n.kind.is_some() { 66.0 } else { 52.0 };
                if !n.endpoints.is_empty() {
                    painter.line_segment([Pos2::new(r.left() + 12.0, y - 6.0), Pos2::new(r.right() - 12.0, y - 6.0)], Stroke::new(1.0, p.line));
                }
                for (port, name, vlan, down) in &n.endpoints {
                    let vc = vlan.map_or(p.muted, |v| theme::vlan_color(v, dark));
                    painter.circle_filled(Pos2::new(r.left() + 18.0, y + 6.0), 4.0, if *down { theme::sev_color(Severity::Critical, dark) } else { vc });
                    painter.text(Pos2::new(r.left() + 30.0, y + 6.0), Align2::LEFT_CENTER, port, FontId::monospace(11.5), p.muted);
                    painter.text(Pos2::new(r.left() + 92.0, y + 6.0), Align2::LEFT_CENTER, name, FontId::proportional(12.5), p.text);
                    if let Some(v) = vlan {
                        painter.text(Pos2::new(r.right() - 14.0, y + 6.0), Align2::RIGHT_CENTER, format!("VLAN {v}"), FontId::proportional(11.5), vc);
                    }
                    y += 19.0;
                }
                if n.kind.is_some() && ui.interact(r, ui.scope_id().with(&n.label), Sense::click()).on_hover_text("Dubbelklicka för att visa fynden").double_clicked() {
                    open = Some(n.label.clone());
                }
            }
        });
        app.scene_rect = rect;
    });
    if let Some(name) = open
        && let Some(i) = app.fleet.devices.iter().position(|d| d.name == name) {
            app.select_device(i);
            app.tab = Tab::Findings;
        }
}
