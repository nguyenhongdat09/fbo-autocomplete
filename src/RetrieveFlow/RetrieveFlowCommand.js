const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const AppDataPathHelper = require('../TreeFile/AppDataPathHelper');
const RetrieveFlowPanel = require('./RetrieveFlowPanel');

class RetrieveFlowCommand {
    /**
     * @param {vscode.ExtensionContext} context
     */
    static async run(context) {
        const editor = vscode.window.activeTextEditor;
        let controllers_root = '';
        let active_file_path = '';

        if (editor && editor.document && editor.document.uri.scheme === 'file') {
            active_file_path = editor.document.fileName;
            const helper = new AppDataPathHelper(active_file_path);
            const base_proj = helper.getBaseProjectPath();
            if (base_proj) {
                const candidate = path.join(base_proj, 'App_Data', 'Controllers');
                if (fs.existsSync(candidate)) {
                    controllers_root = candidate;
                }
            }
        }

        // Fallback sang cấu hình workspace nếu helper chưa ra kết quả
        if (!controllers_root) {
            const config_root = vscode.workspace.getConfiguration('fbo-autocomplete').get('controllersRoot');
            if (config_root && fs.existsSync(config_root)) {
                controllers_root = config_root;
            }
        }

        // Fallback duyệt các workspace folders nếu có
        if (!controllers_root && vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const candidate = path.join(folder.uri.fsPath, 'App_Data', 'Controllers');
                if (fs.existsSync(candidate)) {
                    controllers_root = candidate;
                    break;
                }
            }
        }

        const config = vscode.workspace.getConfiguration('fbo-autocomplete');
        const sql_temp_folder = config.get('sqlTempFolder') || '';

        RetrieveFlowPanel.createOrShow(context, {
            controllers_root,
            sql_temp_folder,
            active_file_path
        });
    }
}

module.exports = RetrieveFlowCommand;
