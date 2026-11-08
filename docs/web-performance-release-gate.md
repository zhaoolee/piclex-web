# Web 发布前卡顿测试

每次发布先测试同一份生产构建，性能失败、缺项或版本不符时禁止 Pages 和 Docker 发布。功能测试通过不能替代性能测试。App 继续使用 PicLex 仓库的 `scripts/run-app-performance.py`、`scripts/check-app-performance.py` 和真机归档门禁；Web 的结果不替代 App 真机证据。

## 独立入口

在无主机音频设备、PulseAudio 或系统朗读连接的独立 Linux 环境运行。浏览器另有媒体静音和隔离 TTS。保留真实网页、动画、输入处理、存储及同步处理；不修改系统音量，不用模拟器。

```sh
npm run test:performance -- --dist dist --source "$RELEASE_SHA" --output performance-results --channel chrome
# 上线后可复测；期间发生新部署会失败，不能混用两个版本。
npm run test:performance -- --url https://zhaoolee.com/piclex-web/ --source "$RELEASE_SHA" --output live-performance --channel chrome
```

目录必须不存在，不覆盖旧失败证据。测量前要求整个Linux环境连续5秒CPU使用低于35%；最多等10分钟，仍繁忙则阻塞。每轮记录环境CPU占用，达到85%或缺失环境证据不能放行；这不豁免任何应用性能阈值。`dist/release.json`、实际 HTML 和入口 JS/CSS 的 SHA256 必须与目标源码版本一致。CI 复用功能浏览器测试使用的同一个构建产物；不会为性能测试另建简化页面。

## 场景及判定

桌面 1440×1000 和触屏 390×844，各执行四种场景、每种三轮，共24轮：

- 连续拼写并自动完成、切题，至少40次真实输入和3次完成。
- 连续自由听写，每轮顺序覆盖简单、中等、困难，自动补空格、校验与切题，至少40次真实输入和2次完成。
- 拼单词、练听力、练口语连续切换，每个模块至少停稳两次。
- 5,000条合成答题、5,000条单词进度和对应经验记录下，自动同步同时连续拼写。检查同步上传内容，确保实际处理了历史数据。

使用全新浏览器上下文、合成卡组和隔离存储。WebDAV 只替换远程传输为内存夹具，不替换网页中的数据库读取、合并、编码、哈希、恢复和上传校验，不连接用户账户。网络异常、真实媒体自动播放权限和跨端备份正确性另由完整浏览器套件验收。TTS 的系统发声在这里隔离，不以播放声音作为性能通过条件。

每轮均需至少8秒操作和尾段、120个动画帧、真实页面 Paint 与主线程任务。拼写检查字母动画和粒子调用；困难听写原界面没有拼写粒子，不虚构效果要求。禁止 reduced motion、后台页面、空场景及只打日志没有操作的样本。

| 指标 | 每轮门槛 |
| --- | --- |
| Chrome trace 主线程单个任务 | 小于33ms，达到阈值次数为0 |
| requestAnimationFrame 间隔 | 小于50ms，达到阈值次数为0 |
| Long Tasks / Long Animation Frames | 0 |
| Event Timing 输入到绘制时长 | 小于100ms，达到阈值次数为0 |

以上是项目发布要求，不是“所有设备永久不卡”的承诺。rAF 间隔记录浏览器调度，不冒充屏幕实际呈现帧或平均FPS；Event Timing 只报告浏览器提供的事件，缺少慢事件不能被写成0ms输入延迟。Linux Chrome 测量不能代表物理手机或所有 Safari 版本。保留每轮峰值和原始记录，不把失败轮次平均掉、不放宽阈值、不开重试挑选全绿。

## 证据和门禁

可加 `--diagnostic-scenario sync` 做定位；它仍因缺少完整24轮而非零退出，不能作为发布凭据。报告记录采样脚本与规则自身的SHA256。

每轮 `*.trace.json.gz` 是原始 Chrome trace；`*.json` 保存逐帧间隔、Event Timing、长任务、真实动作与效果覆盖。`report.json` 汇总版本、资源哈希、环境和每轮结果。非零退出表示不能发布；失败证据必须保留，诊断修复后对新候选测量。

`Performance release gate` 与完整浏览器检查一起作为 Pages 和 Docker 的依赖。Docker 仅接收完整 `Check and publish` 验证的产物；独立 tag／手工入口不能绕过该门禁。门禁自身的反例测试通过 `npm test` 执行，包括单个峰值、无效数值、空采样、少操作、关闭特效、缺同步、重复和缺失轮次。
