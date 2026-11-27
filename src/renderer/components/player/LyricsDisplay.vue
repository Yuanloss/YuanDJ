<template>
  <div
    class="lyrics-display"
    :class="{ 'has-bg': settingsStore.settings.lyricBgEnabled && (settingsStore.settings.lyricBgPath || (settingsStore.settings.lyricBgSource === 'cover' && playerStore.currentSong?.coverUrl)) }"
  >
    <!-- 背景层：固定不滚动，放在滚动容器之外 -->
    <div v-if="settingsStore.settings.lyricBgEnabled && (settingsStore.settings.lyricBgPath || (settingsStore.settings.lyricBgSource === 'cover' && playerStore.currentSong?.coverUrl))" class="bg-layer" :style="bgStyle"></div>
    <!-- 歌词滚动层 -->
    <div class="lyrics-scroll" ref="lyricsContainer">
      <div class="lyrics-content" :style="{ paddingTop: `${scrollPadding}px`, paddingBottom: `${scrollPadding}px` }">
        <div v-if="playerStore.lyrics.length === 0" class="no-lyrics" :style="{ fontSize: `${settingsStore.settings.lyricFontSize}px` }">暂无歌词</div>
        <div
          v-for="(line, idx) in playerStore.lyrics"
          :key="idx"
          class="lyric-paragraph"
          :class="{ active: idx === playerStore.currentLyricIndex }"
          :style="lyricParagraphStyle(idx)"
        >
          <!-- 分行模式：歌词和翻译各自独立一行 -->
          <template v-if="splitLyricTranslation">
            <div class="lyric-original" :style="lyricTextStyle">{{ line.text }}</div>
            <div class="lyric-translation" v-if="showTranslation && line.translation" :style="lyricTransStyle">{{ line.translation }}</div>
          </template>
          <!-- 合并模式：翻译紧跟在歌词后面，同行显示 -->
          <div v-else class="lyric-original" :style="lyricTextStyle">
            {{ line.text }}<span v-if="showTranslation && line.translation" class="lyric-translation-inline" :style="lyricTransInlineStyle">  「{{ line.translation }}」</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { usePlayerStore } from '../../stores/player.store'
import { useSettingsStore } from '../../stores/settings.store'

const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const lyricsContainer = ref<HTMLElement | null>(null)
const scrollPadding = ref(200)

const showTranslation = computed(() => settingsStore.settings.showLyricTranslation)
const splitLyricTranslation = computed(() => settingsStore.settings.splitLyricTranslation)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const update = () => {
    if (lyricsContainer.value) {
      scrollPadding.value = Math.round(lyricsContainer.value.clientHeight / 2)
    }
  }
  update()
  resizeObserver = new ResizeObserver(update)
  if (lyricsContainer.value) resizeObserver.observe(lyricsContainer.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// 段落级别的样式（字体大小、间距、非焦点透明度）
const lyricParagraphStyle = computed(() => (idx: number) => ({
  marginBottom: `${settingsStore.settings.lyricLineSpacing}px`,
  opacity: idx === playerStore.currentLyricIndex ? 1 : settingsStore.settings.lyricInactiveOpacity / 100,
}))

const strokeCache = new Map<string, string | undefined>()

function buildStrokeTextShadow(width: number, color: string, blur: number): string | undefined {
  if (width <= 0 || !color) return undefined
  const key = `${width}|${color}|${blur}`
  const cached = strokeCache.get(key)
  if (cached !== undefined) return cached
  const step = Math.max(0.5, width / 2)
  const blurStr = blur > 0 ? `${blur}px` : '0'
  const dirs = [
    [0, -step], [0, step], [-step, 0], [step, 0],
    [-step, -step], [step, -step], [-step, step], [step, step],
  ]
  const result = dirs
    .map(([dx, dy]) => `${dx}px ${dy}px ${blurStr} ${color}`)
    .join(', ')
  strokeCache.set(key, result)
  return result
}

// 歌词正文样式（颜色、描边、字重、字体大小）
const lyricTextStyle = computed(() => {
  const s = settingsStore.settings
  const style: Record<string, string> = {}
  if (s.lyricColor) style.color = s.lyricColor
  style.fontSize = `${s.lyricFontSize}px`
  const ts = buildStrokeTextShadow(s.lyricStrokeWidth, s.lyricStrokeColor, s.lyricStrokeBlur)
  if (ts) style.textShadow = ts
  if (s.lyricFontWeight && s.lyricFontWeight !== 'normal') style.fontWeight = s.lyricFontWeight
  return style
})

// 翻译文字样式（分行模式：独立颜色、描边、字重、字体大小）
const lyricTransStyle = computed(() => {
  const s = settingsStore.settings
  const style: Record<string, string> = {}
  if (s.lyricTransColor) style.color = s.lyricTransColor
  style.fontSize = `${s.lyricTransFontSize}px`
  const ts = buildStrokeTextShadow(s.lyricTransStrokeWidth, s.lyricTransStrokeColor, s.lyricTransStrokeBlur)
  if (ts) style.textShadow = ts
  if (s.lyricTransFontWeight && s.lyricTransFontWeight !== 'normal') style.fontWeight = s.lyricTransFontWeight
  return style
})

// 翻译文字样式（合并模式：与歌词同行，使用翻译独立描边和颜色但继承字号）
const lyricTransInlineStyle = computed(() => {
  const s = settingsStore.settings
  const style: Record<string, string> = {}
  if (s.lyricTransColor) style.color = s.lyricTransColor
  const ts = buildStrokeTextShadow(s.lyricTransStrokeWidth, s.lyricTransStrokeColor, s.lyricTransStrokeBlur)
  if (ts) style.textShadow = ts
  if (s.lyricTransFontWeight && s.lyricTransFontWeight !== 'normal') style.fontWeight = s.lyricTransFontWeight
  return style
})

// 歌词背景样式（仅作用于 bg-layer 元素，不影响文字）
const bgStyle = computed(() => {
  const s = settingsStore.settings
  if (!s.lyricBgEnabled) return {}
  // 确定背景图 URL
  let url = ''
  if (s.lyricBgSource === 'cover' && playerStore.currentSong?.coverUrl) {
    url = playerStore.currentSong.coverUrl
  } else if (s.lyricBgPath) {
    url = s.lyricBgPath
  }
  if (!url) return {}
  // 将本地路径转为 file:// URL
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
    url = 'file:///' + url.replace(/\\/g, '/').replace(/^\/+/, '')
  }
  const filter: string[] = []
  if (s.lyricBgBrightness !== 100) filter.push(`brightness(${s.lyricBgBrightness}%)`)
  if (s.lyricBgBlur > 0) filter.push(`blur(${s.lyricBgBlur}px)`)
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: s.lyricBgAlign === 'tile' ? 'auto' : s.lyricBgAlign,
    backgroundRepeat: s.lyricBgAlign === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center center',
    opacity: s.lyricBgOpacity / 100,
    filter: filter.length > 0 ? filter.join(' ') : 'none',
  }
})

watch(() => playerStore.currentLyricIndex, () => {
  if (!lyricsContainer.value) return
  const paragraphs = lyricsContainer.value.querySelectorAll('.lyric-paragraph')
  const el = paragraphs[playerStore.currentLyricIndex] as HTMLElement
  if (el) {
    const container = lyricsContainer.value
    const containerHeight = container.clientHeight
    const elTop = el.offsetTop
    const elHeight = el.offsetHeight
    const targetScroll = elTop - (containerHeight / 2) + (elHeight / 2)
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
  }
})
</script>

<style scoped>
/* 外层容器：固定定位，不滚动，作为背景的定位上下文 */
.lyrics-display {
  position: relative;
  height: 100%;
  overflow: hidden;
  text-align: center;
  background: var(--bg-primary);
}

/* 背景层：绝对定位，固定在容器内，不随歌词滚动 */
.bg-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* 歌词滚动层：独立滚动，不包含背景 */
.lyrics-scroll {
  position: relative;
  z-index: 1;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.lyrics-scroll::-webkit-scrollbar { display: none; }

/* 歌词内容层 */
.lyrics-content {
  padding: 0 20px;
}
.lyric-paragraph {
  padding: 0;
  transition: color 0.2s;
}
.lyric-paragraph.active .lyric-original {
  color: var(--text-primary); font-weight: 500;
}
.lyric-paragraph.active .lyric-translation {
  color: var(--text-primary); opacity: 0.8;
}
.lyric-paragraph.active .lyric-translation-inline {
  color: var(--text-primary); opacity: 0.85;
}
.lyric-original { font-size: inherit; color: var(--text-muted); line-height: 1.5; white-space: pre-wrap; }
.lyric-translation { font-size: 0.85em; color: var(--text-muted); opacity: 0.6; line-height: 1.4; white-space: pre-wrap; margin-top: 2px; }
.lyric-translation-inline { font-size: 0.85em; opacity: 0.75; }
.no-lyrics { padding: 32px; color: var(--text-muted); }
</style>