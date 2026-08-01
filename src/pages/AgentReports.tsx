import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  FileText,
  List,
  LayoutGrid,
  X,
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

type SaleLine = {
  lineId: string;
  reportId?: string; // present when this line already exists in the DB (edit mode)
  productId: string;
  qty: string;
};

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

// A "sale" groups every product line sold together in one go. Legacy rows
// (created before multi-product sales existed) have no sale_group_id, so
// each one is its own group of one.
function groupKeyOf(r: AgentReport): string {
  return r.saleGroupId ?? r.id;
}

function groupReports(rows: AgentReport[]): { key: string; lines: AgentReport[] }[] {
  const map = new Map<string, AgentReport[]>();
  const order: string[] = [];
  for (const r of rows) {
    const key = groupKeyOf(r);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(r);
  }
  return order.map((key) => ({ key, lines: map.get(key)! }));
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
  const [confirmGroup, setConfirmGroup] = useState<AgentReport[] | null>(null);
  const [saving, setSaving] = useState(false);

  const defaultProduct = products[0];
  const [saleType, setSaleType] = useState<"client" | "walkin">("client");
  const [walkinMode, setWalkinMode] = useState<"cash" | "telephone">("cash");
  const [walkinReceiver, setWalkinReceiver] = useState(state.user?.name ?? "");
  const [form, setForm] = useState({
    date: today(),
    agentId: "",
    clientId: "",
    customerName: "",
  });
  const [lines, setLines] = useState<SaleLine[]>([]);
  // The full original rows for the sale being edited (so we can preserve
  // fields like createdBy when patching), and which of them are still kept.
  const [editingLines, setEditingLines] = useState<AgentReport[]>([]);
  const editingLineIds = editingLines.map((l) => l.id);
  const editingGroupKey = editingLines[0] ? groupKeyOf(editingLines[0]) : null;

  const selectedClient = clients.find((c) => c.id === form.clientId);

  const getName = (id: string, list: { id: string; name: string }[]) =>
    list.find((i) => i.id === id)?.name ?? "—";
  const getAgentName = (id?: string) =>
    marketingAgents.find((a) => a.id === id)?.name ?? "—";
  const getProductName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

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

  const groups = groupReports(filtered);
  const totalQty = filtered.reduce((s, r) => s + r.qty, 0);
  const totalAmt = filtered.reduce((s, r) => s + r.totalPrice, 0);

  // ---------- stock availability ----------
  const getAgentProductAvailable = (
    agentId: string,
    productId: string,
    excludeReportIds: string[] = [],
  ) => {
    const dispatched = state.stockMovements
      .filter((m) => m.type === "marketing_agent" && m.agentId === agentId && m.productId === productId && !m.isReturn)
      .reduce((s, m) => s + m.stockOut, 0);
    const returned = state.stockMovements
      .filter((m) => m.type === "marketing_agent" && m.agentId === agentId && m.productId === productId && m.isReturn)
      .reduce((s, m) => s + m.stockIn, 0);
    const distributed = state.agentReports
      .filter((r) => !r.deleted && r.agentId === agentId && r.productId === productId && !excludeReportIds.includes(r.id))
      .reduce((s, r) => s + r.qty, 0);
    return dispatched - returned - distributed;
  };

  // Availability for one line in the form, accounting for other lines in
  // the same sale that already claim boxes of the same product.
  const getLineAvailable = (line: SaleLine) => {
    if (!form.agentId || !line.productId) return 0;
    const base = getAgentProductAvailable(form.agentId, line.productId, editingLineIds);
    const claimedByOtherLines = lines
      .filter((l) => l.lineId !== line.lineId && l.productId === line.productId)
      .reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
    return base - claimedByOtherLines;
  };

  const lineDetails = lines.map((l) => {
    const product = products.find((p) => p.id === l.productId);
    const unitPrice = product?.pricePerBox ?? 0;
    const qty = parseFloat(l.qty || "0") || 0;
    return { ...l, product, unitPrice, qtyNum: qty, total: qty * unitPrice };
  });
  const grandTotal = lineDetails.reduce((s, l) => s + l.total, 0);
  const grandQty = lineDetails.reduce((s, l) => s + l.qtyNum, 0);

  // ---------- modal open/close ----------
  const openAdd = () => {
    setSaleType("client");
    setEditingLines([]);
    setForm({
      date: today(),
      agentId: role === "marketing_agent" ? state.user?.id || agents[0]?.id || "" : agents[0]?.id || "",
      clientId: clients[0]?.id || "",
      customerName: "",
    });
    setLines([{ lineId: crypto.randomUUID(), productId: defaultProduct?.id ?? "", qty: "" }]);
    setModal("add");
  };

  const openEdit = (groupLines: AgentReport[]) => {
    const first = groupLines[0];
    setEditingLines(groupLines);
    setSaleType(first.clientId ? "client" : "walkin");
    setForm({
      date: first.date,
      agentId: first.agentId,
      clientId: first.clientId ?? "",
      customerName: first.customerName ?? "",
    });
    setLines(
      groupLines.map((l) => ({
        lineId: crypto.randomUUID(),
        reportId: l.id,
        productId: l.productId,
        qty: l.qty.toString(),
      })),
    );
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditingLines([]);
    setLines([]);
  };

  // ---------- line management ----------
  const addLine = () => {
    const usedIds = lines.map((l) => l.productId);
    const nextProduct = products.find((p) => !usedIds.includes(p.id)) ?? products[0];
    setLines((ls) => [...ls, { lineId: crypto.randomUUID(), productId: nextProduct?.id ?? "", qty: "" }]);
  };
  const removeLine = (lineId: string) => setLines((ls) => ls.filter((l) => l.lineId !== lineId));
  const updateLine = (lineId: string, patch: Partial<SaleLine>) =>
    setLines((ls) => ls.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)));

  // ---------- save ----------
  const handleSave = async () => {
    if (!state.user || !form.agentId) return;
    if (saleType === "client" && !form.clientId) return;
    if (lines.length === 0 || lines.some((l) => !l.productId || !l.qty || parseFloat(l.qty) <= 0)) {
      Swal.fire({ icon: "warning", title: "Add at least one product", text: "Every product line needs a product and a quantity.", confirmButtonColor: "#2E9E8F" });
      return;
    }

    // Aggregate requested qty per product across all lines, then check stock once per product.
    const requestedByProduct = new Map<string, number>();
    for (const l of lineDetails) {
      requestedByProduct.set(l.productId, (requestedByProduct.get(l.productId) ?? 0) + l.qtyNum);
    }
    for (const [productId, qty] of requestedByProduct) {
      const available = getAgentProductAvailable(form.agentId, productId, editingLineIds);
      if (qty > available) {
        Swal.fire({
          icon: "warning",
          title: "Not enough stock on hand",
          text: `Dear agent you only have ${available} box${available === 1 ? "" : "es"} of ${getProductName(productId)}. You entered ${qty}.`,
          confirmButtonColor: "#2E9E8F",
        });
        return;
      }
    }

    setSaving(true);
    const paymentStatus: PaymentStatus = saleType === "walkin" ? "paid" : "loan";
    const buyerLabel = saleType === "client" ? getName(form.clientId, clients) : (form.customerName.trim() || "Walk-in customer");

    const basePayload = (l: (typeof lineDetails)[number]) => ({
      agent_id: form.agentId,
      client_id: saleType === "client" ? form.clientId : null,
      customer_name: saleType === "walkin" ? form.customerName.trim() || null : null,
      product_id: l.productId,
      date: form.date,
      qty: l.qtyNum,
      unit_price: l.unitPrice,
      total_price: l.total,
      payment_status: paymentStatus,
      created_by: state.user.name,
    });

    const toAgentReport = (d: any): AgentReport => ({
      id: d.id,
      agentId: d.agent_id,
      clientId: d.client_id,
      customerName: d.customer_name ?? undefined,
      productId: d.product_id,
      date: d.date,
      qty: Number(d.qty),
      unitPrice: Number(d.unit_price),
      totalPrice: Number(d.total_price),
      paymentStatus: d.payment_status,
      createdBy: d.created_by,
      saleGroupId: d.sale_group_id ?? undefined,
      deleted: false,
    });

    if (modal === "add") {
      const saleGroupId = crypto.randomUUID();
      const payloads = lineDetails.map((l) => ({ ...basePayload(l), sale_group_id: saleGroupId }));

      const { data, error } = await supabase.from("agent_reports").insert(payloads).select();
      if (error) {
        setSaving(false);
        Swal.fire({ icon: "error", title: "Could not save report", text: error.message, confirmButtonColor: "#2E9E8F" });
        return;
      }

      const newReports = (data ?? []).map(toAgentReport);
      newReports.forEach((nr) => dispatch({ type: "ADD_AGENT_REPORT", payload: nr }));

      await supabase.from("activity_logs").insert({
        actor_id: state.user.id,
        actor_name: state.user.name,
        action: "created",
        entity_type: "agent_report",
        entity_id: saleGroupId,
        entity_name: `${buyerLabel} — ${lineDetails.length} product${lineDetails.length === 1 ? "" : "s"} (${grandQty} boxes)`,
      });

      if (saleType === "walkin" && newReports.length) {
        const { data: payData, error: payError } = await supabase
          .from("payments")
          .insert({
            client_id: null,
            agent_id: form.agentId,
            report_id: newReports[0].id,
            date: form.date,
            amount: grandTotal,
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
    } else if (modal === "edit") {
      const keepIds = new Set(lines.filter((l) => l.reportId).map((l) => l.reportId as string));
      const toDelete = editingLineIds.filter((id) => !keepIds.has(id));

      // Update lines that already exist
      for (const l of lineDetails.filter((l) => l.reportId)) {
        const original = editingLines.find((o) => o.id === l.reportId);
        const { error } = await supabase.from("agent_reports").update(basePayload(l)).eq("id", l.reportId);
        if (error) {
          setSaving(false);
          Swal.fire({ icon: "error", title: "Could not update report", text: error.message, confirmButtonColor: "#2E9E8F" });
          return;
        }
        dispatch({
          type: "UPDATE_AGENT_REPORT",
          payload: {
            ...(original as AgentReport),
            agentId: form.agentId,
            clientId: saleType === "client" ? form.clientId : null,
            customerName: saleType === "walkin" ? form.customerName.trim() || undefined : undefined,
            productId: l.productId,
            date: form.date,
            qty: l.qtyNum,
            unitPrice: l.unitPrice,
            totalPrice: l.total,
            paymentStatus,
          },
        });
      }

      // Insert lines newly added while editing this sale
      const newLines = lineDetails.filter((l) => !l.reportId);
      if (newLines.length) {
        const payloads = newLines.map((l) => ({ ...basePayload(l), sale_group_id: editingGroupKey }));
        const { data, error } = await supabase.from("agent_reports").insert(payloads).select();
        if (error) {
          setSaving(false);
          Swal.fire({ icon: "error", title: "Could not add product to report", text: error.message, confirmButtonColor: "#2E9E8F" });
          return;
        }
        (data ?? []).map(toAgentReport).forEach((nr) => dispatch({ type: "ADD_AGENT_REPORT", payload: nr }));
      }

      // Soft-delete lines removed from this sale
      for (const id of toDelete) {
        await supabase.from("agent_reports").update({ deleted: true }).eq("id", id);
        dispatch({ type: "DELETE_AGENT_REPORT", id });
      }

      await supabase.from("activity_logs").insert({
        actor_id: state.user.id,
        actor_name: state.user.name,
        action: "updated",
        entity_type: "agent_report",
        entity_id: editingGroupKey,
        entity_name: `${buyerLabel} — ${lineDetails.length} product${lineDetails.length === 1 ? "" : "s"} (${grandQty} boxes)`,
      });
    }

    setSaving(false);
    closeModal();
  };

  const handleDeleteGroup = async (groupLines: AgentReport[]) => {
    for (const l of groupLines) {
      const { error } = await supabase.from("agent_reports").update({ deleted: true }).eq("id", l.id);
      if (error) {
        Swal.fire({ icon: "error", title: "Could not delete report", text: error.message, confirmButtonColor: "#2E9E8F" });
        return;
      }
      dispatch({ type: "DELETE_AGENT_REPORT", id: l.id });
    }

    if (state.user) {
      const first = groupLines[0];
      const client = clients.find((c) => c.id === first.clientId);
      await supabase.from("activity_logs").insert({
        actor_id: state.user.id,
        actor_name: state.user.name,
        action: "deleted",
        entity_type: "agent_report",
        entity_id: groupKeyOf(first),
        entity_name: `${client?.name ?? first.customerName ?? "Walk-in customer"} — ${groupLines.length} product${groupLines.length === 1 ? "" : "s"}`,
      });
    }
  };

  const setF =
    (k: "date" | "agentId" | "clientId" | "customerName") =>
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
          { label: "Sales", value: groups.length.toString() },
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

      {groups.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center py-16">
          <FileText size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">No reports match your filters</p>
        </div>
      ) : view === "grid" ? (
        /* ---------- GRID VIEW ---------- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(({ key, lines: groupLines }) => {
            const first = groupLines[0];
            const client = clients.find((c) => c.id === first.clientId);
            const qtySum = groupLines.reduce((s, r) => s + r.qty, 0);
            const totalSum = groupLines.reduce((s, r) => s + r.totalPrice, 0);
            return (
              <div
                key={key}
                className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <span
                    className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full ${
                      first.paymentStatus === "paid"
                        ? "bg-success/10 text-success border border-success/20"
                        : "bg-secondary/10 text-secondary border border-secondary/20"
                    }`}
                  >
                    {first.paymentStatus === "paid" ? "✓ Paid" : "Loan"}
                  </span>
                  <span className="text-xs text-muted font-mono">
                    {fmtDate(first.date)}
                  </span>
                </div>

                <div className="text-sm text-foreground truncate">
                  {getAgentName(first.agentId)}
                </div>
                <div className="text-xs text-muted mb-1">
                  → {getBuyerLabel(first)}
                </div>
                {client ? (
                  <div className="text-[11px] text-muted mb-3">
                    {client.district} · {client.sector}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted mb-3 italic">Walk-in sale</div>
                )}

                <div className="space-y-1 mb-3">
                  {groupLines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground truncate">
                        {getProductName(l.productId)} <span className="text-muted">× {l.qty}</span>
                      </span>
                      <span className="font-mono text-muted flex-shrink-0 ml-2">{fmt(l.totalPrice)}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/60 text-center">
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Total Qty
                    </div>
                    <div className="text-sm font-mono text-foreground">
                      {qtySum}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Total
                    </div>
                    <div className="text-sm font-mono text-foreground">
                      {fmt(totalSum)}
                    </div>
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-border/60">
                    <button
                      onClick={() => openEdit(groupLines)}
                      className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => setConfirmGroup(groupLines)}
                        className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ---------- LIST VIEW — table on lg+, stacked cards below lg ---------- */
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {[
                    "Date",
                    "Agent",
                    "Client",
                    "Location",
                    "Products",
                    "Qty",
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
                {groups.map(({ key, lines: groupLines }, i) => {
                  const first = groupLines[0];
                  const client = clients.find((c) => c.id === first.clientId);
                  const qtySum = groupLines.reduce((s, r) => s + r.qty, 0);
                  const totalSum = groupLines.reduce((s, r) => s + r.totalPrice, 0);
                  return (
                    <tr
                      key={key}
                      className={`border-b border-border/50 hover:bg-accent/40 transition-colors align-top ${i === groups.length - 1 ? "border-b-0" : ""}`}
                    >
                      <td className="px-4 py-3.5 text-sm text-foreground font-mono whitespace-nowrap">
                        {fmtDate(first.date)}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium text-foreground whitespace-nowrap">
                        {getAgentName(first.agentId)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">
                        {getBuyerLabel(first)}
                        {!first.clientId && (
                          <span className="ml-1.5 text-[10px] text-muted bg-accent/60 px-1.5 py-0.5 rounded-full">Walk-in</span>
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
                      <td className="px-4 py-3.5 text-xs text-foreground">
                        <div className="flex flex-col gap-0.5">
                          {groupLines.map((l) => (
                            <span key={l.id} className="whitespace-nowrap">
                              {getProductName(l.productId)} <span className="text-muted">× {l.qty}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-mono text-foreground">
                        {qtySum}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-mono text-foreground">
                        {fmt(totalSum)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap ${
                            first.paymentStatus === "paid"
                              ? "bg-success/10 text-success border border-success/20"
                              : "bg-secondary/10 text-secondary border border-secondary/20"
                          }`}
                        >
                          {first.paymentStatus === "paid" ? "✓ Paid" : "Loan"}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(groupLines)}
                              className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => setConfirmGroup(groupLines)}
                                className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
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
            {groups.map(({ key, lines: groupLines }) => {
              const first = groupLines[0];
              const client = clients.find((c) => c.id === first.clientId);
              const qtySum = groupLines.reduce((s, r) => s + r.qty, 0);
              const totalSum = groupLines.reduce((s, r) => s + r.totalPrice, 0);
              return (
                <div key={key} className="px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted font-mono">
                      {fmtDate(first.date)}
                    </span>
                    <span
                      className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full ${
                        first.paymentStatus === "paid"
                          ? "bg-success/10 text-success border border-success/20"
                          : "bg-secondary/10 text-secondary border border-secondary/20"
                      }`}
                    >
                      {first.paymentStatus === "paid" ? "✓ Paid" : "Loan"}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {getAgentName(first.agentId)}
                  </div>
                  <div className="text-xs text-muted mb-1">
                    → {getBuyerLabel(first)}
                  </div>
                  {client ? (
                    <div className="text-[11px] text-muted mb-2">
                      {client.district} · {client.sector}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted mb-2 italic">Walk-in sale</div>
                  )}
                  <div className="space-y-0.5 mb-2">
                    {groupLines.map((l) => (
                      <div key={l.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">
                          {getProductName(l.productId)} <span className="text-muted">× {l.qty}</span>
                        </span>
                        <span className="font-mono text-muted">{fmt(l.totalPrice)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                    <span className="text-xs text-muted">{qtySum} boxes total</span>
                    <span className="text-sm font-mono text-foreground">
                      {fmt(totalSum)}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/50">
                      <button
                        onClick={() => openEdit(groupLines)}
                        className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setConfirmGroup(groupLines)}
                          className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
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

            {/* ---------- Products (multi-line) ---------- */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted uppercase tracking-wide">
                  Products
                </label>
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                >
                  <Plus size={13} /> Add product
                </button>
              </div>

              <div className="space-y-2">
                {lineDetails.map((l) => {
                  const available = getLineAvailable(l);
                  return (
                    <div
                      key={l.lineId}
                      className="border border-border rounded-[var(--radius)] p-3 bg-background/40"
                    >
                      <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_110px_110px_auto] gap-2 items-start">
                        <select
                          value={l.productId}
                          onChange={(e) => updateLine(l.lineId, { productId: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary col-span-3 sm:col-span-1"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={l.qty}
                          onChange={(e) => updateLine(l.lineId, { qty: e.target.value })}
                          placeholder="Qty"
                          className="w-full px-3 py-2 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                        <div className="px-3 py-2 text-sm border border-border/50 rounded-[var(--radius)] bg-background font-mono text-muted whitespace-nowrap">
                          {fmt(l.total)}
                        </div>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(l.lineId)}
                            className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors self-start"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      {form.agentId && l.productId && (
                        <p className={`text-[11px] mt-1.5 ${available <= 0 ? "text-danger" : "text-muted"}`}>
                          {available} box{available === 1 ? "" : "es"} available · unit price {fmt(l.unitPrice)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between p-3.5 border border-primary/30 rounded-[var(--radius)] bg-primary/5">
              <div>
                <div className="text-[11px] text-muted uppercase tracking-wide">Grand Total</div>
                <div className="text-xs text-muted">{grandQty} boxes across {lines.length} product{lines.length === 1 ? "" : "s"}</div>
              </div>
              <div className="text-lg font-mono text-primary">{fmt(grandTotal)}</div>
            </div>

            {saleType === "client" && (
              <div className="sm:col-span-2 text-xs text-secondary bg-secondary/10 border border-secondary/20 rounded-[var(--radius-sm)] px-3 py-2">
                Sales to existing clients are always recorded as a loan — record payments separately on the Payments page so each one is tracked clearly against its date.
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
                disabled={saving}
                className="flex-1 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : modal === "add" ? "Save Report" : "Update Report"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmGroup && (
        <Confirm
          message={
            confirmGroup.length > 1
              ? `Delete this sale with ${confirmGroup.length} products? The records will be permanently removed.`
              : "Delete this report? The record will be permanently removed."
          }
          onConfirm={async () => {
            await handleDeleteGroup(confirmGroup);
            setConfirmGroup(null);
          }}
          onCancel={() => setConfirmGroup(null)}
        />
      )}
    </div>
  );
}