<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content" :style="{ opacity: settingsStore.settings.windowOpacity / 100 }">
      <div class="modal-header">
        <h2>设置</h2>
        <button class="close-btn" @click="$emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="modal-layout">
        <!-- 左侧分类标签 -->
        <nav class="settings-nav">
          <button
            v-for="cat in categories"
            :key="cat.id"
            class="nav-item"
            :class="{ active: activeCategory === cat.id }"
            @click="switchCategory(cat.id)"
          >{{ cat.label }}</button>
        </nav>
        <!-- 右侧内容区 -->
        <div ref="settingsBodyRef" class="modal-body" @scroll="onBodyScroll">

        <!-- ==================== 基本 ==================== -->
        <div v-show="activeCategory === 'basic'">

        <!-- 帐号 -->
        <div id="section-account" class="section">
          <h3>帐号</h3>
          <div class="setting-row">
            <span>B站: {{ authStore.authState.bilibili ? authStore.authState.bilibiliUname : '未登录' }}</span>
            <button class="btn" @click="logoutBilibili" v-if="authStore.authState.bilibili">退出登录</button>
          </div>
          <div class="setting-row">
            <span>网易云: {{ authStore.authState.netease ? authStore.authState.neteaseUname : '未登录' }}</span>
            <button class="btn" @click="logoutNetease" v-if="authStore.authState.netease">退出登录</button>
          </div>
        </div>

        <!-- 窗口及外观 -->
        <div id="section-window-appearance" class="section">
          <h3>窗口及外观</h3>
          <div class="setting-row">
            <span>主题</span>
            <button class="btn" @click="settingsStore.toggleTheme()">
              {{ settingsStore.settings.theme === 'dark' ? '暗色' : '亮色' }}
            </button>
          </div>
          <div class="setting-row">
            <span>主题颜色</span>
            <div class="accent-picker-row">
              <ColorPicker :model-value="settingsStore.settings.accentColor" @update:model-value="settingsStore.setAccentColor($event)" />
              <button class="reset-btn" @click="resetAccent()">恢复默认</button>
            </div>
          </div>
          <div class="setting-row">
            <span>窗口置顶</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="alwaysOnTop" @change="toggleAlwaysOnTop" />
              <span class="toggle-text">{{ alwaysOnTop ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>固定大小</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="!isResizable" @change="toggleResizable" />
              <span class="toggle-text">{{ isResizable ? '可调整' : '已固定' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>关闭时收起到托盘</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="settingsStore.settings.closeToTray" @change="toggleCloseToTray" />
              <span class="toggle-text">{{ settingsStore.settings.closeToTray ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>设置窗口透明度</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.windowOpacity }}%</span>
              <input
                type="range"
                min="5"
                max="100"
                :value="settingsStore.settings.windowOpacity"
                @input="onWindowOpacityChange"
                class="range-slider"
              />
              <button class="reset-btn" @click="resetWindowOpacity">恢复默认</button>
            </div>
          </div>
        </div>

        </div><!-- end basic -->


        <!-- ==================== 弹幕窗口 ==================== -->
        <div v-show="activeCategory === 'danmaku-window'">

        <!-- 弹幕窗口设置 -->
        <div id="section-danmaku-window" class="section">
          <h3>弹幕窗口</h3>
          <div class="setting-row">
            <span>弹幕窗口</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="danmakuWindowOpen" @change="toggleDanmakuWindow" />
              <span class="toggle-text">{{ danmakuWindowOpen ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row" v-if="danmakuWindowOpen">
            <span>显示边框</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="danmakuWindowShowBorder" @change="toggleDanmakuWindowShowBorder" />
              <span class="toggle-text">{{ danmakuWindowShowBorder ? '显示' : '隐藏' }}</span>
            </label>
          </div>
          <div class="setting-row" v-if="danmakuWindowOpen">
            <span>固定弹幕窗口</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="danmakuWindowFixed" @change="toggleDanmakuWindowFixed" />
              <span class="toggle-text">{{ danmakuWindowFixed ? '已固定' : '可移动' }}</span>
            </label>
          </div>
          <div class="setting-row" v-if="danmakuWindowOpen && danmakuWindowFixed">
            <span>收起表情及输入栏</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="settingsStore.settings.danmakuWindowCollapseInput" @change="toggleDanmakuWindowCollapseInput" />
              <span class="toggle-text">{{ settingsStore.settings.danmakuWindowCollapseInput ? '已收起' : '显示' }}</span>
            </label>
          </div>
          <div class="setting-row" v-if="danmakuWindowOpen">
            <span>固定窗口快捷键</span>
            <div class="shortcut-row">
              <input
                class="shortcut-input"
                :value="settingsStore.settings.danmakuWindowFixShortcut"
                @keydown.prevent="onShortcutKeyDown"
                placeholder="Alt+B"
                readonly
              />
              <button class="reset-btn" @click="resetFixShortcut">恢复默认</button>
            </div>
          </div>
          <div class="setting-row" v-if="danmakuWindowOpen">
            <span>弹幕背景色</span>
            <div class="accent-picker-row">
              <ColorPicker :model-value="settingsStore.settings.danmakuWindowBgColor" @update:model-value="onDanmakuBgColorChange" show-alpha />
              <button class="reset-btn" @click="resetDanmakuBgColor">恢复默认</button>
            </div>
          </div>
          <div class="setting-row" v-if="danmakuWindowOpen">
            <span>窗口透明度</span>
            <div class="range-row">
              <span class="range-value">{{ danmakuWindowOpacity }}%</span>
              <input type="range" :min="5" :max="100" :value="danmakuWindowOpacity" @input="onDanmakuWindowOpacityChange" class="range-slider" />
            </div>
          </div>
          <p class="section-desc" v-if="danmakuWindowOpen" style="margin-top: 2px;">弹幕窗口为透明底、无边框、置顶显示。固定后鼠标可穿透窗口上半部分，下半部分表情栏和发送框保持可交互。可在固定后选择收起表情及输入栏，仅显示弹幕内容。</p>
        </div>

        </div><!-- end danmaku-window -->


        <!-- ==================== 歌曲 ==================== -->
        <div v-show="activeCategory === 'songs'">

        <!-- 点歌规则 -->
        <div id="section-song-request" class="section">
          <h3>点歌规则</h3>
          <div class="setting-row">
            <span>同用户间隔(秒)</span>
            <input v-model.number="settingsStore.settings.userCooldown" type="number" class="input" />
          </div>
          <div class="setting-row">
            <span>队列上限</span>
            <input v-model.number="settingsStore.settings.maxQueueSize" type="number" class="input" />
          </div>
          <div class="setting-row">
            <span>同歌曲间隔(秒)</span>
            <input v-model.number="settingsStore.settings.songCooldown" type="number" class="input" />
          </div>
          <p class="section-desc">
            弹幕点歌格式：<b>点歌 歌名</b> / <b>点歌 歌名 歌手</b> / <b>点歌 网易云ID</b> / <b>点歌 BV号</b> /
            <b>点歌 BV号 p3</b>（点该视频的第 3 个分P；分P不存在时回退第一P）。
          </p>
        </div>

        <!-- 空闲歌单设置 -->
        <div id="section-idle" class="section">
          <h3>空闲歌单</h3>
          <div class="setting-row">
            <span>显示空闲歌曲</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="settingsStore.settings.showIdleSongs" @change="settingsStore.settings.showIdleSongs = !settingsStore.settings.showIdleSongs" />
              <span class="toggle-text">{{ settingsStore.settings.showIdleSongs ? '显示' : '隐藏' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>待选数量</span>
            <div class="range-row">
              <span class="range-value">{{ idleQueueSize }} 首</span>
              <input
                type="range"
                min="2"
                max="5"
                v-model.number="idleQueueSize"
                @change="saveIdleQueueSize"
                class="range-slider"
              />
            </div>
          </div>
        </div>

        <!-- 音视频缓存 -->
        <div id="section-cache" class="section">
          <h3>音视频缓存 <span class="cache-count">({{ cacheSongs.length }}/20)</span></h3>
          <div class="cache-list" v-if="cacheSongs.length > 0">
            <div v-for="(entry, i) in cacheSongs" :key="entry.songId" class="cache-item">
              <button class="add-btn" @click="playCached(entry)" title="添加到队列">+</button>
              <span class="cache-idx">{{ i + 1 }}</span>
              <span class="cache-type" :class="{ 'type-video': entry.songId?.startsWith?.('bv_'), 'type-mv': !entry.songId?.startsWith?.('bv_') && entry.hasMv, 'type-audio': !entry.songId?.startsWith?.('bv_') && !entry.hasMv && entry.hasAudio }">
                {{ entry.songId?.startsWith?.('bv_') ? '视频' : entry.hasMv ? 'MV' : '音频' }}
              </span>
              <span class="cache-title">{{ entry.title || '(未知)' }}</span>
              <span class="cache-artist">{{ entry.artist }}</span>
              <span class="cache-size">{{ formatSize(entry.size) }}</span>
            </div>
          </div>
          <div v-else class="cache-empty">暂无缓存文件</div>
          <button v-if="cacheSongs.length > 0" class="btn clear-cache-btn" @click="clearAllCache">清空缓存</button>
          <p class="section-desc" style="margin-top: 6px;">自动缓存队列后续歌曲（含音频与MV），最多20首，超出自动清理。点击 + 添加到队列</p>
        </div>

        </div><!-- end songs -->


        <!-- ==================== 播放器 ==================== -->
        <div v-show="activeCategory === 'player'">

        <!-- 歌词 -->
        <div id="section-lyric" class="section">
          <h3>歌词</h3>
          <div class="setting-row">
            <span>显示翻译</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="settingsStore.settings.showLyricTranslation" @change="toggleTranslation" />
              <span class="toggle-text">{{ settingsStore.settings.showLyricTranslation ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>翻译分行</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="settingsStore.settings.splitLyricTranslation" @change="toggleSplitTranslation" />
              <span class="toggle-text">{{ settingsStore.settings.splitLyricTranslation ? '分两行' : '合并为一行' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>歌词延迟</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.lyricDelay }}ms</span>
              <input
                type="range"
                min="0"
                max="1000"
                step="10"
                v-model.number="settingsStore.settings.lyricDelay"
                class="range-slider"
              />
            </div>
          </div>
          <div class="setting-row">
            <span>段落间距</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.lyricLineSpacing }}px</span>
              <input
                type="range"
                min="0"
                max="50"
                v-model.number="settingsStore.settings.lyricLineSpacing"
                class="range-slider"
              />
            </div>
          </div>
          <div class="setting-row">
            <span>非焦点歌词透明度</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.lyricInactiveOpacity }}%</span>
              <input
                type="range"
                min="5"
                max="100"
                v-model.number="settingsStore.settings.lyricInactiveOpacity"
                class="range-slider"
              />
            </div>
          </div>
        </div>

        <!-- 歌词样式 + 翻译样式（两列布局） -->
        <div id="section-lyric-style" class="section">
          <h3>歌词样式</h3>
          <div class="lyric-style-grid" :class="{ 'single-col': !showTranslationStyle }">
            <!-- 左列：歌词样式 -->
            <div class="lyric-style-col">
              <h4 class="lyric-sub-title" v-if="showTranslationStyle">歌词样式</h4>
              <div class="setting-row">
                <span>颜色</span>
                <div class="accent-picker-row">
                  <ColorPicker :model-value="settingsStore.settings.lyricColor || ''" @update:model-value="settingsStore.settings.lyricColor = $event" />
                  <button class="reset-btn" @click="resetLyricColor">恢复默认</button>
                </div>
              </div>
              <div class="setting-row">
                <span>描边颜色</span>
                <div class="accent-picker-row">
                  <ColorPicker :model-value="settingsStore.settings.lyricStrokeColor" @update:model-value="settingsStore.settings.lyricStrokeColor = $event" show-alpha />
                  <button class="reset-btn" @click="resetLyricStrokeColor">恢复默认</button>
                </div>
              </div>
              <div class="setting-row">
                <span>描边宽度</span>
                <div class="range-row">
                  <span class="range-value">{{ settingsStore.settings.lyricStrokeWidth }}px</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    v-model.number="settingsStore.settings.lyricStrokeWidth"
                    class="range-slider"
                  />
                </div>
              </div>
              <div class="setting-row">
                <span>描边模糊</span>
                <div class="range-row">
                  <span class="range-value">{{ settingsStore.settings.lyricStrokeBlur }}px</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    v-model.number="settingsStore.settings.lyricStrokeBlur"
                    class="range-slider"
                  />
                </div>
              </div>
              <div class="setting-row">
                <span>字体大小</span>
                <div class="range-row">
                  <span class="range-value">{{ settingsStore.settings.lyricFontSize }}px</span>
                  <input
                    type="range"
                    min="10"
                    max="30"
                    v-model.number="settingsStore.settings.lyricFontSize"
                    class="range-slider"
                  />
                </div>
              </div>
              <div class="setting-row">
                <span>字重</span>
                <CustomSelect
                  :model-value="settingsStore.settings.lyricFontWeight"
                  :options="fontWeightOptions"
                  @update:model-value="settingsStore.settings.lyricFontWeight = String($event)"
                />
              </div>
            </div>

            <!-- 右列：翻译样式（仅显示翻译且翻译为分行时显示） -->
            <div
              class="lyric-style-col"
              v-if="showTranslationStyle"
            >
              <h4 class="lyric-sub-title">翻译样式</h4>
              <div class="setting-row">
                <span>颜色</span>
                <div class="accent-picker-row">
                  <ColorPicker :model-value="settingsStore.settings.lyricTransColor || ''" @update:model-value="settingsStore.settings.lyricTransColor = $event" />
                  <button class="reset-btn" @click="resetLyricTransColor">恢复默认</button>
                </div>
              </div>
              <div class="setting-row">
                <span>描边颜色</span>
                <div class="accent-picker-row">
                  <ColorPicker :model-value="settingsStore.settings.lyricTransStrokeColor" @update:model-value="settingsStore.settings.lyricTransStrokeColor = $event" show-alpha />
                  <button class="reset-btn" @click="resetLyricTransStrokeColor">恢复默认</button>
                </div>
              </div>
              <div class="setting-row">
                <span>描边宽度</span>
                <div class="range-row">
                  <span class="range-value">{{ settingsStore.settings.lyricTransStrokeWidth }}px</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    v-model.number="settingsStore.settings.lyricTransStrokeWidth"
                    class="range-slider"
                  />
                </div>
              </div>
              <div class="setting-row">
                <span>描边模糊</span>
                <div class="range-row">
                  <span class="range-value">{{ settingsStore.settings.lyricTransStrokeBlur }}px</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    v-model.number="settingsStore.settings.lyricTransStrokeBlur"
                    class="range-slider"
                  />
                </div>
              </div>
              <div class="setting-row">
                <span>字体大小</span>
                <div class="range-row">
                  <span class="range-value">{{ settingsStore.settings.lyricTransFontSize }}px</span>
                  <input
                    type="range"
                    min="8"
                    max="26"
                    v-model.number="settingsStore.settings.lyricTransFontSize"
                    class="range-slider"
                  />
                </div>
              </div>
              <div class="setting-row">
                <span>字重</span>
                <CustomSelect
                  :model-value="settingsStore.settings.lyricTransFontWeight"
                  :options="fontWeightOptions"
                  @update:model-value="settingsStore.settings.lyricTransFontWeight = String($event)"
                />
              </div>
            </div>
          </div>
          <p class="section-desc" v-if="!showTranslationStyle">
            翻译样式仅在「显示翻译」且「翻译分行」开启时生效。
          </p>
        </div>

        <!-- 歌词背景 -->
        <div id="section-lyric-bg" class="section">
          <h3>歌词背景</h3>
          <div class="setting-row">
            <span>启用背景图</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="settingsStore.settings.lyricBgEnabled" @change="settingsStore.settings.lyricBgEnabled = !settingsStore.settings.lyricBgEnabled" />
              <span class="toggle-text">{{ settingsStore.settings.lyricBgEnabled ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div v-if="settingsStore.settings.lyricBgEnabled" class="setting-row">
            <span>背景来源</span>
            <CustomSelect
              :model-value="settingsStore.settings.lyricBgSource"
              :options="bgSourceOptions"
              @update:model-value="onLyricBgSourceChange($event)"
            />
          </div>
          <div v-if="settingsStore.settings.lyricBgEnabled && settingsStore.settings.lyricBgSource === 'local'" class="setting-row">
            <span>背景图片</span>
            <div class="path-row">
              <input
                type="text"
                v-model="settingsStore.settings.lyricBgPath"
                class="input input-path"
                placeholder="点击右侧按钮选择图片..."
                readonly
              />
              <button class="btn" @click="selectLyricBgImage">选择</button>
            </div>
          </div>
          <div v-if="settingsStore.settings.lyricBgEnabled" class="setting-row">
            <span>对齐方式</span>
            <CustomSelect
              :model-value="settingsStore.settings.lyricBgAlign"
              :options="bgAlignOptions"
              @update:model-value="settingsStore.settings.lyricBgAlign = $event as 'cover' | 'contain' | 'tile'"
            />
          </div>
          <div v-if="settingsStore.settings.lyricBgEnabled" class="setting-row">
            <span>亮度</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.lyricBgBrightness }}%</span>
              <input
                type="range"
                min="30"
                max="130"
                v-model.number="settingsStore.settings.lyricBgBrightness"
                class="range-slider"
              />
            </div>
          </div>
          <div v-if="settingsStore.settings.lyricBgEnabled" class="setting-row">
            <span>模糊度</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.lyricBgBlur }}px</span>
              <input
                type="range"
                min="0"
                max="10"
                v-model.number="settingsStore.settings.lyricBgBlur"
                class="range-slider"
              />
            </div>
          </div>
          <div v-if="settingsStore.settings.lyricBgEnabled" class="setting-row">
            <span>不透明度</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.lyricBgOpacity }}%</span>
              <input
                type="range"
                min="5"
                max="100"
                v-model.number="settingsStore.settings.lyricBgOpacity"
                class="range-slider"
              />
            </div>
          </div>
        </div>

        <!-- MV 模式 -->
        <div id="section-mv-mode" class="section">
          <h3>MV 模式</h3>
          <div class="setting-row">
            <span>启用MV模式</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="settingsStore.settings.mvMode" @change="settingsStore.settings.mvMode = !settingsStore.settings.mvMode" />
              <span class="toggle-text">{{ settingsStore.settings.mvMode ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row" v-if="settingsStore.settings.mvMode">
            <span>音频来源</span>
            <CustomSelect
              :model-value="settingsStore.settings.mvAudioSource"
              :options="mvAudioSourceOptions"
              @update:model-value="settingsStore.settings.mvAudioSource = $event as 'mv' | 'original'"
            />
          </div>
          <p class="section-desc mv-audio-desc" v-if="settingsStore.settings.mvMode">
            开启后，网易云歌曲有 MV 时自动用视频替换歌词画面。<br/>
            <span class="mv-source-tag">MV 音频</span>：直接使用 MV 自带的音轨，音视频天然同步；但 MV 时长与原曲可能略有差异，<span class="mv-warn">可能导致歌词与画面不同步</span>。<br/>
            <span class="mv-source-tag">原始音频</span>：音质更高；但可能与 MV 画面不同步，且需消耗更多存储、网络与 CPU 资源。
          </p>
        </div>

        <!-- 播放区外观 -->
        <div id="section-player-appearance" class="section">
          <h3>播放区外观</h3>
          <div class="setting-row">
            <span>播放时播放区背景透明</span>
            <label class="toggle-label">
              <input
                type="checkbox"
                :checked="settingsStore.settings.playerTransparent"
                @change="settingsStore.settings.playerTransparent = !settingsStore.settings.playerTransparent"
              />
              <span class="toggle-text">{{ settingsStore.settings.playerTransparent ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <p class="section-desc">
            开启后，播放歌曲时只有右侧的歌词/视频区域背景透明（可透出桌面），其他区域保持不透明；<br/>
            播放区右上角还有「置顶」和「只显示」两个按钮：置顶会把窗口钉在最上层并自动切到精简模式（只留视频/歌词 + 控制栏）。
          </p>
        </div>

        </div><!-- end player -->


        <!-- ==================== 弹幕 ==================== -->
        <div v-show="activeCategory === 'danmaku'">

        <!-- 常规 -->
        <div id="section-danmaku-general" class="section">
          <h3>常规</h3>
          <div class="setting-row">
            <span>显示弹幕</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.showDanmaku" />
              <span class="toggle-text">{{ settingsStore.settings.showDanmaku ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>显示付费消息</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.showPaidMessages" />
              <span class="toggle-text">{{ settingsStore.settings.showPaidMessages ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>最低付费价格</span>
            <div class="input-with-unit">
              <input v-model.number="settingsStore.settings.minPaidMessagePrice" type="number" class="input" min="0" step="0.1" />
              <span class="unit">元</span>
            </div>
          </div>
          <div class="setting-row">
            <span>最多显示消息数</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.maxDanmakuCount }}</span>
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                v-model.number="settingsStore.settings.maxDanmakuCount"
                class="range-slider"
              />
            </div>
          </div>
          <div class="setting-row">
            <span>合并相似弹幕</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.mergeSimilarDanmaku" />
              <span class="toggle-text">{{ settingsStore.settings.mergeSimilarDanmaku ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>合并连续礼物</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.mergeSimilarGift" />
              <span class="toggle-text">{{ settingsStore.settings.mergeSimilarGift ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
        </div>

        <!-- 屏蔽 -->
        <div id="section-danmaku-block" class="section">
          <h3>屏蔽</h3>
          <div class="setting-row">
            <span>屏蔽礼物弹幕</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.blockGiftDanmaku" />
              <span class="toggle-text">{{ settingsStore.settings.blockGiftDanmaku ? '已屏蔽' : '未屏蔽' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>用户等级屏蔽</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.blockLevel }}</span>
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                v-model.number="settingsStore.settings.blockLevel"
                class="range-slider"
              />
            </div>
          </div>
          <div class="setting-row">
            <span>粉丝牌等级屏蔽</span>
            <div class="range-row">
              <span class="range-value">{{ settingsStore.settings.blockMedalLevel }}</span>
              <input
                type="range"
                min="0"
                max="120"
                step="1"
                v-model.number="settingsStore.settings.blockMedalLevel"
                class="range-slider"
              />
            </div>
          </div>
          <div class="setting-row">
            <span>屏蔽关键词</span>
          </div>
          <div class="setting-row">
            <textarea
              v-model="settingsStore.settings.blockKeywords"
              class="textarea"
              rows="4"
              placeholder="每行一个关键词"
            ></textarea>
          </div>
          <div class="setting-row">
            <span>屏蔽用户</span>
          </div>
          <div class="setting-row">
            <textarea
              v-model="settingsStore.settings.blockUsers"
              class="textarea"
              rows="4"
              placeholder="每行一个用户UID"
            ></textarea>
          </div>
        </div>

        <!-- 高级 -->
        <div id="section-danmaku-advanced" class="section">
          <h3>高级</h3>
          <div class="setting-row">
            <span>显示礼物名</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.showGiftName" />
              <span class="toggle-text">{{ settingsStore.settings.showGiftName ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>显示弹幕时间</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.showDanmakuTime" />
              <span class="toggle-text">{{ settingsStore.settings.showDanmakuTime ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>显示调试信息</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.showDebugMessages" />
              <span class="toggle-text">{{ settingsStore.settings.showDebugMessages ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>自定义 CSS</span>
          </div>
          <div class="setting-row">
            <textarea
              v-model="settingsStore.settings.customDanmakuCss"
              class="textarea css-textarea"
              rows="20"
              placeholder="/* 在此输入自定义 CSS */"
            ></textarea>
          </div>
          <p class="section-desc" style="margin-top: 4px;">自定义 CSS 将注入到 blive.chat 弹幕 iframe 中，覆盖默认弹幕样式。输入后即时生效。</p>
          <button class="btn" style="margin-top: 6px;" @click="resetDanmakuCss">重置为默认</button>
        </div>

        </div><!-- end danmaku -->


        <!-- ==================== OBS ==================== -->
        <div v-show="activeCategory === 'obs'">

        <!-- OBS 捕获 -->
        <div id="section-obs-overlay" class="section">
          <h3>OBS 捕获</h3>
          <div class="setting-row">
            <span>启用 HTTP 服务（实时推送到 OBS 浏览器源）</span>
            <label class="toggle-label">
              <input type="checkbox" v-model="settingsStore.settings.obsOverlayEnabled" @change="onObsOverlayToggled($event)" />
              <span class="toggle-text">{{ settingsStore.settings.obsOverlayEnabled ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <template v-if="settingsStore.settings.obsOverlayEnabled">
            <div class="setting-row">
              <span>样式设置地址</span>
              <div class="path-row">
                <input :value="obsPort > 0 ? `http://localhost:${obsPort}/style` : ''" readonly class="input input-path" style="max-width: 249px" placeholder="http://localhost:4680/style" />
                <button class="btn" @click="copyObsUrl('style')">复制</button>
                <button class="btn" @click="openStyleWindow">打开</button>
              </div>
            </div>
            <p class="section-desc">
              打开「样式设置地址」可调整各捕获页面的字体、颜色等样式。
            </p>
            <div class="setting-row">
              <span>歌词捕获</span>
              <div class="path-row">
                <input :value="obsPort > 0 ? `http://localhost:${obsPort}/lyric` : ''" readonly class="input input-path" placeholder="http://localhost:4680/lyric" />
                <button class="btn" @click="copyObsUrl('lyric')">复制</button>
              </div>
            </div>
            <div class="setting-row">
              <span>队列捕获</span>
              <div class="path-row">
                <input :value="obsPort > 0 ? `http://localhost:${obsPort}/queue` : ''" readonly class="input input-path" placeholder="http://localhost:4680/queue" />
                <button class="btn" @click="copyObsUrl('queue')">复制</button>
              </div>
            </div>
            <div class="setting-row">
              <span>歌曲信息捕获</span>
              <div class="path-row">
                <input :value="obsPort > 0 ? `http://localhost:${obsPort}/songinfo` : ''" readonly class="input input-path" placeholder="http://localhost:4680/songinfo" />
                <button class="btn" @click="copyObsUrl('songinfo')">复制</button>
              </div>
            </div>
            <p class="section-desc">
              将歌词/队列/歌曲地址粘贴到 OBS「浏览器」源即可实时捕获。
            </p>
          </template>
        </div>
        <!-- 弹幕捕获 -->
        <div id="section-danmaku-capture" class="section">
          <h3>弹幕捕获</h3>
          <div class="setting-row">
            <span>身份码</span>
            <div class="path-row">
              <input
                v-model="settingsStore.settings.identityCode"
                :type="showIdentityCode ? 'text' : 'password'"
                class="input input-path"
                style="width: 266px;"
                placeholder="点击「获取」自动填写"
              />
              <button class="btn icon-btn" @click="showIdentityCode = !showIdentityCode" :title="showIdentityCode ? '隐藏' : '显示'">
                <svg v-if="showIdentityCode" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button class="btn" @click="fetchIdentityCode" :disabled="idCodeLoading">
                {{ idCodeLoading ? '加载' : '获取' }}
              </button>
            </div>
          </div>
          <p class="section-desc" style="margin-top: 2px;">
            身份码用于 blivechat 弹幕捕获，登录后自动获取。获取失败可在 <a href="https://link.bilibili.com/#/my-room/start-live" target="_blank" class="link">开播设置</a> 查看并手动填入。
          </p>
          <div class="setting-row">
            <span>blivechat地址</span>
            <div class="path-row">
              <input
                readonly
                :type="showBlivechatUrl ? 'text' : 'password'"
                class="input input-path"
                style="width: 266px;"
                :value="blivechatUrl"
              />
              <button class="btn icon-btn" @click="showBlivechatUrl = !showBlivechatUrl" :title="showBlivechatUrl ? '隐藏' : '显示'">
                <svg v-if="showBlivechatUrl" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button class="btn" @click="copyText(blivechatUrl)">复制</button>
            </div>
          </div>
          <p class="section-desc">
            将此地址粘贴到 OBS「浏览器」源，即可在直播画面中捕获弹幕。
          </p>
          <div class="setting-row">
            <span>blivechat CSS</span>
            <div class="path-row">
              <input
                readonly
                class="input input-path"
                placeholder="https://blive.chat/stylegen"
              />
              <button class="btn" @click="copyText('https://blive.chat/stylegen')">复制</button>
            </div>
          </div>
          <p class="section-desc">
            打开 blivechat 样式生成器，生成自定义 CSS 后粘贴到 OBS 浏览器源的「自定义 CSS」中。
          </p>
          <div class="setting-row">
            <span>自定义 CSS</span>
          </div>
          <div class="setting-row">
            <textarea
              v-model="settingsStore.settings.customDanmakuCss"
              class="textarea css-textarea"
              rows="12"
              placeholder="/* 将 blivechat/stylegen 生成的 CSS 粘贴到这里 */"
            ></textarea>
          </div>
          <p class="section-desc">
            此 CSS 将注入到 in-app 弹幕显示以及 OBS 浏览器源中。修改后即时生效。
          </p>
        </div>

        </div><!-- end obs -->


        <!-- ==================== OBS 小工具 ==================== -->
        <div v-show="activeCategory === 'obs-tools'">

        <!-- 心率监测 -->
        <div id="section-heart-rate" class="section">
          <h3>心率监测</h3>
          <div class="setting-row">
            <span>当前心率</span>
            <div class="heart-rate-display">
              <span class="status-text" :class="{ connected: heartRateValue > 0 }">
                {{ heartRateValue > 0 ? heartRateValue + ' 次/分' : '--' }}
              </span>
              <button class="btn" :disabled="heartRateConnecting" @click="toggleHeartRateConnection">
                {{ heartRateConnecting ? '连接中…' : (heartRateConnected ? '断开' : '连接') }}
              </button>
            </div>
          </div>
          <p class="section-desc hr-status" v-if="heartRateStatus">{{ heartRateStatus }}</p>
          <div class="setting-row">
            <span>蓝牙设备</span>
            <div class="device-row">
              <CustomSelect
                :model-value="heartRateDevice"
                :options="heartRateDeviceOptions"
                @update:model-value="heartRateDevice = String($event)"
              />
              <button class="btn" @click="scanHeartRateDevices">扫描</button>
            </div>
          </div>
          <div class="setting-row">
            <span>捕获地址</span>
            <div class="path-row">
              <input :value="obsPort > 0 ? `http://localhost:${obsPort}/heart-rate` : ''" readonly class="input input-path" placeholder="http://localhost:4680/heart-rate" />
              <button class="btn" @click="copyObsUrl('heart-rate')">复制</button>
            </div>
          </div>
          <div class="setting-row">
            <span>样式设置地址</span>
            <div class="path-row">
              <input :value="obsPort > 0 ? `http://localhost:${obsPort}/heart-rate-style` : ''" readonly class="input input-path" style="max-width: 249px" placeholder="http://localhost:4680/heart-rate-style" />
              <button class="btn" @click="copyHeartRateStyleUrl">复制</button>
              <button class="btn" @click="openHeartRateStyleWindow">打开</button>
            </div>
          </div>
          <p class="section-desc">
            打开「样式设置地址」可调整心率工具的符号、数字、描边、字体等样式。
          </p>

          <!-- 接入 OBS 简要说明 -->
          <div class="hr-obs-guide">
            <div class="guide-title">如何在 OBS 里显示心率</div>
            <ol>
              <li>先到「OBS捕获」页勾选<b>启用 HTTP 服务</b>，上方的「捕获地址」才会可用（当前端口：{{ obsPort > 0 ? obsPort : '未启动' }}）。</li>
              <li>手环戴好并在广播/运动状态，点<b>扫描</b>选中设备，再点<b>连接</b>；「当前心率」出现数字即成功。</li>
              <li>OBS 里「来源 → + → 浏览器」，URL 粘贴上面的<b>捕获地址</b>，宽高建议 400 × 140。</li>
              <li>页面背景是透明的，直接叠在画面上即可；颜色/字体/符号点「样式设置地址」后的<b>打开</b>调整，OBS 会实时刷新。</li>
              <li>主界面标题栏右侧也有心率显示，点它可以直接回到这里。</li>
            </ol>
          </div>
        </div>

        </div><!-- end obs-tools -->


        <!-- ==================== 关于 ==================== -->
        <div v-show="activeCategory === 'about'">

        <!-- 关于 -->
        <div id="section-about" class="section">
          <h3>关于</h3>
          <div class="about-header">
            <span class="about-text">
              <b>YuanDJ</b> v{{ appVersion }} by Yuanloss<br/>
              基于 <a class="thanks-link" href="#" @click.prevent="openLink('https://github.com/Taumata-wwq/BxNcm-DJ')">BxNcm DJ</a>（原作者 <b>Taumata</b>）修改 · MIT License<br/>
              技术栈: Vue3 + Electron + TypeScript
            </span>
            <div class="about-thanks">
              <span class="thanks-label">致谢:</span>
              <a class="thanks-link" href="#" @click.prevent="openLink('https://github.com/Taumata-wwq/BxNcm-DJ')">BxNcm DJ (Taumata)</a>
              <a class="thanks-link" href="#" @click.prevent="openLink('https://github.com/xfgryujk/blivechat')">blivechat</a>
              <a class="thanks-link" href="#" @click.prevent="openLink('https://github.com/Zeppelinpp/bilibili-streamer')">bilibili-streamer</a>
              <a class="thanks-link" href="#" @click.prevent="openLink('https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced')">api-enhanced</a>
              <a class="thanks-link" href="#" @click.prevent="openLink('https://github.com/smathsp/UserScript')">UserScript</a>
            </div>
          </div>
          <div class="setting-row">
            <span>配置管理</span>
            <div class="about-actions">
              <button class="btn" @click="exportConfig">导出配置</button>
              <button class="btn" @click="importConfig">导入配置</button>
              <button class="btn reset-data-btn" @click="resetAllData">重置数据</button>
            </div>
          </div>
          <div class="setting-row">
            <span>自动检查更新</span>
            <label class="toggle-label">
              <input type="checkbox" :checked="settingsStore.settings.autoUpdate" @change="toggleAutoUpdate" />
              <span class="toggle-text">{{ settingsStore.settings.autoUpdate ? '已开启' : '已关闭' }}</span>
            </label>
          </div>
          <div class="setting-row">
            <span>检查更新</span>
            <div class="update-actions">
              <button class="btn" @click="checkForUpdates" :disabled="updateStatus === 'checking' || updateStatus === 'downloading'">
                {{ updateStatus === 'checking' ? '检查中...' : '检查更新' }}
              </button>
              <span v-if="updateStatus === 'available'" class="update-info">
                发现新版本 v{{ updateVersion }}
                <button class="btn" @click="downloadUpdate" style="margin-left: 6px;">下载更新</button>
              </span>
              <span v-if="updateStatus === 'not-available'" class="update-info">{{ updateMessage || '已是最新版本' }}</span>
              <span v-if="updateStatus === 'downloading'" class="update-info">下载中 {{ updateProgress }}%</span>
              <span v-if="updateStatus === 'downloaded'" class="update-info">
                下载完成
                <button class="btn" @click="installUpdate" style="margin-left: 6px;">立即安装</button>
              </span>
              <span v-if="updateStatus === 'error'" class="update-info update-error">{{ updateMessage || '检查更新失败' }}</span>
            </div>
          </div>
          <div class="setting-row">
            <span>开发工具</span>
            <button class="btn dev-btn" @click="openDevTools">开发者工具</button>
          </div>
        </div>

        <!-- 日志 -->
        <div id="section-log" class="section">
          <h3>日志</h3>
          <div ref="logContainerRef" class="log-container">
            <div v-for="(log, i) in danmakuStore.logs" :key="i" class="log-line">{{ log }}</div>
            <div v-if="danmakuStore.logs.length === 0" class="log-empty">暂无日志</div>
          </div>
        </div>

        </div><!-- end about -->
      </div><!-- end modal-body -->
      </div><!-- end modal-layout -->
    </div>
  </div>

  <!-- 重置数据确认弹窗 -->
  <ConfirmDialog
    v-if="showResetConfirm"
    title="重置数据"
    message="此操作将清除所有本地数据（数据库、缓存、操作记录、设置项），仅保留登录状态。确认后程序将自动重启。"
    @confirm="handleResetConfirm"
    @cancel="showResetConfirm = false"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useDanmakuStore } from '../../stores/danmaku.store'
import ColorPicker from './ColorPicker.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import CustomSelect from './CustomSelect.vue'
import defaultDanmakuCss from '../../assets/styles/danmaku.css?raw'

const emit = defineEmits(['close'])
const router = useRouter()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const danmakuStore = useDanmakuStore()
const showToast = inject<(message: string, type?: 'info' | 'success' | 'error' | 'warning', duration?: number) => void>('showToast', () => {})

// 版本号（由 vite 注入的全局常量）
const appVersion = __APP_VERSION__

// 设置面板位置记忆：仅内存中持久化（UI 状态，不写入磁盘）
// 跨多次打开/关闭保留上次停留的分类与滚动位置
const settingsMemory = {
  category: 'basic',
  scrollTop: 0,
}

const cacheSongs = ref<any[]>([])
const alwaysOnTop = ref(false)
const isResizable = ref(true)
const idleQueueSize = ref(3)
const obsPort = ref(0)
const danmakuWindowOpen = ref(false)
const danmakuWindowFixed = ref(false)
const danmakuWindowShowBorder = ref(true)
const danmakuWindowOpacity = ref(100)
const logContainerRef = ref<HTMLElement | null>(null)
const settingsBodyRef = ref<HTMLElement | null>(null)
const activeCategory = ref(settingsMemory.category)
const idCodeLoading = ref(false)
// 身份码与 blivechat 地址默认遮盖，每次进入设置需手动点击小眼睛查看
const showIdentityCode = ref(false)
const showBlivechatUrl = ref(false)
let navLocked = false
let navLockTimer: ReturnType<typeof setTimeout> | null = null

// 心率监测
const heartRateDevices = ref<{ id: string; name: string; address: string; model: string }[]>([])
const heartRateDevice = ref('')
const heartRateConnected = ref(false)
const heartRateValue = ref(0)
const heartRateConnecting = ref(false)
const heartRateStatus = ref('')
let heartRateConnectTimer: ReturnType<typeof setTimeout> | null = null
let heartRateWs: WebSocket | null = null

// CustomSelect 选项
const fontWeightOptions = [
  { value: 'normal', label: '正常' },
  { value: 'bold', label: '粗体' },
  { value: '300', label: '细体' },
]
const bgAlignOptions = [
  { value: 'cover', label: '拉伸覆盖' },
  { value: 'contain', label: '完整显示' },
  { value: 'tile', label: '平铺' },
]
const bgSourceOptions = [
  { value: 'local', label: '本地图片' },
  { value: 'cover', label: '当前封面' },
]
const mvAudioSourceOptions = [
  { value: 'mv', label: 'MV 音频' },
  { value: 'original', label: '原始高音质音频' },
]
const heartRateDeviceOptions = computed(() => {
  if (heartRateDevices.value.length === 0) {
    return [{ value: '', label: '未扫描' }]
  }
  return heartRateDevices.value.map(d => {
    const parts = [d.name]
    if (d.model) parts.push(d.model)
    if (d.address) parts.push(`[${d.address}]`)
    return { value: d.id, label: parts.join(' ') }
  })
})

// 是否显示翻译样式设置（仅当显示翻译且翻译为分行时才显示翻译样式列）
const showTranslationStyle = computed(() =>
  settingsStore.settings.showLyricTranslation && settingsStore.settings.splitLyricTranslation
)

// 自动更新状态
const updateStatus = ref<string>('')  // '', 'checking', 'available', 'not-available', 'downloading', 'downloaded', 'error'
const updateVersion = ref<string>('')
const updateProgress = ref<number>(0)
const updateMessage = ref<string>('')

/** 计算 blivechat 地址：基于身份码 + 完整弹幕设置 */
const blivechatUrl = computed(() => {
  const code = settingsStore.settings.identityCode
  if (!code) return ''
  const s = settingsStore.settings
  const params = new URLSearchParams()
  params.set('roomKeyType', '2')
  params.set('lang', s.blivechatLang || 'zh')
  // 显示控制
  params.set('showDanmaku', s.showDanmaku ? 'true' : 'false')
  params.set('showGift', s.showPaidMessages ? 'true' : 'false')
  params.set('showGiftName', s.showGiftName ? 'true' : 'false')
  params.set('mergeSimilarDanmaku', s.mergeSimilarDanmaku ? 'true' : 'false')
  params.set('mergeGift', s.mergeSimilarGift ? 'true' : 'false')
  params.set('maxNumber', String(s.maxDanmakuCount))
  params.set('minGiftPrice', String(s.minPaidMessagePrice))
  // 屏蔽
  params.set('blockGiftDanmaku', s.blockGiftDanmaku ? 'true' : 'false')
  params.set('blockMirrorMessages', s.blockMirrorMessages ? 'true' : 'false')
  params.set('blockLevel', String(s.blockLevel))
  params.set('blockMedalLevel', String(s.blockMedalLevel))
  params.set('blockNewbie', s.blockNewbie ? 'true' : 'false')
  params.set('blockNotMobileVerified', s.blockNotMobileVerified ? 'true' : 'false')
  if (s.blockKeywords) params.set('blockKeywords', s.blockKeywords)
  if (s.blockUsers) params.set('blockUsers', s.blockUsers)
  // 调试
  params.set('showDebugMessages', s.showDebugMessages ? 'true' : 'false')
  // 通过服务器转发消息（推荐，减少连接数）
  params.set('relayMessagesByServer', 'true')
  return `https://blive.chat/room/${code}?${params.toString()}`
})

// 分类标签
const categories = [
  { id: 'basic', label: '基础设置' },
  { id: 'danmaku-window', label: '弹幕窗口' },
  { id: 'songs', label: '点歌设置' },
  { id: 'player', label: '播放器' },
  { id: 'danmaku', label: '弹幕设置' },
  { id: 'obs', label: 'OBS捕获' },
  { id: 'obs-tools', label: '小工具' },
  { id: 'about', label: '关于' },
]

// section ID → 分类 ID 映射（用于滚动高亮）
const sectionToCategory: Record<string, string> = {
  'account': 'basic',
  'window-appearance': 'basic',
  'danmaku-window': 'danmaku-window',
  'song-request': 'songs',
  'idle': 'songs',
  'cache': 'songs',
  'lyric': 'player',
  'lyric-style': 'player',
  'mv-mode': 'player',
  'player-appearance': 'player',
  'lyric-bg': 'player',
  'danmaku-general': 'danmaku',
  'danmaku-block': 'danmaku',
  'danmaku-advanced': 'danmaku',
  'obs-overlay': 'obs',
  'danmaku-capture': 'obs',
  'heart-rate': 'obs-tools',
  'heart-rate-style': 'obs-tools',
  'about': 'about',
  'log': 'about',
}

// 每个分类的第一个 section（用于 switchCategory 时滚动定位）
const categoryFirstSection: Record<string, string> = {
  'basic': 'account',
  'danmaku-window': 'danmaku-window',
  'songs': 'song-request',
  'player': 'lyric',
  'danmaku': 'danmaku-general',
  'obs': 'obs-overlay',
  'obs-tools': 'heart-rate',
  'about': 'about',
}

/** 点击分类标签，切换视图并滚动到该分类第一个 section */
function switchCategory(catId: string) {
  activeCategory.value = catId
  navLocked = true
  if (navLockTimer) clearTimeout(navLockTimer)
  navLockTimer = setTimeout(() => { navLocked = false }, 600)
  const firstSectionId = categoryFirstSection[catId]
  if (firstSectionId) {
    const el = document.getElementById(`section-${firstSectionId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

/** 从主界面心率胶囊等入口跳转：定位到指定 section 并高亮一下 */
function applySettingsTarget() {
  const target = authStore.settingsTarget
  if (!target) return
  authStore.settingsTarget = ''
  activeCategory.value = sectionToCategory[target] || 'basic'
  setTimeout(() => {
    const el = document.getElementById(`section-${target}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'auto', block: 'start' })
    el.classList.add('section-flash')
    setTimeout(() => el.classList.remove('section-flash'), 1600)
  }, 120)
}

// 设置已处于打开状态时再点入口（例如标题栏心率胶囊），同样能跳转
watch(() => authStore.settingsTarget, (t) => { if (t) applySettingsTarget() })

/** 滚动时自动高亮当前可见 section 所属的分类 */
function onBodyScroll() {
  if (navLocked) return
  const container = settingsBodyRef.value
  if (!container) return
  const containerTop = container.scrollTop + 180
  for (let i = categories.length - 1; i >= 0; i--) {
    const catId = categories[i].id
    // 找到该分类下最后一个有 offsetParent（可见）的 section
    const sectionsForCat = Object.entries(sectionToCategory)
      .filter(([, cat]) => cat === catId)
      .map(([sec]) => sec)
    for (let j = sectionsForCat.length - 1; j >= 0; j--) {
      const el = document.getElementById(`section-${sectionsForCat[j]}`)
      if (el && el.offsetTop <= containerTop && el.offsetParent !== null) {
        activeCategory.value = catId
        return
      }
    }
  }
}

onMounted(async () => {
  // 初始化自定义 CSS：如果为空，使用 danmaku.css 作为默认可编辑文本
  if (!settingsStore.settings.customDanmakuCss) {
    settingsStore.settings.customDanmakuCss = defaultDanmakuCss
  }

  try { alwaysOnTop.value = await window.electronAPI.isAlwaysOnTop() } catch {}
  try { isResizable.value = await window.electronAPI.isResizable() } catch {}
  try { cacheSongs.value = await window.electronAPI.getAudioCacheList() } catch {}
  try { idleQueueSize.value = await window.electronAPI.getIdleQueueSize() } catch {}
  try { obsPort.value = await window.electronAPI.getObsPort() } catch {}
  // 从主界面跳转进来时定位到指定 section（如心率监测）
  applySettingsTarget()
  try {
    danmakuWindowOpen.value = await window.electronAPI.isDanmakuWindowOpen()
    danmakuWindowFixed.value = settingsStore.settings.danmakuWindowFixed
    danmakuWindowShowBorder.value = settingsStore.settings.danmakuWindowShowBorder
    danmakuWindowOpacity.value = settingsStore.settings.danmakuWindowOpacity || 100
  } catch {}

  // 监听弹幕窗口的固定状态变化（来自弹幕窗口的锁定按钮）
  window.electronAPI.onDanmakuWindowFixedChanged?.((fixed: boolean) => {
    danmakuWindowFixed.value = fixed
    settingsStore.settings.danmakuWindowFixed = fixed
  })

  // 监听弹幕窗口关闭（来自弹幕窗口的关闭按钮 / 原生关闭）
  window.electronAPI.onDanmakuWindowClosed?.(() => {
    danmakuWindowOpen.value = false
    settingsStore.settings.danmakuWindow = false
  })

  // 监听弹幕窗口打开（来自托盘菜单打开）
  window.electronAPI.onDanmakuWindowOpened?.(() => {
    danmakuWindowOpen.value = true
    settingsStore.settings.danmakuWindow = true
  })

  // 如果 OBS 服务已开启但端口未获取到，重试一次
  if (obsPort.value === 0 && settingsStore.settings.obsOverlayEnabled) {
    setTimeout(async () => {
      try { obsPort.value = await window.electronAPI.getObsPort() } catch {}
    }, 500)
  }

  // 启动时自动获取身份码：如果为空且已登录B站
  if (!settingsStore.settings.identityCode && authStore.authState.bilibili) {
    setTimeout(async () => {
      try {
        idCodeLoading.value = true
        const result = await window.electronAPI.fetchIdentityCode()
        if (result.success && result.code) {
          settingsStore.settings.identityCode = result.code
        }
      } catch (e) {
        // 静默失败，用户可以手动点击获取
        console.warn('[SettingsModal] 自动获取身份码失败:', e)
      } finally {
        idCodeLoading.value = false
      }
    }, 800)
  }

  // 挂载时立即保存 blivechatUrl 到 store（供托盘等入口使用）
  if (blivechatUrl.value) {
    window.electronAPI.updateDanmakuWindowUrl(blivechatUrl.value)
  }

  // 监听自动更新状态
  window.electronAPI.onUpdateStatus?.((s: any) => {
    updateStatus.value = s.status
    if (s.version) updateVersion.value = s.version
    if (s.percent !== undefined) updateProgress.value = s.percent
    if (s.error) updateMessage.value = s.error
    if (s.message) updateMessage.value = s.message
  })

  // 启动时同步心率监测状态（已连接则复用，未连接但有 lastDevice 则自动连接）
  if (settingsStore.settings.lastHeartRateDevice) {
    setTimeout(() => syncHeartRateState(), 500)
  }

  // 恢复上次停留的滚动位置（等待 DOM 渲染完成）
  nextTick(() => {
    const body = settingsBodyRef.value
    if (body && settingsMemory.scrollTop > 0) {
      body.scrollTop = settingsMemory.scrollTop
    }
  })
})

// 关闭前保存当前分类与滚动位置
onBeforeUnmount(() => {
  settingsMemory.category = activeCategory.value
  if (heartRateConnectTimer) { clearTimeout(heartRateConnectTimer); heartRateConnectTimer = null }
  const body = settingsBodyRef.value
  if (body) {
    settingsMemory.scrollTop = body.scrollTop
  }
  // 关闭心率 ws，但不发送 disconnect
  // server 端 monitor 进程继续后台运行，下次打开设置时通过 init 同步状态
  if (heartRateWs) {
    try {
      heartRateWs.onclose = null
      heartRateWs.onerror = null
      heartRateWs.onmessage = null
      heartRateWs.close()
    } catch {}
    heartRateWs = null
  }
})

// 日志列表自动滚动到底部
watch(
  () => danmakuStore.logs.length,
  () => {
    nextTick(() => {
      const el = logContainerRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

// 监听自定义 CSS 变化，同步更新弹幕窗口
watch(
  () => settingsStore.settings.customDanmakuCss,
  (css) => {
    if (danmakuWindowOpen.value) {
      window.electronAPI.updateDanmakuWindowCss(css || defaultDanmakuCss)
    }
  },
)

// 监听弹幕设置变化，同步更新弹幕窗口 URL（无论窗口是否打开，都持久化到 store 供托盘使用）
watch(
  () => blivechatUrl.value,
  (url) => {
    if (url) {
      window.electronAPI.updateDanmakuWindowUrl(url)
    }
  },
)

async function toggleAlwaysOnTop() {
  alwaysOnTop.value = !alwaysOnTop.value
  try {
    await window.electronAPI.setAlwaysOnTop(alwaysOnTop.value)
    settingsStore.settings.alwaysOnTop = alwaysOnTop.value
  } catch (e) { console.error('[SettingsModal] toggleAlwaysOnTop failed:', e) }
}

async function toggleResizable() {
  isResizable.value = !isResizable.value
  try {
    await window.electronAPI.setResizable(isResizable.value)
    settingsStore.settings.resizable = isResizable.value
  } catch (e) { console.error('[SettingsModal] toggleResizable failed:', e) }
}

async function toggleDanmakuWindow() {
  danmakuWindowOpen.value = !danmakuWindowOpen.value
  settingsStore.settings.danmakuWindow = danmakuWindowOpen.value
  try {
    if (danmakuWindowOpen.value) {
      if (!blivechatUrl.value) {
        danmakuWindowOpen.value = false
        settingsStore.settings.danmakuWindow = false
        showToast('请先在「OBS → 弹幕捕获」中获取身份码，再打开弹幕窗口。', 'warning')
        return
      }
      const css = settingsStore.settings.customDanmakuCss || defaultDanmakuCss
      const bgColor = settingsStore.settings.danmakuWindowBgColor || 'rgba(0,0,0,0.3)'
      const opacity = settingsStore.settings.danmakuWindowOpacity || 100
      await window.electronAPI.openDanmakuWindow(blivechatUrl.value, css, bgColor, opacity)
      // 同步固定模式和边框显示状态
      if (danmakuWindowFixed.value) {
        await window.electronAPI.setDanmakuWindowFixed(true)
      }
      await window.electronAPI.setDanmakuWindowShowBorder(danmakuWindowShowBorder.value)
      await window.electronAPI.setDanmakuWindowCollapseInput(settingsStore.settings.danmakuWindowCollapseInput)
    } else {
      await window.electronAPI.closeDanmakuWindow()
    }
  } catch (e) { console.error('[SettingsModal] toggleDanmakuWindow failed:', e) }
}

async function toggleDanmakuWindowFixed() {
  danmakuWindowFixed.value = !danmakuWindowFixed.value
  settingsStore.settings.danmakuWindowFixed = danmakuWindowFixed.value
  try {
    await window.electronAPI.setDanmakuWindowFixed(danmakuWindowFixed.value)
  } catch (e) { console.error('[SettingsModal] toggleDanmakuWindowFixed failed:', e) }
}

async function toggleDanmakuWindowShowBorder() {
  danmakuWindowShowBorder.value = !danmakuWindowShowBorder.value
  settingsStore.settings.danmakuWindowShowBorder = danmakuWindowShowBorder.value
  try {
    await window.electronAPI.setDanmakuWindowShowBorder(danmakuWindowShowBorder.value)
  } catch (e) { console.error('[SettingsModal] toggleDanmakuWindowShowBorder failed:', e) }
}

async function toggleDanmakuWindowCollapseInput() {
  settingsStore.settings.danmakuWindowCollapseInput = !settingsStore.settings.danmakuWindowCollapseInput
  try {
    await window.electronAPI.setDanmakuWindowCollapseInput(settingsStore.settings.danmakuWindowCollapseInput)
  } catch (e) { console.error('[SettingsModal] toggleDanmakuWindowCollapseInput failed:', e) }
}

function onShortcutKeyDown(e: KeyboardEvent) {
  e.preventDefault()
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  // 只取修饰键 + 一个非修饰键
  const key = e.key
  if (key && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key)
  }
  if (parts.length >= 2) {
    const shortcut = parts.join('+')
    settingsStore.settings.danmakuWindowFixShortcut = shortcut
    window.electronAPI.registerDanmakuFixShortcut(shortcut)
  }
}

function resetFixShortcut() {
  const defaultShortcut = 'Alt+B'
  settingsStore.settings.danmakuWindowFixShortcut = defaultShortcut
  window.electronAPI.registerDanmakuFixShortcut(defaultShortcut)
}

function onDanmakuBgColorChange(rgba: string) {
  settingsStore.settings.danmakuWindowBgColor = rgba
  if (danmakuWindowOpen.value) {
    window.electronAPI.setDanmakuWindowBgColor(rgba)
  }
}

function resetDanmakuBgColor() {
  const defaultBg = 'rgba(0,0,0,0.3)'
  settingsStore.settings.danmakuWindowBgColor = defaultBg
  if (danmakuWindowOpen.value) {
    window.electronAPI.setDanmakuWindowBgColor(defaultBg)
  }
}

function onDanmakuWindowOpacityChange(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value)
  danmakuWindowOpacity.value = val
  settingsStore.settings.danmakuWindowOpacity = val
  if (danmakuWindowOpen.value) {
    window.electronAPI.setDanmakuWindowOpacity(val)
  }
}

async function saveIdleQueueSize() {
  try {
    await window.electronAPI.setIdleQueueSize(idleQueueSize.value)
  } catch (e) { console.error('[SettingsModal] saveIdleQueueSize failed:', e) }
}

function resetAccent() {
  const c = settingsStore.settings.theme === 'dark' ? '#00b5e5' : '#00a1d6'
  settingsStore.setAccentColor(c)
}

async function playCached(entry: any) {
  const song: any = {
    id: entry.songId,
    sourceId: entry.songId?.replace(/^(ne_|bv_)/, '') || '',
    source: entry.songId?.startsWith?.('bv_') ? 'bilibili' : 'netease',
    title: entry.title || '',
    artist: entry.artist || '',
    coverUrl: '',
    duration: 0,
    cid: 0,
    requesterName: '控制台',
    fromCache: true
  }
  await window.electronAPI.playlistInsertTop(song)
}

async function clearAllCache() {
  try {
    await window.electronAPI.clearAudioCache()
    cacheSongs.value = []
  } catch (e) { console.error('[SettingsModal] clearAllCache failed:', e) }
}

async function selectLyricBgImage() {
  try {
    const path = await window.electronAPI.selectImageFile()
    if (path) {
      settingsStore.settings.lyricBgPath = path
    }
  } catch (e) { console.error('[SettingsModal] selectLyricBgImage failed:', e) }
}

function onLyricBgSourceChange(value: string | number) {
  settingsStore.settings.lyricBgSource = value as 'local' | 'cover'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1024 / 1024).toFixed(1) + 'MB'
}

async function onObsOverlayToggled(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  try {
    const result = await window.electronAPI.toggleObsOverlay(enabled)
    if (result.error) {
      console.error('[SettingsModal] OBS 服务切换失败:', result.error)
    }
    obsPort.value = result.port
  } catch (e) {
    console.error('[SettingsModal] onObsOverlayToggled 失败:', e)
  }
}

function copyObsUrl(page: string) {
  if (obsPort.value <= 0) return
  const url = `http://localhost:${obsPort.value}/${page}`
  navigator.clipboard.writeText(url)
}

/** 复制文本到剪贴板 */
function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
}

/** 获取 blivechat 身份码 */
async function fetchIdentityCode() {
  idCodeLoading.value = true
  try {
    const result = await window.electronAPI.fetchIdentityCode()
    if (result.success && result.code) {
      settingsStore.settings.identityCode = result.code
    } else {
      showToast('获取身份码失败：' + (result.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('[SettingsModal] fetchIdentityCode 失败:', e)
    showToast('获取身份码失败：' + (e as Error).message, 'error')
  } finally {
    idCodeLoading.value = false
  }
}

function openStyleWindow() {
  if (obsPort.value <= 0) return
  window.electronAPI.openStyleWindow(obsPort.value)
}

async function logoutBilibili() {
  await window.electronAPI.logoutBilibili()
  authStore.authState.bilibili = false
  authStore.authState.bilibiliUname = ''
  authStore.authState.bilibiliFace = ''
  authStore.authState.bilibiliUid = 0
  emit('close')
  router.push('/')
}

async function logoutNetease() {
  await window.electronAPI.logoutNetease()
  authStore.authState.netease = false
  authStore.authState.neteaseUname = ''
  authStore.authState.neteaseFace = ''
  authStore.authState.neteaseUid = 0
  emit('close')
  router.push('/')
}

function toggleTranslation() {
  settingsStore.settings.showLyricTranslation = !settingsStore.settings.showLyricTranslation
}

function toggleSplitTranslation() {
  settingsStore.settings.splitLyricTranslation = !settingsStore.settings.splitLyricTranslation
}

function resetDanmakuCss() {
  settingsStore.settings.customDanmakuCss = defaultDanmakuCss
}

const showResetConfirm = ref(false)

function resetAllData() {
  showResetConfirm.value = true
}

async function handleResetConfirm() {
  try {
    await window.electronAPI.resetAllData()
    // 清除 renderer 端 localStorage 中的表情包缓存（主进程已删除磁盘缓存文件）
    localStorage.removeItem('bili_emoticon_cache_v2')
    await new Promise(r => setTimeout(r, 300))
    await window.electronAPI.appRelaunch()
  } catch (e) {
    console.error('[SettingsModal] resetAllData failed:', e)
    showResetConfirm.value = false
    showToast('重置失败：' + (e as Error).message, 'error')
  }
}

async function openDevTools() {
  try {
    await window.electronAPI.openDevTools()
  } catch (e) {
    console.error('[SettingsModal] openDevTools failed:', e)
  }
}

function openLink(url: string) {
  window.electronAPI.openExternal(url)
}

async function exportConfig() {
  try {
    const result = await window.electronAPI.exportConfig()
    if (result) {
      showToast('配置已导出到: ' + result, 'success', 5000)
    }
  } catch (e) {
    console.error('[SettingsModal] exportConfig failed:', e)
    showToast('导出配置失败：' + (e as Error).message, 'error')
  }
}

async function importConfig() {
  if (!confirm('导入配置将合并到当前设置（不影响登录状态和缓存），确定继续？')) return
  try {
    const result = await window.electronAPI.importConfig()
    if (result) {
      showToast('配置已导入，即将重启应用', 'success')
      await new Promise(r => setTimeout(r, 500))
      await window.electronAPI.appRelaunch()
    }
  } catch (e) {
    console.error('[SettingsModal] importConfig failed:', e)
    showToast('导入配置失败：' + (e as Error).message, 'error')
  }
}

// ===== 自动更新 =====

async function checkForUpdates() {
  updateStatus.value = 'checking'
  updateMessage.value = ''
  try {
    const result = await window.electronAPI.checkForUpdates()
    if (result.status === 'available') {
      updateStatus.value = 'available'
      updateVersion.value = result.version || ''
    } else if (result.status === 'not-available') {
      updateStatus.value = 'not-available'
      updateMessage.value = result.message || '当前已是最新版本'
    } else if (result.status === 'error') {
      updateStatus.value = 'error'
      updateMessage.value = result.error || '检查更新失败'
    }
  } catch (e) {
    updateStatus.value = 'error'
    updateMessage.value = (e as Error).message
  }
}

async function downloadUpdate() {
  updateStatus.value = 'downloading'
  updateProgress.value = 0
  try {
    const result = await window.electronAPI.downloadUpdate()
    if (!result.success) {
      updateStatus.value = 'error'
      updateMessage.value = result.error || '下载失败'
    }
  } catch (e) {
    updateStatus.value = 'error'
    updateMessage.value = (e as Error).message
  }
}

async function installUpdate() {
  try {
    await window.electronAPI.installUpdate()
  } catch (e) {
    console.error('[SettingsModal] installUpdate failed:', e)
  }
}

// ===== 窗口行为 =====

function toggleCloseToTray() {
  settingsStore.settings.closeToTray = !settingsStore.settings.closeToTray
}

/**
 * 设置弹窗透明度
 * 仅作用于 SettingsModal 弹窗本身，不影响主窗口。
 * 通过响应式 style 绑定 opacity 应用到 .modal-content 元素。
 */
function onWindowOpacityChange(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value)
  settingsStore.settings.windowOpacity = val
}

/** 恢复弹窗透明度默认值（90%） */
function resetWindowOpacity() {
  settingsStore.settings.windowOpacity = 90
}

/** 恢复歌词颜色默认值（空字符串=跟随主题色） */
function resetLyricColor() {
  settingsStore.settings.lyricColor = ''
}

/** 恢复歌词描边颜色默认值 */
function resetLyricStrokeColor() {
  settingsStore.settings.lyricStrokeColor = 'rgba(0,0,0,0.8)'
}

/** 恢复翻译颜色默认值（空字符串=跟随主题色） */
function resetLyricTransColor() {
  settingsStore.settings.lyricTransColor = ''
}

/** 恢复翻译描边颜色默认值 */
function resetLyricTransStrokeColor() {
  settingsStore.settings.lyricTransStrokeColor = 'rgba(0,0,0,0.8)'
}

function toggleAutoUpdate() {
  settingsStore.settings.autoUpdate = !settingsStore.settings.autoUpdate
}

// ===== 心率监测（OBS 小工具） =====

async function scanHeartRateDevices() {
  heartRateDevices.value = []
  if (obsPort.value <= 0) {
    showToast('OBS 捕获服务未启动，请先在「OBS 捕获」中开启 HTTP 服务。', 'warning')
    return
  }
  const port = obsPort.value
  try {
    const ws = new WebSocket(`ws://localhost:${port}/heart-rate`)
    const devices: { id: string; name: string; address: string; model: string }[] = []

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close()
        resolve()
      }, 15000)

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'heart-rate:scan' }))
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'heart-rate-tool') {
            const data = msg.data
            if (data.type === 'device') {
              devices.push({ id: data.id, name: data.name, address: data.address || '', model: data.model || '' })
            } else if (data.type === 'scan_complete') {
              clearTimeout(timeout)
              ws.close()
              resolve()
            } else if (data.type === 'error') {
              clearTimeout(timeout)
              ws.close()
              reject(new Error(data.message))
            }
          }
        } catch {}
      }
      ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('WebSocket 连接失败，请确认 OBS 捕获服务已开启'))
      }
    })

    heartRateDevices.value = devices
    if (devices.length > 0) {
      const savedId = settingsStore.settings.lastHeartRateDevice
      heartRateDevice.value = devices.find(d => d.id === savedId) ? savedId : devices[0].id
    } else {
      showToast('未发现蓝牙心率设备，请确保设备已开启蓝牙并在范围内。', 'info')
    }
  } catch (e) {
    showToast('扫描设备失败：' + (e as Error).message, 'error')
  }
}

async function toggleHeartRateConnection() {
  if (heartRateConnected.value) {
    // 断开：通知 server kill monitor 进程并清空状态
    if (heartRateWs && heartRateWs.readyState === WebSocket.OPEN) {
      heartRateWs.send(JSON.stringify({ type: 'heart-rate:disconnect' }))
    }
    if (heartRateWs) {
      heartRateWs.close()
      heartRateWs = null
    }
    heartRateConnected.value = false
    heartRateValue.value = 0
    heartRateConnecting.value = false
    heartRateStatus.value = '已断开'
    return
  }
  if (!heartRateDevice.value) {
    showToast('请先选择蓝牙设备', 'warning')
    return
  }
  // 连接过程反馈：按钮变「连接中…」，并持续显示设备端返回的状态
  heartRateConnecting.value = true
  heartRateStatus.value = '正在连接设备…（首次连接可能要 5–30 秒；若被手机占用会自动重试）'
  if (heartRateConnectTimer) clearTimeout(heartRateConnectTimer)
  heartRateConnectTimer = setTimeout(() => {
    if (!heartRateConnected.value) {
      heartRateConnecting.value = false
      heartRateStatus.value = '连接超时：请确认手环没有连着手机（小米运动健康等）、已佩戴并唤醒后重试'
      showToast('心率连接超时，请看设置里的状态提示', 'warning')
    }
  }, 35000)
  try {
    const port = obsPort.value > 0 ? obsPort.value : 4680
    const ws = new WebSocket(`ws://localhost:${port}/heart-rate`)
    heartRateWs = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'heart-rate:connect', deviceId: heartRateDevice.value }))
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'heart-rate-tool') {
          const data = msg.data
          if (data.type === 'heart_rate') {
            heartRateValue.value = data.hr
          } else if (data.type === 'connected') {
            heartRateConnected.value = true
            heartRateConnecting.value = false
            heartRateStatus.value = '已连接' + (data.mode === 'gatt' ? '（标准心率服务）' : '（广播模式）')
            if (heartRateConnectTimer) { clearTimeout(heartRateConnectTimer); heartRateConnectTimer = null }
            settingsStore.settings.lastHeartRateDevice = heartRateDevice.value
            if (data.name) {
              settingsStore.settings.lastHeartRateDeviceName = data.name
            }
          } else if (data.type === 'disconnected') {
            heartRateConnected.value = false
            heartRateValue.value = 0
            heartRateConnecting.value = false
            heartRateStatus.value = '已断开'
          } else if (data.type === 'error') {
            showToast('心率设备错误：' + data.message.replace(/`n/g, '\n'), 'error')
            heartRateConnected.value = false
            heartRateConnecting.value = false
            heartRateStatus.value = ''
            if (heartRateConnectTimer) { clearTimeout(heartRateConnectTimer); heartRateConnectTimer = null }
          } else if (data.type === 'status') {
            // 显示连接进度（正在连接/被占用/回退广播…），不弹窗
            if (data.message) heartRateStatus.value = String(data.message)
          }
        }
      } catch {}
    }
    ws.onclose = () => {
      // ws 关闭不改变 heartRateConnected（server 端 monitor 仍在跑）
      heartRateWs = null
      if (heartRateConnecting.value) {
        heartRateConnecting.value = false
        heartRateStatus.value = '与心率服务的连接已关闭，请重试'
      }
    }
    ws.onerror = () => {
      heartRateWs = null
      heartRateConnecting.value = false
      heartRateStatus.value = ''
      showToast('心率服务连接失败，请确认 OBS 捕获服务已开启', 'error')
    }
  } catch (e) {
    showToast('连接心率服务失败：' + (e as Error).message, 'error')
  }
}

// 同步心率状态：从 server 获取当前持久状态
// - 若 server 已在 monitoring 同一设备：直接订阅，不重启 monitor
// - 若 server 空闲但有 lastHeartRateDevice：自动启动 monitor
async function syncHeartRateState() {
  const savedId = settingsStore.settings.lastHeartRateDevice
  if (!savedId) return
  if (obsPort.value <= 0) return
  try {
    const ws = new WebSocket(`ws://localhost:${obsPort.value}/heart-rate`)
    heartRateWs = ws
    ws.onopen = () => {
      // 发送 init + 设备 ID，server 决定复用还是新启动
      ws.send(JSON.stringify({ type: 'heart-rate:init', deviceId: savedId }))
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'heart-rate-tool') {
          const data = msg.data
          if (data.type === 'device') {
            // server 推送的设备列表
            if (!heartRateDevices.value.find(d => d.id === data.id)) {
              heartRateDevices.value.push({ id: data.id, name: data.name, address: data.address || '', model: data.model || '' })
            }
          } else if (data.type === 'heart_rate') {
            heartRateValue.value = data.hr
          } else if (data.type === 'connected') {
            heartRateConnected.value = true
            heartRateConnecting.value = false
            heartRateDevice.value = savedId
            heartRateStatus.value = '已连接' + (data.mode === 'gatt' ? '（标准心率服务）' : '（广播模式）')
            if (heartRateConnectTimer) { clearTimeout(heartRateConnectTimer); heartRateConnectTimer = null }
            // 保存设备名到 settings store，下次启动能显示
            if (data.name) {
              settingsStore.settings.lastHeartRateDeviceName = data.name
            }
          } else if (data.type === 'disconnected') {
            heartRateConnected.value = false
            heartRateValue.value = 0
            heartRateConnecting.value = false
            heartRateStatus.value = '已断开'
          } else if (data.type === 'error') {
            heartRateConnecting.value = false
            heartRateStatus.value = ''
            showToast('心率设备错误：' + String(data.message || '').replace(/`n/g, '\n'), 'error')
          } else if (data.type === 'status') {
            // 启动时自动连接也显示进度
            if (data.message && !heartRateConnected.value) heartRateStatus.value = String(data.message)
          }
        }
      } catch {}
    }
    ws.onclose = () => {
      heartRateWs = null
    }
    ws.onerror = () => {
      heartRateWs = null
    }
  } catch {}
}

// ===== 心率显示样式 =====

// 心率样式设置已迁移到 /heart-rate-style 页面（参考 /style 的实现）
// 这里仅提供"打开"按钮和"复制"地址

// 打开心率工具样式设置页（独立 Electron 窗口，与 OBS 样式设置窗口一致）
function openHeartRateStyleWindow() {
  if (obsPort.value <= 0) {
    showToast('OBS 捕获服务未启动', 'error')
    return
  }
  window.electronAPI.openHeartRateStyleWindow(obsPort.value)
}

// 复制心率样式设置地址到剪贴板
function copyHeartRateStyleUrl() {
  if (obsPort.value <= 0) return
  const url = `http://localhost:${obsPort.value}/heart-rate-style`
  navigator.clipboard.writeText(url).then(() => {
    showToast('已复制到剪贴板', 'success')
  }).catch(() => {
    showToast('复制失败', 'error')
  })
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: var(--modal-overlay); display: flex;
  align-items: flex-start; justify-content: center; z-index: 1000;
  padding: 8vh 0;
}
.modal-content {
  width: 560px; height: 84vh; max-height: 84vh; background: var(--modal-bg);
  border: 1px solid var(--border); display: flex; flex-direction: column;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-bottom: 1px solid var(--section-border); background: var(--bg-secondary);
  flex-shrink: 0;
}
.modal-header h2 { font-size: 14px; font-weight: 400; color: var(--text-primary); }
.close-btn {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--text-muted); cursor: pointer; border-radius: 0;
}
.close-btn:hover { background: #e74c3c; color: #fff; }

/* 左右布局：导航栏 + 内容 */
.modal-layout { display: flex; flex: 1; min-height: 0; overflow: hidden; }

/* 左侧分类标签 */
.settings-nav {
  width: 80px; flex-shrink: 0; overflow-y: auto; padding: 6px 0;
  border-right: 1px solid var(--section-border); background: var(--bg-secondary);
  scrollbar-width: none;
}
.settings-nav::-webkit-scrollbar { display: none; }
.nav-item {
  display: block; width: 100%; padding: 8px 10px; font-size: 12px; color: var(--text-secondary);
  background: none; border: none; cursor: pointer; text-align: left;
  transition: background 0.1s, color 0.1s; border-radius: 0;
}
.nav-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.nav-item.active { color: var(--accent); background: var(--bg-tertiary); font-weight: 600; }

/* 右侧内容区 */
.modal-body { flex: 1; overflow-y: auto; padding: 12px 14px; min-width: 0; }
.section { margin-bottom: 16px; }
.section h3 { font-size: 12px; font-weight: 600; color: var(--section-title); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--section-border); }
.section-desc { font-size: 10px; color: var(--text-muted); margin-bottom: 6px; line-height: 1.4; }
/* 心率连接过程中的状态提示 */
.hr-status { color: var(--accent); margin: -2px 0 8px 0; word-break: break-all; }

/* 心率工具的 OBS 接入说明 */.hr-obs-guide {
  margin-top: 10px; padding: 10px 12px;
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-left: 2px solid var(--accent);
}
.hr-obs-guide .guide-title { font-size: 11px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.hr-obs-guide ol { margin: 0; padding-left: 18px; }
.hr-obs-guide li { font-size: 11px; color: var(--text-secondary); line-height: 1.75; }
.hr-obs-guide b { color: var(--text-primary); font-weight: 600; }

/* 从主界面跳转定位后的短暂高亮 */
.section-flash { animation: section-flash 1.6s ease-out; }
@keyframes section-flash {
  0% { box-shadow: inset 0 0 0 1px var(--accent); }
  100% { box-shadow: inset 0 0 0 1px transparent; }
}
.mv-audio-desc .mv-source-tag { color: var(--accent); font-weight: 600; }
.mv-audio-desc .mv-warn { color: var(--accent); font-weight: 600; }
.setting-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 12px; color: var(--text-primary); }
.setting-row > span { text-align: left; flex: 1; margin-right: 12px; }
.connected { color: #4ec9b0; }
.disconnected { color: var(--text-muted); }
span.status-text { text-align: right; min-width: 50px; flex: none; }
.input { width: 90px; padding: 4px 6px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary); font-size: 12px; }
.input:focus { border-color: var(--accent); outline: none; }
.btn {
  padding: 4px 12px; border: 1px solid var(--border); border-radius: 0;
  background: var(--btn-bg); color: var(--btn-text); font-size: 10px; cursor: pointer;
}
.btn:hover { background: var(--btn-hover-bg); }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; padding: 4px 6px; }
.icon-btn:hover { color: var(--accent); border-color: var(--accent); }
.font-picker-row { display: flex; gap: 6px; align-items: center; }
.accent-picker-row { display: flex; align-items: center; gap: 8px; }
.reset-btn {
  padding: 3px 8px; font-size: 10px; color: var(--text-secondary); border-radius: 0;
  background: var(--bg-secondary); border: 1px solid var(--border);
  cursor: pointer; transition: background 0.1s, color 0.1s;
}
.reset-btn:hover { color: var(--accent); border-color: var(--accent); }
.shortcut-row { display: flex; align-items: center; gap: 8px; }
.shortcut-input {
  width: 100px; padding: 3px 6px; font-size: 11px; text-align: center;
  background: var(--bg-primary); border: 1px solid var(--border);
  color: var(--text-primary); border-radius: 0; outline: none;
  cursor: pointer; font-family: monospace;
}
.shortcut-input:focus { border-color: var(--accent); }
.shortcut-input::placeholder { color: var(--text-muted); }
.toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 11px; color: var(--text-muted); flex-direction: row-reverse; }
.toggle-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); }
.toggle-text { font-size: 11px; min-width: 48px; text-align: right; }
.log-container {
  height: 180px; overflow-y: auto; background: var(--bg-primary); border: 1px solid var(--border);
  padding: 6px; font-size: 11px; font-family: monospace;
  scrollbar-width: none;
}
.log-container::-webkit-scrollbar { display: none; }
.log-line { color: var(--text-secondary); padding: 1px 0; white-space: pre-wrap; }
.log-empty { color: var(--text-muted); font-style: italic; }
.about-header { display: flex; justify-content: flex-start; align-items: flex-start; flex-wrap: wrap; gap: 1px; }
.about-text { font-size: 11px; color: var(--text-secondary); line-height: 1.8; }
.about-actions { display: flex; gap: 8px; flex-shrink: 0; align-self: flex-start; }
.dev-btn { display: flex; }
.reset-data-btn { display: flex; }

/* 自动更新 */
.update-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.update-info { font-size: 11px; color: var(--text-secondary); }
.update-error { color: #e74c3c; }

/* 关于-致谢 */
.about-thanks { margin-top: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.thanks-label { font-size: 11px; color: var(--text-secondary); }
.thanks-link { font-size: 11px; color: var(--text-secondary); text-decoration: none; cursor: pointer; }
.thanks-link:hover { text-decoration: underline; color: var(--accent); }

/* 缓存列表 */
.cache-list { height: 180px; overflow-y: auto; background: var(--bg-primary); border: 1px solid var(--border); scrollbar-width: none; }
.cache-list::-webkit-scrollbar { display: none; }
.cache-item {
  display: flex; align-items: center; padding: 4px 8px; gap: 6px;
  font-size: 11px; border-bottom: 1px solid var(--border);
}
.cache-item:hover { background: var(--bg-tertiary); }
.add-btn {
  width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--border); color: var(--accent);
  font-size: 14px; cursor: pointer; flex-shrink: 0; padding: 0; line-height: 1;
}
.add-btn:hover { background: var(--accent); color: var(--btn-primary-text); border-color: var(--accent); }
.cache-idx { color: var(--text-muted); width: 20px; text-align: center; flex-shrink: 0; }
.cache-title { flex: 1; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cache-artist { color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; }
.cache-size { color: var(--text-muted); font-size: 10px; width: 45px; text-align: right; flex-shrink: 0; font-family: 'Consolas', monospace; }
.cache-count { font-size: 11px; color: var(--text-muted); font-weight: normal; }
.cache-empty { padding: 12px; text-align: center; color: var(--text-muted); font-size: 11px; }
.clear-cache-btn { margin-top: 6px; width: 100%; }
.range-row { display: flex; align-items: center; gap: 8px; flex: 1; justify-content: flex-end; }
.range-slider {
  -webkit-appearance: none; appearance: none;
  width: 100px; height: 4px; background: var(--border); outline: none;
}
.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 14px; height: 14px; background: var(--accent); cursor: pointer;
}
.range-slider::-moz-range-thumb {
  width: 14px; height: 14px; background: var(--accent); cursor: pointer; border: none;
}
.range-value { font-size: 11px; color: var(--text-muted); min-width: 36px; text-align: left; }
.path-row { display: flex; gap: 6px; align-items: center; }
.input-row { display: flex; gap: 6px; align-items: center; flex: 1; }
.input-path { width: 300px; flex: 1; min-width: 0; }

.link {
  color: var(--accent); text-decoration: none;
}
.link:hover { text-decoration: underline; }

.input-with-unit {
  display: flex; align-items: center; gap: 4px;
}
.unit {
  font-size: 11px; color: var(--text-muted);
}

/* 通用 textarea */
.textarea {
  width: 100%; padding: 6px 8px; font-size: 11px; font-family: 'Consolas', monospace;
  background: var(--input-bg); border: 1px solid var(--input-border);
  color: var(--text-primary); resize: vertical; box-sizing: border-box;
}
.textarea:focus { border-color: var(--accent); outline: none; }
.textarea::placeholder { color: var(--text-muted); }

/* 自定义 CSS textarea */
.css-textarea {
  min-height: 160px; height: 160px; font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11px; line-height: 1.5; tab-size: 2;
}

/* 致谢 */
.thanks-text {
  font-size: 11px; color: var(--text-secondary); line-height: 1.8; margin: 0;
}

/* 下拉选择框（已由 CustomSelect 组件替代原生 select） */

/* 设备选择下拉框和按钮组合 */
.device-row {
  display: flex; align-items: center; gap: 6px; flex: 1;
}
.device-row .custom-select { flex: 1; min-width: 0; width: 310px; }

/* 心率显示行：心率值 + 连接/断开按钮 */
.heart-rate-display {
  display: flex; align-items: center; gap: 8px;
}

/* 歌词样式 + 翻译样式两列布局 */
.lyric-style-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px;
}
/* 不显示翻译样式时：单列布局，歌词样式占满宽度 */
.lyric-style-grid.single-col {
  grid-template-columns: 1fr;
}
.lyric-style-col { min-width: 0; }
.lyric-style-col .setting-row > span { flex: none; width: 72px; margin-right: 8px; }
/* 子标题：仅在两列布局时显示，区分"歌词样式"/"翻译样式" */
.lyric-sub-title {
  font-size: 11px; font-weight: 600; color: var(--accent);
  margin: 0 0 6px 0; padding-bottom: 3px;
  border-bottom: 1px solid var(--accent-light, rgba(0, 181, 229, 0.2));
}

.cache-type {
  font-size: 10px; padding: 1px 4px; border-radius: 0; flex-shrink: 0;
  background: var(--bg-secondary); color: var(--text-muted);
  white-space: nowrap;
}
.type-video { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
.type-mv { background: rgba(155, 89, 182, 0.15); color: #9b59b6; }
.type-audio { background: rgba(46, 204, 113, 0.15); color: #2ecc71; }
</style>