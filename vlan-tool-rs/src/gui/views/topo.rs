//! Fliken Topologi (filen heter topo.rs för att inte krocka med vlantool::topology).

#![allow(unused_imports)]

use super::*;
use vlantool::audit::FleetReport;
use vlantool::parser::{Config, Interface};

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

/// Vilka VLAN en länk bär.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Carry {
    All,
    Set(BTreeSet<u16>),
}

impl Carry {
    fn has(&self, v: u16) -> bool {
        match self {
            Carry::All => true,
            Carry::Set(s) => s.contains(&v),
        }
    }
}

/// Länken mellan en nod och dess förälder, med det som visas när man hovrar.
pub(crate) struct Edge {
    from: usize,
    to: usize,
    /// "Förälderns port – barnets port" för rubriken i verktygstipset.
    title: String,
    detail: Vec<String>,
    /// Fynd mellan enheterna som gäller just den här länken.
    errors: Vec<String>,
    carry: Carry,
}

/// Grafen och allt som ritas av den. Byggs om bara när granskningen ändrats (se `fleet_key`).
pub(crate) struct Graph {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    bounds: Rect,
    /// Alla VLAN som någon länk bär, till listan "Visa VLAN".
    vlans: BTreeSet<u16>,
}

#[derive(Default)]
pub(crate) struct TopoState {
    vlan: Option<u16>,
    cache: Option<(u64, Graph)>,
    /// Storleken på ytan förra bildrutan, för att zoomknapparna ska respektera gränserna.
    view: Vec2,
}

const ZOOM_MIN: f32 = 0.2;
const ZOOM_MAX: f32 = 2.0;

fn iface_text(c: &Config, i: &Interface) -> String {
    let head = format!("{} {}", c.display_name(), short_port(&i.name));
    match i.mode {
        IfMode::Trunk => format!(
            "{head}: trunk, tillåtna {}, native {}",
            i.allowed.as_ref().map_or("alla".into(), |v| join_vlans(v)),
            i.native_vlan.unwrap_or(1)
        ),
        IfMode::Access => format!("{head}: access, VLAN {}", i.access_vlan.unwrap_or(1)),
        IfMode::Routed => {
            let subs: BTreeSet<u16> = c.interfaces.iter().filter(|s| s.name.starts_with(&format!("{}.", i.name))).filter_map(|s| s.dot1q).collect();
            if subs.is_empty() {
                format!("{head}: routad{}", i.ip.map_or(String::new(), |(a, _)| format!(", {a}")))
            } else {
                format!("{head}: routad, subinterface för VLAN {}", join_vlans(&subs.into_iter().collect::<Vec<_>>()))
            }
        }
        IfMode::Other => format!("{head}: ingen switchport-konfig"),
    }
}

fn carry_of(c: &Config, i: &Interface) -> Carry {
    match i.mode {
        IfMode::Trunk => i.allowed.as_ref().map_or(Carry::All, |v| Carry::Set(v.iter().copied().collect())),
        IfMode::Access => Carry::Set([i.access_vlan.unwrap_or(1)].into()),
        IfMode::Routed => Carry::Set(c.interfaces.iter().filter(|s| s.name.starts_with(&format!("{}.", i.name))).filter_map(|s| s.dot1q).collect()),
        IfMode::Other => Carry::Set(BTreeSet::new()),
    }
}

fn find<'a>(fleet: &'a FleetReport, name: &str) -> Option<&'a Config> {
    fleet.devices.iter().map(|d| &d.config).find(|c| c.display_name() == name)
}

fn build_edge(fleet: &FleetReport, from: usize, to: usize, parent: &str, child: &str) -> Edge {
    let pc = find(fleet, parent);
    let cc = find(fleet, child);
    let pi = pc.and_then(|c| c.interfaces.iter().find(|i| !i.name.contains('.') && i.peer() == Some(child)).map(|i| (c, i)));
    let ci = cc.and_then(|c| c.interfaces.iter().find(|i| !i.name.contains('.') && i.peer() == Some(parent)).map(|i| (c, i)));
    let mut detail: Vec<String> = [pi, ci].into_iter().flatten().map(|(c, i)| iface_text(c, i)).collect();
    // Trunksidan avgör vilka VLAN länken bär, precis som i trädet.
    let shown = match (pi, ci) {
        (Some((_, a)), Some((cb, b))) if a.mode != IfMode::Trunk && b.mode == IfMode::Trunk => Some((cb, b)),
        (Some(a), _) => Some(a),
        (None, Some(b)) => Some(b),
        _ => None,
    };
    let carry = shown.map_or(Carry::Set(BTreeSet::new()), |(c, i)| carry_of(c, i));
    if detail.is_empty() {
        detail.push("Ingen konfig för någon av ändarna".into());
    }
    let errors = fleet
        .cross
        .iter()
        .filter(|f| f.rule == "link" && f.message.contains(parent) && f.message.contains(child))
        .map(|f| f.message.clone())
        .collect();
    Edge { from, to, title: format!("{parent} ⇄ {child}"), detail, errors, carry }
}

pub(crate) fn build_graph(fleet: &FleetReport) -> Graph {
    let configs: Vec<_> = fleet.devices.iter().map(|d| d.config.clone()).collect();
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
    let mut edges = Vec::new();
    for (i, n) in nodes.iter().enumerate() {
        for &k in &n.children {
            edges.push(build_edge(fleet, i, k, &n.label, &nodes[k].label));
        }
    }
    let mut vlans = BTreeSet::new();
    for e in &edges {
        match &e.carry {
            Carry::Set(s) => vlans.extend(s.iter().copied()),
            Carry::All => vlans.extend(fleet.devices.iter().flat_map(|d| d.config.vlans.keys().copied())),
        }
    }
    let bounds = nodes.iter().fold(Rect::NOTHING, |r, n| r.union(Rect::from_center_size(n.pos + Vec2::new(0.0, n.size.y / 2.0), n.size)));
    Graph { nodes, edges, bounds, vlans }
}

/// Länkens kurva som fyra kontrollpunkter och 12 punkter längs den.
fn edge_points(g: &Graph, e: &Edge) -> ([Pos2; 4], Vec<Pos2>) {
    let (n, c) = (&g.nodes[e.from], &g.nodes[e.to]);
    let a = n.pos + Vec2::new(0.0, n.size.y);
    let b = c.pos;
    let mid = (a.y + b.y) / 2.0;
    let pts = [a, Pos2::new(a.x, mid), Pos2::new(b.x, mid), b];
    let sampled = (0..=12)
        .map(|s| {
            let t = s as f32 / 12.0;
            let u = 1.0 - t;
            let w = [u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t];
            Pos2::new(pts.iter().zip(w).map(|(p, w)| p.x * w).sum(), pts.iter().zip(w).map(|(p, w)| p.y * w).sum())
        })
        .collect();
    (pts, sampled)
}

fn hex(c: Color32) -> String {
    format!("#{:02x}{:02x}{:02x}", c.r(), c.g(), c.b())
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// SVG-text för samma noder och kanter som ritas i fliken. Alltid i det ljusa temat så att
/// bilden går att skriva ut och klistra in i dokument.
pub(crate) fn svg(g: &Graph, scores: &std::collections::HashMap<String, u32>) -> String {
    let p = palette(false);
    let m = 30.0;
    let b = g.bounds.expand(m);
    let (w, h) = (b.width().ceil(), b.height().ceil());
    let mut s = String::new();
    s.push_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\" viewBox=\"{} {} {w} {h}\" font-family=\"sans-serif\">\n",
        b.min.x.floor(),
        b.min.y.floor()
    ));
    s.push_str(&format!("<rect x=\"{}\" y=\"{}\" width=\"{w}\" height=\"{h}\" fill=\"{}\"/>\n", b.min.x.floor(), b.min.y.floor(), hex(p.bg)));
    for e in &g.edges {
        let (pts, _) = edge_points(g, e);
        let bad = !e.errors.is_empty();
        let stroke = if bad { hex(theme::sev_color(Severity::Critical, false)) } else { hex(p.accent) };
        s.push_str(&format!(
            "<path d=\"M {:.1} {:.1} C {:.1} {:.1}, {:.1} {:.1}, {:.1} {:.1}\" fill=\"none\" stroke=\"{stroke}\" stroke-width=\"2\"{}><title>{}</title></path>\n",
            pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y,
            if bad { " stroke-dasharray=\"6 4\"" } else { "" },
            esc(&format!("{}\n{}", e.title, e.detail.join("\n")))
        ));
        let c = &g.nodes[e.to];
        if !c.port.is_empty() {
            let mid = (pts[0].y + pts[3].y) / 2.0 + 14.0;
            let lw = c.port.chars().count() as f32 * 7.0 + 12.0;
            s.push_str(&format!(
                "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{lw:.1}\" height=\"18\" rx=\"8\" fill=\"{}\"/>\n<text x=\"{:.1}\" y=\"{:.1}\" font-family=\"monospace\" font-size=\"11.5\" text-anchor=\"middle\" fill=\"{}\">{}</text>\n",
                pts[3].x - lw / 2.0, mid - 9.0, hex(p.raised), pts[3].x, mid + 4.0, hex(p.violet), esc(&c.port)
            ));
        }
    }
    for n in &g.nodes {
        let r = Rect::from_min_size(n.pos - Vec2::new(n.size.x / 2.0, 0.0), n.size);
        let color = match n.kind {
            Some(Kind::Router) => p.accent,
            Some(Kind::Switch) => p.violet,
            _ => p.muted,
        };
        s.push_str(&format!(
            "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{:.1}\" height=\"{:.1}\" rx=\"14\" fill=\"{}\" stroke=\"{}\" stroke-width=\"1.5\"/>\n",
            r.min.x, r.min.y, r.width(), r.height(), hex(p.card), hex(color)
        ));
        s.push_str(&format!("<circle cx=\"{:.1}\" cy=\"{:.1}\" r=\"6\" fill=\"{}\"/>\n", r.min.x + 20.0, r.min.y + 20.0, hex(color)));
        s.push_str(&format!("<text x=\"{:.1}\" y=\"{:.1}\" font-size=\"15\" fill=\"{}\">{}</text>\n", r.min.x + 36.0, r.min.y + 25.0, hex(p.text), esc(&n.label)));
        let sub = match n.kind {
            Some(k) => k.label().to_string(),
            None => n.sub.clone(),
        };
        s.push_str(&format!("<text x=\"{:.1}\" y=\"{:.1}\" font-size=\"12\" fill=\"{}\">{}</text>\n", r.min.x + 36.0, r.min.y + 45.0, hex(p.muted), esc(&sub)));
        if let Some(score) = scores.get(&n.label) {
            let c = r.right_top() + Vec2::new(-26.0, 30.0);
            let sc = theme::score_color(*score, false);
            s.push_str(&format!(
                "<circle cx=\"{:.1}\" cy=\"{:.1}\" r=\"16\" fill=\"{}\" fill-opacity=\"0.18\"/>\n<text x=\"{:.1}\" y=\"{:.1}\" font-size=\"13\" text-anchor=\"middle\" fill=\"{}\">{score}</text>\n",
                c.x, c.y, hex(sc), c.x, c.y + 4.5, hex(sc)
            ));
        }
        let mut y = r.top() + if n.kind.is_some() { 66.0 } else { 52.0 };
        if !n.endpoints.is_empty() {
            s.push_str(&format!("<line x1=\"{:.1}\" y1=\"{:.1}\" x2=\"{:.1}\" y2=\"{:.1}\" stroke=\"{}\"/>\n", r.left() + 12.0, y - 6.0, r.right() - 12.0, y - 6.0, hex(p.line)));
        }
        for (port, name, vlan, down) in &n.endpoints {
            let vc = vlan.map_or(p.muted, |v| theme::vlan_color(v, false));
            let dot = if *down { theme::sev_color(Severity::Critical, false) } else { vc };
            s.push_str(&format!("<circle cx=\"{:.1}\" cy=\"{:.1}\" r=\"4\" fill=\"{}\"/>\n", r.left() + 18.0, y + 6.0, hex(dot)));
            s.push_str(&format!("<text x=\"{:.1}\" y=\"{:.1}\" font-family=\"monospace\" font-size=\"11.5\" fill=\"{}\">{}</text>\n", r.left() + 30.0, y + 10.0, hex(p.muted), esc(port)));
            s.push_str(&format!("<text x=\"{:.1}\" y=\"{:.1}\" font-size=\"12.5\" fill=\"{}\">{}</text>\n", r.left() + 92.0, y + 10.0, hex(p.text), esc(name)));
            if let Some(v) = vlan {
                s.push_str(&format!("<text x=\"{:.1}\" y=\"{:.1}\" font-size=\"11.5\" text-anchor=\"end\" fill=\"{}\">VLAN {v}</text>\n", r.right() - 14.0, y + 10.0, hex(vc)));
            }
            y += 19.0;
        }
    }
    s.push_str("</svg>\n");
    s
}

/// Sparar topologin som `reports/topologi.svg`. Används av knappen i fliken och av exportdialogen.
pub(crate) fn export_svg(app: &mut App) -> Result<std::path::PathBuf, String> {
    let project = app.project.as_ref().ok_or("Inget projekt är öppet")?;
    let g = build_graph(&app.fleet);
    if g.nodes.is_empty() {
        return Err("Inga portbeskrivningar som 'Port mot X' – topologin går inte att rita".into());
    }
    let scores = app.fleet.devices.iter().map(|d| (d.name.clone(), d.score)).collect();
    let path = project.reports().join("topologi.svg");
    std::fs::create_dir_all(project.reports()).and_then(|_| std::fs::write(&path, svg(&g, &scores))).map_err(|e| format!("Kunde inte spara: {e}"))?;
    Ok(path)
}

pub(crate) fn topology_view(app: &mut App, ui: &mut Ui) {
    let dark = app.dark();
    let p = palette(dark);
    let key = vlans::fleet_key(&app.fleet);
    if app.sb.topo.cache.as_ref().is_none_or(|(k, _)| *k != key) {
        app.sb.topo.cache = Some((key, build_graph(&app.fleet)));
    }
    let Some((_, graph)) = app.sb.topo.cache.take() else { return };
    let mut vlan = app.sb.topo.vlan.filter(|v| graph.vlans.contains(v));
    let mut export = false;
    let mut zoom: Option<f32> = None;
    ui.horizontal(|ui| {
        ui.label(RichText::new("Topologi").size(24.0).strong());
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.button("⇩ SVG").on_hover_text("Spara topologin som reports/topologi.svg").clicked() {
                export = true;
            }
            if ui.button("◎ Anpassa").clicked() {
                app.scene_rect = Rect::ZERO;
            }
            if ui.button("+").on_hover_text("Zooma in").clicked() {
                zoom = Some(1.25);
            }
            if ui.button("−").on_hover_text("Zooma ut").clicked() {
                zoom = Some(0.8);
            }
            egui::ComboBox::from_id_salt("topo-vlan")
                .selected_text(vlan.map_or("Alla VLAN".to_string(), |v| format!("VLAN {v}")))
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut vlan, None, "Alla VLAN");
                    for v in &graph.vlans {
                        ui.selectable_value(&mut vlan, Some(*v), format!("VLAN {v}"));
                    }
                });
            ui.label(RichText::new("Visa VLAN").size(12.0).color(p.muted));
            ui.label(RichText::new("Dra för att flytta · Ctrl+scroll eller +/− för att zooma").size(12.0).color(p.muted));
        });
    });
    ui.horizontal(|ui| {
        let bad = graph.edges.iter().filter(|e| !e.errors.is_empty()).count();
        if bad > 0 {
            theme::chip(ui, &format!("⚠ {bad} länk(ar) med fel"), theme::sev_color(Severity::Critical, dark));
        } else {
            theme::chip(ui, "✔ inga fel mellan enheterna", p.good);
        }
        ui.label(RichText::new("Håll muspekaren över en länk för tillåtna VLAN och native.").size(12.0).color(p.muted));
    });
    ui.add_space(8.0);
    if let Some(f) = zoom
        && app.scene_rect.is_positive() && app.sb.topo.view.min_elem() > 0.0 {
            let view = app.sb.topo.view;
            let c = app.scene_rect.center();
            let mut size = app.scene_rect.size() / f;
            let scale = (view / size).min_elem();
            let clamped = scale.clamp(ZOOM_MIN, ZOOM_MAX);
            size *= scale / clamped;
            app.scene_rect = Rect::from_center_size(c, size);
        }
    let scores: std::collections::HashMap<String, u32> = app.fleet.devices.iter().map(|d| (d.name.clone(), d.score)).collect();
    let mut open: Option<String> = None;
    let crit = theme::sev_color(Severity::Critical, dark);
    let mut view_size = app.sb.topo.view;
    egui::Frame::new().fill(p.panel).stroke(Stroke::new(1.0, p.line)).corner_radius(CornerRadius::same(14)).show(ui, |ui| {
        ui.set_min_size(ui.available_size());
        view_size = ui.available_size();
        if graph.nodes.is_empty() {
            ui.centered_and_justified(|ui| ui.label(RichText::new("Inga portbeskrivningar som 'Port mot X' – topologin går inte att rita.").color(p.muted)));
            return;
        }
        let mut rect = app.scene_rect;
        egui::Scene::new().zoom_range(ZOOM_MIN..=ZOOM_MAX).show(ui, &mut rect, |ui| {
            let painter = ui.painter().clone();
            ui.allocate_rect(graph.bounds.expand(40.0), Sense::hover());
            // Kanter: först träffytor (så att hovringen är känd när de ritas), sedan själva linjerna.
            struct Geo {
                pts: [Pos2; 4],
                label: Option<(Rect, String)>,
                hovered: bool,
            }
            let mut geo: Vec<Geo> = Vec::new();
            for (ei, e) in graph.edges.iter().enumerate() {
                let (pts, sampled) = edge_points(&graph, e);
                let c = &graph.nodes[e.to];
                let mid = (pts[0].y + pts[3].y) / 2.0;
                let label = (!c.port.is_empty()).then(|| {
                    let galley = painter.layout_no_wrap(c.port.clone(), FontId::monospace(11.5), p.violet);
                    (Rect::from_center_size(Pos2::new(pts[3].x, mid + 14.0), galley.size() + Vec2::new(12.0, 6.0)), c.port.clone())
                });
                let mut targets: Vec<Rect> = sampled.windows(2).map(|w| Rect::from_two_pos(w[0], w[1]).expand(7.0)).collect();
                targets.extend(label.as_ref().map(|(r, _)| *r));
                let mut hovered = false;
                for (ti, t) in targets.into_iter().enumerate() {
                    let resp = ui.interact(t, ui.scope_id().with(("edge", ei, ti)), Sense::hover());
                    hovered |= resp.hovered();
                    resp.on_hover_ui(|ui| {
                        ui.set_max_width(380.0);
                        ui.label(RichText::new(&e.title).strong());
                        for d in &e.detail {
                            ui.label(RichText::new(d).monospace().size(12.0));
                        }
                        if let Some(v) = vlan {
                            let (t, col) = if e.carry.has(v) { (format!("✔ bär VLAN {v}"), p.good) } else { (format!("Bär inte VLAN {v}"), p.muted) };
                            ui.label(RichText::new(t).color(col));
                        }
                        for m in &e.errors {
                            ui.label(RichText::new(format!("⚠ {m}")).color(crit));
                        }
                    });
                }
                geo.push(Geo { pts, label, hovered });
            }
            for (e, g) in graph.edges.iter().zip(&geo) {
                let bad = !e.errors.is_empty();
                let carries = vlan.is_none_or(|v| e.carry.has(v));
                let base = if bad { crit } else { vlan.map_or(p.accent, |v| theme::vlan_color(v, dark)) };
                let color = if carries { theme::alpha(base, if bad || vlan.is_some() { 0.95 } else { 0.55 }) } else { theme::alpha(p.muted, 0.18) };
                let width = (if g.hovered { 3.5 } else { 2.0 }) + if vlan.is_some() && carries { 1.5 } else { 0.0 };
                if bad {
                    // Streckad röd linje för länkar med fel.
                    let shape = egui::epaint::CubicBezierShape::from_points_stroke(g.pts, false, Color32::TRANSPARENT, Stroke::NONE);
                    let pts = shape.flatten(Some(0.5));
                    painter.extend(egui::Shape::dashed_line(&pts, Stroke::new(width, color), 8.0, 5.0));
                } else {
                    painter.add(egui::epaint::CubicBezierShape::from_points_stroke(g.pts, false, Color32::TRANSPARENT, Stroke::new(width, color)));
                }
                if let Some((r, text)) = &g.label {
                    let tc = if carries { p.violet } else { p.muted };
                    let galley = painter.layout_no_wrap(text.clone(), FontId::monospace(11.5), tc);
                    painter.rect(*r, CornerRadius::same(8), p.raised, if bad { Stroke::new(1.0, crit) } else { Stroke::NONE }, egui::StrokeKind::Inside);
                    painter.galley(r.center() - galley.size() / 2.0, galley, tc);
                    if bad {
                        painter.text(r.right_center() + Vec2::new(10.0, 0.0), Align2::LEFT_CENTER, "⚠", FontId::proportional(14.0), crit);
                    }
                }
            }
            for n in &graph.nodes {
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
                for (port, name, v, down) in &n.endpoints {
                    let hit = vlan.is_none_or(|sel| *v == Some(sel));
                    let vc = v.map_or(p.muted, |v| theme::vlan_color(v, dark));
                    let fade = |c: Color32| if hit { c } else { theme::alpha(c, 0.3) };
                    painter.circle_filled(Pos2::new(r.left() + 18.0, y + 6.0), 4.0, fade(if *down { crit } else { vc }));
                    painter.text(Pos2::new(r.left() + 30.0, y + 6.0), Align2::LEFT_CENTER, port, FontId::monospace(11.5), fade(p.muted));
                    painter.text(Pos2::new(r.left() + 92.0, y + 6.0), Align2::LEFT_CENTER, name, FontId::proportional(12.5), fade(p.text));
                    if let Some(v) = v {
                        painter.text(Pos2::new(r.right() - 14.0, y + 6.0), Align2::RIGHT_CENTER, format!("VLAN {v}"), FontId::proportional(11.5), fade(vc));
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
    app.sb.topo.view = view_size;
    app.sb.topo.vlan = vlan;
    app.sb.topo.cache = Some((key, graph));
    if export {
        match export_svg(app) {
            Ok(path) => app.toast(format!("✔ Sparade {}", path.display())),
            Err(e) => app.error(e),
        }
    }
    if let Some(name) = open
        && let Some(i) = app.fleet.devices.iter().position(|d| d.name == name) {
            app.select_device(i);
            app.tab = Tab::Findings;
        }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vlantool::parser::Config;

    fn fleet(native_b: u16) -> FleetReport {
        let a = "hostname SW-A\ninterface GigabitEthernet0/1\n description Port mot SW-B\n switchport mode trunk\n switchport trunk allowed vlan 10,20\n switchport trunk native vlan 999\n!\n\
                 interface FastEthernet0/1\n description Port mot Dator-1\n switchport mode access\n switchport access vlan 10\n!\n";
        let b = format!("hostname SW-B\ninterface GigabitEthernet0/1\n description Port mot SW-A\n switchport mode trunk\n switchport trunk allowed vlan 10,20\n switchport trunk native vlan {native_b}\n!\n");
        vlantool::audit::audit_fleet(vec![Config::parse("SW-A", "SW-A.cfg", a), Config::parse("SW-B", "SW-B.cfg", &b)], &[])
    }

    #[test]
    fn graph_has_links_with_vlans_and_errors() {
        let ok = build_graph(&fleet(999));
        assert_eq!(ok.edges.len(), 1);
        assert!(ok.edges[0].errors.is_empty());
        assert_eq!(ok.edges[0].carry, Carry::Set([10, 20].into()));
        assert!(ok.edges[0].detail.iter().any(|d| d.contains("native 999")));
        assert!(ok.vlans.contains(&20));
        let bad = build_graph(&fleet(1));
        assert_eq!(bad.edges[0].errors.len(), 1, "olika native-VLAN ska markera länken");
        assert!(bad.edges[0].carry.has(10) && !bad.edges[0].carry.has(30));
    }

    #[test]
    fn svg_is_built_from_the_same_graph() {
        let g = build_graph(&fleet(1));
        let scores = [("SW-A".to_string(), 90u32)].into();
        let s = svg(&g, &scores);
        assert!(s.starts_with("<svg ") && s.trim_end().ends_with("</svg>"));
        assert!(s.contains(">SW-A<") && s.contains(">SW-B<") && s.contains("Dator-1"));
        assert!(s.contains("stroke-dasharray"), "länken med fel ritas streckad");
        assert!(s.contains("VLAN 10"));
        assert_eq!(s.matches("<path ").count(), g.edges.len());
        assert_eq!(esc("a<b&\"c\""), "a&lt;b&amp;&quot;c&quot;");
    }
}
