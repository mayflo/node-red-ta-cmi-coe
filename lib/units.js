/**
 * Central Unit Definitions for TA CMI CoE
 */  

// units-config.js - Zentrale Einheiten-Konfiguration

const RED = require('node-red');

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
    59: { name: 'Prozent', symbol: '%', decimals: 0 },
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
}

// Units API - provides all available Units for the UI
RED.httpAdmin.get('/ta-cmi-coe/units', function(req, res) {
    res.json(UNITS);
})

module.exports = {
    UNITS  // Exportiere UNITS für direkten Zugriff

};