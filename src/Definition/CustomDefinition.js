const vscode = require('vscode');
const ControllerDefinitionProvider = require('./providers/ControllerDefinitionProvider');
const ShowFormDefinitionProvider = require('./providers/ShowFormDefinitionProvider');
const ActionCaseDefinitionProvider = require('./providers/ActionCaseDefinitionProvider');
const ButtonDefinitionProvider = require('./providers/ButtonDefinitionProvider');
const ViewFieldDefinitionProvider = require('./providers/ViewFieldDefinitionProvider');
const FunctionDefinitionProvider = require('./providers/FunctionDefinitionProvider');
const RequestActionDefinitionProvider = require('./providers/RequestActionDefinitionProvider');
const ReportTemplateCommandProvider = require('./providers/ReportTemplateCommandProvider');

/**
 * Main Definition Provider - Orchestrates all sub-providers
 * (Entity F12 tach rieng -> command peekEntityDefinition)
 */
class CustomDefinition {
    constructor() {
        this.providers = [
            new ControllerDefinitionProvider(),
            new ShowFormDefinitionProvider(),
            new ActionCaseDefinitionProvider(),
            new ButtonDefinitionProvider(),
            new ViewFieldDefinitionProvider(),
            new FunctionDefinitionProvider(),
            new RequestActionDefinitionProvider(),
        ];
        this.reportCommandProvider = new ReportTemplateCommandProvider();
    }

    run(context) {
        const definitionProvider = vscode.languages.registerDefinitionProvider(
            { scheme: 'file', language: 'xml' },
            {
                provideDefinition: this.provideDefinition.bind(this)
            }
        );
        
        // Đăng ký thêm DocumentLinkProvider để xử lý Ctrl+Click không bị preview
        const linkProvider = vscode.languages.registerDocumentLinkProvider(
            { scheme: 'file', language: 'xml' },
            {
                provideDocumentLinks: async (document, token) => {
                    const allLinks = [];
                    for (const provider of this.providers) {
                        if (typeof provider.provideDocumentLinks === 'function') {
                            const links = await provider.provideDocumentLinks(document, token);
                            if (links && links.length > 0) {
                                allLinks.push(...links);
                            }
                        }
                    }
                    return allLinks;
                }
            }
        );

        this.reportCommandProvider.register(context);
        context.subscriptions.push(definitionProvider, linkProvider);
    }

    async provideDefinition(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
        if (!wordRange) return null;

        const word = document.getText(wordRange);

        for (const provider of this.providers) {
            const result = await Promise.resolve(
                provider.provideDefinition(document, word, position)
            );
            // true = đã mở file thủ công (preview: false), không trả Location để tránh mở lại dạng preview
            if (result === true) return null;
            if (result) return result;
        }

        return null;
    }
}

module.exports = CustomDefinition;
