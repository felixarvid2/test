//! Inställningar som är samma för alla enheter. Standardvärdena är desamma som i
//! Python-versionen, men allt kan ändras i `nordvik.toml` utan att röra koden.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use crate::net::{mask_to_prefix, parse_ip, Subnet};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub domain: String,
    pub log_server: String,
    pub ntp_server: String,
    pub username: String,
    /// Lösenord i klartext som IOS krypterar med `secret`. Byt ut CHANGE_ME!
    pub secret: String,
    pub banner: String,
    /// Minuter innan en inaktiv SSH/konsol-session loggas ut.
    pub exec_timeout: u32,
    pub mgmt_vlan: u16,
    pub native_vlan: u16,
    pub router_hostname: String,
    pub router_trunk_interface: String,
    pub router_wan_interface: String,
    pub wan_ip: String,
    pub wan_mask: String,
    pub wan_gateway: String,
    /// Sätter `spanning-tree portfast` och `bpduguard` på alla accessportar.
    pub edge_protection: bool,
    /// Tidszon som `clock timezone` ("NAMN timmar [minuter]"). Tom = ingen rad.
    pub timezone: String,
    /// ACL 10 för hanteringsnätet och `access-class 10 in` på vty-linjerna.
    pub vty_acl: bool,
    /// `ip dhcp snooping` på switcharna, med trunkarna som betrodda portar.
    pub dhcp_snooping: bool,
}

/// Ett fel i inställningarna: vilket fält det gäller och vad som är fel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsIssue {
    pub field: &'static str,
    pub message: String,
}

impl std::fmt::Display for SettingsIssue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.field, self.message)
    }
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            domain: "nordvik.example".into(),
            log_server: "192.168.1.17".into(),
            ntp_server: "192.168.1.16".into(),
            username: "drift".into(),
            secret: "CHANGE_ME".into(),
            banner: "Endast behorig personal. All aktivitet loggas.".into(),
            exec_timeout: 10,
            mgmt_vlan: 99,
            native_vlan: 999,
            router_hostname: "R-Nordvik-1".into(),
            router_trunk_interface: "GigabitEthernet0/0".into(),
            router_wan_interface: "GigabitEthernet0/1".into(),
            wan_ip: "203.0.113.10".into(),
            wan_mask: "255.255.255.0".into(),
            wan_gateway: "203.0.113.1".into(),
            edge_protection: true,
            timezone: "CET 1 0".into(),
            vty_acl: true,
            dhcp_snooping: false,
        }
    }
}

impl Settings {
    /// Läser `path` om filen finns, annars används standardvärdena.
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Settings::default());
        }
        let text = std::fs::read_to_string(path).with_context(|| format!("kunde inte läsa {}", path.display()))?;
        toml::from_str(&text).with_context(|| format!("fel i {}", path.display()))
    }

    /// Kontrollerar IP-adresser, masker, VLAN-nummer och tidszon. Tom lista = allt är rimligt.
    pub fn validate(&self) -> Vec<SettingsIssue> {
        let mut out = Vec::new();
        let mut bad = |field: &'static str, message: String| out.push(SettingsIssue { field, message });

        for (field, value) in [
            ("log_server", &self.log_server),
            ("ntp_server", &self.ntp_server),
            ("wan_ip", &self.wan_ip),
            ("wan_gateway", &self.wan_gateway),
        ] {
            if parse_ip(value).is_none() {
                bad(field, format!("'{value}' är ingen giltig IP-adress"));
            }
        }
        let mask = parse_ip(&self.wan_mask);
        match mask {
            None => bad("wan_mask", format!("'{}' är ingen giltig mask", self.wan_mask)),
            Some(m) if mask_to_prefix(m).is_none() => bad("wan_mask", format!("masken {m} är inte sammanhängande")),
            _ => {}
        }
        if let (Some(ip), Some(gw), Some(m)) = (parse_ip(&self.wan_ip), parse_ip(&self.wan_gateway), mask)
            && let Some(net) = Subnet::from_addr_mask(ip, m)
            && !net.contains(gw)
        {
            bad("wan_gateway", format!("gatewayen {gw} ligger inte i WAN-nätet {net}"));
        }
        for (field, v) in [("mgmt_vlan", self.mgmt_vlan), ("native_vlan", self.native_vlan)] {
            if !(1..=4094).contains(&v) {
                bad(field, format!("VLAN {v} är utanför 1–4094"));
            }
        }
        if self.mgmt_vlan == self.native_vlan {
            bad("native_vlan", format!("native-VLAN och hanterings-VLAN är båda {}", self.mgmt_vlan));
        }
        if self.exec_timeout > 35791 {
            bad("exec_timeout", format!("{} minuter är över IOS gräns på 35791", self.exec_timeout));
        }
        for (field, v) in [("username", &self.username), ("secret", &self.secret), ("router_hostname", &self.router_hostname)] {
            if v.trim().is_empty() {
                bad(field, "får inte vara tomt".into());
            }
        }
        if !valid_timezone(&self.timezone) {
            bad("timezone", format!("'{}' ska skrivas NAMN timmar [minuter], t.ex. CET 1 0", self.timezone));
        }
        out
    }

    pub fn to_toml(&self) -> String {
        toml::to_string_pretty(self).unwrap_or_default()
    }
}

/// "CET 1 0" / "EST -5" / tom text.
fn valid_timezone(tz: &str) -> bool {
    let words: Vec<&str> = tz.split_whitespace().collect();
    match words.as_slice() {
        [] => true,
        [name, hours] | [name, hours, _] => {
            name.chars().all(|c| c.is_ascii_alphabetic())
                && hours.parse::<i32>().is_ok_and(|h| (-23..=14).contains(&h))
                && words.get(2).is_none_or(|m| m.parse::<u32>().is_ok_and(|m| m < 60))
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        assert!(Settings::default().validate().is_empty());
    }

    #[test]
    fn old_toml_still_loads_with_new_defaults() {
        let s: Settings = toml::from_str("domain = \"x.example\"\nmgmt_vlan = 50\n").unwrap();
        assert_eq!(s.timezone, "CET 1 0");
        assert!(s.vty_acl);
        assert!(!s.dhcp_snooping);
        assert_eq!(s.mgmt_vlan, 50);
    }

    #[test]
    fn validate_finds_problems() {
        let s = Settings {
            log_server: "300.1.1.1".into(),
            wan_mask: "255.0.255.0".into(),
            mgmt_vlan: 0,
            native_vlan: 5000,
            timezone: "CET one".into(),
            ..Settings::default()
        };
        let fields: Vec<&str> = s.validate().iter().map(|i| i.field).collect();
        for f in ["log_server", "wan_mask", "mgmt_vlan", "native_vlan", "timezone"] {
            assert!(fields.contains(&f), "{f} saknas i {fields:?}");
        }
        let s = Settings { wan_gateway: "198.51.100.1".into(), mgmt_vlan: 99, native_vlan: 99, timezone: String::new(), ..Settings::default() };
        let issues = s.validate();
        assert!(issues.iter().any(|i| i.field == "wan_gateway" && i.message.contains("WAN-nätet")));
        assert!(issues.iter().any(|i| i.field == "native_vlan"));
        assert!(!issues.iter().any(|i| i.field == "timezone"));
    }
}
