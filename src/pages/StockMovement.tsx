import { useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  Trash2,
  List,
  LayoutGrid,
  Printer,
  Download,
} from "lucide-react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { fmtDate, uid, today } from "../lib/utils";
import type { StockType } from "../lib/types";
import Swal from "sweetalert2";

// ============================================================================
// 🏢 COMPANY NAME (Edit this text anytime to change the company name on PDF & Excel reports)
// ============================================================================
// const COMPANY_NAME = "";

function lastBalance(
  movements: ReturnType<typeof useStore>["state"]["stockMovements"],
  productId: string,
) {
  const filtered = movements.filter((m) => m.productId === productId);
  return filtered.length ? filtered[filtered.length - 1].balance : 0;
}

const TYPE_LABELS: Record<StockType, string> = {
  production: "Production Stock",
  marketing_agent: "Agent Dispatch",
  customer_sale: "Customer Direct Sale",
  other: "Other Adjustment",
};

const MOVEMENT_TYPES: { value: StockType; label: string }[] = [
  { value: "production", label: "Production Stock" },
  { value: "marketing_agent", label: "Agent Dispatch" },
  { value: "customer_sale", label: "Customer Direct Sale" },
  { value: "other", label: "Other Adjustment" },
];

interface ProductItemRow {
  id: string;
  productId: string;
  unit: "box" | "piece";
  qty: string;
}

export default function StockMovement() {
  const { state, dispatch } = useStore();
  const userRole = state.user?.role;
  const canEdit = userRole === "manager" || userRole === "stock_agent";
  const products = state.products.filter((p) => !p.deleted);
  const agents = state.agents.filter((a) => !a.deleted);

  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [saving, setSaving] = useState(false);

  // Common Header Form Fields
  const [commonForm, setCommonForm] = useState({
    date: today(),
    type: "marketing_agent" as StockType,
    agentId: agents[0]?.id ?? "",
    location: "",
    isReturn: false,
  });

  // Multi-product items list
  const [items, setItems] = useState<ProductItemRow[]>([
    { id: uid(), productId: products[0]?.id ?? "", unit: "box", qty: "" },
  ]);

  const [productFilter, setProductFilter] = useState<"all" | string>("all");

  const movementLabel = (type: StockType) => TYPE_LABELS[type] ?? "Other";

  const agentName = (agentId: string) =>
    agents.find((a) => a.id === agentId)?.name ?? agentId;

  const getProductName = (prodId: string) =>
    products.find((p) => p.id === prodId)?.name ?? "Unknown Product";

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      { id: uid(), productId: products[0]?.id ?? "", unit: "box", qty: "" },
    ]);
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateItemRow = (
    id: string,
    field: keyof ProductItemRow,
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const filteredMovements = state.stockMovements
    .filter((m) => productFilter === "all" || m.productId === productFilter)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate items
    const validItems = items.filter((item) => {
      const q = parseFloat(item.qty);
      return item.productId && !isNaN(q) && q > 0;
    });

    if (validItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Missing Quantities",
        text: "Please enter a valid quantity for at least one product line.",
      });
      return;
    }

    setSaving(true);
    const isStockIn = commonForm.type === "production" || commonForm.isReturn;

    try {
      for (const item of validItems) {
        const qty = parseFloat(item.qty);
        const prod = products.find((p) => p.id === item.productId);
        const piecesPerBox = prod?.piecesPerBox ?? prod?.qtyPerBox ?? null;

        const prevBalance = lastBalance(state.stockMovements, item.productId);

        let boxesQty = qty;
        let baseQty = qty;

        if (item.unit === "piece") {
          baseQty = qty;
          boxesQty =
            piecesPerBox && piecesPerBox > 0
              ? parseFloat((qty / piecesPerBox).toFixed(3))
              : qty;
        } else {
          boxesQty = qty;
          baseQty = piecesPerBox ? qty * piecesPerBox : qty;
        }

        const stockIn = isStockIn ? boxesQty : 0;
        const stockOut = isStockIn ? 0 : boxesQty;
        const newBalance = parseFloat(
          (prevBalance + stockIn - stockOut).toFixed(3),
        );

        const { data, error } = await supabase
          .from("stock_movements")
          .insert({
            product_id: item.productId,
            date: commonForm.date,
            type: commonForm.type,
            agent_id:
              commonForm.type === "marketing_agent" && commonForm.agentId
                ? commonForm.agentId
                : null,
            location:
              commonForm.type === "marketing_agent"
                ? commonForm.location || null
                : null,
            is_return: commonForm.isReturn,
            unit: item.unit,
            entered_qty: qty,
            base_qty: baseQty,
            stock_in: stockIn,
            stock_out: stockOut,
            balance: newBalance,
            created_by: state.user?.name ?? "unknown",
          })
          .select("id")
          .single();

        if (error) throw error;

        dispatch({
          type: "ADD_STOCK_MOVEMENT",
          payload: {
            id: data.id,
            productId: item.productId,
            date: commonForm.date,
            type: commonForm.type,
            agentId:
              commonForm.type === "marketing_agent"
                ? commonForm.agentId
                : undefined,
            location:
              commonForm.type === "marketing_agent"
                ? commonForm.location
                : undefined,
            isReturn: commonForm.isReturn,
            unit: item.unit,
            enteredQty: qty,
            baseQty,
            stockIn,
            stockOut,
            balance: newBalance,
            createdBy: state.user?.name ?? "unknown",
          },
        });
      }

      Swal.fire({
        icon: "success",
        title: "Movements Saved",
        text: `Successfully recorded ${validItems.length} stock movement(s).`,
        timer: 1800,
        showConfirmButton: false,
      });

      // Reset items and close form
      setItems([
        { id: uid(), productId: products[0]?.id ?? "", unit: "box", qty: "" },
      ]);
      setShowForm(false);
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Save Failed",
        text: err.message || "Failed to record stock movement.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Export CSV Excel
  const handleExportCSV = () => {
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

    const rows = filteredMovements.map((m) => {
      const prodName = getProductName(m.productId);
      const agName = m.agentId ? agentName(m.agentId) : "—";
      const loc = m.location || "—";
      const stockInStr =
        m.stockIn > 0
          ? `${m.stockIn} ${m.unit === "piece" ? "pcs" : "boxes"}${m.isReturn ? " (Return)" : ""}`
          : "0";
      const stockOutStr =
        m.stockOut > 0
          ? `${m.stockOut} ${m.unit === "piece" ? "pcs" : "boxes"}`
          : "0";

      return [
        m.date,
        `"${prodName.replace(/"/g, '""')}"`,
        `"${movementLabel(m.type)}"`,
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
      `Stock_Movement_Report_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl text-foreground">
            Stock Movement Management
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Record multi-product stock production, agent dispatches, and returns
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors"
          >
            <Download size={14} />
            Export Excel
          </button> */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors"
          >
            <Printer size={14} />
            Print / PDF
          </button>
          {canEdit && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 bg-primary text-white text-xs px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors"
            >
              <Plus size={15} />
              <span>{showForm ? "Cancel" : "Record Stock Movement"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Printable Report Header */}
      <div className="hidden print:block mb-6 border-b border-border pb-4">
        {/* <div className="text-xl text-foreground uppercase tracking-wide">
          {COMPANY_NAME}
        </div> */}
        <div className="text-base text-primary mt-0.5">
          STOCK MOVEMENT REPORT
        </div>
        <div className="text-xs text-muted mt-1">
          Product: {productFilter === "all" ? "All Products" : getProductName(productFilter)} · Generated: {new Date().toLocaleString()}
        </div>
      </div>

      {/* Multi-Product Stock Movement Recording Form */}
      {showForm && canEdit && (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6 mb-6 shadow-sm no-print">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base text-foreground">
              Record Multi-Product Stock Movement
            </h3>
            <span className="text-xs text-muted">
              Add one or multiple products in a single dispatch/entry
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Common Header Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-accent/30 rounded-[var(--radius)] border border-border/60 mb-6">
              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                  Movement Date
                </label>
                <input
                  type="date"
                  value={commonForm.date}
                  onChange={(e) =>
                    setCommonForm((f) => ({ ...f, date: e.target.value }))
                  }
                  required
                  className="w-full px-3.5 py-2 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                  Movement Type
                </label>
                <select
                  value={commonForm.type}
                  onChange={(e) =>
                    setCommonForm((f) => ({
                      ...f,
                      type: e.target.value as StockType,
                    }))
                  }
                  className="w-full px-3.5 py-2 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {MOVEMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {commonForm.type === "marketing_agent" && (
                <>
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">
                      Marketing Agent
                    </label>
                    <select
                      value={commonForm.agentId}
                      onChange={(e) =>
                        setCommonForm((f) => ({
                          ...f,
                          agentId: e.target.value,
                        }))
                      }
                      className="w-full px-3.5 py-2 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                      Target Location
                    </label>
                    <input
                      value={commonForm.location}
                      onChange={(e) =>
                        setCommonForm((f) => ({
                          ...f,
                          location: e.target.value,
                        }))
                      }
                      placeholder="e.g. Gikondo Market / Kigali"
                      className="w-full px-3.5 py-2 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </>
              )}

              {commonForm.type === "marketing_agent" && (
                <div className="sm:col-span-2 lg:col-span-4 flex items-center pt-1">
                  <label className="flex items-center gap-2 cursor-pointer bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-[var(--radius)]">
                    <input
                      type="checkbox"
                      checked={commonForm.isReturn}
                      onChange={(e) =>
                        setCommonForm((f) => ({
                          ...f,
                          isReturn: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-xs text-emerald-800">
                      Agent Return (Restock items returned back to inventory)
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Product Item Lines */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted uppercase tracking-wider">
                  Product Lines
                </span>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus size={14} /> Add Product Line
                </button>
              </div>

              {items.map((item, idx) => {
                const prod = products.find((p) => p.id === item.productId);
                const piecesPerBox =
                  prod?.piecesPerBox ?? prod?.qtyPerBox ?? null;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 bg-card border border-border rounded-[var(--radius)] hover:border-primary/40 transition-colors"
                  >
                    <div className="text-xs text-muted w-6">
                      #{idx + 1}
                    </div>

                    {/* Product Selection */}
                    <div className="flex-1">
                      <select
                        value={item.productId}
                        onChange={(e) =>
                          updateItemRow(item.id, "productId", e.target.value)
                        }
                        className="w-full px-3 py-2 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock:{" "}
                            {lastBalance(state.stockMovements, p.id)} boxes)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Unit Toggle */}
                    <div className="flex items-center gap-1 bg-background p-1 border border-border rounded-[var(--radius)] w-36">
                      <button
                        type="button"
                        onClick={() => updateItemRow(item.id, "unit", "box")}
                        className={`flex-1 py-1 text-xs rounded-[var(--radius-sm)] transition-all ${
                          item.unit === "box"
                            ? "bg-primary text-white shadow-sm"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        Boxes
                      </button>
                      <button
                        type="button"
                        onClick={() => updateItemRow(item.id, "unit", "piece")}
                        className={`flex-1 py-1 text-xs rounded-[var(--radius-sm)] transition-all ${
                          item.unit === "piece"
                            ? "bg-primary text-white shadow-sm"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        Pcs
                      </button>
                    </div>

                    {/* Quantity Input */}
                    <div className="w-40">
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        value={item.qty}
                        onChange={(e) =>
                          updateItemRow(item.id, "qty", e.target.value)
                        }
                        placeholder={
                          item.unit === "box" ? "Box Qty" : "Piece Qty"
                        }
                        className="w-full px-3 py-2 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>

                    {/* Delete row */}
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(item.id)}
                        className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-xs border border-border rounded-[var(--radius)] hover:bg-accent/40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 text-xs bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving Movements..." : "Save All Movements"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product Filter Tabs + View Toggle */}
      <div className="flex items-center gap-3 mb-4 no-print">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1 scrollbar-hide">
          <button
            onClick={() => setProductFilter("all")}
            className={`px-4 py-2 text-xs rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
              productFilter === "all"
                ? "bg-primary text-white shadow-sm"
                : "bg-card border border-border text-muted hover:text-foreground"
            }`}
          >
            All Products
          </button>
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => setProductFilter(p.id)}
              className={`px-4 py-2 text-xs rounded-[var(--radius)] transition-colors whitespace-nowrap flex-shrink-0 ${
                productFilter === p.id
                  ? "bg-primary text-white shadow-sm"
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
            className={`p-1.5 rounded-[var(--radius-sm)] transition-colors ${
              view === "list"
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground"
            }`}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setView("grid")}
            title="Grid view"
            className={`p-1.5 rounded-[var(--radius-sm)] transition-colors ${
              view === "grid"
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground"
            }`}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* Movements Table / Cards Display */}
      {filteredMovements.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16">
          <p className="text-sm text-muted">No stock movements recorded yet</p>
        </div>
      ) : view === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 no-print">
          {filteredMovements.map((m) => (
            <div
              key={m.id}
              className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-foreground bg-background border border-border px-2.5 py-0.5 rounded-full">
                    {movementLabel(m.type)}
                  </span>
                  {m.isReturn && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wide">
                      Return
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted font-mono">
                  {fmtDate(m.date)}
                </span>
              </div>

              <div className="text-xs text-primary mb-2">
                {getProductName(m.productId)}
              </div>

              {m.agentId && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-foreground">
                    {agentName(m.agentId)}
                  </div>
                  {m.location && (
                    <div className="text-[11px] text-muted">{m.location}</div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-border/60">
                <div>
                  {m.stockIn > 0 ? (
                    <div className="flex items-center gap-1.5 text-success">
                      <ArrowDownCircle size={14} />
                      <span className="text-sm font-bold">
                        +{m.stockIn} boxes
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-danger">
                      <ArrowUpCircle size={14} />
                      <span className="text-sm font-mono">
                        -{m.stockOut} boxes
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted uppercase tracking-wide">
                    Balance
                  </div>
                  <div className="text-sm text-foreground">
                    {m.balance.toLocaleString()} boxes
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW (Formatted for display and PDF Export) */
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="text-left text-xs text-muted uppercase tracking-wider px-4 py-3">
                    Date
                  </th>
                  <th className="text-left text-xs text-muted uppercase tracking-wider px-4 py-3">
                    Products Name
                  </th>
                  <th className="text-left text-xs text-muted uppercase tracking-wider px-4 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs text-muted uppercase tracking-wider px-4 py-3">
                    Agent
                  </th>
                  <th className="text-left text-xs text-muted uppercase tracking-wider px-4 py-3">
                    Location
                  </th>
                  <th className="text-left text-xs text-muted uppercase tracking-wider px-4 py-3">
                    Stock In
                  </th>
                  <th className="text-left text-xs text-muted uppercase tracking-wider px-4 py-3">
                    Stock Out
                  </th>
                  <th className="text-right text-xs text-muted uppercase tracking-wider px-4 py-3">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${
                      i % 2 === 1 ? "bg-background/40" : ""
                    }`}
                  >
                    {/* 1. Date */}
                    <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">
                      {fmtDate(m.date)}
                    </td>

                    {/* 2. Products Name */}
                    <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">
                      {getProductName(m.productId)}
                    </td>

                    {/* 3. Type */}
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {movementLabel(m.type)}
                    </td>

                    {/* 4. Agent */}
                    <td className="px-4 py-3 text-xs font-medium text-foreground whitespace-nowrap">
                      {m.agentId ? agentName(m.agentId) : "—"}
                    </td>

                    {/* 5. Location */}
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {m.location || "—"}
                    </td>

                    {/* 6. Stock In (With Return Tag if agent return) */}
                    <td className="px-4 py-3 text-xs font-medium">
                      {m.stockIn > 0 ? (
                        <div className="inline-flex items-center gap-1.5 text-success">
                          <span>
                            +{m.unit === "piece" && m.enteredQty ? `${m.enteredQty} pcs` : `${m.stockIn} boxes`}
                          </span>
                          {m.isReturn && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wide">
                              Return
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {/* 7. Stock Out */}
                    <td className="px-4 py-3 text-xs font-medium">
                      {m.stockOut > 0 ? (
                        <span className="text-danger">
                          -{m.unit === "piece" && m.enteredQty ? `${m.enteredQty} pcs` : `${m.stockOut} boxes`}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {/* 8. Balance */}
                    <td className="px-4 py-3 text-xs text-right text-foreground whitespace-nowrap">
                      {m.balance.toLocaleString()} boxes
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-accent/50 text-xs">
                  <td colSpan={5} className="px-4 py-3 text-foreground">
                    TOTAL SUMMARY ({filteredMovements.length} RECORDS)
                  </td>
                  <td className="px-4 py-3 text-success">
                    +
                    {filteredMovements
                      .reduce((s, m) => s + m.stockIn, 0)
                      .toLocaleString()}{" "}
                    boxes
                  </td>
                  <td className="px-4 py-3 text-danger">
                    -
                    {filteredMovements
                      .reduce((s, m) => s + m.stockOut, 0)
                      .toLocaleString()}{" "}
                    boxes
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {filteredMovements.length > 0
                      ? `${filteredMovements[0].balance.toLocaleString()} boxes`
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
