const vscode = require('vscode');
const { PreviewFormPanel } = require('./PreviewFormPanel');

class PreviewFormCommand {
  constructor(context) {
    this.context = context;
  }

  register() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('fbo-autocomplete.previewForm', () => {
        this.run();
      })
    );
  }

  run() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Vui lòng mở một file XML trước khi Preview Form.');
      return;
    }

    const doc = editor.document;
    if (doc.languageId !== 'xml') {
      vscode.window.showErrorMessage('Preview Form chỉ hỗ trợ file XML.');
      return;
    }

    const filePath = doc.uri.fsPath.replace(/\\/g, '/');
    if (!/\/(Dir|Filter)\/[^/]+\.xml$/i.test(filePath)) {
      vscode.window.showErrorMessage('Preview Form chỉ hỗ trợ file XML nằm trực tiếp trong thư mục Dir hoặc Filter.');
      return;
    }

    PreviewFormPanel.createOrShow(this.context, doc.uri);
  }
}

module.exports = { PreviewFormCommand };
