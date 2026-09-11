const vscode = require('vscode');
const RetrieveFlowCommand = require('./RetrieveFlowCommand');

/**
 * Đăng ký command và lifecycle cho tính năng Thiết kế Lấy dữ liệu FlowMulti
 * @param {vscode.ExtensionContext} context
 */
function registerRetrieveFlow(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'fbo-autocomplete.designRetrieveFlow',
            () => RetrieveFlowCommand.run(context)
        )
    );
}

module.exports = {
    registerRetrieveFlow
};
