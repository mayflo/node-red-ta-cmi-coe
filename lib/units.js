/**
 * Central Unit Definitions for TA CMI CoE
 */  

const fs = require("fs");
const path = require("path");

const unitsRaw = {
    0:  { key: "unit.dimensionless", decimals: 0 },
    1:  { key: "unit.temperature.celsius", decimals: 1 },
    2:  { key: "unit.solarRadiation", decimals: 0 },
    3:  { key: "unit.flow.lph", decimals: 0 },
    4:  { key: "unit.time.seconds", decimals: 0 },
    5:  { key: "unit.time.minutes", decimals: 0 },
    6:  { key: "unit.flow.lPerImp", decimals: 0 },
    7:  { key: "unit.temperature.kelvin", decimals: 1 },
    8:  { key: "unit.percent", decimals: 1 },
    10: { key: "unit.power.kW", decimals: 1 },
    11: { key: "unit.energy.kWh", decimals: 1 },
    12: { key: "unit.energy.MWh", decimals: 0 },
    13: { key: "unit.voltage.V", decimals: 2 },
    14: { key: "unit.current.mA", decimals: 1 },
    15: { key: "unit.time.hours", decimals: 0 },
    16: { key: "unit.time.days", decimals: 0 },
    17: { key: "unit.impulses", decimals: 0 },
    18: { key: "unit.resistance.kOhm", decimals: 2 },
    19: { key: "unit.volume.liter", decimals: 0 },
    20: { key: "unit.speed.kmh", decimals: 0 },
    21: { key: "unit.frequency.Hz", decimals: 2 },
    22: { key: "unit.flow.lpm", decimals: 0 },
    23: { key: "unit.pressure.bar", decimals: 2 },
    24: { key: "unit.performanceFactor", decimals: 2 },
    26: { key: "unit.length.m", decimals: 1 },
    27: { key: "unit.length.mm", decimals: 1 },
    28: { key: "unit.volume.m3", decimals: 0 },
    35: { key: "unit.flow.lpd", decimals: 0 },
    36: { key: "unit.speed.ms", decimals: 0 },
    37: { key: "unit.flow.m3pm", decimals: 0 },
    38: { key: "unit.flow.m3ph", decimals: 0 },
    39: { key: "unit.flow.m3pd", decimals: 0 },
    40: { key: "unit.speed.mmPerMin", decimals: 0 },
    41: { key: "unit.speed.mmPerHour", decimals: 0 },
    42: { key: "unit.speed.mmPerDay", decimals: 0 },
    43: { key: "unit.digital", decimals: 0 },
    50: { key: "unit.currency.euro", decimals: 2 },
    51: { key: "unit.currency.dollar", decimals: 2 },
    52: { key: "unit.humidity.absolute", decimals: 1 },
    53: { key: "unit.dimensionless", decimals: 5 }, // High precision
    54: { key: "unit.angle.degree", decimals: 1 },
    58: { key: "unit.dimensionless", decimals: 1 }, // Low Precision
    59: { key: "unit.percent", decimals: 1 },
    60: { key: "unit.time.minutesSinceMidnight", decimals: 0 },
    63: { key: "unit.current.A", decimals: 1 },
    65: { key: "unit.pressure.mbar", decimals: 1 },
    66: { key: "unit.pressure.Pa", decimals: 0 },
    67: { key: "unit.co2.ppm", decimals: 0 },
    69: { key: "unit.power.W", decimals: 0 },
    70: { key: "unit.weight.t", decimals: 2 },
    71: { key: "unit.weight.kg", decimals: 1 },
    72: { key: "unit.weight.g", decimals: 1 },
    73: { key: "unit.length.cm", decimals: 1 }
};

// Sprache automatisch erkennen
function detectSystemLang() {
  const envLang = process.env.LANG?.split(".")[0]; // z.B. "de_AT.UTF-8"
  const intlLang = Intl.DateTimeFormat().resolvedOptions().locale; // z.B. "de-AT"
  const lang = (envLang || intlLang || "en-US").toLowerCase();

  if (lang.startsWith("de")) return "de-DE";
  if (lang.startsWith("en")) return "en-US";
  return "en-US"; // Fallback
}

// Übersetzungen laden
function loadTranslations(locale) {
  const filePath = path.join(__dirname, "..", "locales", locale, "common.json");
  if (fs.existsSync(filePath)) {
    return require(filePath);
  }
  return {};
}

// Units bauen
function buildUnits() {
  const locale = detectSystemLang();
  const translations = loadTranslations(locale);

  function getTranslation(keyPath) {
    const parts = keyPath.split(".");
    let obj = translations;
    for (const p of parts) {
      if (!obj[p]) return null;
      obj = obj[p];
    }
    return obj;
  }

  const result = {};
  for (const [id, def] of Object.entries(unitsRaw)) {
    const trans = getTranslation(def.key);
    result[id] = trans
      ? { name: trans.name, symbol: trans.symbol, decimals: def.decimals }
      : { name: def.key, symbol: "", decimals: def.decimals };
  }
  return result;
}

module.exports = { buildUnits, unitsRaw };