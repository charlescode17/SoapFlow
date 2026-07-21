import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  List,
  LayoutGrid,
  Phone,
  Calendar,
} from "lucide-react";
import { useStore } from "../lib/store";
import { Modal } from "../components/Modal";
import { Confirm } from "../components/Confirm";
import { fmtDate, uid, today } from "../lib/utils";
import type { Agent } from "../lib/types";

function PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted mt-0.5">{sub}</p>
      </div>
      {action}
    </div>
  );
}

const EMPTY: Omit<Agent, "id" | "createdAt" | "deleted"> = {
  name: "",
  phone: "",
};

type ViewMode = "list" | "grid";

export default function Agents() {
  const { state, dispatch } = useStore();
  const canEdit = state.user?.role === "manager";
  const agents = state.agents.filter((a) => !a.deleted);

  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.phone.includes(search),
  );

  const openAdd = () => {
    setForm(EMPTY);
    setModal("add");
  };
  const openEdit = (a: Agent) => {
    setEditing(a);
    setForm({ name: a.name, phone: a.phone });
    setModal("edit");
  };
  const closeModal = () => {
    setModal(null);
    setEditing(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (modal === "add") {
      dispatch({
        type: "ADD_AGENT",
        payload: { id: uid(), ...form, createdAt: today(), deleted: false },
      });
    } else if (editing) {
      dispatch({ type: "UPDATE_AGENT", payload: { ...editing, ...form } });
    }
    closeModal();
  };

  const handleDelete = () => {
    if (confirmId) dispatch({ type: "DELETE_AGENT", id: confirmId });
    setConfirmId(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="Marketing Agents"
        sub={`${agents.length} active agent${agents.length !== 1 ? "s" : ""}`}
        action={
          canEdit && (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Add Agent</span>
            </button>
          )
        }
      />

      {/* Search + view toggle */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
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

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16 text-center">
          <Users size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">
            {search ? "No agents match your search" : "No agents added yet"}
          </p>
        </div>
      ) : view === "grid" ? (
        /* ---------- GRID VIEW — cards at every breakpoint ---------- */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <div
              key={a.id}
              className="bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-sm font-bold">
                    {a.name.charAt(0)}
                  </span>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(a)}
                      className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmId(a.id)}
                      className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              <div className="text-sm font-semibold text-foreground mb-2 truncate">
                {a.name}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted font-mono mb-1">
                <Phone size={11} className="flex-shrink-0" />
                {a.phone}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Calendar size={11} className="flex-shrink-0" />
                Added {fmtDate(a.createdAt)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ---------- LIST VIEW — real table on sm+, stacked cards below sm ---------- */
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          {/* Table: sm and up */}
          <table className="w-full hidden sm:table">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-5 py-3">
                  Name
                </th>
                <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-5 py-3">
                  Phone
                </th>
                <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-5 py-3">
                  Added
                </th>
                {canEdit && (
                  <th className="text-right text-xs font-semibold text-muted uppercase tracking-wide px-5 py-3">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr
                  key={a.id}
                  className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary text-xs font-bold">
                          {a.name.charAt(0)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {a.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted font-mono">
                    {a.phone}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted">
                    {fmtDate(a.createdAt)}
                  </td>
                  {canEdit && (
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(a)}
                          className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmId(a.id)}
                          className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Stacked rows: below sm */}
          <div className="sm:hidden divide-y divide-border/50">
            {filtered.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-xs font-bold">
                    {a.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {a.name}
                  </div>
                  <div className="text-xs text-muted font-mono">{a.phone}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    Added {fmtDate(a.createdAt)}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(a)}
                      className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-[var(--radius-sm)] transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmId(a.id)}
                      className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal
          title={modal === "add" ? "Add Marketing Agent" : "Edit Agent"}
          onClose={closeModal}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Full Name
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Sabira Mukamana"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Phone Number
              </label>
              <input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="+250 788 000 000"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 text-sm border border-border rounded-[var(--radius)] hover:bg-border/30 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 font-semibold transition-colors"
              >
                {modal === "add" ? "Add Agent" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm delete */}
      {confirmId && (
        <Confirm
          message={`Are you sure you want to remove ${agents.find((a) => a.id === confirmId)?.name}? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
