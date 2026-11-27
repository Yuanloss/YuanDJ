// ---------- 心率监测工具页面（OBS 捕获简化版） ----------
// 样式默认值（与 defaults.ts 保持一致，作为初始渲染用）
// 后续通过 WebSocket heart-rate-style 消息实时更新
//
// 阴影采用标准 CSS box-shadow 模式（offsetX offsetY blur color），
// 对齐 style.ts 中背景效果的阴影实现。

export function getHeartRatePage(port: number): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>心率</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, 'Microsoft YaHei', sans-serif;
  background: transparent; color: #fff;
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh;
}
.heart-display {
  display: flex; align-items: center;
  gap: var(--hr-gap, 4px);
}
.heart {
  font-size: var(--hr-symbol-size, 48px);
  font-weight: var(--hr-symbol-weight, bold);
  color: var(--hr-symbol-color, #ff4466);
  font-family: var(--hr-symbol-family, -apple-system, 'Microsoft YaHei', sans-serif);
  text-shadow: var(--hr-shadow, 0 0 0 rgba(0,0,0,0));
  transition: transform 0.1s;
  line-height: 1;
}
.heart.beating { animation: beat 1s infinite; }
@keyframes beat {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}
.hr-value {
  font-size: var(--hr-font-size, 48px);
  font-weight: var(--hr-font-weight, bold);
  color: var(--hr-color, #ff4466);
  font-family: var(--hr-number-family, -apple-system, 'Microsoft YaHei', sans-serif);
  text-shadow: var(--hr-shadow, 0 0 0 rgba(0,0,0,0));
  line-height: 1;
}
</style>
</head>
<body>
<div class="heart-display">
  <span class="heart" id="heart">&#x2665;</span>
  <span class="hr-value" id="hrValue">--</span>
</div>
<script>
const WS_URL = 'ws://127.0.0.1:${port}/heart-rate';
let ws = null;

/**
 * 构建标准 CSS text-shadow 字符串
 * 对齐 style.ts 的 buildShadow 实现：offsetX offsetY blur color
 */
function buildShadow(cfg) {
  var ox = cfg.shadowOffsetX || 0;
  var oy = cfg.shadowOffsetY || 0;
  var sb = cfg.shadowSize || 0;
  var sc = cfg.shadowColor || '#000000';
  return ox + 'px ' + oy + 'px ' + sb + 'px ' + sc;
}

/**
 * 根据字体名构建 font-family CSS 值
 * 空字符串使用默认系统字体
 */
function buildFontFamily(fontName) {
  if (!fontName) return "-apple-system, 'Microsoft YaHei', sans-serif";
  return "'" + fontName + "', 'Microsoft YaHei', sans-serif";
}

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'heart-rate-tool') {
        var data = msg.data;
        if (data.type === 'heart_rate') {
          document.getElementById('hrValue').textContent = data.hr;
          document.getElementById('heart').classList.add('beating');
        } else if (data.type === 'disconnected') {
          document.getElementById('heart').classList.remove('beating');
          document.getElementById('hrValue').textContent = '--';
        }
      } else if (msg.type === 'heart-rate-style') {
        var s = msg.data || {};
        var root = document.documentElement;

        // 共享阴影
        var shadow = buildShadow(s);

        // 数字样式
        if (s.color) root.style.setProperty('--hr-color', s.color);
        if (s.fontSize) root.style.setProperty('--hr-font-size', s.fontSize + 'px');
        if (s.fontWeight) root.style.setProperty('--hr-font-weight', s.fontWeight);
        root.style.setProperty('--hr-number-family', buildFontFamily(s.fontFamily));
        root.style.setProperty('--hr-shadow', shadow);

        // 符号样式
        if (s.symbol !== undefined && s.symbol !== null) {
          document.getElementById('heart').textContent = s.symbol;
        }
        if (s.symbolSize) root.style.setProperty('--hr-symbol-size', s.symbolSize + 'px');
        if (s.symbolColor) root.style.setProperty('--hr-symbol-color', s.symbolColor);
        if (s.symbolFontWeight) root.style.setProperty('--hr-symbol-weight', s.symbolFontWeight);
        root.style.setProperty('--hr-symbol-family', buildFontFamily(s.symbolFontFamily));
        // 符号使用相同阴影
        root.style.setProperty('--hr-shadow', shadow);

        // 间距
        if (s.gap != null) root.style.setProperty('--hr-gap', s.gap + 'px');
      }
    } catch (err) { /* ignore */ }
  };
  ws.onclose = function() { setTimeout(connect, 2000); };
  ws.onopen = function() { ws.send(JSON.stringify({ type: 'heart-rate:init' })); };
}
connect();
</script>
</body>
</html>`
}
