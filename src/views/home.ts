import { setView, getUser } from '../state'
import { game, news, server, settings, profiles, install } from '../ipc'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import logger from 'electron-log/renderer'

marked.use({
  renderer: {
    link(link) {
      const href = link.href ?? '#'
      const titleAttr = link.title ? ` title="${link.title}"` : ''
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${link.text}</a>`
    }
  }
})

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })
}

const parseNews = (rawContent: string) =>
  DOMPurify.sanitize(marked.parse(rawContent) as string, { ADD_ATTR: ['target'] })

const backgroundColor = (color: string) => {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, 0.1)`
}

export function initHome() {
  // Launch area
  const playBtn = document.getElementById('btn-play')
  const settingsBtn = document.getElementById('btn-settings')
  const progressContainer = document.getElementById('launch-progress-container')
  const progressBar = document.getElementById('launch-progress-bar')
  const progressLabel = document.getElementById('launch-progress-label')
  const progressPercent = document.getElementById('launch-progress-percent')

  // Server status
  const statusDot = document.getElementById('server-status-dot')
  const statusText = document.getElementById('server-status-text')
  const playerCount = document.getElementById('player-count')

  // News
  const newsList = document.getElementById('news-list')

  // Profile selector
  const profileSelector = document.getElementById('profile-selector')
  const profileDropdown = document.getElementById('profile-dropdown')
  const currentProfileName = document.getElementById('current-profile-name')

  // Profile panel
  const panelProfileName = document.getElementById('panel-profile-name')
  const panelLoaderBadge = document.getElementById('panel-loader-badge')
  const panelModsCount = document.getElementById('panel-mods-count')
  const panelSavesCount = document.getElementById('panel-saves-count')

  let selectedProfile: any = null
  let allProfiles: any[] = []
  let gameIsRunning = false

  // ── Profile panel ──────────────────────────────────────────────────────────

  const updateProfilePanel = async (profile: any) => {
    if (!profile) return

    if (panelProfileName) panelProfileName.textContent = profile.name || 'Profile'

    if (panelLoaderBadge) {
      const loader = profile.loader === 'fabric' ? 'Fabric' : (profile.loader || 'Vanilla')
      panelLoaderBadge.innerHTML = `<i class="fa-solid fa-cube"></i> ${loader} ${profile.version || ''}`
    }

    try {
      const info = await install.check(profile.dir || profile.name)
      if (panelModsCount) panelModsCount.textContent = String(info.modsCount)
      if (panelSavesCount) panelSavesCount.textContent = String(info.savesCount)
    } catch {
      if (panelModsCount) panelModsCount.textContent = '—'
      if (panelSavesCount) panelSavesCount.textContent = '—'
    }
  }

  // ── Profiles ───────────────────────────────────────────────────────────────

  const loadProfiles = async () => {
    try {
      allProfiles = await profiles.get()
    } catch (err) {
      logger.error('Failed to load profiles:', err)
      allProfiles = []
    }
    renderDropdown()
    if (allProfiles.length > 0) {
      const defaultProfile = allProfiles.find((p) => p.isDefault) ?? allProfiles[0]
      selectProfile(defaultProfile)
    }
  }

  const renderDropdown = () => {
    if (!profileDropdown) return
    if (allProfiles.length === 0) {
      profileDropdown.innerHTML = '<div class="profile-option" style="opacity:0.5;cursor:default">Žiadne profily</div>'
      return
    }
    profileDropdown.innerHTML = allProfiles
      .map((p) => `<div class="profile-option ${selectedProfile?.id === p.id ? 'active' : ''}" data-id="${p.id}">${p.name}</div>`)
      .join('')

    profileDropdown.querySelectorAll<HTMLElement>('.profile-option[data-id]').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation()
        const profile = allProfiles.find((p) => p.id === opt.dataset.id)
        if (profile) selectProfile(profile)
        profileSelector?.classList.remove('open')
      })
    })
  }

  const selectProfile = (profile: any) => {
    selectedProfile = profile
    if (currentProfileName) currentProfileName.innerText = profile.name
    renderDropdown()
    updateProfilePanel(profile)
    if (profile.ip) updateServerStatus()
    else {
      if (statusDot) { statusDot.classList.remove('pinging', 'online', 'offline') }
      if (statusText) statusText.innerHTML = '—'
      if (playerCount) playerCount.innerHTML = ''
    }
  }

  const updateServerStatus = async () => {
    if (!selectedProfile?.ip) return
    if (statusDot) { statusDot.classList.remove('online', 'offline'); statusDot.classList.add('pinging') }
    if (statusText) statusText.innerHTML = 'Pinging...'
    if (playerCount) playerCount.innerHTML = ''

    const status = await server.getStatus(selectedProfile.ip, selectedProfile.port || 25565)
    if (status) {
      if (statusDot) { statusDot.classList.remove('pinging', 'offline'); statusDot.classList.add('online') }
      if (statusText) statusText.innerHTML = 'Online'
      if (playerCount)
        playerCount.innerHTML = `<i class="fa-fw fa-solid fa-users"></i>&nbsp;&nbsp;${status.players.online.toLocaleString()} / ${status.players.max.toLocaleString()}`
    } else {
      if (statusDot) { statusDot.classList.remove('pinging', 'online'); statusDot.classList.add('offline') }
      if (statusText) statusText.innerHTML = 'Offline'
      if (playerCount) playerCount.innerHTML = ''
    }
  }

  // ── News ───────────────────────────────────────────────────────────────────

  const loadNews = async () => {
    if (!newsList) return
    newsList.innerHTML = '<div style="text-align:center; padding: 20px; color: #888;">Načítavam novinky...</div>'
    const feed = await news.getNews()
    newsList.innerHTML = ''

    if (!feed || feed.length === 0) {
      newsList.innerHTML = '<div style="text-align:center; color: #888;">Žiadne novinky.</div>'
      return
    }

    feed.forEach((item: any) => {
      let tagsHTML = ''
      item.tags?.forEach((tag: any) => {
        tagsHTML += `<span class="tag" style="color:${tag.color};background-color:${backgroundColor(tag.color)}">${tag.name}</span>`
      })
      newsList.insertAdjacentHTML('beforeend', `
        <article class="news-article">
          <div class="article-meta">
            <div class="author">
              <img src="https://minotar.net/helm/${item.author?.username || 'steve'}/24" alt="Author" />
              <span>${item.author?.username ?? 'Admin'}</span>
            </div>
            <span class="separator">•</span>
            <span class="date">${formatDate(item.createdAt)}</span>
            ${tagsHTML ? `<span class="separator">•</span><div class="tags-container">${tagsHTML}</div>` : ''}
          </div>
          <h3>${item.title}</h3>
          ${item.image ? `<img src="${item.image}" alt="" onerror="this.style.display='none'"/>` : ''}
          <div class="article-content">${parseNews(item.content)}</div>
        </article>
      `)
    })
  }

  loadProfiles()
  loadNews()

  // ── Launch progress ────────────────────────────────────────────────────────

  const setIndeterminate = (on: boolean) => {
    if (!progressBar || !progressPercent) return
    if (on) { progressBar.classList.add('indeterminate'); progressPercent.style.display = 'none' }
    else { progressBar.classList.remove('indeterminate'); progressPercent.style.display = 'block' }
  }

  const showLaunchProgress = () => {
    if (playBtn) playBtn.style.display = 'none'
    if (progressContainer) progressContainer.classList.remove('hidden')
    if (progressBar) progressBar.style.width = '0%'
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Pripravujem...'
  }

  const hideLaunchProgress = () => {
    if (playBtn) playBtn.style.display = 'block'
    if (progressContainer) progressContainer.classList.add('hidden')
    if (progressBar) { progressBar.style.width = '0%'; progressBar.classList.remove('indeterminate') }
    if (progressPercent) { progressPercent.innerText = ''; progressPercent.style.display = 'block' }
    gameIsRunning = false
  }

  // ── Play button ────────────────────────────────────────────────────────────

  settingsBtn?.addEventListener('click', () => setView('settings'))

  playBtn?.addEventListener('click', async () => {
    if (gameIsRunning) return

    const user = getUser()
    if (!user) return

    if (!selectedProfile) {
      logger.error('No profile selected')
      if (progressContainer) progressContainer.classList.remove('hidden')
      if (progressLabel) progressLabel.innerText = 'Žiadny profil nie je vybraný!'
      if (progressBar) { progressBar.classList.remove('indeterminate'); progressBar.style.width = '0%' }
      setTimeout(() => { if (progressContainer) progressContainer.classList.add('hidden') }, 3000)
      return
    }

    gameIsRunning = true
    showLaunchProgress()

    const config = await settings.get()
    game.launch({ account: user, settings: config, profile: selectedProfile })
  })

  // ── Game events ────────────────────────────────────────────────────────────

  game.setupLabel((label) => {
    if (progressLabel) progressLabel.innerText = label
    setIndeterminate(true)
  })

  game.mclcProgress((e: any) => {
    if (!e) return
    const labels: Record<string, string> = { assets: 'Sťahujem assety...', libraries: 'Sťahujem knižnice...', natives: 'Extrahujem natives...' }
    if (progressLabel) progressLabel.innerText = labels[e.type] || `Sťahujem ${e.type}...`
    if (e.total > 0 && progressBar && progressPercent) {
      setIndeterminate(false)
      const pct = Math.round((e.task / e.total) * 100)
      progressBar.style.width = `${pct}%`
      progressPercent.innerText = `${pct}%`
    }
  })

  game.mclcDownload((e: any) => {
    if (!e) return
    if (progressLabel && e.name) progressLabel.innerText = `Sťahujem ${e.name}...`
    if (e.total > 0 && progressBar && progressPercent) {
      setIndeterminate(false)
      const pct = Math.round((e.current / e.total) * 100)
      progressBar.style.width = `${pct}%`
      progressPercent.innerText = `${pct}%`
    }
  })

  game.launched(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Hra beží...'
    updateProfilePanel(selectedProfile)
  })

  game.launchClose(() => {
    setTimeout(hideLaunchProgress, 2000)
  })

  game.launchError?.((msg) => {
    logger.error('Launch error:', msg)
    if (progressLabel) progressLabel.innerText = `Chyba: ${msg}`
    setTimeout(hideLaunchProgress, 5000)
  })

  // ── Profile selector ───────────────────────────────────────────────────────

  profileSelector?.querySelector('.selected-profile')?.addEventListener('click', (e) => {
    e.stopPropagation()
    profileSelector!.classList.toggle('open')
  })

  document.addEventListener('click', () => {
    profileSelector?.classList.remove('open')
  })
}
