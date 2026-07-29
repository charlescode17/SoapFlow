import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  FileText,
  List,
  LayoutGrid,
} from "lucide-react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { Modal } from "../components/Modal";
import { Confirm } from "../components/Confirm";
import { fmt, fmtDate, today } from "../lib/utils";
import type { AgentReport, PaymentStatus } from "../lib/types";
import { normalizeRole } from "../lib/types";
import Swal from "sweetalert2";

type DateFilter = "all" | "daily" | "weekly" | "monthly" | "annual";
type ViewMode = "list" | "grid";

function inRange(date: string, filter: DateFilter): boolean {
  if (filter === "all") return true;
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
  return true;
}

export default function AgentReports() {
  const { state, dispatch } = useStore();
  const role = normalizeRole(state.user?.role);
  const canEdit = role === "manager" || role === "marketing_agent";
  const canDelete = role === "manager";
  const [marketingAgents, setMarketingAgents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    async function loadMarketingAgents() {
      const { data } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("role", "marketing_agent")
        .order("name");
      if (data) setMarketingAgents(data);
    }
    loadMarketingAgents();
  }, []);

  const getAgentName = (id?: string) =>
    marketingAgents.find((a) => a.id === id)?.name ?? "—";
  const reports = state.agentReports.filter(
    (r) => !r.deleted && (role !== "marketing_agent" || r.agentId === state.user?.id),
  );
  const agents = state.agents.filter((a) => !a.deleted);
  const clients = state.clients.filter(
    (c) =>
      !c.deleted &&
      (role !== "marketing_agent" || c.agentId === state.user?.id || c.handlerId === state.user?.id),
  );
  const products = state.products.filter((p) => !p.deleted);

  const [agentFilter, setAgentFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<AgentReport | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const defaultProduct = products[0];
  const [saleType, setSaleType] = useState<"client" | "walkin">("client");
  const [walkinMode, setWalkinMode] = useState<"cash" | "telephone">("cash");
  const [walkinReceiver, setWalkinReceiver] = useState(state.user?.name ?? "");
  const [form, setForm] = useState({
    date: today(),
    agentId: "",
    clientId: "",
    customerName: "",
    productId: defaultProduct?.id ?? "",
    qty: "",
    paymentStatus: "paid" as PaymentStatus,
  });

  const selectedClient = clients.find((c) => c.id === form.clientId);
  const selectedProduct =
    products.find((p) => p.id === form.productId) ?? defaultProduct;
  const unitPrice = selectedProduct?.pricePerBox ?? 0;
  const totalPrice = parseInt(form.qty || "0") * unitPrice;

  const getName = (id: string, list: { id: string; name: string }[]) =>
    list.find((i) => i.id === id)?.name ?? "—";

  const getBuyerLabel = (r: AgentReport) =>
    r.clientId ? getName(r.clientId, clients) : r.customerName?.trim() || "Walk-in customer";

  const filtered = reports.filter((r) => {
    const agent = marketingAgents.find((a) => a.id === r.agentId);
    const client = clients.find((c) => c.id === r.clientId);
    const matchSearch = search
      ? agent?.name.toLowerCase().includes(search.toLowerCase()) ||
        client?.name.toLowerCase().includes(search.toLowerCase())
      : true;
    return (
      matchSearch &&
      (!agentFilter || r.agentId === agentFilter) &&
      (!statusFilter || r.paymentStatus === statusFilter) &&
      inRange(r.date, dateFilter)
    );
  });

  const totalQty = filtered.reduce((s, r) => s + r.qty, 0);
  const totalAmt = filtered.reduce((s, r) => s + r.totalPrice, 0);

  const openAdd = () => {
    setSaleType("client");
    setForm({
      date: today(),
      agentId: role === "marketing_agent" ? state.user?.id || agents[0]?.id || "" : agents[0]?.id || "",
      clientId: clients[0]?.id || "",
      customerName: "",
      productId: defaultProduct?.id ?? "",
      qty: "",
      paymentStatus: "paid",
    });
    setModal("add");
  };
  const openEdit = (r: AgentReport) => {
    setEditing(r);
    setSaleType(r.clientId ? "client" : "walkin");
    setForm({
      date: r.date,
      agentId: r.agentId,
      clientId: r.clientId ?? "",
      customerName: r.customerName ?? "",
      productId: r.productId,
      qty: r.qty.toString(),
      paymentStatus: r.paymentStatus,
    });
    setModal("edit");
  };
  const closeModal = () => {
    setModal(null);
    setEditing(null);
  };

const [saving, setSaving] = useState(false);

  const getAgentProductAvailable = (agentId: string, productId: string, excludeReportId?: string) => {
    const dispatched = state.stockMovements
      .filter((m) => m.type === "marketing_agent" && m.agentId === agentId && m.productId === productId && !m.isReturn)
      .reduce((s, m) => s + m.stockOut, 0);
    const returned = state.stockMovements
      .filter((m) => m.type === "marketing_agent" && m.agentId === agentId && m.productId === productId && m.isReturn)
      .reduce((s, m) => s + m.stockIn, 0);
    const distributed = state.agentReports
      .filter((r) => !r.deleted && r.agentId === agentId && r.productId === productId && r.id !== excludeReportId)
      .reduce((s, r) => s + r.qty, 0);
    return dispatched - returned - distributed;
  };

  const availableForSelectedProduct = form.agentId && form.productId
    ? getAgentProductAvailable(form.agentId, form.productId, editing?.id)
    : 0;
  const piecesPerBoxForSelected = selectedProduct?.piecesPerBox ?? selectedProduct?.qtyPerBox ?? null;

  const handleSave = async () => {
    if (!form.agentId || !form.qty || !state.user) return;
    if (saleType === "client" && !form.clientId) return;

    const requestedQty = parseFloat(form.qty);
    const available = getAgentProductAvailable(form.agentId, form.productId, editing?.id);
    if (requestedQty > available) {
      Swal.fire({
        icon: "warning",
        title: "Not enough stock on hand",
        text: `This agent has only ${available} box${available === 1 ? "" : "es"} of ${selectedProduct?.name ?? "this product"} available to distribute (dispatched minus returns and already-reported sales). You entered ${requestedQty}.`,
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    setSaving(true);

    const payload = {
      agent_id: form.agentId,
      client_id: saleType === "client" ? form.clientId : null,
      customer_name: saleType === "walkin" ? form.customerName.trim() || null : null,
      product_id: form.productId,
      date: form.date,
      qty: parseFloat(form.qty),
      unit_price: unitPrice,
      total_price: totalPrice,
      payment_status: saleType === "walkin" ? "paid" : "loan",
      created_by: state.user.name,
    };

    if (modal === "add") {
      const { data, error } = await supabase
        .from("agent_reports")
        .insert(payload)
        .select()
        .single();

      setSaving(false);
      if (error) {
        Swal.fire({ icon: "error", title: "Could not save report", text: error.message, confirmButtonColor: "#2E9E8F" });
        return;
      }

      const newReport: AgentReport = {
        id: data.id,
        agentId: data.agent_id,
        clientId: data.client_id,
        customerName: data.customer_name ?? undefined,
        productId: data.product_id,
        date: data.date,
        qty: Number(data.qty),
        unitPrice: Number(data.unit_price),
        totalPrice: Number(data.total_price),
        paymentStatus: data.payment_status,
        createdBy: data.created_by,
        deleted: false,
      };
      dispatch({ type: "ADD_AGENT_REPORT", payload: newReport });

      const buyerLabel = saleType === "client" ? getName(form.clientId, clients) : (form.customerName.trim() || "Walk-in customer");
      await supabase.from("activity_logs").insert({
        actor_id: state.user.id,
        actor_name: state.user.name,
        action: "created",
        entity_type: "agent_report",
        entity_id: data.id,
        entity_name: `${buyerLabel} — ${getName(form.productId, products)}`,
      });

      if (saleType === "walkin") {
        const { data: payData, error: payError } = await supabase
          .from("payments")
          .insert({
            client_id: null,
            agent_id: form.agentId,
            report_id: data.id,
            date: form.date,
            amount: totalPrice,
            mode: walkinMode,
            receiver_name: walkinMode === "telephone" ? walkinReceiver || null : null,
            created_by: state.user.name,
          })
          .select()
          .single();

        if (!payError && payData) {
          dispatch({
            type: "ADD_PAYMENT",
            payload: {
              id: payData.id,
              clientId: undefined,
              agentId: payData.agent_id,
              reportId: payData.report_id,
              date: payData.date,
              amount: Number(payData.amount),
              mode: payData.mode,
              receiverName: payData.receiver_name ?? undefined,
            },
          });
        }
      }
    } else if (editing) {
    } else if (editing) {
      const { error } = await supabase
        .from("agent_reports")
        .update(payload)
        .eq("id", editing.id);

      setSaving(false);
      if (error) {
        Swal.fire({ icon: "error", title: "Could not update report", text: error.message, confirmButtonColor: "#2E9E8F" });
        return;
      }

      dispatch({
        type: "UPDATE_AGENT_REPORT",
        payload: {
          ...editing,
          agentId: form.agentId,
          clientId: saleType === "client" ? form.clientId : null,
          customerName: saleType === "walkin" ? form.customerName.trim() || undefined : undefined,
          productId: form.productId,
          date: form.date,
          qty: parseInt(form.qty),
          unitPrice,
          totalPrice,
          paymentStatus: saleType === "walkin" ? "paid" : form.paymentStatus,
        },
      });
    }
    closeModal();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("agent_reports")
      .update({ deleted: true })
      .eq("id", id);
    if (error) {
      Swal.fire({ icon: "error", title: "Could not delete report", text: error.message, confirmButtonColor: "#2E9E8F" });
      return;
    }
    dispatch({ type: "DELETE_AGENT_REPORT", id });
  };

  const setF =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sales Reports</h1>
          <p className="text-sm text-muted mt-0.5">
            Sales records from marketing agents
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-primary text-white text-sm px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New Report</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-6">
        <div className="relative flex-1 sm:flex-none sm:w-52">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agent or client…"
            className="w-full pl-8 pr-4 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-3">
          {role === "manager" && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
            >
              <option value="">All Agents</option>
              {marketingAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
          >
            {[
              ["all", "All Time"],
              ["daily", "Today"],
              ["weekly", "This Week"],
              ["monthly", "This Month"],
              ["annual", "This Year"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
          >
            <option value="">All Status</option>
            <option value="paid">Paid</option>
            <option value="loan">Loan</option>
          </select>
        </div>

        <div className="flex items-center gap-0.5 bg-card border border-border rounded-[var(--radius)] p-1 flex-shrink-0 sm:ml-auto">
          <button
            onClick={() => setView("list")}
            title="List view"
            className={`p-2 rounded-[var(--radius-sm)] transition-colors ${
              view === "list"
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground hover:bg-accent/40"
            }`}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setView("grid")}
            title="Grid view"
            className={`p-2 rounded-[var(--radius-sm)] transition-colors ${
              view === "grid"
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground hover:bg-accent/40"
            }`}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {[
          { label: "Records", value: filtered.length.toString() },
          { label: "Total Qty", value: `${totalQty.toLocaleString()} boxes` },
          { label: "Total Amount", value: fmt(totalAmt) },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-card border border-border rounded-[var(--radius)] px-5 py-4"
          >
            <div className="text-xs text-muted mb-1">{s.label}</div>
            <div className="text-lg font-mono">{s.value}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center py-16">
          <FileText size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">No reports match your filters</p>
        </div>
      ) : view === "grid" ? (
        /* ---------- GRID VIEW ---------- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const client = clients.find((c) => c.id === r.clientId);
            return (
              <div
                key={r.id}
                className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <span
                    className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full ${
                      r.paymentStatus === "paid"
                        ? "bg-success/10 text-success border border-success/20"
                        : "bg-secondary/10 text-secondary border border-secondary/20"
                    }`}
                  >
                    {r.paymentStatus === "paid" ? "✓ Paid" : "⏳ Loan"}
                  </span>
                  <span className="text-xs text-muted font-mono">
                    {fmtDate(r.date)}
                  </span>
                </div>

                <div className="text-sm text-foreground truncate">
                  {getName(r.agentId, agents)}
                </div>
                <div className="text-xs text-muted mb-1">
                  → {getBuyerLabel(r)}
                </div>
                {client ? (
                  <div className="text-[11px] text-muted mb-3">
                    {client.district} · {client.sector}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted mb-3 italic">Walk-in sale</div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/60 text-center">
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Qty
                    </div>
                    <div className="text-sm font-mono text-foreground">
                      {r.qty}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Unit
                    </div>
                    <div className="text-sm font-mono text-muted">
                      {fmt(r.unitPrice)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Total
                    </div>
                    <div className="text-sm font-mono text-foreground">
                      {fmt(r.totalPrice)}
                    </div>
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-border/60">
                    <button
                      onClick={() => openEdit(r)}
                      className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmId(r.id)}
                      className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ---------- LIST VIEW — table on lg+, stacked cards below lg (8 cols needs more room) ---------- */
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {[
                    "Date",
                    "Agent",
                    "Client",
                    "Location",
                    "Qty",
                    "Unit Price",
                    "Total",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs text-muted uppercase tracking-wide px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                  {canEdit && (
                    <th className="text-right text-xs text-muted uppercase tracking-wide px-4 py-3">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const client = clients.find((c) => c.id === r.clientId);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""}`}
                    >
                      <td className="px-4 py-3.5 text-sm text-foreground font-mono whitespace-nowrap">
                        {fmtDate(r.date)}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium text-foreground whitespace-nowrap">
                        {getName(r.agentId, agents)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">
                        {getBuyerLabel(r)}
                        {!r.clientId && (
                          <span className="ml-1.5 text-[10px] font-semibold text-muted bg-accent/60 px-1.5 py-0.5 rounded-full">Walk-in</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted whitespace-nowrap">
                        {client ? (
                          <span>
                            {client.district} · {client.sector}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-mono text-foreground">
                        {r.qty}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-mono text-muted">
                        {fmt(r.unitPrice)}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-mono text-foreground">
                        {fmt(r.totalPrice)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap ${
                            r.paymentStatus === "paid"
                              ? "bg-success/10 text-success border border-success/20"
                              : "bg-secondary/10 text-secondary border border-secondary/20"
                          }`}
                        >
                          {r.paymentStatus === "paid" ? "✓ Paid" : "⏳ Loan"}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(r)}
                              className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => setConfirmId(r.id)}
                              className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Stacked rows: below lg */}
          <div className="lg:hidden divide-y divide-border/50">
            {filtered.map((r) => {
              const client = clients.find((c) => c.id === r.clientId);
              return (
                <div key={r.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted font-mono">
                      {fmtDate(r.date)}
                    </span>
                    <span
                      className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full ${
                        r.paymentStatus === "paid"
                          ? "bg-success/10 text-success border border-success/20"
                          : "bg-secondary/10 text-secondary border border-secondary/20"
                      }`}
                    >
                      {r.paymentStatus === "paid" ? "✓ Paid" : "⏳ Loan"}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {getName(r.agentId, agents)}
                  </div>
                  <div className="text-xs text-muted mb-1">
                    → {getBuyerLabel(r)}
                  </div>
                  {client ? (
                    <div className="text-[11px] text-muted mb-2">
                      {client.district} · {client.sector}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted mb-2 italic">Walk-in sale</div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {r.qty} boxes ×{" "}
                      <span className="font-mono">{fmt(r.unitPrice)}</span>
                    </span>
                    <span className="text-sm font-mono text-foreground">
                      {fmt(r.totalPrice)}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/50">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmId(r.id)}
                        className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal && (
        <Modal
          title={modal === "add" ? "New Sales Report" : "Edit Report"}
          onClose={closeModal}
          wide
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={setF("date")}
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                Marketing Agent
              </label>
              <select
                value={form.agentId}
                onChange={setF("agentId")}
                disabled={role === "marketing_agent"}
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
              >
                <option value="">Select agent</option>
                {marketingAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted uppercase tracking-wide block mb-2">
                Buyer Type
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(["client", "walkin"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSaleType(t)}
                    className={`py-2.5 text-sm font-medium rounded-[var(--radius)] border transition-colors ${
                      saleType === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted hover:border-primary/30"
                    }`}
                  >
                    {t === "client" ? "Existing Client" : "Walk-in Customer"}
                  </button>
                ))}
              </div>

              {saleType === "client" ? (
                <select
                  value={form.clientId}
                  onChange={setF("clientId")}
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.district}
                    </option>
                  ))}
                </select>
              ) : (
                <div>
                  <input
                    value={form.customerName}
                    onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    placeholder="Customer name (optional)"
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <p className="text-[11px] text-muted mt-1.5">
                    Walk-in sales are always recorded as paid — no loan option, since there's no client record to track a balance against.
                  </p>
                </div>
              )}
            </div>
            {saleType === "client" && selectedClient && (
              <div className="sm:col-span-2 grid grid-cols-3 gap-3 p-3 bg-accent/50 rounded-[var(--radius)] border border-border">
                {[
                  { label: "District", value: selectedClient.district },
                  { label: "Sector", value: selectedClient.sector },
                  { label: "Center", value: selectedClient.center },
                ].map((f) => (
                  <div key={f.label} className="min-w-0">
                    <div className="text-[11px] text-muted uppercase tracking-wide mb-0.5">
                      {f.label}
                    </div>
                    <div className="text-sm text-foreground font-medium truncate">
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                Product
              </label>
              <select
                value={form.productId}
                onChange={setF("productId")}
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                Quantity (boxes)
              </label>
              <input
                type="number"
                min="1"
                value={form.qty}
                onChange={setF("qty")}
                placeholder="0"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {form.agentId && form.productId && (
                <p className={`text-[11px] mt-1.5 ${availableForSelectedProduct <= 0 ? "text-danger" : "text-muted"}`}>
                  {availableForSelectedProduct} box{availableForSelectedProduct === 1 ? "" : "es"} available
                  {piecesPerBoxForSelected ? ` (≈ ${availableForSelectedProduct * piecesPerBoxForSelected} pcs)` : ""}
                  {" · "}worth {fmt(availableForSelectedProduct * unitPrice)}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                Unit Price
              </label>
              <div className="px-3.5 py-2.5 text-sm border border-border/50 rounded-[var(--radius)] bg-background font-mono text-muted">
                {fmt(unitPrice)}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                Total Price
              </label>
              <div className="px-3.5 py-2.5 text-sm border border-primary/30 rounded-[var(--radius)] bg-primary/5 font-mono text-primary">
                {fmt(totalPrice)}
              </div>
            </div>
            {saleType === "client" && (
              <div className="sm:col-span-2 text-xs text-secondary bg-secondary/10 border border-secondary/20 rounded-[var(--radius-sm)] px-3 py-2">
                ⏳ Sales to existing clients are always recorded as a loan — record payments separately on the Payments page so each one is tracked clearly against its date.
              </div>
            )}
            {saleType === "walkin" && (
              <div className="sm:col-span-2 space-y-3">
                <div className="text-xs text-success bg-success/10 border border-success/20 rounded-[var(--radius-sm)] px-3 py-2">
                  ✓ This sale is paid in full right now — pick how the money came in.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["cash", "telephone"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setWalkinMode(m)}
                      className={`py-2.5 text-sm font-medium rounded-[var(--radius)] border transition-colors ${
                        walkinMode === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted hover:border-primary/30"
                      }`}
                    >
                      {m === "cash" ? "💵 Cash" : "📱 Mobile Money"}
                    </button>
                  ))}
                </div>
                {walkinMode === "telephone" && (
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Receiver Name</label>
                    <input
                      value={walkinReceiver}
                      onChange={(e) => setWalkinReceiver(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 text-sm border border-border rounded-[var(--radius)] hover:bg-border/30 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors"
              >
                {modal === "add" ? "Save Report" : "Update Report"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmId && (
        <Confirm
          message="Delete this report? The record will be permanently removed."
          onConfirm={async () => {
            await handleDelete(confirmId);
            setConfirmId(null);
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
