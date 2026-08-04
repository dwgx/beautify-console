// 最小 vscode API 桩 —— 让 extension.js 能在纯 Node 下被 require 并测试。
// 只实现用例真正会走到的表面。
const { pathToFileURL, fileURLToPath } = require('url');

const store = new Map();

const Uri = {
    file(p) {
        return { fsPath: p, scheme: 'file', toString: () => pathToFileURL(p).toString() };
    },
    parse(s) {
        // 与 VS Code 一致的宽松解析:能还原就还原,还原不了退回裸路径
        let fsPath = s;
        if (s.startsWith('file:')) {
            try { fsPath = fileURLToPath(s); }
            catch (e) { fsPath = decodeURIComponent(s.replace(/^file:\/*/, '/')); }
        }
        return { fsPath, scheme: 'file', toString: () => s };
    }
};

module.exports = {
    Uri,
    ConfigurationTarget: { Global: 1 },
    ViewColumn: { Active: -1 },
    extensions: { all: [] },
    commands: {
        registerCommand: (id, fn) => { module.exports.__commands.set(id, fn); return { dispose() {} }; },
        executeCommand: async () => {}
    },
    __commands: new Map(),
    window: {
        showErrorMessage: (...a) => { module.exports.window.errors.push(a[0]); },
        showWarningMessage: () => {},
        showInformationMessage: async () => undefined,
        showOpenDialog: async () => undefined,
        createWebviewPanel: () => {
            const panel = {
                visible: true,
                webview: {
                    html: '',
                    messages: [],
                    postMessage(m) { panel.webview.messages.push(m); },
                    onDidReceiveMessage() {}
                },
                onDidDispose() {}, onDidChangeViewState() {}, dispose() {}
            };
            module.exports.window.panels.push(panel);
            return panel;
        },
        errors: [],
        panels: []
    },
    workspace: {
        getConfiguration: () => ({
            get: (k) => store.get(k),
            update: async (k, v) => {
                // 复现 VS Code 对未注册键的行为
                if (module.exports.__failKeys.has(k)) {
                    throw new Error(`没有注册配置 ${k},因此无法写入 用户设置。`);
                }
                store.set(k, v);
            }
        })
    },
    // 测试辅助
    __store: store,
    __failKeys: new Set()
};
