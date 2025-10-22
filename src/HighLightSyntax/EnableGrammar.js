const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

async function toggleGrammar(enable, extensionPath) {
  const syntaxesFolder = path.join(extensionPath, 'src', 'HighLightSyntax', 'syntaxes');
  const grammarPath = path.join(syntaxesFolder, 'fastbusiness-xml.tmLanguage.json');
  const grammarDisabledPath = path.join(syntaxesFolder, 'fastbusiness-xml.tmLanguage_.json');

  try {
    let changed = false;

    if (enable) {
      if (fs.existsSync(grammarPath)) {
        console.log('✅ Grammar đã bật sẵn.');
      } else if (fs.existsSync(grammarDisabledPath)) {
        fs.renameSync(grammarDisabledPath, grammarPath);
        vscode.window.showInformationMessage('✅ Đã bật highlight XML cho FastBusiness.');
        changed = true;
      }
    } else {
      if (fs.existsSync(grammarDisabledPath)) {
        console.log('🚫 Grammar đã tắt sẵn.');
      } else if (fs.existsSync(grammarPath)) {
        fs.renameSync(grammarPath, grammarDisabledPath);
        vscode.window.showInformationMessage('🚫 Đã tắt highlight XML cho FastBusiness.');
        changed = true;
      }
    }

    if (changed) {
      // 👉 Reload lại grammar cho file hiện tại (không reload cả VSCode)
      await reloadCurrentXMLDocuments();
    }

  } catch (error) {
    console.error('❌ Lỗi khi xử lý grammar:', error);
    vscode.window.showErrorMessage('❌ Lỗi khi bật/tắt grammar.');
  }
}

async function reloadCurrentXMLDocuments() {
  const openEditors = vscode.window.visibleTextEditors;
  for (const editor of openEditors) {
    const doc = editor.document;
    if (doc.languageId === 'xml') {
      // Trick: đổi sang plaintext rồi đổi lại xml để VSCode reload grammar
      await vscode.languages.setTextDocumentLanguage(doc, 'plaintext');
      await vscode.languages.setTextDocumentLanguage(doc, 'xml');
    }
  }
  console.log('🔁 Reload grammar hoàn tất (không cần reload VSCode).');
}

module.exports = { toggleGrammar };
