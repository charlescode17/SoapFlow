import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Package,
  List,
  LayoutGrid,
} from "lucide-react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { Modal } from "../components/Modal";
import { Confirm } from "../components/Confirm";
import { fmt } from "../lib/utils";
import type { Product } from "../lib/types";
import Swal from "sweetalert2";

function currentStock(
  movements: ReturnType<typeof useStore>["state"]["stockMovements"],
  productId: string,
) {
  const filtered = movements.filter((m) => m.productId === productId);
  return filtered.length ? filtered[filtered.length - 1].balance : 0;
}

const EMPTY = {
  name: "",
  unitName: "piece",
  unitPrice: 0,
  hasBoxing: false,
  piecesPerBox: 20,
  boxPrice: 0,
  lowStockThreshold: 100,
};

type ViewMode = "list" | "grid";

export default function Products() {
  const { state, dispatch } = useStore();
  const canEdit = state.user?.role === "manager" || state.user?.role === "stock_agent";
  const canDelete = state.user?.role === "manager";
  const products = state.products.filter((p) => !p.deleted);

  const [view, setView] = useState<ViewMode>("list");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openAdd = () => {
    setForm(EMPTY);
    setFormError("");
    setModal("add");
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      unitName: p.unitName,
      unitPrice: p.unitPrice,
      hasBoxing: p.piecesPerBox !== null,
      piecesPerBox: p.piecesPerBox ?? 20,
      boxPrice: p.boxPrice ?? 0,
      lowStockThreshold: p.lowStockThreshold,
    });
    setFormError("");
    setModal("edit");
  };
  const closeModal = () => {
    setModal(null);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !state.user) return;
    setFormError("");
    setSaving(true);

    if (modal === "add") {
      const { data, error } = await supabase
        .from("products")
        .insert({
          name: form.name.trim(),
          unit_name: form.unitName.trim() || "piece",
          unit_price: form.unitPrice,
          pieces_per_box: form.hasBoxing ? form.piecesPerBox : null,
          box_price: form.hasBoxing ? form.boxPrice : null,
          low_stock_threshold: form.lowStockThreshold,
        })
        .select()
        .single();

      setSaving(false);
      if (error) {
        setFormError(error.message);
        return;
      }

      dispatch({
        type: "ADD_PRODUCT",
        payload: {
          id: data.id,
          name: data.name,
          unitName: data.unit_name,
          unitPrice: data.unit_price,
          piecesPerBox: data.pieces_per_box,
          boxPrice: data.box_price,
          lowStockThreshold: data.low_stock_threshold,
          deleted: false,
        },
      });

      await supabase.from("activity_logs").insert({
        actor_id: state.user.id,
        actor_name: state.user.name,
        action: "created",
        entity_type: "product",
        entity_id: data.id,
        entity_name: data.name,
      });
    } else if (editing) {
      const { error } = await supabase
        .from("products")
        .update({
          name: form.name.trim(),
          unit_name: form.unitName.trim() || "piece",
          unit_price: form.unitPrice,
          pieces_per_box: form.hasBoxing ? form.piecesPerBox : null,
          box_price: form.hasBoxing ? form.boxPrice : null,
          low_stock_threshold: form.lowStockThreshold,
        })
        .eq("id", editing.id);

      setSaving(false);
      if (error) {
        setFormError(error.message);
        return;
      }

      dispatch({
        type: "UPDATE_PRODUCT",
        payload: {
          ...editing,
          name: form.name.trim(),
          unitName: form.unitName.trim() || "piece",
          unitPrice: form.unitPrice,
          piecesPerBox: form.hasBoxing ? form.piecesPerBox : null,
          boxPrice: form.hasBoxing ? form.boxPrice : null,
          lowStockThreshold: form.lowStockThreshold,
        },
      });

      await supabase.from("activity_logs").insert({
        actor_id: state.user.id,
        actor_name: state.user.name,
        action: "updated",
        entity_type: "product",
        entity_id: editing.id,
        entity_name: form.name.trim(),
      });
    }
    closeModal();
  };

  const handleDelete = async (productId: string) => {
    if (!state.user) return;
    const product = products.find((p) => p.id === productId);

    const { error } = await supabase
      .from("products")
      .update({ deleted: true })
      .eq("id", productId);

    if (error) {
      Swal.fire({
        icon: "error",
        title: "Could not remove product",
        text: error.message,
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    dispatch({ type: "DELETE_PRODUCT", id: productId });

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "deleted",
      entity_type: "product",
      entity_id: productId,
      entity_name: product?.name ?? "unknown",
    });
  };

  const set =
    (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({
        ...f,
        [k]: k === "name" ? e.target.value : Number(e.target.value),
      }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Products</h1>
          <p className="text-sm text-muted mt-0.5">
            {products.length} product{products.length !== 1 ? "s" : ""} in
            catalogue
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add Product</span>
          </button>
        )}
      </div>

      {/* View toggle */}
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-0.5 bg-card border border-border rounded-[var(--radius)] p-1">
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

      {products.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16">
          <Package size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">No products added yet</p>
        </div>
      ) : view === "grid" ? (
        /* ---------- GRID VIEW ---------- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const stock = currentStock(state.stockMovements, p.id);
            const low = stock < p.lowStockThreshold;
            return (
              <div
                key={p.id}
                className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-[var(--radius)] bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Package size={16} className="text-primary" />
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setConfirmId(p.id)}
                          className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-sm font-semibold text-foreground truncate mb-1">
                  {p.name}
                </div>
                <div className="text-xs text-muted mb-3">
                  {p.qtyPerBox} bars/box · {fmt(p.pricePerBox)}/box
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border/60">
                  <span
                    className="text-sm font-mono"
                    style={{ color: low ? "#D65B4A" : "#3FA66B" }}
                  >
                    {stock.toLocaleString()} boxes
                  </span>
                  {low ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-secondary bg-secondary/10 border border-secondary/20 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={10} />
                      Low
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full">
                      ● In Stock
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ---------- LIST VIEW — table on sm+, stacked cards below sm ---------- */
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {[
                    "Product Name",
                    "Qty / Box",
                    "Price / Box",
                    "Current Stock",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-5 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                  {canEdit && (
                    <th className="text-right text-xs font-semibold text-muted uppercase tracking-wide px-5 py-3">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => {
                  const stock = currentStock(state.stockMovements, p.id);
                  const low = stock < p.lowStockThreshold;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === products.length - 1 ? "border-b-0" : ""}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-[var(--radius)] bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Package size={14} className="text-primary" />
                          </div>
                          <span className="text-sm font-medium text-foreground whitespace-nowrap">
                            {p.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted whitespace-nowrap">
                        {p.qtyPerBox} bars/box
                      </td>
                      <td className="px-5 py-4 text-sm font-mono text-foreground whitespace-nowrap">
                        {fmt(p.pricePerBox)}
                      </td>
                      <td
                        className="px-5 py-4 text-sm font-mono whitespace-nowrap"
                        style={{ color: low ? "#D65B4A" : "#3FA66B" }}
                      >
                        {stock.toLocaleString()} boxes
                      </td>
                      <td className="px-5 py-4">
                        {low ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-secondary bg-secondary/10 border border-secondary/20 px-2.5 py-1 rounded-full whitespace-nowrap">
                            <AlertTriangle size={11} />
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full whitespace-nowrap">
                            ● In Stock
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => setConfirmId(p.id)}
                                className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                              >
                                <Trash2 size={14} />
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

          {/* Stacked rows: below sm */}
          <div className="sm:hidden divide-y divide-border/50">
            {products.map((p) => {
              const stock = currentStock(state.stockMovements, p.id);
              const low = stock < p.lowStockThreshold;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-[var(--radius)] bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Package size={15} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {p.name}
                    </div>
                    <div className="text-xs text-muted">
                      {p.qtyPerBox} bars/box · {fmt(p.pricePerBox)}/box
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-xs font-mono"
                        style={{ color: low ? "#D65B4A" : "#3FA66B" }}
                      >
                        {stock.toLocaleString()} boxes
                      </span>
                      {low ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-secondary bg-secondary/10 border border-secondary/20 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle size={9} />
                          Low
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-success">
                          ● In Stock
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setConfirmId(p.id)}
                          className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Trash2 size={14} />
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
          title={modal === "add" ? "Add Product" : "Edit Product"}
          onClose={closeModal}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">Product Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Laundry Bar Soap"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">Unit Name</label>
              <input
                value={form.unitName}
                onChange={(e) => setForm((f) => ({ ...f, unitName: e.target.value }))}
                placeholder="e.g. bar, bottle, piece"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">Solo Price per {form.unitName || "unit"} (RWF)</label>
              <input
                type="number"
                value={form.unitPrice}
                onChange={(e) => setForm((f) => ({ ...f, unitPrice: Number(e.target.value) }))}
                placeholder="150"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.hasBoxing}
                onChange={(e) => setForm((f) => ({ ...f, hasBoxing: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-foreground">This product is also sold in boxes</span>
            </label>

            {form.hasBoxing && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">{form.unitName || "Units"} per Box</label>
                  <input
                    type="number"
                    value={form.piecesPerBox}
                    onChange={(e) => setForm((f) => ({ ...f, piecesPerBox: Number(e.target.value) }))}
                    placeholder="20"
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">Box Price (RWF)</label>
                  <input
                    type="number"
                    value={form.boxPrice}
                    onChange={(e) => setForm((f) => ({ ...f, boxPrice: Number(e.target.value) }))}
                    placeholder="5500"
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Low Stock Threshold (in {form.unitName || "units"})
              </label>
              <input
                type="number"
                value={form.lowStockThreshold}
                onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: Number(e.target.value) }))}
                placeholder="100"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {formError && (
              <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-[var(--radius-sm)] px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 text-sm border border-border rounded-[var(--radius)] hover:bg-border/30 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 font-semibold transition-colors disabled:opacity-60"
              >
                {saving
                  ? "Saving…"
                  : modal === "add"
                    ? "Add Product"
                    : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmId && (
        <Confirm
          message={`Remove "${products.find((p) => p.id === confirmId)?.name}" from your catalogue? Historical data will be preserved.`}
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
