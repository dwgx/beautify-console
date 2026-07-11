# 🎨 美化控制台 Beautify Console

一个 VS Code 一站式可视化美化面板。字体、布局、编辑器、动画、多区域背景图、圆角、主题——全部在一个图形面板里点选调节，无需手写 JSON。

> A visual, one-stop beautify panel for VS Code. Tune fonts, layout, editor, animations, multi-region background images, corner radius and themes — all from one GUI, no JSON editing.

![screenshot](media/screenshot.png)

## ✨ 功能 Features

- **字体**：可视化选择已安装的编程字体（自动检测 ✓）、字号、行高、字重、连字
- **布局**：状态栏、面包屑、活动栏位置、菜单栏、标签页缩放
- **编辑器**：光标平滑、平滑滚动、括号染色、缩进线、粘性滚动、缩略图、内边距
- **动画**：5 档（默认/平滑/弹跳/华丽/关闭），基于经过验证的 spring 缓动曲线
- **多区域背景图**：编辑器 / 侧栏 / 面板 / 全屏 可分别设图，深色主题下用 `mix-blend-mode: screen` 自然融合
- **多图轮播**：多张图定时切换，带淡入过渡
- **自定义 CSS**：面板内直接写任意 CSS 注入
- **圆角**：一个滑块统一控制所有 UI 圆角
- **配置导入导出**：整套美化配置一键导出/分享/导入
- **每个参数带问号**：悬停显示白话解释，专业术语讲人话

## 📦 依赖 Dependency

本扩展通过 [Custom UI Style](https://marketplace.visualstudio.com/items?itemName=subframe7536.custom-ui-style) 注入样式，安装时会自动提示安装它。

## 🚀 安装 Install

### 方式一：安装 .vsix（推荐）
1. 从 [Releases](https://github.com/dwgx/beautify-console/releases) 下载最新 `.vsix`
2. VS Code 里 `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → 选中该文件
3. 首次会提示安装依赖 Custom UI Style，同意即可
4. `Ctrl+Shift+P` → `美化: 打开控制台`

### 方式二：源码安装
```bash
git clone https://github.com/dwgx/beautify-console
cd beautify-console
# Windows 一键注册脚本
powershell -ExecutionPolicy Bypass -File install.ps1
```

## 🖱 使用 Usage

- `Ctrl+Shift+P` → **美化: 打开控制台** 打开图形面板
- 原生参数（字体/布局/编辑器/主题）**改完即时生效**
- 背景/动画/圆角类改动会累积一个 **⚡ 待重启** 提示，点「立即重启」统一生效
- 每个参数右侧的 **?** 悬停查看白话解释

## ⚠️ 说明 Notes

- 本扩展通过修改 VS Code 核心文件注入样式（经由 Custom UI Style），这是非官方手段：
  - 启动时可能出现「安装似乎已损坏」黄条，点齿轮「不再显示」即可
  - **VS Code 更新后**样式可能失效 → 重新运行 `Custom UI Style: Reload`
- 背景图会自动复制到用户目录，不怕原图移动丢失

## 🙏 致谢 Credits

- 背景注入选择器方案参考 [shalldie/vscode-background](https://github.com/shalldie/vscode-background)（MIT）
- 样式注入依赖 [subframe7536/vscode-custom-ui-style](https://github.com/subframe7536/vscode-custom-ui-style)（MIT）

## 📄 License

MIT

