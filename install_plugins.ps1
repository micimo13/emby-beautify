<#
=============================================================================
 Vanvy Emby Kit · Windows PowerShell 安装器 (install_plugins.ps1)
 ---------------------------------------------------------------------------
 适用: Emby Server 跑在 Windows 上的部署场景 (非 Docker)
 功能对等 bash 版 install.sh:
   - 自动定位 Emby Web 目录 (system/dashboard-ui)
   - 出厂原始 index.html 备份 (时间戳栈)
   - 安装轮播 + 主题 + 功能增强组件
   - 幂等注入 (marker 已存在则跳过)

 用法 (以管理员运行 PowerShell):
   .\install_plugins.ps1 -Package full          # 全家桶
   .\install_plugins.ps1 -Style fluent_layout   # 仅 Fluent 布局
   .\install_plugins.ps1 -Style banner_fluent -Features danmaku,douban
   .\install_plugins.ps1 -Uninstall             # 卸载全部美化

 注意: 运行前请先停止 Emby Server 服务 (避免文件被锁定)。
 经验吸收自: xueayi/Emby-Plugin-Quick-Deployment
=============================================================================
#>
[CmdletBinding()]
param(
    [string]$Package = "",          # minimal / movie / detail / full
    [string]$Style = "",            # banner_classic / banner_fluent / banner_carousel
    [string]$Themes = "",           # 逗号分隔: glass_blue,glass_purple,vanvy_custom
    [string]$Features = "",         # 逗号分隔: danmaku,douban,fluent_layout,global_fonts...
    [switch]$Uninstall,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── 颜色输出 ──
function Info($m)  { Write-Host "[信息] $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "[成功] $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "[警告] $m" -ForegroundColor Yellow }
function Err($m)   { Write-Host "[错误] $m" -ForegroundColor Red }

# ── 定位 Emby Web 目录 ──
function Find-EmbyWeb {
    $candidates = @(
        "$env:ProgramFiles\EmbyServer\system\dashboard-ui",
        "${env:ProgramFiles(x86)}\EmbyServer\system\dashboard-ui",
        "$env:LOCALAPPDATA\EmbyServer\system\dashboard-ui",
        "C:\EmbyServer\system\dashboard-ui",
        "D:\EmbyServer\system\dashboard-ui"
    )
    foreach ($c in $candidates) {
        if (Test-Path "$c\index.html") { return $c }
    }
    # 兜底: 全盘搜索 (限常见盘)
    foreach ($drive in @("C:", "D:", "E:")) {
        if (Test-Path "$drive\") {
            $hit = Get-ChildItem -Path "$drive\" -Filter "dashboard-ui" -Directory -Recurse -Depth 4 -ErrorAction SilentlyContinue |
                Where-Object { Test-Path "$($_.FullName)\index.html" } | Select-Object -First 1
            if ($hit) { return $hit.FullName }
        }
    }
    return $null
}

# ── 备份 index.html (时间戳栈) ──
function Backup-Index($indexFile) {
    $backupDir = Join-Path $env:ProgramData "emby-beautify\backups"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item $indexFile (Join-Path $backupDir "index.html.bak.$ts") -Force
    Ok "✓ index.html 已备份: $backupDir\index.html.bak.$ts"
}

# ── 幂等注入: 在 </head> 前插入, marker 已存在则跳过 ──
function Inject-Index($indexFile, [string[]]$lines) {
    $content = Get-Content $indexFile -Raw -Encoding UTF8
    $need = @()
    foreach ($line in $lines) {
        if ($line -and -not $content.Contains($line)) { $need += $line }
    }
    if ($need.Count -eq 0) { Info "注入行均已存在, 跳过"; return }
    if ($content -match "</head>") {
        $content = $content -replace "</head>", (($need -join "`n") + "`n</head>")
    } elseif ($content -match "<body") {
        $content = $content -replace "<body", (($need -join "`n") + "`n<body")
    } else {
        Err "index.html 无 </head>/<body>, 注入中止"; exit 1
    }
    Set-Content $indexFile $content -Encoding UTF8 -NoNewline
    Ok "✓ 注入完成: $($need.Count) 行"
}

# ── 复制资源目录 ──
function Copy-Assets($src, $dst) {
    if (-not (Test-Path $src)) { Warn "源目录不存在: $src"; return }
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
    Copy-Item "$src\*" $dst -Recurse -Force
    Ok "✓ 资源复制: $src → $dst"
}

# ── 组件注册表 (与 lib/manifest.sh 对齐) ──
$MANIFEST_STYLES = @(
    @{ id="banner_classic";  name="🎠 经典轮播"; compat=@("4.8");     dir="components/home/banner_classic";  inject=@('<link rel="stylesheet" id="theme-css" href="vanvy/banner_classic/style.css" type="text/css" media="all" />','<script src="vanvy/core/common-utils.js"></script>','<script src="vanvy/core/jquery-3.6.0.min.js"></script>','<script src="vanvy/core/md5.min.js"></script>','<script src="vanvy/banner_classic/banner-classic.js"></script>') },
    @{ id="banner_fluent";   name="🎠 Fluent轮播"; compat=@("4.8","4.9"); dir="components/home/banner_fluent";   inject=@('<link rel="stylesheet" id="theme-css" href="vanvy/banner_fluent/style.css" type="text/css" media="all" />','<script src="vanvy/core/common-utils.js"></script>','<script src="vanvy/core/jquery-3.6.0.min.js"></script>','<script src="vanvy/core/md5.min.js"></script>','<script src="vanvy/banner_fluent/banner-fluent.js"></script>') },
    @{ id="banner_carousel"; name="🎠 Banner图轮播"; compat=@("4.8","4.9"); dir="components/home/banner_carousel"; inject=@('<script src="vanvy/core/common-utils.js"></script>','<script src="vanvy/core/jquery-3.6.0.min.js"></script>','<script src="vanvy/core/md5.min.js"></script>','<script src="vanvy/banner_carousel/banner-carousel.js"></script>') }
)
$MANIFEST_THEMES = @(
    @{ id="glass_graphite"; name="🍇 石墨黑毛玻璃"; dir="components/themes/glass_graphite"; css="vanvy/themes/glass_graphite.css"; js="theme-glass_graphite" },
    @{ id="glass_blue";     name="🔵 冰川蓝毛玻璃"; dir="components/themes/glass_blue";     css="vanvy/themes/glass_blue.css";     js="theme-glass_blue" },
    @{ id="glass_purple";   name="🟣 极光紫毛玻璃"; dir="components/themes/glass_purple";   css="vanvy/themes/glass_purple.css";   js="theme-glass_purple" },
    @{ id="glass_emerald";  name="🟢 翡翠绿毛玻璃"; dir="components/themes/glass_emerald";  css="vanvy/themes/glass_emerald.css";  js="theme-glass_emerald" },
    @{ id="glass_pink";     name="🩷 樱花粉毛玻璃"; dir="components/themes/glass_pink";     css="vanvy/themes/glass_pink.css";     js="theme-glass_pink" },
    @{ id="glass_amber";    name="🟠 琥珀金毛玻璃"; dir="components/themes/glass_amber";    css="vanvy/themes/glass_amber.css";    js="theme-glass_amber" },
    @{ id="vanvy_custom";   name="👑 Vanvy 定制美化"; dir="components/themes/vanvy_custom"; css="vanvy/themes/vanvy_custom.css"; js="theme-vanvy_custom" }
)
$MANIFEST_FEATURES = @(
    @{ id="vanvy_core";     name="🧩 核心库";      dir="core"; inject=@('<script src="vanvy/core/vanvy-core.js"></script>') },
    @{ id="danmaku";        name="💬 弹幕";        dir="components/features/danmaku";        inject=@('<script src="vanvy/features/danmaku/ede.js" charset="utf-8"></script>') },
    @{ id="douban";         name="⭐ 豆瓣评分";    dir="components/features/douban";         inject=@('<script src="vanvy/features/douban/douban-score.js"></script>') },
    @{ id="playbackrate";   name="⏩ 播放倍速";    dir="components/features/playbackrate";   inject=@('<script src="vanvy/features/playbackrate/playback-speed.js"></script>') },
    @{ id="localplayer";    name="🎬 第三方播放器"; dir="components/features/localplayer";  inject=@('<script src="vanvy/features/localplayer/external-player.js"></script>') },
    @{ id="embytool";       name="🔗 远程路径";    dir="components/features/embytool";       inject=@('<script src="vanvy/features/embytool/remote-path.js"></script>') },
    @{ id="jav_details";    name="🔞 JAV元数据";   dir="components/features/jav_details";    inject=@('<script src="vanvy/features/jav_details/cn2t.js"></script>','<script src="vanvy/features/jav_details/trailer_more_button.js"></script>','<script src="vanvy/features/jav_details/emby_detail_page.js"></script>','<script src="vanvy/features/jav_details/list_page_trailer.js"></script>','<script src="vanvy/features/jav_details/actor_page.js"></script>') },
    @{ id="player_enhance"; name="🎞️ 播放页增强"; dir="components/features/player_enhance"; inject=@('<link rel="stylesheet" href="vanvy/features/player_enhance/style.css" type="text/css" media="all" />','<script src="vanvy/features/player_enhance/player-enhance.js"></script>') },
    @{ id="fluent_layout";  name="🪟 Fluent布局";  dir="components/features/fluent_layout";  inject=@('<script src="vanvy/features/fluent_layout/fluent-layout.js"></script>') },
    @{ id="global_fonts";   name="🔤 全局字体";    dir="components/features/global_fonts";   inject=@('<link rel="stylesheet" href="vanvy/features/global_fonts/style.css" type="text/css" media="all" />','<script src="vanvy/features/global_fonts/global-fonts.js"></script>') },
    @{ id="hover_glow";     name="✨ 悬停发光";    dir="components/features/hover_glow";     inject=@('<link rel="stylesheet" href="vanvy/features/hover_glow/style.css" type="text/css" media="all" />','<script src="vanvy/features/hover_glow/hover-glow.js"></script>') },
    @{ id="detail_extra";   name="🖼️ 详情增强";   dir="components/features/detail_extra";   inject=@('<script src="vanvy/features/detail_extra/extrafanart-trailers.js"></script>') },
    @{ id="extrafanart";    name="🖼️ 剧照展示";   dir="components/features/extrafanart";    inject=@('<script src="vanvy/features/extrafanart/stills.js"></script>') }
)
$MANIFEST_PACKAGES = @(
    @{ id="minimal"; name="📦 极简包"; comps=@("banner_classic","vanvy_custom") },
    @{ id="movie";   name="📦 观影包"; comps=@("banner_classic","vanvy_custom","danmaku","douban","playbackrate","localplayer","embytool","fluent_layout","global_fonts","extrafanart") },
    @{ id="detail";  name="📦 详情包"; comps=@("banner_classic","vanvy_custom","jav_details") },
    @{ id="full";    name="📦 全家桶"; comps=@("banner_classic","vanvy_custom","danmaku","douban","playbackrate","localplayer","embytool","jav_details","player_enhance","fluent_layout","global_fonts","hover_glow","detail_extra","extrafanart") }
)

# ── 解析 Emby 版本 (从 app.js 或 System/Info) ──
function Get-EmbyVersion($webDir) {
    $appJs = Join-Path $webDir "app.js"
    if (Test-Path $appJs) {
        $raw = Get-Content $appJs -Raw -ErrorAction SilentlyContinue
        if ($raw -match "4\.(\d+)\.") { return "4.$($Matches[1])" }
    }
    return "4.9"  # 默认按 4.9 处理
}

# ── 安装单个组件 ──
function Install-Component($type, $id, $webDir) {
    $entry = $null
    switch ($type) {
        "style"   { $entry = $MANIFEST_STYLES | Where-Object { $_.id -eq $id } | Select-Object -First 1 }
        "theme"   { $entry = $MANIFEST_THEMES | Where-Object { $_.id -eq $id } | Select-Object -First 1 }
        "feature" { $entry = $MANIFEST_FEATURES | Where-Object { $_.id -eq $id } | Select-Object -First 1 }
    }
    if (-not $entry) { Warn "未知组件: $type/$id"; return }

    # 版本过滤 (style)
    if ($type -eq "style" -and $entry.compat -and $entry.compat -notcontains $VER_MAJOR) {
        # fallback: 找兼容的其他 style
        $fb = $MANIFEST_STYLES | Where-Object { $_.compat -contains $VER_MAJOR } | Select-Object -First 1
        if ($fb) {
            Warn "组件 [$($entry.name)] 不兼容 Emby $VER_MAJOR, 自动切换为: $($fb.name)"
            $entry = $fb
        } else {
            Warn "组件 [$($entry.name)] 不兼容 Emby $VER_MAJOR, 跳过"; return
        }
    }

    Info "安装 [$type] $($entry.name) ..."
    $vanvyRoot = Join-Path $webDir "vanvy"

    switch ($type) {
        "style" {
            # 轮播: 推 core + carousel_rules + banner
            Copy-Assets (Join-Path $ScriptDir "core") (Join-Path $vanvyRoot "core")
            if (Test-Path (Join-Path $ScriptDir "components\home\carousel_rules")) {
                Copy-Assets (Join-Path $ScriptDir "components\home\carousel_rules") (Join-Path $vanvyRoot "carousel_rules")
            }
            Copy-Assets (Join-Path $ScriptDir $entry.dir) (Join-Path $vanvyRoot $entry.id)
            $lines = @('<script src="vanvy/carousel_rules/rules-loader.js"></script>') + $entry.inject
            Inject-Index (Join-Path $webDir "index.html") $lines
        }
        "theme" {
            Copy-Assets (Join-Path $ScriptDir $entry.dir) (Join-Path $vanvyRoot "themes")
            $lines = @("<link rel=`"stylesheet`" href=`"$($entry.css)`" type=`"text/css`" media=`"all`" />")
            Inject-Index (Join-Path $webDir "index.html") $lines
        }
        "feature" {
            if ($id -eq "vanvy_core") {
                Copy-Assets (Join-Path $ScriptDir "core") (Join-Path $vanvyRoot "core")
            } else {
                Copy-Assets (Join-Path $ScriptDir $entry.dir) (Join-Path $vanvyRoot "features\$id")
            }
            Inject-Index (Join-Path $webDir "index.html") $entry.inject
        }
    }
    Ok "✓ [$($entry.name)] 完成"
}

# ── 卸载 ──
function Uninstall-All($webDir) {
    Info "卸载全部美化..."
    $indexFile = Join-Path $webDir "index.html"
    $content = Get-Content $indexFile -Raw -Encoding UTF8
    $content = $content -replace '(?m)^\s*<script[^>]*src="vanvy/[^"]*"[^>]*>\s*</script>\s*', ""
    $content = $content -replace '(?m)^\s*<link[^>]*href="vanvy/[^"]*"[^>]*>\s*', ""
    Set-Content $indexFile $content -Encoding UTF8 -NoNewline
    $vanvyRoot = Join-Path $webDir "vanvy"
    if (Test-Path $vanvyRoot) { Remove-Item $vanvyRoot -Recurse -Force }
    if (Test-Path (Join-Path $webDir "config.json")) { Remove-Item (Join-Path $webDir "config.json") -Force }
    Ok "✅ 已卸载全部美化"
}

# ══════════ 主流程 ══════════
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║  🎨 Vanvy Emby Kit · Windows 安装器         ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$webDir = Find-EmbyWeb
if (-not $webDir) {
    Err "未找到 Emby Web 目录 (system/dashboard-ui)。"
    Err "请确认 Emby 已安装, 或用 -WebDir 手动指定。"
    exit 1
}
Info "Emby Web 目录: $webDir"
$VER_MAJOR = Get-EmbyVersion $webDir
Info "检测到 Emby 版本: $VER_MAJOR"

if ($Uninstall) {
    Uninstall-All $webDir
    Warn "提示: 浏览器强制刷新 (Ctrl+F5) 查看效果"
    exit 0
}

# 出厂原始备份
$indexFile = Join-Path $webDir "index.html"
$raw = Get-Content $indexFile -Raw -Encoding UTF8
if (-not $raw.Contains("vanvy/")) {
    $backupDir = Join-Path $env:ProgramData "emby-beautify\backups"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item $indexFile (Join-Path $backupDir "index.html.pristine.$ts") -Force
    Ok "✓ 出厂原始 index.html 已备份"
}

# 组装组件列表
$styleId = ""; $themeIds = @(); $featureIds = @()
if ($Package) {
    $pkg = $MANIFEST_PACKAGES | Where-Object { $_.id -eq $Package } | Select-Object -First 1
    if (-not $pkg) { Err "未知组件包: $Package (可选: minimal/movie/detail/full)"; exit 1 }
    Info "安装组件包: $($pkg.name)"
    $styleId = $pkg.comps[0]
    foreach ($c in $pkg.comps[1..($pkg.comps.Count-1)]) {
        if ($MANIFEST_THEMES | Where-Object { $_.id -eq $c }) { $themeIds += $c }
        elseif ($MANIFEST_FEATURES | Where-Object { $_.id -eq $c }) { $featureIds += $c }
    }
} else {
    if ($Style) { $styleId = $Style }
    if ($Themes) { $themeIds = $Themes -split "," }
    if ($Features) { $featureIds = $Features -split "," }
}

if (-not $styleId -and $themeIds.Count -eq 0 -and $featureIds.Count -eq 0) {
    Err "未指定任何组件。用法: -Package full | -Style xxx -Themes a,b -Features c,d | -Uninstall"
    exit 1
}

# 摘要
Write-Host ""
Info "即将执行:"
Write-Host "  🎠 轮播: $styleId"
Write-Host "  🎨 主题: $($themeIds -join ', ')"
Write-Host "  ⚡ 功能: $($featureIds -join ', ')"
if (-not $Force) {
    $confirm = Read-Host "确认安装? [y/N]"
    if ($confirm -notmatch "^[yY]") { Err "已取消"; exit 0 }
}

# 执行: 核心库 → 轮播 → 主题 → 功能
Install-Component "feature" "vanvy_core" $webDir
if ($styleId) { Install-Component "style" $styleId $webDir }
foreach ($t in $themeIds) { Install-Component "theme" $t $webDir }
foreach ($f in $featureIds) { Install-Component "feature" $f $webDir }

Write-Host ""
Ok "🎉 全部完成! 浏览器 Ctrl+F5 强制刷新查看效果。"
Warn "提示: 此脚本不包含持久化 (Windows 版), 重装 Emby 后需重新运行。"
