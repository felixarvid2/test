// Cisco IOS-kommandotolk: lägen, förkortningar, ?, tab, felmeddelanden och kommandon.
NV.IosSession = (function () {
  var U = NV.util, S = NV.sim, SH = NV.iosShow;

  // ------------------------------------------------------------------ Hjälptexter
  var HELP = {
    'access-group': 'Specify access control for packets', 'access-list': 'Add an access list entry', 'access-lists': 'List access lists',
    'add': 'add VLANs to the current list', 'address': 'address keyword', 'all': 'all VLANs', 'allowed': 'Set allowed VLAN characteristics when interface is in trunking mode',
    'arp': 'ARP table', 'auto': 'Enable AUTO mode', 'binding': 'DHCP address bindings', 'brief': 'Brief summary of IP status and configuration',
    'cdp': 'CDP information', 'clear': 'Reset functions', 'clock': 'Display the system clock', 'configure': 'Enter configuration mode',
    'connected': 'Connected networks', 'copy': 'Copy from one file to another', 'counters': 'Clear counters on one or all interfaces', 'crypto': 'Encryption module',
    'default-gateway': 'Specify default gateway (if not routing IP)', 'default-router': 'Default routers', 'deny': 'Specify packets to reject',
    'description': 'Interface specific description', 'dhcp': 'Configure DHCP server and relay parameters', 'disable': 'Turn off privileged commands',
    'dns': 'Configure DNS server for a zone', 'dns-server': 'Set name server', 'do': 'To run exec commands in config mode',
    'domain': 'IP DNS Resolver', 'domain-name': 'Define the default domain name', 'domain-lookup': 'Enable IP Domain Name System hostname translation',
    'dot1q': 'Interface uses only 802.1q trunking encapsulation when trunking', 'duplex': 'Configure duplex operation.', 'dynamic': 'Set trunking mode to dynamically negotiate access or trunk mode',
    'enable': 'Turn on privileged commands', 'encapsulation': 'Set encapsulation type for an interface', 'end': 'Exit from configure mode',
    'excluded-address': 'Prevent DHCP from assigning certain addresses', 'exit': 'Exit from the EXEC', 'extended': 'Extended Access List',
    'full': 'Force full duplex operation', 'generate': 'Generate new keys', 'half': 'Force half-duplex operation', 'host': 'Add an entry to the ip hostname table',
    'hostname': 'Set system\'s network name', 'include': 'Include lines that match', 'inline': 'Inline power configuration', 'inside': 'Inside interface for address translation',
    'interface': 'Select an interface to configure', 'interfaces': 'Interface status and configuration', 'ip': 'Global IP configuration subcommands',
    'key': 'Long term key operations', 'lease': 'Address lease time', 'line': 'Configure a terminal line', 'list': 'Specify access list describing local addresses',
    'local': 'Local password checking', 'logging': 'Modify message logging facilities', 'login': 'Enable password checking', 'logout': 'Exit from the EXEC',
    'mac': 'MAC configuration', 'mac-address': 'Secure mac address', 'mac-address-table': 'MAC forwarding table', 'maximum': 'Max secure addresses',
    'memory': 'Write to NV memory', 'mode': 'Set trunking mode of the interface', 'modulus': 'Provide number of modulus bits on the command line',
    'name': 'Ascii name of the VLAN', 'name-server': 'Specify address of name server to use', 'nat': 'NAT configuration commands', 'native': 'Set trunking native characteristics when interface is in trunking mode',
    'network': 'Network number and mask', 'never': 'Never apply inline power', 'no': 'Negate a command or set its defaults', 'nonegotiate': 'Device will not engage in negotiation protocol on this interface',
    'ntp': 'Configure NTP', 'outside': 'Outside interface for address translation', 'overload': 'Overload an address translation', 'password': 'Set a password',
    'permit': 'Specify packets to forward', 'ping': 'Send echo messages', 'pool': 'Configure DHCP address pools', 'port-security': 'Security related command',
    'portfast': 'Enable an interface to move directly to forwarding on link up', 'power': 'Power configuration', 'priority': 'Set the bridge priority for the spanning tree',
    'privilege': 'Set user privilege level', 'range': 'interface range command', 'reload': 'Halt and perform a cold restart', 'remark': 'Access list entry comment',
    'remove': 'remove VLANs from the current list', 'restrict': 'Security violation restrict mode', 'route': 'Establish static routes', 'routing': 'Enable IP routing',
    'rsa': 'Generate RSA keys', 'running-config': 'Current operating configuration', 'secret': 'Assign the privileged level secret', 'server': 'Configure NTP server',
    'service': 'Modify use of network based services', 'show': 'Show running system information', 'shutdown': 'Shutdown the selected interface', 'source': 'Source address translation',
    'spanning-tree': 'Spanning Tree Subsystem', 'speed': 'Configure speed operation.', 'ssh': 'Configure ssh options', 'standard': 'Standard Access List',
    'startup-config': 'Contents of startup configuration', 'static': 'Static routes', 'status': 'Show interface line status', 'sticky': 'Configure dynamic secure addresses as sticky',
    'switchport': 'Set switching mode characteristics', 'terminal': 'Configure from the terminal', 'traceroute': 'Trace route to destination', 'translation': 'Translation entry',
    'translations': 'Translation entries', 'statistics': 'Translation statistics', 'transport': 'Define transport protocols for line', 'trunk': 'Set trunking characteristics of the interface',
    'username': 'Establish User Name Authentication', 'version': 'System hardware and software status', 'violation': 'Security violation mode', 'vlan': 'VLAN commands',
    'vty': 'Virtual terminal', 'console': 'Primary terminal line', 'con': 'Primary terminal line', 'write': 'Write running configuration to memory, network, or terminal',
    'access': 'Set access mode characteristics of the interface', 'buffered': 'Set buffered logging parameters', 'datetime': 'Timestamp with date and time',
    'msec': 'Include milliseconds in timestamp', 'timestamps': 'Timestamp debug/log messages', 'log': 'Timestamp log messages', 'lookup': 'Enable IP Domain Name System hostname translation',
    'desirable': 'Set trunking mode dynamic negotiation parameter to DESIRABLE', 'zeroize': 'Remove keys', 'history': 'Display the session command history',
    'ntp-status': '', 'neighbors': 'Show CDP neighbor entries', 'detail': 'Show detailed information', 'description-': '', 'protocols': 'IP routing protocol process parameters',
    'mac-address-table-': '', 'address-table': 'MAC forwarding table', 'dynamic-': '', 'dhcp-': '', 'monitor': 'Copy debug output to the current terminal line',
    'length': 'Set number of lines on a screen', 'synchronous': 'Synchronized message output', 'exec-timeout': 'Set the EXEC timeout', 'input': 'Define which protocols to use when connecting to the terminal server',
    'uptime': 'Timestamp with system uptime', 'pvst': 'Per-Vlan spanning tree mode', 'except': 'all VLANs except the following', 'none': 'no VLANs',
    'negotiate': 'Device will negotiate trunking encapsulation with peer on interface', 'dns-': '', 'quit': 'Exit from the EXEC',
    'isakmp': 'Configure ISAKMP policy', 'ipsec': 'Configure IPSEC policy', 'map': 'Enter a crypto map', 'ipsec-isakmp': 'IPSEC w/ISAKMP',
    'transform-set': 'Define transform and settings', 'peer': 'Allowed Encryption/Decryption peer.', 'set': 'Set values for encryption/decryption',
    'match': 'Match values.', 'encryption': 'Set encryption algorithm for protection suite', 'hash': 'Set hash algorithm for protection suite',
    'authentication': 'Set authentication method for protection suite', 'group': 'Set the Diffie-Hellman group', 'lifetime': 'Set lifetime for ISAKMP security association',
    'pre-share': 'Pre-Shared Key', 'tcp': 'TCP header compression and other parameters', 'adjust-mss': 'Adjust the mss of transit packets',
    'mtu': 'Set IP Maximum Transmission Unit', 'sa': 'IPSEC SA table', 'policy': 'Show ISAKMP protection suite policies', 'session': 'crypto session',
    'size': 'Datagram size', 'df-bit': 'Set DF bit in IP header', 'repeat': 'Specify repeat count',
  };
  var SHOW_HELP = {
    interface: 'IP interface status and configuration', route: 'IP routing table', dhcp: 'Show items in the DHCP database',
    nat: 'IP NAT information', ssh: 'Information on SSH', arp: 'IP ARP table', 'access-lists': 'List access lists', ip: 'IP information',
    interfaces: 'Interface status and configuration', vlan: 'VTP VLAN status', 'spanning-tree': 'Spanning tree topology', mac: 'MAC configuration',
    power: 'Show inline power', 'port-security': 'Show secure port information', cdp: 'CDP information', logging: 'Show the contents of logging buffers',
    ntp: 'Network time protocol', clock: 'Display the system clock', version: 'System hardware and software status', users: 'Display information about terminal lines',
    'running-config': 'Current operating configuration', 'startup-config': 'Contents of startup configuration', history: 'Display the session command history',
    brief: 'Brief summary of IP status and configuration', status: 'Show interface line status', trunk: 'Show interface trunk information',
    static: 'Static routes', connected: 'Connected networks', binding: 'DHCP address bindings', pool: 'DHCP pools information',
    translations: 'Translation entries', statistics: 'Translation statistics', 'address-table': 'MAC forwarding table', neighbors: 'CDP neighbor entries',
    inline: 'Inline power status', description: 'Show interface description', switchport: 'Show interface switchport information',
    crypto: 'Encryption module', isakmp: 'Show ISAKMP', ipsec: 'Show IPSEC info', map: 'Crypto maps', sa: 'Security associations', session: 'Crypto session',
  };
  var PARAM_HELP = {
    ip: ['A.B.C.D', 'IP address'], mask: ['A.B.C.D', 'Mask'], wild: ['A.B.C.D', 'Wildcard bits'], word: ['WORD', 'Name'], text: ['LINE', 'Up to 240 characters describing this item'],
    'if': ['GigabitEthernet', 'GigabitEthernet IEEE 802.3z'], vlist: ['WORD', 'VLAN IDs of the allowed VLANs when this port is in trunking mode'],
    iphost: ['WORD', 'Ping destination address or hostname'],
  };

  // ------------------------------------------------------------------ Trie
  function Node() { this.kw = {}; this.params = []; this.cmd = null; }
  var TRIES = {};
  function trie(mode) { return TRIES[mode] = TRIES[mode] || new Node(); }
  function def(modes, pattern, fn, opts) {
    opts = opts || {};
    modes.split(' ').forEach(function (m) {
      var node = trie(m);
      pattern.split(' ').forEach(function (t) {
        if (t[0] === '<') {
          var p = node.params.filter(function (x) { return x.spec === t; })[0];
          if (!p) { p = { spec: t, node: new Node() }; node.params.push(p); }
          node = p.node;
        } else {
          node.kw[t] = node.kw[t] || new Node();
          node = node.kw[t];
        }
      });
      node.cmd = { fn: fn, no: opts.no !== false, noOnly: !!opts.noOnly, pattern: pattern };
    });
  }

  function tokenize(line) {
    var toks = [], re = /\S+/g, m;
    while ((m = re.exec(line))) toks.push({ t: m[0], pos: m.index });
    return toks;
  }

  function paramAccept(spec, toks, i) {
    var t = toks[i].t;
    var type = spec.slice(1, -1);
    var rng = null;
    if (type.indexOf(':') > 0) { rng = type.split(':')[1].split('-').map(Number); type = type.split(':')[0]; }
    switch (type) {
      case 'ip': case 'mask': case 'wild': return U.isIp(t) ? { n: 1, v: t } : null;
      case 'n':
        if (!/^\d+$/.test(t)) return null;
        var v = parseInt(t, 10);
        if (rng && (v < rng[0] || v > rng[1])) return null;
        return { n: 1, v: v };
      case 'word': case 'iphost': return { n: 1, v: t };
      case 'vlist': return U.parseVlanList(t) ? { n: 1, v: U.parseVlanList(t) } : null;
      case 'text': return { n: toks.length - i, v: null, rest: true };
      case 'if':
        var n1 = U.normIf(t);
        if (n1) return { n: 1, v: n1 };
        if (toks[i + 1]) { var n2 = U.normIf(t + toks[i + 1].t); if (n2 && /^[a-zA-Z-]+$/.test(t)) return { n: 2, v: n2 }; }
        return null;
    }
    return null;
  }

  function parse(root, toks, line) {
    var node = root, vals = [], kws = [];
    for (var i = 0; i < toks.length;) {
      var t = toks[i].t.toLowerCase();
      var keys = Object.keys(node.kw);
      var exact = keys.indexOf(t) >= 0 ? t : null;
      var matches = exact ? [exact] : keys.filter(function (k) { return k.indexOf(t) === 0; });
      if (matches.length === 1) { kws.push(matches[0]); node = node.kw[matches[0]]; i++; continue; }
      if (matches.length > 1) return { err: 'ambig', pos: i };
      var took = false;
      for (var p = 0; p < node.params.length; p++) {
        var acc = paramAccept(node.params[p].spec, toks, i);
        if (acc) {
          if (acc.rest) vals.push(line.slice(toks[i].pos).trim());
          else vals.push(acc.v);
          node = node.params[p].node; i += acc.n; took = true; break;
        }
      }
      if (!took) return { err: 'invalid', pos: i };
    }
    if (!node.cmd) return { err: 'incomplete', node: node };
    return { cmd: node.cmd, vals: vals, kws: kws, node: node };
  }

  // ------------------------------------------------------------------ Session
  function Session(state, devId, opts) {
    opts = opts || {};
    this.state = state;
    this.dev = state.devices[devId];
    this.via = opts.via || 'console';
    this.mode = opts.privileged ? 'exec' : 'user';
    this.ctx = {};
    this.pending = null;
    this.closed = false;
    this.history = [];
    this.user = opts.user || null;
    this.booting = false;
  }
  var P = Session.prototype;

  P.prompt = function () {
    var h = this.dev.config.hostname;
    switch (this.mode) {
      case 'user': return h + '>';
      case 'exec': return h + '#';
      case 'config': return h + '(config)#';
      case 'if': return h + (this.ctx.range ? '(config-if-range)#' : (this.ctx.sub ? '(config-subif)#' : '(config-if)#'));
      case 'vlan': return h + '(config-vlan)#';
      case 'line': return h + '(config-line)#';
      case 'dhcp': return h + '(dhcp-config)#';
      case 'acl': return h + (this.ctx.aclType === 'standard' ? '(config-std-nacl)#' : '(config-ext-nacl)#');
      case 'isakmp': return h + '(config-isakmp)#';
      case 'tset': return h + '(cfg-crypto-trans)#';
      case 'cmap': return h + '(config-crypto-map)#';
    }
    return h + '#';
  };
  P.promptText = function () { return this.pending ? this.pending.prompt : this.prompt(); };

  function modeTrie(mode) {
    return TRIES[mode];
  }

  function result(out, extra) {
    var r = { out: out || '' };
    for (var k in extra) r[k] = extra[k];
    return r;
  }

  P.handle = function (raw) {
    var line = raw.replace(/\s+$/, '');
    if (this.pending) {
      var pend = this.pending;
      this.pending = null;
      return pend.fn.call(this, line.trim());
    }
    if (NV.onCommand) NV.onCommand(this.dev.id, line, this.mode, this);
    if (!line.trim()) return result('');
    if (line.trim()[0] === '!') return result('');
    this.history.push(line);
    // Ctrl+Z-motsvarighet hanteras av terminalen via 'end'
    var pipe = null;
    var pm = /^(.*?)\s+\|\s+(\S+)\s*(.*)$/.exec(line);
    if (pm) { line = pm[1]; pipe = { op: pm[2].toLowerCase(), arg: pm[3] }; }
    var r = this.exec(line, pipe);
    if (typeof r === 'string') r = result(r);
    if (pipe && r && r.out && this.mode !== 'config') r.out = applyPipe(r.out, pipe);
    else if (pipe && r && r.out) r.out = applyPipe(r.out, pipe);
    if (S && this.state) S.refresh(this.state);
    // Broadcaststorm: konsolen svarar trögt
    var D = S.get(this.state);
    var stormy = Object.keys(D.storm).some(function (v) { return D.storm[v].indexOf(this.dev.id) >= 0; }, this);
    if (stormy) r.delay = (r.delay || 0) + 1800;
    return r;
  };

  function applyPipe(out, pipe) {
    var lines = out.split('\n');
    var arg = pipe.arg;
    var re;
    try { re = new RegExp(arg); } catch (e) { re = new RegExp(arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
    var op = pipe.op;
    if ('include'.indexOf(op) === 0) return lines.filter(function (l) { return re.test(l); }).join('\n');
    if ('exclude'.indexOf(op) === 0) return lines.filter(function (l) { return !re.test(l); }).join('\n');
    if ('begin'.indexOf(op) === 0) { var i = lines.findIndex(function (l) { return re.test(l); }); return i < 0 ? '' : lines.slice(i).join('\n'); }
    if ('count'.indexOf(op) === 0 && op.length >= 2) return 'Number of lines which match regexp = ' + lines.filter(function (l) { return re.test(l); }).length;
    if ('section'.indexOf(op) === 0) {
      var out2 = [], inSec = false;
      lines.forEach(function (l) {
        if (/^\S/.test(l)) inSec = re.test(l);
        if (inSec) out2.push(l);
      });
      return out2.join('\n');
    }
    return '% Invalid input detected at \'^\' marker.';
  }

  P.errAt = function (line, pos, toks) {
    var off = this.prompt().length + (toks[pos] ? toks[pos].pos : line.length);
    return new Array(off + 1).join(' ') + '^\n% Invalid input detected at \'^\' marker.\n';
  };

  P.exec = function (line, pipe) {
    var toks = tokenize(line);
    var neg = false;
    var mode = this.mode;
    var root = modeTrie(mode === 'user' ? 'user' : mode);
    // "do" i konfigurationslägen
    if (mode !== 'user' && mode !== 'exec' && toks.length && 'do'.indexOf(toks[0].t.toLowerCase()) === 0 && toks[0].t.toLowerCase() === 'do') {
      var saved = this.mode;
      this.mode = 'exec';
      var sub = line.replace(/^\s*do\s+/i, '');
      var r0 = this.exec(sub, pipe);
      if (this.mode === 'exec') this.mode = saved;
      return r0;
    }
    var start = 0;
    if (mode !== 'user' && mode !== 'exec' && toks.length && toks[0].t.toLowerCase() === 'no') { neg = true; start = 1; }
    var ptoks = toks.slice(start);
    var pr = parse(root, ptoks, line);
    // Undernivå: prova globala konfigurationen
    if (pr.err && mode !== 'config' && mode !== 'user' && mode !== 'exec') {
      var gp = parse(TRIES.config, ptoks, line);
      if (!gp.err) {
        this.leaveSub();
        this.mode = 'config';
        pr = gp;
      }
    }
    if (pr.err === 'ambig') return result('% Ambiguous command:  "' + line.trim() + '"');
    if (pr.err === 'incomplete') return result('% Incomplete command.\n');
    if (pr.err === 'invalid') {
      if ((mode === 'user' || mode === 'exec') && pr.pos === 0) {
        var w0 = ptoks[0].t.toLowerCase();
        var known = Object.keys(TRIES.exec.kw).some(function (k) { return k.indexOf(w0) === 0; });
        if (known) return result(this.errAt(line, 0, toks));
        var dom = this.dev.config.domainLookup;
        var ns = this.dev.config.nameServers[0] || '255.255.255.255';
        var word = ptoks[0].t;
        if (dom) return result('Translating "' + word + '"...domain server (' + ns + ')\n% Unknown command or computer name, or unable to find computer address', { delay: 2500 });
        return result('% Unknown command or computer name, or unable to find computer address');
      }
      return result(this.errAt(line, pr.pos + start, toks));
    }
    if (neg && !pr.cmd.no) return result(this.errAt(line, 0, toks));
    if (!neg && pr.cmd.noOnly) return result('% Incomplete command.\n');
    var out = pr.cmd.fn.call(this, pr.vals, neg, pr.kws, line);
    if (out === undefined || out === null) out = '';
    return typeof out === 'string' ? result(out) : out;
  };

  P.leaveSub = function () {
    if (this.mode === 'vlan' && this.ctx.vlans) { /* VLAN skapas direkt */ }
    this.ctx = {};
  };

  // ---------- Hjälp (?) och tab
  P.help = function (line) {
    if (this.pending) return '';
    // Filter efter |
    if (/\|\s*$/.test(line)) return ['  append    Append redirected output to URL (URLs supporting append operation only)', '  begin     Begin with the line that matches', '  count     Count number of lines which match regexp', '  exclude   Exclude lines that match', '  include   Include lines that match', '  section   Filter a section of output'].join('\n');
    if (/\|\s*\S+\s+$/.test(line)) return '  LINE  Regular Expression';
    var mode = this.mode === 'user' ? 'user' : this.mode;
    var toks = tokenize(line);
    var trailing = /\s$/.test(line) || line === '';
    var root = TRIES[mode];
    if (mode !== 'user' && mode !== 'exec' && toks.length && toks[0].t.toLowerCase() === 'no' && (toks.length > 1 || trailing)) toks = toks.slice(1);
    else if (mode !== 'user' && mode !== 'exec' && toks.length && toks[0].t.toLowerCase() === 'do' && (toks.length > 1 || trailing)) { toks = toks.slice(1); root = TRIES.exec; }
    var ctxToks = trailing ? toks : toks.slice(0, -1);
    var partial = trailing ? '' : (toks.length ? toks[toks.length - 1].t.toLowerCase() : '');
    var node = root;
    if (ctxToks.length) {
      var pr = parse(root, ctxToks, line);
      if (pr.err === 'incomplete') node = pr.node;
      else if (pr.err) return '% Unrecognized command';
      else node = pr.node;
    }
    if (!trailing) {
      var ks = Object.keys(node.kw).filter(function (k) { return k.indexOf(partial) === 0; }).sort();
      if (!ks.length) return '% Unrecognized command';
      return ks.join('  ');
    }
    var rows = [];
    var inShow = ctxToks.length && 'show'.indexOf(ctxToks[0].t.toLowerCase()) === 0 && ctxToks[0].t.length >= 2;
    Object.keys(node.kw).sort().forEach(function (k) { rows.push('  ' + U.pad(k, 22) + ((inShow && SHOW_HELP[k]) || HELP[k] || '')); });
    node.params.forEach(function (p) {
      var type = p.spec.slice(1, -1).split(':');
      var h = PARAM_HELP[type[0]];
      if (type[0] === 'n') rows.push('  ' + U.pad('<' + (type[1] || '0-4294967295') + '>', 22) + 'Number');
      else if (h) rows.push('  ' + U.pad(h[0], 22) + h[1]);
    });
    if (node.cmd) rows.push('  <cr>');
    return rows.join('\n');
  };
  P.complete = function (line) {
    var mode = this.mode === 'user' ? 'user' : this.mode;
    var toks = tokenize(line);
    if (!toks.length || /\s$/.test(line)) return null;
    var root = TRIES[mode];
    var prefixToks = toks.slice(0, -1);
    var lead = '';
    if (mode !== 'user' && mode !== 'exec' && prefixToks.length && prefixToks[0].t.toLowerCase() === 'no') { prefixToks = prefixToks.slice(1); }
    if (mode !== 'user' && mode !== 'exec' && prefixToks.length && prefixToks[0].t.toLowerCase() === 'do') { prefixToks = prefixToks.slice(1); root = TRIES.exec; }
    var node = root;
    if (prefixToks.length) {
      var pr = parse(root, prefixToks, line);
      if (pr.err && pr.err !== 'incomplete') return null;
      node = pr.node;
    }
    var last = toks[toks.length - 1].t.toLowerCase();
    var ks = Object.keys(node.kw).filter(function (k) { return k.indexOf(last) === 0; });
    if (!ks.length && /^[a-z]+$/.test(last) && node.params.some(function (p) { return p.spec === '<if>'; })) {
      var types = ['GigabitEthernet', 'Vlan'].filter(function (t) { return t.toLowerCase().indexOf(last) === 0; });
      if (types.length === 1) return line.slice(0, toks[toks.length - 1].pos) + types[0];
    }
    if (ks.length !== 1) return null;
    return line.slice(0, toks[toks.length - 1].pos) + ks[0] + ' ';
  };

  // ------------------------------------------------------------------ Hjälpfunktioner för kommandon
  function cfg(s) { return s.dev.config; }
  function isRouter(s) { return s.dev.kind === 'router'; }
  function isSwitch(s) { return s.dev.kind === 'switch'; }
  function ifExists(s, n) { return !!cfg(s).ifaces[n]; }
  function nextSeq(acl) { var m = 0; acl.rules.forEach(function (r) { if (r.seq > m) m = r.seq; }); return m + 10; }
  function invalidMarker(s, line, word) {
    var idx = line.toLowerCase().lastIndexOf(word.toLowerCase());
    var off = s.prompt().length + Math.max(0, idx);
    return new Array(off + 1).join(' ') + '^\n% Invalid input detected at \'^\' marker.\n';
  }
  function eachIf(s, fn) {
    var outs = [];
    (s.ctx.ifs || []).forEach(function (n) {
      var r = fn(cfg(s).ifaces[n], n);
      if (r) outs.push(r);
    });
    return outs.filter(function (x, i) { return outs.indexOf(x) === i; }).join('\n');
  }

  // ------------------------------------------------------------------ EXEC / USER
  def('user', 'enable', function () {
    var c = cfg(this);
    if (this.via !== 'console' && !c.enableSecret && !c.enablePassword) return '% No password set';
    if (!c.enableSecret && !c.enablePassword) { this.mode = 'exec'; return ''; }
    var tries = 0;
    var self = this;
    function ask() {
      self.pending = {
        prompt: 'Password: ', secret: true, fn: function (pw) {
          if (pw === (c.enablePlain || 'Krabba2026')) { this.mode = 'exec'; return result(''); }
          tries++;
          if (tries >= 3) return result('% Bad secrets\n');
          ask();
          return result('');
        },
      };
    }
    ask();
    return '';
  });
  def('exec', 'enable', function () { return ''; });
  def('exec', 'disable', function () { this.mode = 'user'; return ''; });
  ['exit', 'logout', 'quit'].forEach(function (w) {
    def('user exec', w, function () {
      this.closed = true;
      return result('', { close: true });
    });
  });
  def('exec', 'configure terminal', function () {
    this.mode = 'config';
    return 'Enter configuration commands, one per line.  End with CNTL/Z.';
  });
  def('exec', 'configure', function () {
    var self = this;
    this.pending = { prompt: 'Configuring from terminal, memory, or network [terminal]? ', fn: function (a) {
      if (!a || 'terminal'.indexOf(a) === 0) { self.mode = 'config'; return result('Enter configuration commands, one per line.  End with CNTL/Z.'); }
      return result('?Must be "terminal", "memory" or "network"');
    } };
    return '';
  });
  function saveConfig(s) {
    s.dev.startup = U.clone(s.dev.config);
    return 'Building configuration...\n[OK]';
  }
  def('exec', 'write', function () { return saveConfig(this); });
  def('exec', 'write memory', function () { return saveConfig(this); });
  def('exec', 'copy running-config startup-config', function () {
    var self = this;
    this.pending = { prompt: 'Destination filename [startup-config]? ', fn: function (a) {
      if (a && a !== 'startup-config') return result('%Error opening flash:' + a + ' (Permission denied)');
      return result(saveConfig(self), { delay: 400 });
    } };
    return '';
  });
  def('exec', 'copy startup-config running-config', function () {
    var st = this.dev.startup;
    this.dev.config = U.clone(st);
    return 'Destination filename [running-config]? \n' + 'xxxx bytes copied in 0.52 secs';
  });
  def('exec', 'reload', function () {
    var self = this;
    function proceed() {
      self.pending = { prompt: 'Proceed with reload? [confirm]', fn: function (a) {
        if (a && !/^y/i.test(a)) return result('');
        return doReload(self);
      } };
    }
    var changed = JSON.stringify(this.dev.config) !== JSON.stringify(this.dev.startup);
    if (changed) {
      this.pending = { prompt: '\nSystem configuration has been modified. Save? [yes/no]: ', fn: function (a) {
        if (/^y/i.test(a)) saveConfig(self);
        else if (!/^n/i.test(a)) { return result('% Please answer \'yes\' or \'no\'.'); }
        proceed();
        return result(/^y/i.test(a) ? 'Building configuration...\n[OK]' : '');
      } };
    } else proceed();
    return '';
  });
  function doReload(s) {
    var d = s.dev;
    d.config = U.clone(d.startup);
    d.rt.logs = [];
    d.rt.dhcpBindings = {};
    d.rt.natTrans = [];
    d.rt.errdisabled = {};
    d.rt.aclCounters = {};
    d.rt.counters = {};
    d.rt.bootTime = s.state.time;
    d.rt.reloads++;
    s.mode = 'user';
    s.ctx = {};
    s.booting = true;
    S.touch(s.state);
    if (NV.onReload) NV.onReload(d.id);
    var stream = [
      { text: '\n\n%SYS-5-RELOAD: Reload requested by console. Reload Reason: Reload Command.', delay: 300 },
      { text: '\n\nSystem Bootstrap, Version ' + (d.kind === 'router' ? '15.0(1r)M15' : '12.2(44)SE5') + ', RELEASE SOFTWARE (fc1)', delay: 900 },
      { text: '\nCopyright (c) 2016 by cisco Systems, Inc.', delay: 200 },
      { text: '\n\nInitializing memory...\nLoading "flash:/' + (d.kind === 'router' ? 'c2951-universalk9-mz.SPA.152-4.M11.bin' : 'c3560-ipservicesk9-mz.122-55.SE12.bin') + '"...', delay: 700 },
      { text: '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', delay: 1500 },
      { text: '\n\n              Restricted Rights Legend\n\nCisco Systems, Inc.\n170 West Tasman Drive\nSan Jose, California 95134-1706', delay: 600 },
      { text: '\n\nPress RETURN to get started!\n', delay: 1200 },
    ];
    return result('', { stream: stream, waitReturn: true });
  }
  P.finishBoot = function () {
    this.booting = false;
    var d = this.dev;
    S.refresh(this.state);
    S.pushLog(this.state, d, '%SYS-5-RESTART: System restarted --');
  };

  // show-kommandon (de som även finns i användarläget markeras)
  function showDef(pattern, fn, userToo) { def(userToo ? 'user exec' : 'exec', 'show ' + pattern, fn, { no: false }); }
  showDef('running-config', function () { return SH.runningConfig(this.state, this.dev); });
  showDef('running-config interface <if>', function (v) {
    if (!ifExists(this, v[0])) return '                                           ^\n% Invalid input detected at \'^\' marker.';
    return SH.runningInterface(this.state, this.dev, v[0]);
  });
  showDef('startup-config', function () { return SH.startupConfig(this.state, this.dev); });
  showDef('version', function () { return SH.showVersion(this.state, this.dev); }, true);
  showDef('clock', function () { return SH.showClock(this.state, this.dev); }, true);
  showDef('ntp status', function () { return SH.ntpStatus(this.state, this.dev); }, true);
  showDef('clock detail', function () { return SH.showClockDetail(this.state, this.dev); }, true);
  showDef('ntp associations', function () { return SH.ntpAssociations(this.state, this.dev); }, true);
  showDef('ip cef <ip>', rtOnly(function (v) { return SH.ipCef(this.state, this.dev, v[0]); }), true);
  showDef('logging', function () { return SH.showLogging(this.state, this.dev); });
  showDef('history', function () { return this.history.map(function (h) { return '  ' + h; }).join('\n'); }, true);
  showDef('ip interface brief', function () { return SH.ipIntBrief(this.state, this.dev); }, true);
  showDef('ip interface <if>', function (v) {
    if (!ifExists(this, v[0])) return '% Invalid input detected at \'^\' marker.';
    return SH.ipInterface(this.state, this.dev, v[0]);
  }, true);
  showDef('interfaces', function () {
    var self = this;
    return SH.ifaceNames(this.dev).filter(function (n) { return !cfg(self).ifaces[n].internal; }).map(function (n) { return SH.showInterface(self.state, self.dev, n); }).join('\n');
  }, true);
  showDef('interfaces <if>', function (v) {
    if (!ifExists(this, v[0])) return '% Invalid input detected at \'^\' marker.';
    return SH.showInterface(this.state, this.dev, v[0]);
  }, true);
  showDef('interfaces description', function () { return SH.interfacesDescription(this.state, this.dev); }, true);
  showDef('ip route', function () { if (!isRouter(this) && !cfg(this).ipRouting) return 'Default gateway is ' + (cfg(this).defaultGateway || 'not set') + '\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty'; return SH.ipRoute(this.state, this.dev); }, true);
  showDef('ip route static', function () { return SH.ipRoute(this.state, this.dev, 'static'); }, true);
  showDef('ip route connected', function () { return SH.ipRoute(this.state, this.dev, 'connected'); }, true);
  showDef('ip route <ip>', function (v) { return SH.ipRoute(this.state, this.dev, v[0]); }, true);
  showDef('arp', function () { return SH.arpTable(this.state, this.dev); }, true);
  showDef('ip arp', function () { return SH.arpTable(this.state, this.dev); }, true);
  showDef('cdp neighbors', function () { return SH.cdpNeighbors(this.state, this.dev); }, true);
  showDef('ip ssh', function () { return SH.ipSsh(this.state, this.dev); });
  showDef('users', function () {
    return '    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00   \n\n  Interface    User               Mode         Idle     Peer Address';
  }, true);
  showDef('access-lists', function () { return SH.accessLists(this.state, this.dev); });
  showDef('access-lists <word>', function (v) { return SH.accessLists(this.state, this.dev, v[0]); });
  showDef('ip access-lists', function () { return SH.accessLists(this.state, this.dev); });
  showDef('ip access-lists <word>', function (v) { return SH.accessLists(this.state, this.dev, v[0]); });
  // Switch-specifika
  function swOnly(fn) { return function (v, n, k, l) { if (!isSwitch(this)) return invalidMarker(this, l, k[1] || k[0]); return fn.call(this, v, n, k, l); }; }
  function rtOnly(fn) { return function (v, n, k, l) { if (!isRouter(this)) return invalidMarker(this, l, k[1] || k[0]); return fn.call(this, v, n, k, l); }; }
  showDef('interfaces status', swOnly(function () { return SH.interfacesStatus(this.state, this.dev); }), true);
  showDef('interfaces <if> status', swOnly(function (v) { return SH.interfacesStatus(this.state, this.dev, v[0]); }), true);
  showDef('interfaces trunk', swOnly(function () { return SH.interfacesTrunk(this.state, this.dev); }), true);
  showDef('interfaces <if> switchport', swOnly(function (v) {
    if (!ifExists(this, v[0])) return '% Invalid input detected at \'^\' marker.';
    return SH.switchport(this.state, this.dev, v[0]);
  }), true);
  showDef('vlan brief', swOnly(function () { return SH.vlanBrief(this.state, this.dev); }), true);
  showDef('vlan', swOnly(function () { return SH.vlanBrief(this.state, this.dev); }), true);
  showDef('mac address-table', swOnly(function () { return SH.macTable(this.state, this.dev); }), true);
  showDef('mac address-table address <word>', swOnly(function (v) { return SH.macTable(this.state, this.dev, { address: v[0] }); }), true);
  showDef('mac address-table interface <if>', swOnly(function (v) { return SH.macTable(this.state, this.dev, { iface: v[0] }); }), true);
  showDef('mac address-table vlan <n:1-4094>', swOnly(function (v) { return SH.macTable(this.state, this.dev, { vlan: v[0] }); }), true);
  showDef('mac-address-table', swOnly(function () { return SH.macTable(this.state, this.dev); }), true);
  showDef('mac address-table dynamic', swOnly(function () { return SH.macTable(this.state, this.dev); }), true);
  showDef('spanning-tree', swOnly(function () { return SH.spanningTree(this.state, this.dev); }), true);
  showDef('spanning-tree vlan <n:1-4094>', swOnly(function (v) { return SH.spanningTree(this.state, this.dev, v[0]); }), true);
  showDef('power inline', swOnly(function () { return SH.powerInline(this.state, this.dev); }), true);
  showDef('power inline <if>', swOnly(function (v) { return SH.powerInline(this.state, this.dev, v[0]); }), true);
  showDef('port-security', swOnly(function () { return SH.portSecurity(this.state, this.dev); }));
  showDef('port-security interface <if>', swOnly(function (v) { return SH.portSecurity(this.state, this.dev, v[0]); }));
  // Router-specifika
  showDef('ip dhcp binding', rtOnly(function () { return SH.dhcpBinding(this.state, this.dev); }));
  showDef('ip dhcp pool', rtOnly(function () { return SH.dhcpPool(this.state, this.dev); }));
  showDef('ip dhcp pool <word>', rtOnly(function (v) { return SH.dhcpPool(this.state, this.dev, v[0]); }));
  showDef('ip dhcp conflict', rtOnly(function () {
    var b = this.dev.rt.dhcpBindings;
    var rows = Object.keys(b).filter(function (ip) { return b[ip].conflict; });
    return 'IP address        Detection method   Detection time          VRF\n' + rows.map(function (ip) { return U.pad(ip, 18) + U.pad('Ping', 19) + 'Sep 29 2026 08:0' + (U.hash(ip) % 9) + ' AM'; }).join('\n');
  }));
  showDef('ip nat translations', rtOnly(function () { return SH.natTranslations(this.state, this.dev); }));
  showDef('ip nat statistics', rtOnly(function () { return SH.natStatistics(this.state, this.dev); }));

  // clear
  def('exec', 'clear counters', function () {
    var d = this.dev, st = this.state;
    this.pending = { prompt: 'Clear "show interface" counters on all interfaces [confirm]', fn: function (a) {
      if (a && !/^y/i.test(a)) return result('');
      Object.keys(d.rt.counters).forEach(function (n) { d.rt.counters[n] = { inp: 0, outp: 0, crc: 0, late: 0, runts: 0, coll: 0, flaps: 0, cleared: st.time }; });
      S.pushLog(st, d, '%CLEAR-5-COUNTERS: Clear counter on all interfaces by console');
      return result('');
    } };
    return '';
  }, { no: false });
  def('exec', 'clear counters <if>', function (v) {
    var d = this.dev, st = this.state;
    this.pending = { prompt: 'Clear "show interface" counters on this interface [confirm]', fn: function () {
      d.rt.counters[v[0]] = { inp: 0, outp: 0, crc: 0, late: 0, runts: 0, coll: 0, flaps: 0, cleared: st.time };
      S.pushLog(st, d, '%CLEAR-5-COUNTERS: Clear counter on interface ' + v[0] + ' by console');
      return result('');
    } };
    return '';
  });
  def('exec', 'clear access-list counters', function () { this.dev.rt.aclCounters = {}; return ''; });
  def('exec', 'clear access-list counters <word>', function (v) { delete this.dev.rt.aclCounters[v[0]]; return ''; });
  def('exec', 'clear ip access-list counters', function () { this.dev.rt.aclCounters = {}; return ''; });
  def('exec', 'clear ip nat translation <word>', function (v) {
    if (v[0] !== '*') return '% Invalid input detected at \'^\' marker.';
    this.dev.rt.natTrans = []; return '';
  });
  def('exec', 'clear mac address-table dynamic', function () { return ''; });
  def('exec', 'clear mac-address-table dynamic', function () { return ''; });
  def('exec', 'clear logging', function () {
    var d = this.dev;
    this.pending = { prompt: 'Clear logging buffer [confirm]', fn: function () { d.rt.logs = []; return result(''); } };
    return '';
  });
  def('exec', 'clear ip dhcp binding <word>', function (v) {
    if (v[0] === '*') this.dev.rt.dhcpBindings = {};
    else delete this.dev.rt.dhcpBindings[v[0]];
    return '';
  });
  def('exec', 'clear ip dhcp conflict <word>', function () {
    var b = this.dev.rt.dhcpBindings;
    Object.keys(b).forEach(function (ip) { if (b[ip].conflict) delete b[ip]; });
    return '';
  });
  def('user exec', 'terminal length <n:0-512>', function () { return ''; });
  def('user exec', 'terminal monitor', function () { this.monitor = true; return ''; });
  def('user exec', 'terminal no monitor', function () { this.monitor = false; return ''; });

  // ping / traceroute
  function pingCmd(v, o) {
    var s = this;
    o = o || {};
    var target = v[0];
    var d = s.dev;
    var st = s.state;
    var head = '';
    var ip = target;
    if (!U.isIp(target)) {
      var r = S.resolve(st, d.id, target);
      if (r.error) {
        var ns = d.config.nameServers[0] || '255.255.255.255';
        if (!d.config.domainLookup) return '% Unrecognized host or address, or protocol not running.\n';
        return result('Translating "' + target + '"...domain server (' + ns + ')\n% Unrecognized host or address, or protocol not running.\n', { delay: 2000 });
      }
      ip = r.ip;
      if (!d.config.hosts[target.toLowerCase()]) head = 'Translating "' + target + '"...domain server (' + (d.config.nameServers[0] || '') + ') [OK]\n';
    }
    var count = o.count || v[1] || 5;
    var size = o.size || 100;
    var res = S.ping(st, d.id, ip, { src: o.src, size: size, df: o.df });
    var stream = [{ text: head + 'Type escape sequence to abort.\nSending ' + count + ', ' + size + '-byte ICMP Echos to ' + ip + ', timeout is 2 seconds:\n' + (o.src ? 'Packet sent with a source address of ' + o.src + ' \n' : '') + (o.df ? 'Packet sent with the DF bit set\n' : ''), delay: 50 }];
    var okN = 0;
    d.rt.pinged = d.rt.pinged || {};
    var first = !d.rt.pinged[ip];
    for (var k = 0; k < count; k++) {
      var ch;
      if (res.ok) {
        var lost = Math.random() < res.loss || (k === 0 && first && d.kind === 'router' && res.loss < 1 && !S.devEps(S.get(st), d.id).some(function (e) { return e.ip && U.sameSubnet(ip, e.ip, e.mask) && false; }) && Math.random() < 0.8);
        ch = lost ? '.' : '!';
      } else if (res.reason === 'net-unreachable' && res.where !== d.id) ch = 'U';
      else if (res.reason === 'frag') ch = 'M';
      else ch = '.';
      if (ch === '!') okN++;
      stream.push({ text: ch, delay: ch === '!' ? 120 : 1400 });
    }
    if (res.ok) d.rt.pinged[ip] = true;
    var pct = Math.round(okN * 100 / count);
    stream.push({ text: '\nSuccess rate is ' + pct + ' percent (' + okN + '/' + count + ')' + (okN ? ', round-trip min/avg/max = 1/' + (1 + res.hops.length) + '/' + (4 + res.hops.length * 2) + ' ms' : ''), delay: 50 });
    return result('', { stream: stream });
  }
  def('user exec', 'ping <iphost>', function (v) { return pingCmd.call(this, v); });
  // Utökad ping: bara "ping" frågar steg för steg, som på en riktig router
  def('exec', 'ping', function () {
    var s = this, o = {}, target = null;
    function ask(prompt, def, fn) { s.pending = { prompt: prompt + ' [' + def + ']: ', fn: function (a) { return fn(a === '' ? def : a); } }; return result(''); }
    function step7() {
      return ask('Set DF bit in IP header?', 'no', function (a) { o.df = /^y/i.test(a); return ask('Validate reply data?', 'no', function () { return ask('Data pattern', '0xABCD', function () { return ask('Loose, Strict, Record, Timestamp, Verbose', 'none', function () { return ask('Sweep range of sizes', 'n', function () { var r = pingCmd.call(s, [target], o); return r; }); }); }); }); });
    }
    return ask('Protocol', 'ip', function () {
      s.pending = { prompt: 'Target IP address: ', fn: function (t) {
        if (!t) return result('% Bad IP address');
        target = t;
        return ask('Repeat count', '5', function (a) { o.count = Math.max(1, Math.min(100, parseInt(a, 10) || 5));
          return ask('Datagram size', '100', function (b) { var z = parseInt(b, 10); if (!(z >= 36 && z <= 18024)) return result('% A decimal number between 36 and 18024.'); o.size = z;
            return ask('Timeout in seconds', '2', function () {
              return ask('Extended commands?', 'n', function (e) {
                if (!/^y/i.test(e)) return pingCmd.call(s, [target], o);
                return ask('Source address or interface', '', function (src) {
                  if (src) {
                    if (U.isIp(src)) o.src = src;
                    else { var ifn = U.normIf(src); var ic = ifn && cfg(s).ifaces[ifn]; if (!ic || !ic.ip) return result('% Invalid source. Must use same-VRF IP address or full interface name without spaces (e.g. Serial0/1)'); o.src = ic.ip.addr; }
                  }
                  return ask('Type of service', '0', function () { return step7(); });
                });
              });
            });
          });
        });
      } };
      return result('');
    });
  }, { no: false });
  // ping 192.168.2.1 source gi0/0.10 size 1500 df-bit repeat 10
  def('user exec', 'ping <iphost> <text>', function (v, neg, k, line) {
    var t = v[1].split(/\s+/);
    var o = {};
    for (var i = 0; i < t.length; i++) {
      var w = t[i].toLowerCase();
      function is(full, min) { return w.length >= (min || 1) && full.indexOf(w) === 0; }
      if (is('repeat', 1) && /^\d+$/.test(t[i + 1] || '')) { o.count = Math.max(1, Math.min(100, parseInt(t[++i], 10))); continue; }
      if (is('size', 2) && /^\d+$/.test(t[i + 1] || '')) {
        var sz = parseInt(t[++i], 10);
        if (sz < 36 || sz > 18024) return invalidMarker(this, line, t[i]);
        o.size = sz; continue;
      }
      if (is('df-bit', 1)) { o.df = true; continue; }
      if (is('timeout', 1) && /^\d+$/.test(t[i + 1] || '')) { i++; continue; }
      if (is('source', 2) && t[i + 1]) {
        var sv = t[++i];
        if (U.isIp(sv)) { o.src = sv; continue; }
        var ifn = U.normIf(sv);
        var ic = ifn && cfg(this).ifaces[ifn];
        if (!ic || !ic.ip) return '% Invalid source interface - IP not enabled or interface is down';
        o.src = ic.ip.addr; continue;
      }
      return invalidMarker(this, line, t[i]);
    }
    return pingCmd.call(this, [v[0]], o);
  });
  function traceCmd(v, src) {
    var d = this.dev, st = this.state;
    var ip = v[0];
    if (!U.isIp(ip)) {
      var r = S.resolve(st, d.id, ip);
      if (r.error) return '% Unrecognized host or address, or protocol not running.\n';
      ip = r.ip;
    }
    var tr = S.traceroute(st, d.id, ip, src);
    var stream = [{ text: 'Type escape sequence to abort.\nTracing the route to ' + ip + '\nVRF info: (vrf in name/id, vrf out name/id)\n', delay: 100 }];
    var hops = tr.forward.hops.slice();
    var n = 1;
    hops.forEach(function (h) {
      if (h.dev === d.id) return;
      stream.push({ text: '  ' + n + ' ' + h.ip + ' ' + (1 + n) + ' msec ' + (n) + ' msec ' + (1 + n) + ' msec\n', delay: 350 });
      n++;
    });
    if (tr.full.ok) {
      var last = hops.length ? hops[hops.length - 1].ip : null;
      if (last !== ip) stream.push({ text: '  ' + n + ' ' + ip + ' ' + (2 + n) + ' msec ' + (1 + n) + ' msec ' + (2 + n) + ' msec\n', delay: 350 });
    } else {
      for (var k = 0; k < 4; k++) { stream.push({ text: '  ' + n + '  *  *  * \n', delay: 1800 }); n++; }
    }
    return result('', { stream: stream });
  }
  def('user exec', 'traceroute <iphost>', traceCmd);
  def('user exec', 'traceroute <iphost> source <if>', function (v) {
    var i = cfg(this).ifaces[v[1]];
    if (!i || !i.ip) return '% Invalid source interface - IP not enabled or interface is down';
    return traceCmd.call(this, [v[0]], i.ip.addr);
  });

  // ------------------------------------------------------------------ CONFIG
  def('config', 'end', function () { this.mode = 'exec'; this.ctx = {}; S.pushLog(this.state, this.dev, '%SYS-5-CONFIG_I: Configured from ' + (this.via === 'console' ? 'console by console' : 'vty0 (192.168.1.200)')); return ''; }, { no: false });
  ['if', 'vlan', 'line', 'dhcp', 'acl', 'isakmp', 'tset', 'cmap'].forEach(function (m) {
    def(m, 'end', function () { this.mode = 'exec'; this.ctx = {}; S.pushLog(this.state, this.dev, '%SYS-5-CONFIG_I: Configured from ' + (this.via === 'console' ? 'console by console' : 'vty0 (192.168.1.200)')); return ''; }, { no: false });
    def(m, 'exit', function () { this.leaveSub(); this.mode = 'config'; return ''; }, { no: false });
  });
  def('config', 'exit', function () { this.mode = 'exec'; this.ctx = {}; S.pushLog(this.state, this.dev, '%SYS-5-CONFIG_I: Configured from ' + (this.via === 'console' ? 'console by console' : 'vty0 (192.168.1.200)')); return ''; }, { no: false });

  def('config', 'hostname <word>', function (v, neg) {
    cfg(this).hostname = neg ? (isRouter(this) ? 'Router' : 'Switch') : v[0];
    return '';
  });
  def('config', 'hostname', function () { cfg(this).hostname = isRouter(this) ? 'Router' : 'Switch'; return ''; }, { noOnly: true });
  function setSecret(v, neg) {
    var c = cfg(this);
    if (neg) { c.enableSecret = null; c.enablePlain = null; return ''; }
    var pw = v[v.length - 1];
    c.enableSecret = SH.hashSecret(pw); c.enablePlain = pw;
    return '';
  }
  def('config', 'enable secret <word>', setSecret);
  def('config', 'enable secret <n:0-9> <word>', setSecret);
  def('config', 'enable secret', setSecret, { noOnly: true });
  def('config', 'enable password <word>', function (v, neg) { var c = cfg(this); c.enablePassword = neg ? null : v[0]; if (!c.enablePlain && !neg) c.enablePlain = v[0]; return ''; });
  function setUser(v, neg, kws) {
    var c = cfg(this);
    var name = v[0];
    if (neg) { delete c.users[name]; return ''; }
    var priv = kws.indexOf('privilege') >= 0 ? v[1] : 1;
    var pw = v[v.length - 1];
    c.users[name] = { priv: priv, secret: SH.hashSecret(pw), plain: pw };
    return '';
  }
  def('config', 'username <word> secret <word>', setUser);
  def('config', 'username <word> privilege <n:0-15> secret <word>', setUser);
  def('config', 'username <word> password <word>', setUser);
  def('config', 'username <word> privilege <n:0-15> password <word>', setUser);
  def('config', 'username <word>', setUser, { noOnly: true });

  function domainName(v, neg) {
    cfg(this).domainName = neg ? null : v[0];
    return '';
  }
  def('config', 'ip domain-name <word>', domainName);
  def('config', 'ip domain name <word>', domainName);
  def('config', 'ip domain-name', domainName, { noOnly: true });
  def('config', 'ip domain name', domainName, { noOnly: true });
  def('config', 'ip domain-lookup', function (v, neg) { cfg(this).domainLookup = !neg; return ''; });
  def('config', 'ip domain lookup', function (v, neg) { cfg(this).domainLookup = !neg; return ''; });
  def('config', 'ip name-server <text>', function (v, neg) {
    var ips = v[0].split(/\s+/);
    for (var i = 0; i < ips.length; i++) if (!U.isIp(ips[i])) return '% Invalid input detected at \'^\' marker.';
    var c = cfg(this);
    if (neg) c.nameServers = c.nameServers.filter(function (x) { return ips.indexOf(x) < 0; });
    else ips.forEach(function (x) { if (c.nameServers.indexOf(x) < 0) c.nameServers.push(x); });
    return '';
  });
  def('config', 'ip dns server', function (v, neg) { cfg(this).dnsServer = !neg; return ''; });
  def('config', 'ip host <word> <ip>', function (v, neg) {
    if (neg) delete cfg(this).hosts[v[0].toLowerCase()]; else cfg(this).hosts[v[0].toLowerCase()] = v[1];
    return '';
  });
  def('config', 'ip host <word>', function (v) { delete cfg(this).hosts[v[0].toLowerCase()]; return ''; }, { noOnly: true });
  function ipRoute(v, neg) {
    var c = cfg(this);
    var net = v[0], mask = v[1], nh = v[2];
    if (!U.isValidMask(mask)) return '%Inconsistent address and mask';
    if (U.network(net, mask) !== net) return '%Inconsistent address and mask';
    var viaIf = nh && !U.isIp(nh) ? U.normIf(nh) : null;
    if (nh && !U.isIp(nh) && !viaIf) return '% Invalid input detected at \'^\' marker.';
    if (neg) {
      var before = c.routes.length;
      c.routes = c.routes.filter(function (r) { return !(r.net === net && r.mask === mask && (!nh || r.nh === nh || r.iface === viaIf)); });
      if (before === c.routes.length) return '%No matching route to delete';
      return '';
    }
    if (!isRouter(this) && !c.ipRouting) return '% Invalid input detected at \'^\' marker.';
    if (c.routes.some(function (r) { return r.net === net && r.mask === mask && (r.nh === nh || r.iface === viaIf); })) return '';
    c.routes.push(viaIf ? { net: net, mask: mask, iface: viaIf } : { net: net, mask: mask, nh: nh });
    return '';
  }
  def('config', 'ip route <ip> <mask> <word>', ipRoute);
  def('config', 'ip route <ip> <mask> <if>', function (v, neg) { return ipRoute.call(this, v, neg); });
  def('config', 'ip route <ip> <mask>', ipRoute, { noOnly: true });
  def('config', 'ip default-gateway <ip>', function (v, neg) { cfg(this).defaultGateway = neg ? null : v[0]; return ''; });
  def('config', 'ip default-gateway', function () { cfg(this).defaultGateway = null; return ''; }, { noOnly: true });
  def('config', 'ip routing', function (v, neg) { if (isRouter(this)) return ''; cfg(this).ipRouting = !neg; return ''; });
  def('config', 'ip cef', function () { return ''; });
  def('config', 'ip http server', function () { return ''; });
  def('config', 'ip http secure-server', function () { return ''; });
  def('config', 'service password-encryption', function () { return ''; });
  def('config', 'service timestamps log datetime msec', function (v, neg) { cfg(this).timestampsMsec = !neg; return ''; });
  def('config', 'service timestamps log uptime', function () { cfg(this).timestampsMsec = false; return ''; });
  def('config', 'service timestamps debug datetime msec', function () { return ''; });
  def('config', 'cdp run', function () { return ''; });
  def('config', 'spanning-tree mode pvst', function () { return ''; });
  def('config', 'spanning-tree mode rapid-pvst', function () { return ''; });
  def('config', 'spanning-tree extend system-id', function () { return ''; });

  // DHCP
  def('config', 'ip dhcp excluded-address <ip>', function (v, neg) { return excl.call(this, v[0], v[0], neg); });
  def('config', 'ip dhcp excluded-address <ip> <ip>', function (v, neg) { return excl.call(this, v[0], v[1], neg); });
  function excl(a, b, neg) {
    var c = cfg(this);
    if (!isRouter(this)) return '% Invalid input detected at \'^\' marker.';
    if (U.ipToInt(b) < U.ipToInt(a)) return '% Invalid address range';
    if (neg) { c.dhcpExcluded = c.dhcpExcluded.filter(function (x) { return !(x[0] === a && (x[1] || x[0]) === b); }); return ''; }
    c.dhcpExcluded.push([a, b]);
    return '';
  }
  def('config', 'ip dhcp pool <word>', function (v, neg) {
    var c = cfg(this);
    if (!isRouter(this)) return '% Invalid input detected at \'^\' marker.';
    if (neg) {
      if (!c.dhcpPools[v[0]]) return '%Pool ' + v[0] + ' does not exist.';
      delete c.dhcpPools[v[0]]; return '';
    }
    if (!c.dhcpPools[v[0]]) c.dhcpPools[v[0]] = { network: null, mask: null, defaultRouter: [], dns: [], lease: 1 };
    this.mode = 'dhcp'; this.ctx = { pool: v[0] };
    return '';
  });
  function pool(s) { return cfg(s).dhcpPools[s.ctx.pool]; }
  def('dhcp', 'network <ip> <mask>', function (v, neg) {
    var p = pool(this);
    if (neg) { p.network = null; p.mask = null; return ''; }
    if (!U.isValidMask(v[1])) return '% Invalid input detected at \'^\' marker.';
    var net = U.network(v[0], v[1]);
    if (net !== v[0]) return '% ' + v[0] + ' / ' + v[1] + ' is an invalid network.';
    p.network = net; p.mask = v[1];
    return '';
  });
  def('dhcp', 'network <ip> <word>', function (v, neg) {
    var m = /^\/(\d+)$/.exec(v[1]);
    if (!m) return '% Invalid input detected at \'^\' marker.';
    var p = pool(this);
    if (neg) { p.network = null; p.mask = null; return ''; }
    var mask = U.prefixToMask(parseInt(m[1], 10));
    p.network = U.network(v[0], mask); p.mask = mask;
    return '';
  });
  def('dhcp', 'network', function () { var p = pool(this); p.network = null; p.mask = null; return ''; }, { noOnly: true });
  def('dhcp', 'default-router <text>', function (v, neg) {
    var p = pool(this);
    if (neg) { p.defaultRouter = []; return ''; }
    var ips = v[0].split(/\s+/);
    if (!ips.every(U.isIp)) return '% Invalid input detected at \'^\' marker.';
    p.defaultRouter = ips.slice(0, 8);
    return '';
  });
  def('dhcp', 'default-router', function () { pool(this).defaultRouter = []; return ''; }, { noOnly: true });
  def('dhcp', 'dns-server <text>', function (v, neg) {
    var p = pool(this);
    if (neg) { p.dns = []; return ''; }
    var ips = v[0].split(/\s+/);
    if (!ips.every(U.isIp)) return '% Invalid input detected at \'^\' marker.';
    p.dns = ips.slice(0, 8);
    return '';
  });
  def('dhcp', 'dns-server', function () { pool(this).dns = []; return ''; }, { noOnly: true });
  def('dhcp', 'lease <n:0-365>', function (v, neg) { pool(this).lease = neg ? 1 : v[0]; return ''; });
  def('dhcp', 'lease infinite', function () { pool(this).lease = 'infinite'; return ''; });
  def('dhcp', 'domain-name <word>', function () { return ''; });

  // ACL
  function parseAce(type, text) {
    var t = text.trim().split(/\s+/);
    var i = 0;
    var r = {};
    if (/^\d+$/.test(t[0])) { r.seq = parseInt(t[0], 10); i++; }
    var act = (t[i] || '').toLowerCase();
    if (act === 'remark') { r.remark = t.slice(i + 1).join(' '); return r; }
    if ('permit'.indexOf(act) === 0 && act) r.action = 'permit';
    else if ('deny'.indexOf(act) === 0 && act) r.action = 'deny';
    else return { err: i };
    i++;
    function addr() {
      var w = (t[i] || '').toLowerCase();
      if (!w) return null;
      if (w === 'any') { i++; return { any: true }; }
      if (w === 'host') { if (!U.isIp(t[i + 1])) return null; i += 2; return { host: t[i - 1] }; }
      if (!U.isIp(w)) return null;
      if (type === 'standard' && !U.isIp(t[i + 1])) { i++; return { ip: w, wild: '0.0.0.0' }; }
      if (!U.isIp(t[i + 1])) return null;
      i += 2;
      return { ip: t[i - 2], wild: t[i - 1] };
    }
    if (type === 'extended') {
      var proto = (t[i] || '').toLowerCase();
      if (['ip', 'tcp', 'udp', 'icmp'].indexOf(proto) < 0) return { err: i };
      r.proto = proto; i++;
    }
    r.src = addr();
    if (!r.src) return { err: i };
    if (type === 'extended') {
      r.dst = addr();
      if (!r.dst) return { err: i };
      if ((t[i] || '').toLowerCase() === 'eq') {
        var pn = { ssh: 22, telnet: 23, www: 80, http: 80, domain: 53, https: 443, ntp: 123, smtp: 25 }[(t[i + 1] || '').toLowerCase()] || parseInt(t[i + 1], 10);
        if (!pn) return { err: i + 1 };
        r.dport = pn; i += 2;
      }
    }
    while (i < t.length && ['log', 'log-input'].indexOf(t[i].toLowerCase()) >= 0) i++;
    if (i < t.length) return { err: i };
    return r;
  }
  function aceErr(s, line, text, idx) {
    var toks = tokenize(line);
    var words = text.trim().split(/\s+/);
    var offset = toks.length - words.length + idx;
    var tok = toks[Math.min(offset, toks.length - 1)];
    var pos = tok ? tok.pos : line.length;
    if (idx >= words.length) pos = line.length + 1;
    return new Array(s.prompt().length + pos + 1).join(' ') + '^\n% Invalid input detected at \'^\' marker.\n';
  }
  def('config', 'ip access-list extended <word>', function (v, neg) { return aclMode.call(this, 'extended', v[0], neg); });
  def('config', 'ip access-list standard <word>', function (v, neg) { return aclMode.call(this, 'standard', v[0], neg); });
  function aclMode(type, name, neg) {
    var c = cfg(this);
    if (neg) { delete c.acls[name]; return ''; }
    if (c.acls[name] && c.acls[name].type !== type) return '% Access-list type conflicts with prior definition';
    if (!c.acls[name]) c.acls[name] = { type: type, rules: [] };
    this.mode = 'acl'; this.ctx = { acl: name, aclType: type };
    return '';
  }
  function aceAdd(v, neg, kws, line) {
    var acl = cfg(this).acls[this.ctx.acl];
    var text = kws.join(' ') + ' ' + (v[0] || '');
    if (/^\d+$/.test(String(v[0] || '')) === false && kws[0] && /^\d+$/.test(kws[0])) text = line;
    var r = parseAce(acl.type, text);
    if (r.err !== undefined) return aceErr(this, line, text, r.err);
    if (neg) {
      var txt = SH.aceText(acl.type, r).replace(/\s+/g, ' ');
      acl.rules = acl.rules.filter(function (x) { return SH.aceText(acl.type, x).replace(/\s+/g, ' ') !== txt; });
      return '';
    }
    if (r.seq === undefined) r.seq = nextSeq(acl);
    else if (acl.rules.some(function (x) { return x.seq === r.seq; })) return '% Duplicate sequence number';
    acl.rules.push(r);
    acl.rules.sort(function (a, b) { return a.seq - b.seq; });
    return '';
  }
  def('acl', 'permit <text>', aceAdd);
  def('acl', 'deny <text>', aceAdd);
  def('acl', 'remark <text>', aceAdd);
  def('acl', '<n:1-2147483647> <text>', function (v, neg, kws, line) {
    var acl = cfg(this).acls[this.ctx.acl];
    var r = parseAce(acl.type, v[0] + ' ' + v[1]);
    if (r.err !== undefined) return aceErr(this, line, v[0] + ' ' + v[1], r.err);
    if (acl.rules.some(function (x) { return x.seq === r.seq; })) return '% Duplicate sequence number';
    acl.rules.push(r);
    acl.rules.sort(function (a, b) { return a.seq - b.seq; });
    return '';
  });
  def('acl', '<n:1-2147483647>', function (v) {
    var acl = cfg(this).acls[this.ctx.acl];
    acl.rules = acl.rules.filter(function (x) { return x.seq !== v[0]; });
    return '';
  }, { noOnly: true });
  def('config', 'access-list <n:1-199> <text>', function (v, neg, kws, line) {
    var c = cfg(this);
    var name = String(v[0]);
    var type = v[0] < 100 ? 'standard' : 'extended';
    var r = parseAce(type, v[1]);
    if (r.err !== undefined) return aceErr(this, line, v[1], r.err);
    if (neg) { delete c.acls[name]; return ''; }
    if (!c.acls[name]) c.acls[name] = { type: type, rules: [] };
    r.seq = nextSeq(c.acls[name]);
    c.acls[name].rules.push(r);
    return '';
  });
  def('config', 'access-list <n:1-199>', function (v) { delete cfg(this).acls[String(v[0])]; return ''; }, { noOnly: true });

  // NAT
  def('config', 'ip nat inside source static <ip> <ip>', function (v, neg) {
    var n = cfg(this).nat;
    if (neg) { n.statics = n.statics.filter(function (s) { return !(s.local === v[0] && s.global === v[1]); }); return ''; }
    if (n.statics.some(function (s) { return s.local === v[0]; })) return '% ' + v[0] + ' already mapped (' + v[0] + ' -> ' + n.statics.filter(function (s) { return s.local === v[0]; })[0].global + ')';
    n.statics.push({ local: v[0], global: v[1] });
    return '';
  });
  function natList(v, neg, kws) {
    var n = cfg(this).nat;
    var ov = kws.indexOf('overload') >= 0;
    if (!ifExists(this, v[1])) return '% Invalid input detected at \'^\' marker.';
    if (neg) { n.dynamic = n.dynamic.filter(function (x) { return !(x.acl === String(v[0]) && x.iface === v[1]); }); this.dev.rt.natTrans = []; return ''; }
    n.dynamic = n.dynamic.filter(function (x) { return x.acl !== String(v[0]); });
    n.dynamic.push({ acl: String(v[0]), iface: v[1], overload: ov });
    return '';
  }
  def('config', 'ip nat inside source list <word> interface <if> overload', natList);
  def('config', 'ip nat inside source list <word> interface <if>', natList);

  // SSH och nycklar
  def('config', 'ip ssh version <n:1-2>', function (v, neg) {
    var c = cfg(this);
    c.ssh.version = neg ? null : v[0];
    if (!neg && !c.cryptoKey) return 'Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).';
    return '';
  });
  def('config', 'ip ssh version', function () { cfg(this).ssh.version = null; return ''; }, { noOnly: true });
  function genKey(bits) {
    var c = cfg(this);
    var s = this;
    if (!c.hostname || c.hostname === 'Router' || c.hostname === 'Switch') return '% Please define a hostname other than ' + c.hostname + '.';
    if (!c.domainName) return '% Please define a domain-name first.';
    function make(b) {
      b = parseInt(b, 10) || 512;
      if (b < 360 || b > 4096) return result('% A decimal number between 360 and 4096.');
      c.cryptoKey = b;
      var hadSsh = true;
      S.pushLog(s.state, s.dev, '%SSH-5-ENABLED: SSH ' + (c.ssh.version === 2 ? '2.0' : '1.99') + ' has been enabled');
      return result('% Generating ' + b + ' bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was ' + Math.max(1, Math.round(b / 1024)) + ' seconds)\n', { delay: 800 });
    }
    var intro = 'The name for the keys will be: ' + c.hostname + '.' + c.domainName + '\n';
    function askBits() {
      s.pending = { prompt: 'How many bits in the modulus [512]: ', fn: function (a) { return make(a || 512); } };
    }
    if (c.cryptoKey) {
      s.pending = { prompt: '% You already have RSA keys defined named ' + c.hostname + '.' + c.domainName + '.\n% Do you really want to replace them? [yes/no]: ', fn: function (a) {
        if (!/^y/i.test(a)) return result('');
        if (bits) return make(bits);
        askBits();
        return result('Choose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n');
      } };
      return '';
    }
    if (bits) return result(intro).out + make(bits).out;
    askBits();
    return intro + 'Choose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n';
  }
  def('config', 'crypto key generate rsa', function () { return genKey.call(this, null); }, { no: false });
  def('config', 'crypto key generate rsa general-keys', function () { return genKey.call(this, null); }, { no: false });
  def('config', 'crypto key generate rsa modulus <n:360-4096>', function (v) { return genKey.call(this, v[0]); }, { no: false });
  def('config', 'crypto key generate rsa general-keys modulus <n:360-4096>', function (v) { return genKey.call(this, v[0]); }, { no: false });
  def('config', 'crypto key zeroize rsa', function () {
    var c = cfg(this), s = this;
    this.pending = { prompt: '% All keys will be removed.\n% All router certs issued using these keys will also be removed.\nDo you really want to remove these keys? [yes/no]: ', fn: function (a) {
      if (!/^y/i.test(a)) return result('');
      c.cryptoKey = null;
      S.pushLog(s.state, s.dev, '%SSH-5-DISABLED: SSH 2.0 has been disabled');
      return result('');
    } };
    return '';
  }, { no: false });

  // Linjer
  function lineMode(names) { this.mode = 'line'; this.ctx = { lines: names }; return ''; }
  def('config', 'line con <n:0-0>', function () { return lineMode.call(this, ['con']); }, { no: false });
  def('config', 'line console <n:0-0>', function () { return lineMode.call(this, ['con']); }, { no: false });
  def('config', 'line vty <n:0-15> <n:0-15>', function (v) {
    var a = v[0], b = v[1];
    var names = [];
    if (a <= 4) names.push('vty0_4');
    if (b >= 5) names.push('vty5_15');
    return lineMode.call(this, names);
  }, { no: false });
  def('config', 'line vty <n:0-15>', function (v) { return lineMode.call(this, [v[0] <= 4 ? 'vty0_4' : 'vty5_15']); }, { no: false });
  def('config', 'line aux <n:0-0>', function () { return lineMode.call(this, []); }, { no: false });
  function eachLine(s, fn) { s.ctx.lines.forEach(function (n) { fn(cfg(s).lines[n], n); }); }
  def('line', 'transport input <text>', function (v, neg) {
    var w = v[0].toLowerCase().split(/\s+/);
    var ok = w.every(function (x) { return ['ssh', 'telnet', 'all', 'none'].indexOf(x) >= 0; });
    if (!ok) return '% Invalid input detected at \'^\' marker.';
    var val = w.length === 2 ? 'telnet ssh' : w[0];
    eachLine(this, function (l, n) { if (n !== 'con') l.transport = neg ? 'all' : val; });
    return '';
  });
  def('line', 'transport input', function () { eachLine(this, function (l) { l.transport = 'all'; }); return ''; }, { noOnly: true });
  def('line', 'login local', function (v, neg) { eachLine(this, function (l) { l.loginLocal = !neg; }); return ''; });
  def('line', 'login', function (v, neg) { eachLine(this, function (l) { l.loginLocal = false; if (neg) l.password = null; }); return ''; });
  def('line', 'password <word>', function (v, neg) { eachLine(this, function (l) { l.password = neg ? null : v[0]; }); return ''; });
  def('line', 'password', function () { eachLine(this, function (l) { l.password = null; }); return ''; }, { noOnly: true });
  def('line', 'logging synchronous', function (v, neg) { eachLine(this, function (l) { l.logSync = !neg; }); return ''; });
  def('line', 'exec-timeout <n:0-35791> <n:0-2147483>', function () { return ''; });
  def('line', 'exec-timeout <n:0-35791>', function () { return ''; });
  def('line', 'speed <n:1200-115200>', function (v, neg) {
    var ok = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].indexOf(v[0]) >= 0;
    if (!ok) return '% Invalid input detected at \'^\' marker.';
    var s = this;
    var changed = false;
    eachLine(this, function (l, n) { if (n === 'con') { l.speed = neg ? 9600 : v[0]; changed = true; } });
    if (changed && NV.onConsoleSpeed) NV.onConsoleSpeed(s.dev.id);
    return '';
  });

  // VLAN
  def('config', 'vlan <vlist>', function (v, neg) {
    if (!isSwitch(this)) return '% Invalid input detected at \'^\' marker.';
    var c = cfg(this);
    var list = v[0];
    if (list === 'all') return '% Invalid input detected at \'^\' marker.';
    if (neg) {
      list.forEach(function (x) { if (x !== 1) delete c.vlans[x]; });
      if (list.indexOf(1) >= 0) return '%Default VLAN 1 may not be deleted.';
      return '';
    }
    for (var i = 0; i < list.length; i++) if (list[i] >= 1002 && list[i] <= 1005) return '%Default VLAN ' + list[i] + ' may not be modified.';
    list.forEach(function (x) { if (!c.vlans[x]) c.vlans[x] = 'VLAN' + ('000' + x).slice(-4); });
    this.mode = 'vlan'; this.ctx = { vlans: list };
    return '';
  });
  def('vlan', 'name <word>', function (v, neg) {
    var c = cfg(this);
    var s = this;
    this.ctx.vlans.forEach(function (x) { c.vlans[x] = neg ? 'VLAN' + ('000' + x).slice(-4) : v[0]; });
    if (!neg && this.ctx.vlans.length > 1) return '';
    return '';
  });
  def('config', 'spanning-tree vlan <vlist> priority <n:0-61440>', function (v, neg) {
    var c = cfg(this);
    if (!neg && v[1] % 4096 !== 0) return '% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  0     4096  8192  12288 16384 20480 24576 28672\n  32768 36864 40960 45056 49152 53248 57344 61440';
    v[0].forEach(function (x) { if (neg) delete c.stpPriority[x]; else c.stpPriority[x] = v[1]; });
    return '';
  });
  def('config', 'spanning-tree vlan <vlist>', function (v, neg) {
    var c = cfg(this);
    var list = v[0] === 'all' ? Object.keys(c.vlans).map(Number) : v[0];
    list.forEach(function (x) {
      var i = c.stpOff.indexOf(x);
      if (neg && i < 0) c.stpOff.push(x);
      if (!neg && i >= 0) c.stpOff.splice(i, 1);
    });
    return '';
  });

  // Loggning och NTP
  def('config', 'logging buffered', function (v, neg) { cfg(this).logging.buffered = !neg; return ''; });
  def('config', 'logging buffered <n:4096-2147483647>', function (v, neg) { var l = cfg(this).logging; l.buffered = !neg; if (!neg) l.size = v[0]; return ''; });
  def('config', 'logging host <ip>', function (v, neg) {
    var l = cfg(this).logging;
    if (neg) l.hosts = l.hosts.filter(function (h) { return h !== v[0]; });
    else if (l.hosts.indexOf(v[0]) < 0) l.hosts.push(v[0]);
    return '';
  });
  def('config', 'logging <ip>', function (v, neg) {
    var l = cfg(this).logging;
    if (neg) l.hosts = l.hosts.filter(function (h) { return h !== v[0]; });
    else if (l.hosts.indexOf(v[0]) < 0) l.hosts.push(v[0]);
    return '';
  });
  def('config', 'ntp server <ip>', function (v, neg) {
    var c = cfg(this);
    if (neg) c.ntpServers = c.ntpServers.filter(function (x) { return x !== v[0]; });
    else if (c.ntpServers.indexOf(v[0]) < 0) c.ntpServers.push(v[0]);
    S.touch(this.state);
    return '';
  });
  def('config', 'clock timezone <word> <n:0-23>', function () { return ''; });
  def('config', 'ntp source <if>', function (v, neg, k, line) {
    if (!neg && !ifExists(this, v[0])) return invalidMarker(this, line, v[0]);
    cfg(this).ntpSource = neg ? null : v[0];
    S.touch(this.state);
    return '';
  });
  def('config', 'ntp source', function () { cfg(this).ntpSource = null; S.touch(this.state); return ''; }, { noOnly: true });

  // ------------------------------------------------------------------ INTERFACE
  def('config', 'interface <if>', function (v, neg, kws, line) {
    var n = v[0];
    var c = cfg(this);
    var sub = /\.(\d+)$/.exec(n);
    var svi = /^Vlan(\d+)$/.exec(n);
    if (neg) {
      if (sub && c.ifaces[n]) { delete c.ifaces[n]; return ''; }
      if (svi && c.ifaces[n] && n !== 'Vlan1') { delete c.ifaces[n]; return ''; }
      return invalidMarker(this, line, line.trim().split(/\s+/).slice(2).join(' ') || 'interface');
    }
    if (!c.ifaces[n]) {
      if (sub && isRouter(this) && c.ifaces[n.split('.')[0]]) {
        c.ifaces[n] = { parent: n.split('.')[0], encap: null, ip: null, shutdown: false, natDir: null, aclIn: null, aclOut: null, description: '' };
      } else if (svi && isSwitch(this)) {
        var vid = parseInt(svi[1], 10);
        if (vid < 1 || vid > 4094) return invalidMarker(this, line, svi[1]);
        c.ifaces[n] = { shutdown: false, ip: null, svi: vid };
      } else {
        return invalidMarker(this, line, line.trim().split(/\s+/).slice(1).join(' '));
      }
    }
    this.mode = 'if';
    this.ctx = { ifs: [n], sub: !!sub };
    return '';
  }, { no: true });
  def('config', 'interface range <text>', function (v, neg, kws, line) {
    var list = U.expandRange(v[0]);
    var c = cfg(this);
    if (!list || !list.every(function (n) { return c.ifaces[n] && !c.ifaces[n].parent; })) return invalidMarker(this, line, v[0]);
    this.mode = 'if';
    this.ctx = { ifs: list, range: true };
    return '';
  }, { no: false });

  function kindOf(s, i) { return i.parent ? 'sub' : (i.svi ? 'svi' : (isSwitch(s) ? 'l2' : 'l3')); }
  def('if', 'description <text>', function (v, neg) { return eachIf(this, function (i) { i.description = neg ? '' : v[0]; }); });
  def('if', 'description', function () { return eachIf(this, function (i) { i.description = ''; }); }, { noOnly: true });
  def('if', 'shutdown', function (v, neg) {
    var s = this;
    return eachIf(this, function (i, n) {
      i.shutdown = !neg;
      if (neg && s.dev.rt.errdisabled[n]) delete s.dev.rt.errdisabled[n];
    });
  });
  def('if', 'ip address <ip> <mask>', function (v, neg, kws, line) {
    var s = this;
    return eachIf(this, function (i, n) {
      var k = kindOf(s, i);
      if (k === 'l2') return invalidMarker(s, line, 'address');
      if (neg) { i.ip = null; return; }
      if (!U.isValidMask(v[1])) return 'Bad mask /' + v[1] + ' for address ' + v[0];
      var net = U.network(v[0], v[1]);
      if (net === v[0] && U.maskToPrefix(v[1]) < 31) return 'Bad mask /' + U.maskToPrefix(v[1]) + ' for address ' + v[0];
      if (U.broadcast(v[0], v[1]) === v[0] && U.maskToPrefix(v[1]) < 31) return 'Bad mask /' + U.maskToPrefix(v[1]) + ' for address ' + v[0];
      if (i.parent && !i.encap) return '% Configuring IP routing on a LAN subinterface is only allowed if that\nsubinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,\nor ISL vLAN.\n';
      var c = cfg(s);
      var clash = Object.keys(c.ifaces).filter(function (o) {
        var x = c.ifaces[o];
        return o !== n && x.ip && (U.sameSubnet(x.ip.addr, v[0], v[1]) || U.sameSubnet(v[0], x.ip.addr, x.ip.mask));
      })[0];
      if (clash) return '% ' + net + ' overlaps with ' + clash;
      i.ip = { addr: v[0], mask: v[1] };
    });
  });
  def('if', 'ip address', function () { return eachIf(this, function (i) { i.ip = null; }); }, { noOnly: true });
  function l2(s, line, word, fn) {
    return eachIf(s, function (i, n) {
      if (kindOf(s, i) !== 'l2') return invalidMarker(s, line, word);
      return fn(i, n);
    });
  }
  def('if', 'switchport mode access', function (v, neg, k, line) { return l2(this, line, 'switchport', function (i) { i.mode = neg ? 'dynamic auto' : 'access'; }); });
  def('if', 'switchport mode trunk', function (v, neg, k, line) {
    return l2(this, line, 'switchport', function (i) {
      if (neg) { i.mode = 'dynamic auto'; return; }
      if (i.encap !== 'dot1q') return 'Command rejected: An interface whose trunk encapsulation is "Auto" can not be configured to "trunk" mode.';
      i.mode = 'trunk';
    });
  });
  def('if', 'switchport mode dynamic auto', function (v, neg, k, line) { return l2(this, line, 'switchport', function (i) { if (i.nonegotiate) return 'Command rejected: Conflict between \'nonegotiate\' and \'dynamic\' status.'; i.mode = 'dynamic auto'; }); });
  def('if', 'switchport mode dynamic desirable', function (v, neg, k, line) { return l2(this, line, 'switchport', function (i) { if (i.nonegotiate) return 'Command rejected: Conflict between \'nonegotiate\' and \'dynamic\' status.'; i.mode = neg ? 'dynamic auto' : 'dynamic desirable'; }); });
  def('if', 'switchport mode', function (v, n, k, line) { return l2(this, line, 'switchport', function (i) { i.mode = 'dynamic auto'; }); }, { noOnly: true });
  def('if', 'switchport access vlan <n:1-4094>', function (v, neg, k, line) {
    var s = this;
    var msg = '';
    var out = l2(this, line, 'switchport', function (i) {
      if (neg) { i.accessVlan = 1; return; }
      if (!cfg(s).vlans[v[0]]) { cfg(s).vlans[v[0]] = 'VLAN' + ('000' + v[0]).slice(-4); msg = '% Access VLAN does not exist. Creating vlan ' + v[0]; }
      i.accessVlan = v[0];
    });
    return out || msg;
  });
  def('if', 'switchport access vlan', function (v, n, k, line) { return l2(this, line, 'switchport', function (i) { i.accessVlan = 1; }); }, { noOnly: true });
  def('if', 'switchport trunk encapsulation dot1q', function (v, neg, k, line) { return l2(this, line, 'switchport', function (i) { if (neg && i.mode === 'trunk') return 'Command rejected: Encapsulation is "Auto" and mode is "trunk".'; i.encap = neg ? null : 'dot1q'; }); });
  def('if', 'switchport trunk encapsulation negotiate', function (v, neg, k, line) { return l2(this, line, 'switchport', function (i) { if (i.mode === 'trunk') return 'Command rejected: An interface whose trunk encapsulation is "Auto" can not be configured to "trunk" mode.'; i.encap = null; }); });
  def('if', 'switchport trunk native vlan <n:1-4094>', function (v, neg, k, line) { return l2(this, line, 'switchport', function (i) { i.native = neg ? 1 : v[0]; }); });
  def('if', 'switchport trunk native vlan', function (v, n, k, line) { return l2(this, line, 'switchport', function (i) { i.native = 1; }); }, { noOnly: true });
  def('if', 'switchport trunk allowed vlan <vlist>', function (v, neg, k, line) {
    return l2(this, line, 'switchport', function (i) { i.allowed = neg ? 'all' : (v[0] === 'all' ? 'all' : v[0].slice()); });
  });
  def('if', 'switchport trunk allowed vlan all', function (v, neg, k, line) { return l2(this, line, 'switchport', function (i) { i.allowed = 'all'; }); });
  def('if', 'switchport trunk allowed vlan none', function (v, neg, k, line) { return l2(this, line, 'switchport', function (i) { i.allowed = []; }); });
  def('if', 'switchport trunk allowed vlan add <vlist>', function (v, neg, k, line) {
    return l2(this, line, 'switchport', function (i) {
      if (i.allowed === 'all') return;
      v[0].forEach(function (x) { if (i.allowed.indexOf(x) < 0) i.allowed.push(x); });
      i.allowed.sort(function (a, b) { return a - b; });
    });
  });
  def('if', 'switchport trunk allowed vlan remove <vlist>', function (v, neg, k, line) {
    return l2(this, line, 'switchport', function (i) {
      if (i.allowed === 'all') { i.allowed = []; for (var x = 1; x <= 4094; x++) if (v[0].indexOf(x) < 0) i.allowed.push(x); return; }
      i.allowed = i.allowed.filter(function (x) { return v[0].indexOf(x) < 0; });
    });
  });
  def('if', 'switchport trunk allowed vlan except <vlist>', function (v, neg, k, line) {
    return l2(this, line, 'switchport', function (i) { i.allowed = []; for (var x = 1; x <= 4094; x++) if (v[0].indexOf(x) < 0) i.allowed.push(x); });
  });
  def('if', 'switchport trunk allowed vlan', function (v, n, k, line) { return l2(this, line, 'switchport', function (i) { i.allowed = 'all'; }); }, { noOnly: true });
  def('if', 'switchport nonegotiate', function (v, neg, k, line) {
    return l2(this, line, 'switchport', function (i) {
      if (!neg && i.mode !== 'access' && i.mode !== 'trunk') return 'Command rejected: Conflict between \'nonegotiate\' and \'dynamic\' status.';
      i.nonegotiate = !neg;
    });
  });
  def('if', 'switchport', function (v, neg, k, line) {
    var s = this;
    return eachIf(this, function (i) {
      if (isRouter(s)) return invalidMarker(s, line, 'switchport');
      if (neg) return '% Routed ports are not used in this lab. Keep the port as a switchport.';
    });
  });
  def('if', 'switchport port-security', function (v, neg, k, line) {
    return l2(this, line, 'switchport', function (i, n) {
      if (neg) { i.portSec = null; return; }
      if (i.mode !== 'access') return 'Command rejected: ' + n + ' is a dynamic port.';
      if (!i.portSec) i.portSec = { max: 1, violation: 'shutdown', sticky: false, macs: [] };
    });
  });
  function psec(s, line, fn) {
    return l2(s, line, 'switchport', function (i, n) {
      if (i.mode !== 'access') return 'Command rejected: ' + n + ' is a dynamic port.';
      if (!i.portSec) i.portSec = { max: 1, violation: 'shutdown', sticky: false, macs: [], disabled: true };
      return fn(i.portSec, i, n);
    });
  }
  def('if', 'switchport port-security maximum <n:1-132>', function (v, neg, k, line) { return psec(this, line, function (p) { p.max = neg ? 1 : v[0]; }); });
  def('if', 'switchport port-security violation shutdown', function (v, neg, k, line) { return psec(this, line, function (p) { p.violation = 'shutdown'; }); });
  def('if', 'switchport port-security violation restrict', function (v, neg, k, line) { return psec(this, line, function (p) { p.violation = neg ? 'shutdown' : 'restrict'; }); });
  def('if', 'switchport port-security violation protect', function (v, neg, k, line) { return psec(this, line, function (p) { p.violation = neg ? 'shutdown' : 'protect'; }); });
  def('if', 'switchport port-security mac-address sticky', function (v, neg, k, line) { return psec(this, line, function (p) { p.sticky = !neg; if (neg) p.macs = []; }); });
  def('if', 'switchport port-security mac-address sticky <word>', function (v, neg, k, line) {
    var mac = v[0].replace(/[.:-]/g, '').toLowerCase();
    return psec(this, line, function (p) {
      if (neg) p.macs = p.macs.filter(function (m) { return m !== mac; });
      else if (p.macs.indexOf(mac) < 0) p.macs.push(mac);
    });
  });
  def('if', 'speed <word>', function (v, neg, k, line) {
    var s = this;
    var val = neg ? 'auto' : v[0];
    if (['10', '100', '1000', 'auto'].indexOf(val) < 0) return invalidMarker(this, line, v[0]);
    return eachIf(this, function (i) { if (i.svi || i.parent) return invalidMarker(s, line, 'speed'); i.speed = val; });
  });
  def('if', 'speed', function () { return eachIf(this, function (i) { i.speed = 'auto'; }); }, { noOnly: true });
  def('if', 'duplex <word>', function (v, neg, k, line) {
    var s = this;
    var val = neg ? 'auto' : v[0].toLowerCase();
    var full = ['full', 'half', 'auto'].filter(function (x) { return x.indexOf(val) === 0; })[0];
    if (!full) return invalidMarker(this, line, v[0]);
    return eachIf(this, function (i) { if (i.svi || i.parent) return invalidMarker(s, line, 'duplex'); i.duplex = full; });
  });
  def('if', 'duplex', function () { return eachIf(this, function (i) { i.duplex = 'auto'; }); }, { noOnly: true });
  def('if', 'power inline auto', function (v, neg, k, line) { return l2(this, line, 'power', function (i) { i.poe = 'auto'; }); });
  def('if', 'power inline never', function (v, neg, k, line) { return l2(this, line, 'power', function (i) { i.poe = neg ? 'auto' : 'never'; }); });
  def('if', 'spanning-tree portfast', function (v, neg, k, line) {
    var out = l2(this, line, 'spanning-tree', function (i) { i.portfast = !neg; });
    if (out || neg) return out;
    return '%Warning: portfast should only be enabled on ports connected to a single\n host. Connecting hubs, concentrators, switches, bridges, etc... to this\n interface  when portfast is enabled, can cause temporary bridging loops.\n Use with CAUTION';
  });
  def('if', 'spanning-tree portfast trunk', function (v, neg, k, line) { return l2(this, line, 'spanning-tree', function (i) { i.portfast = !neg; }); });
  def('if', 'encapsulation dot1q <n:1-4094>', function (v, neg, k, line) {
    var s = this;
    return eachIf(this, function (i, n) {
      if (!i.parent) return invalidMarker(s, line, 'encapsulation');
      if (neg) { i.encap = null; i.ip = null; return; }
      var c = cfg(s);
      var other = Object.keys(c.ifaces).filter(function (o) { return o !== n && c.ifaces[o].parent === i.parent && c.ifaces[o].encap === v[0]; })[0];
      if (other) return '%Configuration of multiple subinterfaces of the same main\ninterface with the same VID (' + v[0] + ') is not permitted.\nThis VID is already configured on ' + other + '.';
      i.encap = v[0];
    });
  });
  def('if', 'ip nat inside', function (v, neg, k, line) { var s = this; return eachIf(this, function (i) { if (kindOf(s, i) === 'l2') return invalidMarker(s, line, 'nat'); i.natDir = neg ? (i.natDir === 'inside' ? null : i.natDir) : 'inside'; }); });
  def('if', 'ip nat outside', function (v, neg, k, line) { var s = this; return eachIf(this, function (i) { if (kindOf(s, i) === 'l2') return invalidMarker(s, line, 'nat'); i.natDir = neg ? (i.natDir === 'outside' ? null : i.natDir) : 'outside'; }); });
  def('if', 'ip access-group <word> in', function (v, neg, k, line) { var s = this; return eachIf(this, function (i) { if (kindOf(s, i) === 'l2') return invalidMarker(s, line, 'access-group'); i.aclIn = neg ? null : v[0]; }); });
  def('if', 'ip access-group <word> out', function (v, neg, k, line) { var s = this; return eachIf(this, function (i) { if (kindOf(s, i) === 'l2') return invalidMarker(s, line, 'access-group'); i.aclOut = neg ? null : v[0]; }); });
  def('if', 'ip access-group in', function () { return eachIf(this, function (i) { i.aclIn = null; }); }, { noOnly: true });
  def('if', 'ip access-group out', function () { return eachIf(this, function (i) { i.aclOut = null; }); }, { noOnly: true });
  def('if', 'ip helper-address <ip>', function () { return ''; });
  def('if', 'cdp enable', function () { return ''; });
  def('if', 'negotiation auto', function () { return ''; });

  // ------------------------------------------------------------------ Fler kommandon
  showDef('vlan id <n:1-4094>', swOnly(function (v) { return SH.vlanId(this.state, this.dev, v[0]); }), true);
  showDef('processes cpu', function () { return SH.processesCpu(this.state, this.dev); }, true);
  showDef('processes cpu sorted', function () { return SH.processesCpu(this.state, this.dev); }, true);
  showDef('cdp neighbors detail', function () { return SH.cdpDetail(this.state, this.dev); }, true);
  showDef('spanning-tree summary', swOnly(function () { return SH.stpSummary(this.state, this.dev); }), true);
  showDef('spanning-tree blockedports', swOnly(function () { return SH.stpBlocked(this.state, this.dev); }), true);
  showDef('inventory', function () { return SH.inventory(this.state, this.dev); }, true);
  showDef('interfaces counters errors', swOnly(function () { return SH.countersErrors(this.state, this.dev); }), true);
  def('config', 'default interface <if>', function (v, neg, k, line) {
    var c = cfg(this);
    var i = c.ifaces[v[0]];
    if (!i || i.parent || i.svi) return invalidMarker(this, line, v[0]);
    var fresh = isSwitch(this) ? { shutdown: false, description: '', mode: 'dynamic auto', accessVlan: 1, encap: null, allowed: 'all', native: 1, nonegotiate: false, speed: 'auto', duplex: 'auto', poe: 'auto', portSec: null, portfast: false, sfp: i.sfp } : { shutdown: true, description: '', ip: null, speed: 'auto', duplex: 'auto', natDir: null, aclIn: null, aclOut: null };
    c.ifaces[v[0]] = fresh;
    delete this.dev.rt.errdisabled[v[0]];
    return 'Interface ' + v[0] + ' set to default configuration';
  }, { no: false });
  def('config', 'errdisable recovery cause psecure-violation', function (v, neg) { cfg(this).errRecovery = !neg; return ''; });
  def('user exec', 'terminal history size <n:0-256>', function () { return ''; });

  // ------------------------------------------------------------------ IPsec och MSS (kapitel 10)
  function crypto(s) {
    var c = cfg(s);
    if (!c.crypto) c.crypto = { isakmp: { policies: {}, keys: {} }, transformSets: {}, maps: {} };
    return c.crypto;
  }
  function crOnly(fn) { return function (v, n, k, l) { if (!isRouter(this)) return invalidMarker(this, l, 'crypto'); var r = fn.call(this, v, n, k, l); S.touch(this.state); return r; }; }
  def('config', 'crypto isakmp policy <n:1-10000>', crOnly(function (v, neg) {
    var cr = crypto(this);
    if (neg) { delete cr.isakmp.policies[v[0]]; return ''; }
    if (!cr.isakmp.policies[v[0]]) cr.isakmp.policies[v[0]] = { enc: 'des', hash: 'sha', auth: 'rsa-sig', group: 1, lifetime: 86400 };
    this.mode = 'isakmp'; this.ctx = { policy: v[0] };
    return '';
  }));
  function pol(s) { return crypto(s).isakmp.policies[s.ctx.policy]; }
  def('isakmp', 'encryption <text>', function (v, neg, k, line) {
    var t = v[0].toLowerCase().replace(/\s+/g, ' ');
    var ok = { 'des': 'des', '3des': '3des', 'aes': 'aes', 'aes 128': 'aes', 'aes 192': 'aes 192', 'aes 256': 'aes 256' }[t];
    if (!ok) return invalidMarker(this, line, v[0]);
    pol(this).enc = neg ? 'des' : ok; S.touch(this.state); return '';
  });
  def('isakmp', 'hash <word>', function (v, neg, k, line) {
    var h = v[0].toLowerCase();
    if (['sha', 'sha256', 'sha384', 'sha512', 'md5'].indexOf(h) < 0) return invalidMarker(this, line, v[0]);
    pol(this).hash = neg ? 'sha' : h; S.touch(this.state); return '';
  });
  def('isakmp', 'authentication pre-share', function (v, neg) { pol(this).auth = neg ? 'rsa-sig' : 'pre-share'; S.touch(this.state); return ''; });
  def('isakmp', 'authentication rsa-sig', function () { pol(this).auth = 'rsa-sig'; S.touch(this.state); return ''; });
  def('isakmp', 'group <n:1-24>', function (v, neg, k, line) {
    if ([1, 2, 5, 14, 15, 16, 19, 20, 24].indexOf(v[0]) < 0) return invalidMarker(this, line, String(v[0]));
    pol(this).group = neg ? 1 : v[0]; S.touch(this.state); return '';
  });
  def('isakmp', 'lifetime <n:60-86400>', function (v, neg) { pol(this).lifetime = neg ? 86400 : v[0]; return ''; });
  function isakmpKey(v, neg) {
    var cr = crypto(this);
    var key = v[v.length - 2], ip = v[v.length - 1];
    if (neg) { delete cr.isakmp.keys[ip]; return ''; }
    cr.isakmp.keys[ip] = key;
    return '';
  }
  // crypto isakmp key [0|6] <nyckel> address <ip>
  def('config', 'crypto isakmp key <text>', crOnly(function (v, neg, k, line) {
    var t = v[0].split(/\s+/);
    if (/^[06]$/.test(t[0]) && t.length === 4) t = t.slice(1);
    if (t.length !== 3 || !/^address$/i.test(t[1]) || !U.isIp(t[2])) return invalidMarker(this, line, t[1] || t[0]);
    return isakmpKey.call(this, [t[0], t[2]], neg);
  }));
  def('config', 'crypto ipsec transform-set <word> <text>', crOnly(function (v, neg, k, line) {
    var cr = crypto(this);
    if (neg) { delete cr.transformSets[v[0]]; return ''; }
    var t = v[1].toLowerCase().split(/\s+/);
    var okT = ['esp-aes', '128', '192', '256', 'esp-3des', 'esp-des', 'esp-sha-hmac', 'esp-sha256-hmac', 'esp-sha384-hmac', 'esp-md5-hmac', 'ah-sha-hmac', 'esp-gcm'];
    for (var i = 0; i < t.length; i++) if (okT.indexOf(t[i]) < 0) return invalidMarker(this, line, t[i]);
    cr.transformSets[v[0]] = { transforms: t, mode: 'tunnel' };
    this.mode = 'tset'; this.ctx = { ts: v[0] };
    return '';
  }));
  def('config', 'crypto ipsec transform-set <word>', crOnly(function (v) { delete crypto(this).transformSets[v[0]]; return ''; }), { noOnly: true });
  def('tset', 'mode tunnel', function () { crypto(this).transformSets[this.ctx.ts].mode = 'tunnel'; return ''; });
  def('tset', 'mode transport', function (v, neg) { crypto(this).transformSets[this.ctx.ts].mode = neg ? 'tunnel' : 'transport'; return ''; });
  function cmapEnter(v, neg) {
    var cr = crypto(this);
    var m = cr.maps[v[0]] = cr.maps[v[0]] || {};
    if (neg) {
      delete m[v[1]];
      if (!Object.keys(m).length) delete cr.maps[v[0]];
      return '';
    }
    var fresh = !m[v[1]];
    if (fresh) m[v[1]] = { peer: null, ts: null, acl: null };
    this.mode = 'cmap'; this.ctx = { map: v[0], seq: v[1] };
    return fresh ? '% NOTE: This new crypto map will remain disabled until a peer\n        and a valid access list have been configured.' : '';
  }
  def('config', 'crypto map <word> <n:1-65535> ipsec-isakmp', crOnly(cmapEnter));
  def('config', 'crypto map <word> <n:1-65535>', crOnly(cmapEnter));
  function ent(s) { return crypto(s).maps[s.ctx.map][s.ctx.seq]; }
  def('cmap', 'set peer <ip>', function (v, neg) { var e = ent(this); e.peer = neg ? null : v[0]; S.touch(this.state); return ''; });
  def('cmap', 'set transform-set <word>', function (v, neg) {
    var e = ent(this);
    if (!neg && !crypto(this).transformSets[v[0]]) return 'ERROR: transform set with tag "' + v[0] + '" does not exist.';
    e.ts = neg ? null : v[0]; S.touch(this.state); return '';
  });
  def('cmap', 'match address <word>', function (v, neg) { var e = ent(this); e.acl = neg ? null : v[0]; S.touch(this.state); return ''; });
  def('cmap', 'set pfs <word>', function () { return ''; });
  def('cmap', 'set security-association lifetime seconds <n:120-86400>', function () { return ''; });
  def('cmap', 'description <text>', function () { return ''; });
  def('if', 'crypto map <word>', function (v, neg, k, line) {
    var s = this;
    if (!isRouter(this)) return invalidMarker(this, line, 'crypto');
    var out = eachIf(this, function (i) {
      if (kindOf(s, i) === 'l2') return invalidMarker(s, line, 'crypto');
      i.cryptoMap = neg ? null : v[0];
    });
    S.touch(this.state);
    if (!neg && !out) S.pushLog(this.state, this.dev, '%CRYPTO-6-ISAKMP_ON_OFF: ISAKMP is ON');
    return out;
  });
  def('if', 'crypto map', function () { var r = eachIf(this, function (i) { i.cryptoMap = null; }); S.touch(this.state); return r; }, { noOnly: true });
  def('if', 'ip tcp adjust-mss <n:500-1460>', function (v, neg, k, line) {
    var s = this;
    var out = eachIf(this, function (i) { if (kindOf(s, i) === 'l2') return invalidMarker(s, line, 'tcp'); i.adjustMss = neg ? null : v[0]; });
    S.touch(this.state);
    return out;
  });
  def('if', 'ip tcp adjust-mss', function () { var r = eachIf(this, function (i) { i.adjustMss = null; }); S.touch(this.state); return r; }, { noOnly: true });
  def('if', 'ip mtu <n:68-1500>', function (v, neg, k, line) { var s = this; return eachIf(this, function (i) { if (kindOf(s, i) === 'l2') return invalidMarker(s, line, 'mtu'); i.mtu = neg ? null : v[0]; }); });
  def('if', 'ip mtu', function () { return eachIf(this, function (i) { i.mtu = null; }); }, { noOnly: true });
  showDef('crypto isakmp sa', rtOnly(function () { return SH.cryptoIsakmpSa(this.state, this.dev); }));
  showDef('crypto isakmp policy', rtOnly(function () { return SH.cryptoIsakmpPolicy(this.state, this.dev); }));
  showDef('crypto ipsec sa', rtOnly(function () { return SH.cryptoIpsecSa(this.state, this.dev); }));
  showDef('crypto map', rtOnly(function () { return SH.cryptoMapShow(this.state, this.dev); }));
  showDef('crypto session', rtOnly(function () { return SH.cryptoSession(this.state, this.dev); }));
  showDef('crypto ipsec transform-set', rtOnly(function () {
    var cr = this.dev.config.crypto;
    if (!cr) return '';
    return Object.keys(cr.transformSets).map(function (n) {
      var t = cr.transformSets[n];
      return 'Transform set default/' + n + ': { ' + t.transforms.join(' ') + ' }\n   will negotiate = { ' + (t.mode === 'transport' ? 'Transport' : 'Tunnel') + ',  },\n';
    }).join('\n');
  }));
  def('exec', 'clear crypto sa', function () { S.clearCrypto(this.state, this.dev.id); return ''; });
  def('exec', 'clear crypto isakmp', function () { S.clearCrypto(this.state, this.dev.id); return ''; });
  def('exec', 'clear crypto session', function () { S.clearCrypto(this.state, this.dev.id); return ''; });

  // Användarläget får inte konfigurera men ska känna igen show-grenen
  Session.TRIES = TRIES;
  Session.parseAce = parseAce;
  return Session;
})();
