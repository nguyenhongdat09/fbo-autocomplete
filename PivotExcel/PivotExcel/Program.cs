using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Excel = Microsoft.Office.Interop.Excel;

namespace PivotExcel
{
    /// <summary>
    /// Demo: đọc template pivotExcelTemplate.xlsx, đổ dữ liệu sheet Main,
    /// tạo PivotTable thật trên sheet pivot (vd "Main - Pivot") tại A9, lưu ra Desktop\output.xlsx.
    /// </summary>
    internal static class Program
    {
        private const string SheetData = "Main";
        /// <summary>Tên sheet pivot trong template (đúng theo workbook.xml).</summary>
        private const string SheetReport = "Main - Pivot";
        /// <summary>File template trong repo: PivotExcel\PivotExcel\StaticFile\pivotExcelTemplate.xlsx</summary>
        private static readonly string TemplateRelativePath = Path.Combine("StaticFile", "pivotExcelTemplate.xlsx");
        private const string OutputFileName = "output.xlsx";

        private static void Main(string[] args)
        {
            int exitCode = 0;
            string templatePath = ResolveTemplatePath();
            if (string.IsNullOrEmpty(templatePath) || !File.Exists(templatePath))
            {
                Console.WriteLine("Không tìm thấy template: " + TemplateRelativePath);
                Console.WriteLine("Đặt file cạnh exe, hoặc trong StaticFile cạnh exe, hoặc copy vào thư mục project khi debug.");
                Environment.Exit(1);
                return;
            }

            List<string> rowFields = null;
            List<string> columnFields = null;
            List<string> valueFields = null;
            List<string> allFields = null;
            string outputPath = null;
            try
            {
                bool hasCliArgs = args != null && args.Length >= 4;
                if (hasCliArgs)
                {
                    rowFields = ParseFieldListFromCsv(args[0], "row");
                    columnFields = ParseFieldListFromCsv(args[1], "column");
                    valueFields = ParseFieldListFromCsv(args[2], "value");
                    outputPath = ResolveOutputPath(args[3]);
                }
                else
                {
                    rowFields = PromptFieldList("Nhập Row fields (vd: xsearch,systotal,chi_tieu,ma_so): ");
                    columnFields = PromptFieldList("Nhập Column fields (vd: xpivot,npivot): ");
                    valueFields = PromptFieldList("Nhập Value fields (vd: thuc_hien): ");
                    outputPath = ResolveOutputPath(null);
                }

                allFields = CombineUniqueFields(rowFields, columnFields, valueFields);
            }
            catch (Exception exInput)
            {
                Console.WriteLine("[Input] " + exInput.Message);
                Environment.Exit(1);
                return;
            }

            Excel.Application app = null;
            Excel.Workbook wb = null;
            Excel.Worksheet wsMain = null;
            Excel.Worksheet wsReport = null;

            try
            {
                app = new Excel.Application();
                app.Visible = false;
                app.DisplayAlerts = false;
                app.ScreenUpdating = false;

                try
                {
                    wb = app.Workbooks.Open(
                        Filename: templatePath,
                        UpdateLinks: 0,
                        ReadOnly: false,
                        Format: Type.Missing,
                        Password: Type.Missing,
                        WriteResPassword: Type.Missing,
                        IgnoreReadOnlyRecommended: true,
                        Origin: Type.Missing,
                        Delimiter: Type.Missing,
                        Editable: true,
                        Notify: false,
                        Converter: Type.Missing,
                        AddToMru: false);
                }
                catch (Exception exOpen)
                {
                    Console.WriteLine("[Open workbook] " + exOpen.Message);
                    throw;
                }

                try
                {
                    wsMain = (Excel.Worksheet)wb.Worksheets[SheetData];
                    wsReport = (Excel.Worksheet)wb.Worksheets[SheetReport];
                }
                catch (Exception exSheets)
                {
                    Console.WriteLine("[Sheets] Không mở được sheet. Kiểm tra tên sheet trong template.");
                    Console.WriteLine(exSheets.Message);
                    throw;
                }

                WriteMainData(wsMain, allFields);

                Excel.Range sourceRange = null;
                try
                {
                    // Không dùng UsedRange: template/dữ liệu có thể kéo sang cột trống (vd K) khiến PivotTable báo lỗi "list with labeled columns".
                    sourceRange = BuildMainPivotSourceRange(wsMain, allFields.Count);
                }
                catch (Exception exRange)
                {
                    Console.WriteLine("[Pivot source range Main] " + exRange.Message);
                    throw;
                }

                if (sourceRange == null)
                {
                    Console.WriteLine("Không có dữ liệu trên sheet " + SheetData);
                    exitCode = 2;
                    return;
                }

                try
                {
                    try
                    {
                        RemoveExistingPivotTables(wsReport);
                    }
                    catch (Exception exRm)
                    {
                        Console.WriteLine("[Remove old pivots] " + exRm.Message);
                        throw;
                    }

                    try
                    {
                        ClearPivotPlacementArea(wsReport);
                    }
                    catch (Exception exClear)
                    {
                        Console.WriteLine("[Clear pivot area] " + exClear.Message);
                        throw;
                    }

                    // Địa chỉ nguồn cùng workbook (đúng số cột header, tránh cột trống phía phải)
                    string sourceAddressLocal = "'" + SheetData + "'!" + sourceRange.get_Address(
                        RowAbsolute: true,
                        ColumnAbsolute: true,
                        ReferenceStyle: Excel.XlReferenceStyle.xlA1,
                        External: false,
                        RelativeTo: Type.Missing);

                    // Đích dạng chuỗi (Excel 2010 ổn định hơn Range object trong một số workbook)
                    string destAddressLocal = "'" + SheetReport + "'!$A$9";

                    Excel.PivotCache cache = null;
                    try
                    {
                        // Ưu tiên Range làm nguồn; fallback sang địa chỉ A1 local
                        try
                        {
                            cache = (Excel.PivotCache)wb.PivotCaches().Add(
                                Excel.XlPivotTableSourceType.xlDatabase,
                                sourceRange);
                        }
                        catch (Exception exAddRange)
                        {
                            Console.WriteLine("[PivotCaches.Add Range] " + exAddRange.Message + " → thử chuỗi SourceData");
                            cache = (Excel.PivotCache)wb.PivotCaches().Add(
                                Excel.XlPivotTableSourceType.xlDatabase,
                                sourceAddressLocal);
                        }
                    }
                    catch (Exception exCache)
                    {
                        Console.WriteLine("[PivotCaches.Add] " + exCache.Message);
                        throw;
                    }

                    // Tên pivot ngắn, không ký tự lạ (giới hạn Excel)
                    // Tên pivot: chỉ chữ + số, tránh ký tự đặc biệt
                    string pivotName = "Pivot" + DateTime.Now.ToString("HHmmss");
                    Excel.PivotTable pt = null;
                    try
                    {
                        Console.WriteLine("Pivot SourceData: " + sourceAddressLocal);
                        Console.WriteLine("Pivot Destination: " + destAddressLocal);

                        // Thử overload 3 tham số trước
                        try
                        {
                            pt = cache.CreatePivotTable(TableDestination: destAddressLocal, TableName: pivotName, ReadData: Type.Missing);
                        }
                        catch
                        {
                            // Fallback: đích là Range + version cũ
                            Excel.Range destTopLeft = wsReport.Range["A9"];
                            try
                            {
                                pt = cache.CreatePivotTable(
                                    TableDestination: destTopLeft,
                                    TableName: pivotName,
                                    ReadData: Type.Missing,
                                    DefaultVersion: Excel.XlPivotTableVersionList.xlPivotTableVersion2000);
                            }
                            finally
                            {
                                Marshal.FinalReleaseComObject(destTopLeft);
                            }
                        }
                    }
                    catch (Exception exPt)
                    {
                        Console.WriteLine("[CreatePivotTable] " + exPt.Message);
                        throw;
                    }

                    try
                    {
                        ConfigurePivot(pt, rowFields, columnFields, valueFields);
                        ConfigurePivotOptions(pt);
                        ApplyPivotHeaderBackground(pt);
                        ConfigureConditionalFormatting(pt, wsReport);
                        SetAllColumnsWidth(wsMain, 16);
                        SetAllColumnsWidth(wsReport, 16);
                    }
                    catch (Exception exCfg)
                    {
                        Console.WriteLine("[ConfigurePivot] " + exCfg.Message);
                        throw;
                    }

                    EnsureOutputDirectory(outputPath);
                    if (File.Exists(outputPath))
                    {
                        File.Delete(outputPath);
                    }

                    try
                    {
                        wb.SaveAs(
                            Filename: outputPath,
                            FileFormat: Excel.XlFileFormat.xlOpenXMLWorkbook,
                            Password: Type.Missing,
                            WriteResPassword: Type.Missing,
                            ReadOnlyRecommended: false,
                            CreateBackup: Type.Missing,
                            Excel.XlSaveAsAccessMode.xlExclusive,
                            Type.Missing,
                            Type.Missing,
                            Type.Missing,
                            Type.Missing,
                            Type.Missing);
                    }
                    catch (Exception exSave)
                    {
                        Console.WriteLine("[SaveAs] " + exSave.Message);
                        throw;
                    }

                    Console.WriteLine("Đã xuất: " + outputPath);
                    exitCode = 0;
                }
                finally
                {
                    if (sourceRange != null)
                    {
                        try
                        {
                            Marshal.FinalReleaseComObject(sourceRange);
                        }
                        catch
                        {
                            /* ignore */
                        }

                        sourceRange = null;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Lỗi: " + ex.Message);
                if (ex.InnerException != null)
                {
                    Console.WriteLine("Inner: " + ex.InnerException.Message);
                }
                Console.WriteLine(ex.ToString());

                exitCode = 3;
            }
            finally
            {
                if (wb != null)
                {
                    try
                    {
                        wb.Close(SaveChanges: false);
                    }
                    catch
                    {
                        /* ignore */
                    }

                    Marshal.FinalReleaseComObject(wb);
                    wb = null;
                }

                if (app != null)
                {
                    try
                    {
                        app.Quit();
                    }
                    catch
                    {
                        /* ignore */
                    }

                    Marshal.FinalReleaseComObject(app);
                    app = null;
                }

                GC.Collect();
                GC.WaitForPendingFinalizers();
                GC.Collect();
                GC.WaitForPendingFinalizers();
            }
            Environment.Exit(exitCode);
        }

        /// <summary>
        /// Tìm template: cùng thư mục exe, hoặc thư mục cha (bin\Debug -> project output).
        /// </summary>
        private static string ResolveTemplatePath()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string[] candidates =
            {
                // Copy template cạnh exe (khuyến nghị khi deploy)
                Path.Combine(baseDir, TemplateRelativePath),
                Path.Combine(baseDir, "pivotExcelTemplate.xlsx"),
                // Debug: exe ở bin\Debug → lên 2 cấp tới PivotExcel\PivotExcel rồi vào StaticFile
                Path.Combine(baseDir, "..", "..", TemplateRelativePath),
                Path.Combine(baseDir, "..", "..", "pivotExcelTemplate.xlsx"),
            };

            foreach (string p in candidates)
            {
                try
                {
                    string full = Path.GetFullPath(p);
                    if (File.Exists(full))
                    {
                        return full;
                    }
                }
                catch
                {
                    /* ignore bad path */
                }
            }

            return null;
        }

        private static List<string> PromptFieldList(string prompt)
        {
            Console.Write(prompt);
            string input = Console.ReadLine();
            return ParseFieldListFromCsv(input, "interactive");
        }

        private static List<string> ParseFieldListFromCsv(string csv, string inputName)
        {
            if (string.IsNullOrWhiteSpace(csv))
            {
                throw new InvalidOperationException("Input " + inputName + " đang trống.");
            }

            List<string> fields = csv
                .Split(',')
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList();

            if (fields.Count == 0)
            {
                throw new InvalidOperationException("Input " + inputName + " không hợp lệ.");
            }

            return fields;
        }

        private static string ResolveOutputPath(string outputArg)
        {
            if (string.IsNullOrWhiteSpace(outputArg))
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                return Path.Combine(desktop, OutputFileName);
            }

            string trimmed = outputArg.Trim().Trim('"');
            string full = Path.GetFullPath(trimmed);

            // Nếu truyền thư mục, tự động nhả ra output.xlsx trong thư mục đó.
            if (Directory.Exists(full))
            {
                return Path.Combine(full, OutputFileName);
            }

            // Nếu truyền đường dẫn không có extension hoặc extension khác, coi như thư mục đích.
            string ext = Path.GetExtension(full);
            if (!string.Equals(ext, ".xlsx", StringComparison.OrdinalIgnoreCase))
            {
                return Path.Combine(full, OutputFileName);
            }

            return full;
        }

        private static void EnsureOutputDirectory(string outputPath)
        {
            if (string.IsNullOrWhiteSpace(outputPath))
            {
                throw new InvalidOperationException("Output path rỗng.");
            }

            string dir = Path.GetDirectoryName(outputPath);
            if (string.IsNullOrWhiteSpace(dir))
            {
                throw new InvalidOperationException("Không xác định được thư mục output.");
            }

            if (!Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
        }

        private static List<string> CombineUniqueFields(
            List<string> rowFields,
            List<string> columnFields,
            List<string> valueFields)
        {
            var result = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (string field in rowFields.Concat(columnFields).Concat(valueFields))
            {
                if (!seen.Contains(field))
                {
                    result.Add(field);
                    seen.Add(field);
                }
            }

            return result;
        }

        private static string NormalizeFieldForDataRow(string fieldName)
        {
            if (fieldName.StartsWith("?h_", StringComparison.OrdinalIgnoreCase))
            {
                return fieldName.Substring(3);
            }

            return fieldName;
        }

        private static void WriteMainData(Excel.Worksheet ws, List<string> allFields)
        {
            // Xóa nội dung cũ (giữ sheet). Chỉ ghi đúng 2 dòng:
            // dòng 1 = header, dòng 2 = !2.<field> (có xử lý ?h_).
            ws.Cells.ClearContents();

            if (allFields == null || allFields.Count == 0)
            {
                throw new InvalidOperationException("Danh sách field trống.");
            }

            object[,] data = new object[2, allFields.Count];
            for (int i = 0; i < allFields.Count; i++)
            {
                string field = allFields[i];
                data[0, i] = field;
                data[1, i] = "!2." + NormalizeFieldForDataRow(field);
            }

            Excel.Range body = ws.Range[ws.Cells[1, 1], ws.Cells[2, allFields.Count]];
            try
            {
                body.Value2 = data;
            }
            finally
            {
                Marshal.FinalReleaseComObject(body);
            }
        }

        private static Excel.Range BuildMainPivotSourceRange(Excel.Worksheet ws, int headerCount)
        {
            if (headerCount <= 0)
            {
                return null;
            }

            // Nguồn pivot luôn cố định 2 dòng theo yêu cầu.
            return ws.Range[ws.Cells[1, 1], ws.Cells[2, headerCount]];
        }

        /// <summary>
        /// Xóa vùng đặt pivot (không phụ thuộc API Delete của PivotTable trên Interop).
        /// Giữ phần header/merge phía trên (vd B6:L7) nếu nằm ngoài vùng này.
        /// </summary>
        private static void ClearPivotPlacementArea(Excel.Worksheet wsReport)
        {
            // Pivot đặt tại A9 → xóa khối lớn phía dưới/phải để tránh đè pivot cũ.
            Excel.Range wipe = wsReport.Range["A9:Z200"];
            try
            {
                wipe.Clear();
            }
            finally
            {
                Marshal.FinalReleaseComObject(wipe);
            }
        }

        /// <summary>
        /// Template có sẵn pivot (vd PivotTable2 tại A9). Tạo pivot mới đè lên vùng đó làm Excel 2010 crash.
        /// Xóa pivot trên sheet trước khi tạo cache/pivot mới.
        /// </summary>
        private static void RemoveExistingPivotTables(Excel.Worksheet wsReport)
        {
            Excel.PivotTables pivotTables = wsReport.PivotTables();
            try
            {
                int n = pivotTables.Count;
                Console.WriteLine("PivotTables on '" + SheetReport + "' before remove: " + n);
                for (int i = n; i >= 1; i--)
                {
                    Excel.PivotTable ptOld = null;
                    try
                    {
                        ptOld = (Excel.PivotTable)pivotTables.Item(i);
                        // Một số PIAs không khai báo Delete; gọi qua IDispatch.
                        try
                        {
                            ((dynamic)ptOld).Delete();
                        }
                        catch
                        {
                            try
                            {
                                ptOld.TableRange2.Clear();
                            }
                            catch
                            {
                                /* ignore */
                            }
                        }
                    }
                    catch
                    {
                        try
                        {
                            if (ptOld != null)
                            {
                                ptOld.TableRange2.Clear();
                            }
                        }
                        catch
                        {
                            /* ignore */
                        }
                    }
                    finally
                    {
                        if (ptOld != null)
                        {
                            try
                            {
                                Marshal.FinalReleaseComObject(ptOld);
                            }
                            catch
                            {
                                /* ignore */
                            }
                        }
                    }
                }

                if (pivotTables.Count != 0)
                {
                    throw new InvalidOperationException(
                        "Không xóa hết pivot cũ trên sheet '" + SheetReport + "' (còn " + pivotTables.Count + ").");
                }

                Console.WriteLine("PivotTables on '" + SheetReport + "' after remove: 0");
            }
            finally
            {
                Marshal.FinalReleaseComObject(pivotTables);
            }
        }

        /// <summary>
        /// Row labels / Column labels / Values lấy từ input console.
        /// </summary>
        private static void ConfigurePivot(
            Excel.PivotTable pt,
            List<string> rowFields,
            List<string> columnFields,
            List<string> valueFields)
        {
            Excel.PivotField pf;

            for (int i = 0; i < rowFields.Count; i++)
            {
                pf = (Excel.PivotField)pt.PivotFields(rowFields[i]);
                pf.Orientation = Excel.XlPivotFieldOrientation.xlRowField;
                pf.Position = i + 1;
                SetFieldSubtotalNone(pf);
            }

            for (int i = 0; i < columnFields.Count; i++)
            {
                pf = (Excel.PivotField)pt.PivotFields(columnFields[i]);
                pf.Orientation = Excel.XlPivotFieldOrientation.xlColumnField;
                pf.Position = i + 1;
                SetFieldSubtotalNone(pf);
            }

            foreach (string valueFieldName in valueFields)
            {
                Excel.PivotField valueField = (Excel.PivotField)pt.PivotFields(valueFieldName);
                try
                {
                    pt.AddDataField(valueField, "Sum of " + valueFieldName, Excel.XlConsolidationFunction.xlSum);
                }
                catch
                {
                    // Dữ liệu mẫu dòng 2 là text (!2.xxx), fallback sang Count để không fail.
                    pt.AddDataField(valueField, "Count of " + valueFieldName, Excel.XlConsolidationFunction.xlCount);
                }
            }

            // Nếu có nhiều value field, ép "Σ Values" nằm ở Column Labels thay vì Row Labels.
            if (valueFields.Count > 1)
            {
                Excel.PivotField dataPivotField = null;
                try
                {
                    dataPivotField = pt.DataPivotField;
                    if (dataPivotField != null)
                    {
                        dataPivotField.Orientation = Excel.XlPivotFieldOrientation.xlColumnField;
                        dataPivotField.Position = columnFields.Count + 1;
                        // Ẩn chữ "Data" ở header của Σ Values.
                        try
                        {
                            dataPivotField.Caption = " ";
                        }
                        catch
                        {
                            /* ignore */
                        }
                    }

                    try
                    {
                        ((dynamic)pt).DataCaption = " ";
                    }
                    catch
                    {
                        /* ignore */
                    }
                }
                catch
                {
                    /* ignore if Excel version/layout does not expose DataPivotField as expected */
                }
                finally
                {
                    if (dataPivotField != null)
                    {
                        Marshal.FinalReleaseComObject(dataPivotField);
                    }
                }
            }

            try
            {
                pt.ShowTableStyleRowStripes = true;
            }
            catch
            {
                /* Excel 2010 có thể không hỗ trợ một số style mới */
            }
        }

        /// <summary>
        /// Field Settings > Subtotals = None.
        /// </summary>
        private static void SetFieldSubtotalNone(Excel.PivotField field)
        {
            // Excel dùng 12 slot subtotal (Automatic, Sum, Count, ... Varp).
            // "None" nghĩa là tắt toàn bộ các slot này.
            for (int i = 1; i <= 12; i++)
            {
                field.set_Subtotals(i, false);
            }
        }

        /// <summary>
        /// Thiết lập các tùy chọn trong PivotTable Options theo yêu cầu.
        /// </summary>
        private static void ConfigurePivotOptions(Excel.PivotTable pt)
        {
            // Tab Layout & Format
            pt.DisplayNullString = false; // Uncheck "For empty cells show"
            pt.PreserveFormatting = true; // Giữ format custom khi pivot refresh/update

            // Tab Totals & Filters
            pt.RowGrand = false; // Uncheck "Show grand totals for rows"
            pt.ColumnGrand = false; // Uncheck "Show grand totals for columns"

            // Tab Display
            pt.ShowDrillIndicators = false; // Uncheck "Show expand/collapse buttons"
            pt.InGridDropZones = false; // Uncheck "Classic PivotTable layout"

            // Tab Printing
            pt.PrintTitles = true; // Check "Set print titles"

            // Tab Data
            pt.SaveData = false; // Uncheck "Save source data with file"
            pt.EnableDrilldown = false; // Uncheck "Enable show details"

            Excel.PivotCache cache = null;
            try
            {
                cache = pt.PivotCache();
                cache.RefreshOnFileOpen = true; // Check "Refresh data when opening the file"
            }
            finally
            {
                if (cache != null)
                {
                    Marshal.FinalReleaseComObject(cache);
                }
            }
        }

        /// <summary>
        /// Tô nền vùng header của PivotTable theo màu yêu cầu.
        /// </summary>
        private static void ApplyPivotHeaderBackground(Excel.PivotTable pt)
        {
            Excel.Range tableRange = null;
            Excel.Range dataBody = null;
            Excel.Range headerRange = null;
            Excel.Range columnRange = null;
            Excel.FormatConditions headerFcs = null;
            Excel.FormatCondition headerCond = null;
            try
            {
                tableRange = pt.TableRange1;
                if (tableRange == null)
                {
                    return;
                }

                dataBody = pt.DataBodyRange;
                if (dataBody == null)
                {
                    return;
                }

                int headerStartRow = tableRange.Row;
                int headerEndRow = dataBody.Row - 1;
                if (headerEndRow < headerStartRow)
                {
                    return;
                }

                int startCol = tableRange.Column;
                int tableEndCol = tableRange.Column + tableRange.Columns.Count - 1;
                int dataEndCol = dataBody.Column + dataBody.Columns.Count - 1;
                int endCol = Math.Max(tableEndCol, dataEndCol);
                headerRange = pt.Parent.Range[
                    pt.Parent.Cells[headerStartRow, startCol],
                    pt.Parent.Cells[headerEndRow, endCol]];
                headerRange.Interior.Color = 16774637; // RGB(237,245,255)
                headerRange.Font.Bold = true;
                headerRange.HorizontalAlignment = Excel.XlHAlign.xlHAlignCenter;
                headerRange.VerticalAlignment = Excel.XlVAlign.xlVAlignCenter;

                // Tô thêm ColumnRange để chắc chắn không bị hụt các ô cột label (vd F10/F11).
                columnRange = pt.ColumnRange;
                if (columnRange != null)
                {
                    columnRange.Interior.Color = 16774637; // RGB(237,245,255)
                }

                // Pivot refresh/open có thể ghi đè Interior một vài ô header (vd F10/F11),
                // nên thêm CF luôn-đúng để giữ màu hiển thị ổn định.
                headerFcs = headerRange.FormatConditions;
                headerCond = (Excel.FormatCondition)headerFcs.Add(
                    Type: Excel.XlFormatConditionType.xlExpression,
                    Operator: Type.Missing,
                    Formula1: "=TRUE",
                    Formula2: Type.Missing,
                    String: Type.Missing);
                headerCond.Interior.Color = 16774637; // RGB(237,245,255)
            }
            finally
            {
                if (headerCond != null) Marshal.FinalReleaseComObject(headerCond);
                if (headerFcs != null) Marshal.FinalReleaseComObject(headerFcs);
                if (columnRange != null) Marshal.FinalReleaseComObject(columnRange);
                if (headerRange != null) Marshal.FinalReleaseComObject(headerRange);
                if (dataBody != null) Marshal.FinalReleaseComObject(dataBody);
                if (tableRange != null) Marshal.FinalReleaseComObject(tableRange);
            }
        }

        /// <summary>
        /// Thêm 2 rule trong Conditional Formatting Rules Manager:
        /// - Rule 1: Formula = $B{dataStartRow}=0, Applies to từ cột C đến cột trước cột values.
        /// - Rule 2: Formula = $B{dataStartRow}=0, Applies to ô values đầu tiên (vd: $E$12).
        /// </summary>
        private static void ConfigureConditionalFormatting(Excel.PivotTable pt, Excel.Worksheet wsReport)
        {
            const int maxRow = 13000;
            const int fixedStartCol = 3; // C

            Excel.Range dataBody = null;
            Excel.Range applies1 = null;
            Excel.Range applies2 = null;
            Excel.FormatConditions fc1 = null;
            Excel.FormatConditions fc2 = null;
            Excel.FormatCondition cond1 = null;
            Excel.FormatCondition cond2 = null;

            try
            {
                dataBody = pt.DataBodyRange;
                if (dataBody == null)
                {
                    return;
                }

                int dataStartRow = dataBody.Row;       // ví dụ: 12
                int valueStartCol = dataBody.Column;   // ví dụ: 5 (E)
                string ruleFormula = "=$B" + dataStartRow + "=0";

                // Rule 1: từ cột C đến cột trước cột values (nếu values bắt đầu sau C)
                if (valueStartCol > fixedStartCol)
                {
                    // Theo yêu cầu thực tế: vùng rule 1 luôn ít nhất từ C tới D,
                    // sau đó mở rộng tới cột trước cột value nếu lớn hơn D.
                    int helperEndCol = Math.Max(valueStartCol - 1, fixedStartCol + 1);
                    string helperEndColLetter = ToExcelColumnLetter(helperEndCol);
                    string areaTop = "$C$" + dataStartRow + ":$" + helperEndColLetter + "$" + dataStartRow;
                    string areaBody = "$C$" + (dataStartRow + 1) + ":$" + helperEndColLetter + "$" + maxRow;
                    // Rule 1: 1 formula, Applies To gộp 2 vùng.
                    // Lưu ý: separator phụ thuộc locale Excel (',' hoặc ';').
                    applies1 = ResolveMultiAreaRange(wsReport, areaTop, areaBody);
                    fc1 = applies1.FormatConditions;
                    cond1 = (Excel.FormatCondition)fc1.Add(
                        Type: Excel.XlFormatConditionType.xlExpression,
                        Operator: Type.Missing,
                        Formula1: ruleFormula,
                        Formula2: Type.Missing,
                        String: Type.Missing);
                    cond1.Font.Bold = true;
                }

                // Rule 2: ô values đầu tiên (ví dụ $E$12)
                string valueStartColLetter = ToExcelColumnLetter(valueStartCol);
                applies2 = wsReport.Range["$" + valueStartColLetter + "$" + dataStartRow];
                fc2 = applies2.FormatConditions;
                cond2 = (Excel.FormatCondition)fc2.Add(
                    Type: Excel.XlFormatConditionType.xlExpression,
                    Operator: Type.Missing,
                    Formula1: ruleFormula,
                    Formula2: Type.Missing,
                    String: Type.Missing);
                cond2.Font.Bold = true;
            }
            finally
            {
                if (cond2 != null) Marshal.FinalReleaseComObject(cond2);
                if (cond1 != null) Marshal.FinalReleaseComObject(cond1);
                if (fc2 != null) Marshal.FinalReleaseComObject(fc2);
                if (fc1 != null) Marshal.FinalReleaseComObject(fc1);
                if (applies2 != null) Marshal.FinalReleaseComObject(applies2);
                if (applies1 != null) Marshal.FinalReleaseComObject(applies1);
                if (dataBody != null) Marshal.FinalReleaseComObject(dataBody);
            }
        }

        /// <summary>
        /// Gộp 2 vùng A1-style (vd $C$12:$D$12 và $C$13:$D$13000) cho "Applies to" CF.
        /// Không dùng chuỗi union trong Range[] (dễ 0x800A03EC theo locale/bản Excel, đặc biệt Office 2016+).
        /// </summary>
        private static Excel.Range ResolveMultiAreaRange(Excel.Worksheet ws, string areaTop, string areaBody)
        {
            Excel.Range r1 = null;
            Excel.Range r2 = null;
            try
            {
                r1 = (Excel.Range)ws.Range[areaTop];
                r2 = (Excel.Range)ws.Range[areaBody];
                Excel.Application app = ws.Application;
                Excel.Range union = (Excel.Range)app.Union(
                    r1,
                    r2,
                    Type.Missing, Type.Missing, Type.Missing, Type.Missing, Type.Missing,
                    Type.Missing, Type.Missing, Type.Missing, Type.Missing, Type.Missing,
                    Type.Missing, Type.Missing, Type.Missing, Type.Missing, Type.Missing,
                    Type.Missing, Type.Missing, Type.Missing, Type.Missing, Type.Missing,
                    Type.Missing, Type.Missing, Type.Missing, Type.Missing, Type.Missing,
                    Type.Missing, Type.Missing, Type.Missing);
                Marshal.FinalReleaseComObject(r1);
                r1 = null;
                Marshal.FinalReleaseComObject(r2);
                r2 = null;
                return union;
            }
            catch
            {
                if (r1 != null)
                {
                    Marshal.FinalReleaseComObject(r1);
                }

                if (r2 != null)
                {
                    Marshal.FinalReleaseComObject(r2);
                }

                throw;
            }
        }

        private static void SetAllColumnsWidth(Excel.Worksheet ws, double width)
        {
            Excel.Range columns = null;
            try
            {
                columns = ws.Columns;
                columns.ColumnWidth = width;
            }
            finally
            {
                if (columns != null)
                {
                    Marshal.FinalReleaseComObject(columns);
                }
            }
        }

        private static string ToExcelColumnLetter(int columnNumber)
        {
            if (columnNumber < 1)
            {
                throw new ArgumentOutOfRangeException("columnNumber");
            }

            string col = string.Empty;
            int n = columnNumber;
            while (n > 0)
            {
                int rem = (n - 1) % 26;
                col = Convert.ToChar(65 + rem) + col;
                n = (n - 1) / 26;
            }

            return col;
        }
    }
}
