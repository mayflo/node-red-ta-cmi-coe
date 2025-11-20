/**
 * CoE Protocol Parsing and Creation Module
 */ 

const { parseCoEV2Packet, createCoEV2Packet, convertV2ToLegacyFormat, convertLegacyToV2Format } = require('./coe-v2');
const { convertCoEToValue, convertValueToCoE } = require('./utils');

// Parse CoE packet from buffer
function parseCoEPacket(buffer, version) {

    // If V2 Protokoll is used
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
            
            const convertedValue = convertCoEToValue(value, unitId, 1); // V1 Dezimalstellen
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

// Create CoE Packet from values
function createCoEPacket(nodeNumber, blockNumber, values, units, dataType, version) {
    // If V2 Protokoll is used
    if (version === 2) {
        const outputs = convertLegacyToV2Format(nodeNumber, blockNumber, values, units, dataType);
        return createCoEV2Packet(nodeNumber, outputs);
    }
    
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
        
    } else { // analog
        buffer = Buffer.alloc(14);
        buffer.writeUInt8(nodeNumber, 0);
        buffer.writeUInt8(blockNumber, 1);
        
        for (let i = 0; i < 4; i++) {
            const unitId = units ? units[i] : 0;
            const rawValue = convertValueToCoE(values[i], unitId, 1); // V1 Dezimalstellen
            
            if (rawValue > 32767 || rawValue < -32768) {
                console.warn(`Value ${values[i]} exceeds V1 limits. Consider using V2.`);
            }
            
            buffer.writeInt16LE(Math.max(-32768, Math.min(32767, rawValue)), 2 + i * 2);
            buffer.writeUInt8(unitId, 10 + i);
        }
    }
    
    return buffer;
}

module.exports = { parseCoEPacket, createCoEPacket};