# 贡献指南 Contributing

欢迎 issue 和 PR。这份文档说明这个项目的结构、怎么跑测试、以及提交前需要注意什么。

## 项目结构

```
extension.js              全部运行时逻辑（单文件，约 3000 行）
package.json              扩展清单：命令、配置项、依赖声明
test/
  cross-platform.test.js  测试用例（node:test）
  vscode-stub.js          vscode API 的测试桩
install.sh / install.ps1  源码安装脚本（macOS/Linux 与 Windows）
.github/workflows/ci.yml  CI：push/PR 跑测试，v* tag 打包发布
```

单文件是刻意的：这个扩展没有构建步骤，`extension.js` 就是发布产物，改完存盘即可用 F5 调试。代价是文件较长，所以内部按注释分节组织。

## 开发环境

只需要 Node（用于跑测试）和 VS Code。没有编译步骤。

```bash
npm install    # 只装 @vscode/vsce（打包用），运行时零依赖
npm test       # 跑全部测试
```

调试扩展：在 VS Code 里打开本仓库，按 `F5` 启动扩展开发宿主，在新窗口里用 `美化: 打开控制台`。

## 这个扩展怎么工作

样式分两条通道生效，改代码前需要理解这个区别：

**原生通道** — 字体、布局、编辑器类参数直接写 VS Code 设置（`editor.fontSize` 等），改完即时生效。

**注入通道** — 动画、背景、圆角写成 CSS 文件，经 [Custom UI Style](https://github.com/subframe7536/vscode-custom-ui-style) 注入 workbench，需要完全重启 VS Code 才生效。生成三个文件到 User 目录：

| 文件 | 内容 | 谁维护 |
|---|---|---|
| `cus-base.css` | 圆角变量 `--r` 与引用它的规则、keyframes | 扩展生成，用户改 `--r` 会保留 |
| `cus-dynamic.css` | 动画档位、背景图规则、轮播 | 扩展每次重写 |
| `cus-custom.css` | 用户手写样式 | 扩展永不覆盖 |

`external.imports` 的顺序决定优先级，`cus-custom.css` 必须排最后，用户规则才压得过生成的规则。

状态存三处：VS Code 设置、`cus-dynamic.css` 里的注释标记（`ANIM:` / `BG:`）、`beautify-state.json`。改动状态时三处都要同步，否则面板显示和实际效果会分叉——历史上这类 bug 出过几次。

## 测试

用 Node 内置的 `node:test`，通过 `test/vscode-stub.js` 桩掉 vscode API，所以不需要真实 VS Code 就能跑。

```bash
npm test                                              # 全部
node --test --test-name-pattern="圆角" test/*.test.js  # 按名字筛
```

改动请带测试。判断标准是「这个 bug 如果重新出现，测试会不会红」：

- 改了 CSS 生成逻辑 → 断言生成内容里该有/不该有什么
- 改了导入导出 → 断言往返无损，以及非法输入被拒绝并记入 `rejected`
- 修了安全问题 → 构造攻击载荷，断言它被挡住
- 改了跨平台路径 → 三个平台的路径分支都要覆盖

测试里不要依赖真实 User 目录，用 `fs.mkdtempSync` 建临时目录并在 `finally` 里清理（现有用例都是这个模式）。

## 提交前检查

```bash
npm test              # 必须全绿
node --check extension.js
shellcheck install.sh # 如果改了 shell 脚本
actionlint .github/workflows/ci.yml  # 如果改了 workflow
```

代码风格跟随现有代码：4 空格缩进、中文注释、注释解释「为什么」而不是「做了什么」。注释里如果记录了某个坑，请保留原因说明——那些是踩过的雷。

## 提交信息

用 `类型: 简述` 的形式，中文正文：

```
fix: 圆角滑块拖动无效

--r 变量定义了但没有任何规则引用它，滑块改了值看不到变化。
根因是 9b580ed 把模板改成内联字符串时漏掉了圆角规则段。
```

类型用 `feat` / `fix` / `docs` / `ci` / `chore` / `refactor` / `test`。

## 发布流程

版本号改三处并保持一致（CI 会校验，不一致直接拒绝发布）：

1. `package.json` 的 `version`
2. `package-lock.json`（跑 `npm install --package-lock-only` 同步）
3. `CHANGELOG.md` 加一段，`RELEASE.md` 更新版本号与本版重点

然后打 tag 推上去，CI 自动打包 `.vsix` 并创建 GitHub Release：

```bash
git tag v1.3.0
git push origin v1.3.0
```

## 报 Bug

请附上：VS Code 版本（`code --version`）、操作系统、扩展版本、复现步骤。如果是样式没生效，说明你是否做了**完全重启**（macOS 是 `Command + Q`，不是关窗口）——这个原因占了相当一部分问题。

界面被改坏进不去了，README 的「恢复手段」一节有三种逃生方式，最快的是 `Cmd/Ctrl + Alt + Shift + F12` 一键关闭自定义 CSS。
