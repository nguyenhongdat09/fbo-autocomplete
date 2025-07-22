const CryptoJS = require("crypto-js");
const https = require('https'); 
const crypto = require('crypto');
const vscode = require('vscode');
const encrypted = 'U2FsdGVkX18ll/362ncJIN0YRq9ru+8OKr1vUV6dsW+8GfHuXKDXGgv509sY5av/I2T55u4XXGisvnBVTLDBuGwkEM/tOGoWuxk5Tc8jqBsZn25dGWVpnkRzqYSOAt8u';
const bytes = CryptoJS.AES.decrypt(encrypted, 'datnh');
const licenseUrl = bytes.toString(CryptoJS.enc.Utf8);
const { machineIdSync } = require('node-machine-id');
const rawId = machineIdSync(false);

//reg query HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography /v MachineGuid    CMD command
function checkLicense() {
    return new Promise((resolve) => {
        https.get(licenseUrl, (res) => {
       
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.active || !Array.isArray(json.allowedIds)) {
                        return resolve(false);
                    }
                    const valid = json.allowedIds.some(([_, rawKey]) => {
                        const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');
                        return hashed === rawId;
                    });
                    if (!valid) {
                        vscode.window.showErrorMessage('Invalid fbo-key');
                    } 
                    return resolve(valid);
                } catch (e) {
                    vscode.window.showErrorMessage('Invalid license format');
                    return resolve(false);
                }
            });
        }).on('error', (e) => {
            vscode.window.showErrorMessage('License fetch failed: ' + e.message);
            return resolve(false);
        });
    });
}
exports.checkLicense = checkLicense;