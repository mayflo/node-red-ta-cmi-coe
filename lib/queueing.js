/**
 * Message Queueing and Debouncing Module
 */  

const { createCoEPacket } = require('../lib/coe');

const blockStateCache = {};
const blockUnitsCache = {}; // Cache for units per block
const blockQueues = {};
const blockTimers = {};
const DEBOUNCE_DELAY = 50; // ms (Time slot for message collection)

// Returns a copy of the current block state (values) for the given block
function getBlockState(nodeNumber, blockNumber, dataType) {
    const key = `${nodeNumber}-${blockNumber}-${dataType}`;
    if (!blockStateCache[key]) {
        if (dataType === 'analog') {
            blockStateCache[key] = [0, 0, 0, 0];
        } else {
            blockStateCache[key] = new Array(16).fill(0);
        }
    }
    // Return a copy to avoid accidental external mutation
    return Array.isArray(blockStateCache[key]) ? [...blockStateCache[key]] : blockStateCache[key];
}

// Sets the current block state (values) for the given block
function setBlockState(nodeNumber, blockNumber, dataType, values) {
    const key = `${nodeNumber}-${blockNumber}-${dataType}`;
    blockStateCache[key] = [...values];
}

// Returns a copy of the current block units for the given block (analog only)
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

// Sets the current block units for the given block (analog only)
function setBlockUnits(nodeNumber, blockNumber, dataType, units) {
    const key = `${nodeNumber}-${blockNumber}-${dataType}`;
    if (dataType === 'analog') {
        blockUnitsCache[key] = units ? [...units] : [0,0,0,0];
    } else {
        blockUnitsCache[key] = null;
    }
}

// Generates a unique key for the queue based on node, block, and data type
function getQueueKey(nodeNumber, blockNumber, dataType) {
    return `${nodeNumber}-${blockNumber}-${dataType}`;
}

// Queues and debounces messages for a specific block
function queueAndSend(node, nodeNumber, blockNumber, values, units, dataType, version, cmiConfig, cmiAddress, origMsg) {
    const queueKey = getQueueKey(nodeNumber, blockNumber, dataType);

    // Merge incoming values/units with existing block state
    let mergedValues = getBlockState(nodeNumber, blockNumber, dataType);
    let mergedUnits = (dataType === 'analog') ? getBlockUnits(nodeNumber, blockNumber, dataType) : null;

    if (dataType === 'analog') {
        for (let i = 0; i < 4; i++) {
            if (values[i] !== undefined && values[i] !== null) {
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

    // If no existing queue entry, create one
    if (!blockQueues[queueKey]) {
        blockQueues[queueKey] = {
            values: [...mergedValues],
            units: mergedUnits ? [...mergedUnits] : null,
            node: node,
            timestamp: Date.now(),
            origMsg: origMsg || null
        };
    } else {
        // Merge with existing queued values
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
        // Replace origMsg with the most recent (keeps payload for debug/forward)
        q.origMsg = origMsg || q.origMsg;
    }
        
    // Delete existing timer if any
    if (blockTimers[queueKey]) {
        clearTimeout(blockTimers[queueKey]);
    }

    // Start a new timer to send the queued message after the debounce delay
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
            
            // Send debug output on the node outputs: [original msg, debug info]
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
                // If node has outputs, send original msg on first output and debug on second
                queued.node.send([queued.origMsg || null, { payload: debugPayload }]);
            } catch (err) {
                // Do not break sending on debug failure
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

module.exports = {
    getBlockState,
    setBlockState,
    getBlockUnits,
    setBlockUnits,
    queueAndSend
};