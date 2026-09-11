# FIX-23 — Filter template **đầy đủ** theo gold EPLUS (ngoài Inserting)

## Mức: High (template Filter)

## Vấn đề

Generate CNNB `Filter/YCNDXAFilter.xml` (~100 dòng) đã có **Inserting** gần đủ (FIX-17) nhưng vẫn **thiếu nhiều** so với gold EPLUS `YCNDXAFilter.xml` (~199 dòng). User chỉ ra đoạn `<script>` ~92–100: chỉ còn `active$…` set `ngay_ct2, ma_dvcs` — thiếu gần hết FlowFilter JS.

Gold: `\\172.168.5.14\CustomerPro\FBI\EPLUS_FBI\FBISP24\App_Data\Controllers\Filter\YCNDXAFilter.xml`

| Khối | Gold EPLUS | Generate / template hiện tại |
|------|------------|------------------------------|
| DOCTYPE FlowFilter | `XMLFlowFilterViews/Command/Check`, `ScriptFlowFilterCss/Function` | **Thiếu** |
| `CheckRelativeQuery` | `select 'so_ct' as field, @$none… return` | **Thiếu** |
| `<fields>` attrs | `dataFormatString`, `aliasName`, `defaultValue`, header `so_ct` `&c21;/&c22;`, `ma_kh` hidden | Fields tối giản; **thiếu `ma_kh`** |
| `<views>` | `view id="Dir"` layout `ngay_ct1` / `so_ct`… | **Thiếu hẳn** |
| `<commands>` đầu | `&XMLFlowFilterCommand;` | **Thiếu** |
| `Checking` | stub `var f = this;` | **Thiếu** |
| `<script>` | `init$` / `active$` (looking + memvars) / `close$` / `Before$Loading` / `Retrieve$QueryComplete` / `set$FormScript` / `show$QueryComplete` + `&Identity;` split | Chỉ **1** hàm `active$` set 2 field |
| Cuối file | `&ScriptFlowFilterCss;` | **Thiếu** |

> **FIX-17** = body `Inserting` SQL. **FIX-23** = phần còn lại của Filter (DOCTYPE / fields / views / commands / script / css) để parity gold.

---

## Quyết định

### 1. DOCTYPE — đủ entity FlowFilter + CheckRelativeQuery

Giống gold ~3–26:

```xml
<!DOCTYPE dir [
  <!ENTITY XMLFlowFilterViews SYSTEM "..\Include\XML\FlowFilterViews.txt">
  <!ENTITY XMLFlowFilterCommand SYSTEM "..\Include\XML\FlowFilterCommand.txt">
  <!ENTITY XMLFlowFilterCheck SYSTEM "..\Include\XML\FlowFilterCheck.txt">
  <!ENTITY ScriptFlowFilterCss SYSTEM "..\Include\Javascript\FlowFilterCss.txt">
  <!ENTITY ScriptFlowFilterFunction SYSTEM "..\Include\Javascript\FlowFilterFunction.txt">

  <!ENTITY Identity "{{identity}}">
  <!ENTITY c11 "{{title_filter_date_v}}">
  <!ENTITY c12 "{{title_filter_date_e}}">
  <!ENTITY c21 "{{title_filter_so_v}}">
  <!ENTITY c22 "{{title_filter_so_e}}">
  <!ENTITY ext "{{src_ext}}">

  <!ENTITY % FlowMultiVoucher SYSTEM "..\Include\FlowMultiVoucher.ent">
  %FlowMultiVoucher;
  <!ENTITY % CheckRelative SYSTEM "..\Include\CheckRelative.ent">
  %CheckRelative;
  <!ENTITY CheckRelativeParameter "'{{identity}}Filter', 'Filter', '{{parent_controller}}'">
  <!ENTITY CheckRelativeQuery "
    select 'so_ct' as field, @$none as message
    return">
]>
```

### 2. Fields — **copy đúng** gold ~32–50 (không rút gọn)

**Sai (template cũ / CNNB generate):**

```xml
<field name="stt_rec_ct" hidden="true"/>
<field name="ngay_ct2" hidden="true"/>
<field name="ma_dvcs" hidden="true"/>
```

**Đúng — paste vào `partitioned` + `single` Filter.xml.tpl:**

```xml
  <fields>
    <!--&FlowMultiFilterFields;-->
    <field name="ngay_ct1" type="DateTime" dataFormatString="@datetimeFormat" align="left" allowNulls="false" aliasName="fromDate" defaultValue="new Date()">
      <header v="&c11;" e="&c12;"></header>
    </field>
    <field name="so_ct" align="right" maxLength="-100" filterSource="voucherNumber" allowNulls="false">
      <header v="&c21;" e="&c22;"></header>
      <items style="AutoComplete" controller="&Identity;Lookup" reference="stt_rec_ct"/>
    </field>
    <field name="stt_rec_ct" readOnly="true" defaultValue="''" hidden="true">
      <header v="" e=""></header>
    </field>
    <field name="ngay_ct2" type="DateTime" dataFormatString="@datetimeFormat" align="left" readOnly="true" hidden="true">
      <header v="" e=""></header>
    </field>
    <field name="ma_dvcs" readOnly="true" defaultValue="''" hidden="true">
      <header v="" e=""></header>
    </field>
    <field name="ma_kh" readOnly="true" defaultValue="''" hidden="true">
      <header v="" e=""></header>
    </field>
  </fields>
```

**Bắt buộc có `ma_kh`** — Inserting dùng `@keyMaster` / `@ma_kh`; script `active$` set `ma_kh`.  
**Đã áp dụng** vào `RetrieveFlowTemplates/{partitioned,single}/Filter.xml.tpl` (khối fields).

### 3. Views — layout Dir như gold ~53–60

```xml
  <views>
    <!--&XMLFlowFilterViews;-->
    <view id="Dir" height="88">
      <item value="120, 30, 70, 100, 230"/>
      <item value="1101: [ngay_ct1].Label, [ngay_ct1], [ngay_ct2]"/>
      <item value="110111: [so_ct].Label, [so_ct], [stt_rec_ct], [ma_dvcs], [ma_kh]"/>
    </view>
  </views>
```

### 4. Commands — entity + Inserting (FIX-17) + Checking

```xml
  <commands>
    &XMLFlowFilterCommand;

    <command event="Inserting">
      … (giữ full body FIX-17) …
    </command>

    <command event="Checking">
      <text>
        <![CDATA[
        var f = this;
]]>
      </text>
    </command>
  </commands>
```

### 5. Script **đầy đủ** — gold ~137–196 (không rút còn 1 hàm)

Dùng **`&Identity;` split** trong CDATA (không hardcode `YCNDXA` trong JS như file generate lỗi):

| Hàm | Việc chính |
|-----|------------|
| `init$]]>&Identity;<![CDATA[Filter$` | `so_ct._idle = 9` |
| `active$…Filter$` | `_looking` + `add_loading(Before$Loading)`; lấy `ngay_lct` / `ma_dvcs` / `ma_kh` / `ten_kh%l` từ parent; `setItemValues('ngay_ct2, ma_kh, ma_dvcs', …)` |
| `close$…Filter$` | `remove_loading` |
| `on$…Filter$Before$Loading` | `validFields('ngay_ct1')`; `set_memvars` ngày + `ma_kh` + `ma_dvcs` |
| `on$…Filter$Retrieve$QueryComplete` | gán `_voucher$Retrieve$*` hoặc `_filter$Fields` / `_stt_rec_ct`; gọi `set$…FormScript` |
| `set$…Filter$FormScript` | `_formScript = show$…QueryComplete` |
| `show$…Filter$QueryComplete` | `showForm(h)` hoặc `showForm(']]>&Identity;<![CDATA[Form')` |

Placeholder parent date/unit:

- `w.getItemValue('{{dest_parent_date_field}}')` (YCNDXA: `ngay_lct`)
- `w.getItemValue('{{dest_parent_unit_field}}')` (thường `ma_dvcs`)

Cuối file:

```xml
  &ScriptFlowFilterCss;
</dir>
```

### 6. `single/Filter.xml.tpl`

Cùng DOCTYPE / fields / views / Checking / script skeleton; Inserting giữ logic single (không loop tháng — FIX-17 §4). Entity `ext` / c12 / c22 bổ sung nếu thiếu so partitioned.

---

## Việc phải làm

1. Rewrite `partitioned/Filter.xml.tpl` = gold structure + placeholder (Inserting giữ FIX-17).  
2. Cập nhật `single/Filter.xml.tpl` cùng skeleton UI/JS.  
3. Bỏ comment `<!-- Template: partitioned Filter -->` nếu lệch FIX-20 (optional).  
4. Spec `03-xml-templates.md`: Filter = full EPLUS, không chỉ Inserting.  
5. Smoke Generate: Filter có `<views>`, `&XMLFlowFilterCommand;`, `init$`/`Before$Loading`/`Retrieve$QueryComplete`, `&ScriptFlowFilterCss;`; `active$` set đủ `ngay_ct2, ma_kh, ma_dvcs`.

## Done

- [x] `<fields>` = gold EPLUS ~32–50 (attrs đầy đủ + `ma_kh`) — đã sửa template partitioned/single.
- [ ] Filter generated ~parity EPLUS (DOCTYPE + views + commands + script + css).  
- [ ] Không còn script chỉ 1 hàm `active$` set 2 field.  
- [ ] Có `CheckRelativeQuery`.  
- [ ] JS dùng `&Identity;` split; parent date/unit từ placeholder.  
- [ ] FIX-17 Inserting vẫn đủ.

## Không làm

- Không rút lại Inserting (FIX-17).  
- Không bỏ `&XMLFlowFilterCommand;` / CSS entity.  
- Không hardcode identity trong tên hàm JS (`active$YCNDXAFilter$` trong template — phải qua ENTITY).
