/**
 * Electron Preload Script
 * Runs in the renderer process before the page loads.
 * Safely exposes the desktop API port to the page.
 */
const { contextBridge } = require('electron');

// Expose a minimal API to the renderer (no Node.js APIs leaked)
contextBridge.exposeInMainWorld('__msDesktop', {
  isDesktop: true,
  getApiUrl: () => `http://127.0.0.1:${window.__MS_DESKTOP_PORT || 8765}`,
});
