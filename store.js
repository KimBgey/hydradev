const { app } = require('electron');
const fs   = require('fs');
const path = require('path');

// app.getPath('userData') → C:\Users\toi\AppData\Roaming\hydradev  (Windows)
//                         → /Users/toi/Library/Application Support/hydradev  (Mac)
//                         → /home/toi/.config/hydradev  (Linux)
const DATA_FILE = path.join(app.getPath('userData'), 'hydradev-data.json');

const DEFAULT = {
  glasses:       0,
  totalGlasses:  8,
  streak:        0,
  lastDrinkDate: null,   // 'YYYY-MM-DD'
  lastPauseAt:   null,   // ISO string
  history:       [],     // [{ date: 'YYYY-MM-DD', glasses: N }] — 30 derniers jours
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ── LECTURE ──
function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { ...DEFAULT };

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const t    = today();

    // Nouveau jour → archiver hier et remettre les verres à 0
    if (data.lastDrinkDate && data.lastDrinkDate !== t) {
      const alreadySaved = data.history.find(h => h.date === data.lastDrinkDate);
      if (!alreadySaved) {
        data.history.push({ date: data.lastDrinkDate, glasses: data.glasses });
        if (data.history.length > 30) data.history.shift();
      }
      data.glasses = 0;
    }

    return { ...DEFAULT, ...data };
  } catch (err) {
    console.error('[store] load error:', err.message);
    return { ...DEFAULT };
  }
}

// ── ÉCRITURE ──
function save(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[store] save error:', err.message);
  }
}

// ── ACTION : J'ai bu ──
function recordDrink(data) {
  const t = today();
  data.glasses = Math.min(data.glasses + 1, data.totalGlasses);

  if (!data.lastDrinkDate) {
    data.streak = 1;
  } else if (data.lastDrinkDate === t) {
    // déjà bu aujourd'hui → streak inchangé
  } else {
    const diff = daysBetween(data.lastDrinkDate, t);
    data.streak = diff === 1 ? (data.streak || 0) + 1 : 1;
  }

  data.lastDrinkDate = t;
  save(data);
  return data;
}

// ── ACTION : Pause faite ──
function recordPause(data) {
  data.lastPauseAt = new Date().toISOString();
  save(data);
  return data;
}

// ── Vérification streak au démarrage ──
function checkStreak(data) {
  if (!data.lastDrinkDate) return data;
  const diff = daysBetween(data.lastDrinkDate, today());
  if (diff > 1) {
    data.streak = 0;
    save(data);
  }
  return data;
}

// ── Minutes depuis la dernière pause ──
function minutesSinceLastPause(data) {
  if (!data.lastPauseAt) return null;
  return Math.round((Date.now() - new Date(data.lastPauseAt).getTime()) / 60000);
}

module.exports = { load, save, recordDrink, recordPause, checkStreak, minutesSinceLastPause };