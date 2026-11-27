import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { store } from '../src/main/services/store'

// 数据目录：YuanDJ（新品牌）。
// 首次启动时**只迁移登录态**（B站/网易云的 cookie 与账号信息），
// 其余设置一律使用新版本的默认值；音频缓存、历史、歌单缓存都不迁移。
const APP_DIR_NAME = 'YuanDJ'
const userDataDir = join(app.getPath('appData'), APP_DIR_NAME)

function migrateLegacyLogin(): void {
  if (existsSync(userDataDir)) return
  const legacyDirs = [
    join(app.getPath('appData'), 'BxNcm-dj'),
    join(app.getPath('appData'), 'bx-ncm-dj')
  ]
  const legacy = legacyDirs.find((d) => existsSync(d))
  if (!legacy) return

  try {
    mkdirSync(userDataDir, { recursive: true })

    // 登录态在 store 里是无前缀键：bilibili_cookie / bilibili_uid / bilibili_uname ...
    const loginKey = /^(bilibili|netease)_(cookie|uid|uname|face)$/
    const loginSettings: Record<string, unknown> = {}
    const legacyFile = join(legacy, 'app-data.json')
    if (existsSync(legacyFile)) {
      const parsed = JSON.parse(readFileSync(legacyFile, 'utf-8'))
      const settings = (parsed && parsed.settings) || {}
      for (const [k, v] of Object.entries(settings)) {
        if (loginKey.test(k)) loginSettings[k] = v
      }
    }

    writeFileSync(
      join(userDataDir, 'app-data.json'),
      JSON.stringify(
        { settings: loginSettings, history: [], cache: [], playlistCache: [], lastRefreshTime: {} },
        null,
        2
      ),
      'utf-8'
    )
    const keys = Object.keys(loginSettings)
    console.log(
      keys.length
        ? `[Bootstrap] 已迁移登录态（${keys.join(', ')}），其余设置使用默认值`
        : '[Bootstrap] 旧数据中没有登录态，按全新配置启动'
    )
  } catch (e) {
    console.warn('[Bootstrap] 登录态迁移失败，将按全新配置启动:', (e as Error).message)
  }
}

migrateLegacyLogin()
app.setPath('userData', userDataDir)
import { stopObsServer, killStaleHeartRateProcesses } from '../src/main/services/obs'
import { destroyDanmakuWindow, registerDanmakuFixShortcutFromStore, unregisterDanmakuFixShortcut } from '../src/main/services/danmaku/danmaku-window'
import { createTray, destroyTray } from '../src/main/services/tray'
import { initUpdater } from '../src/main/services/updater'

// 修复 ffmpeg 视频解码兼容性问题（B站某些视频像素格式不受 Chromium GPU 解码支持）
// 仅禁用硬件视频解码，保留 GPU 渲染和合成（否则 video autoplay 会失败）
app.commandLine.appendSwitch('disable-accelerated-video-decode')
app.commandLine.appendSwitch('disable-accelerated-video-encode')

process.env.DIST = join(__dirname, '../dist')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : join(process.env.DIST, '../public')

let mainWindow: BrowserWindow | null = null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// 关闭流程状态：防止竞态条件导致数据丢失
let isQuitting = false
let isRelaunching = false
let skipCloseToTray = false  // 跳过收起到托盘逻辑（用于托盘"退出"菜单）
let isInLoginPhase = false  // 用户处于登录界面时，强制退出而非收起到托盘
const QUIT_TIMEOUT = 5000  // 渲染进程无响应时的超时保护

function loadWindowOptions() {
  const boot = store.loadBootData()
  const win: Electron.BrowserWindowConstructorOptions = {
    title: 'YuanDJ',
    width: 750,
    height: 500,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    // 透明窗口：让「播放区背景透明」可以把桌面透出来，其余区域由 CSS 自己铺底色
    transparent: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false  // 窗口被遮挡时继续渲染，避免视频黑屏
    }
  }

  // 恢复窗口位置
  const pos = boot.windowPosition
  if (pos) {
    if (typeof pos.x === 'number') win.x = pos.x
    if (typeof pos.y === 'number') win.y = pos.y
    if (typeof pos.width === 'number' && pos.width >= 700) win.width = pos.width
    if (typeof pos.height === 'number' && pos.height >= 500) win.height = pos.height
  }

  // 恢复置顶和可缩放
  win.alwaysOnTop = boot.alwaysOnTop
  win.resizable = boot.resizable

  return win
}

function createWindow() {
  const options = loadWindowOptions()
  const savedBounds = options.width && options.height
    ? { width: options.width, height: options.height, x: options.x, y: options.y }
    : null
  // 构造时使用默认尺寸（避免 minWidth/minHeight 约束在构造阶段与隐形边框叠加产生误差）
  // 保存的尺寸交给 createWindow 末尾的 setContentSize 精确恢复
  options.width = 750
  options.height = 500
  delete options.x
  delete options.y
  mainWindow = new BrowserWindow(options)

  // 构造完成后立即用 setContentSize 精确恢复内容区大小
  // 这能消除 Windows frameless + resizable:true 时 2px 隐形 resize 边框导致的累加误差
  // 也避免了构造参数 width/height 被 minWidth/minHeight 约束"撑大"的情况
  if (savedBounds) {
    if (typeof savedBounds.x === 'number' && typeof savedBounds.y === 'number') {
      mainWindow.setPosition(savedBounds.x, savedBounds.y, false)
    }
    mainWindow.setContentSize(savedBounds.width, savedBounds.height, false)
  }

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(process.env.DIST!, 'index.html'))
  }

  // HTML 加载完成即显示窗口（含静态 loading 界面），不再等待 ready-to-show
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.show()
  })

  // 关闭流程：
  //   1. 检查是否收起到托盘（closeToTray 设置）
  //   2. 若收起到托盘：隐藏窗口，不退出
  //   3. 若退出：preventDefault → 保存窗口位置 → 通知渲染进程保存 → 等待 → flush 并退出
  mainWindow.on('close', (e) => {
    if (isQuitting || isRelaunching) return  // 已进入退出/重启流程，允许直接关闭

    // 检查是否收起到托盘
    if (!skipCloseToTray) {
      const boot = store.loadBootData()
      if (boot.closeToTray && !isInLoginPhase) {
        e.preventDefault()
        if (boot.closeToTrayPrompt) {
          // 发送 IPC 到渲染进程显示自定义对话框
          mainWindow?.webContents.send('dialog:show-close-to-tray')
        } else {
          // 直接隐藏到托盘
          mainWindow?.hide()
        }
        return
      }
    }

    // 跳过收起到托盘的标志已使用，重置
    skipCloseToTray = false

    // 正常退出流程
    e.preventDefault()
    if (mainWindow) {
      // 修复：使用 getContentSize() 保存内容区大小，避免 Windows frameless 窗口隐形边框
      // 导致的"每次重启窗口大小累加 1~2 像素"问题
      // 同时加阈值检测：若尺寸变化在 ±2 像素内则不更新，避免 DPI 缩放误差累积
      const [x, y] = mainWindow.getPosition()
      const [w, h] = mainWindow.getContentSize()
      const rawPrev = store.get('window_position')
      let prev: { x: number; y: number; width: number; height: number } | null = null
      if (rawPrev) {
        try { prev = JSON.parse(rawPrev) } catch { /* ignore */ }
      }
      const SIZE_THRESHOLD = 2  // 尺寸变化阈值（像素）
      const POS_THRESHOLD = 2   // 位置变化阈值（像素）
      const sizeChanged = !prev
        || Math.abs(prev.width - w) > SIZE_THRESHOLD
        || Math.abs(prev.height - h) > SIZE_THRESHOLD
      const posChanged = !prev
        || Math.abs(prev.x - x) > POS_THRESHOLD
        || Math.abs(prev.y - y) > POS_THRESHOLD
      if (sizeChanged || posChanged) {
        store.set('window_position', JSON.stringify({ x, y, width: w, height: h }))
      }
      mainWindow.webContents.send('app:before-close')
    }
    // 超时保护：渲染进程崩溃或无响应时强制退出
    const quitTimer = setTimeout(() => {
      if (!isQuitting) {
        console.warn('[Main] 渲染进程未在超时前完成保存，强制退出')
        isQuitting = true
        destroyDanmakuWindow()
        store.flush()
        stopObsServer()
        app.exit(0)
      }
    }, QUIT_TIMEOUT)
    // 正常退出时清除超时定时器
    mainWindow?.once('closed', () => clearTimeout(quitTimer))
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

/** 处理渲染进程返回的关闭到托盘对话框结果 */
ipcMain.on('dialog:close-to-tray-result', (_, result: { action: string; remember: boolean }) => {
  if (result.remember) {
    store.set('app_closeToTrayPrompt', JSON.stringify(false))
  }
  if (result.action === 'tray') {
    mainWindow?.hide()
  } else {
    skipCloseToTray = true
    mainWindow?.close()
  }
})

/** 渲染进程通知登录阶段状态：登录界面时无视 closeToTray 强制退出 */
ipcMain.on('app:set-login-phase', (_event, inLogin: boolean) => {
  isInLoginPhase = inLogin
})

app.whenReady().then(() => {
  store.init()
  // 注册关闭流程监听器：渲染进程保存完成后通知主进程退出
  ipcMain.on('app:save-done', () => {
    if (!isQuitting) {
      isQuitting = true
      destroyDanmakuWindow()
      store.flush()
      stopObsServer()
      app.quit()
    }
  })

  // 任务4修复：为网易云 MV 视频 URL 添加 Referer 头
  // 网易云的 MV URL（*.vod.126.net）在浏览器/Electron 中直接加载时可能因缺少 Referer 而返回 403，
  // 导致 video 元素加载失败、呈现黑屏。
  // 通过 session.defaultSession.webRequest.onBeforeSendHeaders 拦截请求并添加 Referer。
  const { session } = require('electron')
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.vod.126.net/*', 'http://*.vod.126.net/*', 'https://*.music.126.net/*', 'http://*.music.126.net/*'] },
    (details: any, callback: (headers: Record<string, string>) => void) => {
      const headers = { ...details.requestHeaders }
      if (!headers['Referer'] && !headers['referer']) {
        headers['Referer'] = 'https://music.163.com/'
      }
      callback(headers)
    }
  )

  // 重启应用：app.relaunch() 在 dev/prod 模式下均可用，配合 app.quit() 优雅退出
  // 不直接 exit(0)，避免杀死 dev server 进程树
  ipcMain.handle('app:relaunch', () => {
    store.set('window_position', '')
    store.flush()
    isRelaunching = true
    app.relaunch()
    app.quit()
  })

  // 上次异常退出（崩溃 / 被任务管理器强杀）可能残留 heart-rate.exe，
  // 它会一直占着蓝牙链路，导致这次怎么都连不上，所以启动时先清一遍
  killStaleHeartRateProcesses()

  createWindow()

  // 创建系统托盘（传入退出回调，跳过收起到托盘逻辑）
  if (mainWindow) {
    createTray(mainWindow, () => {
      skipCloseToTray = true
      mainWindow?.close()
    })
  }

  // 初始化自动更新
  if (mainWindow) {
    initUpdater(mainWindow)
  }

  // 注册全局快捷键（固定弹幕窗口，由 danmaku-window.ts 统一管理）
  registerDanmakuFixShortcutFromStore()

  // 异步加载 IPC 模块
  import('../src/main/ipc').then(({ registerIpcHandlers }) => {
    registerIpcHandlers(mainWindow!)
  })
})

app.on('window-all-closed', () => {
  destroyDanmakuWindow()
  destroyTray()
  store.flush()
  stopObsServer()
  app.quit()
})

app.on('will-quit', () => {
  destroyDanmakuWindow()
  destroyTray()
  store.flush()
  stopObsServer()
  unregisterDanmakuFixShortcut()
})

// 部分退出路径（app.exit / 超时强退）不会走 will-quit，这里再兜一次
app.on('before-quit', () => {
  stopObsServer()
})

// 最后一道保险：进程即将结束时同步清理心率子进程（异步 taskkill 来不及执行）
process.on('exit', () => {
  try {
    spawnSync('taskkill', ['/im', 'heart-rate.exe', '/F'], { stdio: 'ignore', timeout: 2000 })
  } catch {}
})