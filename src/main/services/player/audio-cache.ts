import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, unlinkSync, statSync, writeFileSync, readFileSync } from 'fs'
import { createWriteStream } from 'fs'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'
import type { IncomingMessage } from 'http'
import type { SongItem } from '../../../shared/types/song'

const MAX_CACHE_SIZE = 20
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
// 诊断日志仅在开发模式输出，生产模式静默
const isDev = !app.isPackaged

interface CacheEntry {
  songId: string
  title: string
  artist: string
  filePath: string
  coverPath: string
  mvPath: string
  size: number
  mvSize: number
  mvDuration: number
  timestamp: number
}

class AudioCacheManager {
  private cacheDir: string
  private indexFile: string
  private index = new Map<string, CacheEntry>()
  private downloading = new Set<string>()
  private mvDownloading = new Set<string>()

  constructor() {
    this.cacheDir = join(app.getPath('userData'), 'audio-cache')
    this.indexFile = join(this.cacheDir, 'index.json')
    this.init()
  }

  private init() {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }
    this.loadIndex()
    this.migrateOldMvIndex()
  }

  private loadIndex() {
    try {
      if (existsSync(this.indexFile)) {
        const raw = readFileSync(this.indexFile, 'utf-8')
        const entries: CacheEntry[] = JSON.parse(raw)
        for (const e of entries) {
          if (existsSync(e.filePath)) {
            this.index.set(e.songId, e)
          }
        }
      }
    } catch (e) {
      console.error('[AudioCache] 加载索引失败:', (e as Error).message)
    }
  }

  private migrateOldMvIndex() {
    const oldMvFile = join(this.cacheDir, 'mv-index.json')
    try {
      if (existsSync(oldMvFile)) {
        const raw = readFileSync(oldMvFile, 'utf-8')
        const entries: Array<{ songId: string; title: string; artist: string; mvPath: string; size: number; timestamp: number }> = JSON.parse(raw)
        for (const e of entries) {
          if (existsSync(e.mvPath)) {
            const existing = this.index.get(e.songId)
            if (existing) {
              existing.mvPath = e.mvPath
              existing.mvSize = e.size
              existing.timestamp = Math.max(existing.timestamp, e.timestamp)
            } else {
              this.index.set(e.songId, {
                songId: e.songId,
                title: e.title,
                artist: e.artist,
                filePath: '',
                coverPath: '',
                mvPath: e.mvPath,
                size: 0,
                mvSize: e.size,
                mvDuration: 0,
                timestamp: e.timestamp
              })
            }
          }
        }
        unlinkSync(oldMvFile)
        this.saveIndex()
        console.log('[AudioCache] 已迁移旧版MV索引到统一索引')
      }
    } catch (e) {
      console.error('[AudioCache] 迁移MV索引失败:', (e as Error).message)
    }
  }

  private saveIndex() {
    try {
      const entries = Array.from(this.index.values())
      writeFileSync(this.indexFile, JSON.stringify(entries, null, 2), 'utf-8')
    } catch (e) {
      console.error('[AudioCache] 保存索引失败:', (e as Error).message)
    }
  }

  private toFileUrl(filePath: string): string {
    if (!filePath) return ''
    const normalized = filePath.replace(/\\/g, '/')
    return `file:///${normalized}`
  }

  /** 确保条目存在（不存在则创建空条目） */
  private ensureEntry(song: SongItem): CacheEntry {
    let entry = this.index.get(song.id)
    if (!entry) {
      entry = {
        songId: song.id,
        title: song.title || '',
        artist: song.artist || '',
        filePath: '',
        coverPath: '',
        mvPath: '',
        size: 0,
        mvSize: 0,
        mvDuration: 0,
        timestamp: Date.now()
      }
      this.index.set(song.id, entry)
    }
    return entry
  }

  has(songId: string): boolean {
    const entry = this.index.get(songId)
    if (!entry) return false
    if (!existsSync(entry.filePath)) {
      entry.filePath = ''
      entry.size = 0
      return false
    }
    return true
  }

  getFileUrl(songId: string): string | null {
    const entry = this.index.get(songId)
    if (!entry || !entry.filePath || !existsSync(entry.filePath)) return null
    entry.timestamp = Date.now()
    return this.toFileUrl(entry.filePath)
  }

  getCoverUrl(songId: string): string | null {
    const entry = this.index.get(songId)
    if (!entry || !entry.coverPath || !existsSync(entry.coverPath)) return null
    return this.toFileUrl(entry.coverPath)
  }

  hasMv(songId: string): boolean {
    const entry = this.index.get(songId)
    if (!entry || !entry.mvPath) return false
    if (!existsSync(entry.mvPath)) {
      entry.mvPath = ''
      entry.mvSize = 0
      return false
    }
    return true
  }

  getMvFileUrl(songId: string): string | null {
    const entry = this.index.get(songId)
    if (!entry || !entry.mvPath || !existsSync(entry.mvPath)) return null
    entry.timestamp = Date.now()
    return this.toFileUrl(entry.mvPath)
  }

  getMvDuration(songId: string): number {
    const entry = this.index.get(songId)
    return entry?.mvDuration || 0
  }

  setMvDuration(songId: string, duration: number) {
    const entry = this.index.get(songId)
    if (entry && duration > 0) {
      entry.mvDuration = duration
      this.saveIndex()
    }
  }

  async download(song: SongItem): Promise<string | null> {
    const songId = song.id
    const url = song.playUrl
    if (!url) return null

    if (this.has(songId)) {
      return this.getFileUrl(songId)
    }

    if (this.downloading.has(songId)) {
      return null
    }
    this.downloading.add(songId)

    try {
      const ext = this.detectExt(song, url)
      const filePath = join(this.cacheDir, `${songId}${ext}`)

      try {
        await this.downloadFile(url, filePath)

        const stat = statSync(filePath)
        if (stat.size === 0) {
          try { unlinkSync(filePath) } catch {}
          return null
        }

        let coverPath = ''
        if (song.coverUrl) {
          try {
            coverPath = await this.downloadCover(songId, song.coverUrl)
          } catch (e) {
            console.warn(`[AudioCache] 封面下载失败 ${song.title}:`, (e as Error).message)
          }
        }

        const entry = this.ensureEntry(song)
        entry.filePath = filePath
        entry.coverPath = coverPath
        entry.size = stat.size
        entry.timestamp = Date.now()
        if (!entry.title) entry.title = song.title || ''
        if (!entry.artist) entry.artist = song.artist || ''

        this.evictIfNeeded()
        this.saveIndex()
        if (isDev) console.log(`[AudioCache] 缓存完成: ${song.title} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`)
        return this.getFileUrl(songId)
      } catch (e) {
        console.error(`[AudioCache] 下载失败 ${song.title}:`, (e as Error).message)
        try { if (existsSync(filePath)) unlinkSync(filePath) } catch {}
        return null
      }
    } finally {
      this.downloading.delete(songId)
    }
  }

  async downloadMv(song: SongItem, mvUrl: string): Promise<string | null> {
    const songId = song.id
    if (!mvUrl) return null

    if (this.hasMv(songId)) {
      return this.getMvFileUrl(songId)
    }

    if (this.mvDownloading.has(songId)) {
      return null
    }
    this.mvDownloading.add(songId)

    try {
      const mvPath = join(this.cacheDir, `${songId}_mv.mp4`)

      try {
        await this.downloadFile(mvUrl, mvPath)
        const stat = statSync(mvPath)
        if (stat.size === 0) {
          try { unlinkSync(mvPath) } catch {}
          return null
        }

        const entry = this.ensureEntry(song)
        entry.mvPath = mvPath
        entry.mvSize = stat.size
        entry.timestamp = Date.now()
        if (!entry.title) entry.title = song.title || ''
        if (!entry.artist) entry.artist = song.artist || ''

        this.evictIfNeeded()
        this.saveIndex()
        if (isDev) console.log(`[AudioCache] MV缓存完成: ${song.title} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`)
        return this.getMvFileUrl(songId)
      } catch (e) {
        console.error(`[AudioCache] MV下载失败 ${song.title}:`, (e as Error).message)
        try { if (existsSync(mvPath)) unlinkSync(mvPath) } catch {}
        return null
      }
    } finally {
      this.mvDownloading.delete(songId)
    }
  }

  async prefetch(songs: SongItem[]): Promise<void> {
    for (const song of songs) {
      if (this.has(song.id)) continue
      if (!song.playUrl) continue
      try {
        console.log(`[AudioCache] 预缓存: ${song.title}`)
        await this.download(song)
      } catch (e) {
        console.error(`[AudioCache] 预缓存失败: ${song.title}`, (e as Error).message)
      }
    }
  }

  private evictIfNeeded() {
    while (this.index.size > MAX_CACHE_SIZE) {
      this.evictOldest()
    }
  }

  private evictOldest() {
    let oldest: CacheEntry | null = null
    for (const entry of this.index.values()) {
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = entry
      }
    }
    if (oldest) {
      if (oldest.filePath) try { unlinkSync(oldest.filePath) } catch {}
      if (oldest.coverPath) try { unlinkSync(oldest.coverPath) } catch {}
      if (oldest.mvPath) try { unlinkSync(oldest.mvPath) } catch {}
      this.index.delete(oldest.songId)
      console.log(`[AudioCache] 淘汰: ${oldest.title}`)
    }
  }

  getCacheList(): Array<{ songId: string; title: string; artist: string; size: number; timestamp: number; hasAudio: boolean; hasMv: boolean }> {
    return Array.from(this.index.values())
      .filter(e => existsSync(e.filePath) || existsSync(e.mvPath))
      .map(e => ({
        songId: e.songId,
        title: e.title,
        artist: e.artist,
        size: e.size + e.mvSize,
        timestamp: e.timestamp,
        hasAudio: !!e.filePath && existsSync(e.filePath),
        hasMv: !!e.mvPath && existsSync(e.mvPath)
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  clearAll() {
    for (const entry of this.index.values()) {
      if (entry.filePath) try { unlinkSync(entry.filePath) } catch {}
      if (entry.coverPath) try { unlinkSync(entry.coverPath) } catch {}
      if (entry.mvPath) try { unlinkSync(entry.mvPath) } catch {}
    }
    this.index.clear()
    this.saveIndex()
    console.log('[AudioCache] 已清空所有缓存')
  }

  getCacheDir(): string {
    return this.cacheDir
  }

  get count(): number {
    return this.index.size
  }

  private async downloadCover(songId: string, coverUrl: string): Promise<string> {
    const coverPath = join(this.cacheDir, `${songId}_cover.jpg`)

    if (coverUrl.startsWith('data:image/')) {
      const base64 = coverUrl.split(',')[1]
      if (base64) {
        writeFileSync(coverPath, Buffer.from(base64, 'base64'))
        return coverPath
      }
      return ''
    }

    await this.downloadFile(coverUrl, coverPath)
    const stat = statSync(coverPath)
    if (stat.size === 0) {
      try { unlinkSync(coverPath) } catch {}
      return ''
    }
    return coverPath
  }

  private detectExt(song: SongItem, url: string): string {
    if (song.source === 'bilibili') return '.mp4'
    const m = url.match(/\.(mp3|flac|aac|wav|ogg|m4a)($|\?)/i)
    if (m) return '.' + m[1].toLowerCase()
    return '.mp3'
  }

  private downloadFile(url: string, dest: string, redirects = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const MAX_REDIRECTS = 5
      const proto = url.startsWith('https:') ? httpsGet : httpGet

      const headers: Record<string, string> = { 'User-Agent': UA }
      if (url.includes('.126.net') || url.includes('music.163.com')) {
        headers['Referer'] = 'https://music.163.com/'
      }

      const req = proto(url, {
        headers
      }, (res: IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error('重定向次数过多'))
            return
          }
          res.resume()
          this.downloadFile(res.headers.location, dest, redirects + 1)
            .then(resolve).catch(reject)
          return
        }

        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        const file = createWriteStream(dest)
        let settled = false
        res.pipe(file)
        file.on('finish', () => { file.close(); if (!settled) { settled = true; resolve() } })
        file.on('error', (err) => { file.close(); try { unlinkSync(dest) } catch {}; if (!settled) { settled = true; reject(err) } })
        res.on('error', (err) => { file.close(); try { unlinkSync(dest) } catch {}; if (!settled) { settled = true; reject(err) } })
      })

      req.on('error', reject)
      req.setTimeout(120_000, () => {
        req.destroy()
        reject(new Error('下载超时'))
      })
    })
  }
}

export const audioCache = new AudioCacheManager()