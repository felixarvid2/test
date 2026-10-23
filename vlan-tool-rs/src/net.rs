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
    if prefix == 0 {
        Ipv4Addr::new(0, 0, 0, 0)
    } else {
        Ipv4Addr::from(u32::MAX << (32 - u32::from(prefix)))
    }
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
}
