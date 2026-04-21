const vscode = require('vscode');
const path = require('path');
const cp = require('child_process');
class OpenWithVS2008 {
    static open(uri) {
        const filePath = uri.fsPath;
        const config = vscode.workspace.getConfiguration('fbo-autocomplete');
        const vs2008Path = config.get('Vs2008Path', 'C:\\Program Files (x86)\\Microsoft Visual Studio 9.0\\Common7\\IDE\\devenv.exe');
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
            }
            ,
            {
                baseName: 'Lookup',
                file_xsd: 'Lookup.xsd',
            }
        ]
        var file_xsd = '';
        baseNameArr.forEach(ele => {
            if(baseName == ele.baseName){
                if(baseName == 'Filter') 
                    file_xsd =  dir.replace('Filter', 'Dir')  + '\\' + 'Dir.xsd';
                else
                file_xsd =  dir  + '\\' + ele.file_xsd;
            }
        })  
        // Thêm tham số /edit để mở file trong cửa sổ hiện tại
        // Use execFile to avoid shell parsing issues when the VS path contains spaces
        // Mở .xsd trước, file XML sau: devenv thường focus tab mở cuối → giữ focus đúng file đang làm.
        const args = ['/edit'];
        if (file_xsd) {
            args.push(file_xsd);
        }
        args.push(filePath);
        cp.execFile(vs2008Path, args, (err) => {
            if (err) {
                vscode.window.showErrorMessage(`Failed to open file in Visual Studio 2008: ${err.message} file: ${filePath}`);
            }
        });
    }
}
module.exports = OpenWithVS2008;