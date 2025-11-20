/**
 * CoE Utilities Module (used internally by nodes)
 */  

const RED = require('node-red');

// Import Units Config
let UNITS;
try {
    const { buildUnits } = require("./units");
    UNITS = buildUnits();

} catch (err) {
    RED.log.warn("units-config.js not found, using minimal fallback");
    UNITS = { 0: { name: 'dimensionless', symbol: '', decimals: 0 } };
} 

// Units API - provides all available Units for the UI
RED.httpAdmin.get('/ta-cmi-coe/units', function(req, res) {
    res.json(UNITS);
})

// Utilities for unit conversion
function convertCoEToValue(rawValue, unitId, protocolVersion) {
    const unitInfo = getUnitInfo(unitId, protocolVersion);
    const decimals = unitInfo.decimals;
    return rawValue / Math.pow(10, decimals);
}

function convertValueToCoE(value, unitId, protocolVersion) {
    const unitInfo = getUnitInfo(unitId, protocolVersion);
    const decimals = unitInfo.decimals;
    return Math.round(value * Math.pow(10, decimals));
}

function getUnitInfo(unitId, protocolVersion) {
    // Use UNITS from units-config.js if available
    let unitInfo;
    if (typeof UNITS !== 'undefined' && UNITS[unitId]) {
        unitInfo = { ...UNITS[unitId] };
    } else {
        unitInfo = { name: `Unknown (${unitId})`, symbol: '', decimals: 0 };
    }
    
    // V2 specific overrides
    if (protocolVersion === 2) {
        const v2Overrides = {
            10: { decimals: 2 }  // Power kW: V1=1, V2=2 decimals
            // Add more overrides as needed
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
        // default to block 1 position 0
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

module.exports = {
    convertCoEToValue,
    convertValueToCoE,
    getUnitInfo,
    getBlockInfo
};