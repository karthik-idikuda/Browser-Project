require('dotenv').config();
const { app, BrowserWindow, ipcMain, session, Menu, shell } = require('electron');
const path = require('path');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch');

let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
  title: 'XerironX Browser',
    backgroundColor: '#111217',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      webviewTag: true
    },
    icon: path.join(app.getAppPath(), 'logo.png')
  });

  // Ad blocker
  const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  blocker.enableBlockingInSession(session.defaultSession);

  // Content Security Policy (basic)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    responseHeaders['Content-Security-Policy'] = [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:" // relaxed for MVP UI + webview
    ];
    callback({ responseHeaders });
  });

  // Simple application menu with basic edit shortcuts
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Bookmarks (Netscape HTML)…',
          click: async () => {
            const { dialog } = require('electron');
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Import Bookmarks',
              properties: ['openFile'],
              filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
            });
            if (!result.canceled && result.filePaths[0]) {
              mainWindow.webContents.send('import:bookmarksFileSelected', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/');
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: Google Search via RapidAPI (do not hardcode secrets)
ipcMain.handle('search:google', async (_e, { q, type = 'search', page = 1, num = 10 }) => {
  const host = 'google-search-master-mega.p.rapidapi.com';
  const key = process.env.RAPIDAPI_KEY; // set in .env
  if (!key) throw new Error('Missing RAPIDAPI_KEY');
  const endpointMap = {
    search: 'search',
    images: 'images',
    videos: 'videos',
    news: 'news',
    shopping: 'shopping',
    patents: 'patents',
    scholar: 'scholar',
    autocomplete: 'autocomplete',
    reviews: 'reviews',
    places: 'places',
    maps: 'maps'
  };
  const endpoint = endpointMap[type] || 'search';
  const url = `https://${host}/${endpoint}?q=${encodeURIComponent(q)}&num=${num}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-host': host,
      'x-rapidapi-key': key
    }
  });
  if (!res.ok) throw new Error(`Search API error: ${res.status}`);
  return res.json();
});

// IPC: AI chat via modular LLM adapter
const { generateChat } = require('./modules/llm');
const { SecureStore } = require('./modules/secureStore');
ipcMain.handle('ai:chat', async (_e, { messages, model }) => {
  return generateChat(messages, model);
});

// IPC: Import bookmarks (Netscape HTML string)
const { importBookmarksHtml, readFile } = require('./modules/importers');
const { importBookmarksFromProfile, importHistoryFromProfile } = require('./modules/chromeImport');
const { saveItems, exportItems } = require('./modules/localDb');
ipcMain.handle('import:bookmarksHtml', async (_e, { html }) => {
  const res = await importBookmarksHtml(html);
  saveItems('bookmarks', res.items);
  return res;
});
ipcMain.handle('import:bookmarksFile', async (_e, { filePath }) => {
  const html = readFile(filePath);
  const res = await importBookmarksHtml(html);
  saveItems('bookmarks', res.items);
  return res;
});

ipcMain.handle('import:chromeProfile', async (_e, { profileDir, type }) => {
  if (type === 'bookmarks') {
    const res = importBookmarksFromProfile(profileDir);
    saveItems('bookmarks', res.items);
    return res;
  }
  if (type === 'history') {
    const res = await importHistoryFromProfile(profileDir);
    saveItems('history', res.items);
    return res;
  }
  throw new Error('Unknown type');
});

ipcMain.handle('export:data', async (_e, { dataset }) => {
  return exportItems(dataset);
});

// IPC: Execute agentic action plan (with confirmation on UI side)
const { executePlan } = require('./modules/automation');
ipcMain.handle('agent:executePlan', async (_e, { plan, simulate = true }) => {
  const result = await executePlan(plan, { simulate });
  try {
    const store = new SecureStore(app.getPath('userData'), 'audit.enc');
    store.append({ type: 'agent-exec', simulate, plan, result });
  } catch {}
  return result;
});

// IPC: Audit log read / wipe
ipcMain.handle('audit:read', async () => {
  const store = new SecureStore(app.getPath('userData'), 'audit.enc');
  return store.readAll();
});
ipcMain.handle('audit:wipe', async () => {
  const store = new SecureStore(app.getPath('userData'), 'audit.enc');
  return store.wipe();
});
