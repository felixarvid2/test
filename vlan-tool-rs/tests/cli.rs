//! Integrationstester som kör den färdiga binären i en temporär katalog.
//! De kontrollerar exitkoder, vilka filer som skapas och att JSON går att tolka,
//! inte exakta texter.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// En egen temporär katalog som städas när testet är klart.
struct Work(PathBuf);

impl Work {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("vlantool-cli-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        Work(dir)
    }

    /// Som `new`, men med gruppens CSV-filer kopierade till `samples/`.
    fn with_samples(name: &str) -> Self {
        let w = Work::new(name);
        let dst = w.0.join("samples");
        fs::create_dir_all(&dst).unwrap();
        for entry in fs::read_dir(Path::new(env!("CARGO_MANIFEST_DIR")).join("samples")).unwrap() {
            let p = entry.unwrap().path();
            fs::copy(&p, dst.join(p.file_name().unwrap())).unwrap();
        }
        w
    }

    fn run(&self, args: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_vlantool"))
            .args(args)
            .arg("--no-color")
            .current_dir(&self.0)
            .env("NO_COLOR", "1")
            .output()
            .expect("kunde inte starta vlantool")
    }

    fn code(&self, args: &[&str]) -> i32 {
        self.run(args).status.code().expect("avslutades av signal")
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.0.join(rel)
    }
}

impl Drop for Work {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn example_cfg(name: &str) -> String {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("examples-cfg").join(name).display().to_string()
}

#[test]
fn generate_creates_one_config_per_device() {
    let w = Work::with_samples("generate");
    assert_eq!(w.code(&["generate"]), 0);
    for name in ["R-Nordvik-1", "SW-Nordvik-1", "SW-Nordvik-2"] {
        let text = fs::read_to_string(w.path(&format!("configs/{name}.cfg"))).unwrap();
        assert!(text.contains(&format!("hostname {name}")), "{name} saknar hostname");
    }
}

#[test]
fn generate_dry_run_writes_nothing() {
    let w = Work::with_samples("dry-run");
    assert_eq!(w.code(&["generate", "--dry-run"]), 0);
    assert!(!w.path("configs").exists());
}

#[test]
fn generate_without_samples_fails() {
    let w = Work::new("no-samples");
    assert_eq!(w.code(&["generate"]), 1);
}

#[test]
fn validate_passes_on_samples_and_fails_without_them() {
    let w = Work::with_samples("validate");
    assert_eq!(w.code(&["validate"]), 0);
    let empty = Work::new("validate-empty");
    assert_eq!(empty.code(&["validate"]), 1);
}

#[test]
fn validate_exits_2_on_serious_csv_error() {
    let w = Work::with_samples("validate-bad");
    // Samma port två gånger på samma switch är ett allvarligt fel.
    let ports = w.path("samples/ports.csv");
    let text = fs::read_to_string(&ports).unwrap();
    let row = text.lines().nth(1).unwrap().to_string();
    fs::write(&ports, format!("{text}{row}\n")).unwrap();
    assert_eq!(w.code(&["validate"]), 2);
}

#[test]
fn audit_of_generated_configs_respects_fail_on() {
    let w = Work::with_samples("audit");
    assert_eq!(w.code(&["generate"]), 0);
    assert_eq!(w.code(&["audit"]), 0);
    assert_eq!(w.code(&["audit", "--fail-on", "high"]), 0);
    assert_eq!(w.code(&["audit", "--fail-on", "critical"]), 0);
}

#[test]
fn audit_of_bad_config_fails_on_high() {
    let w = Work::new("audit-bad");
    let bad = example_cfg("bad.cfg");
    assert_eq!(w.code(&["audit", &bad]), 0);
    assert_eq!(w.code(&["audit", &bad, "--fail-on", "high"]), 2);
}

#[test]
fn audit_without_configs_or_with_unknown_rule_fails() {
    let w = Work::new("audit-errors");
    assert_eq!(w.code(&["audit", "finns-inte.cfg"]), 1);
    assert_eq!(w.code(&["audit", &example_cfg("good.cfg"), "-r", "regel-som-inte-finns"]), 1);
}

#[test]
fn audit_json_parses() {
    let w = Work::new("audit-json");
    let out = w.run(&["audit", &example_cfg("bad.cfg"), &example_cfg("good.cfg"), "--format", "json"]);
    assert_eq!(out.status.code(), Some(0));
    let json: serde_json::Value = serde_json::from_slice(&out.stdout).expect("JSON går inte att tolka");
    let devices = json["devices"].as_array().expect("devices saknas");
    assert_eq!(devices.len(), 2);
    assert!(devices.iter().all(|d| d["score"].is_number()));
}

#[test]
fn audit_output_file_is_written() {
    let w = Work::new("audit-output");
    let out = w.path("rapport.json");
    let status = w.code(&["audit", &example_cfg("bad.cfg"), "-o", out.to_str().unwrap()]);
    assert_eq!(status, 0);
    serde_json::from_str::<serde_json::Value>(&fs::read_to_string(&out).unwrap()).expect("rapporten är inte JSON");
}

#[test]
fn fix_writes_a_script_for_a_bad_config() {
    let w = Work::new("fix");
    let bad = example_cfg("bad.cfg");
    assert_eq!(w.code(&["fix", &bad, "-o", "skript"]), 0);
    let files: Vec<_> = fs::read_dir(w.path("skript")).unwrap().map(|e| e.unwrap().path()).collect();
    assert_eq!(files.len(), 1, "väntade ett rättningsskript: {files:?}");
    let script = fs::read_to_string(&files[0]).unwrap();
    assert!(script.contains("configure terminal"));
    assert!(script.contains("write memory"));
}

#[test]
fn fix_writes_nothing_for_generated_configs() {
    let w = Work::with_samples("fix-clean");
    assert_eq!(w.code(&["generate"]), 0);
    assert_eq!(w.code(&["fix"]), 0);
    let scripts = fs::read_dir(w.path("reports")).map(|d| d.count()).unwrap_or(0);
    assert_eq!(scripts, 0);
}

#[test]
fn drift_is_zero_in_phase_and_one_after_a_manual_change() {
    let w = Work::with_samples("drift");
    // Inga sparade konfigar än räknas som drift.
    assert_eq!(w.code(&["drift"]), 1);
    assert_eq!(w.code(&["generate"]), 0);
    assert_eq!(w.code(&["drift"]), 0);
    let cfg = w.path("configs/SW-Nordvik-1.cfg");
    let mut text = fs::read_to_string(&cfg).unwrap();
    text.push_str("ntp server 203.0.113.9\n");
    fs::write(&cfg, text).unwrap();
    assert_eq!(w.code(&["drift"]), 1);
    // Genereras det om är det i fas igen.
    assert_eq!(w.code(&["generate"]), 0);
    assert_eq!(w.code(&["drift"]), 0);
}

#[test]
fn diff_exit_codes() {
    let w = Work::new("diff");
    let (good, bad) = (example_cfg("good.cfg"), example_cfg("bad.cfg"));
    assert_eq!(w.code(&["diff", &good, &good]), 0);
    assert_eq!(w.code(&["diff", &good, &bad]), 1);
    assert_eq!(w.code(&["diff", &good, "finns-inte.cfg"]), 1);
}

#[test]
fn subnet_calculator() {
    let w = Work::new("subnet");
    assert_eq!(w.code(&["subnet", "192.168.1.0/24"]), 0);
    assert_eq!(w.code(&["subnet", "192.168.1.0 255.255.255.0"]), 0);
    assert_eq!(w.code(&["subnet", "192.168.1.0/24", "--split", "26"]), 0);
    assert_eq!(w.code(&["subnet", "192.168.1.0/24", "--plan", "KONTOR:50,GAST:20"]), 0);
    assert_eq!(w.code(&["subnet", "inte-ett-nat"]), 1);
    // Prefixet är kortare än nätets eget, så det går inte att dela.
    assert_eq!(w.code(&["subnet", "192.168.1.0/24", "--split", "16"]), 1);
    assert_eq!(w.code(&["subnet", "192.168.1.0/24", "--plan", "utan-kolon"]), 1);
}

#[test]
fn rules_lists_rules_and_audit_accepts_them() {
    let w = Work::new("rules");
    let out = w.run(&["rules"]);
    assert_eq!(out.status.code(), Some(0));
    assert!(!out.stdout.is_empty());
    // Regel-id:n som `rules` visar ska gå att använda med `audit -r`.
    assert_eq!(w.code(&["audit", &example_cfg("good.cfg"), "-r", "hostname"]), 0);
}

#[test]
fn init_creates_settings_and_refuses_to_overwrite() {
    let w = Work::new("init");
    assert_eq!(w.code(&["init"]), 0);
    assert!(w.path("nordvik.toml").exists());
    assert_ne!(w.code(&["init"]), 0);
    assert_eq!(w.code(&["init", "--force"]), 0);
}
