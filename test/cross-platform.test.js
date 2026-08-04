// 跨平台路径 / 字体 / 导入清理 用例
// 跑法: npm test  (等价于 node --test test/)
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

// 把 require('vscode') 重定向到桩,必须在 require extension.js 之前装好
const stubPath = require.resolve('./vscode-stub.js');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request === 'vscode') return stubPath;
    return originalResolve.call(this, request, ...rest);
};

const ext = require('../extension.js');

// 临时切换 process.platform 跑断言
function onPlatform(name, fn) {
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: name, configurable: true });
    try { fn(); } finally { Object.defineProperty(process, 'platform', original); }
}

test('defaultUserDir 在各平台指向该平台真实的 User 目录', () => {
    onPlatform('darwin', () => {
        assert.strictEqual(ext.defaultUserDir(), path.join(os.homedir(), 'Library/Application Support/Code/User'));
    });
    onPlatform('win32', () => {
        assert.match(ext.defaultUserDir().replace(/\\/g, '/'), /Code\/User$/);
        assert.match(ext.defaultUserDir(), /Roaming|AppData/);
    });
    onPlatform('linux', () => {
        assert.match(ext.defaultUserDir().replace(/\\/g, '/'), /Code\/User$/);
    });
});

test('defaultUserDir 不再把 Windows AppData 路径用在 macOS 上', () => {
    onPlatform('darwin', () => {
        assert.ok(!ext.defaultUserDir().includes('AppData'),
            'macOS 的用户目录不应包含 AppData');
    });
});

test('resolveUserDir 从 globalStorageUri 反推 User 目录', () => {
    const userDir = path.join(os.homedir(), 'Library/Application Support/Code/User');
    const ctx = { globalStorageUri: { fsPath: path.join(userDir, 'globalStorage', 'dwgx.beautify-console') } };
    assert.strictEqual(ext.resolveUserDir(ctx), userDir);
    assert.strictEqual(ext.cusBaseCss(), path.join(userDir, 'cus-base.css'));
    assert.strictEqual(ext.cusDynamicCss(), path.join(userDir, 'cus-dynamic.css'));
});

test('resolveUserDir 在 globalStorageUri 形状异常时回退到平台默认值', () => {
    onPlatform('darwin', () => {
        assert.strictEqual(ext.resolveUserDir({}), ext.defaultUserDir());
        assert.strictEqual(ext.resolveUserDir({ globalStorageUri: { fsPath: '/nope/whatever' } }), ext.defaultUserDir());
    });
});

test('toFileUrl 生成的 URL 能被 fromFileUrl 原样还原(含空格路径)', () => {
    const p = path.join(os.homedir(), 'Library/Application Support/Code/User/cus-base.css');
    const url = ext.toFileUrl(p);
    assert.ok(url.startsWith('file:///'), `期望三斜杠 file URL,实际 ${url}`);
    assert.ok(!url.startsWith('file:////'), '不应出现四斜杠(旧 bug)');
    assert.ok(url.includes('%20'), '空格应被转义');
    assert.strictEqual(ext.fromFileUrl(url), p);
});

test('fromFileUrl 兼容历史遗留的四斜杠格式', () => {
    assert.strictEqual(ext.fromFileUrl('file:////Users/foo/bg.png'), '//Users/foo/bg.png');
});

test('isStaleManagedImport 剔除其它机器同步来的托管 CSS,保留用户自己的', () => {
    const keep = [ext.toFileUrl('/Users/me/Library/Application Support/Code/User/cus-base.css')];
    // 从 Windows 同步过来的旧条目 —— 要剔除
    assert.strictEqual(ext.isStaleManagedImport('file://C:/Users/other/AppData/Roaming/Code/User/cus-base.css', keep), true);
    assert.strictEqual(ext.isStaleManagedImport('file://C:/Users/other/AppData/Roaming/Code/User/cus-dynamic.css', keep), true);
    // 本机当前条目 —— 保留
    assert.strictEqual(ext.isStaleManagedImport(keep[0], keep), false);
    // 用户自己加的 CSS —— 保留
    assert.strictEqual(ext.isStaleManagedImport('file:///Users/me/my-own.css', keep), false);
    // 远程 / 对象形式条目 —— 保留
    assert.strictEqual(ext.isStaleManagedImport('https://example.com/a.css', keep), false);
    assert.strictEqual(ext.isStaleManagedImport({ type: 'css', url: 'https://example.com/a.css' }, keep), false);
});

test('isStaleManagedImport 不误删用户放在 User 目录之外的同名 CSS', () => {
    const keep = [ext.toFileUrl('/Users/me/Library/Application Support/Code/User/cus-base.css')];
    // 同名但不在 User 目录下 —— 是用户自己的文件,必须保留
    assert.strictEqual(ext.isStaleManagedImport('file:///Users/me/my-theme/cus-base.css', keep), false);
    assert.strictEqual(ext.isStaleManagedImport('file:///opt/shared/cus-dynamic.css', keep), false);
    // 在别的机器的 User 目录下 —— 剔除
    assert.strictEqual(ext.isStaleManagedImport('file://C:/Users/other/AppData/Roaming/Code/User/cus-base.css', keep), true);
});

test('warnFailed 有失败键才提示,没有则保持安静', () => {
    const vscodeStub = require('./vscode-stub.js');
    vscodeStub.window.warnings.length = 0;
    ext.warnFailed([]);
    ext.warnFailed(undefined);
    assert.deepStrictEqual(vscodeStub.window.warnings, [], '无失败键时不应打扰用户');
    ext.warnFailed(['window.menuBarVisibility']);
    assert.strictEqual(vscodeStub.window.warnings.length, 1);
    assert.match(vscodeStub.window.warnings[0], /window\.menuBarVisibility/);
    vscodeStub.window.warnings.length = 0;
});

test('fallbackFonts 只用当前平台真实存在的字体', () => {
    onPlatform('darwin', () => {
        const f = ext.fallbackFonts();
        assert.ok(f.includes('Menlo'), 'macOS 应回退到 Menlo');
        assert.ok(!f.includes('Consolas'), 'Consolas 在 macOS 上不存在');
    });
    onPlatform('win32', () => assert.ok(ext.fallbackFonts().includes('Consolas')));
    onPlatform('linux', () => assert.ok(ext.fallbackFonts().includes('DejaVu Sans Mono')));
});

test('fontStack 给含空格的字体名加引号并拼上平台兜底链', () => {
    onPlatform('darwin', () => {
        assert.strictEqual(ext.fontStack('JetBrains Mono'), "'JetBrains Mono', Menlo, Monaco, monospace");
    });
});

test('fontDirs 指向当前平台的字体目录', () => {
    onPlatform('darwin', () => {
        const dirs = ext.fontDirs();
        assert.ok(dirs.includes('/System/Library/Fonts'));
        assert.ok(dirs.some(d => d.endsWith('Library/Fonts')));
        assert.ok(!dirs.some(d => /Windows/i.test(d)));
    });
    onPlatform('win32', () => assert.ok(ext.fontDirs().some(d => /Fonts$/i.test(d))));
});

test('listFonts 在本机能真的检测到已装字体', () => {
    const fonts = ext.listFonts();
    assert.ok(fonts.length > 0);
    assert.ok(fonts.every(f => typeof f.name === 'string' && typeof f.installed === 'boolean'));
    // 本机(macOS/Windows/Linux)至少应认出一款系统自带等宽字体
    assert.ok(fonts.some(f => f.installed), '扫描结果不应全为未安装');
});

test('currentFontName 从 fontFamily 里取首选字体', () => {
    assert.strictEqual(ext.currentFontName("'JetBrains Mono', Menlo, monospace"), 'JetBrains Mono');
    assert.strictEqual(ext.currentFontName('Menlo, monospace'), 'Menlo');
    assert.strictEqual(ext.currentFontName(undefined), 'JetBrains Mono');
});

test('applicable 在 macOS 上滤掉未注册的 window.menuBarVisibility', () => {
    const updates = [['editor.fontSize', 14], ['window.menuBarVisibility', 'compact'], ['editor.minimap.enabled', true]];
    onPlatform('darwin', () => {
        const keys = ext.applicable(updates).map(([k]) => k);
        assert.deepStrictEqual(keys, ['editor.fontSize', 'editor.minimap.enabled']);
    });
    onPlatform('win32', () => {
        assert.strictEqual(ext.applicable(updates).length, 3, '非 macOS 平台不应滤掉菜单栏设置');
        assert.deepStrictEqual(ext.platformSkipKeys(), []);
    });
});

test('setConfig 单键写入失败不中断整批(未注册键不再吃掉后续设置)', async () => {
    const vscodeStub = require('./vscode-stub.js');
    vscodeStub.__failKeys.add('some.unregistered.key');
    try {
        const failed = await ext.setConfig([
            ['editor.fontSize', 15],
            ['some.unregistered.key', 'boom'],
            ['editor.lineHeight', 1.7]
        ]);
        assert.deepStrictEqual(failed, ['some.unregistered.key']);
        // 关键:失败键之后的设置必须照样写入
        assert.strictEqual(vscodeStub.__store.get('editor.lineHeight'), 1.7);
        assert.strictEqual(vscodeStub.__store.get('editor.fontSize'), 15);
    } finally {
        vscodeStub.__failKeys.delete('some.unregistered.key');
    }
});

test('自定义 CSS 不被生成流程覆盖(第三个文件存在的理由)', () => {
    const fs = require('node:fs');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beautify-iso-'));
    try {
        const userDir = path.join(tmp, 'User');
        fs.mkdirSync(userDir, { recursive: true });
        ext.resolveUserDir({ globalStorageUri: { fsPath: path.join(userDir, 'globalStorage', 'x.y') } });
        const mine = '/* 我手写的,不许动 */\n.monaco-workbench { outline: 1px solid red; }\n';
        fs.writeFileSync(path.join(userDir, 'cus-custom.css'), mine);
        // writeDynamicCss 是整文件重写 —— 必须只碰 cus-dynamic.css
        ext.writeDynamicCss('fancy', 'off');
        assert.strictEqual(fs.readFileSync(path.join(userDir, 'cus-custom.css'), 'utf8'), mine);
        assert.match(fs.readFileSync(path.join(userDir, 'cus-dynamic.css'), 'utf8'), /ANIM:fancy/);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('regionCss 换图帧的 opacity 必须为 0(否则轮播会硬切)', () => {
    const css = ext.regionCss('editor', { images: ['/a.png', '/b.png', '/c.png'], opacity: 0.22, intervalMs: 6000 });
    const frames = [...css.matchAll(/([\d.]+)% \{ background-image: url\("([^"]+)"\); opacity: ([\d.]+); \}/g)]
        .map(m => ({ pct: +m[1], img: m[2], op: +m[3] }));
    assert.ok(frames.length >= 10, `应有 3*3+1 帧,实际 ${frames.length}`);
    // 逐帧比对:图一换,该帧 opacity 必须是 0
    for (let i = 1; i < frames.length; i++) {
        if (frames[i].img !== frames[i - 1].img) {
            assert.strictEqual(frames[i].op, 0,
                `${frames[i].pct}% 处换图但 opacity=${frames[i].op},会看到硬切`);
        }
    }
    // opacity 不得超过该区域配置值,否则轮播时比静态时浓
    assert.strictEqual(Math.max(...frames.map(f => f.op)), 0.22);
    assert.match(css, /prefers-reduced-motion/);
});

test('regionCss 单图不生成动画,多图才生成', () => {
    const one = ext.regionCss('panel', { images: ['/a.png'], opacity: 0.18 });
    assert.ok(!/@keyframes/.test(one), '单图不应有 keyframes');
    assert.match(one, /background-image: url\("vscode-file:\/\/vscode-app\/a\.png"\)/);
    const many = ext.regionCss('panel', { images: ['/a.png', '/b.png'], opacity: 0.18 });
    assert.match(many, /@keyframes beautify-carousel-panel/);
    // 透明化必须带 !important —— part 背景是内联 style 写的
    for (const sel of ext.REGIONS.panel.transparent) {
        assert.ok(many.includes(`${sel} { background-color: transparent !important; }`), `缺 ${sel} 的透明化`);
    }
});

test('sanitizeState 丢弃一切非法输入(导入的配置文件不可信)', () => {
    const { state, rejected } = ext.sanitizeState({
        version: 99, animMode: '../../etc/passwd', bgMode: 'regions', inlineImages: 'yes',
        regions: {
            editor: { images: ['/ok/a.png', 'relative.png', 42, "');}body{display:none}"], opacity: 5, intervalMs: 1 },
            sidebar: { images: ['/ok/b.jpg'], opacity: 0.3, intervalMs: 6000, blend: false },
            evil: { images: ['/x.png'] }
        }
    });
    // 只留绝对路径 —— 相对路径会相对 workbench 解析,注入片段直接被挡在门外
    assert.deepStrictEqual(state.regions.editor.images, ['/ok/a.png']);
    assert.strictEqual(state.animMode, 'default', '非法 animMode 必须回落');
    assert.strictEqual(state.regions.editor.opacity, 0.22, '越界 opacity 必须回落');
    assert.strictEqual(state.regions.editor.intervalMs, 8000, '越界间隔必须回落');
    assert.strictEqual(state.inlineImages, false, "字符串 'yes' 不是 true");
    assert.strictEqual(state.version, ext.STATE_VERSION, '版本号由本插件写,不采信输入');
    assert.ok(!('evil' in state.regions), '未知区域必须丢弃');
    // 合法值原样保留
    assert.deepStrictEqual(state.regions.sidebar, { images: ['/ok/b.jpg'], opacity: 0.3, intervalMs: 6000, blend: false });
    assert.ok(rejected.length >= 6, `应记录被丢弃项,实际 ${rejected.length}`);
});

test('settingTypeOk 按声明的类型校验,不依赖当前值是否存在', () => {
    // 这条锁住一个真实 bug:早先拿 cfg.get() 的当前值比类型,键没设过时
    // 当前值是 undefined,校验被整个跳过,字符串就能写进 number 型的键。
    assert.strictEqual(ext.settingTypeOk('editor.lineHeight', 'not-a-number'), false);
    assert.strictEqual(ext.settingTypeOk('editor.lineHeight', 1.6), true);
    assert.strictEqual(ext.settingTypeOk('editor.fontSize', '14'), false);
    assert.strictEqual(ext.settingTypeOk('workbench.statusBar.visible', 'true'), false);
    assert.strictEqual(ext.settingTypeOk('workbench.statusBar.visible', true), true);
    // 多类型键
    assert.strictEqual(ext.settingTypeOk('editor.fontLigatures', true), true);
    assert.strictEqual(ext.settingTypeOk('editor.fontLigatures', "'calt'"), true);
    assert.strictEqual(ext.settingTypeOk('editor.fontLigatures', 42), false);
    // NaN / Infinity 会在 CSS 里产出非法值
    assert.strictEqual(ext.settingTypeOk('editor.fontSize', NaN), false);
    assert.strictEqual(ext.settingTypeOk('editor.fontSize', Infinity), false);
    // 未列入白名单的键
    assert.strictEqual(ext.settingTypeOk('evil.key', 1), false);
});

test('importConfig 拒绝非本插件的文件', async () => {
    for (const bad of [null, 42, 'str', {}, { kind: 'other' }]) {
        await assert.rejects(() => ext.importConfig(bad), /不是 JSON 对象|不是美化控制台/);
    }
});

test('sanitizeState 对垃圾输入不抛异常', () => {
    for (const junk of [null, undefined, 42, 'str', [], { regions: 'nope' }, { regions: { editor: null } }]) {
        const r = ext.sanitizeState(junk);
        assert.strictEqual(r.state.version, ext.STATE_VERSION);
        assert.ok(Array.isArray(r.state.regions.editor.images));
    }
});

test('safeImageName 清洗掉能破坏 CSS 规则的字符', () => {
    // 全窗口模式把路径交给 Custom UI Style,它用 url('...') 单引号拼接且不转义,
    // 而 pathToFileURL 不转义单引号 —— 名字带 ') 的图会提前闭合这条规则。
    const cleaned = ext.safeImageName("foo')}body{display:none}.png");
    for (const ch of ['\'', '"', '(', ')', '{', '}', ';']) {
        assert.ok(!cleaned.includes(ch), `${ch} 应被清掉,实际 ${cleaned}`);
    }
    // 路径分量被剥掉,不能借文件名跳出 backgrounds/
    assert.strictEqual(ext.safeImageName('../../etc/passwd.png'), 'passwd.png');
    assert.ok(!ext.safeImageName('../../x.png').includes('..'));
    // 扩展名必须留住,否则 vscode-file 白名单命中不了,白白退回 base64
    for (const name of ['normal.png', '.png', 'no-ext', '...hidden.png', 'a"b.jpg']) {
        assert.ok(ext.canUseWorkbenchUrl(ext.safeImageName(name)), `${name} 清洗后应仍可走 vscode-file`);
    }
    assert.strictEqual(ext.safeImageName('normal.png'), 'normal.png', '正常名字不该被改');
    assert.ok(ext.safeImageName('x'.repeat(200) + '.webp').length < 100, '过长名字应截断');
});

test('imageCssUrl 白名单外的扩展名退回 base64 内联', () => {
    assert.match(ext.imageCssUrl('/x/a.png'), /^vscode-file:\/\/vscode-app\//);
    // .tiff 不在 Electron 的 validExtensions 里,vscode-file 会被拒
    assert.ok(!ext.imageCssUrl('/x/a.tiff').startsWith('vscode-file:'), 'tiff 不该走 vscode-file');
    // 强制内联开关
    assert.ok(!ext.imageCssUrl('/x/a.png', true).startsWith('vscode-file:'), 'inline=true 应走 base64 路径');
});

// —— 端到端:这条直接复现原 bug(文件写到不存在的 Windows 目录 → 静默失效) ——
test('激活后在解析出的 User 目录下自举,并清理跨平台残留 import', async () => {
    const fs = require('node:fs');
    const vscodeStub = require('./vscode-stub.js');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beautify-test-'));
    try {
        const userDir = path.join(tmp, 'User');
        const ctx = {
            subscriptions: [],
            globalStorageUri: { fsPath: path.join(userDir, 'globalStorage', 'dwgx.beautify-console') }
        };
        // 预置:两条从 Windows 同步过来的失效条目 + 一条用户自己加的
        const mine = 'file:///Users/me/my-own.css';
        vscodeStub.__store.set('custom-ui-style.external.imports', [
            'file://C:/Users/other/AppData/Roaming/Code/User/cus-base.css',
            'file://C:/Users/other/AppData/Roaming/Code/User/cus-dynamic.css',
            mine
        ]);
        vscodeStub.window.errors.length = 0;

        ext.activate(ctx);
        await new Promise(r => setTimeout(r, 50));   // bootstrap 不被 await,等它落盘

        assert.deepStrictEqual(vscodeStub.window.errors, [], '自举不应报错');
        // 标记文件写不成 → 每次启动重复跑初始化并重复报错(1.0.4 的回归)
        assert.ok(fs.existsSync(path.join(userDir, '.beautify-init-done')), '初始化标记应写成');
        assert.ok(fs.existsSync(path.join(userDir, 'cus-base.css')), 'cus-base.css 应写在解析出的 User 目录');
        assert.ok(fs.existsSync(path.join(userDir, 'cus-dynamic.css')), 'cus-dynamic.css 应写在解析出的 User 目录');
        assert.match(fs.readFileSync(path.join(userDir, 'cus-dynamic.css'), 'utf8'), /ANIM:default/);

        const imports = vscodeStub.__store.get('custom-ui-style.external.imports');
        assert.ok(!imports.some(i => i.includes('C:/')), '残留的 Windows 条目应被剔除');
        assert.ok(imports.includes(mine), '用户自加的 import 必须保留');
        const base = ext.toFileUrl(path.join(userDir, 'cus-base.css'));
        const dyn = ext.toFileUrl(path.join(userDir, 'cus-dynamic.css'));
        const custom = ext.toFileUrl(path.join(userDir, 'cus-custom.css'));
        assert.ok(imports.includes(base));
        assert.ok(imports.includes(dyn));
        assert.ok(imports.includes(custom), '自定义 CSS 也要登记');
        assert.strictEqual(imports.length, 4);
        // 顺序决定优先级:cus-custom.css 必须在生成的两个之后,用户规则才压得过
        assert.ok(imports.indexOf(custom) > imports.indexOf(base), 'custom 必须晚于 base');
        assert.ok(imports.indexOf(custom) > imports.indexOf(dyn), 'custom 必须晚于 dynamic');
        // 缺文件会让 CUS 每次 reload 弹错误通知,所以登记前必须已落盘
        assert.ok(fs.existsSync(path.join(userDir, 'cus-custom.css')), '自定义 CSS 文件应已创建');

        // 面板能渲染出来,且带上平台信息
        await vscodeStub.__commands.get('beautify.openPanel')();
        const panel = vscodeStub.window.panels.at(-1);
        assert.ok(panel.webview.html.includes('rowMenuBar'), 'HTML 应含菜单栏行(供 macOS 隐藏)');
        const init = panel.webview.messages.find(m => m.type === 'init');
        assert.strictEqual(init.state.platform, process.platform);
        assert.ok(Array.isArray(init.state.fonts) && init.state.fonts.length > 0);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});
