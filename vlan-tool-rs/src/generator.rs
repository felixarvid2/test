//! Bygger Cisco IOS-konfigar som text från CSV-datan.
//! Switcharna byggs från ports.csv (+ devices.csv), routern från dhcp.csv.

use crate::inventory::{join_vlans, short_port, Inventory, PortMode, PortRow};
use crate::net::Subnet;
use crate::settings::Settings;
use anyhow::{bail, Result};
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

/// Raderna som ALLA enheter ska ha först.
fn base_config(hostname: &str, s: &Settings) -> Vec<String> {
    vec![
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
        "no ip http server".into(),
        "!".into(),
        format!("username {} privilege 15 secret {}", s.username, s.secret),
        "!".into(),
    ]
}

/// Raderna som ALLA enheter ska ha sist.
fn end_config(s: &Settings) -> Vec<String> {
    let timeout = format!(" exec-timeout {} 0", s.exec_timeout);
    let mut lines = vec![
        "logging buffered 16384".into(),
        format!("logging host {}", s.log_server),
        format!("ntp server {}", s.ntp_server),
        "!".into(),
        format!("banner motd ^{}^", s.banner),
        "!".into(),
        "line con 0".into(),
        timeout.clone(),
        " logging synchronous".into(),
        " login local".into(),
    ];
    // Samma inställningar på alla vty-linjer, annars kan 5–15 råka tillåta telnet.
    for range in ["0 4", "5 15"] {
        lines.extend([format!("line vty {range}"), timeout.clone(), " transport input ssh".into(), " login local".into()]);
    }
    lines.extend(["!".into(), "end".into()]);
    lines
}

pub fn generate_switch(
    switch: &str,
    ports: &[&PortRow],
    names: &BTreeMap<u16, String>,
    inv: &Inventory,
    s: &Settings,
) -> Result<String> {
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
        if !p.description.is_empty() {
            lines.push(format!(" description {}", p.description));
        }
        match p.mode {
            PortMode::Access => {
                let Some(v) = p.vlan else { bail!("{}: accessporten {} saknar VLAN-nummer", p.source, short_port(&p.port)) };
                lines.push(" switchport mode access".into());
                lines.push(format!(" switchport access vlan {v}"));
                lines.push(" switchport nonegotiate".into());
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
            }
        }
        lines.push(if p.up { " no shutdown" } else { " shutdown" }.into());
        lines.push("!".into());
    }

    lines.extend(end_config(s));
    Ok(lines.join("\n"))
}

pub fn generate_router(inv: &Inventory, s: &Settings) -> String {
    let mut lines = base_config(&s.router_hostname, s);
    let trunk = &s.router_trunk_interface;
    let wan = &s.router_wan_interface;

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
        " no shutdown".into(),
        "!".into(),
        format!("ip nat inside source list 1 interface {wan} overload"),
    ]);
    // ACL:en byggs från näten i dhcp.csv istället för att vara hårdkodad.
    for net in summarize(inv.dhcp.iter().map(|d| d.network).collect()) {
        lines.push(format!("access-list 1 permit {} {}", net.network, net.wildcard()));
    }
    lines.extend([format!("ip route 0.0.0.0 0.0.0.0 {}", s.wan_gateway), "!".into()]);

    lines.extend(end_config(s));
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
                && a.prefix == b.prefix && a.prefix > 0 {
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
}
