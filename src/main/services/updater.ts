import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { Readable } from 'stream'
import { store } from './store'

/**
 * 多源更新器
 *
 * 国内直连 github.com 极不稳定，electron-updater 只有一个固定地址，
 * 一旦连不上就彻底更新失败。这里改成：
 *   1. 先按顺序尝试「直连 + 多个 GitHub 加速镜像」拿 latest.yml；
 *   2. 用最快能用的那个源下载安装包（失败自动换下一个源）；
 *   3. 校验 sha512 后再安装。
 * 对界面完全透明：仍然发 updater:status 事件，UI 不用改。
 */

const OWNER = 'Yuanloss'
const REPO = 'YuanDJ'
const CHECK_TIMEOUT = 9000
const DOWNLOAD_TIMEOUT = 10 * 60 * 1000

// '' 表示直连 GitHub；其余为「前缀式」加速镜像（在完整 URL 前面加前缀）
const DEFAULT_MIRRORS = [
  '',
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://hk.gh-proxy.com/',
  'https://ghproxy.net/',
  'https://github.moeyy.xyz/'
]

interface LatestInfo {
  version: string
  fileName: string
  sha512: string
  size: number
  /** 命中的镜像前缀（'' 表示直连） */
  mirror: string
}

let mainWindow: BrowserWindow | null = null
let latestCache: LatestInfo | null = null
let downloadedFile = ''
let downloading = false

function sendStatus(status: Record<string, unknown>) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', status)
    }
  } catch {}
}

/** 镜像列表：支持在配置里用 app_updateMirror 指定自己的加速地址 */
function mirrorList(): string[] {
  let custom = ''
  try {
    const raw = store.get('app_updateMirror')
    if (raw) custom = String(JSON.parse(raw) || '')
  } catch {}
  const list = custom
    ? [custom.endsWith('/') ? custom : custom + '/', ...DEFAULT_MIRRORS]
    : [...DEFAULT_MIRRORS]
  return [...new Set(list)]
}

/** 拼出某个 release 资产的 GitHub 原始地址 */
function githubAssetUrl(fileName: string): string {
  return `https://github.com/${OWNER}/${REPO}/releases/latest/download/${encodeURIComponent(fileName)}`
}

/** 依次尝试各源，返回第一个可用的文本内容 */
async function fetchTextWithFallback(
  fileName: string
): Promise<{ text: string; mirror: string } | null> {
  for (const mirror of mirrorList()) {
    const url = `${mirror}${githubAssetUrl(fileName)}`
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(CHECK_TIMEOUT),
        headers: { 'User-Agent': `YuanDJ/${app.getVersion()} updater` }
      } as any)
      if (!res.ok) continue
      const text = await res.text()
      if (!text || !text.includes('version')) continue
      console.log(`[Updater] 命中源: ${mirror || 'direct'} (${fileName})`)
      return { text, mirror }
    } catch (e) {
      console.warn(`[Updater] 源失败 ${mirror || 'direct'}: ${(e as Error).message}`)
    }
  }
  return null
}

function parseLatestYml(yml: string, mirror: string): LatestInfo | null {
  const version = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim() || ''
  const url = /^\s*-\s*url:\s*(.+)$/m.exec(yml)?.[1]?.trim() || /^path:\s*(.+)$/m.exec(yml)?.[1]?.trim() || ''
  const sha512 = /^\s*sha512:\s*(.+)$/m.exec(yml)?.[1]?.trim() || ''
  const size = Number(/^\s*size:\s*(\d+)$/m.exec(yml)?.[1] || 0)
  if (!version || !url) return null
  return { version, fileName: url, sha512, size, mirror }
}

function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/** 拉取远端版本信息（带缓存） */
async function getLatest(): Promise<LatestInfo | null> {
  if (latestCache) return latestCache
  const hit = await fetchTextWithFallback('latest.yml')
  if (!hit) return null
  const info = parseLatestYml(hit.text, hit.mirror)
  if (info) latestCache = info
  return info
}

/** 检查更新（不发事件，返回结构化结果） */
export async function checkUpdateCore(): Promise<
  { status: 'available'; version: string } | { status: 'not-available' } | { status: 'error'; error: string }
> {
  if (!app.isPackaged) return { status: 'not-available' }
  sendStatus({ status: 'checking' })
  const info = await getLatest()
  if (!info) {
    sendStatus({ status: 'error', error: '所有更新源都无法连接（GitHub 与镜像均失败）' })
    return { status: 'error', error: '更新服务器连接失败，请检查网络后重试' }
  }
  if (compareVersion(info.version, app.getVersion()) > 0) {
    sendStatus({ status: 'available', version: info.version })
    return { status: 'available', version: info.version }
  }
  sendStatus({ status: 'not-available', version: info.version })
  return { status: 'not-available' }
}

/** 下载安装包（多源自动切换 + sha512 校验） */
export async function downloadUpdateCore(): Promise<{ success: boolean; error?: string; version?: string }> {
  if (downloading) return { success: false, error: '正在下载中' }
  if (!app.isPackaged) return { success: false, error: '开发模式不支持下载更新' }

  const info = await getLatest()
  if (!info) return { success: false, error: '无法获取更新信息' }

  const dir = join(app.getPath('userData'), 'updates')
  const target = join(dir, info.fileName)
  mkdirSync(dir, { recursive: true })

  // 已经下载过且校验通过 → 直接算完成
  if (existsSync(target) && info.size > 0 && statSync(target).size === info.size) {
    downloadedFile = target
    sendStatus({ status: 'downloaded', version: info.version })
    return { success: true, version: info.version }
  }

  const candidates = [info.mirror, ...mirrorList().filter((m) => m !== info.mirror)]
  downloading = true
  try {
    for (const mirror of candidates) {
      const url = `${mirror}${githubAssetUrl(info.fileName)}`
      const part = `${target}.part`
      try {
        console.log(`[Updater] 下载源: ${mirror || 'direct'}`)
        const res = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
          headers: { 'User-Agent': `YuanDJ/${app.getVersion()} updater` }
        } as any)
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

        const total = Number(res.headers.get('content-length')) || info.size || 0
        let received = 0
        let lastEmit = 0
        const hash = createHash('sha512')
        const ws = createWriteStream(part)
        const bodyStream = Readable.fromWeb(res.body as any)

        await new Promise<void>((resolve, reject) => {
          bodyStream.on('data', (chunk: Buffer) => {
            received += chunk.length
            hash.update(chunk)
            const now = Date.now()
            if (now - lastEmit > 200) {
              lastEmit = now
              sendStatus({
                status: 'downloading',
                percent: total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0,
                transferred: received,
                total
              })
            }
          })
          bodyStream.on('error', reject)
          ws.on('error', reject)
          ws.on('finish', () => resolve())
          bodyStream.pipe(ws)
        })

        const digest = hash.digest('base64')
        if (info.sha512 && digest !== info.sha512) {
          throw new Error('sha512 校验失败（文件可能不完整）')
        }
        if (existsSync(target)) rmSync(target, { force: true })
        renameSync(part, target)
        downloadedFile = target
        sendStatus({ status: 'downloaded', version: info.version })
        console.log('[Updater] 下载完成:', target)
        return { success: true, version: info.version }
      } catch (e) {
        console.warn(`[Updater] 源下载失败 ${mirror || 'direct'}: ${(e as Error).message}`)
        try { rmSync(`${target}.part`, { force: true }) } catch {}
      }
    }
    sendStatus({ status: 'error', error: '所有下载源均失败' })
    return { success: false, error: '所有下载源均失败，请稍后重试' }
  } finally {
    downloading = false
  }
}

/** 安装更新：启动安装包并退出程序 */
export function installUpdateCore(): boolean {
  if (!downloadedFile || !existsSync(downloadedFile)) return false
  try {
    const child = spawn(downloadedFile, [], { detached: true, stdio: 'ignore' })
    child.unref()
  } catch (e) {
    console.error('[Updater] 启动安装包失败:', (e as Error).message)
    return false
  }
  setTimeout(() => app.quit(), 300)
  return true
}

/** 从托盘等外部调用检查更新 */
export async function checkForUpdatesExternal() {
  if (!app.isPackaged) return
  await checkUpdateCore()
}

/** 托盘菜单检查更新：返回结构化结果 */
export async function checkForUpdatesFromTray(): Promise<{ available: boolean; version?: string; error?: string }> {
  const r = await checkUpdateCore()
  if (r.status === 'available') return { available: true, version: r.version }
  if (r.status === 'error') return { available: false, error: r.error }
  return { available: false }
}

/** 托盘菜单触发下载 */
export async function downloadUpdateExternal() {
  if (!app.isPackaged) return
  await downloadUpdateCore()
}

/** 初始化自动更新模块 */
export function initUpdater(window: BrowserWindow) {
  mainWindow = window

  // ====== IPC ======
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { status: 'not-available', message: '开发模式不支持更新检查' }
    }
    return await checkUpdateCore()
  })

  ipcMain.handle('updater:download', async () => {
    return await downloadUpdateCore()
  })

  ipcMain.handle('updater:install', () => installUpdateCore())

  // 仅在打包后自动检查（结果通过 updater:status 推送）
  if (!app.isPackaged) {
    console.log('[Updater] 开发模式，跳过自动更新检查')
    return
  }

  const boot = store.loadBootData()
  if (boot.autoUpdate) {
    setTimeout(() => {
      checkUpdateCore().catch((err) => console.warn('[Updater] 启动检查失败:', err?.message))
    }, 3000)
  }
}
