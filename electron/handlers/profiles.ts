import { ipcMain, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import logger from 'electron-log/main'

function resolveProfilesDir(): string {
  const candidates = [
    path.join(app.getAppPath(), 'Profiles'),
    path.join(process.cwd(), 'Profiles'),
    path.join(path.dirname(process.execPath), 'Profiles')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

export function registerProfilesHandlers() {
  ipcMain.handle('profiles:get', async () => {
    try {
      const dir = resolveProfilesDir()
      logger.log('Profiles dir:', dir)

      if (!fs.existsSync(dir)) {
        logger.warn('Profiles directory not found:', dir)
        return []
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true })
      const profiles: any[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const jsonPath = path.join(dir, entry.name, 'profile.json')
        if (!fs.existsSync(jsonPath)) continue
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
          profiles.push({ ...data, dir: entry.name, path: path.join(dir, entry.name) })
        } catch (e) {
          logger.warn('Skipping invalid profile:', entry.name, e)
        }
      }

      logger.log('Loaded profiles:', profiles.map((p) => p.name))
      const sorted = [profiles.find((p) => p.isDefault), ...profiles.filter((p) => !p.isDefault)].filter(Boolean)
      return sorted
    } catch (err) {
      logger.error('Failed to load profiles:', err)
      return []
    }
  })
}
