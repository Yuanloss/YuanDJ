# NOTICE / 来源与修改说明

## 上游来源

- 项目：BxNcm DJ（B站/网易云直播点歌助手）
- 上游仓库：https://github.com/Taumata-wwq/BxNcm-DJ
- 作者：Taumata
- 本仓库对应的上游版本：**v1.2.2**（`package.json` 中的 version）
- 抓取日期：2026-11-27
- 抓取方式：按上游 `main` 分支的文件树逐个下载（jsDelivr + GitHub API），
  已对 97 个文件逐一比对字节数，与上游完全一致。

## 许可证情况

上游 README.md 第 564 行的「## 许可证」一节仅写有 `MIT License`，但上游仓库
**没有 LICENSE 文件**，`package.json` 也**没有 license 字段**（GitHub 因此未
识别出许可证）。

本仓库据此补全：

1. 新增 `LICENSE`：MIT 标准全文，保留原作者版权行 `Copyright (c) 2026 Taumata`。
2. `package.json` 增加 `"license": "MIT"` 字段。
3. 新增本文件，记录来源、修改与缺失资源。

如原作者后续发布正式 LICENSE 或改用其他许可证，应以原作者版本为准。

## 本仓库相对上游的改动

初始导入时，除下列三项外，源码与上游 v1.2.2 完全一致：

- 新增 `LICENSE`
- 新增 `NOTICE.md`（本文件）
- `package.json` 增加 `"license": "MIT"`

> 后续你自己的修改请继续在本节记录，例如：
> - 2026-11-28 修改 `src/main/services/...`：调整为支持 xxx

## 未下载的上游资源

上游有 9 个 README 演示 GIF / 截图体积较大（合计约 107 MB），本次未下载，
**不影响编译与打包**。清单与下载链接见 `docs/MISSING-UPSTREAM-ASSETS.md`。

## 第三方组件许可

打包后的安装目录中应保留：

- `LICENSE.electron.txt`、`LICENSES.chromium.html`（Electron / Chromium）
- `ffmpeg.dll` 相关的 ffmpeg 许可声明

主要依赖的许可证（详见 `package-lock.json` 与各依赖自身声明）：

| 依赖 | 用途 | 许可证 |
| --- | --- | --- |
| Electron 33 | 桌面运行时 | MIT（含 Chromium/BSD 类组件） |
| Vue 3 / vue-router / Pinia | 渲染进程 UI | MIT |
| Vite 6 / vite-plugin-electron | 构建与开发服务器 | MIT |
| TypeScript / vue-tsc | 类型检查 | Apache-2.0 |
| electron-builder 25 | 打包/生成安装包 | MIT |
| electron-updater | 自动更新 | MIT |
| ws | B站直播 WebSocket | MIT |
| qrcode | 登录二维码 | MIT |

## 免责声明

本项目通过 **B站、网易云音乐的非官方接口** 获取数据，仅供个人学习与自用。
由此产生的账号、版权、平台协议风险由使用者自行承担；B站、网易云音乐等名称与
商标归各自权利人所有，本项目与其无隶属关系。
