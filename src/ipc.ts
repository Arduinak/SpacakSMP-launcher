import type { IGameSettings, ISystemInfo } from '../electron/handlers/settings'
import type { IAuthResponse } from '../electron/handlers/auth'
import type {
  Account,
  BootstrapsEvents,
  CleanerEvents,
  DownloaderEvents,
  FilesManagerEvents,
  IBackground,
  IMaintenance,
  INews,
  IServerStatus,
  INewsCategory,
  JavaEvents,
  LauncherEvents,
  PatcherEvents,
  ISkin,
  ICape,
  IAvatar
} from 'eml-lib'

declare global {
  interface Window {
    api: {
      auth: {
        login: () => Promise<IAuthResponse>
        refresh: () => Promise<IAuthResponse>
        logout: () => Promise<{ success: boolean }>
      }
      install: {
        check: (dirName: string) => Promise<{ installed: boolean; modsCount: number; savesCount: number; fabricVersionId: string }>
        openFolder: (dirName: string) => Promise<void>
      }
      skin: {
        reload: (account?: Account) => Promise<void | null>
        getSkin: (account?: Account) => Promise<ISkin[] | null>
        getCape: (account?: Account) => Promise<ICape[] | null>
        getAvatar: (account?: Account) => Promise<IAvatar | null>
        updateSkin: (source: string | ArrayBuffer, model?: 'classic' | 'slim') => Promise<ISkin[] | null>
        switchCape: (id: string) => Promise<ICape[] | null>
        deleteSkin: (id: string) => Promise<ISkin[] | null>
        hideCape: () => Promise<ICape[] | null>
      }
      profiles: {
        get: () => Promise<any[]>
      }
      server: {
        getStatus: (ip: string, port?: number) => Promise<IServerStatus | null>
      }
      news: {
        getNews: () => Promise<INews[]>
        getCategories: () => Promise<INewsCategory[]>
      }
      background: {
        get: () => Promise<IBackground | null>
      }
      maintenance: {
        get: () => Promise<IMaintenance | null>
      }
      bootstraps: {
        check: () => Promise<{ updateAvailable: boolean }>
        download: () => Promise<void>
        install: () => Promise<void>
        downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) => void
        downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) => void
        error: (callback: (value: BootstrapsEvents['bootstraps_error'][0]) => void) => void
      }
      modsUpdate: {
        check: () => Promise<{ updateAvailable: boolean; remoteVersion?: string }>
        apply: (remoteVersion: string) => Promise<{ success: boolean; error?: string }>
        progress: (callback: (value: { downloaded: { size: number }; total: { amount: number } }) => void) => void
        done: (callback: () => void) => void
        error: (callback: (msg: string) => void) => void
      }
      game: {
        launch: (payload: { account: Account; settings: IGameSettings; profile: any }) => Promise<void>
        mclcProgress: (callback: (e: any) => void) => void
        mclcDownload: (callback: (e: any) => void) => void
        setupLabel: (callback: (label: string) => void) => void
        launchError: (callback: (msg: string) => void) => void
        launchComputeDownload: (callback: () => void) => void
        launchDownload: (callback: (value: LauncherEvents['launch_download'][0]) => void) => void
        downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) => void
        downloadError: (callback: (value: DownloaderEvents['download_error'][0]) => void) => void
        downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) => void
        launchInstallLoader: (callback: (value: LauncherEvents['launch_install_loader'][0]) => void) => void
        launchExtractNatives: (callback: () => void) => void
        extractProgress: (callback: (value: FilesManagerEvents['extract_progress'][0]) => void) => void
        extractEnd: (callback: (value: FilesManagerEvents['extract_end'][0]) => void) => void
        launchCopyAssets: (callback: () => void) => void
        copyProgress: (callback: (value: FilesManagerEvents['copy_progress'][0]) => void) => void
        copyEnd: (callback: (value: FilesManagerEvents['copy_end'][0]) => void) => void
        launchPatchLoader: (callback: () => void) => void
        patchProgress: (callback: (value: PatcherEvents['patch_progress'][0]) => void) => void
        patchError: (callback: (value: PatcherEvents['patch_error'][0]) => void) => void
        patchEnd: (callback: (value: PatcherEvents['patch_end'][0]) => void) => void
        launchCheckJava: (callback: () => void) => void
        javaInfo: (callback: (value: JavaEvents['java_info'][0]) => void) => void
        launchClean: (callback: () => void) => void
        cleanProgress: (callback: (value: CleanerEvents['clean_progress'][0]) => void) => void
        cleanEnd: (callback: (value: CleanerEvents['clean_end'][0]) => void) => void
        launchLaunch: (callback: (value: LauncherEvents['launch_launch'][0]) => void) => void
        launched: (callback: () => void) => void
        launchData: (callback: (value: LauncherEvents['launch_data'][0]) => void) => void
        launchClose: (callback: (value: any) => void) => void
        launchDebug: (callback: (value: LauncherEvents['launch_debug'][0]) => void) => void
        patchDebug: (callback: (value: PatcherEvents['patch_debug'][0]) => void) => void
      }
      settings: {
        get: () => Promise<IGameSettings>
        set: (s: IGameSettings) => Promise<boolean>
        pickJava: () => Promise<string | null>
      }
      system: {
        getInfo: () => Promise<ISystemInfo>
      }
    }
  }
}

export const auth = {
  login: async () => await window.api.auth.login(),
  logout: async () => await window.api.auth.logout(),
  refresh: async () => await window.api.auth.refresh()
}

export const install = {
  check: (dirName: string) => window.api.install.check(dirName),
  openFolder: (dirName: string) => window.api.install.openFolder(dirName)
}

export const skin = {
  reload: async (account?: Account) => await window.api.skin.reload(account),
  getSkin: async (account?: Account) => await window.api.skin.getSkin(account),
  getCape: async (account?: Account) => await window.api.skin.getCape(account),
  getAvatar: async (account?: Account) => await window.api.skin.getAvatar(account),
  updateSkin: async (source: string | ArrayBuffer, model: 'classic' | 'slim') => await window.api.skin.updateSkin(source, model),
  switchCape: async (id: string) => await window.api.skin.switchCape(id),
  deleteSkin: async (id: string) => await window.api.skin.deleteSkin(id),
  hideCape: async () => await window.api.skin.hideCape()
}

export const profiles = {
  get: async () => await window.api.profiles.get()
}

export const server = {
  getStatus: async (ip: string, port?: number) => await window.api.server.getStatus(ip, port)
}

export const news = {
  getNews: async () => await window.api.news.getNews(),
  getCategories: async () => await window.api.news.getCategories()
}

export const background = {
  get: async () => await window.api.background.get()
}

export const maintenance = {
  get: async () => await window.api.maintenance.get()
}

export const bootstraps = {
  check: async () => await window.api.bootstraps.check(),
  download: async () => await window.api.bootstraps.download(),
  install: async () => await window.api.bootstraps.install(),
  downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) => window.api.bootstraps.downloadProgress(callback),
  downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) => window.api.bootstraps.downloadEnd(callback),
  error: (callback: (value: BootstrapsEvents['bootstraps_error'][0]) => void) => window.api.bootstraps.error(callback)
}

export const modsUpdate = {
  check: () => window.api.modsUpdate.check(),
  apply: (remoteVersion: string) => window.api.modsUpdate.apply(remoteVersion),
  progress: (cb: (value: { downloaded: { size: number }; total: { amount: number } }) => void) =>
    window.api.modsUpdate.progress(cb),
  done: (cb: () => void) => window.api.modsUpdate.done(cb),
  error: (cb: (msg: string) => void) => window.api.modsUpdate.error(cb)
}

export const game = {
  launch: async (payload: { account: Account; settings: IGameSettings; profile: any }) => await window.api.game.launch(payload),
  mclcProgress: (cb: (e: any) => void) => window.api.game.mclcProgress(cb),
  mclcDownload: (cb: (e: any) => void) => window.api.game.mclcDownload(cb),
  setupLabel: (cb: (label: string) => void) => window.api.game.setupLabel(cb),
  launchError: (cb: (msg: string) => void) => window.api.game.launchError(cb),
  launchComputeDownload: (callback: () => void) => window.api.game.launchComputeDownload(callback),
  launchDownload: (callback: (value: LauncherEvents['launch_download'][0]) => void) => window.api.game.launchDownload(callback),
  downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) => window.api.game.downloadProgress(callback),
  downloadError: (callback: (value: DownloaderEvents['download_error'][0]) => void) => window.api.game.downloadError(callback),
  downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) => window.api.game.downloadEnd(callback),
  launchInstallLoader: (callback: (value: LauncherEvents['launch_install_loader'][0]) => void) => window.api.game.launchInstallLoader(callback),
  launchExtractNatives: (callback: () => void) => window.api.game.launchExtractNatives(callback),
  extractProgress: (callback: (value: FilesManagerEvents['extract_progress'][0]) => void) => window.api.game.extractProgress(callback),
  extractEnd: (callback: (value: FilesManagerEvents['extract_end'][0]) => void) => window.api.game.extractEnd(callback),
  launchCopyAssets: (callback: () => void) => window.api.game.launchCopyAssets(callback),
  copyProgress: (callback: (value: FilesManagerEvents['copy_progress'][0]) => void) => window.api.game.copyProgress(callback),
  copyEnd: (callback: (value: FilesManagerEvents['copy_end'][0]) => void) => window.api.game.copyEnd(callback),
  launchPatchLoader: (callback: () => void) => window.api.game.launchPatchLoader(callback),
  patchProgress: (callback: (value: PatcherEvents['patch_progress'][0]) => void) => window.api.game.patchProgress(callback),
  patchError: (callback: (value: PatcherEvents['patch_error'][0]) => void) => window.api.game.patchError(callback),
  patchEnd: (callback: (value: PatcherEvents['patch_end'][0]) => void) => window.api.game.patchEnd(callback),
  launchCheckJava: (callback: () => void) => window.api.game.launchCheckJava(callback),
  javaInfo: (callback: (value: JavaEvents['java_info'][0]) => void) => window.api.game.javaInfo(callback),
  launchClean: (callback: () => void) => window.api.game.launchClean(callback),
  cleanProgress: (callback: (value: CleanerEvents['clean_progress'][0]) => void) => window.api.game.cleanProgress(callback),
  cleanEnd: (callback: (value: CleanerEvents['clean_end'][0]) => void) => window.api.game.cleanEnd(callback),
  launchLaunch: (callback: (value: LauncherEvents['launch_launch'][0]) => void) => window.api.game.launchLaunch(callback),
  launched: (callback: () => void) => window.api.game.launched(callback),
  launchData: (callback: (value: LauncherEvents['launch_data'][0]) => void) => window.api.game.launchData(callback),
  launchClose: (callback: (value: any) => void) => window.api.game.launchClose(callback),
  launchDebug: (callback: (value: LauncherEvents['launch_debug'][0]) => void) => window.api.game.launchDebug(callback),
  patchDebug: (callback: (value: PatcherEvents['patch_debug'][0]) => void) => window.api.game.patchDebug(callback)
}

export const settings = {
  get: () => window.api.settings.get(),
  set: (s: IGameSettings) => window.api.settings.set(s),
  pickJava: () => window.api.settings.pickJava()
}

export const system = {
  getInfo: () => window.api.system.getInfo()
}
