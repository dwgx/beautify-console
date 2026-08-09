# Release v1.2.0

美化控制台 —— VS Code 一站式可视化美化面板。

## 亮点

- 🎨 图形面板一站式调节：字体 / 布局 / 编辑器 / 动画 / 背景 / 圆角 / 主题
- 🖼 多区域背景图，支持「全窗口」「仅代码区」「多区域」「关闭」四种模式；多图自动轮播，淡入淡出，每张停留时长可调
- 🔗 图片改用 `vscode-file://vscode-app` 引用，仅白名单外格式内嵌 base64
- 🎨 依赖 JetBrains 主题扩展（自动安装），首次安装自动应用 JetBrains 默认参数
- ✨ 5 档动画预设（默认 / 平滑 / 弹跳 / 华丽 / 关闭）
- 🔤 自动检测已安装的编程字体
- ✏️ 自定义 CSS（独立 `cus-custom.css`，永不覆盖）、配置导入导出
- ❓ 每个参数带白话解释问号

## 本版重点（v1.2.0）

- **修复圆角滑块失效**：`--r` 变量此前没有任何消费规则，拖滑块看不到变化。已安装的用户升级后会自动补齐，你调过的圆角值不会被重置
- **导入配置的安全加固**：别人给的配置文件里，图片路径可能指向设备节点（拖垮扩展宿主）或任意可读文件（内容被 base64 塞进界面样式）。现在所有读文件路径都校验类型、大小与图片魔数
- **背景图状态不再分叉**：全窗口 / 仅代码区模式切换后，导出的配置会记录正确的模式；这两种模式的背景图也终于会被导出与恢复
- **选图不再覆盖同名图**：面板选图走与多区域一致的复用逻辑（同图复用、同名不同图自动补序号）
- 面板标题显示真实版本号；若干数值边界（圆角上限、轮播间隔下限）与滑块量程对齐，导入不再被静默钳值

完整清单见 [CHANGELOG.md](CHANGELOG.md)。

## 安装

### 方式一：.vsix（推荐）
1. 下载 `beautify-console-1.2.0.vsix`
2. VS Code `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
3. 同意安装依赖 Custom UI Style 与两个 JetBrains 主题扩展
4. **彻底重启 VS Code**（结束所有 Code.exe 进程）
5. `Ctrl+Shift+P` → `美化: 打开控制台`

### 方式二：源码
```bash
git clone https://github.com/dwgx/beautify-console
cd beautify-console

# macOS / Linux
bash install.sh

# Windows
powershell -ExecutionPolicy Bypass -File install.ps1
```

## ⚠️ 重要说明

- 依赖 [Custom UI Style](https://marketplace.visualstudio.com/items?itemName=subframe7536.custom-ui-style)（会自动安装），以及 JetBrains 主题扩展
  `baran-wang.vscode-theme-jetbrains-new-ui`（Int UI Dark 深色主题）与 `fogio.jetbrains-product-icon-theme`（图标主题）
- **样式改动生效必须【彻底重启】VS Code**（macOS 是 `Command + Q`，不是关窗口；Windows 结束所有 `Code.exe`），`Reload Window` 不刷新 external.css 缓存
- 通过修改 VS Code 核心文件注入样式（非官方手段）：
  - 启动时可能出现「安装似乎已损坏」黄条，点齿轮「不再显示」即可
  - VS Code 更新后样式可能失效，重新运行 `Custom UI Style: Reload` 即可恢复
- 图片默认按 `vscode-file://vscode-app` 引用，仅白名单外格式（非 `.png/.jpg/.jpeg/.webp/.gif/.bmp/.svg`）内嵌 base64

## 致谢

- 编辑器背景选择器方案参考 [shalldie/vscode-background](https://github.com/shalldie/vscode-background)
- 样式注入依赖 [subframe7536/vscode-custom-ui-style](https://github.com/subframe7536/vscode-custom-ui-style)
