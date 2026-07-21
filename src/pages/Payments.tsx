import { useState } from "react";
import { Plus, Banknote, List, LayoutGrid } from "lucide-react";
import { useStore } from "../lib/store";
import { Modal } from "../components/Modal";
import { fmt, fmtDate, uid, today } from "../lib/utils";
import type { PaymentMode } from "../lib/types";

const EMPTY = {
  date: today(),
  clientId: "",
  amount: "",
  mode: "cash" as PaymentMode,
  bankId: "",
  receiverName: "",
};

type ViewMode = "list" | "grid";

export default function Payments() {
  const { state, dispatch } = useStore();
  const canEdit = state.user?.role === "manager";
  const clients = state.clients.filter((c) => !c.deleted);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [clientFilter, setClientFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [view, setView] = useState<ViewMode>("list");

  const filtered = state.payments
    .filter(
      (p) =>
        (!clientFilter || p.clientId === clientFilter) &&
        (!modeFilter || p.mode === modeFilter),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalReceived = filtered.reduce((s, p) => s + p.amount, 0);

  const getName = (id: string, list: { id: string; name: string }[]) =>
    list.find((i) => i.id === id)?.name ?? "—";

  const handleSave = () => {
    if (!form.clientId || !form.amount) return;
    dispatch({
      type: "ADD_PAYMENT",
      payload: {
        id: uid(),
        clientId: form.clientId,
        date: form.date,
        amount: Number(form.amount),
        mode: form.mode,
        bankId: form.mode === "bank" ? form.bankId : undefined,
        receiverName: form.mode === "telephone" ? form.receiverName : undefined,
      },
    });
    setForm(EMPTY);
    setModal(false);
  };

  const setF =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const modeLabel: Record<PaymentMode, string> = {
    cash: "💵 Cash",
    bank: "🏦 Bank Transfer",
    telephone: "📱 Mobile Money",
  };
  const modeBadgeClass: Record<PaymentMode, string> = {
    cash: "bg-success/10 text-success border border-success/20",
    bank: "bg-primary/10 text-primary border border-primary/20",
    telephone: "bg-secondary/10 text-secondary border border-secondary/20",
  };

  const reference = (p: (typeof filtered)[number]) => {
    if (p.mode === "bank" && p.bankId) return getName(p.bankId, state.banks);
    if (p.mode === "telephone" && p.receiverName)
      return `Receiver: ${p.receiverName}`;
    return "—";
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Payment Records</h1>
          <p className="text-sm text-muted mt-0.5">
            Track client payments by mode
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-2 bg-primary text-white text-sm px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Record Payment</span>
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="col-span-2 bg-primary/10 border border-primary/20 rounded-[var(--radius-lg)] p-5">
          <div className="text-xs text-primary uppercase tracking-wide mb-2">
            {clientFilter || modeFilter ? "Filtered Total" : "Total Received"}
          </div>
          <div className="text-xl sm:text-2xl text-primary font-mono">
            {fmt(totalReceived)}
          </div>
        </div>
        {(["cash", "bank", "telephone"] as const).map((mode) => {
          const modeTotal = filtered
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

      {/* Filters + view toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="grid grid-cols-2 sm:flex gap-3 flex-1">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
          >
            <option value="">All Modes</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="telephone">Mobile Money</option>
          </select>
        </div>

        <div className="flex items-center gap-0.5 bg-card border border-border rounded-[var(--radius)] p-1 flex-shrink-0 self-start">
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

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center py-16">
          <Banknote size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">No payment records yet</p>
        </div>
      ) : view === "grid" ? (
        /* ---------- GRID VIEW ---------- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full ${modeBadgeClass[p.mode]}`}
                >
                  {modeLabel[p.mode]}
                </span>
                <span className="text-xs text-muted font-mono">
                  {fmtDate(p.date)}
                </span>
              </div>
              <div className="text-sm text-foreground truncate mb-1">
                {getName(p.clientId, clients)}
              </div>
              <div className="text-xs text-muted mb-3 truncate">
                {reference(p)}
              </div>
              <div className="pt-3 border-t border-border/60">
                <span className="text-lg font-mono text-success">
                  {fmt(p.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ---------- LIST VIEW — table on sm+, stacked cards below sm ---------- */
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {["Date", "Client", "Amount", "Mode", "Reference"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left text-xs text-muted uppercase tracking-wide px-5 py-3 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""}`}
                  >
                    <td className="px-5 py-3.5 text-sm font-mono text-foreground whitespace-nowrap">
                      {fmtDate(p.date)}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-foreground whitespace-nowrap">
                      {getName(p.clientId, clients)}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-mono text-success">
                      {fmt(p.amount)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap ${modeBadgeClass[p.mode]}`}
                      >
                        {modeLabel[p.mode]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted whitespace-nowrap">
                      {reference(p)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stacked rows: below sm */}
          <div className="sm:hidden divide-y divide-border/50">
            {filtered.map((p) => (
              <div key={p.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {getName(p.clientId, clients)}
                  </span>
                  <span className="text-sm font-mono text-success">
                    {fmt(p.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full ${modeBadgeClass[p.mode]}`}
                  >
                    {modeLabel[p.mode]}
                  </span>
                  <span className="text-xs text-muted font-mono">
                    {fmtDate(p.date)}
                  </span>
                </div>
                {reference(p) !== "—" && (
                  <div className="text-xs text-muted mt-1">{reference(p)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title="Record Payment" onClose={() => setModal(false)} wide>
          <div className="space-y-4">
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
                  Client
                </label>
                <select
                  value={form.clientId}
                  onChange={setF("clientId")}
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                  Amount (RWF)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.amount}
                  onChange={setF("amount")}
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                  Payment Mode
                </label>
                <select
                  value={form.mode}
                  onChange={setF("mode")}
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="bank">🏦 Bank Transfer</option>
                  <option value="telephone">📱 Mobile Money</option>
                </select>
              </div>
            </div>

            {form.mode === "bank" && (
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                  Bank
                </label>
                <select
                  value={form.bankId}
                  onChange={setF("bankId")}
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="">Select bank</option>
                  {state.banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.mode === "telephone" && (
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                  Receiver Name
                </label>
                <input
                  value={form.receiverName}
                  onChange={setF("receiverName")}
                  placeholder="Name of mobile money receiver"
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setModal(false)}
                className="flex-1 py-2.5 text-sm border border-border rounded-[var(--radius)] hover:bg-border/30 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors"
              >
                Record Payment
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
