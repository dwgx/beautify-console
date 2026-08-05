# Changelog

## [1.1.0] - 2026-08-05

### 安全
- **图片扩展名可注入 CSS**：扩展名被拼进 `data:image/<ext>`，而清洗只处理了文件名主干。名为 `a.x");}body{display:none}` 的图片会闭合 CSS 字符串并注入新规则，整个界面消失。现在扩展名只认白名单，`imageToDataUri` 也改为查表而非拼接（导入的配置可指向从未经过清洗的既有文件）
- 区域名改走白名单：`region: '__proto__'` 此前能污染 `Object.prototype`

### 修复（review 发现）
- **编辑器区的透明化规则波及整个界面**：`.monaco-editor` 系列选择器没有作用域限定，而出货样式表有 160 条规则给它的后代设背景且都不带 `!important` —— 只开编辑器背景就会抹平 peek view、notebook 单元格、输出面板、源代码管理提交框。这些规则本就不必要（覆盖层在文字之上），已整个删除
- **改动画档位会抹掉多区域背景**：`setAnim` 把「非 codeOnly」一律折成 `off`，CSS 从 3347 字节掉到 1461，状态文件却仍记着 `regions`
- **多区域下不透明度滑块空转**：写的是全窗口的 `background.opacity`，该键在此模式无效；滑块量程也仍是 0.7–1.0，一拖就把区域推到 0.7 以上糊住代码
- **恢复默认没清状态文件**：提示「已移除背景图」，但各区域图片列表原样留着
- **连续导入毁掉用户手写的 CSS**：固定的 `.bak` 被第二次导入覆盖，原文彻底消失。备份改为带时间戳（同毫秒补序号）
- **状态文件损坏则静默清空**：解析失败与文件不存在被同等对待，下一次面板操作把空状态写回磁盘，区域配置永久丢失。现在保留原文件为 `.corrupt` 并告知
- **样式文件写入失败被静默丢弃**：11 个调用点都不看返回值，只读时状态写成了、CSS 没写成，面板照常报成功
- **首次安装标记写在 reload 之后**：而 reload 在三个平台上都是退出重开，标记可能永远写不成，于是每次启动重跑默认值、持续覆盖用户改动
- **同名不同图互相覆盖**：`nature/bg.png` 与 `city/bg.png` 都写到 `bg.png`，后者覆盖前者且列表只留一条
- **Windows 导出的配置在 POSIX 上被判「不合法」**：`path.isAbsolute` 绑在宿主平台，措辞与事实不符，应归入「本机不存在」
- **内嵌模式无体积上限**：4 张 2MB 图产出 37MB CSS，三区域各 4 张达 112MB，而该文件每次开窗都被读取拼接。超 2MB 改为直接引用并告知
- `applyBg` 跨 `await` 持有过期的动画档位；`activate` 不等 `bootstrap` 导致首次安装时用户改动被默认值覆盖
- 混合模式此前只能手改 JSON 才能关，而 README 写着「可关」——补上面板开关
- `install.ps1` 写死 1.0.0、三个依赖只装一个、不清旧版本目录
- 重启提示此前只警告 macOS，实际 Windows / Linux 也是退出重开

### 新增
- **多区域背景**：编辑器 / 侧栏 / 面板各自独立的图片、不透明度、混合模式。选择器逐条对照 VS Code 1.131 的 workbench CSS 核对
- **多图轮播**：某区域放 2 张以上图片即自动轮播，淡入淡出、每张停留时长可调，遵循系统「减少动效」设置。纯 CSS 实现，无后台定时器
- **自定义 CSS**：独立的 `cus-custom.css`，本插件只创建不覆盖，注入顺序排最后使用户规则优先。配套「美化: 紧急关闭自定义 CSS」命令与快捷键 `Cmd/Ctrl+Alt+Shift+F12`
- **配置导入导出**：整套配置存为单个 JSON，图片按路径引用。导入逐项校验，非法值、未知键、缺失图片全部报出

### 变更
- **图片改用 `vscode-file://vscode-app` 引用，不再内嵌 base64**。workbench 自身就从该 origin 加载，故 CSP 的 `img-src 'self'` 覆盖它；Electron 的协议校验是「路径在白名单目录下**或**扩展名在白名单内」，后者让任意位置的图片可直接引用。12 张 2MB 图从 33MB CSS 降到约 1KB。白名单外的格式仍走 base64，面板也留了强制内嵌开关

### 修复
- 复制进 `backgrounds/` 的文件名会被清洗：全窗口模式把路径交给 Custom UI Style，它按 `url('...')` 单引号拼接且不转义，而 `pathToFileURL` 不转义单引号，名字带 `')` 的图片会提前闭合该 CSS 规则
- 区域图层的每条声明都带 `!important`：Custom UI Style 把 `external.css` 注入在 `workbench.desktop.main.css` **之前**（本机 `workbench.html` 核对为 1313 vs 1415），同优先级下 VS Code 一律胜出
- `applyBg` 补上 `regions` 分支 —— 此前选「多区域」会落进 `else` 写成 `off`，静默丢弃选择

## [1.0.5] - 2026-08-05

### 修复
- **macOS / Linux 完全不生效**：用户数据目录写死了 Windows 的 `AppData/Roaming/Code/User`，非 Windows 平台上 CSS、背景图、标记文件全部读写到不存在的目录，插件静默失效。现改为从 `context.globalStorageUri` 反推 User 目录，并按平台兜底（Insiders / 便携版 / 自定义 `--user-data-dir` 一并支持）
- **背景图在 macOS 不显示**：`imageToDataUri` 把路径里的 `/` 全替换成 `\`，POSIX 路径直接损坏，base64 转换失败后退回被 CSP 拦截的 `file://`
- **选图生成的 URL 非法**：`'file:///' + 路径` 在 POSIX 下得到四斜杠 `file:////Users/...` 且空格未转义。改用 `pathToFileURL`，旧格式仍可读（不丢已选背景图）
- **字体检测在 macOS / Linux 全为空**：只扫 `C:/Windows/Fonts` 和 `%LOCALAPPDATA%`。现按平台扫描（macOS 的 `~/Library/Fonts`、`/System/Library/Fonts` 等；Linux 的 `/usr/share/fonts` 等，支持子目录下钻）
- **字体兜底链落到衬线字体**：`Consolas` 只有 Windows 有。macOS 改用 `Menlo, Monaco`，Linux 用 `DejaVu Sans Mono, Liberation Mono`
- **Settings Sync 残留跨平台路径**：Windows 上写入的 `file://C:/...` 会同步到 macOS，Custom UI Style 逐条 try/catch 后静默产出空 CSS。现激活时自动剔除本插件管理的失效条目，用户自加的 import 保留
- **一个未注册的设置键中断整批写入**：`setConfig` 是连续 `await` 的循环，`window.menuBarVisibility` 在 macOS 未注册（菜单栏由系统顶栏接管），写入抛错后它之后的设置（终端字体、主题、圆角、不透明度）全部漏写，且初始化标记写不成，导致每次启动重复报错。现逐键 `try/catch`，并在 macOS 上直接跳过该键
- 面板里主动改的设置若写入失败，现在会明确提示；此前仍弹「已实时应用」/「已恢复默认」，与实际不符
- 清理残留 import 时要求条目位于 `User` 目录下，避免误删用户放在别处的同名 `cus-base.css`
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
