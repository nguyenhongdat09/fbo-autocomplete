const vscode = require('vscode');
const path = require('path');
class OpenWithVS2008 {
    static open(uri) {
        const filePath = uri.fsPath;
        const vs2008Path = '"C:\\Program Files (x86)\\Microsoft Visual Studio 9.0\\Common7\\IDE\\devenv.exe"';
        var dir = path.dirname(filePath);
        var baseName = path.basename(dir);
        var baseNameArr = [
            {
                baseName: 'Dir',
                file_xsd: 'Dir.xsd',
            },
            {
                baseName: 'Grid',
                file_xsd: 'Grid.xsd',
            },
            {
                baseName: 'Filter',
                file_xsd: 'Dir.xsd',
            },
            {
                baseName: 'Report',
                file_xsd: 'Report.xsd',
            },
            {
                baseName: 'Upload',
                file_xsd: 'Import.xsd',
            },
        ];
        var file_xsd = '';
        for (const item of baseNameArr) {
            if (baseName.includes(item.baseName)) {
                file_xsd = item.file_xsd;
                break;
            }
        }
        const filePath_xsd = path.join(dir, file_xsd);
        const command = `${filePath_xsd} ${vs2008Path} `;
        require('child_process').exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error(err);
                return;
            }
        });
    }
}
module.exports = OpenWithVS2008;