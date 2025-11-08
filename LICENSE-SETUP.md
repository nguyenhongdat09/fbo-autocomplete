# 🔐 Hướng Dẫn Setup License Cho Extension

Extension này sử dụng license system dựa trên Machine ID để bảo vệ bản quyền.

## 📌 Cách Hoạt Động

- Mỗi máy tính có một **Machine ID duy nhất**
- **Windows**: Lấy từ Registry `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography\MachineGuid`
- **Mac**: Lấy từ `IOPlatformUUID` (ioreg command)
- Extension hash Machine ID và so sánh với server

## 🔑 Lấy Machine ID Cho License

### Cách 1: Dùng Script Tự Động (Khuyến Nghị)

**Trên Windows:**
```bash
cd path/to/fbo-autocomplete
npm install
node get-machine-id.js
```

**Trên Mac:**
```bash
cd path/to/fbo-autocomplete
npm install
node get-machine-id.js
```

Script sẽ hiển thị:
```
====================================
🔑 FBO EXTENSION LICENSE INFO
====================================

Platform: darwin

Raw Machine ID:
ABC-123-DEF-456-GHI-789

Hashed Machine ID (SHA-256):
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6...

====================================
📋 ADD THIS TO SERVER allowedIds:
====================================

["Your Name - darwin", "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6..."]
```

### Cách 2: Lấy Machine ID Thủ Công

**Trên Windows (PowerShell):**
```powershell
# 1. Lấy Machine ID
node -e "console.log(require('node-machine-id').machineIdSync(false))"

# 2. Hash Machine ID (thay YOUR_MACHINE_ID bằng ID ở bước 1)
$machineId = "YOUR_MACHINE_ID"
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($machineId)
$hash = $sha256.ComputeHash($bytes)
[System.BitConverter]::ToString($hash).Replace('-','').ToLower()
```

**Trên Mac (Terminal):**
```bash
# 1. Lấy Machine ID
node -e "console.log(require('node-machine-id').machineIdSync(false))"

# 2. Hash Machine ID (thay YOUR_MACHINE_ID bằng ID ở bước 1)
echo -n "YOUR_MACHINE_ID" | shasum -a 256 | awk '{print $1}'
```

## 📝 Cấu Trúc Server License

Cập nhật file JSON trên server với cấu trúc sau:

```json
{
  "active": true,
  "allowedIds": [
    ["Nguyen Van A - Windows PC", "abc123def456..."],
    ["Nguyen Van A - MacBook", "xyz789uvw012..."],
    ["Tran Thi B - Windows Laptop", "qwe456rty789..."]
  ]
}
```

### Ví Dụ Thực Tế:

Nếu bạn muốn user **"Nguyen Van A"** dùng được trên CẢ Windows và Mac:

1. **Chạy `node get-machine-id.js` trên Windows PC:**
   ```
   ["Nguyen Van A - Windows", "a1b2c3d4e5f6..."]
   ```

2. **Chạy `node get-machine-id.js` trên MacBook:**
   ```
   ["Nguyen Van A - Mac", "x9y8z7w6v5u4..."]
   ```

3. **Add CẢ 2 vào server:**
   ```json
   {
     "active": true,
     "allowedIds": [
       ["Nguyen Van A - Windows", "a1b2c3d4e5f6..."],
       ["Nguyen Van A - Mac", "x9y8z7w6v5u4..."]
     ]
   }
   ```

## ✅ Kết Quả

- User có thể dùng extension trên **cả Windows và Mac** với cùng 1 license
- Server chỉ cần lưu cả 2 Machine IDs (đã hash)
- Extension tự động detect và match với machine ID hiện tại

## 🔧 Troubleshooting

### Extension báo "Invalid license" trên Mac nhưng chạy được trên Windows?

**Nguyên nhân:** Bạn chỉ add Machine ID của Windows vào server.

**Giải pháp:**
1. Chạy `node get-machine-id.js` trên Mac
2. Copy Hashed Machine ID
3. Add vào `allowedIds` trên server

### Làm sao biết Machine ID nào đang được dùng?

Mở **Developer Tools** trong VSCode (Help > Toggle Developer Tools), xem Console log:
```
rawId: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6...
```

## 📞 Support

Nếu gặp vấn đề với license, liên hệ admin và cung cấp:
1. Platform (Windows/Mac)
2. Raw Machine ID (từ script get-machine-id.js)
