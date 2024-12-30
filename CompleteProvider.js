// CompletionProvider.js
const vscode = require('vscode');

class CompletionProvider {
    static provideCompletionItems(document, position) {
        var line = document.lineAt(position) 
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ
        var completionItems = [];
        
        
        // Kiểm tra xem có bắt đầu với $f. hay không
        if (!textBeforeCursor.startsWith('$f.ma_kh')) {
            return completionItems; // Không trả về gợi ý nếu không phải $f.
        }
        var text = `
<field name="ma_kh" >
    <header v="Mã khách hàng" e="Customer ID"></header>
    <items style="AutoComplete" controller="Customer" reference="ten_kh%l" key="status = '1' and (kh_yn = 1 or nv_yn = 1)" check="kh_yn = 1 or nv_yn = 1" information="ma_kh.ten_kh%l" new="Default"/>
</field>
<field name="ten_kh%l" readOnly="true" external="true"  defaultValue="''">
    <header v="" e=""></header>
</field>` 
        // Tạo nội dung gợi ý
        const completionItem = new vscode.InlineCompletionItem(text.trim());
        completionItem.command = {
            command: 'default:applyCompletionItem',
            title: 'Replace with completion',
            arguments: [line ]
        };
        completionItems.push(completionItem);
        return completionItems;
    }
}


module.exports = CompletionProvider;
