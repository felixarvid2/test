//! Jämför två konfigar rad för rad, t.ex. den sparade mot den som CSV-filerna
//! säger att den borde vara ("drift").

use crate::report::Paint;
use similar::{ChangeTag, TextDiff};

pub struct Stats {
    pub added: usize,
    pub removed: usize,
}

/// Rader som bara är kommentarer räknas inte som skillnader.
fn clean(text: &str) -> String {
    text.lines()
        .map(str::trim_end)
        .filter(|l| !l.trim().is_empty() && !l.starts_with('!'))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
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
        let header = format!(
            "@@ -{},{} +{},{} @@\n",
            o + 1,
            last.old_range().end - o,
            n + 1,
            last.new_range().end - n
        );
        out.push_str(&p.rgb(&header, (120, 170, 255)));
        for op in group {
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
