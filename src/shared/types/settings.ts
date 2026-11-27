export interface AppSettings {
  roomId: number
  userCooldown: number
  songCooldown: number
  maxQueueSize: number
  theme: 'dark' | 'light'
  accentColor: string
  alwaysOnTop: boolean
  resizable: boolean
  danmakuWindow: boolean
  danmakuWindowFixed: boolean
  danmakuWindowShowBorder: boolean
  danmakuWindowCollapseInput: boolean
  danmakuWindowFixShortcut: string
  danmakuWindowBgColor: string
  danmakuWindowOpacity: number
  volume: number
  neteasePlaylistId: string
  bilibiliFavUrl: string
  lastIdleSource: 'netease' | 'bilibili'
  idleQueueSize: number
  splitterLeft: number
  splitterUpper: number
  showLyricTranslation: boolean
  splitLyricTranslation: boolean
  lyricDelay: number
  lyricFontSize: number
  lyricLineSpacing: number
  idleLyricText: string
  liveParentAreaIdx: number
  liveSubAreaId: number
  showDanmakuTime: boolean
  showIdleSongs: boolean
  // 弹幕显示控制
  showDanmaku: boolean // 是否显示弹幕
  showPaidMessages: boolean // 是否显示付费弹幕
  showGiftName: boolean // 是否显示礼物名称
  mergeSimilarDanmaku: boolean // 是否合并相似弹幕类型
  mergeSimilarGift: boolean // 是否合并相似礼物弹幕
  minPaidMessagePrice: number // 最小付费弹幕价格
  maxDanmakuCount: number // 最大弹幕数量
  // 弹幕屏蔽
  blockGiftDanmaku: boolean // 是否屏蔽礼物弹幕
  blockMirrorMessages: boolean // 是否屏蔽镜像消息（对齐 blivechat-dev）
  blockKeywords: string // 关键词屏蔽列表
  blockUsers: string // 用户屏蔽列表
  blockLevel: number // 等级屏蔽列表
  blockMedalLevel: number // 勋章等级屏蔽列表
  blockNewbie: boolean // 是否屏蔽新用户（对齐 blivechat-dev）
  blockNotMobileVerified: boolean // 是否屏蔽未绑定手机用户（对齐 blivechat-dev）
  // 弹幕样式（StyleGenerator 配置）
  danmakuStyle: DanmakuStyleConfig
  customDanmakuCss: string
  // 弹幕调试
  showDebugMessages: boolean
  // OBS 捕获
  obsOverlayEnabled: boolean
  obsLyricStyle: ObsLyricStyle
  obsQueueStyle: ObsQueueStyle
  obsSongInfoStyle: ObsSongInfoStyle
  // blivechat
  identityCode: string
  blivechatLang: string
  // 窗口行为
  closeToTray: boolean // 关闭时收起到托盘
  windowOpacity: number // 主窗口透明度 (5-100)
  // 自动更新
  autoUpdate: boolean // 是否启用自动更新
  // 播放器
  mvMode: boolean // 是否启用MV模式（用视频替换歌词画面）
  mvAudioSource: 'mv' | 'original' // MV 模式下音频来源：'mv'=使用MV自带音频（默认，更稳定）, 'original'=原始高音质音频
  playRepeatMode: 'off' | 'one' | 'all' // 播放循环：off=不循环, one=单曲循环, all=歌单/列表循环
  playerTransparent: boolean // 播放时右侧歌词/视频区域背景透明（透出桌面）
  // 歌词背景
  lyricBgEnabled: boolean // 是否启用歌词背景图
  lyricBgSource: 'local' | 'cover' // 背景图来源：本地图片 / 当前封面
  lyricBgPath: string // 背景图路径（lyricBgSource='local' 时使用）
  lyricBgAlign: 'cover' | 'contain' | 'tile' // 对齐方式
  lyricBgBrightness: number // 亮度 (30-130)
  lyricBgBlur: number // 模糊度 (0-10)
  lyricBgOpacity: number // 不透明度 (5-100)
  // 歌词样式
  lyricColor: string // 歌词颜色 (空=跟随主题色)
  lyricStrokeColor: string // 歌词描边颜色
  lyricStrokeWidth: number // 歌词描边宽度
  lyricStrokeBlur: number // 歌词描边模糊
  lyricFontWeight: string // 歌词字重
  // 翻译样式（仅在显示翻译且分行时生效）
  lyricTransColor: string // 翻译颜色 (空=跟随主题色)
  lyricTransFontSize: number // 翻译字体大小
  lyricTransStrokeColor: string // 翻译描边颜色
  lyricTransStrokeWidth: number // 翻译描边宽度
  lyricTransStrokeBlur: number // 翻译描边模糊
  lyricTransFontWeight: string // 翻译字重
  lyricInactiveOpacity: number // 非焦点歌词透明度 (5-100)
  lyricStyleMigrated: boolean // 是否已把歌词样式迁移到高可读默认值（一次性）
requestRulesMigrated: boolean // 是否已把点歌规则迁移到 1s/10s/队列 50（一次性）
  updateMirror: string // 自定义更新加速前缀（留空=内置镜像列表自动选择）
  // 心率监测
  lastHeartRateDevice: string // 上次连接的蓝牙心率设备ID（MAC）
  lastHeartRateDeviceName: string // 上次连接的蓝牙心率设备名
  // 心率显示样式（OBS 捕获页 http://localhost:4680/heart-rate）
  heartRateColor: string // 心率数字颜色
  heartRateShadowColor: string // 阴影颜色（数字与符号共享）
  heartRateShadowSize: number // 阴影大小（模糊半径，数字与符号共享）
  heartRateShadowOffsetY: number // 阴影上下偏移（数字与符号共享）
  heartRateShadowOffsetX: number // 阴影左右偏移（数字与符号共享）
  heartRateFontSize: number // 数字字体大小
  heartRateFontWeight: string // 数字字重
  heartRateFontFamily: string // 数字字体（系统字体名，空=默认）
  // 心率符号（♥）样式
  heartRateSymbol: string // 心率符号文本，默认 '♥'，可编辑为其他字符或文字
  heartRateSymbolSize: number // 符号字体大小
  heartRateSymbolColor: string // 符号颜色
  heartRateSymbolFontWeight: string // 符号字重
  heartRateSymbolFontFamily: string // 符号字体（系统字体名，空=默认）
  heartRateGap: number // 符号与数字之间的间距 (px)
}

/** 弹幕样式配置（对齐 blivechat-dev StyleGenerator Legacy DEFAULT_CONFIG） */
export interface DanmakuStyleConfig {
  globalScale: number
  fontScale: number
  showAvatars: boolean
  avatarSize: number
  showUserNames: boolean
  userNameFontSize: number
  userNameWeight: number
  userNameColor: string
  ownerUserNameColor: string
  moderatorUserNameColor: string
  memberUserNameColor: string
  showBadges: boolean
  showColon: boolean
  // 字体族（对齐 blivechat-dev common.js fontsStrToCss）
  userNameFont: string
  messageFont: string
  timeFont: string
  firstLineFont: string
  secondLineFont: string
  scContentFont: string
  messageFontSize: number
  messageWeight: number
  messageColor: string
  messageOnNewLine: boolean
  messageReverseScroll: boolean
  emoticonSize: number
  largeEmoticonSize: number
  showOutlines: boolean
  outlineSize: number
  outlineColor: string
  blurryOutline: boolean
  showTime: boolean
  timeColor: string
  timeFontSize: number
  timeWeight: number
  bgColor: string
  messageBgColor: string
  ownerMessageBgColor: string
  moderatorMessageBgColor: string
  memberMessageBgColor: string
  showScTicker: boolean
  showOtherThings: boolean
  firstLineFontSize: number
  firstLineWeight: number
  firstLineColor: string
  secondLineFontSize: number
  secondLineWeight: number
  secondLineColor: string
  scContentFontSize: number
  scContentWeight: number
  scContentColor: string
  animateIn: boolean
  fadeInTime: number
  animateOut: boolean
  animateOutWaitTime: number
  fadeOutTime: number
  slide: boolean
  reverseSlide: boolean
  useBarsInsteadOfBg: boolean
}

export interface AuthState {
  bilibili: boolean
  bilibiliUname: string
  bilibiliFace: string
  bilibiliUid: number
  netease: boolean
  neteaseUname: string
  neteaseFace: string
  neteaseUid: number
}

export interface AutoLoginResult {
  hasCredentials: boolean
  authState: AuthState
}

export interface ObsLyricStyle {
  // 歌词文本
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  textDecoration: string
  fontColor: string
  idleText: string
  idleTextRefreshInterval: number
  // 翻译
  showTranslation: boolean
  translationFontSize: number
  translationFontFamily: string
  translationFontWeight: string
  translationFontStyle: string
  translationTextDecoration: string
  translationColor: string
  splitTranslation: boolean
  // 布局
  textAlign: 'left' | 'center' | 'right'
  lineSpacing: number
  // 背景效果
  bgColor: string
  bgOpacity: number
  shadowColor: string
  shadowSize: number
  shadowOffsetX: number
  shadowOffsetY: number
}

export interface ObsQueueStyle {
  // 文字样式
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  textDecoration: string
  fontColor: string
  highlightColor: string
  showIndex: boolean
  indexColor: string
  // 点歌人
  showRequester: boolean
  requesterColor: string
  // 布局
  wordWrap: boolean
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'bottom'
  lineSpacing: number
  maxLines: number
  // 背景效果
  bgColor: string
  bgOpacity: number
  shadowColor: string
  shadowSize: number
  shadowOffsetX: number
  shadowOffsetY: number
}

export interface ObsSongInfoStyle {
  // 标题
  titleFontSize: number
  titleFontFamily: string
  titleFontWeight: string
  titleFontStyle: string
  titleTextDecoration: string
  titleColor: string
  // 作者
  splitArtist: boolean
  artistFontSize: number
  artistFontFamily: string
  artistFontWeight: string
  artistFontStyle: string
  artistTextDecoration: string
  artistColor: string
  // 点歌人
  showRequester: boolean
  requesterFontSize: number
  requesterFontFamily: string
  requesterFontWeight: string
  requesterFontStyle: string
  requesterTextDecoration: string
  requesterColor: string
  // 布局
  textAlign: 'left' | 'center' | 'right'
  lineSpacing: number
  // 背景效果
  bgColor: string
  bgOpacity: number
  shadowColor: string
  shadowSize: number
  shadowOffsetX: number
  shadowOffsetY: number
}