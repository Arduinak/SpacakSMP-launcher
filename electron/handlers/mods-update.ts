import type Electron from 'electron'
import { ipcMain, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import AdmZip from 'adm-zip'
import logger from 'electron-log/main'
import { getProfilesDir } from './install'

const UPDATE_YML_URL = 'https://api.github.com/repos/Arduinak/SpacakSMP-launcher/contents/update.yml'

function getVersionFilePath(): string {
  return path.join(app.getPath('userData'), 'mods_version.json')
}

function getLocalVersion(): string | null {
  const vp = getVersionFilePath()
  if (!fs.existsSync(vp)) return null
  try {
    return JSON.parse(fs.readFileSync(vp, 'utf-8')).version ?? null
  } catch {
    return null
  }
}

function saveLocalVersion(version: string): void {
  fs.writeFileSync(getVersionFilePath(), JSON.stringify({ version }), 'utf-8')
}

async function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'SpacakLauncher/1.0', 'Accept': 'application/vnd.github.raw+json' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function downloadBuffer(url: string, onProgress: (downloaded: number, total: number) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'SpacakLauncher/1.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return downloadBuffer(res.headers.location, onProgress).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      const chunks: Buffer[] = []
      let downloaded = 0
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        downloaded += chunk.length
        onProgress(downloaded, total)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function parseYml(yaml: string): { version: string | null; url: string | null } {
  const vm = yaml.match(/^version:\s*["']?([^\s"'\r\n]+)["']?/m)
  const um = yaml.match(/^url:\s*["']?([^\s"'\r\n]+)["']?/m)
  return { version: vm ? vm[1] : null, url: um ? um[1] : null }
}

let pendingModsZipUrl: string | null = null

function getFirstProfileModsDir(): string | null {
  const profilesDir = getProfilesDir()
  if (!fs.existsSync(profilesDir)) return null
  const entries = fs.readdirSync(profilesDir, { withFileTypes: true })
  const profile = entries.find((e) => e.isDirectory())
  if (!profile) return null
  return path.join(profilesDir, profile.name, 'mods')
}

export function registerModsUpdateHandlers(mainWindow: Electron.BrowserWindow) {
  ipcMain.handle('mods-update:check', async () => {
    try {
      const yaml = await fetchText(UPDATE_YML_URL)
      const { version: remoteVersion, url } = parseYml(yaml)
      if (!remoteVersion) return { updateAvailable: false }
      pendingModsZipUrl = url
      const localVersion = getLocalVersion()
      logger.log(`Mods version — local: ${localVersion}, remote: ${remoteVersion}, url: ${url}`)
      return { updateAvailable: remoteVersion !== localVersion, remoteVersion }
    } catch (err) {
      logger.error('Mods update check failed:', err)
      return { updateAvailable: false }
    }
  })

  ipcMain.handle('mods-update:apply', async (_, remoteVersion: string) => {
    const safeSend = (ch: string, data: any) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data)
    }

    try {
      const modsDir = getFirstProfileModsDir()
      if (!modsDir) throw new Error('Profil nenájdený')

      // Clear existing mods
      if (fs.existsSync(modsDir)) {
        for (const f of fs.readdirSync(modsDir)) {
          fs.rmSync(path.join(modsDir, f), { recursive: true, force: true })
        }
      }
      await fs.promises.mkdir(modsDir, { recursive: true })

      // Use URL from update.yml if present, otherwise fall back to version tag
      const modsZipUrl = pendingModsZipUrl ?? `https://github.com/Arduinak/SpacakSMP-launcher/releases/download/v.${remoteVersion}/mods.zip`
      logger.log('Downloading mods from:', modsZipUrl)
      const buffer = await downloadBuffer(modsZipUrl, (downloaded, total) => {
        safeSend('mods-update:progress', {
          downloaded: { size: downloaded },
          total: { amount: total || downloaded }
        })
      })

      // Extract — handles both flat zip and zip with mods/ subfolder
      const tempDir = path.join(app.getPath('temp'), 'spacak-mods-tmp')
      fs.rmSync(tempDir, { recursive: true, force: true })
      await fs.promises.mkdir(tempDir, { recursive: true })

      const zip = new AdmZip(buffer)
      zip.extractAllTo(tempDir, true)

      const modsSubDir = path.join(tempDir, 'mods')
      const srcDir = fs.existsSync(modsSubDir) && fs.statSync(modsSubDir).isDirectory() ? modsSubDir : tempDir

      for (const f of fs.readdirSync(srcDir)) {
        const srcPath = path.join(srcDir, f)
        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, path.join(modsDir, f))
        }
      }

      fs.rmSync(tempDir, { recursive: true, force: true })

      saveLocalVersion(remoteVersion)
      logger.log('Mods updated to version:', remoteVersion)
      safeSend('mods-update:done', {})
      return { success: true }
    } catch (err: any) {
      logger.error('Mods update failed:', err)
      safeSend('mods-update:error', err?.message ?? String(err))
      return { success: false, error: err?.message }
    }
  })
}
