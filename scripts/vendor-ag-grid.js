/**
 * Copy tối thiểu file AG Grid (JS + CSS) vào src/DBQuery/media/vendor/ag-grid
 * để webview không phụ thuộc node_modules — VSIX nhẹ hơn.
 *
 * Chạy: node scripts/vendor-ag-grid.js
 * (Cần đã npm install có ag-grid-community — devDependency.)
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const nm = path.join(root, "node_modules", "ag-grid-community");
const outDir = path.join(root, "src", "DBQuery", "media", "vendor", "ag-grid");

const files = [
    ["dist/ag-grid-community.min.js", "ag-grid-community.min.js"],
    ["styles/ag-grid.min.css", "ag-grid.min.css"],
    ["styles/ag-theme-balham.min.css", "ag-theme-balham.min.css"],
];

fs.mkdirSync(outDir, { recursive: true });

for (const [rel, destName] of files) {
    const src = path.join(nm, rel);
    const dest = path.join(outDir, destName);
    if (!fs.existsSync(src)) {
        console.error("Không tìm thấy:", src);
        console.error("Chạy: npm install (ag-grid-community là devDependency).");
        process.exit(1);
    }
    fs.copyFileSync(src, dest);
    console.log("✓", destName);
}
console.log("AG Grid vendor →", outDir);
