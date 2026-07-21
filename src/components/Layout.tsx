import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  UserCheck,
  ArrowLeftRight,
  FileText,
  BarChart3,
  CreditCard,
  Banknote,
  Settings,
  LogOut,
  Droplets,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  X,
} from "lucide-react";
import type { Page, User } from "../lib/types";

const NAV: {
  id: Page;
  label: string;
  icon: React.ElementType;
  group?: string;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "agents", label: "Marketing Agents", icon: Users, group: "Operations" },
  { id: "products", label: "Products", icon: Package, group: "Operations" },
  { id: "clients", label: "Clients", icon: UserCheck, group: "Operations" },
  {
    id: "stock",
    label: "Stock Movement",
    icon: ArrowLeftRight,
    group: "Reports",
  },
  { id: "reports", label: "Agent Reports", icon: FileText, group: "Reports" },
  { id: "loans", label: "Loans", icon: CreditCard, group: "Reports" },
  { id: "payments", label: "Payments", icon: Banknote, group: "Reports" },
  { id: "report", label: "Report", icon: BarChart3, group: "Reports" },
  { id: "settings", label: "Settings", icon: Settings, group: "System" },
];

interface Props {
  page: Page;
  setPage: (p: Page) => void;
  user: User;
  onLogout: () => void;
  children: ReactNode;
}

export function Layout({ page, setPage, user, onLogout, children }: Props) {
  const groups = ["", "Operations", "Reports", "System"];

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavClick = (id: Page) => {
    setPage(id);
    setMobileOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden relative">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar flex items-center justify-between px-4 z-30 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[var(--radius)] bg-primary flex items-center justify-center">
            <Droplets size={16} className="text-white" />
          </div>
          <span className="text-white font-bold text-sm">SoapFlow</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="text-white/70 hover:text-white p-2 -mr-2"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          bg-sidebar flex flex-col h-full flex-shrink-0 transition-all duration-300 ease-in-out z-50
          fixed lg:static top-0 left-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${collapsed ? "lg:w-[72px]" : "lg:w-60"}
          w-64
        `}
      >
        {/* Logo + collapse/close controls */}
        <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between">
          <div
            className={`flex items-center gap-2.5 overflow-hidden ${collapsed ? "lg:hidden" : ""}`}
          >
            <div className="w-8 h-8 rounded-[var(--radius)] bg-primary flex items-center justify-center flex-shrink-0">
              <Droplets size={16} className="text-white" />
            </div>
            <div className="whitespace-nowrap">
              <div className="text-white font-bold text-sm leading-tight">
                SoapFlow
              </div>
              <div className="text-white/40 text-[10px] leading-tight">
                {/* Manufacturing & Distribution */}
              </div>
            </div>
          </div>

          {collapsed && (
            <div className="hidden lg:flex w-8 h-8 rounded-[var(--radius)] bg-primary items-center justify-center flex-shrink-0 mx-auto">
              <Droplets size={16} className="text-white" />
            </div>
          )}

          {/* desktop collapse toggle — lives in the header now, saves a full row */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={`hidden lg:flex text-white/40 hover:text-white/80 p-1.5 rounded-[var(--radius-sm)] hover:bg-white/5 transition-colors ${collapsed ? "" : "ml-2"}`}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <ChevronsRight size={15} />
            ) : (
              <ChevronsLeft size={15} />
            )}
          </button>

          {/* mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-white/50 hover:text-white p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav — compact spacing, no wasted vertical space */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5">
          {groups.map((group) => {
            const items = NAV.filter((n) => (n.group ?? "") === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mb-1.5">
                {group && (
                  <div
                    className={`text-white/30 text-[9px] font-semibold uppercase tracking-widest px-2.5 mb-1 mt-2.5 whitespace-nowrap ${collapsed ? "lg:hidden" : ""}`}
                  >
                    {group}
                  </div>
                )}
                {items.map((item) => {
                  const active = page === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius)] mb-0.5 text-[13px] font-medium transition-all group ${
                        collapsed ? "lg:justify-center lg:px-0" : ""
                      } ${
                        active
                          ? "bg-primary/20 text-primary"
                          : "text-white/50 hover:text-white/90 hover:bg-white/5"
                      }`}
                    >
                      <item.icon
                        size={15}
                        className={`flex-shrink-0 ${active ? "text-primary" : "text-white/40 group-hover:text-white/70"}`}
                      />
                      <span
                        className={`flex-1 text-left whitespace-nowrap ${collapsed ? "lg:hidden" : ""}`}
                      >
                        {item.label}
                      </span>
                      {active && (
                        <ChevronRight
                          size={11}
                          className={`text-primary/60 ${collapsed ? "lg:hidden" : ""}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-2.5 py-2.5 border-t border-white/5">
          <div
            className={`flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius)] hover:bg-white/5 transition-colors ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
          >
            <div className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-primary text-xs font-bold">
                {user.name.charAt(0)}
              </span>
            </div>
            <div className={`flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
              <div className="text-white/80 text-xs font-medium truncate">
                {user.name}
              </div>
              <div
                className={`text-[10px] font-semibold capitalize ${user.role === "manager" ? "text-primary/80" : "text-secondary/80"}`}
              >
                {user.role}
              </div>
            </div>
            <button
              onClick={onLogout}
              className={`text-white/30 hover:text-danger transition-colors ml-1 ${collapsed ? "lg:hidden" : ""}`}
              title="Log out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-background pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
