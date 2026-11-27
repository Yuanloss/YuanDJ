import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AuthState } from '@shared/types/settings'

export const useAuthStore = defineStore('auth', () => {
  const authState = ref<AuthState>({
    bilibili: false,
    bilibiliUname: '',
    bilibiliFace: '',
    bilibiliUid: 0,
    netease: false,
    neteaseUname: '',
    neteaseFace: '',
    neteaseUid: 0
  })
  const showSettings = ref(false)
  // 打开设置时要定位到的 section id（如 'heart-rate'），由主界面等入口写入
  const settingsTarget = ref('')

  async function init() {
    try {
      const result = await window.electronAPI.checkAutoLogin()
      authState.value = result.authState
    } catch {}
  }

  function toggleSettings() {
    if (showSettings.value) {
      showSettings.value = false
    } else {
      settingsTarget.value = ''
      showSettings.value = true
    }
  }

  /** 打开设置；传 sectionId 时定位到对应区块（如 'heart-rate'） */
  function openSettings(sectionId: string = '') {
    settingsTarget.value = sectionId
    showSettings.value = true
  }

  function closeSettings() {
    showSettings.value = false
  }

  return { authState, showSettings, settingsTarget, init, toggleSettings, openSettings, closeSettings }
})
