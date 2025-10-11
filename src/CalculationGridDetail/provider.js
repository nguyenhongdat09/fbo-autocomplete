/**
 * FILE 2: provider.js
 * Provider cho $gccl; - Generate switch case từ g.$a
 */

const vscode = require('vscode');
const { generateSwitchCase } = require('./analyzer');

class CalculationProvider {
  
  /**
   * Provide inline completion items
   */
  async provideInlineCompletionItems(document, position) {
    const line = document.lineAt(position);
    const textBeforeCursor = line.text.substring(0, position.character).trim();
    
    
    // Chỉ trigger khi gõ $gccl;
    if (textBeforeCursor !== '$gccl;') {
      return [];
    }
    const completionItems = [];
    
    try {
      // Generate switch case từ g.$a
      const documentText = document.getText();
      const switchCode = generateSwitchCase(documentText);
      
      if (switchCode.startsWith('// Error')) {
        vscode.window.showErrorMessage(switchCode);
        return completionItems;
      }
      // Tạo completion item
      const completionItem = this.createCompleteItem(switchCode, line, position);
      completionItems.push(completionItem);
      
    } catch (error) {
      vscode.window.showErrorMessage(`[CALC] Error: ${error.message}`);
      console.error('[CALC] Error:', error);
    }
    
    return completionItems;
  }
  
  /**
   * Tạo inline completion item
   */
  createCompleteItem(text, line, position) {
    const completionItem = new vscode.InlineCompletionItem(text.trim());
    
    completionItem.command = {
      command: 'fbo-autocomplete.applyCalculationItem',
      title: 'Apply Switch Case',
      arguments: [line, position]
    };
    
    completionItem.range = new vscode.Range(position, position);
    
    return completionItem;
  }
}

/**
 * Apply completion - xóa $gccl; và insert code
 */
function applyCalculationItem(line, position) {
  const activeTextEditor = vscode.window.activeTextEditor;
  const document = activeTextEditor.document;
  const edit = new vscode.WorkspaceEdit();
  
  const lineNumber = line.lineNumber;
  const lineText = document.lineAt(lineNumber).text;
  
  // Tìm vị trí của $gccl;
  const index = lineText.indexOf('$gccl;');
  
  if (index !== -1) {
    // Xóa $gccl; (6 ký tự)
    const startPos = new vscode.Position(lineNumber, index);
    const endPos = new vscode.Position(lineNumber, index + 6);
    
    edit.delete(document.uri, new vscode.Range(startPos, endPos));
    vscode.workspace.applyEdit(edit);
  }
}

/**
 * Register provider
 */
function register(context) {
  
  // Register inline completion provider
  const provider = vscode.languages.registerInlineCompletionItemProvider(
    { language: 'xml', scheme: 'file' },
    new CalculationProvider()
  );
  
  // Register command để xóa $gccl;
  const command = vscode.commands.registerCommand(
    'fbo-autocomplete.applyCalculationItem',
    applyCalculationItem
  );
  
  context.subscriptions.push(provider, command);
}

module.exports = {
  register
};