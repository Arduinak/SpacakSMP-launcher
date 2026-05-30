import { ipcMain, BrowserWindow, app } from 'electron'
import { Client } from 'minecraft-launcher-core'
import type { Account } from 'eml-lib'
import type { IGameSettings } from './settings'
import logger from 'electron-log/main'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { getProfileDir } from './install'

// ── helpers ───────────────────────────────────────────────────────────────────

function findJava(settings: IGameSettings): string {
  if (settings.java !== 'bundled' && settings.java !== 'system') return settings.java

  const bootstrapBase = path.join(app.getPath('userData'), 'bootstrap')
  if (fs.existsSync(bootstrapBase)) {
    const exe = process.platform === 'win32' ? 'javaw.exe' : 'java'
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
  return process.platform === 'win32' ? 'javaw' : 'java'
}

async function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'SpacakLauncher/1.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return fetchJson(res.headers.location).then(resolve).catch(reject)
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
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      const tmp = dest + '.tmp'
      const file = fs.createWriteStream(tmp)
      res.pipe(file)
      file.on('finish', () => file.close(() => { fs.renameSync(tmp, dest); resolve() }))
      file.on('error', (e) => { try { fs.unlinkSync(tmp) } catch {} reject(e) })
    }).on('error', reject)
  })
}

function mavenToPath(name: string): string {
  const [group, artifact, version] = name.split(':')
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`
}

/** Downloads Fabric loader JSON + its libraries into profileDir if not already present. */
async function ensureFabric(
  profileDir: string,
  mcVersion: string,
  loaderVersion: string,
  send: (label: string) => void
): Promise<string> {
  const versionId = `fabric-loader-${loaderVersion}-${mcVersion}`
  const jsonDest = path.join(profileDir, 'versions', versionId, `${versionId}.json`)

  if (!fs.existsSync(jsonDest)) {
    send('Sťahujem Fabric loader...')
    const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
    const fabricJson = await fetchJson(url)

    await fs.promises.mkdir(path.dirname(jsonDest), { recursive: true })
    await fs.promises.writeFile(jsonDest, JSON.stringify(fabricJson, null, 2))

    const libs = (fabricJson.libraries || []).filter((l: any) => l.url && l.name)
    for (let i = 0; i < libs.length; i++) {
      const lib = libs[i]
      send(`Fabric: ${lib.name.split(':')[1]} (${i + 1}/${libs.length})`)
      await downloadFile(lib.url + mavenToPath(lib.name), path.join(profileDir, 'libraries', mavenToPath(lib.name)))
    }
  }

  return versionId
}

// ── handler ───────────────────────────────────────────────────────────────────

export function registerLauncherHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('game:launch', async (_event, payload: { account: Account; settings: IGameSettings; profile: any }) => {
    const { account, settings, profile } = payload

    if (!profile) {
      logger.error('game:launch called with null profile')
      mainWindow.webContents.send('game:launch_error', 'Žiadny profil nie je vybraný')
      mainWindow.webContents.send('game:launch_close', -1)
      return
    }

    const profileDir: string = profile.path || getProfileDir(profile.dir || profile.name)
    const mcVersion: string = profile.version || '1.20.1'
    const loaderVersion: string = profile.loaderVersion || '0.16.10'
    const loader: string = profile.loader || 'fabric'

    logger.log(`Launching: ${profile.name} — ${loader} — MC ${mcVersion}`)
    logger.log(`Dir: ${profileDir}`)

    const safeSend = (channel: string, ...args: any[]) => {
      try {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
      } catch {}
    }

    const sendProgress = (label: string) => safeSend('game:setup_label', label)

    try {
      let versionId: string

      let forgeInstallerPath: string | null = null

      if (loader === 'forge') {
        sendProgress('Kontrolujem Forge...')
        const installerFile = fs.existsSync(profileDir)
          ? fs.readdirSync(profileDir).find((f) => f.startsWith('forge-') && f.endsWith('-installer.jar'))
          : undefined
        if (!installerFile) {
          safeSend('game:launch_error', 'Forge installer JAR nenájdený. Daj forge-installer.jar do priečinka profilu.')
          safeSend('game:launch_close', -1)
          return
        }
        forgeInstallerPath = path.join(profileDir, installerFile)
      } else {
        // Auto-setup Fabric if needed (first launch only)
        sendProgress('Kontrolujem Fabric...')
        versionId = await ensureFabric(profileDir, mcVersion, loaderVersion, sendProgress)
      }

      // Ensure game subdirs exist (saves, mods, config…)
      for (const d of ['mods', 'saves', 'config', 'resourcepacks', 'shaderpacks', 'screenshots', 'logs']) {
        await fs.promises.mkdir(path.join(profileDir, d), { recursive: true })
      }

      sendProgress('Spúšťam Minecraft...')

      const launcher = new Client()
      let gameStarted = false

      launcher.on('debug', (msg: any) => logger.log('[MCLC]', msg))

      launcher.on('progress', (e: any) => {
        safeSend('game:mclc_progress', e)
      })

      launcher.on('download-status', (e: any) => {
        safeSend('game:mclc_download', e)
      })

      launcher.on('data', (msg: any) => {
        logger.log('[MC]', msg)
        safeSend('game:launch_data', msg)
        if (!gameStarted) {
          gameStarted = true
          safeSend('game:launched')
          if (settings.launcherAction === 'close') {
            setTimeout(() => { if (!mainWindow.isDestroyed()) app.quit() }, 8000)
          } else if (settings.launcherAction === 'hide') {
            setTimeout(() => { if (!mainWindow.isDestroyed()) mainWindow.minimize() }, 8000)
          }
        }
      })

      launcher.on('close', (code: any) => {
        logger.log(`Minecraft closed: ${code}`)
        safeSend('game:launch_close', code)
      })

      launcher.on('error', (err: any) => {
        logger.error('MCLC error:', err)
        safeSend('game:launch_close', -1)
        safeSend('game:launch_error', String(err))
      })

      launcher.launch({
        authorization: {
          access_token: (account as any).accessToken || '',
          client_token: account.uuid,
          uuid: account.uuid,
          name: account.name,
          user_properties: '{}',
          meta: {
            type: (account as any).meta?.type || 'msa',
            xuid: (account as any).xuid || (account as any).meta?.xuid || ''
          }
        },
        root: profileDir,
        version: {
          number: mcVersion,
          type: 'release',
          ...(loader !== 'forge' && { custom: versionId })
        },
        ...(forgeInstallerPath && { forge: forgeInstallerPath }),
        memory: {
          max: `${Math.round(settings.memory.max * 1024)}`,
          min: `${Math.round(settings.memory.min * 1024)}`
        },
        window: {
          width: settings.resolution.width,
          height: settings.resolution.height,
          fullscreen: settings.resolution.fullscreen
        },
        javaPath: findJava(settings),
        overrides: {
          gameDirectory: profileDir,
          maxSockets: 4
        }
      } as any)

    } catch (err: any) {
      logger.error('Launch failed:', err)
      mainWindow.webContents.send('game:launch_close', -1)
      mainWindow.webContents.send('game:launch_error', err.message)
    }
  })
}
