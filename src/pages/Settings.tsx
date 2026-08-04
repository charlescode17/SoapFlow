import { useState, useEffect } from "react";
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
  Users,
  Eye,
  EyeOff,
  History,
  LogIn,
  LogOut,
  Lock,
  Zap,
} from "lucide-react";
import { useStore } from "../lib/store";
import { Confirm } from "../components/Confirm";
import { supabase } from "../lib/supabase";
import { normalizeRole, type Role } from "../lib/types";
import Swal from "sweetalert2";
import { getStoredTheme, setStoredTheme, applyTheme, type Theme as ThemeType } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import type { Lang } from "../lib/translations";

type Theme = "light" | "dark" | "system";
type Section =
  | "account"
  | "appearance"
  | "language"
  | "banks"
  | "roles"
  | "users"
  | "logs"
  | "security"
  | "turbo";

const THEMES: { id: Theme; label: string; icon: React.ElementType }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
  { id: "rw", label: "IKinyarwanda" },
];

const SECTIONS_ALL: { id: Section; labelKey: string; icon: React.ElementType }[] = [
  { id: "account", labelKey: "account", icon: UserIcon },
  { id: "appearance", labelKey: "appearance", icon: Palette },
  { id: "language", labelKey: "language", icon: Languages },
  { id: "banks", labelKey: "banks", icon: Building2 },
  { id: "roles", labelKey: "roles", icon: ShieldCheck },
  { id: "users", labelKey: "users", icon: Users },
  { id: "logs", labelKey: "logs", icon: History },
  { id: "security", labelKey: "security", icon: Lock },
  { id: "turbo", labelKey: "turbo", icon: Zap },
];

const LIMITED_SECTION_IDS: Section[] = ["account", "appearance", "language"];

export default function Settings() {
  const { state, dispatch } = useStore();
  const { lang, setLang, t } = useI18n(); 
  const userRole = normalizeRole(state.user?.role);
  const canEdit = userRole === "manager";
  const SECTIONS = canEdit
    ? SECTIONS_ALL
    : SECTIONS_ALL.filter((s) => LIMITED_SECTION_IDS.includes(s.id));
  const [newBank, setNewBank] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("account");

  useEffect(() => {
    if (!SECTIONS.some((s) => s.id === section)) {
      setSection("account");
    }
  }, [SECTIONS, section]);

  // --- Account editing ---
  const [accountForm, setAccountForm] = useState({
    name: "",
    phone: "",
    email: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountSuccess, setAccountSuccess] = useState("");
  const [showAccountPw, setShowAccountPw] = useState(false);

  // --- Users management ---
  type ProfileRow = {
    id: string;
    name: string;
    email: string;
    role: Role;
    phone: string | null;
    is_active: boolean;
  };
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "marketing_agent" as Role,
    phone: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [addUserError, setAddUserError] = useState("");
  const [addUserLoading, setAddUserLoading] = useState(false);

  useEffect(() => {
    if (section === "users" && canEdit) fetchUsers();
    if (section === "turbo" && canEdit) fetchUsers();
    if (section === "logs" && canEdit) fetchLogs();
    if (section === "security" && canEdit) fetchPinStatus();
    if (section === "account" && state.user) {
      setAccountForm({
        name: state.user.name,
        phone: state.user.phone ?? "",
        email: state.user.email,
        newPassword: "",
        confirmPassword: "",
      });
      setAccountError("");
      setAccountSuccess("");
    }
    setSelectedDate(null);
  }, [section]);

  async function handleSaveAccount() {
    if (!state.user) return;
    setAccountError("");
    setAccountSuccess("");

    if (accountForm.newPassword || accountForm.confirmPassword) {
      if (accountForm.newPassword.length < 6) {
        setAccountError(t("new_password_min_length"));
        return;
      }
      if (accountForm.newPassword !== accountForm.confirmPassword) {
        setAccountError(t("passwords_do_not_match"));
        return;
      }
    }

    setAccountSaving(true);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ name: accountForm.name.trim(), phone: accountForm.phone.trim() || null })
      .eq("id", state.user.id);

    if (profileError) {
      setAccountSaving(false);
      setAccountError(profileError.message);
      return;
    }

    if (accountForm.newPassword) {
      const { error: pwError } = await supabase.auth.updateUser({ password: accountForm.newPassword });
      if (pwError) {
        setAccountSaving(false);
        setAccountError(pwError.message);
        return;
      }
    }

    const emailChanged = accountForm.email.trim() !== state.user.email;

    if (emailChanged) {
      const { error: emailError } = await supabase.auth.updateUser({ email: accountForm.email.trim() });
      if (emailError) {
        setAccountSaving(false);
        setAccountError(emailError.message);
        return;
      }
      await supabase.from("profiles").update({ email: accountForm.email.trim() }).eq("id", state.user.id);

      await supabase.from("activity_logs").insert({
        actor_id: state.user.id,
        actor_name: accountForm.name.trim(),
        action: "updated",
        entity_type: "user",
        entity_id: state.user.id,
        entity_name: accountForm.name.trim(),
        details: { changed: "email" },
      });

      await Swal.fire({
        icon: "info",
        title: t("confirm_new_email_title"),
        text: t("confirm_new_email_text"),
        confirmButtonColor: "#2E9E8F",
      });

      await supabase.auth.signOut();
      dispatch({ type: "SET_USER", payload: null });
      setAccountSaving(false);
      return;
    }

    dispatch({
      type: "SET_USER",
      payload: { ...state.user, name: accountForm.name.trim(), phone: accountForm.phone.trim() },
    });

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: accountForm.name.trim(),
      action: "updated",
      entity_type: "user",
      entity_id: state.user.id,
      entity_name: accountForm.name.trim(),
    });

    setAccountForm((f) => ({ ...f, newPassword: "", confirmPassword: "" }));
    setAccountSaving(false);
    setAccountSuccess(t("account_updated"));
  }
  // --- Activity logs ---
  type LogEntry = {
    id: string;
    kind: "action" | "auth";
    actorId: string | null;
    actorName: string;
    text: string;
    createdAt: string;
    action?: string;
    entityType?: string;
    entityId?: string | null;
    entityName?: string | null;
    details?: Record<string, any> | null;
  };
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logActorFilter, setLogActorFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [visibleLogCount, setVisibleLogCount] = useState(20);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // --- Security PIN ---
  const [pinIsSet, setPinIsSet] = useState<boolean | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  // --- Turbo mode (login as another user) ---
  const [turboLoading, setTurboLoading] = useState<string | null>(null);
  const turboActive =
    typeof window !== "undefined" && !!sessionStorage.getItem("turbo_origin_session");
  const turboOriginName =
    typeof window !== "undefined"
      ? (JSON.parse(sessionStorage.getItem("turbo_origin_user") || "null")?.name as
          | string
          | undefined)
      : undefined;

  async function handleEnterTurbo(target: ProfileRow) {
    if (!state.user || target.id === state.user.id) return;

    const confirmed = await Swal.fire({
      icon: "warning",
      title: `${t("enter_turbo_mode_prefix")} ${target.name}?`,
      text: t("turbo_mode_warning"),
      showCancelButton: true,
      confirmButtonText: t("enter_turbo_mode"),
      confirmButtonColor: "#dc2626",
    });
    if (!confirmed.isConfirmed) return;

    setTurboLoading(target.id);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setTurboLoading(null);
      return;
    }

    const { data, error } = await supabase.functions.invoke("impersonate-user", {
      body: { userId: target.id },
    });

    if (error || data?.error) {
      setTurboLoading(null);
      Swal.fire({
        icon: "error",
        title: t("could_not_enter_turbo_mode"),
        text: data?.error || error?.message || t("something_went_wrong"),
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    // Stash the manager's real session + identity so we can restore it later.
    sessionStorage.setItem("turbo_origin_session", JSON.stringify(session));
    sessionStorage.setItem("turbo_origin_user", JSON.stringify(state.user));

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "entered_turbo",
      entity_type: "user",
      entity_id: target.id,
      entity_name: target.name,
    });

    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    window.location.reload();
  }

  async function handleExitTurbo() {
    const originSessionRaw = sessionStorage.getItem("turbo_origin_session");
    const originUserRaw = sessionStorage.getItem("turbo_origin_user");
    if (!originSessionRaw || !originUserRaw) return;

    const originSession = JSON.parse(originSessionRaw);
    const originUser = JSON.parse(originUserRaw);

    await supabase.from("activity_logs").insert({
      actor_id: originUser.id,
      actor_name: originUser.name,
      action: "exited_turbo",
      entity_type: "user",
      entity_id: state.user?.id,
      entity_name: state.user?.name,
    });

    await supabase.auth.setSession({
      access_token: originSession.access_token,
      refresh_token: originSession.refresh_token,
    });

    sessionStorage.removeItem("turbo_origin_session");
    sessionStorage.removeItem("turbo_origin_user");

    window.location.reload();
  }

  async function fetchPinStatus() {
    const { data } = await supabase.rpc("security_pin_is_set");
    setPinIsSet(!!data);
  }

  async function handleSetPin() {
    setPinError("");
    if (pinValue.length < 4) {
      setPinError(t("pin_min_digits_error"));
      return;
    }
    if (pinValue !== pinConfirm) {
      setPinError(t("pins_do_not_match"));
      return;
    }
    setPinLoading(true);
    const { error } = await supabase.rpc("set_security_pin", {
      new_pin: pinValue,
    });
    setPinLoading(false);
    if (error) {
      setPinError(error.message);
      return;
    }
    setPinValue("");
    setPinConfirm("");
    setPinIsSet(true);
    Swal.fire({
      icon: "success",
      title: t("security_pin_saved"),
      confirmButtonColor: "#2E9E8F",
    });
  }

  // Prompts for the PIN and verifies it server-side. Returns true only if correct.
  async function requireManagerPin(actionLabel: string): Promise<boolean> {
    const { value: pin } = await Swal.fire({
      icon: "warning",
      title: t("security_pin_required"),
      text: `${t("security_pin_required_text_prefix")}${actionLabel}${t("security_pin_required_text_suffix")}`,
      input: "password",
      inputPlaceholder: t("enter_pin_placeholder"),
      showCancelButton: true,
      confirmButtonText: t("verify"),
      confirmButtonColor: "#2E9E8F",
    });
    if (!pin) return false;

    const { data: valid } = await supabase.rpc("verify_security_pin", { pin });
    if (!valid) {
      Swal.fire({
        icon: "error",
        title: t("incorrect_pin"),
        confirmButtonColor: "#2E9E8F",
      });
      return false;
    }
    return true;
  }

  function groupLogsByDate(entries: LogEntry[]) {
    const groups: Record<string, LogEntry[]> = {};
    for (const l of entries) {
      const key = new Date(l.createdAt).toLocaleDateString(lang, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    }
    return groups;
  }

  async function handleClearAllLogs() {
    if (!state.user) return;
    const confirmed = await Swal.fire({
      icon: "warning",
      title: t("clear_all_activity_logs_title"),
      text: t("clear_all_activity_logs_text"),
      showCancelButton: true,
      confirmButtonText: t("clear_all_logs"),
      confirmButtonColor: "#dc2626",
    });
    if (!confirmed.isConfirmed) return;

    await supabase.from("activity_logs").delete().neq("id", 0);
    await supabase.from("auth_logs").delete().neq("id", 0);

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "cleared",
      entity_type: "activity_log",
      entity_name: "all logs",
    });

    setSelectedDate(null);
    Swal.fire({
      icon: "success",
      title: t("logs_cleared"),
      confirmButtonColor: "#2E9E8F",
    });
    fetchLogs();
  }

  async function handleDeleteDateLogs(dateLabel: string, entries: LogEntry[]) {
    if (!state.user) return;
    const confirmed = await Swal.fire({
      icon: "warning",
      title: `${t("delete_logs_for_date_prefix")} ${dateLabel}?`,
      text: `${t("delete_logs_for_date_text_prefix")} ${entries.length} ${entries.length === 1 ? t("entry") : t("entries")} ${t("delete_logs_for_date_text_suffix")}`,
      showCancelButton: true,
      confirmButtonText: t("delete"),
      confirmButtonColor: "#dc2626",
    });
    if (!confirmed.isConfirmed) return;

    const actionIds = entries
      .filter((e) => e.kind === "action")
      .map((e) => e.id.replace("action-", ""));
    const authIds = entries
      .filter((e) => e.kind === "auth")
      .map((e) => e.id.replace("auth-", ""));

    if (actionIds.length)
      await supabase.from("activity_logs").delete().in("id", actionIds);
    if (authIds.length)
      await supabase.from("auth_logs").delete().in("id", authIds);

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "cleared",
      entity_type: "activity_log",
      entity_name: `logs for ${dateLabel}`,
    });

    if (selectedDate === dateLabel) setSelectedDate(null);
    fetchLogs();
  }

  function exportLogsCSV(filtered: LogEntry[]) {
    const header = [
      t("date_label"),
      t("time_label"),
      t("user_label"),
      t("action_label"),
      t("entity_type_label"),
      t("entity_name_label"),
    ];
    const rows = filtered.map((l) => [
      new Date(l.createdAt).toLocaleDateString(),
      new Date(l.createdAt).toLocaleTimeString(),
      l.actorName,
      l.action ?? "",
      l.entityType ?? "",
      l.entityName ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soapflow-activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printLogs(filtered: LogEntry[]) {
    const rowsHtml = filtered
      .map(
        (l) => `
      <tr>
        <td>${new Date(l.createdAt).toLocaleDateString(lang)}</td>
        <td>${new Date(l.createdAt).toLocaleTimeString(lang)}</td>
        <td>${l.actorName}</td>
        <td>${l.action ?? ""}</td>
        <td>${l.entityType ?? ""}</td>
        <td>${l.entityName ?? ""}</td>
      </tr>`,
      )
      .join("");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>${t("soapflow_activity_logs")}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            p.meta { color: #666; font-size: 12px; margin-top: 0; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${t("soapflow_activity_logs")}</h1>
          <p class="meta">${t("generated_entries_prefix")} ${new Date().toLocaleString(lang)} — ${filtered.length} ${t("generated_entries_suffix")}</p>
          <table>
            <thead><tr><th>${t("date_label")}</th><th>${t("time_label")}</th><th>${t("user_label")}</th><th>${t("action_label")}</th><th>${t("entity_type_label")}</th><th>${t("entity_name_label")}</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  async function fetchLogs() {
    setVisibleLogCount(20);
    setLogsLoading(true);

    const [{ data: actionRows }, { data: authRows }] = await Promise.all([
      supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("auth_logs")
        .select("*, profiles(name)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const actionEntries: LogEntry[] = (actionRows ?? []).map((r: any) => ({
      id: `action-${r.id}`,
      kind: "action",
      actorId: r.actor_id,
      actorName: r.actor_name,
      text: `${r.action} ${r.entity_type} "${r.entity_name ?? r.entity_id ?? ""}"`,
      createdAt: r.created_at,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      entityName: r.entity_name,
      details: r.details,
    }));

    const authEntries: LogEntry[] = (authRows ?? []).map((r: any) => ({
      id: `auth-${r.id}`,
      kind: "auth",
      actorId: r.user_id,
      actorName: r.profiles?.name ?? "Unknown user",
      text: r.event === "login" ? "Logged in" : "Logged out",
      createdAt: r.created_at,
      action: r.event,
      entityType: "session",
      entityId: null,
      details: null,
    }));

    const combined = [...actionEntries, ...authEntries].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    setLogs(combined);
    setLogsLoading(false);
  }

  async function fetchUsers() {
    setUsersLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("name");
    if (!error && data) setUsers(data as ProfileRow[]);
    setUsersLoading(false);
  }

  async function handleRoleChange(target: ProfileRow, role: Role) {
    if (target.id === state.user?.id) return; // can't change own role

    if (target.role === "manager" && target.id !== state.user?.id) {
      const ok = await requireManagerPin(t("changing_manager_role"));
      if (!ok) return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", target.id);
    if (error) {
      Swal.fire({
        icon: "error",
        title: t("could_not_update_role"),
        text: error.message,
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }
    fetchUsers();
  }

  async function handleDeleteUser(u: ProfileRow) {
    if (u.id === state.user?.id) return; // can't delete self

    if (u.role === "manager") {
      const ok = await requireManagerPin(t("deleting_manager_account"));
      if (!ok) return;
    }

    const confirmed = await Swal.fire({
      icon: "warning",
      title: `${t("delete_user_prefix")} ${u.name}?`,
      text: t("delete_user_warning"),
      showCancelButton: true,
      confirmButtonText: t("delete"),
      confirmButtonColor: "#dc2626",
    });
    if (!confirmed.isConfirmed) return;

    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { userId: u.id },
    });

    if (error || data?.error) {
      Swal.fire({
        icon: "error",
        title: t("could_not_delete_user"),
        text: data?.error || error?.message || t("something_went_wrong"),
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    Swal.fire({
      icon: "success",
      title: t("user_deleted"),
      confirmButtonColor: "#2E9E8F",
    });
    fetchUsers();
  }

  async function handleToggleActive(u: ProfileRow) {
    if (u.id === state.user?.id) return; // can't deactivate self

    const action = u.is_active ? "deactivate" : "reactivate";

    if (u.role === "manager") {
      const ok = await requireManagerPin(`${action}ing this manager's account`);
      if (!ok) return;
    }

    const confirmed = await Swal.fire({
      icon: "warning",
      title: `${action === "deactivate" ? t("deactivate") : t("reactivate")} ${u.name}?`,
      text:
        action === "deactivate"
          ? t("deactivate_user_text")
          : t("reactivate_user_text"),
      showCancelButton: true,
      confirmButtonText: action === "deactivate" ? t("deactivate") : t("reactivate"),
      confirmButtonColor: action === "deactivate" ? "#dc2626" : "#2E9E8F",
    });
    if (!confirmed.isConfirmed) return;

    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !u.is_active })
      .eq("id", u.id);
    if (!error) fetchUsers();
  }

  async function handleAddUser() {
    setAddUserError("");
    if (
      !newUser.name.trim() ||
      !newUser.email.trim() ||
      !newUser.password.trim()
    ) {
      setAddUserError(t("name_email_password_required"));
      return;
    }
    setAddUserLoading(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: newUser,
    });
    setAddUserLoading(false);
    if (error || data?.error) {
      setAddUserError(
        data?.error || error?.message || t("failed_to_create_user"),
      );
      return;
    }
    setNewUser({
      name: "",
      email: "",
      password: "",
      role: "marketing_agent",
      phone: "",
    });
    setShowAddUser(false);
    fetchUsers();
  }

  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  const setTheme = (t: Theme) => {
    setThemeState(t);
    setStoredTheme(t);
  };

  // Keep "system" mode reactive if the OS theme changes while the app is open
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const [bankLoading, setBankLoading] = useState(false);

  const handleAddBank = async () => {
    if (!newBank.trim() || !state.user) return;
    setBankLoading(true);

    const { data, error } = await supabase
      .from("banks")
      .insert({ name: newBank.trim() })
      .select()
      .single();

    setBankLoading(false);

    if (error) {
      Swal.fire({
        icon: "error",
        title: t("could_not_add_bank"),
        text: error.message.includes("duplicate")
          ? t("bank_already_registered")
          : error.message,
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    dispatch({ type: "ADD_BANK", payload: data });

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "created",
      entity_type: "bank",
      entity_id: data.id,
      entity_name: data.name,
    });

    setNewBank("");
  };

  const handleDeleteBank = async (bankId: string) => {
    if (!state.user) return;
    const bank = state.banks.find((b) => b.id === bankId);

    const { error } = await supabase.from("banks").delete().eq("id", bankId);

    if (error) {
      Swal.fire({
        icon: "error",
        title: t("could_not_delete_bank"),
        text: error.message,
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    dispatch({ type: "DELETE_BANK", id: bankId });

    await supabase.from("activity_logs").insert({
      actor_id: state.user.id,
      actor_name: state.user.name,
      action: "deleted",
      entity_type: "bank",
      entity_id: bankId,
      entity_name: bank?.name ?? "unknown",
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl font-bold text-foreground">{t("settings_title")}</h1>
        <p className="text-sm text-muted mt-0.5">
          {t("settings_subtitle")}
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
                  {t(s.labelKey)}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0 max-w-2xl">
          {section === "account" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("account")}</h3>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-lg font-bold">{state.user?.name.charAt(0)}</span>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-foreground truncate">{state.user?.name}</div>
                  <div
                    className={`inline-flex mt-1 text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full ${
                      state.user?.role === "manager" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                    }`}
                  >
                    {state.user?.role} — {state.user?.role === "manager" ? t("full_access") : t("read_only")}
                  </div>
                </div>
              </div>

              <div className="space-y-4 max-w-md">
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">{t("full_name")}</label>
                  <input
                    value={accountForm.name}
                    onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">{t("phone")}</label>
                  <input
                    value={accountForm.phone}
                    onChange={(e) => setAccountForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">{t("email_address")}</label>
                  <input
                    type="email"
                    value={accountForm.email}
                    onChange={(e) => setAccountForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <p className="text-[11px] text-muted mt-1">{t("email_change_note")}</p>
                </div>
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t("change_password_optional")}</p>
                  <div className="relative mb-3">
                    <input
                      type={showAccountPw ? "text" : "password"}
                      value={accountForm.newPassword}
                      onChange={(e) => setAccountForm((f) => ({ ...f, newPassword: e.target.value }))}
                      placeholder={t("new_password")}
                      className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccountPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                    >
                      {showAccountPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <input
                    type={showAccountPw ? "text" : "password"}
                    value={accountForm.confirmPassword}
                    onChange={(e) => setAccountForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder={t("confirm_new_password")}
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>

                {accountError && (
                  <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-[var(--radius-sm)] px-3 py-2">
                    {accountError}
                  </div>
                )}
                {accountSuccess && (
                  <div className="text-success text-xs bg-success/10 border border-success/20 rounded-[var(--radius-sm)] px-3 py-2">
                    {accountSuccess}
                  </div>
                )}

                <button
                  onClick={handleSaveAccount}
                  disabled={accountSaving}
                  className="bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {accountSaving ? t("saving") : t("save_changes")}
                </button>
              </div>
            </div>
          )}

          {section === "appearance" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Palette size={16} className="text-muted" />
                <h3 className="text-sm font-semibold text-foreground">
                  {t("appearance")}
                </h3>
              </div>
              <p className="text-xs text-muted mb-4">
                {t("choose_theme")}
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
                  {t("language")}
                </h3>
              </div>
              <p className="text-xs text-muted mb-4">
                {t("choose_language")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                {LANGUAGES.map((l) => {
                  const active = lang === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setLang(l.id as Lang)}
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
                    {t("registered_banks")}
                  </h3>
                  <span className="ml-auto text-xs text-muted">
                    {state.banks.length} {t("banks")}
                  </span>
                </div>
              {canEdit && (
                <div className="px-5 sm:px-6 py-4 border-b border-border bg-background/50">
                  <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                    <input
                      value={newBank}
                      onChange={(e) => setNewBank(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddBank()}
                      placeholder={t("bank_name_placeholder")}
                      className="flex-1 px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button
                      onClick={handleAddBank}
                      disabled={bankLoading}
                      className="flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors flex-shrink-0 disabled:opacity-60"
                    >
                      <Plus size={14} />
                      {bankLoading ? t("adding") : t("add")}
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/50">
                {state.banks.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted">
                    {t("no_banks_yet")}
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
                {t("access_roles")}
              </h3>
              <div className="space-y-3">
                {[
                  {
                    role: "manager",
                    label: t("role_manager"),
                    color: "primary",
                    desc: t("role_manager_desc"),
                  },
                  {
                    role: "marketing_agent",
                    label: t("role_marketing_agent"),
                    color: "secondary",
                    desc: t("role_marketing_agent_desc"),
                  },
                  {
                    role: "stock_agent",
                    label: t("role_stock_agent"),
                    color: "secondary",
                    desc: t("role_stock_agent_desc"),
                  },
                  {
                    role: "readonly",
                    label: t("role_readonly"),
                    color: "secondary",
                    desc: t("role_readonly_desc"),
                  },
                ].map((r) => (
                  <div
                    key={r.role}
                    className="flex gap-3 p-3 bg-background rounded-[var(--radius)] border border-border"
                  >
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full h-fit flex-shrink-0 whitespace-nowrap ${r.color === "primary" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"}`}
                    >
                      {r.label}
                    </span>
                    <p className="text-sm text-muted">{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === "users" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-border flex items-center gap-2">
                <Users size={16} className="text-muted flex-shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">
                  {t("team_members")}
                </h3>
                <span className="ml-auto text-xs text-muted">
                  {users.length} {t("all_users")}
                </span>
              </div>

              {!canEdit ? (
                <div className="py-10 text-center text-sm text-muted">
                  {t("only_managers_manage_users")}
                </div>
              ) : (
                <>
                  <div className="px-5 sm:px-6 py-4 border-b border-border bg-background/50">
                    {!showAddUser ? (
                      <button
                        onClick={() => setShowAddUser(true)}
                        className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors"
                      >
                        <Plus size={14} />
                        {t("add_user")}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            value={newUser.name}
                            onChange={(e) =>
                              setNewUser({ ...newUser, name: e.target.value })
                            }
                            placeholder={t("full_name_placeholder")}
                            className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          />
                          <input
                            value={newUser.phone}
                            onChange={(e) =>
                              setNewUser({ ...newUser, phone: e.target.value })
                            }
                            placeholder={t("phone_optional")}
                            className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          />
                          <input
                            type="email"
                            value={newUser.email}
                            onChange={(e) =>
                              setNewUser({ ...newUser, email: e.target.value })
                            }
                            placeholder={t("email_address_placeholder")}
                            className="px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          />
                          <div className="relative">
                            <input
                              type={showPw ? "text" : "password"}
                              value={newUser.password}
                              onChange={(e) =>
                                setNewUser({
                                  ...newUser,
                                  password: e.target.value,
                                })
                              }
                              placeholder={t("temporary_password")}
                              className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPw((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                            >
                              {showPw ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                          </div>
                          <select
                            value={newUser.role}
                            onChange={(e) =>
                              setNewUser({
                                ...newUser,
                                role: e.target.value as Role,
                              })
                            }
                            className="sm:col-span-2 px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-card"
                          >
                            <option value="marketing_agent">
                              {t("role_marketing_agent")}
                            </option>
                            <option value="stock_agent">{t("role_stock_agent")}</option>
                            <option value="readonly">{t("role_readonly")}</option>
                            <option value="manager">{t("role_manager")}</option>
                          </select>
                        </div>

                        {addUserError && (
                          <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-[var(--radius-sm)] px-3 py-2">
                            {addUserError}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={handleAddUser}
                            disabled={addUserLoading}
                            className="bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors disabled:opacity-60"
                          >
                            {addUserLoading ? t("creating") : t("create_user")}
                          </button>
                          <button
                            onClick={() => {
                              setShowAddUser(false);
                              setAddUserError("");
                            }}
                            className="text-sm font-medium text-muted px-4 py-2.5 rounded-[var(--radius)] hover:bg-accent/40 transition-colors"
                          >
                            {t("cancel")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="divide-y divide-border/50">
                    {usersLoading ? (
                      <div className="py-10 text-center text-sm text-muted">
                        {t("loading")}
                      </div>
                    ) : users.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted">
                        {t("no_users_yet")}
                      </div>
                    ) : (
                      users.map((u) => (
                        <div
                          key={u.id}
                          className={`flex items-center justify-between px-5 sm:px-6 py-4 hover:bg-accent/30 transition-colors gap-3 ${!u.is_active ? "opacity-60" : ""}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                              {u.name}
                              {!u.is_active && (
                                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-danger/10 text-danger">
                                  {t("deactivated")}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted truncate">
                              {u.email}
                            </div>
                          </div>
                          {u.id === state.user?.id ? (
                            <span className="text-xs text-muted italic px-2 py-1.5 flex-shrink-0">
                              {t("this_is_you")}
                            </span>
                          ) : (
                            <>
                              <select
                                value={u.role}
                                onChange={(e) =>
                                  handleRoleChange(u, e.target.value as Role)
                                }
                                className="text-xs font-medium px-2 py-1.5 rounded-[var(--radius-sm)] border border-border bg-card flex-shrink-0"
                              >
                                <option value="manager">{t("role_manager")}</option>
                                <option value="marketing_agent">{t("role_marketing_agent")}</option>
                                <option value="stock_agent">{t("role_stock_agent")}</option>
                                <option value="readonly">{t("role_readonly")}</option>
                              </select>
                              <button
                                onClick={() => handleToggleActive(u)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-sm)] flex-shrink-0 transition-colors ${
                                  u.is_active
                                    ? "text-danger hover:bg-danger/10"
                                    : "text-primary hover:bg-primary/10"
                                }`}
                              >
                                {u.is_active ? t("deactivate") : t("reactivate")}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] flex-shrink-0 transition-colors"
                                title={t("delete_user_tooltip")}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {section === "logs" &&
            (() => {
              const filteredLogs = logs.filter(
                (l) => logActorFilter === "all" || l.actorId === logActorFilter,
              );
              const grouped = groupLogsByDate(filteredLogs);
              const dateKeys = Object.keys(grouped);

              const dayLogs = selectedDate ? (grouped[selectedDate] ?? []) : [];
              const visibleDayLogs = dayLogs.slice(0, visibleLogCount);

              return (
                <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
                  <div className="px-5 sm:px-6 py-4 border-b border-border flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-2">
                        {selectedDate && (
                          <button
                            onClick={() => setSelectedDate(null)}
                            className="text-xs font-semibold text-primary hover:underline mr-1"
                          >
                            ← {t("all_dates")}
                          </button>
                        )}
                        <History
                          size={16}
                          className="text-muted flex-shrink-0"
                        />
                        <h3 className="text-sm font-semibold text-foreground">
                          {selectedDate ?? t("activity_logs_title")}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 sm:ml-auto">
                        <select
                          value={logActorFilter}
                          onChange={(e) => {
                            setLogActorFilter(e.target.value);
                            setVisibleLogCount(20);
                            setSelectedDate(null);
                          }}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-card flex-1 sm:flex-none"
                        >
                          <option value="all">{t("all_users")}</option>
                          {Array.from(
                            new Map(
                              logs.map((l) => [l.actorId, l.actorName]),
                            ).entries(),
                          ).map(
                            ([id, name]) =>
                              id && (
                                <option key={id} value={id}>
                                  {name}
                                </option>
                              ),
                          )}
                        </select>
                        <span className="text-xs text-muted whitespace-nowrap">
                          {filteredLogs.length} {t("entries")}
                        </span>
                      </div>
                    </div>

                    {canEdit && filteredLogs.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => exportLogsCSV(filteredLogs)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-foreground hover:bg-accent/40 transition-colors"
                        >
                          {t("download_csv")}
                        </button>
                        <button
                          onClick={() => printLogs(filteredLogs)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-foreground hover:bg-accent/40 transition-colors"
                        >
                          {t("print")}
                        </button>
                        <button
                          onClick={handleClearAllLogs}
                          className="text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-sm)] border border-danger/30 text-danger hover:bg-danger/10 transition-colors ml-auto"
                        >
                          {t("clear_all_logs")}
                        </button>
                      </div>
                    )}
                  </div>

                  {!canEdit ? (
                    <div className="py-10 text-center text-sm text-muted">
                      {t("only_managers_view_logs")}
                    </div>
                  ) : logsLoading ? (
                    <div className="py-10 text-center text-sm text-muted">
                      {t("loading")}
                    </div>
                  ) : filteredLogs.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted">
                      {t("no_activity_yet")}
                    </div>
                  ) : !selectedDate ? (
                    <div className="p-5 sm:p-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {dateKeys.map((dateLabel) => {
                        const dayEntries = grouped[dateLabel];
                        const loginCount = dayEntries.filter(
                          (e) => e.action === "login",
                        ).length;
                        const logoutCount = dayEntries.filter(
                          (e) => e.action === "logout",
                        ).length;
                        return (
                          <div
                            key={dateLabel}
                            className="relative group text-left p-4 rounded-[var(--radius)] border border-border hover:border-primary/40 hover:bg-accent/30 transition-colors"
                          >
                            <button
                              onClick={() => {
                                setSelectedDate(dateLabel);
                                setVisibleLogCount(20);
                              }}
                              className="text-left w-full"
                            >
                              <div className="text-sm font-semibold text-foreground truncate">
                                {dateLabel}
                              </div>
                              <div className="text-xs text-muted mt-1">
                                {dayEntries.length}{" "}
                                {dayEntries.length === 1 ? t("entry") : t("entries")}
                              </div>
                              {(loginCount > 0 || logoutCount > 0) && (
                                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted">
                                  {loginCount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <LogIn
                                        size={11}
                                        className="text-secondary"
                                      />{" "}
                                      {loginCount}
                                    </span>
                                  )}
                                  {logoutCount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <LogOut
                                        size={11}
                                        className="text-secondary"
                                      />{" "}
                                      {logoutCount}
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDateLogs(dateLabel, dayEntries);
                              }}
                              className="absolute top-2 right-2 p-1 text-muted hover:text-danger hover:bg-danger/10 rounded-[var(--radius-sm)] opacity-0 group-hover:opacity-100 transition-opacity"
                              title={t("delete_this_day_logs")}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-border/50">
                        {visibleDayLogs.map((l) => (
                          <button
                            key={l.id}
                            onClick={() => setSelectedLog(l)}
                            className="w-full flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-5 sm:px-6 py-3.5 hover:bg-accent/30 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`w-8 h-8 rounded-[var(--radius)] flex items-center justify-center flex-shrink-0 ${
                                  l.kind === "auth"
                                    ? "bg-secondary/10"
                                    : "bg-primary/10"
                                }`}
                              >
                                {l.kind === "auth" ? (
                                  l.text === "Logged in" ? (
                                    <LogIn
                                      size={14}
                                      className="text-secondary"
                                    />
                                  ) : (
                                    <LogOut
                                      size={14}
                                      className="text-secondary"
                                    />
                                  )
                                ) : (
                                  <History size={14} className="text-primary" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-foreground truncate">
                                  <span className="font-semibold">
                                    {l.actorName}
                                  </span>{" "}
                                  <span className="text-muted">{l.text}</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted flex-shrink-0 pl-11 sm:pl-0">
                              {new Date(l.createdAt).toLocaleTimeString()}
                            </div>
                          </button>
                        ))}
                      </div>

                      {dayLogs.length > visibleLogCount && (
                        <div className="px-5 sm:px-6 py-4 border-t border-border text-center">
                          <button
                            onClick={() => setVisibleLogCount((c) => c + 20)}
                            className="text-sm font-semibold text-primary hover:underline"
                          >
                            Load more
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          {section === "security" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={16} className="text-muted" />
                <h3 className="text-sm font-semibold text-foreground">
                  {t("security_pin")}
                </h3>
              </div>
              <p className="text-xs text-muted mb-4">
                {t("security_pin_description")}
              </p>

              {!canEdit ? (
                <div className="py-6 text-center text-sm text-muted">
                  {t("only_managers_manage_security_pin")}
                </div>
              ) : (
                <div className="space-y-3 max-w-xs">
                  {pinIsSet && (
                    <div className="text-xs bg-primary/10 text-primary rounded-[var(--radius-sm)] px-3 py-2">
                      {t("pin_already_set_notice")}
                    </div>
                  )}
                  <input
                    type="password"
                    value={pinValue}
                    onChange={(e) => setPinValue(e.target.value)}
                    placeholder={t("new_pin_placeholder")}
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <input
                    type="password"
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value)}
                    placeholder={t("confirm_pin_placeholder")}
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  {pinError && (
                    <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-[var(--radius-sm)] px-3 py-2">
                      {pinError}
                    </div>
                  )}
                  <button
                    onClick={handleSetPin}
                    disabled={pinLoading}
                    className="w-full bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {pinLoading
                      ? t("saving")
                      : pinIsSet
                        ? t("update_pin")
                        : t("set_pin")}
                  </button>
                </div>
              )}
            </div>
          )}

          {section === "turbo" && (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-border flex items-center gap-2">
                <Zap size={16} className="text-muted flex-shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">
                  {t("turbo_mode_heading")}
                </h3>
              </div>

              {turboActive && (
                <div className="mx-5 sm:mx-6 mt-4 flex items-center justify-between gap-3 text-xs bg-danger/10 text-danger border border-danger/20 rounded-[var(--radius)] px-3 py-2.5">
                  <span>
                    {t("currently_in_turbo_mode_as")} <b>{state.user?.name}</b>
                    {turboOriginName ? `${t("originally")} ${turboOriginName})` : ""}.
                  </span>
                  <button
                    onClick={handleExitTurbo}
                    className="font-semibold px-3 py-1.5 rounded-[var(--radius-sm)] bg-danger text-white hover:bg-danger/90 flex-shrink-0"
                  >
                    {t("exit_turbo_mode")}
                  </button>
                </div>
              )}

              <p className="px-5 sm:px-6 pt-4 text-xs text-muted">
                {t("turbo_instructions")}
              </p>

              {!canEdit ? (
                <div className="py-10 text-center text-sm text-muted">
                  {t("only_managers_use_turbo")}
                </div>
              ) : usersLoading ? (
                <div className="py-10 text-center text-sm text-muted">{t("loading")}</div>
              ) : (
                <div className="divide-y divide-border/50 mt-2">
                  {users
                    .filter((u) => u.id !== state.user?.id && u.is_active)
                    .map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between px-5 sm:px-6 py-4 hover:bg-accent/30 transition-colors gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">
                            {u.name}
                          </div>
                          <div className="text-xs text-muted truncate">
                            {u.email} · {u.role}
                          </div>
                        </div>
                        <button
                          onClick={() => handleEnterTurbo(u)}
                          disabled={turboLoading === u.id || turboActive}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-sm)] bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                          <Zap size={12} />
                          {turboLoading === u.id ? t("entering") : t("turbo_as_this_user")}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {selectedLog && (
            <div
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedLog(null)}
            >
              <div
                className="bg-card border border-border rounded-[var(--radius-lg)] p-5 sm:p-6 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  {t("log_details")}
                </h3>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">{t("user_label")}</span>
                    <span className="text-foreground font-medium text-right">
                      {selectedLog.actorName}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">{t("action_label")}</span>
                    <span className="text-foreground font-medium text-right">
                      {selectedLog.action}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">{t("affected_record_label")}</span>
                    <span className="text-foreground font-medium text-right">
                      {selectedLog.entityType}
                      {selectedLog.entityName
                        ? ` — ${selectedLog.entityName}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">{t("date_time_label")}</span>
                    <span className="text-foreground font-medium text-right">
                      {new Date(selectedLog.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {selectedLog.details && (
                    <div>
                      <span className="text-muted block mb-1.5">{t("details_label")}</span>
                      <pre className="text-xs bg-background border border-border rounded-[var(--radius)] p-3 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="mt-5 w-full text-sm font-semibold text-muted hover:text-foreground py-2"
                >
                  {t("close")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmId && (
        <Confirm
          message={`Remove "${state.banks.find((b) => b.id === confirmId)?.name}" from the bank list?`}
          onConfirm={async () => {
            await handleDeleteBank(confirmId);
            setConfirmId(null);
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
