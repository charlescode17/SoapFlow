import { useState } from "react";
import {
  Plus,
  Trash2,
  Building2,
  Sun,
  Moon,
  Monitor,
  Languages,
  Palette,
  User as UserIcon,
  ShieldCheck,
} from "lucide-react";
import { useStore } from "../lib/store";
import { Confirm } from "../components/Confirm";
import { uid } from "../lib/utils";

type Theme = "light" | "dark" | "system";
type Section = "account" | "appearance" | "language" | "banks" | "roles";

const THEMES: { id: Theme; label: string; icon: React.ElementType }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
  { id: "rw", label: "Kinyarwanda" },
];

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "account", label: "Account", icon: UserIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "language", label: "Language", icon: Languages },
  { id: "banks", label: "Banks", icon: Building2 },
  { id: "roles", label: "Access Roles", icon: ShieldCheck },
];

export default function Settings() {
  const { state, dispatch } = useStore();
  const canEdit = state.user?.role === "manager";
  const [newBank, setNewBank] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("account");

  // TODO: move these into global store / localStorage so they persist across reloads
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState("en");

  const handleAddBank = () => {
    if (!newBank.trim()) return;
    dispatch({
      type: "ADD_BANK",
      payload: { id: uid(), name: newBank.trim() },
    });
    setNewBank("");
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-0.5">
          Manage system configuration and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* Settings sub-nav */}
        {/* Mobile: horizontal scrollable pill tabs. Desktop: vertical sticky list */}
        <nav className="lg:w-48 flex-shrink-0 -mx-4 px-4 lg:mx-0 lg:px-0">
          <div className="flex lg:flex-col gap-1.5 lg:gap-0.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:sticky lg:top-8 scrollbar-hide">
            {SECTIONS.map((s) => {
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`flex items-center gap-2 lg:gap-2.5 px-3.5 lg:px-3 py-2 lg:py-2.5 rounded-full lg:rounded-[var(--radius)] text-sm font-medium transition-colors text-left whitespace-nowrap flex-shrink-0 lg:w-full lg:flex-shrink border ${
                    active
                      ? "bg-primary/10 text-primary border-primary/20 lg:border-transparent"
                      : "text-muted hover:text-foreground hover:bg-accent/40 border-border lg:border-transparent"
                  }`}
                >
                  <s.icon
                    size={15}
                    className={active ? "text-primary" : "text-muted"}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0 max-w-2xl">
          {section === "account" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Account
              </h3>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-lg font-bold">
                    {state.user?.name.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-foreground truncate">
                    {state.user?.name}
                  </div>
                  <div className="text-sm text-muted truncate">
                    {state.user?.email}
                  </div>
                  <div
                    className={`inline-flex mt-1 text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full ${
                      state.user?.role === "manager"
                        ? "bg-primary/10 text-primary"
                        : "bg-secondary/10 text-secondary"
                    }`}
                  >
                    {state.user?.role} —{" "}
                    {state.user?.role === "manager"
                      ? "Full access"
                      : "Read only"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === "appearance" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Palette size={16} className="text-muted" />
                <h3 className="text-sm font-semibold text-foreground">
                  Appearance
                </h3>
              </div>
              <p className="text-xs text-muted mb-4">
                Choose how SoapFlow looks on your device
              </p>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {THEMES.map((t) => {
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`flex flex-col items-center gap-2 py-3.5 sm:py-4 rounded-[var(--radius)] border transition-all ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted hover:border-primary/30 hover:bg-accent/30"
                      }`}
                    >
                      <t.icon size={18} />
                      <span className="text-[11px] sm:text-xs font-semibold">
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {section === "language" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Languages size={16} className="text-muted" />
                <h3 className="text-sm font-semibold text-foreground">
                  Language
                </h3>
              </div>
              <p className="text-xs text-muted mb-4">
                Choose your preferred display language
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                {LANGUAGES.map((l) => {
                  const active = language === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setLanguage(l.id)}
                      className={`py-2.5 text-sm font-medium rounded-[var(--radius)] border transition-all ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted hover:border-primary/30 hover:bg-accent/30"
                      }`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {section === "banks" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-border flex items-center gap-2">
                <Building2 size={16} className="text-muted flex-shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">
                  Registered Banks
                </h3>
                <span className="ml-auto text-xs text-muted">
                  {state.banks.length} banks
                </span>
              </div>

              {canEdit && (
                <div className="px-5 sm:px-6 py-4 border-b border-border bg-background/50">
                  <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                    <input
                      value={newBank}
                      onChange={(e) => setNewBank(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddBank()}
                      placeholder="Bank name, e.g. Bank of Kigali"
                      className="flex-1 px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button
                      onClick={handleAddBank}
                      className="flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors flex-shrink-0"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/50">
                {state.banks.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted">
                    No banks registered yet
                  </div>
                ) : (
                  state.banks.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between px-5 sm:px-6 py-4 hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-[var(--radius)] bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} className="text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground truncate">
                          {b.name}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => setConfirmId(b.id)}
                          className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] transition-colors flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {section === "roles" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Access Roles
              </h3>
              <div className="space-y-3">
                {[
                  {
                    role: "Manager",
                    color: "primary",
                    desc: "Full CRUD access — add, edit, delete records across all modules.",
                  },
                  {
                    role: "Owner",
                    color: "secondary",
                    desc: "Read-only access — view all data and reports, no modifications allowed.",
                  },
                ].map((r) => (
                  <div
                    key={r.role}
                    className="flex gap-3 p-3 bg-background rounded-[var(--radius)] border border-border"
                  >
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full h-fit flex-shrink-0 ${
                        r.color === "primary"
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary/10 text-secondary"
                      }`}
                    >
                      {r.role}
                    </span>
                    <p className="text-sm text-muted">{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmId && (
        <Confirm
          message={`Remove "${state.banks.find((b) => b.id === confirmId)?.name}" from the bank list?`}
          onConfirm={() => {
            dispatch({ type: "DELETE_BANK", id: confirmId });
            setConfirmId(null);
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
