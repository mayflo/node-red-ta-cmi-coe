// ta-cmi-coe.js - Node-RED Nodes für TA CMI CoE (CAN over Ethernet)
// Unterstützt CoE V1 (und V2)

module.exports = function(RED) {
    "use strict";
    const dgram = require('dgram');
    const path = require('path');
    
    // Importiere Einheiten-Datei
    let UNITS;
    try {
        const unitsConfig = require('./units-config.js');
        UNITS = unitsConfig.UNITS;
    } catch (err) {
        // Fallback wenn units-config.js nicht gefunden wird
        RED.log.warn("units-config.js not found, using minimal fallback");
        UNITS = {
            0: { name: 'Dimensionslos', symbol: '', decimals: 0 },
            1: { name: 'Celsius', symbol: '°C', decimals: 1 },
            8: { name: 'Prozent', symbol: '%', decimals: 1 },
            10: { name: 'Leistung', symbol: 'kW', decimals: 1 }
        };
    }

    // CoE Protokoll Konstanten
    const COE_PORT_V1 = 5441;
    const COE_PORT_V2 = 5442;
    const COE_V1_PACKET_SIZE = 14;
    const COE_V2_ANALOG_PACKET_SIZE = 22;
    const COE_V2_DIGITAL_PACKET_SIZE = 14; // Digital bleibt gleich
    
    // ============================================
    // CMI Configuration Node (Shared UDP Socket)
    // ============================================
    function CMIConfigNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.address = config.address || '192.168.0.100';
        node.coeVersion = config.coeVersion || 1; // v1, v2
        node.port = (node.coeVersion === 2) ? COE_PORT_V2 : COE_PORT_V1;
        node.localAddress = '0.0.0.0';
        node.socket = null;
        node.listeners = [];

        // UDP Socket erstellen
        try {
            node.socket = dgram.createSocket({
                type: 'udp4',
                reuseAddr: true  // Erlaube Socket Reuse
            });
            
            node.socket.on('message', (msg, rinfo) => {
            
                let data = null;
                data = parseCoEPacket(msg, node.coeVersion === 2 ? 2 : 1);
                
                if (data) {
                    data.sourceIP = rinfo.address;
                    data.version = node.coeVersion;
                    
                    // An alle registrierten Listener weiterleiten
                    node.listeners.forEach(listener => {
                        listener(data);
                    });
                }
            });

            node.socket.on('error', (err) => {
                node.error(`UDP Socket Error: ${err.message}`);
            });

            node.socket.bind(node.port, node.localAddress, () => {
                node.log(`CoE UDP Socket listening on ${node.localAddress}:${node.port} (${node.coeVersion})`);
            });

        } catch(err) {
            node.error(`Failed to create UDP socket: ${err.message}`);
        }

        // Listener registrieren
        node.registerListener = function(callback) {
            node.listeners.push(callback);
        };

        // Listener entfernen
        node.unregisterListener = function(callback) {
            const index = node.listeners.indexOf(callback);
            if (index > -1) {
                node.listeners.splice(index, 1);
            }
        };

        // Daten senden
        node.send = function(host, packet) {
            if (node.socket) {
                node.socket.send(packet, 0, packet.length, node.port, host, (err) => {
                    if (err) {
                        node.error(`Failed to send: ${err.message}`);
                    }
                });
            }
        };

        // Aufräumen beim Beenden
        node.on('close', function() {
            if (node.socket) {
                node.socket.close();
            }
        });
    }
    RED.nodes.registerType("cmi-config", CMIConfigNode);
    
    // ============================================
    // CoE Monitor Node (Empfängt alle CoE Pakete)
    // ============================================
    function CoEMonitorNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.cmiConfig = RED.nodes.getNode(config.cmiconfig);
        
        if (!node.cmiConfig) {
            node.error("CMI Configuration missing");
            return;
        }
        
        node.filterNodeNumber = config.filterNodeNumber ? parseInt(config.filterNodeNumber) : null;
        node.filterDataType = config.filterDataType || 'all';
        node.includeRaw = config.includeRaw || false;

        let packetCount = 0;
        let lastUpdate = Date.now();

        // Listener für eingehende Daten
        const listener = (data) => {
            // Optional: Filter nach Knoten-Nummer
            if (node.filterNodeNumber !== null && 
                node.filterNodeNumber !== 0 && 
                data.nodeNumber !== node.filterNodeNumber) {
                return;
            }
            
            // Optional: Filter nach Datentyp
            const isDigital = (data.blockNumber === 0 || data.blockNumber === 9);
            const isAnalog = !isDigital;
            
            if (node.filterDataType === 'analog' && !isAnalog) return;
            if (node.filterDataType === 'digital' && !isDigital) return;
            
            packetCount++;
            lastUpdate = Date.now();
            
            // Nachricht erstellen
            const msg = {
                payload: {
                    nodeNumber: data.nodeNumber,
                    blockNumber: data.blockNumber,
                    dataType: isDigital ? 'digital' : 'analog',
                    values: data.values,
                    units: data.units,
                    sourceIP: data.sourceIP,
                    version: data.version,
                    timestamp: new Date().toISOString()
                },
                topic: `coe/monitor/${data.nodeNumber}/block/${data.blockNumber}`
            };
            
            // Optional: Detaillierte Aufschlüsselung für analoge Blöcke
            if (isAnalog && data.units) {
                msg.payload.valuesDetailed = data.values.map((value, idx) => {
                    const unitInfo = getUnitInfo(data.units[idx]);
                    const outputNumber = (data.blockNumber - 1) * 4 + idx + 1;
                    return {
                        outputNumber: outputNumber,
                        value: value,
                        unit: data.units[idx],
                        unitName: unitInfo.name,
                        unitSymbol: unitInfo.symbol
                    };
                });
            }
            
            // Optional: Detaillierte Aufschlüsselung für digitale Blöcke
            if (isDigital) {
                const baseOutput = data.blockNumber === 0 ? 1 : 17;
                msg.payload.valuesDetailed = data.values.map((value, idx) => ({
                    outputNumber: baseOutput + idx,
                    value: value === 1,
                    state: value === 1 ? 'ON' : 'OFF'
                }));
            }
            
            // Optional: Raw Data
            if (node.includeRaw) {
                msg.payload.raw = data;
            }
            
            node.send(msg);
            
            // Status Update
            const dataTypeLabel = isDigital ? 'D' : 'A';
            node.status({
                fill: "green", 
                shape: "dot", 
                text: `Node ${data.nodeNumber} B${data.blockNumber}[${dataTypeLabel}] - ${packetCount} pkts [v${data.version}]`
            });
        };

        node.cmiConfig.registerListener(listener);
        node.status({fill: "grey", shape: "ring", text: "monitoring..."});

        // Status Update Timer (zeigt letzte Aktivität)
        const statusTimer = setInterval(() => {
            const secsSinceUpdate = Math.floor((Date.now() - lastUpdate) / 1000);
            if (secsSinceUpdate > 10) {
                node.status({
                    fill: "yellow", 
                    shape: "ring", 
                    text: `idle ${secsSinceUpdate}s - ${packetCount} pkts`
                });
            }
        }, 5000);

        node.on('close', function() {
            clearInterval(statusTimer);
            node.cmiConfig.unregisterListener(listener);
        });
    }
    RED.nodes.registerType("coe-monitor", CoEMonitorNode);

    // =========================================
    // CoE Input Node (Empfangen von Werten)
    // =========================================
    function CoEInputNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.cmiConfig = RED.nodes.getNode(config.cmiconfig);
        
        if (!node.cmiConfig) {
            node.error("CMI Configuration missing");
            return;
        }
        
        node.cmiAddress = node.cmiConfig.address;
        node.nodeNumber = parseInt(config.nodeNumber) || 0;
        node.outputNumber = parseInt(config.outputNumber) || 1;
        node.dataType = config.dataType || 'analog';
        // receiveAll wurde entfernt

        // Berechne Block und Position
        const blockInfo = getBlockInfo(node.dataType, node.outputNumber);
        
        // Listener für eingehende Daten
        const listener = (data) => {
            
            // Filter: Knoten-Nummer (wenn > 0)
            if (node.nodeNumber > 0 && data.nodeNumber !== node.nodeNumber) {
                return;
            }
            
            // Filter: Block-Nummer
            if (data.blockNumber !== blockInfo.block) {
                return;
            }
            
            // Wert extrahieren
            let value, unit;
            if (node.dataType === 'analog') {
                value = data.values[blockInfo.position];
                unit = data.units ? data.units[blockInfo.position] : null;
            } else {
                value = data.values[blockInfo.position] ? true : false;
                unit = null;
            }
            
            // Nachricht erstellen
            const unitInfo = getUnitInfo(unit);
            const msg = {
                payload: value,
                topic: `coe/${node.nodeNumber || data.nodeNumber}/${node.dataType}/${node.outputNumber}`,
                coe: {
                    nodeNumber: data.nodeNumber,
                    blockNumber: data.blockNumber,
                    outputNumber: node.outputNumber,
                    dataType: node.dataType,
                    version: data.version,
                    unit: unit,
                    unitName: unitInfo.name,
                    unitSymbol: unitInfo.symbol,
                    sourceIP: data.sourceIP,
                    raw: data
                }
            };
            
            node.send(msg);
            node.status({
                fill:"green", 
                shape:"dot", 
                text:`${value} ${unitInfo.symbol || ''} [v${data.version}]`
            });
        };

        node.cmiConfig.registerListener(listener);
        
        // Status mit Info ob Node Number gefiltert wird
        if (node.nodeNumber === 0) {
            node.status({fill:"yellow", shape:"ring", text:"waiting (any node)"});
        } else {
            node.status({fill:"grey", shape:"ring", text:"waiting"});
        }

        node.on('close', function() {
            node.cmiConfig.unregisterListener(listener);
        });
    }
    RED.nodes.registerType("coe-input", CoEInputNode);

    // ============================================
    // CoE Output Node (Senden von Werten)
    // ============================================
    function CoEOutputNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.cmiConfig = RED.nodes.getNode(config.cmiconfig);
        
        if (!node.cmiConfig) {
            node.error("CoE Configuration missing");
            return;
            
        node.cmiAddress = node.cmiConfig.address;
        node.nodeNumber = parseInt(config.nodeNumber) || 1;
        node.outputNumber = parseInt(config.outputNumber) || 1;
        node.dataType = config.dataType || 'analog';
        node.unit = parseInt(config.unit) || 0;
        }

        const version = node.cmiConfig.coeVersion;

        node.on('input', function(msg) {
            const blockInfo = getBlockInfo(node.dataType, node.outputNumber);
            let values, units;
            
            if (node.dataType === 'analog') {
                // 4 Werte für analogen Block
                values = [0, 0, 0, 0];
                units = [node.unit, node.unit, node.unit, node.unit];
                
                // Wert an korrekter Position einfügen
                values[blockInfo.position] = parseFloat(msg.payload) || 0;
                
                // Optionale Units aus msg.coe
                if (msg.coe && msg.coe.unit !== undefined) {
                    units[blockInfo.position] = parseInt(msg.coe.unit);
                }
                
            } else {
                // 16 Werte für digitalen Block
                values = new Array(16).fill(0);
                values[blockInfo.position] = msg.payload ? 1 : 0;
                units = null;
            }
            
            // Paket erstellen und senden
            const packet = createCoEPacket(
                node.nodeNumber, 
                blockInfo.block, 
                values, 
                units, 
                node.dataType,
                version
            );
            node.cmiConfig.send(node.cmiAddress, packet);
            
            const unitInfo = getUnitInfo(units ? units[blockInfo.position] : null);
            node.status({
                fill:"green", 
                shape:"dot", 
                text:`sent: ${msg.payload} ${unitInfo.symbol || ''} [${version}]`
            });
            
            // Status nach 2 Sekunden zurücksetzen
            setTimeout(() => {
                node.status({fill:"grey", shape:"ring", text:`ready [${version}]`});
            }, 2000);
        });
        
        node.status({fill:"grey", shape:"ring", text:`ready [${version}]`});
    }
    RED.nodes.registerType("coe-output", CoEOutputNode);

    // ============================================
    // CoE Block Output Node (Mehrere Werte gleichzeitig senden)
    // ============================================
    function CoEBlockOutputNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.cmiConfig = RED.nodes.getNode(config.cmiconfig);
        
        if (!node.cmiConfig) {
            node.error("CoE Configuration missing");
            return;
            
        node.cmiAddress = node.cmiConfig.address;
        node.nodeNumber = parseInt(config.nodeNumber) || 1;
        node.blockNumber = parseInt(config.blockNumber) || 1;
        node.dataType = config.dataType || 'analog';
        }

        const version = node.cmiConfig.coeVersion;

        node.on('input', function(msg) {
            let values, units;
            
            if (node.dataType === 'analog') {
                // Erwarte Array mit 4 Werten
                if (!Array.isArray(msg.payload) || msg.payload.length !== 4) {
                    node.error("Payload must be array of 4 values for analog block");
                    return;
                }
                values = msg.payload.map(v => parseFloat(v) || 0);
                
                // Optional: Units aus msg.coe.units
                if (msg.coe && Array.isArray(msg.coe.units) && msg.coe.units.length === 4) {
                    units = msg.coe.units;
                } else {
                    units = [0, 0, 0, 0];
                }
                
            } else {
                // Erwarte Array mit 16 Werten oder String mit 16 Bits
                if (typeof msg.payload === 'string') {
                    if (msg.payload.length !== 16) {
                        node.error("Payload string must be 16 characters (0 or 1)");
                        return;
                    }
                    values = msg.payload.split('').map(c => c === '1' ? 1 : 0);
                } else if (Array.isArray(msg.payload)) {
                    if (msg.payload.length !== 16) {
                        node.error("Payload array must have 16 values");
                        return;
                    }
                    values = msg.payload.map(v => v ? 1 : 0);
                } else {
                    node.error("Payload must be array or string for digital block");
                    return;
                }
                units = null;
            }
            
            // Paket erstellen und senden
            const packet = createCoEPacket(
                node.nodeNumber, 
                node.blockNumber, 
                values, 
                units, 
                node.dataType,
                version
            );
            node.cmiConfig.send(node.cmiAddress, packet);
            
            node.status({
                fill:"green", 
                shape:"dot", 
                text:`sent block ${node.blockNumber} [${version}]`
            });
            
            setTimeout(() => {
                node.status({fill:"grey", shape:"ring", text:`ready [${version}]`});
            }, 2000);
        });
        
        node.status({fill:"grey", shape:"ring", text:`ready [${version}]`});
    }
    RED.nodes.registerType("coe-block-output", CoEBlockOutputNode);

    // ============================================
    // HTTP API Endpoints (für UI)
    // ============================================
    
    // Units API - liefert alle verfügbaren Units für das UI
    RED.httpAdmin.get('/ta-cmi-coe/units', function(req, res) {
        res.json(UNITS);
    });

    // ============================================
    // HILFSFUNKTIONEN
    // ============================================
    
    // Zentrale Funktion für Unit-Informationen
    function getUnitInfo(unitId) {
        const unit = UNITS[unitId];
        if (unit) {
            return unit;
        }
        // Fallback für unbekannte Unit IDs
        return { name: `Unknown (${unitId})`, symbol: '', decimals: 0 };
    }
    
    // CoE Paket parsen (unterstützt V1 und V2)
    function parseCoEPacket(buffer, version) {
        const nodeNumber = buffer.readUInt8(0);
        const blockNumber = buffer.readUInt8(1);
        
        let values = [];
        let units = null;
        
        // Block 0 oder 9: Digital (16 Bits) - gleich in V1 und V2
        if (blockNumber === 0 || blockNumber === 9) {
            const bitField = buffer.readUInt16LE(2);
            for (let i = 0; i < 16; i++) {
                values.push((bitField >> i) & 1);
            }
        } 
        // Block 1-8: Analog (4 Werte)
        else {
            units = [];
            
            if (version === 2 && buffer.length === COE_V2_ANALOG_PACKET_SIZE) {
                // CoE V2: 4 Byte Integer (Int32)
                for (let i = 0; i < 4; i++) {
                    const value = buffer.readInt32LE(2 + i * 4); // 4 Bytes pro Wert
                    const unitId = buffer.readUInt8(18 + i);
                    
                    const convertedValue = convertValue(value, unitId);
                    values.push(convertedValue);
                    units.push(unitId);
                }
            } else {
                // CoE V1: 2 Byte Integer (Int16)
                for (let i = 0; i < 4; i++) {
                    const value = buffer.readInt16LE(2 + i * 2); // 2 Bytes pro Wert
                    const unitId = buffer.readUInt8(10 + i);
                    
                    const convertedValue = convertValue(value, unitId);
                    values.push(convertedValue);
                    units.push(unitId);
                }
            }
        }
        
        return {
            nodeNumber: nodeNumber,
            blockNumber: blockNumber,
            values: values,
            units: units
        };
    }
    
    // CoE Paket erstellen (unterstützt V1 und V2)
    function createCoEPacket(nodeNumber, blockNumber, values, units, dataType, version) {
        let buffer;
        
        if (dataType === 'digital') {
            // Digital bleibt gleich in V1 und V2
            buffer = Buffer.alloc(COE_V1_PACKET_SIZE);
            buffer.writeUInt8(nodeNumber, 0);
            buffer.writeUInt8(blockNumber, 1);
            
            // 16 Bits als UInt16LE schreiben
            let bitField = 0;
            for (let i = 0; i < 16; i++) {
                if (values[i]) {
                    bitField |= (1 << i);
                }
            }
            buffer.writeUInt16LE(bitField, 2);
            buffer.fill(0, 4, buffer.length);
            
        } else if (version === 2) {
            // CoE V2: Analog mit Int32 (4 Bytes pro Wert)
            buffer = Buffer.alloc(COE_V2_ANALOG_PACKET_SIZE);
            buffer.writeUInt8(nodeNumber, 0);
            buffer.writeUInt8(blockNumber, 1);
            
            for (let i = 0; i < 4; i++) {
                const unitId = units ? units[i] : 0;
                const rawValue = unconvertValue(values[i], unitId);
                buffer.writeInt32BE(rawValue, 2 + i * 4); // 4 Bytes
                buffer.writeUInt8(unitId, 18 + i);
            }
            
        } else {
            // CoE V1: Analog mit Int16 (2 Bytes pro Wert)
            buffer = Buffer.alloc(COE_V1_PACKET_SIZE);
            buffer.writeUInt8(nodeNumber, 0);
            buffer.writeUInt8(blockNumber, 1);
            
            for (let i = 0; i < 4; i++) {
                const unitId = units ? units[i] : 0;
                const rawValue = unconvertValue(values[i], unitId);
                
                // Prüfe V1 Limits
                if (rawValue > 32767 || rawValue < -32768) {
                    console.warn(`Value ${values[i]} exceeds V1 limits for unit ${unitId}. Consider using V2.`);
                }
                
                buffer.writeInt16BE(Math.max(-32768, Math.min(32767, rawValue)), 2 + i * 2);
                buffer.writeUInt8(unitId, 10 + i);
            }
        }
        
        return buffer;
    }
    
    // Block und Position für CAN-Netzwerkausgang berechnen
    function getBlockInfo(dataType, outputNumber) {
        if (dataType === 'digital') {
            if (outputNumber >= 1 && outputNumber <= 16) {
                return { block: 0, position: outputNumber - 1 };
            } else if (outputNumber >= 17 && outputNumber <= 32) {
                return { block: 9, position: outputNumber - 17 };
            }
        } else {
            // Analog: Block 1-8, je 4 Outputs
            const block = Math.floor((outputNumber - 1) / 4) + 1;
            const position = (outputNumber - 1) % 4;
            return { block: block, position: position };
        }
        return { block: 0, position: 0 };
    }
    
    // Wert basierend auf Unit ID konvertieren (Raw → Float)
    function convertValue(rawValue, unitId) {
        const unitInfo = getUnitInfo(unitId);
        const decimals = unitInfo.decimals;
        return rawValue / Math.pow(10, decimals);
    }
    
    // Wert für Übertragung vorbereiten (Float → Raw)
    function unconvertValue(value, unitId) {
        const unitInfo = getUnitInfo(unitId);
        const decimals = unitInfo.decimals;
        return Math.round(value * Math.pow(10, decimals));
    }
};
