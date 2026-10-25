//! Filarbete i projektmappen utan fönster: bevakning av ändringar (165), säkerhetskopia
//! av configs/ (166), släppta filer (168) och ignorera-kommentaren i konfigar (139).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Ändringstid och storlek för filerna direkt i några mappar.
pub type Stamp = BTreeMap<PathBuf, (Option<SystemTime>, u64)>;

pub fn scan(dirs: &[PathBuf]) -> Stamp {
    let mut stamp = Stamp::new();
    for dir in dirs {
        let Ok(rd) = std::fs::read_dir(dir) else { continue };
        for e in rd.flatten() {
            if let Ok(meta) = e.metadata()
                && meta.is_file()
            {
                stamp.insert(e.path(), (meta.modified().ok(), meta.len()));
            }
        }
    }
    stamp
}

const KEEP_BACKUPS: usize = 20;

/// Kopierar de konfigar som `new` skulle skriva över (och som skiljer sig) till
/// `<configs>/.backup/<stämpel>/`. Ger antalet kopierade filer; inget skapas om inget ändras.
pub fn backup_configs(configs: &Path, new: &[(String, String)], stamp: &str) -> std::io::Result<usize> {
    let mut copied = 0;
    let target = configs.join(".backup").join(stamp);
    for (name, text) in new {
        let old = configs.join(name);
        let Ok(old_text) = std::fs::read_to_string(&old) else { continue };
        if old_text == *text {
            continue;
        }
        std::fs::create_dir_all(&target)?;
        std::fs::write(target.join(name), old_text)?;
        copied += 1;
    }
    if copied > 0 {
        let mut dirs: Vec<PathBuf> =
            std::fs::read_dir(configs.join(".backup"))?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
        dirs.sort();
        let excess = dirs.len().saturating_sub(KEEP_BACKUPS);
        for old in &dirs[..excess] {
            let _ = std::fs::remove_dir_all(old);
        }
    }
    Ok(copied)
}

pub fn is_config_file(path: &Path) -> bool {
    path.extension().is_some_and(|e| ["cfg", "txt", "conf"].iter().any(|x| e.eq_ignore_ascii_case(x)))
}

/// Kopierar släppta konfigfiler till `configs/`. Finns namnet redan får filen ett
/// löpnummer (`SW-1-2.cfg`) så att inget skrivs över. Ger (kopierade, överhoppade).
pub fn copy_dropped(configs: &Path, files: &[PathBuf]) -> (Vec<String>, Vec<String>) {
    let (mut copied, mut skipped) = (Vec::new(), Vec::new());
    for f in files {
        let name = f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if !f.is_file() || !is_config_file(f) {
            skipped.push(name);
            continue;
        }
        if std::fs::create_dir_all(configs).is_err() {
            skipped.push(name);
            continue;
        }
        let stem = f.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let ext = f.extension().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let mut target = configs.join(&name);
        let mut n = 1;
        while target.exists() {
            n += 1;
            target = configs.join(format!("{stem}-{n}.{ext}"));
        }
        match std::fs::copy(f, &target) {
            Ok(_) => copied.push(target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()),
            Err(_) => skipped.push(name),
        }
    }
    (copied, skipped)
}

/// Lägger `! vlantool:ignore <regel>` efter den första `!`-raden i konfigen (eller överst om
/// det inte finns någon). Ger `None` om regeln redan är ignorerad.
pub fn insert_ignore(text: &str, rule: &str) -> Option<String> {
    let comment = format!("! vlantool:ignore {rule}");
    if text.lines().any(|l| l.trim() == comment) {
        return None;
    }
    let mut out = String::with_capacity(text.len() + comment.len() + 1);
    let mut done = false;
    for line in text.split_inclusive('\n') {
        out.push_str(line);
        if !done && line.starts_with('!') {
            if !line.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(&comment);
            out.push('\n');
            done = true;
        }
    }
    if !done {
        out = format!("{comment}\n{text}");
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("vlantool-files-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn ignore_comment_goes_after_first_bang_line() {
        let t = "!\nhostname R1\n!\ninterface Fa0/1\n";
        let out = insert_ignore(t, "ssh").unwrap();
        assert_eq!(out, "!\n! vlantool:ignore ssh\nhostname R1\n!\ninterface Fa0/1\n");
        assert!(insert_ignore(&out, "ssh").is_none(), "samma regel två gånger ska inte ge två rader");
        let twice = insert_ignore(&out, "ntp").unwrap();
        assert!(twice.starts_with("!\n! vlantool:ignore ntp\n! vlantool:ignore ssh\n"));
        // utan !-rad hamnar den överst
        assert_eq!(insert_ignore("hostname R1\n", "ssh").unwrap(), "! vlantool:ignore ssh\nhostname R1\n");
        // sista raden utan radslut
        assert_eq!(insert_ignore("! x", "a").unwrap(), "! x\n! vlantool:ignore a\n");
    }

    #[test]
    fn scan_notices_changed_files() {
        let d = tmp("scan");
        std::fs::write(d.join("a.cfg"), "one").unwrap();
        let before = scan(std::slice::from_ref(&d));
        assert_eq!(before, scan(std::slice::from_ref(&d)));
        std::fs::write(d.join("a.cfg"), "three").unwrap();
        assert_ne!(before, scan(std::slice::from_ref(&d)), "ny storlek ska synas");
        std::fs::write(d.join("b.cfg"), "x").unwrap();
        assert_eq!(scan(std::slice::from_ref(&d)).len(), 2);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn backup_only_copies_changed_files() {
        let d = tmp("backup");
        std::fs::write(d.join("A.cfg"), "old\n").unwrap();
        std::fs::write(d.join("B.cfg"), "same\n").unwrap();
        let new = vec![("A.cfg".into(), "new\n".into()), ("B.cfg".into(), "same\n".into()), ("C.cfg".into(), "fresh\n".into())];
        assert_eq!(backup_configs(&d, &new, "20260101-000000").unwrap(), 1);
        assert_eq!(std::fs::read_to_string(d.join(".backup/20260101-000000/A.cfg")).unwrap(), "old\n");
        assert!(!d.join(".backup/20260101-000000/B.cfg").exists());
        assert_eq!(backup_configs(&d, &[("B.cfg".into(), "same\n".into())], "20260101-000001").unwrap(), 0);
        assert!(!d.join(".backup/20260101-000001").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn dropped_files_are_copied_without_overwriting() {
        let d = tmp("drop");
        let src = d.join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("SW.cfg"), "a").unwrap();
        std::fs::write(src.join("notes.md"), "b").unwrap();
        let configs = d.join("configs");
        let files = vec![src.join("SW.cfg"), src.join("notes.md"), src.join("saknas.cfg")];
        let (ok, skipped) = copy_dropped(&configs, &files);
        assert_eq!(ok, vec!["SW.cfg"]);
        assert_eq!(skipped, vec!["notes.md", "saknas.cfg"]);
        let (ok, _) = copy_dropped(&configs, &files[..1]);
        assert_eq!(ok, vec!["SW-2.cfg"]);
        assert_eq!(std::fs::read_to_string(configs.join("SW.cfg")).unwrap(), "a");
        let _ = std::fs::remove_dir_all(&d);
    }
}
