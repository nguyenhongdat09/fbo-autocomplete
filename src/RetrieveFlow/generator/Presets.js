/**
 * Bộ Preset chuẩn cho tính năng Retrieve Flow Designer
 * - YCNDXA: fixture cho bảng tách kỳ theo tháng (partitioned, có $)
 * - zcWIMO: fixture cho bảng đơn không tách kỳ (single, không $)
 */

const DEFAULT_SYSFILTER_ROWS = [
    { id_suffix: 'CurrencyCode', name: 'ma_nt', exname: 'þm.ma_nt' },
    { id_suffix: 'ItemCode', name: 'ma_vt', exname: 'þa.ma_vt' },
    { id_suffix: 'ItemName', name: 'ten_vt%2', exname: 'þb.ten_vt%2' },
    { id_suffix: 'UOM', name: 'dvt', exname: 'þa.dvt' },
    { id_suffix: 'VoucherDate', name: 'ngay_ct', exname: 'þa.ngay_ct' },
    { id_suffix: 'VoucherNumber', name: 'so_ct', exname: 'þa.so_ct' }
];

const YCNDXA = {
    src_table_mode: "partitioned",
    identity: "YCNDXA",
    dest_tran: "YCNTran",
    src_ma_ct: "DXA",
    src_ext: "64",
    dest_d_table: "dycn$",
    dest_m_table: "mycn$",
    src_c_table: "c64$000000",
    src_inquiry_table: "",
    src_master_table: "",
    src_detail_table: "",
    src_qty_col: "so_luong",
    src_taken_col: "sl_ycn",
    src_taken_sql_type: "numeric(19,4)",
    src_taken_header_v: "Sl đã lấy",
    src_taken_header_e: "Ordered Q'ty",
    finding_status_list: "2",
    multigrid_filter_extra: "and trang_thai_giao_hang in ('5')",
    lookup_detail_table: "",
    lookup_detail_alias: "",
    lookup_detail_remain_expr: "",
    include_ma_nt: true,
    titles: {
        filter_v: "Chọn đơn hàng bán",
        filter_e: "Select Sales Order",
        multiform_v: "Phiếu đơn hàng bán",
        multigrid_v: "Danh sách đơn hàng bán",
        filter_date_v: "Đơn hàng bán từ ngày",
        filter_date_e: "Order Date from",
        filter_so_v: "Số đơn hàng bán",
        filter_so_e: "Order Number"
    },
    filter_none_message_v: "Không có đơn hàng bán trong nước theo điều kiện đang lọc.",
    filter_none_message_e: "No data matching filter condition.",
    trace_fields: [
        { name: "stt_rec_dxa", sql_type: "char(13)", header_v: "", header_e: "" },
        { name: "stt_rec0dxa", sql_type: "char(3)", header_v: "", header_e: "" },
        { name: "dxa_so", sql_type: "char(16)", header_v: "Đơn hàng", header_e: "Order" },
        { name: "dxa_ln", sql_type: "int", header_v: "Dòng", header_e: "Line" }
    ],
    f1: "so_luong0, so_luong, stt_rec, stt_rec0, so_ct, line_nbr",
    f2: "so_luong, so_luong_ban, stt_rec_dxa, stt_rec0dxa, dxa_so, dxa_ln",
    master_set_fields: "stt_rec_dxa, dxa_so",
    transfer_map_fields: "ma_vt, ten_vt%l, dvt, he_so, ma_lo_ban, lo_yn",
    other_copy_field: "nhieu_dvt, he_so, ma_vt, dvt, ngay_ct, ma_lo_ban, lo_yn",
    sysfilter_rows: [...DEFAULT_SYSFILTER_ROWS],
    proc_name: "fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran",
    use_he_so_convert: true,
    add_src_qty_col: false,
    dest_parent_date_field: "ngay_lct",
    dest_parent_unit_field: "ma_dvcs"
};

const ZCWIMO = {
    src_table_mode: "single",
    identity: "zcWIMO",
    dest_tran: "WITran",
    src_ma_ct: "SX1",
    src_ext: "",
    dest_d_table: "d04$",
    dest_m_table: "m04$",
    src_c_table: "",
    src_inquiry_table: "isx",
    src_master_table: "phsx",
    src_detail_table: "ctsx",
    src_qty_col: "so_luong",
    src_taken_col: "sl_pnd",
    src_taken_sql_type: "numeric(19,4)",
    src_taken_header_v: "Sl đã nhập",
    src_taken_header_e: "Received Q'ty",
    finding_status_list: "1, 2",
    multigrid_filter_extra: "",
    lookup_detail_table: "ctsx",
    lookup_detail_alias: "z3",
    lookup_detail_remain_expr: "z3.sl_pxh < z3.so_luong",
    include_ma_nt: true,
    titles: {
        filter_v: "Chọn lệnh sản xuất",
        filter_e: "Select Work Order",
        multiform_v: "Phiếu lệnh sản xuất",
        multigrid_v: "Danh sách lệnh sản xuất",
        filter_date_v: "Lệnh sản xuất từ ngày",
        filter_date_e: "Work Order Date from",
        filter_so_v: "Số lệnh sản xuất",
        filter_so_e: "Work Order Number"
    },
    filter_none_message_v: "Không có lệnh sản xuất theo điều kiện đang lọc.",
    filter_none_message_e: "No work order matching filter condition.",
    trace_fields: [
        { name: "stt_rec_sx1", sql_type: "char(13)", header_v: "", header_e: "" },
        { name: "stt_rec0sx1", sql_type: "char(3)", header_v: "", header_e: "" },
        { name: "so_lsx", sql_type: "char(16)", header_v: "Số LSX", header_e: "WO Number" },
        { name: "ln_sx1", sql_type: "int", header_v: "Dòng LSX", header_e: "WO Line" }
    ],
    f1: "so_luong0, so_luong, stt_rec, stt_rec0, so_ct, line_nbr",
    f2: "so_luong, stt_rec_sx1, stt_rec0sx1, so_lsx, ln_sx1",
    master_set_fields: "stt_rec_sx1, so_lsx",
    transfer_map_fields: "ma_vt, ten_vt%l, dvt, he_so, lo_yn",
    other_copy_field: "nhieu_dvt, he_so, ma_vt, dvt, ngay_ct, lo_yn",
    sysfilter_rows: [...DEFAULT_SYSFILTER_ROWS],
    proc_name: "fsd_FastBusiness$Voucher$BeforeAfterUpdate$WITranFromSX1Tran",
    use_he_so_convert: false,
    add_src_qty_col: false,
    dest_parent_date_field: "ngay_ct",
    dest_parent_unit_field: "ma_dvcs"
};

module.exports = {
    DEFAULT_SYSFILTER_ROWS,
    YCNDXA,
    ZCWIMO
};
