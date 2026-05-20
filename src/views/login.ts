import { setUser, setView } from '../state'
import { auth, skin } from '../ipc'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'

function getOrCreateOfflineUUID(username: string): string {
  const key = `spacak_uuid_${username.toLowerCase()}`
  let id = localStorage.getItem(key)
  if (!id) {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
    localStorage.setItem(key, id)
  }
  return id
}

function isValidUsername(name: string): boolean {
  return name.length >= 3 && name.length <= 16 && /^[a-zA-Z0-9_]+$/.test(name)
}

export function initLogin() {
  const msBtn = document.getElementById('btn-login-ms') as HTMLButtonElement | null
  const offlineBtn = document.getElementById('btn-login-offline') as HTMLButtonElement | null
  const offlineInput = document.getElementById('offline-username') as HTMLInputElement | null

  // ── Microsoft login ──────────────────────────────────────────────────────

  msBtn?.addEventListener('click', async () => {
    const orig = msBtn.innerHTML
    msBtn.disabled = true
    msBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Pripájam...'

    try {
      const session = await auth.login()
      if (session.success) {
        const [, skins, capes, avatar] = await Promise.all([
          skin.reload(session.account),
          skin.getSkin(),
          skin.getCape(),
          skin.getAvatar()
        ])
        setUser(session.account, { skins, capes, avatar })
        setView('home')
      } else {
        logger.error(session.error)
        await Dialog.show('Prihlásenie zlyhalo.', [{ text: 'OK', type: 'ok' }])
      }
    } catch (err) {
      logger.error(err)
      await Dialog.show('Nastala chyba pri prihlasovaní.', [{ text: 'OK', type: 'ok' }])
    } finally {
      msBtn.disabled = false
      msBtn.innerHTML = orig
    }
  })

  // ── Offline login ────────────────────────────────────────────────────────

  offlineInput?.addEventListener('input', () => {
    if (!offlineBtn) return
    offlineBtn.disabled = !isValidUsername(offlineInput.value.trim())
  })

  offlineInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && offlineBtn && !offlineBtn.disabled) offlineBtn.click()
  })

  offlineBtn?.addEventListener('click', () => {
    const username = offlineInput?.value.trim() ?? ''
    if (!isValidUsername(username)) return

    const uuid = getOrCreateOfflineUUID(username)
    const offlineAccount: any = {
      accessToken: '0',
      uuid,
      name: username,
      meta: { type: 'crack' }
    }

    setUser(offlineAccount, { skins: [], capes: [], avatar: null })
    setView('home')
  })
}
