const vscode = require('vscode');
const path = require('path');
const { expandXmlEntities } = require('../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander');
const entityResolver = require('../ReadXMLByJS/entityResolver');
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
      } else if (msg && msg.type === 'revealViewItem') {
        this._revealViewItem(msg);
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

  async _revealViewItem(msg) {
    try {
      let doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === this._uri.toString());
      if (!doc) {
        doc = await vscode.workspace.openTextDocument(this._uri);
      }
      const editor = await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });

      const text = doc.getText();
      const lines = text.split('\n');

      let target_line = -1;
      let highlight_text = null;
      
      // B1. Exact match raw_item_value
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`value="${msg.raw_item_value}"`) || lines[i].includes(`value='${msg.raw_item_value}'`)) {
          target_line = i;
          break;
        }
      }

      // B2. Fallback: match pattern + [field] on the same line if possible
      let pattern_part = msg.raw_item_value ? msg.raw_item_value.split(':')[0] : '';
      let field_part = msg.field ? `[${msg.field}]` : null;
      if (field_part && msg.role === 'label') field_part += '.Label';

      if (target_line === -1 && msg.field) {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('<item ') && lines[i].includes(pattern_part) && lines[i].includes(field_part)) {
             target_line = i;
             highlight_text = field_part;
             break;
          }
        }

        // B2.5 Relaxed Fallback: match just [field] (since pattern might contain &Entity; in source)
        if (target_line === -1) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('<item ') && lines[i].includes(field_part)) {
               target_line = i;
               highlight_text = field_part;
               break;
            }
          }
        }
      }

      // B3. Pattern + entity ref trỏ về field
      if (target_line === -1 && msg.field) {
        const general_entities = entityResolver.getEntitiesForFile(this._uri.fsPath) || {};
        let possible_entities = [];
        
        for (const [name, decl] of Object.entries(general_entities)) {
            const replacement = decl.value || ''; 
            if (replacement === msg.field || replacement.includes(`[${msg.field}]`) || replacement.includes(msg.field)) {
                possible_entities.push(name);
            }
        }

        if (possible_entities.length > 0) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('<item ') && lines[i].includes(pattern_part)) {
                    for (const ent_name of possible_entities) {
                        const searchStr1 = `[&${ent_name};]`;
                        const searchStr2 = `&${ent_name};`;
                        
                        let matchStr = null;
                        if (msg.role === 'label' && lines[i].includes(`${searchStr1}.Label`)) {
                            matchStr = `${searchStr1}.Label`;
                        } else if (lines[i].includes(searchStr1)) {
                            matchStr = searchStr1;
                        } else if (msg.role === 'label' && lines[i].includes(`${searchStr2}.Label`)) {
                            matchStr = `${searchStr2}.Label`;
                        } else if (lines[i].includes(searchStr2)) {
                            matchStr = searchStr2;
                        }

                        if (matchStr) {
                            target_line = i;
                            highlight_text = matchStr;
                            break;
                        }
                    }
                }
                if (target_line !== -1) break;
            }

            // Relaxed B3: match without pattern (if pattern contained entity)
            if (target_line === -1) {
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('<item ')) {
                        for (const ent_name of possible_entities) {
                            const searchStr1 = `[&${ent_name};]`;
                            const searchStr2 = `&${ent_name};`;
                            
                            let matchStr = null;
                            if (msg.role === 'label' && lines[i].includes(`${searchStr1}.Label`)) {
                                matchStr = `${searchStr1}.Label`;
                            } else if (lines[i].includes(searchStr1)) {
                                matchStr = searchStr1;
                            } else if (msg.role === 'label' && lines[i].includes(`${searchStr2}.Label`)) {
                                matchStr = `${searchStr2}.Label`;
                            } else if (lines[i].includes(searchStr2)) {
                                matchStr = searchStr2;
                            }
    
                            if (matchStr) {
                                target_line = i;
                                highlight_text = matchStr;
                                break;
                            }
                        }
                    }
                    if (target_line !== -1) break;
                }
            }
        }
      }

      // B4. Pattern alone (an toàn)
      if (target_line === -1) {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('<item ') && lines[i].includes(pattern_part) && lines[i].includes('value=')) {
             target_line = i;
             // Highlight the entire value="..."
             const match = lines[i].match(/value=(["'])(.*?)\1/);
             if (match) {
                 highlight_text = match[0];
             }
             break;
          }
        }
      }

      if (target_line !== -1) {
        let startPos = new vscode.Position(target_line, 0);
        let endPos = new vscode.Position(target_line, lines[target_line].length);
        
        const textToHighlight = highlight_text || (msg.field ? `[${msg.field}]` : null);
        
        if (textToHighlight) {
            const fieldIdx = lines[target_line].indexOf(textToHighlight);
            if (fieldIdx !== -1) {
                startPos = new vscode.Position(target_line, fieldIdx);
                endPos = new vscode.Position(target_line, fieldIdx + textToHighlight.length);
            }
        }

        const range = new vscode.Range(startPos, endPos);
        editor.selection = new vscode.Selection(startPos, endPos);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      } else {
        vscode.window.showWarningMessage(`Không tìm thấy dòng <item> chứa trường: ${msg.field || 'gap'} (hoặc pattern: ${pattern_part}). Có thể cấu hình đang được viết dưới dạng &Entity;`);
      }
    } catch (err) {
      console.error('[FBO PreviewForm revealViewItem]', err);
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
