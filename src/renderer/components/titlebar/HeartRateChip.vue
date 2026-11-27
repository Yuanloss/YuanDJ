<template>
  <button
    class="hr-chip"
    :class="{ connected: connected && value > 0, idle: !hasDevice }"
    :title="tip"
    @click="openHeartRateSettings"
  >
    <svg
      class="hr-heart"
      :class="{ beat: connected && value > 0 }"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 21s-6.7-4.35-9.1-8.2C1.2 10 2.2 6.4 5.3 5.2c1.9-.7 3.9-.1 5.2 1.4L12 8l1.5-1.4c1.3-1.5 3.3-2.1 5.2-1.4 3.1 1.2 4.1 4.8 2.4 7.6C18.7 16.65 12 21 12 21z" />
    </svg>
    <span class="hr-value">{{ connected && value > 0 ? value : '--' }}</span>
    <span class="hr-unit">BPM</span>
  </button>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from '../../stores/auth.store'
import { useSettingsStore } from '../../stores/settings.store'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()

const value = ref(0)
const connected = ref(false)

let ws: WebSocket | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let disposed = false

const hasDevice = computed(() => !!settingsStore.settings.lastHeartRateDevice)

const tip = computed(() => {
  const name = settingsStore.settings.lastHeartRateDeviceName || '心率设备'
  if (connected.value && value.value > 0) return `${name}：${value.value} BPM（点击打开心率设置）`
  if (hasDevice.value) return `${name}：未连接（点击打开心率设置）`
  return '心率未配置：点击打开设置，连接蓝牙手环并接入 OBS'
})

function openHeartRateSettings() {
  authStore.openSettings('heart-rate')
}

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function scheduleRetry(delay: number) {
  if (disposed) return
  clearRetry()
  retryTimer = setTimeout(() => { attach() }, delay)
}

function closeSocket() {
  if (ws) {
    const socket = ws
    ws = null
    try { socket.close() } catch {}
  }
}

/** 连接 OBS 捕获服务的 /heart-rate 端点，被动订阅心率（有已保存设备时自动复用/启动监测） */
async function attach() {
  if (disposed) return
  clearRetry()
  closeSocket()

  // HTTP 服务没开就没必要连，稍后重试（用户可能刚去设置里打开）
  if (!settingsStore.settings.obsOverlayEnabled) {
    scheduleRetry(6000)
    return
  }

  let port = 0
  try { port = await window.electronAPI.getObsPort() } catch {}
  if (!port) {
    scheduleRetry(4000)
    return
  }
  if (disposed) return

  try {
    const socket = new WebSocket(`ws://localhost:${port}/heart-rate`)
    ws = socket

    socket.onopen = () => {
      const deviceId = settingsStore.settings.lastHeartRateDevice
      socket.send(JSON.stringify(deviceId
        ? { type: 'heart-rate:init', deviceId }
        : { type: 'heart-rate:init' }))
    }

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type !== 'heart-rate-tool') return
        const data = msg.data
        if (!data) return
        if (data.type === 'heart_rate') {
          if (typeof data.hr === 'number') {
            value.value = data.hr
            if (data.hr > 0) connected.value = true
          }
        } else if (data.type === 'connected') {
          connected.value = true
          if (data.name) settingsStore.settings.lastHeartRateDeviceName = data.name
        } else if (data.type === 'disconnected') {
          connected.value = false
          value.value = 0
        }
      } catch {}
    }

    socket.onclose = () => {
      if (ws === socket) ws = null
      if (!disposed) scheduleRetry(5000)
    }
    socket.onerror = () => {
      try { socket.close() } catch {}
    }
  } catch {
    scheduleRetry(5000)
  }
}

onMounted(() => { attach() })

onUnmounted(() => {
  disposed = true
  clearRetry()
  closeSocket()
})

// OBS 服务开关变化 / 切换设备后重新订阅
watch(() => settingsStore.settings.obsOverlayEnabled, () => { attach() })
watch(() => settingsStore.settings.lastHeartRateDevice, () => { attach() })
</script>

<style scoped>
.hr-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  margin-right: 4px;
  border: 1px solid var(--border);
  background: none;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}
.hr-chip:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.hr-chip.connected { color: #ff5f7a; border-color: rgba(255, 95, 122, 0.45); }
.hr-chip.idle { opacity: 0.6; }
.hr-chip.idle:hover { opacity: 1; }

.hr-heart { width: 11px; height: 11px; flex-shrink: 0; }
.hr-heart.beat { animation: hr-beat 1s ease-in-out infinite; }
@keyframes hr-beat {
  0%, 100% { transform: scale(1); }
  12% { transform: scale(1.25); }
  24% { transform: scale(1); }
  36% { transform: scale(1.18); }
  48% { transform: scale(1); }
}

.hr-value { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 16px; text-align: right; }
.hr-unit { font-size: 9px; opacity: 0.75; letter-spacing: 0.3px; }
</style>
