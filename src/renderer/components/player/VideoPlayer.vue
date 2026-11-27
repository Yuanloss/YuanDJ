<template>
  <div class="video-player">
    <video
      v-if="videoUrl"
      :ref="setVideoRef"
      :src="videoUrl"
      :poster="posterUrl"
      :muted="isMuted"
      class="video-el"
      preload="auto"
      @loadedmetadata="onLoaded"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
      @error="onError"
      @play="onPlay"
      @pause="onPause"
      @canplay="onCanPlay"
    ></video>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { usePlayerStore } from '../../stores/player.store'
import { useSettingsStore } from '../../stores/settings.store'
import { volumeToAmplitude } from '../../../shared/utils/audio'

const props = defineProps<{
  mvMode?: boolean
}>()

const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const videoEl = ref<HTMLVideoElement | null>(null)
const videoUrl = ref('')
let retryTimer: ReturnType<typeof setTimeout> | null = null
let errorCount = 0
let loadAttemptId = 0
let lastEndedTime = 0
let lastTimeUpdate = 0
let lastDuration = 0
let mvVideoEnded = false

/** IPC 监听器清理函数集合（onUnmounted 时统一调用） */
let ipcCleanups: Array<() => void> = []

const posterUrl = computed(() => {
  if (!props.mvMode) return ''
  return playerStore.currentSong?.coverUrl || ''
})

/**
 * MV 音频源模式：mvMode + settings.mvAudioSource === 'mv'
 * 此模式下 VideoPlayer 取消静音、接管进度条更新、ended 事件直接跳下一首
 */
const useMvAudio = computed(() =>
  !!props.mvMode && settingsStore.settings.mvAudioSource === 'mv'
)

/** video 元素是否应静音：B站视频模式不静音；MV 模式仅在原始音频源下静音 */
const isMuted = computed(() => !!props.mvMode && !useMvAudio.value)

function setVideoRef(el: any) {
  videoEl.value = el instanceof HTMLVideoElement ? el : null
  // MV 模式且使用原始音频：video 元素创建时立即静音，防止重音
  // MV 音频源模式：保持不静音，应用用户音量
  if (el instanceof HTMLVideoElement && props.mvMode) {
    if (useMvAudio.value) {
      el.muted = false
      el.volume = volumeToAmplitude(playerStore.volume)
    } else {
      el.muted = true
      el.volume = 0
    }
  }
}

// 监听音量变化（感知线性化）
// - B站视频模式：响应音量
// - MV 音频源模式：响应音量（MV 提供音轨）
// - MV 原始音频源模式：保持静音，由 AudioPlayer 控制音量
watch(() => playerStore.volume, (vol) => {
  if (videoEl.value && (!props.mvMode || useMvAudio.value)) {
    videoEl.value.volume = volumeToAmplitude(vol)
  }
})

// MV 模式：监听 currentSong.mvUrl 变化，立即设置 videoUrl 避免闪烁
// immediate: true 处理组件挂载时 mvUrl 已存在的情况（preloadFirstSong 在组件挂载前发送 player:play-url）
watch(() => playerStore.currentSong?.mvUrl, (mvUrl) => {
  if (props.mvMode && mvUrl && settingsStore.settings.mvMode) {
    videoUrl.value = mvUrl
    // 确保视频元素创建后正确应用静音/音量
    nextTick(() => {
      if (videoEl.value) {
        if (useMvAudio.value) {
          videoEl.value.muted = false
          videoEl.value.volume = volumeToAmplitude(playerStore.volume)
        } else {
          videoEl.value.muted = true
          videoEl.value.volume = 0
        }
      }
    })
  }
}, { immediate: true })

onMounted(() => {
  if (props.mvMode) {
    // MV 模式：监听 audio 类型的 play-url（与 AudioPlayer 协同）
    ipcCleanups.push(window.electronAPI.onPlayUrl(async (data: any) => {
      if (data.playerType !== 'audio') return
      const mvUrl = data.song?.mvUrl
      if (!settingsStore.settings.mvMode || !mvUrl) {
        videoUrl.value = ''
        return
      }
      playerStore.currentSong = data.song || null
      playerStore.playing = data.playing
      playerStore.playerType = data.playerType
      playerStore.currentTime = 0
      playerStore.duration = 0
      lastDuration = 0
      lastTimeUpdate = 0
      mvVideoEnded = false
      errorCount = 0
      loadAttemptId++

      videoUrl.value = mvUrl
      await nextTick()
      if (videoEl.value) {
        if (useMvAudio.value) {
          // MV 音频源模式：不静音，应用音量
          videoEl.value.muted = false
          videoEl.value.volume = volumeToAmplitude(playerStore.volume)
        } else {
          // 原始音频源模式：静音
          videoEl.value.muted = true
          videoEl.value.volume = 0
        }
      }
      if (data.playing && videoEl.value) {
        videoEl.value.play().catch(() => {})
      }
    }))

    ipcCleanups.push(window.electronAPI.onPlayerPause(() => {
      if (playerStore.playerType !== 'audio') return
      videoEl.value?.pause()
      playerStore.playing = false
    }))

    ipcCleanups.push(window.electronAPI.onPlayerResume(async () => {
      if (playerStore.playerType !== 'audio') return
      // 首曲场景：playUrl/videoUrl 可能已由 preloadFirstSong 发送的 player:play-url(playing:false) 预加载
      // 此时 videoUrl 已有值，直接 play() 即可
      if (!videoUrl.value && playerStore.currentSong?.mvUrl) {
        videoUrl.value = playerStore.currentSong.mvUrl
        await nextTick()
      }
      // MV 模式恢复播放前应用静音/音量
      if (videoEl.value) {
        if (useMvAudio.value) {
          videoEl.value.muted = false
          videoEl.value.volume = volumeToAmplitude(playerStore.volume)
        } else {
          videoEl.value.muted = true
          videoEl.value.volume = 0
        }
      }
      if (mvVideoEnded && videoEl.value && playerStore.currentSong) {
        const mvDur = videoEl.value.duration
        const audioTime = playerStore.currentTime
        if (audioTime < mvDur - 0.5) {
          mvVideoEnded = false
          videoEl.value.currentTime = audioTime
        }
      }
      videoEl.value?.play().catch(() => {})
      playerStore.playing = true
    }))

    ipcCleanups.push(window.electronAPI.onPlayerSeek((time: number) => {
      if (playerStore.playerType === 'audio' && videoEl.value) {
        if (mvVideoEnded && videoEl.value && playerStore.currentSong) {
          const mvDur = videoEl.value.duration
          if (time < mvDur - 0.5) {
            mvVideoEnded = false
          }
        }
        videoEl.value.currentTime = time
      }
    }))
    return
  }

  // B站视频模式
  ipcCleanups.push(window.electronAPI.onPlayUrl(async (data: any) => {
    if (data.playerType !== 'video') {
      cleanupVideo()
      videoUrl.value = ''
      return
    }
    const url = data.song?.playUrl || ''
    playerStore.currentSong = data.song || null
    playerStore.playing = data.playing
    playerStore.playerType = data.playerType
    // 重置进度条，避免显示上一首歌的时间
    playerStore.currentTime = 0
    playerStore.duration = 0
    lastDuration = 0
    lastTimeUpdate = 0
    errorCount = 0
    loadAttemptId++

    if (url) {
      videoUrl.value = url
      await nextTick()
      if (data.playing && videoEl.value) {
        videoEl.value.play().catch(() => {})
      }
    } else {
      videoUrl.value = ''
    }
  }))

  ipcCleanups.push(window.electronAPI.onPlayerPause(() => {
    if (playerStore.playerType !== 'video') return
    videoEl.value?.pause()
    playerStore.playing = false
  }))

  ipcCleanups.push(window.electronAPI.onPlayerResume(async () => {
    if (playerStore.playerType !== 'video') return
    if (!videoUrl.value && playerStore.currentSong?.playUrl) {
      videoUrl.value = playerStore.currentSong.playUrl
      await nextTick()
    }
    videoEl.value?.play().catch(() => {})
    playerStore.playing = true
  }))

  ipcCleanups.push(window.electronAPI.onPlayerSeek((time: number) => {
    if (playerStore.playerType === 'video' && videoEl.value) {
      videoEl.value.currentTime = time
    }
  }))
})

onUnmounted(() => {
  // 移除所有 IPC 监听器，防止累积导致重复触发
  ipcCleanups.forEach(cleanup => cleanup())
  ipcCleanups = []
  cleanupVideo()
})

function cleanupVideo() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.removeAttribute('src')
    videoEl.value.load()
  }
}

function onLoaded() {
  if (videoEl.value && playerStore.currentSong) {
    if (!props.mvMode) {
      // B站视频模式：video 提供音频和进度
      playerStore.duration = videoEl.value.duration
      lastDuration = videoEl.value.duration
      videoEl.value.volume = volumeToAmplitude(playerStore.volume)
    } else if (useMvAudio.value) {
      // MV 音频源模式：video 提供音频和进度
      playerStore.duration = videoEl.value.duration
      lastDuration = videoEl.value.duration
      videoEl.value.muted = false
      videoEl.value.volume = volumeToAmplitude(playerStore.volume)
    } else {
      // MV 原始音频源模式：video 静音，进度由 AudioPlayer 控制
      videoEl.value.muted = true
      videoEl.value.volume = 0
    }
  }
  errorCount = 0
  lastTimeUpdate = 0
}

function onCanPlay() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  errorCount = 0
}

function onTimeUpdate() {
  if (!videoEl.value) return
  // 节流至 ~30fps（33ms），减少 Vue 响应式更新频率
  const now = performance.now()
  if (now - lastTimeUpdate < 33) return
  lastTimeUpdate = now

  // MV 模式 + 原始音频源：进度条由 AudioPlayer 控制，VideoPlayer 不更新 currentTime
  // MV 模式 + MV 音频源：进度条由 VideoPlayer 控制
  // B站视频模式：进度条由 VideoPlayer 控制
  if (props.mvMode && !useMvAudio.value) return

  playerStore.currentTime = videoEl.value.currentTime
  const dur = videoEl.value.duration
  if (dur > 0 && dur !== lastDuration) {
    lastDuration = dur
    playerStore.duration = dur
  }
}

function onEnded() {
  const now = Date.now()
  if (now - lastEndedTime < 2000) return
  lastEndedTime = now

  // MV 模式处理
  if (props.mvMode) {
    if (useMvAudio.value) {
      // MV 音频源模式：MV 结束即歌曲结束，触发跳下一首
      window.electronAPI.playerEnded()
      return
    }
    // 原始音频源模式：视频可能比音频短，暂停保留最后一帧等音频结束
    if (mvVideoEnded) return
    mvVideoEnded = true
    if (videoEl.value) {
      videoEl.value.pause()
    }
    return
  }
  // B站视频模式
  window.electronAPI.playerEnded()
}

function onError() {
  if (!videoUrl.value) return

  errorCount++
  const currentAttempt = loadAttemptId

  if (retryTimer) clearTimeout(retryTimer)

  if (errorCount <= 2) {
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (currentAttempt !== loadAttemptId) return
      if (videoEl.value && videoEl.value.readyState >= 2) {
        videoEl.value.play().catch(() => {
          if (videoEl.value && videoEl.value.src) {
            const src = videoEl.value.src
            videoEl.value.src = ''
            videoEl.value.load()
            setTimeout(() => { if (videoEl.value) videoEl.value.src = src }, 200)
          }
        })
        return
      }
      if (videoEl.value && videoEl.value.src) {
        const src = videoEl.value.src
        videoEl.value.src = ''
        videoEl.value.load()
        setTimeout(() => {
          if (videoEl.value && currentAttempt === loadAttemptId) {
            videoEl.value.src = src
          }
        }, 300)
      }
    }, 3000)
    return
  }

  retryTimer = setTimeout(() => {
    retryTimer = null
    if (currentAttempt !== loadAttemptId) return

    if (videoEl.value && videoEl.value.readyState >= 2) {
      videoEl.value.play().catch(() => {
        window.electronAPI.playerEnded()
      })
      return
    }
    window.electronAPI.playerEnded()
  }, 8000)
}

function onPlay() {
  playerStore.playing = true
  errorCount = 0
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
}

function onPause() {
  if (!videoEl.value) return
  if (!videoEl.value.paused) return
  playerStore.playing = false
}
</script>

<style scoped>
.video-player {
  height: 100%; display: flex; align-items: center; justify-content: center;
  background: #000000;
}
.video-el {
  width: 100%; height: 100%; object-fit: contain;
}
</style>
