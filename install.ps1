# 美化控制台 一键安装脚本 (Windows)
# 用法: 在仓库目录右键「用 PowerShell 运行」,或: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
Write-Host "== 美化控制台 安装 ==" -ForegroundColor Cyan

$src = $PSScriptRoot

# 1. 定位 VS Code 扩展目录
$extRoot = Join-Path $env:USERPROFILE ".vscode\extensions"
if (-not (Test-Path $extRoot)) { throw "找不到 VS Code 扩展目录: $extRoot" }

# 2. 定位 code CLI。PATH 里没有时回退到常见安装位置
function Find-CodeCli {
    $cmd = Get-Command code -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\bin\code.cmd"),
        "$env:ProgramFiles\Microsoft VS Code\bin\code.cmd",
        "${env:ProgramFiles(x86)}\Microsoft VS Code\bin\code.cmd"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    return $null
}
$codeCli = Find-CodeCli

# 3. 复制本项目到扩展目录。版本号取自 package.json,与 install.sh 保持一致 ——
#    写死版本号会让目录名与 package.json 不符,同 ID 多份还会被 VS Code 视为冲突
$version = (Get-Content (Join-Path $src "package.json") -Raw | ConvertFrom-Json).version
$target = Join-Path $extRoot "dwgx.beautify-console-$version"
Write-Host "复制到: $target"
Get-ChildItem $extRoot -Directory -Filter "dwgx.beautify-console-*" |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item "$src\extension.js","$src\package.json","$src\README.md","$src\LICENSE" $target -Force

# 4. 安装依赖扩展。手动复制不会触发 extensionDependencies / extensionPack,
#    少装主题会让 workbench.colorTheme 指向不存在的主题
$deps = @(
    "subframe7536.custom-ui-style",
    "baran-wang.vscode-theme-jetbrains-new-ui",
    "fogio.jetbrains-product-icon-theme"
)
if ($codeCli) {
    foreach ($dep in $deps) {
        $installed = Get-ChildItem $extRoot -Directory | Where-Object { $_.Name -like "$dep*" }
        if (-not $installed) {
            Write-Host "安装依赖: $dep" -ForegroundColor Yellow
            & $codeCli --install-extension $dep --force
        }
    }
} else {
    Write-Host "警告: 找不到 code 命令,请手动安装以下扩展:" -ForegroundColor Red
    $deps | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

Write-Host ""
Write-Host "✓ 安装完成!" -ForegroundColor Green
Write-Host "请【完全退出并重启】VS Code (任务管理器结束所有 Code.exe),然后:" -ForegroundColor Cyan
Write-Host "  Ctrl+Shift+P -> 美化: 打开控制台" -ForegroundColor White
Write-Host ""
Write-Host "注意: 样式改动生效需彻底重启, Reload Window 不刷新 external.css 缓存。" -ForegroundColor Yellow
