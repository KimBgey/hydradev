const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path  = require('path');
const store = require('./store');

// ── Squirrel (installeur Windows) — doit être tout en haut ──
if (require('electron-squirrel-startup')) app.quit();

// ── DEV MODE ──
const DEV_MODE = false; // true pendant le dev, false pour le build

const WATER_DELAY  = DEV_MODE ? 10 : 45 * 60;
const TOILET_DELAY = DEV_MODE ? 20 : 120 * 60;

// ── État en mémoire ──
let data      = {};
let focusMode = false; // 🎯 mode focus actif

let widgetWindow    = null;
let reminderWindow  = null;
let dashboardWindow = null;
let tray            = null;
let waterInterval   = null;
let toiletInterval  = null;
let widgetTick      = null;
let alertPending    = false;

// Délais effectifs selon le mode
function waterDelay()  { return focusMode ? WATER_DELAY  * 2 : WATER_DELAY; }
function toiletDelay() { return focusMode ? TOILET_DELAY * 2 : TOILET_DELAY; }

// ─────────────────────────────────────────
//  TRAY ICON
// ─────────────────────────────────────────
function createTray() {
  const iconNormal = nativeImage.createFromPath(path.join(__dirname, 'tray-icon.png'));
  const iconAlert  = nativeImage.createFromPath(path.join(__dirname, 'tray-icon-alert.png'));
  const iconFocus  = nativeImage.createFromPath(path.join(__dirname, 'tray-icon-focus.png'));

  tray = new Tray(iconNormal);
  tray.setToolTip('HydraDev 💧');

  // Clic gauche → montrer/cacher le widget
  tray.on('click', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    widgetWindow.isVisible() ? widgetWindow.hide() : widgetWindow.show();
  });

  updateTrayMenu();

  // Basculer l'icône selon l'état (priorité : alerte > focus > normal)
  tray._setAlert = (on) => {
    if (on)          tray.setImage(iconAlert);
    else if (focusMode) tray.setImage(iconFocus);
    else             tray.setImage(iconNormal);
  };

  tray._syncIcon = () => {
    if (alertPending)  tray.setImage(iconAlert);
    else if (focusMode) tray.setImage(iconFocus);
    else               tray.setImage(iconNormal);
  };
}

function updateTrayMenu() {
  if (!tray) return;

  const glassesLabel = `💧 ${data.glasses || 0} / ${data.totalGlasses || 8} verres aujourd'hui`;
  const streakLabel  = `🔥 Streak : ${data.streak || 0} jour${data.streak !== 1 ? 's' : ''}`;

  const menu = Menu.buildFromTemplate([
    { label: 'HydraDev', enabled: false },
    { type: 'separator' },
    { label: glassesLabel, enabled: false },
    { label: streakLabel,  enabled: false },
    { type: 'separator' },
    {
      label: '💧 J\'ai bu !',
      click: () => {
        data = store.recordDrink(data);
        startWaterTimer();
        closeReminder();
        updateTrayMenu();
      },
    },
    {
      label: '🚽 Pause faite',
      click: () => {
        data = store.recordPause(data);
        startToiletTimer();
        closeReminder();
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: focusMode ? '🎯 Mode focus : ON  — désactiver' : '🎯 Mode focus : OFF — activer',
      click: () => toggleFocus(),
    },
    { type: 'separator' },
    {
      label: '📊 Voir les stats',
      click: () => openDashboard(),
    },
    { type: 'separator' },
    {
      label: widgetWindow && widgetWindow.isVisible() ? 'Cacher le widget' : 'Afficher le widget',
      click: () => {
        if (!widgetWindow || widgetWindow.isDestroyed()) return;
        widgetWindow.isVisible() ? widgetWindow.hide() : widgetWindow.show();
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        // Sauvegarde propre avant de quitter
        store.save(data);
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(menu);
}

// ─────────────────────────────────────────
//  WIDGET
// ─────────────────────────────────────────
function createWidget() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  widgetWindow = new BrowserWindow({
    width: 340, height: 60,
    x: width - 360, y: height - 80,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  widgetWindow.loadFile('widget.html');

  widgetWindow.once('ready-to-show', () => {
    widgetWindow.show();
    pushStateToWidget();
  });

  widgetTick = setInterval(() => {
    if (widgetWindow && !widgetWindow.isDestroyed()) pushStateToWidget();
  }, 1000);
}

function pushStateToWidget() {
  widgetWindow.webContents.send('update-state', {
    waterSecs:    data.waterSecs,
    toiletSecs:   data.toiletSecs,
    glasses:      data.glasses,
    totalGlasses: data.totalGlasses,
    streak:       data.streak,
    focusMode,
  });
}

// ─────────────────────────────────────────
//  MODE FOCUS
// ─────────────────────────────────────────
function toggleFocus() {
  focusMode = !focusMode;

  // Redémarrer les timers avec les nouveaux délais
  startWaterTimer();
  startToiletTimer();

  // Fermer un éventuel popup en cours (pas pertinent en focus)
  if (focusMode) closeReminder();

  // Sync icône + menu + widget
  if (tray) tray._syncIcon();
  updateTrayMenu();
  if (widgetWindow && !widgetWindow.isDestroyed()) pushStateToWidget();

  if (DEV_MODE) console.log('[HydraDev] Focus mode:', focusMode ? 'ON' : 'OFF');
}

// ─────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────
function openDashboard() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 560,
    height: 640,
    title: 'HydraDev — Stats',
    frame: false,
    transparent: false,
    resizable: false,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  dashboardWindow.loadFile('dashboard.html');

  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show();
    dashboardWindow.focus();
  });

  dashboardWindow.on('closed', () => { dashboardWindow = null; });
}

// ─────────────────────────────────────────
//  POPUP REMINDER
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
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  reminderWindow.once('ready-to-show', () => {
    reminderWindow.show();
    reminderWindow.focus();
    // Icône orange : un rappel est en attente
    alertPending = true;
    if (tray) tray._setAlert(true);
    updateTrayMenu();
  });

  const minsSincePause = store.minutesSinceLastPause(data);
  const params = new URLSearchParams({
    mode,
    glasses: data.glasses,
    total:   data.totalGlasses,
    elapsed: mode === 'water'
               ? Math.round((WATER_DELAY - data.waterSecs) / 60) + Math.round(WATER_DELAY / 60)
               : minsSincePause || 120,
    streak:  data.streak,
  });

  reminderWindow.loadFile('reminder.html', { search: params.toString() });
}

function closeReminder() {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.close();
    reminderWindow = null;
  }
  // Retour à l'icône normale
  alertPending = false;
  if (tray) tray._setAlert(false);
}

// ─────────────────────────────────────────
//  TIMERS
// ─────────────────────────────────────────
function startWaterTimer() {
  clearInterval(waterInterval);
  data.waterSecs = waterDelay();
  waterInterval = setInterval(() => {
    data.waterSecs--;
    if (data.waterSecs <= 0) { clearInterval(waterInterval); showReminder('water'); }
  }, 1000);
}

function startToiletTimer() {
  clearInterval(toiletInterval);
  data.toiletSecs = toiletDelay();
  toiletInterval = setInterval(() => {
    data.toiletSecs--;
    if (data.toiletSecs <= 0) { clearInterval(toiletInterval); showReminder('toilet'); }
  }, 1000);
}

// ─────────────────────────────────────────
//  IPC
// ─────────────────────────────────────────
ipcMain.on('drink-done', () => {
  closeReminder();
  data = store.recordDrink(data);
  startWaterTimer();
  updateTrayMenu();
});

ipcMain.on('pause-done', () => {
  closeReminder();
  data = store.recordPause(data);
  startToiletTimer();
  updateTrayMenu();
});

ipcMain.on('remind-later', (e, delayMin = 10) => {
  closeReminder();
  setTimeout(() => showReminder('water'), delayMin * 60 * 1000);
});

// ── Dashboard IPC ──
ipcMain.on('get-dashboard-data', (e) => {
  e.sender.send('dashboard-data', {
    glasses:      data.glasses,
    totalGlasses: data.totalGlasses,
    streak:       data.streak,
    lastDrinkDate: data.lastDrinkDate,
    history:      data.history || [],
  });
});

ipcMain.on('update-goal', (e, newGoal) => {
  data.totalGlasses = newGoal;
  store.save(data);
  // mettre à jour le widget aussi
  if (widgetWindow && !widgetWindow.isDestroyed()) pushStateToWidget();
});

// ─────────────────────────────────────────
//  DÉMARRAGE
// ─────────────────────────────────────────
app.whenReady().then(() => {
  data = store.load();
  data = store.checkStreak(data);
  data.waterSecs  = WATER_DELAY;
  data.toiletSecs = TOILET_DELAY;

  // ── Auto-launch au démarrage système ──
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,   // démarre sans fenêtre visible (juste le tray)
    name: 'HydraDev',
    path: app.getPath('exe'),
  });

  createTray();
  createWidget();
  startWaterTimer();
  startToiletTimer();

  if (DEV_MODE) {
    console.log('[HydraDev] DEV_MODE actif');
    console.log('[HydraDev] Données:', JSON.stringify(data, null, 2));
    console.log('[HydraDev] Fichier:', path.join(app.getPath('userData'), 'hydradev-data.json'));
  }
});

// Ne jamais quitter automatiquement — on passe par le menu tray
app.on('window-all-closed', (e) => e.preventDefault());