import { useState, useEffect } from "react";
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
import Report from "./pages/Report";
import Settings from "./pages/Settings";
import { normalizeRole, type Page } from "./lib/types";

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
    "report",
    "settings",
  ],
  marketing_agent: ["dashboard", "clients", "reports", "loans", "payments", "settings"],
  stock_agent: ["dashboard", "products", "stock", "report", "settings"],
};

function AppInner() {
  const { state, dispatch } = useStore();
  const [page, setPage] = useState<Page>("dashboard");
  const [transitionPhase, setTransitionPhase] = useState<"hidden" | "showing" | "fading">("hidden");

  const userRole = normalizeRole(state.user?.role);
  const allowedPages = ROLE_ALLOWED_PAGES[userRole] ?? ROLE_ALLOWED_PAGES.manager;

  useEffect(() => {
    if (state.user && !allowedPages.includes(page)) {
      setPage(allowedPages[0] || "dashboard");
    }
  }, [state.user, page, allowedPages]);

  const handleLoginSuccess = () => {
    setTransitionPhase("showing");
    setTimeout(() => setTransitionPhase("fading"), 1200);
    setTimeout(() => setTransitionPhase("hidden"), 1700);
  };

  if (!state.user) return <Login onLoginSuccess={handleLoginSuccess} />;

  const logout = async () => {
    if (state.user) {
      await supabase.from("auth_logs").insert({ user_id: state.user.id, event: "logout" });
    }
    localStorage.removeItem("sf_session_started");
    await supabase.auth.signOut();
    dispatch({ type: "SET_USER", payload: null });
  };

  return (
    <>
        {transitionPhase !== "hidden" && <SessionTransition phase={transitionPhase} />}
      <Layout page={page} setPage={setPage} user={state.user} onLogout={logout}>
      {page === "dashboard" && <Dashboard setPage={setPage} />}
      {page === "agents" && <Agents />}
      {page === "products" && <Products />}
      {page === "clients" && <Clients />}
      {page === "stock" && <StockMovement />}
      {page === "reports" && <AgentReports />}
      {page === "loans" && <Loans setPage={setPage} />}
      {page === "payments" && <Payments />}
      {page === "report" && <Report />}
      {page === "settings" && <Settings />}
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  );
}
