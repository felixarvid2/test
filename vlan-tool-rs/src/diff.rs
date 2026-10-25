//! Jämför två konfigar rad för rad, t.ex. den sparade mot den som CSV-filerna
//! säger att den borde vara ("drift").

use crate::parser::Config;
use crate::report::Paint;
use similar::{ChangeTag, DiffTag, TextDiff};
use std::collections::BTreeMap;

pub struct Stats {
    pub added: usize,
    pub removed: usize,
}

/// Rader som bara är kommentarer räknas inte som skillnader.
fn clean(text: &str) -> String {
    text.lines().map(str::trim_end).filter(|l| !l.trim().is_empty() && !l.starts_with('!')).collect::<Vec<_>>().join("\n") + "\n"
}

pub fn diff(old_name: &str, old: &str, new_name: &str, new: &str, p: Paint) -> (String, Stats) {
    let (old, new) = (clean(old), clean(new));
    let d = TextDiff::from_lines(&old, &new);
    let mut out = String::new();
    let mut stats = Stats { added: 0, removed: 0 };
    out.push_str(&p.rgb(&format!("--- {old_name}\n"), (240, 110, 120)));
    out.push_str(&p.rgb(&format!("+++ {new_name}\n"), (110, 210, 140)));
    for group in d.grouped_ops(2) {
        let (first, last) = (group.first().unwrap(), group.last().unwrap());
        let (o, n) = (first.old_range().start, first.new_range().start);
        let header = format!("@@ -{},{} +{},{} @@\n", o + 1, last.old_range().end - o, n + 1, last.new_range().end - n);
        out.push_str(&p.rgb(&header, (120, 170, 255)));
        for op in group {
            if op.tag() == DiffTag::Replace {
                let (old_lines, new_lines) = (d.old_slices()[op.old_range()].to_vec(), d.new_slices()[op.new_range()].to_vec());
                let pairs = old_lines.len().min(new_lines.len());
                let marked: Vec<(String, String)> =
                    (0..pairs).map(|i| mark_words(old_lines[i].trim_end_matches('\n'), new_lines[i].trim_end_matches('\n'), p)).collect();
                for (i, l) in old_lines.iter().enumerate() {
                    stats.removed += 1;
                    match marked.get(i) {
                        Some((o, _)) => out.push_str(&format!("{}{o}\n", p.rgb("- ", (240, 110, 120)))),
                        None => out.push_str(&p.rgb(&format!("- {}\n", l.trim_end_matches('\n')), (240, 110, 120))),
                    }
                }
                for (i, l) in new_lines.iter().enumerate() {
                    stats.added += 1;
                    match marked.get(i) {
                        Some((_, n)) => out.push_str(&format!("{}{n}\n", p.rgb("+ ", (110, 210, 140)))),
                        None => out.push_str(&p.rgb(&format!("+ {}\n", l.trim_end_matches('\n')), (110, 210, 140))),
                    }
                }
                continue;
            }
            for change in d.iter_changes(&op) {
                let line = change.value().trim_end_matches('\n');
                match change.tag() {
                    ChangeTag::Delete => {
                        stats.removed += 1;
                        out.push_str(&p.rgb(&format!("- {line}\n"), (240, 110, 120)));
                    }
                    ChangeTag::Insert => {
                        stats.added += 1;
                        out.push_str(&p.rgb(&format!("+ {line}\n"), (110, 210, 140)));
                    }
                    ChangeTag::Equal => out.push_str(&p.dim(&format!("  {line}\n"))),
                }
            }
        }
    }
    (out, stats)
}

/// Färglägger en borttagen och en tillagd rad, med de ord som skiljer fetmarkerade.
/// Utan färg blir raderna oförändrade.
fn mark_words(old: &str, new: &str, p: Paint) -> (String, String) {
    const RED: (u8, u8, u8) = (240, 110, 120);
    const GREEN: (u8, u8, u8) = (110, 210, 140);
    let d = TextDiff::from_words(old, new);
    let (mut o, mut n) = (String::new(), String::new());
    for c in d.iter_all_changes() {
        let v = c.value();
        match c.tag() {
            ChangeTag::Equal => {
                o.push_str(&p.rgb(v, RED));
                n.push_str(&p.rgb(v, GREEN));
            }
            // Blanksteg markeras inte, det ger bara störande remsor.
            ChangeTag::Delete if v.trim().is_empty() => o.push_str(&p.rgb(v, RED)),
            ChangeTag::Insert if v.trim().is_empty() => n.push_str(&p.rgb(v, GREEN)),
            ChangeTag::Delete => o.push_str(&p.bold(&p.rgb(v, RED))),
            ChangeTag::Insert => n.push_str(&p.bold(&p.rgb(v, GREEN))),
        }
    }
    (o, n)
}

/// Jämför två konfigar block för block utan hänsyn till ordningen: ett block (t.ex. ett
/// interface) räknas som ändrat bara om dess rader skiljer sig, inte om det flyttats.
/// Raderna i ett block jämförs också oberoende av ordning. Kommentarer räknas inte.
pub fn diff_semantic(old_name: &str, old: &str, new_name: &str, new: &str, p: Paint) -> (String, Stats) {
    // Rubrik -> rader, i den ordning rubrikerna kommer. Samma rubrik två gånger slås ihop.
    fn blocks(text: &str) -> (Vec<String>, BTreeMap<String, Vec<String>>) {
        let mut order = Vec::new();
        let mut map: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for b in Config::parse("", "", text).blocks {
            let key = b.header.text.trim_end().to_string();
            if !map.contains_key(&key) {
                order.push(key.clone());
            }
            map.entry(key).or_default().extend(b.body.into_iter().map(|l| l.text));
        }
        (order, map)
    }
    let ((old_order, old_map), (new_order, new_map)) = (blocks(old), blocks(new));
    let mut out = String::new();
    let mut stats = Stats { added: 0, removed: 0 };
    let (red, green) = ((240, 110, 120), (110, 210, 140));
    out.push_str(&p.rgb(&format!("--- {old_name}\n"), red));
    out.push_str(&p.rgb(&format!("+++ {new_name}\n"), green));
    for key in &old_order {
        match new_map.get(key) {
            None => {
                stats.removed += 1 + old_map[key].len();
                out.push_str(&p.rgb(&format!("- {key}\n"), red));
                for l in &old_map[key] {
                    out.push_str(&p.rgb(&format!("-  {l}\n"), red));
                }
            }
            Some(nb) => {
                let ob = &old_map[key];
                let gone: Vec<&String> = ob.iter().filter(|l| !nb.contains(l)).collect();
                let came: Vec<&String> = nb.iter().filter(|l| !ob.contains(l)).collect();
                if gone.is_empty() && came.is_empty() {
                    continue;
                }
                out.push_str(&p.rgb(&format!("@@ {key} @@\n"), (120, 170, 255)));
                for l in gone {
                    stats.removed += 1;
                    out.push_str(&p.rgb(&format!("-  {l}\n"), red));
                }
                for l in came {
                    stats.added += 1;
                    out.push_str(&p.rgb(&format!("+  {l}\n"), green));
                }
            }
        }
    }
    for key in new_order.iter().filter(|k| !old_map.contains_key(*k)) {
        stats.added += 1 + new_map[key].len();
        out.push_str(&p.rgb(&format!("+ {key}\n"), green));
        for l in &new_map[key] {
            out.push_str(&p.rgb(&format!("+  {l}\n"), green));
        }
    }
    (out, stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_diff_unchanged_without_color() {
        let (out, st) = diff("a", "hostname A\nip domain-name x.se\n", "b", "hostname A\nip domain-name y.se\n", Paint(false));
        assert!(out.contains("- ip domain-name x.se\n+ ip domain-name y.se\n"), "{out}");
        assert_eq!((st.added, st.removed), (1, 1));
    }

    #[test]
    fn changed_words_are_bold_in_color() {
        let (out, _) = diff("a", "ip address 10.0.0.1 255.255.255.0\n", "b", "ip address 10.0.0.2 255.255.255.0\n", Paint(true));
        assert!(out.contains("\x1b[1m"), "{out:?}");
        // De oförändrade orden är inte fetmarkerade: bara en bit per rad.
        assert_eq!(out.matches("\x1b[1m").count(), 2, "{out:?}");
        let (plain, _) = diff("a", "ip address 10.0.0.1 255.255.255.0\n", "b", "ip address 10.0.0.2 255.255.255.0\n", Paint(false));
        assert!(!plain.contains('\x1b'));
    }

    #[test]
    fn unpaired_replace_lines_are_counted() {
        let (out, st) = diff("a", "a\nb\nc\n", "b", "a\nx\n", Paint(false));
        assert_eq!((st.added, st.removed), (1, 2), "{out}");
    }

    const A: &str = "hostname SW1\ninterface Fa0/1\n switchport mode access\n switchport access vlan 10\n!\ninterface Fa0/2\n switchport access vlan 20\n!\n";

    #[test]
    fn semantic_diff_ignores_order() {
        let b = "interface Fa0/2\n switchport access vlan 20\n!\ninterface Fa0/1\n switchport access vlan 10\n switchport mode access\n!\nhostname SW1\n";
        let (out, st) = diff_semantic("a", A, "b", b, Paint(false));
        assert_eq!((st.added, st.removed), (0, 0), "{out}");
        // Den vanliga diffen ser skillnad.
        assert!(diff("a", A, "b", b, Paint(false)).1.added > 0);
    }

    #[test]
    fn semantic_diff_finds_changes_and_new_blocks() {
        let b = "hostname SW1\ninterface Fa0/1\n switchport mode access\n switchport access vlan 11\n!\ninterface Fa0/3\n shutdown\n!\n";
        let (out, st) = diff_semantic("a", A, "b", b, Paint(false));
        assert!(out.contains("@@ interface Fa0/1 @@"), "{out}");
        assert!(out.contains("-  switchport access vlan 10"));
        assert!(out.contains("+  switchport access vlan 11"));
        assert!(out.contains("- interface Fa0/2"));
        assert!(out.contains("+ interface Fa0/3"));
        // vlan 10 ut, vlan 11 in, Fa0/2 + 1 rad ut, Fa0/3 + 1 rad in
        assert_eq!((st.added, st.removed), (3, 3), "{out}");
    }
}
