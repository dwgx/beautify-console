# 安全说明 Security

## 报告漏洞

发现安全问题请通过 [GitHub Security Advisory](https://github.com/dwgx/beautify-console/security/advisories/new) 私下报告，不要开公开 issue。

请附上复现步骤和影响范围。我会尽快确认并修复，修复发布后会在 CHANGELOG 里说明。

## 支持的版本

只有最新版本接收安全修复。请从 [Releases](https://github.com/dwgx/beautify-console/releases/latest) 更新。

## 这个扩展做了什么值得你知道的事

美化扩展本质上要改 VS Code 的界面，手段不完全「干净」。这里如实说明，你可以据此判断是否接受。

### 修改 VS Code 核心文件

样式注入由依赖的 [Custom UI Style](https://github.com/subframe7536/vscode-custom-ui-style) 完成，它会改写 VS Code 安装目录里的 `workbench.html`，插入指向 CSS 文件的引用。后果：

- VS Code 启动时可能弹「安装似乎已损坏」黄条（因为核心文件校验不过）
- VS Code 升级会覆盖这些改动，需要重新应用
- 还原用命令面板的 `Custom UI Style: Rollback`，卸载本扩展并不会自动还原

这是这类扩展的固有代价，不是本扩展独有。

### 写入 VS Code 全局设置

面板改的参数写进你的 user `settings.json`（`ConfigurationTarget.Global`）。若开了 Settings Sync，这些设置会同步到其他机器，其中 `custom-ui-style.external.imports` 含绝对路径，在别的平台上无效——扩展激活时会自动清理这类跨平台残留条目，你自己手加的 import 不会被动。

### 生成的文件

都在 VS Code 的 User 目录下：`cus-base.css`、`cus-dynamic.css`、`cus-custom.css`、`beautify-state.json`、`backgrounds/`（你选的背景图副本）。这些文件会被注入界面，其中 `cus-custom.css` 是你自己写的，扩展永不覆盖。

## 导入他人配置文件的风险

配置导入导出很方便，但**导入来源不明的配置文件等于让对方影响你的界面**。扩展做了以下校验，但你仍应只导入信得过的配置：

**已有的防护**

- 设置键走白名单，值类型必须匹配，不认识的键被拒绝并列出
- 数值参数逐项校验范围（圆角、不透明度、轮播间隔等）
- 区域名走白名单，防止 `__proto__` 之类污染原型
- 图片路径必须是普通文件：设备节点（如 `/dev/zero`）、FIFO、目录一律拒绝——否则读取时会拖垮扩展宿主
- 图片内容必须通过魔数嗅探（PNG/JPEG/GIF/WebP/BMP 的二进制特征，SVG 要求以 `<svg` 开头）——否则任意可读文件（如私钥、hosts）会被 base64 内嵌进 CSS 并送进渲染 DOM
- 图片文件名清洗掉能闭合 CSS 字符串的字符，扩展名只认白名单
- `customCss` 字段有 1MB 上限，且导入前会把你原有的文件带时间戳备份

**仍需你自己判断的**

- 配置文件里的 `customCss` 字段会原样写入并注入界面。它是 CSS，能做的事包括把界面元素隐藏（`display: none`）、通过 `@import` 或 `content: url()` 向外部发起请求。1MB 以内的任意 CSS 都会被接受——这是设计取舍，因为这个字段的用途就是让你写任意样式。**导入陌生配置前，建议先用文本编辑器看一眼里面的 `customCss` 内容。**
- 魔数校验挡的是「整类文件」，不是文件里的每个字节。合法 PNG 魔数之后附加的任意数据仍会随图片一起进入 CSS（真实图片本就允许元数据尾块，无法靠魔数区分）。利用它需要攻击者先能在你机器上放文件，再诱导你导入指向该文件的配置。

## 界面被改坏了怎么办

按代价从低到高：

1. `Cmd/Ctrl + Alt + Shift + F12` — 一键关闭自定义 CSS，界面全黑时也有效
2. 命令面板 → `Custom UI Style: Rollback` — 还原 VS Code 文件
3. 终端直接清文件 — 见 [README 的恢复手段](README.md#-恢复手段-recovery)
