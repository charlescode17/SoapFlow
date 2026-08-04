import { useState, useMemo } from "react";
import { Plus, Banknote, Receipt } from "lucide-react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { fmt, fmtDate, today } from "../lib/utils";
import { normalizeRole, type PaymentMode } from "../lib/types";
import Swal from "sweetalert2";

export default function Payments() {
  const { state, dispatch } = useStore();
  const role = normalizeRole(state.user?.role);
  const canRecord = role === "manager" || role === "marketing_agent";

  const activeClients = state.clients.filter((c) => !c.deleted);
  const activeAgents = state.agents.filter((a) => !a.deleted);
  const loanReports = state.agentReports.filter(
    (r) => !r.deleted && r.paymentStatus === "loan",
  );

  const getPaidForReport = (reportId: string) =>
    state.payments
      .filter((p) => p.reportId === reportId)
      .reduce((s, p) => s + p.amount, 0);

  /* ── Agent resolution ─────────────────────────────────────── */
  const isAgent = role === "marketing_agent";
  const [pickedAgentId, setPickedAgentId] = useState(activeAgents[0]?.id ?? "");
  const effectiveAgentId = isAgent ? state.user?.id ?? "" : pickedAgentId;

  const agentClients = activeClients.filter(
    (c) => c.agentId === effectiveAgentId || c.handlerId === effectiveAgentId,
  );
  const clientOptions = isAgent || pickedAgentId ? agentClients : activeClients;

  /* ── Payment form state ───────────────────────────────────── */
  const [clientId, setClientId] = useState("");
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [bankId, setBankId] = useState("");
  const [receiverName, setReceiverName] = useState(state.user?.name ?? "");
  const [saving, setSaving] = useState(false);

  const unpaidReports = useMemo(() => {
    if (!clientId) return [];
    return loanReports
      .filter((r) => r.clientId === clientId)
      .map((r) => ({ report: r, remaining: r.totalPrice - getPaidForReport(r.id) }))
      .filter((r) => r.remaining > 0.01)
      .sort((a, b) => a.report.date.localeCompare(b.report.date));
  }, [clientId, loanReports, state.payments]);

  const selectedTotal = useMemo(
    () =>
      unpaidReports
        .filter((r) => selectedReportIds.includes(r.report.id))
        .reduce((s, r) => s + r.remaining, 0),
    [unpaidReports, selectedReportIds],
  );

  const getProductName = (id: string) =>
    state.products.find((p) => p.id === id)?.name ?? "—";
  const getClientName = (id: string) =>
    activeClients.find((c) => c.id === id)?.name ?? "—";

  const getBankName = (id?: string) =>
    id ? state.banks.find((b) => b.id === id)?.name ?? "—" : "—";

  const selectClient = (id: string) => {
    setClientId(id);
    setSelectedReportIds([]);
    setAmount("");
  };

  const toggleReportSelection = (id: string) => {
    setSelectedReportIds((prev) => {
      const next = prev.includes(id) ? prev.filter((rid) => rid !== id) : [...prev, id];
      const newTotal = unpaidReports
        .filter((r) => next.includes(r.report.id))
        .reduce((s, r) => s + r.remaining, 0);
      setAmount((prevAmount) => {
        const numPrev = Number(prevAmount) || 0;
        if (next.length === 0) return "";
        return numPrev > 0 && numPrev <= newTotal ? prevAmount : String(newTotal);
      });
      return next;
    });
  };

  const resetPaymentForm = () => {
    setClientId("");
    setSelectedReportIds([]);
    setAmount("");
    setDate(today());
    setMode("cash");
    setBankId("");
    setReceiverName(state.user?.name ?? "");
  };

  
const handleConfirmPayment = async () => {
    if (!clientId || selectedReportIds.length === 0 || !amount || !state.user || !effectiveAgentId) return;
    const user = state.user;
    const numAmount = Number(amount);
    if (numAmount <= 0) return;

    // Never let a payment exceed what's actually owed on the selected dates.
    const targets = unpaidReports
      .filter((r) => selectedReportIds.includes(r.report.id))
      .sort((a, b) => a.report.date.localeCompare(b.report.date)); // oldest first
    const maxPayable = targets.reduce((s, r) => s + r.remaining, 0);
    const amountToApply = Math.min(numAmount, maxPayable);
    if (amountToApply <= 0) return;

    // Split the payment across the selected loans, oldest date first, so
    // one payment can clear several dates at once.
    let remainingToAllocate = amountToApply;
    const allocations = targets
      .map((r) => {
        if (remainingToAllocate <= 0) return null;
        const portion = Math.min(r.remaining, remainingToAllocate);
        remainingToAllocate -= portion;
        return { reportId: r.report.id, portion };
      })
      .filter((a): a is { reportId: string; portion: number } => a !== null && a.portion > 0);

    setSaving(true);
    const payloads = allocations.map((a) => ({
      client_id: clientId,
      agent_id: effectiveAgentId,
      report_id: a.reportId,
      date,
      amount: a.portion,
      mode,
      bank_id: mode === "bank" ? bankId || null : null,
      receiver_name: mode === "telephone" || mode === "bank" ? receiverName || null : null,
      created_by: user.name,
    }));

    const { data, error } = await supabase.from("payments").insert(payloads).select();
    setSaving(false);

    if (error) {
      Swal.fire({ icon: "error", title: "Could not record payment", text: error.message, confirmButtonColor: "#2E9E8F" });
      return;
    }

    (data ?? []).forEach((d) =>
      dispatch({
        type: "ADD_PAYMENT",
        payload: {
          id: d.id,
          clientId: d.client_id,
          agentId: d.agent_id,
          reportId: d.report_id,
          date: d.date,
          amount: Number(d.amount),
          mode: d.mode,
          bankId: d.bank_id ?? undefined,
          receiverName: d.receiver_name ?? undefined,
        },
      }),
    );

    await supabase.from("activity_logs").insert({
      actor_id: user.id,
      actor_name: user.name,
      action: "created",
      entity_type: "payment",
      entity_name: `${getClientName(clientId)} — ${fmt(amountToApply)} (${mode})`,
    });

    Swal.fire({
      icon: "success",
      title: allocations.length > 1 ? `Payment recorded across ${allocations.length} dates` : "Payment recorded",
      timer: 1400,
      showConfirmButton: false,
    });
    resetPaymentForm();
  };
  /* ── Expense (depense) form state ─────────────────────────── */
  const [expName, setExpName] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expDate, setExpDate] = useState(today());
  const [expSaving, setExpSaving] = useState(false);

  const handleAddExpense = async () => {
    if (!expName.trim() || !expAmount || !state.user || !effectiveAgentId) return;
    setExpSaving(true);
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        agent_id: effectiveAgentId,
        date: expDate,
        name: expName.trim(),
        amount: Number(expAmount),
        created_by: state.user.name,
      })
      .select()
      .single();
    setExpSaving(false);

    if (error) {
      Swal.fire({ icon: "error", title: "Could not add expense", text: error.message, confirmButtonColor: "#2E9E8F" });
      return;
    }

    dispatch({
      type: "ADD_EXPENSE",
      payload: {
        id: data.id,
        agentId: data.agent_id,
        date: data.date,
        name: data.name,
        amount: Number(data.amount),
        createdBy: data.created_by,
      },
    });

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "created",
      entity_type: "expense",
      entity_id: data.id,
      entity_name: `${data.name} — ${fmt(Number(data.amount))}`,
    });

    setExpName("");
    setExpAmount("");
  };

  /* ── Day-grouped report ───────────────────────────────────── */
  const reportPayments = isAgent
    ? state.payments.filter((p) => p.agentId === effectiveAgentId)
    : pickedAgentId
      ? state.payments.filter((p) => p.agentId === pickedAgentId)
      : state.payments;
  const reportExpenses = isAgent
    ? state.expenses.filter((e) => e.agentId === effectiveAgentId)
    : pickedAgentId
      ? state.expenses.filter((e) => e.agentId === pickedAgentId)
      : state.expenses;

  const dayKeys = Array.from(
    new Set([...reportPayments.map((p) => p.date), ...reportExpenses.map((e) => e.date)]),
  ).sort((a, b) => b.localeCompare(a));

  const totals = {
    cash: reportPayments.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0),
    bank: reportPayments.filter((p) => p.mode === "bank").reduce((s, p) => s + p.amount, 0),
    telephone: reportPayments.filter((p) => p.mode === "telephone").reduce((s, p) => s + p.amount, 0),
    expense: reportExpenses.reduce((s, e) => s + e.amount, 0),
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl font-bold text-foreground">Payments</h1>
        <p className="text-sm text-muted mt-0.5">Record client payments and daily expenses</p>
      </div>

      {!canRecord ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] py-16 text-center text-sm text-muted">
          You don't have permission to record payments.
        </div>
      ) : (
        <>
          {/* Agent picker — manager only */}
          {!isAgent && (
            <div className="mb-5 max-w-xs">
              <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                Marketing Agent
              </label>
              <select
                value={pickedAgentId}
                onChange={(e) => {
                  setPickedAgentId(e.target.value);
                  selectClient("");
                }}
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select agent</option>
                {activeAgents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
            {/* ── Record Payment card ── */}
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Banknote size={16} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Record Payment</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Client</label>
                  <select
                    value={clientId}
                    onChange={(e) => selectClient(e.target.value)}
                    disabled={!isAgent && !pickedAgentId}
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  >
                    <option value="">Select client</option>
                    {clientOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {clientId && (
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                      Unpaid Dates — select one or more
                    </label>
                    {unpaidReports.length === 0 ? (
                      <div className="text-xs text-success bg-success/10 border border-success/20 rounded-[var(--radius-sm)] px-3 py-2">
                        This client has no outstanding balance
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto border border-border rounded-[var(--radius)] p-2">
                        {unpaidReports.map(({ report, remaining }) => (
                          <label
                            key={report.id}
                            className="flex items-center gap-2.5 text-sm px-2 py-2 rounded-[var(--radius-sm)] hover:bg-accent/40 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedReportIds.includes(report.id)}
                              onChange={() => toggleReportSelection(report.id)}
                              className="accent-primary"
                            />
                            <span className="flex-1 text-foreground">
                              {fmtDate(report.date)} — {getProductName(report.productId)}
                            </span>
                            <span className="font-mono text-secondary">{fmt(remaining)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedReportIds.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Amount (RWF)</label>
                        <input
                          type="number"
                          min="1"
                          max={selectedTotal}
                          value={amount}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            setAmount(v > selectedTotal ? String(selectedTotal) : e.target.value);
                          }}
                          className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <p className="text-[11px] text-muted mt-1">
                          Max {fmt(selectedTotal)} across {selectedReportIds.length} selected date{selectedReportIds.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Payment Date</label>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted uppercase tracking-wide block mb-2">Payment Mode</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["cash", "bank", "telephone"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMode(m)}
                            className={`py-2 text-xs font-medium rounded-[var(--radius)] border transition-colors ${
                              mode === m
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted hover:border-primary/30"
                            }`}
                          >
                            {m === "cash" ? "💵 Cash" : m === "bank" ? "🏦 Bank" : "📱 Mobile"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {mode === "bank" && (
                      <div>
                        <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Bank</label>
                        <select
                          value={bankId}
                          onChange={(e) => setBankId(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">Select bank</option>
                          {state.banks.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {mode === "bank" && (
                      <div>
                        <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                          Name of Person Who Made the Transfer
                        </label>
                        <input
                          value={receiverName}
                          onChange={(e) => setReceiverName(e.target.value)}
                          placeholder="e.g. client's name or agent's name"
                          className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    )}

                    {mode === "telephone" && (
                      <div>
                        <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Receiver Name</label>
                        <input
                          value={receiverName}
                          onChange={(e) => setReceiverName(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    )}

                    <button
                      onClick={handleConfirmPayment}
                      disabled={saving || !amount || (mode === "bank" && !receiverName.trim())}
                      className="w-full py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {saving ? "Confirming…" : "Confirm Payment"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Depense (expense) card ── */}
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Receipt size={16} className="text-secondary" />
                <h3 className="text-sm font-semibold text-foreground">Log Expense (Depense)</h3>
              </div>

              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Expense Name</label>
                  <input
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    placeholder="e.g. Moto transport"
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Amount</label>
                    <input
                      type="number"
                      min="1"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Date</label>
                    <input
                      type="date"
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddExpense}
                  disabled={expSaving || !expName.trim() || !expAmount}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm bg-secondary/10 text-secondary border border-secondary/20 rounded-[var(--radius)] hover:bg-secondary/20 transition-colors disabled:opacity-60"
                >
                  <Plus size={14} /> {expSaving ? "Adding…" : "Add Expense"}
                </button>
              </div>

              <div className="pt-4 border-t border-border/60">
                <div className="text-xs text-muted uppercase tracking-wide mb-2">
                  Recent expenses {expDate === today() ? "today" : `on ${fmtDate(expDate)}`}
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {reportExpenses.filter((e) => e.date === expDate).length === 0 ? (
                    <p className="text-xs text-muted">No expenses logged for this date</p>
                  ) : (
                    reportExpenses
                      .filter((e) => e.date === expDate)
                      .map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-xs">
                          <span className="text-foreground">{e.name}</span>
                          <span className="font-mono text-secondary">{fmt(e.amount)}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Summary strip ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {[
              { label: "Cash", value: totals.cash },
              { label: "Bank", value: totals.bank },
              { label: "Mobile Money", value: totals.telephone },
              { label: "Depense", value: totals.expense },
            ].map((t) => (
              <div key={t.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-4">
                <div className="text-xs text-muted mb-1.5">{t.label}</div>
                <div className="text-base font-mono text-foreground">{fmt(t.value)}</div>
              </div>
            ))}
          </div>

          {/* ── Day-grouped report ── */}
          <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Daily Payment & Expense Report</h3>
            </div>

            {dayKeys.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted">No records yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px]">
                  <thead>
                        <tr className="border-b border-border bg-background/50">
                          {["Client / Expense", "Cash", "Bank", "Bank Name", "Mobile", "Receiver", "Depense", "Amount", "Versaiment"].map((h) => (
                        <th key={h} className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dayKeys.map((date) => {
                      const dayPayments = reportPayments.filter((p) => p.date === date);
                      const dayExpenses = reportExpenses.filter((e) => e.date === date);
                      const dayCash = dayPayments.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0);
                      const dayBank = dayPayments.filter((p) => p.mode === "bank").reduce((s, p) => s + p.amount, 0);
                      const dayTel = dayPayments.filter((p) => p.mode === "telephone").reduce((s, p) => s + p.amount, 0);
                      const dayExp = dayExpenses.reduce((s, e) => s + e.amount, 0);
                      const dayVersaiment = dayCash - dayExp;

                      return (
                        <FragmentDay key={date}>
                          <tr className="bg-accent/30">
                            <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-foreground">
                              {fmtDate(date)}
                            </td>
                          </tr>
                          {dayPayments.map((p) => (
                            <tr key={p.id} className="border-b border-border/40">
                              <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{getClientName(p.clientId)}</td>
                              <td className="px-3 py-2 text-xs font-mono text-success">{p.mode === "cash" ? fmt(p.amount) : "—"}</td>
                              <td className="px-3 py-2 text-xs font-mono text-primary">{p.mode === "bank" ? fmt(p.amount) : "—"}</td>
                              <td className="px-3 py-2 text-xs text-muted">{p.mode === "bank" ? getBankName(p.bankId) : "—"}</td>
                              <td className="px-3 py-2 text-xs font-mono text-secondary">{p.mode === "telephone" ? fmt(p.amount) : "—"}</td>
                              <td className="px-3 py-2 text-xs text-muted">{p.mode === "telephone" || p.mode === "bank" ? (p.receiverName || "—") : "—"}</td>
                              <td className="px-3 py-2 text-xs text-muted">—</td>
                              <td className="px-3 py-2 text-xs text-muted">—</td>
                              <td className="px-3 py-2 text-xs text-muted">—</td>
                            </tr>
                          ))}
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
                              <td className="px-3 py-2 text-xs text-muted">—</td>
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
                            <td className="px-3 py-2 sticky right-0 bg-accent/50">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white px-3 py-1 rounded-full bg-gradient-to-r from-primary via-emerald-500 to-primary bg-[length:200%_auto] shadow-sm shadow-primary/30">
                                💰 {fmt(dayVersaiment)}
                              </span>
                            </td>
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

// Small helper so we can group <tr> rows per day without an extra wrapping element
function FragmentDay({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}