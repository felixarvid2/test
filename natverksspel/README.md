# Krabba-passet

Ett 3D-spel för kursen Nätverksteknik. Du är ny nätverkstekniker på Nordvik och går runt på huvudkontoret i Göteborg och på lagret i Borås. Varje vecka har "Krabban" gjort sönder två saker i racket, och en kollega har ett ärende till dig. Du kopplar in konsolkabeln i Cisco-utrustningen, felsöker med riktiga CLI-kommandon, rättar felet och skriver en felrapport.

Nätet, adressplanen, utrustningen och felen följer kursboken *Nätverksteknik – Från sladden och uppåt*: kapitel 1–9, bilaga D (felbiblioteket) och bilaga G (racket och Nordviks adressplan).

## Starta

Spelet är helt statiskt och behöver ingen installation eller internetuppkoppling (three.js ligger i `lib/`).

- **Enklast:** öppna `index.html` i Chrome, Edge eller Firefox.
- **Eller via en lokal webbserver:** `npx http-server natverksspel` och gå till `http://localhost:8080`.

Spelet kräver mus och tangentbord samt en webbläsare med WebGL.

## Styrning

| Tangent | Gör |
|---|---|
| W A S D / pilar, Shift | Gå, spring |
| Mus | Titta (klicka i bilden för att styra) |
| E / klick | Använd det du tittar på: koppla in konsol, prata, använda dator |
| T | Öppna laptopen |
| F | Skriv felrapport |
| L | Ledtråd (FASTNAR DU HÄR?) |
| H | Handbok: kommandon, felbibliotek, adressplan |
| Tab | Ärendelistan |

I terminalen fungerar `?`, Tab, ↑/↓, Ctrl+C, Ctrl+Z och Ctrl+A K (stäng `screen`).

Lösenord (står på lappen vid laptopen): enable `Krabba2026`, ssh `drift` / `Krabba2026`.

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

Varje fel är simulerat på riktigt. Symptomen räknas fram ur konfigurationen: länkar, duplex, VLAN och trunkar, STP, routing, ARP, ACL, NAT, DHCP, DNS, PoE och port security. Ett fel försvinner därför bara när orsaken är rättad.

## Kod

```
natverksspel/
  index.html, css/style.css
  lib/three.min.js           three.js r158 (MIT, se lib/THREE-LICENSE)
  js/net/                    nätverksmodell (model.js) och simulator (sim.js)
  js/cli/                    Cisco IOS (ios.js, ios_show.js), Windows/Linux (host.js), WLC (wlc.js)
  js/levels.js               veckorna, felen, kontrollerna och ledtrådarna
  js/world/                  3D-världen (byggnader, rack, personer, rendering)
  js/ui/                     terminal, dialoger, handbok
  js/game.js                 spelloopen
  test/                      tester
```

### Tester

```
node natverksspel/test/levels.js   # varje fel syns från start och försvinner med rätt CLI-lösning
node natverksspel/test/smoke.js    # DHCP, ping, NAT, DNS och STP i det felfria nätet
node natverksspel/test/cli.js SW1 "show vlan brief" "show interfaces trunk"
```

Webbläsartesterna `test/ui.js`, `test/flow.js` och `test/view.js` använder Playwright. Starta en webbserver på port 8765 i `natverksspel/` först.
