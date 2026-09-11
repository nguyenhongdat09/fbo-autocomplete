# FIX-18 — MultiForm commands: format đẹp như EPLUS (không gom 1 dòng)

## Mức: Low (format template)

## Vấn đề

Generate / template đang kiểu CNNB (1 dòng, khó đọc):

```xml
<command event="Showing"><text><![CDATA[select 'show$]]>&Identity;<![CDATA[$(this);' as message return]]></text></command>
<command event="Loading"><text><![CDATA[select 'active$]]>&Identity;<![CDATA[$(this);' as message return]]></text></command>
<command event="Closing"><text><![CDATA[select 'close$]]>&Identity;<![CDATA[$(this);' as message return]]></text></command>
```

User muốn format như **EPLUS** `YCNDXAMultiForm.xml` ~28–52:

```xml
    <command event="Showing">
      <text>
        <![CDATA[
select 'show$]]>&Identity;<![CDATA[$(this);' as message
return
]]>
      </text>
    </command>

    <command event="Loading">
      <text>
        <![CDATA[
select 'active$]]>&Identity;<![CDATA[$(this);' as message
return
]]>
      </text>
    </command>
    <command event="Closing">
      <text>
        <![CDATA[
select 'close$]]>&Identity;<![CDATA[$(this);' as message
return
]]>
      </text>
    </command>
```

Logic **không đổi** — chỉ xuống dòng / thụt lề / `return` riêng dòng; vẫn split ENTITY `&Identity;`.

---

## Quyết định

1. Sửa **cả** `partitioned/MultiForm.xml.tpl` và `single/MultiForm.xml.tpl`.
2. Đảm bảo đủ **3** command: Showing / Loading / Closing (nếu template còn thiếu Loading/Closing — bổ sung cùng format; xem FIX-11).
3. Quy ước format chuẩn FBO cho khối command ngắn:
   - `<command>` / `<text>` / `<![CDATA[` mỗi thứ một mức thụt.
   - Nội dung SQL: `select '…' as message` rồi dòng `return`.
   - Đóng `]]>` / `</text>` / `</command>` căn cột như EPLUS.

### Áp dụng tương tự (nếu còn 1 dòng)

Cùng style cho command ngắn khác trong RetrieveFlow templates (vd. Filter `Showing` nếu có), **không** bắt format lại khối Inserting dài (FIX-17 đã có structure riêng).

---

## Việc phải làm

1. Thay khối `<commands>` MultiForm (partitioned + single) bằng format EPLUS trên.
2. Smoke: Generate MultiForm — Looking XML đẹp; runtime vẫn gọi `show$` / `active$` / `close$`.
3. Test snapshot/string: có newline giữa `as message` và `return` (optional assert).

## Done

- [ ] MultiForm generated: Showing/Loading/Closing format nhiều dòng như EPLUS ~28–52.
- [ ] Không còn một dòng `…message return]]></text></command>`.
- [ ] Vẫn có `&Identity;` split đúng.

## Không làm

- Không đổi tên hàm / message script.
- Không minify ngược lại kiểu CNNB.
