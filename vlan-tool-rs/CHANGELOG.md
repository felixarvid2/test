# Ändringslogg

Alla märkbara ändringar i vlantool. Formatet följer ungefär [Keep a Changelog](https://keepachangelog.com/sv/1.1.0/).

## 0.3.0

200 förbättringar, listade och markerade i `FORBATTRINGAR.md`:

- Regler: 33 nya (61 totalt), bl.a. SSH-skydd, vty-ACL, SNMP-communities, DTP, port-security, ACL:er som saknas eller inte används, statiska vägar och DHCP-överlapp
- Kärna: parsern förstår `interface range`, flerradiga banners, röst-VLAN, port-security, ACL:er m.m.; CSV med semikolon och nya valfria kolumner; generatorn skriver säkrare konfigar som klarar de nya reglerna
- Granskning: `! vlantool:ignore`, betyg per kategori, fler kontroller mellan enheter, baslinje, SARIF och JUnit, HTML-rapport med sökning, topologi och utskriftsläge, DOT och Mermaid
- Kommandorad och TUI: `explain`, `watch`, `baseline`, `inventory`, `stats`, `completions`, `--project`, `--quiet`; TUI med sökning, filter, mus, drift-, CSV- och regelflik
- Skrivbordsprogrammet: kommandopalett, regelflik, betygshistorik, CSV-redigering, VLAN- och länkdetaljer, SVG-export, sida-vid-sida-drift, högkontrasttema, filbevakning, dra och släpp
- Paketering och tester: CI, AppStream, man-sidor, skalkomplettering, golden-, integrations- och robusthetstester, `rustfmt`

## 0.2.0

- Skrivbordsprogrammet `vlantool-gui` (egui/eframe) med flikar för översikt, fynd, portar, VLAN, topologi, konfig, drift, CSV-data, subnät och inställningar
- Rapporter i HTML, Markdown, JSON, CSV och text samt rättningsskript från GUI:t
- Debianpaket (.deb) med `vlantool`, `vlantool-gui`, skrivbordsfil och ikoner, byggt med `packaging/build-deb.sh`

## 0.1.0

- Kommandoradsverktyget `vlantool` med `generate`, `validate`, `audit`, `fix`, `drift`, `diff`, `topology`, `rules`, `subnet`, `init` och `run`
- TUI med flikar för översikt, fynd, portar, VLAN-matris, topologi och konfig
- 28 granskningsregler med allvarlighetsgrad, förklaring och rättning samt betyg 0-100 och A-F
- Granskning mellan enheter: trunkar, native-VLAN, IP-krockar och gateway
- Inställningar i `nordvik.toml`
