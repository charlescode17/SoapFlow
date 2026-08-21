import { useState, useMemo, useEffect } from "react";
import { useReconciliationExpenses } from "../lib/momoExpenses";
import jsPDF from "jspdf";
import "jspdf-autotable";
import ExcelJS from "exceljs";

/**
 * jspdf-autotable's default export is unreliable under Vite/Rollup's
 * ESM<->CJS interop (it can resolve to the module namespace object
 * instead of the callable function, throwing "autoTable is not a
 * function"). Importing it as a side-effect above reliably patches
 * jsPDF.API.autoTable onto every jsPDF instance instead, so we call
 * it as a method on the doc object everywhere in this file.
 */
type JsPdfWithAutoTable = jsPDF & {
  autoTable: (options: Record<string, any>) => void;
  lastAutoTable: { finalY: number };
};
import {
  BarChart3,
  Download,
  Package,
  Users,
  DollarSign,
  CreditCard,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Wallet,
  FileText,
  Printer,
  Minus,
  Eye,
  RotateCcw,
  FileSpreadsheet,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useStore } from "../lib/store";
import { fmt, fmtDate, today } from "../lib/utils";
import { normalizeRole, type PaymentMode } from "../lib/types";
import { useVersaimentState, keyFor } from "../lib/versaimentState";

// ============================================================================
// COMPANY NAME — Edit the text below to change the company name on PDF & Excel reports
// Just replace "kangaroo" with your company name and it will appear on all printed reports
// ============================================================================
const COMPANY_NAME = "Kangaroo Bigger";

type DateFilter = "daily" | "weekly" | "monthly" | "annual" | "custom";
type ReportType = "sales" | "stock" | "loans" | "payments";

/* ============================================================================
   PROFESSIONAL EXPORT ENGINE
   ----------------------------------------------------------------------------
   Everything below builds clean, business-only documents:
     - PDF via jsPDF + jspdf-autotable (tables only, no screenshots/charts)
     - Excel via ExcelJS (styled headers, borders, alternating rows)
     - CSV (plain, structured, spreadsheet-safe)

   Dependencies required in package.json:
     jspdf, jspdf-autotable, exceljs
============================================================================ */

interface ReportMeta {
  title: string;
  period: string;
  scope?: string;
  generatedBy: string;
}

interface ReportSection {
  heading: string;
  headers: string[];
  rows: (string | number)[][];
  /** optional column alignment map for PDF (autotable columnStyles) */
  numericColumns?: number[];
  /**
   * Optional two-tier header. Each entry is a top-level label plus how many
   * flat `headers` columns it covers. span: 1 = standalone column (renders
   * as a single cell spanning both header rows). span > 1 = a group whose
   * sub-labels are pulled from `headers` in order (e.g. CASH -> "Amount",
   * "Payment Date"). Sum of spans must equal headers.length.
   */
  groupHeaders?: { label: string; span: number }[];
}

const PDF_COLORS = {
  primary: [46, 158, 143] as [number, number, number],
  text: [27, 35, 33] as [number, number, number],
  muted: [107, 123, 120] as [number, number, number],
  border: [224, 230, 228] as [number, number, number],
  altRow: [246, 248, 247] as [number, number, number],
};

function pdfColumnStyles(headers: string[], numericColumns: number[] = []) {
  const styles: Record<number, any> = {};
  numericColumns.forEach((idx) => {
    styles[idx] = { halign: "right" };
  });
  return styles;
}

function addPdfFootersAndPageNumbers(
  doc: jsPDF,
  margin: number = 40,
  compact: boolean = false,
) {
  const pageCount = doc.getNumberOfPages();
  const lineY = compact ? 16 : 42;
  const textY = compact ? 10 : 28;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - lineY, pageWidth - margin, pageHeight - lineY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(compact ? 6.5 : 8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(`${COMPANY_NAME} — Confidential Business Report`, margin, pageHeight - textY);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - textY, {
      align: "right",
    });
  }
}

function buildPdfReport(
  meta: ReportMeta,
  summary: string[],
  sections: ReportSection[],
  filename: string,
  orientation: "portrait" | "landscape" = "portrait",
  density: "normal" | "compact" = "normal",
) {
  const isCompact = density === "compact";
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation }) as JsPdfWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = isCompact ? 22 : 40;
  let y = isCompact ? 26 : 46;

  // ---- Header: company name, report title, meta line ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(isCompact ? 12 : 18);
  doc.setTextColor(...PDF_COLORS.text);
  doc.text(COMPANY_NAME, pageWidth / 2, y, { align: "center" });
  y += isCompact ? 12 : 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(isCompact ? 8.5 : 11);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(meta.title.toUpperCase(), pageWidth / 2, y, { align: "center" });
  y += isCompact ? 9 : 14;

  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(isCompact ? 1 : 1.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += isCompact ? 9 : 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(isCompact ? 6.5 : 8.5);
  doc.setTextColor(...PDF_COLORS.muted);
  const metaLine = `Period: ${meta.period}    |    Scope: ${meta.scope || "All"}    |    Generated: ${new Date().toLocaleString()}    |    Generated by: ${meta.generatedBy}`;
  doc.text(metaLine, pageWidth / 2, y, { align: "center" });
  y += isCompact ? 11 : 22;

  // ---- Executive summary ----
  if (summary.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(isCompact ? 8 : 11);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text("Executive Summary", margin, y);
    y += isCompact ? 3 : 6;
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 4, pageWidth - margin, y + 4);
    y += isCompact ? 9 : 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(isCompact ? 6.5 : 9);
    doc.setTextColor(...PDF_COLORS.text);
    summary.forEach((line) => {
      doc.text(`•  ${line}`, margin, y);
      y += isCompact ? 8 : 14;
    });
    y += isCompact ? 3 : 10;
  }

  // ---- Tables ----
  sections.forEach((section) => {
    if (section.rows.length === 0) return;

    if (y > pageHeight - (isCompact ? 90 : 140)) {
      doc.addPage();
      y = isCompact ? 26 : 46;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(isCompact ? 8 : 10.5);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(section.heading, margin, y);
    y += isCompact ? 4 : 8;

    let head: any[];
    if (section.groupHeaders) {
      const topRow: any[] = [];
      const subRow: any[] = [];
      let headerIdx = 0;
      section.groupHeaders.forEach((g) => {
        if (g.span === 1) {
          topRow.push({ content: g.label, rowSpan: 2, styles: { valign: "middle" } });
          headerIdx += 1;
        } else {
          topRow.push({ content: g.label, colSpan: g.span, styles: { halign: "center" } });
          for (let i = 0; i < g.span; i++) {
            subRow.push(section.headers[headerIdx]);
            headerIdx += 1;
          }
        }
      });
      head = [topRow, subRow];
    } else {
      head = [section.headers];
    }

    doc.autoTable({
      startY: y,
      head,
      body: section.rows,
      margin: { left: margin, right: margin, bottom: isCompact ? 22 : 56 },
      theme: "grid",
      tableWidth: "auto",
      styles: {
  fontSize: isCompact ? 6.5 : orientation === "landscape" ? 9.5 : 8.3,
  cellPadding: isCompact ? 2 : orientation === "landscape" ? 7 : 5.5,
  textColor: PDF_COLORS.text,
  lineColor: PDF_COLORS.border,
  lineWidth: 0.4,
  overflow: "linebreak",
  ...(isCompact ? { minCellHeight: 10 } : {}),   // ✅ only include the key when compact
},
      headStyles: {
        fillColor: PDF_COLORS.primary,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "left",
        fontSize: isCompact ? 6.8 : orientation === "landscape" ? 10 : 8.5,
      },
      alternateRowStyles: { fillColor: PDF_COLORS.altRow },
      columnStyles: pdfColumnStyles(section.headers, section.numericColumns),
      showHead: "everyPage",
      didParseCell: (data: any) => {
        if (data.section !== "body") return;
        const label = String(data.row.raw?.[0] ?? "");
        if (/^—.*—$/.test(label)) {
          data.cell.styles.fillColor = PDF_COLORS.primary;
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
        } else if (label.startsWith("Subtotal")) {
          data.cell.styles.fillColor = PDF_COLORS.altRow;
          data.cell.styles.fontStyle = "bold";
        } else if (label.startsWith("Versaiment")) {
          data.cell.styles.fillColor = [223, 240, 236];
          data.cell.styles.textColor = PDF_COLORS.primary;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = doc.lastAutoTable.finalY + (isCompact ? 20 : 26);
  });

  addPdfFootersAndPageNumbers(doc, margin, isCompact);
  doc.save(filename);
}

async function buildExcelReport(
  meta: ReportMeta,
  summary: string[],
  sections: ReportSection[],
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();

  const PRIMARY_ARGB = "FF2E9E8F";
  const MUTED_ARGB = "FF6B7B78";
  const ALT_ARGB = "FFF3F6F5";
  const BORDER_ARGB = "FFDDE4E2";
  const VERSAIMENT_ARGB = "FFDFF0EC";

  // ---- Summary sheet ----
  const summarySheet = wb.addWorksheet("Summary");
  summarySheet.getColumn(1).width = 90;
  summarySheet.mergeCells(1, 1, 1, 1);
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = COMPANY_NAME;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: "center" };

  const subCell = summarySheet.getCell("A2");
  subCell.value = meta.title;
  subCell.font = { bold: true, size: 12, color: { argb: PRIMARY_ARGB } };
  subCell.alignment = { horizontal: "center" };

  const metaCell = summarySheet.getCell("A3");
  metaCell.value = `Period: ${meta.period}   |   Scope: ${meta.scope || "All"}   |   Generated: ${new Date().toLocaleString()}   |   Generated by: ${meta.generatedBy}`;
  metaCell.font = { italic: true, size: 9, color: { argb: MUTED_ARGB } };
  metaCell.alignment = { horizontal: "center" };

  summarySheet.addRow([]);
  const summaryHeader = summarySheet.addRow(["Executive Summary"]);
  summaryHeader.getCell(1).font = { bold: true, size: 11 };

  summary.forEach((line) => {
    const row = summarySheet.addRow([`•  ${line}`]);
    row.getCell(1).font = { size: 10 };
  });

  // ---- One sheet per section ----
  sections.forEach((section, idx) => {
    const safeName = section.heading.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || `Table ${idx + 1}`;
    const ws = wb.addWorksheet(safeName);

    const colCount = section.headers.length;
    ws.mergeCells(1, 1, 1, colCount);
    const wsTitle = ws.getCell(1, 1);
    wsTitle.value = COMPANY_NAME;
    wsTitle.font = { bold: true, size: 14 };
    wsTitle.alignment = { horizontal: "center" };

    ws.mergeCells(2, 1, 2, colCount);
    const wsSub = ws.getCell(2, 1);
    wsSub.value = `${meta.title} — ${section.heading}`;
    wsSub.font = { bold: true, size: 11, color: { argb: PRIMARY_ARGB } };
    wsSub.alignment = { horizontal: "center" };

    ws.mergeCells(3, 1, 3, colCount);
    const wsMeta = ws.getCell(3, 1);
    wsMeta.value = `Period: ${meta.period}   |   Generated: ${new Date().toLocaleString()}   |   By: ${meta.generatedBy}`;
    wsMeta.font = { italic: true, size: 9, color: { argb: MUTED_ARGB } };
    wsMeta.alignment = { horizontal: "center" };

    ws.addRow([]);
    let flatHeaderRow: string[];
    if (section.groupHeaders) {
      const groupRowIndex = ws.rowCount + 1;
      const headerRowIndex = groupRowIndex + 1;

      // Place each group label at the FIRST column of its span (not
      // sequentially 1,2,3...) so it actually lines up with its merge.
      const groupRowValues: (string | null)[] = new Array(colCount).fill(null);
      let placeCursor = 1;
      section.groupHeaders.forEach((g) => {
        groupRowValues[placeCursor - 1] = g.label;
        placeCursor += g.span;
      });
      const groupRow = ws.addRow(groupRowValues);

      flatHeaderRow = [];
      let colCursor = 1;
      let headerIdx = 0;
      section.groupHeaders.forEach((g) => {
        if (g.span > 1) {
          ws.mergeCells(groupRowIndex, colCursor, groupRowIndex, colCursor + g.span - 1);
          for (let i = 0; i < g.span; i++) {
            flatHeaderRow.push(section.headers[headerIdx]);
            headerIdx += 1;
          }
        } else {
          ws.mergeCells(groupRowIndex, colCursor, headerRowIndex, colCursor);
          flatHeaderRow.push("");
          headerIdx += 1;
        }
        colCursor += g.span;
      });

      // This row was being computed but never written — that's why the
      // sub-headers (Amount / Payment Date / Bank / Receiver) were missing.
      const headerRow = ws.addRow(flatHeaderRow);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 9, color: { argb: MUTED_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ARGB } };
        cell.alignment = { horizontal: "left", vertical: "middle" };
      });

      groupRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIMARY_ARGB } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
    } else {
      flatHeaderRow = section.headers;
    }
    if (section.rows.length === 0) {
      ws.mergeCells(ws.rowCount + 1, 1, ws.rowCount + 1, colCount);
      const msgCell = ws.getCell(ws.rowCount, 1);
      msgCell.value = "No records for this period";
      msgCell.font = { italic: true, color: { argb: MUTED_ARGB } };
      msgCell.alignment = { horizontal: "center" };
    }

    section.rows.forEach((row, i) => {
      const r = ws.addRow(row);
      const label = String(row[0] ?? "");
      const isDayHeader = /^—.*—$/.test(label);
      const isSubtotal = label.startsWith("Subtotal");
      const isVersaiment = label.startsWith("Versaiment");
      const isAlt = !isDayHeader && !isSubtotal && !isVersaiment && i % 2 === 1;
      r.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: BORDER_ARGB } },
          left: { style: "thin", color: { argb: BORDER_ARGB } },
          bottom: { style: "thin", color: { argb: BORDER_ARGB } },
          right: { style: "thin", color: { argb: BORDER_ARGB } },
        };
        if (isDayHeader) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIMARY_ARGB } };
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        } else if (isSubtotal) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ARGB } };
          cell.font = { bold: true };
        } else if (isVersaiment) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERSAIMENT_ARGB } };
          cell.font = { bold: true, color: { argb: PRIMARY_ARGB } };
        } else if (isAlt) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ARGB } };
        }
        if (section.numericColumns?.includes(colNumber - 1)) {
          cell.alignment = { horizontal: "right" };
        }
      });
    });

    section.headers.forEach((h, i) => {
      let maxLen = h.length;
      section.rows.forEach((row) => {
        const len = String(row[i] ?? "").length;
        if (len > maxLen) maxLen = len;
      });
      ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 12), 42);
    });

    ws.views = [{ state: "frozen", ySplit: section.groupHeaders ? 6 : 5 }];
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number): string {
  const str = String(value ?? "").replace(/—/g, "-");
  return `"${str.replace(/"/g, '""')}"`;
}

function buildCsvReport(
  meta: ReportMeta,
  summary: string[],
  sections: ReportSection[],
  filename: string,
) {
  const lines: string[] = [];
  lines.push(csvEscape(COMPANY_NAME));
  lines.push(csvEscape(meta.title));
  lines.push(csvEscape(`Period: ${meta.period}`));
  lines.push(csvEscape(`Scope: ${meta.scope || "All"}`));
  lines.push(csvEscape(`Generated: ${new Date().toLocaleString()} by ${meta.generatedBy}`));
  lines.push("");

  if (summary.length > 0) {
    lines.push(csvEscape("Executive Summary"));
    summary.forEach((line) => lines.push(csvEscape(line)));
    lines.push("");
  }

  sections.forEach((section) => {
    if (section.rows.length === 0) return;
    lines.push(csvEscape(section.heading));
    if (section.groupHeaders) {
      const groupLine: string[] = [];
      section.groupHeaders.forEach((g) => {
        groupLine.push(csvEscape(g.label));
        for (let i = 1; i < g.span; i++) groupLine.push(csvEscape(""));
      });
      lines.push(groupLine.join(","));
    }
    lines.push(section.headers.map(csvEscape).join(","));
    section.rows.forEach((row) => {
      lines.push(row.map(csvEscape).join(","));
    });
    lines.push("");
    lines.push("");
  });

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================================
   END EXPORT ENGINE
============================================================================ */

function inRange(
  date: string,
  filter: DateFilter,
  customFrom: string,
  customTo: string,
): boolean {
  const d = new Date(date);
  const now = new Date();
  if (filter === "daily") return d.toDateString() === now.toDateString();
  if (filter === "weekly") {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  }
  if (filter === "monthly")
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  if (filter === "annual") return d.getFullYear() === now.getFullYear();
  if (filter === "custom") {
    if (!customFrom || !customTo) return true;
    return date >= customFrom && date <= customTo;
  }
  return true;
}

function dateRangeBounds(
  filter: DateFilter,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  const now = new Date();
  const toStr = (d: Date) => d.toISOString().slice(0, 10);

  if (filter === "daily") {
    const t = toStr(now);
    return { from: t, to: t };
  }
  if (filter === "weekly") {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return { from: toStr(weekAgo), to: toStr(now) };
  }
  if (filter === "monthly") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toStr(first), to: toStr(now) };
  }
  if (filter === "annual") {
    const first = new Date(now.getFullYear(), 0, 1);
    return { from: toStr(first), to: toStr(now) };
  }
 // custom
  return { from: customFrom || undefined, to: customTo || undefined };
}

const movementLabel = (type: string) =>
  type === "production"
    ? "Production Stock"
    : type === "marketing_agent"
      ? "Agent Dispatch"
      : type === "customer_sale"
        ? "Customer Direct Sale"
        : "Other Adjustment";

function computeRowSpans<T>(rows: T[], keyFn: (row: T) => string): number[] {
  const spans = new Array(rows.length).fill(0);
  let i = 0;
  while (i < rows.length) {
    const key = keyFn(rows[i]);
    let j = i + 1;
    while (j < rows.length && keyFn(rows[j]) === key) j++;
    spans[i] = j - i;
    i = j;
  }
  return spans;
}

const PIE_COLORS = ["#2E9E8F", "#D99A3D", "#3FA66B"];

const REPORT_TYPES: {
  id: ReportType;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "sales", label: "Sales", icon: FileText },
  { id: "stock", label: "Stock Movement", icon: Package },
  { id: "loans", label: "Loans", icon: CreditCard },
  { id: "payments", label: "Payments", icon: Banknote },
];

const dateLabel: Record<DateFilter, string> = {
  daily: "Today",
  weekly: "This Week",
  monthly: "This Month",
  annual: "This Year",
  custom: "Custom Range",
};

export default function Report() {
  const { state } = useStore();
  const agents = state.agents.filter((a) => !a.deleted);
  const products = state.products.filter((p) => !p.deleted);
  const clients = state.clients.filter((c) => !c.deleted);
  const activeReports = state.agentReports.filter((r) => !r.deleted);

  const [reportType, setReportType] = useState<ReportType>("sales");
  const [dateFilter, setDateFilter] = useState<DateFilter>("monthly");
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const [clientFilter, setClientFilter] = useState<"all" | string>("all");
  const [agentFilter, setAgentFilter] = useState<"all" | string>("all");
  const [productFilter, setProductFilter] = useState<"all" | string>(
    products[0]?.id ?? "all",
  );
    const [stockProductFilter, setStockProductFilter] = useState<string[]>([]);
  // empty array = show all products
  const [modeFilter, setModeFilter] = useState<"all" | PaymentMode>("all");

  const [hiddenSections, setHiddenSections] = useState<Record<string, boolean>>({});
  const [maSection, setMaSection] = useState<"sales" | "salesOnly" | "loanOnly" | "clients" | "payments" | "versaiment">("sales");
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [managerView, setManagerView] = useState<"business" | "stock" | "marketing">("business");
  const [managerAgentId, setManagerAgentId] = useState<string>("all");
  const { map: versaimentMap } = useVersaimentState();
  const { from: reconFrom, to: reconTo } = dateRangeBounds(dateFilter, customFrom, customTo);
  const {
    expenses: persistedReconciliationExpenses,
    addExpense: addPersistedReconciliationExpense,
    deleteExpense: deletePersistedReconciliationExpense,
    error: reconciliationError,
  } = useReconciliationExpenses(state.user?.id, reconFrom, reconTo);
  const [draftReconciliationExpenses, setDraftReconciliationExpenses] = useState <
    { id: string; name: string; amount: number }[]
  >([]);
  const [isSavingExpenses, setIsSavingExpenses] = useState(false);
  const reconciliationExpenses = [
    ...persistedReconciliationExpenses,
    ...draftReconciliationExpenses,
  ];

  const toggleSection = (key: string) => {
    setHiddenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const resetHiddenSections = () => setHiddenSections({});
  const isHidden = (key: string) => Boolean(hiddenSections[key]);
  const hiddenCount = Object.values(hiddenSections).filter(Boolean).length;
    const toggleStockProduct = (id: string) => {
    setStockProductFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const getName = (
    id: string | null | undefined,
    list: { id: string; name: string }[],
  ) => (id ? list.find((i) => i.id === id)?.name ?? "—" : "—");
  const getPaymentPartyName = (p: { clientId?: string; reportId?: string }) => {
    if (p.clientId) return getName(p.clientId, clients);
    const report = activeReports.find((r) => r.id === p.reportId);
    return report?.customerName?.trim() || "Walk-in customer";
  };

  const inDateRange = (date: string) =>
    inRange(date, dateFilter, customFrom, customTo);
  const getReportRemaining = (report: (typeof activeReports)[number]) => {
    const paid = state.payments
      .filter((p) => p.reportId === report.id)
      .reduce((s, p) => s + p.amount, 0);
    return Math.max(0, report.totalPrice - paid);
  };

  /* ---------------- SALES ---------------- */
  const salesFiltered = useMemo(() => {
    return activeReports.filter(
      (r) =>
        inDateRange(r.date) &&
        (clientFilter === "all" || r.clientId === clientFilter) &&
        (agentFilter === "all" || r.agentId === agentFilter),
    );
  }, [
    activeReports,
    dateFilter,
    customFrom,
    customTo,
    clientFilter,
    agentFilter,
  ]);

  const salesQty = salesFiltered.reduce((s, r) => s + r.qty, 0);
  const salesRevenue = salesFiltered.reduce((s, r) => s + r.totalPrice, 0);
  const salesPaid = salesFiltered
    .filter((r) => r.paymentStatus === "paid")
    .reduce((s, r) => s + r.totalPrice, 0);
  const salesLoan = salesFiltered
    .filter((r) => r.paymentStatus === "loan")
    .reduce((s, r) => s + r.totalPrice, 0);
  const salesOutstanding = salesFiltered
    .filter((r) => r.paymentStatus === "loan")
    .reduce((s, r) => s + getReportRemaining(r), 0);

  const salesByProduct = products
    .map((p) => {
      const rs = salesFiltered.filter((r) => r.productId === p.id);
      return {
        name: p.name,
        revenue: rs.reduce((s, r) => s + r.totalPrice, 0),
      };
    })
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const salesByAgent = agents
    .map((a) => {
      const rs = salesFiltered.filter((r) => r.agentId === a.id);
      return {
        name: a.name,
        revenue: rs.reduce((s, r) => s + r.totalPrice, 0),
      };
    })
    .filter((a) => a.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const salesTrendMap = new Map<string, number>();
  salesFiltered.forEach((r) =>
    salesTrendMap.set(r.date, (salesTrendMap.get(r.date) ?? 0) + r.totalPrice),
  );
  const salesTrend = Array.from(salesTrendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date: fmtDate(date), Revenue: revenue }));

  const salesStatusPie = [
    { name: "Paid", value: salesPaid },
    { name: "Loan", value: salesLoan },
  ].filter((d) => d.value > 0);

  /* ---------------- STOCK MOVEMENT ---------------- */
  const stockFiltered = useMemo(() => {
    return state.stockMovements.filter(
      (m) =>
        inDateRange(m.date) &&
        (productFilter === "all" || m.productId === productFilter) &&
        (stockProductFilter.length === 0 || stockProductFilter.includes(m.productId)) &&
        (agentFilter === "all" || m.agentId === agentFilter),
    );
  }, [
    state.stockMovements,
    dateFilter,
    customFrom,
    customTo,
    productFilter,
    stockProductFilter,
    agentFilter,
  ]);

  const stockIn = stockFiltered.reduce((s, m) => s + m.stockIn, 0);
  const stockOut = stockFiltered.reduce((s, m) => s + m.stockOut, 0);
  const stockNet = stockIn - stockOut;
  const currentBalance = (() => {
    const all = state.stockMovements.filter(
      (m) => productFilter === "all" || m.productId === productFilter,
    );
    return all.length ? all[all.length - 1].balance : 0;
  })();

  const stockTrend = stockFiltered
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: fmtDate(m.date), Balance: m.balance }));

  /* ---------------- LOANS ---------------- */
  const loansInRange = useMemo(() => {
    return activeReports.filter(
      (r) =>
        r.paymentStatus === "loan" &&
        inDateRange(r.date) &&
        (clientFilter === "all" || r.clientId === clientFilter),
    );
  }, [activeReports, dateFilter, customFrom, customTo, clientFilter]);

  const paymentsInRangeForLoans = useMemo(() => {
    return state.payments.filter(
      (p) =>
        inDateRange(p.date) &&
        (clientFilter === "all" || p.clientId === clientFilter),
    );
  }, [state.payments, dateFilter, customFrom, customTo, clientFilter]);

  const loansIssued = loansInRange.reduce((s, r) => s + r.totalPrice, 0);
  const loanPaymentsReceived = paymentsInRangeForLoans.reduce(
    (s, p) => s + p.amount,
    0,
  );

  const loansByClient = clients
    .map((c) => {
      const issuedReports = loansInRange.filter((r) => r.clientId === c.id);
      const issued = issuedReports.reduce((s, r) => s + r.totalPrice, 0);
      const qty = issuedReports.reduce((s, r) => s + r.qty, 0);
      const paidInRange = paymentsInRangeForLoans
        .filter((p) => p.clientId === c.id)
        .reduce((s, p) => s + p.amount, 0);
      const allLoanReports = activeReports.filter(
        (r) => r.clientId === c.id && r.paymentStatus === "loan",
      );
      const outstanding = allLoanReports.reduce(
        (s, r) => s + getReportRemaining(r),
        0,
      );
      return { client: c, issued, qty, paidInRange, outstanding };
    })
    .filter((l) => l.issued > 0 || l.paidInRange > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const loansChartData = loansByClient
    .slice(0, 8)
    .map((l) => ({ name: l.client.name, Outstanding: l.outstanding }));

  /* ---------------- PAYMENTS ---------------- */
  const paymentsFiltered = useMemo(() => {
    return state.payments
      .filter(
        (p) =>
          inDateRange(p.date) &&
          (clientFilter === "all" || p.clientId === clientFilter) &&
          (modeFilter === "all" || p.mode === modeFilter),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    state.payments,
    dateFilter,
    customFrom,
    customTo,
    clientFilter,
    modeFilter,
  ]);

  const paymentsTotal = paymentsFiltered.reduce((s, p) => s + p.amount, 0);
  const paymentsByMode = (["cash", "bank", "telephone"] as const)
    .map((mode) => ({
      name:
        mode === "telephone"
          ? "Mobile Money"
          : mode === "bank"
            ? "Bank"
            : "Cash",
      value: paymentsFiltered
        .filter((p) => p.mode === mode)
        .reduce((s, p) => s + p.amount, 0),
    }))
    .filter((d) => d.value > 0);

  const paymentsTrendMap = new Map<string, number>();
  paymentsFiltered.forEach((p) =>
    paymentsTrendMap.set(
      p.date,
      (paymentsTrendMap.get(p.date) ?? 0) + p.amount,
    ),
  );
  const paymentsTrend = Array.from(paymentsTrendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date: fmtDate(date), Received: amount }));

  const paymentReference = (p: (typeof paymentsFiltered)[number]) => {
    if (p.mode === "bank" && p.bankId) {
      const bankName = getName(p.bankId, state.banks);
      return p.receiverName ? `${bankName} — ${p.receiverName}` : bankName;
    }
    if (p.mode === "telephone" && p.receiverName)
      return `Receiver: ${p.receiverName}`;
    return "—";
  };

  const scopeLabel =
    clientFilter !== "all"
      ? getName(clientFilter, clients)
      : agentFilter !== "all"
        ? getName(agentFilter, agents)
        : "";

  /* ---------------- MANAGER: single-agent marketing snapshot ---------------- */
  const managerAgentReports = useMemo(() => {
    if (managerAgentId === "all") return [];
    return activeReports
      .filter((r) => r.agentId === managerAgentId && inDateRange(r.date))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activeReports, managerAgentId, dateFilter, customFrom, customTo]);

  const managerAgentSalesTotal = managerAgentReports.reduce((s, r) => s + r.totalPrice, 0);
  const managerAgentQty = managerAgentReports.reduce((s, r) => s + r.qty, 0);
  const managerAgentOutstanding = managerAgentReports
    .filter((r) => r.paymentStatus === "loan")
    .reduce((s, r) => s + getReportRemaining(r), 0);

  const managerAgentClients = clients
    .filter((c) => c.agentId === managerAgentId || c.handlerId === managerAgentId)
    .map((c) => {
      const outstanding = activeReports
        .filter((r) => r.clientId === c.id && r.paymentStatus === "loan")
        .reduce((s, r) => s + getReportRemaining(r), 0);
      return { client: c, outstanding };
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  const handleManagerAgentExport = (format: "pdf" | "excel" | "csv") => {
    const agentName = managerAgentId === "all" ? "All Agents" : getName(managerAgentId, agents);
    const meta: ReportMeta = {
      title: "Marketing Agent Report",
      period: dateLabel[dateFilter],
      scope: agentName,
      generatedBy: state.user?.name ?? "Manager",
    };
    const summary = [
      `Total Sales: ${fmt(managerAgentSalesTotal)}`,
      `Boxes Sold: ${managerAgentQty.toLocaleString()}`,
      `Outstanding: ${fmt(managerAgentOutstanding)}`,
      `Transactions: ${managerAgentReports.length}`,
    ];
    const sections: ReportSection[] = [
      {
        heading: "Sales Detail",
        headers: ["Date", "Client", "Phone", "District", "Product", "Qty", "Total", "Paid So Far", "Remaining", "Status"],
        rows: managerAgentReports.map((r) => {
          const client = clients.find((c) => c.id === r.clientId);
          const paid = state.payments.filter((p) => p.reportId === r.id).reduce((s, p) => s + p.amount, 0);
          return [
            fmtDate(r.date),
            client?.name ?? r.customerName ?? "Walk-in customer",
            client?.phone ?? "—",
            client?.district ?? "—",
            getName(r.productId, products),
            r.qty,
            fmt(r.totalPrice),
            fmt(paid),
            fmt(getReportRemaining(r)),
            r.paymentStatus === "paid" ? "Paid" : "Loan",
          ];
        }),
        numericColumns: [5, 6, 7, 8],
      },
      {
        heading: "Clients Handled",
        headers: ["Client", "Telephone", "District", "Outstanding"],
        rows: managerAgentClients.map(({ client, outstanding }) => [
          client.name ?? "—",
          client.phone ?? "—",
          client.district ?? "—",
          outstanding > 0 ? fmt(outstanding) : "Settled",
        ]),
        numericColumns: [3],
      },
    ];
    const filename = `kangaroo-manager-agent-${managerAgentId}-report-${today()}`;
    if (format === "pdf") buildPdfReport(meta, summary, sections, `${filename}.pdf`, "landscape");
    else if (format === "csv") buildCsvReport(meta, summary, sections, `${filename}.csv`);
    else {
      setIsExportingExcel(true);
      buildExcelReport(meta, summary, sections, `${filename}.xlsx`).finally(() => setIsExportingExcel(false));
    }
  };

  /* ============================================================
     ADMIN EXPORT DATA BUILDERS
     Each returns { meta, summary, sections } — business data ONLY,
     no dashboard cards, charts, graphs, or widgets.
  ============================================================ */
  const getAdminReportData = (): { meta: ReportMeta; summary: string[]; sections: ReportSection[] } => {
    const meta: ReportMeta = {
      title:
        reportType === "sales"
          ? "Sales Report"
          : reportType === "stock"
            ? "Stock Movement Report"
            : reportType === "loans"
              ? "Loans Report"
              : "Payments Report",
      period: dateLabel[dateFilter],
      scope: scopeLabel || "All",
      generatedBy: state.user?.name ?? "Administrator",
    };

    if (reportType === "sales") {
      const summary = [
        `Total Revenue: ${fmt(salesRevenue)}`,
        `Boxes Sold: ${salesQty.toLocaleString()}`,
        `Outstanding (Loans): ${fmt(salesOutstanding)}`,
        `Active Agents: ${salesByAgent.length}`,
        `Total Transactions: ${salesFiltered.length}`,
      ];
      const sections: ReportSection[] = [
        {
          heading: "Sales by Product",
          headers: ["Product", "Revenue"],
          rows: salesByProduct.map((p) => [p.name, fmt(p.revenue)]),
          numericColumns: [1],
        },
        {
          heading: "Sales by Agent",
          headers: ["Agent", "Revenue"],
          rows: salesByAgent.map((a) => [a.name, fmt(a.revenue)]),
          numericColumns: [1],
        },
        {
          heading: "Transaction Detail",
          headers: ["Date", "Agent", "Client", "Product", "Qty", "Total", "Status"],
          rows: salesFiltered
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((r) => [
              fmtDate(r.date),
              getName(r.agentId, agents),
              getName(r.clientId, clients),
              getName(r.productId, products),
              r.qty,
              fmt(r.totalPrice),
              r.paymentStatus === "paid" ? "Paid" : "Loan",
            ]),
          numericColumns: [4, 5],
        },
      ];
      return { meta, summary, sections };
    }

    if (reportType === "stock") {
      const summary = [
        `Stock In: ${stockIn.toLocaleString()} boxes`,
        `Stock Out: ${stockOut.toLocaleString()} boxes`,
        `Net Change: ${stockNet >= 0 ? "+" : ""}${stockNet.toLocaleString()} boxes`,
        `Current Balance: ${currentBalance.toLocaleString()} boxes`,
        `Total Records: ${stockFiltered.length}`,
      ];
      const sections: ReportSection[] = [
        {
          heading: "Stock Movement Detail",
          headers: ["Date", "Product", "Type", "Agent", "Location", "Stock In", "Stock Out", "Balance"],
          rows: stockFiltered
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((m) => [
              fmtDate(m.date),
              getName(m.productId, products),
              m.type === "production" ? "Production" : m.type === "marketing_agent" ? "Agent Dispatch" : "Other",
              m.agentId ? getName(m.agentId, agents) : "—",
              m.location || "—",
              m.stockIn > 0 ? `+${m.stockIn}${m.isReturn ? " (Return)" : ""}` : "0",
              m.stockOut > 0 ? `-${m.stockOut}` : "0",
              m.balance.toLocaleString(),
            ]),
          numericColumns: [5, 6, 7],
        },
      ];
      return { meta, summary, sections };
    }

    if (reportType === "loans") {
      const summary = [
        `Loans Issued (period): ${fmt(loansIssued)}`,
        `Payments Received (period): ${fmt(loanPaymentsReceived)}`,
        `Net Change: ${fmt(loansIssued - loanPaymentsReceived)}`,
        `Active Clients: ${loansByClient.length}`,
      ];
      const sections: ReportSection[] = [
        {
          heading: "Top Outstanding Clients",
          headers: ["Client", "Outstanding"],
          rows: loansChartData.map((l) => [l.name, fmt(l.Outstanding)]),
          numericColumns: [1],
        },
        {
          heading: "Client Loan Detail",
          headers: ["Client", "District", "Qty (period)", "Issued (period)", "Paid (period)", "Outstanding"],
          rows: loansByClient.map((l) => [
            l.client.name ?? "—",
            l.client.district ?? "—",
            l.qty,
            fmt(l.issued),
            fmt(l.paidInRange),
            fmt(l.outstanding),
          ]),
          numericColumns: [2, 3, 4, 5],
        },
      ];
      return { meta, summary, sections };
    }

    // payments
    const summary = [
      `Total Received: ${fmt(paymentsTotal)}`,
      ...paymentsByMode.map((m) => `${m.name}: ${fmt(m.value)}`),
      `Total Payments: ${paymentsFiltered.length}`,
    ];
    const sections: ReportSection[] = [
      {
        heading: "Payment Detail",
        headers: ["Date", "Client", "Amount", "Mode", "Reference"],
        rows: paymentsFiltered.map((p) => [
          fmtDate(p.date),
          getPaymentPartyName(p),
          fmt(p.amount),
          p.mode === "telephone" ? "Mobile Money" : p.mode === "bank" ? "Bank" : "Cash",
          paymentReference(p),
        ]),
        numericColumns: [2],
      },
    ];
    return { meta, summary, sections };
  };

  const exportFilenameBase = () => `kangaroo-${reportType}-report-${today()}`;

  const handleExportPdf = () => {
  const { meta, summary, sections } = getAdminReportData();
  buildPdfReport(meta, summary, sections, `${exportFilenameBase()}.pdf`, reportType === "stock" ? "landscape" : "portrait");
};

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const { meta, summary, sections } = getAdminReportData();
      await buildExcelReport(meta, summary, sections, `${exportFilenameBase()}.xlsx`);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportCsv = () => {
    const { meta, summary, sections } = getAdminReportData();
    buildCsvReport(meta, summary, sections, `${exportFilenameBase()}.csv`);
  };

  /* ============================================================
     STOCK AGENT — completely separate report UI
     Placed here (after all hooks) to comply with Rules of Hooks.
  ============================================================ */
  const userRole = normalizeRole(state.user?.role);
  if (userRole === "stock_agent") {
    const saFiltered = state.stockMovements.filter((m) =>
      inDateRange(m.date) &&
      (stockProductFilter.length === 0 || stockProductFilter.includes(m.productId)) &&
      (agentFilter === "all" || m.agentId === agentFilter)
    );

    const saIn = saFiltered.reduce((s, m) => s + m.stockIn, 0);
    const saOut = saFiltered.reduce((s, m) => s + m.stockOut, 0);
    const saNet = saIn - saOut;
    const saCount = saFiltered.length;

    const saTrendMap = new Map<string, { In: number; Out: number }>();
    saFiltered.forEach((m) => {
      const prev = saTrendMap.get(m.date) ?? { In: 0, Out: 0 };
      saTrendMap.set(m.date, { In: prev.In + m.stockIn, Out: prev.Out + m.stockOut });
    });
    const saTrend = Array.from(saTrendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: fmtDate(date), In: v.In, Out: v.Out }));

    const saTable = [...saFiltered].sort((a, b) => b.date.localeCompare(a.date));

    const saKpis = [
      { label: "Total In", value: `+${saIn.toLocaleString()}`, sub: "boxes received", color: "#3FA66B", icon: ArrowDownCircle },
      { label: "Total Out", value: `-${saOut.toLocaleString()}`, sub: "boxes dispatched", color: "#E05C5C", icon: ArrowUpCircle },
      { label: "Net Change", value: (saNet >= 0 ? "+" : "") + saNet.toLocaleString(), sub: "net movement", color: "#2E9E8F", icon: BarChart3 },
      { label: "Entries", value: saCount.toLocaleString(), sub: "total records", color: "#D99A3D", icon: Package },
    ];

    const SA_DATE_FILTERS: { id: DateFilter; label: string }[] = [
      { id: "daily", label: "Today" },
      { id: "monthly", label: "Monthly" },
      { id: "annual", label: "Annual" },
      { id: "custom", label: "Custom" },
    ];

    const getProductName = (pid: string) =>
      products.find((p) => p.id === pid)?.name ?? "—";
    const getAgentName = (aid?: string) =>
      aid ? agents.find((a) => a.id === aid)?.name ?? "—" : "—";

    const getStockAgentReportData = (): { meta: ReportMeta; summary: string[]; sections: ReportSection[] } => ({
      meta: {
        title: "Stock Movement Report",
        period: dateLabel[dateFilter],
        scope: [
          agentFilter !== "all" ? getAgentName(agentFilter) : "All Agents",
          stockProductFilter.length > 0
            ? stockProductFilter.map(getProductName).join(", ")
            : "All Products",
        ].join(" · "),
        generatedBy: state.user?.name ?? "Stock Agent",
      },
      summary: [
        `Total In: +${saIn.toLocaleString()} boxes`,
        `Total Out: -${saOut.toLocaleString()} boxes`,
        `Net Change: ${saNet >= 0 ? "+" : ""}${saNet.toLocaleString()} boxes`,
        `Total Entries: ${saCount}`,
      ],
      sections: [
  {
    heading: "Movement Records",
    headers: ["Date", "Product", "Description", "Agent / Location", "Stock In", "Stock Out", "Balance"],
    rows: saTable.map((m) => [
      fmtDate(m.date),
      getProductName(m.productId),
      movementLabel(m.type),
      m.agentId ? `${getAgentName(m.agentId)}${m.location ? ` (${m.location})` : ""}` : "—",
      m.stockIn > 0 ? (m.unit === "piece" && m.enteredQty ? `${m.enteredQty} pcs (${m.stockIn} boxes)` : `+${m.stockIn}`) : "0",
      m.stockOut > 0 ? (m.unit === "piece" && m.enteredQty ? `${m.enteredQty} pcs (${m.stockOut} boxes)` : `-${m.stockOut}`) : "0",
      m.balance.toLocaleString(),
    ]),
    numericColumns: [4, 5, 6],
  },
],
    });

    const saFilenameBase = () => `kangaroo-stock-report-${today()}`;

    const handleSaExportPdf = () => {
  const { meta, summary, sections } = getStockAgentReportData();
  buildPdfReport(meta, summary, sections, `${saFilenameBase()}.pdf`, "landscape");
};
    const handleSaExportExcel = async () => {
      setIsExportingExcel(true);
      try {
        const { meta, summary, sections } = getStockAgentReportData();
        await buildExcelReport(meta, summary, sections, `${saFilenameBase()}.xlsx`);
      } finally {
        setIsExportingExcel(false);
      }
    };
    const handleSaExportCsv = () => {
      const { meta, summary, sections } = getStockAgentReportData();
      buildCsvReport(meta, summary, sections, `${saFilenameBase()}.csv`);
    };

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        {/* Premium accent banner */}
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-primary text-white p-5 sm:p-7 mb-6 shadow-lg">
          <div className="pointer-events-none absolute -right-10 -top-14 w-48 h-48 rounded-full bg-card/10" />
          <div className="pointer-events-none absolute -right-28 top-6 w-64 h-64 rounded-full bg-card/[0.06]" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-card/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2.5">
                <Package size={11} />
                Stock Agent
              </div>
              <h1 className="text-xl sm:text-2xl font-bold">Stock Report</h1>
              <p className="text-xs sm:text-sm text-white/80 mt-1">
                {dateLabel[dateFilter]} · {saCount.toLocaleString()} movement{saCount !== 1 ? "s" : ""} recorded
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hiddenCount > 0 && (
                <button
                  onClick={resetHiddenSections}
                  className="flex items-center gap-1 text-xs font-semibold text-white bg-card/15 hover:bg-card/25 border border-white/20 px-3 py-2 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
                >
                  <RotateCcw size={12} /> Show all ({hiddenCount})
                </button>
              )}
              <button
                onClick={handleSaExportCsv}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card/15 hover:bg-card/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
              >
                <Download size={15} />
                <span>CSV</span>
              </button>
              <button
                onClick={handleSaExportExcel}
                disabled={isExportingExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card/15 hover:bg-card/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm disabled:opacity-60"
              >
                <FileSpreadsheet size={15} />
                <span>{isExportingExcel ? "Preparing..." : "Excel"}</span>
              </button>
              <button
                onClick={handleSaExportPdf}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card/15 hover:bg-card/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
              >
                <FileText size={15} />
                <span>PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 mb-6 flex flex-wrap gap-3 items-end shadow-sm">
          <div>
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1.5">Period</label>
            <div className="flex flex-wrap gap-1.5">
              {SA_DATE_FILTERS.map((f) => (
                <button key={f.id} onClick={() => setDateFilter(f.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius)] transition-colors ${dateFilter === f.id ? "bg-primary text-white shadow-sm" : "bg-background border border-border text-muted hover:text-foreground"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {dateFilter === "custom" && (
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              <span className="text-xs text-muted">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          )}
          <div className="ml-auto">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1.5">Agent</label>
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
              <option value="all">All Agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {/* Product filter — pick one, several, or leave empty for all */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wide">Products</label>
            {stockProductFilter.length > 0 && (
              <button
                onClick={() => setStockProductFilter([])}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Clear (showing all)
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius)] border cursor-pointer transition-colors ${
                  stockProductFilter.includes(p.id)
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-background border-border text-muted hover:text-foreground"
                }`}
              >
                <input
                  type="checkbox"
                  checked={stockProductFilter.includes(p.id)}
                  onChange={() => toggleStockProduct(p.id)}
                  className="accent-primary"
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        {!isHidden("sa-kpis") && (
          <div className="relative mb-6">
            <button
              onClick={() => toggleSection("sa-kpis")}
              title="Hide KPI cards"
              className="absolute -top-3 right-2 p-1 bg-card border border-border text-muted hover:text-danger hover:bg-danger/10 rounded-full transition-colors shadow-xs z-10"
            >
              <Minus size={12} />
            </button>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {saKpis.map((k) => (
                <div key={k.label} className="group relative bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5 overflow-hidden hover:shadow-md transition-all duration-200">
                  <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: k.color + "40" }} />
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[var(--radius)] flex items-center justify-center flex-shrink-0" style={{ background: k.color + "12" }}>
                      <k.icon size={18} style={{ color: k.color }} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">{k.label}</div>
                      <div className="text-lg sm:text-xl font-bold leading-tight" style={{ color: k.color }}>{k.value}</div>
                      <div className="text-[10px] text-muted/70">{k.sub}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Area chart */}
        {!isHidden("sa-trend") && (
          <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 mb-6">
            <div className="flex items-start justify-between mb-0.5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-0.5">Movement Trend</h3>
                <p className="text-xs text-muted mb-4">Stock In vs Out — {dateLabel[dateFilter]}</p>
              </div>
              <button
                onClick={() => toggleSection("sa-trend")}
                title="Hide chart"
                className="p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
              >
                <Minus size={14} />
              </button>
            </div>
            {saTrend.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted">No movement data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={saTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="saGradIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3FA66B" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3FA66B" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="saGradOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E05C5C" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#E05C5C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6B7B78" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: "#6B7B78" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E4EAE8", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    formatter={(v: any, name: any) =>
                      [<span style={{ fontWeight: 600 }}>{v}</span>, name]
                    }
                  />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="In" stroke="#3FA66B" strokeWidth={2} fill="url(#saGradIn)" dot={false} />
                  <Area type="monotone" dataKey="Out" stroke="#E05C5C" strokeWidth={2} fill="url(#saGradOut)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Movements table */}
        {!isHidden("sa-table") && (
          <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-sm">
            <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-2 bg-gradient-to-r from-primary/[0.04] to-transparent">
              <div>
                <h3 className="text-sm font-bold text-foreground">Movement Records</h3>
                <p className="text-xs text-muted mt-0.5">{saTable.length} entries — {dateLabel[dateFilter]}</p>
              </div>
              <button
                onClick={() => toggleSection("sa-table")}
                title="Hide table"
                className="p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors flex-shrink-0"
              >
                <Minus size={14} />
              </button>
            </div>
            {saTable.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-sm text-muted">No records for this period</p>
              </div>
            ) : (
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                      <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 text-left">Date</th>
                      <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 text-left">Product</th>
                      <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 text-left">Type</th>
                      <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 text-left">Agent</th>
                      <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 text-left">Location</th>
                      <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 text-center">Stock In</th>
                      <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 text-center">Stock Out</th>
                      <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saTable.map((m, i) => (
                      <tr key={m.id} className={`border-b border-border/40 transition-colors ${i % 2 === 1 ? "bg-background/50" : ""} ${i === saTable.length - 1 ? "border-b-0" : ""}`}>
                        <td className="px-4 py-3 text-xs  text-muted whitespace-nowrap">{fmtDate(m.date)}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-foreground whitespace-nowrap">{getProductName(m.productId)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                            m.type === "production" ? "bg-primary/10 text-primary" :
                            m.type === "marketing_agent" ? "bg-secondary/10 text-secondary" :
                            m.type === "customer_sale" ? "bg-success/10 text-success" :
                            "bg-muted/20 text-muted"
                          }`}>
                            {m.type === "production" ? "Production" : m.type === "marketing_agent" ? "Dispatch" : m.type === "customer_sale" ? "Customer Sale" : "Other"}
                          </span>
                          {m.isReturn && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wide">
                              Return
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{getAgentName(m.agentId)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{m.location ?? "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {m.stockIn > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs  text-success">
                              <ArrowDownCircle size={11} />+{m.stockIn}
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.stockOut > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs  text-danger">
                              <ArrowUpCircle size={11} />-{m.stockOut}
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-right text-foreground whitespace-nowrap">{m.balance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary/20 bg-primary/[0.03] text-xs font-bold">
                      <td colSpan={5} className="px-4 py-3 text-foreground uppercase tracking-wide">Summary ({saTable.length} Records)</td>
                      <td className="px-4 py-3 text-center text-success">+{saIn.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-danger">-{saOut.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {saTable.length > 0 ? `${saTable[0].balance.toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {/* Mobile stacked cards */}
            <div className="sm:hidden divide-y divide-border/50">
              {saTable.map((m) => (
                <div key={m.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      m.type === "production" ? "bg-primary/10 text-primary" :
                      m.type === "marketing_agent" ? "bg-secondary/10 text-secondary" :
                      "bg-muted/20 text-muted"
                    }`}>
                      {m.type === "production" ? "Production" : m.type === "marketing_agent" ? "Dispatch" : m.type}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {m.isReturn && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wide">
                          Return
                        </span>
                      )}
                      <span className="text-[10px]  text-muted">{fmtDate(m.date)}</span>
                    </div>
                  </div>
                  <div className="text-xs font-medium text-foreground mb-1">{getProductName(m.productId)}</div>
                  {m.agentId && <div className="text-[11px] text-muted mb-1">{getAgentName(m.agentId)}{m.location ? " · " + m.location : ""}</div>}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-4">
                      {m.stockIn > 0 && <span className="text-xs  text-success">+{m.stockIn}</span>}
                      {m.stockOut > 0 && <span className="text-xs  text-danger">-{m.stockOut}</span>}
                    </div>
                    <span className="text-xs text-muted">Bal: <span className=" text-foreground">{m.balance.toLocaleString()}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  }

  /* ============================================================
     MARKETING AGENT REPORT
  ============================================================ */
  if (userRole === "marketing_agent") {
    const myAgentId = state.user?.id;
    const firstName = (state.user?.name || "").trim().split(" ")[0] || "there";

    const myReports = activeReports.filter((r) => r.agentId === myAgentId);
    const myClientsList = clients.filter(
      (c) => c.agentId === myAgentId || c.handlerId === myAgentId,
    );
    const myPayments = state.payments.filter((p) => p.agentId === myAgentId);
    const myExpenses = state.expenses.filter((e) => e.agentId === myAgentId);

    const getProductName = (id: string) =>
      products.find((p) => p.id === id)?.name ?? "—";
    const getBankName = (id?: string) =>
      id ? state.banks.find((b) => b.id === id)?.name ?? "—" : "—";
    const getReportDate = (reportId?: string) =>
      reportId ? myReports.find((r) => r.id === reportId)?.date : undefined;
    const getPaymentPartyName = (p: { clientId?: string; reportId?: string }) => {
      if (p.clientId) return clients.find((c) => c.id === p.clientId)?.name ?? "—";
      const report = myReports.find((r) => r.id === p.reportId);
      return report?.customerName?.trim() || "Walk-in customer";
    };

    type SalesLoanRow = {
      key: string;
      reportId: string;
      date: string;
      clientName: string;
      phone: string;
      district: string;
      center: string;
      product: string;
      qty: number;
      unitPrice: number;
      totalPrice: number;
      paymentDate: string | null;
      amountPaid: number | null;
      method: string | null;
      remaining: number;
    };

    const buildSalesLoanRows = (reports: typeof myReports): SalesLoanRow[] => {
      const rows: SalesLoanRow[] = [];
      [...reports].sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => {
        const client = clients.find((c) => c.id === r.clientId);
        const reportPayments = state.payments
          .filter((p) => p.reportId === r.id)
          .sort((a, b) => a.date.localeCompare(b.date));
        const methodLabel = (p: (typeof reportPayments)[number]) =>
          p.mode === "telephone"
            ? `Mobile Money — ${p.receiverName || "—"}`
            : p.mode === "bank"
              ? "Bank"
              : "Cash";

        if (reportPayments.length === 0) {
          rows.push({
            key: r.id,
            reportId: r.id,
            date: r.date,
            clientName: client?.name ?? r.customerName ?? "Walk-in customer",
            phone: client?.phone ?? "—",
            district: client?.district ?? "—",
            center: client?.center ?? "—",
            product: getProductName(r.productId),
            qty: r.qty,
            unitPrice: r.unitPrice,
            totalPrice: r.totalPrice,
            paymentDate: null,
            amountPaid: null,
            method: null,
            remaining: r.totalPrice,
          });
          return;
        }

        let cumulativePaid = 0;
        reportPayments.forEach((p) => {
          cumulativePaid += p.amount;
          rows.push({
            key: `${r.id}-${p.id}`,
            reportId: r.id,
            date: r.date,
            clientName: client?.name ?? r.customerName ?? "Walk-in customer",
            phone: client?.phone ?? "—",
            district: client?.district ?? "—",
            center: client?.center ?? "—",
            product: getProductName(r.productId),
            qty: r.qty,
            unitPrice: r.unitPrice,
            totalPrice: r.totalPrice,
            paymentDate: p.date,
            amountPaid: p.amount,
            method: methodLabel(p),
            remaining: Math.max(0, r.totalPrice - cumulativePaid),
          });
        });
      });
      return rows.sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        return d !== 0 ? d : (a.paymentDate ?? "").localeCompare(b.paymentDate ?? "");
      });
    };


    const salesInRange = myReports
      .filter((r) => inDateRange(r.date))
      .sort((a, b) => a.date.localeCompare(b.date)); // ascending
    const salesLoanRows = buildSalesLoanRows(salesInRange);
    const salesLoanReportSpans = computeRowSpans(salesLoanRows, (r) => r.reportId);
    const salesTotal = salesInRange.reduce((s, r) => s + r.totalPrice, 0);

    // ---- Pure Sales Report: every transaction, paid or loan, no payment split ----
    const salesOnlyRows = salesInRange.map((r) => {
      const client = clients.find((c) => c.id === r.clientId);
      return {
        key: r.id,
        date: r.date,
        clientName: client?.name ?? r.customerName ?? "Walk-in customer",
        phone: client?.phone ?? "—",
        district: client?.district ?? "—",
        center: client?.center ?? "—",
        product: getProductName(r.productId),
        qty: r.qty,
        unitPrice: r.unitPrice,
        totalPrice: r.totalPrice,
        status: r.paymentStatus,
      };
    });
    const salesOnlyTotal = salesOnlyRows.reduce((s, r) => s + r.totalPrice, 0);
    const salesOnlyQty = salesOnlyRows.reduce((s, r) => s + r.qty, 0);
    const salesOnlyDateSpans = computeRowSpans(salesOnlyRows, (r) => r.date);

    // ---- Pure Loan Report: only loan-status entries, with paid-so-far & remaining ----
    const loanOnlyRows = salesInRange
      .filter((r) => r.paymentStatus === "loan")
      .map((r) => {
        const client = clients.find((c) => c.id === r.clientId);
        const paidSoFar = state.payments
          .filter((p) => p.reportId === r.id)
          .reduce((s, p) => s + p.amount, 0);
        return {
          key: r.id,
          date: r.date,
          clientName: client?.name ?? r.customerName ?? "Walk-in customer",
          phone: client?.phone ?? "—",
          district: client?.district ?? "—",
          center: client?.center ?? "—",
          product: getProductName(r.productId),
          qty: r.qty,
          totalPrice: r.totalPrice,
          paid: paidSoFar,
          remaining: Math.max(0, r.totalPrice - paidSoFar),
        };
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.date.localeCompare(b.date));
    const loanOnlyIssued = loanOnlyRows.reduce((s, r) => s + r.totalPrice, 0);
    const loanOnlyPaid = loanOnlyRows.reduce((s, r) => s + r.paid, 0);
    const loanOnlyOutstanding = loanOnlyRows.reduce((s, r) => s + r.remaining, 0);
    const loanOnlyClientSpans = computeRowSpans(loanOnlyRows, (r) => r.clientName);
    const salesQtyTotal = salesInRange.reduce((s, r) => s + r.qty, 0);
    const salesOutstandingTotal = salesInRange
      .filter((r) => r.paymentStatus === "loan")
      .reduce((s, r) => s + getReportRemaining(r), 0);

    const myClientsWithLoans = myClientsList.map((c) => {
      const clientLoanReports = myReports.filter(
        (r) => r.clientId === c.id && r.paymentStatus === "loan",
      );
      const outstanding = clientLoanReports.reduce(
        (s, r) => s + getReportRemaining(r),
        0,
      );
      return { client: c, outstanding };
    });
    const myClientsOutstandingTotal = myClientsWithLoans.reduce(
      (s, c) => s + c.outstanding,
      0,
    );

    const payInRange = myPayments.filter((p) => inDateRange(p.date));
    const expInRange = myExpenses.filter((e) => inDateRange(e.date));
    const payDayKeys = Array.from(
      new Set([...payInRange.map((p) => p.date), ...expInRange.map((e) => e.date)]),
    ).sort((a, b) => b.localeCompare(a));
    const payTotals = {
      cash: payInRange.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0),
      bank: payInRange.filter((p) => p.mode === "bank").reduce((s, p) => s + p.amount, 0),
      telephone: payInRange.filter((p) => p.mode === "telephone").reduce((s, p) => s + p.amount, 0),
      expense: expInRange.reduce((s, e) => s + e.amount, 0),
    };
    const grandCash = payTotals.cash;
    const grandBank = payTotals.bank;
    const grandTelephone = payTotals.telephone;
    const grandDepense = payTotals.expense;
    const reconciliationTotal = grandTelephone;
    const reconciliationExpensesTotal = reconciliationExpenses.reduce(
      (s, e) => s + (e.amount || 0),
      0,
    );
    const reconciliationRemaining = reconciliationTotal - reconciliationExpensesTotal;

    const versaimentRows = payDayKeys
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        const dCash = payInRange.filter((p) => p.date === date && p.mode === "cash").reduce((s, p) => s + p.amount, 0);
        const dTel = payInRange.filter((p) => p.date === date && p.mode === "telephone").reduce((s, p) => s + p.amount, 0);
        const dExp = expInRange.filter((e) => e.date === date).reduce((s, e) => s + e.amount, 0);
        if (dCash <= 0 && dTel <= 0) return null;
        const record = versaimentMap[keyFor(myAgentId ?? "", date)];
        const source = record?.source ?? (dCash > 0 ? "cash" : "telephone");
        const amount = (source === "cash" ? dCash : dTel) - dExp;
        return { date, amount, source, approved: Boolean(record?.approved), versaimentDate: record?.versaimentDate, madeBy: record?.madeBy };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const versaimentTotal = versaimentRows.reduce((s, r) => s + r.amount, 0);
    const versaimentPendingTotal = versaimentRows.filter((r) => !r.approved).reduce((s, r) => s + r.amount, 0);
    const versaimentApprovedTotal = versaimentRows.filter((r) => r.approved).reduce((s, r) => s + r.amount, 0);

    const MA_SECTIONS: { id: typeof maSection; label: string; icon: React.ElementType }[] = [
      { id: "sales", label: "Sales & Loan", icon: FileText },
      { id: "salesOnly", label: "Sales Report", icon: Package },
      { id: "loanOnly", label: "Loan Report", icon: CreditCard },
      { id: "clients", label: "My Clients", icon: Users },
      { id: "payments", label: "My Payments", icon: Banknote },
      { id: "versaiment", label: "Versaiment", icon: Wallet },
    ];
    const getMarketingAgentReportData = (): { meta: ReportMeta; summary: string[]; sections: ReportSection[] } => {
      const meta: ReportMeta = {
        title:
          maSection === "sales"
            ? "Agent Sales & Loan Report"
            : maSection === "clients"
              ? "My Clients Report"
              : "Agent Payments Report",
        period: dateLabel[dateFilter],
        scope: state.user?.name ?? "Marketing Agent",
        generatedBy: state.user?.name ?? "Marketing Agent",
      };

      if (maSection === "sales") {
        return {
          meta: { ...meta, title: "Sales & Loan Report" },
          summary: [
            `Total Sales: ${fmt(salesTotal)}`,
            `Boxes Sold: ${salesQtyTotal.toLocaleString()}`,
            `Outstanding: ${fmt(salesOutstandingTotal)}`,
            `Sales Count: ${salesInRange.length}`,
          ],
          sections: [
            {
              heading: "Sales & Loan Detail",
              headers: [
                "Date", "Client", "Telephone", "District", "Center", "Product",
                "Qty", "Unit Price", "Total Price",
                "Payment Date", "Amount Paid", "Method", "Remaining",
              ],
              rows: salesLoanRows.map((row, i) => {
                const first = salesLoanReportSpans[i] > 0;
                return [
                  first ? fmtDate(row.date) : "",
                  first ? row.clientName : "",
                  first ? row.phone : "",
                  first ? row.district : "",
                  first ? row.center : "",
                  first ? row.product : "",
                  first ? row.qty : "",
                  first ? fmt(row.unitPrice) : "",
                  first ? fmt(row.totalPrice) : "",
                  row.paymentDate ? fmtDate(row.paymentDate) : "—",
                  row.amountPaid != null ? fmt(row.amountPaid) : "—",
                  row.method ?? "—",
                  row.remaining > 0 ? fmt(row.remaining) : "Settled",
                ];
              }),
              numericColumns: [6, 7, 8, 10, 12],
            },
          ],
        };
      }

      if (maSection === "clients") {
        return {
          meta,
          summary: [
            `Clients Handled: ${myClientsList.length}`,
            `Total Outstanding: ${fmt(myClientsOutstandingTotal)}`,
          ],
          sections: [
            {
              heading: "My Clients",
              headers: ["Client", "Telephone", "District", "Sector", "Center", "Outstanding"],
              rows: myClientsWithLoans
                .slice()
                .sort((a, b) => b.outstanding - a.outstanding)
                .map(({ client, outstanding }) => [
                  client.name,
                  client.phone,
                  client.district,
                  client.sector,
                  client.center,
                  outstanding > 0 ? fmt(outstanding) : "Settled",
                ]),
              numericColumns: [5],
            },
          ],
        };
      }

      if (maSection === "salesOnly") {
        return {
          meta: { ...meta, title: "Sales Report" },
          summary: [
            `Total Sales: ${fmt(salesOnlyTotal)}`,
            `Boxes Sold: ${salesOnlyQty.toLocaleString()}`,
            `Total Transactions: ${salesOnlyRows.length}`,
          ],
          sections: [
            {
              heading: "Sales Detail",
              headers: ["Date", "Client", "Telephone", "District", "Center", "Product", "Qty", "Unit Price", "Total Price", "Status"],
              rows: salesOnlyRows.map((r, i) => [
                salesOnlyDateSpans[i] > 0 ? fmtDate(r.date) : "",
                r.clientName, r.phone, r.district, r.center, r.product,
                r.qty, fmt(r.unitPrice), fmt(r.totalPrice), r.status === "paid" ? "Paid" : "Loan",
              ]),
              numericColumns: [6, 7, 8],
            },
          ],
        };
      }

      if (maSection === "loanOnly") {
        return {
          meta: { ...meta, title: "Loan Report" },
          summary: [
            `Loans Issued: ${fmt(loanOnlyIssued)}`,
            `Paid So Far: ${fmt(loanOnlyPaid)}`,
            `Outstanding: ${fmt(loanOnlyOutstanding)}`,
            `Loan Entries: ${loanOnlyRows.length}`,
          ],
          sections: [
            {
              heading: "Loan Detail",
              headers: ["Client", "Telephone", "District", "Center", "Date", "Product", "Qty", "Total Price", "Paid So Far", "Remaining"],
              rows: loanOnlyRows.map((r, i) => {
                const first = loanOnlyClientSpans[i] > 0;
                return [
                  first ? r.clientName : "", first ? r.phone : "", first ? r.district : "", first ? r.center : "",
                  fmtDate(r.date), r.product, r.qty, fmt(r.totalPrice), fmt(r.paid),
                  r.remaining > 0 ? fmt(r.remaining) : "Settled",
                ];
              }),
              numericColumns: [6, 7, 8, 9],
            },
          ],
        };
      }

      if (maSection === "versaiment") {
        return {
          meta: { ...meta, title: "Versaiment Report" },
          summary: [
            `Total Versaiment: ${fmt(versaimentTotal)}`,
            `Pending: ${fmt(versaimentPendingTotal)}`,
            `Approved: ${fmt(versaimentApprovedTotal)}`,
            `Days Recorded: ${versaimentRows.length}`,
          ],
          sections: [
            {
              heading: "Versaiment Detail",
              headers: ["Date", "Source", "Amount", "Status", "Versaiment Date", "Made By"],
              rows: versaimentRows.map((r) => [
                fmtDate(r.date),
                r.source === "cash" ? "Cash" : "Mobile Money",
                fmt(r.amount),
                r.approved ? "Approved" : "Pending",
                r.versaimentDate ? fmtDate(r.versaimentDate) : "—",
                r.madeBy ?? "—",
              ]),
              numericColumns: [2],
            },
          ],
        };
      }

      // payments — one row per cash/bank/telephone/expense entry, grouped
      // under CASH / BANK / TELEPHONE parent columns, plus a Depenses
      // column. Grouped by day, closing each day with a subtotal row,
      // then a Versaiment row that carries the day's versaiment amount.
      const sortedDayKeys = [...payDayKeys].sort((a, b) => a.localeCompare(b));
      const exportRows: (string | number)[][] = [];
      sortedDayKeys.forEach((date) => {
        const dayPayments = payInRange.filter((p) => p.date === date);
        const dayExpenses = expInRange.filter((e) => e.date === date);
        const cash = dayPayments.filter((p) => p.mode === "cash");
        const bank = dayPayments.filter((p) => p.mode === "bank");
        const tel = dayPayments.filter((p) => p.mode === "telephone");

        exportRows.push([`— ${fmtDate(date)} —`, "", "", "", "", "", "", "", "", ""]);

        cash.forEach((p) => {
          const loanDate = getReportDate(p.reportId);
          exportRows.push([
            loanDate ? fmtDate(loanDate) : "—", getPaymentPartyName(p),
            fmt(p.amount), fmtDate(p.date),
            "", "", "",
            "", "",
            "",
          ]);
        });
        bank.forEach((p) => {
          const client = clients.find((c) => c.id === p.clientId);
          const loanDate = getReportDate(p.reportId);
          const bankLabel = getBankName(p.bankId) + (p.receiverName ? ` — ${p.receiverName}` : "");
          exportRows.push([
            loanDate ? fmtDate(loanDate) : "—", getPaymentPartyName(p),
            "", "",
            fmt(p.amount), fmtDate(p.date), bankLabel,
            "", "",
            "",
          ]);
        });
        tel.forEach((p) => {
          const client = clients.find((c) => c.id === p.clientId);
          const loanDate = getReportDate(p.reportId);
          exportRows.push([
            loanDate ? fmtDate(loanDate) : "—", getPaymentPartyName(p),
            "", "",
            "", "", "",
            fmt(p.amount), p.receiverName || "—",
            "",
          ]);
        });
        dayExpenses.forEach((e) => {
          exportRows.push([
            "—", e.name,
            "", "",
            "", "", "",
            "", "",
            fmt(e.amount),
          ]);
        });

        const dCash = cash.reduce((s, p) => s + p.amount, 0);
        const dBank = bank.reduce((s, p) => s + p.amount, 0);
        const dTel = tel.reduce((s, p) => s + p.amount, 0);
        const dExp = dayExpenses.reduce((s, e) => s + e.amount, 0);
        exportRows.push([
          `Subtotal — ${fmtDate(date)}`, "",
          fmt(dCash), "",
          fmt(dBank), "", "",
          fmt(dTel), "",
          fmt(dExp),
        ]);

        const versaimentRecord = versaimentMap[keyFor(myAgentId ?? "", date)];
        const versaimentSource = versaimentRecord?.source ?? (dCash > 0 ? "cash" : "telephone");
        const dVersaiment = (versaimentSource === "cash" ? dCash : dTel) - dExp;
        exportRows.push([
          `Versaiment — ${fmtDate(date)}: ${fmt(dVersaiment)}${versaimentRecord?.madeBy ? ` — by ${versaimentRecord.madeBy}` : ""}`, "",
          "", "",
          "", "", "",
          "", "",
          "",
        ]);
      });

      // Grand totals — same figures shown in the on-screen Total Cash /
      // Total Versaiment rows, appended so printed reports match the screen.
      exportRows.push([
        `Total Cash — ${dateLabel[dateFilter]}`, "",
        fmt(grandCash), "",
        fmt(grandBank), "", "",
        fmt(grandTelephone), "",
        fmt(grandDepense),
      ]);
      exportRows.push([
        `Total Versaiment: ${fmt(versaimentTotal)}`, "",
        "", "",
        "", "", "",
        "", "",
        "",
      ]);

      const reconciliationRows: (string | number)[][] = [
        ["Total", fmt(grandTelephone)],
        ...reconciliationExpenses.map((e) => [e.name || "Expense", fmt(e.amount)]),
        ["Remaining", fmt(reconciliationRemaining)],
      ];

      return {
        meta,
        summary: [
          `Cash: ${fmt(payTotals.cash)}`,
          `Bank: ${fmt(payTotals.bank)}`,
          `Mobile Money: ${fmt(payTotals.telephone)}`,
          `Depense: ${fmt(payTotals.expense)}`,
          `Versaiment: ${fmt(versaimentTotal)}`,
          `Reconciliation Remaining: ${fmt(reconciliationRemaining)}`,
        ],
        sections: [
          {
            heading: "Payments & Expenses",
            groupHeaders: [
              { label: "Date", span: 1 },
              { label: "Client / Category", span: 1 },
              { label: "CASH", span: 2 },
              { label: "BANK", span: 3 },
              { label: "TELEPHONE", span: 2 },
              { label: "Depenses", span: 1 },
            ],
            headers: [
              "Date", "Client / Category",
              "Amount", "Payment Date",
              "Amount", "Payment Date", "Bank",
              "Amount", "Receiver",
              "Amount",
            ],
            rows: exportRows,
            numericColumns: [2, 4, 7, 9],
          },
          {
            heading: "Total Amount(MOMO)",
            headers: ["Item", "Amount"],
            rows: reconciliationRows,
            numericColumns: [1],
          },
        ],
      };
    };

    const addReconciliationExpense = () => {
      setDraftReconciliationExpenses((prev) => [
        ...prev,
        { id: `draft-${Date.now()}-${prev.length}`, name: "", amount: 0 },
      ]);
    };
    const updateReconciliationExpense = (
      id: string,
      field: "name" | "amount",
      value: string,
    ) => {
      setDraftReconciliationExpenses((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, [field]: field === "amount" ? Number(value) || 0 : value }
            : e,
        ),
      );
    };
    const removeReconciliationExpense = (id: string) => {
      const isDraft = draftReconciliationExpenses.some((e) => e.id === id);
      if (isDraft) {
        setDraftReconciliationExpenses((prev) => prev.filter((e) => e.id !== id));
      } else {
        deletePersistedReconciliationExpense(id);
      }
    };
    const saveReconciliationExpenses = async () => {
      const rowsToSave = draftReconciliationExpenses.filter(
        (e) => e.name.trim() !== "" && e.amount > 0,
      );
      if (rowsToSave.length === 0) return;
      setIsSavingExpenses(true);
      for (const row of rowsToSave) {
        await addPersistedReconciliationExpense(
          row.name,
          row.amount,
          state.user?.name ?? "Unknown",
          state.user?.id ?? "",
        );
      }
      setDraftReconciliationExpenses([]);
      setIsSavingExpenses(false);
    };

    const maFilenameBase = () => `kangaroo-agent-${maSection}-report-${today()}`;

    const handleMaExportPdf = () => {
      const { meta, summary, sections } = getMarketingAgentReportData();
      const orientation =
        maSection === "sales" || maSection === "salesOnly" || maSection === "loanOnly" || maSection === "payments"
          ? "landscape"
          : "portrait";
      const density = maSection === "payments" ? "compact" : "normal";
      buildPdfReport(meta, summary, sections, `${maFilenameBase()}.pdf`, orientation, density);
    };
    const handleMaExportExcel = async () => {
      setIsExportingExcel(true);
      try {
        const { meta, summary, sections } = getMarketingAgentReportData();
        await buildExcelReport(meta, summary, sections, `${maFilenameBase()}.xlsx`);
      } finally {
        setIsExportingExcel(false);
      }
    };
    const handleMaExportCsv = () => {
      const { meta, summary, sections } = getMarketingAgentReportData();
      buildCsvReport(meta, summary, sections, `${maFilenameBase()}.csv`);
    };

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-primary text-white p-5 sm:p-7 mb-6 shadow-lg">
          <div className="pointer-events-none absolute -right-10 -top-14 w-48 h-48 rounded-full bg-card/10" />
          <div className="pointer-events-none absolute -right-28 top-6 w-64 h-64 rounded-full bg-card/[0.06]" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-card/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2.5">
                <Users size={11} />
                Marketing Agent
              </div>
              <h1 className="text-xl sm:text-2xl font-bold">
                Hey {firstName}, here's your report
              </h1>
              <p className="text-xs sm:text-sm text-white/80 mt-1">
                {dateLabel[dateFilter]} · export a clean copy for your own records
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleMaExportCsv}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card/15 hover:bg-card/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
              >
                <Download size={15} />
                <span>CSV</span>
              </button>
              <button
                onClick={handleMaExportExcel}
                disabled={isExportingExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card/15 hover:bg-card/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm disabled:opacity-60"
              >
                <FileSpreadsheet size={15} />
                <span>{isExportingExcel ? "Preparing..." : "Excel"}</span>
              </button>
              <button
                onClick={handleMaExportPdf}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card/15 hover:bg-card/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
              >
                <Printer size={15} />
                <span>PDF</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {MA_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setMaSection(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
                  maSection === s.id
                    ? "bg-primary text-white"
                    : "bg-card border border-border text-muted hover:text-foreground"
                }`}
              >
                <s.icon size={15} />
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(["daily", "weekly", "monthly", "annual", "custom"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`px-4 py-2 text-sm font-medium rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
                  dateFilter === f
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-card border border-border text-muted hover:text-foreground"
                }`}
              >
                {dateLabel[f]}
              </button>
            ))}
          </div>

          {dateFilter === "custom" && (
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-2 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-2 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          )}
        </div>

        {maSection === "sales" && (
          <>
            {/* 4 KPI cards in one row — muted professional colors */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Total Sales</div>
                <div className="text-lg font-bold text-foreground">{fmt(salesTotal)}</div>
              </div>
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Boxes Sold</div>
                <div className="text-lg font-bold text-foreground">{salesQtyTotal.toLocaleString()}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-secondary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-secondary uppercase tracking-wide mb-1">Outstanding</div>
                <div className="text-lg font-bold text-secondary">{fmt(salesOutstandingTotal)}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-primary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">Sales Count</div>
                <div className="text-lg font-bold text-primary">{salesInRange.length}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Sales & Loan Detail ({salesLoanRows.length} records)
                </h3>
              </div>
              {salesLoanRows.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No sales recorded for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                        {[
                          "Date", "Client", "Telephone", "District", "Center", "Product",
                          "Qty", "Unit Price", "Total Price",
                          "Payment Date", "Amount Paid", "Method", "Remaining",
                        ].map((h) => (
                          <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-3.5 whitespace-nowrap text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {salesLoanRows.map((row, i) => (
                        <tr key={row.key} className={`border-b border-border/40 ${i % 2 === 1 ? "bg-background/40" : ""} ${i === salesLoanRows.length - 1 ? "border-b-0" : ""}`}>
                          {salesLoanReportSpans[i] > 0 && (
                            <>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs  text-muted whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{fmtDate(row.date)}</td>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs font-semibold text-foreground whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{row.clientName}</td>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs text-muted whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{row.phone}</td>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs text-muted whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{row.district}</td>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs text-muted whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{row.center}</td>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs text-foreground whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{row.product}</td>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs  text-muted align-top border-r border-border/30 bg-primary/[0.03]">{row.qty}</td>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs  text-muted align-top border-r border-border/30 bg-primary/[0.03]">{fmt(row.unitPrice)}</td>
                              <td rowSpan={salesLoanReportSpans[i]} className="px-3 py-3 text-xs font-semibold text-foreground align-top border-r border-border/30 bg-primary/[0.03]">{fmt(row.totalPrice)}</td>
                            </>
                          )}
                          <td className="px-3 py-3 text-xs  text-muted whitespace-nowrap">{row.paymentDate ? fmtDate(row.paymentDate) : "—"}</td>
                          <td className="px-3 py-3 text-xs  text-success">{row.amountPaid != null ? fmt(row.amountPaid) : "—"}</td>
                          <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">{row.method ?? "—"}</td>
                          <td className="px-3 py-3 text-xs font-semibold text-secondary">
                            {row.remaining > 0 ? fmt(row.remaining) : <span className="text-success">Settled</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* sales report only */}
        {maSection === "salesOnly" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Total Sales</div>
                <div className="text-lg font-bold text-foreground">{fmt(salesOnlyTotal)}</div>
              </div>
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Boxes Sold</div>
                <div className="text-lg font-bold text-foreground">{salesOnlyQty.toLocaleString()}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-primary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">Transactions</div>
                <div className="text-lg font-bold text-primary">{salesOnlyRows.length}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Sales Report ({salesOnlyRows.length} records)</h3>
              </div>
              {salesOnlyRows.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No sales recorded for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                        {["Date", "Client", "Telephone", "District", "Center", "Product", "Qty", "Unit Price", "Total Price", "Status"].map((h) => (
                          <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-3.5 whitespace-nowrap text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {salesOnlyRows.map((r, i) => (
                        <tr key={r.key} className={`border-b border-border/40 ${i % 2 === 1 ? "bg-background/40" : ""}`}>
                          {salesOnlyDateSpans[i] > 0 && (
                            <td
                              rowSpan={salesOnlyDateSpans[i]}
                              className="px-3 py-3 text-xs  text-muted whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]"
                            >
                              {fmtDate(r.date)}
                            </td>
                          )}
                          <td className="px-3 py-3 text-xs font-semibold text-foreground whitespace-nowrap">{r.clientName}</td>
                          <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{r.phone}</td>
                          <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{r.district}</td>
                          <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{r.center}</td>
                          <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">{r.product}</td>
                          <td className="px-3 py-3 text-xs  text-muted">{r.qty}</td>
                          <td className="px-3 py-3 text-xs  text-muted">{fmt(r.unitPrice)}</td>
                          <td className="px-3 py-3 text-xs font-semibold text-foreground">{fmt(r.totalPrice)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded ${r.status === "paid" ? "bg-success/10 text-success" : "bg-secondary/10 text-secondary"}`}>
                              {r.status === "paid" ? "Paid" : "Loan"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* loans only report */}
        {maSection === "loanOnly" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Loans Issued</div>
                <div className="text-lg font-bold text-foreground">{fmt(loanOnlyIssued)}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-success/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-success uppercase tracking-wide mb-1">Paid So Far</div>
                <div className="text-lg font-bold text-success">{fmt(loanOnlyPaid)}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-secondary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-secondary uppercase tracking-wide mb-1">Outstanding</div>
                <div className="text-lg font-bold text-secondary">{fmt(loanOnlyOutstanding)}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-primary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">Loan Entries</div>
                <div className="text-lg font-bold text-primary">{loanOnlyRows.length}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Loan Report ({loanOnlyRows.length} records)</h3>
              </div>
              {loanOnlyRows.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No outstanding loans for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                        {["Client", "Telephone", "District", "Center", "Date", "Product", "Qty", "Total Price", "Paid So Far", "Remaining"].map((h) => (
                          <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-3.5 whitespace-nowrap text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loanOnlyRows.map((r, i) => (
                        <tr key={r.key} className={`border-b border-border/40 ${i % 2 === 1 ? "bg-background/40" : ""}`}>
                          {loanOnlyClientSpans[i] > 0 && (
                            <>
                              <td rowSpan={loanOnlyClientSpans[i]} className="px-3 py-3 text-xs font-semibold text-foreground whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{r.clientName}</td>
                              <td rowSpan={loanOnlyClientSpans[i]} className="px-3 py-3 text-xs text-muted whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{r.phone}</td>
                              <td rowSpan={loanOnlyClientSpans[i]} className="px-3 py-3 text-xs text-muted whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{r.district}</td>
                              <td rowSpan={loanOnlyClientSpans[i]} className="px-3 py-3 text-xs text-muted whitespace-nowrap align-top border-r border-border/30 bg-primary/[0.03]">{r.center}</td>
                            </>
                          )}
                          <td className="px-3 py-3 text-xs  text-muted whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">{r.product}</td>
                          <td className="px-3 py-3 text-xs  text-muted">{r.qty}</td>
                          <td className="px-3 py-3 text-xs font-semibold text-foreground">{fmt(r.totalPrice)}</td>
                          <td className="px-3 py-3 text-xs  text-success">{fmt(r.paid)}</td>
                          <td className="px-3 py-3 text-xs  text-secondary">
                            {r.remaining > 0 ? fmt(r.remaining) : <span className="text-success">Settled</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* my clients report */}
        {maSection === "clients" && (
          <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {myClientsList.length} client{myClientsList.length !== 1 ? "s" : ""} handled
              </h3>
              <span className="text-sm  text-secondary">{fmt(myClientsOutstandingTotal)} total outstanding</span>
            </div>
            {myClientsWithLoans.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted">No clients assigned yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                      {["Client", "Telephone", "District", "Sector", "Center", "Outstanding"].map((h) => (
                        <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-3.5 whitespace-nowrap text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {myClientsWithLoans
                      .sort((a, b) => b.outstanding - a.outstanding)
                      .map(({ client, outstanding }, i) => (
                        <tr key={client.id} className={`border-b border-border/40 ${i % 2 === 1 ? "bg-background/50" : ""}`}>
                          <td className="px-3 py-3 text-xs font-medium text-foreground whitespace-nowrap">{client.name}</td>
                          <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{client.phone}</td>
                          <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{client.district}</td>
                          <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{client.sector}</td>
                          <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{client.center}</td>
                          <td className="px-3 py-3 text-xs  text-secondary">
                            {outstanding > 0 ? fmt(outstanding) : <span className="text-success">Settled</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* payment report */}
        {maSection === "payments" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {[
                { label: "Cash", value: payTotals.cash, color: "#3FA66B" },
                { label: "Bank", value: payTotals.bank, color: "#2E9E8F" },
                { label: "Mobile Money", value: payTotals.telephone, color: "#D99A3D" },
                { label: "Depense", value: payTotals.expense, color: "#E05C5C" },
              ].map((t) => (
                <div key={t.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-4">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{t.label}</div>
                  <div className="text-base font-semibold" style={{ color: t.color }}>{fmt(t.value)}</div>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Payments & Expenses</h3>
                <p className="text-xs text-muted mt-0.5">Grouped by day · Cash, Bank & Mobile Money side by side · best printed landscape</p>
              </div>
              {payDayKeys.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No payments or expenses for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[1120px]">
                    <thead>
                      <tr className="bg-primary/[0.08]">
                        <th rowSpan={2} className="border border-border/60 text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-2 text-left align-bottom">Loan Date</th>
                        <th rowSpan={2} className="border border-border/60 text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-2 text-left align-bottom">Client / Category</th>
                        <th colSpan={2} className="border border-border/60 text-[11px] font-bold text-white uppercase tracking-wider px-3 py-2 text-center" style={{ background: "#3FA66B" }}>Cash</th>
                        <th colSpan={3} className="border border-border/60 text-[11px] font-bold text-white uppercase tracking-wider px-3 py-2 text-center" style={{ background: "#2E9E8F" }}>Bank</th>
                        <th colSpan={2} className="border border-border/60 text-[11px] font-bold text-white uppercase tracking-wider px-3 py-2 text-center" style={{ background: "#D99A3D" }}>Telephone</th>
                        <th rowSpan={2} className="border border-border/60 text-[11px] font-bold text-white uppercase tracking-wider px-3 py-2 text-center align-bottom" style={{ background: "#E05C5C" }}>Depenses</th>
                      </tr>
                      <tr className="bg-primary/[0.04]">
                        <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Amount</th>
                        <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Payment Date</th>
                        <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Amount</th>
                        <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Payment Date</th>
                        <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Bank</th>
                        <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Amount</th>
                        <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Receiver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...payDayKeys].sort((a, b) => a.localeCompare(b)).map((date) => {
                        const dayPayments = payInRange.filter((p) => p.date === date);
                        const dayExpenses = expInRange.filter((e) => e.date === date);
                        const cash = dayPayments.filter((p) => p.mode === "cash");
                        const bank = dayPayments.filter((p) => p.mode === "bank");
                        const tel = dayPayments.filter((p) => p.mode === "telephone");
                        const dCash = cash.reduce((s, p) => s + p.amount, 0);
                        const dBank = bank.reduce((s, p) => s + p.amount, 0);
                        const dTel = tel.reduce((s, p) => s + p.amount, 0);
                        const dExp = dayExpenses.reduce((s, e) => s + e.amount, 0);
                        const versaimentRecord = versaimentMap[keyFor(myAgentId ?? "", date)];
                        const versaimentSource = versaimentRecord?.source ?? (dCash > 0 ? "cash" : "telephone");
                        const dVersaiment = (versaimentSource === "cash" ? dCash : dTel) - dExp;

                        return (
                          <FragmentDay key={date}>
                            <tr>
                              <td colSpan={10} className="border border-border/60 bg-primary text-white px-3 py-2 text-xs font-semibold">
                                {fmtDate(date)}
                              </td>
                            </tr>

                            {cash.map((p) => {
                              const client = clients.find((c) => c.id === p.clientId);
                              const loanDate = getReportDate(p.reportId);
                              return (
                                <tr key={p.id} className="border-b border-border/40 hover:bg-accent/20">
                                  <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{loanDate ? fmtDate(loanDate) : "—"}</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs text-foreground whitespace-nowrap">{getPaymentPartyName(p)}</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs  text-success">{fmt(p.amount)}</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{fmtDate(p.date)}</td>
                                  <td colSpan={3} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                  <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                </tr>
                              );
                            })}

                            {bank.map((p) => {
                              const client = clients.find((c) => c.id === p.clientId);
                              const loanDate = getReportDate(p.reportId);
                              return (
                                <tr key={p.id} className="border-b border-border/40 hover:bg-accent/20">
                                  <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{loanDate ? fmtDate(loanDate) : "—"}</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs text-foreground whitespace-nowrap">{getPaymentPartyName(p)}</td>
                                  <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs  text-primary">{fmt(p.amount)}</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{fmtDate(p.date)}</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs text-muted whitespace-nowrap">{getBankName(p.bankId)}{p.receiverName ? ` — ${p.receiverName}` : ""}</td>
                                  <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                </tr>
                              );
                            })}

                            {tel.map((p) => {
                              const client = clients.find((c) => c.id === p.clientId);
                              const loanDate = getReportDate(p.reportId);
                              return (
                                <tr key={p.id} className="border-b border-border/40 hover:bg-accent/20">
                                  <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{loanDate ? fmtDate(loanDate) : "—"}</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs text-foreground whitespace-nowrap">{getPaymentPartyName(p)}</td>
                                  <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                  <td colSpan={3} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs  text-secondary">{fmt(p.amount)}</td>
                                  <td className="border border-border/40 px-3 py-2 text-xs text-muted whitespace-nowrap">{p.receiverName || "—"}</td>
                                </tr>
                              );
                            })}

                            {dayExpenses.map((e) => (
                              <tr key={e.id} className="border-b border-border/40 hover:bg-accent/20">
                                <td className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                <td className="border border-border/40 px-3 py-2 text-xs text-foreground whitespace-nowrap">{e.name}</td>
                                <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                <td colSpan={3} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                <td className="border border-border/40 px-3 py-2 text-xs  text-danger">{fmt(e.amount)}</td>
                              </tr>
                            ))}

                            <tr className="bg-accent/40">
                              <td colSpan={2} className="border border-border/60 px-3 py-2 text-xs font-semibold text-foreground">
                                Subtotal — {fmtDate(date)}
                              </td>
                              <td colSpan={2} className="border border-border/60 px-3 py-2 text-xs  text-success">{fmt(dCash)}</td>
                              <td colSpan={3} className="border border-border/60 px-3 py-2 text-xs  text-primary">{fmt(dBank)}</td>
                              <td colSpan={2} className="border border-border/60 px-3 py-2 text-xs  text-secondary">{fmt(dTel)}</td>
                              <td className="border border-border/60 px-3 py-2 text-xs  text-danger">{fmt(dExp)}</td>
                            </tr>
                            <tr className="bg-primary/10">
                              <td colSpan={10} className="border border-border/60 px-3 py-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
                                  Versaiment — {fmtDate(date)}: {fmt(dVersaiment)}
                                  {versaimentRecord?.madeBy && ` — by ${versaimentRecord.madeBy}`}
                                </span>
                              </td>
                            </tr>
                          </FragmentDay>
                        );
                      })}
                      <tr className="bg-primary text-white">
                        <td colSpan={2} className="border border-border/60 px-3 py-2.5 text-xs font-bold uppercase tracking-wide">
                          Total Cash — {dateLabel[dateFilter]}
                        </td>
                        <td colSpan={2} className="border border-border/60 px-3 py-2.5 text-xs">{fmt(grandCash)}</td>
                        <td colSpan={3} className="border border-border/60 px-3 py-2.5 text-xs">{fmt(grandBank)}</td>
                        <td colSpan={2} className="border border-border/60 px-3 py-2.5 text-xs">{fmt(grandTelephone)}</td>
                        <td className="border border-border/60 px-3 py-2.5 text-xs">{fmt(grandDepense)}</td>
                      </tr>
                      <tr className="bg-indigo-600 text-white">
                        <td colSpan={10} className="border border-border/60 px-3 py-2.5 text-xs font-bold uppercase tracking-wide">
                          Total Versaiment — {fmt(versaimentTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Cash Reconciliation summary */}
            <div className="mt-10 bg-gradient-to-br from-primary/[0.04] to-transparent border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-border bg-primary/[0.06]">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Wallet size={15} className="text-primary" />
                  Total Amount (MOMO)
                </h3>
                <p className="text-xs text-muted mt-0.5">{dateLabel[dateFilter]} · quick summary before versaiment</p>
              </div>
              <div className="divide-y divide-border/60">
                <div className="flex items-center justify-between px-5 py-3 bg-primary/[0.06]">
                  <span className="text-xs font-bold text-primary uppercase tracking-wide">Total</span>
                  <span className="text-sm  text-primary">{fmt(grandTelephone - reconciliationExpensesTotal)}</span>
                </div>
                {/* Already-saved expenses — view only for marketing agents, manager can edit/delete */}
                {persistedReconciliationExpenses.map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-xs text-foreground truncate">{exp.name || "Expense"}</span>
                    <span className="text-xs  text-muted">{fmt(exp.amount)}</span>
                  </div>
                ))}

                {/* Not-yet-saved — free to edit/remove until Save */}
                {draftReconciliationExpenses.map((exp) => (
                  <div key={exp.id} className="flex items-center gap-2 px-5 py-2.5">
                    <input
                      type="text"
                      value={exp.name}
                      onChange={(e) => updateReconciliationExpense(exp.id, "name", e.target.value)}
                      placeholder="Expense name"
                      className="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <input
                      type="number"
                      value={exp.amount || ""}
                      onChange={(e) => updateReconciliationExpense(exp.id, "amount", e.target.value)}
                      placeholder="0"
                      className="w-28 text-xs  px-2.5 py-1.5 border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-right"
                    />
                    <button
                      onClick={() => removeReconciliationExpense(exp.id)}
                      title="Remove expense"
                      className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors flex-shrink-0"
                    >
                      <Minus size={13} />
                    </button>
                  </div>
                ))}

                {reconciliationError && (
                  <div className="px-5 py-2 text-xs text-danger">{reconciliationError}</div>
                )}

                <div className="px-5 py-2.5 flex items-center gap-4">
                  <button
                    onClick={addReconciliationExpense}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    + Add another expense
                  </button>
                  {draftReconciliationExpenses.length > 0 && (
                    <button
                      onClick={saveReconciliationExpenses}
                      disabled={isSavingExpenses}
                      className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-[var(--radius)] bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {isSavingExpenses ? "Saving..." : "Save Expenses"}
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between px-5 py-4 bg-primary text-white">
                  <span className="text-xs font-bold uppercase tracking-wide">Remaining</span>
                  <span className="text-base font-bold">{fmt(reconciliationRemaining)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {maSection === "versaiment" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Total Versaiment</div>
                <div className="text-lg font-bold text-foreground">{fmt(versaimentTotal)}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-secondary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-secondary uppercase tracking-wide mb-1">Pending</div>
                <div className="text-lg font-bold text-secondary">{fmt(versaimentPendingTotal)}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-success/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-success uppercase tracking-wide mb-1">Approved</div>
                <div className="text-lg font-bold text-success">{fmt(versaimentApprovedTotal)}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-primary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">Days</div>
                <div className="text-lg font-bold text-primary">{versaimentRows.length}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Versaiment Report ({versaimentRows.length} records)</h3>
              </div>
              {versaimentRows.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No versaiment recorded for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                        {["Date", "Source", "Amount", "Status", "Versaiment Date", "Made By"].map((h) => (
                          <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-3.5 whitespace-nowrap text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {versaimentRows.map((r, i) => (
                        <tr key={r.date} className={`border-b border-border/40 ${i % 2 === 1 ? "bg-background/40" : ""}`}>
                          <td className="px-3 py-3 text-xs  text-muted whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">{r.source === "cash" ? "Cash" : "Mobile Money"}</td>
                          <td className="px-3 py-3 text-xs font-semibold text-foreground">{fmt(r.amount)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded ${r.approved ? "bg-success/10 text-success" : "bg-secondary/10 text-secondary"}`}>
                              {r.approved ? "Approved" : "Pending"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs  text-muted whitespace-nowrap">{r.versaimentDate ? fmtDate(r.versaimentDate) : "—"}</td>
                          <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">{r.madeBy ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const isManager = userRole === "manager";

  /* ============================================================
     MAIN ADMIN / MANAGER REPORT — The primary report view
  ============================================================ */
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      {isManager ? (
        <>
          {/* Premium Manager hero */}
          <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-primary via-primary to-indigo-600 text-white p-5 sm:p-7 mb-6 shadow-lg">
            <div className="pointer-events-none absolute -right-10 -top-14 w-56 h-56 rounded-full bg-card/10" />
            <div className="pointer-events-none absolute -right-32 top-10 w-72 h-72 rounded-full bg-card/[0.06]" />
            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 bg-card/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2.5">
                  <BarChart3 size={11} />
                  Manager
                </div>
                <h1 className="text-xl sm:text-2xl font-bold">
                  Command Center — every report, one place
                </h1>
                <p className="text-xs sm:text-sm text-white/80 mt-1">
                  {dateLabel[dateFilter]} · switch between business, stock and agent-level views
                </p>
              </div>
              {managerView !== "marketing" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleExportCsv}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card/15 hover:bg-card/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
                  >
                    <Download size={15} />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={handleExportExcel}
                    disabled={isExportingExcel}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card/15 hover:bg-card/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm disabled:opacity-60"
                  >
                    <FileSpreadsheet size={15} />
                    <span>{isExportingExcel ? "Preparing..." : "Excel"}</span>
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card text-primary rounded-[var(--radius)] hover:bg-card/90 transition-colors shadow-sm"
                  >
                    <Printer size={15} />
                    <span>PDF</span>
                  </button>
                </div>
              )}
            </div>

            {/* Live KPI strip */}
            <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              {[
                { label: "Revenue (Paid)", value: fmt(salesRevenue), icon: DollarSign },
                { label: "Outstanding", value: fmt(salesOutstanding), icon: CreditCard },
                { label: "Received (Payments)", value: fmt(paymentsTotal), icon: Banknote },
                { label: "Active Agents", value: agents.length.toString(), icon: Users },
              ].map((k) => (
                <div key={k.label} className="bg-card/10 backdrop-blur-sm border border-white/15 rounded-[var(--radius)] p-3">
                  <div className="flex items-center gap-1.5 text-white/70 text-[10px] font-semibold uppercase tracking-wide mb-1">
                    <k.icon size={11} />
                    {k.label}
                  </div>
                  <div className="text-sm sm:text-base font-bold">{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* View switcher */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
            {[
              { id: "business" as const, label: "Business Overview", icon: BarChart3 },
              { id: "stock" as const, label: "Stock Agent Reports", icon: Package },
              { id: "marketing" as const, label: "Marketing Agent Reports", icon: Users },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setManagerView(v.id);
                  if (v.id === "stock") setReportType("stock");
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
                  managerView === v.id
                    ? "bg-primary text-white shadow-sm"
                    : "bg-card border border-border text-muted hover:text-foreground"
                }`}
              >
                <v.icon size={15} />
                {v.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 lg:mb-8">
          <div>
            <h1 className="text-xl font-bold text-foreground">Report</h1>
            <p className="text-sm text-muted mt-0.5">
              {dateLabel[dateFilter]}
              {scopeLabel ? ` · ${scopeLabel}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors shadow-sm"
            >
              <Download size={15} />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors shadow-sm disabled:opacity-60"
            >
              <FileSpreadsheet size={15} />
              <span className="hidden sm:inline">{isExportingExcel ? "Preparing..." : "Excel"}</span>
            </button>
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Printer size={15} />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>
      )}

      {managerView === "business" && (
      <>
      {hiddenCount > 0 && (
        <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-[var(--radius)] mb-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <Eye size={14} />
            <span>{hiddenCount} Section{hiddenCount > 1 ? "s" : ""} Hidden from screen view</span>
          </div>
          <button
            onClick={resetHiddenSections}
            className="flex items-center gap-1 text-xs font-bold text-amber-900 hover:underline"
          >
            <RotateCcw size={12} /> Show All Sections
          </button>
        </div>
      )}

      {/* Filter controls panel */}
      <div className="mb-6 space-y-4">
        {/* Report type tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setReportType(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
                reportType === t.id
                  ? "bg-primary text-white"
                  : "bg-card border border-border text-muted hover:text-foreground"
                }`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Date range tabs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1 scrollbar-hide">
            {(["daily", "weekly", "monthly", "annual", "custom"] as const).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-4 py-2 text-sm font-medium rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
                    dateFilter === f
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-card border border-border text-muted hover:text-foreground"
                    }`}
                >
                  {dateLabel[f]}
                </button>
              ),
            )}
          </div>
        </div>

        {dateFilter === "custom" && (
          <div className="flex flex-col sm:flex-row gap-3 bg-card border border-border rounded-[var(--radius)] p-4">
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                From
              </label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                To
              </label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>
        )}

        {/* Type-specific scope filters */}
        <div className="grid grid-cols-2 sm:flex gap-3">
          {(reportType === "sales" ||
            reportType === "loans" ||
            reportType === "payments") && (
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-0"
              >
                <option value="all">All Clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

          {(reportType === "sales" || reportType === "stock") && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-0"
            >
              <option value="all">All Marketing Agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}

          {reportType === "sales" && (
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-0"
            >
              <option value="all">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {reportType === "payments" && (
            <select
              value={modeFilter}
              onChange={(e) =>
                setModeFilter(e.target.value as "all" | PaymentMode)
              }
              className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-0"
            >
              <option value="all">All Payment Modes</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="telephone">Mobile Money</option>
            </select>
          )}
        </div>
      </div>

      {/* ============ SALES ============ */}
      {reportType === "sales" && (
        <>
          {/* Sales KPIs Grid — 4 in one row, muted professional look */}
          {!isHidden("sales-kpis") && (
            <div className="relative mb-8">
              <button
                onClick={() => toggleSection("sales-kpis")}
                title="Hide KPI cards"
                className="absolute -top-3 right-2 p-1 bg-card border border-border text-muted hover:text-danger hover:bg-danger/10 rounded-full transition-colors shadow-xs z-10"
              >
                <Minus size={12} />
              </button>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  {
                    label: "Total Revenue",
                    value: fmt(salesRevenue),
                    icon: DollarSign,
                    color: "#2E9E8F",
                  },
                  {
                    label: "Boxes Sold",
                    value: salesQty.toLocaleString(),
                    icon: Package,
                    color: "#3FA66B",
                  },
                  {
                    label: "Outstanding",
                    value: fmt(salesOutstanding),
                    icon: CreditCard,
                    color: "#D99A3D",
                  },
                  {
                    label: "Active Agents",
                    value: salesByAgent.length.toString(),
                    icon: Users,
                    color: "#6B7B78",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-[var(--radius)] flex items-center justify-center flex-shrink-0"
                        style={{ background: kpi.color + "12" }}
                      >
                        <kpi.icon
                          size={18}
                          style={{ color: kpi.color }}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">{kpi.label}</div>
                        <div className="text-lg sm:text-xl font-bold leading-tight" style={{ color: kpi.color }}>
                          {kpi.value}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {salesFiltered.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {!isHidden("sales-trend") && (
                  <div className="lg:col-span-2 bg-card border border-border rounded-[var(--radius-lg)] p-6 hover:shadow-md transition-shadow duration-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          Revenue Trend
                        </h3>
                        <p className="text-xs text-muted">
                          Sales revenue over the selected period
                        </p>
                      </div>
                      <button
                        onClick={() => toggleSection("sales-trend")}
                        title="Hide chart"
                        className="p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={salesTrend}>
                        <defs>
                          <linearGradient
                            id="revGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#2E9E8F"
                              stopOpacity={0.15}
                            />
                            <stop
                              offset="95%"
                              stopColor="#2E9E8F"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#6B7B78" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#6B7B78" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v: any) => fmt(Number(v || 0))}
                        />
                        <Area
                          type="monotone"
                          dataKey="Revenue"
                          stroke="#2E9E8F"
                          strokeWidth={2}
                          fill="url(#revGrad)"
                          dot={{ fill: "#2E9E8F", r: 3 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {!isHidden("sales-pie") && (
                  <div className="bg-card border border-border rounded-[var(--radius-lg)] p-6 hover:shadow-md transition-shadow duration-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          Paid vs Loan
                        </h3>
                        <p className="text-xs text-muted">
                          Revenue by payment status
                        </p>
                      </div>
                      <button
                        onClick={() => toggleSection("sales-pie")}
                        title="Hide chart"
                        className="p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={salesStatusPie}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {salesStatusPie.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: any) => fmt(Number(v || 0))}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Legend
                          iconSize={8}
                          iconType="circle"
                          wrapperStyle={{ fontSize: 11 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <RankedBarCard
                  title="Sales by Product"
                  sub="Revenue breakdown per product"
                  data={salesByProduct}
                  color="#2E9E8F"
                />
                <RankedBarCard
                  title="Sales by Agent"
                  sub="Top performing marketing agents"
                  data={salesByAgent}
                  color="#D99A3D"
                />
              </div>

              <DetailTable
                icon={FileText}
                title="Transaction Detail"
                count={salesFiltered.length}
                headers={[
                  "Date",
                  "Agent",
                  "Client",
                  "Product",
                  "Qty",
                  "Total",
                  "Status",
                ]}
                rows={salesFiltered
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r) => ({
                    key: r.id,
                    cells: [
                      fmtDate(r.date),
                      getName(r.agentId, agents),
                      getName(r.clientId, clients),
                      getName(r.productId, products),
                      r.qty.toString(),
                      fmt(r.totalPrice),
                    ],
                    status:
                      r.paymentStatus === "paid"
                        ? {
                            label: "Paid",
                            className:
                              "bg-success/10 text-success border border-success/20",
                          }
                        : {
                            label: "Loan",
                            className:
                              "bg-secondary/10 text-secondary border border-secondary/20",
                          },
                    mobileTitle: getName(r.agentId, agents),
                    mobileSub: `→ ${getName(r.clientId, clients)} · ${getName(r.productId, products)}`,
                    mobileLeft: `${r.qty} boxes`,
                    mobileRight: fmt(r.totalPrice),
                  }))}
              />
            </>
          )}
        </>
      )}

      {/* ============ STOCK MOVEMENT ============ */}
      {reportType === "stock" && (
        <>
          {/* 4 KPI cards — one row, muted */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
            {[
              {
                label: "Stock In",
                value: `${stockIn.toLocaleString()} boxes`,
                icon: ArrowDownCircle,
                color: "#3FA66B",
              },
              {
                label: "Stock Out",
                value: `${stockOut.toLocaleString()} boxes`,
                icon: ArrowUpCircle,
                color: "#E05C5C",
              },
              {
                label: "Net Change",
                value: `${stockNet >= 0 ? "+" : ""}${stockNet.toLocaleString()}`,
                icon: Package,
                color: "#2E9E8F",
              },
              {
                label: "Current Balance",
                value: `${currentBalance.toLocaleString()} boxes`,
                icon: BarChart3,
                color: "#6B7B78",
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-[var(--radius)] flex items-center justify-center flex-shrink-0"
                    style={{ background: kpi.color + "12" }}
                  >
                    <kpi.icon
                      size={18}
                      style={{ color: kpi.color }}
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">{kpi.label}</div>
                    <div className="text-base sm:text-lg font-bold leading-tight" style={{ color: kpi.color }}>
                      {kpi.value}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {stockFiltered.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-6 mb-8 hover:shadow-md transition-shadow duration-200">
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  Balance Trend
                </h3>
                <p className="text-xs text-muted mb-5">
                  Running balance over the selected period
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stockTrend}>
                    <defs>
                      <linearGradient
                        id="stockGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#2E9E8F"
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="95%"
                          stopColor="#2E9E8F"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#6B7B78" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#6B7B78" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: any) => [`${v} boxes`, "Balance"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="Balance"
                      stroke="#2E9E8F"
                      strokeWidth={2}
                      fill="url(#stockGrad)"
                      dot={{ fill: "#2E9E8F", r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-sm">
                {/* Header with Title */}
                <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-primary flex-shrink-0" />
                    <h3 className="text-sm font-bold text-foreground">Movement Record</h3>
                    <span className="text-xs text-muted">({stockFiltered.length} records)</span>
                  </div>
                </div>

                {/* Desktop & Tablet Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                        <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-left">Date</th>
                        <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-left">Products Name</th>
                        <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-left">Type</th>
                        <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-left">Agent</th>
                        <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-left">Location</th>
                        <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-center">Stock In</th>
                        <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-center">Stock Out</th>
                        <th className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockFiltered
                        .slice()
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((m, i) => (
                          <tr
                            key={m.id}
                            className={`border-b border-border/40 transition-colors ${
                              i % 2 === 1 ? "bg-background/50" : ""
                            } ${i === stockFiltered.length - 1 ? "border-b-0" : ""}`}
                          >
                            <td className="px-4 py-3 text-xs  text-muted whitespace-nowrap">
                              {fmtDate(m.date)}
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-foreground whitespace-nowrap">
                              {getName(m.productId, products)}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                              {m.type === "production"
                                ? "Production"
                                : m.type === "marketing_agent"
                                  ? "Agent Dispatch"
                                  : "Other"}
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-foreground whitespace-nowrap">
                              {m.agentId ? getName(m.agentId, agents) : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                              {m.location || "—"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {m.stockIn > 0 ? (
                                <div className="inline-flex items-center gap-1.5 text-success text-xs  font-semibold">
                                  <ArrowDownCircle size={11} />+{m.stockIn}
                                  {m.isReturn && (
                                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wide">
                                      Return
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {m.stockOut > 0 ? (
                                <span className="inline-flex items-center gap-1 text-danger text-xs  font-semibold">
                                  <ArrowUpCircle size={11} />-{m.stockOut}
                                </span>
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs  font-bold text-right text-foreground whitespace-nowrap">
                              {m.balance.toLocaleString()} boxes
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-primary/20 bg-primary/[0.03] font-bold text-xs">
                        <td colSpan={5} className="px-4 py-3 text-foreground uppercase tracking-wide">
                          Summary ({stockFiltered.length} Records)
                        </td>
                        <td className="px-4 py-3 text-center text-success ">
                          +{stockFiltered.reduce((s, m) => s + m.stockIn, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center text-danger ">
                          -{stockFiltered.reduce((s, m) => s + m.stockOut, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground ">
                          {stockFiltered.length > 0
                            ? `${stockFiltered[0].balance.toLocaleString()} boxes`
                            : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile View Stacked Cards */}
                <div className="sm:hidden divide-y divide-border/50">
                  {stockFiltered
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((m) => (
                      <div key={m.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">
                            {getName(m.productId, products)}
                          </span>
                          <span className="text-[11px]  text-muted">
                            {fmtDate(m.date)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>
                            {m.type === "production" ? "Production" : "Agent Dispatch"}{" "}
                            {m.agentId ? `· ${getName(m.agentId, agents)}` : ""}
                          </span>
                          {m.location && <span>{m.location}</span>}
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                          <div>
                            {m.stockIn > 0 ? (
                              <span className="text-success  font-bold">
                                +{m.stockIn} boxes {m.isReturn ? "(Return)" : ""}
                              </span>
                            ) : (
                              <span className="text-danger  font-bold">
                                -{m.stockOut} boxes
                              </span>
                            )}
                          </div>
                          <span className=" font-bold text-foreground">
                            Bal: {m.balance.toLocaleString()} boxes
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ============ LOANS ============ */}
      {reportType === "loans" && (
        <>
          {/* 4 KPI cards — one row, muted */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
            {[
              {
                label: "Loans Issued",
                value: fmt(loansIssued),
                icon: CreditCard,
                color: "#D99A3D",
              },
              {
                label: "Payments Received",
                value: fmt(loanPaymentsReceived),
                icon: DollarSign,
                color: "#3FA66B",
              },
              {
                label: "Net Change",
                value: fmt(loansIssued - loanPaymentsReceived),
                icon: BarChart3,
                color: "#2E9E8F",
              },
              {
                label: "Active Clients",
                value: loansByClient.length.toString(),
                icon: Users,
                color: "#6B7B78",
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-[var(--radius)] flex items-center justify-center flex-shrink-0"
                    style={{ background: kpi.color + "12" }}
                  >
                    <kpi.icon
                      size={18}
                      style={{ color: kpi.color }}
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">{kpi.label}</div>
                    <div className="text-lg font-bold leading-tight" style={{ color: kpi.color }}>
                      {kpi.value}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {loansByClient.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <RankedBarCard
                title="Top Outstanding Clients"
                sub="Current outstanding balance (all-time)"
                data={loansChartData.map((d) => ({
                  name: d.name,
                  revenue: d.Outstanding,
                }))}
                color="#D99A3D"
                className="mb-8"
              />

              <DetailTable
                icon={CreditCard}
                title="Client Loan Detail"
                count={loansByClient.length}
                headers={[
                  "Client",
                  "District",
                  "Qty (period)",
                  "Issued (period)",
                  "Paid (period)",
                  "Outstanding",
                ]}
                rows={loansByClient.map((l) => ({
                  key: l.client.id,
                  cells: [
                    l.client.name ?? "—",
                    l.client.district ?? "—",
                    l.qty.toString(),
                    fmt(l.issued),
                    fmt(l.paidInRange),
                    fmt(l.outstanding),
                  ],
                  mobileTitle: l.client.name ?? "—",
                  mobileSub: `${l.client.district ?? "—"} · ${l.qty} boxes this period`,
                  mobileLeft: `Issued: ${fmt(l.issued)}`,
                  mobileRight: fmt(l.outstanding),
                }))}
              />
            </>
          )}
        </>
      )}

      {/* ============ PAYMENTS ============ */}
      {reportType === "payments" && (
        <>
          {/* 4 KPI cards — one row, muted */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <div className="col-span-2 bg-primary/5 border border-primary/15 rounded-[var(--radius-lg)] p-4 sm:p-5">
              <div className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">
                Total Received
              </div>
              <div className="text-xl sm:text-2xl text-primary  font-bold">
                {fmt(paymentsTotal)}
              </div>
            </div>
            {(["cash", "bank", "telephone"] as const).map((mode) => {
              const modeTotal = paymentsFiltered
                .filter((p) => p.mode === mode)
                .reduce((s, p) => s + p.amount, 0);
              return (
                <div
                  key={mode}
                  className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5"
                >
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1 capitalize">
                    {mode === "telephone" ? "Mobile Money" : mode}
                  </div>
                  <div className="text-base sm:text-lg text-foreground  font-bold">
                    {fmt(modeTotal)}
                  </div>
                </div>
              );
            })}
          </div>

          {paymentsFiltered.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-card border border-border rounded-[var(--radius-lg)] p-6 hover:shadow-md transition-shadow duration-200">
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Payments Trend
                  </h3>
                  <p className="text-xs text-muted mb-5">
                    Amount received over the selected period
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={paymentsTrend}>
                      <defs>
                        <linearGradient
                          id="payGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#3FA66B"
                            stopOpacity={0.15}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3FA66B"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "#6B7B78" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#6B7B78" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(v: any) => fmt(Number(v || 0))}
                      />
                      <Area
                        type="monotone"
                        dataKey="Received"
                        stroke="#3FA66B"
                        strokeWidth={2}
                        fill="url(#payGrad)"
                        dot={{ fill: "#3FA66B", r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-card border border-border rounded-[var(--radius-lg)] p-6 hover:shadow-md transition-shadow duration-200">
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    By Mode
                  </h3>
                  <p className="text-xs text-muted mb-5">
                    Received amount per payment mode
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={paymentsByMode}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {paymentsByMode.map((_, i) => (
                          <Cell
                            key={i}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: any) => fmt(Number(v || 0))}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Legend
                        iconSize={8}
                        iconType="circle"
                        wrapperStyle={{ fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <DetailTable
                icon={Banknote}
                title="Payment Detail"
                count={paymentsFiltered.length}
                headers={["Date", "Client", "Amount", "Mode", "Reference"]}
                rows={paymentsFiltered.map((p) => ({
                  key: p.id,
                  cells: [
                    fmtDate(p.date),
                    getPaymentPartyName(p),
                    fmt(p.amount),
                    p.mode === "telephone"
                      ? "Mobile Money"
                      : p.mode === "bank"
                        ? "Bank"
                        : "Cash",
                    paymentReference(p),
                  ],
                  mobileTitle: getPaymentPartyName(p),
                  mobileSub: paymentReference(p),
                  mobileLeft:
                    p.mode === "telephone"
                      ? "Mobile Money"
                      : p.mode === "bank"
                        ? "Bank"
                        : "Cash",
                  mobileRight: fmt(p.amount),
                }))}
              />
            </>
          )}
        </>
      )}
      </>
      )}

      {isManager && managerView === "stock" && (
        <>
          <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 mb-6 flex flex-wrap gap-3 items-end shadow-sm">
            <div className="ml-auto">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1.5">Agent</label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="all">All Agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-wide">Products</label>
              {stockProductFilter.length > 0 && (
                <button
                  onClick={() => setStockProductFilter([])}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Clear (showing all)
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {products.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius)] border cursor-pointer transition-colors ${
                    stockProductFilter.includes(p.id)
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-background border-border text-muted hover:text-foreground"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={stockProductFilter.includes(p.id)}
                    onChange={() => toggleStockProduct(p.id)}
                    className="accent-primary"
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {[
              { label: "Stock In", value: `${stockIn.toLocaleString()} boxes`, icon: ArrowDownCircle, color: "#3FA66B" },
              { label: "Stock Out", value: `${stockOut.toLocaleString()} boxes`, icon: ArrowUpCircle, color: "#E05C5C" },
              { label: "Net Change", value: `${stockNet >= 0 ? "+" : ""}${stockNet.toLocaleString()}`, icon: BarChart3, color: "#2E9E8F" },
              { label: "Current Balance", value: `${currentBalance.toLocaleString()} boxes`, icon: Package, color: "#6B7B78" },
            ].map((k) => (
              <div key={k.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[var(--radius)] flex items-center justify-center flex-shrink-0" style={{ background: k.color + "12" }}>
                    <k.icon size={18} style={{ color: k.color }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">{k.label}</div>
                    <div className="text-base sm:text-lg font-bold leading-tight" style={{ color: k.color }}>{k.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {stockFiltered.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-0.5">Movement Trend</h3>
                <p className="text-xs text-muted mb-4">Stock In vs Out — {dateLabel[dateFilter]}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stockTrend}>
                    <defs>
                      <linearGradient id="mgrStockGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2E9E8F" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#2E9E8F" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6B7B78" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6B7B78" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [`${v} boxes`, "Balance"]} />
                    <Area type="monotone" dataKey="Balance" stroke="#2E9E8F" strokeWidth={2} fill="url(#mgrStockGrad)" dot={{ fill: "#2E9E8F", r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <DetailTable
                icon={Package}
                title="Movement Records"
                count={stockFiltered.length}
                headers={["Date", "Product", "Type", "Agent", "In", "Out", "Balance"]}
                rows={stockFiltered
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((m) => ({
                    key: m.id,
                    cells: [
                      fmtDate(m.date),
                      getName(m.productId, products),
                      m.type === "production" ? "Production" : m.type === "marketing_agent" ? "Dispatch" : "Other",
                      m.agentId ? getName(m.agentId, agents) : "—",
                      m.stockIn > 0 ? `+${m.stockIn}` : "0",
                      m.stockOut > 0 ? `-${m.stockOut}` : "0",
                      m.balance.toLocaleString(),
                    ],
                    mobileTitle: getName(m.productId, products),
                    mobileSub: m.agentId ? getName(m.agentId, agents) : "—",
                    mobileLeft: m.stockIn > 0 ? `+${m.stockIn}` : `-${m.stockOut}`,
                    mobileRight: `${m.balance.toLocaleString()} boxes`,
                  }))}
              />
            </>
          )}
        </>
      )}

      {isManager && managerView === "marketing" && (
        <ManagerMarketingReports
          agents={agents}
          clients={clients}
          products={products}
          activeReports={activeReports}
          payments={state.payments}
          expenses={state.expenses}
          banks={state.banks}
          versaimentMap={versaimentMap}
          dateFilter={dateFilter}
          customFrom={customFrom}
          customTo={customTo}
          setDateFilter={setDateFilter}
          setCustomFrom={setCustomFrom}
          setCustomTo={setCustomTo}
        />
      )}
    </div>
  );
}

/* ---------------- Shared subcomponents ---------------- */
function FragmentDay({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function EmptyState() {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16">
      <BarChart3 size={32} className="text-muted/40 mb-3" />
      <p className="text-sm text-muted">No data for this period</p>
    </div>
  );
}

function RankedBarCard({
  title,
  sub,
  data,
  color,
  className = "",
  onHide,
}: {
  title: string;
  sub: string;
  data: { name: string; revenue: number }[];
  color: string;
  className?: string;
  onHide?: () => void;
}) {
  return (
    <div
      className={`bg-card border border-border rounded-[var(--radius-lg)] p-6 hover:shadow-md transition-shadow duration-200 ${className}`}
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
          <p className="text-xs text-muted mb-5">{sub}</p>
        </div>
        {onHide && (
          <button
            onClick={onHide}
            title="Hide section"
            className="p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
          >
            <Minus size={14} />
          </button>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#E4EAE8"
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "#6B7B78" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "#1B2321" }}
            tickLine={false}
            axisLine={false}
            width={90}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v: any) => fmt(Number(v || 0))}
          />
          <Bar dataKey="revenue" fill={color} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DetailRow {
  key: string;
  cells: string[];
  status?: { label: string; className: string };
  mobileTitle: string;
  mobileSub: string;
  mobileLeft: string;
  mobileRight: string;
}

function DetailTable({
  icon: Icon,
  title,
  count,
  headers,
  rows,
  onHide,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  headers: string[];
  rows: DetailRow[];
  onHide?: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-primary flex-shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="text-xs text-muted">({count} records)</span>
        </div>
        {onHide && (
          <button
            onClick={onHide}
            title="Hide table"
            className="p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
          >
            <Minus size={14} />
          </button>
        )}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
              {headers.map((h) => (
                <th
                  key={h}
                  className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3.5 whitespace-nowrap text-left"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.key}
                className={`border-b border-border/40 transition-colors ${
                  i % 2 === 1 ? "bg-background/50" : ""
                } ${i === rows.length - 1 ? "border-b-0" : ""}`}
              >
                {row.cells.map((cell, ci) => {
                  const safeCell = cell ?? "—";
                  const isAmount = safeCell.includes(",") || safeCell.startsWith("RWF");
                  return (
                    <td
                      key={ci}
                      className={`px-4 py-3 whitespace-nowrap ${
                        isAmount || ci >= 2
                          ? "text-xs  font-semibold text-foreground"
                          : "text-xs text-foreground"
                      }`}
                    >
                      {safeCell}
                    </td>
                  );
                })}
                {row.status && (
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded whitespace-nowrap ${row.status.className}`}
                    >
                      {row.status.label}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden divide-y divide-border/50">
        {rows.map((row) => (
          <div key={row.key} className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground truncate">
                {row.mobileTitle}
              </span>
              {row.status ? (
                <span
                  className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded flex-shrink-0 ${row.status.className}`}
                >
                  {row.status.label}
                </span>
              ) : (
                <span className="text-sm  font-semibold text-foreground flex-shrink-0">
                  {row.mobileRight}
                </span>
              )}
            </div>
            <div className="text-xs text-muted truncate mb-1.5">
              {row.mobileSub}
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{row.mobileLeft}</span>
              {row.status && (
                <span className=" font-semibold text-foreground">
                  {row.mobileRight}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function ManagerMarketingReports({
  agents,
  clients,
  products,
  activeReports,
  payments,
  expenses,
  banks,
  versaimentMap,
  dateFilter,
  customFrom,
  customTo,
  setDateFilter,
  setCustomFrom,
  setCustomTo,
}: {
  agents: { id: string; name: string }[];
  clients: any[];
  products: any[];
  activeReports: any[];
  payments: any[];
  expenses: any[];
  banks: any[];
  versaimentMap: any;
  dateFilter: DateFilter;
  customFrom: string;
  customTo: string;
  setDateFilter: (f: DateFilter) => void;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
}) {
  const [section, setSection] = useState <
"sales" | "salesOnly" | "loanOnly" | "clients" | "payments" | "versaiment"
>("clients");
const [isExportingExcel, setIsExportingExcel] = useState(false);
const [mergeAgentIds, setMergeAgentIds] = useState<string[]>([]);

const isMerging = mergeAgentIds.length >= 2;
const singleAgentId = mergeAgentIds.length === 1 ? mergeAgentIds[0] : null;

  const { state } = useStore();
  const { from: reconFrom, to: reconTo } = dateRangeBounds(dateFilter, customFrom, customTo);
  const {
    expenses: managerReconciliationExpenses,
    addExpense: addManagerReconciliationExpense,
    updateExpense: updateManagerReconciliationExpense,
    deleteExpense: deleteManagerReconciliationExpense,
    error: managerReconciliationError,
  } = useReconciliationExpenses(singleAgentId ?? undefined, reconFrom, reconTo);

  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpenseName, setEditExpenseName] = useState("");
  const [editExpenseAmount, setEditExpenseAmount] = useState("");
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  const handleAddManagerExpense = async () => {
    if (!newExpenseName.trim() || !Number(newExpenseAmount)) return;
    setIsSavingExpense(true);
    await addManagerReconciliationExpense(
      newExpenseName.trim(),
      Number(newExpenseAmount),
      state.user?.name ?? "Manager",
      state.user?.id ?? "",
    );
    setNewExpenseName("");
    setNewExpenseAmount("");
    setIsSavingExpense(false);
  };

  const inDateRange = (date: string) => inRange(date, dateFilter, customFrom, customTo);
  const getName = (
    id: string | null | undefined,
    list: { id: string; name: string }[],
  ) => (id ? list.find((i) => i.id === id)?.name ?? "—" : "—");
  const getPaymentPartyName = (p: { clientId?: string; reportId?: string }) => {
    if (p.clientId) return getName(p.clientId, clients);
    const report = activeReports.find((r) => r.id === p.reportId);
    return report?.customerName?.trim() || "Walk-in customer";
  };
  const getReportRemaining = (report: any) => {
    const paid = payments
      .filter((p: any) => p.reportId === report.id)
      .reduce((s: number, p: any) => s + p.amount, 0);
    return Math.max(0, report.totalPrice - paid);
  };
  const getProductName = (id: string | null | undefined) =>
    id ? products.find((p: any) => p.id === id)?.name ?? "—" : "—";
  const getBankName = (id?: string | null) => (id ? banks.find((b: any) => b.id === id)?.name ?? "—" : "—");

  const mergeableIds: (typeof section)[] = ["clients", "loanOnly"];
  const activeSection =
    isMerging && !mergeableIds.includes(section) ? "clients" : section;

  const toggleAgent = (id: string) => {
    setMergeAgentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const SECTIONS: { id: typeof section; label: string; icon: React.ElementType }[] = [
    { id: "sales", label: "Sales & Loan", icon: FileText },
    { id: "salesOnly", label: "Sales Report", icon: Package },
    { id: "loanOnly", label: "Loan Report", icon: CreditCard },
    { id: "clients", label: "My Clients", icon: Users },
    { id: "payments", label: "My Payments", icon: Banknote },
    { id: "versaiment", label: "Versaiment", icon: Wallet },
  ];

  /* ---------------- per-agent data ---------------- */
  const agentReportsInRange = (agentId: string) =>
    activeReports.filter((r: any) => r.agentId === agentId && inDateRange(r.date));

  const salesLoanRows = (agentId: string) =>
    agentReportsInRange(agentId).map((r: any) => {
      const client = clients.find((c: any) => c.id === r.clientId);
      const paid = payments.filter((p: any) => p.reportId === r.id).reduce((s: number, p: any) => s + p.amount, 0);
      const remaining = Math.max(0, r.totalPrice - paid);
      return {
        key: r.id,
        cells: [
          fmtDate(r.date),
          client?.name ?? r.customerName ?? "Walk-in customer",
          getProductName(r.productId),
          r.qty.toString(),
          fmt(r.totalPrice),
          fmt(paid),
          remaining > 0 ? fmt(remaining) : "Settled",
        ],
        mobileTitle: client?.name ?? r.customerName ?? "Walk-in customer",
        mobileSub: getProductName(r.productId),
        mobileLeft: `Paid: ${fmt(paid)}`,
        mobileRight: remaining > 0 ? fmt(remaining) : "Settled",
      };
    });

  const salesOnlyRows = (agentId: string) =>
    agentReportsInRange(agentId).map((r: any) => {
      const client = clients.find((c: any) => c.id === r.clientId);
      return {
        key: r.id,
        cells: [fmtDate(r.date), client?.name ?? r.customerName ?? "Walk-in customer", getProductName(r.productId), r.qty.toString(), fmt(r.totalPrice)],
        status:
          r.paymentStatus === "paid"
            ? { label: "Paid", className: "bg-success/10 text-success border border-success/20" }
            : { label: "Loan", className: "bg-secondary/10 text-secondary border border-secondary/20" },
        mobileTitle: client?.name ?? r.customerName ?? "Walk-in customer",
        mobileSub: getProductName(r.productId),
        mobileLeft: `${r.qty} boxes`,
        mobileRight: fmt(r.totalPrice),
      };
    });

  const loanRowsRaw = (agentId: string) =>
    agentReportsInRange(agentId)
      .filter((r: any) => r.paymentStatus === "loan")
      .map((r: any) => {
        const client = clients.find((c: any) => c.id === r.clientId);
        const paidSoFar = payments.filter((p: any) => p.reportId === r.id).reduce((s: number, p: any) => s + p.amount, 0);
        return {
          key: r.id,
          date: r.date,
          clientName: client?.name ?? r.customerName ?? "Walk-in customer",
          phone: client?.phone ?? "—",
          district: client?.district ?? "—",
          center: client?.center ?? "—",
          product: getProductName(r.productId),
          qty: r.qty,
          totalPrice: r.totalPrice,
          paid: paidSoFar,
          remaining: Math.max(0, r.totalPrice - paidSoFar),
        };
      });

  const loanOnlyRows = (agentId: string) =>
    loanRowsRaw(agentId).map((r) => ({
      key: r.key,
      cells: [
        fmtDate(r.date), r.clientName, r.district, r.product, r.qty.toString(),
        fmt(r.totalPrice), fmt(r.paid), r.remaining > 0 ? fmt(r.remaining) : "Settled",
      ],
      mobileTitle: r.clientName,
      mobileSub: `${r.district} · ${r.product}`,
      mobileLeft: `Paid: ${fmt(r.paid)}`,
      mobileRight: r.remaining > 0 ? fmt(r.remaining) : "Settled",
    }));

  const clientRowsRaw = (agentId: string) =>
    clients
      .filter((c: any) => c.agentId === agentId || c.handlerId === agentId)
      .map((c: any) => {
        const outstanding = activeReports
          .filter((r: any) => r.clientId === c.id && r.agentId === agentId && r.paymentStatus === "loan")
          .reduce((s: number, r: any) => s + getReportRemaining(r), 0);
        return { client: c, outstanding };
      })
      .sort((a, b) => b.outstanding - a.outstanding);

  const clientRows = (agentId: string) =>
    clientRowsRaw(agentId).map(({ client, outstanding }) => ({
      key: client.id,
      cells: [client.name ?? "—", client.phone ?? "—", client.district ?? "—", outstanding > 0 ? fmt(outstanding) : "Settled"],
      mobileTitle: client.name ?? "—",
      mobileSub: client.district ?? "—",
      mobileLeft: client.phone ?? "—",
      mobileRight: outstanding > 0 ? fmt(outstanding) : "Settled",
    }));

  const paymentsInRange = (agentId: string) => payments.filter((p: any) => p.agentId === agentId && inDateRange(p.date));
  const expensesInRange = (agentId: string) => expenses.filter((e: any) => e.agentId === agentId && inDateRange(e.date));

  const paymentTotals = (agentId: string) => {
    const p = paymentsInRange(agentId);
    const e = expensesInRange(agentId);
    return {
      cash: p.filter((x: any) => x.mode === "cash").reduce((s: number, x: any) => s + x.amount, 0),
      bank: p.filter((x: any) => x.mode === "bank").reduce((s: number, x: any) => s + x.amount, 0),
      telephone: p.filter((x: any) => x.mode === "telephone").reduce((s: number, x: any) => s + x.amount, 0),
      expense: e.reduce((s: number, x: any) => s + x.amount, 0),
    };
  };

  const paymentRows = (agentId: string) =>
    paymentsInRange(agentId)
      .slice()
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
      .map((p: any) => {
        const client = clients.find((c: any) => c.id === p.clientId);
        const ref =
          p.mode === "bank" && p.bankId ? getBankName(p.bankId)
          : p.mode === "telephone" && p.receiverName ? `Receiver: ${p.receiverName}`
          : "—";
        return {
          key: p.id,
          cells: [fmtDate(p.date), getPaymentPartyName(p), fmt(p.amount), p.mode === "telephone" ? "Mobile Money" : p.mode === "bank" ? "Bank" : "Cash", ref],
          mobileTitle: getPaymentPartyName(p),
          mobileSub: ref,
          mobileLeft: p.mode === "telephone" ? "Mobile Money" : p.mode === "bank" ? "Bank" : "Cash",
          mobileRight: fmt(p.amount),
        };
      });

  const versaimentRows = (agentId: string) => {
    const p = paymentsInRange(agentId);
    const e = expensesInRange(agentId);
    const days = Array.from(new Set([...p.map((x: any) => x.date), ...e.map((x: any) => x.date)])).sort();
    return days
      .map((date) => {
        const dCash = p.filter((x: any) => x.date === date && x.mode === "cash").reduce((s: number, x: any) => s + x.amount, 0);
        const dTel = p.filter((x: any) => x.date === date && x.mode === "telephone").reduce((s: number, x: any) => s + x.amount, 0);
        const dExp = e.filter((x: any) => x.date === date).reduce((s: number, x: any) => s + x.amount, 0);
        if (dCash <= 0 && dTel <= 0) return null;
        const record = versaimentMap[keyFor(agentId, date)];
        const source = record?.source ?? (dCash > 0 ? "cash" : "telephone");
        const amount = (source === "cash" ? dCash : dTel) - dExp;
        return {
          key: date,
          cells: [fmtDate(date), source === "cash" ? "Cash" : "Mobile Money", record?.madeBy || "—", fmt(amount)],
          status: record?.approved
            ? { label: "Approved", className: "bg-success/10 text-success border border-success/20" }
            : { label: "Pending", className: "bg-secondary/10 text-secondary border border-secondary/20" },
          mobileTitle: fmtDate(date),
          mobileSub: source === "cash" ? "Cash" : "Mobile Money",
          mobileLeft: record?.approved ? "Approved" : "Pending",
          mobileRight: fmt(amount),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  };

  /* ---------------- merged (multi-agent) data ---------------- */
  const mergedClientGroups = mergeAgentIds.map((id) => {
    const rows = clientRowsRaw(id);
    return { agentId: id, agentName: getName(id, agents), rows, subtotal: rows.reduce((s, r) => s + r.outstanding, 0) };
  });
  const mergedClientsGrandTotal = mergedClientGroups.reduce((s, g) => s + g.subtotal, 0);

  const mergedLoanGroups = mergeAgentIds.map((id) => {
    const rows = loanRowsRaw(id);
    return {
      agentId: id,
      agentName: getName(id, agents),
      rows,
      issued: rows.reduce((s, r) => s + r.totalPrice, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      outstanding: rows.reduce((s, r) => s + r.remaining, 0),
    };
  });
  const mergedLoanGrand = {
    issued: mergedLoanGroups.reduce((s, g) => s + g.issued, 0),
    paid: mergedLoanGroups.reduce((s, g) => s + g.paid, 0),
    outstanding: mergedLoanGroups.reduce((s, g) => s + g.outstanding, 0),
  };

  /* ---------------- export ---------------- */

  const buildAgentSalesLoanExportRows = (agentId: string) => {
    const rows: any[] = [];
    [...agentReportsInRange(agentId)].sort((a, b) => a.date.localeCompare(b.date)).forEach((r: any) => {
      const client = clients.find((c: any) => c.id === r.clientId);
      const reportPayments = payments
        .filter((p: any) => p.reportId === r.id)
        .sort((a: any, b: any) => a.date.localeCompare(b.date));
      const methodLabel = (p: any) =>
        p.mode === "telephone" ? `Mobile Money — ${p.receiverName || "—"}` : p.mode === "bank" ? "Bank" : "Cash";

      if (reportPayments.length === 0) {
        rows.push({
          key: r.id, reportId: r.id, date: r.date,
          clientName: client?.name ?? r.customerName ?? "Walk-in customer",
          phone: client?.phone ?? "—", district: client?.district ?? "—", center: client?.center ?? "—",
          product: getProductName(r.productId), qty: r.qty, unitPrice: r.unitPrice, totalPrice: r.totalPrice,
          paymentDate: null, amountPaid: null, method: null, remaining: r.totalPrice,
        });
        return;
      }
      let cumulativePaid = 0;
      reportPayments.forEach((p: any) => {
        cumulativePaid += p.amount;
        rows.push({
          key: `${r.id}-${p.id}`, reportId: r.id, date: r.date,
          clientName: client?.name ?? r.customerName ?? "Walk-in customer",
          phone: client?.phone ?? "—", district: client?.district ?? "—", center: client?.center ?? "—",
          product: getProductName(r.productId), qty: r.qty, unitPrice: r.unitPrice, totalPrice: r.totalPrice,
          paymentDate: p.date, amountPaid: p.amount, method: methodLabel(p),
          remaining: Math.max(0, r.totalPrice - cumulativePaid),
        });
      });
    });
    return rows.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : (a.paymentDate ?? "").localeCompare(b.paymentDate ?? "");
    });
  };

  const versaimentRowsRaw = (agentId: string) => {
    const p = paymentsInRange(agentId);
    const e = expensesInRange(agentId);
    const days = Array.from(new Set([...p.map((x: any) => x.date), ...e.map((x: any) => x.date)])).sort();
    return days
      .map((date) => {
        const dCash = p.filter((x: any) => x.date === date && x.mode === "cash").reduce((s: number, x: any) => s + x.amount, 0);
        const dTel = p.filter((x: any) => x.date === date && x.mode === "telephone").reduce((s: number, x: any) => s + x.amount, 0);
        const dExp = e.filter((x: any) => x.date === date).reduce((s: number, x: any) => s + x.amount, 0);
        if (dCash <= 0 && dTel <= 0) return null;
        const record = versaimentMap[keyFor(agentId, date)];
        const source = record?.source ?? (dCash > 0 ? "cash" : "telephone");
        const amount = (source === "cash" ? dCash : dTel) - dExp;
        return { date, amount, source, approved: Boolean(record?.approved), versaimentDate: record?.versaimentDate, madeBy: record?.madeBy };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  };

  const buildAgentPaymentsExport = (agentId: string) => {
    const payInRange = paymentsInRange(agentId);
    const expInRange = expensesInRange(agentId);
    const dayKeys = Array.from(new Set([...payInRange.map((p: any) => p.date), ...expInRange.map((e: any) => e.date)])).sort((a, b) => a.localeCompare(b));
    const getReportDateFor = (reportId?: string) =>
      reportId ? activeReports.find((r: any) => r.id === reportId && r.agentId === agentId)?.date : undefined;

    const exportRows: (string | number)[][] = [];
    dayKeys.forEach((date) => {
      const dayPayments = payInRange.filter((p: any) => p.date === date);
      const dayExpenses = expInRange.filter((e: any) => e.date === date);
      const cash = dayPayments.filter((p: any) => p.mode === "cash");
      const bank = dayPayments.filter((p: any) => p.mode === "bank");
      const tel = dayPayments.filter((p: any) => p.mode === "telephone");

      exportRows.push([`— ${fmtDate(date)} —`, "", "", "", "", "", "", "", "", ""]);

      cash.forEach((p: any) => {
        const client = clients.find((c: any) => c.id === p.clientId);
        const loanDate = getReportDateFor(p.reportId);
        exportRows.push([loanDate ? fmtDate(loanDate) : "—", getPaymentPartyName(p), fmt(p.amount), fmtDate(p.date), "", "", "", "", "", ""]);
      });
      bank.forEach((p: any) => {
        const client = clients.find((c: any) => c.id === p.clientId);
        const loanDate = getReportDateFor(p.reportId);
        const bankLabel = getBankName(p.bankId) + (p.receiverName ? ` — ${p.receiverName}` : "");
        exportRows.push([loanDate ? fmtDate(loanDate) : "—", getPaymentPartyName(p), "", "", fmt(p.amount), fmtDate(p.date), bankLabel, "", "", ""]);
      });
      tel.forEach((p: any) => {
        const client = clients.find((c: any) => c.id === p.clientId);
        const loanDate = getReportDateFor(p.reportId);
        exportRows.push([loanDate ? fmtDate(loanDate) : "—", getPaymentPartyName(p), "", "", "", "", "", fmt(p.amount), p.receiverName || "—", ""]);
      });
      dayExpenses.forEach((e: any) => {
        exportRows.push(["—", e.name, "", "", "", "", "", "", "", fmt(e.amount)]);
      });

      const dCash = cash.reduce((s: number, p: any) => s + p.amount, 0);
      const dBank = bank.reduce((s: number, p: any) => s + p.amount, 0);
      const dTel = tel.reduce((s: number, p: any) => s + p.amount, 0);
      const dExp = dayExpenses.reduce((s: number, e: any) => s + e.amount, 0);
      exportRows.push([`Subtotal — ${fmtDate(date)}`, "", fmt(dCash), "", fmt(dBank), "", "", fmt(dTel), "", fmt(dExp)]);

      const versaimentRecord = versaimentMap[keyFor(agentId, date)];
      const versaimentSource = versaimentRecord?.source ?? (dCash > 0 ? "cash" : "telephone");
      const dVersaiment = (versaimentSource === "cash" ? dCash : dTel) - dExp;
      exportRows.push([`Versaiment — ${fmtDate(date)}: ${fmt(dVersaiment)}${versaimentRecord?.madeBy ? ` — by ${versaimentRecord.madeBy}` : ""}`, "", "", "", "", "", "", "", "", ""]);
    });

    const t = paymentTotals(agentId);
    const versaimentTotal = versaimentRowsRaw(agentId).reduce((s, r) => s + r.amount, 0);
    exportRows.push([`Total Cash — ${dateLabel[dateFilter]}`, "", fmt(t.cash), "", fmt(t.bank), "", "", fmt(t.telephone), "", fmt(t.expense)]);
    exportRows.push([`Total Versaiment: ${fmt(versaimentTotal)}`, "", "", "", "", "", "", "", "", ""]);

    // Pull in the real saved reconciliation expenses for this agent so the
    // exported report matches what's shown on screen (Total Amount(MOMO) card).
    const reconciliationExpensesTotal = managerReconciliationExpenses.reduce(
      (s, e) => s + (e.amount || 0),
      0,
    );
    const reconciliationRemaining = t.telephone - reconciliationExpensesTotal;
    const reconciliationRows: (string | number)[][] = [
      ["Total", fmt(t.telephone)],
      ...managerReconciliationExpenses.map((e) => [e.name || "Expense", fmt(e.amount)]),
      ["Remaining", fmt(reconciliationRemaining)],
    ];

    return {
      summary: [
        `Cash: ${fmt(t.cash)}`, `Bank: ${fmt(t.bank)}`, `Mobile Money: ${fmt(t.telephone)}`,
        `Depense: ${fmt(t.expense)}`, `Versaiment: ${fmt(versaimentTotal)}`,
        `Reconciliation Remaining: ${fmt(reconciliationRemaining)}`,
      ],
      sections: [
        {
          heading: "Payments & Expenses",
          groupHeaders: [
            { label: "Date", span: 1 }, { label: "Client / Category", span: 1 },
            { label: "CASH", span: 2 }, { label: "BANK", span: 3 },
            { label: "TELEPHONE", span: 2 }, { label: "Depenses", span: 1 },
          ],
          headers: ["Date", "Client / Category", "Amount", "Payment Date", "Amount", "Payment Date", "Bank", "Amount", "Receiver", "Amount"],
          rows: exportRows,
          numericColumns: [2, 4, 7, 9],
        },
        {
          heading: "Total Amount(MOMO)",
          headers: ["Item", "Amount"],
          rows: reconciliationRows,
          numericColumns: [1],
        },
      ],
    };
  };

  const buildExportData = (): { meta: ReportMeta; summary: string[]; sections: ReportSection[] } => {
    const scope = isMerging ? `${mergeAgentIds.length} Agents (Merged)` : singleAgentId ? getName(singleAgentId, agents) : "All Agents";
    const meta: ReportMeta = {
      title:
        activeSection === "clients" ? (isMerging ? "Marketing Agents — Clients Report" : "My Clients Report")
        : activeSection === "loanOnly" ? "Loan Report"
        : activeSection === "salesOnly" ? "Sales Report"
        : activeSection === "sales" ? "Sales & Loan Report"
        : activeSection === "payments" ? "Agent Payments Report"
        : "Versaiment Report",
      period: dateLabel[dateFilter],
      scope,
      generatedBy: "Manager",
    };

    if (isMerging && activeSection === "clients") {
      const rows: (string | number)[][] = [];
      mergedClientGroups.forEach((g) => {
        rows.push([`— ${g.agentName} —`, "", "", "", "", ""]);
        g.rows.forEach(({ client, outstanding }) =>
          rows.push([client.name ?? "—", client.phone ?? "—", client.district ?? "—", client.sector ?? "—", client.center ?? "—", outstanding > 0 ? fmt(outstanding) : "Settled"]),
        );
        rows.push([`Subtotal — ${g.agentName}`, "", "", "", "", fmt(g.subtotal)]);
      });
      rows.push([`Subtotal — All Agents`, "", "", "", "", fmt(mergedClientsGrandTotal)]);
      return {
        meta,
        summary: [`Agents: ${mergeAgentIds.length}`, `Total Outstanding: ${fmt(mergedClientsGrandTotal)}`],
        sections: [{ heading: "Clients by Agent", headers: ["Client", "Telephone", "District", "Sector", "Center", "Outstanding"], rows, numericColumns: [5] }],
      };
    }

    if (isMerging && activeSection === "loanOnly") {
      const rows: (string | number)[][] = [];
      mergedLoanGroups.forEach((g) => {
        rows.push([`— ${g.agentName} —`, "", "", "", "", "", "", "", "", ""]);
        const sortedRows = [...g.rows].sort((a, b) => a.clientName.localeCompare(b.clientName) || a.date.localeCompare(b.date));
        const spans = computeRowSpans(sortedRows, (r) => r.clientName);
        sortedRows.forEach((r, i) => {
          const first = spans[i] > 0;
          rows.push([
            first ? r.clientName : "", first ? r.phone : "", first ? r.district : "", first ? r.center : "",
            fmtDate(r.date), r.product, r.qty, fmt(r.totalPrice), fmt(r.paid),
            r.remaining > 0 ? fmt(r.remaining) : "Settled",
          ]);
        });
        rows.push([`Subtotal — ${g.agentName}`, "", "", "", "", "", "", fmt(g.issued), fmt(g.paid), fmt(g.outstanding)]);
      });
      rows.push([`Subtotal — All Agents`, "", "", "", "", "", "", fmt(mergedLoanGrand.issued), fmt(mergedLoanGrand.paid), fmt(mergedLoanGrand.outstanding)]);
      return {
        meta,
        summary: [`Agents: ${mergeAgentIds.length}`, `Issued: ${fmt(mergedLoanGrand.issued)}`, `Paid: ${fmt(mergedLoanGrand.paid)}`, `Outstanding: ${fmt(mergedLoanGrand.outstanding)}`],
        sections: [{ heading: "Loans by Agent", headers: ["Client", "Telephone", "District", "Center", "Date", "Product", "Qty", "Total", "Paid", "Remaining"], rows, numericColumns: [6, 7, 8, 9] }],
      };
    }

    const id = singleAgentId ?? mergeAgentIds[0];
    if (!id) return { meta, summary: [], sections: [] };

    if (activeSection === "clients") {
      const rows = clientRowsRaw(id);
      return {
        meta,
        summary: [`Clients Handled: ${rows.length}`, `Total Outstanding: ${fmt(rows.reduce((s, r) => s + r.outstanding, 0))}`],
        sections: [{
          heading: "My Clients",
          headers: ["Client", "Telephone", "District", "Sector", "Center", "Outstanding"],
          rows: rows.map(({ client, outstanding }) => [client.name ?? "—", client.phone ?? "—", client.district ?? "—", client.sector ?? "—", client.center ?? "—", outstanding > 0 ? fmt(outstanding) : "Settled"]),
          numericColumns: [5],
        }],
      };
    }

    if (activeSection === "loanOnly") {
      const raw = loanRowsRaw(id).sort((a, b) => a.clientName.localeCompare(b.clientName) || a.date.localeCompare(b.date));
      const spans = computeRowSpans(raw, (r) => r.clientName);
      return {
        meta,
        summary: [
          `Loans Issued: ${fmt(raw.reduce((s, r) => s + r.totalPrice, 0))}`,
          `Paid So Far: ${fmt(raw.reduce((s, r) => s + r.paid, 0))}`,
          `Outstanding: ${fmt(raw.reduce((s, r) => s + r.remaining, 0))}`,
          `Loan Entries: ${raw.length}`,
        ],
        sections: [{
          heading: "Loan Detail",
          headers: ["Client", "Telephone", "District", "Center", "Date", "Product", "Qty", "Total Price", "Paid So Far", "Remaining"],
          rows: raw.map((r, i) => {
            const first = spans[i] > 0;
            return [
              first ? r.clientName : "", first ? r.phone : "", first ? r.district : "", first ? r.center : "",
              fmtDate(r.date), r.product, r.qty, fmt(r.totalPrice), fmt(r.paid),
              r.remaining > 0 ? fmt(r.remaining) : "Settled",
            ];
          }),
          numericColumns: [6, 7, 8, 9],
        }],
      };
    }

    if (activeSection === "salesOnly") {
      const rowsRaw = agentReportsInRange(id).map((r: any) => {
        const client = clients.find((c: any) => c.id === r.clientId);
        return {
          date: r.date, clientName: client?.name ?? r.customerName ?? "Walk-in customer",
          phone: client?.phone ?? "—", district: client?.district ?? "—", center: client?.center ?? "—",
          product: getProductName(r.productId), qty: r.qty, unitPrice: r.unitPrice, totalPrice: r.totalPrice, status: r.paymentStatus,
        };
      });
      const spans = computeRowSpans(rowsRaw, (r) => r.date);
      return {
        meta,
        summary: [
          `Total Sales: ${fmt(rowsRaw.reduce((s, r) => s + r.totalPrice, 0))}`,
          `Boxes Sold: ${rowsRaw.reduce((s, r) => s + r.qty, 0).toLocaleString()}`,
          `Total Transactions: ${rowsRaw.length}`,
        ],
        sections: [{
          heading: "Sales Detail",
          headers: ["Date", "Client", "Telephone", "District", "Center", "Product", "Qty", "Unit Price", "Total Price", "Status"],
          rows: rowsRaw.map((r, i) => [
            spans[i] > 0 ? fmtDate(r.date) : "", r.clientName, r.phone, r.district, r.center, r.product,
            r.qty, fmt(r.unitPrice), fmt(r.totalPrice), r.status === "paid" ? "Paid" : "Loan",
          ]),
          numericColumns: [6, 7, 8],
        }],
      };
    }

    if (activeSection === "sales") {
      const rows = buildAgentSalesLoanExportRows(id);
      const spans = computeRowSpans(rows, (r) => r.reportId);
      return {
        meta,
        summary: [`Transactions: ${agentReportsInRange(id).length}`],
        sections: [{
          heading: "Sales & Loan Detail",
          headers: ["Date", "Client", "Telephone", "District", "Center", "Product", "Qty", "Unit Price", "Total Price", "Payment Date", "Amount Paid", "Method", "Remaining"],
          rows: rows.map((row, i) => {
            const first = spans[i] > 0;
            return [
              first ? fmtDate(row.date) : "", first ? row.clientName : "", first ? row.phone : "", first ? row.district : "",
              first ? row.center : "", first ? row.product : "", first ? row.qty : "", first ? fmt(row.unitPrice) : "", first ? fmt(row.totalPrice) : "",
              row.paymentDate ? fmtDate(row.paymentDate) : "—", row.amountPaid != null ? fmt(row.amountPaid) : "—", row.method ?? "—",
              row.remaining > 0 ? fmt(row.remaining) : "Settled",
            ];
          }),
          numericColumns: [6, 7, 8, 10, 12],
        }],
      };
    }

    if (activeSection === "payments") {
      const { summary, sections } = buildAgentPaymentsExport(id);
      return { meta, summary, sections };
    }

    // versaiment
    const rows = versaimentRowsRaw(id);
    return {
      meta,
      summary: [
        `Total Versaiment: ${fmt(rows.reduce((s, r) => s + r.amount, 0))}`,
        `Pending: ${fmt(rows.filter((r) => !r.approved).reduce((s, r) => s + r.amount, 0))}`,
        `Approved: ${fmt(rows.filter((r) => r.approved).reduce((s, r) => s + r.amount, 0))}`,
        `Days Recorded: ${rows.length}`,
      ],
      sections: [{
        heading: "Versaiment Detail",
        headers: ["Date", "Source", "Amount", "Status", "Versaiment Date", "Made By"],
        rows: rows.map((r) => [
          fmtDate(r.date), r.source === "cash" ? "Cash" : "Mobile Money", fmt(r.amount),
          r.approved ? "Approved" : "Pending", r.versaimentDate ? fmtDate(r.versaimentDate) : "—", r.madeBy ?? "—",
        ]),
        numericColumns: [2],
      }],
    };
  };

  const filenameBase = () => `kangaroo-manager-marketing-${activeSection}-${today()}`;
  const handleExportPdf = () => {
    const { meta, summary, sections } = buildExportData();
    buildPdfReport(meta, summary, sections, `${filenameBase()}.pdf`, "landscape");
  };
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const { meta, summary, sections } = buildExportData();
      await buildExcelReport(meta, summary, sections, `${filenameBase()}.xlsx`);
    } finally {
      setIsExportingExcel(false);
    }
  };
  const handleExportCsv = () => {
    const { meta, summary, sections } = buildExportData();
    buildCsvReport(meta, summary, sections, `${filenameBase()}.csv`);
  };

  return (
    <>
      <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 mb-6 shadow-sm">
        <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1.5">Period</label>
        <div className="flex flex-wrap gap-2">
          {(["daily", "weekly", "monthly", "annual", "custom"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius)] transition-colors whitespace-nowrap ${
                dateFilter === f
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-card border border-border text-muted hover:text-foreground"
              }`}
            >
              {dateLabel[f]}
            </button>
          ))}
        </div>
        {dateFilter === "custom" && (
          <div className="flex flex-wrap gap-2 items-center mt-3">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1.5">Quick pick</label>
            <select
              value={singleAgentId ?? "all"}
              onChange={(e) => setMergeAgentIds(e.target.value === "all" ? [] : [e.target.value])}
              className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-[180px]"
            >
              <option value="all">Select an agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {mergeAgentIds.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button onClick={handleExportCsv} className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors">
                <Download size={14} /> CSV
              </button>
              <button onClick={handleExportExcel} disabled={isExportingExcel} className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors disabled:opacity-60">
                <FileSpreadsheet size={14} /> {isExportingExcel ? "Preparing..." : "Excel"}
              </button>
              <button onClick={handleExportPdf} className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors">
                <Printer size={14} /> PDF
              </button>
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1.5">
            Merge agents (Clients & Loan Report only)
          </label>
          <div className="flex flex-wrap gap-2">
            {agents.map((a) => (
              <label
                key={a.id}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius)] border cursor-pointer transition-colors ${
                  mergeAgentIds.includes(a.id) ? "bg-primary/10 border-primary/40 text-primary" : "bg-background border-border text-muted hover:text-foreground"
                }`}
              >
                <input type="checkbox" checked={mergeAgentIds.includes(a.id)} onChange={() => toggleAgent(a.id)} className="accent-primary" />
                {a.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      {mergeAgentIds.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16">
          <Users size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">Pick or check agents above to view their report</p>
        </div>
      ) : (
        <>
          {isMerging && (
            <div className="flex items-center gap-2 bg-primary/[0.06] border border-primary/20 px-4 py-2.5 rounded-[var(--radius)] mb-4">
              <Users size={14} className="text-primary" />
              <span className="text-xs font-semibold text-primary">
                Merged view — {mergeAgentIds.length} agents · only Clients & Loan Report can be merged
              </span>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
            {SECTIONS.map((s) => {
              const disabled = isMerging && !mergeableIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  disabled={disabled}
                  onClick={() => setSection(s.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
                    disabled
                      ? "bg-background border border-border text-muted/40 cursor-not-allowed"
                      : activeSection === s.id
                        ? "bg-primary text-white"
                        : "bg-card border border-border text-muted hover:text-foreground"
                  }`}
                >
                  <s.icon size={15} />
                  {s.label}
                </button>
              );
            })}
          </div>

          {isMerging && activeSection === "clients" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Clients by Agent</h3>
                <p className="text-xs text-muted mt-0.5">{mergeAgentIds.length} agents · {fmt(mergedClientsGrandTotal)} total outstanding</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                      {["Client", "Telephone", "District", "Outstanding"].map((h) => (
                        <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-4 py-3 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mergedClientGroups.map((g) => (
                      <FragmentDay key={g.agentId}>
                        <tr>
                          <td colSpan={4} className="bg-primary text-white px-4 py-2 text-xs font-semibold">{g.agentName}</td>
                        </tr>
                        {g.rows.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-3 text-xs text-muted">No clients</td></tr>
                        ) : (
                          g.rows.map(({ client, outstanding }, i) => (
                            <tr key={client.id} className={i % 2 === 1 ? "bg-background/50" : ""}>
                              <td className="px-4 py-2.5 text-xs font-medium text-foreground whitespace-nowrap">{client.name}</td>
                              <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">{client.phone}</td>
                              <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">{client.district}</td>
                              <td className="px-4 py-2.5 text-xs  text-secondary">{outstanding > 0 ? fmt(outstanding) : <span className="text-success">Settled</span>}</td>
                            </tr>
                          ))
                        )}
                        <tr className="bg-accent/40">
                          <td colSpan={3} className="px-4 py-2.5 text-xs font-bold text-foreground">Subtotal — {g.agentName}</td>
                          <td className="px-4 py-2.5 text-xs  font-bold text-secondary">{fmt(g.subtotal)}</td>
                        </tr>
                      </FragmentDay>
                    ))}
                    <tr className="bg-primary text-white">
                      <td colSpan={3} className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Grand Total — All Agents</td>
                      <td className="px-4 py-3 text-xs  font-bold">{fmt(mergedClientsGrandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {isMerging && activeSection === "loanOnly" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Loan Report by Agent</h3>
                <p className="text-xs text-muted mt-0.5">
                  Issued {fmt(mergedLoanGrand.issued)} · Paid {fmt(mergedLoanGrand.paid)} · Outstanding {fmt(mergedLoanGrand.outstanding)}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                      {["Date", "Client", "Product", "Qty", "Total", "Paid", "Remaining"].map((h) => (
                        <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-3 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mergedLoanGroups.map((g) => (
                      <FragmentDay key={g.agentId}>
                        <tr>
                          <td colSpan={7} className="bg-primary text-white px-3 py-2 text-xs font-semibold">{g.agentName}</td>
                        </tr>
                        {g.rows.length === 0 ? (
                          <tr><td colSpan={7} className="px-3 py-3 text-xs text-muted">No outstanding loans</td></tr>
                        ) : (
                          g.rows.map((r, i) => (
                            <tr key={r.key} className={i % 2 === 1 ? "bg-background/50" : ""}>
                              <td className="px-3 py-2.5 text-xs  text-muted whitespace-nowrap">{fmtDate(r.date)}</td>
                              <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">{r.clientName}</td>
                              <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">{r.product}</td>
                              <td className="px-3 py-2.5 text-xs  text-muted">{r.qty}</td>
                              <td className="px-3 py-2.5 text-xs font-semibold text-foreground">{fmt(r.totalPrice)}</td>
                              <td className="px-3 py-2.5 text-xs  text-success">{fmt(r.paid)}</td>
                              <td className="px-3 py-2.5 text-xs  text-secondary">{r.remaining > 0 ? fmt(r.remaining) : <span className="text-success">Settled</span>}</td>
                            </tr>
                          ))
                        )}
                        <tr className="bg-accent/40">
                          <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-foreground">Subtotal — {g.agentName}</td>
                          <td className="px-3 py-2.5 text-xs  font-bold">{fmt(g.issued)}</td>
                          <td className="px-3 py-2.5 text-xs  font-bold text-success">{fmt(g.paid)}</td>
                          <td className="px-3 py-2.5 text-xs  font-bold text-secondary">{fmt(g.outstanding)}</td>
                        </tr>
                      </FragmentDay>
                    ))}
                    <tr className="bg-primary text-white">
                      <td colSpan={4} className="px-3 py-3 text-xs font-bold uppercase tracking-wide">Grand Total — All Agents</td>
                      <td className="px-3 py-3 text-xs  font-bold">{fmt(mergedLoanGrand.issued)}</td>
                      <td className="px-3 py-3 text-xs  font-bold">{fmt(mergedLoanGrand.paid)}</td>
                      <td className="px-3 py-3 text-xs  font-bold">{fmt(mergedLoanGrand.outstanding)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!isMerging && singleAgentId && (
            <>
              {activeSection === "sales" && (
                <DetailTable icon={FileText} title="Sales & Loan Detail" count={salesLoanRows(singleAgentId).length}
                  headers={["Date", "Client", "Product", "Qty", "Total", "Paid", "Remaining"]} rows={salesLoanRows(singleAgentId)} />
              )}
              {activeSection === "salesOnly" && (
                <DetailTable icon={Package} title="Sales Report" count={salesOnlyRows(singleAgentId).length}
                  headers={["Date", "Client", "Product", "Qty", "Total", "Status"]} rows={salesOnlyRows(singleAgentId)} />
              )}
              {activeSection === "loanOnly" && (
                <DetailTable icon={CreditCard} title="Loan Report" count={loanOnlyRows(singleAgentId).length}
                  headers={["Date", "Client", "District", "Product", "Qty", "Total", "Paid", "Remaining"]} rows={loanOnlyRows(singleAgentId)} />
              )}
              {activeSection === "clients" && (
                <DetailTable icon={Users} title="My Clients" count={clientRows(singleAgentId).length}
                  headers={["Client", "Telephone", "District", "Outstanding"]} rows={clientRows(singleAgentId)} />
              )}
              {activeSection === "payments" && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    {(() => {
                      const t = paymentTotals(singleAgentId);
                      return [
                        { label: "Cash", value: t.cash, color: "#3FA66B" },
                        { label: "Bank", value: t.bank, color: "#2E9E8F" },
                        { label: "Mobile Money", value: t.telephone, color: "#D99A3D" },
                        { label: "Depense", value: t.expense, color: "#E05C5C" },
                      ].map((k) => (
                        <div key={k.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-4">
                          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{k.label}</div>
                          <div className="text-base font-semibold" style={{ color: k.color }}>{fmt(k.value)}</div>
                        </div>
                      ));
                    })()}
                  </div>

                  {(() => {
                    const agentId = singleAgentId;
                    const p = paymentsInRange(agentId);
                    const e = expensesInRange(agentId);
                    const dayKeys = Array.from(new Set([...p.map((x: any) => x.date), ...e.map((x: any) => x.date)])).sort();
                    const t = paymentTotals(agentId);
                    const grandCash = t.cash, grandBank = t.bank, grandTelephone = t.telephone, grandDepense = t.expense;
                    const getReportDateFor = (reportId?: string) =>
                      reportId ? activeReports.find((r: any) => r.id === reportId && r.agentId === agentId)?.date : undefined;

                    let versaimentTotal = 0;

                    const dayRows = dayKeys.map((date) => {
                      const dayPayments = p.filter((x: any) => x.date === date);
                      const dayExpenses = e.filter((x: any) => x.date === date);
                      const cash = dayPayments.filter((x: any) => x.mode === "cash");
                      const bank = dayPayments.filter((x: any) => x.mode === "bank");
                      const tel = dayPayments.filter((x: any) => x.mode === "telephone");
                      const dCash = cash.reduce((s: number, x: any) => s + x.amount, 0);
                      const dBank = bank.reduce((s: number, x: any) => s + x.amount, 0);
                      const dTel = tel.reduce((s: number, x: any) => s + x.amount, 0);
                      const dExp = dayExpenses.reduce((s: number, x: any) => s + x.amount, 0);
                      const versaimentRecord = versaimentMap[keyFor(agentId, date)];
                      const versaimentSource = versaimentRecord?.source ?? (dCash > 0 ? "cash" : "telephone");
                      const dVersaiment = (versaimentSource === "cash" ? dCash : dTel) - dExp;
                      versaimentTotal += dVersaiment;
                      return { date, cash, bank, tel, dayExpenses, dCash, dBank, dTel, dExp, dVersaiment, madeBy: versaimentRecord?.madeBy };
                    });

                    if (dayKeys.length === 0) {
                      return (
                        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16 mb-6">
                          <Banknote size={32} className="text-muted/40 mb-3" />
                          <p className="text-sm text-muted">No payments or expenses for this period</p>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-sm mb-10">
                          <div className="px-5 py-4 border-b border-border">
                            <h3 className="text-sm font-bold text-foreground">Payments & Expenses</h3>
                            <p className="text-xs text-muted mt-0.5">Grouped by day · Cash, Bank & Mobile Money side by side · best printed landscape</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse min-w-[1120px]">
                              <thead>
                                <tr className="bg-primary/[0.08]">
                                  <th rowSpan={2} className="border border-border/60 text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-2 text-left align-bottom">Loan Date</th>
                                  <th rowSpan={2} className="border border-border/60 text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-2 text-left align-bottom">Client / Category</th>
                                  <th colSpan={2} className="border border-border/60 text-[11px] font-bold text-white uppercase tracking-wider px-3 py-2 text-center" style={{ background: "#3FA66B" }}>Cash</th>
                                  <th colSpan={3} className="border border-border/60 text-[11px] font-bold text-white uppercase tracking-wider px-3 py-2 text-center" style={{ background: "#2E9E8F" }}>Bank</th>
                                  <th colSpan={2} className="border border-border/60 text-[11px] font-bold text-white uppercase tracking-wider px-3 py-2 text-center" style={{ background: "#D99A3D" }}>Telephone</th>
                                  <th rowSpan={2} className="border border-border/60 text-[11px] font-bold text-white uppercase tracking-wider px-3 py-2 text-center align-bottom" style={{ background: "#E05C5C" }}>Depenses</th>
                                </tr>
                                <tr className="bg-primary/[0.04]">
                                  <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Amount</th>
                                  <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Payment Date</th>
                                  <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Amount</th>
                                  <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Payment Date</th>
                                  <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Bank</th>
                                  <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Amount</th>
                                  <th className="border border-border/60 text-[10px] font-semibold text-muted uppercase px-3 py-1.5 text-left">Receiver</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dayRows.map(({ date, cash, bank, tel, dayExpenses, dCash, dBank, dTel, dExp, dVersaiment, madeBy }) => (
                                  <FragmentDay key={date}>
                                    <tr>
                                      <td colSpan={10} className="border border-border/60 bg-primary text-white px-3 py-2 text-xs font-semibold">
                                        {fmtDate(date)}
                                      </td>
                                    </tr>

                                    {cash.map((pay: any) => {
                                      const client = clients.find((c: any) => c.id === pay.clientId);
                                      const loanDate = getReportDateFor(pay.reportId);
                                      return (
                                        <tr key={pay.id} className="border-b border-border/40 hover:bg-accent/20">
                                          <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{loanDate ? fmtDate(loanDate) : "—"}</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs text-foreground whitespace-nowrap">{getPaymentPartyName(pay)}</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs  text-success">{fmt(pay.amount)}</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{fmtDate(pay.date)}</td>
                                          <td colSpan={3} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                          <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                        </tr>
                                      );
                                    })}

                                    {bank.map((pay: any) => {
                                      const client = clients.find((c: any) => c.id === pay.clientId);
                                      const loanDate = getReportDateFor(pay.reportId);
                                      return (
                                        <tr key={pay.id} className="border-b border-border/40 hover:bg-accent/20">
                                          <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{loanDate ? fmtDate(loanDate) : "—"}</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs text-foreground whitespace-nowrap">{getPaymentPartyName(pay)}</td>
                                          <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs  text-primary">{fmt(pay.amount)}</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{fmtDate(pay.date)}</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs text-muted whitespace-nowrap">{getBankName(pay.bankId)}{pay.receiverName ? ` — ${pay.receiverName}` : ""}</td>
                                          <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                        </tr>
                                      );
                                    })}

                                    {tel.map((pay: any) => {
                                      const client = clients.find((c: any) => c.id === pay.clientId);
                                      const loanDate = getReportDateFor(pay.reportId);
                                      return (
                                        <tr key={pay.id} className="border-b border-border/40 hover:bg-accent/20">
                                          <td className="border border-border/40 px-3 py-2 text-xs  text-muted whitespace-nowrap">{loanDate ? fmtDate(loanDate) : "—"}</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs text-foreground whitespace-nowrap">{getPaymentPartyName(pay)}</td>
                                          <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                          <td colSpan={3} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs  text-secondary">{fmt(pay.amount)}</td>
                                          <td className="border border-border/40 px-3 py-2 text-xs text-muted whitespace-nowrap">{pay.receiverName || "—"}</td>
                                        </tr>
                                      );
                                    })}

                                    {dayExpenses.map((exp: any) => (
                                      <tr key={exp.id} className="border-b border-border/40 hover:bg-accent/20">
                                        <td className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                        <td className="border border-border/40 px-3 py-2 text-xs text-foreground whitespace-nowrap">{exp.name}</td>
                                        <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                        <td colSpan={3} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                        <td colSpan={2} className="border border-border/40 px-3 py-2 text-xs text-muted/50">—</td>
                                        <td className="border border-border/40 px-3 py-2 text-xs  text-danger">{fmt(exp.amount)}</td>
                                      </tr>
                                    ))}

                                    <tr className="bg-accent/40">
                                      <td colSpan={2} className="border border-border/60 px-3 py-2 text-xs font-semibold text-foreground">
                                        Subtotal — {fmtDate(date)}
                                      </td>
                                      <td colSpan={2} className="border border-border/60 px-3 py-2 text-xs  text-success">{fmt(dCash)}</td>
                                      <td colSpan={3} className="border border-border/60 px-3 py-2 text-xs  text-primary">{fmt(dBank)}</td>
                                      <td colSpan={2} className="border border-border/60 px-3 py-2 text-xs  text-secondary">{fmt(dTel)}</td>
                                      <td className="border border-border/60 px-3 py-2 text-xs  text-danger">{fmt(dExp)}</td>
                                    </tr>
                                    <tr className="bg-primary/10">
                                      <td colSpan={10} className="border border-border/60 px-3 py-2">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
                                          Versaiment — {fmtDate(date)}: {fmt(dVersaiment)}
                                          {madeBy && ` — by ${madeBy}`}
                                        </span>
                                      </td>
                                    </tr>
                                  </FragmentDay>
                                ))}
                                <tr className="bg-primary text-white">
                                  <td colSpan={2} className="border border-border/60 px-3 py-2.5 text-xs font-bold uppercase tracking-wide">
                                    Total Cash — {dateLabel[dateFilter]}
                                  </td>
                                  <td colSpan={2} className="border border-border/60 px-3 py-2.5 text-xs  font-bold">{fmt(grandCash)}</td>
                                  <td colSpan={3} className="border border-border/60 px-3 py-2.5 text-xs  font-bold">{fmt(grandBank)}</td>
                                  <td colSpan={2} className="border border-border/60 px-3 py-2.5 text-xs  font-bold">{fmt(grandTelephone)}</td>
                                  <td className="border border-border/60 px-3 py-2.5 text-xs  font-bold">{fmt(grandDepense)}</td>
                                </tr>
                                <tr className="bg-indigo-600 text-white">
                                  <td colSpan={10} className="border border-border/60 px-3 py-2.5 text-xs font-bold uppercase tracking-wide">
                                    Total Versaiment — {fmt(versaimentTotal)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {(() => {
                          const expensesTotal = managerReconciliationExpenses.reduce((s, e) => s + e.amount, 0);
                          const remaining = grandTelephone - expensesTotal;
                          return (
                            <div className="bg-gradient-to-br from-primary/[0.04] to-transparent border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-sm">
                              <div className="px-5 py-4 border-b border-border bg-primary/[0.06]">
                                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                  <Wallet size={15} className="text-primary" />
                                  Total Amount(MOMO)
                                </h3>
                                <p className="text-xs text-muted mt-0.5">{dateLabel[dateFilter]} · quick summary before versaiment</p>
                              </div>
                              <div className="divide-y divide-border/60">
                                <div className="flex items-center justify-between px-5 py-3 bg-primary/[0.06]">
                                  <span className="text-xs font-bold text-primary uppercase tracking-wide">Total</span>
                                  <span className="text-sm  text-primary">{fmt(grandTelephone)}</span>
                                </div>

                                {managerReconciliationExpenses.map((exp) =>
                                  editingExpenseId === exp.id ? (
                                    <div key={exp.id} className="flex items-center gap-2 px-5 py-2.5">
                                      <input
                                        type="text"
                                        value={editExpenseName}
                                        onChange={(e) => setEditExpenseName(e.target.value)}
                                        className="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                      />
                                      <input
                                        type="number"
                                        value={editExpenseAmount}
                                        onChange={(e) => setEditExpenseAmount(e.target.value)}
                                        className="w-28 text-xs px-2.5 py-1.5 border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-right"
                                      />
                                      <button
                                        onClick={async () => {
                                          await updateManagerReconciliationExpense(exp.id, {
                                            name: editExpenseName.trim(),
                                            amount: Number(editExpenseAmount) || 0,
                                          });
                                          setEditingExpenseId(null);
                                        }}
                                        className="text-xs font-semibold text-primary hover:underline flex-shrink-0"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingExpenseId(null)}
                                        className="text-xs text-muted hover:underline flex-shrink-0"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div key={exp.id} className="flex items-center gap-2 px-5 py-2.5">
                                      <span className="flex-1 min-w-0 text-xs text-foreground truncate">{exp.name || "Expense"}</span>
                                      <span className="w-28 text-xs text-muted text-right">{fmt(exp.amount)}</span>
                                      <button
                                        onClick={() => {
                                          setEditingExpenseId(exp.id);
                                          setEditExpenseName(exp.name);
                                          setEditExpenseAmount(String(exp.amount));
                                        }}
                                        title="Edit expense"
                                        className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded transition-colors flex-shrink-0"
                                      >
                                        <FileText size={13} />
                                      </button>
                                      <button
                                        onClick={() => deleteManagerReconciliationExpense(exp.id)}
                                        title="Remove expense"
                                        className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors flex-shrink-0"
                                      >
                                        <Minus size={13} />
                                      </button>
                                    </div>
                                  ),
                                )}

                                <div className="flex items-center gap-2 px-5 py-2.5">
                                  <input
                                    type="text"
                                    value={newExpenseName}
                                    onChange={(e) => setNewExpenseName(e.target.value)}
                                    placeholder="Expense name"
                                    className="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                  />
                                  <input
                                    type="number"
                                    value={newExpenseAmount}
                                    onChange={(e) => setNewExpenseAmount(e.target.value)}
                                    placeholder="0"
                                    className="w-28 text-xs px-2.5 py-1.5 border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-right"
                                  />
                                  <button
                                    onClick={handleAddManagerExpense}
                                    disabled={isSavingExpense}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-[var(--radius)] bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60 flex-shrink-0"
                                  >
                                    {isSavingExpense ? "Saving..." : "Add"}
                                  </button>
                                </div>

                                {managerReconciliationError && (
                                  <div className="px-5 py-2 text-xs text-danger">{managerReconciliationError}</div>
                                )}

                                <div className="flex items-center justify-between px-5 py-4 bg-primary text-white">
                                  <span className="text-xs font-bold uppercase tracking-wide">Remaining</span>
                                  <span className="text-base font-bold">{fmt(remaining)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </>
              )}
              {activeSection === "versaiment" && (
                <DetailTable icon={Wallet} title="Versaiment" count={versaimentRows(singleAgentId).length}
                  headers={["Date", "Source", "Made By", "Amount", "Status"]} rows={versaimentRows(singleAgentId)} />
              )}
            </>
          )}
        </>
      )}
    </>
  );
}