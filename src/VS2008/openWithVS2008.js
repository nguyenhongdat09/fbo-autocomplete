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
        const command = `${vs2008Path} /edit "${filePath}" "${file_xsd}"`;
        cp.exec(command, (err) => {
            if (err) {
                vscode.window.showErrorMessage(`Failed to open file in Visual Studio 2008: ${err.message} file: ${filePath}`);
            } 
        });
    }
}
module.exports = OpenWithVS2008;