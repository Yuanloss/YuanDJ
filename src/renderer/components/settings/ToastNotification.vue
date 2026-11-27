<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item"
          :class="toast.type"
        >
          <span class="toast-icon">{{ iconMap[toast.type] }}</span>
          <span class="toast-message">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Toast {
  id: number
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

const toasts = ref<Toast[]>([])
let nextId = 0

const iconMap: Record<string, string> = {
  info: 'ℹ',
  success: '✓',
  error: '✕',
  warning: '⚠',
}

function show(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration = 3000) {
  const id = nextId++
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }, duration)
}

defineExpose({ show })
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 60px;
  right: 16px;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 12px;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.35);
  min-width: 200px;
  max-width: 400px;
  color: #fff;
  pointer-events: auto;
}
.toast-item.info { background: #2d8cf0; }
.toast-item.success { background: #19be6b; }
.toast-item.error { background: #e74c3c; }
.toast-item.warning { background: #f90; }
.toast-icon { flex-shrink: 0; font-size: 14px; }
.toast-message { line-height: 1.4; word-break: break-word; }

.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from { opacity: 0; transform: translateX(40px); }
.toast-leave-to { opacity: 0; transform: translateX(40px); }
</style>