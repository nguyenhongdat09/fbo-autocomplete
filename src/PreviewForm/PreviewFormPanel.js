const vscode = require('vscode');
const path = require('path');
const { expandXmlEntities } = require('../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander');
const fs = require('fs');
const { parseFormXml } = require('./parser/FormXmlParser');

class PreviewFormPanel {
  static currentPanel = null;

  static createOrShow(context, uri) {
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;

    if (PreviewFormPanel.currentPanel) {
      PreviewFormPanel.currentPanel._panel.reveal(column);
      PreviewFormPanel.currentPanel.refresh(uri);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'fboPreviewForm',
      'Preview Form: ' + path.basename(uri.fsPath),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'PreviewForm', 'media'))]
      }
    );

    PreviewFormPanel.currentPanel = new PreviewFormPanel(panel, context, uri);
  }

  constructor(panel, context, uri) {
    this._panel = panel;
    this._context = context;
    this._uri = uri;
    this._disposables = [];
    this._webview_ready = false;
    this._pending_model = null;
    this._pending_error = null;
    this._html_initialized = false;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg && msg.type === 'ready') {
        this._webview_ready = true;
        if (this._pending_error) {
          this._post_error(this._pending_error);
          this._pending_error = null;
        } else if (this._pending_model) {
          this._post_model(this._pending_model);
          this._pending_model = null;
        } else {
          this._build_and_post_model();
        }
      }
    }, null, this._disposables);

    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.toString() === this._uri.toString()) {
        this.refresh(this._uri);
      }
    }, null, this._disposables);

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    this._html_initialized = true;
    this._build_and_post_model();
  }

  dispose() {
    PreviewFormPanel.currentPanel = null;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  async refresh(uri) {
    this._uri = uri;
    this._panel.title = 'Preview Form: ' + path.basename(uri.fsPath);
    // Không gán lại html mỗi lần (tránh race mất listener) — chỉ push model
    await this._build_and_post_model();
  }

  _post_model(model) {
    this._panel.webview.postMessage({ command: 'updateModel', model: model });
  }

  _post_error(message) {
    this._panel.webview.postMessage({ command: 'error', message: message });
  }

  async _build_and_post_model() {
    try {
      let source_text = '';
      const open_doc = vscode.workspace.textDocuments.find(
        d => d.uri.toString() === this._uri.toString()
      );
      if (open_doc) {
        source_text = open_doc.getText();
      } else {
        source_text = fs.readFileSync(this._uri.fsPath, 'utf8');
      }

      const expand_model = expandXmlEntities(this._uri.fsPath, source_text);
      const model = parseFormXml(expand_model.flat_text);

      if (!this._webview_ready) {
        this._pending_model = model;
        return;
      }
      this._post_model(model);
    } catch (err) {
      console.error('[FBO PreviewForm]', err);
      const message = err.message || String(err);
      if (this._webview_ready) {
        this._post_error(message);
      } else {
        this._pending_error = message;
      }
    }
  }

  _getHtmlForWebview(webview) {
    const scriptPathOnDisk = vscode.Uri.file(
      path.join(this._context.extensionPath, 'src', 'PreviewForm', 'media', 'bundle.js')
    );
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview Form</title>
</head>
<body style="padding: 10px;">
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = { PreviewFormPanel };
