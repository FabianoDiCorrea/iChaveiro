const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const { autoUpdater } = require('electron-updater');

// Habilita a impressão silenciosa (direto para a impressora padrão, sem janela)
app.commandLine.appendSwitch('kiosk-printing');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../dist/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, '../dist/index.html'),
    protocol: 'file:',
    slashes: true
  });

  win.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();

  // Configurações do autoUpdater
  autoUpdater.autoDownload = false;
  autoUpdater.checkForUpdates();

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Atualização Disponível',
      message: `Uma nova versão (${info.version}) do iChaveiro está disponível.\n\nDeseja baixar agora?`,
      buttons: ['Sim, baixar', 'Não, mais tarde']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Atualização Pronta',
      message: 'O download da atualização foi concluído. O aplicativo será reiniciado para aplicar a nova versão.',
      buttons: ['Reiniciar e Instalar']
    }).then(() => {
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Erro no autoUpdater:', err);
  });
});

ipcMain.on('print-text', (event, text) => {
  const { exec } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const tmpPath = path.join(app.getPath('temp'), 'receipt.txt');
  fs.writeFileSync(tmpPath, text, 'utf8');
  exec(`powershell -Command "Get-Content '${tmpPath}' -Encoding UTF8 | Out-Printer"`, (err) => {
    if (err) console.error("Text print error:", err);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
