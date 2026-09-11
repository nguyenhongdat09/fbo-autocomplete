const vscode = require("vscode");

async function CopyPath() {
    const paths = this.getPathsSelect();
    if (!paths || paths.length === 0) return;
    await vscode.env.clipboard.writeText(paths.join('\n'));
}

module.exports = {
    CopyPath
};
