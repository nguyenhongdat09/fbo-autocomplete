const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

async function deleteStruct(group) {
    if (!group) return;
    try {
        //Join vơi App_Data\Controllers\Structure
        var folderStruct = path.join(group.resourceUri.fsPath,  'App_Data', 'Controllers', 'Structure');
        var folderDelete = ['App', 'Dir', 'Filter', 'Grid', 'Sys']
        folderDelete.forEach(folderName => {
            var folder = path.join(folderStruct, folderName);
            //Loop xóa tất cả file trong folder
            if (fs.existsSync(folder)) {
                var files = fs.readdirSync(folder);
                files.forEach(f => {
                    var filePath = path.join(folder, f);
                    fs.unlinkSync(filePath);
                });
            }
        });
        
    } catch (err) {
        vscode.window.showErrorMessage(` ${err.message}`);
    }
}

module.exports = {
    deleteStruct
};
