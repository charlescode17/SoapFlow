import { useState, useMemo } from "react";
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
// 🏢 COMPANY NAME (Edit this text anytime to change the company name on PDF & Excel reports)
// ============================================================================
const COMPANY_NAME = "";

type DateFilter = "daily" | "weekly" | "monthly" | "annual" | "custom";
type ReportType = "sales" | "stock" | "loans" | "payments";

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

  const toggleSection = (key: string) => {
    setHiddenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const resetHiddenSections = () => setHiddenSections({});
  const isHidden = (key: string) => Boolean(hiddenSections[key]);
  const hiddenCount = Object.values(hiddenSections).filter(Boolean).length;

  const getName = (id: string, list: { id: string; name: string }[]) =>
    list.find((i) => i.id === id)?.name ?? "—";

  const getBuyerLabel = (r: AgentReport) =>
    r.clientId ? getName(r.clientId, clients) : r.customerName?.trim() || "Walk-in customer";

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

  const salesPayments = useMemo(() => {
    const clientIds = new Set(salesFiltered.map((r) => r.clientId));
    return state.payments.filter(
      (p) => inDateRange(p.date) && clientIds.has(p.clientId),
    );
  }, [state.payments, salesFiltered, dateFilter, customFrom, customTo]);

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

  const handleExportStockCSV = () => {
    const csvHeaders = [
      "Date",
      "Products Name",
      "Type",
      "Agent",
      "Location",
      "Stock In",
      "Stock Out",
      "Balance",
    ];

    const rows = stockFiltered.map((m) => {
      const prodName = getName(m.productId, products);
      const agName = m.agentId ? getName(m.agentId, agents) : "—";
      const loc = m.location || "—";
      const typeStr =
        m.type === "production"
          ? "Production"
          : m.type === "marketing_agent"
            ? "Agent Dispatch"
            : "Other";
      const stockInStr =
        m.stockIn > 0 ? `${m.stockIn} boxes${m.isReturn ? " (Return)" : ""}` : "0";
      const stockOutStr = m.stockOut > 0 ? `${m.stockOut} boxes` : "0";

      return [
        m.date,
        `"${prodName.replace(/"/g, '""')}"`,
        `"${typeStr}"`,
        `"${agName.replace(/"/g, '""')}"`,
        `"${loc.replace(/"/g, '""')}"`,
        `"${stockInStr}"`,
        `"${stockOutStr}"`,
        `"${m.balance} boxes"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [csvHeaders.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Stock_Movement_Record_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ---------------- CSV EXPORT ---------------- */
  const handleExportCsv = () => {
    let rows: string[][] = [];
    let filename = "";

    if (reportType === "sales") {
      rows = [
        [
          "Date",
          "Agent",
          "Client",
          "Product",
          "Qty",
          "Unit Price",
          "Total",
          "Status",
        ],
        ...salesFiltered.map((r) => [
          r.date,
          getName(r.agentId, agents),
          getName(r.clientId, clients),
          getName(r.productId, products),
          r.qty.toString(),
          r.unitPrice.toString(),
          r.totalPrice.toString(),
          r.paymentStatus,
        ]),
      ];
      filename = "sales-report";
    } else if (reportType === "stock") {
      rows = [
        [
          "Date",
          "Product",
          "Type",
          "Agent",
          "Location",
          "Stock In",
          "Stock Out",
          "Balance",
        ],
        ...stockFiltered.map((m) => [
          m.date,
          getName(m.productId, products),
          m.type,
          m.agentId ? getName(m.agentId, agents) : "",
          m.location ?? "",
          m.stockIn.toString(),
          m.stockOut.toString(),
          m.balance.toString(),
        ]),
      ];
      filename = "stock-report";
    } else if (reportType === "loans") {
      rows = [
        [
          "Client",
          "District",
          "Qty (period)",
          "Loan Issued (period)",
          "Payments Received (period)",
          "Current Outstanding",
        ],
        ...loansByClient.map((l) => [
          l.client.name,
          l.client.district,
          l.qty.toString(),
          l.issued.toString(),
          l.paidInRange.toString(),
          l.outstanding.toString(),
        ]),
      ];
      filename = "loans-report";
    } else {
      rows = [
        ["Date", "Client", "Amount", "Mode", "Reference"],
        ...paymentsFiltered.map((p) => [
          p.date,
          getName(p.clientId, clients),
          p.amount.toString(),
          p.mode,
          paymentReference(p),
        ]),
      ];
      filename = "payments-report";
    }

    const csv = rows
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soapflow-${filename}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scopeLabel =
    clientFilter !== "all"
      ? getName(clientFilter, clients)
      : agentFilter !== "all"
        ? getName(agentFilter, agents)
        : "";

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
      { label: "Total In", value: `+${saIn.toLocaleString()}`, sub: "boxes received", color: "#3FA66B" },
      { label: "Total Out", value: `-${saOut.toLocaleString()}`, sub: "boxes dispatched", color: "#E05C5C" },
      { label: "Net Change", value: (saNet >= 0 ? "+" : "") + saNet.toLocaleString(), sub: "net movement", color: "#2E9E8F" },
      { label: "Entries", value: saCount.toLocaleString(), sub: "total records", color: "#D99A3D" },
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

    const handleStockAgentExport = () => {
      const rows = [
        ["Date", "Product", "Description", "Agent / Location", "Stock In", "Stock Out", "Balance"],
        ...saTable.map((m) => [
          m.date,
          getProductName(m.productId),
          movementLabel(m.type),
          m.agentId ? `${getAgentName(m.agentId)} ${m.location ? `(${m.location})` : ""}` : "—",
          m.stockIn > 0 ? (m.unit === "piece" && m.enteredQty ? `${m.enteredQty} pcs (${m.stockIn} boxes)` : `${m.stockIn} boxes`) : "0",
          m.stockOut > 0 ? (m.unit === "piece" && m.enteredQty ? `${m.enteredQty} pcs (${m.stockOut} boxes)` : `${m.stockOut} boxes`) : "0",
          `${m.balance} boxes`,
        ]),
      ];
      const csv = rows.map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soapflow-stock-report-${today()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 no-print">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Stock Report</h1>
            <p className="text-sm text-muted mt-1">Personalised stock movement report · {dateLabel[dateFilter]}</p>
          </div>
          <div className="flex items-center gap-2">
            {hiddenCount > 0 && (
              <button
                onClick={resetHiddenSections}
                className="flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-[var(--radius)] hover:bg-amber-100 transition-colors"
              >
                <RotateCcw size={12} /> Show all ({hiddenCount} hidden)
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors shadow-sm"
            >
              <Printer size={15} />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={handleStockAgentExport}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Download size={15} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 mb-6 flex flex-wrap gap-3 items-end no-print">
          <div className="flex flex-wrap gap-1.5">
            {SA_DATE_FILTERS.map((f) => (
              <button key={f.id} onClick={() => setDateFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius)] transition-colors ${dateFilter === f.id ? "bg-primary text-white" : "bg-background border border-border text-muted hover:text-foreground"}`}>
                {f.label}
              </button>
            ))}
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
            <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Agent</label>
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
              <option value="all">All Agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {/* Printable company header */}
        <div className="hidden print:block mb-6 border-b border-border pb-4">
          <div className="text-xl font-bold text-foreground uppercase tracking-wide">{COMPANY_NAME}</div>
          <div className="text-base font-semibold text-primary mt-0.5">STOCK MOVEMENT REPORT</div>
          <div className="text-xs text-muted mt-1">Period: {dateLabel[dateFilter]} · Generated: {new Date().toLocaleString()}</div>
        </div>

        {/* KPI cards */}
        {!isHidden("sa-kpis") && (
          <div className="relative mb-6">
            <button
              onClick={() => toggleSection("sa-kpis")}
              title="Hide KPI cards from report"
              className="no-print absolute -top-3 right-2 p-1 bg-card border border-border text-muted hover:text-danger hover:bg-danger/10 rounded-full transition-colors shadow-xs z-10"
            >
              <Minus size={12} />
            </button>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {saKpis.map((k) => (
                <div key={k.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                  <div className="text-lg sm:text-xl font-bold leading-tight" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-[11px] text-muted mt-1">{k.label}</div>
                  <div className="text-[10px] text-muted/70">{k.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Area chart */}
        {!isHidden("sa-trend") && (
          <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 mb-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between mb-0.5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-0.5">Movement Trend</h3>
                <p className="text-xs text-muted mb-4">Stock In vs Out — {dateLabel[dateFilter]}</p>
              </div>
              <button
                onClick={() => toggleSection("sa-trend")}
                title="Hide chart from report"
                className="no-print p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
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
                    formatter={(v: any, name: any) => [`${v} boxes`, name]} />
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
          <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Movement Records</h3>
                <p className="text-xs text-muted mt-0.5">{saTable.length} entries — {dateLabel[dateFilter]}</p>
              </div>
              <button
                onClick={() => toggleSection("sa-table")}
                title="Hide table from report"
                className="no-print p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors flex-shrink-0"
              >
                <Minus size={14} />
              </button>
            </div>
            {saTable.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-sm text-muted">No records for this period</p>
              </div>
            ) : (
              <>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-background/50">
                        {["Date", "Product", "Type", "Agent", "Location", "Stock In", "Stock Out", "Balance"].map((h) => (
                          <th key={h} className="text-left text-[10px] text-muted uppercase tracking-wide px-5 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {saTable.map((m, i) => (
                        <tr key={m.id} className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === saTable.length - 1 ? "border-b-0" : ""}`}>
                          <td className="px-5 py-3 text-xs font-mono text-muted whitespace-nowrap">{fmtDate(m.date)}</td>
                          <td className="px-5 py-3 text-xs font-medium text-foreground whitespace-nowrap">{getProductName(m.productId)}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${m.type === "production" ? "bg-primary/10 text-primary" : m.type === "marketing_agent" ? "bg-secondary/10 text-secondary" : m.type === "customer_sale" ? "bg-success/10 text-success" : "bg-muted/20 text-muted"}`}>
                              {m.type === "production" ? "Production" : m.type === "marketing_agent" ? "Dispatch" : m.type === "customer_sale" ? "Customer Sale" : "Other"}
                            </span>
                            {m.isReturn && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wide">
                                Return
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs text-muted whitespace-nowrap">{getAgentName(m.agentId)}</td>
                          <td className="px-5 py-3 text-xs text-muted">{m.location ?? "—"}</td>
                          <td className="px-5 py-3">{m.stockIn > 0 ? <span className="flex items-center gap-1 text-xs font-mono text-success"><ArrowDownCircle size={12} />+{m.stockIn}</span> : <span className="text-muted text-xs">—</span>}</td>
                          <td className="px-5 py-3">{m.stockOut > 0 ? <span className="flex items-center gap-1 text-xs font-mono text-danger"><ArrowUpCircle size={12} />-{m.stockOut}</span> : <span className="text-muted text-xs">—</span>}</td>
                          <td className="px-5 py-3 text-xs font-mono text-foreground whitespace-nowrap">{m.balance.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="sm:hidden divide-y divide-border/50">
                  {saTable.map((m) => (
                    <div key={m.id} className="px-4 py-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${m.type === "production" ? "bg-primary/10 text-primary" : m.type === "marketing_agent" ? "bg-secondary/10 text-secondary" : "bg-muted/20 text-muted"}`}>
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
              </>
            )}
          </div>
        )}
      </div>
    );
  }
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

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 no-print">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Hey {firstName}, here's your report 👋
            </h1>
            <p className="text-sm text-muted mt-1">
              {dateLabel[dateFilter]} · everything you can print for your own records
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors shadow-sm self-start sm:self-auto"
          >
            <Printer size={15} />
            <span>Print / PDF</span>
          </button>
        </div>

        <div className="no-print mb-6 space-y-3">
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

        <div className="hidden print:block mb-6 border-b border-border pb-4">
          <div className="text-xl font-bold text-foreground uppercase tracking-wide">SoapFlow</div>
          <div className="text-base font-semibold text-primary mt-0.5">
            {maSection === "sales" ? "AGENT SALES & LOAN REPORT" : maSection === "clients" ? "MY CLIENTS REPORT" : "AGENT PAYMENTS REPORT"}
          </div>
          <div className="text-xs text-muted mt-1">
            {state.user?.name} · {dateLabel[dateFilter]} · Generated: {new Date().toLocaleString()}
          </div>
        </div>

        {maSection === "sales" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 no-print">
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-xs text-muted mb-1.5">Total Sales</div>
                <div className="text-lg font-mono text-foreground">{fmt(salesTotal)}</div>
              </div>
              <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5">
                <div className="text-xs text-muted mb-1.5">Boxes Sold</div>
                <div className="text-lg font-mono text-foreground">{salesQtyTotal.toLocaleString()}</div>
              </div>
              <div className="bg-secondary/10 border border-secondary/20 rounded-[var(--radius-lg)] p-4 sm:p-5 col-span-2 lg:col-span-1">
                <div className="text-xs text-secondary mb-1.5">Outstanding</div>
                <div className="text-lg font-mono text-secondary">{fmt(salesOutstandingTotal)}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-border no-print">
                <h3 className="text-sm font-semibold text-foreground">
                  Sales Detail ({salesInRange.length} records)
                </h3>
              </div>
              {salesInRange.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No sales recorded for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-background/50">
                        {["Date", "Client", "Telephone", "District", "Product", "Qty", "Total", "Status", "Remaining"].map((h) => (
                          <th key={h} className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">
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
                          <tr key={r.id} className="border-b border-border/50">
                            <td className="px-3 py-2.5 text-xs font-mono text-foreground whitespace-nowrap">{fmtDate(r.date)}</td>
                            <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">{client?.name ?? "—"}</td>
                            <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{client?.phone ?? "—"}</td>
                            <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{client?.district ?? "—"}</td>
                            <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">{getProductName(r.productId)}</td>
                            <td className="px-3 py-2.5 text-xs font-mono text-muted">{r.qty}</td>
                            <td className="px-3 py-2.5 text-xs font-mono text-foreground">{fmt(r.totalPrice)}</td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.paymentStatus === "paid" ? "bg-success/10 text-success" : "bg-secondary/10 text-secondary"}`}>
                                {r.paymentStatus === "paid" ? "Paid" : "Loan"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs font-mono text-secondary">{remaining > 0 ? fmt(remaining) : "—"}</td>
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
            <div className="px-5 py-4 border-b border-border flex items-center justify-between no-print">
              <h3 className="text-sm font-semibold text-foreground">
                {myClientsList.length} client{myClientsList.length !== 1 ? "s" : ""} handled
              </h3>
              <span className="text-sm font-mono text-secondary">{fmt(myClientsOutstandingTotal)} total outstanding</span>
            </div>
            {myClientsWithLoans.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted">No clients assigned yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      {["Client", "Telephone", "District", "Sector", "Center", "Outstanding"].map((h) => (
                        <th key={h} className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {myClientsWithLoans
                      .sort((a, b) => b.outstanding - a.outstanding)
                      .map(({ client, outstanding }) => (
                        <tr key={client.id} className="border-b border-border/50">
                          <td className="px-3 py-2.5 text-xs font-medium text-foreground whitespace-nowrap">{client.name}</td>
                          <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{client.phone}</td>
                          <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{client.district}</td>
                          <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{client.sector}</td>
                          <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{client.center}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-secondary">
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 no-print">
              {[
                { label: "Cash", value: payTotals.cash },
                { label: "Bank", value: payTotals.bank },
                { label: "Mobile Money", value: payTotals.telephone },
                { label: "Depense", value: payTotals.expense },
              ].map((t) => (
                <div key={t.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-4">
                  <div className="text-xs text-muted mb-1.5">{t.label}</div>
                  <div className="text-base font-mono text-foreground">{fmt(t.value)}</div>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              {payDayKeys.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">No payments or expenses for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px]">
                    <thead>
                      <tr className="border-b border-border bg-background/50">
                        {["Client / Expense", "Cash", "Bank", "Bank Name", "Mobile", "Receiver", "Depense", "Amount"].map((h) => (
                          <th key={h} className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">
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
                              <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold text-foreground">{fmtDate(date)}</td>
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
                                <td className="px-3 py-2 text-xs text-muted">—</td>
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Report</h1>
          <p className="text-sm text-muted mt-0.5">
            {dateLabel[dateFilter]}
            {scopeLabel ? ` · ${scopeLabel}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors shadow-sm"
          >
            <Printer size={15} />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
        </div>
      </div>

      {hiddenCount > 0 && (
        <div className="no-print flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-[var(--radius)] mb-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <Eye size={14} />
            <span>{hiddenCount} Section{hiddenCount > 1 ? "s" : ""} Hidden (Excluded from PDF & Export)</span>
          </div>
          <button
            onClick={resetHiddenSections}
            className="flex items-center gap-1 text-xs font-bold text-amber-900 hover:underline"
          >
            <RotateCcw size={12} /> Show All Sections
          </button>
        </div>
      )}

      {/* Filter controls panel — strictly hidden during print/export */}
      <div className="no-print mb-6 space-y-4">
        {/* Report type tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setReportType(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${reportType === t.id
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
                  className={`px-4 py-2 text-sm font-medium rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${dateFilter === f
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
          {/* Sales KPIs Grid */}
          {!isHidden("sales-kpis") && (
            <div className="relative mb-8">
              <button
                onClick={() => toggleSection("sales-kpis")}
                title="Hide KPI cards from report"
                className="no-print absolute -top-3 right-2 p-1 bg-card border border-border text-muted hover:text-danger hover:bg-danger/10 rounded-full transition-colors shadow-xs z-10"
              >
                <Minus size={12} />
              </button>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: "Total Revenue",
                    value: fmt(salesRevenue),
                    icon: DollarSign,
                    color: "primary",
                  },
                  {
                    label: "Boxes Sold",
                    value: salesQty.toLocaleString(),
                    icon: Package,
                    color: "success",
                  },
                  {
                    label: "Outstanding",
                    value: fmt(salesOutstanding),
                    icon: CreditCard,
                    color: "secondary",
                  },
                  {
                    label: "Active Agents",
                    value: salesByAgent.length.toString(),
                    icon: Users,
                    color: "foreground",
                  },
                ].map((kpi) => {
                  const colorMap: Record<string, string> = {
                    primary: "#2E9E8F",
                    success: "#3FA66B",
                    secondary: "#D99A3D",
                    foreground: "#1B2321",
                  };
                  return (
                    <div
                      key={kpi.label}
                      className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <div
                        className="w-9 h-9 rounded-[var(--radius)] flex items-center justify-center mb-3"
                        style={{ background: colorMap[kpi.color] + "18" }}
                      >
                        <kpi.icon
                          size={17}
                          style={{ color: colorMap[kpi.color] }}
                        />
                      </div>
                      <div className="text-xl font-bold text-foreground mb-0.5">
                        {kpi.value}
                      </div>
                      <div className="text-xs text-muted">{kpi.label}</div>
                    </div>
                  );
                })}
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
                        title="Hide chart from report"
                        className="no-print p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
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
                        title="Hide chart from report"
                        className="no-print p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: "Stock In (period)",
                value: `${stockIn.toLocaleString()} boxes`,
                icon: ArrowDownCircle,
                color: "success",
              },
              {
                label: "Stock Out (period)",
                value: `${stockOut.toLocaleString()} boxes`,
                icon: ArrowUpCircle,
                color: "secondary",
              },
              {
                label: "Net Change",
                value: `${stockNet >= 0 ? "+" : ""}${stockNet.toLocaleString()}`,
                icon: Package,
                color: "primary",
              },
              {
                label: "Current Balance",
                value: `${currentBalance.toLocaleString()} boxes`,
                icon: BarChart3,
                color: "foreground",
              },
            ].map((kpi) => {
              const colorMap: Record<string, string> = {
                primary: "#2E9E8F",
                success: "#3FA66B",
                secondary: "#D99A3D",
                foreground: "#1B2321",
              };
              return (
                <div
                  key={kpi.label}
                  className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div
                    className="w-9 h-9 rounded-[var(--radius)] flex items-center justify-center mb-3"
                    style={{ background: colorMap[kpi.color] + "18" }}
                  >
                    <kpi.icon
                      size={17}
                      style={{ color: colorMap[kpi.color] }}
                    />
                  </div>
                  <div className="text-xl font-bold text-foreground mb-0.5">
                    {kpi.value}
                  </div>
                  <div className="text-xs text-muted">{kpi.label}</div>
                </div>
              );
            })}
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

              {/* ── Movement Record Card with Top-Right Export & Print Buttons ── */}
              <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-sm">
                {/* Header with Title + Top-Right Buttons */}
                <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-primary flex-shrink-0" />
                    <h3 className="text-sm font-bold text-foreground">Movement Record</h3>
                    <span className="text-xs text-muted">({stockFiltered.length} records)</span>
                  </div>

                  {/* Top-Right Action Buttons */}
                  <div className="flex items-center gap-2 no-print self-end sm:self-auto">
                    <button
                      onClick={handleExportStockCSV}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-background border border-border rounded-[var(--radius)] hover:bg-accent/40 text-foreground transition-colors"
                    >
                      <Download size={13} />
                      Export Excel
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors"
                    >
                      <Printer size={13} />
                      Print / PDF
                    </button>
                  </div>
                </div>

                {/* Printable Company Header */}
                <div className="hidden print:block p-5 border-b border-border">
                  <div className="text-xl font-bold text-foreground uppercase tracking-wide">
                    {COMPANY_NAME}
                  </div>
                  <div className="text-sm font-semibold text-primary mt-0.5">
                    STOCK MOVEMENT RECORD REPORT
                  </div>
                  <div className="text-xs text-muted mt-1">
                    Filter Period: {dateLabel[dateFilter]} · Generated: {new Date().toLocaleString()}
                  </div>
                </div>

                {/* Desktop & Tablet Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-background/50">
                        <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">Date</th>
                        <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">Products Name</th>
                        <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">Type</th>
                        <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">Agent</th>
                        <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">Location</th>
                        <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">Stock In</th>
                        <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">Stock Out</th>
                        <th className="text-right text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockFiltered
                        .slice()
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((m, i) => (
                          <tr
                            key={m.id}
                            className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i % 2 === 1 ? "bg-background/40" : ""
                              }`}
                          >
                            {/* 1. Date */}
                            <td className="px-4 py-3 text-xs font-mono text-foreground whitespace-nowrap">
                              {fmtDate(m.date)}
                            </td>

                            {/* 2. Products Name */}
                            <td className="px-4 py-3 text-xs font-bold text-foreground whitespace-nowrap">
                              {getName(m.productId, products)}
                            </td>

                            {/* 3. Type */}
                            <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                              {m.type === "production"
                                ? "Production"
                                : m.type === "marketing_agent"
                                  ? "Agent Dispatch"
                                  : "Other"}
                            </td>

                            {/* 4. Agent */}
                            <td className="px-4 py-3 text-xs font-medium text-foreground whitespace-nowrap">
                              {m.agentId ? getName(m.agentId, agents) : "—"}
                            </td>

                            {/* 5. Location */}
                            <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                              {m.location || "—"}
                            </td>

                            {/* 6. Stock In (With Return Tag if agent return) */}
                            <td className="px-4 py-3 text-xs font-mono font-medium">
                              {m.stockIn > 0 ? (
                                <div className="inline-flex items-center gap-1.5 text-success">
                                  <span>+{m.stockIn} boxes</span>
                                  {m.isReturn && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wide">
                                      Return
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>

                            {/* 7. Stock Out */}
                            <td className="px-4 py-3 text-xs font-mono font-medium">
                              {m.stockOut > 0 ? (
                                <span className="text-danger">-{m.stockOut} boxes</span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>

                            {/* 8. Balance */}
                            <td className="px-4 py-3 text-xs font-mono font-bold text-right text-foreground whitespace-nowrap">
                              {m.balance.toLocaleString()} boxes
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-accent/50 font-bold text-xs">
                        <td colSpan={5} className="px-4 py-3 text-foreground">
                          TOTAL SUMMARY ({stockFiltered.length} RECORDS)
                        </td>
                        <td className="px-4 py-3 text-success font-mono">
                          +{stockFiltered.reduce((s, m) => s + m.stockIn, 0).toLocaleString()} boxes
                        </td>
                        <td className="px-4 py-3 text-danger font-mono">
                          -{stockFiltered.reduce((s, m) => s + m.stockOut, 0).toLocaleString()} boxes
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
                <div className="sm:hidden divide-y divide-border/50 no-print">
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: "Loans Issued (period)",
                value: fmt(loansIssued),
                icon: CreditCard,
                color: "secondary",
              },
              {
                label: "Payments Received (period)",
                value: fmt(loanPaymentsReceived),
                icon: DollarSign,
                color: "success",
              },
              {
                label: "Net Change (period)",
                value: fmt(loansIssued - loanPaymentsReceived),
                icon: BarChart3,
                color: "primary",
              },
              {
                label: "Clients w/ Activity",
                value: loansByClient.length.toString(),
                icon: Users,
                color: "foreground",
              },
            ].map((kpi) => {
              const colorMap: Record<string, string> = {
                primary: "#2E9E8F",
                success: "#3FA66B",
                secondary: "#D99A3D",
                foreground: "#1B2321",
              };
              return (
                <div
                  key={kpi.label}
                  className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div
                    className="w-9 h-9 rounded-[var(--radius)] flex items-center justify-center mb-3"
                    style={{ background: colorMap[kpi.color] + "18" }}
                  >
                    <kpi.icon
                      size={17}
                      style={{ color: colorMap[kpi.color] }}
                    />
                  </div>
                  <div className="text-xl font-bold text-foreground mb-0.5">
                    {kpi.value}
                  </div>
                  <div className="text-xs text-muted">{kpi.label}</div>
                </div>
              );
            })}
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="col-span-2 bg-primary/10 border border-primary/20 rounded-[var(--radius-lg)] p-5">
              <div className="text-xs text-primary font-semibold uppercase tracking-wide mb-2">
                Total Received
              </div>
              <div className="text-xl sm:text-2xl text-primary font-mono">
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
                  className="bg-card border border-border rounded-[var(--radius-lg)] p-5"
                >
                  <div className="text-xs text-muted capitalize mb-2">
                    {mode === "telephone" ? "Mobile Money" : mode}
                  </div>
                  <div className="text-base sm:text-lg text-foreground font-mono">
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
            title="Hide section from report"
            className="no-print p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
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
          <Icon size={16} className="text-muted flex-shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="text-xs text-muted">({count} records)</span>
        </div>
        {onHide && (
          <button
            onClick={onHide}
            title="Hide table from report"
            className="no-print p-1 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
          >
            <Minus size={14} />
          </button>
        )}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-background/50">
              {headers.map((h) => (
                <th
                  key={h}
                  className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 whitespace-nowrap"
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
                className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === rows.length - 1 ? "border-b-0" : ""}`}
              >
                {row.cells.map((cell, ci) => {
                  const isLast = ci === row.cells.length - 1;
                  if (isLast && row.status) {
                    return (
                      <td key={ci} className="px-4 py-3">
                        <span
                          className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${row.status.className}`}
                        >
                          {row.status.label}
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={ci}
                      className="px-4 py-3 text-sm text-foreground whitespace-nowrap"
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

      <div className="sm:hidden divide-y divide-border/50">
        {rows.map((row) => (
          <div key={row.key} className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground truncate">
                {row.mobileTitle}
              </span>
              {row.status ? (
                <span
                  className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${row.status.className}`}
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