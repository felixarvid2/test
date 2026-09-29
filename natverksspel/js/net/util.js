// Gemensamma hjälpfunktioner: IP-räkning, interfacenamn, kloning.
var NV = (typeof window !== 'undefined' ? window : globalThis).NV || {};
(typeof window !== 'undefined' ? window : globalThis).NV = NV;

NV.util = (function () {
  function ipToInt(ip) {
    if (typeof ip !== 'string') return null;
    var p = ip.split('.');
    if (p.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(p[i])) return null;
      var v = parseInt(p[i], 10);
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n >>> 0;
  }
  function intToIp(n) {
    n = n >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  function isIp(s) { return ipToInt(s) !== null; }
  function maskToPrefix(mask) {
    var m = ipToInt(mask);
    if (m === null) return null;
    var bits = 0, seenZero = false;
    for (var i = 31; i >= 0; i--) {
      if (m & (1 << i)) { if (seenZero) return null; bits++; } else seenZero = true;
    }
    return bits;
  }
  function prefixToMask(p) {
    if (p === 0) return '0.0.0.0';
    return intToIp((0xffffffff << (32 - p)) >>> 0);
  }
  function isValidMask(mask) { return maskToPrefix(mask) !== null; }
  function network(ip, mask) { return intToIp((ipToInt(ip) & ipToInt(mask)) >>> 0); }
  function broadcast(ip, mask) { return intToIp(((ipToInt(ip) & ipToInt(mask)) | (~ipToInt(mask))) >>> 0); }
  function sameSubnet(a, b, mask) {
    var m = ipToInt(mask);
    return ((ipToInt(a) & m) >>> 0) === ((ipToInt(b) & m) >>> 0);
  }
  function inNet(ip, net, mask) { return sameSubnet(ip, net, mask); }
  // Wildcard-matchning för ACL: 0-bitar måste stämma.
  function wildMatch(ip, base, wild) {
    var care = (~ipToInt(wild)) >>> 0;
    return ((ipToInt(ip) & care) >>> 0) === ((ipToInt(base) & care) >>> 0);
  }
  function isPrivate(ip) {
    var n = ipToInt(ip);
    return inNet(ip, '10.0.0.0', '255.0.0.0') || inNet(ip, '172.16.0.0', '255.240.0.0') ||
      inNet(ip, '192.168.0.0', '255.255.0.0') || inNet(ip, '169.254.0.0', '255.255.0.0') || n === null;
  }

  // Interfacenamn: "gi0/1", "g0/1", "GigabitEthernet0/1" -> "GigabitEthernet0/1"
  var IF_TYPES = [
    { long: 'GigabitEthernet', short: 'Gi' },
    { long: 'FastEthernet', short: 'Fa' },
    { long: 'Vlan', short: 'Vl' },
    { long: 'Loopback', short: 'Lo' },
    { long: 'Embedded-Service-Engine', short: 'Em' },
  ];
  function normIf(name) {
    if (!name) return null;
    var m = /^([a-zA-Z-]+)\s*([\d\/\.]+)$/.exec(name.trim());
    if (!m) return null;
    var t = m[1].toLowerCase();
    for (var i = 0; i < IF_TYPES.length; i++) {
      var L = IF_TYPES[i].long.toLowerCase();
      if (L.indexOf(t) === 0 && t.length >= 1) {
        // "v" räcker för Vlan, "g" för Gigabit, "f" för Fast
        return IF_TYPES[i].long + m[2];
      }
    }
    return null;
  }
  function shortIf(name) {
    for (var i = 0; i < IF_TYPES.length; i++) {
      if (name.indexOf(IF_TYPES[i].long) === 0) return IF_TYPES[i].short + name.slice(IF_TYPES[i].long.length);
    }
    return name;
  }
  // "GigabitEthernet0/5 - 9" eller "gi0/5-9"
  function expandRange(spec) {
    var out = [];
    var parts = spec.split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      var m = /^([a-zA-Z-]+\s*\d+\/)(\d+)\s*-\s*(\d+)$/.exec(p);
      if (m) {
        var base = normIf(m[1] + m[2]);
        if (!base) return null;
        var prefix = base.slice(0, base.lastIndexOf('/') + 1);
        for (var k = parseInt(m[2], 10); k <= parseInt(m[3], 10); k++) out.push(prefix + k);
      } else {
        var n = normIf(p);
        if (!n) return null;
        out.push(n);
      }
    }
    return out;
  }
  function parseVlanList(s) {
    if (s === 'all') return 'all';
    var out = [];
    var parts = String(s).split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) return null;
      var m = /^(\d+)(?:-(\d+))?$/.exec(p);
      if (!m) return null;
      var a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
      if (a < 1 || b > 4094 || b < a) return null;
      for (var v = a; v <= b; v++) if (out.indexOf(v) < 0) out.push(v);
    }
    out.sort(function (x, y) { return x - y; });
    return out;
  }
  function vlanListStr(list) {
    if (list === 'all') return '1-4094';
    if (!list.length) return 'none';
    var s = [], i = 0;
    while (i < list.length) {
      var j = i;
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      s.push(j - i >= 2 ? list[i] + '-' + list[j] : (j > i ? list[i] + ',' + list[j] : '' + list[i]));
      i = j + 1;
    }
    return s.join(',');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function padL(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function macDots(mac) { // "3cd92b770142" -> "3cd9.2b77.0142"
    return mac.slice(0, 4) + '.' + mac.slice(4, 8) + '.' + mac.slice(8, 12);
  }
  function macDash(mac) { // Windows-stil
    return mac.match(/../g).join('-').toUpperCase();
  }
  function macColon(mac) { return mac.match(/../g).join(':'); }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  return {
    ipToInt: ipToInt, intToIp: intToIp, isIp: isIp, maskToPrefix: maskToPrefix, prefixToMask: prefixToMask,
    isValidMask: isValidMask, network: network, broadcast: broadcast, sameSubnet: sameSubnet, inNet: inNet,
    wildMatch: wildMatch, isPrivate: isPrivate, normIf: normIf, shortIf: shortIf, expandRange: expandRange,
    parseVlanList: parseVlanList, vlanListStr: vlanListStr, clone: clone, pad: pad, padL: padL,
    macDots: macDots, macDash: macDash, macColon: macColon, hash: hash,
  };
})();
