# 🔐 Hướng Dẫn Setup License Cho Extension

Extension này sử dụng license system dựa trên Machine ID để bảo vệ bản quyền.

## 📌 Cách Hoạt Động

- Mỗi máy tính có một **Machine ID duy nhất**
- **Windows**: Lấy từ Registry `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography\MachineGuid`
- **Mac**: Lấy từ `IOPlatformUUID` (ioreg command)
- Extension hash Machine ID và so sánh với server

## 🔑 Lấy Machine ID Cho License

### Cách 1: Dùng Script Native (Khuyến Nghị - Không Cần Node.js)

**Trên Windows (PowerShell):**
```powershell
# Chạy script PowerShell
cd path\to\fbo-autocomplete
.\get-machine-id.ps1
```

**Trên Mac (Terminal):**
```bash
# Cho phép chạy script
cd path/to/fbo-autocomplete
chmod +x get-machine-id.sh

# Chạy script
./get-machine-id.sh
```

Script sẽ hiển thị:
```
====================================
🔑 FBO EXTENSION LICENSE INFO
====================================

Platform: Windows/macOS

Raw Machine ID:
ABC-123-DEF-456-GHI-789

Hashed Machine ID (SHA-256):
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6...

====================================
📋 ADD THIS TO SERVER allowedIds:
====================================

["Your Name - Windows", "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6..."]
```

### Cách 2: Lấy Machine ID Thủ Công (Không Cần Extension Code)

**Trên Windows (PowerShell):**
```powershell
# 1. Lấy Machine ID từ Registry
$machineId = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid).MachineGuid
Write-Host "Machine ID: $machineId"

# 2. Hash Machine ID bằng SHA-256
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($machineId)
$hash = $sha256.ComputeHash($bytes)
$hashedId = [System.BitConverter]::ToString($hash).Replace('-','').ToLower()
Write-Host "Hashed ID: $hashedId"
```

**Trên Mac (Terminal):**
```bash
# 1. Lấy Machine ID từ IOPlatformUUID
machineId=$(ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID | awk '{print $3}' | tr -d '"')
echo "Machine ID: $machineId"

# 2. Hash Machine ID bằng SHA-256
hashedId=$(echo -n "$machineId" | shasum -a 256 | awk '{print $1}')
echo "Hashed ID: $hashedId"
```

### Cách 3: Dùng Node.js (Nếu Đã Cài Node.js)

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

1. **Chạy `get-machine-id.ps1` trên Windows PC:**
   ```powershell
   .\get-machine-id.ps1
   # Output: ["Nguyen Van A - Windows", "a1b2c3d4e5f6..."]
   ```

2. **Chạy `get-machine-id.sh` trên MacBook:**
   ```bash
   ./get-machine-id.sh
   # Output: ["Nguyen Van A - Mac", "x9y8z7w6v5u4..."]
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
1. Chạy `./get-machine-id.sh` trên Mac (hoặc dùng commands thủ công)
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
