// CompletionProvider.js
const vscode = require('vscode');

class CompletionProvider {
    static provideCompletionItems(document, position) {
        const line = document.lineAt(position); // Lấy nội dung dòng hiện tại
        const textBeforeCursor = line.text.substring(0, position.character); // Lấy đoạn trước con trỏ

        // Kiểm tra xem con trỏ có nằm sau $f. hay không
        const match = textBeforeCursor.match(/\$f\.(\w*)$/);
        if (!match) {
            return []; // Không gợi ý nếu không phải chuỗi sau $f.
        }

        const wordAfterF = match[1]; // Lấy chuỗi phía sau $f.
        console.log(`Word after $f: ${wordAfterF}`); // Debug log

        // Gợi ý tùy chỉnh
        const completionItems = [];
        const item = new vscode.CompletionItem("$f.ma_kh", vscode.CompletionItemKind.Snippet);

        const text = `
            <field name="ma_kh">
                <header v="Mã khách hàng" e="Customer ID"></header>
                <items style="AutoComplete" controller="Customer" reference="ten_kh%l" key="status = '1' and (kh_yn = 1 or nv_yn = 1)" check="kh_yn = 1 or nv_yn = 1" information="ma_kh.ten_kh%l" new="Default"/>
            </field>
            <field name="ten_kh%l" readOnly="true" external="true"  defaultValue="''">
                <header v="" e=""></header>
            </field>`;
        
        item.insertText = new vscode.SnippetString(text);
        
        item.documentation = new vscode.MarkdownString().appendCodeblock(text, 'xml');
        completionItems.push(item);

        return completionItems;
    }
}


module.exports = CompletionProvider;
