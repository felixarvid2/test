//! Tester för nät-matten över många genererade fall: split, summarize och VLSM.

use std::net::Ipv4Addr;

use vlantool::generator::summarize;
use vlantool::net::{Subnet, vlsm};

/// Enkel deterministisk slumpgenerator (LCG), så testerna blir likadana varje körning.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 33) as u32
    }

    fn below(&mut self, n: u32) -> u32 {
        self.next() % n
    }
}

fn start(s: &Subnet) -> u64 {
    u64::from(u32::from(s.network))
}

fn end(s: &Subnet) -> u64 {
    u64::from(u32::from(s.broadcast()))
}

/// Alla adresser som nätlistan täcker, sorterade och utan dubbletter (som intervall).
fn merged_ranges(nets: &[Subnet]) -> Vec<(u64, u64)> {
    let mut ranges: Vec<(u64, u64)> = nets.iter().map(|n| (start(n), end(n))).collect();
    ranges.sort();
    let mut out: Vec<(u64, u64)> = Vec::new();
    for (s, e) in ranges {
        match out.last_mut() {
            Some(last) if s <= last.1 + 1 => last.1 = last.1.max(e),
            _ => out.push((s, e)),
        }
    }
    out
}

#[test]
fn split_covers_the_network_without_gaps() {
    let mut rng = Lcg(1);
    let mut cases = 0;
    for _ in 0..400 {
        let prefix = rng.below(25) as u8 + 8; // /8 .. /32
        let net = Subnet::new(Ipv4Addr::from(rng.next()), prefix);
        // Delar som blir fler än 4096 kapar `split`, så håll nere antalet.
        let new_prefix = prefix + rng.below(u32::from((32 - prefix).min(12)) + 1) as u8;
        let parts = net.split(new_prefix);
        assert_eq!(parts.len() as u64, 1u64 << (new_prefix - prefix), "{net} -> /{new_prefix}");
        assert_eq!(start(&parts[0]), start(&net), "{net}");
        assert_eq!(end(parts.last().unwrap()), end(&net), "{net}");
        for pair in parts.windows(2) {
            assert_eq!(end(&pair[0]) + 1, start(&pair[1]), "glapp eller överlapp i {net} /{new_prefix}");
        }
        for p in &parts {
            assert_eq!(p.prefix, new_prefix);
            assert_eq!(p.size(), 1u64 << (32 - u32::from(new_prefix)));
            assert!(net.contains(p.network) && net.contains(p.broadcast()));
        }
        cases += 1;
    }
    assert_eq!(cases, 400);
}

#[test]
fn split_rejects_impossible_prefixes() {
    let net = Subnet::parse("10.0.0.0/24").unwrap();
    assert!(net.split(16).is_empty());
    assert!(net.split(33).is_empty());
    assert_eq!(net.split(24), vec![net]);
}

#[test]
fn summarize_keeps_the_same_address_set() {
    let mut rng = Lcg(7);
    for case in 0..500 {
        // Håll alla nät inom ett /20 så att de ofta ligger intill varandra och går att slå ihop.
        let base = u32::from(Ipv4Addr::new(10, 1, 0, 0)) + (rng.below(4) << 12);
        let count = rng.below(12) + 1;
        let nets: Vec<Subnet> = (0..count)
            .map(|_| Subnet::new(Ipv4Addr::from(base + rng.below(1 << 12)), 22 + rng.below(9) as u8))
            .collect();
        let summary = summarize(nets.clone());
        assert_eq!(merged_ranges(&summary), merged_ranges(&nets), "fall {case}: {nets:?} -> {summary:?}");
        assert!(summary.len() <= nets.len(), "fall {case}: summarize ökade antalet nät");
        // Inget nät i resultatet ligger inuti ett annat.
        for (i, a) in summary.iter().enumerate() {
            for b in &summary[i + 1..] {
                assert!(!a.overlaps(b), "fall {case}: {a} och {b} överlappar");
            }
        }
    }
}

#[test]
fn summarize_merges_known_cases() {
    let quarters: Vec<Subnet> = Subnet::parse("192.168.1.0/24").unwrap().split(26);
    assert_eq!(summarize(quarters), vec![Subnet::parse("192.168.1.0/24").unwrap()]);
    let one = Subnet::parse("10.0.0.0/24").unwrap();
    assert_eq!(summarize(vec![one, one]), vec![one]);
    assert!(summarize(Vec::new()).is_empty());
    // Ett nät som ligger inuti ett annat försvinner.
    let outer = Subnet::parse("10.0.0.0/16").unwrap();
    let inner = Subnet::parse("10.0.5.0/24").unwrap();
    assert_eq!(summarize(vec![inner, outer]), vec![outer]);
}

#[test]
fn vlsm_never_overlaps_and_stays_inside_the_network() {
    let mut rng = Lcg(42);
    for case in 0..500 {
        let prefix = rng.below(13) as u8 + 16; // /16 .. /28
        let net = Subnet::new(Ipv4Addr::from(rng.next()), prefix);
        let wants: Vec<(String, u64)> = (0..rng.below(10) + 1)
            .map(|i| (format!("N{i}"), u64::from(rng.below(1 << (32 - u32::from(prefix)).min(14)))))
            .collect();
        let rows = vlsm(net, &wants);
        assert_eq!(rows.len(), wants.len(), "fall {case}");
        let placed: Vec<(&str, Subnet, u64)> =
            rows.iter().filter_map(|r| r.subnet.map(|s| (r.name.as_str(), s, r.hosts))).collect();
        for (name, s, hosts) in &placed {
            assert!(start(s) >= start(&net) && end(s) <= end(&net), "fall {case}: {name} {s} utanför {net}");
            assert!(s.usable_hosts() >= *hosts, "fall {case}: {name} {s} rymmer inte {hosts}");
            assert_eq!(s.network, Subnet::new(s.network, s.prefix).network, "fall {case}: {s} ligger snett");
        }
        for (i, (an, a, _)) in placed.iter().enumerate() {
            for (bn, b, _) in &placed[i + 1..] {
                assert!(!a.overlaps(b), "fall {case}: {an} {a} och {bn} {b} överlappar i {net}");
            }
        }
    }
}

#[test]
fn vlsm_reports_networks_that_do_not_fit() {
    let net = Subnet::parse("192.168.1.0/24").unwrap();
    let rows = vlsm(net, &[("STOR".into(), 1000), ("LITEN".into(), 10)]);
    let stor = rows.iter().find(|r| r.name == "STOR").unwrap();
    let liten = rows.iter().find(|r| r.name == "LITEN").unwrap();
    assert!(stor.subnet.is_none());
    assert_eq!(liten.subnet.unwrap().to_string(), "192.168.1.0/28");
}
