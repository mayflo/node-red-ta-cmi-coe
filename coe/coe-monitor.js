/**
 * CoE Monitor Node (Receives all CoE packets)
 */ 

module.exports = function(RED) {
    'use strict';
    const { getUnitInfo } = require('../lib/utils')

    function CoEMonitorNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const CoEVersion = config.CoEVersion;
        
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

            for (let block of data) {
                if (!block) continue;

                // Optional: Filter nach Knoten-Nummer
                if (node.filterNodeNumber !== null && 
                    node.filterNodeNumber !== 0 && 
                    block.nodeNumber !== node.filterNodeNumber) {
                    return;
                }
                
                // Optional: Filter nach Datentyp
                const isDigital = (block.blockNumber === 0 || block.blockNumber === 9);
                const isAnalog = !isDigital;
                
                if (node.filterDataType === 'analog' && !isAnalog) return;
                if (node.filterDataType === 'digital' && !isDigital) return;
                
                packetCount++;
                lastUpdate = Date.now();
                
                // Nachricht erstellen
                const msg = {
                    payload: {
                        nodeNumber: block.nodeNumber,
                        blockNumber: block.blockNumber,
                        dataType: isDigital ? 'digital' : 'analog',
                        values: block.values,
                        units: block.units,
                        sourceIP: data.sourceIP,
                        version: data.version,
                        timestamp: new Date().toISOString()
                    },
                    topic: `coe/monitor/${block.nodeNumber}/block/${block.blockNumber}`
                };
                
                // Optional: Detaillierte Aufschlüsselung für analoge Blöcke
                if (isAnalog && block.units) {
                    msg.payload.valuesDetailed = block.values.map((value, idx) => {
                        const unitInfo = getUnitInfo(block.units[idx], CoEVersion);
                        RED.log.debug(`Unit Info for unit ${block.units[idx]}: ${JSON.stringify(unitInfo)} + version: ${CoEVersion} + key: ${unitInfo.key} + symbol: ${unitInfo.symbol}`);
                        const outputNumber = (block.blockNumber - 1) * 4 + idx + 1;
                        return {
                            outputNumber: outputNumber,
                            value: value,
                            unit: block.units[idx],
                            unitName: unitInfo.name,
                            unitSymbol: unitInfo.symbol
                        };
                    });
                }
                
                // Optional: Detaillierte Aufschlüsselung für digitale Blöcke
                if (isDigital) {
                    const baseOutput = block.blockNumber === 0 ? 1 : 17;
                    msg.payload.valuesDetailed = block.values.map((value, idx) => ({
                        outputNumber: baseOutput + idx,
                        value: value === 1,
                        state: value === 1 ? 'ON' : 'OFF'
                    }));
                }
                
                // Optional: Raw Data
                if (node.includeRaw) {
                    msg.payload.raw = block;
                }
                
                node.send(msg);

                // Status Update
                const dataTypeLabel = isDigital ? 'D' : 'A';
                node.status({
                    fill: "green", 
                    shape: "dot", 
                    text: `Node ${block.nodeNumber} B${block.blockNumber}[${dataTypeLabel}] - ${packetCount} pkts`
                });
            }
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
};