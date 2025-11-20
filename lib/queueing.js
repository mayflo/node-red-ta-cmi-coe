/**
 * Message Queueing and Debouncing Module
 */  

const { createCoEPacket } = require('../lib/coe');

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

module.exports = {
    getBlockState,
    setBlockState,
    setBlockUnits,
    queueAndSend
};