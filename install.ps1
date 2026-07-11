# 美化控制台 一键安装脚本 (Windows)
# 用法: 在仓库目录右键「用 PowerShell 运行」,或: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
Write-Host "== 美化控制台 安装 ==" -ForegroundColor Cyan

# 1. 定位 VS Code 扩展目录
$extRoot = Join-Path $env:USERPROFILE ".vscode\extensions"
if (-not (Test-Path $extRoot)) { throw "找不到 VS Code 扩展目录: $extRoot" }

# 2. 复制本项目到扩展目录
$target = Join-Path $extRoot "dwgx.beautify-console-1.0.0"
$src = $PSScriptRoot
Write-Host "复制到: $target"
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item "$src\extension.js","$src\package.json","$src\README.md","$src\LICENSE" $target -Force

# 3. 检查依赖 Custom UI Style
$hasCUS = Get-ChildItem $extRoot -Directory | Where-Object { $_.Name -like "subframe7536.custom-ui-style*" }
if (-not $hasCUS) {
    Write-Host "提示: 未检测到依赖 Custom UI Style,正在安装..." -ForegroundColor Yellow
    & code --install-extension subframe7536.custom-ui-style
}

Write-Host ""
Write-Host "✓ 安装完成!" -ForegroundColor Green
Write-Host "请【完全退出并重启】VS Code (任务管理器结束所有 Code.exe),然后:" -ForegroundColor Cyan
Write-Host "  Ctrl+Shift+P -> 美化: 打开控制台" -ForegroundColor White
Write-Host ""
Write-Host "注意: 本扩展改动生效需【彻底重启】VS Code, Reload Window 不刷新缓存。" -ForegroundColor Yellow
