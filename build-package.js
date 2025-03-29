const fs = require("fs");
const { execSync } = require("child_process");

console.log("🚀 Bắt đầu quá trình đóng gói extension...");

// 1. Chạy npm install --production
console.log("📦 Cài đặt dependencies production...");
execSync("npm install --production", { stdio: "inherit" });

// 2. Cài đặt Webpack
console.log("🛠 Cài đặt Webpack...");
execSync("npm install webpack webpack-cli --save-dev", { stdio: "inherit" });

// 3. Build project
console.log("⚒ Chạy build...");
execSync("npm run build", { stdio: "inherit" });

// 4. Chỉnh sửa package.json
console.log("📜 Sửa package.json...");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
packageJson.dependencies = {
  "level-rocksdb": "^5.0.0",
  "rocksdb": "^5.2.1"
}; 
packageJson.main =  "./dist/extension.js", 
fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));

// 5. Chạy npm install --production lần nữa để loại bỏ dependencies không cần thiết
console.log("📦 Dọn dẹp dependencies...");
execSync("npm install --production", { stdio: "inherit" });

// 6. Đóng gói extension
console.log("📦 Đóng gói extension với vsce...");
execSync("vsce package", { stdio: "inherit" });

// 7. Phục hồi package.json để tiếp tục code
console.log("🔄 Phục hồi package.json...");
packageJson.dependencies = {
  "axios": "^1.7.9",
  "exceljs": "^4.4.0",
  "googleapis": "^144.0.0",
  "googletrans": "^1.0.21",
  "mssql": "^11.0.1",
  "level-rocksdb": "^5.0.0",
  "rocksdb": "^5.2.1",
};
packageJson.main =  "./src/extension.js", 
fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));

// 8. Chạy npm install --production để tiếp tục code
console.log("📦 Khôi phục môi trường code...");
execSync("npm install --production", { stdio: "inherit" });

console.log("✅ Hoàn tất!");
