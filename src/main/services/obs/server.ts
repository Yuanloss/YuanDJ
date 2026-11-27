// ---------- OBS 捕获 HTTP + WebSocket 服务器 ----------

import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { spawn, ChildProcess } from 'child_process'
import { join, extname } from 'path'
import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { store } from '../store'
import { getLyricPage } from './pages/lyric'
import { getQueuePage } from './pages/queue'
import { getSongInfoPage } from './pages/songinfo'
import { getStylePage } from './pages/style'
import { getHeartRatePage } from './pages/heart-rate'
import { getHeartRateStylePage } from './pages/heart-rate-style'

// ===== 类型 =====

interface ObsState {
  lyric: { text: string; translation: string }
  queue: { songs: Array<{ title: string; artist: string; requesterName?: string }>; currentIndex: number }
  songInfo: { title: string; artist: string; requester: string }
}

// ===== 运行时状态缓存 =====

const state: ObsState = {
  lyric: { text: '', translation: '' },
  queue: { songs: [], currentIndex: 0 },
  songInfo: { title: '', artist: '', requester: '' },
}

// ===== 服务器实例 =====

let server: http.Server | null = null
let wss: WebSocketServer | null = null
let currentPort = 0
const clients = new Set<WebSocket>()

// ===== 页面映射 =====

const pageMap: Record<string, string> = {
  '/lyric': 'lyric',
  '/': 'lyric',
  '/queue': 'queue',
  '/songinfo': 'songinfo',
  '/heart-rate': 'heart-rate',
}

function getPageKey(pathname: string): string {
  return pageMap[pathname] || 'lyric'
}

// ===== 页面生成 =====

function getPageHtml(page: string, port: number): string {
  switch (page) {
    case 'lyric':    return getLyricPage(port)
    case 'queue':    return getQueuePage(port)
    case 'songinfo': return getSongInfoPage(port)
    case 'style':    return getStylePage(port)
    case 'heart-rate': return getHeartRatePage(port)
    default: throw new Error('Unknown page: ' + page)
  }
}

// ===== 初始化消息 =====

function getInitMessage(pathname: string): { type: string } & Record<string, unknown> | null {
  if (pathname === '/lyric' || pathname === '/') {
    return { type: 'lyric', ...state.lyric }
  }
  if (pathname === '/queue') {
    return { type: 'queue', ...state.queue }
  }
  if (pathname === '/songinfo') {
    return { type: 'songinfo', ...state.songInfo }
  }
  return null
}

function getPageStyle(pathname: string): Record<string, unknown> | null {
  const page = pageMap[pathname]
  if (!page) return null
  const raw = store.get(`obs_${page}_style`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getAllSavedStyles(): Record<string, Record<string, unknown> | null> {
  return {
    lyric: getPageStyle('/lyric'),
    queue: getPageStyle('/queue'),
    songinfo: getPageStyle('/songinfo'),
  }
}

// ===== 端口尝试 =====

async function tryListen(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server!.listen(port, '127.0.0.1', () => {
      currentPort = port
      resolve(port)
    })
    server!.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port < 4710) {
        resolve(tryListen(port + 1))
      } else {
        reject(err)
      }
    })
  })
}

// ===== 公开接口 =====

export async function startObsServer(): Promise<number> {
  if (server) {
    console.warn('[OBS-Server] 服务器已在运行中')
    return currentPort
  }

  // 加载持久化的心率设备状态（设备 ID + 设备名），用于启动时自动重连
  loadPersistedHrState()

  const startPort = 4680

  server = http.createServer((req, res) => {
    const url = req.url || '/'
    const pathname = url.split('?')[0]

    if (pathname === '/') {
      res.writeHead(302, { Location: '/lyric' })
      res.end()
      return
    }

    // 捕获页面 + 小工具页面 + 样式页面
    const knownPages = ['/lyric', '/queue', '/songinfo', '/style', '/heart-rate', '/heart-rate-style']
    if (knownPages.includes(pathname)) {
      try {
        const pageKey = pathname.replace('/', '')
        const html = pageKey === 'heart-rate-style' ? getHeartRateStylePage(currentPort) : getPageHtml(pageKey, currentPort)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch (e) {
        console.error(`[OBS-Server] 生成页面 ${pathname} 失败:`, (e as Error).message)
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Internal Server Error')
      }
      return
    }

    // 本地字体文件路由：/fonts/<filename>
    // 用于 OBS 捕获页通过 @font-face 加载用户选择的本地字体
    if (pathname.startsWith('/fonts/')) {
      try {
        const fontName = decodeURIComponent(pathname.slice('/fonts/'.length))
        // 防止路径穿越：只允许文件名，不允许子路径
        if (fontName && !fontName.includes('/') && !fontName.includes('\\') && !fontName.includes('..')) {
          const fontPath = join(app.getPath('userData'), 'fonts', fontName)
          if (existsSync(fontPath)) {
            const ext = extname(fontName).toLowerCase().slice(1)
            const mimeMap: Record<string, string> = {
              'ttf': 'font/ttf',
              'otf': 'font/otf',
              'woff': 'font/woff',
              'woff2': 'font/woff2',
            }
            const mime = mimeMap[ext] || 'application/octet-stream'
            const data = readFileSync(fontPath)
            res.writeHead(200, {
              'Content-Type': mime,
              'Cache-Control': 'no-cache',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(data)
            return
          }
        }
      } catch (e) {
        console.error('[OBS-Server] 字体文件读取失败:', (e as Error).message)
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Font Not Found')
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
  })

  // WebSocket
  wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url || '/'

    wss!.handleUpgrade(request, socket, head, (ws) => {
      ;(ws as any)._page = pathname
      clients.add(ws)

      // 发送初始数据
      const initMsg = getInitMessage(pathname)
      if (initMsg) {
        ws.send(JSON.stringify(initMsg))
      }

      // 发送已保存的样式
      const style = getPageStyle(pathname)
      if (style) {
        ws.send(JSON.stringify({ type: 'style', page: getPageKey(pathname), ...style }))
      }

      // /style 页面：发送所有已保存样式和当前实时数据
      if (pathname === '/style') {
        const allStyles = getAllSavedStyles()
        ws.send(JSON.stringify({ type: 'style-init', styles: allStyles }))
        ws.send(JSON.stringify({
          type: 'state-data',
          lyric: state.lyric,
          queue: state.queue,
          songinfo: state.songInfo,
        }))
      }

      // 心率页面：发送当前样式设置
      if (pathname === '/heart-rate') {
        const hrStyle = getHeartRateStyle()
        if (hrStyle) {
          ws.send(JSON.stringify({ type: 'heart-rate-style', data: hrStyle }))
        }
      }

      // 心率样式设置页：发送已保存的样式
      if (pathname === '/heart-rate-style') {
        const hrStyle = getHeartRateStyle()
        if (hrStyle) {
          ws.send(JSON.stringify({ type: 'heart-rate-style-init', style: hrStyle }))
        }
      }

      ws.on('close', () => {
        clients.delete(ws)
        // 心率监测：ws 关闭时不 kill hrProcess，保持后台运行
        // 从订阅者集合中移除，下次 init 时重新订阅
        hrClients.delete(ws)
      })

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'style-update') {
            const page = msg.page
            const { type: _t, page: _p, ...config } = msg
            if (page) {
              store.set(`obs_${page}_style`, JSON.stringify(config))
            }
            // 广播样式变更给所有客户端（包括 iframe）
            broadcastObsData('style', { page, ...config })
          } else if (msg.type === 'heart-rate-style-update') {
            // 心率样式设置页发来的更新：持久化 + 广播到所有 /heart-rate 客户端
            const { type: _t, ...style } = msg
            // 逐键持久化（与 settings.ipc 一致）
            try {
              const keyMap: Record<string, string> = {
                color: 'app_heartRateColor',
                shadowColor: 'app_heartRateShadowColor',
                shadowSize: 'app_heartRateShadowSize',
                shadowOffsetY: 'app_heartRateShadowOffsetY',
                shadowOffsetX: 'app_heartRateShadowOffsetX',
                fontSize: 'app_heartRateFontSize',
                fontWeight: 'app_heartRateFontWeight',
                fontFamily: 'app_heartRateFontFamily',
                symbol: 'app_heartRateSymbol',
                symbolSize: 'app_heartRateSymbolSize',
                symbolColor: 'app_heartRateSymbolColor',
                symbolFontWeight: 'app_heartRateSymbolFontWeight',
                symbolFontFamily: 'app_heartRateSymbolFontFamily',
                gap: 'app_heartRateGap',
              }
              for (const k in style) {
                if (keyMap[k] && style[k] !== undefined) {
                  store.set(keyMap[k], JSON.stringify(style[k]))
                }
              }
            } catch (e) {
              console.error('[OBS-Server] 心率样式持久化失败:', (e as Error).message)
            }
            // 广播给所有 /heart-rate 客户端
            broadcastHeartRateStyle(style)
            // 同时回传给其他 /heart-rate-style 客户端（同步 UI）
            for (const c of clients) {
              if (c.readyState === WebSocket.OPEN) {
                try { c.send(JSON.stringify({ type: 'heart-rate-style', data: style })) } catch { /* ignore */ }
              }
            }
          } else if (msg.type === 'request-state') {
            // 向后兼容：请求当前数据
            const requestedPage = msg.page
            if (requestedPage === 'lyric' || !requestedPage) {
              ws.send(JSON.stringify({ type: 'lyric', ...state.lyric }))
            }
            if (requestedPage === 'queue' || !requestedPage) {
              ws.send(JSON.stringify({ type: 'queue', ...state.queue }))
            }
            if (requestedPage === 'songinfo' || !requestedPage) {
              ws.send(JSON.stringify({ type: 'songinfo', ...state.songInfo }))
            }
          } else if (msg.type === 'heart-rate:scan') {
            handleHeartRateScan(ws)
          } else if (msg.type === 'heart-rate:connect') {
            handleHeartRateConnect(ws, msg.deviceId)
          } else if (msg.type === 'heart-rate:init') {
            // 初始化：同步当前持久状态，可选自动启动 monitor
            handleHeartRateInit(ws, msg.deviceId)
          } else if (msg.type === 'heart-rate:disconnect') {
            handleHeartRateDisconnect(ws)
          } else if (msg.type === 'request-heart-rate-style') {
            // 心率样式设置页主动请求已保存的样式（兜底机制）
            const hrStyle = getHeartRateStyle()
            if (hrStyle) {
              ws.send(JSON.stringify({ type: 'heart-rate-style-init', style: hrStyle }))
            }
          }
        } catch {
          // 忽略解析失败
        }
      })

      ws.on('error', (err) => {
        console.error('[OBS-Server] WebSocket 错误:', err.message)
        clients.delete(ws)
      })
    })
  })

  return new Promise((resolve, reject) => {
    tryListen(startPort).then(resolve).catch(reject)
  })
}

export function stopObsServer(): void {
  // 心率监测子进程：退出时强制 kill，避免 PowerShell 进程残留
  if (hrProcess) {
    try { hrProcess.kill() } catch {}
    hrProcess = null
  }
  hrClients.clear()
  hrState.mode = 'idle'
  hrState.connected = false

  if (wss) {
    for (const client of clients) {
      client.close()
    }
    clients.clear()
    wss.close()
    wss = null
  }

  if (server) {
    server.close()
    server = null
  }

  currentPort = 0
}

export function getObsServerPort(): number {
  return currentPort
}

// ===== 心率监测工具 =====

interface HrDevice { id: string; name: string; address: string; model: string }

interface HrState {
  deviceId: string         // 当前连接的设备 ID（mac）
  deviceName: string       // 设备名
  connected: boolean       // 是否已连接
  lastHR: number           // 最近心率
  lastHRTime: number       // 最近心率时间戳（秒）
  devices: HrDevice[]      // 上次扫描到的设备列表（持久化）
  mode: 'idle' | 'scanning' | 'monitoring'  // 当前 hrProcess 工作模式
}

const hrState: HrState = {
  deviceId: '',
  deviceName: '',
  connected: false,
  lastHR: 0,
  lastHRTime: 0,
  devices: [],
  mode: 'idle'
}

let hrProcess: ChildProcess | null = null
// 多客户端订阅：设置页 + OBS 捕获页可同时订阅心率消息
const hrClients = new Set<WebSocket>()

function getHeartRateScriptPath(): string {
  // 生产模式：resources/tools/heart-rate.ps1（由 electron-builder extraResources 复制）
  if (app.isPackaged) {
    return join(process.resourcesPath, 'tools', 'heart-rate.ps1')
  }
  // 开发模式：源码目录
  const scriptPath = join(__dirname, '../../src/main/services/tools/heart-rate.ps1')
  const altPath = join(process.cwd(), 'src/main/services/tools/heart-rate.ps1')
  return existsSync(scriptPath) ? scriptPath : altPath
}

/** 心率 exe 输出目录：生产模式写到 userData（Program Files 是只读的），开发模式写到源码目录 */
function getHeartRateExeDir(): string {
  if (app.isPackaged) {
    return app.getPath('userData')
  }
  // 开发模式：传空，ps1 会回退到脚本同目录
  return ''
}

// 启动时从持久化存储加载上次的设备名
function loadPersistedHrState() {
  try {
    const savedId = store.get('app_lastHeartRateDevice')
    const savedName = store.get('app_lastHeartRateDeviceName')
    if (savedId) {
      hrState.deviceId = JSON.parse(savedId)
      // 同步加入 devices 列表，前端 init 时能拿到设备名
      if (!hrState.devices.find(d => d.id === hrState.deviceId)) {
        hrState.devices.push({
          id: hrState.deviceId,
          name: savedName ? JSON.parse(savedName) : '',
          address: hrState.deviceId,
          model: 'Xiaomi'
        })
      }
      if (savedName) {
        hrState.deviceName = JSON.parse(savedName)
      }
    }
  } catch { /* ignore */ }
}

// 转发消息给所有订阅客户端，并更新 hrState
function dispatchHrMessage(data: any) {
  // 更新持久状态
  switch (data.type) {
    case 'device':
      // 累积扫描到的设备（去重）
      if (!hrState.devices.find(d => d.id === data.id)) {
        hrState.devices.push({
          id: data.id,
          name: data.name || '',
          address: data.address || data.id,
          model: data.model || ''
        })
      }
      break
    case 'scan_complete':
      hrState.mode = 'idle'
      break
    case 'connected':
      hrState.connected = true
      hrState.deviceName = data.name || hrState.deviceName
      // 持久化设备名，程序重启后能显示
      if (hrState.deviceName) {
        store.set('app_lastHeartRateDeviceName', JSON.stringify(hrState.deviceName))
      }
      // 同步更新 devices 列表中的设备名
      const dev = hrState.devices.find(d => d.id === hrState.deviceId)
      if (dev && hrState.deviceName) dev.name = hrState.deviceName
      break
    case 'disconnected':
      hrState.connected = false
      hrState.lastHR = 0
      break
    case 'heart_rate':
      hrState.lastHR = data.hr
      hrState.lastHRTime = data.timestamp || Math.floor(Date.now() / 1000)
      break
  }
  // 广播给所有订阅者（设置页 + OBS 捕获页）
  const msg = JSON.stringify({ type: 'heart-rate-tool', data })
  for (const client of hrClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg) } catch { /* ignore */ }
    }
  }
}

// 向单个 ws 推送消息（init 时用）
function sendToClient(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'heart-rate-tool', data }))
    } catch { /* ignore */ }
  }
}

function handleHeartRateScan(ws: WebSocket) {
  // 订阅当前客户端
  hrClients.add(ws)
  // 清空设备列表，开始新一轮扫描
  hrState.devices = []
  hrState.mode = 'scanning'

  // 若已有进程在跑（扫描或监测），先 kill
  if (hrProcess) {
    try { hrProcess.kill() } catch {}
    hrProcess = null
  }

  let scanCompleteSent = false
  try {
    hrProcess = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-File', getHeartRateScriptPath(),
      '-Action', 'scan',
      '-ExeDir', getHeartRateExeDir()
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    hrProcess.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const data = JSON.parse(line.trim())
          if (data.type === 'scan_complete') scanCompleteSent = true
          dispatchHrMessage(data)
        } catch {
          // 非 JSON 输出，忽略
        }
      }
    })

    hrProcess.on('close', () => {
      if (!scanCompleteSent) {
        dispatchHrMessage({ type: 'scan_complete', count: hrState.devices.length })
      }
      hrProcess = null
      hrState.mode = 'idle'
    })

    hrProcess.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim()
      if (msg) dispatchHrMessage({ type: 'error', message: msg })
    })

    hrProcess.on('error', (err) => {
      dispatchHrMessage({ type: 'error', message: '启动 PowerShell 失败: ' + err.message })
    })
  } catch (e) {
    dispatchHrMessage({ type: 'error', message: (e as Error).message })
  }
}

function handleHeartRateConnect(ws: WebSocket, deviceId: string) {
  // 订阅当前客户端
  hrClients.add(ws)

  // 若已连接同一设备且有进程在跑，仅推送当前状态，无需重启 monitor
  if (hrProcess && hrState.mode === 'monitoring' && hrState.deviceId === deviceId) {
    sendToClient(ws, { type: 'status', message: 'reused existing monitor' })
    if (hrState.connected) {
      sendToClient(ws, { type: 'connected', deviceId, name: hrState.deviceName })
    }
    if (hrState.lastHR > 0) {
      sendToClient(ws, { type: 'heart_rate', hr: hrState.lastHR, timestamp: hrState.lastHRTime })
    }
    return
  }

  // 否则启动新的 monitor
  if (hrProcess) {
    try { hrProcess.kill() } catch {}
    hrProcess = null
  }

  hrState.deviceId = deviceId
  hrState.connected = false
  hrState.lastHR = 0
  hrState.mode = 'monitoring'
  // 持久化设备 ID
  store.set('app_lastHeartRateDevice', JSON.stringify(deviceId))

  try {
    hrProcess = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-File', getHeartRateScriptPath(),
      '-Action', 'monitor',
      '-DeviceId', deviceId,
      '-ExeDir', getHeartRateExeDir()
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    hrProcess.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const data = JSON.parse(line.trim())
          dispatchHrMessage(data)
        } catch {}
      }
    })

    hrProcess.on('close', () => {
      dispatchHrMessage({ type: 'disconnected' })
      hrProcess = null
      hrState.mode = 'idle'
    })
  } catch (e) {
    dispatchHrMessage({ type: 'error', message: (e as Error).message })
  }
}

// 处理前端 init 请求：返回当前持久状态（不重启 monitor）
function handleHeartRateInit(ws: WebSocket, requestedDeviceId?: string) {
  // 订阅当前客户端
  hrClients.add(ws)

  // 把当前已知设备列表一次性发给前端
  for (const d of hrState.devices) {
    sendToClient(ws, { type: 'device', ...d })
  }
  // 告诉前端当前连接状态
  if (hrState.deviceId && hrState.mode === 'monitoring') {
    sendToClient(ws, {
      type: 'status',
      message: hrState.connected
        ? `monitoring ${hrState.deviceId} (connected, hr=${hrState.lastHR})`
        : `monitoring ${hrState.deviceId} (waiting for broadcast)`
    })
    if (hrState.connected) {
      sendToClient(ws, { type: 'connected', deviceId: hrState.deviceId, name: hrState.deviceName })
    }
    if (hrState.lastHR > 0) {
      sendToClient(ws, { type: 'heart_rate', hr: hrState.lastHR, timestamp: hrState.lastHRTime })
    }
  } else if (requestedDeviceId) {
    // 服务端未连接但前端请求了设备 ID，自动启动 monitor
    handleHeartRateConnect(ws, requestedDeviceId)
  } else {
    // 空闲状态
    sendToClient(ws, { type: 'status', message: 'idle' })
  }
}

// 前端主动断开连接（停止 monitor 进程）
function handleHeartRateDisconnect(ws: WebSocket) {
  if (hrProcess) {
    try { hrProcess.kill() } catch {}
    hrProcess = null
  }
  hrState.mode = 'idle'
  hrState.connected = false
  hrState.lastHR = 0
  // 保留 deviceId/deviceName 以便重连
  // 广播断开给所有订阅者
  dispatchHrMessage({ type: 'disconnected' })
}

// 启动时自动连接心率设备
// 返回 Promise<boolean>：true=已连接，false=未发现设备或超时
export function autoConnectHeartRate(): Promise<boolean> {
  return new Promise((resolve) => {
    // 检查是否有上次配对的设备
    const savedId = store.get('app_lastHeartRateDevice')
    let deviceId = ''
    try {
      if (savedId) deviceId = JSON.parse(savedId)
    } catch {}
    if (!deviceId) {
      resolve(false)
      return
    }

    // 确保 OBS 服务器在运行中
    if (!server) {
      resolve(false)
      return
    }

    // 如果已经在 monitoring 同一设备，直接返回
    if (hrProcess && hrState.mode === 'monitoring' && hrState.deviceId === deviceId && hrState.connected) {
      resolve(true)
      return
    }

    // 超时保护：15 秒未连接成功则放弃
    const timeout = setTimeout(() => {
      resolve(false)
    }, 15000)

    // 监听 connected 事件
    const checkConnected = () => {
      if (hrState.connected && hrState.deviceId === deviceId) {
        clearTimeout(timeout)
        resolve(true)
      }
    }

    // 启动 monitor（通过 init 逻辑）
    // 先 kill 旧进程
    if (hrProcess) {
      try { hrProcess.kill() } catch {}
      hrProcess = null
    }
    hrState.deviceId = deviceId
    hrState.connected = false
    hrState.lastHR = 0
    hrState.mode = 'monitoring'
    store.set('app_lastHeartRateDevice', JSON.stringify(deviceId))

    try {
      hrProcess = spawn('powershell.exe', [
        '-ExecutionPolicy', 'Bypass',
        '-File', getHeartRateScriptPath(),
        '-Action', 'monitor',
        '-DeviceId', deviceId,
        '-ExeDir', getHeartRateExeDir()
      ], { stdio: ['pipe', 'pipe', 'pipe'] })

      hrProcess.stdout?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const data = JSON.parse(line.trim())
            dispatchHrMessage(data)
            checkConnected()
          } catch {}
        }
      })

      hrProcess.on('close', () => {
        dispatchHrMessage({ type: 'disconnected' })
        hrProcess = null
        hrState.mode = 'idle'
        clearTimeout(timeout)
        resolve(false)
      })
    } catch (e) {
      clearTimeout(timeout)
      resolve(false)
    }
  })
}

// 广播心率样式到所有 OBS 心率捕获页客户端
export function broadcastHeartRateStyle(style: {
  color?: string
  shadowColor?: string
  shadowSize?: number
  shadowOffsetY?: number
  shadowOffsetX?: number
  fontSize?: number
  fontWeight?: string
  fontFamily?: string
  symbol?: string
  symbolSize?: number
  symbolColor?: string
  symbolFontWeight?: string
  symbolFontFamily?: string
  gap?: number
}) {
  const msg = JSON.stringify({ type: 'heart-rate-style', data: style })
  // 广播给所有订阅者（包括 OBS 捕获页）
  for (const client of hrClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg) } catch { /* ignore */ }
    }
  }
}

/** 从 store 读取心率样式设置 */
function getHeartRateStyle(): Record<string, unknown> | null {
  const getRaw = (raw: string | undefined): unknown => {
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }
  const color = getRaw(store.get('app_heartRateColor'))
  const shadowColor = getRaw(store.get('app_heartRateShadowColor'))
  const shadowSize = getRaw(store.get('app_heartRateShadowSize'))
  const shadowOffsetY = getRaw(store.get('app_heartRateShadowOffsetY'))
  const shadowOffsetX = getRaw(store.get('app_heartRateShadowOffsetX'))
  const fontSize = getRaw(store.get('app_heartRateFontSize'))
  const fontWeight = getRaw(store.get('app_heartRateFontWeight'))
  const fontFamily = getRaw(store.get('app_heartRateFontFamily'))
  const symbol = getRaw(store.get('app_heartRateSymbol'))
  const symbolSize = getRaw(store.get('app_heartRateSymbolSize'))
  const symbolColor = getRaw(store.get('app_heartRateSymbolColor'))
  const symbolFontWeight = getRaw(store.get('app_heartRateSymbolFontWeight'))
  const symbolFontFamily = getRaw(store.get('app_heartRateSymbolFontFamily'))
  const gap = getRaw(store.get('app_heartRateGap'))
  return {
    color: typeof color === 'string' ? color : '#ff4466',
    shadowColor: typeof shadowColor === 'string' ? shadowColor : 'rgba(0,0,0,0.5)',
    shadowSize: typeof shadowSize === 'number' ? shadowSize : 4,
    shadowOffsetY: typeof shadowOffsetY === 'number' ? shadowOffsetY : 2,
    shadowOffsetX: typeof shadowOffsetX === 'number' ? shadowOffsetX : 2,
    fontSize: typeof fontSize === 'number' ? fontSize : 48,
    fontWeight: typeof fontWeight === 'string' ? fontWeight : 'bold',
    fontFamily: typeof fontFamily === 'string' ? fontFamily : '',
    symbol: typeof symbol === 'string' ? symbol : '♥',
    symbolSize: typeof symbolSize === 'number' ? symbolSize : 48,
    symbolColor: typeof symbolColor === 'string' ? symbolColor : '#ff4466',
    symbolFontWeight: typeof symbolFontWeight === 'string' ? symbolFontWeight : 'bold',
    symbolFontFamily: typeof symbolFontFamily === 'string' ? symbolFontFamily : '',
    gap: typeof gap === 'number' ? gap : 4,
  }
}

export function broadcastObsData(type: string, data: any): void {
  if (!wss) return

  // 更新运行时缓存
  switch (type) {
    case 'lyric':
      state.lyric = {
        text: data.text ?? state.lyric.text,
        translation: data.translation ?? state.lyric.translation,
      }
      break
    case 'queue':
      state.queue = {
        songs: data.songs ?? state.queue.songs,
        currentIndex: Math.max(0, data.currentIndex ?? state.queue.currentIndex),
      }
      break
    case 'songinfo':
      state.songInfo = {
        title: data.title ?? state.songInfo.title,
        artist: data.artist ?? state.songInfo.artist,
        requester: data.requester ?? state.songInfo.requester,
      }
      break
    case 'style':
      // 样式不缓存到 state，按页面分别存储到 store
      break
  }

  // 确保 type 不会被 data 中可能存在的同名属性覆盖
  const message = JSON.stringify(Object.assign({}, data, { type }))

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}