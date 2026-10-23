//! Inställningar som är samma för alla enheter. Standardvärdena är desamma som i
//! Python-versionen, men allt kan ändras i `nordvik.toml` utan att röra koden.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
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

    pub fn to_toml(&self) -> String {
        toml::to_string_pretty(self).unwrap_or_default()
    }
}
