const vscode = require('vscode');
const path = require('path');
class updateSettingsJson {
    updateSettingsJson(context) {
        var extensionPath = path.join(context.extensionPath, 'src', 'Database', 'XSD');
        var extensionPathMobile = path.join(context.extensionPath, 'src', 'Database', 'Mobile');
        var ideType = String(vscode.workspace.getConfiguration('fbo-autocomplete').get('ideType', 'vscode')).toLowerCase();
        extensionPathMobile = ideType === 'cursor' ? extensionPathMobile.replace('.vscode', '.cursor') : extensionPathMobile.replace('.cursor', '.vscode');

        const desired = [
            { "pattern": "**/Controllers/Dir/*.xml", "systemId": path.join(extensionPath, "Dir.xsd") },
            { "pattern": "**/Controllers/Filter/*.xml", "systemId": path.join(extensionPath, "Dir.xsd") },
            { "pattern": "**/Controllers/Grid/*.xml", "systemId": path.join(extensionPath, "Grid.xsd") },
            { "pattern": "**/Controllers/Report/*.xml", "systemId": path.join(extensionPath, "Report.xsd") },
            { "pattern": "**/Upload/*.xml", "systemId": path.join(extensionPath, "Import.xsd") },
            { "pattern": "**/Controllers/Dir/*.f", "systemId": path.join(extensionPath, "Dir.xsd") },
            { "pattern": "**/Controllers/Grid/*.f", "systemId": path.join(extensionPath, "Grid.xsd") },
            { "pattern": "**/Controllers/Filter/*.f", "systemId": path.join(extensionPath, "Dir.xsd") },
            { "pattern": "**/FastAPI/*.xml", "systemId": path.join(extensionPath, "FastAPI.xsd") },
            { "pattern": "**/Mobile/Filter/*.xml", "systemId": path.join(extensionPathMobile, "Filter.xsd") },
            { "pattern": "**/Mobile/Dir/*.xml", "systemId": path.join(extensionPathMobile, "Dir.xsd") },
            { "pattern": "**/Mobile/Grid/*.xml", "systemId": path.join(extensionPathMobile, "Grid.xsd") }
        ];
        const managedPatterns = new Set(desired.map(e => e.pattern));

        const config = vscode.workspace.getConfiguration('xml');
        const existing = config.get('fileAssociations', []) || [];
        // Giữ nguyên entries không thuộc extension này, chỉ thay/thêm phần của mình
        const merged = existing.filter(e => !e || !managedPatterns.has(e.pattern)).concat(desired);

        // Chỉ ghi khi khác — tránh ghi settings.json mỗi lần activate
        if (JSON.stringify(existing) === JSON.stringify(merged)) return;
        config.update('fileAssociations', merged, vscode.ConfigurationTarget.Global).then(
            () => console.log('Cập nhật xml.fileAssociations thành công!'),
            (err) => vscode.window.showErrorMessage('Lỗi khi cập nhật xml.fileAssociations: ' + err)
        );
    }

}

module.exports = updateSettingsJson;
