// ---------- 心率工具样式设置页面 ----------
// 参考 style.ts 的实现方式，提供心率工具的所有样式设置项
// 通过 WebSocket 实时推送到 /heart-rate 捕获页
// 阴影设置对齐 style.ts 背景效果中的 4 个阴影相关设置
// 字体选择对齐 style.ts 的 buildFontSelectRow 下拉列表方式

import { DEFAULT_SETTINGS } from '../../../../shared/constants/defaults'
import {
  COMMON_CSS,
  buildColorRow, buildFontRow, buildSelectRow, buildFontSelectRow
} from '../common'

export function getHeartRateStylePage(port: number): string {
  const d = DEFAULT_SETTINGS

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>心率工具样式设置</title>
<style>${COMMON_CSS}
/* 心率样式页面专用 */
.hr-symbol-input {
  width: 100px; padding: 3px 5px; font-size: 12px; background: #3c3c3c; color: #ccc;
  border: 1px solid #555; outline: none; font-family: inherit;
}
.hr-symbol-input:focus { border-color: #00b5e5; }
</style>
</head>
<body class="style-mode">
<h1>心率工具 · 样式设置</h1>
<p class="style-subtitle">端口：${port} &nbsp;|&nbsp; 修改样式后自动推送到 OBS 浏览器源</p>

<div class="style-section" id="section-heart-rate">
  <h2 onclick="toggleSection(this)"><span><span class="h2-arrow">▼</span>心率显示样式</span> <button class="reset-btn" onclick="event.stopPropagation();resetDefaults()" title="恢复默认">↺ 重置</button></h2>
  <div class="section-body">
    <div class="style-panel">
      <!-- 阴影效果（共享，对齐 style.ts 背景效果中的 4 个阴影设置） -->
      <div class="style-subsection">
        <h3 onclick="toggleSubsection(this)"><span class="h3-arrow">▼</span> 阴影效果（共享）</h3>
        <div class="subsection-body">
          ${buildColorRow('hr', '阴影颜色', 'shadowColor', d.heartRateShadowColor)}
          ${buildFontRow('hr', '阴影大小', 'shadowSize', 0, 20, d.heartRateShadowSize, 'px')}
          ${buildFontRow('hr', '阴影上下', 'shadowOffsetY', -30, 30, d.heartRateShadowOffsetY, 'px')}
          ${buildFontRow('hr', '阴影左右', 'shadowOffsetX', -30, 30, d.heartRateShadowOffsetX, 'px')}
        </div>
      </div>

      <!-- 布局 -->
      <div class="style-subsection">
        <h3 onclick="toggleSubsection(this)"><span class="h3-arrow">▼</span> 布局</h3>
        <div class="subsection-body">
          ${buildFontRow('hr', '符号与数字间距', 'gap', 0, 40, d.heartRateGap, 'px')}
        </div>
      </div>

      <!-- 符号样式 -->
      <div class="style-subsection">
        <h3 onclick="toggleSubsection(this)"><span class="h3-arrow">▼</span> 符号样式</h3>
        <div class="subsection-body">
          <div class="style-row">
            <span>符号</span>
            <input type="text" id="hr-symbol" class="hr-symbol-input" value="${d.heartRateSymbol}" data-page="hr" data-key="symbol" maxlength="10">
          </div>
          ${buildColorRow('hr', '符号颜色', 'symbolColor', d.heartRateSymbolColor)}
          ${buildFontRow('hr', '符号大小', 'symbolSize', 12, 120, d.heartRateSymbolSize, 'px')}
          ${buildSelectRow('hr', '符号字重', 'symbolFontWeight', [{ value: 'normal', label: '常规' }, { value: 'bold', label: '加粗' }, { value: 'lighter', label: '细体' }], d.heartRateSymbolFontWeight)}
          ${buildFontSelectRow('hr', '符号字体', 'symbolFontFamily', d.heartRateSymbolFontFamily)}
        </div>
      </div>

      <!-- 数字样式 -->
      <div class="style-subsection">
        <h3 onclick="toggleSubsection(this)"><span class="h3-arrow">▼</span> 数字样式</h3>
        <div class="subsection-body">
          ${buildColorRow('hr', '数字颜色', 'color', d.heartRateColor)}
          ${buildFontRow('hr', '数字大小', 'fontSize', 12, 120, d.heartRateFontSize, 'px')}
          ${buildSelectRow('hr', '数字字重', 'fontWeight', [{ value: 'normal', label: '常规' }, { value: 'bold', label: '加粗' }, { value: 'lighter', label: '细体' }], d.heartRateFontWeight)}
          ${buildFontSelectRow('hr', '数字字体', 'fontFamily', d.heartRateFontFamily)}
        </div>
      </div>
    </div>
    <div class="preview-wrap">
      <div class="preview-box" id="preview-box-hr">
        <iframe class="preview-iframe" id="preview-hr" src="http://localhost:${port}/heart-rate"></iframe>
      </div>
      <div class="obs-url-bar">
        <input value="http://localhost:${port}/heart-rate" readonly onclick="this.select()">
        <button onclick="copyObsUrl()">复制</button>
      </div>
    </div>
  </div>
</div>

<script>${getHeartRateStylePageJs(port)}</script>
</body>
</html>`
}

// ---------- /heart-rate-style 页面 JS ----------

function getHeartRateStylePageJs(port: number): string {
  const d = DEFAULT_SETTINGS

  return `var PORT = ${port}
var DEFAULTS = {
  color: '${d.heartRateColor}',
  shadowColor: '${d.heartRateShadowColor}',
  shadowSize: ${d.heartRateShadowSize},
  shadowOffsetY: ${d.heartRateShadowOffsetY},
  shadowOffsetX: ${d.heartRateShadowOffsetX},
  fontSize: ${d.heartRateFontSize},
  fontWeight: '${d.heartRateFontWeight}',
  fontFamily: '${d.heartRateFontFamily}',
  symbol: '${d.heartRateSymbol}',
  symbolSize: ${d.heartRateSymbolSize},
  symbolColor: '${d.heartRateSymbolColor}',
  symbolFontWeight: '${d.heartRateSymbolFontWeight}',
  symbolFontFamily: '${d.heartRateSymbolFontFamily}',
  gap: ${d.heartRateGap}
}
var styleState = JSON.parse(JSON.stringify(DEFAULTS))

var ws, cpOpenId, cpHue = 0, cpSat = 1, cpbri = 1, wsReconnectDelay = 1000

// ===== 折叠/展开 =====
function toggleSection(h2) {
  h2.classList.toggle('collapsed')
  var body = h2.nextElementSibling
  if (body) body.classList.toggle('collapsed')
}
function toggleSubsection(h3) {
  h3.classList.toggle('collapsed')
  var body = h3.nextElementSibling
  if (body) body.classList.toggle('collapsed')
}

// ===== 自定义颜色选择器（与 style.ts 一致） =====
function ensurePopup() {
  var p = document.getElementById('cp-popup')
  if (p) return p
  var overlay = document.createElement('div')
  overlay.id = 'cp-overlay'
  overlay.className = 'cp-overlay'
  overlay.addEventListener('click', dismissPopup)
  document.body.appendChild(overlay)
  p = document.createElement('div')
  p.id = 'cp-popup'
  p.className = 'cp-popup'
  p.onclick = function(e) { e.stopPropagation() }
  p.innerHTML = '<div class="cp-sb-canvas" id="cp-sb-canvas"><div class="cp-sb-cursor" id="cp-sb-cursor"></div></div>' +
    '<div class="cp-hue-slider" id="cp-hue-slider"><div class="cp-slider-cursor" id="cp-slider-cursor"></div></div>' +
    '<div class="cp-input-row"><div class="cp-preview" id="cp-preview" onclick="dismissPopup()"></div><input class="cp-text-input" id="cp-text-input" maxlength="7" placeholder="#HEX" spellcheck="false"></div>'
  document.body.appendChild(p)

  var sbCanvas = document.getElementById('cp-sb-canvas')
  sbCanvas.addEventListener('mousedown', function(e) {
    pickSBColor(e)
    function onMove(ev) { pickSBColor(ev) }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  var hueEl = document.getElementById('cp-hue-slider')
  hueEl.addEventListener('mousedown', function(e) {
    pickHue(e)
    function onMove(ev) { pickHue(ev) }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  var textInput = document.getElementById('cp-text-input')
  textInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { commitColor() } })
  textInput.addEventListener('blur', function() { commitColorFromInput() })
  return p
}

function pickSBColor(e) {
  var area = document.getElementById('cp-sb-canvas')
  if (!area) return
  var rect = area.getBoundingClientRect()
  cpSat = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  cpbri = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
  updateColorArea()
}

function pickHue(e) {
  var slider = document.getElementById('cp-hue-slider')
  if (!slider) return
  var rect = slider.getBoundingClientRect()
  cpHue = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360))
  updateColorArea()
}

function openColorPopup(elId) {
  cpOpenId = elId
  var txt = document.getElementById(elId)
  if (!txt) return
  var hex = txt.value || '#ffffff'
  ensurePopup()
  setHex(hex)
  updatePopupPosition()
  document.getElementById('cp-popup').classList.add('show')
  document.getElementById('cp-overlay').style.display = 'block'
}

function updatePopupPosition() {
  var popup = document.getElementById('cp-popup')
  if (!popup || !cpOpenId) return
  var wrap = document.getElementById(cpOpenId + '-wrap')
  if (!wrap) return
  var wrapRect = wrap.getBoundingClientRect()
  var pw = 232, ph = 246
  var l = wrapRect.left
  var t = wrapRect.bottom + 6
  if (l + pw > window.innerWidth - 10) l = window.innerWidth - pw - 10
  if (l < 10) l = 10
  if (t + ph > window.innerHeight - 10) t = wrapRect.top - ph - 6
  if (t < 10) t = 10
  popup.style.left = l + 'px'
  popup.style.top = t + 'px'
}

window.addEventListener('scroll', function() { if (cpOpenId) updatePopupPosition() }, true)
window.addEventListener('resize', function() { if (cpOpenId) updatePopupPosition() })
document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && cpOpenId) dismissPopup() })

function setHex(hex) {
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  var max = Math.max(r,g,b), min = Math.min(r,g,b)
  cpbri = max / 255
  cpSat = max ? (max - min) / max : 0
  if (cpSat === 0) cpHue = 0
  else if (max === r) cpHue = ((g - b) / (max - min) + 6) % 6 * 60
  else if (max === g) cpHue = ((b - r) / (max - min) + 2) * 60
  else cpHue = ((r - g) / (max - min) + 4) * 60
  updateColorArea()
}

function updateColorArea() {
  var sbCanvas = document.getElementById('cp-sb-canvas')
  var sbCursor = document.getElementById('cp-sb-cursor')
  var hueCursor = document.getElementById('cp-slider-cursor')
  var preview = document.getElementById('cp-preview')

  if (sbCanvas) sbCanvas.style.backgroundColor = 'hsl(' + cpHue + ', 100%, 50%)'
  if (hueCursor) hueCursor.style.left = (cpHue / 360 * 100) + '%'
  var x = cpSat * 100, y = (1 - cpbri) * 100
  if (sbCursor) { sbCursor.style.left = x + '%'; sbCursor.style.top = y + '%' }
  var hex = hslToHex()
  if (preview) preview.style.backgroundColor = hex
  document.getElementById('cp-text-input').value = hex
  if (cpOpenId) {
    var txt = document.getElementById(cpOpenId)
    var sw = document.getElementById(cpOpenId + '-swatch')
    if (txt) txt.value = hex
    if (sw) sw.style.background = hex
    sendColorChange(cpOpenId, hex)
  }
}

function hslToHex() {
  var h = cpHue / 60
  var s = cpSat
  var b = cpbri
  var c = b * s
  var x = c * (1 - Math.abs(h % 2 - 1))
  var m = b - c
  var r1, g1, b1
  if (h < 1) { r1 = c; g1 = x; b1 = 0 }
  else if (h < 2) { r1 = x; g1 = c; b1 = 0 }
  else if (h < 3) { r1 = 0; g1 = c; b1 = x }
  else if (h < 4) { r1 = 0; g1 = x; b1 = c }
  else if (h < 5) { r1 = x; g1 = 0; b1 = c }
  else { r1 = c; g1 = 0; b1 = x }
  var toHex = function(v) { var s = Math.round((v + m) * 255).toString(16); return s.length === 1 ? '0' + s : s }
  return '#' + toHex(r1) + toHex(g1) + toHex(b1)
}

function sendColorChange(elId, hex) {
  var el = document.getElementById(elId)
  if (!el) return
  var key = el.getAttribute('data-key')
  if (!key) return
  styleState[key] = hex
  sendStyleUpdate()
}

function commitColor() {
  var hexInput = document.getElementById('cp-text-input')
  if (hexInput) {
    var v = hexInput.value.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) { setHex(v) }
  }
  dismissPopup()
}

function commitColorFromInput() {
  var hexInput = document.getElementById('cp-text-input')
  if (hexInput) {
    var v = hexInput.value.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) { setHex(v) }
  }
}

function dismissPopup() {
  var p = document.getElementById('cp-popup')
  if (p) p.classList.remove('show')
  var overlay = document.getElementById('cp-overlay')
  if (overlay) overlay.style.display = 'none'
  cpOpenId = null
}

// ===== 设置逻辑 =====
function readValue(el) {
  if (el.type === 'checkbox') return el.checked
  if (el.type === 'range') return Number(el.value)
  return el.value
}

function applyChange(el) {
  var key = el.getAttribute('data-key')
  if (!key) return
  var val = readValue(el)
  styleState[key] = val
  if (el.type === 'range') {
    var vid = el.id + '-val'
    var vEl = document.getElementById(vid)
    if (vEl) vEl.textContent = val + (el.getAttribute('data-unit') || '')
  }
  if (el.classList.contains('cp-input')) {
    var sw = document.getElementById(el.id + '-swatch')
    if (sw) sw.style.background = val
  }
}

function syncUI() {
  Object.keys(styleState).forEach(function(key) {
    var el = document.getElementById('hr-' + key)
    if (!el) return
    if (el.type === 'range') {
      el.value = styleState[key]; applyChange(el)
    } else if (el.classList.contains('cp-input')) {
      el.value = styleState[key]; applyChange(el)
    } else if (el.tagName === 'SELECT') {
      el.value = styleState[key]
    } else if (el.type === 'text') {
      el.value = styleState[key]
    }
  })
}

function resetDefaults() {
  styleState = JSON.parse(JSON.stringify(DEFAULTS))
  syncUI()
  sendStyleUpdate()
}

// 持久化：通过 WebSocket 发送到服务器，由服务器广播到 /heart-rate 客户端
function sendStyleUpdate() {
  scheduleStyleUpdate()
}

var updateTimer = null
function scheduleStyleUpdate() {
  clearTimeout(updateTimer)
  updateTimer = setTimeout(function() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    var msg = JSON.parse(JSON.stringify(styleState))
    msg.type = 'heart-rate-style-update'
    ws.send(JSON.stringify(msg))
  }, 200)
}

function copyObsUrl() {
  navigator.clipboard.writeText('http://localhost:' + PORT + '/heart-rate')
  var buttons = document.querySelectorAll('.obs-url-bar button')
  buttons.forEach(function(b) {
    if (b.textContent === '复制') {
      b.textContent = '已复制'
      b.classList.add('copied')
      setTimeout(function() { b.textContent = '复制'; b.classList.remove('copied') }, 1500)
    }
  })
}

function connect() {
  ws = new WebSocket('ws://localhost:' + PORT + '/heart-rate-style')
  ws.onclose = function() {
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000)
    setTimeout(connect, wsReconnectDelay)
  }
  ws.onopen = function() {
    wsReconnectDelay = 1000
    // 主动请求已保存的样式，作为服务端自动推送 init 的兜底
    // 防止某些时序场景下 init 消息丢失导致 UI 停留在默认值
    ws.send(JSON.stringify({ type: 'request-heart-rate-style' }))
  }
  ws.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'heart-rate-style-init':
          // 初始化：加载已保存的样式
          if (msg.style) {
            Object.assign(styleState, msg.style)
            syncUI()
          }
          break
        case 'heart-rate-style':
          // 其他客户端的样式变更广播
          if (msg.data) {
            Object.assign(styleState, msg.data)
            syncUI()
          }
          break
      }
    } catch(ex) {}
  }
}

// ===== 事件绑定 =====
document.addEventListener('input', function(e) {
  var el = e.target
  if (!el.closest || !el.closest('.style-section')) return
  // 符号文本框：实时同步
  if (el.type === 'text' && el.classList.contains('hr-symbol-input')) {
    applyChange(el)
    sendStyleUpdate()
    return
  }
  // cp-input 由颜色选择器处理
  if (el.type === 'text') return
  applyChange(el)
  sendStyleUpdate()
})

document.addEventListener('change', function(e) {
  var el = e.target
  if (!el.closest || !el.closest('.style-section')) return
  applyChange(el)
  sendStyleUpdate()
})

document.addEventListener('click', function(e) {
  var sw = e.target.closest('.cp-swatch')
  if (sw) {
    e.stopPropagation()
    var forId = sw.getAttribute('data-for')
    if (forId) openColorPopup(forId)
    return
  }
})

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return
  var el = e.target
  if (el.classList.contains('cp-input')) {
    applyChange(el)
    var sw = document.getElementById(el.id + '-swatch')
    if (sw && /^#[0-9a-fA-F]{6}$/.test(el.value)) sw.style.background = el.value
    sendStyleUpdate()
  }
})
document.addEventListener('blur', function(e) {
  var el = e.target
  if (!el.classList.contains('cp-input')) return
  applyChange(el)
  var sw = document.getElementById(el.id + '-swatch')
  if (sw && /^#[0-9a-fA-F]{6}$/.test(el.value)) sw.style.background = el.value
}, true)

connect()
syncUI()

// 禁用右键菜单和文本选择
document.addEventListener('contextmenu', function(e) { e.preventDefault() })
`
}
