const fs = require("fs");
const path = require("path");

class AppDataPathHelper {
    constructor(filePath) {
        this.filePath = filePath;
        
    }

    getProjectPath() { 
        var parts = this.filePath.split(path.sep);
        const index = parts.findIndex(p => p.toLowerCase() === "customerpro");
        if (index === -1 || parts.length < index + 4) { 
            return '';
        }
        return parts.slice(0, index + 4).join(path.sep);
    }

    getGroupName() {
        var projectPath = this.getProjectPath().split('\\'); 
        return projectPath.length != 1 ? projectPath.slice(-2).join(' - ') : 'Other';
    }

    getPathAfterProject() {
        const projectPath = this.getProjectPath();
        if (!projectPath) return [];
    
        const remainingPath = this.filePath.substring(projectPath.length);
        const cleanRemaining = remainingPath.replace(/^[/\\]+/, ""); // loại bỏ dấu `\` đầu nếu có
        
        return [projectPath, cleanRemaining];
    }
}

module.exports = AppDataPathHelper;
