# piclex.v2fy.com 镜像部署

同一份公开 Web 在两个域名的 `/piclex-web/` 提供相同入口，`piclex.v2fy.com` 的根路径 `/` 跳转到该目录，构建资源、公开照片、卡组与来源清单放在 `/piclex-web/`。现有 `/v1/`、`/healthz`、`/decks/`、`/public/` 保持原配置。代码、图片和卡组下载不需要访问 GitHub；GitHub/App Store/素材来源仍是用户主动打开的外链。

## 构建

```sh
npm ci
npm run test:deploy
npm run content:build
npm run mirror:build
```

产物在 `dist-mirror/`：`piclex-web/` 静态资源与 `release.json` 文件哈希清单。脚本拒绝覆盖旧目录；后续重建前只删除自己生成且已不使用的 `dist-mirror/`。复用 Pages 的同一份 `dist/`；所有来源地址采用站内绝对路径。镜像来源为 `https://piclex.v2fy.com/piclex-web/source.json`，全部公开包的字节与 SHA256 保持一致。

## 上传与验证

将整个产物放入服务器 `/home/hermes/piclex-web/releases/<releaseID>/`，`releaseID` 取自清单。将本目录的 Python 脚本放到 `/home/hermes/piclex-web/deploy/`。所有发布文件须可由 Nginx 用户读取；只上传公开构建产物，不上传 .env、源代码或用户文件。

```sh
python3 -B /home/hermes/piclex-web/deploy/check-mirror.py --release /home/hermes/piclex-web/releases/<releaseID>
python3 -B /home/hermes/piclex-web/deploy/activate.py --release /home/hermes/piclex-web/releases/<releaseID>
```

第一条在临时回环端口启动独立 Nginx，校验 HTML、JS/CSS MIME、公开卡组/图片/哈希、同源来源和禁止目录列举/写入/隐藏文件。退出时停止该临时进程并删除临时文件。第二条仅显示正式配置的精确差异，不修改生产状态。

## 发布、验证与自动清理

服务器统一使用 `/home/hermes/piclex-web/deploy/activate.py`。同步本目录的 `activate.py`、`release_lifecycle.py`、`release_state.py` 和 `check-mirror.py`，不再复制旧版脚本另行切换 `current`。

```sh
sudo python3 -B /home/hermes/piclex-web/deploy/activate.py --release /home/hermes/piclex-web/releases/<releaseID> --apply
```

这条命令在统一发布锁内依次执行：完整 SHA256 清单验证、独立 Nginx 验收、原子切换与重载、源站及公网 HTTPS 验证，最后自动清理旧发布包。HTTPS 验证覆盖首页、存在的订阅／游戏入口及它们引用的 JS/CSS、来源／词库索引和 `/healthz`。只有全部通过才开始删除旧版；验证或重载失败会恢复原指针和配置，旧包不删。

**成功发布只保留当前版本，不保留历史或回滚包。** 历史源码由 GitHub 保存，之后需要旧版时重新构建发布；配置备份保留用于诊断，不代表旧发布包仍可用。仅上传或 `nginx -t` 通过不算发布成功。

清理仅扫描 `/home/hermes/piclex-web/releases/` 的直接子目录，要求目录名称、发布清单和每个公开文件的 SHA256 一致。符号链接、挂载点、清单外文件、活动进程／容器／服务配置引用都阻止删除；最近一小时内的非前任候选包视为可能正在上传，保留并报错。数据库、上传照片、Docker 卷、服务配置、其他项目与通用 `/tmp` 不属于清理范围。当前版本会在删除前后复验，硬链接只解除旧目录引用。

若旧包因在使用等原因未清理，命令会返回失败并明确区分“新版已验证上线、清理未完成”；不会回滚到可能已经删除的旧包。详情写入 `reports/last-release-cleanup.json`。解除占用后用同一入口重新验证并完成清理，不必重新切换或重载：

```sh
sudo python3 -B /home/hermes/piclex-web/deploy/activate.py --finalize-current --apply
```

不带 `--apply` 只预览，不联网验证、不切换、不删除。上传前仍需检查磁盘余量；候选包先放 `incoming/` 或任务独有的暂存目录，完成上传后再移入 `releases/`，避免把尚在写入的目录当作正式候选。不要用保留大量历史包代替 GitHub，也不要原地改写被硬链接复用的文件；替换候选文件须先断开候选链接。

两个发布入口都会在切换前、发布锁内将真实的前任、目标目录身份与目标配置 SHA256 原子写入 `reports/activation-<releaseID>.json`，并同步到磁盘。即使切换后进程退出或清理报错，`--finalize-current --apply` 也能识别刚被替换的前任，无需等待一小时上传保护期。每个目标独立记录；失败回退和重新激活当前版本不会覆盖当前版本的记录。旧版仍兼容原 Nginx 配置备份记录。

记录仅用于识别前任，不替代源站／公网验证、完整文件清单、进程／容器／服务配置引用、符号链接／挂载点与目录身份检查；最近上传的其他候选仍受一小时保护。记录损坏、配置变化或同名目录被替换会停止重试，不手工补造记录或改时间来跳过保护。

浏览器行为回归仍在发布前完成；脚本的 HTTPS 检查验证实际资源和后端健康，不冒充真机人工验收。各域名浏览器存储互相独立，原 Pages 学习进度不会自动迁移。

## 本轮状态

2026-11-03：部署工具与镜像构建完成；8 项部署测试和本机浏览器首页/进入练习/拼对判定通过。服务器上传、隔离验收和正式激活结果记录于 `memory/2026-11-03.md`。

两个入口已上线，根入口自动跳转到 `/piclex-web/`。完整结果与网络验收边界见 `docs/reports/2026-11-03-mirror-verification.json`。

## 公开卡组自动更新

Pages 的完整检查成功后才发布 `/piclex-web/release.json`，其中列出本次公开文件的大小、SHA256 与源码提交。服务器上的 `deploy/auto-update-public.py` 在发布流程中读取这份清单；若版本未变就退出。版本有变时，仅从 Pages 下载新文件，复用逐字节核验过的旧文件，再按已有 `check-mirror.py` 验证独立 Nginx。它在同一发布锁内原子切换 `current`，检查源站和公网 HTTPS；失败恢复前一版本，成功后使用已有安全清理器处理旧版。现有 Nginx 配置必须与标准 Web 路由完全一致，脚本不会编辑配置或重载服务。

每次内容发布时，使用 `--check` 只校验候选包；正式运行前确认 Pages 该提交已经通过完整检查。不能以 Docker 发布成功替代 Pages 检查；若 Pages 暂时不可达或哈希不符，本次更新失败并保留当前站点。

```sh
python3 -B /home/hermes/piclex-web/deploy/auto-update-public.py --check
sudo python3 -B /home/hermes/piclex-web/deploy/auto-update-public.py
```

正式自动更新须使用管理员身份，以读取全部进程和容器占用；权限不足会在下载／切换前拒绝，不能跳过安全扫描。`--check` 可由普通用户执行且不写交接记录。若清理失败，使用上面的标准 finalizer 重试；重复运行自动更新器遇到相同版本仍只退出，不冒充清理完成。

## 并行发布候选

国内站可以提前暂存经过完整门禁的 GitHub Pages 产物差异。生产切换仍通过原有 systemd 服务和发布锁。只有指定的 GitHub 正式发布运行进入受保护环境并通过候选检查后才可切换，候选 SHA 和运行 ID 在两端一致。GitHub API 回执、原始清单压缩包摘要、完整文件哈希、回环 Nginx、源站和公网验收及清理均保留。

候选准备阶段运行以下命令，保存输出的 JSON。若已下载该运行的 Pages artifact.tar，传入 `--pages-tar` 避免重复下载。此命令只写 `incoming/verified-<run>`，与发布计时分开。

```sh
python3 -B deploy/stage-verified-release.py --candidate-run "$CANDIDATE_RUN" --revision "$REVISION" > mirror-stage.json
```

在新版 `release.yml` 和服务器更新器都已生效后，开始正式发布计时。向现有 GitHub 工作流传入 `revision` 与 `candidate_run`。取得新的 `workflow_run_id` 后，通过原有 SSH 身份将 JSON 写入 `/run/piclex-public-updater/request`。JSON 只包含 `candidateRun`、`releaseRun`、`revision` 和 `previousRevision`。前任版本取自暂存回执。更新器会拒绝另一次运行、旧版本、过期或失败回执和基线变化。旧入口使用纯 SHA 或空文件触发原 Pages 镜像更新。

必须等待 GitHub 正式运行成功和国内更新服务成功。国内站实际浏览器操作使用隔离 Linux 中的 `node scripts/verify-live-release.mjs https://piclex.v2fy.com/piclex-web/ --mirror-smoke`。在浏览器操作前后运行 `deploy/verify-remote-release.py` 回读完整清单摘要。任一端失败都记录已切换的端及其版本，并保留失败证据。以发起正式发布前的预检开始到实际双站、镜像和行为验收完成计算 60 秒，候选准备另计。

现有服务把 `/usr/local/lib/piclex-public-updater` 以只读方式绑定进来。启用须由管理员将本版 `verified_candidate.py` 和 `auto-update-public.py` 安装到该目录。先安装校验模块，再在原发布锁内原子替换入口。保留旧入口的管理员备份用于回退。按部署时提供的 SHA-256 核对两份文件。无需编辑 systemd 单元、重载 Nginx 或增加凭据。
