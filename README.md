**Status**: Erst-Release 27.11.2025

# node-red-contrib-ta-cmi-coe

Node-RED Bibliothek zum Lesen und Schreiben von Werten an Technische Alternative CMI über CAN over Ethernet (CoE).

## Funktionsumfang

- Unterstützung für CoE-Version 1 + 2
- **CoE Input Node**: Empfang von analogen und digitalen Einzelwerten von der CMI
- **CoE Output Node**: Senden einzelner Werte an das CMI/Regler
- **CoE Monitor**: Empfängt und überwacht Pakete von allen Quellen
- Automatische Konvertierung analoger Werte basierend auf Unit ID
- Unterstützung für von TA definierte Messgrößen
- Konfiguration von CMI und CoE-Version

## Installation

### Über Node-RED Palette Manager (empfohlen)

1. Öffne Node-RED
2. Menü → Manage palette → Install
3. Suche nach `node-red-contrib-ta-cmi-coe`
4. Installiere das Paket

### Manuelle Installation

```bash
cd ~/.node-red
npm install node-red-contrib-ta-cmi-coe
```

### Lokale Entwicklungsumgebung

```bash
cd ~/.node-red
git clone https://github.com/mayflo/node-red-contrib-ta-cmi-coe.git
cd node-red-contrib-ta-cmi-coe
npm link
cd ~/.node-red
npm link node-red-contrib-ta-cmi-coe
```

Starte Node-RED neu.

## Voraussetzungen

- Node-RED v1.0.0 oder höher
- CMI von Technische Alternative mit Firmware 1.39.1 oder höher
- Die verwendete CoE-Version wird auf dem CMI konfiguriert (Einstellungen > CAN > CoE).
- Für Empfang: CoE-Ausgänge müssen auf der CMI konfiguriert werden (Einstellungen > Ausgänge > CoE).
- Für Senden: CAN-Eingänge müssen auf dem Regler konfiguriert werden.
- Für den Empfang von Nachrichten benötigt die verwendeten CMIs eine fest eingestellte IP-Addresse
- Die Kommunikation erfolgt über UDP-Ports, welche auf dem Node-RED-Host geöffnet werden müssen (CoE V1 Port 5441 / CoE V2 Port 5442)

## Unterstützte Geräte

Die Bibliothek wurde für UVR610 entwickelt und getestet, funktioniert aber grundsätzlich mit allen Geräten, die über den CAN-Bus der CMI verbunden sind:

- UVR16x2
- UVR1611
- UVR61-3
- X2 Regler
- Andere CAN-Bus Geräte von Technische Alternative

## Schnellstart

### 1. CMI Configuration Node erstellen

Erstelle zunächst eine CMI Configuration:
- Öffne einen beliebigen Node zur Bearbeitung
- Bei "CMI Config" auf Plus klicken → "Add new CMI config..."
- **Lokale IP**: IP-Adressbereich des UDP-Ports (0.0.0.0 = alle Interfaces, 127.0.0.1 = lokales Netzwerk)
- **CMI Adresse**: (Feste) IP-Adresse des CMI
- **CoE Version**: CoE V1/V2

### 2. CMI konfigurieren

#### Für Empfang (CoE Input):
Auf der CMI unter **Einstellungen → Ausgänge → CoE**:
- **Eingang**: CAN-Bus Eingang (z.B. CAN1)
- **IP**: IP-Adresse von Node-RED
- **Knoten**: Wert aus "Node Number" des Input Nodes
- **Netzwerkausgang**: Nummer des Ausgangs (1-32)
- **Sendebedingung**: Nach Bedarf

#### Für Senden (CoE Output):
Auf dem Regler: CAN-Eingang konfigurieren
- **Knoten**: Wert aus "Node Number" des Output Nodes
- **Ausgangsnummer**: Nummer des Ausgangs (1-32)
- **Messgröße**: "Automatisch" für Unit von Node-RED

### 3. Beispiel Flow

```json
[
    {
        "id": "mycmi",
        "type": "cmiconfig",
        "name": "Mein CMI",
        "localip": "0.0.0.0",
        "address": "192.168.0.100",
        "coeVersion": 1
    },
    {
        "id": "input_example",
        "type": "coe-input",
        "name": "Temperatur Sensor",
        "cmiconfig": "mycmi",
        "nodeNumber": 10,
        "outputNumber": 1,
        "dataType": "analog",
        "timeout": 20,
        "x": 150,
        "y": 100,
        "wires": [["debug123"]]
    },
    {
        "id": "debug123",
        "type": "debug",
        "name": "Message",
        "x": 350,
        "y": 100
    },
    {
        "id": "inject1",
        "type": "inject",
        "name": "Setze Sollwert",
        "payload": "22.5",
        "payloadType": "num",
        "repeat": "",
        "x": 150,
        "y": 200,
        "wires": [["output_example"]]
    },
    {
        "id": "output_example",
        "type": "coe-output",
        "name": "Sollwert Heizung",
        "cmiconfig": "mycmi",
        "nodeNumber": 11,
        "outputNumber": 5,
        "dataType": "analog",
        "unit": 1,
        "x": 350,
        "y": 200
    }
]
```

## Node Typen

### CoE Input Node

Empfängt Werte von der CMI.

**Output Message:**
```javascript
{
    payload: 22.5,                    // Der Wert
    topic: "coe/10/analog/1",         // Format: coe/{node}/{type}/{output}
    coe: {
        nodeNumber: 10,               // CAN Knoten-Nummer
        blockNumber: 1,               // CoE Block-Nummer
        outputNumber: 1,              // Netzwerkausgang
        dataType: "analog",           // Typ
        unit: 1,                      // Unit ID (z.B. 1 = °C)
        unitName: "Temperatur °C",    // Unit Name
        unitSymbol: "°C°",            // Unit Symbol
        sourceIP: "192.168.1.100",    // IP der CMI
        raw: { ... }                  // Rohdaten
    }
}
```

### CoE Output Node

Sendet einzelne Werte an die CMI.

**Input Message:**
```javascript
// Einfach:
msg.payload = 22.5;

// Mit eigener Unit:
msg.payload = 22.5;
msg.coe = { unit: 1 };  // Überschreibt Config
```

## Troubleshooting

### Keine Daten empfangen?

1. **CMI CoE-Ausgänge prüfen**: IP und Port korrekt?
2. **Lokale IP**: Max. Empfangsbereich mit Lokale IP = 0.0.0.0 (alle) überprüfen (insbesondere für Docker-Umgebungen)
3. **Firewall**: Port 5441/UDP (CoE V1) bzw. 5442/UDP (CoE V2) offen?
4. **Node Number**: Stimmt mit CMI-Konfiguration überein?
5. **Debug aktivieren**: "Receive All" aktivieren und Debug-Output prüfen

### Senden funktioniert nicht?

1. **CMI erreichbar?** Ping zur CMI IP
2. **CAN-Eingang auf Regler**: Knoten-Nr und Ausgangsnr korrekt?
3. **Timeout auf Regler?** "Sende Ausgänge alle" Intervall nutzen

### Mehrere CMIs?

- Verwende unterschiedliche Node Numbers
- ODER verwende unterschiedliche Blocks
- Sonst überschreiben sich die Werte gegenseitig!

### Werte falsch?

- **Zu große Werte**: CAN-Bus V1 ist limitiert auf ±32767 (dimensionslos)
- **Falsche Unit**: Manche Units (Arbeitszahl, Euro) haben Einschränkungen
- **Nachkommastellen**: Prüfe ob korrekte Unit ID verwendet wird

## Bekannte Einschränkungen

1. **Max. Wertbereich**: CAN-Bus Version 1 ist limitiert auf ±32767 (V2 für größeren Wertebereich)
2. **Keine Quittierung**: CoE hat keine Bestätigung (fire-and-forget)
3. **CMI als Gateway**: Werte werden vom CMI übertragen, können aber nicht direkt an CMI gesendet werden (nur an Regler)

## Erweiterte Nutzung

### Periodisches Senden (verhindert Timeout)

```javascript
// In Function Node:
const intervalMinutes = 5;

// Timer starten
if (!context.timer) {
    context.timer = setInterval(() => {
        node.send({ payload: msg.payload });
    }, intervalMinutes * 60 * 1000);
}

return msg;
```

### Custom Unit Conversion

```javascript
// In Function Node vor Output:
const rawValue = msg.payload * 100;  // 2 Nachkommastellen
msg.payload = rawValue;
msg.coe = { unit: 0 };  // Dimensionslos
return msg;
```

## Lizenz

Veröffentlicht unter der [Apache 2.0 Lizenz](LICENSE)

- ✅ Private und gewerbliche Nutzung
- ⚠️ Keine Haftung für Schäden durch Nutzung

## Credits

Basiert auf dem Protokoll-Verständnis und der Dokumentation von:
- [SymconJoTTACoE](https://github.com/jotata/SymconJoTTACoE/) von jotata
- [Ta-CoE](https://gitlab.com/DeerMaximum/ta-coe) von DeerMaximum

## Support

- **Issues**: GitHub Issue Tracker
- **Fragen**: GitHub Discussions
- **Dokumentation**: Siehe README und Node-RED Info-Panel

## Autor

mayflo

---

**Hinweis**: Diese Bibliothek wurde in der Freizeit entwickelt. Support erfolgt nach Verfügbarkeit. Besten Dank für dein Verständnis! 😊
