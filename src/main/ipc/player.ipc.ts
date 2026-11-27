import { BrowserWindow, ipcMain } from 'electron'
import { playlistManager } from '../services/player/playlist-manager'
import { neteaseApi } from '../services/music/netease-api'
import { bilibiliAuth } from '../services/music/bilibili-video'
import { audioCache } from '../services/player/audio-cache'
import { store } from '../services/store'
import type { SongItem } from '../../shared/types/song'

// 重入保护：防止 player:ended / player:next 被并发调用导致跳歌
let processingEnded = false
let processingNext = false

/**
 * 为歌曲获取播放 URL（不发送事件）
 */
async function fetchSongUrl(song: SongItem): Promise<boolean> {
  if (song.source === 'netease') {
    const url = await neteaseApi.getPlayUrl(song.sourceId)
    if (url) {
      song.playUrl = url
      song.playUrlExpire = Date.now() + 3600 * 1000
      return true
    }
  } else if (song.source === 'bilibili') {
    let cid = song.cid || 0
    if (cid === 0) {
      try {
        const info = await bilibiliAuth.getVideoInfo(song.sourceId)
        cid = info?.cid || 0
        if (cid > 0) song.cid = cid
      } catch (e) {
        console.error('[PlayerIPC] 获取B站视频信息失败:', (e as Error).message)
      }
    }
    if (cid > 0) {
      const result = await bilibiliAuth.getVideoPlayUrl(song.sourceId, cid)
      if (result) {
        song.playUrl = result.url
        if (result.duration > 0) song.duration = result.duration
        song.playUrlExpire = Date.now() + 3600 * 1000
        return true
      }
    }
  }
  return false
}

/**
 * 读取持久化的 MV 模式开关
 */
export function isMvModeEnabled(): boolean {
  try {
    const raw = store.get('app_mvMode')
    return raw ? JSON.parse(raw) : false
  } catch {
    return false
  }
}

/**
 * 读取 MV 模式下的音频来源：'mv'=使用 MV 自带音频（默认）, 'original'=原始高音质音频
 */
export function isMvAudioSource(): boolean {
  try {
    const raw = store.get('app_mvAudioSource')
    // 未设置时默认 'mv'（与 DEFAULT_SETTINGS 一致）
    return raw ? JSON.parse(raw) === 'mv' : true
  } catch {
    return true
  }
}

/** 判断该歌曲在当前 MV 配置下是否应跳过原始音频的获取与缓存（仅 netease + 有 mvId 才可能为 true） */
function shouldSkipOriginalAudio(song: SongItem): boolean {
  return (
    song.source === 'netease' &&
    isMvModeEnabled() &&
    isMvAudioSource() &&
    !!song.mvId && song.mvId > 0
  )
}

/**
 * 获取歌曲 MV 地址（网易云）：优先使用本地缓存
 */
export async function fetchMvUrl(song: SongItem): Promise<string> {
  if (song.source !== 'netease' || !song.mvId || song.mvId <= 0) return ''
  // 命中本地 MV 缓存：直接返回 file:// URL
  const localMv = audioCache.getMvFileUrl(song.id)
  if (localMv) return localMv
  // 远程获取
  const url = await neteaseApi.getMvUrl(song.mvId)
  return url || ''
}

/**
 * 为歌曲获取 MV 地址并执行时长校验（±5s）。
 * 若已预加载（song.mvUrl 已存在）则直接返回，避免重复请求。
 * 成功时设置 song.mvUrl / song.mvDuration，并触发后台缓存下载。
 */
export async function prepareMvForSong(song: SongItem): Promise<void> {
  if (song.source !== 'netease' || !isMvModeEnabled()) return
  // 已预加载：跳过重复获取
  if (song.mvUrl) {
    return
  }
  try {
    let mvUrl = audioCache.getMvFileUrl(song.id)
    if (!mvUrl && song.mvId && song.mvId > 0) {
      mvUrl = await fetchMvUrl(song)
    }
    if (!mvUrl) return

    const audioDuration = song.duration || 0
    let mvDuration = 0
    if (mvUrl.startsWith('file://')) {
      mvDuration = audioCache.getMvDuration(song.id) || 0
    }
    if (mvDuration <= 0 && song.mvId && song.mvId > 0) {
      mvDuration = await neteaseApi.getMvDuration(song.mvId)
      if (mvDuration > 0) {
        audioCache.setMvDuration(song.id, mvDuration)
      }
    }
    // ±5s 时长校验：差异过大则跳过 MV
    if (mvDuration > 0 && audioDuration > 0 && Math.abs(mvDuration - audioDuration) > 5) {
      console.log(`[PlayerIPC] MV 时长差过大(${Math.abs(mvDuration - audioDuration).toFixed(1)}s)，跳过: ${song.title}`)
      song.mvUrl = undefined
      song.mvDuration = undefined
      return
    }
    song.mvUrl = mvUrl
    song.mvDuration = mvDuration
    const tag = mvUrl.startsWith('file://') ? '本地缓存' : '远程'
    const durInfo = mvDuration > 0 ? `(音频:${audioDuration}s, MV:${mvDuration}s)` : ''
    console.log(`[PlayerIPC] MV 地址已获取[${tag}]: ${song.title} ${durInfo}`)
    if (!mvUrl.startsWith('file://')) {
      audioCache.downloadMv(song, mvUrl).catch(e => {
        console.error('[PlayerIPC] 当前 MV 缓存失败:', (e as Error).message)
      })
    }
  } catch (e) {
    console.error('[PlayerIPC] 获取MV地址失败:', (e as Error).message)
  }
}

/**
 * 预缓存下 N 首歌曲的播放 URL，并下载音频文件到本地缓存
 * 直接遍历队列中非空闲歌曲（有序号部分），从当前播放位置之后取
 * 若开启 MV 模式，同时预取 MV URL 并下载 MV 文件到本地缓存
 *
 * 缓存策略（按需）：
 *  - MV 模式关闭：仅下载音频，不下载 MV
 *  - MV 模式开启 + MV 音频源：跳过有 MV 的歌曲的音频下载，仅下载 MV
 *  - MV 模式开启 + 原始音频源：音频与 MV 均下载
 */
export async function prefetchNextSongs(win: BrowserWindow, count: number = 3) {
  const queue = playlistManager.getQueue()
  const currentIdx = playlistManager.getCurrentIndex()
  const idleStartIdx = playlistManager.getIdleQueueStartIndex()

  // 从 currentIndex+1 开始，只取非空闲歌曲（有序号部分），最多 count 首
  // MV 音频源模式下，有 MV 的歌曲跳过音频下载（仅下载 MV）
  const toDownload: SongItem[] = []
  for (let i = currentIdx + 1; i < idleStartIdx && toDownload.length < count; i++) {
    const song = queue[i]
    if (!song) continue
    if (audioCache.has(song.id)) continue
    if (shouldSkipOriginalAudio(song)) continue
    toDownload.push(song)
  }

  const mvMode = isMvModeEnabled()
  // MV 模式下，额外收集需要预缓存 MV 的歌曲
  const mvToDownload: SongItem[] = []
  if (mvMode) {
    for (let i = currentIdx + 1; i < idleStartIdx && mvToDownload.length < count; i++) {
      const song = queue[i]
      if (song && song.source === 'netease' && song.mvId && song.mvId > 0 && !audioCache.hasMv(song.id)) {
        mvToDownload.push(song)
      }
    }
  }

  if (toDownload.length === 0 && mvToDownload.length === 0) return

  // 音频文件下载
  for (const song of toDownload) {
    if (!song.playUrl || (song.playUrlExpire && Date.now() > song.playUrlExpire)) {
      try {
        await fetchSongUrl(song)
      } catch (e) {
        console.error('[PlayerIPC] 预缓存歌曲URL失败:', (e as Error).message)
        continue
      }
    }
    if (song.playUrl) {
      audioCache.download(song).catch(e => {
        console.error('[PlayerIPC] 预缓存下载失败:', (e as Error).message)
      })
    }
  }

  // MV 文件下载（异步，不阻塞音频下载）
  for (const song of mvToDownload) {
    try {
      const mvUrl = await fetchMvUrl(song)
      if (mvUrl) {
        song.mvUrl = mvUrl
        if (!mvUrl.startsWith('file://')) {
          audioCache.downloadMv(song, mvUrl).catch(e => {
            console.error('[PlayerIPC] 预缓存MV下载失败:', (e as Error).message)
          })
        }
      }
    } catch (e) {
      console.error('[PlayerIPC] 预缓存MV URL失败:', (e as Error).message)
    }
  }
}

/**
 * 发送播放事件（获取实际URL后发送给渲染进程）
 * 对于 B站视频：如果 URL 获取失败，会重试多次（重新请求 CID + URL）
 * 返回 true 表示成功发送播放事件，false 表示 URL 获取失败需要跳过当前歌曲
 *
 * MV 音频源模式：当 netease 歌曲有 MV 且开启 MV 模式 + MV 音频源时，
 *   跳过原始音频 URL 获取与缓存下载，由 VideoPlayer 直接播放 MV 音视频。
 *   若 MV URL 获取失败，自动回退到原始音频流程。
 */
export async function sendPlayEvent(win: BrowserWindow, song: SongItem): Promise<boolean> {
  let hasUrl = false
  let audioFromCache = false

  // MV 模式：先准备 MV（设置 song.mvUrl），MV 音频源模式下需在判定 hasUrl 前完成
  if (song.source === 'netease' && isMvModeEnabled()) {
    await prepareMvForSong(song)
  }

  // 判断是否使用 MV 自带音频替代原始音频
  const useMvAudio = shouldSkipOriginalAudio(song) && !!song.mvUrl

  if (useMvAudio) {
    // MV 音频源模式且 MV URL 可用：跳过原始音频获取
    hasUrl = true
    // 仍尝试使用本地封面（不下载音频文件）
    const localCover = audioCache.getCoverUrl(song.id)
    if (localCover) {
      song.coverUrl = localCover
    }
  } else {
    // 走原始音频流程
    // 先检查本地缓存：命中则直接用本地文件（音频 + 封面）
    const localUrl = audioCache.getFileUrl(song.id)
    if (localUrl) {
      song.playUrl = localUrl
      hasUrl = true
      audioFromCache = true
      const localCover = audioCache.getCoverUrl(song.id)
      if (localCover) {
        song.coverUrl = localCover
      }
    }

    // 再检查已有 URL（可能由 preloadFirstSong 预取，避免重复请求）
    if (!hasUrl && song.playUrl && (!song.playUrlExpire || Date.now() < song.playUrlExpire)) {
      hasUrl = true
    }

    if (!hasUrl && song.source === 'netease') {
      hasUrl = await fetchSongUrl(song)
    } else if (!hasUrl && song.source === 'bilibili') {
      // B站视频：更激进的重试策略（最多 3 次，延迟递增）
      let retries = 0
      const maxRetries = 2  // 共 3 次尝试（含首次）
      while (!hasUrl && retries <= maxRetries) {
        if (retries > 0) {
          const delay = 1500 * retries  // 1.5s, 3s
          console.warn(`[PlayerIPC] B站视频 ${song.title} 第${retries + 1}次尝试获取URL，${delay}ms后重试...`)
          await new Promise(r => setTimeout(r, delay))
          song.cid = 0
        }
        hasUrl = await fetchSongUrl(song)
        retries++
      }
      if (!hasUrl) {
        console.error(`[PlayerIPC] B站视频 "${song.title}" 经${retries}次尝试后URL依然获取失败，将跳过`)
      }
    }
  }

  // URL 获取失败：不发送播放事件
  if (!hasUrl) {
    console.error(`[PlayerIPC] ${song.source === 'bilibili' ? 'B站视频' : '网易云音乐'} "${song.title}" URL获取失败，跳过`)
    return false
  }

  // 获取歌词（netease，即使缓存命中也需要）
  if (song.source === 'netease') {
    try {
      const lyric = await neteaseApi.getLyric(song.sourceId)
      if (lyric.length > 0) {
        win.webContents.send('player:lyric-update', lyric)
      }
    } catch (e) {
      console.error('[PlayerIPC] 获取歌词失败:', (e as Error).message)
    }
  }

  // 先发送 state-changed 触发 Vue 挂载对应播放器组件
  win.webContents.send('player:state-changed', {
    currentSong: song,
    playerType: song.source === 'bilibili' ? 'video' : 'audio'
  })
  // 再发送 play-url
  win.webContents.send('player:play-url', {
    song,
    playing: true,
    playerType: song.source === 'bilibili' ? 'video' : 'audio'
  })

  // 日志：播放信息
  const srcTag = song.source === 'bilibili' ? '[B站]' : '[网易云]'
  const requester = song.requesterName ? ` ${song.requesterName} 点播` : ''
  const cacheTag = song.playUrl?.startsWith('file://') ? ' [本地缓存]' : ''
  const mvAudioTag = useMvAudio ? ' [MV音频]' : ''
  win.webContents.send('log:add', `${srcTag} 正在播放: ${song.title} - ${song.artist}${requester}${cacheTag}${mvAudioTag}`)

  // 后台下载当前播放歌曲到本地缓存
  // - MV 音频源模式：MV 已在 prepareMvForSong 中触发下载，无需再下载音频
  // - 其他情况：未命中缓存 + 有 playUrl 即下载
  if (!useMvAudio && !audioFromCache && song.playUrl) {
    audioCache.download(song).catch(e => {
      console.error('[PlayerIPC] 当前歌曲缓存失败:', (e as Error).message)
    })
  }

  // 预缓存后续歌曲 URL + 下载音频
  prefetchNextSongs(win, 3)

  return true
}

export function registerPlayerIpc(mainWindow: BrowserWindow) {
  ipcMain.handle('player:play', async (_, songId: string) => {
    const song = playlistManager.play(songId)
    if (song) {
      const ok = await sendPlayEvent(mainWindow, song)
      if (!ok) {
        // 手动点播但URL获取失败，尝试跳过到下一首
        const nextSong = playlistManager.next()
        if (nextSong) {
          await sendPlayEvent(mainWindow, nextSong)
          mainWindow.webContents.send('song:playlist-updated', playlistManager.getQueue())
        }
      }
      return { success: true }
    }
    return { success: false }
  })

  ipcMain.handle('player:pause', () => {
    mainWindow.webContents.send('player:pause')
  })

  ipcMain.handle('player:resume', async () => {
    const song = playlistManager.getCurrentSong()
    if (song && !song.playUrl) {
      // 首曲尚未获取 URL：走 sendPlayEvent 完整流程（获取 URL + 歌词 + MV）
      await sendPlayEvent(mainWindow, song)
      return
    }
    mainWindow.webContents.send('player:resume')
  })

  ipcMain.handle('player:seek', (_, time: number) => {
    mainWindow.webContents.send('player:seek', time)
  })

  ipcMain.handle('player:next', async () => {
    if (processingNext) {
      console.warn('[PlayerIPC] player:next 正在处理中，忽略重复调用')
      return
    }
    processingNext = true
    try {
      const prevSong = playlistManager.getCurrentSong()
      let song = playlistManager.next()
      if (song) {
        let ok = await sendPlayEvent(mainWindow, song)
        // B站视频：若首次失败，额外重试同一首歌再给一次机会
        if (!ok && song.source === 'bilibili') {
          ok = await sendPlayEvent(mainWindow, song)
        }
        let skipCount = 0
        while (!ok && skipCount < playlistManager.getQueue().length) {
          song = playlistManager.next()
          if (!song) break
          ok = await sendPlayEvent(mainWindow, song)
          if (!ok && song.source === 'bilibili') {
            ok = await sendPlayEvent(mainWindow, song)
          }
          skipCount++
        }
        if (ok && prevSong) {
          mainWindow.webContents.send('log:add', `"${prevSong.title}" 播放完毕，切换到: ${song!.title} - ${song!.artist}`)
        }
        mainWindow.webContents.send('song:playlist-updated', playlistManager.getQueue())
      } else {
        mainWindow.webContents.send('player:state-changed', {
          playing: false, currentSong: null
        })
      }
    } finally {
      processingNext = false
    }
  })

  ipcMain.handle('player:prev', async () => {
    const song = playlistManager.previous()
    if (song) {
      await sendPlayEvent(mainWindow, song)
    }
  })

  // 渲染进程通知播放完成
  ipcMain.on('player:ended', async () => {
    if (processingEnded) {
      console.warn('[PlayerIPC] player:ended 正在处理中，忽略重复事件')
      return
    }
    processingEnded = true
    try {
      const prevSong = playlistManager.getCurrentSong()
      let song = playlistManager.next()
      if (song) {
        let ok = await sendPlayEvent(mainWindow, song)
        // B站视频：若首次失败，额外重试同一首歌再给一次机会（不直接 skip）
        if (!ok && song.source === 'bilibili') {
          console.warn(`[PlayerIPC] B站视频 "${song.title}" sendPlayEvent 失败，额外重试同一首...`)
          ok = await sendPlayEvent(mainWindow, song)
        }
        let skipCount = 0
        while (!ok && skipCount < playlistManager.getQueue().length) {
          song = playlistManager.next()
          if (!song) break
          ok = await sendPlayEvent(mainWindow, song)
          if (!ok && song.source === 'bilibili') {
            ok = await sendPlayEvent(mainWindow, song)
          }
          skipCount++
        }
        if (ok && prevSong) {
          mainWindow.webContents.send('log:add', `"${prevSong.title}" 播放完毕，切换到: ${song!.title} - ${song!.artist}`)
        }
        mainWindow.webContents.send('song:playlist-updated', playlistManager.getQueue())
      } else {
        mainWindow.webContents.send('player:state-changed', {
          playing: false, currentSong: null
        })
      }
    } finally {
      processingEnded = false
    }
  })

  // ==================== 音视频缓存 ====================

  ipcMain.handle('audio-cache:list', () => {
    return audioCache.getCacheList()
  })

  ipcMain.handle('audio-cache:clear', () => {
    audioCache.clearAll()
    return { success: true }
  })

  /** 启动时批量预缓存队列中所有非空闲歌曲（有序号部分） */
  ipcMain.handle('audio-cache:prefetch-queue', async () => {
    const queue = playlistManager.getQueue()
    const idleStartIdx = playlistManager.getIdleQueueStartIndex()
    // MV 音频源模式下，有 MV 的歌曲跳过音频下载
    const toDownload = queue.slice(0, idleStartIdx).filter(s => {
      if (audioCache.has(s.id)) return false
      if (shouldSkipOriginalAudio(s)) return false
      return true
    })
    const mvMode = isMvModeEnabled()
    // MV 模式下，同时收集需要预缓存 MV 的歌曲（音频可能已缓存但 MV 未缓存）
    const mvToDownload = mvMode
      ? queue.slice(0, idleStartIdx).filter(s =>
          s.source === 'netease' && s.mvId && s.mvId > 0 && !audioCache.hasMv(s.id))
      : []

    if (toDownload.length === 0 && mvToDownload.length === 0) {
      return { success: true, count: 0 }
    }

    console.log(`[PlayerIPC] 启动预缓存: 音频 ${toDownload.length} 首, MV ${mvToDownload.length} 首`)

    // 音频文件下载
    for (const song of toDownload) {
      if (!song.playUrl || (song.playUrlExpire && Date.now() > song.playUrlExpire)) {
        try {
          await fetchSongUrl(song)
        } catch (e) {
          console.error(`[PlayerIPC] 启动预缓存 URL 获取失败: ${song.title}`, (e as Error).message)
          continue
        }
      }
      if (song.playUrl) {
        audioCache.download(song).catch(e => {
          console.error(`[PlayerIPC] 启动预缓存下载失败: ${song.title}`, (e as Error).message)
        })
      }
    }

    // MV 文件下载（MV 模式开启时）
    for (const song of mvToDownload) {
      try {
        const mvUrl = await fetchMvUrl(song)
        if (mvUrl) {
          song.mvUrl = mvUrl
          if (!mvUrl.startsWith('file://')) {
            audioCache.downloadMv(song, mvUrl).catch(e => {
              console.error(`[PlayerIPC] 启动预缓存 MV 下载失败: ${song.title}`, (e as Error).message)
            })
          }
        }
      } catch (e) {
        console.error(`[PlayerIPC] 启动预缓存 MV URL 失败: ${song.title}`, (e as Error).message)
      }
    }

    return { success: true, count: toDownload.length }
  })
}