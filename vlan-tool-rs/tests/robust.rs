//! Robusthetstest: slumpade konfigar av blandade riktiga IOS-rader och skräp
//! får aldrig få parsern eller granskningen att panika.

use vlantool::audit::audit_fleet;
use vlantool::parser::Config;

/// Enkel deterministisk slumpgenerator (LCG), ingen extern crate.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 33) as u32
    }

    fn below(&mut self, n: usize) -> usize {
        self.next() as usize % n
    }

    fn pick<'a>(&mut self, items: &'a [&'a str]) -> &'a str {
        items[self.below(items.len())]
    }
}

/// Riktiga IOS-rader, med och utan indrag, ofta i halvfärdigt skick.
const REAL: &[&str] = &[
    "hostname SW-Test-1",
    "hostname",
    "hostname R-Test",
    "no ip domain-lookup",
    "ip domain-name nordvik.example",
    "ip ssh version 2",
    "ip ssh time-out 60",
    "ip ssh authentication-retries 3",
    "login block-for 120 attempts 3 within 60",
    "service password-encryption",
    "enable secret 5 $1$abcd$efgh",
    "enable secret CHANGE_ME",
    "username admin secret CHANGE_ME",
    "spanning-tree mode rapid-pvst",
    "spanning-tree vlan 10,20,30 priority 4096",
    "spanning-tree vlan priority",
    "clock timezone CET 1 0",
    "logging host 192.168.1.50",
    "logging trap debugging",
    "ntp server 192.168.1.2",
    "ip default-gateway 192.168.1.193",
    "ip default-gateway",
    "ip route 0.0.0.0 0.0.0.0 203.0.113.1",
    "ip route 10.0.0.0",
    "access-list 10 permit 192.168.1.192 0.0.0.63",
    "access-list 100 permit ip any any",
    "access-list",
    "ip nat inside source list 1 interface GigabitEthernet0/1 overload",
    "ip dhcp pool KONTOR",
    " network 192.168.1.0 255.255.255.192",
    " network 192.168.1.0 255.0.255.0",
    " default-router 192.168.1.1",
    "ip dhcp excluded-address 192.168.1.1 192.168.1.19",
    "ip dhcp excluded-address 999.1.1.1 1.1.1.1",
    "vlan 10",
    "vlan 10,20,30",
    "vlan 99999",
    "vlan abc",
    " name KONTOR",
    " name",
    "interface FastEthernet0/1",
    "interface GigabitEthernet0/1.10",
    "interface Vlan99",
    "interface",
    "interface Loopback0",
    " description Port mot SW-Nordvik-2",
    " description Port mot",
    " description",
    " switchport mode access",
    " switchport mode trunk",
    " switchport mode",
    " switchport access vlan 10",
    " switchport access vlan 99999",
    " switchport access vlan",
    " switchport trunk allowed vlan 10,20,30,99",
    " switchport trunk allowed vlan add 40",
    " switchport trunk allowed vlan 10-20,-5,,",
    " switchport trunk native vlan 999",
    " switchport trunk native vlan x",
    " switchport nonegotiate",
    " switchport port-security maximum 2",
    " encapsulation dot1Q 10",
    " encapsulation dot1Q",
    " ip address 192.168.1.1 255.255.255.192",
    " ip address 192.168.1.1",
    " ip address 300.1.1.1 255.255.255.0",
    " ip address dhcp",
    " ip nat inside",
    " ip nat outside",
    " no cdp enable",
    " spanning-tree portfast",
    " spanning-tree bpduguard enable",
    " shutdown",
    " no shutdown",
    "banner motd ^C Obehörig åtkomst förbjuden ^C",
    "banner motd ^C",
    "line con 0",
    "line vty 0 4",
    "line vty 5 15",
    " exec-timeout 5 0",
    " exec-timeout",
    " transport input ssh",
    " access-class 10 in",
    " login local",
    " password cisco",
    "! vlantool:ignore ssh",
    "! vlantool:ignore",
    "! vlantool:ignore ssh version",
    "!",
    "end",
];

/// Skräp: tomma rader, konstiga tecken, enorma tal, brutna rader.
const JUNK: &[&str] = &[
    "",
    "   ",
    "\t",
    " ",
    "  ",
    "!!!!!",
    "interface interface interface",
    " ip address ",
    " ip address / /",
    " ip address 1.2.3.4 255.255.255.255",
    " ip address 0.0.0.0 0.0.0.0",
    " ip address 255.255.255.255 255.255.255.255",
    "ip route 1.1.1.1 255.255.255.255 999.9.9.9",
    "access-list 99999999999999999999 permit",
    "vlan 18446744073709551616",
    " switchport trunk allowed vlan 1-4094,4095-99999,0",
    " switchport trunk allowed vlan 5-1",
    " description Port mot Port mot Port mot",
    " description mot",
    " description  mot  ",
    "åäö ÅÄÖ ✔ ◆ ≠ 🙂",
    "\u{0}\u{1}\u{7f}",
    "{{{{}}}}[[[[]]]]",
    "......",
    "/////",
    "10.0.0.0/33",
    "10.0.0.0/",
    "-1",
    "ip dhcp pool",
    "line",
    "line vty",
    "line vty x y",
    "no",
    "no no no",
    "hostname \u{2603}",
    "\r",
    "x\ry\rz",
    "interface Gi0/1\tdescription tab",
];

fn random_line(rng: &mut Lcg) -> String {
    let mut line = match rng.below(10) {
        0..=5 => rng.pick(REAL).to_string(),
        6..=7 => rng.pick(JUNK).to_string(),
        8 => {
            // Två riktiga rader hopklistrade på samma rad.
            format!("{} {}", rng.pick(REAL), rng.pick(REAL).trim())
        }
        _ => {
            // En riktig rad som kapas på ett slumpat ställe (på en teckengräns).
            let full = rng.pick(REAL);
            let cut = rng.below(full.chars().count() + 1);
            full.chars().take(cut).collect()
        }
    };
    if rng.below(20) == 0 {
        line.push_str("   ");
    }
    if rng.below(30) == 0 {
        line = line.to_uppercase();
    }
    line
}

fn random_config(rng: &mut Lcg, index: usize) -> Config {
    let lines = rng.below(120);
    let text = (0..lines).map(|_| random_line(rng)).collect::<Vec<_>>().join(if rng.below(5) == 0 { "\r\n" } else { "\n" });
    Config::parse(&format!("slump-{index}"), &format!("slump-{index}.cfg"), &text)
}

#[test]
fn random_configs_never_panic_the_parser() {
    let mut rng = Lcg(2024);
    for i in 0..1500 {
        let c = random_config(&mut rng, i);
        // Rör vid det som andra delar av verktyget läser, så att lata fel hade synts.
        let _ = (c.display_name(), c.addresses(), c.interfaces.len(), c.vlans.len());
        for iface in &c.interfaces {
            let _ = (iface.subnet(), iface.svi_vlan(), iface.peer());
        }
    }
}

#[test]
fn random_fleets_never_panic_the_audit() {
    let mut rng = Lcg(99);
    for round in 0..150 {
        let count = rng.below(5);
        let configs: Vec<Config> = (0..count).map(|i| random_config(&mut rng, round * 10 + i)).collect();
        let fleet = audit_fleet(configs, &[]);
        assert!(fleet.score <= 100, "betyget över 100 i omgång {round}");
        for d in &fleet.devices {
            assert!(d.score <= 100);
        }
    }
}

#[test]
fn degenerate_inputs_never_panic() {
    let inputs = ["", "\n", "\n\n\n", " ", "!", "interface", " ", "\u{0}", "hostname", "interface Gi0/1\n description"];
    let configs: Vec<Config> = inputs.iter().enumerate().map(|(i, t)| Config::parse(&format!("d{i}"), "d.cfg", t)).collect();
    let fleet = audit_fleet(configs, &[]);
    assert_eq!(fleet.devices.len(), inputs.len());
    let _ = audit_fleet(Vec::new(), &[]);
}
