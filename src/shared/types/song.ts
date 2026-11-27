export interface SongItem {
  id: string
  source: 'netease' | 'bilibili'
  sourceId: string
  cid?: number
  title: string
  artist: string
  album: string
  coverUrl: string
  duration: number
  playUrl: string
  playUrlExpire: number
  mvId?: number         // 网易云 MV ID（0 或无表示无 MV）
  mvUrl?: string        // MV 播放地址（运行时获取）
  mvDuration?: number   // MV 时长（秒）
  requesterName: string
  requesterUid: number
}

export interface LyricLine {
  time: number
  text: string
  translation?: string
}