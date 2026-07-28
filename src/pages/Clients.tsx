import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  UserCheck,
  List,
  LayoutGrid,
  Phone,
  MapPin,
} from "lucide-react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { Modal } from "../components/Modal";
import { Confirm } from "../components/Confirm";
import { fmt } from "../lib/utils";
import { normalizeRole, type Client } from "../lib/types";
import Swal from "sweetalert2";
const EMPTY = {
  name: "",
  phone: "",
  district: "",
  sector: "",
  center: "",
  agentId: "",
};

type ViewMode = "list" | "grid";

export default function Clients() {
  const { state, dispatch } = useStore();
  const role = normalizeRole(state.user?.role);
  const canEdit = role === "manager" || role === "marketing_agent";
  const canDelete = role === "manager";
  const clients = state.clients.filter((c) => !c.deleted);

  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [districts, setDistricts] = useState<string[]>([]);
  const [sectorOptions, setSectorOptions] = useState<string[]>([]);

  useEffect(() => {
    async function loadDistricts() {
      const { data } = await supabase
        .from("rwanda_locations")
        .select("district")
        .order("district");
      if (data) setDistricts(Array.from(new Set(data.map((d) => d.district))));
    }
    loadDistricts();
  }, []);

  useEffect(() => {
    async function loadSectors() {
      if (!form.district) {
        setSectorOptions([]);
        return;
      }
      const { data } = await supabase
        .from("rwanda_locations")
        .select("sector")
        .eq("district", form.district)
        .order("sector");
      if (data) setSectorOptions(data.map((d) => d.sector));
    }
    loadSectors();
  }, [form.district]);

  const filtered = clients.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search);
    const matchDistrict = !districtFilter || c.district === districtFilter;
    return matchSearch && matchDistrict;
  });

  const getClientLoan = (clientId: string) => {
    const loans = state.agentReports.filter(
      (r) =>
        !r.deleted && r.clientId === clientId && r.paymentStatus === "loan",
    );
    const paid = state.payments
      .filter((p) => p.clientId === clientId)
      .reduce((s, p) => s + p.amount, 0);
    return Math.max(0, loans.reduce((s, r) => s + r.totalPrice, 0) - paid);
  };

  const openAdd = () => {
    setForm({
      ...EMPTY,
      agentId: role === "marketing_agent" ? state.user?.id || "" : "",
    });
    setFormError("");
    setModal("add");
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone,
      district: c.district,
      sector: c.sector,
      center: c.center,
      agentId: c.agentId || c.handlerId || "",
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

    const agentIdToSave = form.agentId || (role === "marketing_agent" ? state.user.id : null);

    if (modal === "add") {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: form.name.trim(),
          phone: form.phone.trim(),
          district: form.district || null,
          sector: form.sector || null,
          center: form.center.trim() || null,
          agent_id: agentIdToSave,
        })
        .select()
        .single();

      setSaving(false);
      if (error) {
        setFormError(error.message);
        return;
      }

      dispatch({
        type: "ADD_CLIENT",
        payload: {
          ...data,
          agentId: data.agent_id,
          handlerId: data.agent_id,
          deleted: false,
        },
      });

      try {
        await supabase.from("activity_logs").insert({
          actor_id: state.user.id,
          actor_name: state.user.name,
          action: "created",
          entity_type: "client",
          entity_id: data.id,
          entity_name: data.name,
        });
      } catch (e) {
        console.warn("activity_logs failure", e);
      }
    } else if (editing) {
      const { error } = await supabase
        .from("clients")
        .update({
          name: form.name.trim(),
          phone: form.phone.trim(),
          district: form.district || null,
          sector: form.sector || null,
          center: form.center.trim() || null,
          agent_id: agentIdToSave,
        })
        .eq("id", editing.id);

      setSaving(false);
      if (error) {
        setFormError(error.message);
        return;
      }

      dispatch({
        type: "UPDATE_CLIENT",
        payload: {
          ...editing,
          ...form,
          agentId: agentIdToSave || undefined,
          handlerId: agentIdToSave || undefined,
        },
      });

      try {
        await supabase.from("activity_logs").insert({
          actor_id: state.user.id,
          actor_name: state.user.name,
          action: "updated",
          entity_type: "client",
          entity_id: editing.id,
          entity_name: form.name.trim(),
        });
      } catch (e) {
        console.warn("activity_logs failure", e);
      }
    }
    closeModal();
  };

  const handleDelete = async (clientId: string) => {
    if (!state.user) return;
    const client = clients.find((c) => c.id === clientId);

    const { error } = await supabase
      .from("clients")
      .update({ deleted: true })
      .eq("id", clientId);

    if (error) {
      Swal.fire({
        icon: "error",
        title: "Could not remove client",
        text: error.message,
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    dispatch({ type: "DELETE_CLIENT", id: clientId });

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "deleted",
      entity_type: "client",
      entity_id: clientId,
      entity_name: client?.name ?? "unknown",
    });
  };

  const setF =
    (k: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Clients</h1>
          <p className="text-sm text-muted mt-0.5">
            {clients.length} registered client{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add Client</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div className="flex gap-3">
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="flex-1 sm:flex-none px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">All Districts</option>
            {districts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>

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
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16">
          <UserCheck size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">No clients match your search</p>
        </div>
      ) : view === "grid" ? (
        /* ---------- GRID VIEW ---------- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const loan = getClientLoan(c.id);
            return (
              <div
                key={c.id}
                className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-success text-sm font-bold">
                      {c.name.charAt(0)}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmId(c.id)}
                        className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-sm font-semibold text-foreground mb-2 truncate">
                  {c.name}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted font-mono mb-1.5">
                  <Phone size={11} className="flex-shrink-0" />
                  {c.phone}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted mb-3">
                  <MapPin size={11} className="flex-shrink-0" />
                  <span className="truncate">
                    {[c.district, c.sector, c.center]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </span>
                </div>
                <div className="pt-3 border-t border-border/60">
                  {loan > 0 ? (
                    <span className="text-sm font-mono text-secondary">
                      {fmt(loan)} outstanding
                    </span>
                  ) : (
                    <span className="text-xs text-success font-medium">
                      Settled
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
          {/* Table: sm and up */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {[
                    "Client Name",
                    "Phone",
                    "District",
                    "Sector",
                    "Center",
                    "Outstanding Loan",
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
                {filtered.map((c, i) => {
                  const loan = getClientLoan(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-success text-xs font-bold">
                              {c.name.charAt(0)}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-foreground whitespace-nowrap">
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted font-mono whitespace-nowrap">
                        {c.phone}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">
                        {c.district}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted whitespace-nowrap">
                        {c.sector}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted whitespace-nowrap">
                        {c.center}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {loan > 0 ? (
                          <span className="text-sm font-mono text-secondary">
                            {fmt(loan)}
                          </span>
                        ) : (
                          <span className="text-xs text-success font-medium">
                            Settled
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(c)}
                              className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setConfirmId(c.id)}
                              className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                            >
                              <Trash2 size={14} />
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

          {/* Stacked rows: below sm */}
          <div className="sm:hidden divide-y divide-border/50">
            {filtered.map((c) => {
              const loan = getClientLoan(c.id);
              return (
                <div key={c.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-success text-xs font-bold">
                      {c.name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {c.name}
                    </div>
                    <div className="text-xs text-muted font-mono mt-0.5">
                      {c.phone}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5 truncate">
                      {[c.district, c.sector, c.center]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </div>
                    <div className="mt-1.5">
                      {loan > 0 ? (
                        <span className="text-xs font-mono text-secondary">
                          {fmt(loan)} outstanding
                        </span>
                      ) : (
                        <span className="text-[11px] text-success font-medium">
                          Settled
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmId(c.id)}
                        className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Trash2 size={14} />
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
          title={modal === "add" ? "Register New Client" : "Edit Client"}
          onClose={closeModal}
          wide
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Full Name
              </label>
              <input
                value={form.name}
                onChange={setF("name")}
                placeholder="Client full name"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Phone Number
              </label>
              <input
                value={form.phone}
                onChange={setF("phone")}
                placeholder="+250 788 000 000"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                District
              </label>
              <select
                value={form.district}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    district: e.target.value,
                    sector: "",
                  }))
                }
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="">Select district</option>
                {districts.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Sector
              </label>
              <select
                value={form.sector}
                onChange={setF("sector")}
                disabled={!form.district}
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
              >
                <option value="">
                  {form.district ? "Select sector" : "Select district first"}
                </option>
                {sectorOptions.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Center / Market
              </label>
              <input
                value={form.center}
                onChange={setF("center")}
                placeholder="e.g. Gikondo Market"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Handler (Assigned Marketing Agent)
              </label>
              <select
                value={form.agentId}
                onChange={setF("agentId")}
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="">Select Marketing Agent (Handler)</option>
                {state.agents.filter(a => !a.deleted).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {formError && (
              <div className="sm:col-span-2 text-danger text-xs bg-danger/10 border border-danger/20 rounded-[var(--radius-sm)] px-3 py-2">
                {formError}
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
                className="flex-1 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 font-semibold transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : modal === "add" ? "Register Client" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmId && (
        <Confirm
          message={`Remove ${clients.find((c) => c.id === confirmId)?.name}? Historical records will be preserved.`}
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
