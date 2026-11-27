import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { AppSettings } from '@shared/types/settings'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'

/** 将 AppSettings 对象转为 IPC 所需的 [string, string][] 格式（app_ 前缀 + JSON.stringify 值） */
function toEntries(settings: AppSettings): [string, string][] {
  return Object.entries(settings).map(
    ([key, value]) => [`app_${key}`, JSON.stringify(value)]
  )
}

/** 将 app_ 前缀的 kv 映射合并到 AppSettings */
function mergeAppData(settings: AppSettings, kvMap: Record<string, string>): void {
  for (const [fullKey, jsonValue] of Object.entries(kvMap)) {
    const key = fullKey.startsWith('app_') ? fullKey.slice(4) : fullKey
    if (key in settings) {
      try {
        (settings as any)[key] = JSON.parse(jsonValue)
      } catch {
        (settings as any)[key] = jsonValue
      }
    }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })
  let loaded = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  // 所有设置变更 → 防抖持久化（300ms），避免频繁 IPC 调用导致的性能问题
  watch(
    settings,
    () => {
      if (!loaded) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(async () => {
        saveTimer = null
        try {
          const entries = toEntries(settings.value)
          const result = await window.electronAPI.saveSettings(entries)
          if (!result?.success) {
            console.warn('[SettingsStore] 防抖保存返回失败')
          }
        } catch (e) {
          console.error('[SettingsStore] 防抖保存失败:', (e as Error).message)
        }
      }, 300)
    },
    { deep: true }
  )

  // 阶段1：加载启动数据（主题色、窗口信息）
  async function loadBoot() {
    try {
      const boot = await window.electronAPI.loadBootData()
      if (boot) {
        settings.value.theme = boot.theme
        settings.value.accentColor = boot.accentColor
        settings.value.alwaysOnTop = boot.alwaysOnTop
        settings.value.resizable = boot.resizable
        settings.value.closeToTray = boot.closeToTray
        settings.value.autoUpdate = boot.autoUpdate
        applyTheme(settings.value.theme)
        applyAccent(settings.value.accentColor)
      }
    } catch (e) {
      console.error('[SettingsStore] 加载启动数据失败:', e)
    }
  }

  // 阶段2：加载应用数据（软件本体设置）
  async function loadApp() {
    try {
      const kvMap = await window.electronAPI.loadAppData()
      if (kvMap && Object.keys(kvMap).length > 0) {
        mergeAppData(settings.value, kvMap)
      }
      // 加载完成后启用防抖自动保存
      loaded = true
      applyLyricStyleMigration()
      applyRequestRulesMigration()
    } catch (e) {
      console.error('[SettingsStore] 加载应用数据失败:', e)
      loaded = true  // 即使加载失败也启用保存，避免设置永远无法写入
      applyLyricStyleMigration()
      applyRequestRulesMigration()
    }
  }

  /**
   * 一次性迁移：把老的低可读歌词默认值升级为新的高可读默认值。
   * 老用户库里存的是 16px / 跟主题色 / 不加粗，仅改 DEFAULT_SETTINGS 不会覆盖已存值，
   * 所以这里显式升级一次；同时把「播放区透明」重置为默认关闭。
   */
  function applyLyricStyleMigration() {
    if (settings.value.lyricStyleMigrated) return
    settings.value.lyricFontSize = 24
    settings.value.lyricColor = '#ffffff'
    settings.value.lyricStrokeWidth = 2
    settings.value.lyricStrokeBlur = 2
    settings.value.lyricFontWeight = 'bold'
    settings.value.lyricTransColor = 'rgba(255,255,255,0.82)'
    settings.value.lyricTransFontSize = 18
    settings.value.lyricTransStrokeWidth = 1
    settings.value.lyricInactiveOpacity = 45
    settings.value.playerTransparent = false
    settings.value.lyricStyleMigrated = true
  }

  /**
   * 一次性迁移：点歌规则默认改为「同用户 1 秒 / 同歌曲 10 秒 / 队列上限 50」。
   * 老用户库里存的是 3 / 799 / 25，只改 DEFAULT_SETTINGS 不会生效。
   */
  function applyRequestRulesMigration() {
    if (settings.value.requestRulesMigrated) return
    settings.value.userCooldown = 1
    settings.value.songCooldown = 10
    settings.value.maxQueueSize = 50
    settings.value.requestRulesMigrated = true
  }

  function toggleTheme() {
    settings.value.theme = settings.value.theme === 'dark' ? 'light' : 'dark'
    applyTheme(settings.value.theme)
  }

  function setAccentColor(color: string) {
    settings.value.accentColor = color
    applyAccent(color)
  }

  function applyTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme)
  }

  function applyAccent(color: string) {
    // 验证 hex 颜色格式（支持 #RRGGBB 和 #RGB）
    const hexMatch = color.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    if (!hexMatch) {
      console.warn('[SettingsStore] 无效的 accent 颜色值:', color)
      return
    }
    let hex = color
    if (color.length === 4) {
      // 展开短格式 #RGB → #RRGGBB
      hex = '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
    }
    const root = document.documentElement
    root.style.setProperty('--accent', hex)
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const hoverR = Math.max(0, r - 30).toString(16).padStart(2, '0')
    const hoverG = Math.max(0, g - 30).toString(16).padStart(2, '0')
    const hoverB = Math.max(0, b - 30).toString(16).padStart(2, '0')
    root.style.setProperty('--accent-hover', `#${hoverR}${hoverG}${hoverB}`)
    root.style.setProperty('--accent-light', hexToRgba(color, 0.06))
  }

  function hexToRgba(hex: string, alpha: number): string {
    const h = hex.length === 4
      ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
      : hex
    const r = parseInt(h.slice(1, 3), 16)
    const g = parseInt(h.slice(3, 5), 16)
    const b = parseInt(h.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  async function save() {
    // 先清除防抖定时器，执行即时保存（用于关闭前保存等关键场景）
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    try {
      const entries = toEntries(settings.value)
      const result = await window.electronAPI.saveSettings(entries)
      if (!result?.success) {
        console.warn('[SettingsStore] 显式保存返回失败')
      }
    } catch (e) {
      console.error('[SettingsStore] 显式保存失败:', (e as Error).message)
    }
  }

  return { settings, loadBoot, loadApp, save, toggleTheme, setAccentColor }
})