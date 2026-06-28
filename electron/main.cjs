const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const { autoUpdater } = require('electron-updater');

// Habilita a impressão silenciosa (direto para a impressora padrão, sem janela)
app.commandLine.appendSwitch('kiosk-printing');

ipcMain.on('print-receipt', (event, html, twoCopies) => {
  let printWin = new BrowserWindow({
    show: false,
    width: 300,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  printWin.loadURL(dataUrl);

  printWin.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      printWin.webContents.print({ silent: true, printBackground: true, margins: { marginType: 'none' } }, (success, failureReason) => {
        if (twoCopies && success) {
          setTimeout(() => {
            printWin.webContents.print({ silent: true, printBackground: true, margins: { marginType: 'none' } }, () => {
              printWin.close();
            });
          }, 1500);
        } else {
          printWin.close();
        }
      });
    }, 1500); // Aguarda renderização
  });
});

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
  autoUpdater.checkForUpdatesAndNotify();

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
      setImmediate(() => autoUpdater.quitAndInstall());
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Erro no autoUpdater:', err);
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
