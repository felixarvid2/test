# Granskningsregler


## Grund

| Id | Nivå | Gäller | Regel | Varför |
|---|---|---|---|---|
| `hostname` | HÖG | alla | Hostname är satt | Utan hostname går det inte att se vilken enhet man är inloggad på, och SSH-nycklar kräver ett namn. |
| `banner` | INFO | alla | Inloggningsbanner | En varningstext gör det juridiskt tydligt att intrång inte är tillåtet. |
| `domain-lookup` | INFO | alla | Inga DNS-uppslag av kommandon | Ett felstavat kommando tolkas annars som ett värdnamn och terminalen hänger. |
| `hostname-format` | MEDEL | alla | Giltigt hostname | Hostname används i DNS, SSH-nycklar och prompten och ska bara ha bokstäver, siffror och bindestreck (max 63 tecken). |
| `name-server` | INFO | alla | DNS-server vid DNS-uppslag | Är DNS-uppslag på utan namnserver väntar terminalen på en time-out efter varje felskrivet kommando. |
| `banner-welcome` | LÅG | alla | Ingen välkomsthälsning i bannern | En banner som hälsar välkommen kan tolkas som tillstånd att logga in; den ska varna. |

## Åtkomst

| Id | Nivå | Gäller | Regel | Varför |
|---|---|---|---|---|
| `ssh` | HÖG | alla | SSH v2 med domännamn | SSH-nycklar skapas från hostname + domännamn. Version 1 har kända säkerhetshål. |
| `vty-ssh` | KRITISK | alla | Bara SSH på vty | Telnet skickar lösenord i klartext över nätet. |
| `login` | KRITISK | alla | Inloggning med lokala konton | 'login local' kräver användarnamn + lösenord och loggar vem som loggade in. |
| `exec-timeout` | MEDEL | alla | Inaktiva sessioner loggas ut | En bortglömd inloggad session kan användas av någon annan. |
| `http` | MEDEL | alla | Ingen okrypterad webbserver | HTTP-gränssnittet skickar inloggningen i klartext. |
| `ssh-timeout` | LÅG | alla | SSH time-out högst 60 s | Ett långt time-out låter en angripare hålla halvöppna inloggningar uppe. |
| `ssh-retries` | LÅG | alla | Högst 3 SSH-inloggningsförsök | Färre försök per anslutning gör lösenordsgissning långsammare. |
| `aaa` | INFO | alla | AAA aktiverat | aaa new-model ger central styrning av inloggning, behörighet och loggning. |
| `login-block` | LÅG | alla | Skydd mot lösenordsgissning | login block-for stänger inloggningen en stund efter flera misslyckade försök. |
| `cdp-wan` | LÅG | router | Inget CDP mot yttre nätet | CDP berättar modell, IOS-version och adresser för vem som lyssnar på länken mot operatören. |
| `source-route` | LÅG | router | Ingen IP source routing | Source routing låter avsändaren välja väg och kan användas för att runda brandväggar. |
| `small-servers` | MEDEL | alla | Inga onödiga småtjänster | TCP/UDP small servers och finger är gamla tjänster som läcker information och kan missbrukas. |
| `vty-acl` | LÅG | alla | Begränsa vty med access-class | En ACL på vty gör att bara hanteringsnätet kan försöka logga in. |
| `aux` | LÅG | alla | AUX-porten avstängd | Ett oanvänt modem- eller konsolspår är en onödig väg in till enheten. |
| `snmp` | HÖG | alla | Säker SNMP | public/private är kända och RW låter vem som helst ändra konfigen över nätet. |
| `https-auth` | LÅG | alla | HTTPS med inloggning | Webbservern ska använda lokala konton och inte stå öppen eller med ett delat lösenord. |
| `acl-unused` | INFO | alla | Inga oanvända ACL:er | En ACL som inget använder är oftast kvarglömd och förvirrar den som läser konfigen. |
| `acl-missing` | HÖG | alla | Använda ACL:er finns | Pekar ip access-group eller access-class på en ACL som saknas släpps all trafik igenom. |

## Lösenord

| Id | Nivå | Gäller | Regel | Varför |
|---|---|---|---|---|
| `users` | HÖG | alla | Lokala användare med secret | 'password' sparas i klartext eller med typ 7 som knäcks på sekunder. |
| `enable` | HÖG | alla | Enable secret | Skyddar privilegierat läge (konfigurationsrättigheter). |
| `placeholder` | MEDEL | alla | Inga platshållarlösenord | CHANGE_ME är ett känt lösenord som alla som läst koden vet om. |
| `pw-encryption` | LÅG | alla | service password-encryption | Döljer lösenord om någon tittar över axeln på 'show run'. |
| `secret-type` | INFO | alla | Stark hash för lösenord | Typ 5 (MD5) är snabb att knäcka; typ 9 (scrypt) är avsevärt starkare. |

## Drift

| Id | Nivå | Gäller | Regel | Varför |
|---|---|---|---|---|
| `timestamps` | LÅG | alla | Tidsstämplar i loggen | Utan tidsstämplar går det inte att följa vad som hände när. |
| `ntp` | MEDEL | alla | NTP-server | Rätt tid behövs för loggar, certifikat och felsökning mellan enheter. |
| `logging` | MEDEL | alla | Extern loggserver | Loggar som bara finns lokalt försvinner vid omstart. |
| `clock` | INFO | alla | Tidszon satt | Utan tidszon visar loggarna UTC och går inte att jämföra med lokal tid. |
| `logging-trap` | LÅG | alla | Lagom loggnivå till loggservern | Nivån debugging skickar enorma mängder meddelanden och kan belasta enheten och loggservern. |

## VLAN

| Id | Nivå | Gäller | Regel | Varför |
|---|---|---|---|---|
| `vlans` | HÖG | switch | Använda VLAN är definierade | En port i ett VLAN som inte finns blir inaktiv och trafiken går ingenstans. |
| `unused-vlans` | INFO | switch | Inga oanvända VLAN | Gamla VLAN gör konfigen svårläst och kan tas i bruk av misstag. |
| `trunk` | HÖG | switch | Säkra trunkar | Native-VLAN 1 möjliggör VLAN-hopping; 'allowed all' släpper igenom VLAN som inte ska dit. |
| `access-vlan1` | MEDEL | switch | Accessportar inte i VLAN 1 | VLAN 1 används för kontrolltrafik och ska inte ha vanliga datorer. |
| `blackhole-vlan` | INFO | switch | Avstängda portar i eget VLAN | Ligger avstängda portar i ett oanvänt VLAN hamnar ingen där av misstag i VLAN 1. |
| `vtp` | LÅG | switch | VTP med lösenord | Utan VTP-lösenord kan en främmande switch med högre revision skriva över hela VLAN-databasen. |
| `mgmt-vlan1` | MEDEL | alla | Ingen hantering i VLAN 1 | VLAN 1 finns på alla portar och är det första en angripare provar. |
| `vlan1-shutdown` | LÅG | alla | Vlan1 avstängt | När hanteringen ligger i ett annat VLAN ska SVI:n för VLAN 1 vara avstängd. |

## Switching

| Id | Nivå | Gäller | Regel | Varför |
|---|---|---|---|---|
| `edge` | LÅG | switch | Portfast + BPDU guard | Datorer får nät direkt, och en inkopplad switch stänger porten istället för att skapa en loop. |
| `stp` | LÅG | switch | Rapid spanning tree | Rapid-PVST går över på sekunder istället för ~50 s vid förändringar. |
| `mgmt` | HÖG | switch | Hanterings-IP och gateway | Switchen måste ha en IP och en gateway för att kunna administreras över nätet. |
| `unused-ports` | LÅG | switch | Lediga portar avstängda | En ofylld port som är på kan användas av vem som helst som kopplar in en kabel. |
| `dtp` | LÅG | switch | Ingen DTP-förhandling | switchport nonegotiate hindrar att en inkopplad enhet förhandlar upp en trunk. |
| `port-security` | INFO | switch | Port security på accessportar | Begränsar hur många MAC-adresser en port lär sig och stoppar okända enheter. |
| `stp-root` | INFO | switch | Vald root bridge | Utan prioritet väljs root bridge efter MAC-adress, ofta den äldsta switchen. |
| `dhcp-snooping` | INFO | switch | DHCP snooping | Släpper bara igenom DHCP-svar från betrodda portar och stoppar falska DHCP-servrar. |
| `duplex` | MEDEL | alla | Ingen halv duplex | Half duplex ger kollisioner och dålig prestanda, oftast efter en felaktig manuell inställning. |

## Dokumentation

| Id | Nivå | Gäller | Regel | Varför |
|---|---|---|---|---|
| `description` | INFO | alla | Portbeskrivningar | Beskrivningar visar vad som sitter i porten och används för att rita topologin. |

## Routing

| Id | Nivå | Gäller | Regel | Varför |
|---|---|---|---|---|
| `subif` | KRITISK | router | Router-on-a-stick | Varje subinterface behöver rätt dot1Q-tagg och en IP, och den fysiska porten måste vara på. |
| `dhcp` | HÖG | router | DHCP-pooler | Fel default-router eller saknade undantag ger klienter som inte når ut eller IP-krockar. |
| `nat` | HÖG | router | NAT är komplett | NAT kräver inside, outside, en regel och en ACL som finns. |
| `route` | MEDEL | router | Standardväg | Utan standardväg vet routern inte vart internettrafik ska. |
| `dup-ip` | KRITISK | alla | Inga IP-krockar | Samma eller överlappande nät på två interface gör routingen oförutsägbar. |
| `static-route` | MEDEL | router | Statiska vägar når ett anslutet nät | Är nästa hopp inte i ett anslutet nät kan routern inte skicka paketet och vägen blir aldrig aktiv. |
| `dhcp-overlap` | HÖG | router | DHCP-pooler överlappar inte | Överlappande pooler kan dela ut samma adress i två nät och ge IP-krockar. |
| `dhcp-excluded` | LÅG | alla | Undantag ligger i en pool | Ett undantag utanför alla pooler gör ingenting och är oftast ett skrivfel eller en rest. |
| `ip-netaddr` | HÖG | alla | Interface-IP är en värdadress | Nät- och broadcastadressen går inte att använda som adress på ett interface. |

61 regler.
