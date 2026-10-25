//! vlantool – genererar och granskar Cisco IOS-konfigar för Nordvik-nätet.
//!
//! Rust-version av gruppens Python-verktyg (vlan-tool/) med fler regler,
//! granskning mellan enheter, rättningsskript, topologi, drift-kontroll,
//! subnätskalkylator, rapporter i flera format och ett interaktivt TUI.

use anyhow::{Context, Result, bail};
use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use finding::Severity;
use report::{Format, Options, Paint};
use settings::Settings;
use std::io::IsTerminal;
use std::path::{Path, PathBuf};
use vlantool::{audit, diff, finding, generator, inventory, net, project, report, rules, settings, topology, tui};

#[derive(Parser)]
#[command(
    name = "vlantool",
    version,
    about = "Genererar och granskar Cisco IOS-konfigar från CSV-filer",
    long_about = None,
    after_help = "Felkoder:\n  0  allt OK\n  1  programfel (t.ex. fil som saknas), eller skillnader hittades (diff, drift)\n  2  granskningen/valideringen hittade fynd på eller över gränsen (--fail-on)"
)]
struct Cli {
    /// Inställningsfil (skapas med `vlantool init`)
    #[arg(long, global = true, default_value = "nordvik.toml")]
    settings: PathBuf,
    /// Stäng av färger
    #[arg(long, global = true)]
    no_color: bool,
    /// Skriv bara ut fel och det som efterfrågas (inga statusrader)
    #[arg(long, short, global = true)]
    quiet: bool,
    /// Projektmapp att arbeta i (byter arbetskatalog innan något annat händer)
    #[arg(long, global = true, env = "VLANTOOL_PROJECT", value_name = "MAPP")]
    project: Option<PathBuf>,
    #[command(subcommand)]
    command: Option<Command>,
}

/// Utdataformat för kommandon som bara kan text eller JSON.
#[derive(Clone, Copy, PartialEq, Eq, ValueEnum)]
enum Plain {
    Text,
    Json,
}

#[derive(Clone, Copy, PartialEq, Eq, ValueEnum)]
enum RulesFormat {
    Text,
    Markdown,
}

#[derive(Subcommand, Clone, Copy, clap::ValueEnum)]
enum TopologyFormat {
    Text,
    Dot,
    Mermaid,
}

#[derive(Subcommand)]
enum BaselineAction {
    /// Sparar nuvarande fynd som baslinje
    Save {
        paths: Vec<PathBuf>,
        #[arg(long, default_value = "reports/baseline.json")]
        file: PathBuf,
    },
    /// Visar nya och åtgärdade fynd sedan baslinjen sparades
    Compare {
        paths: Vec<PathBuf>,
        #[arg(long, default_value = "reports/baseline.json")]
        file: PathBuf,
        /// Avsluta med felkod 2 om något nytt fynd har minst denna nivå
        #[arg(long, value_enum)]
        fail_on: Option<Severity>,
    },
}

#[derive(Subcommand)]
enum Command {
    /// Bygger konfigfiler från CSV-filerna
    Generate {
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
        #[arg(long, short, default_value = "configs")]
        out: PathBuf,
        /// Skriv ut konfigarna istället för att spara dem
        #[arg(long)]
        dry_run: bool,
        /// Bygg även om CSV-valideringen hittar allvarliga fel
        #[arg(long)]
        force: bool,
        /// Bygg bara dessa enheter (kan anges flera gånger)
        #[arg(long, value_name = "ENHET")]
        only: Vec<String>,
    },
    /// Kontrollerar att CSV-filerna är rimliga och hänger ihop
    Validate {
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
        #[arg(long, short, value_enum, default_value = "text")]
        format: Plain,
        /// Avsluta med felkod 2 om något fynd har minst denna nivå
        #[arg(long, value_enum, default_value = "high")]
        fail_on: Severity,
    },
    /// Granskar konfigfiler (standard: alla i configs/)
    Audit {
        /// Filer eller mappar att granska
        paths: Vec<PathBuf>,
        #[arg(long, short, value_enum, default_value = "terminal")]
        format: Format,
        /// Spara rapporten i en fil (formatet gissas från ändelsen)
        #[arg(long, short)]
        output: Option<PathBuf>,
        /// Visa bara fynd med minst denna nivå
        #[arg(long, value_enum, default_value = "info")]
        min: Severity,
        /// Kör bara dessa regler (kan anges flera gånger)
        #[arg(long = "rule", short)]
        rules: Vec<String>,
        /// Visa även godkända regler
        #[arg(long, short)]
        verbose: bool,
        /// Dölj rättningsförslagen
        #[arg(long)]
        no_fix: bool,
        /// Avsluta med felkod 2 om något fynd har minst denna nivå (för CI)
        #[arg(long, value_enum)]
        fail_on: Option<Severity>,
        /// Skriv bara en rad per enhet
        #[arg(long)]
        summary: bool,
    },
    /// Förklarar en regel och visar ett exempel på rättning
    Explain {
        /// Regel-id, t.ex. ssh (se `vlantool rules`)
        rule: String,
    },
    /// Granskar om konfigfilerna varje gång de ändras (Ctrl+C avslutar)
    Watch {
        /// Filer eller mappar att bevaka (standard: configs/)
        paths: Vec<PathBuf>,
        #[arg(long, value_enum, default_value = "low")]
        min: Severity,
        /// Kör bara dessa regler (kan anges flera gånger)
        #[arg(long = "rule", short)]
        rules: Vec<String>,
    },
    /// Skriver skalkomplettering (bash, zsh, fish) till stdout
    Completions {
        #[arg(value_enum)]
        shell: clap_complete::Shell,
    },
    /// Visar portar, DHCP-pooler och enheter från CSV-filerna som tabeller
    Inventory {
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
        #[arg(long, short, value_enum, default_value = "text")]
        format: Plain,
    },
    /// Portar per VLAN och beläggning i DHCP-poolerna
    Stats {
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
        #[arg(long, short, value_enum, default_value = "text")]
        format: Plain,
    },
    /// Skriver rättningsskript per enhet som kan klistras in i CLI:t
    Fix {
        paths: Vec<PathBuf>,
        #[arg(long, short, default_value = "reports")]
        out: PathBuf,
        #[arg(long, value_enum, default_value = "low")]
        min: Severity,
    },
    /// Visar skillnaden mellan två konfigfiler
    Diff {
        old: PathBuf,
        new: PathBuf,
        /// Jämför block för block utan hänsyn till ordningen
        #[arg(long)]
        semantic: bool,
    },
    /// Jämför sparade konfigar med vad CSV-filerna säger att de borde vara
    Drift {
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
        #[arg(long, default_value = "configs")]
        configs: PathBuf,
    },
    /// Ritar nätets topologi från portbeskrivningarna
    Topology {
        paths: Vec<PathBuf>,
        #[arg(long, short, value_enum, default_value = "text")]
        format: TopologyFormat,
    },
    /// Sparar fynden som baslinje eller jämför mot en sparad baslinje
    Baseline {
        #[command(subcommand)]
        action: BaselineAction,
    },
    /// Listar alla granskningsregler
    Rules {
        #[arg(long, short, value_enum, default_value = "text")]
        format: RulesFormat,
    },
    /// Subnätskalkylator och VLSM-planerare
    Subnet {
        /// T.ex. 192.168.1.0/24 eller "192.168.1.0 255.255.255.0"
        network: String,
        /// Dela nätet i lika stora delar med detta prefix
        #[arg(long)]
        split: Option<u8>,
        /// VLSM-plan: NAMN:värdar, t.ex. KONTOR:50,EKONOMI:20,GAST:20,DRIFT:10
        #[arg(long)]
        plan: Option<String>,
        /// Skriv resultatet som JSON
        #[arg(long)]
        json: bool,
    },
    /// Skapar nordvik.toml med standardinställningarna
    Init {
        #[arg(long)]
        force: bool,
        /// Skapa ett exempelprojekt (samples/, examples-cfg/ och nordvik.toml) i projektmappen
        #[arg(long)]
        example: bool,
    },
    /// Allt i ett: validera CSV, generera, granska och skriv HTML-rapport
    Run {
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
        #[arg(long, default_value = "configs")]
        configs: PathBuf,
        #[arg(long, default_value = "reports")]
        reports: PathBuf,
    },
    /// Interaktiv översikt i terminalen (standard om inget kommando anges)
    Tui {
        paths: Vec<PathBuf>,
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
    },
}

/// Skriver bara när `--quiet` inte är påslaget.
macro_rules! info {
    ($q:expr, $($arg:tt)*) => {
        if !$q {
            println!($($arg)*);
        }
    };
}

fn main() {
    // `vlantool rules | head` stänger röret innan allt är skrivet. Avsluta då tyst som andra
    // kommandoradsverktyg (141 = 128 + SIGPIPE) istället för att skriva ut en panik.
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = info.payload().downcast_ref::<String>().map(String::as_str).unwrap_or("");
        if msg.contains("Broken pipe") {
            std::process::exit(141);
        }
        default_hook(info);
    }));
    let cli = Cli::parse();
    let color = !cli.no_color && std::env::var_os("NO_COLOR").is_none() && std::io::stdout().is_terminal();
    match run(cli, color) {
        Ok(code) => std::process::exit(code),
        Err(e) => {
            let p = Paint(color);
            eprintln!("{} {e:#}", p.rgb("fel:", (240, 80, 90)));
            std::process::exit(1);
        }
    }
}

/// `--project`: byt arbetskatalog så att samples/, configs/ och nordvik.toml hittas i projektmappen.
fn enter_project(dir: &Path, create: bool) -> Result<()> {
    if create {
        std::fs::create_dir_all(dir).with_context(|| format!("kunde inte skapa projektmappen {}", dir.display()))?;
    }
    std::env::set_current_dir(dir).with_context(|| format!("kunde inte öppna projektmappen {}", dir.display()))
}

fn run(cli: Cli, color: bool) -> Result<i32> {
    let p = Paint(color);
    let q = cli.quiet;
    if let Some(dir) = &cli.project {
        // `init --example` får skapa en ny projektmapp.
        enter_project(dir, matches!(cli.command, Some(Command::Init { example: true, .. })))?;
    }
    let settings = Settings::load(&cli.settings)?;
    let Some(command) = cli.command else {
        tui::run(vec![PathBuf::from("configs")], PathBuf::from("samples"), settings)?;
        return Ok(0);
    };
    match command {
        Command::Generate { samples, out, dry_run, force, only } => {
            generate(&samples, &out, dry_run, force, &only, &settings, p, q)?;
        }
        Command::Validate { samples, format, fail_on } => {
            let inv = inventory::Inventory::load_dir(&samples)?;
            let findings = inv.validate(settings.native_vlan, settings.mgmt_vlan);
            match format {
                Plain::Text => print_validation(&inv, &findings, p, q),
                Plain::Json => {
                    let json = serde_json::json!({
                        "ports": inv.ports.len(),
                        "dhcp": inv.dhcp.len(),
                        "devices": inv.devices.len(),
                        "files": inv.files.len(),
                        "findings": findings,
                    });
                    println!("{}", serde_json::to_string_pretty(&json)?);
                }
            }
            if findings.iter().any(|f| f.severity >= fail_on) {
                return Ok(2);
            }
        }
        Command::Audit { paths, format, output, min, rules, verbose, no_fix, fail_on, summary } => {
            for r in &rules {
                if rules::find(r).is_none() {
                    bail!("okänd regel '{r}' – se `vlantool rules`");
                }
            }
            let fleet = load_and_audit(&paths, &rules)?;
            let format = match (&output, format) {
                (Some(path), Format::Terminal) => format_from_ext(path),
                (_, f) => f,
            };
            let opt = Options { color: color && output.is_none(), verbose, fixes: !no_fix, min };
            match &output {
                Some(path) => {
                    write_file(path, &report::render(&fleet, format, opt))?;
                    info!(q, "{} {}", p.ok("✔ Sparade"), path.display());
                    // Visa ändå en kort sammanfattning i terminalen.
                    if !q {
                        print!(
                            "{}",
                            report::render(&fleet, Format::Terminal, Options { color, verbose: false, fixes: false, min: Severity::High })
                        );
                    }
                }
                None if summary => print_summary(&fleet, p),
                None => print!("{}", report::render(&fleet, format, opt)),
            }
            if let Some(level) = fail_on
                && fleet.worst().is_some_and(|w| w >= level)
            {
                return Ok(2);
            }
        }
        Command::Explain { rule } => explain(&rule, p)?,
        Command::Watch { paths, min, rules } => {
            for r in &rules {
                if rules::find(r).is_none() {
                    bail!("okänd regel '{r}' – se `vlantool rules`");
                }
            }
            watch(&default_paths(&paths), &rules, min, color, q)?;
        }
        Command::Completions { shell } => {
            clap_complete::generate(shell, &mut Cli::command(), "vlantool", &mut std::io::stdout());
        }
        Command::Inventory { samples, format } => {
            let inv = inventory::Inventory::load_dir(&samples)?;
            match format {
                Plain::Text => print_inventory(&inv, p),
                Plain::Json => println!("{}", serde_json::to_string_pretty(&inv)?),
            }
        }
        Command::Stats { samples, format } => {
            let inv = inventory::Inventory::load_dir(&samples)?;
            stats(&inv, format, p)?;
        }
        Command::Fix { paths, out, min } => {
            let fleet = load_and_audit(&paths, &[])?;
            std::fs::create_dir_all(&out)?;
            for d in &fleet.devices {
                let lines: Vec<&String> = d.findings().filter(|f| f.severity >= min).flat_map(|f| f.fix.iter()).collect();
                if lines.is_empty() {
                    info!(q, "{} {} – inget att rätta", p.ok("✔"), p.bold(&d.name));
                    continue;
                }
                let mut script = format!("! Rättningsskript för {} – granska innan du klistrar in!\nconfigure terminal\n", d.name);
                let mut last = String::new();
                for l in lines {
                    // Samma rubrik två gånger i rad behövs inte.
                    if !l.starts_with(' ') && *l == last {
                        continue;
                    }
                    last = l.clone();
                    script.push_str(l);
                    script.push('\n');
                }
                script.push_str("end\nwrite memory\n");
                let path = out.join(format!("{}_fix.txt", d.name));
                write_file(&path, &script)?;
                if q {
                    continue;
                }
                println!("{} {}  {}", p.accent("●"), p.bold(&d.name), p.dim(&path.display().to_string()));
                for l in script.lines() {
                    println!("    {}", if l.starts_with('!') { p.dim(l) } else { p.accent(l) });
                }
            }
        }
        Command::Diff { old, new, semantic } => {
            let a = std::fs::read_to_string(&old).with_context(|| format!("kunde inte läsa {}", old.display()))?;
            let b = std::fs::read_to_string(&new).with_context(|| format!("kunde inte läsa {}", new.display()))?;
            let diff_fn = if semantic { diff::diff_semantic } else { diff::diff };
            let (text, stats) = diff_fn(&old.display().to_string(), &a, &new.display().to_string(), &b, p);
            if stats.added + stats.removed == 0 {
                info!(q, "{} Inga skillnader", p.ok("✔"));
            } else {
                print!("{text}");
                println!("\n{} {}", p.ok(&format!("+{}", stats.added)), p.rgb(&format!("-{}", stats.removed), (240, 110, 120)));
                return Ok(1);
            }
        }
        Command::Drift { samples, configs } => return drift(&samples, &configs, &settings, p),
        Command::Topology { paths, format } => {
            let configs = audit::load_configs(&default_paths(&paths))?;
            if configs.is_empty() {
                bail!("hittade inga konfigar – kör `vlantool generate` först");
            }
            match format {
                TopologyFormat::Text => {
                    println!();
                    print!("{}", topology::render(&configs, p));
                    println!();
                }
                TopologyFormat::Dot => print!("{}", topology::dot(&configs)),
                TopologyFormat::Mermaid => print!("{}", topology::mermaid(&configs)),
            }
        }
        Command::Baseline { action: BaselineAction::Save { paths, file } } => {
            let fleet = load_and_audit(&paths, &[])?;
            let base = vlantool::baseline::Baseline::from_fleet(&fleet);
            if let Some(dir) = file.parent().filter(|d| !d.as_os_str().is_empty()) {
                std::fs::create_dir_all(dir)?;
            }
            base.save(&file)?;
            println!("{} Sparade {} fynd i {}", p.ok("✔"), base.findings.len(), file.display());
        }
        Command::Baseline { action: BaselineAction::Compare { paths, file, fail_on } } => {
            let base = vlantool::baseline::Baseline::load(&file)
                .with_context(|| format!("ingen baslinje i {} – kör `vlantool baseline save` först", file.display()))?;
            let fleet = load_and_audit(&paths, &[])?;
            let cmp = base.compare(&fleet);
            print!("{}", cmp.render());
            if fail_on.is_some_and(|level| cmp.has_new_at_least(level)) {
                return Ok(2);
            }
        }
        Command::Rules { format: RulesFormat::Markdown } => print!("{}", rules_markdown()),
        Command::Rules { format: RulesFormat::Text } => {
            println!();
            for (cat, list) in rules::by_category() {
                println!("  {}", p.bold(&p.accent(cat)));
                for r in list {
                    println!(
                        "    {} {} {:<34} {}",
                        p.sev(r.severity.icon(), r.severity),
                        p.bold(&format!("{:<14}", r.id)),
                        r.title,
                        p.dim(applies_text(r.applies))
                    );
                    println!("      {}", p.dim(r.why));
                }
            }
            println!(
                "\n  {} regler. Kör bara vissa med `vlantool audit -r ssh -r trunk`, läs mer med `vlantool explain ssh`.\n",
                rules::ALL_RULES.len()
            );
        }
        Command::Subnet { network, split, plan, json } => subnet(&network, split, plan.as_deref(), json, p)?,
        Command::Init { force, example } => {
            if example {
                init_example(&cli.settings, p, q)?;
                return Ok(0);
            }
            if cli.settings.exists() && !force {
                bail!("{} finns redan (använd --force för att skriva över)", cli.settings.display());
            }
            write_file(&cli.settings, &format!("# Inställningar för vlantool\n\n{}", Settings::default().to_toml()))?;
            info!(q, "{} Skapade {}", p.ok("✔"), cli.settings.display());
        }
        Command::Run { samples, configs, reports } => {
            info!(q, "{}", p.bold("\n  1/3  Validerar CSV"));
            let inv = inventory::Inventory::load_dir(&samples)?;
            let findings = inv.validate(settings.native_vlan, settings.mgmt_vlan);
            print_validation(&inv, &findings, p, q);
            info!(q, "{}", p.bold("  2/3  Genererar konfigar"));
            generate(&samples, &configs, false, false, &[], &settings, p, q)?;
            info!(q, "{}", p.bold("\n  3/3  Granskar"));
            let fleet = load_and_audit(&[configs], &[])?;
            if !q {
                print!("{}", report::render(&fleet, Format::Terminal, Options { color, verbose: false, fixes: false, min: Severity::Low }));
            }
            let html = reports.join("rapport.html");
            write_file(&html, &report::html(&fleet))?;
            write_file(
                &reports.join("rapport.md"),
                &report::markdown(&fleet, Options { color: false, verbose: true, fixes: true, min: Severity::Info }),
            )?;
            info!(q, "  {} {}  och  {}\n", p.ok("✔ Rapporter:"), html.display(), reports.join("rapport.md").display());
        }
        Command::Tui { paths, samples } => tui::run(default_paths(&paths), samples, settings)?,
    }
    Ok(0)
}

fn applies_text(a: rules::Applies) -> &'static str {
    match a {
        rules::Applies::All => "alla",
        rules::Applies::Switch => "switch",
        rules::Applies::Router => "router",
    }
}

/// Regellistan som Markdown-tabeller, en per kategori.
fn rules_markdown() -> String {
    let cell = |s: &str| s.replace('|', "\\|");
    let mut out = String::from("# Granskningsregler\n\n");
    for (cat, list) in rules::by_category() {
        out.push_str(&format!("\n## {cat}\n\n| Id | Nivå | Gäller | Regel | Varför |\n|---|---|---|---|---|\n"));
        for r in list {
            out.push_str(&format!(
                "| `{}` | {} | {} | {} | {} |\n",
                r.id,
                r.severity.label(),
                applies_text(r.applies),
                cell(r.title),
                cell(r.why)
            ));
        }
    }
    out.push_str(&format!("\n{} regler.\n", rules::ALL_RULES.len()));
    out
}

/// `explain`: förklaring av en regel och ett riktigt fynd med rättning från exempelkonfigarna.
fn explain(id: &str, p: Paint) -> Result<()> {
    let Some(r) = rules::find(id) else {
        let near: Vec<&str> = rules::ALL_RULES.iter().filter(|r| r.id.contains(id) || id.contains(r.id)).map(|r| r.id).collect();
        let hint = if near.is_empty() { String::new() } else { format!(" – menade du {}?", near.join(", ")) };
        bail!("okänd regel '{id}'{hint} (se `vlantool rules`)");
    };
    println!();
    println!("  {} {}", p.sev(r.severity.icon(), r.severity), p.bold(&p.accent(r.title)));
    println!(
        "  {}",
        p.dim(&format!("regel {} · {} · gäller {} · högst nivå {}", r.id, r.category, applies_text(r.applies), r.severity.label()))
    );
    println!("\n  {}\n  {}", p.bold("Varför?"), r.why);
    // Kör regeln på de inbyggda exempelkonfigarna och visa första fyndet som har en rättning.
    let example = project::EXAMPLE_FILES.iter().filter(|(rel, _)| rel.starts_with("examples-cfg/")).find_map(|(rel, text)| {
        let name = Path::new(rel).file_stem()?.to_string_lossy().to_string();
        let config = vlantool::parser::Config::parse(&name, rel, text);
        if !r.applies_to(config.kind) {
            return None;
        }
        (r.check)(&config).into_iter().find(|f| !f.fix.is_empty()).map(|f| (rel.to_string(), f))
    });
    match example {
        Some((file, f)) => {
            println!("\n  {}", p.bold(&format!("Exempel (fynd i {file})")));
            println!("  {} {}", p.sev(f.severity.icon(), f.severity), f.message);
            println!("\n  {}", p.bold("Rättning"));
            for l in &f.fix {
                println!("    {}", p.accent(l));
            }
        }
        None => println!("\n  {}", p.dim("Inget av exemplen bryter mot regeln, så det finns inget rättningsexempel att visa.")),
    }
    println!("\n  {}\n", p.dim(&format!("Kör bara den här regeln: vlantool audit -r {}", r.id)));
    Ok(())
}

/// En rad per enhet: betyg och antal fynd per nivå.
fn print_summary(fleet: &audit::FleetReport, p: Paint) {
    println!();
    for d in &fleet.devices {
        let (full, empty) = report::bar(d.score, 10);
        let counts: String = Severity::ALL
            .iter()
            .filter(|&&s| s != Severity::Info || d.count(s) > 0)
            .map(|&s| format!("{} {:<2}", s.icon(), d.count(s)))
            .collect::<Vec<_>>()
            .join(" ");
        println!(
            "  {} {:<16} {}{} {:>3} {}  {}",
            p.sev(d.worst().map_or("✔", |w| w.icon()), d.worst().unwrap_or(Severity::Low)),
            p.bold(&d.name),
            p.rgb(&full, report::score_rgb(d.score)),
            p.dim(&empty),
            d.score,
            d.grade,
            p.dim(&counts)
        );
    }
    println!("\n  {} {} {}\n", p.dim("Nätet"), p.bold(&fleet.score.to_string()), fleet.grade);
}

/// Bevakar filerna och granskar om vid ändring (jämför ändringstider en gång i sekunden).
fn watch(paths: &[PathBuf], rules: &[String], min: Severity, color: bool, quiet: bool) -> Result<()> {
    let p = Paint(color);
    let mut seen = None;
    loop {
        let now = tui::watch_snapshot(paths);
        if seen.as_ref() != Some(&now) {
            if seen.is_some() && std::io::stdout().is_terminal() {
                print!("\x1b[2J\x1b[H");
            }
            seen = Some(now);
            match audit::load_configs(paths).map(|c| audit::audit_fleet(c, rules)) {
                Ok(fleet) if fleet.devices.is_empty() => eprintln!(
                    "{} hittade inga konfigfiler i {}",
                    p.rgb("fel:", (240, 80, 90)),
                    paths.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ")
                ),
                Ok(fleet) => {
                    print!("{}", report::render(&fleet, Format::Terminal, Options { color, verbose: false, fixes: false, min }));
                    info!(quiet, "{}", p.dim(&format!("  Bevakar {} filer – Ctrl+C avslutar", tui::watch_snapshot(paths).len())));
                }
                Err(e) => eprintln!("{} {e:#}", p.rgb("fel:", (240, 80, 90))),
            }
            let _ = std::io::Write::flush(&mut std::io::stdout());
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

/// `init --example`: exempelfiler i arbetskatalogen (projektmappen) plus nordvik.toml.
fn init_example(settings_path: &Path, p: Paint, quiet: bool) -> Result<()> {
    let root = Path::new(".");
    let before: Vec<bool> = project::EXAMPLE_FILES.iter().map(|(rel, _)| root.join(rel).exists()).collect();
    project::Project::create_example(root)?;
    let mut created =
        project::EXAMPLE_FILES.iter().zip(&before).filter(|(_, had)| !**had).map(|((rel, _), _)| rel.to_string()).collect::<Vec<_>>();
    if !settings_path.exists() {
        write_file(settings_path, &format!("# Inställningar för vlantool\n\n{}", Settings::default().to_toml()))?;
        created.push(settings_path.display().to_string());
    }
    let here = std::env::current_dir().map(|d| d.display().to_string()).unwrap_or_default();
    if created.is_empty() {
        info!(quiet, "{} Exempelprojektet finns redan i {here}", p.ok("✔"));
        return Ok(());
    }
    info!(quiet, "{} Skapade exempelprojekt i {here}", p.ok("✔"));
    for c in &created {
        info!(quiet, "    {}", p.dim(c));
    }
    info!(quiet, "\n  Nästa steg: {}", p.accent("vlantool run"));
    Ok(())
}

fn print_inventory(inv: &inventory::Inventory, p: Paint) {
    let list = |v: &[u16]| if v.is_empty() { "–".to_string() } else { inventory::join_vlans(v) };
    println!("\n  {}", p.bold(&p.accent(&format!("Portar ({})", inv.ports.len()))));
    println!(
        "  {}",
        p.dim(&format!(
            "{:<14} {:<8} {:<7} {:<12} {:<14} {:<8} {:<5} {}",
            "Switch", "Port", "Läge", "VLAN", "Namn", "Native", "Upp", "Beskrivning"
        ))
    );
    for r in &inv.ports {
        let (mode, vlan) = match r.mode {
            inventory::PortMode::Access => ("access", r.vlan.map_or("–".into(), |v| v.to_string())),
            inventory::PortMode::Trunk => ("trunk", list(&r.allowed)),
        };
        println!(
            "  {:<14} {:<8} {:<7} {:<12} {:<14} {:<8} {:<5} {}",
            r.switch,
            inventory::short_port(&r.port),
            mode,
            vlan,
            r.vlan_name,
            r.native.map_or("–".into(), |n| n.to_string()),
            if r.up { "ja" } else { "nej" },
            r.description
        );
    }
    println!("\n  {}", p.bold(&p.accent(&format!("DHCP-pooler ({})", inv.dhcp.len()))));
    println!(
        "  {}",
        p.dim(&format!("{:<6} {:<12} {:<18} {:<32} {:<32} {:<16} {}", "VLAN", "Namn", "Nät", "Pool", "Undantag", "Gateway", "DNS"))
    );
    for d in &inv.dhcp {
        println!(
            "  {:<6} {:<12} {:<18} {:<32} {:<32} {:<16} {}",
            d.vlan,
            d.name,
            d.network.to_string(),
            format!("{} – {}", d.pool_start, d.pool_end),
            format!("{} – {}", d.excluded_start, d.excluded_end),
            d.gateway.to_string(),
            d.dns
        );
    }
    println!("\n  {}", p.bold(&p.accent(&format!("Enheter ({})", inv.devices.len()))));
    println!("  {}", p.dim(&format!("{:<16} {:<16} {:<16} {}", "Hostname", "Hanterings-IP", "Mask", "Gateway")));
    for d in &inv.devices {
        println!("  {:<16} {:<16} {:<16} {}", d.hostname, d.mgmt_ip.to_string(), d.mgmt_mask.to_string(), d.gateway);
    }
    println!();
}

/// Antal adresser i poolen som inte ligger i undantagsintervallet.
fn pool_free(d: &inventory::DhcpRow) -> u64 {
    let (ps, pe) = (u32::from(d.pool_start), u32::from(d.pool_end));
    let (es, ee) = (u32::from(d.excluded_start), u32::from(d.excluded_end));
    let total = if pe >= ps { (pe - ps) as u64 + 1 } else { 0 };
    let (lo, hi) = (ps.max(es), pe.min(ee));
    let excluded = if hi >= lo { (hi - lo) as u64 + 1 } else { 0 };
    total - excluded
}

fn stats(inv: &inventory::Inventory, format: Plain, p: Paint) -> Result<()> {
    let names = inv.vlan_names();
    // Portar per VLAN: (accessportar, trunkar som släpper igenom VLAN:et)
    let mut per_vlan: std::collections::BTreeMap<u16, (usize, usize)> = names.keys().map(|&v| (v, (0, 0))).collect();
    for r in &inv.ports {
        match r.mode {
            inventory::PortMode::Access => {
                if let Some(v) = r.vlan {
                    per_vlan.entry(v).or_default().0 += 1;
                }
            }
            inventory::PortMode::Trunk => {
                for v in &r.allowed {
                    per_vlan.entry(*v).or_default().1 += 1;
                }
            }
        }
    }
    // Beläggning: accessportar i VLAN:et jämfört med lediga adresser i poolen.
    let pools: Vec<_> = inv
        .dhcp
        .iter()
        .map(|d| {
            let free = pool_free(d);
            let ports = per_vlan.get(&d.vlan).map_or(0, |x| x.0) as u64;
            (d, free, ports, (ports * 100).checked_div(free).map_or(100, |v| v.min(999)))
        })
        .collect();
    if format == Plain::Json {
        let json = serde_json::json!({
            "vlan": per_vlan.iter().map(|(v, (a, t))| serde_json::json!({"vlan": v, "name": names.get(v), "access_ports": a, "trunk_ports": t})).collect::<Vec<_>>(),
            "dhcp": pools.iter().map(|(d, free, ports, pct)| serde_json::json!({"vlan": d.vlan, "name": d.name, "network": d.network.to_string(), "pool_addresses": free, "access_ports": ports, "usage_percent": pct})).collect::<Vec<_>>(),
        });
        println!("{}", serde_json::to_string_pretty(&json)?);
        return Ok(());
    }
    println!("\n  {}", p.bold(&p.accent("Portar per VLAN")));
    println!("  {}", p.dim(&format!("{:<6} {:<14} {:>8} {:>8}", "VLAN", "Namn", "Access", "Trunk")));
    for (v, (a, t)) in &per_vlan {
        println!("  {:<6} {:<14} {:>8} {:>8}", v, names.get(v).map_or("", String::as_str), a, t);
    }
    println!("\n  {}", p.bold(&p.accent("DHCP-pooler")));
    println!("  {}", p.dim(&format!("{:<6} {:<12} {:<18} {:>9} {:>8}  {}", "VLAN", "Namn", "Nät", "Adresser", "Portar", "Beläggning")));
    for (d, free, ports, pct) in pools {
        let (full, empty) = report::bar((pct as u32).min(100), 12);
        let color = if pct >= 90 {
            (240, 80, 90)
        } else if pct >= 70 {
            (240, 190, 70)
        } else {
            (110, 210, 140)
        };
        println!(
            "  {:<6} {:<12} {:<18} {:>9} {:>8}  {}{} {:>3}%",
            d.vlan,
            d.name,
            d.network.to_string(),
            free,
            ports,
            p.rgb(&full, color),
            p.dim(&empty),
            pct
        );
    }
    println!();
    Ok(())
}

fn default_paths(paths: &[PathBuf]) -> Vec<PathBuf> {
    if paths.is_empty() { vec![PathBuf::from("configs")] } else { paths.to_vec() }
}

fn load_and_audit(paths: &[PathBuf], rules: &[String]) -> Result<audit::FleetReport> {
    let configs = audit::load_configs(&default_paths(paths))?;
    if configs.is_empty() {
        bail!("hittade inga konfigfiler – kör `vlantool generate` först eller ange en fil");
    }
    Ok(audit::audit_fleet(configs, rules))
}

fn format_from_ext(path: &Path) -> Format {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "md" => Format::Markdown,
        "json" => Format::Json,
        "csv" => Format::Csv,
        "html" | "htm" => Format::Html,
        "sarif" => Format::Sarif,
        "xml" => Format::Junit,
        _ => Format::Text,
    }
}

fn write_file(path: &Path, text: &str) -> Result<()> {
    if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, text).with_context(|| format!("kunde inte spara {}", path.display()))
}

#[allow(clippy::too_many_arguments)]
fn generate(
    samples: &Path,
    out: &Path,
    dry_run: bool,
    force: bool,
    only: &[String],
    settings: &Settings,
    p: Paint,
    quiet: bool,
) -> Result<()> {
    let inv = inventory::Inventory::load_dir(samples)?;
    let problems: Vec<_> =
        inv.validate(settings.native_vlan, settings.mgmt_vlan).into_iter().filter(|f| f.severity >= Severity::Critical).collect();
    if !problems.is_empty() && !force {
        for f in &problems {
            eprintln!("  {} {}", p.sev(f.severity.icon(), f.severity), f.message);
        }
        bail!("CSV-filerna har kritiska fel – rätta dem eller kör med --force");
    }
    let mut configs = generator::generate_all(&inv, settings)?;
    if configs.is_empty() {
        bail!("CSV-filerna i {} beskriver inga enheter", samples.display());
    }
    if !only.is_empty() {
        for o in only {
            if !configs.iter().any(|g| g.hostname.eq_ignore_ascii_case(o)) {
                let all: Vec<&str> = configs.iter().map(|g| g.hostname.as_str()).collect();
                bail!("okänd enhet '{o}' – CSV-filerna beskriver {}", all.join(", "));
            }
        }
        configs.retain(|g| only.iter().any(|o| g.hostname.eq_ignore_ascii_case(o)));
    }
    for g in configs {
        if dry_run {
            println!("{}\n{}\n", p.bold(&p.accent(&format!("===== {} =====", g.hostname))), g.text);
            continue;
        }
        let path = out.join(format!("{}.cfg", g.hostname));
        let new_text = g.text.clone() + "\n";
        // Visa vad som ändras mot den fil som redan finns.
        let change = match std::fs::read_to_string(&path) {
            Err(_) => p.rgb("ny", (240, 190, 70)),
            Ok(old) => {
                let (_, stats) = diff::diff("", &old, "", &new_text, Paint(false));
                if stats.added + stats.removed == 0 {
                    p.dim("oförändrad")
                } else {
                    format!("{} {}", p.ok(&format!("+{}", stats.added)), p.rgb(&format!("-{}", stats.removed), (240, 110, 120)))
                }
            }
        };
        write_file(&path, &new_text)?;
        info!(
            quiet,
            "  {} {:<16} {}  {}",
            p.ok("✔"),
            g.hostname,
            p.dim(&format!("{}  ({} rader)", path.display(), g.text.lines().count())),
            change
        );
    }
    Ok(())
}

fn print_validation(inv: &inventory::Inventory, findings: &[finding::Finding], p: Paint, quiet: bool) {
    info!(
        quiet,
        "\n  {} portar · {} DHCP-pooler · {} enheter från {} filer",
        inv.ports.len(),
        inv.dhcp.len(),
        inv.devices.len(),
        inv.files.len()
    );
    if findings.is_empty() {
        info!(quiet, "  {} CSV-filerna ser bra ut\n", p.ok("✔"));
        return;
    }
    for f in findings {
        println!("  {} {}", p.sev(&format!("{} {:<8}", f.severity.icon(), f.severity.label()), f.severity), f.message);
    }
    println!();
}

fn drift(samples: &Path, configs: &Path, settings: &Settings, p: Paint) -> Result<i32> {
    let inv = inventory::Inventory::load_dir(samples)?;
    let mut changed = 0;
    for g in generator::generate_all(&inv, settings)? {
        let path = configs.join(format!("{}.cfg", g.hostname));
        match std::fs::read_to_string(&path) {
            Err(_) => {
                changed += 1;
                println!("  {} {:<16} {}", p.rgb("✚", (240, 190, 70)), g.hostname, p.dim("finns inte sparad än"));
            }
            Ok(saved) => {
                let (text, stats) = diff::diff(&path.display().to_string(), &saved, "från CSV", &g.text, p);
                if stats.added + stats.removed == 0 {
                    println!("  {} {:<16} {}", p.ok("✔"), g.hostname, p.dim("i fas med CSV-filerna"));
                } else {
                    changed += 1;
                    println!(
                        "  {} {:<16} {} {}",
                        p.rgb("≠", (240, 190, 70)),
                        g.hostname,
                        p.ok(&format!("+{}", stats.added)),
                        p.rgb(&format!("-{}", stats.removed), (240, 110, 120))
                    );
                    for l in text.lines() {
                        println!("      {l}");
                    }
                }
            }
        }
    }
    Ok(if changed > 0 { 1 } else { 0 })
}

fn subnet_json(net: &net::Subnet, split: Option<u8>, plan: Option<&str>) -> Result<serde_json::Value> {
    let describe = |s: &net::Subnet| {
        serde_json::json!({
            "network": s.to_string(),
            "address": s.network.to_string(),
            "prefix": s.prefix,
            "mask": s.mask().to_string(),
            "wildcard": s.wildcard().to_string(),
            "first_host": s.first_host().to_string(),
            "last_host": s.last_host().to_string(),
            "broadcast": s.broadcast().to_string(),
            "usable_hosts": s.usable_hosts(),
            "size": s.size(),
        })
    };
    let mut out = describe(net);
    if let Some(prefix) = split {
        let parts = net.split(prefix);
        if parts.is_empty() {
            bail!("/{prefix} går inte att dela /{} i", net.prefix);
        }
        out["split"] = parts.iter().map(describe).collect();
    }
    if let Some(plan) = plan {
        let wants = net::parse_plan(plan).map_err(anyhow::Error::msg)?;
        out["plan"] = net::vlsm(*net, &wants)
            .into_iter()
            .map(|row| serde_json::json!({"name": row.name, "hosts": row.hosts, "subnet": row.subnet.as_ref().map(describe)}))
            .collect();
    }
    Ok(out)
}

fn subnet(network: &str, split: Option<u8>, plan: Option<&str>, json: bool, p: Paint) -> Result<()> {
    let net = net::Subnet::parse(network).context("ogiltigt nät – skriv t.ex. 192.168.1.0/24")?;
    if json {
        println!("{}", serde_json::to_string_pretty(&subnet_json(&net, split, plan)?)?);
        return Ok(());
    }
    let row = |label: &str, value: String| println!("  {:<14} {}", p.dim(label), value);
    println!();
    row("Nät", p.bold(&p.accent(&net.to_string())));
    row("Mask", format!("{}  (wildcard {})", net.mask(), net.wildcard()));
    row("Värdar", format!("{} – {}", net.first_host(), net.last_host()));
    row("Broadcast", net.broadcast().to_string());
    row("Användbara", format!("{} av {} adresser", net.usable_hosts(), net.size()));

    if let Some(prefix) = split {
        let parts = net.split(prefix);
        if parts.is_empty() {
            bail!("/{prefix} går inte att dela /{} i", net.prefix);
        }
        println!("\n  {}", p.bold(&format!("{} delnät /{prefix}", parts.len())));
        for (i, s) in parts.iter().enumerate().take(64) {
            println!(
                "  {:>4}  {:<18} {} – {}  {}",
                p.dim(&(i + 1).to_string()),
                s.to_string(),
                s.first_host(),
                s.last_host(),
                p.dim(&format!("bc {}", s.broadcast()))
            );
        }
    }

    if let Some(plan) = plan {
        let wants = net::parse_plan(plan).map_err(anyhow::Error::msg)?;
        println!("\n  {}", p.bold("VLSM-plan"));
        println!("  {}", p.dim(&format!("{:<12} {:>6} {:<18} {:<16} {:<31} {}", "Namn", "Behov", "Nät", "Mask", "Värdar", "Ledigt")));
        let mut used = 0;
        for row in net::vlsm(net, &wants) {
            let Some(s) = row.subnet else {
                println!("  {:<12} {:>6} {}", row.name, row.hosts, p.rgb("får inte plats", (240, 80, 90)));
                continue;
            };
            used += s.size();
            println!(
                "  {} {:>6} {} {:<16} {:<31} {}",
                p.bold(&format!("{:<12}", row.name)),
                row.hosts,
                p.accent(&format!("{:<18}", s.to_string())),
                s.mask().to_string(),
                format!("{} – {}", s.first_host(), s.last_host()),
                p.dim(&(s.usable_hosts() - row.hosts).to_string())
            );
        }
        println!("\n  {} {used}/{} adresser använda\n", p.dim("Totalt"), net.size());
    } else {
        println!();
    }
    Ok(())
}
