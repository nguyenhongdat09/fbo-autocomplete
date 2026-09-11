const vscode = require('vscode');
const { extractGaDeclaration } = require('./GaDeclarationExtractor');
const { buildFormulaMap } = require('./GaFormulaMapBuilder');

// Cache lưu trữ document.uri.fsPath -> { version, map: Map<alias, FormulaEntry> }
const cache = new Map();

class FormulaHoverProvider {
    provideHover(document, position, token) {
        const fsPath = document.uri.fsPath;
        
        // 1. Guard: Chỉ chạy cho file nằm trong thư mục Grid (SVDetail.xml, v.v...)
        if (!fsPath.match(/\\Grid\\|\/Grid\//i)) {
            return null;
        }

        // 2. Lấy từ dưới con trỏ, đảm bảo đúng pattern g.$a.alias
        // Regex này bắt toàn bộ word g.$a.alias
        const wordRange = document.getWordRangeAtPosition(position, /g\.\$a\.[A-Za-z_][A-Za-z0-9_]*/);
        if (!wordRange) {
            return null;
        }

        const wordText = document.getText(wordRange);
        const match = wordText.match(/g\.\$a\.([A-Za-z_][A-Za-z0-9_]*)/);
        if (!match) {
            return null;
        }

        const alias = match[1];

        // 3. Cache Check
        let cached = cache.get(fsPath);
        if (!cached || cached.version !== document.version) {
            // Build lại map
            const rawXml = document.getText();
            const gaBlockFlat = extractGaDeclaration(fsPath, rawXml);
            
            if (!gaBlockFlat) {
                // Không tìm thấy g.$a thì cache map rỗng để tránh parse lại
                cache.set(fsPath, { version: document.version, map: new Map() });
                return null;
            }

            const map = buildFormulaMap(gaBlockFlat);
            cache.set(fsPath, { version: document.version, map });
            cached = cache.get(fsPath);
        }

        // 4. Lookup alias trong Map
        const map = cached.map;
        if (!map.has(alias)) {
            return null;
        }

        const entry = map.get(alias);

        // 5. Build UI Hover
        const md = new vscode.MarkdownString(undefined, true);
        md.supportThemeIcons = true;
        md.supportHtml = true;
        md.isTrusted = true;

        md.appendMarkdown(`**$(calculator) Grid Formula:** \`g.$a.${alias}\`\n\n`);
        md.appendMarkdown(`---\n\n<br/>\n\n`);
        
        // Hiển thị dạng code JavaScript với highlight và padding
        md.appendCodeblock(entry.display, 'javascript');
        md.appendMarkdown(`\n\n<br/>\n`);

        return new vscode.Hover(md, wordRange);
    }
}

module.exports = FormulaHoverProvider;
