<template>
  <audio
    ref="audioEl"
    :src="playUrl || undefined"
    @loadedmetadata="onLoaded"
    @timeupdate="onTimeUpdate"
    @ended="onEnded"
    @error="onError"
    @play="onPlay"
    @pause="onPause"
  ></audio>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useSettingsStore } from '../../stores/settings.store'
import { usePlayerStore } from '../../stores/player.store'
import { volumeToAmplitude } from '../../../shared/utils/audio'

const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const audioEl = ref<HTMLAudioElement | null>(null)
const playUrl = ref('')
// 防止已发送 ended 后重复触发：切换视频 + 浏览器重复 ended 事件 + 并发 error
let switchingToVideo = false
let endedSent = false
let fadeTimer: ReturnType<typeof setInterval> | null = null
let lastTimeUpdate = 0   // 节流 onTimeUpdate，目标 500ms 一次
let lastDuration = 0     // 去重 duration 更新

/** IPC 监听器清理函数集合（onUnmounted 时统一调用） */
let ipcCleanups: Array<() => void> = []

/** 取消正在进行的音量渐变 */
function cancelFade() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null }
}

/** 音量淡入：从 0 渐变到感知线性化的目标音量 */
function fadeIn(el: HTMLAudioElement) {
  cancelFade()
  const target = volumeToAmplitude(playerStore.volume)
  el.volume = 0
  el.muted = false
  const step = target / 15  // ~300ms at 20ms intervals
  let cur = 0
  fadeTimer = setInterval(() => {
    cur += step
    if (cur >= target) {
      el.volume = target
      cancelFade()
    } else {
      el.volume = Math.min(cur, target)
    }
  }, 20)
}

/** 音量淡出：从当前渐变到 0，然后真正暂停 */
function fadeOutAndPause(el: HTMLAudioElement) {
  cancelFade()
  const startVol = el.volume
  if (startVol <= 0.001) { el.pause(); playerStore.playing = false; return }
  const step = startVol / 10  // ~200ms
  let cur = startVol
  fadeTimer = setInterval(() => {
    cur -= step
    if (cur <= 0) {
      el.volume = 0
      el.pause()
      playerStore.playing = false
      cancelFade()
    } else {
      el.volume = Math.max(cur, 0)
    }
  }, 20)
}

// 监听音量变化（感知线性化）
watch(() => playerStore.volume, (vol) => {
  if (audioEl.value) {
    audioEl.value.volume = volumeToAmplitude(vol)
  }
})

onMounted(() => {
  ipcCleanups.push(window.electronAPI.onPlayUrl(async (data: any) => {
    if (data.playerType === 'video') {
      switchingToVideo = true
      if (audioEl.value) {
        audioEl.value.pause()
        audioEl.value.removeAttribute('src')
      }
      playUrl.value = ''
      return
    }
    // MV 音频源模式 + 当前歌曲有 mvUrl：跳过音频播放，由 VideoPlayer 提供 MV 音视频
    // 此时 song.playUrl 可能为空（未获取原始音频 URL）
    const skipAudio = settingsStore.settings.mvMode &&
      settingsStore.settings.mvAudioSource === 'mv' &&
      !!data.song?.mvUrl
    if (skipAudio) {
      switchingToVideo = false
      endedSent = false
      if (audioEl.value) {
        audioEl.value.pause()
        audioEl.value.removeAttribute('src')
      }
      playUrl.value = ''
      // 仍同步 currentSong/playing 状态以保持 UI 一致
      playerStore.currentSong = data.song || null
      playerStore.playing = data.playing
      playerStore.playerType = data.playerType
      return
    }
    switchingToVideo = false
    endedSent = false
    const url = data.song?.playUrl || ''
    playerStore.currentSong = data.song || null
    playerStore.playing = data.playing
    playerStore.playerType = data.playerType
    playerStore.currentTime = 0
    playerStore.duration = 0
    lastDuration = 0
    lastTimeUpdate = 0

    if (url) {
      playUrl.value = url
      await nextTick()
      if (data.playing && audioEl.value) {
        audioEl.value.play().catch(() => {})
      }
    }
  }))

  ipcCleanups.push(window.electronAPI.onPlayerPause(() => {
    if (playerStore.playerType !== 'audio') return
    // MV 音频源模式下 AudioPlayer 不持有音频，无需暂停操作
    if (settingsStore.settings.mvMode && settingsStore.settings.mvAudioSource === 'mv' && playerStore.currentSong?.mvUrl) return
    cancelFade()
    if (audioEl.value) fadeOutAndPause(audioEl.value)
  }))

  ipcCleanups.push(window.electronAPI.onPlayerResume(async () => {
    if (playerStore.playerType !== 'audio') return
    // MV 音频源模式下 AudioPlayer 不持有音频，由 VideoPlayer 处理播放
    if (settingsStore.settings.mvMode && settingsStore.settings.mvAudioSource === 'mv' && playerStore.currentSong?.mvUrl) return
    // 首曲场景：playUrl 可能已由 preloadFirstSong 发送的 player:play-url(playing:false) 预加载
    // 此时 playUrl 已有值，直接 play() 即可，无需等待 src 加载
    if (!playUrl.value && playerStore.currentSong?.playUrl) {
      playUrl.value = playerStore.currentSong.playUrl
      await nextTick()
    }
    if (audioEl.value) {
      audioEl.value.play().catch(() => {})
      fadeIn(audioEl.value)
    }
    playerStore.playing = true
  }))

  ipcCleanups.push(window.electronAPI.onPlayerSeek((time: number) => {
    // 只有当前是音频模式才响应 seek
    // MV 音频源模式下进度条由 VideoPlayer 控制，AudioPlayer 不响应 seek
    if (settingsStore.settings.mvMode && settingsStore.settings.mvAudioSource === 'mv' && playerStore.currentSong?.mvUrl) return
    if (playerStore.playerType === 'audio' && audioEl.value) {
      audioEl.value.currentTime = time
    }
  }))

  // 单曲循环：媒体已 ended 时 seek+resume 可能被浏览器忽略，这里直接重置并重新播放
  ipcCleanups.push(window.electronAPI.onPlayerReplay(() => {
    endedSent = false
    switchingToVideo = false
    if (playerStore.playerType !== 'audio') return
    if (settingsStore.settings.mvMode && settingsStore.settings.mvAudioSource === 'mv' && playerStore.currentSong?.mvUrl) return
    if (!audioEl.value) return
    try { audioEl.value.currentTime = 0 } catch {}
    audioEl.value.play().catch(() => {})
    fadeIn(audioEl.value)
    playerStore.playing = true
  }))
})

onUnmounted(() => {
  // 移除所有 IPC 监听器，防止累积导致重复触发
  ipcCleanups.forEach(cleanup => cleanup())
  ipcCleanups = []
  cancelFade()
  if (audioEl.value) {
    audioEl.value.pause()
    audioEl.value.removeAttribute('src')
  }
})

function onLoaded() {
  if (audioEl.value && playerStore.currentSong) {
    playerStore.duration = audioEl.value.duration
    lastDuration = audioEl.value.duration
    // 初始化音量：确保默认值真正应用到播放器（感知线性化）
    audioEl.value.volume = volumeToAmplitude(playerStore.volume)
  }
  lastTimeUpdate = 0
}

function onTimeUpdate() {
  if (!audioEl.value) return
  // 节流至每 500ms 更新一次进度条，减少 CPU 占用
  const now = performance.now()
  if (now - lastTimeUpdate < 500) return
  lastTimeUpdate = now

  playerStore.currentTime = audioEl.value.currentTime
  // 仅在 duration 变化时更新，避免重复触发响应式重算
  const dur = audioEl.value.duration
  if (dur > 0 && dur !== lastDuration) {
    lastDuration = dur
    playerStore.duration = dur
  }
}

function onEnded() {
  if (switchingToVideo || endedSent) return
  endedSent = true
  window.electronAPI.playerEnded()
}

function onError() {
  if (switchingToVideo || endedSent) return
  if (!playUrl.value) return
  endedSent = true
  window.electronAPI.playerEnded()
}

function onPlay() {
  if (audioEl.value) fadeIn(audioEl.value)
  playerStore.playing = true
}

function onPause() {
  // 忽略元素已销毁的异步 pause 事件（组件销毁/重建时 ref 已为 null）
  if (!audioEl.value) return
  // 忽略元素 src 切换引起的异步 pause（此时 media.paused === false，实际仍在播放）
  if (!audioEl.value.paused) return
  playerStore.playing = false
}
</script>