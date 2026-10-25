const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let configWindow = null;
let tray = null;
let isQuitting = false;
let hasShownTrayBalloon = false;

// Config file path in userData
const configDir = app.getPath('userData');
const configPath = path.join(configDir, 'assettrack-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data && data.serverUrl) {
        console.log('[Config] Carregado de:', configPath, data);
        return data;
      }
    }
  } catch (err) {
    console.warn('[Config] Erro ao carregar config:', err);
  }
  return { serverUrl: 'http://localhost:8000' };
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    console.log('[Config] Salvo com sucesso em:', configPath, cfg);
    return true;
  } catch (err) {
    console.error('[Config] Erro fatal ao salvar config:', err);
    return false;
  }
}

let appConfig = loadConfig();

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow) {
        mainWindow.show();
      }
    });
  });
}

function getIconPath() {
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  return fs.existsSync(icoPath) ? icoPath : pngPath;
}

function normalizeUrl(rawUrl) {
  let url = (rawUrl || '').trim();
  if (!url) return 'http://localhost:8000';
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  // Remove trailing slashes
  return url.replace(/\/+$/, '');
}

function createWindow() {
  const icon = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 680,
    title: 'AssetTrack TI',
    icon: icon,
    backgroundColor: '#092b24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Load configured URL
  loadServerUrl(appConfig.serverUrl);

  // Handle external links (open in default browser)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(appConfig.serverUrl)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Intercept close to minimize to tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      if (!hasShownTrayBalloon && Notification.isSupported()) {
        new Notification({
          title: 'AssetTrack TI',
          body: 'O aplicativo continua rodando na bandeja do sistema para receber alertas.',
          icon: icon,
        }).show();
        hasShownTrayBalloon = true;
      }
    }
  });

  // Handle page load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // aborted
    showOfflineErrorPage(validatedURL, errorDescription);
  });
}

function loadServerUrl(targetUrl) {
  if (!mainWindow) return;
  const urlToLoad = normalizeUrl(targetUrl);
  console.log('[App] Carregando URL:', urlToLoad);
  mainWindow.loadURL(urlToLoad).catch((err) => {
    console.warn('[App] Falha ao carregar URL:', err);
  });
}

function openConfigModal() {
  if (configWindow) {
    configWindow.focus();
    return;
  }

  const icon = getIconPath();
  configWindow = new BrowserWindow({
    width: 520,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    title: 'Configurar Endereço do Servidor',
    icon: icon,
    backgroundColor: '#092b24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  configWindow.setMenuBarVisibility(false);
  configWindow.loadFile(path.join(__dirname, 'config.html'));

  configWindow.on('closed', () => {
    configWindow = null;
  });
}

function showOfflineErrorPage(failedUrl, errorDescription) {
  if (!mainWindow) return;

  const currentUrl = failedUrl || appConfig.serverUrl;
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>AssetTrack TI - Servidor Inacessível</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #092b24;
          color: #ecf4ee;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }
        .error-card {
          background: #0d382f;
          border: 1px solid #1c5244;
          padding: 38px;
          border-radius: 16px;
          max-width: 560px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          text-align: center;
        }
        .icon-circle {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #114539;
          border: 2px solid #c1f45a;
          color: #c1f45a;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          font-size: 26px;
          font-weight: bold;
        }
        h1 { margin: 0 0 10px; font-size: 1.5rem; color: #fff; font-weight: 600; }
        p { color: #a4bea9; font-size: 0.92rem; line-height: 1.5; margin: 0 0 20px; }
        .input-group {
          margin-bottom: 20px;
          text-align: left;
        }
        label {
          display: block;
          font-size: 0.78rem;
          color: #c1f45a;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        input[type="text"] {
          width: 100%;
          background: #061f1a;
          border: 1.5px solid #285e4f;
          border-radius: 8px;
          padding: 12px 14px;
          color: #fff;
          font-size: 0.95rem;
          font-family: monospace;
          outline: none;
          transition: border-color 0.2s;
        }
        input[type="text"]:focus {
          border-color: #c1f45a;
          box-shadow: 0 0 10px rgba(193, 244, 90, 0.25);
        }
        .actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }
        button {
          background: #c1f45a;
          color: #092b24;
          border: none;
          font-weight: 700;
          padding: 12px 22px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: transform 0.2s, background 0.2s;
        }
        button:hover { background: #d3fc77; transform: translateY(-2px); }
        button.secondary {
          background: #154539;
          color: #ecf4ee;
          border: 1px solid #286454;
        }
        button.secondary:hover { background: #1c584a; }
        .hint {
          font-size: 0.78rem;
          color: #799e8c;
          margin-top: 18px;
          line-height: 1.4;
        }
      </style>
    </head>
    <body>
      <div class="error-card">
        <div class="icon-circle">!</div>
        <h1>Servidor Inacessível</h1>
        <p>Não foi possível conectar ao servidor. Verifique o endereço abaixo ou inicie o Docker localmente.</p>
        
        <div class="input-group">
          <label for="addressInput">Endereço da Aplicação (URL / IP):</label>
          <input type="text" id="addressInput" value="${currentUrl}" placeholder="Ex: http://192.168.1.100:8000" />
        </div>

        <div class="actions">
          <button type="button" onclick="saveAndConnect()">Salvar e Conectar</button>
          <button type="button" class="secondary" onclick="useLocalhost()">Usar localhost:8000</button>
        </div>

        <div class="hint">
          Pressione Enter para salvar e tentar a conexão novamente.
        </div>
      </div>

      <script>
        const input = document.getElementById('addressInput');

        function saveAndConnect() {
          let val = (input.value || '').trim();
          if (!val) val = 'http://localhost:8000';
          if (!/^https?:\\/\\//i.test(val)) val = 'http://' + val;
          window.desktopAPI.setServerUrl(val);
        }

        function useLocalhost() {
          input.value = 'http://localhost:8000';
          saveAndConnect();
        }

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') saveAndConnect();
        });

        input.focus();
        input.select();
      </script>
    </body>
    </html>
  `;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function createTray() {
  const icon = getIconPath();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir AssetTrack TI',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Configurar Endereço do Servidor...',
      click: openConfigModal,
    },
    {
      label: 'Recarregar (F5)',
      click: () => {
        if (mainWindow) mainWindow.reload();
      },
    },
    { type: 'separator' },
    {
      label: 'Sobre o AssetTrack TI',
      click: () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Sobre o AssetTrack TI',
          message: 'AssetTrack TI - Gestão de Ativos & Operações de TI',
          detail: `Versão Desktop: 1.2.0\nConectado a: ${appConfig.serverUrl}\n\nDesenvolvido para operações de infraestrutura, chamados, patrimônio e telemetria.`,
          icon: icon,
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Encerrar Aplicativo',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('AssetTrack TI - Cliente Desktop');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

// IPC Handlers
ipcMain.on('app-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'AssetTrack TI',
      body: body || '',
      icon: getIconPath(),
    }).show();
  }
});

ipcMain.on('minimize-to-tray', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('reconnect-server', (event, newUrl) => {
  if (newUrl === 'PROMPT_CONFIG') {
    openConfigModal();
  } else {
    loadServerUrl(newUrl || appConfig.serverUrl);
  }
});

ipcMain.on('set-server-url', (event, rawUrl) => {
  const normalized = normalizeUrl(rawUrl);
  console.log('[IPC] Definindo novo endereço do servidor:', normalized);
  appConfig.serverUrl = normalized;
  saveConfig(appConfig);

  if (configWindow) {
    configWindow.close();
  }

  loadServerUrl(normalized);
});

ipcMain.handle('get-server-url', () => {
  return appConfig.serverUrl;
});

ipcMain.on('open-config-window', () => {
  openConfigModal();
});

ipcMain.on('close-config-window', () => {
  if (configWindow) configWindow.close();
});

app.on('before-quit', () => {
  isQuitting = true;
});
