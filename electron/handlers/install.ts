import { ipcMain, BrowserWindow, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { spawn } from 'node:child_process'
import logger from 'electron-log/main'

export function getProfilesDir(): string {
  const candidates = [
    path.join(path.dirname(app.getPath('exe')), 'Profiles'),
    path.join(process.resourcesPath, '..', 'Profiles'),
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

// ── Forge ─────────────────────────────────────────────────────────────────────

function findJavaForInstall(): string {
  const bootstrapBase = path.join(app.getPath('userData'), 'bootstrap')
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'
  if (fs.existsSync(bootstrapBase)) {
    try {
      for (const e1 of fs.readdirSync(bootstrapBase)) {
        const c1 = path.join(bootstrapBase, e1, 'bin', exe)
        if (fs.existsSync(c1)) return c1
        const d1 = path.join(bootstrapBase, e1)
        if (fs.statSync(d1).isDirectory()) {
          for (const e2 of fs.readdirSync(d1)) {
            const c2 = path.join(d1, e2, 'bin', exe)
            if (fs.existsSync(c2)) return c2
          }
        }
      }
    } catch {}
  }
  return 'java'
}

function findForgeVersionId(dir: string, mcVersion: string): string | null {
  const versionsDir = path.join(dir, 'versions')
  if (!fs.existsSync(versionsDir)) return null
  const entry = fs.readdirSync(versionsDir).find((e) => e.startsWith(`${mcVersion}-forge`))
  if (!entry) return null
  return fs.existsSync(path.join(versionsDir, entry, `${entry}.json`)) ? entry : null
}

async function runForgeInstaller(javaPath: string, installerJar: string, gameDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', installerJar, '--installClient', gameDir], {
      cwd: path.dirname(installerJar),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let errBuf = ''
    child.stderr?.on('data', (d: Buffer) => { errBuf += d.toString(); if (errBuf.length > 2000) errBuf = errBuf.slice(-2000) })
    child.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(`Forge installer exit ${code}: ${errBuf.slice(-400)}`))
    })
    child.on('error', (e) => reject(new Error(`Nemôžem spustiť Java: ${e.message}`)))
  })
}

async function installForge(dir: string, mcVersion: string, send: (step: string, percent: number) => void): Promise<string> {
  // Already installed?
  const existing = findForgeVersionId(dir, mcVersion)
  if (existing) {
    send('Forge je nainštalovaný!', 100)
    return existing
  }

  // Get recommended version from Forge promotions API
  send('Zisťujem verziu Forge...', 5)
  const promos = await fetchJson('https://files.minecraftforge.net/maven/net/minecraftforge/forge/promotions_slim.json')
  const forgeVer: string = promos.promos[`${mcVersion}-recommended`] ?? promos.promos[`${mcVersion}-latest`]
  if (!forgeVer) throw new Error(`Forge pre Minecraft ${mcVersion} neexistuje`)

  // Download installer JAR (cached by version)
  send('Sťahujem Forge inštalátor...', 10)
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVer}/forge-${mcVersion}-${forgeVer}-installer.jar`
  const tempDir = path.join(app.getPath('temp'), `spacak-forge-${mcVersion}-${forgeVer}`)
  await fs.promises.mkdir(tempDir, { recursive: true })
  const installerPath = path.join(tempDir, `forge-installer.jar`)
  await downloadFile(installerUrl, installerPath)

  // Run installer
  send('Inštalujem Forge — môže trvať niekoľko minút...', 35)
  const javaPath = findJavaForInstall()
  logger.log(`Running Forge installer: ${javaPath} -jar ${installerPath} --installClient ${dir}`)
  await runForgeInstaller(javaPath, installerPath, dir)

  // Find created version entry
  const created = findForgeVersionId(dir, mcVersion)
  if (!created) throw new Error('Forge bol spracovaný, ale verzia nenájdená v priečinku versions')

  // Save forge version back to profile.json
  const profileJsonPath = path.join(dir, 'profile.json')
  try {
    const p = JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'))
    p.loaderVersion = created.replace(`${mcVersion}-forge-`, '')
    fs.writeFileSync(profileJsonPath, JSON.stringify(p, null, 2))
  } catch {}

  send('Forge nainštalovaný!', 100)
  return created
}

// ── handlers ──────────────────────────────────────────────────────────────────

export function registerInstallHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('install:check', async (_, dirName: string) => {
    const dir = getProfileDir(dirName)
    const profileJsonPath = path.join(dir, 'profile.json')

    let mcVersion = '1.20.1'
    let loaderVersion = '0.16.10'
    let loader = 'fabric'

    if (fs.existsSync(profileJsonPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'))
        if (p.version) mcVersion = p.version
        if (p.loaderVersion) loaderVersion = p.loaderVersion
        if (p.loader) loader = p.loader
      } catch {}
    }

    let fabricVersionId: string
    let installed = false

    if (loader === 'forge') {
      const forgeId = findForgeVersionId(dir, mcVersion)
      fabricVersionId = forgeId ?? `${mcVersion}-forge-?`
      installed = !!forgeId
    } else {
      fabricVersionId = `fabric-loader-${loaderVersion}-${mcVersion}`
      installed = fs.existsSync(path.join(dir, 'versions', fabricVersionId, `${fabricVersionId}.json`))
    }

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
    let loader = 'fabric'

    if (fs.existsSync(profileJsonPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'))
        if (p.version) mcVersion = p.version
        if (p.loaderVersion) loaderVersion = p.loaderVersion
        if (p.loader) loader = p.loader
      } catch {}
    }

    const send = (step: string, percent: number) => {
      mainWindow.webContents.send('install:status', { step, percent })
    }

    try {
      if (loader === 'forge') {
        // ── Forge install ──────────────────────────────────────────────────────
        await installForge(dir, mcVersion, send)

        for (const d of ['mods', 'saves', 'config', 'resourcepacks', 'shaderpacks', 'screenshots']) {
          await fs.promises.mkdir(path.join(dir, d), { recursive: true })
        }

        send('Inštalácia dokončená!', 100)
        mainWindow.webContents.send('install:done', { success: true })
        return { success: true }
      }

      // ── Fabric install ─────────────────────────────────────────────────────
      const fabricVersionId = `fabric-loader-${loaderVersion}-${mcVersion}`

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

      // 3. Minecraft version JSON
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
      if (clientUrl) await downloadFile(clientUrl, path.join(mcVersionDir, `${mcVersion}.jar`))

      // 5. Minecraft libraries
      const mcLibs = (mcJson.libraries || []).filter((l: any) => {
        if (!l.downloads?.artifact?.url) return false
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

      // 6. Game directories
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
