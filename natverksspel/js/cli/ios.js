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
    // alias exec: ett eget kortkommando byts mot det riktiga kommandot
    var al = this.dev.config.aliases;
    if (al && (this.mode === 'exec' || this.mode === 'user') && toks.length && al[toks[0].t] && !this.inAlias) {
      this.inAlias = true;
      try { return this.exec(al[toks[0].t] + line.slice(toks[0].pos + toks[0].t.length), pipe); } finally { this.inAlias = false; }
    }
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
        if (NV.suggestCmd) {
          var sg = NV.suggestCmd(w0, Object.keys(root.kw).filter(function (k) { return k.length > 2; }));
          if (sg) return result(this.errAt(line, 0, toks) + '💡 Menade du ' + sg + '?');
        }
        var dom = this.dev.config.domainLookup;
        var ns = this.dev.config.nameServers[0] || '255.255.255.255';
        var word = ptoks[0].t;
        if (dom) return result('Translating "' + word + '"...domain server (' + ns + ')\n% Unknown command or computer name, or unable to find computer address', { delay: 2500 });
        return result('% Unknown command or computer name, or unable to find computer address');
      }
      var bad = ptoks[pr.pos] ? ptoks[pr.pos].t.toLowerCase() : '';
      if (bad && NV.suggestCmd && pr.pos === 0) {
        var sg2 = NV.suggestCmd(bad, Object.keys(root.kw).filter(function (k) { return k.length > 2; }));
        if (sg2) return result(this.errAt(line, pr.pos + start, toks) + '💡 Menade du ' + sg2 + '?');
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
      var types = ['GigabitEthernet', 'Vlan', 'Loopback'].filter(function (t) { return t.toLowerCase().indexOf(last) === 0; });
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
    if (this.via !== 'console' && !c.enableSecret && !c.enablePassword) return '% No password set\n💡 Över SSH behöver kontot privilege 15 (username <namn> privilege 15 secret <lösenord>) eller så måste ett enable secret vara satt.';
    if (!c.enableSecret && !c.enablePassword) { this.mode = 'exec'; return ''; }
    var tries = 0;
    var self = this;
    function ask() {
      self.pending = {
        prompt: 'Password: ', secret: true, fn: function (pw) {
          if (c.enablePlain != null && pw === c.enablePlain) { this.mode = 'exec'; return result(''); }
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
    if (!st) return '%Error opening nvram:/startup-config (No such file or directory)';
    this.dev.config = U.clone(st);
    var bytes = SH.runningConfig(this.state, this.dev).length;
    return 'Destination filename [running-config]? \n' + bytes + ' bytes copied in 0.520 secs (' + Math.round(bytes / 0.52) + ' bytes/sec)';
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
    // Konfigurationsregistret gäller vid nästa start även om det inte sparats (det ligger i NVRAM)
    var reg = d.config.confRegNext || d.config.confReg || null;
    // Utan sparad konfiguration startar enheten med fabriksinställningar.
    // Med registret 0x2142 hoppar enheten över startup-config (så går lösenordsåterställning till)
    d.config = d.startup && reg !== '0x2142' ? U.clone(d.startup) : NV.model.factoryConfig(d);
    if (reg) { d.config.confReg = reg; delete d.config.confRegNext; }
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
    if (!neg && (!/^[A-Za-z][A-Za-z0-9-]*$/.test(v[0]) || /-$/.test(v[0]) || v[0].length > 63)) return '% Hostname contains one or more illegal characters.';
    cfg(this).hostname = neg ? (isRouter(this) ? 'Router' : 'Switch') : v[0];
    return '';
  });
  def('config', 'hostname', function () { cfg(this).hostname = isRouter(this) ? 'Router' : 'Switch'; return ''; }, { noOnly: true });
  function setSecret(v, neg) {
    var c = cfg(this);
    if (neg) { c.enableSecret = null; c.enablePlain = null; return ''; }
    var pw = v[v.length - 1];
    if (c.minPwLen && pw.length < c.minPwLen) return '% Password too short - must be at least ' + c.minPwLen + ' characters. Password configuration failed';
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
    if (c.minPwLen && pw.length < c.minPwLen) return '% Password too short - must be at least ' + c.minPwLen + ' characters. Password configuration failed';
    c.users[name] = { priv: priv, secret: SH.hashSecret(pw), plain: pw };
    if (kws.indexOf('password') >= 0) c.users[name].pwType = 'password';
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
    var net = v[0], mask = v[1], nh = v[2], ad = v[3] || 1;
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
    var same = c.routes.filter(function (r) { return r.net === net && r.mask === mask && (r.nh === nh || (viaIf && r.iface === viaIf)); })[0];
    if (same) { if (ad !== 1) same.ad = ad; else delete same.ad; S.touch(this.state); return ''; }
    var nr = viaIf ? { net: net, mask: mask, iface: viaIf } : { net: net, mask: mask, nh: nh };
    if (ad !== 1) nr.ad = ad;
    c.routes.push(nr);
    return '';
  }
  def('config', 'ip route <ip> <mask> <word>', ipRoute);
  def('config', 'ip route <ip> <mask> <word> <n:1-255>', ipRoute);
  def('config', 'ip route <ip> <mask> <if> <n:1-255>', function (v, neg) { return ipRoute.call(this, v, neg); });
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
      var opw = (t[i] || '').toLowerCase();
      if (['eq', 'neq', 'gt', 'lt', 'range'].indexOf(opw) >= 0) {
        var PN = { ssh: 22, telnet: 23, www: 80, http: 80, domain: 53, https: 443, ntp: 123, smtp: 25, ftp: 21, 'ftp-data': 20, pop3: 110, bootps: 67, bootpc: 68, snmp: 161, syslog: 514, tftp: 69, isakmp: 500 };
        var pn = PN[(t[i + 1] || '').toLowerCase()] || parseInt(t[i + 1], 10);
        if (!pn || pn > 65535) return { err: i + 1 };
        r.dport = pn; r.dop = opw; i += 2;
        if (opw === 'range') {
          var pn2 = PN[(t[i] || '').toLowerCase()] || parseInt(t[i], 10);
          if (!pn2 || pn2 < pn || pn2 > 65535) return { err: i };
          r.dport2 = pn2; i++;
        }
        if (opw === 'eq') delete r.dop;
      }
    }
    while (i < t.length && ['log', 'log-input'].indexOf(t[i].toLowerCase()) >= 0) { r.log = true; i++; }
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
      if (/^Loopback/.test(n) && c.ifaces[n]) { delete c.ifaces[n]; S.touch(this.state); return ''; }
      return invalidMarker(this, line, line.trim().split(/\s+/).slice(2).join(' ') || 'interface');
    }
    if (!c.ifaces[n]) {
      if (sub && isRouter(this) && c.ifaces[n.split('.')[0]]) {
        c.ifaces[n] = { parent: n.split('.')[0], encap: null, ip: null, shutdown: false, natDir: null, aclIn: null, aclOut: null, description: '' };
      } else if (/^Loopback(\d+)$/.test(n) && parseInt(n.slice(8), 10) <= 2147483647) {
        c.ifaces[n] = { loop: true, shutdown: false, ip: null, description: '', natDir: null, aclIn: null, aclOut: null };
        S.touch(this.state);
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

  function kindOf(s, i) { return i.parent ? 'sub' : (i.svi ? 'svi' : (i.loop ? 'l3' : (isSwitch(s) ? 'l2' : 'l3'))); }
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

  // ================================================================== Fler kommandon (version 6.1)
  // Kommandon som ofta används i CCNA-kurser. De som påverkar simuleringen gör det på riktigt
  // (access-class, privilege level, flytande statiska rutter, cdp/lldp, root primary, banner,
  // erase, ssh/telnet från enheten). Övriga sparas i konfigurationen och syns i show running-config.
  function lpad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function rpad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function gx(c) { return c.x || (c.x = {}); }
  // Spara en rad i konfigurationen. kind 'on' = standard är på (bara no-formen syns), annars syns kommandot.
  function keepG(key, text, def) {
    return function (v, neg, kws, line) {
      var X = gx(cfg(this));
      if (def === 'on') { if (neg) X[key] = 'no ' + text(v); else delete X[key]; }
      else if (neg) delete X[key]; else X[key] = text(v, line);
      return '';
    };
  }
  function keepIf(key, text, def) {
    return function (v, neg) {
      return eachIf(this, function (i) {
        var X = i.x || (i.x = {});
        if (def === 'on') { if (neg) X[key] = 'no ' + text(v); else delete X[key]; }
        else if (neg) delete X[key]; else X[key] = text(v);
      });
    };
  }
  function keepLine(key, text) {
    return function (v, neg) { eachLine(this, function (l) { var X = l.x || (l.x = {}); if (neg) delete X[key]; else X[key] = text(v); }); return ''; };
  }
  function lit(s) { return function () { return s; }; }
  function rest(line, word) { var i = line.toLowerCase().indexOf(word.toLowerCase()); return i < 0 ? '' : line.slice(i + word.length).trim(); }

  // ---------- banner motd / login / exec (med avgränsningstecken, även på flera rader)
  ['motd', 'login', 'exec'].forEach(function (kind) {
    def('config', 'banner ' + kind + ' <text>', function (v, neg, kws, line) {
      var c = cfg(this);
      c.banners = c.banners || {};
      if (neg) { delete c.banners[kind]; return ''; }
      var txt = rest(line, kind);
      var delim = txt[0], body = txt.slice(1);
      var end = body.indexOf(delim);
      if (end >= 0) { c.banners[kind] = { d: delim, text: body.slice(0, end) }; return ''; }
      var lines = [body], self = this;
      function more() {
        self.pending = { prompt: '', fn: function (l) {
          var e = l.indexOf(delim);
          if (e >= 0) { lines.push(l.slice(0, e)); c.banners[kind] = { d: delim, text: lines.join('\n').replace(/^\n/, '') }; return result(''); }
          lines.push(l); more(); return result('');
        } };
      }
      more();
      return 'Enter TEXT message.  End with the character \'' + delim + '\'.';
    });
    def('config', 'banner ' + kind, function () { var c = cfg(this); if (c.banners) delete c.banners[kind]; return ''; }, { noOnly: true });
  });

  // ---------- Lösenord och inloggning
  def('config', 'security passwords min-length <n:0-16>', function (v, neg) { cfg(this).minPwLen = neg ? 0 : v[0]; return ''; });
  def('config', 'login block-for <n:1-65535> attempts <n:1-65535> within <n:1-65535>', keepG('login block-for', function (v) { return 'login block-for ' + v[0] + ' attempts ' + v[1] + ' within ' + v[2]; }));
  def('config', 'login on-failure log', keepG('login on-failure', lit('login on-failure log')));
  def('config', 'login on-success log', keepG('login on-success', lit('login on-success log')));
  def('config', 'ip ssh time-out <n:1-120>', function (v, neg) { cfg(this).ssh.timeout = neg ? null : v[0]; return ''; });
  def('config', 'ip ssh authentication-retries <n:0-5>', function (v, neg) { cfg(this).ssh.retries = neg ? null : v[0]; return ''; });
  def('config', 'service password-encryption', function (v, neg) { cfg(this).pwEncrypt = !neg; return ''; });
  function userAlgo(v, neg, kws) {
    var c = cfg(this), name = v[0];
    if (neg) { delete c.users[name]; return ''; }
    var pw = v[v.length - 1];
    if (c.minPwLen && pw.length < c.minPwLen) return '% Password too short - must be at least ' + c.minPwLen + ' characters. Password configuration failed';
    var priv = kws.indexOf('privilege') >= 0 ? v[1] : 1;
    c.users[name] = { priv: priv, secret: SH.hashSecret(pw), plain: pw };
    return '';
  }
  def('config', 'username <word> algorithm-type <word> secret <word>', userAlgo);
  def('config', 'username <word> privilege <n:0-15> algorithm-type <word> secret <word>', userAlgo);

  // ---------- Linjer: access-class, privilege level och mer
  def('line', 'access-class <word> in', function (v, neg) { eachLine(this, function (l) { l.accessClass = neg ? null : v[0]; }); return ''; });
  def('line', 'access-class <word> out', keepLine('access-class out', function (v) { return 'access-class ' + v[0] + ' out'; }));
  def('line', 'privilege level <n:0-15>', function (v, neg) { eachLine(this, function (l) { l.privLevel = neg ? null : v[0]; }); return ''; });
  def('line', 'transport output <text>', function (v, neg, k, line) { var t = rest(line, 'output'); eachLine(this, function (l) { var X = l.x || (l.x = {}); if (neg) delete X.tout; else X.tout = 'transport output ' + t; }); return ''; });
  def('line', 'history size <n:0-256>', keepLine('history', function (v) { return 'history size ' + v[0]; }));
  def('line', 'session-timeout <n:0-35791>', keepLine('session-timeout', function (v) { return 'session-timeout ' + v[0]; }));
  def('line', 'length <n:0-512>', keepLine('length', function (v) { return 'length ' + v[0]; }));
  def('line', 'width <n:0-512>', keepLine('width', function (v) { return 'width ' + v[0]; }));
  def('line', 'exec', function (v, neg) { eachLine(this, function (l) { var X = l.x || (l.x = {}); if (neg) X.exec = 'no exec'; else delete X.exec; }); return ''; });
  def('line', 'motd-banner', function (v, neg) { eachLine(this, function (l) { var X = l.x || (l.x = {}); if (neg) X.motd = 'no motd-banner'; else delete X.motd; }); return ''; });

  // ---------- VTP, spanning tree, CDP och LLDP
  function vtp(c) { return c.vtp || (c.vtp = { mode: 'server', domain: '', version: 1, password: null }); }
  def('config', 'vtp mode <word>', swOnly(function (v, neg, k, line) {
    var m = ['server', 'client', 'transparent', 'off'].filter(function (x) { return x.indexOf(v[0].toLowerCase()) === 0; })[0];
    if (!m) return invalidMarker(this, line, v[0]);
    vtp(cfg(this)).mode = neg ? 'server' : m;
    return neg ? '' : 'Setting device to VTP ' + m.toUpperCase() + ' mode' + (m === 'off' ? '.' : ' for VLANS.');
  }));
  def('config', 'vtp domain <word>', swOnly(function (v) { var t = vtp(cfg(this)); var old = t.domain; t.domain = v[0]; return old === v[0] ? 'Domain name already set to ' + v[0] + '.' : 'Changing VTP domain name from ' + (old || 'NULL') + ' to ' + v[0]; }));
  def('config', 'vtp version <n:1-3>', swOnly(function (v, neg) { vtp(cfg(this)).version = neg ? 1 : v[0]; return ''; }));
  def('config', 'vtp password <word>', swOnly(function (v, neg) { vtp(cfg(this)).password = neg ? null : v[0]; return neg ? 'Clearing device VTP password.' : 'Setting device VTP password to ' + v[0]; }));
  def('config', 'spanning-tree vlan <vlist> root primary', swOnly(function (v, neg) { var c = cfg(this); v[0].forEach(function (x) { if (neg) delete c.stpPriority[x]; else c.stpPriority[x] = 24576; }); S.touch(this.state); return ''; }));
  def('config', 'spanning-tree vlan <vlist> root secondary', swOnly(function (v, neg) { var c = cfg(this); v[0].forEach(function (x) { if (neg) delete c.stpPriority[x]; else c.stpPriority[x] = 28672; }); S.touch(this.state); return ''; }));
  def('config', 'spanning-tree portfast default', swOnly(keepG('stp pf default', lit('spanning-tree portfast default'))));
  def('config', 'spanning-tree portfast edge default', swOnly(keepG('stp pf default', lit('spanning-tree portfast edge default'))));
  def('config', 'spanning-tree portfast bpduguard default', swOnly(keepG('stp bpdu default', lit('spanning-tree portfast bpduguard default'))));
  def('config', 'spanning-tree portfast edge bpduguard default', swOnly(keepG('stp bpdu default', lit('spanning-tree portfast edge bpduguard default'))));
  def('config', 'spanning-tree loopguard default', swOnly(keepG('stp loopguard', lit('spanning-tree loopguard default'))));
  def('config', 'cdp run', function (v, neg) { cfg(this).cdpOff = !!neg; return ''; });
  def('config', 'lldp run', function (v, neg) { cfg(this).lldp = !neg; return ''; });
  def('config', 'cdp timer <n:5-254>', keepG('cdp timer', function (v) { return 'cdp timer ' + v[0]; }));
  def('config', 'cdp holdtime <n:10-255>', keepG('cdp holdtime', function (v) { return 'cdp holdtime ' + v[0]; }));

  // ---------- Loggning, NTP, klocka, SNMP och övrigt
  ['trap', 'console', 'monitor'].forEach(function (w) {
    def('config', 'logging ' + w + ' <word>', keepG('logging ' + w, function (v) { return 'logging ' + w + ' ' + v[0]; }));
  });
  def('config', 'logging console', function (v, neg) { var X = gx(cfg(this)); if (neg) X['logging console'] = 'no logging console'; else delete X['logging console']; return ''; });
  def('config', 'logging source-interface <if>', keepG('logging source', function (v) { return 'logging source-interface ' + v[0]; }));
  def('config', 'ntp update-calendar', keepG('ntp update-calendar', lit('ntp update-calendar')));
  def('config', 'ntp master', keepG('ntp master', lit('ntp master')));
  def('config', 'ntp master <n:1-15>', keepG('ntp master', function (v) { return 'ntp master ' + v[0]; }));
  def('config', 'clock summer-time <word> recurring', keepG('clock summer-time', function (v) { return 'clock summer-time ' + v[0] + ' recurring'; }));
  def('config', 'clock summer-time <word> recurring <text>', function (v, neg, k, line) { var X = gx(cfg(this)); if (neg) delete X['clock summer-time']; else X['clock summer-time'] = 'clock summer-time ' + v[0] + ' recurring ' + rest(line, 'recurring'); return ''; });
  def('config', 'snmp-server community <word> <word>', function (v, neg, k, line) {
    var c = cfg(this); c.snmp = c.snmp || { communities: {} };
    var acc = v[1].toUpperCase();
    if (acc !== 'RO' && acc !== 'RW') return invalidMarker(this, line, v[1]);
    if (neg) delete c.snmp.communities[v[0]]; else c.snmp.communities[v[0]] = acc;
    return '';
  });
  def('config', 'snmp-server community <word>', function (v, neg) { var c = cfg(this); c.snmp = c.snmp || { communities: {} }; if (neg) delete c.snmp.communities[v[0]]; else c.snmp.communities[v[0]] = 'RO'; return ''; });
  def('config', 'snmp-server location <text>', function (v, neg, k, line) { var c = cfg(this); c.snmp = c.snmp || { communities: {} }; c.snmp.location = neg ? null : rest(line, 'location'); return ''; });
  def('config', 'snmp-server contact <text>', function (v, neg, k, line) { var c = cfg(this); c.snmp = c.snmp || { communities: {} }; c.snmp.contact = neg ? null : rest(line, 'contact'); return ''; });
  def('config', 'ipv6 unicast-routing', keepG('ipv6 unicast-routing', lit('ipv6 unicast-routing')));
  def('config', 'errdisable recovery interval <n:30-86400>', keepG('errdisable interval', function (v) { return 'errdisable recovery interval ' + v[0]; }));
  def('config', 'errdisable recovery cause <word>', function (v, neg) {
    var c = cfg(this);
    if (/^psec/.test(v[0])) { c.errRecovery = !neg; return ''; }
    var X = gx(c), k = 'errdisable cause ' + v[0];
    if (neg) delete X[k]; else X[k] = 'errdisable recovery cause ' + v[0];
    return '';
  });
  def('config', 'mac address-table static <word> vlan <n:1-4094> interface <if>', swOnly(keepG('mac static', function (v) { return 'mac address-table static ' + v[0] + ' vlan ' + v[1] + ' interface ' + v[2]; })));
  def('config', 'mac address-table aging-time <n:0-1000000>', swOnly(keepG('mac aging', function (v) { return 'mac address-table aging-time ' + v[0]; })));
  def('config', 'port-channel load-balance <word>', swOnly(keepG('pc lb', function (v) { return 'port-channel load-balance ' + v[0]; })));
  def('config', 'ip dhcp snooping', swOnly(keepG('dhcp snooping', lit('ip dhcp snooping'))));
  def('config', 'ip dhcp snooping vlan <vlist>', swOnly(keepG('dhcp snooping vlan', function (v) { return 'ip dhcp snooping vlan ' + U.vlanListStr(v[0]); })));
  def('config', 'ip dhcp snooping information option', swOnly(keepG('dhcp snooping opt82', lit('ip dhcp snooping information option'), 'on')));
  def('config', 'ip arp inspection vlan <vlist>', swOnly(keepG('dai', function (v) { return 'ip arp inspection vlan ' + U.vlanListStr(v[0]); })));
  def('config', 'ip domain lookup source-interface <if>', keepG('dns src', function (v) { return 'ip domain lookup source-interface ' + v[0]; }));
  def('config', 'ip tftp source-interface <if>', keepG('tftp src', function (v) { return 'ip tftp source-interface ' + v[0]; }));
  def('config', 'ip classless', function () { return ''; });
  def('config', 'ip subnet-zero', function () { return ''; });
  def('config', 'ip source-route', keepG('ip source-route', lit('ip source-route'), 'on'));
  def('config', 'ip forward-protocol nd', function () { return ''; });

  // ---------- Interface
  def('if', 'switchport voice vlan <n:1-4094>', function (v, neg) { var s = this; return eachIf(this, function (i) { if (kindOf(s, i) !== 'l2') return '% Invalid input detected at \'^\' marker.'; i.voiceVlan = neg ? null : v[0]; }); });
  def('if', 'spanning-tree portfast edge', function (v, neg) { return eachIf(this, function (i) { i.portfast = !neg; }); });
  def('if', 'spanning-tree bpduguard enable', keepIf('bpduguard', lit('spanning-tree bpduguard enable')));
  def('if', 'spanning-tree bpduguard disable', keepIf('bpduguard', lit('spanning-tree bpduguard disable')));
  def('if', 'spanning-tree bpdufilter enable', keepIf('bpdufilter', lit('spanning-tree bpdufilter enable')));
  def('if', 'spanning-tree guard <word>', keepIf('guard', function (v) { return 'spanning-tree guard ' + v[0]; }));
  def('if', 'spanning-tree cost <n:1-200000000>', keepIf('stp cost', function (v) { return 'spanning-tree cost ' + v[0]; }));
  def('if', 'spanning-tree port-priority <n:0-240>', keepIf('stp prio', function (v) { return 'spanning-tree port-priority ' + v[0]; }));
  def('if', 'spanning-tree link-type <word>', keepIf('stp link', function (v) { return 'spanning-tree link-type ' + v[0]; }));
  def('if', 'channel-group <n:1-48> mode <word>', function (v, neg, k, line) {
    var m = ['active', 'passive', 'on', 'desirable', 'auto'].filter(function (x) { return x.indexOf(v[1].toLowerCase()) === 0; })[0];
    if (!m) return invalidMarker(this, line, v[1]);
    var s = this, made = false;
    var out = eachIf(this, function (i) { if (neg) { i.chGroup = null; return; } if (!made && !Object.keys(cfg(s).ifaces).some(function (n) { var q = cfg(s).ifaces[n]; return q.chGroup && q.chGroup.n === v[0]; })) made = true; i.chGroup = { n: v[0], mode: m }; });
    return (made ? 'Creating a port-channel interface Port-channel ' + v[0] + '\n' : '') + out;
  });
  def('if', 'channel-group', function () { return eachIf(this, function (i) { i.chGroup = null; }); }, { noOnly: true });
  ['broadcast', 'multicast', 'unicast'].forEach(function (t) {
    def('if', 'storm-control ' + t + ' level <text>', function (v, neg, k, line) { var lv = rest(line, 'level'); return eachIf(this, function (i) { var X = i.x || (i.x = {}); if (neg) delete X['storm ' + t]; else X['storm ' + t] = 'storm-control ' + t + ' level ' + lv; }); });
  });
  def('if', 'storm-control action <word>', keepIf('storm action', function (v) { return 'storm-control action ' + v[0]; }));
  def('if', 'ip dhcp snooping trust', keepIf('snoop trust', lit('ip dhcp snooping trust')));
  def('if', 'ip dhcp snooping limit rate <n:1-2048>', keepIf('snoop rate', function (v) { return 'ip dhcp snooping limit rate ' + v[0]; }));
  def('if', 'ip arp inspection trust', keepIf('dai trust', lit('ip arp inspection trust')));
  def('if', 'switchport port-security aging time <n:0-1440>', keepIf('ps aging', function (v) { return 'switchport port-security aging time ' + v[0]; }));
  def('if', 'switchport port-security aging type <word>', keepIf('ps agetype', function (v) { return 'switchport port-security aging type ' + v[0]; }));
  def('if', 'switchport port-security mac-address <word>', function (v, neg, k, line) {
    if (/^sticky$/i.test(v[0])) return '';
    return eachIf(this, function (i) { var X = i.x || (i.x = {}); var key = 'ps mac ' + v[0]; if (neg) delete X[key]; else X[key] = 'switchport port-security mac-address ' + v[0]; });
  });
  def('if', 'mdix auto', keepIf('mdix', lit('mdix auto'), 'on'));
  def('if', 'load-interval <n:30-600>', keepIf('load', function (v) { return 'load-interval ' + v[0]; }));
  def('if', 'udld port', keepIf('udld', lit('udld port')));
  def('if', 'udld port aggressive', keepIf('udld', lit('udld port aggressive')));
  def('if', 'bandwidth <n:1-10000000>', keepIf('bw', function (v) { return 'bandwidth ' + v[0]; }));
  def('if', 'delay <n:1-16777215>', keepIf('delay', function (v) { return 'delay ' + v[0]; }));
  def('if', 'mtu <n:64-9216>', keepIf('mtu', function (v) { return 'mtu ' + v[0]; }));
  def('if', 'keepalive', keepIf('keepalive', lit('keepalive'), 'on'));
  def('if', 'keepalive <n:0-32767>', keepIf('keepalive', function (v) { return 'keepalive ' + v[0]; }));
  def('if', 'ip redirects', keepIf('redirects', lit('ip redirects'), 'on'));
  def('if', 'ip unreachables', keepIf('unreach', lit('ip unreachables'), 'on'));
  def('if', 'ip proxy-arp', keepIf('proxyarp', lit('ip proxy-arp'), 'on'));
  def('if', 'ip virtual-reassembly', keepIf('vreasm', lit('ip virtual-reassembly')));
  def('if', 'ip virtual-reassembly in', keepIf('vreasm', lit('ip virtual-reassembly in')));
  def('if', 'ip ospf cost <n:1-65535>', keepIf('ospf cost', function (v) { return 'ip ospf cost ' + v[0]; }));
  def('if', 'media-type <word>', keepIf('media', function (v) { return 'media-type ' + v[0]; }));
  def('if', 'ipv6 address <word>', keepIf('ipv6 ' , function (v) { return 'ipv6 address ' + v[0]; }));
  def('if', 'ipv6 enable', keepIf('ipv6 en', lit('ipv6 enable')));
  def('if', 'standby <n:0-255> ip <ip>', function (v, neg) { return eachIf(this, function (i) { i.hsrp = i.hsrp || { grp: v[0], pri: 100, preempt: false }; if (neg) i.hsrp = null; else { i.hsrp.grp = v[0]; i.hsrp.ip = v[1]; } }); });
  def('if', 'standby <n:0-255> priority <n:0-255>', function (v, neg) { return eachIf(this, function (i) { if (!i.hsrp) i.hsrp = { grp: v[0], pri: 100, preempt: false }; i.hsrp.pri = neg ? 100 : v[1]; }); });
  def('if', 'standby <n:0-255> preempt', function (v, neg) { return eachIf(this, function (i) { if (!i.hsrp) i.hsrp = { grp: v[0], pri: 100, preempt: false }; i.hsrp.preempt = !neg; }); });

  // ---------- Exec: debug
  var DEBUGS = {
    'ip packet': 'IP packet debugging is on', 'ip icmp': 'ICMP packet debugging is on', 'ip nat': 'IP NAT debugging is on',
    'ip dhcp server events': 'DHCP server event debugging is on.', 'ip dhcp server packet': 'DHCP server packet debugging is on.',
    'spanning-tree events': 'Spanning Tree event debugging is on', 'crypto isakmp': 'Crypto ISAKMP debugging is on', 'crypto ipsec': 'Crypto IPSEC debugging is on',
    'ip ssh': 'Incoming ssh debugging is on', 'cdp packets': 'CDP packet info debugging is on', 'ip routing': 'IP routing debugging is on',
  };
  function dbg(s) { return s.dev.rt.debug || (s.dev.rt.debug = {}); }
  Object.keys(DEBUGS).forEach(function (k) {
    def('exec', 'debug ' + k, function () { dbg(this)[k] = true; return DEBUGS[k]; });
    def('exec', 'undebug ' + k, function () { delete dbg(this)[k]; return DEBUGS[k].replace(' is on', ' is off'); });
    def('exec', 'no debug ' + k, function () { delete dbg(this)[k]; return DEBUGS[k].replace(' is on', ' is off'); });
  });
  function allOff() { this.dev.rt.debug = {}; return 'All possible debugging has been turned off'; }
  def('exec', 'undebug all', allOff);
  def('exec', 'no debug all', allOff);
  def('exec', 'debug all', function () { return 'This may severely impact network performance. Continue? (yes/[no]): \n% Nej – inte på en produktionsenhet mitt på dagen.'; });
  showDef('debugging', function () {
    var on = Object.keys(dbg(this));
    if (!on.length) return '';
    var groups = {};
    on.forEach(function (k) { var g = k.split(' ')[0].toUpperCase(); (groups[g] = groups[g] || []).push('  ' + DEBUGS[k]); });
    return Object.keys(groups).map(function (g) { return (g === 'IP' ? 'Generic IP' : g) + ':\n' + groups[g].join('\n'); }).join('\n');
  });

  // ---------- Exec: klocka, radera, ladda om senare, kopiera till TFTP
  def('exec', 'clock set <word> <n:1-31> <word> <n:1993-2035>', function (v, neg, k, line) {
    var m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(v[0]);
    var mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(v[2].slice(0, 3).toLowerCase());
    if (!m) return invalidMarker(this, line, v[0]);
    if (mon < 0) return invalidMarker(this, line, v[2]);
    this.dev.rt.clockSet = { ms: Date.UTC(v[3], mon, v[1], +m[1], +m[2], +m[3]), at: this.state.time };
    return '';
  });
  def('exec', 'clock set <word> <word> <n:1-31> <n:1993-2035>', function (v, neg, k, line) {
    var m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(v[0]);
    var mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(v[1].slice(0, 3).toLowerCase());
    if (!m) return invalidMarker(this, line, v[0]);
    if (mon < 0) return invalidMarker(this, line, v[1]);
    this.dev.rt.clockSet = { ms: Date.UTC(v[3], mon, v[2], +m[1], +m[2], +m[3]), at: this.state.time };
    return '';
  });
  function eraseStartup() {
    var self = this;
    this.pending = { prompt: 'Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]', fn: function (a) {
      if (a && !/^y/i.test(a)) return result('');
      self.dev.startup = null;
      return result('[OK]\nErase of nvram: complete', { delay: 600 });
    } };
    return '';
  }
  def('exec', 'erase startup-config', eraseStartup);
  def('exec', 'erase nvram:', eraseStartup);
  def('exec', 'write erase', eraseStartup);
  def('exec', 'delete flash:vlan.dat', swOnly(function () {
    var self = this;
    this.pending = { prompt: 'Delete filename [vlan.dat]? ', fn: function () {
      self.pending = { prompt: 'Delete flash:/vlan.dat? [confirm]', fn: function (a) { if (a && !/^y/i.test(a)) return result(''); self.dev.rt.vlanDatDeleted = true; return result(''); } };
      return result('');
    } };
    return '';
  }));
  def('exec', 'reload in <n:1-1440>', function (v) {
    var self = this;
    this.pending = { prompt: 'Proceed with reload? [confirm]', fn: function (a) {
      if (a && !/^y/i.test(a)) return result('');
      self.dev.rt.reloadAt = self.state.time + v[0] * 60;
      return result('Reload scheduled in ' + v[0] + ' minutes by console\nReload reason: Reload Command');
    } };
    return '';
  });
  def('exec', 'reload cancel', function () {
    if (!this.dev.rt.reloadAt) return '%No reload is scheduled.';
    this.dev.rt.reloadAt = null;
    return '\n\n***\n*** --- SHUTDOWN ABORTED ---\n***';
  });
  showDef('reload', function () {
    var at = this.dev.rt.reloadAt;
    if (!at) return 'No reload is scheduled.';
    var left = Math.max(0, Math.round((at - this.state.time) / 60));
    return 'Reload scheduled in ' + left + ' minutes by console\nReload reason: Reload Command';
  });
  function tftpCopy(what) {
    return function () {
      var self = this, host = null;
      var file = this.dev.config.hostname.toLowerCase() + '-confg';
      this.pending = { prompt: 'Address or name of remote host []? ', fn: function (a) {
        host = a;
        if (!host) return result('%Error parsing filename (Bad IP address or host name)');
        self.pending = { prompt: 'Destination filename [' + file + ']? ', fn: function (f) {
          var ip = U.isIp(host) ? host : (self.dev.config.hosts[host.toLowerCase()] || null);
          if (!ip) return result('%Error parsing filename (Bad IP address or host name)');
          var p = S.ping(self.state, self.dev.id, ip);
          if (!p.ok) return result('.....\n%Error opening tftp://' + ip + '/' + (f || file) + ' (Timed out)', { delay: 2500 });
          var bytes = SH.runningConfig(self.state, self.dev).length;
          return result('!!\n' + bytes + ' bytes copied in 1.084 secs (' + Math.round(bytes / 1.084) + ' bytes/sec)', { delay: 900 });
        } };
        return result('');
      } };
      return '';
    };
  }
  def('exec', 'copy running-config tftp:', tftpCopy('running'));
  def('exec', 'copy running-config tftp', tftpCopy('running'));
  def('exec', 'copy startup-config tftp:', tftpCopy('startup'));

  // ---------- Exec: ssh och telnet från routern eller switchen
  function remoteLogin(s, host, user, proto) {
    var ip = U.isIp(host) ? host : (s.dev.config.hosts[host.toLowerCase()] || null);
    if (!ip) return result('% Unknown command or computer name, or unable to find computer address');
    var port = proto === 'ssh' ? 22 : 23;
    var p = S.ping(s.state, s.dev.id, ip, { proto: 'tcp', dport: port });
    var head = proto === 'telnet' ? 'Trying ' + ip + ' ... ' : '';
    if (!p.ok) return result(head + (p.reason === 'refused' ? '\n% Connection refused by remote host' : '\n% Connection timed out; remote host not responding'), { delay: p.reason === 'refused' ? 300 : 3000 });
    var tgt = null, D = S.get(s.state);
    Object.keys(D.eps).forEach(function (k) { var e = D.eps[k]; if (e.ip === ip && e.up && s.state.devices[e.dev].os === 'ios') tgt = e.dev; });
    tgt = tgt || p.at;
    var dev = s.state.devices[tgt];
    if (!dev || dev.os !== 'ios') return result(head + '\n% Connection refused by remote host');
    if (tgt === s.dev.id) return result(head + '\n% Connection refused by remote host');
    var c = dev.config, line = c.lines.vty0_4;
    if (line.accessClass) {
      var src = p.srcUsed || null;
      if (src && !S.aclEval(s.state, tgt, line.accessClass, { src: src, dst: ip, proto: 'tcp', dport: port })) return result(head + '\n% Connection refused by remote host', { delay: 300 });
    }
    if (!line.loginLocal && !line.password) return result(head + 'Open\n\nPassword required, but none set\n\n[Connection to ' + host + ' closed by foreign host]');
    var tries = 0;
    function askPw(u) {
      s.pending = { prompt: 'Password: ', secret: true, fn: function (pw) {
        var uu = c.users[u];
        var ok = line.loginLocal ? (uu && uu.plain === pw) : line.password === pw;
        if (!ok) {
          tries++;
          var tip = uu && uu.byGame ? '\n💡 Lösenordet för ' + u + ' är ' + uu.plain + ' (står på lappen vid laptopen).' : (uu ? '\n💡 Det är lösenordet som sattes med username ' + u + ' ... secret: ' + uu.plain : '');
          if (tries >= 3 || proto === 'telnet') return result('% ' + (proto === 'telnet' ? 'Login invalid' : 'Authentication failed.') + tip + (proto === 'telnet' ? '\n\n[Connection to ' + host + ' closed by foreign host]' : ''));
          askPw(u);
          return result('% Authentication failed.' + tip);
        }
        var priv = (uu && uu.priv === 15) || line.privLevel === 15;
        return result('', { push: { kind: 'ios', dev: tgt, via: proto, privileged: priv, user: u } });
      } };
    }
    if (proto === 'ssh') { askPw(user); return result(''); }
    if (!line.loginLocal) { askPw(null); return result(head + 'Open\n\n\nUser Access Verification\n'); }
    s.pending = { prompt: 'Username: ', fn: function (u) { askPw(u); return result(''); } };
    return result(head + 'Open\n\n\nUser Access Verification\n');
  }
  def('user exec', 'ssh -l <word> <iphost>', function (v) { return remoteLogin(this, v[1], v[0], 'ssh'); });
  def('user exec', 'ssh -v <n:1-2> -l <word> <iphost>', function (v) { return remoteLogin(this, v[2], v[1], 'ssh'); });
  def('user exec', 'telnet <iphost>', function (v) { return remoteLogin(this, v[0], null, 'telnet'); });
  def('user exec', 'connect <iphost>', function (v) { return remoteLogin(this, v[0], null, 'telnet'); });
  def('user exec', 'terminal width <n:0-512>', function () { return ''; });

  // ---------- Show-kommandon
  showDef('ip protocols', function () {
    if (!isRouter(this) && !cfg(this).ipRouting) return '';
    return '*** IP Routing is NSF aware ***\n';
  }, true);
  showDef('privilege', function () { return 'Current privilege level is ' + (this.mode === 'user' ? 1 : 15); }, true);
  showDef('sessions', function () { return '% No connections open'; }, true);
  showDef('terminal', function () {
    return 'Line 0, Location: "", Type: ""\nLength: 24 lines, Width: 80 columns\nBaud rate (TX/RX) is ' + ((cfg(this).lines.con.speed) || 9600) + '/' + ((cfg(this).lines.con.speed) || 9600) + ', no parity, 2 stopbits, 8 databits\nStatus: PSI Enabled, Ready, Active, No Exit Banner, Automore On\nCapabilities: none\nModem state: Ready\nSpecial Chars: Escape  Hold  Stop  Start  Disconnect  Activation\n                ^^x    none   -     -       none\nTimeouts:      Idle EXEC    Idle Session   Modem Answer  Session   Dispatch\n               00:10:00        never                        none     not set\nHistory is enabled, history size is 20.\nTransport protocol preferences: none';
  }, true);
  showDef('line', function () {
    var c = cfg(this), rows = ['   Tty Typ     Tx/Rx    A Modem  Roty AccO AccI   Uses   Noise  Overruns   Int'];
    rows.push('*    0 CTY              -    -      -    -    -      1       0     0/0       -');
    if (isRouter(this)) rows.push('     1 AUX   9600/9600  -    -      -    -    -      0       0     0/0       -');
    for (var n = 0; n <= 15; n++) {
      var l = n <= 4 ? c.lines.vty0_4 : c.lines.vty5_15;
      rows.push(rpad((isRouter(this) ? n + 2 : n + 1), 6) + ' VTY              -    -      -    -  ' + lpad(l.accessClass || '-', 4) + ' ' + rpad(n === 0 ? 3 : 0, 6) + '       0     0/0       -');
    }
    return rows.join('\n');
  }, true);
  showDef('hosts', function () {
    var c = cfg(this);
    var o = ['Default domain is ' + (c.domainName || 'not set'), 'Name/address lookup uses ' + (c.domainLookup ? 'domain service' : 'static mappings'), 'Name servers are ' + (c.nameServers.length ? c.nameServers.join(', ') : '255.255.255.255'), '',
      'Codes: UN - unknown, EX - expired, OK - OK, ?? - revalidate', '       temp - temporary, perm - permanent', '       NA - Not Applicable None - Not defined', '',
      'Host                      Port  Flags      Age Type   Address(es)'];
    Object.keys(c.hosts).forEach(function (h) { o.push(lpad(h, 26) + 'None  (perm, OK)  0   IP     ' + c.hosts[h]); });
    return o.join('\n');
  }, true);
  showDef('flash', function () { return flashList(this); }, true);
  showDef('flash:', function () { return flashList(this); }, true);
  def('user exec', 'dir', function () { return flashList(this, true); });
  def('user exec', 'dir flash:', function () { return flashList(this, true); });
  def('user exec', 'dir nvram:', function () {
    var st = this.dev.startup, len = st ? SH.runningConfig(this.state, this.dev, st).length : 0;
    return 'Directory of nvram:/\n\n  ' + (st ? '    1  -rw-' + rpad(len, 12) + '                    <no date>  startup-config' : '  No files in directory') + '\n\n524288 bytes total (' + (524288 - len) + ' bytes free)';
  });
  function flashList(s, dirStyle) {
    var sw = isSwitch(s);
    var files = sw
      ? [['c3560-ipservicesk9-mz.122-55.SE12.bin', 16013384, 'Mar 1 1993 00:04:56 +00:00'], ['vlan.dat', 1916, 'Sep 29 2026 07:58:12 +02:00'], ['config.text', 3401, 'Sep 28 2026 16:22:40 +02:00'], ['private-config.text', 1245, 'Sep 28 2026 16:22:40 +02:00']]
      : [['c2900-universalk9-mz.SPA.152-4.M11.bin', 97794040, 'Jun 11 2019 14:38:40 +00:00'], ['pnp-tech-time', 3, 'Sep 28 2026 16:22:40 +02:00']];
    if (sw && s.dev.rt.vlanDatDeleted) files = files.filter(function (f) { return f[0] !== 'vlan.dat'; });
    var total = sw ? 32514048 : 255744000, used = files.reduce(function (a, f) { return a + f[1]; }, 0);
    var o = ['Directory of flash:/', ''];
    files.forEach(function (f, i) { o.push(rpad(i + 2, 6) + '  -rwx' + rpad(f[1], 11) + '  ' + f[2] + '  ' + f[0]); });
    o.push('');
    o.push(total + ' bytes total (' + (total - used) + ' bytes free)');
    return o.join('\n');
  }
  showDef('boot', swOnly(function () { return 'BOOT path-list      : flash:/c3560-ipservicesk9-mz.122-55.SE12.bin\nConfig file         : flash:/config.text\nPrivate Config file : flash:/private-config.text\nEnable Break        : no\nManual Boot         : no\nHELPER path-list    :\nAuto upgrade        : yes\nNVRAM/Config file\n      buffer size:   524288'; }), true);
  showDef('license', rtOnly(function () { return 'Index 1 Feature: ipbasek9\n        Period left: Life time\n        License Type: Permanent\n        License State: Active, In Use\n        License Count: Non-Counted\n        License Priority: Medium\nIndex 2 Feature: securityk9\n        Period left: Life time\n        License Type: Permanent\n        License State: Active, In Use\n        License Count: Non-Counted\n        License Priority: Medium\nIndex 3 Feature: datak9\n        Period left: Not Activated\n        Period Used: 0  minute  0  second\n        License Type: EvalRightToUse\n        License State: Not in Use, EULA not accepted\n        License Count: Non-Counted\n        License Priority: None'; }));
  showDef('env all', swOnly(function () { return 'FAN is OK\nTEMPERATURE is OK\nTemperature Value: 37 Degree Celsius\nTemperature State: GREEN\nYellow Threshold : 65 Degree Celsius\nRed Threshold    : 75 Degree Celsius\nPOWER is OK\nRPS is NOT PRESENT'; }));
  showDef('environment all', swOnly(function () { return 'FAN is OK\nTEMPERATURE is OK\nPOWER is OK\nRPS is NOT PRESENT'; }));
  showDef('processes memory', function () {
    return 'Processor Pool Total:  ' + (isRouter(this) ? '414285504 Used:   98714424 Free:  315571080' : '94363276 Used:   27163948 Free:   67199328') + '\n      I/O Pool Total:   ' + (isRouter(this) ? '75497472 Used:   21011032 Free:   54486440' : '8388608 Used:    3207548 Free:    5181060');
  }, true);
  showDef('vtp status', swOnly(function () {
    var t = vtp(cfg(this));
    var vl = Object.keys(cfg(this).vlans).length + 4;
    return 'VTP Version capable             : 1 to 3\nVTP version running             : ' + t.version + '\nVTP Domain Name                 : ' + t.domain + '\nVTP Pruning Mode                : Disabled\nVTP Traps Generation            : Disabled\nDevice ID                       : ' + U.macDots(this.dev.baseMac) + '\nConfiguration last modified by 0.0.0.0 at 3-1-93 00:02:11\n' + (t.mode === 'server' ? 'Local updater ID is 0.0.0.0 (no valid interface found)\n' : '') + '\nFeature VLAN:\n--------------\nVTP Operating Mode                : ' + t.mode.charAt(0).toUpperCase() + t.mode.slice(1) + '\nMaximum VLANs supported locally   : 1005\nNumber of existing VLANs          : ' + vl + '\nConfiguration Revision            : ' + (t.mode === 'transparent' || t.mode === 'off' ? 0 : 7) + '\nMD5 digest                        : 0x3F 0x37 0x45 0x9A 0x37 0x53 0xA6 0xDE\n                                    0xF9 0x1A 0x2B 0x5C 0x81 0x0E 0x4D 0x77';
  }), true);
  showDef('vtp password', swOnly(function () { var t = vtp(cfg(this)); return t.password ? 'VTP Password: ' + t.password : 'The VTP password is not configured.'; }));
  showDef('vlan summary', swOnly(function () {
    var n = Object.keys(cfg(this).vlans).length + 4;
    return 'Number of existing VLANs              : ' + n + '\nNumber of existing VTP VLANs          : ' + n + '\nNumber of existing extended VLANS     : 0';
  }), true);
  showDef('ip default-gateway', swOnly(function () { return cfg(this).defaultGateway || '0.0.0.0'; }), true);
  showDef('interfaces switchport', swOnly(function () {
    var self = this;
    return SH.physPorts(this.dev).map(function (n) { return SH.switchport(self.state, self.dev, n); }).join('\n\n');
  }), true);
  showDef('cdp', function () {
    if (cfg(this).cdpOff) return '% CDP is not enabled';
    return 'Global CDP information:\n\tSending CDP packets every 60 seconds\n\tSending a holdtime value of 180 seconds\n\tSending CDPv2 advertisements is  enabled';
  }, true);
  showDef('cdp interface', function () {
    if (cfg(this).cdpOff) return '% CDP is not enabled';
    var self = this, D = S.get(this.state);
    return Object.keys(cfg(this).ifaces).filter(function (n) { var p = D.ports[S.key(self.dev.id, n)]; return !!p; }).map(function (n) {
      var p = D.ports[S.key(self.dev.id, n)];
      return n + ' is ' + (p.up ? 'up' : 'down') + ', line protocol is ' + (p.up ? 'up' : 'down') + '\n  Encapsulation ARPA\n  Sending CDP packets every 60 seconds\n  Holdtime is 180 seconds';
    }).join('\n');
  }, true);
  showDef('lldp', function () { if (!cfg(this).lldp) return '% LLDP is not enabled'; return '\nGlobal LLDP Information:\n    Status: ACTIVE\n    LLDP advertisements are sent every 30 seconds\n    LLDP hold time advertised is 120 seconds\n    LLDP interface reinitialisation delay is 2 seconds'; }, true);
  showDef('lldp neighbors', function () {
    if (!cfg(this).lldp) return '% LLDP is not enabled';
    var self = this, D = S.get(this.state), rows = [];
    Object.keys(cfg(this).ifaces).forEach(function (n) {
      var p = D.ports[S.key(self.dev.id, n)];
      if (!p || !p.up) return;
      var peer = self.state.devices[p.peer.dev];
      if (!peer || peer.os !== 'ios' || !peer.config.lldp) return;
      rows.push(lpad(peer.config.hostname.slice(0, 20), 21) + lpad(U.shortIf(n), 16) + lpad('120', 11) + lpad(peer.kind === 'router' ? 'R' : 'B', 16) + U.shortIf(p.peer.port));
    });
    return 'Capability codes:\n    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device\n    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other\n\nDevice ID           Local Intf     Hold-time  Capability      Port ID\n' + rows.join('\n') + '\n\nTotal entries displayed: ' + rows.length;
  }, true);
  showDef('spanning-tree root', swOnly(function () {
    var self = this, D = S.get(this.state), c = cfg(this);
    var o = ['                                        Root    Hello Max Fwd', 'Vlan                   Root ID          Cost    Time  Age Dly  Root Port', '---------------- -------------------- --------- ----- --- ---  ------------'];
    Object.keys(c.vlans).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
      if (c.stpOff.indexOf(v) >= 0) return;
      var info = D.stp[self.dev.id] && D.stp[self.dev.id][v];
      var rootDev = info ? self.state.devices[info.root] : self.dev;
      var rb = S.bridgeId(rootDev, v);
      var isRoot = !info || info.isRoot;
      o.push(lpad('VLAN' + ('000' + v).slice(-4), 17) + lpad(rb.pr + ' ' + U.macDots(rootDev.baseMac), 21) + rpad(isRoot ? 0 : 4, 9) + rpad(2, 6) + rpad(20, 4) + rpad(15, 4) + '  ' + (isRoot ? '' : U.shortIf(info.rootPort)));
    });
    return o.join('\n');
  }), true);
  showDef('spanning-tree interface <if>', swOnly(function (v) {
    var n = v[0], short = U.shortIf(n), all = SH.spanningTree(this.state, this.dev), cur = null, rows = [];
    all.split('\n').forEach(function (l) {
      var m = /^VLAN(\d{4})$/.exec(l);
      if (m) { cur = 'VLAN' + m[1]; return; }
      if (cur && l.indexOf(short + ' ') === 0) rows.push(lpad(cur, 17) + l.slice(20));
    });
    if (!rows.length) return 'no spanning tree info available for ' + n;
    return 'Vlan             Role Sts Cost      Prio.Nbr Type\n---------------- ---- --- --------- -------- --------------------------------\n' + rows.join('\n');
  }), true);
  showDef('spanning-tree detail', swOnly(function () { return SH.spanningTree(this.state, this.dev); }), true);
  showDef('etherchannel summary', swOnly(function () {
    var self = this, D = S.get(this.state), c = cfg(this), groups = {};
    Object.keys(c.ifaces).forEach(function (n) { var i = c.ifaces[n]; if (i.chGroup) (groups[i.chGroup.n] = groups[i.chGroup.n] || []).push({ n: n, i: i }); });
    var o = ['Flags:  D - down        P - bundled in port-channel', '        I - stand-alone s - suspended', '        H - Hot-standby (LACP only)', '        R - Layer3      S - Layer2', '        U - in use      f - failed to allocate aggregator', '', '        M - not in use, minimum links not met', '        u - unsuitable for bundling', '        w - waiting to be aggregated', '        d - default port', '', '',
      'Number of channel-groups in use: ' + Object.keys(groups).length, 'Number of aggregators:           ' + Object.keys(groups).length, '', 'Group  Port-channel  Protocol    Ports', '------+-------------+-----------+-----------------------------------------------'];
    Object.keys(groups).sort(function (a, b) { return a - b; }).forEach(function (g) {
      var mem = groups[g], mode = mem[0].i.chGroup.mode;
      var proto = mode === 'active' || mode === 'passive' ? 'LACP' : (mode === 'on' ? '-' : 'PAgP');
      var anyUp = false;
      var ports = mem.map(function (m) {
        var p = D.ports[S.key(self.dev.id, m.n)];
        var peer = p && p.up ? self.state.devices[p.peer.dev] : null;
        var pi = peer && peer.config ? peer.config.ifaces[p.peer.port] : null;
        var ok = !!(p && p.up && pi && pi.chGroup && (mode === 'on' ? pi.chGroup.mode === 'on' : (pi.chGroup.mode !== 'on' && !(mode === 'passive' && pi.chGroup.mode === 'passive') && !(mode === 'auto' && pi.chGroup.mode === 'auto'))));
        if (ok) anyUp = true;
        return U.shortIf(m.n) + '(' + (!p || !p.up ? 'D' : (ok ? 'P' : (mode === 'on' ? 'D' : 'I'))) + ')';
      });
      o.push(lpad(g, 7) + lpad('Po' + g + '(S' + (anyUp ? 'U' : 'D') + ')', 14) + lpad(proto, 12) + ports.join(' '));
    });
    return o.join('\n');
  }), true);
  showDef('ip dhcp server statistics', rtOnly(function () {
    var n = (SH.dhcpBinding(this.state, this.dev).match(/Automatic/g) || []).length;
    return 'Memory usage         ' + (24000 + n * 312) + '\nAddress pools        ' + Object.keys(cfg(this).dhcpPools).length + '\nDatabase agents      0\nAutomatic bindings   ' + n + '\nManual bindings      0\nExpired bindings     0\nMalformed messages   0\nSecure arp entries   0\nRenew messages       0\nWorkspace timeouts   0\nStatic routes        0\nRelay bindings       0\nRelay bindings active        0\nRelay bindings terminated    0\nRelay bindings selecting     0\n\nMessage              Received\nBOOTREQUEST          0\nDHCPDISCOVER         ' + (n + 2) + '\nDHCPREQUEST          ' + (n * 2 + 1) + '\nDHCPDECLINE          0\nDHCPRELEASE          0\nDHCPINFORM           0\n\nMessage              Sent\nBOOTREPLY            0\nDHCPOFFER            ' + (n + 2) + '\nDHCPACK              ' + (n * 2 + 1) + '\nDHCPNAK              0';
  }));
  showDef('ip nat translations verbose', rtOnly(function () {
    var base = SH.natTranslations(this.state, this.dev).split('\n');
    return base.map(function (l, i) { return i === 0 ? l : l + '\n    create 00:0' + (i % 6) + ':1' + i + ', use 00:00:0' + (i % 9) + ' timeout:' + (/^---/.test(l) ? '0' : '86400000') + ', left 23:5' + (i % 9) + ':12,\n    flags: \n' + (/^---/.test(l) ? 'static' : 'extended') + ', use_count: 0, entry-id: ' + (10 + i) + ', lc_entries: 0'; }).join('\n');
  }));
  showDef('ip route summary', function () {
    var r = S.installedRoutes(this.state, S.get(this.state), this.dev.id);
    var cnt = function (t) { return r.filter(function (x) { return x.type === t || (t === 'S' && x.type === 'S*'); }).length; };
    return 'IP routing table name is default (0x0)\nIP routing table maximum-paths is 32\nRoute Source    Networks    Subnets     Replicates  Overhead    Memory (bytes)\nconnected       0           ' + lpad(cnt('C') + cnt('L'), 12) + '0           ' + lpad((cnt('C') + cnt('L')) * 72, 12) + (cnt('C') + cnt('L')) * 180 + '\nstatic          ' + lpad(cnt('S'), 12) + '0           0           ' + lpad(cnt('S') * 72, 12) + cnt('S') * 180 + '\ninternal        3                                               1380\nTotal           ' + lpad(cnt('S') + 3, 12) + lpad(cnt('C') + cnt('L'), 12) + '0           ' + lpad((cnt('C') + cnt('L') + cnt('S')) * 72, 12) + ((cnt('C') + cnt('L') + cnt('S')) * 180 + 1380);
  });
  showDef('crypto key mypubkey rsa', function () {
    var c = cfg(this);
    if (!c.cryptoKey) return '';
    var h = U.hash(c.hostname + this.dev.baseMac).toString(16).toUpperCase();
    return '% Key pair was generated at: 08:00:00 CEST Sep 28 2026\nKey name: ' + c.hostname + '.' + (c.domainName || '') + '\nKey type: RSA KEYS\n Storage Device: private-config\n Usage: General Purpose Key\n Key is not exportable.\n Key Data:\n  30820122 300D0609 2A864886 F70D0101 01050003 82010F00 3082010A 02820101\n  00' + (h + h + h).slice(0, 20) + ' ' + ('C0FFEE' + h).slice(0, 8) + ' 5A2E1B03 8D7C44F2 A91B0E6D 2F04C319 83B56E21\n  ...  (' + c.cryptoKey + ' bits)';
  });
  showDef('snmp', function () {
    var sn = cfg(this).snmp;
    if (!sn || !Object.keys(sn.communities).length) return '%SNMP agent not enabled';
    return 'Chassis: FOC1133Z0R4\n' + (sn.contact ? 'Contact: ' + sn.contact + '\n' : '') + (sn.location ? 'Location: ' + sn.location + '\n' : '') + '0 SNMP packets input\n    0 Bad SNMP version errors\n    0 Unknown community name\n0 SNMP packets output\nSNMP logging: disabled';
  });
  showDef('snmp community', function () {
    var sn = cfg(this).snmp;
    if (!sn) return '';
    return Object.keys(sn.communities).map(function (k) { return '\nCommunity name: ' + k + '\nCommunity Index: ' + k + '\nCommunity SecurityName: ' + k + '\nstorage-type: nonvolatile\t active\n'; }).join('');
  });
  showDef('standby brief', rtOnly(function () {
    var c = cfg(this), o = ['                     P indicates configured to preempt.', '                     |', 'Interface   Grp  Pri P State   Active          Standby         Virtual IP'];
    Object.keys(c.ifaces).forEach(function (n) {
      var i = c.ifaces[n];
      if (!i.hsrp || !i.hsrp.ip) return;
      o.push(lpad(U.shortIf(n), 12) + lpad(i.hsrp.grp, 5) + lpad(i.hsrp.pri, 4) + lpad(i.hsrp.preempt ? 'P' : ' ', 2) + lpad('Active', 8) + lpad('local', 16) + lpad('unknown', 16) + i.hsrp.ip);
    });
    return o.join('\n');
  }));
  showDef('interfaces counters', function () { return counters(this); }, true);
  showDef('interfaces <if> counters', function (v) { return counters(this, v[0]); }, true);
  function counters(s, only) {
    var D = S.get(s.state), names = (only ? [only] : SH.physPorts(s.dev));
    function num(n, salt, big) { var p = D.ports[S.key(s.dev.id, n)]; if (!p || !p.up) return 0; return (U.hash(n + salt + s.dev.id) % (big ? 90000000 : 900000)) + (big ? 1000000 : 1000) + Math.floor(s.state.time * (big ? 1500 : 12)); }
    var o = ['', 'Port            InOctets    InUcastPkts    InMcastPkts    InBcastPkts'];
    names.forEach(function (n) { o.push(lpad(U.shortIf(n), 11) + rpad(num(n, 'io', 1), 13) + rpad(num(n, 'iu'), 15) + rpad(Math.floor(num(n, 'im') / 40), 15) + rpad(Math.floor(num(n, 'ib') / 90), 15)); });
    o.push('');
    o.push('Port           OutOctets   OutUcastPkts   OutMcastPkts   OutBcastPkts');
    names.forEach(function (n) { o.push(lpad(U.shortIf(n), 11) + rpad(num(n, 'oo', 1), 13) + rpad(num(n, 'ou'), 15) + rpad(Math.floor(num(n, 'om') / 30), 15) + rpad(Math.floor(num(n, 'ob') / 70), 15)); });
    return o.join('\n');
  }
  showDef('mac address-table count', swOnly(function () {
    var t = SH.macTable(this.state, this.dev);
    var dyn = (t.match(/DYNAMIC/g) || []).length, stat = (t.match(/STATIC/g) || []).length;
    return '\nMac Entries for Vlan   : All\n---------------------------\nDynamic Address Count  : ' + dyn + '\nStatic  Address Count  : ' + stat + '\nTotal Mac Addresses    : ' + (dyn + stat) + '\n\nTotal Mac Address Space Available: ' + (12288 - dyn - stat);
  }), true);
  showDef('errdisable recovery', function () {
    var c = cfg(this), X = c.x || {};
    var causes = ['arp-inspection', 'bpduguard', 'channel-misconfig', 'dhcp-rate-limit', 'link-flap', 'loopback', 'psecure-violation', 'storm-control', 'udld'];
    var o = ['ErrDisable Reason            Timer Status', '-----------------            --------------'];
    causes.forEach(function (k) { var on = k === 'psecure-violation' ? !!c.errRecovery : !!X['errdisable cause ' + k]; o.push(lpad(k, 29) + (on ? 'Enabled' : 'Disabled')); });
    var iv = X['errdisable interval'] ? X['errdisable interval'].split(' ').pop() : 300;
    o.push('');
    o.push('Timer interval: ' + iv + ' seconds');
    o.push('');
    o.push('Interfaces that will be enabled at the next timeout:');
    return o.join('\n');
  }, true);
  showDef('ip dhcp snooping', swOnly(function () {
    var X = cfg(this).x || {};
    if (!X['dhcp snooping']) return 'Switch DHCP snooping is disabled';
    var vl = X['dhcp snooping vlan'] ? X['dhcp snooping vlan'].split(' ').pop() : '';
    var self = this, rows = [];
    Object.keys(cfg(this).ifaces).forEach(function (n) { var i = cfg(self).ifaces[n]; if (i.x && (i.x['snoop trust'] || i.x['snoop rate'])) rows.push(lpad(n, 32) + lpad(i.x['snoop trust'] ? 'yes' : 'no', 16) + (i.x['snoop rate'] ? i.x['snoop rate'].split(' ').pop() : 'unlimited')); });
    return 'Switch DHCP snooping is enabled\nDHCP snooping is configured on following VLANs:\n' + (vl || 'none') + '\nDHCP snooping is operational on following VLANs:\n' + (vl || 'none') + '\nInsertion of option 82 is ' + (X['dhcp snooping opt82'] ? 'disabled' : 'enabled') + '\nInterface                  Trusted    Allow option    Rate limit (pps)\n-----------------------    -------    ------------    ----------------\n' + rows.join('\n');
  }), true);
  showDef('archive', function () { return 'There are currently 0 archive configurations saved.'; });
  showDef('ip sockets', function () { return 'Proto    Remote      Port      Local       Port  In Out  Stat TTY OutputIF\n 17 --listen--             ' + ((S.devEps(S.get(this.state), this.dev.id)[0] || {}).ip || '--any--') + '    123   0   0   211   0'; }, true);
  showDef('tcp brief', function () { return 'TCB       Local Address               Foreign Address             (state)'; });
  showDef('ip http server status', function () { return 'HTTP server status: Disabled\nHTTP server port: 80\nHTTP server active supplementary listener ports:\nHTTP server authentication method: enable\nHTTP secure server status: Disabled'; });
  showDef('aaa sessions', function () { return '% AAA is not enabled (no aaa new-model)'; });
  showDef('ip ospf neighbor', rtOnly(function () { return ''; }));
  showDef('ip ospf interface brief', rtOnly(function () { return ''; }));
  showDef('ipv6 interface brief', function () {
    var c = cfg(this);
    return Object.keys(c.ifaces).filter(function (n) { return c.ifaces[n].x && c.ifaces[n].x['ipv6 ']; }).map(function (n) { return lpad(n, 23) + '[up/up]\n    ' + c.ifaces[n].x['ipv6 '].split(' ').pop(); }).join('\n');
  });

  // ================================================================== Version 7
  // ---------- VLAN: state suspend/active och shutdown
  def('vlan', 'state suspend', function (v, neg) { var c = cfg(this); c.vlanState = c.vlanState || {}; var ids = this.ctx.vlans || []; ids.forEach(function (x) { if (neg) delete c.vlanState[x]; else c.vlanState[x] = 'suspend'; }); S.touch(this.state); return ''; });
  def('vlan', 'state active', function () { var c = cfg(this); c.vlanState = c.vlanState || {}; (this.ctx.vlans || []).forEach(function (x) { delete c.vlanState[x]; }); S.touch(this.state); return ''; });
  def('vlan', 'shutdown', function (v, neg) { var c = cfg(this); c.vlanState = c.vlanState || {}; (this.ctx.vlans || []).forEach(function (x) { if (neg) delete c.vlanState[x]; else c.vlanState[x] = 'shutdown'; }); return ''; });
  showDef('vlan name <word>', swOnly(function (v) {
    var c = cfg(this), id = Object.keys(c.vlans).filter(function (k) { return c.vlans[k].toLowerCase() === v[0].toLowerCase(); })[0];
    if (!id) return 'VLAN ' + v[0] + ' not found in current VLAN database';
    return SH.vlanId(this.state, this.dev, parseInt(id, 10));
  }), true);

  // ---------- Alias: alias exec <namn> <kommando>
  def('config', 'alias exec <word> <text>', function (v, neg, k, line) {
    var c = cfg(this); c.aliases = c.aliases || {};
    if (neg) { delete c.aliases[v[0]]; return ''; }
    c.aliases[v[0]] = rest(line, v[0]);
    return '';
  });
  def('config', 'alias exec <word>', function (v) { var c = cfg(this); if (c.aliases) delete c.aliases[v[0]]; return ''; }, { noOnly: true });
  showDef('aliases', function () {
    var a = cfg(this).aliases || {};
    return 'Exec mode aliases:\n  h                     help\n  lo                    logout\n  p                     ping\n  r                     resume\n  s                     show\n  u                     undebug\n  un                    undebug\n  w                     where' + Object.keys(a).map(function (k) { return '\n  ' + lpad(k, 22) + a[k]; }).join('');
  }, true);

  // ---------- ACL: numrera om raderna
  def('config', 'ip access-list resequence <word> <n:1-2147483647> <n:1-2147483647>', function (v) {
    var a = cfg(this).acls[v[0]];
    if (!a) return '% Access list ' + v[0] + ' does not exist';
    var n = v[1];
    a.rules.forEach(function (r) { r.seq = n; n += v[2]; });
    return '';
  });

  // ---------- Kabeltest (TDR) och SFP-värden
  function tdrFor(s, n) {
    var D = S.get(s.state), p = D.ports[S.key(s.dev.id, n)];
    var link = s.state.links.filter(function (l) { return (l.a.dev === s.dev.id && l.a.port === n) || (l.b.dev === s.dev.id && l.b.port === n); })[0];
    var len = link ? 3 + (U.hash(link.id) % 45) : 0;
    if (!link) return { st: 'Open', len: 0, pairs: 'Open' };
    if (link.state === 'broken') { var at = 1 + (U.hash(link.id + 'x') % Math.max(2, len - 1)); return { st: 'Open', len: at, pairs: 'Open' }; }
    if (link.kind === 'fiber') return { fiber: true };
    if (p && p.neg && p.neg.speed === 100) return { st: 'Normal', len: len, pairs: 'Normal', half: true };
    return { st: 'Normal', len: len, pairs: 'Normal' };
  }
  def('exec', 'test cable-diagnostics tdr interface <if>', swOnly(function (v) {
    if (!cfg(this).ifaces[v[0]]) return '% Invalid interface';
    this.dev.rt.tdr = this.dev.rt.tdr || {};
    this.dev.rt.tdr[v[0]] = tdrFor(this, v[0]);
    return 'TDR test started on interface ' + U.shortIf(v[0]) + '\nA TDR test can take a few seconds to run on an interface\nUse \'show cable-diagnostics tdr\' to read the TDR results.';
  }));
  showDef('cable-diagnostics tdr interface <if>', swOnly(function (v) {
    var t = (this.dev.rt.tdr || {})[v[0]];
    if (!t) return '% TDR test was never issued on ' + U.shortIf(v[0]);
    if (t.fiber) return '% TDR test is not supported on fiber interface ' + U.shortIf(v[0]);
    var sp = t.half ? '100M' : (t.st === 'Open' ? 'auto' : '1000M');
    var o = ['TDR test last run on: ' + SH.showClock(this.state, this.dev).replace(/^\*/, ''), '', 'Interface Speed Local pair Pair length        Remote pair Pair status', '--------- ----- ---------- ------------------ ----------- --------------------'];
    ['Pair A', 'Pair B', 'Pair C', 'Pair D'].forEach(function (pr, i) {
      var remote = t.st === 'Open' ? 'N/A        ' : ['Pair B     ', 'Pair A     ', 'Pair D     ', 'Pair C     '][i];
      o.push((i === 0 ? lpad(U.shortIf(v[0]), 10) + lpad(sp, 6) : '                ') + lpad(pr, 11) + lpad(t.len + '   +/- ' + (t.st === 'Open' ? 1 : 4) + '  meters', 19) + ' ' + remote + ' ' + t.pairs);
    });
    return o.join('\n');
  }), true);
  showDef('interfaces <if> transceiver', swOnly(function (v) {
    var D = S.get(this.state), p = D.ports[S.key(this.dev.id, v[0])];
    var link = this.state.links.filter(function (l) { var me = this; return (l.a.dev === me.id && l.a.port === v[0]) || (l.b.dev === me.id && l.b.port === v[0]); }, this.dev)[0];
    if (!link || link.kind !== 'fiber') return '% No transceiver present on ' + v[0];
    var rx = p && p.up ? (-5.1 - (U.hash(link.id) % 30) / 10).toFixed(1) : '-40.0';
    return 'If device is externally calibrated, only calibrated values are printed.\n++ : high alarm, +  : high warning, -  : low warning, -- : low alarm.\nNA or N/A: not applicable, Tx: transmit, Rx: receive.\n\n                                            Optical   Optical\n           Temperature  Voltage  Current   Tx Power  Rx Power\nPort       (Celsius)    (Volts)  (mA)      (dBm)     (dBm)\n---------  -----------  -------  --------  --------  --------\n' + lpad(U.shortIf(v[0]), 11) + lpad('31.2', 13) + lpad('3.29', 9) + lpad('6.8', 10) + lpad('-5.3', 10) + rx + (p && p.up ? '' : ' --');
  }), true);

  // ---------- Fler show- och clear-kommandon
  showDef('interfaces status err-disabled', swOnly(function () {
    var self = this, rows = SH.interfacesStatus(this.state, this.dev).split('\n').filter(function (l) { return /err-disabled/.test(l); });
    return '\nPort      Name               Status       Reason               Err-disabled Vlans\n' + rows.map(function (l) { return l.slice(0, 29) + 'err-disabled ' + (self.dev.config.ifaces[U.normIf(l.split(' ')[0])] && self.dev.config.ifaces[U.normIf(l.split(' ')[0])].portSec ? 'psecure-violation' : 'link-flap'); }).join('\n');
  }), true);
  showDef('mac address-table static', swOnly(function () {
    var X = cfg(this).x || {}, rows = [];
    Object.keys(X).forEach(function (k) { var m = /^mac address-table static (\S+) vlan (\d+) interface (\S+)$/.exec(X[k]); if (m) rows.push(lpad(m[2], 5) + lpad(m[1].toLowerCase(), 19) + lpad('STATIC', 12) + U.shortIf(m[3])); });
    var D = S.get(this.state), d = this.dev;
    SH.physPorts(d).forEach(function (n) { var i = d.config.ifaces[n]; if (i.portSec && i.portSec.sticky) i.portSec.macs.forEach(function (m) { rows.push(lpad(i.accessVlan, 5) + lpad(U.macDots(m), 19) + lpad('STATIC', 12) + U.shortIf(n)); }); });
    return '          Mac Address Table\n-------------------------------------------\n\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----\n' + rows.join('\n') + '\nTotal Mac Addresses for this criterion: ' + rows.length;
  }), true);
  showDef('ip arp <ip>', function (v) {
    var t = SH.arpTable(this.state, this.dev).split('\n');
    var hit = t.filter(function (l) { return l.indexOf(' ' + v[0] + ' ') >= 0; });
    return hit.length ? t[0] + '\n' + hit.join('\n') : '';
  }, true);
  def('exec', 'clear arp-cache', function () { if (this.dev.arp) this.dev.arp = {}; S.touch(this.state); return ''; });
  def('exec', 'clear ip arp <ip>', function (v) { if (this.dev.arp) delete this.dev.arp[v[0]]; return ''; });
  showDef('port-security address', swOnly(function () {
    var d = this.dev, rows = [];
    SH.physPorts(d).forEach(function (n) { var i = d.config.ifaces[n]; if (i.portSec) (i.portSec.macs || []).forEach(function (m) { rows.push(lpad(i.accessVlan, 5) + lpad(U.macDots(m), 19) + lpad(i.portSec.sticky ? 'SecureSticky' : 'SecureDynamic', 21) + lpad(U.shortIf(n), 10) + '   -'); }); });
    return '               Secure Mac Address Table\n-----------------------------------------------------------------------------\nVlan    Mac Address       Type                          Ports   Remaining Age\n                                                                   (mins)\n----    -----------       ----                          -----   -------------\n' + rows.join('\n') + '\n-----------------------------------------------------------------------------\nTotal Addresses in System (excluding one mac per port)     : ' + Math.max(0, rows.length - 1) + '\nMax Addresses limit in System (excluding one mac per port) : 4096';
  }), true);
  showDef('tech-support', function () {
    var parts = [['show version', SH.showVersion(this.state, this.dev)], ['show running-config', SH.runningConfig(this.state, this.dev)], ['show ip interface brief', SH.ipIntBrief(this.state, this.dev)], ['show logging', SH.showLogging(this.state, this.dev)]];
    if (isSwitch(this)) parts.push(['show vlan brief', SH.vlanBrief(this.state, this.dev)], ['show interfaces status', SH.interfacesStatus(this.state, this.dev)]);
    else parts.push(['show ip route', SH.ipRoute(this.state, this.dev)]);
    return parts.map(function (p) { return '\n------------------ ' + p[0] + ' ------------------\n\n' + p[1]; }).join('\n');
  });
  showDef('controllers <if>', function (v) {
    var D = S.get(this.state), p = D.ports[S.key(this.dev.id, v[0])];
    return 'Interface ' + v[0] + '\nHardware is ' + (isRouter(this) ? 'BCM1125 Internal MAC' : 'Gigabit Ethernet') + '\nLink is ' + (p && p.up ? 'up' : 'down') + ', speed ' + (p && p.neg ? p.neg.speed : 'auto') + ', ' + (p && p.neg ? p.neg.duplex + '-duplex' : 'auto-duplex') + '\nautonegotiation enabled\n\n Transmit                      Receive\n        0 Bytes                       0 Bytes\n        0 Unicast frames              0 Unicast frames\n        0 Collision frames            0 FCS errors';
  }, true);
  // DHCP: lease i dagar, timmar och minuter
  def('dhcp', 'lease <n:0-365> <n:0-23>', function (v) { var p = cfg(this).dhcpPools[this.ctx.pool]; if (p) p.lease = v[0] + v[1] / 24; return ''; });
  def('dhcp', 'lease <n:0-365> <n:0-23> <n:0-59>', function (v) { var p = cfg(this).dhcpPools[this.ctx.pool]; if (p) p.lease = v[0] + v[1] / 24 + v[2] / 1440; return ''; });
  def('dhcp', 'option 150 ip <ip>', function (v, neg) { var p = cfg(this).dhcpPools[this.ctx.pool]; if (p) p.opt150 = neg ? null : v[0]; return ''; });

  // ---------- Hjälptexter (?) för nyckelorden från version 6.1 och 7
  [['banner', 'Define a login banner'], ['motd', 'Set Message of the Day banner'], ['vtp', 'Configure global VTP state'], ['lldp', 'Global LLDP configuration subcommands'],
   ['alias', 'Create command alias'], ['security', 'Infra Security CLIs'], ['login', 'Enable secure login checking'], ['snmp-server', 'Modify SNMP engine parameters'],
   ['errdisable', 'Error disable'], ['ipv6', 'Global IPv6 configuration commands'], ['voice', 'Set voice vlan characteristics'], ['channel-group', 'Etherchannel/port bundling configuration'],
   ['storm-control', 'storm configuration'], ['bpduguard', 'Don\'t accept BPDUs on this interface'], ['standby', 'HSRP interface configuration commands'], ['bandwidth', 'Set bandwidth informational parameter'],
   ['access-class', 'Filter connections based on an IP access list'], ['privilege', 'Change privilege level for line'], ['debug', 'Debugging functions (see also \'undebug\')'], ['undebug', 'Disable debugging functions (see also \'debug\')'],
   ['erase', 'Erase a filesystem'], ['dir', 'List files on a filesystem'], ['ssh', 'Open a secure shell client connection'], ['telnet', 'Open a telnet connection'],
   ['test', 'Test subsystems, memory, and interfaces'], ['cable-diagnostics', 'Cable diagnostic tests'], ['tdr', 'Time Domain Reflectometry'], ['loopback', 'Loopback interface'],
   ['resequence', 'Resequence Access List'], ['state', 'Operational state of the VLAN'], ['suspend', 'VLAN Suspended state'], ['active', 'VLAN Active State'],
   ['root', 'Configure switch as root'], ['primary', 'Configure this switch as primary root for this spanning tree'], ['secondary', 'Configure switch as secondary root'],
   ['range', 'Match only packets in the range of port numbers'], ['gt', 'Match only packets with a greater port number'], ['lt', 'Match only packets with a lower port number'], ['neq', 'Match only packets not on a given port number'],
   ['eq', 'Match only packets on a given port number'], ['log', 'Log matches against this entry'], ['clock', 'Configure time-of-day clock'], ['reload', 'Halt and perform a cold restart'],
   ['tech-support', 'Show system information for Tech-Support'], ['transceiver', 'interface transceiver'], ['etherchannel', 'EtherChannel information'], ['lease', 'Address lease time']].forEach(function (h) { if (!HELP[h[0]]) HELP[h[0]] = h[1]; });
  [['vtp', 'VTP information'], ['lldp', 'LLDP information'], ['etherchannel', 'EtherChannel information'], ['flash', 'display information about flash: file system'], ['debugging', 'State of each debugging option'],
   ['hosts', 'IP domain-name, lookup style, nameservers, and host table'], ['line', 'TTY line information'], ['privilege', 'Show current privilege level'], ['reload', 'Scheduled reload information'],
   ['snmp', 'snmp statistics'], ['standby', 'HSRP information'], ['tech-support', 'Show system information for Tech-Support'], ['cable-diagnostics', 'Show Cable Diagnostics Results'],
   ['aliases', 'Display alias commands'], ['errdisable', 'Error disable'], ['root', 'Report on spanning tree root'], ['counters', 'Show interface counters'], ['summary', 'Summary of entries']].forEach(function (h) { if (!SHOW_HELP[h[0]]) SHOW_HELP[h[0]] = h[1]; });

  // ---------- Version 7: konfigurationsregister, boot, sessioner och mer
  def('config', 'config-register <word>', function (v, neg, kk, line) {
    if (!/^0x[0-9a-f]{1,4}$/i.test(v[0])) return invalidMarker(this, line, v[0]);
    cfg(this).confRegNext = v[0].toLowerCase();
    return '';
  });
  def('config', 'boot system <text>', function (v, neg, kk, line) { var X = gx(cfg(this)); if (neg) delete X['boot system']; else X['boot system'] = 'boot system ' + rest(line, 'system'); return ''; });
  def('config', 'logging buffered <n:4096-2147483647> <word>', function (v, neg) { var l = cfg(this).logging; l.buffered = !neg; if (!neg) { l.size = v[0]; l.level = v[1]; } return ''; });
  def('config', 'ntp server <ip> prefer', function (v, neg) {
    var c = cfg(this);
    if (neg) { c.ntpServers = c.ntpServers.filter(function (x) { return x !== v[0]; }); S.touch(this.state); return ''; }
    if (c.ntpServers.indexOf(v[0]) < 0) c.ntpServers.unshift(v[0]);
    c.ntpPrefer = v[0];
    S.touch(this.state);
    return '';
  });
  def('config', 'clock timezone <word> <n:0-23> <n:0-59>', function () { return ''; });
  showDef('users', function () {
    var me = this.via === 'console' ? '*  0 con 0' : '*  2 vty 0', user = this.user || '';
    return '    Line       User       Host(s)              Idle       Location\n' + lpad(me, 15) + lpad(user, 11) + lpad('idle', 21) + '00:00:00   ' + (this.via === 'console' ? '' : '192.168.1.200') + '\n\n  Interface    User               Mode         Idle     Peer Address';
  }, true);
  showDef('interfaces summary', function () {
    var D = S.get(this.state), self = this;
    var o = [' *: interface is up', ' IHQ: pkts in input hold queue     IQD: pkts dropped from input queue', ' OHQ: pkts in output hold queue    OQD: pkts dropped from output queue', ' RXBS: rx rate (bits/sec)          RXPS: rx rate (pkts/sec)', ' TXBS: tx rate (bits/sec)          TXPS: tx rate (pkts/sec)', ' TRTL: throttle count', '',
      '  Interface                   IHQ       IQD       OHQ       OQD      RXBS      RXPS      TXBS      TXPS      TRTL', '-----------------------------------------------------------------------------------------------------------------'];
    SH.ifaceNames(this.dev).forEach(function (n) {
      var i = self.dev.config.ifaces[n], p = D.ports[S.key(self.dev.id, n)], ep = D.eps['E:' + self.dev.id + ':' + n];
      var up = i.loop ? !i.shutdown : (p ? p.up : (ep ? ep.up : false));
      var rx = up ? (U.hash(n + 'rx') % 90000) + 1000 : 0, tx = up ? (U.hash(n + 'tx') % 90000) + 1000 : 0;
      o.push((up ? '* ' : '  ') + lpad(n, 26) + rpad(0, 5) + rpad(0, 10) + rpad(0, 10) + rpad(0, 10) + rpad(rx, 10) + rpad(Math.round(rx / 800), 10) + rpad(tx, 10) + rpad(Math.round(tx / 800), 10) + rpad(0, 10));
    });
    return o.join('\n');
  }, true);
  showDef('spanning-tree vlan <n:1-4094> brief', swOnly(function (v) { return SH.spanningTree(this.state, this.dev, v[0]); }), true);
  showDef('memory statistics', function () {
    var r = isRouter(this);
    return '                Head    Total(b)     Used(b)     Free(b)   Lowest(b)  Largest(b)\nProcessor   ' + (r ? '2A6B7E40   414285504    98714424   315571080   314892000   312004096' : '1B2C3D40    94363276    27163948    67199328    66900120    66511072') + '\n      I/O   ' + (r ? 'E800000     75497472    21011032    54486440    54400000    54442780' : '7400000      8388608     3207548     5181060     5100000     5160012');
  }, true);

  // Användarläget får inte konfigurera men ska känna igen show-grenen
  Session.TRIES = TRIES;
  Session.parseAce = parseAce;
  return Session;
})();
