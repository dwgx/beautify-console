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
        assert.ok(fs.existsSync(path.join(userDir, 'cus-base.css')), 'cus-base.css 应写在解析出的 User 目录');
        assert.ok(fs.existsSync(path.join(userDir, 'cus-dynamic.css')), 'cus-dynamic.css 应写在解析出的 User 目录');
        assert.match(fs.readFileSync(path.join(userDir, 'cus-dynamic.css'), 'utf8'), /ANIM:default/);

        const imports = vscodeStub.__store.get('custom-ui-style.external.imports');
        assert.ok(!imports.some(i => i.includes('C:/')), '残留的 Windows 条目应被剔除');
        assert.ok(imports.includes(mine), '用户自加的 import 必须保留');
        assert.ok(imports.includes(ext.toFileUrl(path.join(userDir, 'cus-base.css'))));
        assert.ok(imports.includes(ext.toFileUrl(path.join(userDir, 'cus-dynamic.css'))));
        assert.strictEqual(imports.length, 3);

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
