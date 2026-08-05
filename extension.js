const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

// ============================================================
// 用户数据目录解析(跨平台)
// 旧版本把 Windows 的 AppData 路径写死,于是 macOS/Linux 上所有读写
// (CSS / 背景图 / 标记文件)都落在不存在的目录里,插件静默失效。
// 现在优先从 context.globalStorageUri 反推:
//   <userDir>/globalStorage/<publisher>.<name> → 上两级就是 User 目录
// 这样 Insiders、便携版、自定义 --user-data-dir 也都能对上。
// ============================================================
let userDir = null;

// 拿不到 context 时按平台兜底
function defaultUserDir() {
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming');
        return path.join(appData, 'Code/User');
    }
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library/Application Support/Code/User');
    }
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(configHome, 'Code/User');
}

function resolveUserDir(context) {
    try {
        const globalStorage = context && context.globalStorageUri && context.globalStorageUri.fsPath;
        if (globalStorage) {
            const dir = path.resolve(globalStorage, '..', '..');
            if (path.basename(dir) === 'User') {
                userDir = dir;
                return userDir;
            }
        }
    } catch (e) { /* 落到兜底 */ }
    userDir = defaultUserDir();
    return userDir;
}

function getUserDir() {
    if (!userDir) userDir = defaultUserDir();
    return userDir;
}

// 本插件管理的两个 CSS 文件(路径随 userDir 动态解析,不能提前算成常量)
const cusBaseCss = () => path.join(getUserDir(), 'cus-base.css');
const cusDynamicCss = () => path.join(getUserDir(), 'cus-dynamic.css');
// 用户手写的 CSS。本插件只创建、绝不覆盖 —— 它必须与生成的文件分开,
// 因为 writeDynamicCss() 是整文件重写,放一起会被清掉。
const cusCustomCss = () => path.join(getUserDir(), 'cus-custom.css');

// 自定义 CSS 是否注入。关掉只是不登记进 imports,文件内容一律保留。
function isCustomCssEnabled() {
    return vscode.workspace.getConfiguration().get('beautify.customCss.enabled') !== false;
}

// 绝对路径 → file:// URL。pathToFileURL 会正确处理盘符与空格转义,
// 且能被 Custom UI Style 内部的 fileURLToPath 原样还原。
function toFileUrl(p) {
    return pathToFileURL(p).toString();
}

// file:// URL → 本地路径。用 vscode.Uri 解析,兼容历史遗留的
// `file:////Users/...`(四斜杠)与 Windows `file:///C:/...` 两种旧格式。
function fromFileUrl(fileUrl) {
    const s = String(fileUrl);
    if (!s.startsWith('file:')) return s;
    try { return vscode.Uri.parse(s).fsPath; }
    catch (e) { return s; }
}

// 把本地图片转成 base64 data URI —— 绕过 workbench CSP 对 file:/// 的拦截(关键修复)
function imageToDataUri(fileUrl) {
    try {
        if (!fileUrl || String(fileUrl).startsWith('data:')) return fileUrl;
        const p = fromFileUrl(fileUrl);
        if (!fs.existsSync(p)) return fileUrl; // 找不到就退回原路径
        const ext = (path.extname(p).slice(1) || 'png').toLowerCase();
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        const b64 = fs.readFileSync(p).toString('base64');
        return `data:image/${mime};base64,${b64}`;
    } catch (e) { return fileUrl; }
}

// 动画三档预设(与之前设计一致)
const ANIM_PRESETS = {
    default: {
        '.monaco-list-row': 'transition: background-color 120ms cubic-bezier(0.25,0.1,0.25,1), border-radius 120ms cubic-bezier(0.25,0.1,0.25,1) !important;',
        '.monaco-workbench .part.editor > .content .editor-group-container > .title div.tabs-container > .tab': 'transition: background-color 180ms ease, border-color 180ms ease, opacity 180ms ease !important;',
        '.monaco-button, .monaco-workbench .activitybar .action-item, .monaco-action-bar .action-item': 'transition: background-color 120ms ease, color 120ms ease, transform 120ms ease !important;',
        '.monaco-workbench .activitybar .action-item:hover .action-label': 'transform: translateY(-1px);',
        '.monaco-inputbox': 'transition: border-color 180ms ease, box-shadow 180ms ease !important;',
        '.quick-input-widget': 'animation: apc-fade-in 260ms cubic-bezier(0.25,0.1,0.25,1);',
        '.suggest-widget': 'animation: apc-fade-scale 180ms ease;',
        '.monaco-hover': 'animation: apc-fade-scale 120ms ease;',
        '.monaco-workbench .notifications-toasts .notification-toast': 'animation: apc-fade-in 260ms ease;',
        '.monaco-menu-container': 'animation: apc-fade-scale 120ms ease;',
        '.monaco-workbench .part.sidebar .composite.viewlet': 'animation: apc-slide-in-left 180ms ease;'
    },
    smooth: {
        '.monaco-list-row': 'transition: background-color 110ms cubic-bezier(0.25,0.1,0.25,1) !important;',
        '.monaco-workbench .part.editor > .content .editor-group-container > .title div.tabs-container > .tab': 'transition: background-color 160ms ease, border-color 160ms ease, opacity 160ms ease !important;',
        '.monaco-button, .monaco-workbench .activitybar .action-item, .monaco-action-bar .action-item': 'transition: background-color 110ms ease, color 110ms ease !important;',
        '.monaco-inputbox': 'transition: border-color 160ms ease, box-shadow 160ms ease !important;'
    },
    // 弹跳:入场带回弹,活泼
    bounce: {
        '.monaco-list-row': 'transition: background-color 120ms ease, border-radius 120ms ease !important;',
        '.monaco-workbench .part.editor > .content .editor-group-container > .title div.tabs-container > .tab': 'transition: background-color 180ms cubic-bezier(0.34,1.56,0.64,1), opacity 180ms ease !important;',
        '.monaco-button, .monaco-workbench .activitybar .action-item, .monaco-action-bar .action-item': 'transition: transform 180ms cubic-bezier(0.34,1.56,0.64,1), background-color 120ms ease !important;',
        '.monaco-workbench .activitybar .action-item:hover .action-label': 'transform: translateY(-2px) scale(1.08);',
        '.quick-input-widget': 'animation: apc-bounce-in 320ms cubic-bezier(0.34,1.56,0.64,1);',
        '.suggest-widget': 'animation: apc-bounce-in 260ms cubic-bezier(0.34,1.56,0.64,1);',
        '.monaco-hover': 'animation: apc-zoom-in 140ms ease;',
        '.monaco-workbench .notifications-toasts .notification-toast': 'animation: apc-bounce-in 340ms cubic-bezier(0.34,1.56,0.64,1);',
        '.monaco-menu-container': 'animation: apc-bounce-in 220ms cubic-bezier(0.34,1.56,0.64,1);'
    },
    // 华丽:翻转/缩放/滑入综合,效果最丰富
    fancy: {
        '.monaco-list-row': 'transition: background-color 140ms ease, border-radius 140ms ease, transform 140ms ease !important;',
        '.monaco-workbench .part.editor > .content .editor-group-container > .title div.tabs-container > .tab': 'transition: background-color 200ms ease, border-color 200ms ease, opacity 200ms ease, transform 200ms cubic-bezier(0.34,1.56,0.64,1) !important;',
        '.monaco-button, .monaco-workbench .activitybar .action-item, .monaco-action-bar .action-item': 'transition: transform 160ms cubic-bezier(0.34,1.56,0.64,1), background-color 140ms ease, box-shadow 140ms ease !important;',
        '.monaco-workbench .activitybar .action-item:hover .action-label': 'transform: translateY(-2px) scale(1.1);',
        '.monaco-inputbox': 'transition: border-color 180ms ease, box-shadow 180ms ease !important;',
        '.quick-input-widget': 'animation: apc-flip-in 300ms cubic-bezier(0.22,0.61,0.36,1);',
        '.suggest-widget': 'animation: apc-zoom-in 200ms cubic-bezier(0.34,1.56,0.64,1);',
        '.monaco-hover': 'animation: apc-zoom-in 150ms ease;',
        '.monaco-workbench .notifications-toasts .notification-toast': 'animation: apc-flip-in 360ms cubic-bezier(0.22,0.61,0.36,1);',
        '.monaco-menu-container': 'animation: apc-flip-in 240ms cubic-bezier(0.22,0.61,0.36,1);',
        '.monaco-workbench .part.sidebar .composite.viewlet': 'animation: apc-slide-in-left 220ms cubic-bezier(0.34,1.56,0.64,1);'
    },
    off: {}
};

// 背景「仅代码区」CSS 生成 —— 图贴编辑器区,让编辑器各背景层透明露出图
function codeOnlyCss(bgUrl, opacity) {
    // 经真实 DOM 验证有效的选择器(红块测试通过)
    // 图以 ::after 覆盖在编辑器区,pointer-events:none 不挡操作,opacity 控制浓淡
    const op = (opacity == null ? 0.25 : opacity);
    return {
        ".editor-group-container > .editor-container > .editor-instance":
            'position: relative !important;',
        ".editor-group-container > .editor-container > .editor-instance::after":
            `content:'' !important; position:absolute !important; top:0; left:0; width:100%; height:100%; z-index:10 !important; pointer-events:none !important; background-image: url("${bgUrl}"); background-position: center center; background-repeat: no-repeat; background-size: cover; opacity: ${op};`
    };
}
const CODE_ONLY_KEYS = Object.keys(codeOnlyCss('x', 0.92));

// ============================================================
// 多区域背景 —— 区域定义表
// 选择器全部对 VS Code 1.131 的 workbench.desktop.main.css 核对过。
// container 用 ::after 叠一层图;transparent 列出的子元素背景由 JS 写成内联
// style.backgroundColor,只有 !important 压得过内联样式,否则图被完全盖住。
// ============================================================
const REGIONS = {
    editor: {
        label: '编辑器',
        container: '.editor-group-container > .editor-container > .editor-instance',
        transparent: [
            '.monaco-editor, .monaco-editor .margin, .monaco-editor-background',
            '.monaco-editor .minimap'
        ],
        defaultOpacity: 0.22
    },
    sidebar: {
        label: '侧栏',
        // .part > .content > .composite 是 workbench 的通用嵌套(侧栏的 composite
        // 运行时还会带上 viewlet class,这里不依赖它,少一个失效点)
        container: '.monaco-workbench .part.sidebar > .content > .composite',
        transparent: [
            '.monaco-workbench .part.sidebar',
            '.monaco-workbench .part.sidebar .pane, .monaco-workbench .part.sidebar .pane-body',
            '.monaco-workbench .part.sidebar .monaco-list-rows'
        ],
        defaultOpacity: 0.18
    },
    panel: {
        label: '面板',
        container: '.monaco-workbench .part.panel > .content > .composite',
        transparent: [
            '.monaco-workbench .part.panel',
            '.monaco-workbench .part.panel > .content .monaco-editor, .monaco-workbench .part.panel > .content .monaco-editor .margin, .monaco-workbench .part.panel > .content .monaco-editor .monaco-editor-background',
            '.monaco-workbench .part.panel .xterm-screen'
        ],
        defaultOpacity: 0.18
    }
};
const REGION_KEYS = Object.keys(REGIONS);

// 绝对路径 → workbench 可加载的 URL。
// 关键:workbench 自身从 vscode-file://vscode-app/ 加载,所以 CSP 的
// `img-src 'self'` 覆盖该 origin;而 Electron 的协议校验是 OR ——
// 路径在白名单目录下【或】扩展名在白名单里(.png/.jpg/.jpeg/.webp/.gif/.bmp/.svg),
// 后者让磁盘任意位置的图片都能直接引用。因此不必内联 base64:
// 12 张 2MB 壁纸内联要 33MB CSS,改成 URL 只要 1KB。
const VSCODE_FILE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'];
function toWorkbenchUrl(absPath) {
    const p = String(absPath).replace(/\\/g, '/');
    return 'vscode-file://vscode-app' + (p.startsWith('/') ? '' : '/') + encodeURI(p).replace(/[?#]/g, encodeURIComponent);
}

// 图片是否能走 vscode-file(扩展名在 Electron 白名单内);否则退回 base64 内联
function canUseWorkbenchUrl(absPath) {
    return VSCODE_FILE_EXTS.includes(path.extname(String(absPath)).toLowerCase());
}

// 复制进 backgrounds/ 时清洗文件名。
// 全窗口模式把路径交给 Custom UI Style,它按 `url('...')` 单引号拼接且不转义
// (css.ts:31),而 pathToFileURL 不转义单引号 —— 于是名字里带 `')` 的图片会
// 提前闭合这条规则,背景静默失效。本插件自己生成的 CSS 用双引号 + encodeURI
// (双引号会被转成 %22)不受影响,但源头清洗掉最省事,两条路径一起保住。
function safeImageName(name) {
    // 先剥掉开头的点,否则 ".png" 会被 extname 当成无扩展名的隐藏文件,
    // 清洗后变成 "_png" —— 扩展名没了,vscode-file 白名单也就命中不了。
    const bare = String(name).replace(/^\.+/, '');
    const ext = path.extname(bare).toLowerCase();
    const stem = path.basename(bare, path.extname(bare))
        .replace(/['"(){};\\\r\n]/g, '_')   // CSS url() / 规则语法里有特殊含义的字符
        .slice(0, 80);
    return (stem || 'image') + (ext || '.png');
}

// 单张图 → CSS url() 值。inline 为真时强制内联 base64(兜底开关)
function imageCssUrl(absPath, inline) {
    if (!absPath) return '';
    if (!inline && canUseWorkbenchUrl(absPath)) return toWorkbenchUrl(absPath);
    return imageToDataUri(toFileUrl(absPath));
}

// ============================================================
// 轮播 keyframes 生成
// 原理:background-image 是离散属性,不做插值,只在关键帧处突变。
// 所以把换图放在 opacity=0 的那一帧,换图动作就看不见,单层伪元素即可淡入淡出。
// 已在真实浏览器实测:3 图 / 210 次采样 / 4 次换图,换图时刻 opacity 最高
// 0.0246(上限 0.22 的 11%),无硬切。
// 注意 opacity 只能在 0..maxOpacity 之间动,maxOpacity 就是该区域配置的不透明度,
// 不能动到 1,否则轮播时图会比静态时浓。
// ============================================================
const CAROUSEL_FADE_RATIO = 0.25;   // 淡入淡出各占单张时长的比例

function carouselKeyframes(name, urls, maxOpacity, fadeRatio) {
    const n = urls.length;
    const slot = 100 / n;
    const fade = slot * (fadeRatio == null ? CAROUSEL_FADE_RATIO : fadeRatio);
    const op = maxOpacity;
    const frames = [];
    for (let i = 0; i < n; i++) {
        const start = i * slot;
        const img = `background-image: url("${urls[i]}")`;
        frames.push(`    ${+start.toFixed(4)}% { ${img}; opacity: 0; }`);
        frames.push(`    ${+(start + fade).toFixed(4)}% { ${img}; opacity: ${op}; }`);
        frames.push(`    ${+(start + slot - fade).toFixed(4)}% { ${img}; opacity: ${op}; }`);
    }
    // 收尾帧回到第一张,让 linear infinite 无缝接上
    frames.push(`    100% { background-image: url("${urls[0]}"); opacity: 0; }`);
    return `@keyframes ${name} {\n${frames.join('\n')}\n}`;
}

// 单个区域的完整 CSS:透明化子元素 + ::after 图层(静态或轮播)
// cfg: { images: string[], opacity: number, intervalMs: number, blend: boolean, inline: boolean }
function regionCss(key, cfg) {
    const region = REGIONS[key];
    if (!region || !cfg || !cfg.images || !cfg.images.length) return '';
    const urls = cfg.images.map(p => imageCssUrl(p, cfg.inline)).filter(Boolean);
    if (!urls.length) return '';

    const opacity = typeof cfg.opacity === 'number' ? cfg.opacity : region.defaultOpacity;
    const out = [`/* ---- ${region.label} ---- */`];

    // 子元素透明化 —— 必须 !important,背景色是内联样式写上去的
    for (const sel of region.transparent) {
        out.push(`${sel} { background-color: transparent !important; }`);
    }

    out.push(`${region.container} { position: relative !important; }`);

    // 每条都带 !important:Custom UI Style 把 external.css 注入在
    // workbench.desktop.main.css【之前】(已在本机 workbench.html 核对:1313 vs 1415),
    // 所以同优先级下 VS Code 一律胜出。VS Code 自己也在 workbench 元素上用 ::after
    // (如 .title.title-border-bottom:after),将来它给我们这些容器加一条就会盖掉我们。
    const layer = [
        `content: '' !important`, `position: absolute !important`,
        `top: 0 !important`, `left: 0 !important`,
        `width: 100% !important`, `height: 100% !important`,
        `z-index: 10 !important`, `pointer-events: none !important`,
        `background-position: center center !important`,
        `background-repeat: no-repeat !important`,
        `background-size: cover !important`
    ];
    // 深色主题下 screen 混合让图与底色自然融合;浅色主题会发白,故可关
    if (cfg.blend) layer.push(`mix-blend-mode: screen !important`);

    if (urls.length === 1) {
        layer.push(`background-image: url("${urls[0]}") !important`, `opacity: ${opacity} !important`);
        out.push(`${region.container}::after {\n    ${layer.join(';\n    ')};\n}`);
    } else {
        const anim = `beautify-carousel-${key}`;
        const dur = Math.max(1, Math.round((cfg.intervalMs || 8000) * urls.length / 1000));
        layer.push(`animation: ${anim} ${dur}s linear infinite !important`);
        out.push(`${region.container}::after {\n    ${layer.join(';\n    ')};\n}`);
        out.push(carouselKeyframes(anim, urls, opacity));
        // 系统要求减少动效时停在第一张,不要闪
        out.push(`@media (prefers-reduced-motion: reduce) {\n    ${region.container}::after {\n        animation: none !important;\n        background-image: url("${urls[0]}") !important;\n        opacity: ${opacity} !important;\n    }\n}`);
    }
    return out.join('\n');
}

async function reloadCUS() {
    try { await vscode.commands.executeCommand('custom-ui-style.reload'); }
    catch (e) { vscode.window.showWarningMessage('已改配置,但自动 reload 失败,请手动运行 "Custom UI Style: Reload"。'); }
}

// 平台不适用的设置键 —— 写入未注册的键会抛「没有注册配置」。
// macOS 的菜单栏由系统顶栏接管,VS Code 在该平台不注册 window.menuBarVisibility。
// 写成函数而非常量,便于按平台断言。
function platformSkipKeys() {
    return process.platform === 'darwin' ? ['window.menuBarVisibility'] : [];
}

// 滤掉当前平台不适用的键
function applicable(updates) {
    const skip = platformSkipKeys();
    return updates.filter(([key]) => !skip.includes(key));
}

// 逐键写入。单个键失败(未注册 / 已废弃 / 平台不适用)不再中断整批 ——
// 之前一个键抛错会让它后面的设置全部漏写,且首次初始化标记写不成,
// 于是每次启动重复报错。失败的键收集后返回,同时打日志,不静默吞掉。
async function setConfig(updates) {
    const cfg = vscode.workspace.getConfiguration();
    const failed = [];
    for (const [key, val] of applicable(updates)) {
        try {
            await cfg.update(key, val, vscode.ConfigurationTarget.Global);
        } catch (e) {
            failed.push(key);
            console.warn(`[美化控制台] 写入设置失败 ${key}: ${e.message}`);
        }
    }
    return failed;
}

// 用户在面板里主动改的设置若写入失败,必须让他看见 ——
// 否则面板照样弹「已实时应用」,而设置根本没生效。
function warnFailed(failed) {
    if (failed && failed.length) {
        vscode.window.showWarningMessage(
            `美化控制台: 以下设置写入失败(当前 VS Code 未注册该项): ${failed.join(', ')}`);
    }
    return failed;
}

// 合并 stylesheet: 应用动画档 + 代码区背景(互不干扰)
function buildStylesheet(current, animMode, bgMode, bgUrl) {
    let base = {};
    // 从 current 里剔除所有由本插件管理的键(动画各档 + 代码区),保留用户手加的
    const managed = new Set([
        ...Object.keys(ANIM_PRESETS.default),
        ...Object.keys(ANIM_PRESETS.smooth),
        ...CODE_ONLY_KEYS
    ]);
    for (const k of Object.keys(current || {})) {
        if (!managed.has(k)) base[k] = current[k];
    }
    // 叠加动画档
    Object.assign(base, ANIM_PRESETS[animMode] || {});
    // 叠加代码区背景
    if (bgMode === 'codeOnly' && bgUrl) {
        const op = vscode.workspace.getConfiguration().get('custom-ui-style.background.opacity');
        Object.assign(base, codeOnlyCss(bgUrl, op));
    }
    return base;
}

// 改 cus-base.css 里的圆角基准变量(只改 --r 那一行,可反复修改不损坏)
function setRadius(px) {
    try {
        let css = fs.readFileSync(cusBaseCss(), 'utf8');
        if (/--r:\s*\d+px/.test(css)) {
            css = css.replace(/--r:\s*\d+px/, `--r: ${px}px`);
        } else {
            // 兼容:文件没有变量则补一行
            css = ':root { --r: ' + px + 'px; }\n' + css;
        }
        fs.writeFileSync(cusBaseCss(), css);
        return true;
    } catch (e) { return false; }
}
// 读当前圆角值
function getRadius() {
    try {
        const m = fs.readFileSync(cusBaseCss(), 'utf8').match(/--r:\s*(\d+)px/);
        return m ? parseInt(m[1], 10) : 8;
    } catch (e) { return 8; }
}

// ============================================================
// 动态 CSS(动画 + 仅代码区背景)—— 写入 cus-dynamic.css,走 external.imports
// 关键修复:此版本 Custom UI Style 不注入 stylesheet 设置,只注入 imports 的文件。
// 所以动画和背景都必须写成真实 CSS 文件。
// ============================================================

// {选择器: 规则} 对象 → CSS 文本
function cssFromObj(obj) {
    return Object.entries(obj).map(([sel, rule]) => `${sel} {\n    ${rule}\n}`).join('\n');
}

// 仅代码区专属透明度(独立于全窗口的 background.opacity;范围 0.05~0.6,默认 0.22)
function getCodeOpacity() {
    const v = vscode.workspace.getConfiguration().get('beautify.codeOpacity');
    return (typeof v === 'number' && v >= 0.05 && v <= 0.8) ? v : 0.22;
}

// 生成并写入 cus-dynamic.css;用注释标记当前 animMode / bgMode 供 readState 读取
// state 可选:bgMode 为 'regions' 时用它生成多区域段,不传则从状态文件读。
function writeDynamicCss(animMode, bgMode, state) {
    const bgUrl = getChosenImage();
    let out = `/* 由美化控制台动态生成,勿手改 */\n/* ANIM:${animMode} */\n/* BG:${bgMode} */\n\n`;
    // 动画段
    const anim = ANIM_PRESETS[animMode] || {};
    if (Object.keys(anim).length) out += '/* ---- 动画 ---- */\n' + cssFromObj(anim) + '\n\n';
    // 仅代码区背景段(旧模式,保留:图转 base64 绕过 CSP;用专属的 codeOpacity)
    if (bgMode === 'codeOnly' && bgUrl) {
        const dataUri = imageToDataUri(bgUrl);
        out += '/* ---- 仅代码区背景 ---- */\n' + cssFromObj(codeOnlyCss(dataUri, getCodeOpacity())) + '\n';
    }
    // 多区域段:各区域独立图 / 不透明度 / 轮播
    if (bgMode === 'regions') {
        const st = state || readBeautifyState();
        const parts = [];
        for (const key of REGION_KEYS) {
            const cfg = st.regions[key];
            if (!cfg || !cfg.images.length) continue;
            parts.push(regionCss(key, { ...cfg, inline: st.inlineImages }));
        }
        if (parts.length) out += '/* ---- 多区域背景 ---- */\n' + parts.join('\n\n') + '\n';
    }
    try { fs.writeFileSync(cusDynamicCss(), out); return true; } catch (e) { return false; }
}

// 从 cus-dynamic.css 的标记注释读当前模式
function readDynamicModes() {
    try {
        const c = fs.readFileSync(cusDynamicCss(), 'utf8');
        const a = c.match(/ANIM:(\w+)/); const b = c.match(/BG:(\w+)/);
        return { animMode: a ? a[1] : 'default', bgModeCss: b ? b[1] : 'off' };
    } catch (e) { return { animMode: 'default', bgModeCss: 'off' }; }
}

// ============================================================
// 状态文件 —— 多区域 / 轮播的配置装不进注释标记,改用 JSON
// 旧状态(单图 .beautify-bg-image + cus-dynamic.css 的 ANIM:/BG: 注释)仍然
// 是唯一来源直到这里迁移一次;迁移后依旧继续写那两个注释,让 readDynamicModes
// 和任何还在读旧格式的路径不受影响。
// ============================================================
const STATE_VERSION = 1;
const stateFile = () => path.join(getUserDir(), 'beautify-state.json');

function defaultRegionCfg(key) {
    return { images: [], opacity: REGIONS[key].defaultOpacity, intervalMs: 8000, blend: true };
}

function defaultState() {
    const regions = {};
    for (const k of REGION_KEYS) regions[k] = defaultRegionCfg(k);
    return { version: STATE_VERSION, animMode: 'default', bgMode: 'off', regions, inlineImages: false };
}

// 从旧格式迁移:单张图归到 editor 区域,模式沿用注释标记
function migrateLegacyState() {
    const st = defaultState();
    const modes = readDynamicModes();
    st.animMode = modes.animMode;
    const legacyImg = getChosenImage();
    if (legacyImg) {
        const abs = fromFileUrl(legacyImg);
        if (modes.bgModeCss === 'codeOnly') {
            st.bgMode = 'codeOnly';
            st.regions.editor.images = [abs];
            st.regions.editor.opacity = getCodeOpacity();
        } else if (vscode.workspace.getConfiguration().get('custom-ui-style.background.url')) {
            st.bgMode = 'full';
        }
    }
    return st;
}

// 校验并规范化任意来源的状态对象(状态文件被手改、或从别人那儿导入的配置)。
// 只接受白名单内的键与合法取值,其余一律丢弃 —— 这些值会被写进注入的 CSS,
// 不能信。返回 { state, rejected } 便于向用户交代哪些项被丢了。
const ANIM_MODES = ['default', 'smooth', 'bounce', 'fancy', 'off'];
const BG_MODES = ['off', 'full', 'codeOnly', 'regions'];

function sanitizeState(raw) {
    const st = defaultState();
    const rejected = [];
    if (!raw || typeof raw !== 'object') return { state: st, rejected: ['整个文件不是对象'] };

    if (ANIM_MODES.includes(raw.animMode)) st.animMode = raw.animMode;
    else if (raw.animMode !== undefined) rejected.push(`animMode=${JSON.stringify(raw.animMode)}`);

    if (BG_MODES.includes(raw.bgMode)) st.bgMode = raw.bgMode;
    else if (raw.bgMode !== undefined) rejected.push(`bgMode=${JSON.stringify(raw.bgMode)}`);

    st.inlineImages = raw.inlineImages === true;

    const rawRegions = (raw.regions && typeof raw.regions === 'object') ? raw.regions : {};
    for (const k of REGION_KEYS) {
        const src = rawRegions[k];
        if (!src || typeof src !== 'object') continue;
        const dst = st.regions[k];
        // 图片路径:必须是绝对路径字符串。相对路径会相对 workbench 解析,指向
        // app bundle 内部,既无效也不该允许。
        if (Array.isArray(src.images)) {
            for (const p of src.images) {
                if (typeof p === 'string' && p && path.isAbsolute(p)) dst.images.push(p);
                else rejected.push(`${k}.images 里的 ${JSON.stringify(p)}`);
            }
        }
        if (typeof src.opacity === 'number' && src.opacity >= 0 && src.opacity <= 1) dst.opacity = src.opacity;
        else if (src.opacity !== undefined) rejected.push(`${k}.opacity=${JSON.stringify(src.opacity)}`);
        // 间隔下限 1s:再短会让 CSS 动画疯狂重绘
        if (typeof src.intervalMs === 'number' && src.intervalMs >= 1000 && src.intervalMs <= 3600000) dst.intervalMs = src.intervalMs;
        else if (src.intervalMs !== undefined) rejected.push(`${k}.intervalMs=${JSON.stringify(src.intervalMs)}`);
        dst.blend = src.blend !== false;
    }
    return { state: st, rejected };
}

function readBeautifyState() {
    try {
        const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
        return sanitizeState(raw).state;
    } catch (e) {
        // 首次运行 / 文件损坏 → 从旧格式迁移一次
        return migrateLegacyState();
    }
}

// ============================================================
// 配置导出 / 导入
// 配置散在三处:VS Code 设置键、cus-base.css 的 --r、状态文件。
// 导出把三者收进一个 JSON;导入时全部走 sanitize,不采信任何字段。
// 图片按绝对路径引用而非内嵌 —— 内嵌会让文件大到无法分享(12 张 2MB 图 = 33MB),
// 且人也没法手改。导入时逐个检查存在性,缺图明确报出来。
// ============================================================
const EXPORT_KIND = 'beautify-console-config';

// 导出会带上的 VS Code 设置键 → 允许的值类型。
// 类型必须写死,不能拿 cfg.get() 的当前值去比 —— 键在本机没设过时当前值是
// undefined,那样校验会被整个跳过,字符串就能写进 number 型的键里。
// 少数键 VS Code 本身接受多种类型(如 fontLigatures 可为 bool 或字符串),写成数组。
const EXPORTED_SETTINGS_TYPES = {
    'editor.fontFamily': 'string',
    'editor.fontSize': 'number',
    'editor.lineHeight': 'number',
    'editor.fontWeight': ['string', 'number'],
    'editor.fontLigatures': ['boolean', 'string'],
    'workbench.statusBar.visible': 'boolean',
    'breadcrumbs.enabled': 'boolean',
    'workbench.activityBar.location': 'string',
    'window.menuBarVisibility': 'string',
    'workbench.editor.tabSizing': 'string',
    'editor.cursorSmoothCaretAnimation': ['string', 'boolean'],
    'editor.smoothScrolling': 'boolean',
    'editor.bracketPairColorization.enabled': 'boolean',
    'editor.guides.indentation': 'boolean',
    'editor.stickyScroll.enabled': 'boolean',
    'editor.minimap.enabled': 'boolean',
    'editor.padding.top': 'number',
    'editor.padding.bottom': 'number',
    'workbench.colorTheme': 'string',
    'workbench.iconTheme': 'string',
    'workbench.productIconTheme': 'string',
    'terminal.integrated.fontFamily': 'string',
    'custom-ui-style.background.opacity': 'number',
    'beautify.codeOpacity': 'number'
};
const EXPORTED_SETTINGS = Object.keys(EXPORTED_SETTINGS_TYPES);

function settingTypeOk(key, value) {
    const want = EXPORTED_SETTINGS_TYPES[key];
    if (!want) return false;
    const list = Array.isArray(want) ? want : [want];
    if (!list.includes(typeof value)) return false;
    // number 型不接受 NaN / Infinity —— 写进 CSS 会产出非法值
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    return true;
}

function exportConfig() {
    const cfg = vscode.workspace.getConfiguration();
    const settings = {};
    for (const k of EXPORTED_SETTINGS) {
        const v = cfg.get(k);
        if (v !== undefined) settings[k] = v;
    }
    let customCss = '';
    try { customCss = fs.readFileSync(cusCustomCss(), 'utf8'); } catch (e) { /* 没有就空 */ }
    return {
        kind: EXPORT_KIND,
        version: STATE_VERSION,
        exportedAt: new Date().toISOString(),
        radius: getRadius(),
        settings,
        state: readBeautifyState(),
        customCss
    };
}

// 导入:校验 → 应用。返回 { applied, rejected, missingImages, failedKeys }
async function importConfig(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('文件内容不是 JSON 对象');
    if (raw.kind !== EXPORT_KIND) throw new Error(`不是美化控制台的配置文件(kind=${JSON.stringify(raw.kind)})`);

    const { state, rejected } = sanitizeState(raw.state);
    // 缺图不阻断导入 —— 别人机器上的路径在本机大概率不存在,但其余配置仍有价值
    const missingImages = [];
    for (const k of REGION_KEYS) {
        state.regions[k].images = state.regions[k].images.filter(p => {
            if (fs.existsSync(p)) return true;
            missingImages.push(p);
            return false;
        });
    }

    // 设置键:只认白名单内的键,值类型必须与当前值一致(或当前无值)
    const updates = [];
    const rawSettings = (raw.settings && typeof raw.settings === 'object') ? raw.settings : {};
    const cfg = vscode.workspace.getConfiguration();
    for (const k of EXPORTED_SETTINGS) {
        if (!(k in rawSettings)) continue;
        const v = rawSettings[k];
        if (!settingTypeOk(k, v)) { rejected.push(`${k}=${JSON.stringify(v)} 类型不符`); continue; }
        updates.push([k, v]);
    }
    for (const k of Object.keys(rawSettings)) {
        if (!EXPORTED_SETTINGS.includes(k)) rejected.push(`未知设置键 ${k}`);
    }
    const failedKeys = await setConfig(updates);

    if (typeof raw.radius === 'number' && raw.radius >= 0 && raw.radius <= 40) setRadius(Math.round(raw.radius));
    else if (raw.radius !== undefined) rejected.push(`radius=${JSON.stringify(raw.radius)}`);

    // 自定义 CSS 属于用户资产,导入前先备份,别人的配置不该无声覆盖你写的
    if (typeof raw.customCss === 'string') {
        try {
            if (fs.existsSync(cusCustomCss())) {
                fs.copyFileSync(cusCustomCss(), cusCustomCss() + '.bak');
            }
            fs.writeFileSync(cusCustomCss(), raw.customCss);
        } catch (e) { rejected.push(`自定义 CSS 写入失败: ${e.message}`); }
    }

    writeBeautifyState(state);
    writeDynamicCss(state.animMode, state.bgMode, state);
    return { applied: true, rejected, missingImages, failedKeys };
}

function writeBeautifyState(st) {
    try {
        fs.mkdirSync(getUserDir(), { recursive: true });
        fs.writeFileSync(stateFile(), JSON.stringify(st, null, 2));
        return true;
    } catch (e) {
        vscode.window.showErrorMessage(`美化控制台: 状态保存失败 — ${e.message}`);
        return false;
    }
}

// 常见编程字体候选(展示名 → 文件名关键字列表,用于检测是否已装)
// 同一字体在不同系统的文件名可能不同(如 SF Mono 有 SFMono-Regular / SFNSMono 两种)
const CODING_FONTS = [
    ['JetBrains Mono', ['jetbrainsmono']],
    ['Fira Code', ['firacode']],
    ['Cascadia Code', ['cascadiacode']],
    ['Cascadia Mono', ['cascadiamono']],
    ['Source Code Pro', ['sourcecodepro']],
    ['SF Mono', ['sfmono', 'sfnsmono']],
    ['Menlo', ['menlo']],
    ['Monaco', ['monaco']],
    ['Consolas', ['consola']],
    ['Hack', ['hack']],
    ['IBM Plex Mono', ['ibmplexmono']],
    ['Roboto Mono', ['robotomono']],
    ['Ubuntu Mono', ['ubuntumono']],
    ['DejaVu Sans Mono', ['dejavusansmono']],
    ['Liberation Mono', ['liberationmono']],
    ['Noto Sans Mono', ['notosansmono']],
    ['Courier New', ['couriernew']],
    ['MesloLGS NF', ['meslolgs']],
    ['Maple Mono', ['maplemono']],
    ['Victor Mono', ['victormono']],
    ['Operator Mono', ['operatormono']]
];

// 各平台字体安装目录
function fontDirs() {
    const home = os.homedir();
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData/Local');
        const winDir = process.env.WINDIR || 'C:/Windows';
        return [path.join(localAppData, 'Microsoft/Windows/Fonts'), path.join(winDir, 'Fonts')];
    }
    if (process.platform === 'darwin') {
        return [
            path.join(home, 'Library/Fonts'),
            '/Library/Fonts',
            '/System/Library/Fonts',
            '/System/Library/Fonts/Supplemental'
        ];
    }
    const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local/share');
    return [path.join(dataHome, 'fonts'), path.join(home, '.fonts'), '/usr/share/fonts', '/usr/local/share/fonts'];
}

// 递归收集字体文件名(小写去分隔符)。Linux 的 /usr/share/fonts 按 truetype/ 等
// 子目录分层,所以要下钻;depth 限制 2 层,避免在大目录上白跑。
function collectFontNames(dir, names, depth) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { return; } // 目录不存在或无权限,忽略
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (depth > 0) collectFontNames(path.join(dir, entry.name), names, depth - 1);
        } else if (/\.(ttf|otf|ttc|dfont)$/i.test(entry.name)) {
            names.add(entry.name.toLowerCase().replace(/[\s_-]/g, ''));
        }
    }
}

// 扫描已安装字体文件名,用于标记哪些编程字体已装
function scannedFontFiles() {
    const names = new Set();
    for (const d of fontDirs()) collectFontNames(d, names, 2);
    return names;
}

// 返回字体列表:[{name, installed}],已装的排前面
function listFonts() {
    const files = [...scannedFontFiles()];
    const arr = CODING_FONTS.map(([name, keys]) => {
        const installed = keys.some(key => files.some(f => f.includes(key)));
        return { name, installed };
    });
    arr.sort((a, b) => (b.installed - a.installed));
    return arr;
}

// 各平台自带的等宽字体兜底链 —— Consolas 只有 Windows 有,
// macOS 用 Menlo/Monaco,Linux 用 DejaVu,否则字体设置会落到衬线字体上。
function fallbackFonts() {
    if (process.platform === 'darwin') return ["Menlo", "Monaco", "monospace"];
    if (process.platform === 'win32') return ["Consolas", "Courier New", "monospace"];
    return ["DejaVu Sans Mono", "Liberation Mono", "monospace"];
}

// 组装 editor.fontFamily 值:首选字体 + 当前平台兜底链
function fontStack(primary) {
    return [primary, ...fallbackFonts()].map(f => (/\s/.test(f) ? `'${f}'` : f)).join(', ');
}

// 从 editor.fontFamily 里取出首选字体名(去引号)
function currentFontName(ff) {
    if (!ff) return 'JetBrains Mono';
    const m = String(ff).match(/^\s*'?([^',]+)'?/);
    return m ? m[1].trim() : 'JetBrains Mono';
}

function listThemes(kind) {
    const out = [];
    for (const ext of vscode.extensions.all) {
        const contributes = ext.packageJSON && ext.packageJSON.contributes;
        if (!contributes) continue;
        const arr = kind === 'icon' ? contributes.iconThemes
            : kind === 'product' ? contributes.productIconThemes
            : contributes.themes;
        if (Array.isArray(arr)) {
            for (const t of arr) out.push(t.id || t.label || t.name);
        }
    }
    return out;
}

// 读取当前所有面板关心的参数值
function readState() {
    const c = vscode.workspace.getConfiguration();
    // 动画档位 + 仅代码区标记从 cus-dynamic.css 读
    const dyn = readDynamicModes();
    const animMode = dyn.animMode;
    const fullUrl = c.get('custom-ui-style.background.url') || '';
    // 背景模式:有 background.url = 全窗口;否则看 dynamic css 里是不是 codeOnly
    let bgMode = 'off';
    if (fullUrl) bgMode = 'full';
    else if (dyn.bgModeCss === 'codeOnly') bgMode = 'codeOnly';
    else if (dyn.bgModeCss === 'regions') bgMode = 'regions';
    const bgUrl = getChosenImage();   // 面板显示用:当前选定的图(独立于模式)
    const bst = readBeautifyState();  // 多区域配置的唯一来源
    return {
        fontFamily: c.get('editor.fontFamily'),
        fontName: currentFontName(c.get('editor.fontFamily')),
        fonts: listFonts(),
        fontSize: c.get('editor.fontSize'),
        lineHeight: c.get('editor.lineHeight'),
        fontWeight: c.get('editor.fontWeight'),
        ligatures: c.get('editor.fontLigatures'),
        statusBar: c.get('workbench.statusBar.visible'),
        breadcrumbs: c.get('breadcrumbs.enabled'),
        activityBar: c.get('workbench.activityBar.location'),
        menuBar: c.get('window.menuBarVisibility'),
        tabSizing: c.get('workbench.editor.tabSizing'),
        cursorSmooth: c.get('editor.cursorSmoothCaretAnimation'),
        smoothScroll: c.get('editor.smoothScrolling'),
        bracketColor: c.get('editor.bracketPairColorization.enabled'),
        indentGuides: c.get('editor.guides.indentation'),
        stickyScroll: c.get('editor.stickyScroll.enabled'),
        paddingTop: c.get('editor.padding.top'),
        minimap: c.get('editor.minimap.enabled'),
        animMode,
        bgMode,
        bgUrl,
        // 按模式返回对应透明度:全窗口用 background.opacity(0.7~1),仅代码区用 codeOpacity(0.05~0.6)
        // 全窗口用 CUS 的 background.opacity(0.7~1);仅代码区与多区域是叠在
        // 内容上的图层,取值低得多(0.05~0.8),滑块范围必须跟着换。
        bgOpacity: bgMode === 'codeOnly' ? getCodeOpacity()
            : bgMode === 'regions' ? Math.max(...REGION_KEYS.map(k => bst.regions[k].opacity))
            : (c.get('custom-ui-style.background.opacity') || 0.92),
        lowOpacityMode: bgMode === 'codeOnly' || bgMode === 'regions',
        radius: getRadius(),
        colorTheme: c.get('workbench.colorTheme'),
        iconTheme: c.get('workbench.iconTheme'),
        productIconTheme: c.get('workbench.productIconTheme'),
        themes: listThemes('color'),
        iconThemes: listThemes('icon'),
        productThemes: listThemes('product'),
        platform: process.platform,
        // 多区域 / 自定义 CSS
        regions: bst.regions,
        regionMeta: REGION_KEYS.map(k => ({ key: k, label: REGIONS[k].label, defaultOpacity: REGIONS[k].defaultOpacity })),
        inlineImages: bst.inlineImages,
        customCssEnabled: isCustomCssEnabled()
    };
}

// 首次激活标记文件
const initDoneFile = () => path.join(getUserDir(), '.beautify-init-done');

// 本插件在 imports 里管理的文件名 —— 用于剔除其它机器同步过来的旧条目
const MANAGED_CSS_NAMES = ['cus-base.css', 'cus-dynamic.css', 'cus-custom.css'];

// settings.json 会被 Settings Sync 同步,于是 Windows 上写的
// `file://C:/Users/xxx/AppData/...` 会跟到 macOS/Linux。这些路径在本机
// 解析不出文件,Custom UI Style 对每个条目单独 try/catch,于是静默产出空
// CSS —— 表现就是「装了但完全没反应」。这里只剔除本插件管理的那两个文件
// 且指向本机之外的条目,用户自己加的 import 一律保留。
function isStaleManagedImport(entry, keep) {
    if (typeof entry !== 'string' || !entry.startsWith('file://')) return false;
    if (keep.includes(entry)) return false;
    const p = fromFileUrl(entry);
    // 必须落在某个 User 目录下,才认定是本插件在别的机器上写的。
    // 只按文件名判断会误删用户自己放在别处的同名 CSS。
    if (path.basename(path.dirname(p)) !== 'User') return false;
    return MANAGED_CSS_NAMES.includes(path.basename(p));
}

// 自举:新机器首次激活,创建 CSS 文件并登记进 Custom UI Style 的 imports
// 首次安装时自动应用 JetBrains 默认参数
async function bootstrap() {
    try {
        const baseTpl = ':root { --r: 8px; }\n' +
            '@keyframes apc-fade-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }\n' +
            '@keyframes apc-fade-scale { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }\n' +
            '@keyframes apc-slide-in-left { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }\n' +
            '@keyframes apc-bounce-in { 0% { opacity: 0; transform: scale(0.9) translateY(-8px); } 60% { opacity: 1; transform: scale(1.02) translateY(2px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }\n' +
            '@keyframes apc-zoom-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }\n' +
            '@keyframes apc-flip-in { from { opacity: 0; transform: perspective(400px) rotateX(-12deg); } to { opacity: 1; transform: perspective(400px) rotateX(0); } }\n';
        fs.mkdirSync(getUserDir(), { recursive: true });
        if (!fs.existsSync(cusBaseCss())) fs.writeFileSync(cusBaseCss(), baseTpl);
        if (!fs.existsSync(cusDynamicCss()) || fs.readFileSync(cusDynamicCss(), 'utf8').trim().length < 20) {
            writeDynamicCss('default', 'off');
        }
        const cfg = vscode.workspace.getConfiguration();
        const imports = cfg.get('custom-ui-style.external.imports') || [];
        // 必须先落盘再登记:缺文件不会被静默跳过 —— Custom UI Style 读取失败会
        // 弹错误通知并强制打开输出面板(external.ts:141 → utils.ts:160),每次
        // reload 都来一遍。
        if (!fs.existsSync(cusCustomCss())) {
            fs.writeFileSync(cusCustomCss(),
                '/* 自定义 CSS —— 美化控制台不会覆盖此文件。\n' +
                '   改动后需运行 "Custom UI Style: Reload"(macOS 会整个退出重开)。*/\n');
        }
        // cus-custom.css 放最后:external.imports 按数组顺序合并,靠后者在同
        // 优先级下胜出,用户手写规则才能压过我们生成的。
        // 被紧急关闭时不登记它 —— 文件留着,用户写的东西不丢。
        const need = [toFileUrl(cusBaseCss()), toFileUrl(cusDynamicCss())];
        if (isCustomCssEnabled()) need.push(toFileUrl(cusCustomCss()));
        const kept = imports.filter(im => !isStaleManagedImport(im, need));
        let changed = kept.length !== imports.length;
        for (const im of need) if (!kept.includes(im)) { kept.push(im); changed = true; }
        if (changed) {
            await cfg.update('custom-ui-style.external.imports', kept, vscode.ConfigurationTarget.Global);
            await cfg.update('custom-ui-style.external.loadStrategy', 'refetch', vscode.ConfigurationTarget.Global);
            await cfg.update('custom-ui-style.reloadWithoutPrompting', true, vscode.ConfigurationTarget.Global);
        }
        // 首次安装:自动应用 JetBrains 默认参数
        if (!fs.existsSync(initDoneFile())) {
            await applyJetBrainsDefaults();
            fs.writeFileSync(initDoneFile(), new Date().toISOString());
        }
    } catch (e) {
        // 自举失败会导致整个面板无声失效,必须让用户看见原因
        vscode.window.showErrorMessage(`美化控制台: 初始化失败 (${getUserDir()}) — ${e.message}`);
    }
}

// 首次安装时自动应用的 JetBrains 默认参数(与 restoreDefaults 一致但不弹通知、不 reload)
async function applyJetBrainsDefaults() {
    await setConfig([
        ['editor.fontFamily', fontStack('JetBrains Mono')],
        ['editor.fontSize', 14],
        ['editor.lineHeight', 1.6],
        ['editor.fontWeight', '400'],
        ['editor.fontLigatures', true],
        ['workbench.statusBar.visible', true],
        ['breadcrumbs.enabled', true],
        ['workbench.activityBar.location', 'top'],
        ['window.menuBarVisibility', 'compact'],
        ['workbench.editor.tabSizing', 'shrink'],
        ['editor.cursorSmoothCaretAnimation', 'on'],
        ['editor.smoothScrolling', true],
        ['editor.bracketPairColorization.enabled', true],
        ['editor.guides.indentation', true],
        ['editor.stickyScroll.enabled', true],
        ['editor.minimap.enabled', true],
        ['editor.padding.top', 10],
        ['editor.padding.bottom', 10],
        ['workbench.colorTheme', 'Int UI Dark'],
        ['workbench.iconTheme', 'int-ui-icons-dark'],
        ['workbench.productIconTheme', 'jetbrains-product-icon-theme'],
        ['terminal.integrated.fontFamily', fontStack('JetBrains Mono')]
    ]);
    setRadius(8);
    await setConfig([['custom-ui-style.background.opacity', 0.92]]);
    writeDynamicCss('default', 'off');
    await reloadCUS();
}

function activate(context) {
    let panel = null;
    resolveUserDir(context);   // 必须在 bootstrap 之前:所有文件路径都依赖它
    bootstrap();

    context.subscriptions.push(vscode.commands.registerCommand('beautify.openPanel', () => {
        if (panel) { panel.dispose(); panel = null; } // 强制重建,保证最新 HTML
        panel = vscode.window.createWebviewPanel('beautifyPanel', '美化控制台', vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true });
        panel.webview.html = getHtml();
        panel.onDidDispose(() => { panel = null; }, null, context.subscriptions);
        panel.webview.postMessage({ type: 'init', state: readState() });
        panel.webview.onDidReceiveMessage(msg => handleMessage(msg, panel), null, context.subscriptions);
        // 切回面板重新可见时,补发一次最新状态,避免空白
        panel.onDidChangeViewState(() => {
            if (panel && panel.visible) panel.webview.postMessage({ type: 'init', state: readState() });
        }, null, context.subscriptions);
    }));

    // 保留背景三命令(命令面板仍可直接用)
    context.subscriptions.push(
        vscode.commands.registerCommand('bgSwitcher.fullWindow', () => applyBg('full')),
        vscode.commands.registerCommand('bgSwitcher.codeOnly', () => applyBg('codeOnly')),
        vscode.commands.registerCommand('bgSwitcher.off', () => applyBg('off')),
        vscode.commands.registerCommand('beautify.panicDisableCustomCss', panicDisableCustomCss),
        vscode.commands.registerCommand('beautify.openCustomCss', openCustomCss)
    );
}

// ============================================================
// 自定义 CSS 的逃生门
// 用户 CSS 能把 workbench 整个弄成 display:none,连命令面板(.quick-input-widget)
// 也一起藏掉。但 CSS 破坏的是渲染、不是 JS —— 键绑定由 window 层监听处理,
// 不依赖任何元素可见,所以绑了快捷键的命令在界面全黑时依然能触发。
// 这是首要逃生手段;命令面板可能已经不可用,不能只靠它。
// 注意 code --disable-extensions 救不了:CUS 的补丁是写进 VS Code 自身文件的,
// 禁用扩展不会还原已落盘的改动。
// ============================================================
async function panicDisableCustomCss() {
    await setConfig([['beautify.customCss.enabled', false]]);
    const cfg = vscode.workspace.getConfiguration();
    const imports = (cfg.get('custom-ui-style.external.imports') || [])
        .filter(im => im !== toFileUrl(cusCustomCss()));
    await cfg.update('custom-ui-style.external.imports', imports, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
        '已关闭自定义 CSS(文件内容保留在 cus-custom.css)。正在重载以恢复界面。');
    await reloadCUS();
}

// 在编辑器里打开 cus-custom.css,并说清它需要什么才能生效
async function openCustomCss() {
    try {
        fs.mkdirSync(getUserDir(), { recursive: true });
        if (!fs.existsSync(cusCustomCss())) fs.writeFileSync(cusCustomCss(), '');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(cusCustomCss()));
        await vscode.window.showTextDocument(doc);
        // 没有文件监听,改完必须显式重载;macOS 上那是整个应用退出重开
        const hint = process.platform === 'darwin'
            ? '改完点「应用并重载」—— macOS 会完全退出并重新打开 VS Code。'
            : '改完点「应用并重载」使其生效。';
        vscode.window.showInformationMessage(
            `${hint} 写坏界面时按 ${process.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Alt+Shift+F12 一键关闭自定义 CSS。`);
    } catch (e) {
        vscode.window.showErrorMessage(`美化控制台: 打开自定义 CSS 失败 — ${e.message}`);
    }
}

const DEFAULT_BG = '';
// 「选了哪张图」独立持久化,与「用哪个模式」完全分开(修复选图跳全窗口的 bug)
const chosenImgFile = () => path.join(getUserDir(), '.beautify-bg-image');
function getChosenImage() {
    try { const v = fs.readFileSync(chosenImgFile(), 'utf8').trim(); return v || DEFAULT_BG; }
    catch (e) { return DEFAULT_BG; }
}
function setChosenImage(url) {
    try { fs.writeFileSync(chosenImgFile(), url || ''); } catch (e) {}
}

// 背景模式应用 —— 全窗口用 background.url;仅代码区写进 cus-dynamic.css;动画保持
async function applyBg(mode, noReload) {
    const bgUrl = getChosenImage();
    const animMode = readDynamicModes().animMode;
    if (mode === 'full') {
        // 全窗口:CUS 内建背景显示;dynamic css 只留动画(bg=off)
        warnFailed(await setConfig([['custom-ui-style.background.url', bgUrl]]));
        writeDynamicCss(animMode, 'off');
    } else if (mode === 'codeOnly') {
        // 仅代码区:清 url,把背景 CSS 写进 dynamic css
        warnFailed(await setConfig([['custom-ui-style.background.url', '']]));
        writeDynamicCss(animMode, 'codeOnly');
    } else if (mode === 'regions') {
        // 多区域:清 url,各区域 CSS 由状态文件驱动。模式要落进状态,
        // 否则下次读状态又回到 off,面板上的选择白点。
        warnFailed(await setConfig([['custom-ui-style.background.url', '']]));
        const st = readBeautifyState();
        st.bgMode = 'regions';
        st.animMode = animMode;
        writeBeautifyState(st);
        writeDynamicCss(animMode, 'regions', st);
    } else {
        warnFailed(await setConfig([['custom-ui-style.background.url', '']]));
        const st = readBeautifyState();
        st.bgMode = 'off';
        writeBeautifyState(st);
        writeDynamicCss(animMode, 'off');
    }
    if (!noReload) await reloadCUS();
}

// 存状态 → 重写 CSS → 刷新面板 → 标记待重启。多区域的每次改动都走这里。
function applyRegionState(st, panel) {
    writeBeautifyState(st);
    writeDynamicCss(st.animMode, st.bgMode, st);
    if (panel) panel.webview.postMessage({ type: 'init', state: readState() });
    markRestart(panel);
}

// 按开关同步 cus-custom.css 在 imports 里的登记状态
async function syncCustomCssImport() {
    const cfg = vscode.workspace.getConfiguration();
    const url = toFileUrl(cusCustomCss());
    const imports = (cfg.get('custom-ui-style.external.imports') || []).filter(im => im !== url);
    // 启用时追加到末尾 —— 顺序决定优先级,用户规则要压过我们生成的
    if (isCustomCssEnabled()) imports.push(url);
    await cfg.update('custom-ui-style.external.imports', imports, vscode.ConfigurationTarget.Global);
}

async function doExportConfig() {
    const uri = await vscode.window.showSaveDialog({
        filters: { JSON: ['json'] },
        saveLabel: '导出',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), 'beautify-config.json'))
    });
    if (!uri) return;
    try {
        fs.writeFileSync(uri.fsPath, JSON.stringify(exportConfig(), null, 2));
        vscode.window.showInformationMessage(`已导出到 ${uri.fsPath}`);
    } catch (e) {
        vscode.window.showErrorMessage(`美化控制台: 导出失败 — ${e.message}`);
    }
}

async function doImportConfig(panel) {
    const uri = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { JSON: ['json'] }, openLabel: '导入' });
    if (!uri || !uri[0]) return;
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(uri[0].fsPath, 'utf8'));
    } catch (e) {
        vscode.window.showErrorMessage(`美化控制台: 读取失败 — ${e.message}`);
        return;
    }
    try {
        const r = await importConfig(raw);
        if (panel) panel.webview.postMessage({ type: 'init', state: readState() });
        markRestart(panel);
        // 逐项交代结果 —— 静默丢弃比报错更让人困惑
        const notes = [];
        if (r.missingImages.length) notes.push(`${r.missingImages.length} 张图在本机不存在,已跳过`);
        if (r.rejected.length) notes.push(`${r.rejected.length} 项不合法已丢弃`);
        if (r.failedKeys.length) notes.push(`${r.failedKeys.length} 个设置键写入失败`);
        vscode.window.showInformationMessage(
            '配置已导入' + (notes.length ? `(${notes.join(';')})` : '') + '。重启后生效。');
        if (r.rejected.length) console.warn('[美化控制台] 导入时丢弃:', r.rejected.join(', '));
        if (r.missingImages.length) console.warn('[美化控制台] 缺失图片:', r.missingImages.join(', '));
    } catch (e) {
        vscode.window.showErrorMessage(`美化控制台: 导入失败 — ${e.message}`);
    }
}

// 参数键 → VS Code 设置键 映射(原生即时生效类)
const NATIVE_MAP = {
    fontFamily: 'editor.fontFamily', fontSize: 'editor.fontSize', lineHeight: 'editor.lineHeight',
    fontWeight: 'editor.fontWeight', ligatures: 'editor.fontLigatures',
    statusBar: 'workbench.statusBar.visible', breadcrumbs: 'breadcrumbs.enabled',
    activityBar: 'workbench.activityBar.location', menuBar: 'window.menuBarVisibility',
    tabSizing: 'workbench.editor.tabSizing', cursorSmooth: 'editor.cursorSmoothCaretAnimation',
    smoothScroll: 'editor.smoothScrolling', bracketColor: 'editor.bracketPairColorization.enabled',
    indentGuides: 'editor.guides.indentation', stickyScroll: 'editor.stickyScroll.enabled',
    minimap: 'editor.minimap.enabled',
    colorTheme: 'workbench.colorTheme', iconTheme: 'workbench.iconTheme',
    productIconTheme: 'workbench.productIconTheme'
};

// 标记「待重启」:不立即 reload,通知前端点亮重启条,并弹一次 notification
let pendingRestart = false;
function markRestart(panel) {
    pendingRestart = true;
    if (panel) panel.webview.postMessage({ type: 'pendingRestart' });
    promptRestart();
}
let promptShown = false;
async function promptRestart() {
    if (promptShown) return;
    promptShown = true;
    const pick = await vscode.window.showInformationMessage(
        '美化改动需要重启窗口才能生效', '立即重启', '稍后');
    promptShown = false;
    if (pick === '立即重启') { pendingRestart = false; await reloadCUS(); }
}

async function handleMessage(msg, panel) {
    try {
        if (msg.type === 'setFont') {
            // 选字体名 → 组装带平台兜底链的 fontFamily(编辑器+终端一起)
            const ff = fontStack(msg.value);
            warnFailed(await setConfig([
                ['editor.fontFamily', ff],
                ['terminal.integrated.fontFamily', ff]
            ]));
        } else if (msg.type === 'setNative') {
            const key = NATIVE_MAP[msg.key];
            if (key) { warnFailed(await setConfig([[key, msg.value]])); }
            if (msg.key === 'paddingTop') warnFailed(await setConfig([['editor.padding.top', msg.value], ['editor.padding.bottom', msg.value]]));
            // 原生参数即时生效,无需重启
        } else if (msg.type === 'setAnim') {
            // 动画写进 cus-dynamic.css,背景模式必须原样保持。
            // 这里曾把「非 codeOnly」一律折成 off,于是多区域模式下改一次动画档位
            // 就把所有区域图层抹掉,而状态文件里还记着 regions —— 两边不一致。
            const st = readBeautifyState();
            const bgm = readState().bgMode;
            st.animMode = msg.value;
            writeBeautifyState(st);
            writeDynamicCss(msg.value, bgm, st);
            markRestart(panel);
        } else if (msg.type === 'setBg') {
            await applyBg(msg.value, true);
            panel.webview.postMessage({ type: 'init', state: readState() });  // 刷新滑块范围
            markRestart(panel);
        } else if (msg.type === 'setBgOpacity') {
            const st = readState();
            if (st.bgMode === 'codeOnly') {
                // 仅代码区:写专属 codeOpacity,重写 dynamic css
                warnFailed(await setConfig([['beautify.codeOpacity', msg.value]]));
                writeDynamicCss(st.animMode, 'codeOnly');
            } else if (st.bgMode === 'regions') {
                // 多区域:全窗口的 background.opacity 在这个模式下无效,
                // 这个总滑块改的是各区域的不透明度(区块里还能逐个微调)。
                const bst = readBeautifyState();
                for (const key of REGION_KEYS) bst.regions[key].opacity = msg.value;
                applyRegionState(bst, panel);
                return;
            } else {
                // 全窗口:写 CUS 内建 background.opacity
                warnFailed(await setConfig([['custom-ui-style.background.opacity', msg.value]]));
            }
            markRestart(panel);
        } else if (msg.type === 'pickImage') {
            const uri = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 图片: ['png', 'jpg', 'jpeg', 'webp'] } });
            if (uri && uri[0]) {
                const p = uri[0].fsPath;
                const dest = path.join(getUserDir(), 'backgrounds', safeImageName(path.basename(p)));
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.copyFileSync(p, dest);
                const url = toFileUrl(dest);
                // 只存图,不改模式:保存到独立文件,再按【当前模式】重新应用
                setChosenImage(url);
                const curMode = readState().bgMode;
                // 若当前没开背景(off),选图后默认用全窗口;否则保持当前模式
                await applyBg(curMode === 'off' ? 'full' : curMode, true);
                panel.webview.postMessage({ type: 'init', state: readState() });
                markRestart(panel);
            }
        } else if (msg.type === 'regionAddImage') {
            const uri = await vscode.window.showOpenDialog({
                canSelectMany: true,
                filters: { 图片: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }
            });
            if (uri && uri.length) {
                const st = readBeautifyState();
                const cfg = st.regions[msg.region];
                if (!cfg) throw new Error(`未知区域 ${msg.region}`);
                for (const u of uri) {
                    const dest = path.join(getUserDir(), 'backgrounds', safeImageName(path.basename(u.fsPath)));
                    fs.mkdirSync(path.dirname(dest), { recursive: true });
                    fs.copyFileSync(u.fsPath, dest);
                    if (!cfg.images.includes(dest)) cfg.images.push(dest);
                }
                st.bgMode = 'regions';
                applyRegionState(st, panel);
            }
        } else if (msg.type === 'regionClear') {
            const st = readBeautifyState();
            if (st.regions[msg.region]) st.regions[msg.region].images = [];
            applyRegionState(st, panel);
        } else if (msg.type === 'regionOpacity') {
            const st = readBeautifyState();
            if (st.regions[msg.region]) st.regions[msg.region].opacity = msg.value;
            applyRegionState(st, panel);
        } else if (msg.type === 'regionInterval') {
            const st = readBeautifyState();
            if (st.regions[msg.region]) st.regions[msg.region].intervalMs = msg.value;
            applyRegionState(st, panel);
        } else if (msg.type === 'setInlineImages') {
            const st = readBeautifyState();
            st.inlineImages = !!msg.value;
            applyRegionState(st, panel);
        } else if (msg.type === 'setCustomCssEnabled') {
            warnFailed(await setConfig([['beautify.customCss.enabled', !!msg.value]]));
            // 开关改的是 imports 里有没有这一条,所以要重登记
            await syncCustomCssImport();
            panel.webview.postMessage({ type: 'init', state: readState() });
            markRestart(panel);
        } else if (msg.type === 'openCustomCss') {
            await openCustomCss();
        } else if (msg.type === 'exportConfig') {
            await doExportConfig();
        } else if (msg.type === 'importConfig') {
            await doImportConfig(panel);
        } else if (msg.type === 'setRadius') {
            if (setRadius(msg.value)) markRestart(panel);
        } else if (msg.type === 'reload' || msg.type === 'doRestart') {
            pendingRestart = false;
            await reloadCUS();
        } else if (msg.type === 'restore') {
            await restoreDefaults(panel);
            panel.webview.postMessage({ type: 'init', state: readState() });
        } else if (msg.type === 'refresh') {
            panel.webview.postMessage({ type: 'init', state: readState() });
        }
    } catch (e) {
        vscode.window.showErrorMessage('美化控制台: ' + e.message);
    }
}

// 恢复默认 —— 复位到我们这套 JetBrains 配置(固定快照)
async function restoreDefaults(panel) {
    const failed = await setConfig([
        ['editor.fontFamily', fontStack('JetBrains Mono')],
        ['editor.fontSize', 14],
        ['editor.lineHeight', 1.6],
        ['editor.fontWeight', '400'],
        ['editor.fontLigatures', true],
        ['workbench.statusBar.visible', true],
        ['breadcrumbs.enabled', true],
        ['workbench.activityBar.location', 'top'],
        ['window.menuBarVisibility', 'compact'],
        ['workbench.editor.tabSizing', 'shrink'],
        ['editor.cursorSmoothCaretAnimation', 'on'],
        ['editor.smoothScrolling', true],
        ['editor.bracketPairColorization.enabled', true],
        ['editor.guides.indentation', true],
        ['editor.stickyScroll.enabled', true],
        ['editor.minimap.enabled', true],
        ['editor.padding.top', 10],
        ['editor.padding.bottom', 10],
        ['workbench.colorTheme', 'Int UI Dark'],
        ['workbench.iconTheme', 'int-ui-icons-dark'],
        ['workbench.productIconTheme', 'jetbrains-product-icon-theme']
    ]);
    // 圆角复位、不透明度复位
    failed.push(...await setConfig([['custom-ui-style.background.opacity', 0.92]]));
    setRadius(8);
    // 恢复默认 = 干净 JetBrains 外观:动画回 default 档,背景图关闭
    failed.push(...await setConfig([['custom-ui-style.background.url', '']]));
    failed.push(...await setConfig([['custom-ui-style.stylesheet', {}]]));  // 清空失效的旧设置残留
    // 状态文件也要复位 —— 只写 CSS 的话,状态里仍记着 regions 和各区域图片列表,
    // 与「已移除背景图」的提示不符,下次切回多区域旧图会自己冒出来。
    writeBeautifyState(defaultState());
    writeDynamicCss('default', 'off');
    pendingRestart = false;
    await reloadCUS();
    // 有键没写进去就别报「已恢复默认」
    if (failed.length) warnFailed(failed);
    else vscode.window.showInformationMessage('已恢复默认 JetBrains 外观(已移除背景图)。');
}

function deactivate() {}
module.exports = {
    activate, deactivate,
    // 下列导出供 test/ 下的跨平台用例调用
    defaultUserDir, resolveUserDir, getUserDir, cusBaseCss, cusDynamicCss,
    toFileUrl, fromFileUrl, isStaleManagedImport, MANAGED_CSS_NAMES,
    fontDirs, fallbackFonts, fontStack, listFonts, currentFontName,
    setConfig, applicable, platformSkipKeys, warnFailed,
    // 多区域背景 / 轮播
    REGIONS, REGION_KEYS, VSCODE_FILE_EXTS, toWorkbenchUrl, canUseWorkbenchUrl,
    imageCssUrl, carouselKeyframes, regionCss, writeDynamicCss, cusCustomCss, safeImageName,
    isCustomCssEnabled, panicDisableCustomCss, applyBg, readState, handleMessage, restoreDefaults,
    // 状态
    STATE_VERSION, stateFile, defaultState, sanitizeState, readBeautifyState, writeBeautifyState,
    migrateLegacyState, ANIM_MODES, BG_MODES,
    // 导出/导入
    EXPORT_KIND, EXPORTED_SETTINGS, EXPORTED_SETTINGS_TYPES, settingTypeOk, exportConfig, importConfig,
    getRadius, setRadius
};

function getHtml() {
    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https: file: vscode-resource:; script-src 'unsafe-inline';">
<style>
:root {
    --bg: #1e1f22; --panel: #2b2d30; --fg: #bcbec4; --muted: #8a8e96;
    --blue: #3574f0; --border: #393b40; --radius: 8px;
}
* { box-sizing: border-box; }
body {
    background: var(--bg); color: var(--fg); margin: 0; padding: 0;
    font-family: 'JetBrains Mono', -apple-system, sans-serif; font-size: 13px;
}
.header {
    position: sticky; top: 0; background: var(--panel); padding: 14px 20px;
    border-bottom: 1px solid var(--border); display: flex; align-items: center;
    justify-content: space-between; z-index: 10;
}
.header h1 { font-size: 16px; margin: 0; font-weight: 600; }
.header .actions button { margin-left: 8px; }
.wrap { padding: 16px 20px 40px; max-width: 720px; }
.section {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: var(--radius); margin-bottom: 14px; overflow: visible;
}
.section h2 {
    font-size: 13px; margin: 0; padding: 10px 14px; background: #26282e;
    color: var(--muted); font-weight: 600; letter-spacing: .5px;
    border-radius: var(--radius) var(--radius) 0 0;
}
.row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 14px; border-top: 1px solid var(--border); gap: 12px;
}
.row:first-of-type { border-top: none; }
.row label { flex: 0 0 auto; }
.row .ctrl { flex: 1 1 auto; display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
/* JetBrains 风格输入框 */
input[type=text] {
    background: #1e1f22; color: var(--fg); border: 1px solid #4e5157;
    border-radius: 4px; padding: 5px 9px; font-family: inherit; font-size: 12px; min-width: 150px;
}
/* JetBrains 风格下拉框(自绘箭头,SVG 完整 URL 编码) */
select {
    -webkit-appearance: none; -moz-appearance: none; appearance: none;
    background-color: #1e1f22; color: #bcbec4; border: 1px solid #4e5157;
    border-radius: 4px; padding: 5px 28px 5px 9px; font-family: inherit; font-size: 12px; min-width: 160px;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='10'%20height='6'%20viewBox='0%200%2010%206'%3E%3Cpath%20d='M1%201l4%204%204-4'%20stroke='%238a8e96'%20stroke-width='1.4'%20fill='none'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 10px center;
}
select:hover { border-color: #6f737a; }
select:focus { border-color: var(--blue); outline: none; }
option { background-color: #2b2d30; color: #bcbec4; }
/* JetBrains 风格滑条 */
input[type=range] {
    -webkit-appearance: none; appearance: none; width: 170px; height: 4px;
    background: #4e5157; border-radius: 2px; cursor: pointer;
}
input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; width: 14px; height: 14px;
    border-radius: 50%; background: var(--blue); border: 2px solid #1e1f22;
    box-shadow: 0 0 0 1px var(--blue);
}
.val { color: var(--blue); min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
button {
    background: var(--blue); color: #fff; border: none; border-radius: 6px;
    padding: 6px 14px; cursor: pointer; font-family: inherit; font-size: 12px;
}
button.ghost { background: transparent; border: 1px solid var(--border); color: var(--fg); }
button:hover { filter: brightness(1.1); }
.seg { display: flex; gap: 0; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.seg button { background: var(--bg); color: var(--fg); border-radius: 0; border-right: 1px solid var(--border); padding: 5px 12px; }
.seg button:last-child { border-right: none; }
.seg button.on { background: var(--blue); color: #fff; }
.switch { position: relative; width: 38px; height: 20px; }
.switch input { display: none; }
.slider-sw {
    position: absolute; inset: 0; background: var(--border); border-radius: 20px;
    cursor: pointer; transition: background .2s;
}
.slider-sw:before {
    content: ''; position: absolute; width: 16px; height: 16px; left: 2px; top: 2px;
    background: #fff; border-radius: 50%; transition: transform .2s;
}
input:checked + .slider-sw { background: var(--blue); }
input:checked + .slider-sw:before { transform: translateX(18px); }
.hint { color: var(--muted); font-size: 11px; padding: 2px 14px 10px; }

/* —— 面板入场动画 —— */
@keyframes secIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.section { animation: secIn .38s cubic-bezier(0.22,0.61,0.36,1) backwards; position: relative; }
/* 含 hover 问号的区块提到最上层,tooltip 不被后面区块盖住 */
.section:hover { z-index: 50; }
.section:nth-child(1){animation-delay:.03s}
.section:nth-child(2){animation-delay:.08s}
.section:nth-child(3){animation-delay:.13s}
.section:nth-child(4){animation-delay:.18s}
.section:nth-child(5){animation-delay:.23s}
.section:nth-child(6){animation-delay:.28s}
.header h1 { animation: secIn .5s ease both; }

/* —— 控件交互动画 —— */
.row { transition: background-color .16s ease; }
.row:hover { background-color: rgba(255,255,255,0.03); }
button { transition: filter .15s ease, transform .1s ease, background-color .16s ease; }
button:active { transform: scale(0.96); }
.seg button { transition: background-color .18s ease, color .18s ease; }
select, input[type=text] { transition: border-color .16s ease, box-shadow .16s ease; }
select:focus, input[type=text]:focus { border-color: var(--blue); box-shadow: 0 0 0 2px rgba(53,116,240,0.25); outline: none; }
.slider-sw, .slider-sw:before { transition: background .22s ease, transform .22s cubic-bezier(0.34,1.56,0.64,1); }
input[type=range]::-webkit-slider-thumb { transition: transform .12s ease; }
input[type=range]:active::-webkit-slider-thumb { transform: scale(1.25); }

/* 需重载标记 */
.badge { font-size: 10px; color: var(--blue); border: 1px solid var(--blue); border-radius: 4px; padding: 1px 5px; margin-left: 6px; opacity: .8; }
.toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(20px);
    background: var(--blue); color: #fff; padding: 8px 18px; border-radius: 8px;
    opacity: 0; transition: opacity .25s, transform .25s; pointer-events: none; z-index: 100;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* 待重启横幅 */
.restart-bar {
    position: sticky; top: 52px; z-index: 9;
    display: none; align-items: center; justify-content: space-between;
    background: #3574f022; border: 1px solid var(--blue); border-radius: 8px;
    margin: 12px 20px 0; padding: 8px 14px; animation: secIn .3s ease;
}
.restart-bar.show { display: flex; }
.restart-bar span { color: #cdd3e0; font-size: 12px; }

/* —— 问号 tooltip —— */
.q {
    display: inline-flex; align-items: center; justify-content: center;
    width: 15px; height: 15px; margin-left: 6px; border-radius: 50%;
    border: 1px solid var(--muted); color: var(--muted);
    font-size: 10px; line-height: 1; cursor: help; user-select: none;
    vertical-align: middle; position: relative;
    transition: transform .18s cubic-bezier(0.34,1.56,0.64,1), color .18s ease, border-color .18s ease;
}
.q:hover, .q:focus { transform: scale(1.2); color: #fff; border-color: var(--blue); background: var(--blue); outline: none; }
.q::after {
    content: attr(data-tip);
    /* 往右侧空白区展开,垂直居中于问号,不盖住下面的行、也不挡右侧控件 */
    position: absolute; left: calc(100% + 10px); top: 50%; z-index: 500;
    width: 250px; max-width: 250px; white-space: normal; text-align: left; word-break: break-word;
    background: #2b2d30; color: #cdd3e0; border: 1px solid #4e5157;
    border-radius: 8px; padding: 9px 12px; font-size: 11.5px; line-height: 1.7;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    opacity: 0; transform: translateY(-50%) translateX(-4px); pointer-events: none;
    transition: opacity .18s ease, transform .18s cubic-bezier(0.22,0.61,0.36,1);
}
.q:hover::after, .q:focus::after { opacity: 1; transform: translateY(-50%) translateX(0); }
.row label { display: inline-flex; align-items: center; }
</style>
</head>
<body>
<div class="header">
    <h1>🎨 美化控制台 <span style="font-size:11px;color:var(--muted);font-weight:400">v14</span></h1>
    <div class="actions">
        <button class="ghost" id="btnRestore">恢复默认</button>
        <button class="ghost" id="btnRefresh">刷新</button>
        <button id="btnReload">应用并重载</button>
    </div>
</div>
<div class="restart-bar" id="restartBar">
    <span>⚡ 有改动需要重启窗口才能生效</span>
    <button id="btnDoRestart">立即重启</button>
</div>
<div class="wrap">

    <div class="section">
        <h2>字体</h2>
        <div class="row"><label>代码字体<span class="q" tabindex="0" data-tip="写代码时字的样子。等宽字体每个字符宽度一样,代码更整齐。带 ✓ 的是你电脑已经装好的字体。">?</span></label><div class="ctrl"><select id="fontName"></select></div></div>
        <div class="row"><label>字号<span class="q" tabindex="0" data-tip="字的大小,单位像素(px)。看久了眼睛累就调大一点。">?</span></label><div class="ctrl"><input type="range" id="fontSize" min="10" max="24" step="1"><span class="val" id="fontSizeV"></span></div></div>
        <div class="row"><label>行高<span class="q" tabindex="0" data-tip="每一行之间的上下间距。数值大一点行与行更透气、不拥挤。">?</span></label><div class="ctrl"><input type="range" id="lineHeight" min="1" max="2.4" step="0.1"><span class="val" id="lineHeightV"></span></div></div>
        <div class="row"><label>字重<span class="q" tabindex="0" data-tip="字的粗细。400 是正常,600 偏粗。数字越大越粗。">?</span></label><div class="ctrl"><select id="fontWeight"><option>300</option><option>400</option><option>500</option><option>600</option></select></div></div>
        <div class="row"><label>连字 (ligatures)<span class="q" tabindex="0" data-tip="把 => != === 这类符号显示成更好看的合并样式。纯粹是视觉美化,不改变代码本身。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="ligatures"><span class="slider-sw"></span></label></div></div>
    </div>

    <div class="section">
        <h2>布局</h2>
        <div class="row"><label>状态栏<span class="q" tabindex="0" data-tip="窗口最底部那条信息栏,显示 Git 分支、光标行列、文件编码等。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="statusBar"><span class="slider-sw"></span></label></div></div>
        <div class="row"><label>面包屑导航<span class="q" tabindex="0" data-tip="编辑器顶部显示当前文件的路径层级(如 src > main > App.java),点它能快速跳转。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="breadcrumbs"><span class="slider-sw"></span></label></div></div>
        <div class="row"><label>活动栏位置<span class="q" tabindex="0" data-tip="最左边那排大图标(资源管理器/搜索/Git)放在哪。放顶部更接近 IntelliJ 的样子。">?</span></label><div class="ctrl"><select id="activityBar"><option value="top">顶部</option><option value="default">默认(左侧)</option><option value="bottom">底部</option><option value="hidden">隐藏</option></select></div></div>
        <div class="row" id="rowMenuBar"><label>菜单栏<span class="q" tabindex="0" data-tip="文件/编辑/查看那一排菜单。紧凑=收成一个汉堡按钮,更省空间。">?</span></label><div class="ctrl"><select id="menuBar"><option value="compact">紧凑(汉堡)</option><option value="visible">显示</option><option value="hidden">隐藏</option></select></div></div>
        <div class="row"><label>标签页缩放<span class="q" tabindex="0" data-tip="打开很多文件时,顶部一排标签怎么排。收缩=自动变窄尽量都塞下。">?</span></label><div class="ctrl"><select id="tabSizing"><option value="fit">适应</option><option value="shrink">收缩</option><option value="fixed">固定</option></select></div></div>
    </div>

    <div class="section">
        <h2>编辑器</h2>
        <div class="row"><label>光标平滑动画<span class="q" tabindex="0" data-tip="光标移动时平滑滑过去,而不是瞬间跳到新位置。">?</span></label><div class="ctrl"><select id="cursorSmooth"><option value="on">开</option><option value="off">关</option></select></div></div>
        <div class="row"><label>平滑滚动<span class="q" tabindex="0" data-tip="滚动页面时带一点缓冲惯性,不是生硬地一格一格跳。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="smoothScroll"><span class="slider-sw"></span></label></div></div>
        <div class="row"><label>括号配对染色<span class="q" tabindex="0" data-tip="把成对的括号 ( ) { } [ ] 用不同颜色区分,一眼看清嵌套层级。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="bracketColor"><span class="slider-sw"></span></label></div></div>
        <div class="row"><label>缩进参考线<span class="q" tabindex="0" data-tip="每一层缩进画一条淡淡的竖线,方便看清代码块的层级。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="indentGuides"><span class="slider-sw"></span></label></div></div>
        <div class="row"><label>粘性滚动<span class="q" tabindex="0" data-tip="往下滚代码时,当前所在的函数名/类名会固定贴在编辑器顶部,不会滚没看不见。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="stickyScroll"><span class="slider-sw"></span></label></div></div>
        <div class="row"><label>缩略图 (minimap)<span class="q" tabindex="0" data-tip="编辑器右侧那条代码全景小图,拖动它能快速跳到文件任意位置。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="minimap"><span class="slider-sw"></span></label></div></div>
        <div class="row"><label>上下内边距<span class="q" tabindex="0" data-tip="代码区顶部和底部留的空白,单位像素。大一点更透气。">?</span></label><div class="ctrl"><input type="range" id="paddingTop" min="0" max="30" step="2"><span class="val" id="paddingTopV"></span></div></div>
    </div>

    <div class="section">
        <h2>动画 <span class="badge">需重载</span></h2>
        <div class="row"><label>动画档位<span class="q" tabindex="0" data-tip="界面里各种弹窗/菜单/切换的动画风格。默认=淡入,平滑=只有过渡不花哨,弹跳=带回弹,华丽=翻转缩放最丰富,关闭=无动画。越往右越花哨。">?</span></label><div class="ctrl"><div class="seg" id="animSeg">
            <button data-v="default">默认</button><button data-v="smooth">平滑</button><button data-v="bounce">弹跳</button><button data-v="fancy">华丽</button><button data-v="off">关闭</button>
        </div></div></div>
        <div class="hint">默认=淡入 · 平滑=仅过渡 · 弹跳=回弹 · 华丽=翻转缩放 · 改动画会重载窗口</div>
    </div>

    <div class="section">
        <h2>背景图 <span class="badge">需重载</span></h2>
        <div class="row"><label>模式<span class="q" tabindex="0" data-tip="背景图铺在哪:全窗口=整个界面都铺 / 仅代码区=只在编辑代码的区域 / 关闭=不要背景图。">?</span></label><div class="ctrl"><div class="seg" id="bgSeg">
            <button data-v="full">全窗口</button><button data-v="codeOnly">仅代码区</button><button data-v="regions">多区域</button><button data-v="off">关闭</button>
        </div></div></div>
        <div class="row"><label>图片<span class="q" tabindex="0" data-tip="选一张图片当背景。选好后会自动复制到安全位置,不怕原图被移动或删除。">?</span></label><div class="ctrl"><button class="ghost" id="btnPick">选择图片…</button></div></div>
        <div class="row"><label>不透明度<span class="q" tabindex="0" data-tip="背景图的浓淡程度。数值越小图越淡、代码越清晰;越大图越明显。">?</span></label><div class="ctrl"><input type="range" id="bgOpacity" min="0.7" max="1" step="0.01"><span class="val" id="bgOpacityV"></span></div></div>
        <div class="hint">改背景会重载窗口</div>
    </div>

    <div class="section" id="secRegions">
        <h2>多区域背景 <span class="badge">需重载</span></h2>
        <div class="hint">编辑器 / 侧栏 / 面板可各设一张或多张图。多张图会按间隔淡入淡出轮播。</div>
        <div id="regionRows"></div>
        <div class="row"><label>图片引用方式<span class="q" tabindex="0" data-tip="直接引用=CSS 里只写路径,文件小、加载快(推荐)。内嵌=把图片转成 base64 塞进 CSS,文件会大几十倍,只在直接引用不显示时才用。">?</span></label><div class="ctrl"><div class="seg" id="inlineSeg">
            <button data-v="url">直接引用</button><button data-v="inline">内嵌 base64</button>
        </div></div></div>
    </div>

    <div class="section">
        <h2>自定义 CSS <span class="badge">需重载</span></h2>
        <div class="row"><label>启用<span class="q" tabindex="0" data-tip="是否把你写的 CSS 注入界面。写坏了可以关掉,文件内容不会丢。">?</span></label><div class="ctrl"><label class="switch"><input type="checkbox" id="customCssOn"><span class="slider-sw"></span></label></div></div>
        <div class="row"><label>编辑<span class="q" tabindex="0" data-tip="在编辑器里打开 cus-custom.css。本插件只创建它,永不覆盖你写的内容。">?</span></label><div class="ctrl"><button class="ghost" id="btnEditCss">打开 cus-custom.css</button></div></div>
        <div class="hint" id="panicHint">⚠️ 自定义 CSS 能把整个界面弄不可见（连命令面板也会一起藏掉）。此时按 <b id="panicKey">Cmd+Alt+Shift+F12</b> 可一键关闭它恢复界面 —— 键绑定不依赖界面可见,所以在全黑时依然有效。</div>
    </div>

    <div class="section">
        <h2>配置导入导出</h2>
        <div class="row"><label>导出<span class="q" tabindex="0" data-tip="把整套美化配置存成一个 JSON 文件,可以分享或备份。图片按路径引用,不会把图片本身塞进去。">?</span></label><div class="ctrl"><button class="ghost" id="btnExport">导出配置…</button></div></div>
        <div class="row"><label>导入<span class="q" tabindex="0" data-tip="读入一个导出过的 JSON。所有值都会先校验,非法项会被丢弃并告诉你。你现有的自定义 CSS 会先备份成 .bak。">?</span></label><div class="ctrl"><button class="ghost" id="btnImport">导入配置…</button></div></div>
        <div class="hint">导入的图片路径若在本机不存在,会被跳过并列出来。</div>
    </div>

    <div class="section">
        <h2>颜色主题</h2>
        <div class="row"><label>配色主题<span class="q" tabindex="0" data-tip="整体的颜色方案(代码高亮+界面色)。Int UI Dark 就是 JetBrains 的深色主题。">?</span></label><div class="ctrl"><select id="colorTheme"></select></div></div>
        <div class="row"><label>文件图标<span class="q" tabindex="0" data-tip="文件树里每个文件/文件夹前面那个小图标的风格。">?</span></label><div class="ctrl"><select id="iconTheme"></select></div></div>
        <div class="row"><label>产品图标<span class="q" tabindex="0" data-tip="界面功能按钮(设置齿轮/搜索/源代码管理等)的图标风格。">?</span></label><div class="ctrl"><select id="productIconTheme"></select></div></div>
        <div class="row"><label>圆角大小<span class="q" tabindex="0" data-tip="标签页/面板/按钮的边角圆润程度,单位像素。0=直角,越大越圆。">?</span></label><div class="ctrl"><input type="range" id="radius" min="0" max="16" step="1"><span class="val" id="radiusV"></span></div></div>
        <div class="hint">改圆角会重载窗口</div>
    </div>

</div>
<div class="toast" id="toast">已应用</div>
<script>const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
let toastT;
function showToast(txt){
    const t = $('toast'); t.textContent = txt || '已应用'; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(()=> t.classList.remove('show'), 900);
}
function post(m){ vscode.postMessage(m); if(m.type==='setNative'||m.type==='setFont') showToast('已实时应用'); }
function fillSelect(el, items, cur){
    el.innerHTML='';
    (items||[]).forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; if(v===cur)o.selected=true; el.appendChild(o); });
}
function setSeg(segId, val){
    document.querySelectorAll('#'+segId+' button').forEach(b=>b.classList.toggle('on', b.dataset.v===val));
}

let S = vscode.getState() || {};   // 切回来时用缓存的状态,避免空白
window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'init') { S = m.state; vscode.setState(S); render(); $('restartBar').classList.remove('show'); }
    else if (m.type === 'pendingRestart') { $('restartBar').classList.add('show'); }
});
// 面板加载/切回可见时,主动向后端要一次最新状态
window.addEventListener('load', ()=> vscode.postMessage({type:'refresh'}));
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) vscode.postMessage({type:'refresh'}); });
// 先用缓存渲染一次(即使还没收到 init 也不空白)
if (S && S.fonts) render();

function render(){
    // 字体下拉:已装的标 ✓,未装的标(未安装)
    const fsel = $('fontName'); fsel.innerHTML='';
    // macOS 的菜单栏在系统顶栏,window.menuBarVisibility 无效,整行隐藏
    const rowMenuBar = $('rowMenuBar');
    if (rowMenuBar) rowMenuBar.style.display = (S.platform === 'darwin') ? 'none' : '';
    let fonts = S.fonts;
    // 兜底:若后端没返回字体列表,至少给一组当前平台常见的字体,避免空白
    if (!fonts || !fonts.length) {
        const common = S.platform === 'darwin'
            ? ['JetBrains Mono','Fira Code','SF Mono','Menlo','Monaco','Courier New']
            : S.platform === 'win32'
            ? ['JetBrains Mono','Fira Code','Cascadia Code','Consolas','Source Code Pro','Courier New']
            : ['JetBrains Mono','Fira Code','Source Code Pro','DejaVu Sans Mono','Liberation Mono','Noto Sans Mono'];
        fonts = common.map(n => ({ name: n, installed: false }));
    }
    fonts.forEach(f=>{
        const o=document.createElement('option'); o.value=f.name;
        o.textContent = f.name + (f.installed ? '  ✓' : '');
        if(f.name===(S.fontName||'JetBrains Mono')) o.selected=true;
        fsel.appendChild(o);
    });
    $('fontSize').value = S.fontSize || 14; $('fontSizeV').textContent = S.fontSize || 14;
    $('lineHeight').value = S.lineHeight || 1.6; $('lineHeightV').textContent = (S.lineHeight||1.6);
    $('fontWeight').value = String(S.fontWeight || '400');
    $('ligatures').checked = !!S.ligatures;
    $('statusBar').checked = S.statusBar !== false;
    $('breadcrumbs').checked = !!S.breadcrumbs;
    $('activityBar').value = S.activityBar || 'top';
    $('menuBar').value = S.menuBar || 'compact';
    $('tabSizing').value = S.tabSizing || 'shrink';
    $('cursorSmooth').value = S.cursorSmooth || 'on';
    $('smoothScroll').checked = !!S.smoothScroll;
    $('bracketColor').checked = !!S.bracketColor;
    $('indentGuides').checked = !!S.indentGuides;
    $('stickyScroll').checked = !!S.stickyScroll;
    $('minimap').checked = !!S.minimap;
    $('paddingTop').value = S.paddingTop || 10; $('paddingTopV').textContent = (S.paddingTop||10);
    setSeg('animSeg', S.animMode || 'off');
    setSeg('bgSeg', S.bgMode || 'off');
    // 不透明度滑块:按模式切换范围(仅代码区 0.05~0.6 更淡,全窗口 0.7~1)
    const opEl = $('bgOpacity');
    if (S.lowOpacityMode) { opEl.min = '0.03'; opEl.max = '0.8'; opEl.step = '0.01'; }
    else { opEl.min = '0.7'; opEl.max = '1'; opEl.step = '0.01'; }
    const defOp = S.lowOpacityMode ? 0.22 : 0.92;
    opEl.value = (typeof S.bgOpacity === 'number' ? S.bgOpacity : defOp);
    $('bgOpacityV').textContent = opEl.value;
    fillSelect($('colorTheme'), S.themes, S.colorTheme);
    fillSelect($('iconTheme'), S.iconThemes, S.iconTheme);
    fillSelect($('productIconTheme'), S.productThemes, S.productIconTheme);
    $('radius').value = S.radius || 8; $('radiusV').textContent = (S.radius || 8);
    renderRegions();
    // 多区域区块只在该模式下才有意义
    $('secRegions').style.display = (S.bgMode === 'regions') ? '' : 'none';
    setSeg('inlineSeg', S.inlineImages ? 'inline' : 'url');
    $('customCssOn').checked = S.customCssEnabled !== false;
    $('panicKey').textContent = (S.platform === 'darwin' ? 'Cmd' : 'Ctrl') + '+Alt+Shift+F12';
}

// 每个区域一行:图片数量 / 添加 / 清空 / 不透明度 / 轮播间隔
function renderRegions(){
    const wrap = $('regionRows');
    if (!wrap) return;
    const regions = S.regions || {};
    wrap.innerHTML = '';
    (S.regionMeta || []).forEach(meta => {
        const cfg = regions[meta.key] || { images: [], opacity: meta.defaultOpacity, intervalMs: 8000, blend: true };
        const n = (cfg.images || []).length;
        const row = document.createElement('div');
        row.className = 'row';
        const desc = n === 0 ? '未设置' : (n === 1 ? '1 张' : n + ' 张 · 轮播');
        row.innerHTML =
            '<label>' + meta.label + ' <span style="color:var(--muted);font-size:11px">' + desc + '</span></label>' +
            '<div class="ctrl">' +
            '<input type="range" min="0.03" max="0.8" step="0.01" data-op="' + meta.key + '" value="' + cfg.opacity + '">' +
            '<span class="val" data-opv="' + meta.key + '">' + cfg.opacity + '</span>' +
            '<button class="ghost" data-add="' + meta.key + '">添加图片…</button>' +
            '<button class="ghost" data-clear="' + meta.key + '"' + (n ? '' : ' disabled') + '>清空</button>' +
            '</div>';
        wrap.appendChild(row);
        // 两张图以上才显示间隔滑块 —— 单图没有轮播可言
        if (n > 1) {
            const ir = document.createElement('div');
            ir.className = 'row';
            const secs = Math.round((cfg.intervalMs || 8000) / 1000);
            ir.innerHTML =
                '<label style="padding-left:14px;color:var(--muted)">↳ 每张停留</label>' +
                '<div class="ctrl"><input type="range" min="2" max="120" step="1" data-iv="' + meta.key + '" value="' + secs + '">' +
                '<span class="val" data-ivv="' + meta.key + '">' + secs + 's</span></div>';
            wrap.appendChild(ir);
        }
    });
    wrap.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () =>
        post({ type: 'regionAddImage', region: b.dataset.add })));
    wrap.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () =>
        post({ type: 'regionClear', region: b.dataset.clear })));
    wrap.querySelectorAll('[data-op]').forEach(el => {
        const lbl = wrap.querySelector('[data-opv="' + el.dataset.op + '"]');
        el.addEventListener('input', () => { lbl.textContent = el.value; });
        el.addEventListener('change', () => post({ type: 'regionOpacity', region: el.dataset.op, value: parseFloat(el.value) }));
    });
    wrap.querySelectorAll('[data-iv]').forEach(el => {
        const lbl = wrap.querySelector('[data-ivv="' + el.dataset.iv + '"]');
        el.addEventListener('input', () => { lbl.textContent = el.value + 's'; });
        el.addEventListener('change', () => post({ type: 'regionInterval', region: el.dataset.iv, value: parseInt(el.value, 10) * 1000 }));
    });
}
// —— 原生即时生效类 ——
function bindNative(id, key, ev){
    const el = $(id);
    el.addEventListener(ev || 'change', () => {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else v = el.value;
        // 数值类转换
        if (id === 'fontSize' || id === 'paddingTop') v = parseInt(v, 10);
        if (id === 'lineHeight') v = parseFloat(v);
        post({ type:'setNative', key, value: v });
    });
}
$('fontName').addEventListener('change', ()=>{ post({type:'setFont', value: $('fontName').value}); });
bindNative('fontWeight','fontWeight');
bindNative('ligatures','ligatures');
bindNative('statusBar','statusBar');
bindNative('breadcrumbs','breadcrumbs');
bindNative('activityBar','activityBar');
bindNative('menuBar','menuBar');
bindNative('tabSizing','tabSizing');
bindNative('cursorSmooth','cursorSmooth');
bindNative('smoothScroll','smoothScroll');
bindNative('bracketColor','bracketColor');
bindNative('indentGuides','indentGuides');
bindNative('stickyScroll','stickyScroll');
bindNative('minimap','minimap');
bindNative('colorTheme','colorTheme');
bindNative('iconTheme','iconTheme');
bindNative('productIconTheme','productIconTheme');

// debounce 工具:拖动时高频事件,120ms 内合并,实现"实时但不刷爆"
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

// —— 原生滑块:拖动实时生效(数字即时更新 + debounce 应用) ——
function liveSlider(id, key, parse){
    const el = $(id), lbl = $(id+'V');
    const send = debounce(v => post({type:'setNative', key, value: v}), 120);
    el.addEventListener('input', ()=>{
        const raw = parse(el.value);
        lbl.textContent = el.value;
        send(raw);
    });
}
liveSlider('fontSize','fontSize', v=>parseInt(v,10));
liveSlider('lineHeight','lineHeight', v=>parseFloat(v));
liveSlider('paddingTop','paddingTop', v=>parseInt(v,10));

// —— 需重载类:数字实时更新,但松手(change)才应用+重载(避免拖动中反复重载) ——
$('bgOpacity').addEventListener('input', ()=> $('bgOpacityV').textContent = $('bgOpacity').value);
$('radius').addEventListener('input', ()=> $('radiusV').textContent = $('radius').value);
$('bgOpacity').addEventListener('change', ()=> post({type:'setBgOpacity', value: parseFloat($('bgOpacity').value)}));
$('radius').addEventListener('change', ()=> post({type:'setRadius', value: parseInt($('radius').value,10)}));

document.querySelectorAll('#animSeg button').forEach(b=>b.addEventListener('click',()=>{
    setSeg('animSeg', b.dataset.v); post({type:'setAnim', value:b.dataset.v});
}));
document.querySelectorAll('#bgSeg button').forEach(b=>b.addEventListener('click',()=>{
    setSeg('bgSeg', b.dataset.v); post({type:'setBg', value:b.dataset.v});
}));

$('btnPick').addEventListener('click', ()=> post({type:'pickImage'}));
$('btnReload').addEventListener('click', ()=> post({type:'reload'}));
$('btnRefresh').addEventListener('click', ()=> post({type:'refresh'}));
$('btnRestore').addEventListener('click', ()=>{ vscode.postMessage({type:'restore'}); showToast('正在恢复默认…'); });
$('btnDoRestart').addEventListener('click', ()=>{ vscode.postMessage({type:'doRestart'}); });
document.querySelectorAll('#inlineSeg button').forEach(b=>b.addEventListener('click',()=>{
    setSeg('inlineSeg', b.dataset.v); post({type:'setInlineImages', value: b.dataset.v === 'inline'});
}));
$('customCssOn').addEventListener('change', ()=> post({type:'setCustomCssEnabled', value: $('customCssOn').checked}));
$('btnEditCss').addEventListener('click', ()=> vscode.postMessage({type:'openCustomCss'}));
$('btnExport').addEventListener('click', ()=>{ vscode.postMessage({type:'exportConfig'}); showToast('正在导出…'); });
$('btnImport').addEventListener('click', ()=> vscode.postMessage({type:'importConfig'}));</script>
</body>
</html>`;
}




