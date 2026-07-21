import { useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  List,
  LayoutGrid,
} from "lucide-react";
import { useStore } from "../lib/store";
import { fmt, fmtDate, uid, today } from "../lib/utils";
import type { StockType } from "../lib/types";

function lastBalance(
  movements: ReturnType<typeof useStore>["state"]["stockMovements"],
  productId: string,
) {
  const filtered = movements.filter((m) => m.productId === productId);
  return filtered.length ? filtered[filtered.length - 1].balance : 0;
}

const MOVEMENT_TYPES: { value: StockType; label: string }[] = [
  { value: "production", label: "Production (Stock In)" },
  { value: "marketing_agent", label: "Marketing Agent" },
  { value: "other", label: "Other" },
];

type ViewMode = "list" | "grid";

export default function StockMovement() {
  const { state, dispatch } = useStore();
  const canEdit = state.user?.role === "manager";
  const products = state.products.filter((p) => !p.deleted);
  const agents = state.agents.filter((a) => !a.deleted);

  const [productFilter, setProductFilter] = useState(products[0]?.id ?? "");
  const [view, setView] = useState<ViewMode>("list");
  const [form, setForm] = useState({
    date: today(),
    productId: products[0]?.id ?? "",
    type: "production" as StockType,
    agentId: "",
    location: "",
    isReturn: false,
    qty: "",
  });
  const [showForm, setShowForm] = useState(false);

  const filteredMovements = state.stockMovements.filter(
    (m) => m.productId === productFilter,
  );

  const isStockIn =
    form.type === "production" ||
    (form.type === "marketing_agent" && form.isReturn);
  const agentName = (id: string) =>
    state.agents.find((a) => a.id === id)?.name ?? "—";

  const movementLabel = (type: StockType) =>
    type === "production"
      ? "Production"
      : type === "marketing_agent"
        ? "Marketing Agent"
        : "Other";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.qty || !form.productId) return;
    const qty = parseInt(form.qty);
    const prevBalance = lastBalance(state.stockMovements, form.productId);
    const stockIn = isStockIn ? qty : 0;
    const stockOut = isStockIn ? 0 : qty;
    dispatch({
      type: "ADD_STOCK_MOVEMENT",
      payload: {
        id: uid(),
        productId: form.productId,
        date: form.date,
        type: form.type,
        agentId: form.type === "marketing_agent" ? form.agentId : undefined,
        location: form.type === "marketing_agent" ? form.location : undefined,
        stockIn,
        stockOut,
        balance: prevBalance + stockIn - stockOut,
        createdBy: state.user?.name ?? "manager",
      },
    });
    setForm((f) => ({ ...f, qty: "", location: "", agentId: "" }));
    setShowForm(false);
  };

  const setF =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Stock Movement</h1>
          <p className="text-sm text-muted mt-0.5">
            Track production, dispatch, and returns
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 bg-primary text-white text-sm px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">
              {showForm ? "Cancel" : "Record Movement"}
            </span>
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && canEdit && (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6 mb-6">
          <h3 className="text-sm text-foreground mb-5">
            New Stock Movement
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={setF("date")}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
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
                  Description
                </label>
                <select
                  value={form.type}
                  onChange={setF("type")}
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  {MOVEMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {form.type === "marketing_agent" && (
                <>
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                      Agent
                    </label>
                    <select
                      value={form.agentId}
                      onChange={setF("agentId")}
                      className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    >
                      <option value="">Select agent</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                      Location
                    </label>
                    <input
                      value={form.location}
                      onChange={setF("location")}
                      placeholder="e.g. Kigali"
                      className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isReturn}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, isReturn: e.target.checked }))
                        }
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm text-foreground">
                        This is a return
                      </span>
                    </label>
                  </div>
                </>
              )}

              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                  Quantity (boxes) —{" "}
                  {isStockIn ? "📦 Stock In" : "📤 Stock Out"}
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.qty}
                  onChange={setF("qty")}
                  required
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border">
              <div className="flex-1 text-sm text-muted">
                Current balance for selected product:{" "}
                <span className="font-mono text-foreground">
                  {lastBalance(
                    state.stockMovements,
                    form.productId,
                  ).toLocaleString()}{" "}
                  boxes
                </span>
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors"
              >
                Record Movement
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product filter tabs + view toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1 scrollbar-hide">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => setProductFilter(p.id)}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
                productFilter === p.id
                  ? "bg-primary text-white"
                  : "bg-card border border-border text-muted hover:text-foreground"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 bg-card border border-border rounded-[var(--radius)] p-1 flex-shrink-0">
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

      {filteredMovements.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16">
          <p className="text-sm text-muted">No movements recorded yet</p>
        </div>
      ) : view === "grid" ? (
        /* ---------- GRID VIEW ---------- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMovements.map((m) => (
            <div
              key={m.id}
              className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs text-foreground bg-background border border-border px-2.5 py-1 rounded-full">
                  {movementLabel(m.type)}
                </span>
                <span className="text-xs text-muted font-mono">
                  {fmtDate(m.date)}
                </span>
              </div>

              {m.agentId && (
                <div className="mb-3">
                  <div className="text-sm font-medium text-foreground">
                    {agentName(m.agentId)}
                  </div>
                  {m.location && (
                    <div className="text-xs text-muted">{m.location}</div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-border/60">
                <div>
                  {m.stockIn > 0 ? (
                    <div className="flex items-center gap-1.5 text-success">
                      <ArrowDownCircle size={14} />
                      <span className="text-sm font-mono">
                        +{m.stockIn}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-danger">
                      <ArrowUpCircle size={14} />
                      <span className="text-sm font-mono">
                        -{m.stockOut}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted uppercase tracking-wide">
                    Balance
                  </div>
                  <div className="text-sm font-mono text-foreground">
                    {m.balance.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ---------- LIST VIEW — table on sm+, stacked cards below sm ---------- */
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          {/* Table: sm and up */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {[
                    "Date",
                    "Description",
                    "Agent / Location",
                    "Stock In / Return",
                    "Stock Out",
                    "Balance",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs text-muted uppercase tracking-wide px-5 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === filteredMovements.length - 1 ? "border-b-0" : ""}`}
                  >
                    <td className="px-5 py-3.5 text-sm text-foreground font-mono whitespace-nowrap">
                      {fmtDate(m.date)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">
                      {movementLabel(m.type)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted">
                      {m.agentId ? (
                        <div>
                          <div className="font-medium text-foreground whitespace-nowrap">
                            {agentName(m.agentId)}
                          </div>
                          {m.location && (
                            <div className="text-xs">{m.location}</div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {m.stockIn > 0 ? (
                        <div className="flex items-center gap-1.5 text-success">
                          <ArrowDownCircle size={14} />
                          <span className="text-sm font-mono">
                            +{m.stockIn}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted text-sm">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {m.stockOut > 0 ? (
                        <div className="flex items-center gap-1.5 text-danger">
                          <ArrowUpCircle size={14} />
                          <span className="text-sm font-mono">
                            -{m.stockOut}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted text-sm">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-mono text-foreground whitespace-nowrap">
                      {m.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stacked rows: below sm */}
          <div className="sm:hidden divide-y divide-border/50">
            {filteredMovements.map((m) => (
              <div key={m.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground bg-background border border-border px-2 py-0.5 rounded-full">
                    {movementLabel(m.type)}
                  </span>
                  <span className="text-xs text-muted font-mono">
                    {fmtDate(m.date)}
                  </span>
                </div>
                {m.agentId && (
                  <div className="mb-2">
                    <div className="text-sm font-medium text-foreground">
                      {agentName(m.agentId)}
                    </div>
                    {m.location && (
                      <div className="text-xs text-muted">{m.location}</div>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  {m.stockIn > 0 ? (
                    <div className="flex items-center gap-1.5 text-success">
                      <ArrowDownCircle size={14} />
                      <span className="text-sm font-mono">+{m.stockIn}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-danger">
                      <ArrowUpCircle size={14} />
                      <span className="text-sm font-mono">-{m.stockOut}</span>
                    </div>
                  )}
                  <span className="text-xs text-muted">
                    Balance:{" "}
                    <span className="font-mono">
                      {m.balance.toLocaleString()}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
