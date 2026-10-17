const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  loadSnapshot: () => ipcRenderer.invoke("db:load"),
  saveSnapshot: (snapshot) => ipcRenderer.invoke("db:save", snapshot),
  backupDatabase: () => ipcRenderer.invoke("db:backup"),
  restoreDatabase: () => ipcRenderer.invoke("db:restore"),
  printReceipt: (html) => ipcRenderer.invoke("receipt:print", html),
  previewReceipt: (html) => ipcRenderer.invoke("receipt:preview", html),
  saveReceiptPdf: (html) => ipcRenderer.invoke("receipt:savePdf", html),
  getLogoDataUrl: (logoPath) => ipcRenderer.invoke("asset:logoDataUrl", logoPath),
  getAppDataPath: () => ipcRenderer.invoke("app:dataPath"),
  whatsappStatus: () => ipcRenderer.invoke("whatsapp:status"),
  whatsappSetEnabled: (enabled) => ipcRenderer.invoke("whatsapp:setEnabled", enabled),
  whatsappRelink: () => ipcRenderer.invoke("whatsapp:relink"),
  whatsappRetryFailed: () => ipcRenderer.invoke("whatsapp:retryFailed"),
  whatsappCheckUpdate: () => ipcRenderer.invoke("whatsapp:checkUpdate"),
  whatsappQueue: (payload) => ipcRenderer.invoke("whatsapp:queue", payload),
});