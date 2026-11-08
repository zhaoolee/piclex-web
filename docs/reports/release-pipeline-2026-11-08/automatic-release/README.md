# 国内站受限自动触发配置（已安装，待新版本实跑）

目标是复用现有五个标准发布脚本，让正常发布不再停下来等待 sudo 密码；完整校验、失败回退和成功后的安全清理均保留。不会立即发布，也不新增构建或测试流程。

## 已验证

- 五个源脚本 SHA256 与当前服务器逐一相同；安装前再次核对并只复制这些固定字节。
- 服务器 systemd 255 的 `systemd-analyze verify` 返回成功；无 sudo 预览已通过。输出中的其他共享服务权限提示未作修改。
- 用户已明确执行管理员安装，已核验服务启用、脚本权限和全部哈希一致。首次无密码触发7.052秒退出成功，版本a8c8e09未变化；这只是无变化探测，不能作为新版本发布或双站两分钟已完成的证据。

## 安装产生的确切变化

- `/usr/local/lib/piclex-public-updater/`：五个 root 所有的标准脚本副本。
- `/etc/systemd/system/piclex-public-updater.service`：只能运行固定更新器。服务内将整个脚本目录映射到只读副本，普通用户无法替换管理员将执行的 Python 文件或导入模块。
- `/etc/systemd/system/piclex-public-updater.path`：监听一个请求文件并启动固定服务。
- `/etc/tmpfiles.d/piclex-public-updater.conf`：重启后创建 root 所有的请求目录及 hermes 可写的请求文件。
- 不修改 sudoers、不放置 SSH 私钥、不改现有脚本或 Nginx 配置，不给予任意管理员命令入口。

管理员一次性命令（已准备好服务器临时包）：

```sh
ssh -t hermes-v2fy 'sudo python3 -B /tmp/piclex-release-automation-01a1b97a-20261108/install.py --apply'
```

用户已明确执行上述一次性安装，现已生效。安装器拒绝覆盖已有配置，不应再次执行。无 `--apply` 时只验证，不改系统。

安装并验证后，代理在 Pages 发布和版本核验成功后才请求国内同步：

```sh
ssh hermes-v2fy 'printf release > /run/piclex-public-updater/request'
```

随后必须核对 service 的 `Result`、`ExecMainStatus`、国内站精确源码/资源、标准更新器清理记录，以及必要线上行为；请求文件写入成功不代表发布成功。候选检查未完成时继续计入发布总等待，不能改计时起点。

当前限制：新版本切换的完整运行验收与总计时尚待完成。国内请求必须在 Pages 精确版本出现后由机器立即触发，避免聊天轮询空等；GitHub 排队、网络、标准清理和线上验收均计入两分钟实测。
