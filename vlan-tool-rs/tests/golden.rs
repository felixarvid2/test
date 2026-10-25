//! Golden-test: konfigarna som byggs från gruppens CSV-filer jämförs med sparade
//! facit i `tests/golden/`. Ändras generatorn med flit körs testet med
//! `UPDATE_GOLDEN=1 cargo test --test golden` och de nya filerna granskas i diffen.

use std::path::PathBuf;
use vlantool::{generator, inventory::Inventory, settings::Settings};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn generated_configs_match_golden_files() {
    let inv = Inventory::load_dir(&root().join("samples")).unwrap();
    let generated = generator::generate_all(&inv, &Settings::default()).unwrap();
    let dir = root().join("tests/golden");
    let update = std::env::var_os("UPDATE_GOLDEN").is_some();
    let mut differs = Vec::new();
    for g in &generated {
        let path = dir.join(format!("{}.cfg", g.hostname));
        // Versionsraden ändras vid varje release och jämförs inte.
        let text = g.text.replace(env!("CARGO_PKG_VERSION"), "<version>") + "\n";
        if update {
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(&path, &text).unwrap();
            continue;
        }
        let expected =
            std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("facit saknas: {} (kör med UPDATE_GOLDEN=1)", path.display()));
        if expected != text {
            let first = expected.lines().zip(text.lines()).position(|(a, b)| a != b).map_or(0, |i| i + 1);
            differs.push(format!("{} (första skillnaden på rad {first})", g.hostname));
        }
    }
    assert!(differs.is_empty(), "genererade konfigar skiljer sig från facit: {differs:?}. Kör UPDATE_GOLDEN=1 om ändringen är avsiktlig.");
    let golden_files = std::fs::read_dir(&dir).map(|d| d.count()).unwrap_or(0);
    assert_eq!(golden_files, generated.len(), "facit och genererade enheter ska vara lika många");
}
