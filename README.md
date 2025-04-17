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

## Cách cài đặt 
- Sau khi install .vsix mở file bất kỳ ở một trong 3 Folder Grid, Dir, Filter bấm **Ctrl + Shift + P** Nhập **Render XML To Database** => Enter. 
## Giải thích tổng quát cách thức hoạt động
- Khi **Render XML To Database** Gói sẽ tìm các file trong cả 3 folder là Grid, Dir, Filter phân tích các trường `<field>` lấy name ra và lưu vào database. Lúc này mới bắt đầu nhập `$f, $gi, $gv` thì mới ra dữ liệu
    - #### Quy tắc nhập
        - Nếu là trường bình thường thì nhập `$f.field;`
        - Nếu là lookup thì nhập `$f.fieldlk;`
        - Nếu là AutoComplete thì nhập `$f.fieldat;`
## Hiện Code Lens 
- Nhập **Ctrl + Shift + P** Nhập **Show/Hide Entity CodeLens** 
![Alt text](/media/ShowCodeLens.PNG)
## Autocomplete code dạng hàm, biến 
- Nhập **Ctrl + Shift + P** Nhập **Get Data Autocomplete** để lấy dữ liệu của sheet Autocomplete trên GG sheet Chung FSD 
## Translate 
- Copy text và bấm **Ctrl + Shift + V** để dịch đoạn vừa copy thành tiếng việt
## Convert To Excel 
- Ở tại file Grid Bấm **Ctrl + Shift + P** nhập **Add Field To Report File** để gen các trường trong grid thành các field bên file Report cùng tên 
    + Ví dụ: ở file Grid zcaa.xml bấm như trên sẽ tìm file Report zcaa.xml tương ứng để gen ra các trường h_a, h_b .....
## Check Legacy Dir/Filter
- Kiểm tra field thiếu so với item và ngược lại 
- Kiểm tra 111 so với field đằng sau của <item> xem có thiếu hay thừa  
 ## Check File Options/Message.xml
- Kiểm tra duplicate field trong Fields  
## Paste file dự án này qua dự án khác 
- Chọn các file ở group bấm **CTRL+ SHIFT+ C** để copy => Chọn cái header của group muốn paste bấm **CTRL+ SHIFT+ L** để dán vào

 
