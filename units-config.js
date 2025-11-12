// units-config.js - Zentrale Einheiten-Konfiguration

/**
 * Definition bekannter Messgrößen (Units) für TA CMI CoE
 * 
 * Struktur:
 * - id: Unit ID (muss mit TA Spezifikation übereinstimmen)
 * - name: Name der Einheit
 * - symbol: Kurzzeichen für Anzeige
 * - decimals: Anzahl Nachkommastellen bei der Übertragung
 */

const UNITS = {
    0: { name: 'dimensionslos', symbol: '', decimals: 0 },
    1: { name: 'Temperatur', symbol: '°C', decimals: 1 },
    2: { name: 'Solarstrahlung', symbol: 'W/m²', decimals: 0 },
    3: { name: 'Durchfluss', symbol: 'l/h', decimals: 0 },
    4: { name: 'Sekunden', symbol: 'Sek', decimals: 0 },
    5: { name: 'Minuten', symbol: 'Min', decimals: 0 },
    6: { name: 'Durchfluss', symbol: 'l/Imp', decimals: 0 },
    7: { name: 'Temperatur', symbol: 'K', decimals: 1 },
    8: { name: 'Prozent', symbol: '%', decimals: 1 },
    10: { name: 'Leistung', symbol: 'kW', decimals: 1 },
    11: { name: 'Energie', symbol: 'kWh', decimals: 1 },
    12: { name: 'Energie', symbol: 'MWh', decimals: 0 },
    13: { name: 'Spannung', symbol: 'V', decimals: 2 },
    14: { name: 'Stromstaerke', symbol: 'mA', decimals: 1 },
    15: { name: 'Stunden', symbol: 'Std', decimals: 0 },
    16: { name: 'Tage', symbol: 'Tage', decimals: 0 },
    17: { name: 'Impulse', symbol: 'Imp', decimals: 0 },
    18: { name: 'Widerstand', symbol: 'kΩ', decimals: 2 },
    19: { name: 'Liter', symbol: 'l', decimals: 0 },
    20: { name: 'Geschwindigkeit', symbol: 'km/h', decimals: 0 },
    21: { name: 'Frequenz', symbol: 'Hz', decimals: 2 },
    22: { name: 'Durchfluss', symbol: 'l/min', decimals: 0 },
    23: { name: 'Druck', symbol: 'bar', decimals: 2 },
    24: { name: 'Arbeitszahl', symbol: '', decimals: 2 },
    26: { name: 'Laenge', symbol: 'm', decimals: 1 },
    27: { name: 'Laenge', symbol: 'mm', decimals: 1 },
    28: { name: 'Kubikmeter', symbol: 'm³', decimals: 0 },
    35: { name: 'Durchfluss', symbol: 'l/d', decimals: 0 },
    36: { name: 'Geschwindigkeit', symbol: 'm/s', decimals: 0 },
    37: { name: 'Durchfluss', symbol: 'm³/min', decimals: 0 },
    38: { name: 'Durchfluss', symbol: 'm³/h', decimals: 0 },
    39: { name: 'Durchfluss', symbol: 'm³/d', decimals: 0 },
    40: { name: 'Geschwindigkeit', symbol: 'mm/min', decimals: 0 },
    41: { name: 'Geschwindigkeit', symbol: 'mm/h', decimals: 0 },
    42: { name: 'Geschwindigkeit', symbol: 'mm/d', decimals: 0 },
    50: { name: 'Euro', symbol: '€', decimals: 2 },
    51: { name: 'Dollar', symbol: '$', decimals: 2 },
    52: { name: 'AbsoluteFeuchte', symbol: 'g/m³', decimals: 1 },
    53: { name: 'dimensionslos', symbol: '', decimals: 5 },
    54: { name: 'Grad', symbol: '°', decimals: 1 },
    58: { name: 'dimensionslos', symbol: '', decimals: 1 },
    59: { name: 'Prozent', symbol: '%', decimals: 1 },
    60: { name: 'Uhrzeit', symbol: 'Min. seit 00:00', decimals: 0 },
    63: { name: 'Stromstaerke', symbol: 'A', decimals: 1 },
    65: { name: 'Druck', symbol: 'mbar', decimals: 1 },
    66: { name: 'Druck', symbol: 'Pa', decimals: 0 },
    67: { name: 'CO2-Gehalt', symbol: 'ppm', decimals: 0 },
    69: { name: 'Leistung', symbol: 'W', decimals: 0 },
    70: { name: 'Gewicht', symbol: 't', decimals: 2 },
    71: { name: 'Gewicht', symbol: 'kg', decimals: 1 },
    72: { name: 'Gewicht', symbol: 'g', decimals: 1 },
    73: { name: 'Laenge', symbol: 'cm', decimals: 1 }
};

/**
 * Hilfsfunktion: Unit-Informationen abrufen
 * @param {number} unitId - Die Unit ID
 * @returns {object} Unit-Informationen (name, symbol, decimals)
 */
function getUnitInfo(unitId) {
    const unit = UNITS[unitId];
    if (unit) {
        return unit;
    }
    // Fallback für unbekannte Unit IDs
    return { 
        name: `Unknown Unit (ID: ${unitId})`, 
        symbol: '', 
        decimals: 2 
    };
}

/**
 * Hilfsfunktion: Alle verfügbaren Units auflisten
 * @returns {object} Alle Units
 */
function getAllUnits() {
    return UNITS;
}

/**
 * Hilfsfunktion: Unit-Liste für Dropdown generieren
 * @returns {array} Array mit {id, label} für UI Dropdowns
 */
function getUnitDropdownList() {
    return Object.entries(UNITS).map(([id, unit]) => ({
        id: parseInt(id),
        label: `${unit.name} (${unit.symbol || 'keine Einheit'})`,
        symbol: unit.symbol,
        decimals: unit.decimals
    })).sort((a, b) => a.id - b.id);
}

/**
 * Hilfsfunktion: Units nach Kategorie gruppieren
 * @returns {object} Gruppierte Units
 */
function getUnitsByCategory() {
    return {
        temperature: [1, 2, 3],
        power: [5, 6, 7, 31, 32, 36, 44],
        electrical: [8, 9, 24, 48, 49, 50, 13, 45, 46, 47],
        time: [10, 11, 18, 19],
        volume: [14, 17, 20, 21, 28, 30],
        pressure: [22, 23, 1009],
        speed: [15, 16, 27],
        length: [29, 40, 41, 42, 43],
        mass: [37, 38, 39],
        currency: [51, 52, 53, 54],
        other: [0, 4, 12, 25, 26, 33, 34, 35]
    };
}

/**
 * Hilfsfunktion: Wert von Raw zu Float konvertieren
 * @param {number} rawValue - Der Rohwert (Int16 oder Int32)
 * @param {number} unitId - Die Unit ID
 * @returns {number} Konvertierter Wert mit Nachkommastellen
 */
function convertValue(rawValue, unitId) {
    const unitInfo = getUnitInfo(unitId);
    const decimals = unitInfo.decimals;
    return rawValue / Math.pow(10, decimals);
}

/**
 * Hilfsfunktion: Wert von Float zu Raw konvertieren
 * @param {number} value - Der Float-Wert
 * @param {number} unitId - Die Unit ID
 * @returns {number} Rohwert für Übertragung (Int16 oder Int32)
 */
function unconvertValue(value, unitId) {
    const unitInfo = getUnitInfo(unitId);
    const decimals = unitInfo.decimals;
    return Math.round(value * Math.pow(10, decimals));
}

// Export für Node.js Module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        UNITS,
        getUnitInfo,
        getAllUnits,
        getUnitDropdownList,
        getUnitsByCategory,
        convertValue,
        unconvertValue
    };
}

// Export für Browser/andere Umgebungen
if (typeof window !== 'undefined') {
    window.TACoEUnits = {
        UNITS,
        getUnitInfo,
        getAllUnits,
        getUnitDropdownList,
        getUnitsByCategory,
        convertValue,
        unconvertValue
    };
}
