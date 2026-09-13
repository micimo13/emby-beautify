# 外部增强服务 · 一键构建

美化里的「JAV 增强」需要两个可选后端。本组件用 docker compose 把它们**自包含**拉起
（各自带一个 PostgreSQL，不依赖你已有数据库，也不碰你现有容器）。

| 服务 | 作用 | 默认端口 | 镜像 |
|---|---|---|---|
| **AVDB** | JavDB 聚合（搜索 / 短评 / 剧照 / 图解码） | 38000 | `leolitaly/avdb` |
| **MetaTube** | JAV 元数据刮削（番号 / 演员 / 标签 / 封面） | 28080 | `ghcr.io/metatube-community/metatube-server` |

## 用法
```bash
bash install-external.sh                 # 交互式（推荐）
bash install-external.sh --avdb          # 只装 AVDB
bash install-external.sh --metatube      # 只装 MetaTube
bash install-external.sh --avdb --metatube --proxy socks5h://user:pass@10.0.0.5:1080 --yes
bash install-external.sh --status        # 查看状态
bash install-external.sh --uninstall            # 停容器（保留数据）
bash install-external.sh --uninstall --purge    # 连数据一起删
```

参数：`--dir <安装目录>` `--avdb-port N` `--metatube-port N` `--proxy <url>` `--no-proxy` `--yes`

## 说明
- 容器名：`vanvy-avdb` / `vanvy-avdb-db` / `vanvy-metatube` / `vanvy-metatube-db`
- 数据目录：`<安装目录>/data/...`（默认 `~/vanvy-external`）
- **AVDB 首次启动需初始化数据库，约 1–2 分钟**；本脚本最多等 150s，超时也会给出提示（稍后自愈）
- AVDB 的 API Key 在其自身后台查看，填给 `install-ves.sh --avdb-key`
- 抓取外站需要出网能力 → 建议给 `--proxy`（http 或 socks5h）
- 装完把地址填给美化安装器：
  ```bash
  bash install-ves.sh --avdb http://<IP>:38000 --avdb-key <KEY> --metatube http://<IP>:28080
  ```
  或在交互式安装里选择「[1] 本机一键构建」，会自动回填。
