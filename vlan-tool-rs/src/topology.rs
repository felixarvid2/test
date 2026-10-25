//! Ritar nätet som ett träd utifrån portbeskrivningarna ("Port mot X").

use crate::inventory::short_port;
use crate::parser::{Config, IfMode, Interface, Kind};
use std::collections::{BTreeMap, BTreeSet, HashMap};

pub struct TreeLine {
    /// Trädgrenar, t.ex. "│  ├─ ".
    pub prefix: String,
    pub port: String,
    pub peer: String,
    /// True om andra änden är en enhet vi har konfig för.
    pub device: bool,
    pub kind: Option<Kind>,
    pub info: String,
    pub down: bool,
}

/// Bygger trädet med routern (eller första enheten) som rot.
pub fn tree(configs: &[Config]) -> Vec<TreeLine> {
    let by_name: HashMap<&str, &Config> = configs.iter().map(|c| (c.display_name(), c)).collect();
    let mut out = Vec::new();
    let mut visited: BTreeSet<String> = BTreeSet::new();
    let mut roots: Vec<&Config> = configs.iter().filter(|c| c.kind == Kind::Router).collect();
    roots.extend(configs.iter().filter(|c| c.kind != Kind::Router));
    for root in roots {
        if visited.contains(root.display_name()) {
            continue;
        }
        visited.insert(root.display_name().to_string());
        out.push(TreeLine {
            prefix: String::new(),
            port: String::new(),
            peer: root.display_name().to_string(),
            device: true,
            kind: Some(root.kind),
            info: String::new(),
            down: false,
        });
        walk(root, "", &by_name, &mut visited, &mut out);
    }
    out
}

fn walk(c: &Config, indent: &str, by_name: &HashMap<&str, &Config>, visited: &mut BTreeSet<String>, out: &mut Vec<TreeLine>) {
    // Bara fysiska portar med en granne i beskrivningen, och inte tillbaka uppåt i trädet.
    let children: Vec<_> = c
        .interfaces
        .iter()
        .filter(|i| !i.name.contains('.') && i.svi_vlan().is_none())
        .filter_map(|i| i.peer().map(|p| (i, p)))
        .filter(|(_, p)| !(by_name.contains_key(p) && visited.contains(*p)))
        .collect();
    for (n, (i, peer)) in children.iter().enumerate() {
        let last = n + 1 == children.len();
        let branch = if last { "└─ " } else { "├─ " };
        let other = by_name.get(peer).copied();
        let back = other.and_then(|o| o.interfaces.iter().find(|j| j.peer() == Some(c.display_name())));
        let port = match back {
            Some(b) => format!("{} ⇄ {}", short_port(&i.name), short_port(&b.name)),
            None => short_port(&i.name),
        };
        let subs = c.interfaces.iter().filter(|s| s.name.starts_with(&format!("{}.", i.name))).count();
        // Visa trunksidans VLAN även när porten här är routerns (router-on-a-stick).
        let shown = match back {
            Some(b) if i.mode != IfMode::Trunk && b.mode == IfMode::Trunk => b,
            _ => *i,
        };
        let info = match shown.mode {
            _ if subs > 0 && shown.mode != IfMode::Trunk => format!("{subs} subinterface"),
            IfMode::Trunk => format!("trunk {}", shown.allowed.as_ref().map_or("alla".into(), |v| crate::inventory::join_vlans(v))),
            IfMode::Access => format!("vlan {}", shown.access_vlan.unwrap_or(1)),
            IfMode::Routed => shown.ip.map_or("routad".into(), |(a, _)| a.to_string()),
            IfMode::Other => String::new(),
        };
        out.push(TreeLine {
            prefix: format!("{indent}{branch}"),
            port,
            peer: peer.to_string(),
            device: other.is_some(),
            kind: other.map(|o| o.kind),
            info,
            down: i.shutdown,
        });
        if let Some(o) = other {
            visited.insert(peer.to_string());
            let next = format!("{indent}{}", if last { "   " } else { "│  " });
            walk(o, &next, by_name, visited, out);
        }
    }
}

pub fn render(configs: &[Config], p: crate::report::Paint) -> String {
    let mut s = String::new();
    if !configs.iter().any(|c| c.interfaces.iter().any(|i| i.peer().is_some())) {
        s.push_str(&p.dim("  (Inga portbeskrivningar som 'Port mot X' – topologin går inte att rita.)\n"));
    }
    for l in tree(configs) {
        let icon = match l.kind {
            Some(Kind::Router) => "◉",
            Some(Kind::Switch) => "▣",
            Some(Kind::Unknown) => "◇",
            None => "○",
        };
        let name = if l.device { p.bold(&p.accent(&format!("{icon} {}", l.peer))) } else { format!("{icon} {}", l.peer) };
        let kind = l.kind.filter(|_| l.device).map(|k| p.dim(&format!(" ({})", k.label()))).unwrap_or_default();
        let port = if l.port.is_empty() { String::new() } else { format!("{} ", p.rgb(&l.port, (200, 170, 255))) };
        let down = if l.down { p.rgb("  [avstängd]", (240, 80, 90)) } else { String::new() };
        s.push_str(&format!("  {}{port}{name}{kind}  {}{down}\n", p.dim(&l.prefix), p.dim(&l.info)));
    }
    s
}

// ---------------------------------------------------------------------------
// Länklista, Graphviz, Mermaid och slingor
// ---------------------------------------------------------------------------

/// En länk mellan två portar, platt (till skillnad från trädet som bara visar en väg).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Edge {
    pub a: String,
    pub a_port: String,
    pub b: String,
    /// None = ingen port tillbaka (andra änden saknar konfig eller pekar inte hit).
    pub b_port: Option<String>,
    /// True om `b` är en enhet vi har konfig för.
    pub b_device: bool,
    pub info: String,
}

fn link_info(i: &Interface, back: Option<&Interface>) -> String {
    // Visa trunksidans VLAN även när den här porten är routerns.
    let shown = match back {
        Some(b) if i.mode != IfMode::Trunk && b.mode == IfMode::Trunk => b,
        _ => i,
    };
    match shown.mode {
        IfMode::Trunk => format!("trunk {}", shown.allowed.as_ref().map_or("alla".into(), |v| crate::inventory::join_vlans(v))),
        IfMode::Access => format!("vlan {}", shown.access_vlan.unwrap_or(1)),
        IfMode::Routed => shown.ip.map_or("routad".into(), |(a, _)| a.to_string()),
        IfMode::Other => String::new(),
    }
}

/// Alla länkar i nätet, varje länk en gång. Flera portar mellan samma två enheter ger flera
/// länkar (de paras ihop i ordning).
pub fn edges(configs: &[Config]) -> Vec<Edge> {
    let by_name: HashMap<&str, &Config> = configs.iter().map(|c| (c.display_name(), c)).collect();
    let toward = |c: &Config, peer: &str| -> Vec<Interface> {
        c.interfaces.iter().filter(|i| !i.name.contains('.') && i.svi_vlan().is_none() && i.peer() == Some(peer)).cloned().collect()
    };
    let mut out = Vec::new();
    let mut done: BTreeSet<(String, String)> = BTreeSet::new();
    for c in configs {
        let me = c.display_name();
        for i in c.interfaces.iter().filter(|i| !i.name.contains('.') && i.svi_vlan().is_none()) {
            let Some(peer) = i.peer() else { continue };
            if peer == me {
                continue;
            }
            let Some(other) = by_name.get(peer) else {
                out.push(Edge {
                    a: me.into(),
                    a_port: short_port(&i.name),
                    b: peer.into(),
                    b_port: None,
                    b_device: false,
                    info: link_info(i, None),
                });
                continue;
            };
            let a_ports = toward(c, peer);
            let b_ports = toward(other, me);
            // Paret tas från den alfabetiskt första sidan, eller från den enda sidan som pekar.
            if !(me < peer || b_ports.is_empty()) || !done.insert((me.to_string(), peer.to_string())) {
                continue;
            }
            for n in 0..a_ports.len().max(b_ports.len()) {
                match (a_ports.get(n), b_ports.get(n)) {
                    (Some(x), Some(y)) => out.push(Edge {
                        a: me.into(),
                        a_port: short_port(&x.name),
                        b: peer.into(),
                        b_port: Some(short_port(&y.name)),
                        b_device: true,
                        info: link_info(x, Some(y)),
                    }),
                    (Some(x), None) => out.push(Edge {
                        a: me.into(),
                        a_port: short_port(&x.name),
                        b: peer.into(),
                        b_port: None,
                        b_device: true,
                        info: link_info(x, None),
                    }),
                    (None, Some(y)) => out.push(Edge {
                        a: peer.into(),
                        a_port: short_port(&y.name),
                        b: me.into(),
                        b_port: None,
                        b_device: true,
                        info: link_info(y, None),
                    }),
                    (None, None) => {}
                }
            }
        }
    }
    out
}

/// Länkar som sluter en slinga (redundanta vägar mellan samma enheter). Varje returnerad länk
/// är den som gör att nätet inte längre är ett träd; utan spanning-tree blir de en loop.
pub fn loops(configs: &[Config]) -> Vec<Edge> {
    fn find(parent: &mut HashMap<String, String>, x: &str) -> String {
        let p = parent.get(x).cloned().unwrap_or_else(|| x.to_string());
        if p == x {
            return p;
        }
        let root = find(parent, &p);
        parent.insert(x.to_string(), root.clone());
        root
    }
    let mut parent: HashMap<String, String> = HashMap::new();
    let mut out = Vec::new();
    for e in edges(configs).into_iter().filter(|e| e.b_device && e.b_port.is_some()) {
        let (ra, rb) = (find(&mut parent, &e.a), find(&mut parent, &e.b));
        if ra == rb {
            out.push(e);
        } else {
            parent.insert(ra, rb);
        }
    }
    out
}

fn dot_esc(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Nätet som Graphviz (`dot -Tsvg`). Enheter utan konfig ritas streckade.
pub fn dot(configs: &[Config]) -> String {
    let mut s = String::from(
        "graph vlantool {\n  graph [overlap=false, splines=true];\n  node [fontname=\"Helvetica\"];\n  edge [fontname=\"Helvetica\", fontsize=10];\n",
    );
    let es = edges(configs);
    for c in configs {
        let shape = match c.kind {
            Kind::Router => "shape=doubleoctagon",
            Kind::Switch => "shape=box",
            Kind::Unknown => "shape=ellipse",
        };
        s.push_str(&format!(
            "  \"{}\" [{shape}, label=\"{}\\n{}\"];\n",
            dot_esc(c.display_name()),
            dot_esc(c.display_name()),
            c.kind.label()
        ));
    }
    let known: BTreeSet<&str> = configs.iter().map(|c| c.display_name()).collect();
    let mut external: BTreeSet<&str> = BTreeSet::new();
    for e in &es {
        if !known.contains(e.b.as_str()) {
            external.insert(&e.b);
        }
    }
    for n in external {
        s.push_str(&format!("  \"{}\" [shape=ellipse, style=dashed];\n", dot_esc(n)));
    }
    for e in &es {
        let mut attrs = format!("taillabel=\"{}\"", dot_esc(&e.a_port));
        if let Some(bp) = &e.b_port {
            attrs.push_str(&format!(", headlabel=\"{}\"", dot_esc(bp)));
        }
        if !e.info.is_empty() {
            attrs.push_str(&format!(", label=\"{}\"", dot_esc(&e.info)));
        }
        s.push_str(&format!("  \"{}\" -- \"{}\" [{attrs}];\n", dot_esc(&e.a), dot_esc(&e.b)));
    }
    s.push_str("}\n");
    s
}

/// Nätet som Mermaid-diagram (för Markdown på GitHub/GitLab).
pub fn mermaid(configs: &[Config]) -> String {
    let es = edges(configs);
    let mut ids: BTreeMap<String, usize> = BTreeMap::new();
    let mut s = String::from("graph TD\n");
    let q = |t: &str| t.replace('"', "#quot;");
    let mut node = |name: &str, kind: Option<Kind>, s: &mut String| {
        if ids.contains_key(name) {
            return;
        }
        let id = ids.len();
        ids.insert(name.to_string(), id);
        let shape = match kind {
            Some(Kind::Router) => format!("n{id}{{{{\"{}\"}}}}", q(name)),
            Some(Kind::Switch) => format!("n{id}[\"{}\"]", q(name)),
            Some(Kind::Unknown) => format!("n{id}(\"{}\")", q(name)),
            None => format!("n{id}([\"{}\"])", q(name)),
        };
        s.push_str(&format!("  {shape}\n"));
    };
    for c in configs {
        node(c.display_name(), Some(c.kind), &mut s);
    }
    for e in &es {
        node(&e.b, None, &mut s);
    }
    for e in &es {
        let ports = match &e.b_port {
            Some(bp) => format!("{} ⇄ {bp}", e.a_port),
            None => e.a_port.clone(),
        };
        let label = if e.info.is_empty() { ports } else { format!("{ports}<br/>{}", e.info) };
        s.push_str(&format!("  n{} ---|\"{}\"| n{}\n", ids[&e.a], q(&label), ids[&e.b]));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    const R: &str = "hostname R1\ninterface Gi0/0\n description Trunk mot SW1\n ip address 10.0.0.1 255.255.255.0\n!\ninterface Gi0/0.10\n encapsulation dot1Q 10\n ip address 10.10.0.1 255.255.255.0\n!\n";
    const SW1: &str = "hostname SW1\nvlan 10\ninterface Gi0/1\n description Trunk mot R1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\ninterface Gi0/2\n description Trunk mot SW2\n switchport mode trunk\n!\ninterface Fa0/1\n description Port mot PC1\n switchport mode access\n switchport access vlan 10\n!\n";
    const SW2: &str = "hostname SW2\nvlan 10\ninterface Gi0/1\n description Trunk mot SW1\n switchport mode trunk\n!\n";

    fn net(extra_sw2: &str) -> Vec<Config> {
        vec![Config::parse("r", "r", R), Config::parse("s1", "s1", SW1), Config::parse("s2", "s2", &format!("{SW2}{extra_sw2}"))]
    }

    #[test]
    fn edges_list_each_link_once() {
        let es = edges(&net(""));
        assert_eq!(es.len(), 3, "{es:?}");
        assert!(es.iter().any(|e| e.a == "R1" && e.b == "SW1" && e.b_port.as_deref() == Some("Gi0/1") && e.info == "trunk 10"));
        let pc = es.iter().find(|e| e.b == "PC1").unwrap();
        assert!(!pc.b_device && pc.b_port.is_none());
        assert!(loops(&net("")).is_empty());
    }

    #[test]
    fn redundant_link_is_a_loop() {
        let extra = "interface Gi0/2\n description Trunk mot SW1\n switchport mode trunk\n!\n";
        let sw1_extra = format!("{SW1}interface Gi0/3\n description Trunk mot SW2\n switchport mode trunk\n!\n");
        let cfgs =
            vec![Config::parse("r", "r", R), Config::parse("s1", "s1", &sw1_extra), Config::parse("s2", "s2", &format!("{SW2}{extra}"))];
        let l = loops(&cfgs);
        assert_eq!(l.len(), 1, "{l:?}");
        assert_eq!((l[0].a.as_str(), l[0].b.as_str()), ("SW1", "SW2"));
    }

    #[test]
    fn triangle_is_a_loop() {
        let a = "hostname A\ninterface Gi0/1\n description Trunk mot B\n switchport mode trunk\n!\ninterface Gi0/2\n description Trunk mot C\n switchport mode trunk\n!\n";
        let b = "hostname B\ninterface Gi0/1\n description Trunk mot A\n switchport mode trunk\n!\ninterface Gi0/2\n description Trunk mot C\n switchport mode trunk\n!\n";
        let c = "hostname C\ninterface Gi0/1\n description Trunk mot A\n switchport mode trunk\n!\ninterface Gi0/2\n description Trunk mot B\n switchport mode trunk\n!\n";
        let cfgs = [Config::parse("a", "a", a), Config::parse("b", "b", b), Config::parse("c", "c", c)];
        assert_eq!(edges(&cfgs).len(), 3);
        assert_eq!(loops(&cfgs).len(), 1);
    }

    #[test]
    fn dot_output_has_nodes_and_edges() {
        let d = dot(&net(""));
        assert!(d.starts_with("graph vlantool {"));
        assert!(d.trim_end().ends_with('}'));
        assert!(d.contains("\"R1\" [shape=doubleoctagon"));
        assert!(d.contains("\"PC1\" [shape=ellipse, style=dashed]"));
        assert!(d.contains("\"R1\" -- \"SW1\" [taillabel=\"Gi0/0\", headlabel=\"Gi0/1\", label=\"trunk 10\"]"));
        assert_eq!(dot_esc("a\"b\\c"), "a\\\"b\\\\c");
    }

    #[test]
    fn mermaid_output_has_nodes_and_edges() {
        let m = mermaid(&net(""));
        assert!(m.starts_with("graph TD\n"));
        assert!(m.contains("n0{{\"R1\"}}"));
        assert!(m.contains("n1[\"SW1\"]"));
        assert!(m.contains("([\"PC1\"])"));
        assert!(m.contains("n0 ---|\"Gi0/0 ⇄ Gi0/1<br/>trunk 10\"| n1"));
    }
}
