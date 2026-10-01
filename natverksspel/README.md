# Krabba-passet

Ett spel för kursen Nätverksteknik, i 3D eller 2D. Du är ny nätverkstekniker på Nordvik och går runt på huvudkontoret i Göteborg och på lagret i Borås. Varje vecka har "Krabban" gjort sönder två saker i racket, och en kollega har ett ärende till dig. Du kopplar in konsolkabeln i Cisco-utrustningen, felsöker med riktiga CLI-kommandon, rättar felet och skriver en felrapport.

Nätet, adressplanen, utrustningen och felen följer kursboken *Nätverksteknik – Från sladden och uppåt*: kapitel 1–10, bilaga D (felbiblioteket) och bilaga G (racket och Nordviks adressplan).

## Starta

Spelet är helt statiskt och behöver ingen installation eller internetuppkoppling (three.js ligger i `lib/`).

- **Enklast:** öppna `index.html` i Chrome, Edge eller Firefox.
- **Eller via en lokal webbserver:** `npx http-server natverksspel` och gå till `http://localhost:8080`.

3D-läget kräver WebGL. 2D-läget fungerar i alla moderna webbläsare – saknas WebGL startar spelet i 2D.

Spelet väljer grafiknivå automatiskt (Minimal, Låg, Medel, Hög eller Ultra) efter grafikkort, minne och om det är en mobil. Nivån kan ändras under Inställningar. Går det trögt föreslår spelet självt en lägre nivå och fortsätter veckan efter omladdningen.

På **mobil och surfplatta** styr du med en styrspak nere till vänster och knappar till höger, drar med fingret för att titta i 3D och trycker direkt på saker för att använda dem. ☰ uppe till höger har alla funktioner, och terminalen får en rad med Tab, ?, pilar, Ctrl+C, Ctrl+Z och Ctrl+A K. Mobiler startar i 2D, men 3D finns i menyn. Liggande läge rekommenderas.

## 3D eller 2D

Välj visning i startmenyn (valet sparas och kan bytas mitt i en vecka via menyn).

- **3D** – förstaperson i ett stiliserat kontor med glöd, reflektioner, solstrålar och partiklar. Klicka i bilden för att styra med musen. Fungerar inte pekarlåset (t.ex. i en inbäddad vy) kan du i stället hålla ned vänster musknapp och dra för att titta. Högerklick eller Z zoomar in, t.ex. för att läsa portnummer.
- **2D** – en 16-bitars pixelvärld sedd snett uppifrån, i stil med SNES-rollspel. Samma kontor, rack, kollegor och fel, men du går med WASD eller klickar där du vill gå. Klicka på ett rack, en dator eller en person för att gå dit och använda det. Pratbubblor visar vem som har ett ärende (!) och vem du har hjälpt (✓). Väggar tonas ut när du går bakom dem.

## Styrning

| Tangent | Gör |
|---|---|
| W A S D / pilar, Shift | Gå, spring |
| Mus (3D) | Titta – klicka i bilden, eller håll och dra |
| Högerklick / Z (3D) | Zooma |
| Klick (2D) | Gå dit / använd det du klickar på |
| Mushjul / + − (2D) | Zooma |
| E / Mellanslag / Enter | Använd: koppla in konsol, prata, använda dator |
| T | Öppna laptopen |
| F | Skriv felrapport |
| L | Ledtråd (FASTNAR DU HÄR?) |
| H | Handbok: kommandon, felbibliotek, adressplan, subnätkalkylator, OSI, ordlista |
| Tab | Ärendelistan (med arkiv över inlämnade rapporter) |
| M | Karta med snabbresa |
| N | Anteckningar |
| O | Kommandologg |
| U | Dölj/visa HUD |
| F1 | Hjälp |
| C / Ctrl (3D) | Huka |
| Mellanslag (3D) | Hoppa |
| V (3D) | Ficklampa |
| G | Nätverksglasögon |
| R | Spela upp senaste pingspåret |
| J | Karriär, prestationer och statistik |
| K | Minikarta |
| P | Fotoläge |
| Z / X (2D) | Zooma in / ut |
| 1–9 (menyn) | Starta en vecka |
| Esc | Paus / stäng |

I terminalen fungerar `?`, Tab, → (ta den grå kompletteringen), ↑/↓, Ctrl+C, Ctrl+Z, Ctrl+A K (stäng `screen`), Ctrl+L (rensa), Ctrl+U (rensa raden), Ctrl+W (ta bort ordet), Ctrl+F (sök), Ctrl + / Ctrl − (textstorlek), F11 eller ⛶ (helskärm), Ctrl+Shift+C (kopiera markering) och PageUp/PageDown. Klicka på en IP-adress för att pinga den och på ett portnamn för `show interfaces`.

### På mobilen

Spelet går att spela på en pekskärm och startar då i 2D. Styrspaken nere till vänster styr, knapparna till höger använder, springer, hoppar och hukar, och ☰ uppe till höger öppnar alla funktioner. I 3D drar du med fingret för att titta och trycker på det du vill använda. Nyp med två fingrar för att zooma i 2D. I terminalen finns en tangentrad med Tab, ?, pilar, Ctrl+C, Ctrl+Z och Ctrl+A K.

### Grafiknivåer

Spelet väljer själv en nivå efter grafikkort, minne och om det är en mobil (Automatiskt). Du kan också välja Minimal, Låg, Medel, Hög eller Ultra i inställningarna. Går spelet trögt föreslår det en lägre nivå, och din vecka fortsätter där du var efter omladdningen.

Routrar och switchar har inget enable-lösenord: via konsolkabeln kommer du rakt in med `enable`. Bara SSH kräver inloggning, med kontot som står på lappen vid laptopen: `drift` / `nordvik`. Skriver du fel lösenord visar terminalen vilket som gäller. I byggena sätter du själv SSH-kontot med `username drift privilege 15 secret nordvik`.

## Bygg från grunden

Överst i menyn finns fem byggen där enheterna kommer fabriksinställda (`Switch>` / `Router>`, inga VLAN, alla routerinterface avstängda, ingen sparad konfiguration). Du sätter upp Nordviks nät via CLI, i bokens ordning, och varje steg bockas av så fort nätet faktiskt fungerar – inga felrapporter, nätet är beviset.

| Bygge | Kapitel | Enheter | Steg |
|---|---|---|---|
| 1 Switchen från kartongen | 1, 2, 4 | SW-Nordvik-1 | Grundkonfiguration och spara · VLAN · accessportar · trunkar (native 999) · driftadress och SSH |
| 2 Routern från grunden | 3, 5, 6 | R-Nordvik-1 | Router-on-a-stick · DHCP-pooler · DNS på routern · NAT/PAT och statisk NAT · länken till Borås · namn, SSH-konto och bara SSH |
| 3 Lagret i Borås | 4, 5, 8 | SW-Boras-1, R-Boras-1 | VLAN och lagerporten · trunkar till router och accesspunkter · sub-interface och default route · DHCP · Wi-Fi · gäst-ACL |
| 4 Säkerhet och drift | 6, 7, 9 | R-Nordvik-1, båda switcharna | GAST-ACL · KONTOR-UT · port security · NTP · loggning |
| 5 VPN från grunden | 10 | R-Nordvik-1, R-Boras-1 | Fas 1 · fas 2 och spegelvända listor · crypto map och NAT-undantag · drift genom tunneln · adjust-mss |

Varje steg har tre ledtrådar med exakta kommandon, och handboken har fliken *Bygg från grunden* med ordningen och testkommandona. Datorerna försöker själva få en ny DHCP-adress. Startar du om en enhet utan `write memory` är den tillbaka på fabriksinställningarna.

## Veckorna

| Vecka | Tema | Fel |
|---|---|---|
| 1 | Sladden, prompten och lådorna | Fel baudrate på konsolen, port i shutdown, osparat hostname |
| 2 | Ramar och MAC-adresser | Trasig kabel (notconnect), duplex mismatch på trunken, port i fel VLAN |
| 3 | IP-adresser och subnätning | Fel nätmask, DHCP-pool med fel mask (169.254), pool utan DNS-server |
| 4 | VLAN och trunkar | allowed vlan utan `add`, native VLAN mismatch, STP-blockerad port (inget fel!) |
| 5 | Routing | Returväg saknas i Borås, blackhole-rutt, fel `encapsulation dot1Q` |
| 6 | NAT och säker inloggning | `ip nat inside` saknas, SSH avstängt (nyckel/domän), telnet öppet på vty 5 15 |
| 7 | Drift och övervakning | Broadcaststorm (STP av), flappande port, NTP saknas |
| 8 | Trådlöst (Borås) | PoE avstängt, SSID mappat mot fel VLAN, samma kanal |
| 9 | Säkerhet och brandvägg | ACL i fel riktning, implicit deny, port security err-disabled |
| 10 | VPN, SD-WAN och lastbalansering | Två samtidiga fel i IPsec-tunneln (crypto-ACL:er som inte speglar varandra + NAT före kryptering), MTU i tunneln (`ip tcp adjust-mss`), lastbalanserare med ping-hälsokontroll |

Datorerna beter sig som riktiga Windows-datorer: saknar de adress försöker de få en ny via DHCP var femte sekund, och flyttas deras port till ett annat VLAN ber de om en ny adress direkt. `ipconfig /renew` fungerar förstås också.

När ett fel är löst skickar du in en felrapport med **F**. En gul ruta uppe till vänster visar hur många rapporter som saknas, och när alla Krabba-fel (eller alla fel) är lösta påminner spelet dig med en ruta där du kan skriva rapporterna direkt. Veckan är klar först när alla rapporter är inlämnade.

Varje fel är simulerat på riktigt. Symptomen räknas fram ur konfigurationen: länkar, duplex, VLAN och trunkar, STP, routing, ARP, ACL, NAT, DHCP, DNS, PoE, port security, IPsec, MTU och lastbalansering. Ett fel försvinner därför bara när orsaken är rättad.

## Version 7: 300 förbättringar

Version 7 handlar om att det ska finnas mer att göra i terminalerna, mer att lära sig i handboken och mer liv i 2D-världen. Här är alla 300 förbättringar.

### Cisco IOS: nya kommandon och funktioner

1. `interface loopback <n>` skapar ett loopback-interface som alltid är uppe (så länge det inte är avstängt).
2. `no interface loopback <n>` tar bort det igen.
3. Tab-komplettering känner till `loopback`.
4. `hostname` kontrollerar namnet som en riktig enhet: det måste börja med en bokstav, får inte sluta med bindestreck och får vara högst 63 tecken.
5. Extended-ACL:er förstår `neq`, `gt`, `lt` och `range` för portar, inte bara `eq`.
6. Fler portnamn i ACL:er (bland annat `ftp-data`, `pop3`, `snmp`, `syslog`, `tftp`, `bootps` och `isakmp`).
7. Nyckelordet `log` i slutet av en ACL-rad sparas och visas.
8. `state suspend` och `state active` under `vlan <n>`.
9. `shutdown` under `vlan <n>` (visas som act/lshut).
10. `show vlan name <namn>`.
11. `alias exec <namn> <kommando>` gör egna kortkommandon som sedan går att köra.
12. `show aliases`.
13. `ip access-list resequence <acl> <start> <steg>` numrerar om raderna.
14. `test cable-diagnostics tdr interface <if>` testar kabeln.
15. `show cable-diagnostics tdr interface <if>` visar resultatet. En trasig kabel visas som Open på ett visst avstånd.
16. `show interfaces <if> transceiver` för fiberportar.
17. `show interfaces status err-disabled`.
18. `show mac address-table static`.
19. `show ip arp <ip>`.
20. `clear arp-cache` och `clear ip arp`.
21. `show port-security address`.
22. `show tech-support`.
23. `show controllers <if>`.
24. `lease <dagar> <timmar> <minuter>` i DHCP-pooler.
25. `option 150 ip <adress>` i DHCP-pooler (TFTP-server för IP-telefoner).
26. Hjälptexter för alla nya kommandon när du trycker `?`.
27. Stavar du fel på första ordet föreslår IOS-terminalen rätt kommando ("💡 Menade du …?").
28. `config-register`. Värdet visas i `show version`, med "(will be … at next reload)".
29. Med `config-register 0x2142` hoppar enheten över startup-config vid nästa omstart, som vid lösenordsåterställning.
30. `boot system flash:<fil>`.
31. `logging buffered <storlek> <nivå>`.
32. `ntp server <ip> prefer`.
33. `clock timezone <namn> <timmar> <minuter>`.
34. `show users` visar om du är inloggad via konsol eller SSH.
35. `show interfaces summary`.
36. `show spanning-tree vlan <n> brief`.
37. `show memory statistics`.
38. `ip scp server enable` låter laptopen hämta konfigurationen med scp.
39. `verify /md5 flash:<fil>`.
40. `show cdp entry *`.
41. `show cdp neighbors <if>`.
42. `show line console 0`.
43. `show ssh` visar SSH-sessionen när du är inloggad via SSH.
44. `show environment` på både switchar och routrar.
45. `show license` på switcharna (lanbasek9).
46. `show file systems`.
47. `show storm-control` läser den storm-control som du har konfigurerat på portarna.
48. `show monitor session all`.
49. `show udld`.
50. `show system mtu`.
51. `show sdm prefer`.
52. `show ip igmp snooping`.
53. `show authentication sessions`, med en förklaring om varför 802.1X inte används på Nordvik.
54. `show ip interface` utan interface visar alla interface.
55. `show platform`.
56. `show diag` på routrarna.
57. `show ip traffic`, med räknare som växer med speltiden.
58. `show buffers`.
59. `show ip cef` visar hela FIB-tabellen (anslutna nät, receive, statiska vägar och drop).
60. `show policy-map`.
61. `show login`.
62. `show cdp traffic`.
63. `show interfaces stats`.
64. `show stacks`.
65. `show protocols`.
66. `show logging history`.
67. `show ?` beskriver alla nya show-kommandon.

### Cisco IOS: rättningar och simulering

68. Loopback visas i `show ip interface brief`, `show interfaces` och `show running-config`.
69. `show interfaces loopback` visar inga duplex- och hastighetsrader, precis som en riktig enhet.
70. `show vlan brief` visar suspended och act/lshut, och varnar bara för att ett VLAN saknas när det faktiskt saknas.
71. `show running-config` visar VLAN-state, DHCP-lease i dagar, timmar och minuter, option 150, loggnivå, `ntp … prefer` och `ip scp server enable`.
72. Pingar du ett loopback-interface svarar det, även från andra enheter om det finns en väg.
73. Simulatorn tar hänsyn till `neq`, `gt`, `lt` och `range` när den avgör om en ACL släpper igenom trafik.
74. En router eller switch som pingar sin egen adress får svar direkt.
75. En /32-adress (som en loopback) ger ingen dubbel L-rad i `show ip route`.
76. Loggen visar `%LINEPROTO-5-UPDOWN` när ett loopback-interface skapas.
77. Rättat: `show ip interface` visade fel protokollstatus på switchportar (alltid down) och en trasig rad för avstängda interface ("stratively down").

### Windows-datorerna

78. `ipconfig /displaydns` visar de namn som datorn har slagit upp.
79. `ipconfig /flushdns` tömmer DNS-cachen på riktigt.
80. `ping -t` pingar tills du avbryter.
81. `ping -a` slår upp namnet för en adress.
82. `arp -d` tömmer ARP-tabellen.
83. `netstat -an`.
84. `pathping` visar vägen och förlusten per hopp.
85. PowerShell: `Test-Connection`.
86. PowerShell: `Resolve-DnsName`.
87. PowerShell: `Get-NetIPAddress`.
88. PowerShell: `Get-NetIPConfiguration`.
89. PowerShell: `Get-NetAdapter`.
90. PowerShell: `Get-NetRoute`.
91. PowerShell: `Get-DnsClientServerAddress`.
92. `net use` visar de mappade enheterna.
93. `net view`.
94. `w32tm /query /status` visar tidskällan (NTP-servern).
95. `dir`.
96. `cd`.
97. `type` av hosts-filen.
98. `tasklist`.
99. `set` visar miljövariablerna.
100. `netsh interface show interface`.
101. `netsh interface ipv4 show config`.
102. `getmac /v`.
103. `help` listar alla nya kommandon.
104. Tab-komplettering av de nya kommandona.
105. `?` fungerar som `help`.
106. Stavar du fel föreslås rätt kommando.
107. `nbtstat -n`.
108. PowerShell: `Get-NetNeighbor` (ARP-tabellen).
109. PowerShell: `Clear-DnsClientCache`.
110. PowerShell: `Get-NetTCPConnection`.
111. PowerShell: `Get-Date`.
112. PowerShell: `Get-Command` listar nätverkskommandona.
113. `telnet` förklarar att klienten inte är installerad och föreslår `Test-NetConnection -Port` i stället.
114. `doskey /history` och PowerShell-kommandot `Get-History` (eller `h`) visar kommandona du har skrivit.

### Laptopen (Linux)

115. `nmap -sn <nät>` visar vilka adresser som svarar (laptopen själv räknas med).
116. `nmap -p <portar> <ip>` visar öppna portar.
117. `mtr` visar förlust och svarstid per hopp.
118. `ss`, med flaggor som `-tuln`.
119. `netstat -rn`.
120. `netstat -tuln`.
121. `route -n`.
122. `ethtool` visar hastighet och duplex som porten har förhandlat fram.
123. `nmcli`.
124. `dhclient` (laptopen har fast adress och säger det).
125. `arping`.
126. `ssh-keygen -R` tar bort en gammal nyckel ur known_hosts.
127. `hostnamectl`.
128. `pwd`.
129. `cd`.
130. `cat ~/.ssh/known_hosts`.
131. `cat /etc/os-release`.
132. `ip -br a`.
133. `ip -s link` visar trafikräknare.
134. `ip neigh flush`.
135. `ip -6 a`.
136. `dig -x` gör omvänd uppslagning.
137. `sudo tcpdump -i enp0s31f6 -c <n>` visar ARP, DNS, NTP, STP och syslog på porten.
138. `iperf3 -c <server>` mäter överföringshastigheten och tipsar om duplexfel när den är låg.
139. `scp drift@<ip>:running-config <fil>` hämtar konfigurationen från en router eller switch.
140. `ls` och `cat` visar filerna du har hämtat.
141. `curl -v`.
142. `ping -q`.
143. `ssh -V`.
144. Nya man-sidor för nmap, mtr, ss, tcpdump, iperf3, ethtool med flera.
145. `help` listar de nya kommandona.
146. Tab-komplettering av de nya kommandona.
147. Stavar du fel föreslås rätt kommando.
148. `free -h`.
149. `df -h`.
150. `ps`.
151. `lsof -i`.
152. `w`.
153. `last`.
154. `env`.
155. `ping6`: `::1` svarar, men andra adresser förklarar att nätet bara kör IPv4.
156. `ssh-copy-id` förklarar hur nycklar läggs in på Cisco-enheter.
157. `wget` sparar sidan som index.html och skriver sina felmeddelanden som wget, inte som curl.
158. `ip maddr` visar multicastgrupperna.
159. Man-sidor för wget, ps, df, free, lsof, ping6 och w.
160. `!<n>` kör om kommando nummer n i historiken.
161. `history <n>` visar bara de senaste n kommandona.
162. Rättat: kommandon som de nya funktionerna hanterade (till exempel `pwd` och `nmap`) hamnade inte i historiken, eller hamnade där med fel namn (`wget` sparades som `curl`). Nu räknar spelet också varje kommando en gång med det namn du skrev, så att XP och statistik för nya kommandon som `nmap` och `wget` fungerar.
163. Förslagen vid stavfel är smartare: korta ord får inga orelaterade förslag (`df` föreslår inte längre `dig`).
164. Rättat: webbsidor på internet fick den interna nyckeln ("INTERNET:198.51.100.80") som titel i stället för sajtens namn.

### WLC och lastbalanserare

165. WLC: `show client summary` visar de trådlösa klienterna och deras SSID.
166. WLC: `show ap config general <ap>`.
167. WLC: `show time`.
168. WLC: `show network summary`.
169. WLC: `ping`.
170. WLC: hjälptexter för de nya kommandona.
171. Lastbalanseraren: `show version`.
172. Lastbalanseraren: `show interfaces`.
173. Lastbalanseraren: `ping`.
174. Lastbalanseraren: hjälptexter för de nya kommandona.

### Terminalen

175. Kommandohistoriken sparas mellan spelomgångar.
176. Historiken har plats för 200 kommandon.
177. Tryck Tab två gånger för att se alla möjliga fortsättningar.
178. Ctrl+A och Ctrl+E hoppar till början och slutet av raden (utanför den seriella konsolen).
179. Ctrl+P och Ctrl+N bläddrar i historiken, som på en riktig Cisco-enhet.
180. F1 visar alla kortkommandon.
181. Alt+C kopierar senaste utskriften.
182. Klicka på ett tidigare kommando för att lägga in det på raden igen.
183. Ctrl+mushjul ändrar textstorleken.
184. Alt+B och Alt+F flyttar markören ett ord bakåt eller framåt, som Esc B och Esc F i IOS.
185. Alt+D raderar ordet framför markören.
186. Ctrl+T byter plats på de två tecknen vid markören.

### Prestationer

187. Portskannare: skanna med nmap.
188. Kabeltestare: kör ett TDR-test.
189. Loopback: skapa ett loopback-interface.
190. Skyltmakare: sätt en banner motd.
191. Genvägar: skapa ett alias.
192. Ruttspanare: kör mtr eller pathping.
193. Frågvis: tryck `?` 50 gånger.
194. Sparsam: spara konfigurationen tio gånger.
195. Konfigläsare: kör `show running-config` 20 gånger.
196. Fjärrtekniker: logga in med SSH fem gånger.
197. Avlusare: stäng av debug med `undebug all`.
198. Portintervall: skriv en ACL-rad med range, gt eller lt.
199. Kartläsare: öppna topologin.
200. Stavfelsjägare: låt terminalen rätta dig tio gånger.
201. Kattvän: klappa kontorskatten.
202. Ankmatare: mata ankorna.
203. Nedladdare: spara en webbsida med wget.
204. Stormvakt: konfigurera storm-control.
205. Hälsokontroll: kör `show environment`.
206. 10 XP första gången du använder ett nytt verktyg (nmap, mtr, kabeltest, alias, wget, nbtstat, storm-control och fler).

### Handboken

207. Ny flik: **Topologi**, en karta över hela nätet med länkarnas status just nu.
208. Topologin uppdateras medan den är öppen.
209. Klicka på en enhet i topologin för att se namn, modell och adresser.
210. Ny flik: **Portnummer** med de vanligaste TCP- och UDP-portarna.
211. Ny flik: **Binärt** med en omvandlare mellan decimalt och binärt.
212. En CIDR-tabell med mask, wildcard och antal adresser för /8 till /32.
213. Ny flik: **Kommandologg** med allt du har skrivit.
214. En knapp som kopierar kommandologgen.
215. Ny flik: **Felsökningsordning**, steg för steg från kabel till applikation.
216. Ny flik: **Teori** med 14 korta avsnitt (lägena i IOS, felmeddelanden, kablar, DHCP, ARP, TCP, STP, NAT, ACL, wildcard och mer).
217. Teori: Broadcaststormar och storm-control.
218. Teori: RIB och FIB (`show ip route` jämfört med `show ip cef`).
219. Teori: Multicast och IGMP snooping.
220. Ny flik: **Övningar** med praktiska uppgifter som bockas av automatiskt när du gör dem.
221. 15 XP för varje klar övning.
222. Ny övning: storm-control.
223. Ny övning: hämta en webbsida med wget.
224. Ny övning: jämför RIB och FIB.
225. 31 nya ord i ordlistan.
226. Sökningen i handboken letar också i teoriavsnitten.
227. Tangenten I öppnar topologin direkt.
228. ← och → byter flik i handboken.
229. Handboken minns vilken flik du hade öppen senast.

### Spelet och gränssnittet

230. HUD:en varnar när en enhet har ändringar som inte är sparade.
231. HUD:en visar hur många länkar som är nere.
232. Ett meddelande dyker upp när en länk går ner eller kommer upp igen.
233. Dagens tips i menyn (45 tips).
234. En knapp som visar nästa tips.
235. Dagens övning i menyn.
236. Antal dagar i rad som du har spelat ("🔥 3 dagar i rad").
237. 2D-världen följer inställningen "Minska rörelse" (färre skakningar och blixtar).
238. Veckosammanfattningen varnar för enheter som har ändringar som inte är sparade.
239. Inställning: visa eller dölj dagens tips.
240. Inställning: meddelanden om länkar.
241. Inställning: djur i 2D-världen.
242. Två nya repliker för var och en av tio kollegor.
243. Två nya quizfrågor för varje vecka 1–10.
244. Tio nya `fortune`-citat på laptopen.
245. Nyhetsrutan beskriver version 7.
246. Skripten laddas med `?v=7.0`, så att webbläsaren inte använder gamla filer efter uppdateringen.

### 2D: miljön

247. En väggklocka som visar speltiden.
248. En nödutgångsskylt som lyser grönt.
249. En affisch i köket.
250. En dörrmatta vid entrén.
251. En kalender på väggen.
252. En anslagstavla.
253. Borås: en släpvagn vid lastkajen.
254. Borås: en pallvagn.
255. Borås: kärl för återvinning.
256. Höstlöv på marken under höstträden.
257. Skum i bäcken och ett löv som flyter med strömmen.
258. Lampan speglas i dammen.
259. Omar går runt med sin kaffemugg.
260. Kaffemaskinen har en lampa som lyser.
261. Kall dimma vid golvet i serverrummet.
262. Skrivaren har en grön lampa som blinkar.

### 2D: djur

263. Ankor som simmar i dammen.
264. Ankorna dyker ibland.
265. Ankorna kvackar när du kommer nära.
266. Du kan mata ankorna (E). Då simmar de fram till dig.
267. En groda hoppar mellan näckrosorna.
268. En kontorskatt strövar runt och sätter sig ibland.
269. Katten springer undan om du går för nära, och jamar.
270. Du kan klappa katten (E). Då sätter den sig och spinner.
271. Duvor pickar vid entrén och flyger iväg när du kommer nära, med ljud.
272. En ekorre springer längs staketet.
273. Fiskar hoppar i dammen.
274. En mås trippar fram och tillbaka vid lastkajen i Borås.
275. Bin surrar runt blommorna.

### 2D: väder och ljus

276. Vindbyar som får kronblad och löv att yra.
277. Flaggan fladdrar snabbare i vindbyarna.
278. Träden vajar mer i vindbyarna.
279. Fönster och bilrutor glänser.
280. Truckens varningsljus blinkar.
281. Ett lysrör i serverrummet flimrar.
282. Skuggorna blir längre mot kvällen.
283. Regnet rinner på fönsterrutorna.
284. Solnedgången färgar fönstren på kvällen.
285. Nattfjärilar flyger runt de tända lamporna.
286. Regnet ger ringar i vattenpölarna.
287. Blixtar och åska när det regnar (blixtarna stängs av med "Minska rörelse").
288. Morgondimma utomhus tidigt på dagen.
289. Vattnet stänker när du går i regnet.
290. Dammkorn svävar i ljuset från takfönstren i Borås.

### 2D: figurerna

291. Kollegor som sitter vid skrivbordet vänder huvudet mot dig.
292. Händerna skriver på tangentbordet hos dem som sitter.
293. Hjärtan stiger när någon tackar dig.
294. Ånga stiger från muggarna på skrivborden.
295. Står du still en stund tar du upp mobilen.
296. Svettdroppar efter en lång spurt.
297. Bubblor i vattenautomaten.
298. Dammsugaren lämnar ett ljusare spår i mattan.
299. Krukväxterna gungar när du går förbi.
300. Buskarna prasslar och tappar löv när du går förbi.

## Version 6.1: terminal, lösenord och fler Cisco-kommandon

- **Större terminal.** Fönstret fyller nästan hela skärmen och texten är större från början. ⛶ eller F11 gör terminalen till helskärm, och storleken du själv drar fram sparas.
- **Inget enable-lösenord.** Routrar och switchar släpper in dig direkt via konsolen. Lösenord används bara där det behövs, som för SSH-kontot `drift` / `nordvik`. Lösenordet står på lappen vid laptopen, visas första gången du loggar in med SSH och igen om du skriver fel. I byggena sätter du själv kontot när du sätter upp SSH.
- **Granskade utskrifter.** `show ip route` visar nu administrativt avstånd och "is directly connected" för vägar mot ett interface, `show running-config` visar `service password-encryption`, `enable password` och `username … password` som på en riktig enhet, och `copy startup-config running-config` visar riktiga byte.
- **Omkring 90 nya kommandon:**
  - Inloggning: `banner motd/login/exec` (även på flera rader), `access-class` och `privilege level` på vty-linjerna (påverkar inloggningen på riktigt), `security passwords min-length`, `login block-for`, `ip ssh time-out`, `ip ssh authentication-retries`, `username … algorithm-type scrypt secret`, `ssh -l` och `telnet` från routern eller switchen.
  - Routing: flytande statiska vägar (`ip route … 200`), `show ip route summary`, `show ip protocols`.
  - Switchar: `show spanning-tree root`, `show spanning-tree interface`, `spanning-tree vlan … root primary/secondary`, `spanning-tree portfast default`, `bpduguard`, `guard root`, `channel-group` och `show etherchannel summary`, `vtp mode/domain/password` och `show vtp status`, `switchport voice vlan`, `storm-control`, `ip dhcp snooping`, `show mac address-table count`, `show interfaces switchport`, `show vlan summary`, `show ip default-gateway`, `show boot`, `show env all`.
  - Drift: `cdp run`/`no cdp run`, `lldp run` och `show lldp neighbors`, `show cdp`, `snmp-server community/location/contact` och `show snmp`, `logging trap/console/source-interface`, `ntp update-calendar`, `clock set`, `clock summer-time`, `debug`/`undebug all`/`show debugging`, `show interfaces counters`, `show errdisable recovery`.
  - Filer och omstart: `erase startup-config`, `write erase`, `dir`, `show flash`, `copy running-config tftp:`, `reload in` och `reload cancel`, `show reload`, `delete flash:vlan.dat`.
  - Övrigt: `show hosts`, `show line`, `show privilege`, `show terminal`, `show sessions`, `show ip nat translations verbose`, `show ip dhcp server statistics`, `show crypto key mypubkey rsa`, `standby` och `show standby brief`, samt interfacekommandon som `bandwidth`, `delay`, `mtu`, `load-interval`, `no ip redirects`, `no ip proxy-arp` och `ipv6 address`.
- Handboken har två nya tabeller: "Inloggning och lösenord" och "Fler vanliga kommandon".

Dynamisk routing (OSPF) finns inte i simuleringen, eftersom nätet i spelet bara använder statiska vägar. Loopback-interface kom i version 7.

## Version 6: 200 grafiska förbättringar i 2D

2D-versionen är omritad från grunden, med inspiration från HD-2D, Sea of Stars, Eastward och Owlboy: detaljerad pixelkonst, mjukt ljus, djup och liv i miljön. Allt ritas fortfarande i koden, utan bildfiler. Den nya grafiken finns i `js/world/art2d.js` (pixelkonsten) och `js/world/scene2d.js` (miljö, ljus och effekter).

### Bildkedjan

1. Världen ritas i en liten pixelbuffert där en bildpunkt är en konstpixel, och bufferten förstoras sedan med skarpa kanter.
2. Kameran flyttar sig i hela pixlar i bufferten, och resten av rörelsen läggs på vid förstoringen. Scrollningen blir mjuk utan att pixlarna darrar.
3. Kameran följer dig mjukt med exponentiell utjämning som inte beror på bildfrekvensen.
4. Skakningar vid firanden fungerar som förut ovanpå den mjuka kameran.
5. Text, skyltar och namn ritas skarpt i full upplösning ovanpå pixelbilden.
6. Flytande text (XP, ”✓ svar”) ritas också skarpt.
7. Musklick och muspekare räknar med den nya kameran, så att du träffar rätt föremål.
8. Bara det som syns ritas.
9. Föremål kan ha flera bildrutor (träd som vajar, flaggan) och egna ritfunktioner.
10. Nya steg i ritordningen för mark, skuggor, ljus och efterbehandling.
11. Pixelbufferten gör ritningen billigare, så den rikare grafiken går ungefär lika snabbt som den gamla.

### Pixelkonst i koden

12. Brus (value noise och fBm) ger naturliga fläckar i gräs, jord, betong och vatten.
13. Bayer-dithering blandar färgerna i rutmönster som i gamla 16-bitarsspel.
14. Paletter med 4–7 toner per material i stället för en enda färg.
15. Skuggtoner drar mot blått och ljusa toner mot gult, som i handritad pixelkonst.
16. En ”selektiv kontur” ger varje föremål en kant i en mörkare nyans av sin egen färg i stället för svart.
17. Lådor och möbler skuggas med ljus uppifrån vänster, en ljus framkant och rundade hörn.

### Marken

18. Marken målas pixel för pixel utifrån en materialkarta.
19. Gräset har stora ljusa och mörka fläckar, fint korn och svaga ränder som efter en gräsklippare.
20. Grässtrån hänger ut över grus, stenplattor, asfalt och vattenkanter.
21. En kantsten skiljer asfalten från gräset.
22. Grusgångar med småsten och ljusa och mörka korn.
23. Entrén har stenplattor i förband med fogar, avfasade kanter och lite gräs i fogarna.
24. En grusremsa löper runt husen.
25. Parkeringen har ny asfalt med korn.
26. Sprickor i asfalten.
27. Oljefläckar med en regnbågsskimrande kant.
28. Nötta parkeringslinjer.
29. En blå handikapparkering med symbol.
30. Brunnslock i gången och på lagergården.
31. Streckade gula linjer på lagergården i Borås.
32. Gul-svarta varningsränder vid lastkajen.
33. Heltäckningsmattan har ett rombmönster och plattor som skiftar lite i ton.
34. Trägolvet har plankor med ådring, fogar, olika toner och kvistar.
35. Serverrummets upphöjda golv har avfasade plattor och ventilationsplattor med hål.
36. Lagergolvet har betong med fläckar, fogar med ljus kant och hjulspår.
37. Fikarummet har fått grönt och vitt kakel med fogar och glans.
38. Mattor och gula golvlinjer har slitage i ljusa och mörka prickar.
39. Grästuvor.
40. Högt gräs i klungor.
41. Blomklungor i sex olika sorter.
42. Klöverfläckar.
43. Stenar med skugga och ljus ovansida.
44. Flugsvampar här och där.
45. En mjuk skugga (ambient occlusion) längs varje väggfot, i ditherade steg.
46. Husen kastar en ditherad skugga på gräset.

### Vatten

47. En damm vid kontorets västra sida, med grusstrand och ojämn strandkant.
48. Vattnet är mörkare under den bortre stranden och ljusare på grunt vatten.
49. Glitter som vandrar över vattenytan.
50. Skum som rör sig längs strandkanten.
51. Tre koifiskar som simmar runt under ytan.
52. Näckrosor som guppar, några med blommor.
53. Ringar som sprids på vattnet.
54. Du, bänken, stenarna och lyktan speglas i dammen och speglingen krusar sig.
55. En slingrande bäck längs lagrets norra kant i Borås.
56. Bäcken har jordbankar och varierande bredd.
57. En träbro över bäcken som du kan gå över.
58. Stenar med mossa och vass runt dammen.

### Väggar och fönster

59. Kontorets fasad mot entrén är av tegel i förband med fogar, sockel och en ljus list.
60. Lagret i Borås har en fasad av korrugerad plåt med rostränder och betongsockel.
61. Innerväggarna har tapet med svaga ränder, bröstlist och golvlist i trä.
62. Tavlor med landskap hänger på innerväggarna.
63. Väggkrönen har ljus och mörk kant.
64. Glasväggar har en blå ton, lutande reflexer och smala karmar.
65. Fönstren på innerväggen visar himmel, en trädrad och gräs.
66. Fönstren har reflexer, spröjs och fönsterbräda.
67. Gardiner i tre färger med veck.
68. Fönster på tegelfasaden sedda utifrån, med varmt ljus inifrån.
69. Blomlådor under fönstren på fasaden.
70. Entréns glasdörrar glider isär när du kommer nära och stängs bakom dig.
71. Vägglampor sitter på var sida om entrén.

### Träd och växter

72. Ek med krona av skuggade bladklungor, ljusa bladspetsar och fransig kant.
73. Körsbärsträd med rosa krona och små vita blommor.
74. Granar i fem våningar.
75. Höstträd i orange och gult i Borås.
76. Några lövträd har röda äpplen.
77. Stammar har bark med ljus kant, grenar och rötter.
78. Träden vajar i vinden i tre lägen, och varje träd i sin egen takt.
79. Buskar av bladklungor, några med rosa eller vita blommor.
80. Buskarna rör sig lite i vinden.
81. En klippt häck längs norra sidan.
82. Blomsterrabatter vid entrén med rader av blommor.
83. Vass med kaveldun vid dammen, som vajar.
84. Krukväxterna inne har terrakottakrukor med skuggning och blad som hänger ut.
85. Stenar med mossa i gräset.

### Föremål utomhus

86. Gatlyktor längs gången och vid dammen.
87. Parkbänkar med träribbor och metallben.
88. En flaggstång med svensk flagga som vajar.
89. Ett cykelställ med en röd cykel.
90. Gröna soptunnor.
91. Ett staket av trä längs tomtens norra kant.
92. Företagsskylten ”NORDVIK” vid entrén.
93. En bänk vid dammen.
94. Oljefat i tre färger vid lastkajen.
95. En grön container.
96. Lastpallar med kartonger och plastband.
97. Fler buskar och stenar runt lagret.
98. Bilarna är omritade med bakruta, tak, vindruta med reflex, motorhuv, strålkastare, grill, nummerskylt och backspeglar.
99. Bilarna går inte längre att gå igenom.
100. Trucken har mast, gafflar, förarskydd, säte och varningslampa.

### Möbler och inredning

101. Skrivborden har björkskiva med ådring och metallben.
102. Tangentbord och mus på varje skrivbord.
103. Muggar i olika färger.
104. Papper och gula lappar.
105. Små krukväxter på några skrivbord.
106. Kontorsstolar med rundad rygg, sits, gaskolv och femarmad fot med hjul.
107. Racken har ventilationsgaller på taket, perforerad dörr, handtag, märkning och sockel.
108. Whiteboarden har aluminiumram, en nätverksskiss, suddiga rester och en pennhylla med pennor.
109. Soffor, skåp och lådor skuggas som alla andra föremål.

### Figurerna

110. Figurerna är lite större (18×31 pixlar).
111. Hud, hår, tröja och byxor har tre toner var.
112. Ögon med vitor och pupiller.
113. Ögonbryn.
114. Rosiga kinder.
115. En näsa som skugga.
116. Håret har ljus kant och skuggsida.
117. Långt hår följer axlarna med ljus och skugga.
118. Tröjan har ljus sida, skuggsida, halsringning och fåll.
119. Byxor och skor har ljus kant.
120. Figurerna blinkar, var och en i sin egen takt.
121. Figurerna andas när de står eller sitter still.
122. Kroppen sjunker lite i varje steg när figurerna går.
123. Kepsar med ljus ovansida och skuggad skärm.
124. Glasögon med glans.
125. Nya tillbehör som skägg, headset och passerkort i band.
126. En guldkant pulserar runt den person du kan prata med.
127. Krabban har skuggad kropp, ljusa fläckar, ögon på skaft med glans och klor som knäpper.
128. Dammsugarroboten är rund, med blank ovansida, stötfångare, blinkande lampa och snurrande borste.

### Skuggor

129. Mjuka ditherade skuggor under träd, buskar, lyktor, bänkar, bilar, skyltar och stenar.
130. Skuggorna faller lite åt höger, bort från solen uppe till vänster.
131. Möbler och lådor kastar en skugga av sin egen form på golvet.
132. Figurerna har en mjuk skugga under fötterna.
133. Fåglarna och trollsländan har skuggor på marken.
134. Molnskuggorna har mjuka kanter i tre lager och glider över marken.
135. Skuggorna sparas som färdiga bilder, så de kostar nästan inget att rita.

### Ljus

136. Ett ljuslager färgar hela bilden efter tid och väder.
137. Inomhus är ljuset lite svalare och dämpat.
138. Taklamporna lyser upp golvet i mjuka cirklar.
139. Solen ger ljusa fläckar på golvet under fönstren.
140. Skärmarna lyser upp skrivborden.
141. Serverrummet har ett kallt blått ljus.
142. En varm lampa hänger över fikabordet.
143. Mot kvällen blir ljuset varmare och dovare.
144. Regn gör ljuset grått och blått, mulet väder gör det lite gråare.
145. Gatlyktorna tänds på kvällen och när det regnar, med en ljuscirkel på marken.
146. Bilarnas strålkastare lyser framåt på kvällen.
147. Vägglamporna vid entrén lyser upp stenplattorna.
148. Fönstren på fasaden lyser varmt på kvällen.
149. Lyktorna glöder svagt även på dagen.
150. Skärmarna glöder blått och fladdrar lite.
151. Racken glöder grönt.
152. Solstrålar faller snett genom fönstren.
153. Ljusschakt från takfönstren i lagret.
154. Breda solstrålar sveper sakta över utomhusmiljön.

### Efterbehandling

155. Glöd (bloom) kring ljusa ytor på hög och ultra kvalitet.
156. Skärpedjup ger suddig över- och underkant, som i HD-2D och miniatyrfoton.
157. Skärpedjupet kan stängas av i inställningarna (”Skärpedjup i 2D”).
158. Färgtoning med varmt ljus uppe till vänster och svalare skuggor nere till höger.
159. Färgtoningen följer kvällsljuset.
160. En mjukare vinjett i kanterna.
161. Efterbehandlingen följer inställningen ”Efterbehandling”.
162. Allt skalar med grafiknivån: lägsta nivån hoppar över ljuslagret, strålar och vajande träd och går fortfarande snabbt.

### Liv i miljön

163. Rosa kronblad faller och fladdrar från körsbärsträden och lägger sig på marken.
164. Löv faller från höstträden i Borås.
165. Fjärilar i fyra färger fladdrar runt när det inte regnar.
166. En trollslända flyger över dammen.
167. Eldflugor tänds på kvällen.
168. Dammkorn glittrar i solljuset från fönstren.
169. Regnet stänker på marken.
170. Regnet ringar på vattnet.
171. Vattenpölar växer fram när det regnar och torkar sedan långsamt upp.
172. Grässtrån yr när du går över gräsmattan.
173. Fåglarna har vingar som slår, ljus näbb och skugga.
174. Regnet ritas som tunna streck i pixelbufferten.
175. Fotspåren har tå och häl.
176. Flaggan vajar i sex bildrutor.
177. Fiskarna simmar i egna banor och hastigheter.
178. Näckrosorna guppar i otakt.
179. Glittret på vattnet rör sig i två vågmönster som korsar varandra.

### Skyltar och markeringar

180. Rumsskyltar är träskyltar med ram, ådring och två spikar.
181. Namnskyltar är mörka etiketter med rundade hörn, tunn ljus kant och skugga.
182. Texten på etiketterna har en skugga så att den syns mot alla bakgrunder.
183. Utropstecknet och bocken över personerna sitter i skuggade bubblor med glans.
184. Bubblorna guppar och blänker ibland till.
185. Det du kan använda markeras med en pulserande ring på marken.
186. Guldpilen ovanför har kontur, glans och skugga.
187. Dit du klickar visas ringar som krymper in mot punkten, med ett litet kors i mitten.
188. Etiketterna över accesspunkterna och glasögonvyn har samma nya stil.

### Övrigt

189. Marken i Göteborg och Borås målas med olika slumpfrön, så platserna ser olika ut.
190. Kartan är lika stor som förut och alla dörrar, rack och datorer står på samma ställen.
191. Dammen, bäcken, bilarna, bänkarna och de andra nya föremålen går inte att gå igenom.
192. Bron och gången runt dammen går att gå på.
193. Träd, bilar och bänkar ritas i rätt ordning när du går bakom dem.
194. Konturer och skuggor räknas ut en gång när spelet startar, inte varje bild.
195. Pixelbufferten byggs om när fönstret ändrar storlek.
196. Zoomen fungerar som förut.
197. 3D-versionen påverkas inte.
198. ”Nytt i version 6.0” visas en gång i menyn.
199. Testerna är uppdaterade för version 6.0.
200. Samma pixelkonst används i hela 2D-världen, både i Göteborg och i Borås.

## Version 5: kapitel 10 och 100 förbättringar

### Kapitel 10 – VPN, SD-WAN och lastbalansering

Den hyrda linan Göteborg–Borås (6 000 kr i månaden, 4 % använd) är uppsagd. Borås har fått ett eget internetuttag (203.0.113.20) och kontoren pratar genom en IPsec-tunnel över internet.

- **Riktig IPsec i simulatorn.** Crypto map på utsidan, ISAKMP-policy (fas 1), transform-set och crypto-ACL (fas 2). Tunneln byggs först när trafik matchar `VPN-TRAFIK`. Fas 1 kräver samma policy och nyckel, fas 2 samma transform-set och spegelvända ACL-rader. Varje ACL-rad blir ett eget SA-par med räknare.
- **NAT före kryptering, precis som i IOS.** Saknas deny-raden först i NAT-listan översätts trafiken och krypteras aldrig. En deny-rad i NAT-listan undantar även den statiska NAT:en för filservern.
- **MTU i tunneln.** Tunneln rymmer 1 420 byte. Stora paket med DF-biten satt fastnar, och fulla TCP-segment hänger tills en router längs vägen har `ip tcp adjust-mss 1360`.
- **Lastbalanseraren LB-Nordvik** (192.168.1.13, `tid.nordvik.example`) med två tidrapportservrar, round robin och hälsokontroll `icmp`, `tcp` eller `http`. Den har en egen CLI (`show pool`, `show stats`, `show monitor`, `config pool … monitor http`, `config pool … member … disable`, `save config`) via konsolen i rack A eller `ssh admin@192.168.1.13`.
- **Nya IOS-kommandon:** `crypto isakmp policy/key`, `crypto ipsec transform-set`, `crypto map`, `set peer`, `set transform-set`, `match address`, `crypto map` på interface, `ip tcp adjust-mss`, `show crypto isakmp sa`, `show crypto ipsec sa`, `show crypto map`, `show crypto session`, `show crypto isakmp policy`, `show crypto ipsec transform-set`, `clear crypto sa`. Loggen visar `proxy identities not supported` när ACL:erna inte speglar varandra.
- **Veckans fel:**
  - 🦀 *Tunneln är uppe men inget går igenom* – två fel samtidigt: Borås crypto-ACL har /24 i stället för /26, och Göteborgs NAT-lista saknar deny-raden för VPN-trafiken. Rättar du bara det ena fungerar det fortfarande inte.
  - 🦀 *Små paket går fram, stora inte* – ingen router klämmer MSS. Ping fungerar, men filkopieringen på lagret hänger.
  - 💬 *Tidrapporten fungerar varannan gång* – webbtjänsten på Tid-2 har kraschat, men lastbalanseraren pingar bara servern.
- Frågesport, veckans utmaning, ledtrådar, felrapporter, NPC-repliker och handbokssida för kapitel 10, med tabellen *Tio veckor i repris*.

### 100 förbättringar

**Cisco IOS**
1. `ping` tar `source`, `size`, `df-bit` och `repeat` i valfri ordning, och `source` används nu på riktigt.
2. Utökad ping: bara `ping` frågar steg för steg (mål, antal, storlek, källa, DF-bit …) som på en riktig router.
3. Filtret `| count` räknar matchande rader.
4. `?` efter `|` listar filtren (begin, count, exclude, include, section).
5. `traceroute <ip> source <interface>`.
6. `show clock detail` visar tidskällan.
7. `show ntp associations`.
8. `show ip cef <ip>` visar vilken väg ett paket tar.
9. `show ip interface` visar MTU, TCP Adjust MSS och crypto map.
10. `ntp source <interface>` – routerns egen trafik kan få rätt källadress.
11. `ip mtu` på interface.
12. Pingen visar `M` när paketet måste fragmenteras men DF-biten är satt.
13. `crypto isakmp key 0 …` och `6 …` fungerar som i IOS.
14. Hjälptexter för alla nya nyckelord när du skriver `?`.

**Windows och Linux**
15. Windows: `ping -l <storlek>`.
16. Windows: `ping -f` (DF-biten), med kontroll mot nätkortets egen MTU (1 472 byte data).
17. Linux: `ping -s <storlek>`.
18. Linux: `ping -M do`, med ”message too long” lokalt och ”Frag needed” från routern.
19. Linux: `tracepath` visar vägens minsta MTU (pmtu).
20. Linux: `ip route get <ip>`.
21. Linux: `!!` kör om senaste kommandot.
22. Linux: `| grep` med `-i`, `-v` och `-c`.
23. Windows: `| findstr` med `/i`, `/v` och `/c`.
24. Linux: `man` för ping, ssh, curl, tracepath, ip, screen, nc och grep.
25. Linux: `echo`.
26. Linux: `dig +short <namn>`.
27. Linux: `sl` (för den som skriver fel).
28. Linux: `uname -a` och `id`.
29. Linux: `cat /etc/hosts`.
30. Linux: `history -c`.
31. Windows: `echo` med `%USERNAME%` och `%COMPUTERNAME%`.
32. `curl` på både Windows och Linux, med `-I` för bara svarshuvudet.
33. Windows: `copy \\server\share\fil` – en riktig filöverföring.
34. Linux: `for i in 1 2 3 4; do curl …; done` för att testa en lastbalanserare.
35. Tab-komplettering av kommandon och vanliga adresser i Linux- och Windows-terminalen.

**Terminalen**
36. Ctrl+R söker bakåt bland tidigare kommandon.
37. Ctrl+K tar bort resten av raden.
38. Alt+. klistrar in sista ordet från förra kommandot.
39. Ctrl+D på tom rad loggar ut.
40. Samma kommando två gånger i rad sparas bara en gång i historiken.
41. Statusraden visar ISAKMP-policy, crypto map, transform-set och åtkomstlista.
42. Statusraden visar när du är inne i lastbalanseraren eller controllern.
43. Ny färgning: QM_IDLE, MM_NO_STATE, 502/503, fragmenteringsfel, räknare på noll, lyckade kopieringar.
44. Egen ikon för lastbalanseraren.
45. Snabbknappar i vecka 10: ssh till Borås och LB, curl ×4 och tracepath.
46. Knappen `|` i tangentraden (mobil).
47. Knappen Ctrl+R i tangentraden (mobil).

**Spelet**
48. Prestation *Tunnelbyggare*: klara vecka 10.
49. Prestation *MTU-detektiv*: fem ping med DF-biten satt.
50. Prestation *Tunnelseende*: tio `show crypto`.
51. Prestation *Lastbalanserad*: tio webbsidor med curl.
52. Prestation *Pendlare*: tio resor mellan Göteborg och Borås.
53. Prestation *Hela kursen*: 30 rätt i frågesporten.
54. Prestationerna för alla veckor, alla stjärnor, alla fel och alla utmaningar räknar med tio veckor.
55. Karriärfönstret visar DF-ping, show crypto, curl och resor.
56. XP första gången du använder curl, tracepath och crypto.
57. Tangenten 0 startar vecka 10 i menyn.
58. Menyn visar hur många veckor och stjärnor du har.
59. Nästa vecka att spela är markerad i menyn.
60. Vecka 10 är märkt NY tills du klarat den.
61. Examen kan slumpa alla tio veckor.
62. Fri träning använder det senaste nätet (med VPN och lastbalanserare).
63. Kollegorna pratar om VPN, SD-WAN och den uppsagda linan i vecka 10.
64. Pausen visar veckans lärandemål.
65. Åtta nya tips (Ctrl+R, tracepath, DF-ping, källa vid ping, `| count` …).
66. Subnätsträningen frågar efter wildcard-masker.
67. Subnätsträningen frågar efter MSS utifrån en MTU.
68. Felrapportens underlag tar med curl, copy, tracepath och crypto-kommandon.
69. Skrivarens utskrift visar VPN-läget.
70. Notis när tunneln går upp eller tappar ett SA-par.
71. Notis när lastbalanseraren markerar en server UP eller DOWN.
72. HUD:en visar VPN-läget till Borås.
73. ”Nytt i version 5” första gången.
74. HUD:en visar rätt namn när konsolkabeln sitter i lastbalanseraren.

**3D och 2D**
75. Lastbalanseraren i rack A med en lampa per server (grön UP, blinkande röd DOWN).
76. Lastbalanserarens lampor följer färgblindläget.
77. Tidrapportservrarna i rack B.
78. Rackvyn visar lastbalanseraren och servrarna, och ett klick sätter konsolkabeln i LB.
79. 2D-racken visar bara enheter som finns i veckans nät.
80. Glasögonen visar lastbalanserarens status över racket.
81. Glasögonen visar VPN-läget på båda routrarna.
82. Fiberkabel från R-Boras-1 till väggboxen i Borås.
83. Skyltarna vid väggboxarna byts till ”Hyrd lina – uppsagd” och ”Fiber → internet (VPN)”.
84. VPN-lampa på väggboxen i Borås: grön, gul eller röd.
85. Ping genom tunneln flyger lila i 3D och säger ”via VPN”.
86. Samma sak i 2D.
87. Nya felskyltar när pingen stoppas i IPsec eller är för stor.
88. Tavlans nätskiss ritar tunneln och lastbalanseraren i vecka 10.
89. Kollegornas skärmar visar felen: 502 hos Lisa, filservern som inte nås och en fil som laddar på lagret.
90. Övervakningens fjärde graf visar Borås internet och VPN i stället för den uppsagda linan.
91. Övervakningen har en VPN-panel med fas 1, SA-par och räknare.
92. Övervakningen har en panel för lastbalanserarens pool.

**Handboken**
93. Ny flik *VPN och LB*: hur tunneln byggs, felsökningsordning, VPN/SD-WAN och lager 4 mot lager 7.
94. Tabellen *Tio veckor i repris*.
95. Fem nya rader i felbiblioteket.
96. Adressplanen med Borås utsida, tunneln, lastbalanseraren, servrarna och Mölndal.
97. Tolv nya ord i ordlistan (VPN, IKE, SA, ESP, MTU, MSS, SD-WAN, hälsokontroll …).
98. Nytt avsnitt för Windows-kommandon.
99. De nya terminaltangenterna under Styrning.
100. OSI-sidan tar med felen från vecka 10.

## Version 4: animationer, modeller, prestanda, mobil och 100 förbättringar

### Animationer i 3D

- Kollegorna har leder: höft, rygg, bröst, nacke, huvud, axlar, armbågar, händer, lår, knän och fötter.
- Alla rörelser glider mjukt mellan poser, lika snabbt oavsett bildfrekvens.
- De som sitter skriver på tangentbordet med händerna, lutar sig mot skärmen och tittar upp ibland.
- Omar går med en riktig gångcykel: knäböj, armsving, höftgung och lätt studs – och svänger mjukt.
- De som står flyttar vikten mellan benen, och alla andas.
- Huvud, ögon och överkropp vänder sig mot dig i den ordningen när du kommer nära.
- De blinkar, och munnen och ögonbrynen visar humöret: sura med öppet ärende, glada när det är löst.
- Gester: vinka (den som har ett ärende), sträcka på sig, klia sig i huvudet, dricka kaffe, titta på klockan, skaka på huvudet, sucka och jubla.
- Handgester, nickar och munrörelser när de pratar med dig.
- Krabban går med växelvisa ben, gungar, knäpper med klorna och följer dig med ögonen.
- Dörrarna till serverrummet (skjutdörr med kortläsare), ekonomi och fikarummet öppnas när du kommer nära.
- Racken har perforerade frontdörrar som svänger upp när du närmar dig.
- Trucken startar och bromsar mjukt, svänger, rullar med hjulen, lyfter gafflarna och har en blinkande lampa.
- Kameran gungar i takt med stegen (fotstegsljudet följer), svajar lite i sidled och fjädrar vid landning.
- Laptopen i handen släpar efter musen och gungar med stegen.
- Kollegor långt bort animeras mer sällan, så att det flyter.

### Snyggare modeller

- Nytt modellbibliotek med rundade kanter på möbler, datorer, truck och figurer.
- Figurerna har formad bål, händer med tumme, skor med sula, öron, näsa, ögon med pupiller, ögonbryn och mun.
- Olika frisyrer (lång, hästsvans, knut, lockig, kort, tunnhårig, keps), skägg, glasögon, headset, slips och namnbricka.
- Kontorsstolar med armstöd, gaslyft och femarmat kryss med hjul.
- Skrivbord med T-ben, kabelränna och hurts med lådor.
- Tunna skärmar med fot, baksida och logga, tangentbord med tangenter, rundad mus och musmatta.
- Datorer med ventilationsgaller och lampa.
- Krukväxter med riktiga böjda blad, jord och krukkant.
- Soffor med dynor, ryggkuddar och ben.
- Krabban med knölar, ledade ben och klor med underkäke.
- Trucken med förarplats, skyddstak, mast, gafflar och hjul med nav.
- Lastpallar under kartongerna, och kartonger med tejp och fraktsedel.

### Flyter bättre på äldre datorer

- Automatisk grafiknivå utifrån grafikkort, minne, processor och om det är en mobil.
- Fem nivåer: Minimal, Låg, Medel, Hög och Ultra.
- Allt som aldrig rör sig slås ihop per material och per ruta på 10 × 10 m (runt 1 300 delar blir drygt 150).
- Kollegornas delar slås ihop per led, vilket ger ungefär hälften så många ritanrop per figur.
- Låg och Minimal använder billigare material och tar bort punktljusen.
- Skuggorna ritas bara om när de behöver det (på Medel var tredje bildruta).
- Tak för bildfrekvensen (30 eller 60 bilder/s); Minimal har 30 som standard.
- Frontpanelernas lysdioder ritas bara om för paneler som syns och är nära.
- Färre partiklar och inga dammkorn på låga nivåer.
- 2D ritas i lägre upplösning på svagare enheter.
- Går det trögt föreslår spelet en lägre nivå. Veckan sparas och fortsätter efter omladdningen.

### Mobil och pekskärm

- Styrspak, knappar för att använda, springa, hoppa och huka, och en ☰-meny med alla funktioner.
- Snabbknappar för laptop, rapport, ledtråd och karta.
- Dra för att titta i 3D, tryck på saker för att använda dem, nyp för att zooma i 2D.
- Knappen Använd visar vad du kan göra just nu.
- Tangentrad i terminalen, terminalen fyller skärmen och texten är stor nog för att telefonen inte ska zooma.
- Mobiler startar i 2D och på en lägre grafiknivå.
- Helskärm (låser liggande läge där det går), vibration och skärmen hålls tänd.
- Tips om att vrida telefonen i 3D, anpassade menyer och dialoger för små skärmar.

### 100 andra förbättringar

**Tillgänglighet och gränssnitt**
1. Storlek på text och fönster (80–140 %).
2. Färgblindläge: blått och orange i lysdioder, glasögon, terminal och frågesport.
3. Hög kontrast.
4. Minska rörelse: inga skakningar, blixtar, slowmotion eller gungningar.
5. Textning av ljud (telefon, larm, truck, dörrar, kaffe …).
6. Inställbar storlek på siktet.
7. Dialoger tonar och skalar in.
8. Notiser kan klickas bort.
9. Högst fyra notiser syns samtidigt.
10. Klicka på ett ärende uppe till vänster så visar pilen vägen dit.
11. Nedräkning för kombobonusen i HUD:en.
12. Veckans utmaning visas i HUD:en.
13. En liten ”Sparat”-markering när spelet sparar.
14. Pausen visar vecka, ärenden kvar, tid och ett tips.
15. Ljud av/på direkt i pausen.
16. Teckenförklaring på kartan.
17. Klicka på minikartan för att sätta en markering.
18. Återställ inställningar.
19. Exportera framsteg som text.
20. Importera framsteg på en annan dator.
21. Nollställ framsteg (med bekräftelse).
22. Siffrorna 1–9 startar en vecka i menyn.
23. Piltangenterna flyttar mellan veckorna i menyn.
24. Versionsnummer i menyn.
25. ”Nytt i version 4” första gången.
26. Veckokorten visar 🏅 när veckans utmaning är klarad.
27. Anteckningar: knapp som infogar tid och plats.
28. Handboken: fliken Mina kommandon med dina senaste kommandon att kopiera.
29. Handboken: styrning på pekskärm.
30. Felrapportens utkast sparas om du stänger den.
31. Rumsskylt när du går in i ett nytt rum.
32. Egna volymer för effekter och miljöljud.

**Terminalen**
33. Klicka på en IP-adress för att skriva ping.
34. Klicka på ett portnamn för att skriva show interfaces.
35. Dubbelklicka på ett ord för att skriva in det.
36. Ctrl+U rensar raden.
37. Ctrl+W tar bort senaste ordet.
38. Ctrl + och Ctrl − ändrar textstorleken.
39. Knappen ”Nya rader ↓” när du läser längre upp.
40. Kopiera hela sessionen.
41. Fönstrets storlek sparas.
42. Statusraden visar när ett kommando arbetar.
43. Linux: date och uptime.
44. Linux: neofetch och fortune med nätverkstips.
45. Windows: ver och whoami.
46. Windows: date och time.
47. Windows: systeminfo.

**Spelmekanik**
48. Veckans utmaning – en per vecka.
49. Utmaningen står i veckans genomgång.
50. 75 XP och en medalj när du klarar utmaningen.
51. Frågesport vid tavlan i fikarummet: tre frågor per vecka, 27 totalt.
52. XP för nya rätta svar i frågesporten.
53. Subnätsträning i handboken med svit och rekord.
54. Betyg A–E när veckan är klar.
55. Dina bästa tider per vecka i karriärfönstret.
56. ”Nytt rekord!” när du slår din bästa tid.
57. Dina mest använda kommandon i veckans sammanfattning.
58. Tio nya prestationer (30 totalt).
59. Vädret skiftar mellan veckorna: sol, moln eller regn.
60. Vädret står i veckans genomgång.
61. Kollegorna säger ”Tack!” när deras ärende är klart.
62. Skrivaren skriver ut ärendelistan – bara om den nås i nätet.
63. Vattenautomat i fikarummet.
64. Dammsugarroboten Städ-Sture åker runt i kontoret.
65. Position och blickriktning sparas med autosparningen.
66. Veckans XP, rapportutkast och väder sparas också.
67. Kaffemaskinens lampa är röd medan kaffet verkar och visar tiden som är kvar.

**3D-världen**
68. Regn som rinner på fönstren.
69. Mulen eller regnig himmel och svagare sol.
70. Solstrålarna syns bara när solen skiner.
71. Regnljud.
72. Veckans nätskiss på tavlan, med det som berörs i rött.
73. Tre tavlor med konst.
74. Bokhylla med pärmar i ekonomi.
75. Mattor i receptionen och kontorslandskapet.
76. Papper och pärmar på skrivborden.
77. Upplyst Nordvik-skylt i receptionen.
78. Kabelrullar på väggen i serverrummet.
79. Brandvarnare i taket som blinkar.
80. Trafikljus vid lastkajen som följer trucken.
81. Truckladdare med pulserande lampa.
82. Utskriften glider ut ur skrivaren.
83. Bubblor i vattenautomaten.
84. Krabban lämnar fotspår.
85. Glasögonen visar accesspunkternas status.
86. Fotoläget döljer även skyltar och markeringar i världen.

**2D**
87. Omar går fram och tillbaka även i 2D.
88. Regn och moln i 2D.
89. Mjuk zoom.
90. Z och X zoomar.
91. Fotspår när du går utomhus.
92. Pratbubbla med ”…” över den du pratar med.
93. Dammsugarroboten i 2D.
94. Utskrift och bubblor i 2D.
95. ”Tack!” över kollegor i 2D.

**Ljud**
96. Skrivarljud.
97. Bubbelljud från vattenautomaten.
98. Dammsugarens surr som hörs när du är nära.
99. Ljud från dörrarna när de öppnas.
100. En diskret ton när du går in i ett nytt rum.

## Version 3: 150 förbättringar

Fokus på grafik och spelkänsla i 3D, med partiklar och efterbehandling, en snyggare terminal i 2D och ett karriärsystem med XP och prestationer.

**Efterbehandling i 3D**
1. HDR-rendering till en flyttalsbuffert med en egen efterbehandlingskedja.
2. Glöd (bloom) i fyra nivåer från lysdioder, skärmar, lampor och skyltar.
3. Mjuk tröskel för glöden, så att bara riktigt ljusa ytor lyser.
4. Egen filmisk tonmappning (ACES) i sista steget.
5. Vinjett som blir starkare när du zoomar.
6. Diskret filmkorn.
7. Lätt kromatisk aberration mot bildens kanter.
8. Färgton per rum: kallt serverrum, varmt fikarum och ett blekare lager.
9. Mättnad och kontrast per rum.
10. Exponeringen glider mjukt när du går mellan rum.
11. Rött larmsken i bildkanten under broadcaststorm i serverrummet.
12. Guldblixt i bilden när ett fel löses.
13. Kantutjämning (MSAA) i efterbehandlingen: 2× på Hög och 4× på Ultra.
14. Ny kvalitetsnivå Ultra med 4096-skuggkarta och högre upplösning.
15. Upplösningen sänks automatiskt när bildfrekvensen sjunker och höjs igen när det går bra.
16. Bildfrekvensmätare som kan slås på i inställningarna.
17. Efterbehandlingen och partiklarna kan stängas av var för sig.
18. Nätverksglasögonen ger 3D-bilden en grön ton med rörliga scanlines.
19. Världen blir suddig och mörkare bakom dialoger och menyer (i både 3D och 2D).

**Ljus och miljö i 3D**
20. Reflektioner från en förberäknad miljökarta per plats.
21. Metall och glas reflekterar mer än matta ytor.
22. Skarpare golv- och väggtexturer på avstånd (anisotrop filtrering).
23. Solstrålar genom fönstren som ljuskäglor.
24. Dammkorn som svävar i solstrålarna.
25. Moln som glider förbi i fönstren, med stadssiluett och träd.
26. Himlen och solstrålarna blir varmare under dagen.
27. Kontaktskuggor under skrivbord, stolar, soffor, växter, skåp och rack.
28. Lätt dimma i lagret i Borås.
29. Ett lysrör i lagret som flimrar.
30. Växterna gungar lite.
31. Nödutgångsskyltar som lyser grönt.
32. Ljusare utropstecken och bockar över kollegorna, så att de glöder.

**Partiklar i 3D**
33. Partikelsystem på grafikkortet med både additivt ljus och vanlig blandning.
34. Gnistor när du drar ur eller sätter i en kabel.
35. Blå ring och gnistor när konsolkabeln kopplas in.
36. Paket som färdas längs kablarna – fler ju mer trafik länken har.
37. Röda och snabba paket under broadcaststorm.
38. Rök ur racket under broadcaststorm.
39. Ljusring när en port går upp och en röd puff när den går ner.
40. Pulserande bärnstensglöd på portar som är err-disabled.
41. Konfetti när ett fel löses.
42. Fyrverkerier när veckan är klar, vid ny rang och vid prestationer.
43. Ånga från kaffemaskinen och kopparna på skrivborden.
44. Kall luft från golvplattorna och kylaggregatet i serverrummet.
45. Damm när du springer i lagret och bakom trucken.
46. Glitter runt det du tittar på.
47. Flytande "+XP"-text i världen.
48. Wifi-ringar som pulserar under anslutna accesspunkter.

**Pingspår**
49. Ping från terminalen syns som paket som hoppar mellan enheterna i världen.
50. Svaret flyger tillbaka i grönt när pingen lyckas.
51. När pingen misslyckas puffar paketet rött där det stoppades, med orsaken (ACL, ingen väg, inget ARP-svar …).
52. R spelar upp det senaste pingspåret igen.
53. Pingspåren finns i både 3D och 2D.

**Nya saker i 3D-världen**
54. Klockor som visar speltiden i fikarummet, kontoret, serverrummet och lagret.
55. Tv i receptionen med nyheter, nätstatus, lunch och väder – och rullande text.
56. Affisch med OSI-modellen och en med Nordviks värderingar.
57. Varningsram framför racken och perforerade golvplattor.
58. Statustorn på rack A: grönt när allt fungerar, orange när Krabba-fel finns kvar, rött vid storm.
59. Larmlampa vid serverrumsdörren som blinkar och lyser rött under storm.
60. Fläktar som snurrar ovanpå racken – snabbare under storm.
61. Kaffemaskin med lampa och kopp.
62. Kaffekoppar på skrivborden.
63. Trucken i lagret kör fram och tillbaka och tutar om du står i vägen.
64. Varningsskyltar i lagret.
65. Skärmsläckare på de tomma skärmarna.
66. Kollegornas skärmar visar program där text skrivs medan de arbetar.
67. Glödande målmarkör över nästa mål (inte över kollegor som redan har ett utropstecken).

**Kollegorna i 3D**
68. De blinkar.
69. Munnen rör sig och de nickar när de pratar med dig.
70. De vinkar när du kommer nära första gången.
71. De sträcker på sig och dricker kaffe då och då.
72. De skakar på huvudet när deras ärende inte är löst.
73. De hoppar av glädje när ärendet är klart.
74. Omar går fram och tillbaka vid kaffemaskinen, med kaffekopp i handen.
75. Namnskylten visar rollen när du står nära.

**Kamera och styrning i 3D**
76. Huka med C eller Ctrl för att läsa de nedersta enheterna.
77. Hoppa med mellanslag, med en duns när du landar.
78. Kameran lutar lite när du går i sidled.
79. Lite vidare synfält när du springer.
80. Mjuk musrörelse som tillval.
81. Ficklampa (V).
82. Laptopen syns i handen när du står vid enheten med konsolkabeln.
83. Markeringen färgas efter typ (konsol blå, person gul, kabel orange …) och pulserar.
84. En ikon vid siktet visar vad E gör.
85. Bilden skakar vid ny rang och när ett fel löses.
86. Kort slowmotion när ett fel löses.

**Ljud**
87. Fotsteg som låter olika på matta, trägolv, metallgolv och betong (även i 2D).
88. Kontorssorl och lagrets muller.
89. Kollegorna knattrar på tangentbordet.
90. Telefonen ringer hos den som väntar på dig, i stereo från rätt håll.
91. Larmet hörs från serverrummets håll.
92. Glasdörrarna hörs när de glider upp.
93. Nya ljud för kaffe, krabbpip, truckens tuta, XP, ny rang, prestationer, ficklampa och glasögon.
94. Lugn bakgrundsmusik som tillval, med egen volym.

**Spelmekanik**
95. XP för lösta fel, felrapporter, nya kommandon, krabban och kaffe.
96. Sex ranger från Praktikant till Krabbans ärkefiende.
97. XP-mätare uppe till höger som studsar när du får poäng.
98. Ny rang firas med fanfar, blixt och fyrverkeri.
99. Kombobonus när du löser fel i rad inom tre minuter.
100. Ledtrådar kostar 15 XP (utom på Lätt).
101. Bonus för att klara veckan och för att bli klar före fikat (högst 15 minuter).
102. Veckosammanfattningen visar hur mycket XP du tjänade.
103. 20 prestationer.
104. Karriärfönster (J) med rang, prestationer och statistik.
105. Statistik: speltid, sträcka, kommandon, ping, fel, rapporter, ledtrådar, kaffe, krabbor, kombo, veckor och kablar.
106. Svårighetsgrad: Lätt, Normal och Svår (ingen pil, markör eller utropstecken – men 50 % mer XP).
107. Krabban gömmer sig nära ett av veckans fel och springer undan när du kommer nära.
108. Fångar du krabban tappar den en lapp med namnet på enheten den pillat på.
109. Kaffe gör att du går 30 % snabbare i 90 sekunder.
110. Nätverksglasögon (G): kablarna lyser grönt, rött eller orange efter status, med statusskyltar över rack och datorer.
111. Minikarta (K) som roterar med dig i 3D.
112. Minikartan visar kollegor med ärenden som gula prickar, målet som en stjärna och rummet du står i.
113. Klicka på kartan (M) för att sätta en egen markering som pilen leder dig till.
114. Krabban och din markering syns på kartan när de är nära.
115. Omar skickar en knuff om inget händer på fem minuter (inte på Svår eller under examen).
116. Fotoläge (P) som döljer gränssnittet.
117. Tips i huvudmenyn och på laddningsskärmen.
118. Rang och prestationer syns i huvudmenyn.
119. Kaffeboost och glasögon visas i HUD:en.

**Terminalen**
120. Färgade utskrifter: uppe och nere, adresser, portnamn, MAC-adresser, loggar, varningar och fel.
121. Kommandot du skrev syns i fetstil, och prompten färgas efter läge (>, #, config).
122. Grå spökkomplettering som tas med →.
123. Statusrad med anslutning, läge och klocka.
124. Sök i utskriften med Ctrl+F; Enter hoppar till nästa träff.
125. Knapp med dina tidigare kommandon.
126. Terminalfönstret går att ändra i storlek.
127. Kort pling och röd blink vid ogiltigt kommando.
128. Fyra utseenden: klassiskt, grön fosfor, bärnsten och pixel.
129. Automatiskt utseende: pixel i 2D och klassiskt i 3D.
130. Pixelikon för enheten du är ansluten till i titelraden.
131. CRT-animation när terminalen startar.
132. Blinkande blockmarkör.

**Terminalen i 2D (16-bit)**
133. Blått SNES-fönster med vita pixelramar och skugga.
134. Pixeltypsnitten VT323 och Press Start 2P, inbakade i spelet (SIL Open Font License).
135. Scanlines, fosforglöd och lätt flimmer.
136. SNES-knappar med ▶-pekare.
137. Statusrad i pixelstil.

**2D-läget**
138. HUD, dialoger, paus, notiser, XP-mätare och minikarta i SNES-stil.
139. Partiklar i 2D: damm, glitter, konfetti, gnistor, puffar och ånga.
140. Krabban som pixelfigur med viftande klor.
141. Kaffemaskinen går att använda i 2D.
142. Nätverksglasögonen i 2D: länkarna som färgade, rörliga linjer och statusskyltar över racken.
143. Molnskuggor som glider över gräset.
144. Fåglar som flyger förbi.
145. Varmare ljus under dagen.
146. Glöd kring racken, som blir röd under storm.
147. Fyrverkerier och blixt.
148. Skakning och slowmotion när ett fel löses.
149. Flytande XP-text i pixeltypsnitt.
150. Pausrutan från 3D visas inte längre efter byte till 2D.

## Version 2: 80 förbättringar

**3D och musen**
1. Rå musrörelse (`unadjustedMovement`) där webbläsaren stöder det, annars vanligt pekarlås.
2. Filter mot plötsliga hopp i kameran när musen rycker.
3. Inställbar muskänslighet.
4. Inverterad Y-axel som val.
5. Håll och dra för att titta när pekarlåset inte går att få (med förklarande meddelande).
6. Zoom med högerklick eller Z.
7. Inställbart synfält (FOV).
8. Gunget när du går kan stängas av.
9. Tydlig markering runt det du tittar på.
10. Portnamn och portstatus visas när du tittar på en port i en frontpanel.
11. Grafikkvalitet: hög (med skuggor) eller snabb.
12. Fotsteg.
13. Brus från racken i serverrummet.
14. Skjutdörrar vid entrén som öppnas när du närmar dig.
15. Solljuset blir varmare under dagen.
16. Kollegorna vänder sig mot dig.
17. Namnskyltar tonar in när du är nära.
18. Man kan inte längre gå igenom kollegorna.
19. Serverrummet har fått kabelstege, reservkablar, brandsläckare och affischen "Regler för racket".
20. Kompass i överkanten som pekar mot nästa mål.
21. WAN-lådan syns i Borås-racket.

**2D-läget**
22. Val mellan 3D och 2D i startmenyn; valet sparas.
23. Pixelgrafik i 16-bitarsstil ritad direkt i spelet – ingen bildfil behövs.
24. Animerade figurer som går åt fyra håll.
25. Utemiljö med gräs, träd, buskar, parkering och lastbil vid lagret.
26. Väggar tonas ut när du går bakom dem.
27. Klicka för att gå, klicka på saker för att använda dem.
28. Zoom med mushjul och + / −.
29. Pratbubblor: ! för ärenden, ✓ för klara.
30. Blinkande LED:ar på racken och statuslampor på skärmarna.
31. Byt mellan 3D och 2D mitt i en vecka utan att förlora något.
32. Pausmeny med Esc.
33. Borås-lagret med pallställ, lastport och accesspunkter.

**Spelet**
34. Laddningsskärm.
35. Pausmeny i båda lägena (fortsätt, inställningar, karta, meny).
36. Inställningar för mus, bild, ljud, terminal och 2D-zoom.
37. Ljudeffekter med volym och valbart tangentljud.
38. Automatisk sparning var tionde sekund – "Fortsätt" i menyn.
39. Stjärnor och bästa tid per vecka.
40. Märken: Utan ledtrådar, Snabb tekniker, Felfria rapporter, Examen klarad.
41. Examen: en slumpad vecka utan ledtrådar.
42. Fri träning i ett felfritt nät.
43. Bekräftelse innan du lämnar en påbörjad vecka.
44. Guide för första veckan som visar nästa steg.
45. Karta (M) med kollegor, ditt läge och en linje till nästa mål.
46. Snabbresa till rum från kartan.
47. Rackvy med frontpanelerna på nära håll.
48. Håll musen över en port i rackvyn för status, klicka för att koppla in konsolen.
49. Dra ur reservkabeln direkt i rackvyn.
50. Återkoppling på felrapporten med "Så här löser du det".
51. Felrapporter kan kopieras eller laddas ner som Markdown.
52. Arkiv över inlämnade rapporter i ärendelistan.
53. Anteckningar (N) som sparas.
54. Kommandologg (O) över allt du skrivit.
55. Hjälp (F1).
56. HUD:en kan fällas ihop (U).
57. Småprat med kollegorna när de inte har ett ärende.
58. Övervakningsskärmen visar fyra grafer och status för AP, NTP och loopar.
59. Sökfält i handboken.
60. Subnätkalkylator i handboken.
61. OSI-flik i handboken.
62. Ordlista i handboken.
63. Kortkommandon i handboken.
64. Veckokorten i menyn visar vad du lär dig, bästa tid och märken.
65. Spelet pausas när fliken är dold och ritar mindre bakom dialoger.
66. Larm i serverrummet vid broadcaststorm.
67. Tangentbordsfokus syns tydligt och animationer minskas om systemet ber om det.

**Terminalen**
68. Större/mindre text i terminalen.
69. Kopiera markering (Ctrl+Shift+C) och kopiera-knapp.
70. Ctrl+L rensar, PageUp/PageDown bläddrar.
71. Förslag på kommandon för veckans tema (klicka för att skriva in).
72. SSH till WLC:n med bekräftelse av värdnyckel.

**Nya kommandon**
73. `show vlan id`, `show processes cpu`.
74. `show cdp neighbors detail`, `show spanning-tree summary` och `blockedports`.
75. `show inventory`, `show interfaces counters errors`.
76. `ping … source`, `default interface`.
77. `errdisable recovery`, `terminal history size`.
78. Tab-komplettering av interfacetyper (`gi` → `GigabitEthernet`).
79. Windows: `route print`, `Test-NetConnection`/`tnc`, `ipconfig /flushdns` och `/displaydns`, `netstat`.
80. Linux: `history`, `nc`, `arp`, `hostname -I`, `cat /etc/resolv.conf`.

## Kod

```
natverksspel/
  index.html, css/style.css
  lib/three.min.js           three.js r158 (MIT, se lib/THREE-LICENSE)
  lib/fonts/                 VT323 och Press Start 2P (SIL Open Font License, se OFL-*.txt)
  js/net/                    nätverksmodell (model.js) och simulator (sim.js)
  js/cli/                    Cisco IOS (ios.js, ios_show.js), Windows/Linux (host.js, fler kommandon
                             i host_more.js), WLC (wlc.js), lastbalanseraren (lb.js), fler WLC- och
                             LB-kommandon (more7.js)
  js/levels.js               veckorna, felen, kontrollerna och ledtrådarna
  js/world/                  3D-världen (world.js, efterbehandling i post.js, partiklar i fx.js,
                             detaljer i extras.js), 2D-världen (world2d.js, pixelkonst i art2d.js,
                             miljö, ljus och effekter i scene2d.js, djur och liv i life2d.js),
                             delad kod (shared.js)
  js/ui/                     terminal, dialoger, handbok, inställningar, ljud, karriär (career.js)
                             och minikarta (minimap.js); det nya i version 7 i v7.js och css/v7.css
  js/game.js                 spelloopen
  test/                      tester
```

### Tester

```
node natverksspel/test/levels.js   # varje fel syns från start och försvinner med rätt CLI-lösning
node natverksspel/test/build.js    # varje byggsteg är olöst från start och byggs upp med CLI-kommandon
node natverksspel/test/smoke.js    # DHCP, ping, NAT, DNS och STP i det felfria nätet
node natverksspel/test/cli.js SW1 "show vlan brief" "show interfaces trunk"
```

Webbläsartesterna `test/ui.js`, `test/flow.js`, `test/view.js`, `test/boot.js`, `test/features.js`, `test/v3.js`, `test/v4.js` och `test/v5.js` använder Playwright. Starta en webbserver på port 8765 i `natverksspel/` först.
