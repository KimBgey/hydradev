const { app, BrowserWindow, Notification } = require('electron');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

// 💧 Fonction de notification
function showHydrationNotification() {
  new Notification({
    title: 'HydraDev 💧',
    body: 'Bois un verre d’eau !'
  }).show();
}

// ⏱️ Timer (60 minutes = 3600000 ms)
function startHydrationReminder() {
  setInterval(() => {
    showHydrationNotification();
  }, 60000);
}

app.whenReady().then(() => {
  createWindow();
  startHydrationReminder();
});