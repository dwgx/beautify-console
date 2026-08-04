#!/usr/bin/env bash
# 美化控制台 一键安装脚本 (macOS / Linux)
# 用法: bash install.sh
set -euo pipefail

echo "== 美化控制台 安装 =="

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. 定位 VS Code 扩展目录
EXT_ROOT="$HOME/.vscode/extensions"
if [ ! -d "$EXT_ROOT" ]; then
    echo "找不到 VS Code 扩展目录: $EXT_ROOT" >&2
    exit 1
fi

# 2. 定位 code CLI —— macOS 装 VS Code 时默认不会把 code 加进 PATH,
#    所以要回退到 app bundle 里自带的那个二进制。
find_code_cli() {
    if command -v code >/dev/null 2>&1; then command -v code; return; fi
    local candidates=(
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
        "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
        "/usr/share/code/bin/code"
        "/opt/visual-studio-code/bin/code"
    )
    local c
    for c in "${candidates[@]}"; do
        if [ -x "$c" ]; then printf '%s\n' "$c"; return; fi
    done
    return 1
}

CODE_CLI="$(find_code_cli || true)"

# 3. 复制本项目到扩展目录(版本号取自 package.json,与 vsix 安装保持一致)
VERSION="$(node -p "require('$SRC/package.json').version" 2>/dev/null || echo "1.0.4")"
TARGET="$EXT_ROOT/dwgx.beautify-console-$VERSION"
echo "复制到: $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp "$SRC/extension.js" "$SRC/package.json" "$SRC/README.md" "$SRC/LICENSE" "$TARGET/"

# 4. 安装依赖扩展(手动复制不会触发 extensionDependencies / extensionPack)
DEPS=(
    subframe7536.custom-ui-style
    baran-wang.vscode-theme-jetbrains-new-ui
    fogio.jetbrains-product-icon-theme
)
if [ -n "$CODE_CLI" ]; then
    for dep in "${DEPS[@]}"; do
        if ! find "$EXT_ROOT" -maxdepth 1 -type d -iname "${dep}-*" | grep -q .; then
            echo "安装依赖: $dep"
            "$CODE_CLI" --install-extension "$dep" --force
        fi
    done
else
    echo "警告: 找不到 code 命令,请手动安装以下扩展:" >&2
    printf '  - %s\n' "${DEPS[@]}" >&2
fi

echo ""
echo "✓ 安装完成!"
if [ "$(uname -s)" = "Darwin" ]; then
    echo "macOS 请【完全退出】VS Code (Command + Q,不是关窗口),然后重新打开:"
    echo "  Command+Shift+P -> 美化: 打开控制台"
    echo ""
    echo "若样式注入报 'Maximum call stack size exceeded',先完全退出 VS Code 再执行:"
    echo "  sudo chown -R \$(whoami) \"/Applications/Visual Studio Code.app\""
else
    echo "请【完全退出】并重启 VS Code,然后:"
    echo "  Ctrl+Shift+P -> 美化: 打开控制台"
fi
echo ""
echo "注意: 样式改动生效需彻底重启,Reload Window 不刷新 external.css 缓存。"
