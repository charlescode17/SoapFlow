import { useState, useEffect } from "react";
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
  Eye,
  EyeOff,
} from "lucide-react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { Modal } from "../components/Modal";
import { fmtDate } from "../lib/utils";
import Swal from "sweetalert2";

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

type AgentRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

type ViewMode = "list" | "grid";

const EMPTY_ADD = { name: "", email: "", password: "", phone: "" };
const EMPTY_EDIT = { name: "", phone: "" };

export default function Agents() {
  const { state } = useStore();
  const canEdit = state.user?.role === "manager";

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "marketing_agent")
      .order("name");
    if (!error && data) setAgents(data as AgentRow[]);
    setLoading(false);
  }

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.phone ?? "").includes(search),
  );

  const openAdd = () => {
    setAddForm(EMPTY_ADD);
    setFormError("");
    setModal("add");
  };
  const openEdit = (a: AgentRow) => {
    setEditing(a);
    setEditForm({ name: a.name, phone: a.phone ?? "" });
    setFormError("");
    setModal("edit");
  };
  const closeModal = () => {
    setModal(null);
    setEditing(null);
  };

  async function handleAddAgent() {
    setFormError("");
    if (
      !addForm.name.trim() ||
      !addForm.email.trim() ||
      !addForm.password.trim()
    ) {
      setFormError("Name, email and password are required.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        name: addForm.name.trim(),
        email: addForm.email.trim(),
        password: addForm.password,
        role: "marketing_agent",
        phone: addForm.phone.trim() || undefined,
      },
    });
    setSaving(false);

    if (error || data?.error) {
      setFormError(data?.error || error?.message || "Failed to create agent.");
      return;
    }

    await supabase.from("activity_logs").insert({
      actor_id: state.user?.id,
      actor_name: state.user?.name ?? "unknown",
      action: "created",
      entity_type: "user",
      entity_name: addForm.name.trim(),
    });

    closeModal();
    fetchAgents();
  }

  async function handleEditAgent() {
    if (!editing || !state.user) return;
    setFormError("");
    if (!editForm.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
      })
      .eq("id", editing.id);
    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "updated",
      entity_type: "user",
      entity_id: editing.id,
      entity_name: editForm.name.trim(),
    });

    closeModal();
    fetchAgents();
  }

  async function handleToggleActive(a: AgentRow) {
    if (!state.user) return;
    const action = a.is_active ? "deactivate" : "reactivate";

    const confirmed = await Swal.fire({
      icon: "warning",
      title: `${action === "deactivate" ? "Deactivate" : "Reactivate"} ${a.name}?`,
      text:
        action === "deactivate"
          ? "They will no longer be able to log in until reactivated. To permanently delete an account, use Settings → Users."
          : "They will be able to log in again.",
      showCancelButton: true,
      confirmButtonText: action === "deactivate" ? "Deactivate" : "Reactivate",
      confirmButtonColor: action === "deactivate" ? "#dc2626" : "#2E9E8F",
    });
    if (!confirmed.isConfirmed) return;

    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !a.is_active })
      .eq("id", a.id);

    if (error) {
      Swal.fire({
        icon: "error",
        title: "Could not update",
        text: error.message,
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: action === "deactivate" ? "deactivated" : "reactivated",
      entity_type: "user",
      entity_id: a.id,
      entity_name: a.name,
    });

    fetchAgents();
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="Marketing Agents"
        sub={`${agents.length} agent${agents.length !== 1 ? "s" : ""}`}
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

      {loading ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex items-center justify-center py-16">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16 text-center">
          <Users size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">
            {search ? "No agents match your search" : "No agents added yet"}
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <div
              key={a.id}
              className={`bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${!a.is_active ? "opacity-60" : ""}`}
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
                      onClick={() => handleToggleActive(a)}
                      title={a.is_active ? "Deactivate" : "Reactivate"}
                      className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              <div className="text-sm font-semibold text-foreground mb-2 truncate flex items-center gap-2">
                {a.name}
                {!a.is_active && (
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-danger/10 text-danger">
                    Deactivated
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted font-mono mb-1">
                <Phone size={11} className="flex-shrink-0" />
                {a.phone || "—"}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Calendar size={11} className="flex-shrink-0" />
                Added {fmtDate(a.created_at)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
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
                  className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""} ${!a.is_active ? "opacity-60" : ""}`}
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
                      {!a.is_active && (
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-danger/10 text-danger">
                          Deactivated
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted font-mono">
                    {a.phone || "—"}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted">
                    {fmtDate(a.created_at)}
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
                          onClick={() => handleToggleActive(a)}
                          title={a.is_active ? "Deactivate" : "Reactivate"}
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

          <div className="sm:hidden divide-y divide-border/50">
            {filtered.map((a) => (
              <div
                key={a.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${!a.is_active ? "opacity-60" : ""}`}
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-xs font-bold">
                    {a.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                    {a.name}
                    {!a.is_active && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-danger/10 text-danger">
                        Off
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted font-mono">
                    {a.phone || "—"}
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    Added {fmtDate(a.created_at)}
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
                      onClick={() => handleToggleActive(a)}
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

      {modal === "add" && (
        <Modal title="Add Marketing Agent" onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Full Name
              </label>
              <input
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Jean Damascene"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Phone Number
              </label>
              <input
                value={addForm.phone}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="+250 788 000 000"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="agent@example.com"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Temporary Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={addForm.password}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, password: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
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
                onClick={handleAddAgent}
                disabled={saving}
                className="flex-1 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 font-semibold transition-colors disabled:opacity-60"
              >
                {saving ? "Creating…" : "Add Agent"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "edit" && (
        <Modal title="Edit Agent" onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Full Name
              </label>
              <input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Phone Number
              </label>
              <input
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, phone: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <p className="text-xs text-muted">
              Email, password, and role can only be changed in Settings → Users.
            </p>

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
                onClick={handleEditAgent}
                disabled={saving}
                className="flex-1 py-2.5 text-sm bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 font-semibold transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
