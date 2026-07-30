import { useState, useMemo } from "react";
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

// ============================================================================
// 🏢 COMPANY NAME — Edit the text below to change the company name on PDF & Excel reports
// Just replace "SOAPFLOW" with your company name and it will appear on all printed reports
// ============================================================================
const COMPANY_NAME = "SOAPFLOW";

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

function addPdfFootersAndPageNumbers(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.5);
    doc.line(40, pageHeight - 42, pageWidth - 40, pageHeight - 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(`${COMPANY_NAME} — Confidential Business Report`, 40, pageHeight - 28);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 40, pageHeight - 28, {
      align: "right",
    });
  }
}

function buildPdfReport(
  meta: ReportMeta,
  summary: string[],
  sections: ReportSection[],
  filename: string,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" }) as JsPdfWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 46;

  // ---- Header: company name, report title, meta line ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...PDF_COLORS.text);
  doc.text(COMPANY_NAME, pageWidth / 2, y, { align: "center" });
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(meta.title.toUpperCase(), pageWidth / 2, y, { align: "center" });
  y += 14;

  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(1.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.muted);
  const metaLine = `Period: ${meta.period}    |    Scope: ${meta.scope || "All"}    |    Generated: ${new Date().toLocaleString()}    |    Generated by: ${meta.generatedBy}`;
  doc.text(metaLine, pageWidth / 2, y, { align: "center" });
  y += 22;

  // ---- Executive summary ----
  if (summary.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text("Executive Summary", margin, y);
    y += 6;
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 4, pageWidth - margin, y + 4);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.text);
    summary.forEach((line) => {
      doc.text(`•  ${line}`, margin, y);
      y += 14;
    });
    y += 10;
  }

  // ---- Tables ----
  sections.forEach((section) => {
    if (section.rows.length === 0) return;

    if (y > pageHeight - 140) {
      doc.addPage();
      y = 46;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(section.heading, margin, y);
    y += 8;

    doc.autoTable({
      startY: y,
      head: [section.headers],
      body: section.rows,
      margin: { left: margin, right: margin, bottom: 56 },
      theme: "grid",
      styles: {
        fontSize: 8.3,
        cellPadding: 5.5,
        textColor: PDF_COLORS.text,
        lineColor: PDF_COLORS.border,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: PDF_COLORS.primary,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "left",
      },
      alternateRowStyles: { fillColor: PDF_COLORS.altRow },
      columnStyles: pdfColumnStyles(section.headers, section.numericColumns),
      showHead: "everyPage",
    });

    y = doc.lastAutoTable.finalY + 26;
  });

  // ---- Signature section ----
  if (y > pageHeight - 120) {
    doc.addPage();
    y = 60;
  } else {
    y += 14;
  }

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.6);
  doc.line(margin, y, margin + 180, y);
  doc.line(pageWidth - margin - 180, y, pageWidth - margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("Prepared by", margin, y);
  doc.text("Approved by", pageWidth - margin - 180, y);

  addPdfFootersAndPageNumbers(doc);
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
    if (section.rows.length === 0) return;
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
    const headerRow = ws.addRow(section.headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIMARY_ARGB } };
      cell.alignment = { horizontal: "left", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: BORDER_ARGB } },
        left: { style: "thin", color: { argb: BORDER_ARGB } },
        bottom: { style: "thin", color: { argb: BORDER_ARGB } },
        right: { style: "thin", color: { argb: BORDER_ARGB } },
      };
    });

    section.rows.forEach((row, i) => {
      const r = ws.addRow(row);
      const isAlt = i % 2 === 1;
      r.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: BORDER_ARGB } },
          left: { style: "thin", color: { argb: BORDER_ARGB } },
          bottom: { style: "thin", color: { argb: BORDER_ARGB } },
          right: { style: "thin", color: { argb: BORDER_ARGB } },
        };
        if (isAlt) {
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

    ws.views = [{ state: "frozen", ySplit: 5 }];
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
  const str = String(value ?? "");
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
    lines.push(section.headers.map(csvEscape).join(","));
    section.rows.forEach((row) => {
      lines.push(row.map(csvEscape).join(","));
    });
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

const movementLabel = (type: string) =>
  type === "production"
    ? "Production Stock"
    : type === "marketing_agent"
      ? "Agent Dispatch"
      : type === "customer_sale"
        ? "Customer Direct Sale"
        : "Other Adjustment";

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
  const [modeFilter, setModeFilter] = useState<"all" | PaymentMode>("all");

  const [hiddenSections, setHiddenSections] = useState<Record<string, boolean>>({});
  const [maSection, setMaSection] = useState<"sales" | "clients" | "payments">("sales");
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const toggleSection = (key: string) => {
    setHiddenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const resetHiddenSections = () => setHiddenSections({});
  const isHidden = (key: string) => Boolean(hiddenSections[key]);
  const hiddenCount = Object.values(hiddenSections).filter(Boolean).length;

  const getName = (id: string, list: { id: string; name: string }[]) =>
    list.find((i) => i.id === id)?.name ?? "—";

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
        (agentFilter === "all" || m.agentId === agentFilter),
    );
  }, [
    state.stockMovements,
    dateFilter,
    customFrom,
    customTo,
    productFilter,
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
    if (p.mode === "bank" && p.bankId) return getName(p.bankId, state.banks);
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
            l.client.name,
            l.client.district,
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
          getName(p.clientId, clients),
          fmt(p.amount),
          p.mode === "telephone" ? "Mobile Money" : p.mode === "bank" ? "Bank" : "Cash",
          paymentReference(p),
        ]),
        numericColumns: [2],
      },
    ];
    return { meta, summary, sections };
  };

  const exportFilenameBase = () => `soapflow-${reportType}-report-${today()}`;

  const handleExportPdf = () => {
    const { meta, summary, sections } = getAdminReportData();
    buildPdfReport(meta, summary, sections, `${exportFilenameBase()}.pdf`);
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
        scope: agentFilter !== "all" ? getAgentName(agentFilter) : "All Agents",
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

    const saFilenameBase = () => `soapflow-stock-report-${today()}`;

    const handleSaExportPdf = () => {
      const { meta, summary, sections } = getStockAgentReportData();
      buildPdfReport(meta, summary, sections, `${saFilenameBase()}.pdf`);
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
          <div className="pointer-events-none absolute -right-10 -top-14 w-48 h-48 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -right-28 top-6 w-64 h-64 rounded-full bg-white/[0.06]" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2.5">
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
                  className="flex items-center gap-1 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/20 px-3 py-2 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
                >
                  <RotateCcw size={12} /> Show all ({hiddenCount})
                </button>
              )}
              <button
                onClick={handleSaExportCsv}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
              >
                <Download size={15} />
                <span>CSV</span>
              </button>
              <button
                onClick={handleSaExportExcel}
                disabled={isExportingExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm disabled:opacity-60"
              >
                <FileSpreadsheet size={15} />
                <span>{isExportingExcel ? "Preparing..." : "Excel"}</span>
              </button>
              <button
                onClick={handleSaExportPdf}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
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
              className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
              <option value="all">All Agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
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
                        <td className="px-4 py-3 text-xs font-mono text-muted whitespace-nowrap">{fmtDate(m.date)}</td>
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
                            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-success">
                              <ArrowDownCircle size={11} />+{m.stockIn}
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.stockOut > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-danger">
                              <ArrowUpCircle size={11} />-{m.stockOut}
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono font-bold text-right text-foreground whitespace-nowrap">{m.balance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary/20 bg-primary/[0.03] text-xs font-bold">
                      <td colSpan={5} className="px-4 py-3 text-foreground uppercase tracking-wide">Summary ({saTable.length} Records)</td>
                      <td className="px-4 py-3 text-center text-success font-mono">+{saIn.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-danger font-mono">-{saOut.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-foreground font-mono">
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
                      <span className="text-[10px] font-mono text-muted">{fmtDate(m.date)}</span>
                    </div>
                  </div>
                  <div className="text-xs font-medium text-foreground mb-1">{getProductName(m.productId)}</div>
                  {m.agentId && <div className="text-[11px] text-muted mb-1">{getAgentName(m.agentId)}{m.location ? " · " + m.location : ""}</div>}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-4">
                      {m.stockIn > 0 && <span className="text-xs font-mono text-success">+{m.stockIn}</span>}
                      {m.stockOut > 0 && <span className="text-xs font-mono text-danger">-{m.stockOut}</span>}
                    </div>
                    <span className="text-xs text-muted">Bal: <span className="font-mono text-foreground">{m.balance.toLocaleString()}</span></span>
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

    const salesInRange = myReports
      .filter((r) => inDateRange(r.date))
      .sort((a, b) => b.date.localeCompare(a.date));
    const salesTotal = salesInRange.reduce((s, r) => s + r.totalPrice, 0);
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

    const MA_SECTIONS: { id: typeof maSection; label: string; icon: React.ElementType }[] = [
      { id: "sales", label: "My Sales & Loans", icon: FileText },
      { id: "clients", label: "My Clients", icon: Users },
      { id: "payments", label: "My Payments", icon: Banknote },
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
          meta,
          summary: [
            `Total Sales: ${fmt(salesTotal)}`,
            `Boxes Sold: ${salesQtyTotal.toLocaleString()}`,
            `Outstanding: ${fmt(salesOutstandingTotal)}`,
            `Sales Count: ${salesInRange.length}`,
          ],
          sections: [
            {
              heading: "Sales Detail",
              headers: ["Date", "Client", "Telephone", "District", "Product", "Qty", "Total", "Status", "Remaining"],
              rows: salesInRange.map((r) => {
                const client = clients.find((c) => c.id === r.clientId);
                const remaining = r.paymentStatus === "loan" ? getReportRemaining(r) : 0;
                return [
                  fmtDate(r.date),
                  client?.name ?? "—",
                  client?.phone ?? "—",
                  client?.district ?? "—",
                  getProductName(r.productId),
                  r.qty,
                  fmt(r.totalPrice),
                  r.paymentStatus === "paid" ? "Paid" : "Loan",
                  remaining > 0 ? fmt(remaining) : "—",
                ];
              }),
              numericColumns: [5, 6, 8],
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

      // payments
      return {
        meta,
        summary: [
          `Cash: ${fmt(payTotals.cash)}`,
          `Bank: ${fmt(payTotals.bank)}`,
          `Mobile Money: ${fmt(payTotals.telephone)}`,
          `Depense: ${fmt(payTotals.expense)}`,
        ],
        sections: [
          {
            heading: "Payments & Expenses",
            headers: ["Date", "Client / Expense", "Cash", "Bank", "Bank Name", "Mobile", "Receiver", "Depense"],
            rows: payDayKeys.flatMap((date) => {
              const dayPayments = payInRange.filter((p) => p.date === date);
              const dayExpenses = expInRange.filter((e) => e.date === date);
              const paymentRows = dayPayments.map((p) => {
                const client = clients.find((c) => c.id === p.clientId);
                return [
                  fmtDate(date),
                  client?.name ?? "—",
                  p.mode === "cash" ? fmt(p.amount) : "—",
                  p.mode === "bank" ? fmt(p.amount) : "—",
                  p.mode === "bank" ? getBankName(p.bankId) : "—",
                  p.mode === "telephone" ? fmt(p.amount) : "—",
                  p.mode === "telephone" ? (p.receiverName || "—") : "—",
                  "—",
                ];
              });
              const expenseRows = dayExpenses.map((e) => [
                fmtDate(date),
                `(expense) ${e.name}`,
                "—",
                "—",
                "—",
                "—",
                "—",
                fmt(e.amount),
              ]);
              return [...paymentRows, ...expenseRows];
            }),
            numericColumns: [2, 3, 5, 7],
          },
        ],
      };
    };

    const maFilenameBase = () => `soapflow-agent-${maSection}-report-${today()}`;

    const handleMaExportPdf = () => {
      const { meta, summary, sections } = getMarketingAgentReportData();
      buildPdfReport(meta, summary, sections, `${maFilenameBase()}.pdf`);
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
          <div className="pointer-events-none absolute -right-10 -top-14 w-48 h-48 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -right-28 top-6 w-64 h-64 rounded-full bg-white/[0.06]" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2.5">
                <Users size={11} />
                Marketing Agent
              </div>
              <h1 className="text-xl sm:text-2xl font-bold">
                Hey {firstName}, here's your report 👋
              </h1>
              <p className="text-xs sm:text-sm text-white/80 mt-1">
                {dateLabel[dateFilter]} · export a clean copy for your own records
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleMaExportCsv}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
              >
                <Download size={15} />
                <span>CSV</span>
              </button>
              <button
                onClick={handleMaExportExcel}
                disabled={isExportingExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm disabled:opacity-60"
              >
                <FileSpreadsheet size={15} />
                <span>{isExportingExcel ? "Preparing..." : "Excel"}</span>
              </button>
              <button
                onClick={handleMaExportPdf}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-[var(--radius)] transition-colors backdrop-blur-sm"
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
            {(["daily", "weekly", "monthly", "annual"] as const).map((f) => (
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
        </div>

        {maSection === "sales" && (
          <>
            {/* 4 KPI cards in one row — muted professional colors */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Total Sales</div>
                <div className="text-lg font-mono font-bold text-foreground">{fmt(salesTotal)}</div>
              </div>
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Boxes Sold</div>
                <div className="text-lg font-mono font-bold text-foreground">{salesQtyTotal.toLocaleString()}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-secondary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-secondary uppercase tracking-wide mb-1">Outstanding</div>
                <div className="text-lg font-mono font-bold text-secondary">{fmt(salesOutstandingTotal)}</div>
              </div>
              <div className="bg-card border-l-[3px] border-l-primary/40 rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">Sales Count</div>
                <div className="text-lg font-mono font-bold text-primary">{salesInRange.length}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Sales Detail ({salesInRange.length} records)
                </h3>
              </div>
              {salesInRange.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No sales recorded for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                        {["Date", "Client", "Telephone", "District", "Product", "Qty", "Total", "Status", "Remaining"].map((h) => (
                          <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-3.5 whitespace-nowrap text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {salesInRange.map((r) => {
                        const client = clients.find((c) => c.id === r.clientId);
                        const remaining = r.paymentStatus === "loan" ? getReportRemaining(r) : 0;
                        return (
                          <tr key={r.id} className={`border-b border-border/40 ${r.id === salesInRange[salesInRange.length - 1].id ? "border-b-0" : ""}`}>
                            <td className="px-3 py-3 text-xs font-mono text-muted whitespace-nowrap">{fmtDate(r.date)}</td>
                            <td className="px-3 py-3 text-xs font-semibold text-foreground whitespace-nowrap">{client?.name ?? "—"}</td>
                            <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{client?.phone ?? "—"}</td>
                            <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{client?.district ?? "—"}</td>
                            <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">{getProductName(r.productId)}</td>
                            <td className="px-3 py-3 text-xs font-mono text-muted">{r.qty}</td>
                            <td className="px-3 py-3 text-xs font-mono font-semibold text-foreground">{fmt(r.totalPrice)}</td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded ${
                                r.paymentStatus === "paid" ? "bg-success/10 text-success" : "bg-secondary/10 text-secondary"
                              }`}>
                                {r.paymentStatus === "paid" ? "Paid" : "Loan"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-xs font-mono text-secondary">{remaining > 0 ? fmt(remaining) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {maSection === "clients" && (
          <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {myClientsList.length} client{myClientsList.length !== 1 ? "s" : ""} handled
              </h3>
              <span className="text-sm font-mono text-secondary">{fmt(myClientsOutstandingTotal)} total outstanding</span>
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
                          <td className="px-3 py-3 text-xs font-mono text-secondary">
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

        {maSection === "payments" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {[
                { label: "Cash", value: payTotals.cash },
                { label: "Bank", value: payTotals.bank },
                { label: "Mobile Money", value: payTotals.telephone },
                { label: "Depense", value: payTotals.expense },
              ].map((t) => (
                <div key={t.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-4">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{t.label}</div>
                  <div className="text-base font-mono font-bold text-foreground">{fmt(t.value)}</div>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              {payDayKeys.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No payments or expenses for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[780px]">
                    <thead>
                      <tr className="bg-primary/[0.07] border-b-2 border-primary/20">
                        {["Client / Expense", "Cash", "Bank", "Bank Name", "Mobile", "Receiver", "Depense", "Amount"].map((h) => (
                          <th key={h} className="text-[11px] font-bold text-primary uppercase tracking-wider px-3 py-3.5 whitespace-nowrap text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payDayKeys.map((date) => {
                        const dayPayments = payInRange.filter((p) => p.date === date);
                        const dayExpenses = expInRange.filter((e) => e.date === date);
                        const dayCash = dayPayments.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0);
                        const dayBank = dayPayments.filter((p) => p.mode === "bank").reduce((s, p) => s + p.amount, 0);
                        const dayTel = dayPayments.filter((p) => p.mode === "telephone").reduce((s, p) => s + p.amount, 0);
                        const dayExp = dayExpenses.reduce((s, e) => s + e.amount, 0);
                        return (
                          <FragmentDay key={date}>
                            <tr className="bg-accent/30">
                              <td colSpan={8} className="px-3 py-2 text-xs font-bold text-foreground">{fmtDate(date)}</td>
                            </tr>
                            {dayPayments.map((p) => {
                              const client = clients.find((c) => c.id === p.clientId);
                              return (
                                <tr key={p.id} className="border-b border-border/40">
                                  <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{client?.name ?? "—"}</td>
                                  <td className="px-3 py-2 text-xs font-mono text-success">{p.mode === "cash" ? fmt(p.amount) : "—"}</td>
                                  <td className="px-3 py-2 text-xs font-mono text-primary">{p.mode === "bank" ? fmt(p.amount) : "—"}</td>
                                  <td className="px-3 py-2 text-xs text-muted">{p.mode === "bank" ? getBankName(p.bankId) : "—"}</td>
                                  <td className="px-3 py-2 text-xs font-mono text-secondary">{p.mode === "telephone" ? fmt(p.amount) : "—"}</td>
                                  <td className="px-3 py-2 text-xs text-muted">{p.mode === "telephone" ? (p.receiverName || "—") : "—"}</td>
                                  <td className="px-3 py-2 text-xs text-muted">—</td>
                                  <td className="px-3 py-2 text-xs text-muted">—</td>
                                </tr>
                              );
                            })}
                            {dayExpenses.map((e) => (
                              <tr key={e.id} className="border-b border-border/40">
                                <td className="px-3 py-2 text-xs text-muted italic">(expense)</td>
                                <td className="px-3 py-2 text-xs text-muted">—</td>
                                <td className="px-3 py-2 text-xs text-muted">—</td>
                                <td className="px-3 py-2 text-xs text-muted">—</td>
                                <td className="px-3 py-2 text-xs text-muted">—</td>
                                <td className="px-3 py-2 text-xs text-muted">&gt;</td>
                                <td className="px-3 py-2 text-xs text-foreground">{e.name}</td>
                                <td className="px-3 py-2 text-xs font-mono text-danger">{fmt(e.amount)}</td>
                              </tr>
                            ))}
                            <tr className="border-b-2 border-border bg-accent/50 font-semibold">
                              <td className="px-3 py-2 text-xs text-foreground">Subtotal — {fmtDate(date)}</td>
                              <td className="px-3 py-2 text-xs font-mono text-success">{fmt(dayCash)}</td>
                              <td className="px-3 py-2 text-xs font-mono text-primary">{fmt(dayBank)}</td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2 text-xs font-mono text-secondary">{fmt(dayTel)}</td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2 text-xs font-mono text-danger">{fmt(dayExp)}</td>
                            </tr>
                          </FragmentDay>
                        );
                      })}
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

  /* ============================================================
     MAIN ADMIN REPORT — The primary report view
  ============================================================ */
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
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
                            label: "✓ Paid",
                            className:
                              "bg-success/10 text-success border border-success/20",
                          }
                        : {
                            label: "⏳ Loan",
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
                            <td className="px-4 py-3 text-xs font-mono text-muted whitespace-nowrap">
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
                                <div className="inline-flex items-center gap-1.5 text-success text-xs font-mono font-semibold">
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
                                <span className="inline-flex items-center gap-1 text-danger text-xs font-mono font-semibold">
                                  <ArrowUpCircle size={11} />-{m.stockOut}
                                </span>
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono font-bold text-right text-foreground whitespace-nowrap">
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
                        <td className="px-4 py-3 text-center text-success font-mono">
                          +{stockFiltered.reduce((s, m) => s + m.stockIn, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center text-danger font-mono">
                          -{stockFiltered.reduce((s, m) => s + m.stockOut, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground font-mono">
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
                          <span className="text-[11px] font-mono text-muted">
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
                              <span className="text-success font-mono font-bold">
                                +{m.stockIn} boxes {m.isReturn ? "(Return)" : ""}
                              </span>
                            ) : (
                              <span className="text-danger font-mono font-bold">
                                -{m.stockOut} boxes
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-bold text-foreground">
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
                    l.client.name,
                    l.client.district,
                    l.qty.toString(),
                    fmt(l.issued),
                    fmt(l.paidInRange),
                    fmt(l.outstanding),
                  ],
                  mobileTitle: l.client.name,
                  mobileSub: `${l.client.district} · ${l.qty} boxes this period`,
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
              <div className="text-xl sm:text-2xl text-primary font-mono font-bold">
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
                  <div className="text-base sm:text-lg text-foreground font-mono font-bold">
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
                    getName(p.clientId, clients),
                    fmt(p.amount),
                    p.mode === "telephone"
                      ? "Mobile Money"
                      : p.mode === "bank"
                        ? "Bank"
                        : "Cash",
                    paymentReference(p),
                  ],
                  mobileTitle: getName(p.clientId, clients),
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

      {/* Desktop & Tablet — professional table */}
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
                  const isLast = ci === row.cells.length - 1;
                  const isAmount = cell.includes(",") || cell.startsWith("RWF");
                  if (isLast && row.status) {
                    return (
                      <td key={ci} className="px-4 py-3">
                        <span
                          className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded whitespace-nowrap ${row.status.className}`}
                        >
                          {row.status.label}
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={ci}
                      className={`px-4 py-3 whitespace-nowrap ${
                        isAmount || ci >= 2
                          ? "text-xs font-mono font-semibold text-foreground"
                          : "text-xs text-foreground"
                      }`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — Stacked cards */}
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
                <span className="text-sm font-mono font-semibold text-foreground flex-shrink-0">
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
                <span className="font-mono font-semibold text-foreground">
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