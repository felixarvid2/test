//! Små IPv4-hjälpare: masker, prefix, nät och adressintervall.

use std::net::Ipv4Addr;

/// Tolkar en adress som "192.168.1.1". Ger None om texten inte är en IPv4-adress.
pub fn parse_ip(text: &str) -> Option<Ipv4Addr> {
    text.trim().parse().ok()
}

/// Gör om en mask som "255.255.255.192" till prefixlängd (26).
/// Ger None om masken inte är sammanhängande ettor följt av nollor.
pub fn mask_to_prefix(mask: Ipv4Addr) -> Option<u8> {
    let bits = u32::from(mask);
    let prefix = bits.leading_ones();
    if bits.checked_shl(prefix).unwrap_or(0) != 0 {
        return None;
    }
    Some(prefix as u8)
}

pub fn prefix_to_mask(prefix: u8) -> Ipv4Addr {
    if prefix == 0 { Ipv4Addr::new(0, 0, 0, 0) } else { Ipv4Addr::from(u32::MAX << (32 - u32::from(prefix))) }
}

/// Ett IPv4-nät, t.ex. 192.168.1.0/26.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Subnet {
    pub network: Ipv4Addr,
    pub prefix: u8,
}

impl Subnet {
    pub fn new(addr: Ipv4Addr, prefix: u8) -> Self {
        let mask = u32::from(prefix_to_mask(prefix));
        Subnet { network: Ipv4Addr::from(u32::from(addr) & mask), prefix }
    }

    pub fn from_addr_mask(addr: Ipv4Addr, mask: Ipv4Addr) -> Option<Self> {
        Some(Subnet::new(addr, mask_to_prefix(mask)?))
    }

    /// Tolkar "192.168.1.0/26" eller "192.168.1.0 255.255.255.192".
    pub fn parse(text: &str) -> Option<Self> {
        let text = text.trim();
        if let Some((addr, prefix)) = text.split_once('/') {
            let prefix: u8 = prefix.trim().parse().ok()?;
            if prefix > 32 {
                return None;
            }
            return Some(Subnet::new(parse_ip(addr)?, prefix));
        }
        let mut parts = text.split_whitespace();
        let addr = parse_ip(parts.next()?)?;
        let mask = parts.next().and_then(parse_ip).unwrap_or(Ipv4Addr::new(255, 255, 255, 255));
        Subnet::from_addr_mask(addr, mask)
    }

    pub fn mask(&self) -> Ipv4Addr {
        prefix_to_mask(self.prefix)
    }

    pub fn wildcard(&self) -> Ipv4Addr {
        Ipv4Addr::from(!u32::from(self.mask()))
    }

    pub fn broadcast(&self) -> Ipv4Addr {
        Ipv4Addr::from(u32::from(self.network) | u32::from(self.wildcard()))
    }

    pub fn size(&self) -> u64 {
        1u64 << (32 - u32::from(self.prefix))
    }

    /// Antal adresser som går att ge till enheter (nät- och broadcastadress räknas bort).
    pub fn usable_hosts(&self) -> u64 {
        match self.prefix {
            32 => 1,
            31 => 2,
            _ => self.size() - 2,
        }
    }

    pub fn first_host(&self) -> Ipv4Addr {
        if self.prefix >= 31 { self.network } else { Ipv4Addr::from(u32::from(self.network) + 1) }
    }

    pub fn last_host(&self) -> Ipv4Addr {
        if self.prefix >= 31 { self.broadcast() } else { Ipv4Addr::from(u32::from(self.broadcast()) - 1) }
    }

    pub fn contains(&self, addr: Ipv4Addr) -> bool {
        Subnet::new(addr, self.prefix).network == self.network
    }

    pub fn overlaps(&self, other: &Subnet) -> bool {
        self.contains(other.network) || other.contains(self.network)
    }

    /// Är hela nätet privat enligt RFC 1918 (10/8, 172.16/12, 192.168/16)?
    pub fn is_private(&self) -> bool {
        ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
            .iter()
            .filter_map(|p| Subnet::parse(p))
            .any(|p| p.prefix <= self.prefix && p.contains(self.network))
    }

    /// Alla adresser som går att ge till enheter, i ordning (som `first_host..=last_host`).
    pub fn hosts(&self) -> impl Iterator<Item = Ipv4Addr> + use<> {
        (u32::from(self.first_host())..=u32::from(self.last_host())).map(Ipv4Addr::from)
    }

    /// Delar nätet i lika stora delnät med prefixet `new_prefix`.
    pub fn split(&self, new_prefix: u8) -> Vec<Subnet> {
        if new_prefix < self.prefix || new_prefix > 32 {
            return Vec::new();
        }
        let step = 1u64 << (32 - u32::from(new_prefix));
        let count = 1u64 << (new_prefix - self.prefix);
        (0..count.min(4096))
            .map(|i| Subnet::new(Ipv4Addr::from((u64::from(u32::from(self.network)) + i * step) as u32), new_prefix))
            .collect()
    }
}

impl serde::Serialize for Subnet {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(self)
    }
}

impl std::fmt::Display for Subnet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}/{}", self.network, self.prefix)
    }
}

/// Antal adresser från `start` till och med `end` (0 om intervallet är baklänges).
pub fn range_len(start: Ipv4Addr, end: Ipv4Addr) -> u64 {
    let (s, e) = (u32::from(start), u32::from(end));
    if e < s { 0 } else { u64::from(e - s) + 1 }
}

/// Minsta prefix som rymmer `hosts` enheter.
pub fn prefix_for_hosts(hosts: u64) -> Option<u8> {
    (0..=30u8).rev().find(|&p| (1u64 << (32 - u32::from(p))) - 2 >= hosts)
}

/// En rad i en VLSM-plan. `subnet` är None om nätet inte fick plats.
#[derive(Debug, Clone)]
pub struct VlsmRow {
    pub name: String,
    pub hosts: u64,
    pub subnet: Option<Subnet>,
}

/// Tolkar "KONTOR:50,GAST:20" till (namn, värdar).
pub fn parse_plan(text: &str) -> Result<Vec<(String, u64)>, String> {
    text.split(',')
        .filter(|p| !p.trim().is_empty())
        .map(|part| {
            let (name, hosts) = part.split_once(':').ok_or("planen skrivs NAMN:värdar,NAMN:värdar")?;
            let hosts = hosts.trim().parse().map_err(|_| format!("'{}' är inget antal värdar", hosts.trim()))?;
            Ok((name.trim().to_string(), hosts))
        })
        .collect()
}

/// VLSM: delar ut nät till behoven, största först så att inget hamnar snett.
pub fn vlsm(net: Subnet, wants: &[(String, u64)]) -> Vec<VlsmRow> {
    let mut wants = wants.to_vec();
    wants.sort_by_key(|w| std::cmp::Reverse(w.1));
    let mut next = u64::from(u32::from(net.network));
    let end = u64::from(u32::from(net.broadcast()));
    wants
        .into_iter()
        .map(|(name, hosts)| {
            let subnet = prefix_for_hosts(hosts).filter(|&p| p >= net.prefix).and_then(|prefix| {
                let size = 1u64 << (32 - u32::from(prefix));
                let start = next.div_ceil(size) * size;
                (start + size - 1 <= end).then(|| {
                    next = start + size;
                    Subnet::new(Ipv4Addr::from(start as u32), prefix)
                })
            });
            VlsmRow { name, hosts, subnet }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_and_prefix() {
        assert_eq!(mask_to_prefix("255.255.255.192".parse().unwrap()), Some(26));
        assert_eq!(mask_to_prefix("255.0.255.0".parse().unwrap()), None);
        assert_eq!(prefix_to_mask(26), "255.255.255.192".parse::<Ipv4Addr>().unwrap());
        assert_eq!(prefix_to_mask(0), Ipv4Addr::new(0, 0, 0, 0));
    }

    #[test]
    fn subnet_math() {
        let s = Subnet::parse("192.168.1.70/26").unwrap();
        assert_eq!(s.to_string(), "192.168.1.64/26");
        assert_eq!(s.broadcast(), "192.168.1.127".parse::<Ipv4Addr>().unwrap());
        assert_eq!(s.usable_hosts(), 62);
        assert!(s.contains("192.168.1.100".parse().unwrap()));
        assert!(!s.contains("192.168.1.128".parse().unwrap()));
        assert_eq!(s.wildcard().to_string(), "0.0.0.63");
        let big = Subnet::parse("192.168.1.0 255.255.255.0").unwrap();
        assert!(big.overlaps(&s));
        assert_eq!(big.split(26).len(), 4);
        assert_eq!(prefix_for_hosts(50), Some(26));
        assert_eq!(prefix_for_hosts(62), Some(26));
        assert_eq!(prefix_for_hosts(63), Some(25));
    }

    #[test]
    fn private_and_hosts() {
        assert!(Subnet::parse("192.168.1.0/26").unwrap().is_private());
        assert!(Subnet::parse("10.1.2.0/24").unwrap().is_private());
        assert!(Subnet::parse("172.16.0.0/12").unwrap().is_private());
        assert!(Subnet::parse("172.31.255.0/24").unwrap().is_private());
        assert!(!Subnet::parse("172.32.0.0/24").unwrap().is_private());
        assert!(!Subnet::parse("192.168.0.0/15").unwrap().is_private(), "större än 192.168/16");
        assert!(!Subnet::parse("203.0.113.0/24").unwrap().is_private());
        let hosts: Vec<Ipv4Addr> = Subnet::parse("192.168.1.0/30").unwrap().hosts().collect();
        assert_eq!(hosts, vec![Ipv4Addr::new(192, 168, 1, 1), Ipv4Addr::new(192, 168, 1, 2)]);
        assert_eq!(Subnet::parse("192.168.1.0/26").unwrap().hosts().count(), 62);
        assert_eq!(Subnet::parse("10.0.0.0/31").unwrap().hosts().count(), 2);
        assert_eq!(Subnet::parse("10.0.0.7/32").unwrap().hosts().collect::<Vec<_>>(), vec![Ipv4Addr::new(10, 0, 0, 7)]);
    }

    #[test]
    fn vlsm_plan() {
        let plan = parse_plan("A:20, B:50,C:300").unwrap();
        let rows = vlsm(Subnet::parse("192.168.1.0/24").unwrap(), &plan);
        assert_eq!(rows[0].name, "C");
        assert!(rows[0].subnet.is_none(), "300 värdar får inte plats i en /24");
        assert_eq!(rows[1].subnet.unwrap().to_string(), "192.168.1.0/26");
        assert_eq!(rows[2].subnet.unwrap().to_string(), "192.168.1.64/27");
        assert!(parse_plan("A=3").is_err());
    }
}
