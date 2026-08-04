# Changelog

## [1.0.4] - 2026-08-05

### 修复
- **macOS / Linux 完全不生效**：用户数据目录写死了 Windows 的 `AppData/Roaming/Code/User`，非 Windows 平台上 CSS、背景图、标记文件全部读写到不存在的目录，插件静默失效。现改为从 `context.globalStorageUri` 反推 User 目录，并按平台兜底（Insiders / 便携版 / 自定义 `--user-data-dir` 一并支持）
- **背景图在 macOS 不显示**：`imageToDataUri` 把路径里的 `/` 全替换成 `\`，POSIX 路径直接损坏，base64 转换失败后退回被 CSP 拦截的 `file://`
- **选图生成的 URL 非法**：`'file:///' + 路径` 在 POSIX 下得到四斜杠 `file:////Users/...` 且空格未转义。改用 `pathToFileURL`，旧格式仍可读（不丢已选背景图）
- **字体检测在 macOS / Linux 全为空**：只扫 `C:/Windows/Fonts` 和 `%LOCALAPPDATA%`。现按平台扫描（macOS 的 `~/Library/Fonts`、`/System/Library/Fonts` 等；Linux 的 `/usr/share/fonts` 等，支持子目录下钻）
- **字体兜底链落到衬线字体**：`Consolas` 只有 Windows 有。macOS 改用 `Menlo, Monaco`，Linux 用 `DejaVu Sans Mono, Liberation Mono`
- **Settings Sync 残留跨平台路径**：Windows 上写入的 `file://C:/...` 会同步到 macOS，Custom UI Style 逐条 try/catch 后静默产出空 CSS。现激活时自动剔除本插件管理的失效条目，用户自加的 import 保留
- 自举失败不再全部静默吞掉，改为提示具体目录与原因

### 新增
- `install.sh`：macOS / Linux 一键安装脚本，自动定位 app bundle 内置的 `code` CLI（macOS 默认不入 PATH），并补装 `extensionDependencies` / `extensionPack`（手动复制不会触发）
- `npm test`：跨平台路径 / 字体 / 导入清理用例，基于 `node --test`，无第三方依赖

### 变更
- macOS 上隐藏「菜单栏」一项——菜单由系统顶栏接管，`window.menuBarVisibility` 无效
- 字体候选新增 SF Mono / Menlo / Monaco / Liberation Mono / Noto Sans Mono

## [1.0.2] - 2026-07-12

### 修复
- 注册 beautify.codeOpacity 配置项,修复仅代码区调透明度报错 "not a registered configuration"

## [1.0.1] - 2026-07-12

### 修复
- 仅代码区背景透明度:独立于全窗口,滑块范围按模式切换(仅代码区 0.05~0.6,更淡不糊代码)
- 切换背景模式时面板滑块范围实时更新

## [1.0.0] - 2026-07-12

首个发布版本。

### 新增
- 可视化美化控制台面板（webview）
- 字体：检测已安装编程字体、字号/行高/字重/连字
- 布局：状态栏/面包屑/活动栏位置/菜单栏/标签缩放
- 编辑器：光标平滑/平滑滚动/括号染色/缩进线/粘性滚动/缩略图/内边距
- 动画：5 档预设（默认/平滑/弹跳/华丽/关闭）
- 多区域背景图：编辑器/侧栏/面板/全屏，深色主题 mix-blend-mode 融合
- 多图轮播、自定义 CSS 输入、圆角滑块
- 配置导入导出
- 每个参数带白话解释问号
