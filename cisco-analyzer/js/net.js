// IPv4 helpers and Cisco interface-name helpers shared by every other module.
(function (root) {
  const CCA = root.CCA = root.CCA || {};

  function ipToInt(ip) {
    if (typeof ip !== 'string') return null;
    const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const p = m.slice(1).map(Number);
    if (p.some(x => x > 255)) return null;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  }

  function intToIp(n) {
    n = n >>> 0;
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  function isIp(s) { return ipToInt(s) !== null; }

  // Returns the prefix length for a contiguous mask, or -1 if the mask is not contiguous.
  function maskToPrefix(mask) {
    const n = ipToInt(mask);
    if (n === null) return -1;
    let len = 0;
    while (len < 32 && (n & (0x80000000 >>> len))) len++;
    const rebuilt = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
    return rebuilt === n ? len : -1;
  }

  function prefixToMaskInt(len) { return len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0; }
  function prefixToMask(len) { return intToIp(prefixToMaskInt(len)); }

  function isValidMask(mask) { return maskToPrefix(mask) >= 0; }

  // A wildcard is "valid" in the classic sense when its inverse is a contiguous mask.
  function wildcardToPrefix(wc) {
    const n = ipToInt(wc);
    if (n === null) return -1;
    return maskToPrefix(intToIp(~n >>> 0));
  }

  function networkInt(ip, mask) {
    const a = ipToInt(ip), m = ipToInt(mask);
    if (a === null || m === null) return null;
    return (a & m) >>> 0;
  }

  function network(ip, mask) {
    const n = networkInt(ip, mask);
    return n === null ? null : intToIp(n);
  }

  function broadcast(ip, mask) {
    const a = ipToInt(ip), m = ipToInt(mask);
    return intToIp((a & m | ~m) >>> 0);
  }

  function inSubnet(ip, net, mask) {
    const a = ipToInt(ip), n = ipToInt(net), m = ipToInt(mask);
    if (a === null || n === null || m === null) return false;
    return ((a & m) >>> 0) === ((n & m) >>> 0);
  }

  // Cisco wildcard match: bits set in the wildcard are "don't care".
  function wildcardMatch(ip, addr, wc) {
    const a = ipToInt(ip), b = ipToInt(addr), w = ipToInt(wc);
    if (a === null || b === null || w === null) return false;
    const care = ~w >>> 0;
    return ((a & care) >>> 0) === ((b & care) >>> 0);
  }

  function subnetsOverlap(n1, m1, n2, m2) {
    const shorter = maskToPrefix(m1) <= maskToPrefix(m2) ? m1 : m2;
    return inSubnet(n1, n2, shorter) && inSubnet(n2, n1, shorter);
  }

  function cidr(ip, mask) {
    const net = network(ip, mask);
    return net + '/' + maskToPrefix(mask);
  }

  function isHostAddress(ip, mask) {
    const p = maskToPrefix(mask);
    if (p >= 31) return true;
    const a = ipToInt(ip), m = ipToInt(mask);
    const host = (a & ~m) >>> 0;
    return host !== 0 && host !== (~m >>> 0);
  }

  // Interface names --------------------------------------------------------
  const IF_TYPES = [
    ['TwentyFiveGigE', ['twe', 'twentyfivegige']],
    ['HundredGigE', ['hu', 'hundredgige']],
    ['FortyGigabitEthernet', ['fo', 'forty']],
    ['TenGigabitEthernet', ['te', 'ten', 'tengig', 'tengigabitethernet']],
    ['GigabitEthernet', ['gi', 'g', 'gig', 'gigabitethernet']],
    ['FastEthernet', ['fa', 'f', 'fast', 'fastethernet']],
    ['Ethernet', ['e', 'et', 'eth', 'ethernet']],
    ['Serial', ['s', 'se', 'ser', 'serial']],
    ['Port-channel', ['po', 'port-channel', 'portchannel']],
    ['Vlan', ['vl', 'vlan']],
    ['Loopback', ['lo', 'loop', 'loopback']],
    ['Tunnel', ['tu', 'tun', 'tunnel']],
    ['Dialer', ['di', 'dialer']],
    ['Null', ['nu', 'null']],
    ['BVI', ['bvi']],
    ['Multilink', ['mu', 'multilink']]
  ];
  const SHORT = {
    TwentyFiveGigE: 'Twe', HundredGigE: 'Hu', FortyGigabitEthernet: 'Fo', TenGigabitEthernet: 'Te',
    GigabitEthernet: 'Gi', FastEthernet: 'Fa', Ethernet: 'Eth', Serial: 'Se', 'Port-channel': 'Po',
    Vlan: 'Vl', Loopback: 'Lo', Tunnel: 'Tu', Dialer: 'Di', Null: 'Nu', BVI: 'BVI', Multilink: 'Mu'
  };

  // Turns "gi0/1", "g 0/1", "GigabitEthernet0/1" or "Gig0/1.10" into "GigabitEthernet0/1(.10)".
  function normalizeIfName(name) {
    if (!name) return null;
    const m = String(name).trim().match(/^([A-Za-z-]+)\s*(\d[\d/.:]*)$/);
    if (!m) return null;
    const t = m[1].toLowerCase();
    for (const [full, abbrs] of IF_TYPES) {
      if (full.toLowerCase() === t || abbrs.includes(t) || (t.length >= 2 && full.toLowerCase().startsWith(t))) {
        return full + m[2];
      }
    }
    return null;
  }

  function shortIfName(full) {
    const m = String(full).match(/^([A-Za-z-]+)(.*)$/);
    if (!m) return full;
    return (SHORT[m[1]] || m[1]) + m[2];
  }

  function ifType(full) {
    const m = String(full).match(/^([A-Za-z-]+)/);
    return m ? m[1] : '';
  }

  // Finds interface-like tokens ("Gi0/1", "fa0/24", "vlan 10" is NOT treated as an interface) in free text.
  function findIfNames(text) {
    const out = new Set();
    const re = /\b(twe|hu|fo|te|ten|gi|gig|g|fa|f|fast|e|eth|et|s|se|ser|serial|po|port-channel|lo|loopback|tu|tunnel|gigabitethernet|fastethernet|tengigabitethernet|ethernet)\s?(\d+(?:\/\d+){0,3}(?:\.\d+)?)\b/gi;
    let m;
    while ((m = re.exec(text))) {
      // "e 1" etc are too ambiguous unless a slash is present
      if (/^(e|f|g|s)$/i.test(m[1]) && !m[2].includes('/')) continue;
      const n = normalizeIfName(m[1] + m[2]);
      if (n) out.add(n);
    }
    return [...out];
  }

  function findIps(text) {
    const out = [];
    const re = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:\s*\/\s*(\d{1,2}))?\b/g;
    let m;
    while ((m = re.exec(text))) {
      if (isIp(m[1])) out.push({ ip: m[1], prefix: m[2] !== undefined ? Number(m[2]) : null, index: m.index });
    }
    return out;
  }

  CCA.net = {
    ipToInt, intToIp, isIp, maskToPrefix, prefixToMask, prefixToMaskInt, isValidMask, wildcardToPrefix,
    network, networkInt, broadcast, inSubnet, wildcardMatch, subnetsOverlap, cidr, isHostAddress,
    normalizeIfName, shortIfName, ifType, findIfNames, findIps
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CCA;
})(typeof window !== 'undefined' ? window : globalThis);
