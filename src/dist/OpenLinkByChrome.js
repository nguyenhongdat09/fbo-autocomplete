const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');

class OpenLinkByChrome {
    constructor() {
        this.config = vscode.workspace.getConfiguration('fbo-autocomplete');
    }

    tryExec(command, args) {
        return new Promise((resolve, reject) => {
            execFile(command, args || [], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    getConfigPath() {
        try {
            return this.config.get('PathChrome', null);
        } catch (e) {
            return null;
        }
    }

    async openUrlInChrome(url) {
        if (!url) throw new Error('URL is required');

        const userPath = this.getConfigPath();
        const platform = process.platform;

        try {
            if (platform === 'win32') {
                const candidates = [];
                if (userPath) candidates.push(userPath);
                candidates.push(path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'));
                candidates.push(path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'));

                let lastErr = null;
                for (const exe of candidates) {
                    try {
                        // Try to open as a new tab in existing Chrome if possible
                        await this.tryExec(exe, ['--new-tab', url]);
                        return;
                    } catch (e) {
                        // If --new-tab not supported, try launching with plain url
                        try {
                            await this.tryExec(exe, [url]);
                            return;
                        } catch (e2) {
                            lastErr = e2;
                        }
                    }
                }
                throw lastErr || new Error('No Chrome executable found on Windows');
            }

            if (platform === 'darwin') {
                try {
                    // Use AppleScript to open the URL in an existing Chrome window/tab
                    await this.tryExec('osascript', ['-e', `tell application \"Google Chrome\" to open location \"${url}\"`]);
                    return;
                } catch (e) {
                    // Fallback to `open -a` or user provided path
                    try {
                        await this.tryExec('open', ['-a', 'Google Chrome', url]);
                        return;
                    } catch (e2) {
                        if (userPath) {
                            await this.tryExec(userPath, [url]);
                            return;
                        }
                        throw e2;
                    }
                }
            }

            if (platform === 'linux') {
                const candidates = [];
                if (userPath) candidates.push(userPath);
                candidates.push('google-chrome');
                candidates.push('google-chrome-stable');
                candidates.push('chromium-browser');
                candidates.push('chromium');

                let lastErr = null;
                for (const cmd of candidates) {
                    try {
                        // try to open in existing window/tab
                        await this.tryExec(cmd, ['--new-tab', url]);
                        return;
                    } catch (e) {
                        try {
                            await this.tryExec(cmd, [url]);
                            return;
                        } catch (e2) {
                            lastErr = e2;
                        }
                    }
                }
                throw lastErr || new Error('No Chrome/Chromium binary found on Linux');
            }

            throw new Error('Unsupported platform for direct Chrome open');
        } catch (err) {
            try {
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } catch (e) {
                throw err;
            }
        }
    }
}

// Export an instance for convenience, and the class if caller wants to instantiate
module.exports = new OpenLinkByChrome();
