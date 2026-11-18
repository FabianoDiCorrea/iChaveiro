const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const { autoUpdater } = require('electron-updater');

if (process.env.ICHAVEIRO_TEST_MODE === '1' && process.env.ICHAVEIRO_TEST_USER_DATA_DIR) {
  app.setPath('userData', process.env.ICHAVEIRO_TEST_USER_DATA_DIR);
}

// Habilita a impressão silenciosa (direto para a impressora padrão, sem janela)
app.commandLine.appendSwitch('kiosk-printing');

// Independent continuous-paper print path for the free-text editor.
ipcMain.handle('print-free-coupon', async (_event, html, settings) => {
  const failure = (error) => ({ success: false, error: error instanceof Error ? error.message : String(error || 'Falha desconhecida na impressão.') });
  if (typeof html !== 'string' || !html.length || html.length > 2_000_000) return failure('O conteúdo do cupom está vazio ou excede o limite de impressão.');
  if (!settings || !Number.isInteger(settings.copies) || settings.copies < 1 || settings.copies > 20) return failure('A quantidade de cópias deve ficar entre 1 e 20.');
  if (!Number.isFinite(settings.paperWidthMm) || settings.paperWidthMm < 40 || settings.paperWidthMm > 120) return failure('A largura física do papel é inválida.');
  const dimensions = [settings.printableWidthMm, settings.marginLeftMm, settings.marginRightMm, settings.marginTopMm, settings.marginBottomMm];
  if (!dimensions.every(Number.isFinite) || settings.printableWidthMm < 20 || dimensions.slice(1).some(value => value < 0 || value > 50)
      || settings.printableWidthMm + settings.marginLeftMm + settings.marginRightMm > settings.paperWidthMm + 0.001) return failure('A área imprimível e as margens não cabem na largura física informada.');

  let printWin;
  try {
    printWin = new BrowserWindow({
      show: false,
      width: 400,
      height: 900,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const heightPx = await printWin.webContents.executeJavaScript('document.fonts.ready.then(() => document.documentElement.scrollHeight)');
    if (!Number.isFinite(heightPx) || heightPx <= 0) throw new Error('Não foi possível medir o comprimento do documento.');
    const pageSize = {
      width: Math.round(settings.paperWidthMm * 1000),
      height: Math.max(353, Math.ceil(heightPx * 25400 / 96))
    };
    const result = await new Promise((resolve) => {
      printWin.webContents.print({
        silent: true,
        printBackground: true,
        color: false,
        copies: settings.copies,
        pageSize,
        margins: { marginType: 'none' }
      }, (success, failureReason) => resolve({ success, failure: failureReason }));
    });
    if (!result.success) return failure(result.failure || 'O driver recusou as medidas do papel ou o trabalho de impressão.');
    return { success: true };
  } catch (error) {
    return failure(error);
  } finally {
    if (printWin && !printWin.isDestroyed()) printWin.close();
  }
});
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
      printWin.webContents.print({ silent: true, printBackground: true }, (success, failureReason) => {
        if (twoCopies && success) {
          setTimeout(() => {
            printWin.webContents.print({ silent: true, printBackground: true }, () => {
              printWin.close();
            });
          }, 1500);
        } else {
          printWin.close();
        }
      });
    }, 1500); // Aguarda renderização para evitar cupom em branco
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

  // No test profile should check, download or install an update.
  if (process.env.ICHAVEIRO_TEST_MODE === '1') return;

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
      setImmediate(() => autoUpdater.quitAndInstall());
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Erro no autoUpdater:', err);
    dialog.showMessageBox({
      type: 'error',
      title: 'Erro na Atualização',
      message: `Houve um erro ao verificar/baixar atualizações:\n${err.message || err}`
    });
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
