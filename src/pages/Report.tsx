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
import type { PaymentMode } from "../lib/types";

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

  const getName = (id: string, list: { id: string; name: string }[]) =>
    list.find((i) => i.id === id)?.name ?? "—";

  const inDateRange = (date: string) =>
    inRange(date, dateFilter, customFrom, customTo);

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
  const salesPaidTotal = salesPayments.reduce((s, p) => s + p.amount, 0);
  const salesOutstanding = Math.max(0, salesLoan - salesPaidTotal);

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
      const allPaid = state.payments
        .filter((p) => p.clientId === c.id)
        .reduce((s, p) => s + p.amount, 0);
      const outstanding = Math.max(
        0,
        allLoanReports.reduce((s, r) => s + r.totalPrice, 0) - allPaid,
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
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <Download size={15} />
          <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>

      {/* Report type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
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
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
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
        <div className="flex flex-col sm:flex-row gap-3 mb-4 bg-card border border-border rounded-[var(--radius)] p-4">
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
      <div className="grid grid-cols-2 sm:flex gap-3 mb-6">
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
            <option value="all">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        {reportType === "stock" && (
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
            <option value="all">All Modes</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="telephone">Mobile Money</option>
          </select>
        )}
      </div>

      {/* ============ SALES ============ */}
      {reportType === "sales" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

          {salesFiltered.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-card border border-border rounded-[var(--radius-lg)] p-6 hover:shadow-md transition-shadow duration-200">
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Revenue Trend
                  </h3>
                  <p className="text-xs text-muted mb-5">
                    Sales revenue over the selected period
                  </p>
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
                        formatter={(v: number) => fmt(v)}
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
                <div className="bg-card border border-border rounded-[var(--radius-lg)] p-6 hover:shadow-md transition-shadow duration-200">
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Paid vs Loan
                  </h3>
                  <p className="text-xs text-muted mb-5">
                    Revenue by payment status
                  </p>
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
                          <Cell
                            key={i}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => fmt(v)}
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
                      formatter={(v: number) => [`${v} boxes`, "Balance"]}
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

              <DetailTable
                icon={Package}
                title="Movement Detail"
                count={stockFiltered.length}
                headers={[
                  "Date",
                  "Product",
                  "Type",
                  "Agent/Location",
                  "In",
                  "Out",
                  "Balance",
                ]}
                rows={stockFiltered
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((m) => ({
                    key: m.id,
                    cells: [
                      fmtDate(m.date),
                      getName(m.productId, products),
                      m.type === "production"
                        ? "Production"
                        : m.type === "marketing_agent"
                          ? "Agent"
                          : "Other",
                      m.agentId
                        ? `${getName(m.agentId, agents)}${m.location ? " · " + m.location : ""}`
                        : "—",
                      m.stockIn > 0 ? `+${m.stockIn}` : "—",
                      m.stockOut > 0 ? `-${m.stockOut}` : "—",
                      m.balance.toLocaleString(),
                    ],
                    mobileTitle: getName(m.productId, products),
                    mobileSub: m.agentId
                      ? `${getName(m.agentId, agents)}${m.location ? " · " + m.location : ""}`
                      : m.type === "production"
                        ? "Production"
                        : "Other",
                    mobileLeft:
                      m.stockIn > 0 ? `+${m.stockIn} in` : `-${m.stockOut} out`,
                    mobileRight: `Bal: ${m.balance.toLocaleString()}`,
                  }))}
              />
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
                        formatter={(v: number) => fmt(v)}
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
                        formatter={(v: number) => fmt(v)}
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
}: {
  title: string;
  sub: string;
  data: { name: string; revenue: number }[];
  color: string;
  className?: string;
}) {
  return (
    <div
      className={`bg-card border border-border rounded-[var(--radius-lg)] p-6 hover:shadow-md transition-shadow duration-200 ${className}`}
    >
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted mb-5">{sub}</p>
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
            formatter={(v: number) => fmt(v)}
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
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  headers: string[];
  rows: DetailRow[];
}) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Icon size={16} className="text-muted flex-shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="ml-auto text-xs text-muted">{count} records</span>
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
