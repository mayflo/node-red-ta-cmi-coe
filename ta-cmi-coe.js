// ta-cmi-coe.js - Node-RED Nodes für TA CMI CoE (CAN over Ethernet)
// Unterstützt CoE V1 und V2

module.exports = function(RED) {
    "use strict";
    const dgram = require('dgram');
    
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

    // Cache für Block-Zustände und Sending-Queues
    const blockStateCache = {};
    const blockUnitsCache = {}; // NEW: Cache für Units pro Block
    const blockQueues = {};
    const blockTimers = {};

    const DEBOUNCE_DELAY = 50; // ms - Zeit zum Sammeln von Nachrichten

    function getBlockState(nodeNumber, blockNumber, dataType) {
        const key = `${nodeNumber}-${blockNumber}-${dataType}`;
        if (!blockStateCache[key]) {
            if (dataType === 'analog') {
                blockStateCache[key] = [0, 0, 0, 0];
            } else {
                blockStateCache[key] = new Array(16).fill(0);
            }
        }
        // RETURN A COPY to avoid accidental external mutation
        return Array.isArray(blockStateCache[key]) ? [...blockStateCache[key]] : blockStateCache[key];
    }

    function setBlockState(nodeNumber, blockNumber, dataType, values) {
        const key = `${nodeNumber}-${blockNumber}-${dataType}`;
        blockStateCache[key] = [...values];
    }

    function getBlockUnits(nodeNumber, blockNumber, dataType) {
        const key = `${nodeNumber}-${blockNumber}-${dataType}`;
        if (!blockUnitsCache[key]) {
            // Only analog blocks have units
            if (dataType === 'analog') {
                blockUnitsCache[key] = [0, 0, 0, 0];
            } else {
                blockUnitsCache[key] = null;
            }
        }
        return blockUnitsCache[key] ? [...blockUnitsCache[key]] : null;
    }

    function setBlockUnits(nodeNumber, blockNumber, dataType, units) {
        const key = `${nodeNumber}-${blockNumber}-${dataType}`;
        if (dataType === 'analog') {
            blockUnitsCache[key] = units ? [...units] : [0,0,0,0];
        } else {
            blockUnitsCache[key] = null;
        }
    }

    function getQueueKey(nodeNumber, blockNumber, dataType) {
        return `${nodeNumber}-${blockNumber}-${dataType}`;
    }

    function queueAndSend(node, nodeNumber, blockNumber, values, units, dataType, version, cmiConfig, cmiAddress, origMsg) {
        const queueKey = getQueueKey(nodeNumber, blockNumber, dataType);
        
        // Merge mit aktuellem Block-Zustand (kopieren, nicht referenzieren)
        let mergedValues = getBlockState(nodeNumber, blockNumber, dataType);
        let mergedUnits = (dataType === 'analog') ? getBlockUnits(nodeNumber, blockNumber, dataType) : null;

        if (dataType === 'analog') {
            for (let i = 0; i < 4; i++) {
                if (values[i] !== undefined) {
                    mergedValues[i] = values[i];
                }
                if (units && units[i] !== undefined) {
                    mergedUnits[i] = units[i];
                }
            }
        } else {
            for (let i = 0; i < 16; i++) {
                if (values[i] !== undefined) {
                    mergedValues[i] = values[i];
                }
            }
        }
        
        // Speichere in Queue (clone arrays to avoid shared refs)
        if (!blockQueues[queueKey]) {
            blockQueues[queueKey] = {
                values: [...mergedValues],
                units: mergedUnits ? [...mergedUnits] : null,
                node: node,
                timestamp: Date.now(),
                origMsg: origMsg || null
            };
        } else {
            // Merge mit bestehenden Queue-Einträgen per-Index (keine komplette Überschreibung)
            const q = blockQueues[queueKey];
            for (let i = 0; i < mergedValues.length; i++) {
                q.values[i] = mergedValues[i];
            }
            if (mergedUnits) {
                if (!q.units) q.units = [...mergedUnits];
                else {
                    for (let i = 0; i < mergedUnits.length; i++) {
                        if (mergedUnits[i] !== undefined) q.units[i] = mergedUnits[i];
                    }
                }
            }
            // replace origMsg with the most recent (keeps payload for debug/forward)
            q.origMsg = origMsg || q.origMsg;
        }
         
        // Lösche alten Timer
        if (blockTimers[queueKey]) {
            clearTimeout(blockTimers[queueKey]);
        }
        
        // Starte neuen Timer - sendet nach Verzögerung
        blockTimers[queueKey] = setTimeout(() => {
            const queued = blockQueues[queueKey];
            if (queued) {
                const packet = createCoEPacket(
                    nodeNumber,
                    blockNumber,
                    queued.values,
                    queued.units,
                    dataType,
                    version
                );
                
                // Persist both values and units for the block
                setBlockState(nodeNumber, blockNumber, dataType, queued.values);
                if (dataType === 'analog') {
                    setBlockUnits(nodeNumber, blockNumber, dataType, queued.units);
                }
                
                // send debug output on the node outputs: [original msg, debug info]
                try {
                    const debugPayload = {
                        debug: {
                            hex: packet.toString('hex').toUpperCase(),
                            node: nodeNumber,
                            block: blockNumber,
                            dataType: dataType,
                            version: version,
                            blockState: queued.values,
                            units: queued.units
                        }
                    };
                    // if node has outputs, send original msg on first output and debug on second
                    queued.node.send([queued.origMsg || null, { payload: debugPayload }]);
                } catch (err) {
                    // do not break sending on debug failure
                    queued.node.warn(`Failed to send debug msg: ${err.message}`);
                }
                
                 cmiConfig.send(cmiAddress, packet);
                 
                 queued.node.status({
                     fill: "green",
                     shape: "dot",
                     text: `sent (merged) [${version}]`
                 });
                 
                 setTimeout(() => {
                     queued.node.status({fill: "grey", shape: "ring", text: `ready [${version}]`});
                 }, 2000);
                 
                 delete blockQueues[queueKey];
                 delete blockTimers[queueKey];
             }
         }, DEBOUNCE_DELAY);
     }

    // ============================================
    // CoE Output Node (Senden von Werten)
    // ============================================
    function CoEOutputNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.cmiConfig = RED.nodes.getNode(config.cmiconfig);
        node.cmiAddress = node.cmiConfig.address;
        node.nodeNumber = parseInt(config.nodeNumber) || 1;
        node.outputNumber = parseInt(config.outputNumber) || 1;
        node.dataType = config.dataType || 'analog';
        node.unit = parseInt(config.unit) || 0;
        
        if (!node.cmiConfig) {
            node.error("CoE Configuration missing");
            return;
        }

        const version = node.cmiConfig.coeVersion;

        node.on('input', function(msg) {
            const blockInfo = getBlockInfo(node.dataType, node.outputNumber);
            let values, units;
            
            if (node.dataType === 'analog') {
                values = [undefined, undefined, undefined, undefined];
                units = [node.unit, node.unit, node.unit, node.unit];
                
                values[blockInfo.position] = parseFloat(msg.payload) || 0;
                
                if (msg.coe && msg.coe.unit !== undefined) {
                    units[blockInfo.position] = parseInt(msg.coe.unit);
                }
                
            } else {
                values = new Array(16).fill(undefined);
                values[blockInfo.position] = msg.payload ? 1 : 0;
                units = null;
            }
            
            node.status({
                fill: "yellow",
                shape: "dot",
                text: `queued (${DEBOUNCE_DELAY}ms) [${version}]`
            });
            
            queueAndSend(node, node.nodeNumber, blockInfo.block, values, units, node.dataType, version, node.cmiConfig, node.cmiAddress);
        });
        
        node.status({fill:"grey", shape:"ring", text:`ready [${version}]`});
    }
    RED.nodes.registerType("coe-output", CoEOutputNode);

    // ============================================
    // CoE Block Output Node (mit 4 Input-Ports)
    // ============================================
    function CoEBlockOutputNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.cmiConfig = RED.nodes.getNode(config.cmiconfig);
        node.cmiAddress = node.cmiConfig.address;
        node.nodeNumber = parseInt(config.nodeNumber) || 1;
        // config.blockNumber is 1..8 (editor-side). Map to actual CoE block & bit offset below.
        node.blockNumber = parseInt(config.blockNumber) || 1;
        node.dataType = config.dataType || 'analog';
        node.sendMode = config.sendMode || 'change';
        
        if (!node.cmiConfig) {
            node.error("CoE Configuration missing");
            return;
        }

        // VALIDIERUNG: config.blockNumber 1..8 für beide Datentypen
        if (node.blockNumber < 1 || node.blockNumber > 8) {
            node.error(`Block muss 1-8 sein, nicht ${node.blockNumber}`);
            node.status({fill: "red", shape: "ring", text: "Invalid block number"});
            return;
        }

        const version = node.cmiConfig.coeVersion;
        
        // ALWAYS 4 input channels (group of 4 values/bits)
        let inputBuffer = {
            values: [0, 0, 0, 0],
            units: [0, 0, 0, 0],
            lastUpdate: [0, 0, 0, 0]
        };
        
        let sendTimer = null;

        // Helper: map config block (1..8) + dataType -> actual CoE block and bit offset
        function mapConfigBlockToCoE(configBlock, dataType) {
            if (dataType === 'analog') {
                // analog: configBlock directly maps to CoE block 1..8, offset 0
                return { coeBlock: configBlock, offset: 0 };
            } else {
                // digital: groups 1..4 -> CoE block 0, groups 5..8 -> CoE block 9
                const groupIndex = configBlock - 1; // 0..7
                const coeBlock = (groupIndex < 4) ? 0 : 9;
                const groupWithinBlock = groupIndex % 4; // 0..3
                const offset = groupWithinBlock * 4; // 0,4,8,12
                return { coeBlock: coeBlock, offset: offset };
            }
        }

        function sendBlock() {
            const mapping = mapConfigBlockToCoE(node.blockNumber, node.dataType);
            // read current block state (copy)
            let values;
            if (node.dataType === 'analog') {
                values = getBlockState(node.nodeNumber, mapping.coeBlock, 'analog'); // 4 items
                // override with buffer
                for (let i = 0; i < 4; i++) values[i] = inputBuffer.values[i];
            } else {
                // digital: get 16-bit block array and merge 4 bits at offset
                values = getBlockState(node.nodeNumber, mapping.coeBlock, 'digital'); // 16 items
                for (let i = 0; i < 4; i++) {
                    values[mapping.offset + i] = inputBuffer.values[i] ? 1 : 0;
                }
            }
            
            // units only for analog (4 values)
            const units = (node.dataType === 'analog') ? [...inputBuffer.units] : null;
            
            const packet = createCoEPacket(
                node.nodeNumber,
                mapping.coeBlock,
                values,
                units,
                node.dataType === 'analog' ? 'analog' : 'digital',
                version
            );
            
            // persist merged state
            if (node.dataType === 'analog') {
                setBlockState(node.nodeNumber, mapping.coeBlock, 'analog', values);
                setBlockUnits(node.nodeNumber, mapping.coeBlock, 'analog', units);
            } else {
                setBlockState(node.nodeNumber, mapping.coeBlock, 'digital', values);
            }
            
            // Debug-Ausgabe an 2. Ausgang senden
            try {
                const debugPayload = {
                    debug: {
                        hex: packet.toString('hex').toUpperCase(),
                        node: node.nodeNumber,
                        block: mapping.coeBlock,
                        configBlock: node.blockNumber,
                        dataType: node.dataType,
                        version: version,
                        blockState: values,
                        units: units
                    }
                };
                node.send([null, { payload: debugPayload }]);
            } catch (err) {
                node.warn(`Failed to send block debug msg: ${err.message}`);
            }
            
            node.cmiConfig.send(node.cmiAddress, packet);
            
            node.status({
                fill: "green",
                shape: "dot",
                text: `sent cfgB${node.blockNumber} → B${mapping.coeBlock}`
            });
            
            setTimeout(() => {
                node.status({fill: "grey", shape: "ring", text: "ready (buffered)"});
            }, 2000);
        }

        // Register 4 fixed inputs (always)
        for (let i = 1; i <= 4; i++) {
            node.on(`input${i}`, function(msg) {
                const index = i - 1;
                
                if (node.dataType === 'analog') {
                    const newValue = parseFloat(msg.payload);
                    if (isNaN(newValue)) {
                        node.error(`Input ${i}: Invalid number: ${msg.payload}`);
                        return;
                    }
                    inputBuffer.values[index] = newValue;
                    if (msg.coe && msg.coe.unit !== undefined) {
                        inputBuffer.units[index] = parseInt(msg.coe.unit);
                    }
                } else {
                    // digital group: expect boolean/0/1
                    inputBuffer.values[index] = msg.payload ? 1 : 0;
                }
                
                inputBuffer.lastUpdate[index] = Date.now();
                
                // status display: show 4 values or 4 bits
                if (node.dataType === 'analog') {
                    const displayValues = inputBuffer.values.map(v => Number.isFinite(v) ? v.toFixed(1) : 'NaN').join(' | ');
                    node.status({ fill: "yellow", shape: "dot", text: `[${displayValues}]` });
                } else {
                    node.status({ fill: "yellow", shape: "dot", text: inputBuffer.values.map(v => v ? '1' : '0').join(' ') });
                }

                if (node.sendMode === 'immediate') {
                    sendBlock();
                } else if (node.sendMode === 'change') {
                    if (sendTimer) clearTimeout(sendTimer);
                    sendTimer = setTimeout(sendBlock, 100);
                }
            });
        }

        node.on('close', function() {
            if (sendTimer) clearTimeout(sendTimer);
        });
        
        node.status({fill: "grey", shape: "ring", text: "ready (buffered)"});
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
    // HILFSFUNKTIONEN (nur intern genutzt)
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
    
    // CoE Paket parsen
    function parseCoEPacket(buffer, version) {
        // V2 Protokoll verwenden
        if (version === 2) {
            const v2Data = parseCoEV2Packet(buffer);
            if (!v2Data) return null;
            
            // Konvertiere zu Legacy-Format für Kompatibilität
            const legacyBlocks = convertV2ToLegacyFormat(v2Data);
            
            // Gib alle Blöcke zurück (kann mehrere sein)
            return legacyBlocks;
        }
        
        const nodeNumber = buffer.readUInt8(0);
        const blockNumber = buffer.readUInt8(1);
        
        let values = [];
        let units = null;
        
        if (blockNumber === 0 || blockNumber === 9) {
            // Digital
            const bitField = buffer.readUInt16LE(2);
            for (let i = 0; i < 16; i++) {
                values.push((bitField >> i) & 1);
            }
        } else {
            // Analog V1
            units = [];
            for (let i = 0; i < 4; i++) {
                const value = buffer.readInt16LE(2 + i * 2);
                const unitId = buffer.readUInt8(10 + i);
                
                const convertedValue = convertValue(value, unitId, 1); // V1 Dezimalstellen
                values.push(convertedValue);
                units.push(unitId);
            }
        }
        
        return [{
            nodeNumber: nodeNumber,
            blockNumber: blockNumber,
            values: values,
            units: units
        }];
    }
    
    // CoE Paket erstellen
    function createCoEPacket(nodeNumber, blockNumber, values, units, dataType, version) {
        // V2 Protokoll verwenden
        if (version === 2) {
            const outputs = convertLegacyToV2Format(nodeNumber, blockNumber, values, units, dataType);
            return createCoEV2Packet(nodeNumber, outputs);
        }
        
        // V1 Protokoll
        let buffer;
        
        if (dataType === 'digital') {
            buffer = Buffer.alloc(14);
            buffer.writeUInt8(nodeNumber, 0);
            buffer.writeUInt8(blockNumber, 1);
            
            let bitField = 0;
            for (let i = 0; i < 16; i++) {
                if (values[i]) {
                    bitField |= (1 << i);
                }
            }
            buffer.writeUInt16LE(bitField, 2);
            buffer.fill(0, 4, buffer.length);
            
        } else {
            // Analog V1
            buffer = Buffer.alloc(14);
            buffer.writeUInt8(nodeNumber, 0);
            buffer.writeUInt8(blockNumber, 1);
            
            for (let i = 0; i < 4; i++) {
                const unitId = units ? units[i] : 0;
                const rawValue = unconvertValue(values[i], unitId, 1); // V1 Dezimalstellen
                
                if (rawValue > 32767 || rawValue < -32768) {
                    console.warn(`Value ${values[i]} exceeds V1 limits. Consider using V2.`);
                }
                
                buffer.writeInt16LE(Math.max(-32768, Math.min(32767, rawValue)), 2 + i * 2);
                buffer.writeUInt8(unitId, 10 + i);
            }
        }
        
        return buffer;
    }

    // ============================================
    // CoE V2 Protokoll-Unterstützung
    // ============================================

    // CoE V2 Parsing-Funktion
    function parseCoEV2Packet(buffer) {
        if (buffer.length < 4) {
            return null;
        }
        
        // Header parsen
        const versionLow = buffer.readUInt8(0);
        const versionHigh = buffer.readUInt8(1);
        const messageLength = buffer.readUInt8(2);
        const blockCount = buffer.readUInt8(3);
        
        // Version prüfen
        if (versionLow !== 0x02 || versionHigh !== 0x00) {
            return null;
        }
        
        // Prüfen ob genug Daten vorhanden
        const expectedLength = 4 + (blockCount * 8);
        if (buffer.length < expectedLength) {
            console.warn(`V2: Unvollständiges Paket. Erwartet: ${expectedLength}, Erhalten: ${buffer.length}`);
            return null;
        }
        
        // Wert-Blöcke parsen
        const blocks = [];
        for (let i = 0; i < blockCount; i++) {
            const offset = 4 + (i * 8);
            
            const canNode = buffer.readUInt8(offset);
            const outputLow = buffer.readUInt8(offset + 1);
            const outputHigh = buffer.readUInt8(offset + 2);
            const outputNumber = outputLow | (outputHigh << 8);
            const unitId = buffer.readUInt8(offset + 3);
            const value = buffer.readInt32LE(offset + 4);
            
            blocks.push({
                canNode: canNode,
                outputNumber: outputNumber,
                unitId: unitId,
                value: value,
                isDigital: outputNumber <= 254,
                isAnalog: outputNumber > 254
            });
        }
        
        return {
            version: 2,
            messageLength: messageLength,
            blockCount: blockCount,
            blocks: blocks
        };
    }

    // CoE V2 Paket erstellen
    function createCoEV2Packet(canNode, outputs) {
        // outputs: Array von {outputNumber, unitId, value}
        // Max 16 Wert-Blöcke
        const blockCount = Math.min(outputs.length, 16);
        const messageLength = 4 + (blockCount * 8);
        
        const buffer = Buffer.alloc(messageLength);
        
        // Header schreiben
        buffer.writeUInt8(0x02, 0);  // Version Low
        buffer.writeUInt8(0x00, 1);  // Version High
        buffer.writeUInt8(messageLength, 2);  // Message Length
        buffer.writeUInt8(blockCount, 3);  // Block Count
        
        // Wert-Blöcke schreiben
        for (let i = 0; i < blockCount; i++) {
            const offset = 4 + (i * 8);
            const output = outputs[i];
            
            buffer.writeUInt8(canNode, offset);  // CAN Node
            
            // Output Number (Little Endian, 2 Bytes)
            buffer.writeUInt8(output.outputNumber & 0xFF, offset + 1);
            buffer.writeUInt8((output.outputNumber >> 8) & 0xFF, offset + 2);
            
            buffer.writeUInt8(output.unitId || 0, offset + 3);  // Unit ID
            buffer.writeInt32LE(output.value, offset + 4);  // Value (Int32 LE)
        }
        
        return buffer;
    }

    // V2 Daten in das alte Format konvertieren (für Kompatibilität)
    function convertV2ToLegacyFormat(v2Data) {
        // Gruppiere Outputs nach Block
        const blockMap = {};
        
        v2Data.blocks.forEach(block => {
            const isDigital = block.outputNumber <= 254;
            const actualOutput = isDigital ? block.outputNumber : (block.outputNumber - 255);
            
            // Bestimme Block-Nummer und Position
            let blockNumber, position;
            
            if (isDigital) {
                // Digital: Output 1-16 → Block 0, Output 17-32 → Block 9
                if (actualOutput <= 16) {
                    blockNumber = 0;
                    position = actualOutput - 1;
                } else {
                    blockNumber = 9;
                    position = actualOutput - 17;
                }
            } else {
                // Analog: Output 1-4 → Block 1, 5-8 → Block 2, etc.
                blockNumber = Math.floor((actualOutput - 1) / 4) + 1;
                position = (actualOutput - 1) % 4;
            }
            
            const key = `${block.canNode}-${blockNumber}`;
            
            if (!blockMap[key]) {
                blockMap[key] = {
                    nodeNumber: block.canNode,
                    blockNumber: blockNumber,
                    dataType: isDigital ? 'digital' : 'analog',
                    values: isDigital ? new Array(16).fill(0) : new Array(4).fill(0),
                    units: isDigital ? null : new Array(4).fill(0)
                };
            }
            
            // Wert konvertieren und einfügen (V2 verwendet andere Dezimalstellen)
            const convertedValue = convertValue(block.value, block.unitId, 2);
            blockMap[key].values[position] = isDigital ? (block.value ? 1 : 0) : convertedValue;
            
            if (!isDigital && blockMap[key].units) {
                blockMap[key].units[position] = block.unitId;
            }
        });
        
        return Object.values(blockMap);
    }

    // Konvertiere Legacy-Format zu V2 Outputs
    function convertLegacyToV2Format(nodeNumber, blockNumber, values, units, dataType) {
        const outputs = [];
        
        if (dataType === 'digital') {
            // Digital: 16 Bits
            const baseOutput = blockNumber === 0 ? 1 : 17;
            for (let i = 0; i < values.length; i++) {
                if (values[i] !== undefined) {
                    outputs.push({
                        outputNumber: baseOutput + i,
                        unitId: 0,
                        value: values[i] ? 1 : 0
                    });
                }
            }
        } else {
            // Analog: 4 Werte
            const baseOutput = (blockNumber - 1) * 4 + 1;
            for (let i = 0; i < 4; i++) {
                if (values[i] !== undefined) {
                    const unitId = units ? units[i] : 0;
                    const rawValue = unconvertValue(values[i], unitId, 2); // V2 verwendet andere Dezimalstellen
                    
                    // Output > 255 bedeutet analog
                    const outputNumber = baseOutput + i + 255;
                    
                    outputs.push({
                        outputNumber: outputNumber,
                        unitId: unitId,
                        value: rawValue
                    });
                }
            }
        }
        
        return outputs;
    }

    // Hilfsfunktionen für Wert-Konvertierung
    function convertValue(rawValue, unitId, protocolVersion) {
        const unitInfo = getUnitInfo(unitId, protocolVersion);
        const decimals = unitInfo.decimals;
        return rawValue / Math.pow(10, decimals);
    }

    function unconvertValue(value, unitId, protocolVersion) {
        const unitInfo = getUnitInfo(unitId, protocolVersion);
        const decimals = unitInfo.decimals;
        return Math.round(value * Math.pow(10, decimals));
    }

    function getUnitInfo(unitId, protocolVersion) {
        // Verwende globales UNITS Object oder Fallback
        let unitInfo;
        if (typeof UNITS !== 'undefined' && UNITS[unitId]) {
            unitInfo = { ...UNITS[unitId] };
        } else {
            unitInfo = { name: `Unknown (${unitId})`, symbol: '', decimals: 0 };
        }
        
        // V2-spezifische Anpassungen für Units mit abweichenden Dezimalstellen
        if (protocolVersion === 2) {
            const v2Overrides = {
                10: { decimals: 2 }  // Leistung kW: V1=1, V2=2 Dezimalstellen
                // Weitere Units mit V2-Abweichungen hier hinzufügen
            };
            
            if (v2Overrides[unitId]) {
                unitInfo = { ...unitInfo, ...v2Overrides[unitId] };
            }
        }
        
        return unitInfo;
    }
    
    function getBlockInfo(dataType, outputNumber) {
        outputNumber = parseInt(outputNumber);
        if (isNaN(outputNumber) || outputNumber < 1) {
            // sichere Default-Antwort
            return { block: 1, position: 0 };
        }

        if (dataType === 'analog') {
            // Analog: Outputs 1..32 → Blocks 1..8 (je 4 Outputs)
            const block = Math.floor((outputNumber - 1) / 4) + 1; // 1..8
            const position = (outputNumber - 1) % 4; // 0..3
            return { block: block, position: position };
        } else {
            // Digital: Outputs 1..16 → Block 0, 17..32 → Block 9
            if (outputNumber <= 16) {
                return { block: 0, position: outputNumber - 1 }; // 0..15
            } else {
                return { block: 9, position: outputNumber - 17 }; // 0..15
            }
        }
    }
};