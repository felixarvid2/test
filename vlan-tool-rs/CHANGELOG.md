# Ändringslogg

Alla märkbara ändringar i vlantool. Formatet följer ungefär [Keep a Changelog](https://keepachangelog.com/sv/1.1.0/).

## Ej släppt

- De 200 förbättringarna i `FORBATTRINGAR.md`, uppdelade i sex områden:
- Regler: fler och skarpare granskningsregler med rättningar (A)
- Kärna: parser, CSV-inläsning, generator, nätmatte och inställningar (B)
- Granskning och rapporter: baslinje, ignorerade fynd, fler format (C)
- Kommandorad och TUI: skalkomplettering och fler kommandon (D)
- Skrivbordsprogrammet: förbättrade flikar och arbetsflöden (E)
- Paketering och tester: CI, AppStream, man-sidor, skalkomplettering, `changelog.Debian.gz`, `build-deb.sh --no-build` med sha256-fil, felsökning i README samt integrations-, nätmatte- och robusthetstester (F)

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
