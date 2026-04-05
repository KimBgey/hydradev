const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path         = require('path');
const store        = require('./store');
const { autoUpdater } = require('electron-updater');

// ── Squirrel (installeur Windows) — doit être tout en haut ──
if (require('electron-squirrel-startup')) app.quit();

// ── DEV MODE ──
const DEV_MODE = false; // true pendant le dev, false pour le build

const WATER_DELAY  = DEV_MODE ? 10 : 45 * 60;
const TOILET_DELAY = DEV_MODE ? 20 : 120 * 60;

// ── État en mémoire ──
let data          = {};
let focusMode     = false;
let updateReady   = false; // true quand une MAJ est téléchargée et prête

let widgetWindow    = null;
let reminderWindow  = null;
let dashboardWindow = null;
let tray            = null;
let waterInterval   = null;
let toiletInterval  = null;
let widgetTick      = null;
let alertPending    = false;

function waterDelay()  { return focusMode ? WATER_DELAY  * 2 : WATER_DELAY; }
function toiletDelay() { return focusMode ? TOILET_DELAY * 2 : TOILET_DELAY; }

// ─────────────────────────────────────────
//  AUTO-UPDATER
// ─────────────────────────────────────────
function setupAutoUpdater() {
  // Pas de popup automatique — on gère tout via le tray
  autoUpdater.autoDownload    = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Vérifier au démarrage (silencieux)
  autoUpdater.checkForUpdates().catch(() => {}); // ignore si pas de réseau

  // Re-vérifier toutes les 4 heures
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);

  // ── Événements ──

  // Mise à jour disponible → tooltip discret
  autoUpdater.on('update-available', (info) => {
    if (tray) tray.setToolTip(`HydraDev 💧 — v${info.version} en téléchargement…`);
    if (DEV_MODE) console.log('[updater] Mise à jour disponible:', info.version);
  });

  // Déjà à jour → rien à faire
  autoUpdater.on('update-not-available', () => {
    if (DEV_MODE) console.log('[updater] App à jour');
  });

  // Progression du téléchargement (optionnel)
  autoUpdater.on('download-progress', (progress) => {
    if (tray) tray.setToolTip(`HydraDev 💧 — Téléchargement ${Math.round(progress.percent)}%`);
  });

  // Téléchargement terminé → item dans le tray
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    if (tray) {
      tray.setToolTip(`HydraDev 💧 — v${info.version} prête à installer`);
      tray._syncIcon();
    }
    updateTrayMenu(); // afficher "Redémarrer pour mettre à jour"
    if (DEV_MODE) console.log('[updater] Mise à jour prête:', info.version);
  });

  // Erreur réseau → silencieux en prod
  autoUpdater.on('error', (err) => {
    if (DEV_MODE) console.error('[updater] Erreur:', err.message);
  });
}

// ─────────────────────────────────────────
//  TRAY ICON
// ─────────────────────────────────────────
function createTray() {
  const iconNormal = nativeImage.createFromPath(path.join(__dirname, 'tray-icon.png'));
  const iconAlert  = nativeImage.createFromPath(path.join(__dirname, 'tray-icon-alert.png'));
  const iconFocus  = nativeImage.createFromPath(path.join(__dirname, 'tray-icon-focus.png'));

  tray = new Tray(iconNormal);
  tray.setToolTip('HydraDev 💧');

  tray.on('click', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    widgetWindow.isVisible() ? widgetWindow.hide() : widgetWindow.show();
  });

  updateTrayMenu();

  // Priorité icône : alerte > focus > normal
  tray._setAlert = (on) => {
    if (on)             tray.setImage(iconAlert);
    else if (focusMode) tray.setImage(iconFocus);
    else                tray.setImage(iconNormal);
  };

  tray._syncIcon = () => {
    if (alertPending)   tray.setImage(iconAlert);
    else if (focusMode) tray.setImage(iconFocus);
    else                tray.setImage(iconNormal);
  };
}

function updateTrayMenu() {
  if (!tray) return;

  const glassesLabel = `💧 ${data.glasses || 0} / ${data.totalGlasses || 8} verres aujourd'hui`;
  const streakLabel  = `🔥 Streak : ${data.streak || 0} jour${data.streak !== 1 ? 's' : ''}`;

  const menu = Menu.buildFromTemplate([
    // ── Bannière mise à jour (apparaît seulement si updateReady) ──
    ...(updateReady ? [
      {
        label: '🆕 Redémarrer pour mettre à jour',
        click: () => autoUpdater.quitAndInstall(),
      },
      { type: 'separator' },
    ] : []),

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
  startWaterTimer();
  startToiletTimer();
  if (focusMode) closeReminder();
  if (tray) tray._syncIcon();
  updateTrayMenu();
  if (widgetWindow && !widgetWindow.isDestroyed()) pushStateToWidget();
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
    width: 560, height: 640,
    title: 'HydraDev — Stats',
    frame: false, transparent: false, resizable: false, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  dashboardWindow.loadFile('dashboard.html');
  dashboardWindow.once('ready-to-show', () => { dashboardWindow.show(); dashboardWindow.focus(); });
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
}

// ─────────────────────────────────────────
//  POPUP REMINDER
// ─────────────────────────────────────────
function showReminder(mode = 'water') {
  if (reminderWindow && !reminderWindow.isDestroyed()) { reminderWindow.focus(); return; }

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
  if (reminderWindow && !reminderWindow.isDestroyed()) { reminderWindow.close(); reminderWindow = null; }
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

ipcMain.on('get-dashboard-data', (e) => {
  e.sender.send('dashboard-data', {
    glasses:       data.glasses,
    totalGlasses:  data.totalGlasses,
    streak:        data.streak,
    lastDrinkDate: data.lastDrinkDate,
    history:       data.history || [],
  });
});

ipcMain.on('update-goal', (e, newGoal) => {
  data.totalGlasses = newGoal;
  store.save(data);
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

  app.setLoginItemSettings({
    openAtLogin:  true,
    openAsHidden: true,
    name: 'HydraDev',
    path: app.getPath('exe'),
  });

  createTray();
  createWidget();
  startWaterTimer();
  startToiletTimer();
  setupAutoUpdater(); // ← après createTray() pour que updateTrayMenu() fonctionne

  if (DEV_MODE) {
    console.log('[HydraDev] DEV_MODE actif');
    console.log('[HydraDev] Données:', JSON.stringify(data, null, 2));
    console.log('[HydraDev] Fichier:', path.join(app.getPath('userData'), 'hydradev-data.json'));
  }
});

app.on('window-all-closed', (e) => e.preventDefault());