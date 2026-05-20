import type Electron from 'electron'
import { ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import logger from 'electron-log/main'

function safeSend(win: Electron.BrowserWindow, channel: string, ...args: any[]) {
  if (!win.isDestroyed()) win.webContents.send(channel, ...args)
}

export function registerBootstrapHandlers(mainWindow: Electron.BrowserWindow) {
  if (process.env.VITE_DEV_SERVER_URL) {
    // App is not packaged in dev mode — skip updater
    ipcMain.handle('bootstraps:check', async () => ({ updateAvailable: false }))
    ipcMain.handle('bootstraps:download', async () => {})
    ipcMain.handle('bootstraps:install', () => {})
    return
  }

  autoUpdater.logger = logger
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  // Map electron-updater progress shape to what init.ts expects
  autoUpdater.on('download-progress', (progress) => {
    safeSend(mainWindow, 'bootstraps:download_progress', {
      downloaded: { size: progress.transferred },
      total: { amount: progress.total }
    })
  })

  autoUpdater.on('update-downloaded', () => {
    safeSend(mainWindow, 'bootstraps:download_end', {})
  })

  autoUpdater.on('error', (err) => {
    logger.error('AutoUpdater error:', err)
    safeSend(mainWindow, 'bootstraps:error', err?.message ?? String(err))
  })

  ipcMain.handle('bootstraps:check', () => {
    return new Promise<{ updateAvailable: boolean }>((resolve) => {
      let resolved = false
      const done = (available: boolean) => {
        if (resolved) return
        resolved = true
        autoUpdater.removeListener('update-available', onAvailable)
        autoUpdater.removeListener('update-not-available', onNotAvailable)
        autoUpdater.removeListener('error', onError)
        resolve({ updateAvailable: available })
      }
      const onAvailable = () => done(true)
      const onNotAvailable = () => done(false)
      const onError = (err: Error) => { logger.error('Update check failed:', err); done(false) }

      autoUpdater.once('update-available', onAvailable)
      autoUpdater.once('update-not-available', onNotAvailable)
      autoUpdater.once('error', onError)
      autoUpdater.checkForUpdates().then((r) => { if (r === null) done(false) }).catch(onError)
    })
  })

  ipcMain.handle('bootstraps:download', async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('bootstraps:install', () => {
    autoUpdater.quitAndInstall()
  })
}
