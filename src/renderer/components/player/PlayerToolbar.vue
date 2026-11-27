<template>
  <div class="player-toolbar">
    <button
      class="pt-btn"
      :class="{ active: settingsStore.settings.playerTransparent }"
      :title="settingsStore.settings.playerTransparent ? '关闭播放区背景透明' : '开启播放区背景透明'"
      @click="toggleTransparent"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
      </svg>
    </button>
    <button
      class="pt-btn"
      :class="{ active: playerStore.pinTop }"
      :title="playerStore.pinTop ? '取消置顶' : '仅置顶视频/歌词（自动进入精简模式）'"
      @click="togglePin"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
      </svg>
    </button>
    <button
      class="pt-btn"
      :class="{ active: playerStore.focusMode }"
      :title="playerStore.focusMode ? '恢复完整界面' : '只显示视频/歌词（保留底部控制栏）'"
      @click="toggleFocus"
    >
      <svg v-if="!playerStore.focusMode" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
        <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M3 9h6" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { usePlayerStore } from '../../stores/player.store'
import { useSettingsStore } from '../../stores/settings.store'

const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

async function applyAlwaysOnTop(on: boolean) {
  try { await window.electronAPI.setAlwaysOnTop(on) } catch {}
  settingsStore.settings.alwaysOnTop = on
}

/** 播放区背景透明开关（写入设置，立即生效） */
function toggleTransparent() {
  settingsStore.settings.playerTransparent = !settingsStore.settings.playerTransparent
}

/**
 * 仅置顶视频/歌词：窗口置顶的同时自动进入精简模式，
 * 这样被钉在最上层的就只有播放区（标题栏+控制栏仍在窗口内，但界面上只剩它们）。
 */
async function togglePin() {
  const next = !playerStore.pinTop
  playerStore.pinTop = next
  if (next) playerStore.focusMode = true
  await applyAlwaysOnTop(next)
}

/** 只显示视频/歌词；退出精简时如果正因置顶而精简，一并取消置顶 */
async function toggleFocus() {
  const next = !playerStore.focusMode
  playerStore.focusMode = next
  if (!next && playerStore.pinTop) {
    playerStore.pinTop = false
    await applyAlwaysOnTop(false)
  }
}

// 标题栏自带置顶按钮也能开关，保持一致
watch(() => settingsStore.settings.alwaysOnTop, (v) => {
  if (!v) playerStore.pinTop = false
})
</script>

<style scoped>
.player-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 6;
  opacity: 0.45;
  transition: opacity 0.15s;
}
.player-toolbar:hover { opacity: 1; }

.pt-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.4);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}
.pt-btn:hover { color: var(--text-primary); background: rgba(0, 0, 0, 0.65); }
.pt-btn.active { color: var(--accent); border-color: var(--accent); background: var(--accent-light); }
</style>
