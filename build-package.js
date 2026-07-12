const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// Run: node build-package.js
//   FBO_FORCE_NPM_INSTALL=1 — luôn chạy npm install đầu (mặc định: bỏ qua nếu đã có webpack).

const pkgPath = path.resolve(__dirname, "package.json");
const pkgWriteTmp = path.resolve(__dirname, "package.json.__fbo_writing__");
const pkgBackupPath = path.resolve(
    os.tmpdir(),
    `fbo-autocomplete.package.json.__fbo_packaging_backup__.${process.pid}`
);
const lockPath = path.resolve(__dirname, "package-lock.json");
const lockStashPath = path.resolve(__dirname, "package-lock.json.__fbo_packaging__");
const vscodeIgnorePath = path.resolve(__dirname, ".vscodeignore");
const vscodeIgnoreTmpPath = path.resolve(
    __dirname,
    ".vscodeignore.__fbo_packaging__"
);
const vscodeIgnoreBackupPath = path.resolve(
    os.tmpdir(),
    `fbo-autocomplete.vscodeignore.__fbo_packaging_backup__.${process.pid}`
);

const pkgAtStart = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
/** Giữ nguyên dependencies + main trước khi sửa — không cần hardcode từng package mới (vd ag-grid-community). */
const savedDependencies = JSON.parse(JSON.stringify(pkgAtStart.dependencies || {}));
const savedDevDependencies = JSON.parse(
    JSON.stringify(pkgAtStart.devDependencies || {})
);
const savedMain = pkgAtStart.main || "./src/extension.js";

const isWin = process.platform === "win32";

/** Tránh npm gọi open() lên package-lock.json (Windows errno -4094 khi Defender/OneDrive/IDE khóa file). */
let lockStashed = false;

function stashPackageLock() {
    if (!fs.existsSync(lockPath)) return;
    if (fs.existsSync(lockStashPath)) {
        try {
            fs.unlinkSync(lockStashPath);
        } catch {
            /* ignore */
        }
    }
    try {
        fs.renameSync(lockPath, lockStashPath);
        lockStashed = true;
        console.log(
            "📎 Tạm đổi tên package-lock.json → package-lock.json.__fbo_packaging__ (tránh lỗi khóa file khi npm chạy)."
        );
    } catch (e) {
        console.warn(
            "⚠ Không đổi tên được package-lock.json (có thể đang bị khóa). Script vẫn dùng --no-package-lock.",
            e && e.message
        );
    }
}

function removeAdhocPackageLock() {
    if (fs.existsSync(lockPath)) {
        try {
            fs.unlinkSync(lockPath);
            console.log("📎 Đã xóa package-lock.json tạm do npm tạo trong lúc đóng gói.");
        } catch (e) {
            console.warn("⚠ Không xóa được package-lock.json tạm:", e && e.message);
        }
    }
}

function unstashPackageLock() {
    if (!lockStashed) return;
    removeAdhocPackageLock();
    try {
        if (fs.existsSync(lockStashPath)) {
            fs.renameSync(lockStashPath, lockPath);
            console.log("📎 Đã khôi phục package-lock.json.");
        }
    } catch (e) {
        console.error(
            "❌ Không khôi phục được package-lock.json. Đổi tay tên thủ công:",
            lockStashPath,
            "→ package-lock.json"
        );
        throw e;
    } finally {
        lockStashed = false;
    }
}

/**
 * @param {number} ms
 */
function sleepMs(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        /* sync delay cho retry npm trên Windows */
    }
}

function hasLocalWebpack() {
    return (
        fs.existsSync(path.join(__dirname, "node_modules", "webpack", "package.json")) &&
        fs.existsSync(path.join(__dirname, "node_modules", "webpack-cli", "package.json"))
    );
}

/** Cờ npm: không đọc/ghi lock (kết hợp stash để chắc chắn). */
const NPM_INSTALL_FLAGS = "--no-audit --no-fund --no-package-lock";
const NPM_INSTALL_WITH_DEV_FLAGS = `--include=dev ${NPM_INSTALL_FLAGS}`;

/**
 * @param {string} command
 * @param {string} label
 */
function execWithRetries(command, label) {
    const attempts = 6;
    const delays = [0, 300, 700, 1500, 3000, 5000];
    let lastErr;
    const opts = {
        stdio: "inherit",
        cwd: __dirname,
        shell: isWin,
        env: {
            ...process.env,
            npm_config_update_notifier: "false",
        },
    };
    for (let i = 0; i < attempts; i++) {
        if (delays[i] > 0) {
            console.log(`⏳ ${label}: đợi ${delays[i]}ms rồi thử lại (${i + 1}/${attempts})...`);
            sleepMs(delays[i]);
        }
        try {
            execSync(command, opts);
            return;
        } catch (e) {
            lastErr = e;
            if (i < attempts - 1) {
                console.warn(`⚠ ${label} lỗi (lần ${i + 1}), thử lại...`);
            }
        }
    }
    console.error("\n── Gợi ý khi npm báo UNKNOWN / errno -4094 (Windows) ──");
    console.error("1) Đóng Cursor/VS Code rồi chạy lại trong CMD ngoài thư mục project.");
    console.error("2) Tạm tắt real-time scan thư mục project trong Windows Defender / antivirus.");
    console.error("3) OneDrive/Dropbox: tạm dừng sync hoặc copy project ra E:\\dev\\... (không khoảng trắng).");
    console.error("4) Nếu thấy file package-lock.json.__fbo_packaging__ — đổi tên lại thành package-lock.json.\n");
    throw lastErr;
}

function printNpmLockHint() {
    console.log(
        "   (Script tạm ẩn package-lock + dùng --no-package-lock để tránh lỗi mở file trên Windows.)"
    );
}

/**
 * Ghi package.json trên Windows hay lỗi UNKNOWN -4094 (IDE/Defender khóa file).
 * Ghi file tạm rồi unlink + rename, kèm retry.
 * @param {object} packageJson
 */
function writePackageJsonRobust(packageJson) {
    const text = JSON.stringify(packageJson, null, 2);
    const attempts = 12;
    const delays = [0, 100, 200, 350, 500, 800, 1200, 1800, 2500, 3500, 5000, 7000];
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        if (delays[i] > 0) {
            console.log(
                `⏳ Ghi package.json: đợi ${delays[i]}ms (lần ${i + 1}/${attempts})...`
            );
            sleepMs(delays[i]);
        }
        try {
            fs.writeFileSync(pkgWriteTmp, text, "utf8");
            try {
                if (fs.existsSync(pkgPath)) {
                    fs.unlinkSync(pkgPath);
                }
            } catch (unl) {
                try {
                    fs.unlinkSync(pkgWriteTmp);
                } catch {
                    /* ignore */
                }
                lastErr = unl;
                if (i < attempts - 1) {
                    console.warn("⚠ Chưa xóa được package.json cũ (có thể đang mở trong IDE), thử lại...");
                }
                continue;
            }
            fs.renameSync(pkgWriteTmp, pkgPath);
            return;
        } catch (e) {
            lastErr = e;
            try {
                if (fs.existsSync(pkgWriteTmp)) {
                    fs.unlinkSync(pkgWriteTmp);
                }
            } catch {
                /* ignore */
            }
            if (i < attempts - 1) {
                console.warn("⚠ Ghi package.json thất bại, thử lại...", e && e.message);
            }
        }
    }
    console.error(
        "\n── Không ghi được package.json. Đóng tab package.json trong Cursor/VS Code rồi chạy lại, hoặc chạy script trong CMD ngoài IDE. ──\n"
    );
    throw lastErr;
}

function run() {
    console.log("🚀 Bắt đầu quá trình đóng gói extension...");
    stashPackageLock();
    backupPackageJson();

    try {
        const forceNpm = process.env.FBO_FORCE_NPM_INSTALL === "1";
        if (forceNpm || !hasLocalWebpack()) {
            console.log("📦 Cài đặt dependencies (đầy đủ, cần webpack để build)...");
            printNpmLockHint();
            execWithRetries(`npm install ${NPM_INSTALL_WITH_DEV_FLAGS}`, "npm install (include dev)");
            if (!hasLocalWebpack()) {
                throw new Error(
                    "Thiếu webpack/webpack-cli sau npm install. Kiểm tra package.json hoặc npm config omit/prod."
                );
            }
        } else {
            console.log(
                "📦 Bỏ qua npm install đầu — đã có webpack trong node_modules."
            );
            console.log(
                "   Cập nhật deps: đóng IDE rồi chạy `npm install`; hoặc FBO_FORCE_NPM_INSTALL=1."
            );
        }

        console.log("⚒ Chạy build...");
        execSync("npm run build", {
            stdio: "inherit",
            cwd: __dirname,
            shell: isWin,
        });

        console.log("📋 Sao chép files BrowserHandle vào dist...");
        const filesToCopy = [
            "AnalystXML.worker.js",
            "AnalystXML.js",
            "OpenBrowser.js",
            "AnalystASPX.js",
            "syncDBOpenBrowser.js",
            "OpenLinkByChrome.js",
        ];

        filesToCopy.forEach((fileName) => {
            const src = path.resolve(__dirname, `src/TreeFile/BrowserHandle/${fileName}`);
            const dest = path.resolve(__dirname, `src/dist/${fileName}`);

            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                console.log(`✓ Sao chép ${src} → ${dest}`);
            } else {
                console.warn(`⚠ File không tìm thấy: ${src}`);
            }
        });

        console.log("📎 Copy AG Grid vào media/vendor (trước khi thu gọn package.json)...");
        execSync("node scripts/vendor-ag-grid.js", {
            stdio: "inherit",
            cwd: __dirname,
            shell: isWin,
        });

        console.log("📜 Sửa package.json...");
        if (isWin) {
            sleepMs(400);
        }
        let packageJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        /* Chỉ native — AG Grid nằm trong src/DBQuery/media/vendor (scripts/vendor-ag-grid.js). */
        packageJson.dependencies = {
            "level-rocksdb": savedDependencies["level-rocksdb"] || "^5.0.0",
            rocksdb: savedDependencies.rocksdb || "^5.2.1",
        };
        packageJson.devDependencies = {};
        packageJson.main = "./src/dist/extension.js";
        writePackageJsonRobust(packageJson);

        console.log("📦 Dọn dẹp dependencies (chỉ production / omit dev)...");
        printNpmLockHint();
        execWithRetries(
            `npm install --omit=dev ${NPM_INSTALL_FLAGS}`,
            "npm install --omit=dev"
        );

        console.log("📦 Đóng gói extension với vsce...");
        applyPackagingIgnoreOverride();
        try {
            execSync("vsce package --allow-package-secrets gcp", {
                stdio: "inherit",
                cwd: __dirname,
                shell: isWin,
            });
        } finally {
            restorePackagingIgnoreOverride();
        }

        console.log("🔄 Phục hồi package.json...");
        if (isWin) {
            sleepMs(400);
        }
        packageJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        packageJson.dependencies = savedDependencies;
        packageJson.devDependencies = savedDevDependencies;
        packageJson.main = savedMain;
        writePackageJsonRobust(packageJson);

        console.log("📦 Khôi phục môi trường code (npm install)...");
        printNpmLockHint();
        execWithRetries(`npm install ${NPM_INSTALL_FLAGS}`, "npm install (khôi phục dev)");

        console.log("✅ Hoàn tất!");
    } finally {
        restorePackageJsonFromBackup();
        unstashPackageLock();
    }
}

function preparePackagingIgnoreFileContent() {
    const base = fs.existsSync(vscodeIgnorePath)
        ? fs.readFileSync(vscodeIgnorePath, "utf8")
        : "";
    const extraRules = [
        "",
        "# Added by build-package.js for packaging only (đồng bộ với .vscodeignore)",
        ".codegraph/**",
        ".codegraph-*/**",
        ".cursor/**",
        "scripts/**",
        "build-package.js",
        "debug.log",
        "PivotExcel/**",
        "*.vsix",
        "src/Database/extensionKey.dat",
        "",
    ].join("\n");
    return base + extraRules;
}

function applyPackagingIgnoreOverride() {
    const nextContent = preparePackagingIgnoreFileContent();

    if (fs.existsSync(vscodeIgnoreBackupPath)) {
        try {
            fs.unlinkSync(vscodeIgnoreBackupPath);
        } catch {
            /* ignore */
        }
    }

    if (fs.existsSync(vscodeIgnorePath)) {
        fs.copyFileSync(vscodeIgnorePath, vscodeIgnoreBackupPath);
    } else {
        fs.writeFileSync(vscodeIgnoreBackupPath, "", "utf8");
    }

    fs.writeFileSync(vscodeIgnorePath, nextContent, "utf8");
}

function restorePackagingIgnoreOverride() {
    if (!fs.existsSync(vscodeIgnoreBackupPath)) {
        return;
    }

    try {
        const oldContent = fs.readFileSync(vscodeIgnoreBackupPath, "utf8");
        fs.writeFileSync(vscodeIgnorePath, oldContent, "utf8");
    } finally {
        try {
            fs.unlinkSync(vscodeIgnoreBackupPath);
        } catch {
            /* ignore */
        }
    }

    if (fs.existsSync(vscodeIgnoreTmpPath)) {
        try {
            fs.unlinkSync(vscodeIgnoreTmpPath);
        } catch {
            /* ignore */
        }
    }
}

function backupPackageJson() {
    try {
        fs.copyFileSync(pkgPath, pkgBackupPath);
    } catch (e) {
        console.error("❌ Không backup được package.json trước khi đóng gói:", e && e.message);
        throw e;
    }
}

function restorePackageJsonFromBackup() {
    if (!fs.existsSync(pkgBackupPath)) {
        return;
    }
    try {
        const backupText = fs.readFileSync(pkgBackupPath, "utf8");
        const backupJson = JSON.parse(backupText);
        writePackageJsonRobust(backupJson);
    } catch (e) {
        console.error("❌ Không khôi phục được package.json từ backup:", e && e.message);
        throw e;
    } finally {
        try {
            if (fs.existsSync(pkgBackupPath)) {
                fs.unlinkSync(pkgBackupPath);
            }
        } catch {
            /* ignore */
        }
    }
}

run();
