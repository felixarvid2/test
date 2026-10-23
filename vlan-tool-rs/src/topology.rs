//! Ritar nätet som ett träd utifrån portbeskrivningarna ("Port mot X").

use crate::inventory::short_port;
use crate::parser::{Config, IfMode, Kind};
use std::collections::{BTreeSet, HashMap};

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
