import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { StoreProvider, useStore } from "./lib/store";
import { Layout } from "./components/Layout";
import { SessionTransition } from "./components/SessionTransition";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Products from "./pages/Products";
import Clients from "./pages/Clients";
import StockMovement from "./pages/StockMovement";
import AgentReports from "./pages/AgentReports";
import Loans from "./pages/Loans";
import Payments from "./pages/Payments";
import Versaiment from "./pages/Versaiment";
import Report from "./pages/Report";
import Settings from "./pages/Settings";
import { normalizeRole, type Page } from "./lib/types";

const turboActive = typeof window !== "undefined" && !!sessionStorage.getItem("turbo_origin_session");

const PAGE_PATHS: Record<Page, string> = {
  dashboard: "/dashboard",
  agents: "/agents",
  products: "/products",
  clients: "/clients",
  stock: "/stock",
  reports: "/reports",
  loans: "/loans",
  payments: "/payments",
  versaiment: "/versaiment",
  report: "/report",
  settings: "/settings",
};

const ROLE_ALLOWED_PAGES: Record<string, Page[]> = {
  manager: [
    "dashboard",
    "agents",
    "products",
    "clients",
    "stock",
    "reports",
    "loans",
    "payments",
    "versaiment",
    "report",
    "settings",
  ],
  marketing_agent: ["dashboard", "clients", "reports", "loans", "payments", "versaiment", "report", "settings"],
  stock_agent: ["dashboard", "products", "stock", "report", "settings"],
};

function getPageFromPath(pathname: string): Page {
  const normalized = pathname === "/" ? "/dashboard" : pathname;
  const pageKey = Object.entries(PAGE_PATHS).find(([, route]) => route === normalized)?.[0] as Page | undefined;
  return pageKey ?? "dashboard";
}

function AppInner() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [transitionPhase, setTransitionPhase] = useState<"hidden" | "showing" | "fading">("hidden");

  const page = getPageFromPath(location.pathname);
  const userRole = normalizeRole(state.user?.role);
  const allowedPages = ROLE_ALLOWED_PAGES[userRole] ?? ROLE_ALLOWED_PAGES.manager;

  const setPage = (nextPage: Page) => {
    navigate(PAGE_PATHS[nextPage] ?? PAGE_PATHS.dashboard, { replace: false });
  };

  useEffect(() => {
    if (state.user && !allowedPages.includes(page)) {
      const fallbackPage = allowedPages[0] || "dashboard";
      navigate(PAGE_PATHS[fallbackPage], { replace: true });
    }
  }, [state.user, page, allowedPages, navigate]);

  const handleLoginSuccess = () => {
    setTransitionPhase("showing");
    setTimeout(() => setTransitionPhase("fading"), 1200);
    setTimeout(() => setTransitionPhase("hidden"), 1700);
    navigate(PAGE_PATHS.dashboard, { replace: true });
  };

  if (!state.user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const logout = async () => {
    const turboOriginSession = sessionStorage.getItem("turbo_origin_session");
    const turboOriginUser = sessionStorage.getItem("turbo_origin_user");

    if (turboOriginSession && turboOriginUser) {
      const originSession = JSON.parse(turboOriginSession);
      const originUser = JSON.parse(turboOriginUser);

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
      return;
    }

    if (state.user) {
      await supabase.from("auth_logs").insert({ user_id: state.user.id, event: "logout" });
    }
    localStorage.removeItem("sf_session_started");
    await supabase.auth.signOut();
    dispatch({ type: "SET_USER", payload: null });
    navigate("/", { replace: true });
  };

  return (
    <>
      {transitionPhase !== "hidden" && <SessionTransition phase={transitionPhase} />}
      {turboActive && (
        <div className="bg-danger text-white text-center text-xs font-semibold py-2 px-4">
          ⚡ Turbo Mode active — you're acting as {state.user?.name}. Click Logout to exit turbo mode.
        </div>
      )}
      <Layout page={page} setPage={setPage} user={state.user} onLogout={logout}>
        <Routes>
          <Route path="/" element={<Navigate to={PAGE_PATHS[allowedPages[0] || "dashboard"]} replace />} />
          <Route path={PAGE_PATHS.dashboard} element={<Dashboard setPage={setPage} />} />
          <Route path={PAGE_PATHS.agents} element={<Agents />} />
          <Route path={PAGE_PATHS.products} element={<Products />} />
          <Route path={PAGE_PATHS.clients} element={<Clients />} />
          <Route path={PAGE_PATHS.stock} element={<StockMovement />} />
          <Route path={PAGE_PATHS.reports} element={<AgentReports />} />
          <Route path={PAGE_PATHS.loans} element={<Loans setPage={setPage} />} />
          <Route path={PAGE_PATHS.payments} element={<Payments />} />
          <Route path={PAGE_PATHS.versaiment} element={<Versaiment />} />
          <Route path={PAGE_PATHS.report} element={<Report />} />
          <Route path={PAGE_PATHS.settings} element={<Settings />} />
          <Route path="*" element={<Navigate to={PAGE_PATHS[allowedPages[0] || "dashboard"]} replace />} />
        </Routes>
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </StoreProvider>
  );
}