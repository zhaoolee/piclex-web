# 公开卡组与测试素材

生产网页使用 `content/snapshot.json` 记录的现有公开卡组；生成的照片、词条、完整包不加入 Git。公开访问不代表授予 MIT 许可；代码许可不覆盖卡组内容，内容权利以原来源为准。

以下照片现仅用于 `tests/fixtures/demo/` 的历史测试夹具，不再作为生产首页卡组。

# 示例素材

代码的 MIT 许可不改变以下照片各自的许可。照片已下载为本地 JPEG，示例不依赖第三方图片请求。所有照片均来自公开图库，不包含用户的私人照片。

| 文件 | 作者 | 原始页面 | 许可 |
| --- | --- | --- | --- |
| cafe.jpg | Kawin Harasai | [Rustic Cafe Table](https://commons.wikimedia.org/wiki/File:Rustic_Cafe_Table_(Unsplash).jpg) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)；Commons 页面记录其于 Unsplash 许可变更前发布 |
| travel.jpg | My Spain Visa | [Ready for a trip](https://unsplash.com/photos/C082gaOEDyM) | [Unsplash License](https://unsplash.com/license) |
| home.jpg | Puscas Adryan | [Desk with open book, plant, and lamp](https://unsplash.com/photos/w6VGEybp5wc) | [Unsplash License](https://unsplash.com/license) |

来源核对：2026-11-03。照片由来源 CDN 输出适合网页展示的 JPEG 尺寸。示例包内保留相同图片字节；没有将素材许可改写为 MIT。新增或替换素材时应更新此表和公开站 credits.html。

示例词汇释义与例句为本项目编写，不使用教材课程正文。摄影图标复用 App 的生产绘制。第三方软件依赖许可由各包提供，根 package-lock.json 锁定版本。

## 薯薯求生与学习反馈

Web 复用摄影学英语 App 的 `local-web/src/lab` 游戏引擎、角色／道具美术、合成音效及经典按键声音。音标子集来自 [ipa-dict](https://github.com/open-dict-data/ipa-dict)，版权与完整 MIT 许可保存在 `apps/public/public/lab/EnglishPronunciations-LICENSE.txt` 和源文件。游戏素材沿用项目资产，不把公开卡组照片的许可改为代码 MIT 许可。

## 品牌标志

`brand/app-icon.png` 与摄影学英语 App 的 `AppIcon.appiconset/AppIcon.png` 字节一致。黑色 Download on the App Store 徽章来自 [Apple 官方营销素材](https://developer.apple.com/app-store/marketing/guidelines/) 的 [英文黑色 SVG](https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83)，仅用于链接已上架 App，不属于项目 MIT 代码许可。

`icons/tab-*.png` 来自 App 的 `PracticeEntryIcon.swift` 原绘制与动画；其余界面符号由 App 所用 UIKit/SF Symbols 渲染，不将 Apple 的系统符号重新授权为项目原创 MIT 美术。来源和摘要保存在 `docs/native-icons.json`。

- 经典英语歌曲公开卡组来自 https://piclex.v2fy.com/public/subscriptions/classic-english-songs/feed.json ，快照固定v4、8张卡片、52句及52段MP3。公开可访问不代表MIT授权；歌词、原音频及图片权利由原来源保留，不属于代码许可。

## 快门声音

`audio/minolta-shutter.wav` 原样复用 PicLex `ShutterSoundMinolta.dataset/minolta-shutter.wav`，与 App 默认快门音字节一致；素材沿用原项目权利，不另行声称为 MIT 代码。

## 相机商店入口与卡片品牌

商店入口使用 [Simple Icons App Store矢量轮廓](https://github.com/simple-icons/simple-icons/blob/develop/icons/appstore.svg)，按其[CC0许可](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md)保留透明单色，不使用自行拼接的三条贯穿直线。App Store商标仍归Apple，不作为本项目原创MIT品牌资产。`brand/card-logo.png` 原样复用PicLex `BrandLogo.imageset/BrandLogo.png`，与App卡片实际品牌资产一致。

## 拼写成功反馈

`audio/correct-word.wav` 原样复用PicLex `PracticeCorrectSound.dataset/correct-word.wav`，0.32秒清脆双音，沿用原项目权利；不是新生成或替代音色。


## 拍摄页沙丘背景

`apps/public/src/assets/camera-soft-dunes.webp` 为本项目通过 imagegen 生成的原创摄影风格素材，参考 Mojave 沙丘的柔和光影。Apple 官方示意图仅用于视觉研究，不随站点分发；本文件不声称对 Apple 壁纸拥有授权。原始生成图保留于本机生成图库，网页使用约21KB的WebP。

## 自定义键盘音色

`audio/` 中经典及其余13种键盘敲击音原样复用 App `TypingKeySound.dataset` 与 `TypingSound*.dataset`；名称、原始字节、音高与播放增益保持一致，沿用原项目素材权利，不作为新合成音或重新授权为 MIT。

## Additional native shutter sounds and GitHub mark

`kodak-shutter.wav` / `brownie-shutter.wav` are unmodified copies of PicLex's ShutterSoundKodak / ShutterSoundBrownieHawkeye datasets, under the same rights as the native assets.

The camera's GitHub mark is `mark-github-16` from [GitHub Octicons](https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg), MIT license (Copyright GitHub, Inc.); GitHub trademarks remain their owner's. The full existing MIT terms apply to this incorporated SVG.

## 学习页表面与句子背景声

浅色学习页复用 App 的 `PracticeReliefSurface` 参数；其 Uiverse ke1221 ancient-walrus-24 来源和完整 MIT 声明保存在 `docs/licenses/uiverse-ke1221.txt`。

`audio/ambience/piano.m4a` 与 `cafe.m4a` 原样复用 App `Resources/PracticeAmbience`。钢琴为项目原创16小节旋律；咖啡厅使用 stephan 的公共领域 [Restaurant Ambience](https://commons.wikimedia.org/wiki/File:Restaurant_ambience.ogg) 加工录音（2007-05-18，PDSounds 274）。混音、均衡、瓷器／蒸汽层与循环处理与 App 一致，不包含用户录音。

## README 人物头像

下列肖像来自 Wikimedia Commons。仓库版本已缩小并重新编码为 JPEG，沿用各文件的原许可。

| 文件 | 作者或署名 | 原始文件页 | 许可 |
| --- | --- | --- | --- |
| `README.assets/english-learning/mao-zedong.jpg` | 陈正青 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Mao_Zedong_1950_Portrait_%283x4_cropped%29.jpg) | 公共领域（见原始文件页） |
| `README.assets/english-learning/jiang-zemin.jpg` | Kremlin.ru / Roman Kubanskiy | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Jiang_Zemin_2002.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `README.assets/english-learning/ren-zhengfei.jpg` | © European Union, 2010 / EC, Photo: Etienne Ansotte | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ren_Zhengfei_%282010%29.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `README.assets/english-learning/jack-ma.jpg` | World Economic Forum / Natalie Behring | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Jack_Ma_Yun%2C_Tianjin%2C_2008_%28cropped%29.jpg) | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `README.assets/english-learning/yu-minhong.jpg` | 太子太保啦啦 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Yu_Minhong_in_Lanzhou_University.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `README.assets/english-learning/lei-jun.jpg` | DirectX3 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lei_Jun.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

张朝阳的头像由加州大学圣迭戈分校网站提供，README 使用原站图片地址。[加州大学圣迭戈分校人物档案](https://ccgt.ucsd.edu/fellows/past/zang.html)
