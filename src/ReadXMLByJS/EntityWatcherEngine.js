let vscode;
try {
    vscode = require('vscode');
} catch (e) {}
const path = require('path');
const EntityLevelStore = require('./EntityLevelStore');
class EntityWatcherEngine {
    constructor() {
        this.disposables = [];
    }

    /**
     * @param {vscode.ExtensionContext} context
     */
    init(context) {
        // 1. Lắng nghe sự kiện lưu file (Ctrl + S) để reload entity và đẩy vào LevelDB
        const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
            const filePath = document.fileName;
            const ext = path.extname(filePath).toLowerCase();
            
            if (['.ent', '.txt', '.xml', '.inc'].includes(ext)) {
                // 1. Xóa RAM cache để buộc nạp lại dữ liệu mới nhất
                require('./entityResolver').invalidateCache(filePath);
                
                const projectId = this.extractProjectId(filePath);
                if (projectId) {
                    // 2. Nếu file phụ thuộc (.ent, .txt, .inc) thay đổi -> làm mới dependency trong LevelDB
                    if (['.ent', '.txt', '.inc'].includes(ext)) {
                        await EntityLevelStore.invalidateByDependency(projectId, filePath);
                    }
                }

                // 3. Khi Ctrl + S trên file XML: Parse lại entity và đẩy trực tiếp vào LevelDB
                if (ext === '.xml') {
                    try {
                        require('./entityResolver').getEntitiesForFile(filePath);
                        console.log(`[EntityWatcherEngine] Ctrl+S: Reloaded & updated LevelDB for: ${path.basename(filePath)}`);
                    } catch (err) {
                        console.error('[EntityWatcherEngine] Error updating LevelDB on save:', err);
                    }
                }
            }
        });

        // 2. Lắng nghe sự kiện mở file XML để nạp sẵn cache từ LevelDB lên RAM ngầm (Async Priming)
        const openListener = vscode.workspace.onDidOpenTextDocument(async (document) => {
            this.primeDocumentCache(document);
        });

        const activeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (editor && editor.document) {
                this.primeDocumentCache(editor.document);
            }
        });

        // Nạp ngay cho file đang mở hiện tại nếu có
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
            this.primeDocumentCache(vscode.window.activeTextEditor.document);
        }
        
        this.disposables.push(saveListener, openListener, activeListener);
        if (context) {
            context.subscriptions.push(saveListener, openListener, activeListener);
        }
        console.log('[EntityWatcherEngine] Initialized 2-way watcher listener');
    }

    async primeDocumentCache(document) {
        if (!document || !document.fileName) return;
        const filePath = document.fileName;
        if (filePath.toLowerCase().endsWith('.xml')) {
            const projectId = this.extractProjectId(filePath);
            const fileId = this.extractFileId(filePath);
            if (projectId && fileId) {
                const cached = await EntityLevelStore.getEntities(projectId, fileId);
                if (cached && cached.entities) {
                    require('./entityResolver').primeCache(filePath, cached.entities);
                }
            }
        }
    }

    /**
     * Trích xuất Project ID (Dựa trên Group Root chứa thư mục App_Data)
     * @param {string} filePath 
     * @returns {string|null} Base64 encoded project ID
     */
    extractProjectId(filePath) {
        const lowerPath = filePath.toLowerCase();
        // Cắt đến trước thư mục App_Data để lấy root của dự án
        const appDataIndex = lowerPath.indexOf(`${path.sep}app_data`);
        if (appDataIndex !== -1) {
            const projectRoot = lowerPath.substring(0, appDataIndex);
            return Buffer.from(projectRoot).toString('base64');
        }
        // Fallback for non-standard structure
        const appDataIndex2 = lowerPath.indexOf(`app_data`);
        if (appDataIndex2 !== -1) {
            const projectRoot = lowerPath.substring(0, appDataIndex2).replace(/[\\/]+$/, '');
            return Buffer.from(projectRoot).toString('base64');
        }
        return null;
    }

    extractFileId(filePath) {
        return Buffer.from(filePath.toLowerCase()).toString('base64');
    }

    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
    }
}

module.exports = new EntityWatcherEngine();
