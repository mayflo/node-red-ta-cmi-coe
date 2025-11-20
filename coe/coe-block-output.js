/**
 * CoE Block Output Node (with 4 input ports)
 */ 

module.exports = function(RED) {
    'use strict';
    const { createCoEPacket } = require('../lib/coe');
    const { getBlockState, setBlockState, setBlockUnits } = require('../lib/queueing');

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
};