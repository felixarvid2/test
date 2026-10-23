//! vlantool – genererar och granskar Cisco IOS-konfigar för Nordvik-nätet.
//!
//! Rust-version av gruppens Python-verktyg (vlan-tool/) med fler regler,
//! granskning mellan enheter, rättningsskript, topologi, drift-kontroll,
//! subnätskalkylator, rapporter i flera format och ett interaktivt TUI.

use anyhow::{bail, Context, Result};
use vlantool::{audit, diff, finding, generator, inventory, net, report, rules, settings, topology, tui};
use clap::{Parser, Subcommand};
use finding::Severity;
use report::{Format, Options, Paint};
use settings::Settings;
use std::io::IsTerminal;
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "vlantool", version, about = "Genererar och granskar Cisco IOS-konfigar från CSV-filer", long_about = None)]
struct Cli {
    /// Inställningsfil (skapas med `vlantool init`)
    #[arg(long, global = true, default_value = "nordvik.toml")]
    settings: PathBuf,
    /// Stäng av färger
    #[arg(long, global = true)]
    no_color: bool,
    #[command(subcommand)]
    command: Option<Command>,
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
    },
    /// Kontrollerar att CSV-filerna är rimliga och hänger ihop
    Validate {
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
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
    Diff { old: PathBuf, new: PathBuf },
    /// Jämför sparade konfigar med vad CSV-filerna säger att de borde vara
    Drift {
        #[arg(long, default_value = "samples")]
        samples: PathBuf,
        #[arg(long, default_value = "configs")]
        configs: PathBuf,
    },
    /// Ritar nätets topologi från portbeskrivningarna
    Topology { paths: Vec<PathBuf> },
    /// Listar alla granskningsregler
    Rules,
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
    },
    /// Skapar nordvik.toml med standardinställningarna
    Init {
        #[arg(long)]
        force: bool,
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

fn main() {
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

fn run(cli: Cli, color: bool) -> Result<i32> {
    let p = Paint(color);
    let settings = Settings::load(&cli.settings)?;
    let Some(command) = cli.command else {
        tui::run(vec![PathBuf::from("configs")], PathBuf::from("samples"), settings)?;
        return Ok(0);
    };
    match command {
        Command::Generate { samples, out, dry_run, force } => {
            generate(&samples, &out, dry_run, force, &settings, p)?;
        }
        Command::Validate { samples } => {
            let inv = inventory::Inventory::load_dir(&samples)?;
            let findings = inv.validate(settings.native_vlan, settings.mgmt_vlan);
            print_validation(&inv, &findings, p);
            if findings.iter().any(|f| f.severity >= Severity::High) {
                return Ok(2);
            }
        }
        Command::Audit { paths, format, output, min, rules, verbose, no_fix, fail_on } => {
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
            let text = report::render(&fleet, format, opt);
            match &output {
                Some(path) => {
                    write_file(path, &text)?;
                    println!("{} {}", p.ok("✔ Sparade"), path.display());
                    // Visa ändå en kort sammanfattning i terminalen.
                    print!("{}", report::render(&fleet, Format::Terminal, Options { color, verbose: false, fixes: false, min: Severity::High }));
                }
                None => print!("{text}"),
            }
            if let Some(level) = fail_on
                && fleet.worst().is_some_and(|w| w >= level) {
                    return Ok(2);
                }
        }
        Command::Fix { paths, out, min } => {
            let fleet = load_and_audit(&paths, &[])?;
            std::fs::create_dir_all(&out)?;
            for d in &fleet.devices {
                let lines: Vec<&String> = d.findings().filter(|f| f.severity >= min).flat_map(|f| f.fix.iter()).collect();
                if lines.is_empty() {
                    println!("{} {} – inget att rätta", p.ok("✔"), p.bold(&d.name));
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
                println!("{} {}  {}", p.accent("●"), p.bold(&d.name), p.dim(&path.display().to_string()));
                for l in script.lines() {
                    println!("    {}", if l.starts_with('!') { p.dim(l) } else { p.accent(l) });
                }
            }
        }
        Command::Diff { old, new } => {
            let a = std::fs::read_to_string(&old).with_context(|| format!("kunde inte läsa {}", old.display()))?;
            let b = std::fs::read_to_string(&new).with_context(|| format!("kunde inte läsa {}", new.display()))?;
            let (text, stats) = diff::diff(&old.display().to_string(), &a, &new.display().to_string(), &b, p);
            if stats.added + stats.removed == 0 {
                println!("{} Inga skillnader", p.ok("✔"));
            } else {
                print!("{text}");
                println!("\n{} {}", p.ok(&format!("+{}", stats.added)), p.rgb(&format!("-{}", stats.removed), (240, 110, 120)));
                return Ok(1);
            }
        }
        Command::Drift { samples, configs } => return drift(&samples, &configs, &settings, p),
        Command::Topology { paths } => {
            let configs = audit::load_configs(&default_paths(&paths))?;
            if configs.is_empty() {
                bail!("hittade inga konfigar – kör `vlantool generate` först");
            }
            println!();
            print!("{}", topology::render(&configs, p));
            println!();
        }
        Command::Rules => {
            println!();
            let mut cat = "";
            for r in rules::ALL_RULES {
                if r.category != cat {
                    cat = r.category;
                    println!("  {}", p.bold(&p.accent(cat)));
                }
                let applies = match r.applies {
                    rules::Applies::All => "alla",
                    rules::Applies::Switch => "switch",
                    rules::Applies::Router => "router",
                };
                println!(
                    "    {} {} {:<34} {}",
                    p.sev(r.severity.icon(), r.severity),
                    p.bold(&format!("{:<14}", r.id)),
                    r.title,
                    p.dim(applies)
                );
                println!("      {}", p.dim(r.why));
            }
            println!("\n  {} regler. Kör bara vissa med `vlantool audit -r ssh -r trunk`.\n", rules::ALL_RULES.len());
        }
        Command::Subnet { network, split, plan } => subnet(&network, split, plan.as_deref(), p)?,
        Command::Init { force } => {
            if cli.settings.exists() && !force {
                bail!("{} finns redan (använd --force för att skriva över)", cli.settings.display());
            }
            write_file(&cli.settings, &format!("# Inställningar för vlantool\n\n{}", Settings::default().to_toml()))?;
            println!("{} Skapade {}", p.ok("✔"), cli.settings.display());
        }
        Command::Run { samples, configs, reports } => {
            println!("{}", p.bold("\n  1/3  Validerar CSV"));
            let inv = inventory::Inventory::load_dir(&samples)?;
            let findings = inv.validate(settings.native_vlan, settings.mgmt_vlan);
            print_validation(&inv, &findings, p);
            println!("{}", p.bold("  2/3  Genererar konfigar"));
            generate(&samples, &configs, false, false, &settings, p)?;
            println!("{}", p.bold("\n  3/3  Granskar"));
            let fleet = load_and_audit(&[configs], &[])?;
            print!("{}", report::render(&fleet, Format::Terminal, Options { color, verbose: false, fixes: false, min: Severity::Low }));
            let html = reports.join("rapport.html");
            write_file(&html, &report::html(&fleet))?;
            write_file(&reports.join("rapport.md"), &report::markdown(&fleet, Options { color: false, verbose: true, fixes: true, min: Severity::Info }))?;
            println!("  {} {}  och  {}\n", p.ok("✔ Rapporter:"), html.display(), reports.join("rapport.md").display());
        }
        Command::Tui { paths, samples } => tui::run(default_paths(&paths), samples, settings)?,
    }
    Ok(0)
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
        _ => Format::Text,
    }
}

fn write_file(path: &Path, text: &str) -> Result<()> {
    if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, text).with_context(|| format!("kunde inte spara {}", path.display()))
}

fn generate(samples: &Path, out: &Path, dry_run: bool, force: bool, settings: &Settings, p: Paint) -> Result<()> {
    let inv = inventory::Inventory::load_dir(samples)?;
    let problems: Vec<_> = inv.validate(settings.native_vlan, settings.mgmt_vlan).into_iter().filter(|f| f.severity >= Severity::Critical).collect();
    if !problems.is_empty() && !force {
        for f in &problems {
            eprintln!("  {} {}", p.sev(f.severity.icon(), f.severity), f.message);
        }
        bail!("CSV-filerna har kritiska fel – rätta dem eller kör med --force");
    }
    let configs = generator::generate_all(&inv, settings)?;
    if configs.is_empty() {
        bail!("CSV-filerna i {} beskriver inga enheter", samples.display());
    }
    for g in configs {
        if dry_run {
            println!("{}\n{}\n", p.bold(&p.accent(&format!("===== {} =====", g.hostname))), g.text);
            continue;
        }
        let path = out.join(format!("{}.cfg", g.hostname));
        write_file(&path, &(g.text.clone() + "\n"))?;
        println!("  {} {:<16} {}", p.ok("✔"), g.hostname, p.dim(&format!("{}  ({} rader)", path.display(), g.text.lines().count())));
    }
    Ok(())
}

fn print_validation(inv: &inventory::Inventory, findings: &[finding::Finding], p: Paint) {
    println!(
        "\n  {} portar · {} DHCP-pooler · {} enheter från {} filer",
        inv.ports.len(),
        inv.dhcp.len(),
        inv.devices.len(),
        inv.files.len()
    );
    if findings.is_empty() {
        println!("  {} CSV-filerna ser bra ut\n", p.ok("✔"));
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

fn subnet(network: &str, split: Option<u8>, plan: Option<&str>, p: Paint) -> Result<()> {
    let net = net::Subnet::parse(network).context("ogiltigt nät – skriv t.ex. 192.168.1.0/24")?;
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
            println!("  {:>4}  {:<18} {} – {}  {}", p.dim(&(i + 1).to_string()), s.to_string(), s.first_host(), s.last_host(), p.dim(&format!("bc {}", s.broadcast())));
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
