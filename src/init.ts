import { setBlockingView, setUser, setView } from './state'
import { auth, background, bootstraps, maintenance, modsUpdate, skin } from './ipc'
import logger from 'electron-log/renderer'

const DEFAULT_BACKGROUND = '/src/static/images/bg.png'
const dateFormatOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = url
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })
}

export async function startUpdate() {
  const progressBar = document.getElementById('update-progress-bar')
  const progressLabel = document.getElementById('update-progress-label')
  const progressPercent = document.getElementById('update-progress-percent')

  const setIndeterminate = (active: boolean) => {
    if (!progressBar || !progressPercent) return
    if (active) {
      progressBar.classList.add('indeterminate')
      progressPercent.style.display = 'none'
    } else {
      progressBar.classList.remove('indeterminate')
      progressPercent.style.display = 'block'
    }
  }

  setIndeterminate(false)
  progressBar!.style.width = '0%'
  progressLabel!.innerText = 'Preparing update...'
  progressPercent!.innerText = '0%'
  setBlockingView('update')

  await new Promise((r) => setTimeout(r, 500))

  bootstraps.downloadProgress((value) => {
    progressLabel!.innerText = 'Downloading update...'
    const percent = ((value.downloaded.size / value.total.amount) * 100).toFixed(2)
    progressPercent!.innerText = `${percent}%`
    progressBar!.style.width = `${percent}%`
  })

  bootstraps.downloadEnd(async () => {
    setIndeterminate(true)
    progressLabel!.innerText = 'Installing...'
    await bootstraps.install()
  })

  bootstraps.error((err) => {
    logger.error('Error while downloading update:', err)
  })

  await bootstraps.download()
}

export async function startModsUpdate(remoteVersion: string) {
  const progressBar = document.getElementById('update-progress-bar')!
  const progressLabel = document.getElementById('update-progress-label')!
  const progressPercent = document.getElementById('update-progress-percent')!
  const h3 = document.querySelector('#view-update h3') as HTMLElement
  const updateText = document.getElementById('update-text')

  if (h3) h3.innerText = 'Aktualizácia modov'
  if (updateText) updateText.innerText = 'Počkaj prosím, aktualizujeme mody...'
  progressBar.style.width = '0%'
  progressLabel.innerText = 'Sťahujem mody...'
  progressPercent.innerText = '0%'
  setBlockingView('update')

  await new Promise<void>((resolve) => {
    modsUpdate.progress((value) => {
      if (value.total.amount > 0) {
        const percent = ((value.downloaded.size / value.total.amount) * 100).toFixed(1)
        progressBar.style.width = `${percent}%`
        progressPercent.innerText = `${percent}%`
      }
    })

    modsUpdate.done(() => {
      progressLabel.innerText = 'Hotovo!'
      progressBar.style.width = '100%'
      progressPercent.innerText = '100%'
      setTimeout(resolve, 800)
    })

    modsUpdate.error((err) => {
      logger.error('Mods update error:', err)
      resolve()
    })

    modsUpdate.apply(remoteVersion)
  })

  document.querySelector('#view-update')?.classList.remove('loaded')
  await new Promise((r) => setTimeout(r, 500))
}

export async function bootstrap() {
  logger.log('Initializing Launcher...')

  const bgElement = document.querySelector('.app-background') as HTMLElement
  const maintenanceDates = document.getElementById('maintenance-dates')!
  const maintenanceReason = document.getElementById('maintenance-reason')!

  const [up, modsUp, bg, mn] = await Promise.all([
    bootstraps.check(),
    modsUpdate.check(),
    background.get(),
    maintenance.get()
  ])
  const bgUrl = bg?.file?.url ?? DEFAULT_BACKGROUND

  if (up.updateAvailable) {
    await startUpdate()
    return
  }

  if (modsUp.updateAvailable && modsUp.remoteVersion) {
    await startModsUpdate(modsUp.remoteVersion)
  }

  if (mn) {
    const start = new Date(mn.startTime as Date)
    const end = new Date(mn.endTime as Date)
    maintenanceDates.innerText = `From ${start.toLocaleString([], dateFormatOptions)} to ${end.toLocaleString([], dateFormatOptions)}`
    maintenanceReason.innerText = mn.message ?? 'Please come back later.'
    setBlockingView('maintenance')
    return
  }

  try {
    const [_, session] = await Promise.all([preloadImage(bgUrl), auth.refresh()])

    if (bgElement) bgElement.style.backgroundImage = `url('${bgUrl}')`

    if (session.success) {
      const [__, skins, capes, avatar] = await Promise.all([skin.reload(session.account), skin.getSkin(), skin.getCape(), skin.getAvatar()])
      setUser(session.account, { skins, capes, avatar })
      setView('home')
    } else {
      setView('login')
    }
  } catch (err) {
    logger.error('Error while initializing launcher:', err)
    if (bgElement) bgElement.style.backgroundImage = `url('${DEFAULT_BACKGROUND}')`
    setView('login')
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 400))
    document.querySelector('div#view-loading')?.classList.add('loaded')
    await new Promise((resolve) => setTimeout(resolve, 200))
    document.body.classList.add('loaded')
  }
}
