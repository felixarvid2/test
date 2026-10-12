# Cisco Config Analyzer

A browser tool that reads `show running-config` output from Cisco IOS/IOS-XE routers and switches, finds configuration faults, and helps you troubleshoot a problem you describe in plain English.

Everything runs locally in the browser. No installation, no server, and configs are never uploaded.

## Start

Open `index.html` in Chrome, Edge or Firefox. You can also serve the folder, for example with `npx http-server cisco-analyzer`.

1. **Configs**: drop one or more config files, or paste the output (several devices in one paste works). Loading a device that is already loaded replaces it and shows which problems were resolved. Two example labs with deliberate faults are included: *Branch office* (R1, R2, SW1) and *Campus* (HQ-RTR, BR-RTR, DSW1, ASW1).
2. **Findings**: every problem the analyzer found, grouped by severity, device or category. Each one has an explanation, a link to the config line, a suggested fix you can copy, and the commands that show the fix worked. You can ignore findings, build a **fix script** per device, and export a Markdown report or JSON.
3. **Troubleshoot**: describe the problem in English or Swedish, for example "PCs in VLAN 20 don't get an IP address" or "I can't SSH to SW1 from 192.168.10.20". The assistant then:
   - works out what kind of problem it is (DHCP, inter-VLAN, trunk, NAT/Internet, OSPF/EIGRP/RIP/BGP, SSH/Telnet, interface down, err-disabled, slow/duplex, STP loop, EtherChannel, ACL, HSRP, DNS, IPv6, intermittent),
   - picks out VLANs, IP addresses, interfaces, device names and services from your text and shows what the configs say about them,
   - runs a **path analysis** hop by hop, both forward and back, through routing tables, ACLs, NAT and VTY lines,
   - ranks the findings in your configs that best explain the problem,
   - gives a step-by-step test plan saying which command to run on which device and what output to expect,
   - gives a checklist for verifying that the problem is solved.
4. **Network**: a topology diagram, devices, links found automatically, an estimated routing table for each device, and a path tester.

Keyboard: <kbd>1</kbd>–<kbd>4</kbd> switch tab, <kbd>/</kbd> searches findings, <kbd>T</kbd> switches theme, <kbd>?</kbd> shows help. See [CHANGELOG.md](CHANGELOG.md) for everything added in version 2.

## What is checked

| Area | Examples |
|---|---|
| Interfaces | duplicate or overlapping IPs, network/broadcast address used, shut-down interfaces that are configured, subinterface without `encapsulation dot1Q` or tagged with the wrong VLAN, half duplex |
| VLANs / switching | access VLAN missing, VLAN not carried on any trunk, SVI without VLAN or ports, trunk/access mismatch, native VLAN mismatch, allowed-VLAN mismatch, DTP auto/auto, router-on-a-stick VLANs not allowed on the switch trunk, EtherChannel inconsistencies, VTP domains |
| Routing | OSPF/EIGRP subnet mask used instead of a wildcard, network statements that match no interface, adjacency problems between devices (area, timers, authentication, MTU, passive, AS, K-values, RIP version), duplicate router IDs, static routes with an unreachable next hop, missing default route, auto-summary, BGP remote-as and multihop |
| ACL | undefined ACL applied, ACL with only deny entries, entries that can never match (shadowed), subnet mask used as a wildcard, ACLs that block OSPF/EIGRP/RIP/BGP/DHCP |
| NAT | no inside/outside interfaces, missing pool or ACL, inside subnets not covered by the NAT ACL |
| DHCP | default-router outside the pool or not a real gateway, missing relay (`ip helper-address`), no DNS server, mask differs from the interface |
| HSRP | virtual IP outside the subnet, group/VIP/version mismatch between routers, equal priority without preempt |
| Layer-2 security | DHCP snooping and DAI with untrusted uplinks, option 82, BPDU filter, errdisable recovery, spanning-tree root placement |
| WAN & tunnels | serial encapsulation, PPP authentication and clock rate, GRE tunnel source/destination and recursive routing |
| AAA & references | missing AAA method lists, AAA lock-out, undefined key chains, route-maps, prefix-lists and object-groups |
| Management & security | default gateway on L2 switches, missing `ip routing` on L3 switches, Telnet, VTY login that cannot work, SSH prerequisites, enable password, SNMP public/private, banner, unused ports, BPDU guard |

Links between devices are found from shared subnets (layer 3) and from interface descriptions that name another loaded device, such as `description Trunk to SW1 Gi0/1` (layer 2).

## Limitations

- The analysis is rule-based and uses only the configuration. Link state, CDP, learned MACs, RSA keys and the VLAN database on VTP servers are not in `show running-config`. Always confirm on the device with the `show` commands the tool suggests.
- The path simulation covers connected routes, static routes, OSPF, EIGRP and RIP, ACLs (including object-groups), NAT and VTY lines. It does not cover BGP route propagation, routing inside VRFs or policy routing.
- ASA and NX-OS configurations are detected and flagged, but only IOS/IOS-XE syntax is analysed.

## Development

```
npm test                                   # unit tests (node test/run.js)
npm run test:ui                            # browser smoke test, needs Playwright
npm run samples                            # regenerate js/samples.js after editing samples/<lab>/*.txt
node tools/build-single.js out.html        # one self-contained HTML file
node tools/build-single.js out.html --no-download --fragment   # for hosts that block downloads and add their own <head>
```

| File | Contents |
|---|---|
| `js/net.js` | IPv4 and interface-name helpers |
| `js/parser.js` | turns the running-config into a device model |
| `js/topology.js` | links, protocol adjacencies, estimated routing tables, ACL evaluation, path tracing |
| `js/checks.js` | the core rules (findings with fix and verification) |
| `js/checks-extra.js` | AAA, references, DHCP snooping/DAI, STP, tunnels, IPv6, serial, NAT/DHCP sanity, static-route loops |
| `js/diagram.js` | the SVG topology diagram |
| `js/playbooks.js` | troubleshooting knowledge base (causes, test steps, verification) |
| `js/assistant.js` | matches a problem description against the playbooks and the configs |
| `js/app.js` | user interface |
