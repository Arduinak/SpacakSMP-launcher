import { ipcMain, BrowserWindow, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import logger from 'electron-log/main'

export function getProfilesDir(): string {
  const candidates = [
    path.join(app.getAppPath(), 'Profiles'),
    path.join(process.cwd(), 'Profiles'),
    path.join(app.getPath('userData'), 'Profiles')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

export function getProfileDir(dirName: string) {
  return path.join(getProfilesDir(), dirName)
}

function mavenToPath(name: string): string {
  const parts = name.split(':')
  const group = parts[0].replace(/\./g, '/')
  const artifact = parts[1]
  const version = parts[2]
  return `${group}/${artifact}/${version}/${artifact}-${version}.jar`
}

async function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'SpacakLauncher/1.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function downloadFile(url: string, dest: string): Promise<void> {
  if (fs.existsSync(dest)) return
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })

  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'SpacakLauncher/1.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const tmp = dest + '.tmp'
      const file = fs.createWriteStream(tmp)
      res.pipe(file)
      file.on('finish', () => file.close(() => { fs.renameSync(tmp, dest); resolve() }))
      file.on('error', (e) => { fs.unlink(tmp, () => {}); reject(e) })
    }).on('error', reject)
  })
}

export function registerInstallHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('install:check', async (_, dirName: string) => {
    const dir = getProfileDir(dirName)
    const profileJsonPath = path.join(dir, 'profile.json')

    let mcVersion = '1.20.1'
    let loaderVersion = '0.16.10'

    if (fs.existsSync(profileJsonPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'))
        if (p.version) mcVersion = p.version
        if (p.loaderVersion) loaderVersion = p.loaderVersion
      } catch {}
    }

    const fabricVersionId = `fabric-loader-${loaderVersion}-${mcVersion}`
    const fabricJsonPath = path.join(dir, 'versions', fabricVersionId, `${fabricVersionId}.json`)
    const installed = fs.existsSync(fabricJsonPath)

    let modsCount = 0
    let savesCount = 0
    const modsDir = path.join(dir, 'mods')
    const savesDir = path.join(dir, 'saves')
    if (fs.existsSync(modsDir)) modsCount = fs.readdirSync(modsDir).filter((f) => f.endsWith('.jar')).length
    if (fs.existsSync(savesDir)) savesCount = fs.readdirSync(savesDir).filter((f) => fs.statSync(path.join(savesDir, f)).isDirectory()).length

    return { installed, modsCount, savesCount, fabricVersionId }
  })

  ipcMain.handle('install:start', async (_, dirName: string) => {
    const dir = getProfileDir(dirName)
    const profileJsonPath = path.join(dir, 'profile.json')

    let mcVersion = '1.20.1'
    let loaderVersion = '0.16.10'

    if (fs.existsSync(profileJsonPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'))
        if (p.version) mcVersion = p.version
        if (p.loaderVersion) loaderVersion = p.loaderVersion
      } catch {}
    }

    const fabricVersionId = `fabric-loader-${loaderVersion}-${mcVersion}`

    const send = (step: string, percent: number) => {
      mainWindow.webContents.send('install:status', { step, percent })
    }

    try {
      // 1. Fabric profile JSON
      send('Sťahujem Fabric profil...', 5)
      const fabricUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
      const fabricJson = await fetchJson(fabricUrl)

      const versionsDir = path.join(dir, 'versions', fabricVersionId)
      await fs.promises.mkdir(versionsDir, { recursive: true })
      await fs.promises.writeFile(path.join(versionsDir, `${fabricVersionId}.json`), JSON.stringify(fabricJson, null, 2))

      // 2. Fabric libraries
      const libs = (fabricJson.libraries || []).filter((l: any) => l.url && l.name)
      for (let i = 0; i < libs.length; i++) {
        const lib = libs[i]
        const libPath = mavenToPath(lib.name)
        send(`Sťahujem ${lib.name.split(':')[1]}...`, 10 + Math.round((i / libs.length) * 55))
        await downloadFile(lib.url + libPath, path.join(dir, 'libraries', libPath))
      }

      // 3. Minecraft 1.20.1 version JSON
      send('Sťahujem Minecraft manifest...', 67)
      const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
      const manifest = await fetchJson(manifestUrl)
      const versionEntry = manifest.versions.find((v: any) => v.id === mcVersion)
      if (!versionEntry) throw new Error(`Verzia ${mcVersion} nenájdená`)

      const mcJson = await fetchJson(versionEntry.url)
      const mcVersionDir = path.join(dir, 'versions', mcVersion)
      await fs.promises.mkdir(mcVersionDir, { recursive: true })
      await fs.promises.writeFile(path.join(mcVersionDir, `${mcVersion}.json`), JSON.stringify(mcJson, null, 2))

      // 4. Minecraft client JAR
      send('Sťahujem Minecraft JAR...', 72)
      const clientUrl = mcJson.downloads?.client?.url
      if (clientUrl) {
        await downloadFile(clientUrl, path.join(mcVersionDir, `${mcVersion}.jar`))
      }

      // 5. Minecraft libraries
      const mcLibs = (mcJson.libraries || []).filter((l: any) => {
        if (!l.downloads?.artifact?.url) return false
        // skip OS-specific libs that don't apply to this platform
        if (l.rules) {
          const allow = l.rules.some((r: any) => r.action === 'allow' && (!r.os || r.os.name === process.platform.replace('win32', 'windows').replace('darwin', 'osx')))
          const deny = l.rules.some((r: any) => r.action === 'disallow' && r.os?.name === process.platform.replace('win32', 'windows').replace('darwin', 'osx'))
          if (!allow || deny) return false
        }
        return true
      })

      for (let i = 0; i < mcLibs.length; i++) {
        const lib = mcLibs[i]
        const artifact = lib.downloads.artifact
        send(`Sťahujem ${lib.name.split(':')[1]}...`, 75 + Math.round((i / mcLibs.length) * 22))
        await downloadFile(artifact.url, path.join(dir, 'libraries', artifact.path))
      }

      // 6. Ensure game dirs exist
      for (const d of ['mods', 'saves', 'config', 'resourcepacks', 'shaderpacks', 'screenshots']) {
        await fs.promises.mkdir(path.join(dir, d), { recursive: true })
      }

      send('Inštalácia dokončená!', 100)
      mainWindow.webContents.send('install:done', { success: true })
      return { success: true }
    } catch (err: any) {
      logger.error('Install failed:', err)
      mainWindow.webContents.send('install:done', { success: false, error: err.message })
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('install:open_folder', async (_, dirName: string) => {
    const dir = getProfileDir(dirName)
    await fs.promises.mkdir(dir, { recursive: true })
    shell.openPath(dir)
  })
}
