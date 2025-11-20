**Status**: In Entwicklung

# node-red-contrib-ta-cmi-coe

Node-RED Bibliothek zum Lesen und Schreiben von Werten an Technische Alternative CMI über CAN over Ethernet (CoE).

Eine offizielle Schnittstellen-Dokumentation durch TA fehlt. Die Umsetzung von CoE V1 basiert auf dem Protokoll-Verständnis von [SymconJoTTACoE](https://github.com/jotata/SymconJoTTACoE/).

## Funktionsumfang

- **CoE Input Node**: Empfang von analogen und digitalen Einzelwerten von der CMI
- **CoE Output Node**: Senden einzelner Werte an die CMI/Regler
- **CoE Block Output Node**: Senden kompletter Datenblöcke (effizient)
- **CoE Monitor**: Empfängt und überwacht Pakete von allen Quellen
- Automatische Konvertierung analoger Werte basierend auf Unit ID
- Unterstützung für von TA definierte Messgrößen
- Konfiguration von CMI und CoE-Version

## Installation

### Über Node-RED Palette Manager

1. Öffne Node-RED
2. Menü → Manage palette → Install
3. Suche nach `node-red-contrib-ta-cmi-coe`
4. Installiere das Paket

### Manuelle Installation

```bash
cd ~/.node-red
npm install node-red-contrib-ta-cmi-coe
```

### Lokale Entwicklung

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
- **CMI Address**: (Feste) IP-Addresse des CMI
- **CoE Version**: CoE V1 (Standard)

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
        "id": "input_example",
        "type": "coe-input",
        "name": "Temperatur Sensor",
        "cmiconfig": "cmi_config_id",
        "nodeNumber": 10,
        "outputNumber": 1,
        "dataType": "analog",
        "x": 150,
        "y": 100
    },
    {
        "id": "debug1",
        "type": "debug",
        "name": "",
        "x": 350,
        "y": 100,
        "wires": [["input_example"]]
    },
    {
        "id": "inject1",
        "type": "inject",
        "name": "Setze Sollwert",
        "payload": "22.5",
        "payloadType": "num",
        "repeat": "",
        "x": 150,
        "y": 200
    },
    {
        "id": "output_example",
        "type": "coe-output",
        "name": "Sollwert Heizung",
        "cmiconfig": "cmi_config_id",
        "nodeNumber": 11,
        "outputNumber": 5,
        "dataType": "analog",
        "unit": 1,
        "x": 350,
        "y": 200,
        "wires": [["inject1"]]
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
        unitName: "°C",              // Unit Name
        sourceIP: "192.168.1.100",   // IP der CMI
        raw: { ... }                 // Rohdaten
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

**Unterstützte Units:**
- 0: Dimensionslos
- 1: °C (Celsius)
- 8: % (Prozent)
- 10: kW (Kilowatt)
- 11: kWh (Kilowattstunde)
- 23: bar
- 65: mbar
- [Weitere siehe units-config.js]

### CoE Block Output Node

Sendet komplette Datenblöcke (effizienter).

**Input Message für Analog (4 Werte):**
```javascript
msg.payload = [20.5, 30.0, 15.8, 25.3];
msg.coe = { 
    units: [1, 1, 1, 1]  // Optional: °C für alle
};
```

**Input Message für Digital (16 Werte):**
```javascript
// Als Array:
msg.payload = [1,0,1,1,0,0,0,1,1,1,0,0,1,0,1,0];

// Als String:
msg.payload = "1011000111001010";
```

## CoE Protokoll Details

### Datenblöcke

CoE sendet immer Datenblöcke über UDP Port 5441:
- **Analog**: 4 Werte pro Block (12 Blöcke = 32 Ausgänge)
- **Digital**: 16 Werte pro Block (2 Blöcke = 32 Ausgänge)

| Block | Typ | Ausgänge |
|-------|-----|----------|
| 0 | Digital | 1-16 |
| 1 | Analog | 1-4 |
| 2 | Analog | 5-8 |
| 3 | Analog | 9-12 |
| 4 | Analog | 13-16 |
| 5 | Analog | 17-20 |
| 6 | Analog | 21-24 |
| 7 | Analog | 25-28 |
| 8 | Analog | 29-32 |
| 9 | Digital | 17-32 |

### Paketformat

Jedes CoE-Paket ist 14 Bytes groß:

**Analog:**
```
Byte 0-1:   Knoten-Nr, Block-Nr
Byte 2-9:   4x Wert (Int16 BigEndian) Stimmt das wirklich - für kleinere Wert wird nur der 1.Byte verwendet???
Byte 10-13: 4x Unit ID
```

**Digital:**
```
Byte 0-1:   Knoten-Nr, Block-Nr
Byte 2-3:   16 Bits (UInt16 LittleEndian)
Byte 4-13:  Padding (0)
```

### Werte-Konvertierung

Analoge Werte werden dimensionslos als Signed Int16 (-32768 bis +32767) übertragen. Die Unit ID bestimmt die Nachkommastellen:
- Standard: 2 Nachkommastellen (Wert / 100)
- kW Leistung (Unit 44): 1 Nachkommastelle (Wert / 10)

**Beispiel:**
- Übertragen: 2250 mit Unit ID 1 (°C)
- Angezeigt: 22.50°C

## Troubleshooting

### Keine Daten empfangen?

1. **CMI CoE-Ausgänge prüfen**: IP und Port korrekt?
2. **Firewall**: Port 5441 UDP offen?
3. **Node Number**: Stimmt mit CMI Config überein?
4. **Debug aktivieren**: "Receive All" aktivieren und Debug-Output prüfen

### Senden funktioniert nicht?

1. **CMI erreichbar?** Ping zur CMI IP
2. **CAN-Eingang auf Regler**: Knoten-Nr und Ausgangsnr korrekt?
3. **Timeout auf Regler?** "Sende Ausgänge alle" Intervall nutzen

### Mehrere CMIs?

- Verwende unterschiedliche Node Numbers
- ODER verwende unterschiedliche Blocks
- Sonst überschreiben sich die Werte gegenseitig!

### Werte falsch?

- **Zu große Werte**: CAN-Bus limitiert auf ±32767 (dimensionslos)
- **Falsche Unit**: Manche Units (Arbeitszahl, Euro) haben Einschränkungen
- **Nachkommastellen**: Prüfe ob korrekte Unit ID verwendet wird

## Bekannte Einschränkungen

1. **Max. Wertbereich**: CAN-Bus limitiert auf Int16 (-32768 bis +32767 dimensionslos)
2. **Problematische Units**: Euro, Dollar, Arbeitszahl, Dimensionslos mit 0.5 Schritten
3. **Keine Quittierung**: CoE hat keine Bestätigung (fire-and-forget)
4. **CMI als Gateway**: Werte können nicht direkt an CMI gesendet werden, nur an Regler

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

### Mehrere Werte gleichzeitig

```javascript
// Verwende Block Output für Effizienz
msg.payload = [temp1, temp2, temp3, temp4];
msg.coe = { units: [1, 1, 1, 1] };  // Alle °C
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

## Beispiele

Siehe `examples/` Ordner für komplette Flows:
- `basic-input.json` - Temperatur lesen
- `basic-output.json` - Sollwert setzen
- `block-output.json` - Mehrere Werte senden
- `dashboard.json` - UI Dashboard Integration

## API

### Konfigurationsfunktionen (für erweiterte Nutzung)

Die CoE Config Node stellt folgende Methoden bereit:

```javascript
// In eigenem Node:
const coeConfig = RED.nodes.getNode(config.coeconfig);

// Listener registrieren
coeConfig.registerListener((data) => {
    // data enthält: nodeNumber, blockNumber, values, units, sourceIP
});

// Daten senden
const packet = Buffer.alloc(14);
// ... packet füllen ...
coeConfig.send(cmiAddress, packet);
```

## Lizenz

CC BY-NC-SA 4.0 (Creative Commons Attribution-NonCommercial-ShareAlike 4.0)

- ✅ Privater Gebrauch kostenlos
- ❌ Kommerzielle Nutzung: Bitte Autor kontaktieren
- ⚠️ Keine Haftung für Schäden durch Nutzung

## Credits

Basiert auf dem Protokoll-Verständnis und der Dokumentation von:
- [SymconJoTTACoE](https://github.com/jotata/SymconJoTTACoE/) von jotata

## Support

- **Issues**: GitHub Issue Tracker
- **Fragen**: GitHub Discussions
- **Dokumentation**: Siehe README und Node-RED Info-Panel

## Changelog

### Version 0.9.1
- Vorbereitungen für zweisprachige Version
- Fehlerbehebung Output-Nodes
- Ergänzungen Dokumentation

### Version 0.9.0
- Initiale Veröffentlichung
- CoE Input, Output und Block Output Nodes
- Automatische Unit-Konvertierung
- Unterstützung für alle TA Messgrößen
- Shared UDP Socket
- Umfassende Dokumentation

## Autor

mayflo

## Spenden

Falls dir diese Bibliothek hilft, freue ich mich über eine Spende:
- PayPal

---

**Hinweis**: Diese Bibliothek wurde in der Freizeit entwickelt. Support erfolgt nach Verfügbarkeit. Besten Dank für dein Verständnis! 😊
