const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

// ── Persistance ──
const DATA_PATH = path.join(app.getPath('userData'), 'hydradev-state.json');

function saveState() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));
}

function loadState() {
  if (fs.existsSync(DATA_PATH)) {
    Object.assign(state, JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
  }
}

// ── État global ──
const DEV_MODE = true;

const WATER_DELAY  = DEV_MODE ? 120      : 45 * 60;  // 2min dev, 45min prod
const TOILET_DELAY = DEV_MODE ? 60       : 120 * 60; // 1min dev, 2h prod

const state = {
  glasses: 0,
  totalGlasses: 8,
  streak: 3,
  waterSecs: 45 * 60,
  toiletSecs: 120 * 60,
};

let widgetWindow   = null;
let reminderWindow = null;
let waterInterval  = null;
let toiletInterval = null;
let widgetTick     = null;
let tray           = null;

// ─────────────────────────────────────────
// WIDGET always-on-top
// ─────────────────────────────────────────
function createWidget() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  widgetWindow = new BrowserWindow({
    width: 340,
    height: 60,
    x: width - 360,
    y: height - 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // ✅ Cache au lieu de fermer
  widgetWindow.on('close', (e) => {
    e.preventDefault();
    widgetWindow.hide();
  });

  widgetWindow.loadFile('widget.html');

  widgetWindow.once('ready-to-show', () => {
    widgetWindow.show();
    widgetWindow.focus();
    widgetWindow.webContents.send('init-state', {
      waterSecs:    state.waterSecs,
      toiletSecs:   state.toiletSecs,
      glasses:      state.glasses,
      totalGlasses: state.totalGlasses,
    });
  });

  // Sync widget
  widgetTick = setInterval(() => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('update-state', {
        waterSecs:  state.waterSecs,
        toiletSecs: state.toiletSecs,
        glasses:    state.glasses,
      });
    }
  }, 1000);
}

// ─────────────────────────────────────────
// POPUP REMINDER
// ─────────────────────────────────────────
function showReminder(mode = 'water') {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.focus();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  reminderWindow = new BrowserWindow({
    width: 320,
    height: mode === 'toilet' ? 300 : 400,
    x: width - 340,
    y: height - (mode === 'toilet' ? 320 : 420),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  reminderWindow.once('ready-to-show', () => {
    reminderWindow.show();
    reminderWindow.focus();
  });

  const params = new URLSearchParams({
    mode,
    glasses:  state.glasses,
    total:    state.totalGlasses,
    elapsed:  mode === 'water'
                ? Math.round((45 * 60 - state.waterSecs) / 60) + 60
                : Math.round((120 * 60 - state.toiletSecs) / 60) + 120,
    streak:   state.streak,
  });

  reminderWindow.loadFile('reminder.html', { search: params.toString() });
}

// ─────────────────────────────────────────
// TIMERS
// ─────────────────────────────────────────
function startWaterTimer() {
  clearInterval(waterInterval);
  state.waterSecs = WATER_DELAY;
  waterInterval = setInterval(() => {
    state.waterSecs--;
    if (state.waterSecs <= 0) {
      clearInterval(waterInterval);
      showReminder('water');
    }
  }, 1000);
}

function startToiletTimer() {
  clearInterval(toiletInterval);
  state.toiletSecs = TOILET_DELAY;
  toiletInterval = setInterval(() => {
    state.toiletSecs--;
    if (state.toiletSecs <= 0) {
      clearInterval(toiletInterval);
      showReminder('toilet');
    }
  }, 1000);
}

function closeReminder() {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.close();
    reminderWindow = null;
  }
}

// ─────────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────────
ipcMain.on('drink-done', () => {
  closeReminder();
  state.glasses = Math.min(state.glasses + 1, state.totalGlasses);
  saveState();  // ✅ Persiste
  startWaterTimer();
});

ipcMain.on('pause-done', () => {
  closeReminder();
  saveState();  // ✅ Persiste
  startToiletTimer();
});

ipcMain.on('remind-later', (e, delayMin = 10) => {
  closeReminder();
  setTimeout(() => showReminder('water'), delayMin * 60 * 1000);
});

// ─────────────────────────────────────────
// APP LIFECYCLE + TRAY
// ─────────────────────────────────────────
app.whenReady().then(() => {
  loadState();  // ✅ Charge état persistant

  // ✅ System Tray
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Montrer HydraDev', click: () => { if (widgetWindow) widgetWindow.show(); } },
    { type: 'separator' },
    { label: 'Stats', click: () => { console.log('HydraDev Stats:', state); } },
    { label: 'Quitter', click: () => app.quit() }
  ]);
  tray.setToolTip('HydraDev 💧');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (widgetWindow) widgetWindow.show(); });

  createWidget();
  startWaterTimer();
  startToiletTimer();
});

app.on('window-all-closed', () => {
  // ✅ Ne quitte JAMAIS - vit via tray
});

// ✅ Sauvegarde à la fermeture
app.on('before-quit', () => {
  saveState();
});