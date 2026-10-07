// Troubleshooting knowledge base. Each playbook describes a class of problem:
// how to recognise it, likely causes, how to test, and how to prove it is fixed.
// "on" tells the assistant which devices a command belongs on: router, switch, l3 (routing devices), host, all.
(function (root) {
  const CCA = root.CCA = root.CCA || {};

  const PLAYBOOKS = [
    {
      id: 'connectivity', title: 'No connectivity / ping fails',
      keywords: ['ping', 'cannot reach', "can't reach", 'cant reach', 'unreachable', 'no connectivity', 'not working', 'timeout', 'timed out', 'request timed out', 'no response', 'cannot connect', "can't connect", 'not reachable', 'destination host unreachable', 'communicate', 'talk to', 'no access', 'reach'],
      tags: ['no connectivity', 'gateway', 'routing', 'missing route', 'acl', 'vlan', 'interface down', 'subnet', 'mask'],
      summary: 'Work bottom-up through the OSI model: physical link → VLAN/switching → IP addressing → gateway → routing (both directions!) → filtering (ACL/firewall).',
      questions: ['What exactly is the source and destination (IP addresses)?', 'Did it ever work? What changed?', 'Does it fail for every host in the subnet or only one?', 'Can the host ping its own default gateway?', 'Does traceroute stop at a specific hop?'],
      causes: [
        { text: 'The link or interface is down (shutdown, cable, err-disabled).', tags: ['interface down', 'shutdown', 'link'] },
        { text: 'The host is in the wrong VLAN, or the VLAN is not carried on the trunk to the gateway.', tags: ['vlan', 'trunk', 'allowed', 'access port'] },
        { text: 'Wrong IP address, subnet mask or default gateway on the host or router.', tags: ['ip address', 'mask', 'subnet', 'gateway'] },
        { text: 'A router on the path has no route to the destination – or the RETURN route is missing.', tags: ['routing', 'missing route', 'static route'] },
        { text: 'An ACL drops the traffic (remember the implicit deny at the end).', tags: ['acl', 'blocked'] },
        { text: 'Duplicate IP address on the network.', tags: ['duplicate'] }
      ],
      diagnose: [
        { on: 'host', cmd: 'ipconfig /all   (Windows)  |  ip addr; ip route   (Linux)', why: 'Check IP, mask and default gateway of the host.', expect: 'Correct subnet, gateway in the same subnet.' },
        { on: 'host', cmd: 'ping <default-gateway>', why: 'Tests layer 1-3 inside the local subnet.', expect: 'Replies. If not: the problem is local (cable, VLAN, IP config, gateway interface).' },
        { on: 'host', cmd: 'tracert <destination>  |  traceroute <destination>', why: 'Shows the last router that answered.', expect: 'The hop after the last answering router is where it breaks (or the return path from there).' },
        { on: 'all', cmd: 'show ip interface brief', why: 'Every interface involved must be up/up with the right IP.', expect: 'Status "up" and Protocol "up".' },
        { on: 'switch', cmd: 'show vlan brief', why: 'Is the host port in the right VLAN?', expect: 'The access port listed under the correct VLAN.' },
        { on: 'switch', cmd: 'show interfaces trunk', why: 'Is the VLAN allowed and forwarding on the trunk towards the gateway?', expect: 'VLAN listed in "allowed and active" and "forwarding state".' },
        { on: 'l3', cmd: 'show ip route <destination-ip>', why: 'Does every router on the path have a route – forward AND back?', expect: 'A route (or default route) on every hop.' },
        { on: 'l3', cmd: 'show ip interface <interface> | include access list', why: 'Which ACLs are applied to the interfaces on the path?', expect: 'Then check "show access-lists" for the hit counters on deny lines.' },
        { on: 'l3', cmd: 'ping <destination> source <interface>', why: 'Ping from the router itself, sourced from the LAN interface, tests routing in both directions.', expect: '!!!!! – if this works but the host fails, look at the host/VLAN/ACL.' },
        { on: 'all', cmd: 'show ip arp  /  show mac address-table', why: 'Has the device learned the next hop/host at layer 2?', expect: 'An entry (not "Incomplete") for the neighbor.' }
      ],
      verify: [
        { on: 'host', cmd: 'ping <destination>', expect: 'Replies with 0% loss.' },
        { on: 'host', cmd: 'tracert <destination>', expect: 'The trace reaches the destination through the expected routers.' },
        { on: 'l3', cmd: 'show ip route <destination>', expect: 'The route is present on every router on the path (and the return route).' },
        { on: 'l3', cmd: 'show access-lists', expect: 'Permit counters increase, the deny counter does not.' }
      ]
    },
    {
      id: 'dhcp', title: 'Clients do not get an IP address (DHCP)',
      keywords: ['dhcp', '169.254', 'apipa', 'no ip address', 'get an ip', 'gets no ip', 'getting ip', 'obtain', 'ipconfig /renew', 'automatic address', 'lease', 'helper', 'relay', 'address from dhcp', 'self-assigned'],
      tags: ['dhcp', 'relay', 'helper-address', 'vlan', 'trunk', 'gateway'],
      summary: 'DHCP Discover is a layer-2 broadcast. It must reach either a local DHCP server or the gateway interface, which then relays it (ip helper-address) as unicast to the server. The reply must be able to come back.',
      questions: ['Do the clients get 169.254.x.x (no answer) or a wrong address (rogue/ wrong pool)?', 'Is the DHCP server on the same subnet or on another router/server?', 'Does it fail for all clients in the VLAN or only one port?', 'Does a client with a static IP in that VLAN reach the gateway?'],
      causes: [
        { text: 'The client port is in the wrong VLAN, or the VLAN does not exist / is not allowed on the trunk.', tags: ['vlan', 'trunk', 'allowed'] },
        { text: 'No "ip helper-address" on the gateway interface when the DHCP server is on another subnet.', tags: ['relay', 'helper-address'] },
        { text: 'The pool has the wrong network, or all addresses are used / excluded.', tags: ['dhcp'] },
        { text: 'The pool hands out a wrong default-router (clients get an IP but cannot leave the subnet).', tags: ['gateway'] },
        { text: 'An inbound ACL blocks UDP 67/68, or "no service dhcp" is configured.', tags: ['acl'] },
        { text: 'Port-security / err-disabled port, or PortFast missing (client gives up before STP forwards).', tags: ['port-security', 'stp'] }
      ],
      diagnose: [
        { on: 'host', cmd: 'ipconfig /release  then  ipconfig /renew', why: 'Forces a new DHCP exchange.', expect: 'An address in the right subnet; 169.254.x.x means no server answered.' },
        { on: 'router', cmd: 'show ip dhcp pool', why: 'Pool network, utilisation and leased addresses.', expect: 'The pool network matches the client subnet and has free addresses.' },
        { on: 'router', cmd: 'show ip dhcp binding', why: 'Has the server handed out anything?', expect: 'Bindings for the client MAC addresses.' },
        { on: 'router', cmd: 'show ip dhcp conflict', why: 'Addresses the server refused because they were already in use.', expect: 'Empty (otherwise clear it and exclude static addresses).' },
        { on: 'router', cmd: 'debug ip dhcp server events  (or packet)', why: 'Watch DISCOVER/OFFER/REQUEST/ACK live.', expect: 'DISCOVER arrives – if not, the broadcast never reaches the server (VLAN/trunk/relay).' },
        { on: 'l3', cmd: 'show ip interface <gateway-interface> | include Helper', why: 'Relay configured on the client gateway?', expect: '"Helper address is <dhcp-server-ip>" when the server is remote.' },
        { on: 'switch', cmd: 'show interfaces <port> switchport', why: 'Port mode and access VLAN.', expect: '"Access Mode VLAN" is the client VLAN.' },
        { on: 'switch', cmd: 'show interfaces trunk', why: 'Is the client VLAN carried towards the gateway/DHCP server?', expect: 'VLAN in "allowed and active" and "forwarding".' },
        { on: 'switch', cmd: 'show interfaces status err-disabled', why: 'Port-security or BPDU guard may have shut the port.', expect: 'No entries.' }
      ],
      verify: [
        { on: 'host', cmd: 'ipconfig /renew  →  ipconfig /all', expect: 'Correct IP, mask, default gateway and DNS server.' },
        { on: 'router', cmd: 'show ip dhcp binding', expect: 'The client MAC is listed with its lease.' },
        { on: 'host', cmd: 'ping <default-gateway>  and  ping <remote-address>', expect: 'Both answer.' }
      ]
    },
    {
      id: 'intervlan', title: 'Inter-VLAN routing does not work',
      keywords: ['inter-vlan', 'intervlan', 'between vlans', 'other vlan', 'different vlan', 'another vlan', 'vlan to vlan', 'router on a stick', 'router-on-a-stick', 'subinterface', 'svi', 'layer 3 switch', 'multilayer'],
      tags: ['inter-vlan', 'router on a stick', 'subinterface', 'svi', 'trunk', 'vlan', 'gateway', 'native vlan', 'layer 3 switch'],
      summary: 'Each VLAN needs a gateway: a router subinterface (router-on-a-stick, "encapsulation dot1Q <vlan>") or an SVI on a layer-3 switch with "ip routing". The VLAN must be carried on the trunk between hosts and gateway.',
      questions: ['Router-on-a-stick or layer-3 switch?', 'Can hosts ping their own gateway? Can they ping the gateway of the OTHER VLAN?', 'Do all VLANs fail or just one?'],
      causes: [
        { text: 'Subinterface has the wrong VLAN in "encapsulation dot1Q", or no encapsulation.', tags: ['subinterface', 'router on a stick'] },
        { text: 'The switch port to the router is not a trunk, or the VLAN is not allowed on it.', tags: ['trunk', 'allowed'] },
        { text: 'Native VLAN mismatch between router and switch.', tags: ['native vlan'] },
        { text: 'Layer-3 switch without "ip routing", or SVI down (VLAN missing / no active ports).', tags: ['svi', 'layer 3 switch'] },
        { text: 'Hosts have the wrong default gateway.', tags: ['gateway', 'dhcp'] },
        { text: 'An ACL between the VLANs.', tags: ['acl'] }
      ],
      diagnose: [
        { on: 'router', cmd: 'show vlans', why: 'Which VLAN each subinterface terminates (router-on-a-stick).', expect: 'Each VLAN ID on the expected subinterface with the right IP.' },
        { on: 'router', cmd: 'show ip interface brief', why: 'All subinterfaces / SVIs up/up?', expect: 'up/up for every gateway interface.' },
        { on: 'switch', cmd: 'show interfaces trunk', why: 'Trunk to router/core: mode, native VLAN, allowed VLANs.', expect: 'Trunking, same native VLAN as the router, all user VLANs allowed and forwarding.' },
        { on: 'switch', cmd: 'show vlan brief', why: 'VLANs exist and the host ports are in them.', expect: 'All VLANs active.' },
        { on: 'l3', cmd: 'show ip route', why: 'A connected route for every VLAN subnet.', expect: '"C" route for each VLAN; on a L3 switch "ip routing" must be enabled.' },
        { on: 'host', cmd: 'ping <own-gateway>, then ping <other-vlan-gateway>, then the other host', why: 'Narrows down where it breaks.', expect: 'Own gateway OK + other gateway fails → routing/ACL; own gateway fails → VLAN/trunk/subinterface.' }
      ],
      verify: [
        { on: 'host', cmd: 'ping <host-in-other-vlan>', expect: 'Replies.' },
        { on: 'host', cmd: 'tracert <host-in-other-vlan>', expect: 'First hop is the VLAN gateway, then the destination.' },
        { on: 'switch', cmd: 'show interfaces trunk', expect: 'All VLANs allowed, active and forwarding.' }
      ]
    },
    {
      id: 'trunk', title: 'Trunk / VLAN problems between switches',
      keywords: ['trunk', 'native vlan', 'native', 'allowed vlan', 'dtp', 'tagged', '802.1q', 'dot1q', 'vlan mismatch', 'vtp', 'vlan not', 'same vlan'],
      tags: ['trunk', 'native vlan', 'allowed', 'vlan', 'dtp', 'vtp', 'access port'],
      summary: 'Both ends of a trunk must agree: trunk mode (no auto/auto), same native VLAN, and the VLAN must exist and be allowed on both switches.',
      questions: ['Do hosts in the same VLAN on different switches reach each other?', 'Are there CDP messages like "native VLAN mismatch" in the log?'],
      causes: [
        { text: 'One side access, the other trunk – or both "dynamic auto".', tags: ['trunk', 'dtp'] },
        { text: 'Native VLAN mismatch.', tags: ['native vlan'] },
        { text: 'VLAN not in the allowed list on one of the switches.', tags: ['allowed'] },
        { text: 'VLAN does not exist on the transit switch (VTP mismatch, VLAN never created).', tags: ['vtp', 'vlan'] }
      ],
      diagnose: [
        { on: 'switch', cmd: 'show interfaces trunk', why: 'Mode, encapsulation, native VLAN, allowed / active / forwarding VLANs.', expect: 'Same values on both ends; the VLAN appears in all three lists.' },
        { on: 'switch', cmd: 'show interfaces <port> switchport', why: 'Administrative vs operational mode.', expect: '"Operational Mode: trunk".' },
        { on: 'switch', cmd: 'show vlan brief', why: 'VLAN must exist on every switch it passes through.', expect: 'VLAN listed as active.' },
        { on: 'switch', cmd: 'show vtp status', why: 'Domain, mode and revision.', expect: 'Same domain; transparent switches need the VLANs created locally.' },
        { on: 'switch', cmd: 'show logging | include NATIVE|MISMATCH', why: 'CDP reports native VLAN and duplex mismatches.', expect: 'No mismatch messages.' },
        { on: 'switch', cmd: 'show spanning-tree vlan <vlan>', why: 'Is the trunk forwarding for the VLAN?', expect: 'FWD on the trunk port.' }
      ],
      verify: [
        { on: 'switch', cmd: 'show interfaces trunk', expect: 'VLAN allowed, active and forwarding on both sides; matching native VLAN.' },
        { on: 'host', cmd: 'ping <host-in-same-vlan-on-other-switch>', expect: 'Replies.' },
        { on: 'switch', cmd: 'show mac address-table vlan <vlan>', expect: 'Remote host MACs learned via the trunk port.' }
      ]
    },
    {
      id: 'internet', title: 'No Internet access / NAT',
      keywords: ['internet', 'nat', 'pat', 'overload', '8.8.8.8', 'google', 'outside', 'isp', 'public ip', 'browse', 'web', 'website', 'external', 'translation', 'online'],
      tags: ['internet', 'nat', 'default route', 'dns', 'acl'],
      summary: 'For Internet access the inside host needs a gateway, every router needs a default route towards the edge, the edge router must translate (NAT/PAT) the inside source address, and DNS must work.',
      questions: ['Does "ping 8.8.8.8" work but "ping google.com" fail? (→ DNS)', 'Do all inside VLANs fail, or only some?', 'Can the edge router itself ping 8.8.8.8?'],
      causes: [
        { text: 'No default route on the edge router or on internal routers (not redistributed: default-information originate).', tags: ['default route', 'routing'] },
        { text: 'NAT ACL does not match the inside subnet.', tags: ['nat', 'acl'] },
        { text: '"ip nat inside / outside" missing or on the wrong interfaces.', tags: ['nat'] },
        { text: 'DNS server missing or wrong in DHCP.', tags: ['dns'] },
        { text: 'An ACL on the outside interface blocks return traffic.', tags: ['acl'] }
      ],
      diagnose: [
        { on: 'router', cmd: 'ping 8.8.8.8', why: 'Does the edge router itself reach the Internet?', expect: 'Replies. If not: ISP link/default route problem.' },
        { on: 'router', cmd: 'ping 8.8.8.8 source <inside-interface>', why: 'Tests NAT + routing for an inside address.', expect: 'Replies only if the inside subnet is translated.' },
        { on: 'router', cmd: 'show ip nat translations', why: 'Are inside hosts being translated?', expect: 'Entries with "Inside local" = host addresses.' },
        { on: 'router', cmd: 'show ip nat statistics', why: 'Inside/outside interfaces, hits and misses, which ACL is used.', expect: 'Correct interfaces listed; hits increase.' },
        { on: 'router', cmd: 'show access-lists <nat-acl>', why: 'Does the NAT ACL match all inside subnets?', expect: 'Matches increase for every inside subnet.' },
        { on: 'l3', cmd: 'show ip route 0.0.0.0', why: 'Default route on every router.', expect: '"Gateway of last resort is …" on every router.' },
        { on: 'host', cmd: 'nslookup www.cisco.com', why: 'DNS works?', expect: 'An address is returned.' }
      ],
      verify: [
        { on: 'host', cmd: 'ping 8.8.8.8  and  ping www.google.com', expect: 'Both reply.' },
        { on: 'router', cmd: 'show ip nat translations', expect: 'Translations for the host.' },
        { on: 'host', cmd: 'tracert 8.8.8.8', expect: 'Passes the edge router and continues into the ISP.' }
      ]
    },
    {
      id: 'ospf', title: 'OSPF neighbors / routes missing',
      keywords: ['ospf', 'neighbor', 'neighbour', 'adjacency', 'exstart', 'exchange', 'init', '2-way', '2way', 'full', 'lsa', 'area', 'dr ', 'bdr', 'router-id', 'o ia'],
      tags: ['ospf', 'neighbor', 'adjacency', 'area', 'passive', 'wildcard', 'missing route', 'router-id', 'mask'],
      summary: 'OSPF neighbors must share: subnet and mask, area, hello/dead timers, authentication, MTU (for FULL), compatible network type, unique router IDs – and the interface must be enabled for OSPF and not passive.',
      questions: ['Which state is the neighbor in (none, INIT, 2WAY, EXSTART, FULL)?', 'Is the neighbor missing, or is the neighbor FULL but routes missing?'],
      causes: [
        { text: 'Interface not enabled (network statement/wildcard wrong) or passive.', tags: ['wildcard', 'passive'] },
        { text: 'Area, hello/dead timers or authentication mismatch.', tags: ['area', 'adjacency'] },
        { text: 'Subnet mask mismatch on the link.', tags: ['mask'] },
        { text: 'MTU mismatch (stuck in EXSTART/EXCHANGE).', tags: ['adjacency'] },
        { text: 'Duplicate router ID.', tags: ['router-id'] },
        { text: 'An ACL blocks OSPF (protocol 89).', tags: ['acl'] },
        { text: 'Neighbor is FULL but the network is not advertised (missing network statement, or redistribution/default-information originate missing).', tags: ['missing route'] }
      ],
      diagnose: [
        { on: 'l3', cmd: 'show ip ospf neighbor', why: 'Neighbor state.', expect: 'FULL (or 2WAY between DROTHERs on a LAN).' },
        { on: 'l3', cmd: 'show ip ospf interface brief', why: 'Which interfaces run OSPF, area, cost, state.', expect: 'The link interface listed in the correct area with Nbrs F/C ≥ 1.' },
        { on: 'l3', cmd: 'show ip ospf interface <interface>', why: 'Timers, network type, passive, authentication.', expect: 'Same Hello/Dead and network type as the neighbor.' },
        { on: 'l3', cmd: 'show ip protocols', why: 'Router ID, network statements, passive interfaces.', expect: 'Statements cover the link networks; the link is not passive.' },
        { on: 'l3', cmd: 'debug ip ospf adj   (undebug all when done)', why: 'Shows the reason hellos are rejected.', expect: 'Messages like "Mismatched hello parameters" or "area mismatch".' },
        { on: 'l3', cmd: 'show ip route ospf', why: 'Routes learned.', expect: 'O / O IA routes for the remote networks.' }
      ],
      verify: [
        { on: 'l3', cmd: 'show ip ospf neighbor', expect: 'State FULL for every expected neighbor.' },
        { on: 'l3', cmd: 'show ip route ospf', expect: 'All remote networks present.' },
        { on: 'l3', cmd: 'ping <remote-network-host> source <lan-interface>', expect: 'Replies.' }
      ]
    },
    {
      id: 'eigrp', title: 'EIGRP neighbors / routes missing',
      keywords: ['eigrp', 'k-value', 'k value', 'autonomous system', 'feasible successor', 'successor', 'stuck in active', 'sia'],
      tags: ['eigrp', 'neighbor', 'adjacency', 'passive', 'wildcard', 'missing route', 'summarization'],
      summary: 'EIGRP neighbors need the same AS number, matching K-values, matching authentication, a common primary subnet and non-passive interfaces.',
      questions: ['Is the neighbor listed in "show ip eigrp neighbors"?', 'Are subnets of the same major network separated by another network (discontiguous)?'],
      causes: [
        { text: 'Different AS numbers.', tags: ['eigrp'] },
        { text: 'Interface not enabled by a network statement or passive.', tags: ['passive', 'wildcard'] },
        { text: 'K-value or authentication mismatch.', tags: ['adjacency'] },
        { text: 'Auto-summary with discontiguous networks.', tags: ['summarization'] },
        { text: 'ACL blocks EIGRP (protocol 88).', tags: ['acl'] }
      ],
      diagnose: [
        { on: 'l3', cmd: 'show ip eigrp neighbors', why: 'Neighbor table.', expect: 'The neighbor listed, with a stable uptime.' },
        { on: 'l3', cmd: 'show ip eigrp interfaces', why: 'Interfaces running EIGRP (passive are not listed).', expect: 'The link interface listed with Peers ≥ 1.' },
        { on: 'l3', cmd: 'show ip protocols', why: 'AS, K-values, networks, passive, auto-summary.', expect: 'Same AS and K-values on both routers.' },
        { on: 'l3', cmd: 'show ip eigrp topology', why: 'Successors and feasible successors.', expect: 'Entries for the remote networks.' },
        { on: 'l3', cmd: 'show logging | include DUAL', why: 'Neighbor changes and reasons (K-value mismatch, auth).', expect: 'No repeated neighbor down/up.' }
      ],
      verify: [
        { on: 'l3', cmd: 'show ip eigrp neighbors', expect: 'Neighbors up with growing uptime.' },
        { on: 'l3', cmd: 'show ip route eigrp', expect: 'D routes for the remote networks.' }
      ]
    },
    {
      id: 'rip', title: 'RIP routes missing',
      keywords: ['rip', 'ripv2', 'rip v2', 'hop count', '16 hops'],
      tags: ['rip', 'routing', 'missing route', 'summarization', 'vlsm'],
      summary: 'Use RIPv2 with "no auto-summary" on all routers. Network statements are classful; passive interfaces do not send updates.',
      questions: ['Do all routers run version 2?', 'Are there more than 15 hops?'],
      causes: [{ text: 'Version mismatch (v1 vs v2).', tags: ['rip'] }, { text: 'Auto-summary on discontiguous networks.', tags: ['summarization'] }, { text: 'Missing network statement or passive interface.', tags: ['rip'] }],
      diagnose: [
        { on: 'l3', cmd: 'show ip protocols', why: 'Version, networks, passive interfaces.', expect: 'Send/receive version 2 on all interfaces.' },
        { on: 'l3', cmd: 'debug ip rip', why: 'See updates sent/received.', expect: 'Updates arriving from the neighbor.' },
        { on: 'l3', cmd: 'show ip route rip', why: 'Learned routes.', expect: 'R routes for remote networks.' }
      ],
      verify: [{ on: 'l3', cmd: 'show ip route rip', expect: 'All remote networks with sensible hop count.' }]
    },
    {
      id: 'bgp', title: 'BGP session down / prefixes missing',
      keywords: ['bgp', 'ebgp', 'ibgp', 'peer', 'remote-as', 'idle', 'active state', 'established', 'prefix'],
      tags: ['bgp', 'neighbor', 'missing route', 'advertise'],
      summary: 'A BGP session needs TCP 179 reachability, a matching remote-as on both sides, the correct source address (update-source) and, for eBGP between loopbacks, ebgp-multihop.',
      questions: ['Which state: Idle, Active, OpenSent or Established (number in State/PfxRcd)?'],
      causes: [{ text: 'Wrong remote-as or neighbor IP.', tags: ['bgp'] }, { text: 'No route to the neighbor / update-source / multihop missing.', tags: ['bgp'] }, { text: 'TCP 179 blocked by ACL.', tags: ['acl'] }, { text: 'Network statement without an exact route in the routing table.', tags: ['advertise'] }],
      diagnose: [
        { on: 'l3', cmd: 'show ip bgp summary', why: 'Session state and received prefixes.', expect: 'A number in State/PfxRcd = Established.' },
        { on: 'l3', cmd: 'ping <neighbor-ip> source <update-source>', why: 'Reachability between the peering addresses.', expect: 'Replies.' },
        { on: 'l3', cmd: 'show ip bgp neighbors <ip> | include state|Last reset', why: 'Reason for the last reset.', expect: 'BGP state = Established.' },
        { on: 'l3', cmd: 'show ip bgp', why: 'Which prefixes are advertised/received.', expect: 'The expected prefixes marked *>.' }
      ],
      verify: [{ on: 'l3', cmd: 'show ip bgp summary', expect: 'Established with prefixes received.' }, { on: 'l3', cmd: 'show ip route bgp', expect: 'B routes installed.' }]
    },
    {
      id: 'routing', title: 'Remote network unreachable / missing routes',
      keywords: ['route', 'routing', 'remote network', 'other network', 'other site', 'branch', 'subnet', 'traceroute stops', 'tracert stops', 'static route', 'default route', 'gateway of last resort', 'one way', 'return path', 'asymmetric'],
      tags: ['routing', 'missing route', 'static route', 'default route', 'remote network', 'ospf', 'eigrp', 'rip'],
      summary: 'Every router on the path needs a route to the destination, and every router on the way back needs a route to the source. A missing return route looks exactly like a missing forward route from the host\'s point of view.',
      questions: ['Where does traceroute stop?', 'Does the router closest to the destination have a route back to the source subnet?'],
      causes: [{ text: 'Missing static/default route or wrong next hop.', tags: ['static route', 'default route'] }, { text: 'Network not advertised by the routing protocol.', tags: ['missing route'] }, { text: 'Routing protocol neighbor down.', tags: ['neighbor'] }, { text: 'Return route missing (asymmetric).', tags: ['routing'] }],
      diagnose: [
        { on: 'l3', cmd: 'show ip route', why: 'The full routing table.', expect: 'A route for the destination (or a gateway of last resort).' },
        { on: 'l3', cmd: 'show ip route <destination>', why: 'Which route is chosen and the next hop.', expect: 'The expected next hop/interface.' },
        { on: 'l3', cmd: 'show ip cef <destination>', why: 'The actual forwarding decision.', expect: 'Correct next hop.' },
        { on: 'l3', cmd: 'traceroute <destination> source <lan-interface>', why: 'Hop-by-hop path.', expect: 'Reaches the destination.' },
        { on: 'l3', cmd: 'ping <next-hop>', why: 'Is the next hop reachable?', expect: 'Replies.' }
      ],
      verify: [{ on: 'l3', cmd: 'show ip route <destination>', expect: 'Route present on all routers, forward and back.' }, { on: 'host', cmd: 'tracert <destination>', expect: 'Complete path.' }]
    },
    {
      id: 'remote', title: 'Cannot SSH/Telnet to a device',
      keywords: ['ssh', 'telnet', 'remote access', 'remote management', 'vty', 'login', 'password', 'connection refused', 'putty', 'manage', 'management', 'authentication failed', '% no password set', 'password required'],
      tags: ['ssh', 'telnet', 'remote access', 'vty', 'login', 'management', 'gateway', 'acl'],
      summary: 'Remote access needs IP reachability to the device (switches: SVI + default gateway), allowed transport on the VTY lines, a working login method (password or local user) and, for SSH, hostname + domain name + RSA keys.',
      questions: ['Does ping to the device work?', 'Is the error "connection refused", a timeout, or a failed login?', 'SSH or Telnet?'],
      causes: [
        { text: 'No reachability: switch without default gateway / wrong management VLAN.', tags: ['gateway', 'management'] },
        { text: '"transport input" does not allow the protocol.', tags: ['telnet', 'ssh'] },
        { text: '"login" without password, or "login local" without username.', tags: ['login'] },
        { text: 'SSH: no domain name / RSA keys, or SSH version mismatch.', tags: ['ssh'] },
        { text: 'access-class on the VTY lines blocks your source address.', tags: ['acl', 'vty'] },
        { text: 'No enable secret – you can log in but not enter privileged mode.', tags: ['enable'] }
      ],
      diagnose: [
        { on: 'host', cmd: 'ping <device-ip>', why: 'Basic reachability.', expect: 'Replies (if not: fix routing/default-gateway first).' },
        { on: 'all', cmd: 'show running-config | section line vty', why: 'transport input, login, password, access-class.', expect: 'transport input ssh, login local (or password).' },
        { on: 'all', cmd: 'show ip ssh', why: 'SSH enabled and version.', expect: '"SSH Enabled - version 2.0".' },
        { on: 'all', cmd: 'show users  /  show line vty 0 4', why: 'Are all VTY lines occupied?', expect: 'Free lines available.' },
        { on: 'all', cmd: 'show access-lists', why: 'access-class counters.', expect: 'Your source IP matches a permit.' },
        { on: 'switch', cmd: 'show running-config | include default-gateway', why: 'Switch must know how to reply to remote subnets.', expect: 'ip default-gateway in the management subnet.' }
      ],
      verify: [{ on: 'host', cmd: 'ssh -l <user> <device-ip>', expect: 'Login prompt and successful login.' }, { on: 'all', cmd: 'show users', expect: 'Your session listed on a vty line.' }]
    },
    {
      id: 'interface', title: 'Interface or link is down',
      keywords: ['down', 'link down', 'interface down', 'port down', 'line protocol', 'administratively down', 'notconnect', 'not connected', 'no link', 'shutdown', 'shut', 'led', 'light', 'cable', 'up/down', 'down/down'],
      tags: ['interface down', 'shutdown', 'link', 'err-disabled', 'duplex', 'svi'],
      summary: '"administratively down" = shutdown. "down/down" = physical (cable, other end shut, speed). "up/down" = layer 2 (encapsulation, keepalive, clock rate on serial, SVI without active VLAN ports). "err-disabled" = a security feature shut it.',
      questions: ['What does "show ip interface brief" say (Status/Protocol)?', 'Is the other end up?'],
      causes: [{ text: 'Interface shut down (either side).', tags: ['shutdown'] }, { text: 'Err-disabled (port-security, BPDU guard, EtherChannel misconfig).', tags: ['err-disabled'] }, { text: 'Speed/duplex or cable problem.', tags: ['duplex'] }, { text: 'Serial: encapsulation/clock rate mismatch.', tags: ['link'] }, { text: 'SVI up/down because the VLAN has no active ports.', tags: ['svi'] }],
      diagnose: [
        { on: 'all', cmd: 'show ip interface brief', why: 'Status and protocol for all interfaces.', expect: 'up/up.' },
        { on: 'all', cmd: 'show interfaces <interface>', why: 'Errors, duplex, encapsulation, last input/output.', expect: 'Full duplex, error counters not increasing.' },
        { on: 'switch', cmd: 'show interfaces status', why: 'connected / notconnect / err-disabled / disabled.', expect: '"connected".' },
        { on: 'switch', cmd: 'show interfaces status err-disabled', why: 'Reason for err-disable.', expect: 'Empty.' },
        { on: 'all', cmd: 'show cdp neighbors', why: 'Which device/port is on the other end.', expect: 'The expected neighbor.' },
        { on: 'router', cmd: 'show controllers serial <x/y/z>', why: 'DCE/DTE and clock rate on serial links.', expect: 'The DCE side has a clock rate.' }
      ],
      verify: [{ on: 'all', cmd: 'show ip interface brief', expect: 'up/up.' }, { on: 'all', cmd: 'show cdp neighbors', expect: 'Neighbor visible.' }]
    },
    {
      id: 'portsec', title: 'Port err-disabled / port-security',
      keywords: ['err-disabled', 'errdisable', 'err disabled', 'port-security', 'port security', 'violation', 'secure', 'bpdu guard', 'bpduguard', 'mac address limit', 'sticky'],
      tags: ['port-security', 'err-disabled', 'phone', 'stp'],
      summary: 'Port-security shuts the port (violation shutdown) when more MACs than allowed appear or an unknown MAC is seen; BPDU guard shuts PortFast ports that receive BPDUs.',
      questions: ['Was a new device, phone or small switch connected to the port?'],
      causes: [{ text: 'Too many MAC addresses (e.g. phone + PC with maximum 1).', tags: ['port-security', 'phone'] }, { text: 'Sticky MAC learned from another device.', tags: ['port-security'] }, { text: 'A switch connected to a BPDU-guard port.', tags: ['stp'] }],
      diagnose: [
        { on: 'switch', cmd: 'show interfaces status err-disabled', why: 'Which ports and why.', expect: 'Reason: psecure-violation / bpduguard …' },
        { on: 'switch', cmd: 'show port-security interface <port>', why: 'Max MACs, violation count, last source MAC.', expect: 'Violation count 0.' },
        { on: 'switch', cmd: 'show port-security address', why: 'Learned secure MACs.', expect: 'Only the allowed devices.' }
      ],
      verify: [
        { on: 'switch', cmd: 'interface <port> → shutdown → no shutdown', expect: 'Port comes back (after fixing the cause).' },
        { on: 'switch', cmd: 'show interfaces <port> status', expect: '"connected".' }
      ]
    },
    {
      id: 'performance', title: 'Slow network / errors / packet loss',
      keywords: ['slow', 'performance', 'latency', 'packet loss', 'drops', 'drop', 'crc', 'collisions', 'late collision', 'duplex', 'errors', 'throughput', 'speed', 'lag', 'jitter'],
      tags: ['duplex', 'speed', 'slow', 'errors', 'performance', 'collisions', 'stp', 'loop'],
      summary: 'The classic cause is a duplex mismatch (one side forced, the other auto → half duplex). Also look at CRC errors (cable), output drops (congestion) and STP loops.',
      questions: ['Is it slow everywhere or across one link?', 'Do the error counters increase?'],
      causes: [{ text: 'Duplex/speed mismatch.', tags: ['duplex'] }, { text: 'Bad cable/port (CRC, input errors).', tags: ['errors'] }, { text: 'Congestion (output drops).', tags: ['performance'] }, { text: 'Layer-2 loop / broadcast storm.', tags: ['loop'] }],
      diagnose: [
        { on: 'all', cmd: 'show interfaces <interface>', why: 'Duplex, speed, input errors, CRC, collisions, late collisions, output drops.', expect: 'Full-duplex; counters not increasing.' },
        { on: 'all', cmd: 'show interfaces counters errors', why: 'Errors per port (switch).', expect: 'Zeros or stable values.' },
        { on: 'all', cmd: 'clear counters <interface>  → wait → show interfaces <interface>', why: 'See if errors are still increasing.', expect: 'No new errors.' },
        { on: 'all', cmd: 'show logging | include DUPLEX', why: 'CDP duplex mismatch messages.', expect: 'None.' },
        { on: 'all', cmd: 'show processes cpu sorted', why: 'High CPU can mean a loop or process problem.', expect: 'CPU < 50%.' }
      ],
      verify: [{ on: 'all', cmd: 'show interfaces <interface>', expect: 'Full duplex on both ends, errors not increasing after clear counters.' }, { on: 'host', cmd: 'ping -n 100 <destination>  (or iperf)', expect: 'No loss, stable latency.' }]
    },
    {
      id: 'stp', title: 'Loops / spanning tree problems',
      keywords: ['loop', 'broadcast storm', 'storm', 'spanning', 'stp', 'blocking', 'root bridge', 'mac flap', 'flapping', 'high cpu', 'whole network down', 'leds blinking', 'topology change'],
      tags: ['stp', 'spanning-tree', 'loop', 'portfast', 'convergence', 'etherchannel'],
      summary: 'A layer-2 loop causes broadcast storms, MAC flapping and 100% CPU. Check which switch is root, which ports block, and whether PortFast/BPDU guard is used correctly.',
      questions: ['Did someone just connect a cable or a small switch?', 'Do you see MAC flapping messages?'],
      causes: [{ text: 'Unmanaged switch/hub creating a loop on a PortFast port without BPDU guard.', tags: ['portfast'] }, { text: 'STP disabled for a VLAN, or EtherChannel misconfig (mode on vs off).', tags: ['stp', 'etherchannel'] }, { text: 'Wrong root bridge (an access switch became root).', tags: ['stp'] }],
      diagnose: [
        { on: 'switch', cmd: 'show spanning-tree', why: 'Root bridge, port roles and states per VLAN.', expect: 'The intended core switch is root; redundant links blocking (BLK/ALTN).' },
        { on: 'switch', cmd: 'show spanning-tree root', why: 'Root per VLAN.', expect: 'Same root for all switches.' },
        { on: 'switch', cmd: 'show logging | include MACFLAP|LOOP|BPDU', why: 'Loop indicators.', expect: 'None.' },
        { on: 'switch', cmd: 'show spanning-tree detail | include ieee|occurr|from|is exec', why: 'Topology changes and where they come from.', expect: 'Few topology changes.' }
      ],
      verify: [{ on: 'switch', cmd: 'show spanning-tree', expect: 'Stable topology, one root, redundant ports blocking.' }, { on: 'switch', cmd: 'show processes cpu', expect: 'Normal CPU.' }]
    },
    {
      id: 'etherchannel', title: 'EtherChannel does not come up',
      keywords: ['etherchannel', 'port-channel', 'port channel', 'lacp', 'pagp', 'bundle', 'suspended', 'channel-group', 'link aggregation'],
      tags: ['etherchannel', 'port-channel', 'lacp', 'pagp', 'suspended'],
      summary: 'All members must have identical settings (speed, duplex, mode, VLANs, native VLAN) and the modes on both sides must be compatible (on–on, active–active/passive, desirable–desirable/auto).',
      questions: ['What flags does "show etherchannel summary" show (P, s, I, D)?'],
      causes: [{ text: 'Mode combination that never negotiates (passive–passive, auto–auto, on–active).', tags: ['lacp', 'pagp'] }, { text: 'Members with different settings (suspended).', tags: ['suspended'] }],
      diagnose: [
        { on: 'switch', cmd: 'show etherchannel summary', why: 'Bundle and member state.', expect: 'Po(SU) and members (P).' },
        { on: 'switch', cmd: 'show etherchannel <n> detail', why: 'Protocol, partner info.', expect: 'Partner detected for all ports.' },
        { on: 'switch', cmd: 'show interfaces <member> switchport', why: 'Compare member settings.', expect: 'Identical on all members.' }
      ],
      verify: [{ on: 'switch', cmd: 'show etherchannel summary', expect: 'Po(SU)/(RU) with all members (P).' }]
    },
    {
      id: 'acl', title: 'Traffic blocked by an ACL',
      keywords: ['acl', 'access-list', 'access list', 'blocked', 'filter', 'denied', 'deny', 'permit', 'firewall', 'only some', 'some traffic', 'port 80', 'port 443'],
      tags: ['acl', 'blocked', 'filter', 'order', 'wildcard'],
      summary: 'ACLs are processed top-down, stop at the first match and end with an implicit "deny any". Check the order, the wildcard masks, the direction (in/out) and where the ACL is applied.',
      questions: ['Which traffic should be allowed and which blocked?', 'Do the hit counters on the deny lines increase when you test?'],
      causes: [{ text: 'The implicit deny drops traffic you did not explicitly permit (e.g. routing protocols, DHCP, return traffic).', tags: ['acl'] }, { text: 'Wrong order – a broad entry before a specific one.', tags: ['order'] }, { text: 'Subnet mask used instead of wildcard.', tags: ['wildcard'] }, { text: 'Applied in the wrong direction or interface.', tags: ['acl'] }],
      diagnose: [
        { on: 'l3', cmd: 'show ip interface <interface> | include access list', why: 'Which ACL is applied in/out.', expect: 'The expected ACL and direction.' },
        { on: 'l3', cmd: 'show access-lists <name>', why: 'Entries and hit counters.', expect: 'Matches on the line you expect.' },
        { on: 'l3', cmd: 'clear access-list counters  → test again → show access-lists', why: 'See exactly which line the test traffic hits.', expect: 'Counter increases on the intended line.' }
      ],
      verify: [{ on: 'host', cmd: 'test the allowed traffic AND the traffic that should be blocked', expect: 'Allowed works, blocked is blocked.' }, { on: 'l3', cmd: 'show access-lists', expect: 'Counters increase on the right lines.' }]
    },
    {
      id: 'hsrp', title: 'Gateway redundancy (HSRP/VRRP) problems',
      keywords: ['hsrp', 'vrrp', 'glbp', 'virtual ip', 'standby', 'failover', 'redundancy', 'redundant', 'both active', 'active router'],
      tags: ['hsrp', 'redundancy', 'failover', 'gateway'],
      summary: 'Both routers need the same group number, virtual IP and version; the hosts must use the virtual IP as gateway; preempt decides whether the higher priority router takes over again.',
      questions: ['What does "show standby brief" show on both routers?', 'Do hosts use the virtual IP as default gateway?'],
      causes: [{ text: 'Different group / virtual IP / version.', tags: ['hsrp'] }, { text: 'Hosts use the physical IP instead of the virtual IP.', tags: ['gateway'] }, { text: 'Preempt missing.', tags: ['failover'] }, { text: 'The routers cannot see each other (VLAN/trunk).', tags: ['hsrp'] }],
      diagnose: [
        { on: 'l3', cmd: 'show standby brief', why: 'State, priority, active/standby, virtual IP.', expect: 'One Active, one Standby, same virtual IP.' },
        { on: 'l3', cmd: 'show standby', why: 'Details incl. preempt and hello timers.', expect: 'Same group/version on both.' }
      ],
      verify: [{ on: 'l3', cmd: 'shutdown the active router\'s interface → show standby brief', expect: 'The standby becomes Active; hosts keep connectivity.' }, { on: 'host', cmd: 'ping -t <remote> during failover', expect: 'Only a few lost packets.' }]
    },
    {
      id: 'dns', title: 'Name resolution (DNS) fails',
      keywords: ['dns', 'name resolution', 'resolve', 'nslookup', 'hostname', 'by name', 'domain name', 'google.com', 'www', 'url'],
      tags: ['dns', 'name resolution', 'dhcp'],
      summary: 'If ping to an IP works but ping to a name fails, the problem is DNS: no or wrong DNS server on the client (often from DHCP), or DNS traffic (UDP/TCP 53) blocked.',
      questions: ['Does ping by IP work?', 'Which DNS server does the client have?'],
      causes: [{ text: 'No dns-server in the DHCP pool.', tags: ['dns', 'dhcp'] }, { text: 'DNS server unreachable or UDP 53 blocked.', tags: ['acl'] }],
      diagnose: [
        { on: 'host', cmd: 'ipconfig /all', why: 'Which DNS server is configured.', expect: 'A reachable DNS server.' },
        { on: 'host', cmd: 'nslookup <name>', why: 'Ask the DNS server directly.', expect: 'An answer.' },
        { on: 'host', cmd: 'ping <dns-server-ip>', why: 'Reachability of the DNS server.', expect: 'Replies.' }
      ],
      verify: [{ on: 'host', cmd: 'nslookup www.cisco.com  and  ping www.cisco.com', expect: 'Name resolves and ping replies.' }]
    },
    {
      id: 'swmgmt', title: 'Cannot reach / manage a switch',
      keywords: ['switch ip', 'manage switch', 'reach the switch', 'ping the switch', 'switch management', 'management vlan', 'management ip', 'default-gateway', 'default gateway', 'svi'],
      tags: ['management', 'gateway', 'svi', 'native vlan', 'trunk'],
      summary: 'A layer-2 switch is a host: it needs an SVI in the management VLAN (up/up), the management VLAN must be carried on the uplink, and "ip default-gateway" must point to the router in that subnet.',
      questions: ['Can you ping the switch from the same subnet? From another subnet?'],
      causes: [{ text: 'No / wrong "ip default-gateway".', tags: ['gateway'] }, { text: 'Management SVI down or shut.', tags: ['svi'] }, { text: 'Management VLAN not carried on the trunk / native VLAN mismatch.', tags: ['trunk', 'native vlan'] }],
      diagnose: [
        { on: 'switch', cmd: 'show ip interface brief | include Vlan', why: 'SVI state and IP.', expect: 'Management SVI up/up.' },
        { on: 'switch', cmd: 'show running-config | include default-gateway', why: 'Gateway for remote subnets.', expect: 'A router IP in the management subnet.' },
        { on: 'switch', cmd: 'ping <default-gateway>', why: 'Reachability of the gateway from the switch.', expect: 'Replies.' },
        { on: 'switch', cmd: 'show interfaces trunk', why: 'Management VLAN on the uplink.', expect: 'Allowed and forwarding.' }
      ],
      verify: [{ on: 'host', cmd: 'ping <switch-ip>  and  ssh <switch-ip> from another subnet', expect: 'Both work.' }]
    },
    {
      id: 'ipv6', title: 'IPv6 connectivity problems',
      keywords: ['ipv6', 'v6', 'slaac', 'link-local', 'fe80', 'ospfv3', 'router advertisement', '2001:'],
      tags: ['ipv6'],
      summary: 'IPv6 routing must be enabled with "ipv6 unicast-routing"; without it the router does not forward and does not send router advertisements, so SLAAC hosts get no gateway.',
      questions: ['Do hosts get a global IPv6 address and a default gateway (fe80::...)?'],
      causes: [{ text: '"ipv6 unicast-routing" missing.', tags: ['ipv6'] }, { text: 'Missing IPv6 routes / OSPFv3 not enabled per interface.', tags: ['ipv6'] }],
      diagnose: [
        { on: 'l3', cmd: 'show ipv6 interface brief', why: 'Addresses and state.', expect: 'Global and link-local addresses, up/up.' },
        { on: 'l3', cmd: 'show ipv6 route', why: 'IPv6 routing table.', expect: 'Routes to remote prefixes.' },
        { on: 'host', cmd: 'ipconfig  |  ip -6 addr; ip -6 route', why: 'Host address and gateway.', expect: 'Global address and a fe80:: default gateway.' }
      ],
      verify: [{ on: 'host', cmd: 'ping -6 <remote-ipv6>', expect: 'Replies.' }]
    },
    {
      id: 'intermittent', title: 'Intermittent problems / duplicate addresses',
      keywords: ['intermittent', 'sometimes', 'randomly', 'flapping', 'comes and goes', 'drops out', 'duplicate', 'conflict', 'ip conflict', 'dupaddr'],
      tags: ['duplicate', 'ip conflict', 'intermittent', 'flapping', 'router-id', 'loop', 'duplex'],
      summary: 'Intermittent problems are often duplicate IP addresses, flapping links/neighbors, a duplex mismatch or a layer-2 loop.',
      questions: ['Is there a pattern (time of day, load, a specific host)?', 'Are there log messages (DUPADDR, MACFLAP, neighbor down)?'],
      causes: [{ text: 'Duplicate IP address (ARP changes).', tags: ['duplicate'] }, { text: 'Flapping interface or routing neighbor.', tags: ['flapping'] }, { text: 'Duplex mismatch under load.', tags: ['duplex'] }],
      diagnose: [
        { on: 'all', cmd: 'show logging', why: 'Look for DUPADDR, MACFLAP, UPDOWN, ADJCHG.', expect: 'No repeating messages.' },
        { on: 'l3', cmd: 'show ip arp <ip>  (repeat a few times)', why: 'The MAC for an IP should not change.', expect: 'Stable MAC.' },
        { on: 'all', cmd: 'show interfaces | include line protocol|resets|errors', why: 'Flapping or erroring interfaces.', expect: 'No resets/errors increasing.' }
      ],
      verify: [{ on: 'host', cmd: 'ping -t <destination> for several minutes', expect: 'No loss.' }, { on: 'all', cmd: 'show logging', expect: 'No new error messages.' }]
    }
  ];

  CCA.playbooks = PLAYBOOKS;
  if (typeof module !== 'undefined' && module.exports) module.exports = CCA;
})(typeof window !== 'undefined' ? window : globalThis);
