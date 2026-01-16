const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');

contextBridge.exposeInMainWorld('nova', {
  search: async (q, opts = {}) => ipcRenderer.invoke('search:google', { q, ...opts }),
  chat: async (messages, opts = {}) => ipcRenderer.invoke('ai:chat', { messages, ...opts }),
  importBookmarksHtml: async (html) => ipcRenderer.invoke('import:bookmarksHtml', { html }),
  importBookmarksFilePath: async (filePath) => ipcRenderer.invoke('import:bookmarksFile', { filePath }),
  onBookmarksFileSelected: (cb) => ipcRenderer.on('import:bookmarksFileSelected', async (_e, filePath) => cb(filePath)),
  importChromeProfile: async (profileDir, type) => ipcRenderer.invoke('import:chromeProfile', { profileDir, type }),
  exportData: async (dataset) => ipcRenderer.invoke('export:data', { dataset }),
  executePlan: async (plan, opts = {}) => ipcRenderer.invoke('agent:executePlan', { plan, ...opts }),
  readAudit: async () => ipcRenderer.invoke('audit:read'),
  wipeAudit: async () => ipcRenderer.invoke('audit:wipe'),
  version: '0.1.0',
  platform: os.platform()
});
