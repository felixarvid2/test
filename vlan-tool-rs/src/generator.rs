//! Bygger Cisco IOS-konfigar som text från CSV-datan.
//! Switcharna byggs från ports.csv (+ devices.csv), routern från dhcp.csv.

use crate::inventory::{DeviceRow, Inventory, PortMode, PortRow, join_vlans, short_port};
use crate::net::Subnet;
use crate::parser::peer_of;
use crate::settings::Settings;
use anyhow::{Result, bail};
use std::collections::BTreeMap;

pub struct Generated {
    pub hostname: String,
    pub text: String,
}

/// Bygger alla konfigar som CSV-filerna beskriver.
pub fn generate_all(inv: &Inventory, s: &Settings) -> Result<Vec<Generated>> {
    let names = inv.vlan_names();
    let mut out = Vec::new();
    for (switch, ports) in inv.switches() {
        out.push(Generated { text: generate_switch(&switch, &ports, &names, inv, s)?, hostname: switch });
    }
    if !inv.dhcp.is_empty() {
        out.push(Generated { hostname: s.router_hostname.clone(), text: generate_router(inv, s) });
    }
    Ok(out)
}

/// Beskrivningar och banner ska vara en enda rad: radbrytningar bort, max 240 tecken.
fn one_line(text: &str, max: usize) -> String {
    let joined = text.split(['\r', '\n']).map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ");
    joined.chars().take(max).collect::<String>().trim_end().to_string()
}

/// Bannern får inte innehålla `^` (avgränsaren) eller radbrytningar.
fn banner_text(s: &Settings) -> String {
    one_line(&s.banner, 240).replace('^', "-")
}

/// Hanteringsnätet för ACL 10: nätet för DHCP-raden med `mgmt_vlan`, annars hanterings-IP:ns
/// nät i devices.csv (enhetens egen rad, annars första raden).
fn mgmt_network(inv: &Inventory, s: &Settings, device: Option<&DeviceRow>) -> Option<Subnet> {
    inv.dhcp
        .iter()
        .find(|d| d.vlan == s.mgmt_vlan)
        .map(|d| d.network)
        .or_else(|| device.or(inv.devices.first()).and_then(|d| Subnet::from_addr_mask(d.mgmt_ip, d.mgmt_mask)))
}

/// Switchen som ska bli STP-root: den med en trunk vars beskrivning pekar på routern,
/// annars den första.
fn stp_root(inv: &Inventory, s: &Settings) -> Option<String> {
    let switches = inv.switches();
    switches
        .iter()
        .find(|(_, ports)| {
            ports
                .iter()
                .any(|p| p.mode == PortMode::Trunk && peer_of(&p.description).is_some_and(|x| x.eq_ignore_ascii_case(&s.router_hostname)))
        })
        .or(switches.first())
        .map(|(name, _)| name.clone())
}

/// Raderna som ALLA enheter ska ha först.
fn base_config(hostname: &str, s: &Settings) -> Vec<String> {
    let mut lines = vec![
        "!".into(),
        format!("! Genererad av vlantool {} – ändra i CSV-filerna, inte här", env!("CARGO_PKG_VERSION")),
        "!".into(),
        "service timestamps debug datetime msec".into(),
        "service timestamps log datetime msec".into(),
        "service password-encryption".into(),
        "!".into(),
        format!("hostname {hostname}"),
        "!".into(),
        format!("enable secret {}", s.secret),
        "!".into(),
        "no ip domain-lookup".into(),
        format!("ip domain-name {}", s.domain),
        "ip ssh version 2".into(),
        "ip ssh time-out 60".into(),
        "ip ssh authentication-retries 3".into(),
        "no ip http server".into(),
        "!".into(),
        format!("username {} privilege 15 secret {}", s.username, s.secret),
        "login block-for 120 attempts 3 within 60".into(),
        "!".into(),
    ];
    if !s.timezone.trim().is_empty() {
        lines.extend([format!("clock timezone {}", s.timezone.trim()), "!".into()]);
    }
    lines
}

/// Raderna som ALLA enheter ska ha sist.
fn end_config(s: &Settings, mgmt: Option<Subnet>) -> Vec<String> {
    let timeout = format!(" exec-timeout {} 0", s.exec_timeout);
    // ACL 10 släpper bara in hanteringsnätet på vty; utan känt nät hoppas den över.
    let acl = mgmt.filter(|_| s.vty_acl);
    let mut lines: Vec<String> = vec![
        "logging buffered 16384".into(),
        "logging trap informational".into(),
        format!("logging host {}", s.log_server),
        format!("ntp server {}", s.ntp_server),
        "!".into(),
    ];
    if let Some(net) = acl {
        lines.extend([format!("access-list 10 permit {} {}", net.network, net.wildcard()), "!".into()]);
    }
    lines.extend([
        format!("banner motd ^{}^", banner_text(s)),
        "!".into(),
        "line con 0".into(),
        timeout.clone(),
        " logging synchronous".into(),
        " login local".into(),
    ]);
    // Samma inställningar på alla vty-linjer, annars kan 5–15 råka tillåta telnet.
    for range in ["0 4", "5 15"] {
        lines.extend([format!("line vty {range}"), timeout.clone(), " transport input ssh".into(), " login local".into()]);
        if acl.is_some() {
            lines.push(" access-class 10 in".into());
        }
    }
    lines.extend(["!".into(), "end".into()]);
    lines
}

pub fn generate_switch(switch: &str, ports: &[&PortRow], names: &BTreeMap<u16, String>, inv: &Inventory, s: &Settings) -> Result<String> {
    let mut lines = base_config(switch, s);
    // transparent gör att VLAN-definitionerna hamnar i running-config istället för bara vlan.dat
    lines.extend(["vtp mode transparent".into(), "spanning-tree mode rapid-pvst".into(), "!".into()]);

    // Alla VLAN switchen behöver: access-VLAN, VLAN på trunkarna, native-VLAN och hanterings-VLAN.
    let mut vlans: BTreeMap<u16, String> = BTreeMap::new();
    let name_of = |v: u16| names.get(&v).cloned().unwrap_or_else(|| format!("VLAN{v}"));
    for p in ports {
        if let (PortMode::Access, Some(v)) = (p.mode, p.vlan) {
            vlans.insert(v, if p.vlan_name.is_empty() { name_of(v) } else { p.vlan_name.clone() });
        }
        if let (PortMode::Access, Some(v)) = (p.mode, p.voice_vlan) {
            vlans.entry(v).or_insert_with(|| name_of(v));
        }
        if p.mode == PortMode::Trunk {
            for &v in &p.allowed {
                vlans.entry(v).or_insert_with(|| name_of(v));
            }
            if let Some(n) = p.native {
                vlans.entry(n).or_insert_with(|| "NATIVE".into());
            }
        }
    }
    let device = inv.device(switch);
    if device.is_some() {
        vlans.entry(s.mgmt_vlan).or_insert_with(|| name_of(s.mgmt_vlan));
    }
    for (v, name) in &vlans {
        lines.push(format!("vlan {v}"));
        lines.push(format!(" name {}", name.replace(' ', "_")));
    }
    lines.push("!".into());

    // Switchen med trunk mot routern ska vara root för alla sina VLAN.
    if !vlans.is_empty() && stp_root(inv, s).as_deref() == Some(switch) {
        let all: Vec<u16> = vlans.keys().copied().collect();
        lines.extend([format!("spanning-tree vlan {} priority 4096", join_vlans(&all)), "!".into()]);
    }
    if s.dhcp_snooping {
        let access: Vec<u16> = ports.iter().filter(|p| p.mode == PortMode::Access).filter_map(|p| p.vlan).collect();
        lines.push("ip dhcp snooping".into());
        if !access.is_empty() {
            lines.push(format!("ip dhcp snooping vlan {}", join_vlans(&access)));
        }
        lines.push("!".into());
    }

    // Hanterings-IP så att switchen går att nå med SSH.
    if let Some(d) = device {
        lines.extend([
            format!("interface Vlan{}", s.mgmt_vlan),
            " description Hantering".into(),
            format!(" ip address {} {}", d.mgmt_ip, d.mgmt_mask),
            " no shutdown".into(),
            "!".into(),
            format!("ip default-gateway {}", d.gateway),
            "!".into(),
        ]);
    }

    for p in ports {
        lines.push(format!("interface {}", p.port));
        let description = one_line(&p.description, 240);
        if !description.is_empty() {
            lines.push(format!(" description {description}"));
        }
        match p.mode {
            PortMode::Access => {
                let Some(v) = p.vlan else { bail!("{}: accessporten {} saknar VLAN-nummer", p.source, short_port(&p.port)) };
                lines.push(" switchport mode access".into());
                lines.push(format!(" switchport access vlan {v}"));
                if let Some(v) = p.voice_vlan {
                    lines.push(format!(" switchport voice vlan {v}"));
                }
                lines.push(" switchport nonegotiate".into());
                if let Some(max) = p.port_security {
                    lines.push(" switchport port-security".into());
                    lines.push(format!(" switchport port-security maximum {max}"));
                }
                if s.edge_protection {
                    lines.push(" spanning-tree portfast".into());
                    lines.push(" spanning-tree bpduguard enable".into());
                }
            }
            PortMode::Trunk => {
                lines.push(" switchport mode trunk".into());
                lines.push(format!(" switchport trunk native vlan {}", p.native.unwrap_or(s.native_vlan)));
                lines.push(format!(" switchport trunk allowed vlan {}", join_vlans(&p.allowed)));
                lines.push(" switchport nonegotiate".into());
                if s.dhcp_snooping {
                    lines.push(" ip dhcp snooping trust".into());
                }
            }
        }
        lines.push(if p.up { " no shutdown" } else { " shutdown" }.into());
        lines.push("!".into());
    }

    lines.extend(end_config(s, mgmt_network(inv, s, device)));
    Ok(lines.join("\n"))
}

pub fn generate_router(inv: &Inventory, s: &Settings) -> String {
    let mut lines = base_config(&s.router_hostname, s);
    let trunk = &s.router_trunk_interface;
    let wan = &s.router_wan_interface;
    lines.extend(["no ip source-route".into(), "!".into()]);

    // Adresser som inte delas ut till datorer (routern, skrivare, servrar ...).
    for d in &inv.dhcp {
        lines.push(format!("ip dhcp excluded-address {} {}", d.excluded_start, d.excluded_end));
    }
    lines.push("!".into());
    for d in &inv.dhcp {
        lines.extend([
            format!("ip dhcp pool {}", d.name),
            format!(" network {} {}", d.network.network, d.network.mask()),
            format!(" default-router {}", d.gateway),
            format!(" dns-server {}", d.dns),
            format!(" domain-name {}", s.domain),
        ]);
    }
    lines.push("!".into());

    // Den fysiska porten mot switchen måste vara på, annars kommer inga subinterface upp.
    let first_switch = inv.switches().first().map(|(n, _)| n.clone()).unwrap_or_else(|| "switch".into());
    lines.extend([
        format!("interface {trunk}"),
        format!(" description Trunk mot {first_switch}"),
        " no ip address".into(),
        " no shutdown".into(),
        "!".into(),
    ]);
    // Ett subinterface per VLAN, gatewayen i CSV:n blir routerns adress i det VLAN:et.
    for d in &inv.dhcp {
        lines.extend([
            format!("interface {trunk}.{}", d.vlan),
            format!(" description {}", d.name),
            format!(" encapsulation dot1Q {}", d.vlan),
            format!(" ip address {} {}", d.gateway, d.network.mask()),
            " ip nat inside".into(),
            "!".into(),
        ]);
    }
    // Native-VLAN måste matcha switcharnas trunkar.
    lines.extend([
        format!("interface {trunk}.{}", s.native_vlan),
        " description NATIVE".into(),
        format!(" encapsulation dot1Q {} native", s.native_vlan),
        "!".into(),
    ]);

    // Porten mot internet + NAT så att alla VLAN delar på routerns publika adress.
    lines.extend([
        format!("interface {wan}"),
        " description Uplink mot Operator".into(),
        format!(" ip address {} {}", s.wan_ip, s.wan_mask),
        " ip nat outside".into(),
        " no cdp enable".into(),
        " no shutdown".into(),
        "!".into(),
        format!("ip nat inside source list 1 interface {wan} overload"),
    ]);
    // ACL:en byggs från näten i dhcp.csv istället för att vara hårdkodad.
    for net in summarize(inv.dhcp.iter().map(|d| d.network).collect()) {
        lines.push(format!("access-list 1 permit {} {}", net.network, net.wildcard()));
    }
    lines.extend([format!("ip route 0.0.0.0 0.0.0.0 {}", s.wan_gateway), "!".into()]);

    lines.extend(end_config(s, mgmt_network(inv, s, None)));
    lines.join("\n")
}

/// Slår ihop grannät till större nät så att ACL:en blir kortare:
/// 4 st /26 i samma /24 blir en rad.
pub fn summarize(mut nets: Vec<Subnet>) -> Vec<Subnet> {
    nets.sort_by_key(|n| (u32::from(n.network), n.prefix));
    nets.dedup();
    loop {
        let mut merged = false;
        let mut out: Vec<Subnet> = Vec::new();
        let mut i = 0;
        while i < nets.len() {
            let a = nets[i];
            // Ta bort nät som redan täcks av det föregående.
            if out.last().is_some_and(|last| last.contains(a.network) && last.prefix <= a.prefix) {
                i += 1;
                merged = true;
                continue;
            }
            if let Some(&b) = nets.get(i + 1)
                && a.prefix == b.prefix
                && a.prefix > 0
            {
                let parent = Subnet::new(a.network, a.prefix - 1);
                if parent.network == a.network && parent.contains(b.network) {
                    out.push(parent);
                    i += 2;
                    merged = true;
                    continue;
                }
            }
            out.push(a);
            i += 1;
        }
        nets = out;
        if !merged {
            return nets;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarize_quarters() {
        let nets = ["192.168.1.0/26", "192.168.1.64/26", "192.168.1.128/26", "192.168.1.192/26"]
            .iter()
            .map(|n| Subnet::parse(n).unwrap())
            .collect();
        assert_eq!(summarize(nets), vec![Subnet::parse("192.168.1.0/24").unwrap()]);
        let gap = ["10.0.0.0/26", "10.0.0.128/26"].iter().map(|n| Subnet::parse(n).unwrap()).collect();
        assert_eq!(summarize(gap).len(), 2);
    }

    const PORTS: &str = include_str!("../samples/ports.csv");
    const DHCP: &str = include_str!("../samples/dhcp.csv");
    const DEVICES: &str = include_str!("../samples/devices.csv");

    fn sample() -> Inventory {
        Inventory::from_csv_texts(&[("ports.csv", PORTS), ("dhcp.csv", DHCP), ("devices.csv", DEVICES)]).unwrap()
    }

    fn text_of(all: &[Generated], host: &str) -> String {
        all.iter().find(|g| g.hostname == host).unwrap().text.clone()
    }

    fn has_line(text: &str, line: &str) -> bool {
        text.lines().any(|l| l == line)
    }

    #[test]
    fn output_is_deterministic() {
        let s = Settings { dhcp_snooping: true, ..Settings::default() };
        let render = || generate_all(&sample(), &s).unwrap().into_iter().map(|g| format!("{}\n{}", g.hostname, g.text)).collect::<Vec<_>>();
        let first = render();
        for _ in 0..5 {
            assert_eq!(first, render());
        }
    }

    #[test]
    fn agreed_lines_on_all_devices() {
        let all = generate_all(&sample(), &Settings::default()).unwrap();
        assert_eq!(all.len(), 3);
        for g in &all {
            for line in [
                "ip ssh time-out 60",
                "ip ssh authentication-retries 3",
                "login block-for 120 attempts 3 within 60",
                "clock timezone CET 1 0",
                "logging trap informational",
                "access-list 10 permit 192.168.1.192 0.0.0.63",
            ] {
                assert!(has_line(&g.text, line), "{} saknar '{line}'", g.hostname);
            }
            assert!(!g.text.contains("logging trap debugging"));
            assert_eq!(g.text.matches(" access-class 10 in").count(), 2, "båda vty-linjerna i {}", g.hostname);
            let vty = g.text.split("line vty 0 4").nth(1).unwrap();
            assert!(vty.split("line vty 5 15").next().unwrap().contains(" access-class 10 in"));
        }
    }

    #[test]
    fn router_lines() {
        let all = generate_all(&sample(), &Settings::default()).unwrap();
        let r = text_of(&all, "R-Nordvik-1");
        assert!(has_line(&r, "no ip source-route"));
        let wan = r.split("interface GigabitEthernet0/1\n").nth(1).unwrap().split("\n!").next().unwrap();
        assert!(wan.contains(" ip nat outside") && wan.contains(" no cdp enable"), "{wan}");
        assert!(!text_of(&all, "SW-Nordvik-1").contains("no ip source-route"));
        assert!(!r.split("interface GigabitEthernet0/0.10").nth(1).unwrap().split("\n!").next().unwrap().contains("cdp"));
    }

    #[test]
    fn mgmt_acl_prefers_dhcp_row_with_mgmt_vlan() {
        let devices = "Hostname,Mgmt_IP,Mgmt_mask,Gateway\nSW-Nordvik-1,10.9.9.5,255.255.255.0,10.9.9.1\nSW-Nordvik-2,10.9.9.6,255.255.255.0,10.9.9.1\n";
        // DHCP-raden för VLAN 99 finns: dess nät gäller trots att devices.csv säger något annat.
        let inv = Inventory::from_csv_texts(&[("ports.csv", PORTS), ("dhcp.csv", DHCP), ("devices.csv", devices)]).unwrap();
        for g in generate_all(&inv, &Settings::default()).unwrap() {
            assert!(has_line(&g.text, "access-list 10 permit 192.168.1.192 0.0.0.63"), "{}", g.hostname);
        }
        // Utan den raden används hanterings-IP:ns nät från devices.csv.
        let dhcp: String = DHCP.lines().filter(|l| !l.starts_with("99,")).map(|l| format!("{l}\n")).collect();
        let inv = Inventory::from_csv_texts(&[("ports.csv", PORTS), ("dhcp.csv", &dhcp), ("devices.csv", devices)]).unwrap();
        for g in generate_all(&inv, &Settings::default()).unwrap() {
            assert!(has_line(&g.text, "access-list 10 permit 10.9.9.0 0.0.0.255"), "{}", g.hostname);
        }
    }

    #[test]
    fn vty_acl_can_be_turned_off_and_timezone_cleared() {
        let s = Settings { vty_acl: false, timezone: String::new(), ..Settings::default() };
        for g in generate_all(&sample(), &s).unwrap() {
            assert!(!g.text.contains("access-list 10") && !g.text.contains("access-class"));
            assert!(!g.text.contains("clock timezone"));
        }
        let s = Settings { timezone: "EST -5".into(), ..Settings::default() };
        assert!(generate_all(&sample(), &s).unwrap().iter().all(|g| has_line(&g.text, "clock timezone EST -5")));
    }

    #[test]
    fn stp_root_on_switch_with_trunk_to_router() {
        let all = generate_all(&sample(), &Settings::default()).unwrap();
        let sw1 = text_of(&all, "SW-Nordvik-1");
        assert!(has_line(&sw1, "spanning-tree vlan 10,20,30,99,999 priority 4096"), "{sw1}");
        assert!(!text_of(&all, "SW-Nordvik-2").contains("priority 4096"));
        // Routern pekar på SW2 -> SW2 blir root, inte första switchen.
        let ports = PORTS.replace("Port mot R-Nordvik-1", "Port mot SW-X").replace(
            "SW-Nordvik-2,Gi0/1,trunk,trunk,trunk,\"10,20,30,99\",999,Port mot SW-Nordvik-1",
            "SW-Nordvik-2,Gi0/1,trunk,trunk,trunk,\"10,20,30,99\",999,Port mot R-Nordvik-1",
        );
        let inv = Inventory::from_csv_texts(&[("ports.csv", &ports), ("dhcp.csv", DHCP), ("devices.csv", DEVICES)]).unwrap();
        let all = generate_all(&inv, &Settings::default()).unwrap();
        assert!(!text_of(&all, "SW-Nordvik-1").contains("priority 4096"));
        assert!(text_of(&all, "SW-Nordvik-2").lines().any(|l| l.starts_with("spanning-tree vlan ") && l.ends_with(" priority 4096")));
        // Utan någon trunk mot routern: första switchen.
        let none = PORTS.replace("Port mot R-Nordvik-1", "Port mot SW-X");
        let inv = Inventory::from_csv_texts(&[("ports.csv", &none), ("dhcp.csv", DHCP), ("devices.csv", DEVICES)]).unwrap();
        assert!(text_of(&generate_all(&inv, &Settings::default()).unwrap(), "SW-Nordvik-1").contains("priority 4096"));
    }

    #[test]
    fn port_security_and_voice_vlan() {
        let ports = "Switch,Port,Lage,Vlan_Id,Vlan_Namn,Tillatna_Vlan,Native_Vlan,Beskrivning,Status,Voice_Vlan,Port_Security\nSW1,Gi0/1,trunk,,,\"10,150\",999,Port mot R-Nordvik-1,Up,,\nSW1,Fa0/1,access,10,KONTOR,10,999,Dator,Up,150,3\nSW1,Fa0/2,access,10,KONTOR,10,999,Dator,Up,,\n";
        let inv = Inventory::from_csv_texts(&[("ports.csv", ports), ("dhcp.csv", DHCP)]).unwrap();
        let all = generate_all(&inv, &Settings::default()).unwrap();
        let sw = text_of(&all, "SW1");
        let fa1 = sw.split("interface FastEthernet0/1\n").nth(1).unwrap().split("\n!").next().unwrap();
        assert!(fa1.contains(" switchport voice vlan 150\n"), "{fa1}");
        assert!(fa1.contains(" switchport port-security\n switchport port-security maximum 3"), "{fa1}");
        let fa2 = sw.split("interface FastEthernet0/2\n").nth(1).unwrap().split("\n!").next().unwrap();
        assert!(!fa2.contains("voice") && !fa2.contains("port-security"));
        assert!(sw.contains("vlan 150\n name VLAN150"), "röst-VLAN:et definieras");
    }

    #[test]
    fn dhcp_snooping_setting() {
        let off = generate_all(&sample(), &Settings::default()).unwrap();
        assert!(off.iter().all(|g| !g.text.contains("dhcp snooping")));
        let on = generate_all(&sample(), &Settings { dhcp_snooping: true, ..Settings::default() }).unwrap();
        let sw2 = text_of(&on, "SW-Nordvik-2");
        assert!(has_line(&sw2, "ip dhcp snooping"));
        assert!(has_line(&sw2, "ip dhcp snooping vlan 10,20,30,99"));
        assert_eq!(sw2.matches(" ip dhcp snooping trust").count(), 1);
        assert_eq!(text_of(&on, "SW-Nordvik-1").matches(" ip dhcp snooping trust").count(), 2);
        assert!(!text_of(&on, "R-Nordvik-1").contains("dhcp snooping"));
    }

    #[test]
    fn descriptions_and_banner_are_cleaned() {
        let long = "x".repeat(300);
        let ports = format!(
            "Switch,Port,Lage,Vlan_Id,Vlan_Namn,Tillatna_Vlan,Native_Vlan,Beskrivning,Status\nSW1,Fa0/1,access,10,K,10,999,\"rad ett\nrad två\",Up\nSW1,Fa0/2,access,10,K,10,999,{long},Up\n"
        );
        let inv = Inventory::from_csv_texts(&[("ports.csv", &ports)]).unwrap();
        let s = Settings { banner: "Hej ^C\nandra raden^".into(), ..Settings::default() };
        let text = generate_all(&inv, &s).unwrap().remove(0).text;
        assert!(has_line(&text, " description rad ett rad två"));
        assert!(has_line(&text, &format!(" description {}", "x".repeat(240))));
        let banner = text.lines().find(|l| l.starts_with("banner motd")).unwrap();
        assert_eq!(banner, "banner motd ^Hej -C andra raden-^");
        assert_eq!(banner.matches('^').count(), 2);
        assert!(!text.lines().any(|l| l == "andra raden^"));
    }
}
