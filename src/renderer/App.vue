<template>
  <div class="app-root" :class="{ 'player-transparent': seeThroughPlayer }">
    <ToastNotification ref="toastRef" />
    <!-- 加载覆盖层：loading / loading-data 阶段显示，ready 阶段带淡出动画 -->
    <div
      v-show="showOverlay"
      class="init-overlay"
      :class="{ 'overlay-fading': fadingOut }"
    >
      <div class="init-container">
        <div class="app-title">YuanDJ</div>
        <div class="spinner"></div>
        <div class="task-text">{{ currentTask }}</div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
      </div>
    </div>
    <!-- 路由视图：login / ready 阶段可见 -->
    <router-view v-show="routerVisible" />

    <!-- 关闭到托盘对话框 -->
    <CloseToTrayDialog v-if="showCloseTrayDialog" @result="handleCloseTrayResult" />

    <!-- 更新通知对话框 -->
    <UpdateNotificationDialog
      v-if="showUpdateDialog"
      :status="updateStatus"
      :version="updateVersion"
      :progress="updateDownloadProgress"
      :message="updateMessage"
      @close="showUpdateDialog = false"
      @download="downloadUpdate"
      @install="installUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, computed, watch, onUnmounted, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from './stores/settings.store'
import { useAuthStore } from './stores/auth.store'
import { usePlayerStore } from './stores/player.store'
import CloseToTrayDialog from './components/settings/CloseToTrayDialog.vue'
import UpdateNotificationDialog from './components/settings/UpdateNotificationDialog.vue'
import ToastNotification from './components/settings/ToastNotification.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const playerStore = usePlayerStore()

// 播放区透明：最外层 .app-root 必须一起透明，否则它那层不透明底色会把窗口透出的桌面全挡住
const seeThroughPlayer = computed(() =>
  !!settingsStore.settings.playerTransparent && !!playerStore.currentSong
)

// ── 关闭前响应：保存设置后通知主进程 ──
// 关闭到托盘对话框
const showCloseTrayDialog = ref(false)

// 更新通知对话框
const showUpdateDialog = ref(false)
const updateStatus = ref('')
const updateVersion = ref('')
const updateDownloadProgress = ref(0)
const updateMessage = ref('')

onMounted(() => {
  window.electronAPI.onBeforeClose(async () => {
    await settingsStore.save()
    window.electronAPI.appSaveDone()
  })

  // 监听关闭到托盘对话框请求
  window.electronAPI.onShowCloseToTrayDialog(() => {
    showCloseTrayDialog.value = true
  })

  // 监听更新状态（自动检查时弹出通知）
  window.electronAPI.onUpdateStatus?.((s: any) => {
    updateStatus.value = s.status
    if (s.version) updateVersion.value = s.version
    if (s.percent !== undefined) updateDownloadProgress.value = s.percent
    if (s.error) updateMessage.value = s.error
    if (s.message) updateMessage.value = s.message
    // 只在「发现新版本 / 下载中 / 已下载」时自动弹出通知。
    // 检查失败（例如 GitHub 访问不了）不再弹窗：它的全屏遮罩会把界面压暗，
    // 让播放区看起来"没有透明"，而且每次启动都弹一次很烦。
    if (s.status === 'available' || s.status === 'downloaded' || s.status === 'downloading') {
      showUpdateDialog.value = true
    }
  })
})

function handleCloseTrayResult(result: { action: string; remember: boolean }) {
  showCloseTrayDialog.value = false
  window.electronAPI.sendCloseToTrayResult(result)
}

async function downloadUpdate() {
  try {
    await window.electronAPI.downloadUpdate()
  } catch (e) {
    updateStatus.value = 'error'
    updateMessage.value = (e as Error).message
  }
}

async function installUpdate() {
  try {
    await window.electronAPI.installUpdate()
  } catch (e) {
    updateStatus.value = 'error'
    updateMessage.value = (e as Error).message
  }
}

// ── 状态机 ──
// loading      → 初始加载（设置 + 鉴权），显示 overlay
// login        → 未登录，显示登录页
// loading-data → 登录后加载数据，显示 overlay
// ready        → 主界面就绪（MainView 已挂载且队列已加载）
type AppPhase = 'loading' | 'login' | 'loading-data' | 'ready'
const appPhase = ref<AppPhase>('loading')

// 登录阶段变化时通知主进程：登录界面关闭时无视 closeToTray 强制退出
watch(appPhase, (phase) => {
  window.electronAPI.setLoginPhase(phase === 'login')
})

// 主界面就绪时的淡出控制
const fadingOut = ref(false)

const progress = ref(0)
const currentTask = ref('正在启动...')

// overlay 可见：loading / loading-data 阶段，以及 ready 阶段的淡出过程中
const showOverlay = computed(() =>
  appPhase.value === 'loading' || appPhase.value === 'loading-data' || fadingOut.value
)

// 路由视图可见：login 阶段（登录页）、loading-data 阶段（数据加载，overlay 遮盖）、ready 阶段（主界面）
const routerVisible = computed(() =>
  appPhase.value === 'login' || appPhase.value === 'loading-data' || appPhase.value === 'ready'
)

// ── 工具 ──
function updateProgress(pct: number, task: string) {
  progress.value = pct
  currentTask.value = task
}

// ── LoginView 回调：用户点击"进入"后触发 ──
async function onLoginComplete() {
  appPhase.value = 'loading-data'
  updateProgress(5, '正在刷新登录状态...')
  // 重新初始化 authStore（QR 登录期间的凭据已由主进程保存）
  await authStore.init()
  updateProgress(25, '登录状态已刷新')
  updateProgress(45, '正在进入主界面...')
  await loadAndEnterMain()
}

// MainView.onMounted 队列加载完毕后调用
let fadeTimer: ReturnType<typeof setTimeout> | null = null

async function signalMainReady() {
  // 等待心率自动连接完成（或超时），确保加载完成后再进入主界面
  if (hrAutoConnectPromise) {
    await hrAutoConnectPromise
    hrAutoConnectPromise = null
  }
  currentTask.value = '加载完成'
  progress.value = 100
  // 先触发 CSS 淡出动画
  fadingOut.value = true
  // 动画结束后切到 ready 状态，清理残留
  fadeTimer = setTimeout(() => {
    fadingOut.value = false
    appPhase.value = 'ready'
    const ls = document.getElementById('loading-screen')
    if (ls) ls.remove()
  }, 400)
}

onUnmounted(() => {
  if (fadeTimer) clearTimeout(fadeTimer)
})

// 注入给子组件
provide('signalMainReady', signalMainReady)
provide('onLoginComplete', onLoginComplete)
provide('updateLoadingProgress', updateProgress)

const toastRef = ref<InstanceType<typeof ToastNotification> | null>(null)
function showToast(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration?: number) {
  toastRef.value?.show(message, type, duration)
}
provide('showToast', showToast)

// 心率自动连接 Promise：供 signalMainReady 等待，确保连接完成或超时后才进入主界面
let hrAutoConnectPromise: Promise<void> | null = null

// 核心：加载数据后进入主界面
async function loadAndEnterMain() {
  updateProgress(50, '正在准备播放队列...')
  await router.push('/main')
  // MainView.onMounted 异步加载队列，完成后调用 signalMainReady
  // 心率自动连接与队列加载并行，signalMainReady 会等待两者都完成
  hrAutoConnectPromise = startHeartRateAutoConnect()
}

// 启动心率自动连接（不阻塞，由 signalMainReady 等待）
function startHeartRateAutoConnect(): Promise<void> {
  return (async () => {
    try {
      const savedId = settingsStore.settings.lastHeartRateDevice
      if (!savedId) return

      updateProgress(70, '正在连接心率设备...')
      const connected = await window.electronAPI.autoConnectHeartRate()
      if (connected) {
        updateProgress(85, '心率设备已连接')
      } else {
        updateProgress(85, '心率设备连接超时，稍后可在设置中重试')
      }
    } catch {
      updateProgress(85, '心率设备连接失败')
    }
  })()
}

// ── 主初始化流程 ──
async function initApp() {
  // 隐藏静态 loading-screen，Vue overlay 接管
  const staticLs = document.getElementById('loading-screen')
  if (staticLs) staticLs.style.display = 'none'

  // ====== 阶段1：启动配置（0%-20%）主题色、窗口信息 ======
  updateProgress(5, '正在加载启动配置...')
  await settingsStore.loadBoot()
  updateProgress(20, '启动配置已加载')

  // ====== 阶段2：应用数据（25%-45%）软件本体设置 ======
  updateProgress(25, '正在加载应用设置...')
  await settingsStore.loadApp()
  updateProgress(45, '应用设置已加载')

  // 阶段3：检测登录状态（45%-50%）
  updateProgress(48, '正在检查登录状态...')
  await authStore.init()
  updateProgress(50, '登录状态已确认')

  const isLoggedIn = authStore.authState.bilibili && authStore.authState.netease

  if (isLoggedIn) {
    await router.push('/main')
    appPhase.value = 'loading-data'
    // 60% → MainView 继续推进到 100%
    // 心率自动连接与队列加载并行，signalMainReady 会等待两者都完成
    hrAutoConnectPromise = startHeartRateAutoConnect()
  } else {
    appPhase.value = 'login'
  }
}

initApp()
</script>

<style>
/* 根容器：确保过渡期间无白屏 */
.app-root {
  background: var(--bg-primary);
  min-height: 100vh;}

/* 播放区透明：根容器让出底色，播放区才能透出桌面（其余区域各自有不透明底色） */
.app-root.player-transparent {
  background: transparent;
}

.init-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: center;
  background: #1e1e1e;
  z-index: 9999;
  will-change: opacity;
  -webkit-app-region: drag;
}
/* 主界面就绪时的淡出动画 */
.overlay-fading {
  opacity: 0;
  transition: opacity 0.35s ease;
  pointer-events: none;
}

.init-container {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 280px;
}
.app-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--accent, #00b5e5);
  letter-spacing: 2px;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255,255,255,0.08);
  border-top-color: var(--accent, #00b5e5);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.task-text {
  font-size: 13px;
  color: #888;
  min-height: 20px;
}
.progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent, #00b5e5);
  border-radius: 2px;
  transition: width 0.4s ease;
}
</style>