# 🚧 Vanvy Vision 自研轮播 · 开发进度与续作清单

> 最后更新: 2026-08-13 21:30 · 供新会话无缝接手
> 背景: 原会话超长导致网关超时, 主人同意 /new 换会话, 进度全部落盘

---

## ✅ 已完成 (全部落盘, 无丢失)

### 1. 设计稿 (docs/design/)
- `design-full.png` — 全页长图
- `aurora.png` / `split.png` / `cinema.png` — 三款设计各一张高清图 (含桌面/平板/手机三视口)
- `design-source.html` — 设计稿源文件 (可改可重新截图)
- `DESIGN_VANVY_VISION.md` — 可行性报告 (美术总监+前端工程师双视角)

### 2. AURORA 轮播代码 (components/home/banner_aurora/)
- `banner-aurora.js` (14KB) — 已完成, node --check 通过
  - 极光光晕 (conic-gradient + blur + 旋转动画, GPU 友好 transform/opacity)
  - 左侧信息层级 (Logo→评分胶囊→标题→简介→播放/详情按钮)
  - 右侧封面流缩略图联动 (最多 6 个, 点击切换, active 高亮)
  - 自动播放 8s + 进度条 + hover 暂停 + 左右箭头
  - 策展规则支持 (VanvyCarouselRules.buildQuery + applyPin)
  - 主题读取: body/html class `vanvy-aurora-theme-<name>` (默认 aurora)
  - 数据层: 复用 VanvyKit.injectCall, 否则自包含 BroadcastChannel 桥
- `style.css` (11KB) — 已完成
  - 6 套色卡 CSS 变量: aurora(蓝紫) / emerald(青绿) / sakura(粉紫) / gold(暖金) / ocean(深海) / midnight(黑金)
  - 毛玻璃强化: backdrop-filter blur+saturate (评分胶囊/标签/信息按钮/缩略图卡/导航按钮)
  - 响应式: 默认桌面全功能 / ≤1024 平板(缩略图≤3,简介2行) / ≤640 手机(隐藏侧栏,信息底部) / ≤360 超小(隐藏简介)
  - color-mix 用于边框/悬停色 (现代浏览器 OK, 老浏览器降级为原色)

### 3. manifest.sh 注册
- 已加: `banner_aurora|style|🌌 AURORA 极光轮播|4.8,4.9|...` (style 互斥, 与 4 款现轮播并列)

---

## 🚧 剩余工作 (按顺序)

### [x] 1. install.sh 颜色主题询问 ✅ 2026-08-13
位置: 交互模式 `pick_style` 之后 (约 563 行), 加:
```bash
# 选中的轮播是 vanvy 自研款 (aurora/split/cinema) 时询问主题色
case "$STYLE" in
  banner_aurora|banner_split|banner_cinema)
    c_info "🎨 请选择主题色:"
    echo "  1) 蓝紫极光(默认)  2) 青绿  3) 粉紫  4) 暖金  5) 深海  6) 黑金"
    ... safe_read ...
    # 注入 body class: vanvy-aurora-theme-<name>
    # 需要把 class 写到 index.html 的 <body> 或注入一个小 script
    ;;
esac
```
实现要点:
- 用 `safe_read` 读数字 (1-6), 映射主题名
- 通过 docker exec 修改 index.html: 在 `<body` 标签加 class, 或注入 `<script>document.body.classList.add('vanvy-aurora-theme-xxx')</script>`
- 非交互模式 (--yes) 跳过, 用默认 aurora
- CLI 模式可加参数 `--aurora-theme <name>`

### [x] 2. banner_split 分屏新视界 ✅ 2026-08-13 (JS+CSS+manifest+渲染验证过, 含 getImageUrl 双bug修复)
设计: 左 58% 竖版海报 + 右 42% 毛玻璃信息面板 + 网格光效
- 组件目录: components/home/banner_split/
- 复用 banner-aurora.js 的数据层 (injectCall/getItems/getImageUrl) — 建议抽公共
- 布局: 海报用 Primary 图 (竖版), 信息面板用 Backdrop 模糊作背景
- 响应式: 桌面左右分屏 / 平板上下 58%+42% / 手机海报上+信息底部抽屉
- 6 色主题变量复用 (同一套 --vanvy-accent-*)

### [x] 3. banner_cinema 影院黑金 ✅ 2026-08-13 (JS+CSS+manifest+渲染验证过, 21:9画幅+胶片帧条+放映按钮)
设计: 21:9 超宽画幅 + 上下黑边 + 黑金 + 胶片帧条
- 组件目录: components/home/banner_cinema/
- 布局: 上下 9% 黑边 (c-bars), 中间画幅, 底部胶片帧条 (缩略图横排)
- 按钮「放映」, 金色主题为主 (midnight 色卡)
- 响应式: 手机黑边减小, 帧条 3 个

### [x] 4. manifest 注册 split/cinema ✅ 2026-08-13 (已注册, 共7款轮播)
同 banner_aurora 格式, style 互斥

### [x] 5. 测试验证(部分) ✅ 挂载逻辑修复: 移植 classic 的 view:not(.hide)+!/home+内容就绪三机制; 真实DOM模拟3款全过
- node --check 全部 JS
- bash -n install.sh/manifest
- 测试容器 (emby-beautify-web) 安装 banner_aurora 验证注入
- 截图验证实际渲染 (playwright + 模拟 Emby 页面)

### [ ] 6. 打包发布
- tar czf emby-kit.tar.gz
- 发布到 /vol1/1001/web/ (docker alpine cp)
- 公网验证 https://emby-beautify.vanvy.top/emby-kit.tar.gz

---

## 🎨 设计决策备忘 (避免新会话走偏)

1. **命名空间**: 全部 `vanvy-aurora-*` / `vanvy-split-*` / `vanvy-cinema-*` 前缀, 与现有零冲突
2. **主题系统**: 统一 CSS 变量 `--vanvy-accent-1/2/3/glow/bg-1/2/3`, 6 套色卡, body class 切换
3. **毛玻璃**: backdrop-filter: blur(10-12px) saturate(1.3-1.4), 信息面板/胶囊/卡片全玻璃化
4. **性能铁律**: 光晕动画只动 transform/opacity; 背景图 maxWidth 1920; 缩略图 640; 懒加载
5. **降级**: backdrop-filter 不支持时 (老浏览器) 自动回退半透明色 (backdrop-filter 声明后加 background 兜底)
6. **兼容**: 挂载 .homeSectionsContainer 首位 insertBefore; 4.8/4.9; manifest 互斥
7. **响应式断点**: 默认(桌面) / 1024(平板) / 640(手机) / 360(超小)
8. **颜色询问**: 安装器选自研轮播后问 6 色; 非交互跳过用默认; 可 --aurora-theme 指定

## 📌 新会话开工指令
```
继续 Vanvy Vision 自研轮播开发, 进度在 emby-kit/docs/DEV_PROGRESS.md,
先完成 install.sh 颜色询问, 再开发 banner_split 和 banner_cinema, 最后测试发布
```
