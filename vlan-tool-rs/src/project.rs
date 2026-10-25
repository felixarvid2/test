//! En projektmapp: CSV-filer i `samples/`, genererade konfigar i `configs/`,
//! rapporter i `reports/` och inställningar i `nordvik.toml`.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

/// Gruppens exempelfiler, inbyggda i programmet så att det fungerar direkt efter installation.
pub const EXAMPLE_FILES: &[(&str, &str)] = &[
    ("samples/ports.csv", include_str!("../samples/ports.csv")),
    ("samples/dhcp.csv", include_str!("../samples/dhcp.csv")),
    ("samples/devices.csv", include_str!("../samples/devices.csv")),
    ("examples-cfg/good.cfg", include_str!("../examples-cfg/good.cfg")),
    ("examples-cfg/bad.cfg", include_str!("../examples-cfg/bad.cfg")),
    ("examples-cfg/good_router.cfg", include_str!("../examples-cfg/good_router.cfg")),
    ("examples-cfg/bad_router.cfg", include_str!("../examples-cfg/bad_router.cfg")),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub root: PathBuf,
}

impl Project {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Project { root: root.into() }
    }

    pub fn samples(&self) -> PathBuf {
        self.root.join("samples")
    }

    pub fn configs(&self) -> PathBuf {
        self.root.join("configs")
    }

    pub fn reports(&self) -> PathBuf {
        self.root.join("reports")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.root.join("nordvik.toml")
    }

    /// Ser mappen ut som ett projekt (har CSV-filer eller konfigar)?
    pub fn looks_valid(dir: &Path) -> bool {
        let has = |sub: &str, ext: &str| {
            std::fs::read_dir(dir.join(sub)).map(|d| d.flatten().any(|e| e.path().extension().is_some_and(|x| x == ext))).unwrap_or(false)
        };
        has("samples", "csv") || has("configs", "cfg")
    }

    /// Skapar ett exempelprojekt med gruppens filer. Befintliga filer skrivs inte över.
    pub fn create_example(root: &Path) -> Result<Project> {
        for (rel, text) in EXAMPLE_FILES {
            let path = root.join(rel);
            if path.exists() {
                continue;
            }
            std::fs::create_dir_all(path.parent().unwrap())?;
            std::fs::write(&path, text).with_context(|| format!("kunde inte skapa {}", path.display()))?;
        }
        Ok(Project::new(root))
    }
}
