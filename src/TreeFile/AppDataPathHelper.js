const fs = require("fs");
const path = require("path");
let vscode = null;
try {
    vscode = require("vscode");
} catch {
    vscode = null;
}

class AppDataPathHelper {
    constructor(filePath) {
        this.filePath = filePath; 
    }

    getBaseProjectPath() {
        if (!this.filePath || typeof this.filePath !== "string") {
            return '';
        }

        // 0. Nếu là file plan / .cursor / .gemini / implementation_plan.md -> không thuộc project FBO cụ thể nào -> trả về '' (nhóm Other)
        const normPath = this.filePath.replace(/\\/g, '/').toLowerCase();
        if (normPath.includes('/.cursor') || normPath.includes('/.gemini') || normPath.endsWith('.plan.md') || normPath.endsWith('/plan.md') || normPath.endsWith('.md.plan') || normPath.endsWith('.plan') || normPath.endsWith('/implementation_plan.md')) {
            return '';
        }

        // 1. Nếu đường dẫn chứa App_Data (case-insensitive) -> lấy phần trước App_Data
        const app_data_match = this.filePath.match(/^(.*?)[/\\]App_Data([/\\]|$)/i);
        if (app_data_match && app_data_match[1]) {
            return app_data_match[1];
        }

        // 2. Logic theo CustomerPro (hỗ trợ UNC path và cấu trúc CustomerPro)
        const parts = this.filePath.split(/[/\\]/);
        const index = parts.findIndex(p => p.toLowerCase() === "customerpro");
        if (index !== -1 && parts.length >= index + 4) {
            const index2 = parts.findIndex(p => p.toLowerCase() === "fdn");
            return parts.slice(0, index + (index2 === -1 ? 4 : 3)).join(path.sep);
        }

        // 3. Fallback: Nếu filePath là Web.config hoặc nằm trong thư mục chứa Web.config / App_Data
        try {
            let current_dir = fs.existsSync(this.filePath) && fs.statSync(this.filePath).isDirectory()
                ? this.filePath
                : path.dirname(this.filePath);

            while (current_dir) {
                if (fs.existsSync(path.join(current_dir, 'Web.config')) || fs.existsSync(path.join(current_dir, 'App_Data'))) {
                    return current_dir;
                }
                const parent_dir = path.dirname(current_dir);
                if (!parent_dir || parent_dir === current_dir) break;
                current_dir = parent_dir;
            }
        } catch (e) {
            // ignore fs errors
        }

        return '';
    }

    getProjectPath() {
        const base_path = this.getBaseProjectPath();
        if (!base_path) return '';
        const ProjectMappingHelper = require('../Database/ProjectMappingHelper');
        return ProjectMappingHelper.getActualRoot(base_path);
    }

    getGroupName() {
        const base_path = this.getBaseProjectPath();
        if (!base_path) return 'Other';
        const parts = base_path.split(/[/\\]/).filter(Boolean); 
        return parts.length > 1 ? parts.slice(-2).join(' - ') : (parts[0] || 'Other');
    }

    getPathAfterProject() {
        const project_path = this.getProjectPath();
        if (!project_path) return [];
        const remaining_path = this.filePath.substring(project_path.length);
        const clean_remaining = remaining_path.replace(/^[/\\]+/, ""); // loại bỏ dấu `\` đầu nếu có
        return [project_path, clean_remaining];
    }

    async pasteFilesToGroup(targetGroupPath, filePaths, generate = 0) {
        //generate = 1 => chuc nang gereateCopyFile
        let count = 0;
        const openedUris = [];
        const pastedPaths = [];
        for (const originalPath of filePaths) {
            if(generate == 0)
                this.filePath = originalPath;
            else
                this.filePath = originalPath[0];
            if (this.getGroupName() == 'Other') continue;
            if (this.getPathAfterProject().length == 1) continue;
            var destinationPath = path.join(targetGroupPath, this.getPathAfterProject()[1]);
            if(generate == 1)
                destinationPath = destinationPath.replace(path.basename(destinationPath), path.basename(originalPath[1]));
            // Nếu file đã tồn tại thì xác nhận từng cái
            if (fs.existsSync(destinationPath)) {
                const result = await vscode.window.showWarningMessage(
                    `"${destinationPath}" đã tồn tại. Bạn có muốn ghi đè không?`,
                    { modal: true },
                    "Ghi đè", "Bỏ qua"
                );
                if (result !== "Ghi đè") continue; // bỏ qua nếu không chọn ghi đè
            }
            try {
                fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
                fs.copyFileSync(this.filePath, destinationPath);
                openedUris.push(vscode.Uri.file(destinationPath));
                pastedPaths.push(destinationPath);
                count++;
            } catch (err) {
                vscode.window.showErrorMessage(`❌ Lỗi khi copy file: ${this.filePath} -> ${err.message}`);
            }
        }
        // ✅ Mở tất cả các file đã paste
        for (const uri of openedUris) {
            try {
                await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Active });
            } catch (err) {
                vscode.window.showWarningMessage(`Không thể mở file: ${uri.fsPath}`);
            }
        }
        return { count, paths: pastedPaths, openedUris };
    }
}

module.exports = AppDataPathHelper;