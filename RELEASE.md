# Release v1.0.0

美化控制台首个发布版本 —— VS Code 一站式可视化美化面板。

## 亮点

- 🎨 图形面板一站式调节:字体 / 布局 / 编辑器 / 动画 / 背景 / 圆角 / 主题
- 🖼 多区域背景图,支持「全窗口」「仅代码区」两种模式,图片自动转 base64 内嵌(绕过 CSP)
- ✨ 5 档动画预设(默认 / 平滑 / 弹跳 / 华丽 / 关闭)
- 🔤 自动检测已安装的编程字体
- ❓ 每个参数带白话解释问号
- ♻️ 一键恢复默认 / 配置随扩展自举

## 安装

### 方式一:.vsix(推荐)
1. 下载 `beautify-console-1.0.0.vsix`
2. VS Code `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
3. 同意安装依赖 Custom UI Style
4. **彻底重启 VS Code**(结束所有 Code.exe 进程)
5. `Ctrl+Shift+P` → `美化: 打开控制台`

### 方式二:源码
```bash
git clone https://github.com/dwgx/beautify-console
cd beautify-console
powershell -ExecutionPolicy Bypass -File install.ps1
```

## ⚠️ 重要说明

- 依赖 [Custom UI Style](https://marketplace.visualstudio.com/items?itemName=subframe7536.custom-ui-style)(会自动安装)
- **样式改动生效必须【彻底重启】VS Code**(任务管理器结束 Code.exe),`Reload Window` 不刷新 external.css 缓存
- 通过修改 VS Code 核心文件注入样式(非官方手段):
  - 启动时可能出现「安装似乎已损坏」黄条,点齿轮「不再显示」即可
  - VS Code 更新后样式可能失效,重新打开面板并彻底重启即可恢复

## 致谢

- 编辑器背景选择器方案参考 [shalldie/vscode-background](https://github.com/shalldie/vscode-background)
- 样式注入依赖 [subframe7536/vscode-custom-ui-style](https://github.com/subframe7536/vscode-custom-ui-style)
