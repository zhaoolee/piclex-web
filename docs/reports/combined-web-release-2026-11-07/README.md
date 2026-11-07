# Web 本地改动已集中上线

- 发布源码：`89be89bdf247ecfb6fa5ae5eb16a11e18dceeca7`；发布标识 `89be89bdf247-651f7c5023b0`。
- [国内站](https://piclex.v2fy.com/piclex-web/)与 [Pages](https://zhaoolee.com/piclex-web/) 已是同一版本。[完整 Check and publish](https://github.com/zhaoolee/piclex-web/actions/runs/42423777111) 的 build、三个 browser 分片、Pages deploy、Docker publish 全部成功。
- 范围：首次交互解锁音频与照片右上角临时静音图标；移除拼写结果行；正确字母动画修复；下载弹窗的订阅链接、复制、取消确认与恢复。保留已有跟读、听写、入口、IndexedDB 订阅及备份能力。

## 实际验收

- 正式 CI：297 单元测试、45 部署脚本测试通过；浏览器 566 通过、4 原有平台不适用跳过，0 失败。日志见 `final-ci/42423777111-shard-*.log` 与 `final-ci/result.json`。
- 线上 Pages 和国内站各 16 项通过，共 32 项，覆盖真实首播被拦、图标/实体字母/触屏字母解锁、首字母保留、后续不重播、切模块、浅深色拼写布局/字母反馈和订阅取消→重进→恢复的数据保留。
- 两站 HTML 与四个入口 JS/CSS 文件 SHA256 都匹配本次发布清单；国内站标准发布入口核验全部 1170 个文件，同源资源与 Nginx 检查通过。已确认 current 为本次版本，服务器只保留当前发布包。
- Docker `latest` 与 `sha-89be89b` 同一 digest：`sha256:dbc6a2537f67f48f1022ac9e3cb0a8a3e984af4213dfeef46122e878f13c566c`，均含 linux/amd64、linux/arm64；容器集成检查通过。
- `live/` 的四张 390×844 完整页面已目视审查：图标在照片右上角，启动播放后消失，照片、输入、播放、键盘、导航无位移或新遮挡。
- 最后视觉验收使用浏览器静音，并禁用该隔离页面的系统朗读。验证播放 API、媒体状态和图标变化，不要求扬声器外放。用户要求后已确认原测试浏览器退出，未改系统音量或其他应用。

## 修复与失败证据

- 首键监听改为布局提交时注册，读取即时待重试请求，关闭异步副作用尚未挂载的窗口。4 倍 CPU 降速、真实权限拒绝后立即输入：旧版 10 次有 4 次复现，修后 10/10 通过；该条件保留在正式回归中。
- `initial-ci-failure/`、`second-ci-webkit/`、`third-ci/` 为三个被门禁拦下的候选；均未部署。分别修正首次 TTS 服务错误的状态范围、拆开订阅外观与持续数据流程、首键竞态及导入通知定位。未增加超时、降低有效断言或新增跳过。
- `final-ci/128462101*.log` 属于第二候选的 Chrome 日志，`final-ci/42394321315-*.log` 属于第三候选；最终发布依据是 `42423777111`。
- `race-native-full.log` 为修后本地 Linux 全量：565 通过、4 原有跳过、1 休眠期间超时；同代码备份用例清醒后连续 3 次通过。夜间 Mac 失败不算通过；`race-mac-awake.log` 的清醒后独立相邻流程为 36/36 通过。系统暂停证据与原始失败 trace 保留。
- 单项前后页面证据保留在相邻 `audio-unlock-2026-11-07`、`spelling-feedback-removal-2026-11-07`、`spelling-letter-color-2026-11-07` 报告。`tested-source.json` 是最终改变文件的 SHA256。
- 原始本地 Web 快照保存在 `codex/web-local-before-release-20261107`；共享源文件已同步。本任务没有操作手机、模拟器或用户学习数据。

发布与功能验收无待处理项。清理结果记录在 `memory/2026-11-08.md`。
