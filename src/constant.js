const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
function Constant(context) {
    const sheetId = (() => {
        const packagePath = path.join(context.extensionPath, 'package.json');
        const json = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        return json.sheetIdGoogleSheet;
    })();

    this.sheetId = sheetId;
}
  
module.exports = Constant;