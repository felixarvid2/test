# 200 förbättringar av vlantool

Listan är uppdelad i sex områden. Varje område har egna filer så att arbetet kan göras parallellt
utan krockar. Status fylls i när arbetet är klart: ✅ gjord, ➖ inte gjord (med anledning).

## Gemensamma överenskommelser

**Rader som generatorn (område B) skriver och reglerna (område A) godkänner.** Exakt syntax:

| Regel-id (A) | Generatorn (B) skriver |
|---|---|
| `ssh-timeout` | `ip ssh time-out 60` |
| `ssh-retries` | `ip ssh authentication-retries 3` |
| `login-block` | `login block-for 120 attempts 3 within 60` |
| `source-route` (router) | `no ip source-route` |
| `cdp-wan` (router) | `no cdp enable` i interfacet som har `ip nat outside` |
| `vty-acl` | `access-list 10 permit <hanteringsnät> <wildcard>` och ` access-class 10 in` i varje `line vty` |
| `dtp` | ` switchport nonegotiate` på alla access- och trunkportar (finns redan) |
| `stp-root` | `spanning-tree vlan <alla VLAN på switchen> priority 4096` på switchen med trunk mot routern |
| `clock` | `clock timezone CET 1 0` (inställningen `timezone`, standard `"CET 1 0"`) |
| `banner-welcome` | Bannern får inte innehålla "välkommen"/"welcome" (standardbannern gör inte det) |
| `logging-trap` | ingen `logging trap debugging` (generatorn skriver `logging trap informational`) |

Regler med nivån **Info** får ge fynd på genererade konfigar (t.ex. `port-security`, `dhcp-snooping`, `aaa`).
Allt på nivån Låg eller högre ska vara borta från genererade konfigar.

**Kommentarer i konfigar som styr granskningen** (område C läser dem, område E skriver dem):
- `! vlantool:ignore <regel-id>` – regeln hoppas över för hela enheten
- `! vlantool:ignore <regel-id> <text>` – bara fynd vars meddelande innehåller `<text>` hoppas över

**Inga nya beroenden** i `Cargo.toml` utom där det står uttryckligen (D får lägga till `clap_complete`).

---

## A. Regler – `src/rules.rs`

1. Ny regel `ssh-timeout`: `ip ssh time-out` saknas eller > 60 s (Låg)
2. Ny regel `ssh-retries`: `ip ssh authentication-retries` saknas eller > 3 (Låg)
3. Fixen för regeln `ssh` innehåller även `crypto key generate rsa modulus 2048` som kommentar/påminnelse
4. Ny regel `aaa`: `aaa new-model` saknas (Info)
5. Ny regel `login-block`: `login block-for` saknas – skydd mot lösenordsgissning (Låg)
6. Ny regel `cdp-wan` (router): interface med `ip nat outside` saknar `no cdp enable` (Låg)
7. Ny regel `source-route` (router): `no ip source-route` saknas (Låg)
8. Ny regel `small-servers`: `service tcp-small-servers`/`udp-small-servers`/`ip finger` är på (Medel)
9. Ny regel `vty-acl`: vty-linjer utan `access-class` (Låg)
10. Regeln `login` kontrollerar även att `line con 0` har inloggning (Medel)
11. Ny regel `aux`: `line aux 0` finns utan `no exec` (Låg)
12. Ny regel `unused-ports` (switch): portar utan beskrivning och utan switchport-konfig som inte är avstängda (Låg)
13. Ny regel `blackhole-vlan` (switch): avstängda accessportar ligger i VLAN 1 istället för ett oanvänt VLAN (Info)
14. Ny regel `dtp` (switch): access- och trunkportar utan `switchport nonegotiate` (Låg)
15. Ny regel `port-security` (switch): aktiva accessportar utan `switchport port-security` (Info)
16. Ny regel `vtp`: `vtp mode server`/`client` med `vtp domain` men utan `vtp password` (Låg)
17. Ny regel `stp-root` (switch): switch med fler än en trunk saknar `spanning-tree vlan … priority` (Info)
18. Ny regel `dhcp-snooping` (switch): accessportar finns men `ip dhcp snooping` saknas (Info)
19. Ny regel `mgmt-vlan1`: `interface Vlan1` har en IP-adress (Medel)
20. Ny regel `vlan1-shutdown`: `interface Vlan1` är inte avstängt fast ett annat SVI används (Låg)
21. Ny regel `duplex`: `duplex half` på något interface (Medel)
22. Ny regel `hostname-format`: hostname med otillåtna tecken eller längre än 63 tecken (Medel)
23. Ny regel `name-server`: DNS-uppslag är på men `ip name-server` saknas (Info)
24. Ny regel `clock`: `clock timezone` saknas (Info)
25. Ny regel `logging-trap`: `logging trap debugging` skickar för mycket till loggservern (Låg)
26. Ny regel `banner-welcome`: bannern innehåller "välkommen"/"welcome" (Låg)
27. Ny regel `secret-type`: `secret 5` (MD5) används – rekommendera `algorithm-type scrypt`/typ 9 (Info)
28. Ny regel `snmp`: `snmp-server community public|private` eller en community med `RW` (Hög)
29. Ny regel `https-auth`: `ip http secure-server` utan `ip http authentication local` (Låg)
30. Ny regel `static-route` (router): nästa hopp i `ip route` ligger inte i något anslutet nät (Medel)
31. Ny regel `acl-unused`: access-list som inte används av interface, NAT eller vty (Info)
32. Ny regel `acl-missing`: `ip access-group`/`access-class` pekar på en ACL som inte finns (Hög)
33. Ny regel `dhcp-overlap` (router): två DHCP-pooler med överlappande nät (Hög)
34. Ny regel `dhcp-excluded`: `ip dhcp excluded-address` som inte ligger i någon pool (Låg)
35. Ny regel `ip-netaddr`: interface-IP som är nät- eller broadcastadress (Hög)

## B. Kärna – `src/parser.rs`, `src/inventory.rs`, `src/generator.rs`, `src/net.rs`, `src/settings.rs`, `src/project.rs`

36. Parser: flerradig `banner motd ^C … ^C` blir ett enda block och skapar inga falska block
37. Parser: `interface range Fa0/1 - 24` expanderas till enskilda interface
38. Parser: `switchport voice vlan` → `Interface::voice_vlan`
39. Parser: flera `switchport trunk allowed vlan add/remove`-rader räknas ihop rätt
40. Parser: `ip address … secondary` → `Interface::secondary`
41. Parser: `ip helper-address` → `Interface::helpers`
42. Parser: `channel-group N mode …` → `Interface::channel_group`
43. Parser: `speed`/`duplex` → `Interface::speed`, `Interface::duplex`
44. Parser: `switchport port-security` → `Interface::port_security`
45. Parser: `ip access-group X in|out` → `Interface::acl_in`, `Interface::acl_out`
46. Parser: utdata från `show running-config` ("Building configuration...", "Current configuration : …") ignoreras
47. Parser: CRLF-radslut och tabbar normaliseras
48. Parser: `ip routing` → `Config::ip_routing`
49. Parser: `version 15.1` → `Config::version`
50. Parser: `Config::acl_names()` – alla ACL-namn/nummer som definieras
51. CSV: nätadress som inte är nätets första adress (t.ex. 192.168.1.5 med /26) ger en varning
52. CSV: hostnames kontrolleras (tillåtna tecken, längd)
53. CSV: VLAN-nummer utanför 1–4094 i listan över tillåtna VLAN ger fel
54. CSV: semikolonseparerade filer (svenskt Excel) känns igen automatiskt
55. CSV: rubriker matchas utan hänsyn till versaler/gemener
56. CSV: Status tolkar Up/Down/Upp/Nere/Ja/Nej/On/Off
57. CSV: valfri kolumn `Voice_Vlan` i ports.csv
58. CSV: valfri kolumn `Port_Security` (max antal MAC-adresser) i ports.csv
59. CSV: valfria kolumner `Plats` och `Modell` i devices.csv sparas och följer med
60. CSV: trunkar kontrolleras åt båda håll via beskrivningen "mot X" (samma tillåtna VLAN och native)
61. CSV: varning om en DHCP-pool har färre lediga adresser än accessportar i VLAN:et
62. Generator: `ip ssh time-out 60` och `ip ssh authentication-retries 3`
63. Generator: `login block-for 120 attempts 3 within 60`
64. Generator: `no ip source-route` och `no cdp enable` på WAN-porten (router)
65. Generator: `clock timezone` från inställningen `timezone`
66. Generator: ACL 10 för hanteringsnätet och `access-class 10 in` på vty (inställningen `vty_acl`, standard på)
67. Generator: `switchport port-security` (+ `maximum`) när kolumnen `Port_Security` är satt
68. Generator: `switchport voice vlan` när kolumnen `Voice_Vlan` är satt
69. Generator: `spanning-tree vlan … priority 4096` på switchen med trunk mot routern
70. Generator: `ip dhcp snooping` och `ip dhcp snooping trust` på trunkar (inställningen `dhcp_snooping`, standard av)
71. Generator: `logging trap informational`
72. Generator: beskrivningar rensas (radbrytningar bort, max 240 tecken) och `^` i bannern ersätts
73. Generator: test som visar att utdata är deterministisk (samma indata → identisk text)
74. Inställningar: `Settings::validate()` kontrollerar IP-adresser, masker och VLAN-nummer
75. Nät: `Subnet::is_private()` och `Subnet::hosts()` (iterator)

## C. Granskning och rapporter – `src/audit.rs`, `src/report.rs`, `src/diff.rs`, `src/topology.rs`, `src/finding.rs`, ny `src/baseline.rs`

76. `! vlantool:ignore <regel> [text]` i en konfig hoppar över fynd (se överenskommelsen ovan)
77. Avdraget per regel begränsas till 25 poäng så att en regel med många fynd inte nollar enheten
78. `FleetReport::summary()` med totaler per nivå och kategori
79. `DeviceReport::category_scores()` – betyg per kategori (Åtkomst, VLAN, …)
80. Mellan enheter: trunk tillåter VLAN som inte finns på switchen i andra änden
81. Mellan enheter: två konfigar med samma hostname
82. Mellan enheter: switchens SVI-nät matchar inte routerns subinterface för samma VLAN
83. Mellan enheter: olika native-VLAN på olika trunkar i nätet
84. Mellan enheter: samma nät används i två olika VLAN
85. HTML: staplar med betyg per kategori för varje enhet
86. HTML: sökfält och filter per nivå (lite inbäddad JavaScript)
87. HTML: utskriftsvänlig stilmall
88. HTML: topologin som inbäddad SVG
89. HTML: `html_with_meta(fleet, titel, tidsstämpel)` med projektnamn och tid i rubriken
90. Markdown: innehållsförteckning
91. JSON: regelns titel, kategori och förklaring följer med varje resultat
92. CSV: `csv_excel()` med semikolon och BOM för svenskt Excel
93. Nya format `Format::Sarif` (GitHub code scanning) och `Format::Junit` (CI)
94. Terminal: långa meddelanden radbryts efter terminalens bredd
95. Terminal: i utförligt läge visas regelns förklaring
96. Diff: `diff_semantic` jämför block utan hänsyn till ordning
97. Diff: ordnivå-markering av ändrade rader i terminalen
98. Topologi: `topology::dot()` – Graphviz
99. Topologi: `topology::mermaid()` – Mermaid
100. Topologi: slingor i nätet (redundanta länkar) upptäcks och rapporteras som Info
101. Fynd: stabilt `Finding::id()` (hash av enhet, regel och meddelande)
102. Ny modul `baseline.rs`: spara fynd och jämför mot en tidigare körning (nya/åtgärdade)
103. `report::summary_text()` – en mening som sammanfattar läget
104. `Severity::from_str` tolkar svenska och engelska namn
105. Test för allt ovan

## D. Kommandorad och TUI – `src/main.rs`, `src/tui.rs` (+ `clap_complete` i Cargo.toml)

106. `audit --format sarif|junit` och filändelserna `.sarif`/`.xml`
107. `rules --format markdown` skriver regellistan som Markdown
108. `explain <regel>` visar förklaring och exempel på rättning
109. `watch` granskar om när filer ändras
110. `completions <skal>` skriver skalkomplettering (bash, zsh, fish)
111. Global flagga `--quiet`
112. `audit --summary` – en rad per enhet
113. `init --example` skapar ett exempelprojekt
114. `generate --only <enhet>`
115. `generate` visar +/− rader mot befintliga filer
116. `validate --format json`
117. `subnet --json`
118. Nytt kommando `inventory` visar tabeller över portar, DHCP och enheter
119. Nytt kommando `stats` – portar per VLAN, beläggning i DHCP-pooler
120. `validate --fail-on` och dokumenterade felkoder
121. Global flagga `--project <mapp>` (och `VLANTOOL_PROJECT`)
122. TUI: sök bland fynd med `/`
123. TUI: filtrera på nivå med `f`
124. TUI: Enter på ett fynd hoppar till raden i konfigfliken
125. TUI: flik för drift
126. TUI: flik för CSV-kontroll
127. TUI: musstöd (klicka på flikar och enheter, scrolla)
128. TUI: ljust tema med `t`
129. TUI: kopiera rättning till urklipp med `c` (OSC 52)
130. TUI: sök i konfigfliken
131. TUI: statusraden visar projektmapp och tid för senaste inläsning
132. TUI: läser om automatiskt när filer ändras
133. TUI: hjälpen listar alla tangenter
134. TUI: smalt fönster (< 100 kolumner) döljer sidopanelen
135. TUI: flik med regler och status per enhet

## E. Skrivbordsprogrammet – `src/gui/`

E1 (`views/mod.rs`, `overview.rs`, `findings.rs`, `config.rs`, `state_a.rs`, `app.rs`, `theme.rs`, ny `views/rules.rs`):

136. Kommandopalett (Ctrl+K) för flikar, enheter och åtgärder
137. Fynd: "Alla enheter" visar fynd från hela nätet
138. Fynd: gruppera per regel
139. Fynd: knappen "Ignorera" skriver `! vlantool:ignore <regel>` i konfigen
140. Konfig: sökfält med markering och nästa/föregående
141. Konfig: textstorlek med Ctrl + / Ctrl −
142. Konfig: markeringar för fynd längs rullningslisten
151. Översikt: betygshistorik (sparas i `.vlantool/history.json` i projektet) som linjediagram
152. Översikt: staplar per kategori
153. Översikt: "Viktigast att åtgärda" – de fem allvarligaste fynden i nätet
164. Ny flik Regler: alla regler med status per enhet
165. Läser om automatiskt när filer i projektet ändras
166. Säkerhetskopia av configs/ till `configs/.backup/<tid>/` innan generering skriver över
167. Senaste projekt i projektmenyn i rubriken
168. Dra och släpp .cfg-filer på fönstret kopierar dem till configs/
169. Piltangenter i fyndlistan
170. Högst fyra notiser samtidigt; klick stänger
171. Fönstertiteln visar projekt och betyg
172. Senaste flik och enhet sparas per projekt
173. Textstorlek för hela programmet (Ctrl+= / Ctrl+-) som sparas
174. Högkontrasttema
175. Statusrad längst ner: projektmapp, senaste inläsning, antal fynd
178. "Kopiera sammanfattning" lägger en Markdown-sammanfattning i urklipp
179. Enhetslistan: sortera på betyg/namn och filtrera på text
180. Enhetslistan: färgad kant efter allvarligaste fynd
181. Fynd: nivåetiketterna fungerar som filterknappar
182. Hjälpfönster (F1) med alla kortkommandon

E2 (`views/ports.rs`, `vlans.rs`, `topo.rs`, `drift.rs`, `csv.rs`, `subnet.rs`, `settings.rs`, `state_b.rs`, `folder.rs`):

143. Portar: filter på läge/VLAN och sortering per kolumn
144. Portar: kopiera tabellen som CSV
145. VLAN: klick på ett VLAN visar detaljer (portar i alla enheter, nät, DHCP-pool)
146. Topologi: hovra över en länk visar tillåtna VLAN och native
147. Topologi: välj ett VLAN och se vilka länkar som bär det
148. Topologi: exportera som SVG
149. Topologi: zoomknappar + och −
150. Topologi: länkar med fel mellan enheterna markeras
154. Drift: sida-vid-sida-läge
155. Drift: "Skriv över bara denna" per enhet
156. CSV: redigera ports.csv i tabellen och spara
157. CSV: lägga till och ta bort rader
158. CSV: redigera dhcp.csv och devices.csv
159. CSV: klick på ett valideringsfel markerar raden
160. Subnät: kopiera tabellen som text och visa adressen binärt
161. Subnät: "Använd planen" skriver VLSM-planen till dhcp.csv (efter bekräftelse)
162. Inställningar: ogiltiga IP-adresser markeras direkt
163. Inställningar: osparade ändringar syns i sidomenyn
176. Välkomstsidan: "Öppna senaste" som stor knapp när det finns ett senaste projekt
177. Exportdialog med kryssrutor för format och "öppna mappen efteråt"
183. Mappväljaren: klickbar sökväg (brödsmulor)
184. Mappväljaren: tangentbord (Enter öppnar, Backsteg går upp)
185. Prestanda: topologigrafen och VLAN-matrisen räknas bara om vid inläsning

## F. Paketering, dokumentation och tester – `.github/workflows/`, `packaging/`, `tests/`, `README.md`, `CHANGELOG.md`

186. GitHub Actions: `cargo test` och `cargo clippy` för vlan-tool-rs
187. GitHub Actions: bygger .deb som artefakt
188. AppStream-metadata (`se.nordvik.vlantool.metainfo.xml`) i paketet
189. Man-sidor för `vlantool` och `vlantool-gui` i paketet
190. Skalkomplettering i paketet (om `vlantool completions` finns)
191. `changelog.Debian.gz` och fler fält i control (Vcs-Git)
192. `build-deb.sh --no-build` och en sha256-fil bredvid paketet
193. README: felsökning (OpenGL, Wayland/X11)
194. CHANGELOG.md
195. `docs/regler.md` med alla regler
196. Integrationstester i `tests/cli.rs` som kör binären
197. Tester för nät-matten (split, summarize, VLSM) över många fall
198. Robusthetstest: slumpade konfigar får inte få parsern att krascha
199. Golden-test: genererade konfigar jämförs med sparade facit i `tests/golden/`
200. `rustfmt.toml`, `.editorconfig` och `cargo fmt --check` i CI
