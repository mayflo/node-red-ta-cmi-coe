// CoE Output Node (Sending of values)

module.exports = function(RED) {
    'use strict';
    const { getBlockInfo } = require('../lib/utils')
    const { queueAndSend } = require('../lib/queueing');
    
    const DEBOUNCE_DELAY = 200; // ms

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
};