# FIX-16 — ENTITY `UpdatefsdSttRecRef` / `DeletefsdSttRecRef` gen **đầy đủ** (không `...`)

## Mức: Medium (SQL snippet Tran)

## Vấn đề

File SQL temp vẫn ra stub:

```xml
<!ENTITY UpdatefsdSttRecRef "
  delete a from fsdSttRecRef a where a.stt_rec = @stt_rec
  insert into fsdSttRecRef (...)
    select ..., stt_rec_dxa, stt_rec0dxa from dycn$$partition$current where ...
">
<!ENTITY DeletefsdSttRecRef "
  delete a from fsdSttRecRef a join dycn$$partition$current b ...
">
```

User cần **đủ SQL** để copy vào `Dir/{{dest_tran}}.xml` (DOCTYPE), giống fixture `YCNTran.xml`.

---

## Fixture vàng (`YCNTran.xml`)

### `UpdatefsdSttRecRef` (đủ 1 DELETE + INSERT theo từng loại link)

YCNTran thật có **2 INSERT** (DXA + DX1). Retrieve Flow **một** identity (vd. YCNDXA) chỉ gen **1 INSERT** cho cặp vết hiện tại; comment nhắc: nếu Tran đã có link khác → gộp thêm INSERT sau cùng 1 DELETE.

```xml
<!ENTITY UpdatefsdSttRecRef "
		delete a from fsdSttRecRef a where a.stt_rec = @stt_rec
		insert into fsdSttRecRef (stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, stt_rec_pre, stt_rec0pre)
			select stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, stt_rec_dxa, stt_rec0dxa
				from dycn$$partition$current
				where stt_rec_dxa &lt;&gt; '' and stt_rec = @stt_rec
">
```

### `DeletefsdSttRecRef`

```xml
<!ENTITY DeletefsdSttRecRef "
		delete a from fsdSttRecRef a join dycn$$partition$current b on a.stt_rec = b.stt_rec  where a.stt_rec = @stt_rec
">
```

(Nguồn MCP `get_xml_entities` trên `...\Dir\YCNTran.xml`.)

---

## Quyết định — thay stub trong `BeforeAfterUpdate.sql.tpl`

Trong khối `/** … */` (copy tay):

```xml
<!ENTITY UpdatefsdSttRecRef "
		delete a from fsdSttRecRef a where a.stt_rec = @stt_rec
		insert into fsdSttRecRef (stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, stt_rec_pre, stt_rec0pre)
			select stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, {{stt_rec_src_col}}, {{stt_rec0_src_col}}
				from {{dest_d_table}}$partition$current
				where {{stt_rec_src_col}} &lt;&gt; '' and stt_rec = @stt_rec
">
<!ENTITY DeletefsdSttRecRef "
		delete a from fsdSttRecRef a join {{dest_d_table}}$partition$current b on a.stt_rec = b.stt_rec where a.stt_rec = @stt_rec
">
```

### Placeholder

| Placeholder | Ví dụ YCNDXA |
|-------------|--------------|
| `{{stt_rec_src_col}}` | `stt_rec_dxa` (`trace_fields[0]`) |
| `{{stt_rec0_src_col}}` | `stt_rec0dxa` (`trace_fields[1]`) |
| `{{dest_d_table}}` | `dycn$` → render thành `dycn$$partition$current` (đúng convention FBO **hai** dấu `$`) |

### Escape trong ENTITY

Dùng `&lt;&gt;` (không viết `<>` thô) — khi dán vào DOCTYPE XML mới hợp lệ, khớp fixture.

### Mode single (bảng detail không `$`)

Nếu `dest_d_table` **không** kết thúc `$` (hiếm trên chứng từ partition): dùng tên bảng cố định, **không** nối `$partition$current`.

```xml
from {{dest_d_table}}
...
join {{dest_d_table}} b on a.stt_rec = b.stt_rec
```

Partitioned (mặc định Tran FBO): luôn `{{dest_d_table}}$partition$current`.

### Comment hướng dẫn dán (giữ + làm rõ)

```text
-- Vi tri dan tren Dir/{{dest_tran}}.xml (DOCTYPE, NGOAI CDATA):
-- &VoucherBeforeUpdate;  -> Updating (truoc #IF partition) + Deleting
-- &VoucherAfterUpdate;    -> Inserted, Updated
-- &UpdatefsdSttRecRef;    -> Inserted, Updated (sau detail da ghi)
-- &DeletefsdSttRecRef;    -> Deleting (truoc khi xoa detail)
-- Luu y: &...; phai nam NGOAI <![CDATA[...]]> neu khong entity khong expand.
```

Đồng bộ `VoucherBeforeUpdate` / `VoucherAfterUpdate` đã đủ trong template — **không** để `...`; nếu còn stub thì gen:

```xml
<!ENTITY VoucherBeforeUpdate "
	exec {{proc_name}} @stt_rec, '{{dest_d_table}}$partition$previous', '{{dest_m_table}}$partition$previous', '1', @@userID
">
<!ENTITY VoucherAfterUpdate "
	exec {{proc_name}} @stt_rec, '{{dest_d_table}}$partition$current', '{{dest_m_table}}$partition$current', '2', @@userID
">
```

---

## Việc phải làm

1. Sửa `BeforeAfterUpdate.sql.tpl` §4 — thay 2 ENTITY stub bằng body đủ như trên.
2. Test `SqlTemplateRenderer`: SQL chứa `insert into fsdSttRecRef (stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, stt_rec_pre, stt_rec0pre)`, `stt_rec_dxa &lt;&gt; ''`, `join dycn$$partition$current`; **không** còn `insert into fsdSttRecRef (...)`.
3. Cập nhật `04-sql-generator.md` — bỏ mô tả `...`; dán mẫu đủ.

## Done

- [ ] Generate YCNDXA → ENTITY Update/Delete **đầy đủ** cột + WHERE + JOIN.
- [ ] `dycn$$partition$current` (hai `$`) khi `dest_d_table = dycn$`.
- [ ] Có `&lt;&gt;` trong WHERE.
- [ ] Test pass.

## Không làm

- Không auto-sửa `YCNTran.xml` trên disk.
- Không gen sẵn INSERT thứ hai (`stt_rec_dx1`) trừ khi sau này wizard hỗ trợ multi-retrieve trên cùng Tran.
- Không đặt `&UpdatefsdSttRecRef;` vào trong CDATA trong comment mẫu.
