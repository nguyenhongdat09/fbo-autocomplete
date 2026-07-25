const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if(path === 'vscode') return { Hover: class {}, MarkdownString: class { appendMarkdown(m){console.log('MD:', m)} }, workspace: { getConfiguration: () => ({ get: () => true }) } };
    return originalRequire.apply(this, arguments);
};
const r = require('./src/ReadXMLByJS/entityResolver.js');
const EHP = require('./src/VS2008/EntityHoverProvider.js');
const ehp = new EHP('', {extensionPath: ''});
ehp.hoverMode = 'flat';
const xml = '\\\\172.168.5.14\\CustomerPro\\FBI\\AMERICAN\\FBISP2422\\App_Data\\Controllers\\Dir\\SVTran.xml';
const doc = {uri: {fsPath: xml}, lineAt: () => ({text: '&ListField;'})};
const pos = {line: 609, character: 6};
const getWordRangeAtPosition = () => ({});
try {
    const hover = ehp.provideHover(doc, pos, null, 'ListField');
} catch (e) {
    console.error('ERROR:', e);
}
