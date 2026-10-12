# Changelog

## 2.0 – 100 improvements

### Reading configurations (parser)
1. Strips a UTF-8 byte-order mark and normalises Windows/Mac line endings.
2. Turns tabs into spaces so indentation from editors and terminal logs still nests correctly.
3. Removes `--More--` pager leftovers and backspaces from terminal captures.
4. Ignores more prompt lines in pastes (`R1#more`, `R1#terminal length 0`, `R1#write`, an empty `R1#`).
5. Reads VRF definitions (`ip vrf` / `vrf definition`).
6. Reads IPv6 static routes.
7. Reads OSPFv3 processes and per-interface `ipv6 ospf` / `ospfv3` settings.
8. Reads key chains and counts their keys.
9. Reads route-maps.
10. Reads prefix-lists.
11. Reads AAA login method lists.
12. Reads DHCP snooping: global switch, VLANs, option 82 and trusted ports.
13. Reads Dynamic ARP Inspection: VLANs and trusted ports.
14. Reads spanning-tree priorities, `root primary/secondary` and `portfast bpduguard default`.
15. Reads errdisable recovery, log timestamps, logging buffer and time zone.
16. Reads network object-groups (hosts, subnets, CIDR, ranges and nested groups).
17. Reads `ip nat outside source static`.
18. Reads tunnel source, destination and mode.
19. Reads OSPF stub/NSSA areas, reference bandwidth, area ranges and `ip ospf mtu-ignore`.
20. Reads BPDU filter, STP guard, proxy-ARP and DHCP snooping rate limits on interfaces.
21. Reads suspended or shut-down VLANs.
22. Detects ASA and NX-OS configurations instead of silently misreading them.

### Network model and path simulation
23. Interfaces in a VRF are kept out of the global routing table and adjacency calculations.
24. Mask-mismatch detection ignores addresses that are in different VRFs.
25. ACL evaluation understands object-groups.
26. OSPF neighbours with different stub/NSSA flags are no longer counted as adjacent.
27. `ip ospf mtu-ignore` is respected.
28. Interfaces with `ip address dhcp` get the default route a DHCP server normally provides.
29. The path trace stops correctly at a DHCP-learned default route.
30. Devices are grouped into physically connected networks, so unrelated labs loaded together stay apart.

### New checks
31. Missing AAA login method list on a line (critical).
32. `login authentication` used without `aaa new-model`.
33. `aaa new-model` with no method list and no local users (lock-out risk).
34. Console line without any password.
35. Switch hardened only on `line vty 0 4` while lines 5–15 stay open.
36. EIGRP key chain missing or empty.
37. Route-map referenced but not defined.
38. Prefix-list referenced but not defined.
39. Object-group referenced by an ACL but not defined.
40. DHCP snooping enabled for no VLAN.
41. DHCP snooping uplink not trusted, so offers are dropped (critical).
42. DHCP snooping option 82 rejected by IOS DHCP servers/relays.
43. DAI enabled without DHCP snooping (critical).
44. DAI uplink not trusted (critical).
45. Port-security/BPDU guard used without errdisable recovery.
46. BPDU filter on an interface.
47. Management address on VLAN 1.
48. Access port in a suspended VLAN.
49. Trunk with `allowed vlan none`.
50. Tunnel without source or destination.
51. Tunnel source interface missing, shut down or without an address.
52. No route to the tunnel destination.
53. Recursive routing: tunnel destination routed through the tunnel.
54. OSPFv3 without `ipv6 unicast-routing`.
55. IPv6 static routes without `ipv6 unicast-routing`.
56. OSPFv3 process without interfaces.
57. `default-information originate` on a router that has no default route.
58. All OSPF interfaces passive.
59. All EIGRP interfaces passive.
60. Static route to a directly connected network.
61. Static route destination with host bits set.
62. ACL address with bits set inside the wildcard.
63. Invalid NAT pool (start after end, different subnets).
64. NAT pool too small without overload.
65. DHCP pool where every address is excluded.
66. Overlapping DHCP pools.
67. No route to the DHCP server in `ip helper-address`.
68. Default hostname (`Router`/`Switch`).
69. Logging and time: NTP, log timestamps and log buffer in one finding.
70. CDP enabled on the Internet-facing interface.
71. Serial encapsulation mismatch (HDLC vs PPP) between two routers.
72. PPP authentication configured on only one side.
73. Serial back-to-back link without a clock rate on either end.
74. Different `bandwidth` on the two ends of a link.
75. Different OSPF reference bandwidth between routers.
76. No switch configured as spanning-tree root.
77. Two switches tied for root priority.
78. Duplicate IPv6 addresses between devices.
79. Static-route loops between routers, reported once per prefix.
80. Static route into a router that has no route onwards (black hole).
81. HSRP routers with equal priority and no preempt.
82. OSPF stub/NSSA flag mismatch, with explanation and fix.

### Troubleshooting assistant
83. Understands Swedish descriptions ("får ingen IP-adress", "kan inte nå", "segt", "nere" …).
84. Unicode-aware word matching, so å/ä/ö words are recognised.
85. Understands informal English ("can't", "doesn't work", "broken").
86. "from X to Y" decides the direction of the path analysis.
87. Device names can be the source or destination of the path analysis.
88. A network written as CIDR (`10.1.1.0/24`) stands for a host in it.
89. With the same VLAN number in several networks, the host is placed in the network that can reach the other end.
90. New playbooks: serial/WAN links and GRE/VPN tunnels.
91. DHCP playbook covers DHCP snooping; remote-access playbook covers AAA.
92. Each recognised topic shows how strongly it matched.

### User interface
93. Theme switch (system, light, dark), remembered.
94. Keyboard shortcuts (1–4, /, T, ?), a help dialog, arrow keys between tabs and `#findings`-style links to a tab.
95. Status messages (toasts) for loading, removing and ignoring.
96. Loading a device that is already loaded replaces it, and a "Changes since the previous analysis" panel lists resolved and new problems.
97. Two example labs (branch office and campus) with a selector.
98. "Fix script" per device: every fix in one `configure terminal` block plus the verification commands.
99. Findings can be ignored (remembered in the browser) and shown again with "Show ignored".
100. Findings can be grouped by severity, device or category, with expand/collapse all.
101. Report as Markdown grouped by device, plus JSON export, both with Copy and Download.
102. Config viewer: search, coloured markers on lines with findings, "Hide secrets" and Copy; Esc closes it from the search box.
103. Topology diagram with problem links in red; click a device to open its routing table.
104. Path tester: swap source/destination, Enter to run, hop count, warning when an ACL uses syntax that cannot be evaluated.
105. Troubleshoot tab: recent problems, the draft is kept, Clear button, "Copy the whole plan", steps grouped by device with "Copy all commands", progress on the verification checklist and highlighted recognised items.
106. Severity bar and per-device buttons (Findings, Fix script, Config) on the Configs tab.
107. Skip link, ARIA tabs, reduced-motion support, print styles, safe-area padding and clearer empty states.
108. Binary or non-config files are skipped with a message.

### Tooling
109. 67 unit tests (up from 38) covering the new rules, the parser and the assistant.
110. Browser smoke test (`node test/ui.js`) that clicks through every tab on desktop and phone width.
111. `tools/build-single.js` builds a single self-contained HTML file.
112. `package.json` with `test`, `test:ui`, `samples` and `build` scripts.
