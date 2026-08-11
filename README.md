# **<font color="green">FBO Autocomplete Code</font>** 
## Tính năng
- Tự động complete code trên các file ở Folder: Grid, Dir, Filter.
- Tự động gen thẻ `<view>` dựa trên các field trong file Grid
- ##### Chi tiết cú pháp
    - ##### Phần autocomplete
        -  `$f.field;` dùng cho file Dir và Filter ví dụ: `$f.ma_kh;`
        -  `$gi.field;` dùng cho file Grid các trường dạng **Input**: `$gi.ma_kh;`
        -  `$gv.field;` dùng cho file Grid các trường dạng **View**: `$gv.ma_kh;`
    - ##### Phần gen thẻ `<view>`
        - `$gff;` 
    - ##### Phần gen code tự động ở mobile (đặc trưng là có tiền tố $m)
        - `$mgp` dùng gen ra Processing file Filter/Dir
        - `$mgr` dùng gen ra phần thẻ <row> file Filter/Grid
     - ##### Phần gen processing FBO  
        - `$gpf;` 
    - ##### Tự động phân tích $g.a của các file grid detail rồi gen code switch case
        - `$gccl;` 
### Cách cài đặt 
## Giải thích tổng quát cách thức hoạt động
- Khi **Render XML To Database** Gói sẽ tìm các file trong cả 3 folder là Grid, Dir, Filter phân tích các trường `<field>` lấy name ra và lưu vào database. Lúc này mới bắt đầu nhập `$f, $gi, $gv` thì mới ra dữ liệu
    - #### Quy tắc nhập
        - Nếu là trường bình thường thì nhập `$f.field;`
        - Nếu là lookup thì nhập `$f.fieldlk;`
        - Nếu là AutoComplete thì nhập `$f.fieldat;`
## Autocomplete code dạng hàm, biến 
- Nhập **Ctrl + Shift + P** Nhập **Get Data Autocomplete** để lấy dữ liệu của sheet Autocomplete trên GG sheet Chung FSD 
## Translate 
- Copy text và bấm **Ctrl + Shift + V** để dịch đoạn vừa copy thành tiếng việt
## Convert To Excel 
- Ở tại file Grid Bấm **Ctrl + Shift + P** nhập **Add Field To Report File** để gen các trường trong grid thành các field bên file Report cùng tên 
    + Ví dụ: ở file Grid zcaa.xml bấm như trên sẽ tìm file Report zcaa.xml tương ứng để gen ra các trường h_a, h_b .....
## Run SQL
- Chọn database trên **status bar** (click vào "DB: ...") rồi mở file **.sql**. Dùng **FBO: Run SQL File** (menu chuột phải hoặc nút Run trên editor) để chạy toàn file hoặc đoạn SQL đang chọn. Kết quả hiển thị dạng Messages trong Output; lỗi được đẩy vào Problems.
## Peek SQL
- Trong file **XML** hoặc **.sql**: tô chọn tên object (proc, view, function, bảng), chuột phải chọn **FBO: Peek SQL**. Extension kiểm tra object trong DB đang chọn: nếu là **bảng (type U)** thì hiển thị danh sách cột (Column Name, Type); nếu là **proc/view/function** thì lấy định nghĩa bằng `sp_helptext` và hiển thị trong Hover. Trong Hover có link **Copy to clipboard** để copy nội dung đã peek.
## Check Legacy Dir/Filter
- Kiểm tra field thiếu so với item và ngược lại 
- Kiểm tra 111 so với field đằng sau của <item> xem có thiếu hay thừa  
 ## Check File Options/Message.xml
- Kiểm tra duplicate field trong Fields  
## Paste file dự án này qua dự án khác 
- Chọn nhiều file và thả vào header dự án khác
## Tìm Definition của Lookup hoặc file trong Keyword "showForm()"
- Ctrl + Click chuột vào controller thì sẽ thấy được definition ví dụ controller="Item" hoặc g.showForm('zzzFilter)
- Ctrl + Click chuột vào action id, case , button git
- Hoặc dùng Ctrl + Shift + P tìm FBO: Show All File in show form bấm vào thì sẽ show tất cả file liên quan trong code showForm('filexxx')
## Mở file excel, rpt từ file report
- **Ctrl + Shift + P** chức năng Open Report File vào file rpt hoặc excel trong thẻ <reportfile> để mở file đó nhanh chóng

## Tìm file theo tên trong group (Search Result)
- Chuột phải **group** trên cây FBO Project → **FBO: Group filter** (hoặc icon lọc trên group).
- Nhập từ khóa tên file với các cú pháp được hỗ trợ:
  - **Khoảng trắng (Toán tử AND)**: Tìm file chứa tất cả các từ khóa. VD: `SVTR grid xml` (lấy file chứa cả 3 từ).
  - **Dấu phẩy `,` (Toán tử OR)**: Khớp 1 trong các từ khóa. VD: `SVTran,ARTran dir xml` (tìm file SVTran HOẶC ARTran nằm trong thư mục dir có đuôi xml).
  - `*` **hoặc** `%`: Đại diện cho nhiều ký tự bất kỳ. VD: `SV*TR` hoặc `SV%TR` (khớp với `SVTR`, `SVAATR`, `SV_12_TR`...).
  - `?` **hoặc** `_`: Đại diện cho **đúng 1 ký tự** bất kỳ. VD: `SV?R` hoặc `SV_R` (khớp với `SVAR`, `SV1R` nhưng không khớp `SVAAR`).
- Kết quả hiển thị tab **Search Result** trong panel Search Result (danh sách file khớp).

## Tìm text trong nội dung file group (Search text in group)
- Chuột phải **group** → **Search text in group**.
- Bước 1: nhập chuỗi cần tìm (tìm đúng chuỗi, không phân biệt hoa thường mặc định).
- Bước 2: chọn loại file (`*.js`, `*.xml`, `*.txt`, `*.aspx`, `*.ent`, `*.f` — chỉnh mặc định trong Settings: `fbo-autocomplete.groupContentSearchExtensions`).
- Kết quả tab **Text Search**: cây **file → dòng match** (preview có highlight). Click dòng → mở file và select đúng vị trí.
- Phạm vi quét: ưu tiên `App_Data/Controllers` trong group (nếu có).
