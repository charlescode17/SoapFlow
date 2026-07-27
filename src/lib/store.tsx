import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { INITIAL_STATE } from "./mock";
import type {
  AppState,
  Agent,
  Product,
  Client,
  StockMovement,
  AgentReport,
  Payment,
  Bank,
  User,
} from "./types";

type Action =
  | { type: "SET_USER"; payload: User | null }
  | { type: "ADD_AGENT"; payload: Agent }
  | { type: "UPDATE_AGENT"; payload: Agent }
  | { type: "DELETE_AGENT"; id: string }
  | { type: "ADD_PRODUCT"; payload: Product }
  | { type: "UPDATE_PRODUCT"; payload: Product }
  | { type: "DELETE_PRODUCT"; id: string }
  | { type: "ADD_CLIENT"; payload: Client }
  | { type: "UPDATE_CLIENT"; payload: Client }
  | { type: "DELETE_CLIENT"; id: string }
  | { type: "ADD_STOCK_MOVEMENT"; payload: StockMovement }
  | { type: "ADD_AGENT_REPORT"; payload: AgentReport }
  | { type: "UPDATE_AGENT_REPORT"; payload: AgentReport }
  | { type: "DELETE_AGENT_REPORT"; id: string }
  | { type: "ADD_PAYMENT"; payload: Payment }
  | { type: "ADD_BANK"; payload: Bank }
  | { type: "DELETE_BANK"; id: string }
  | { type: "SET_BANKS"; payload: Bank[] }
  | { type: "SET_PRODUCTS"; payload: Product[] }
  | { type: "SET_CLIENTS"; payload: Client[] }
  | { type: "SET_STOCK_MOVEMENTS"; payload: StockMovement[] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.payload };
    case "ADD_AGENT":
      return { ...state, agents: [...state.agents, action.payload] };
    case "UPDATE_AGENT":
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === action.payload.id ? action.payload : a,
        ),
      };
    case "DELETE_AGENT":
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === action.id ? { ...a, deleted: true } : a,
        ),
      };
    case "ADD_PRODUCT":
      return { ...state, products: [...state.products, action.payload] };
    case "UPDATE_PRODUCT":
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.payload.id ? action.payload : p,
        ),
      };
    case "DELETE_PRODUCT":
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.id ? { ...p, deleted: true } : p,
        ),
      };
    case "SET_PRODUCTS":
      return { ...state, products: action.payload };
    case "SET_CLIENTS":
      return { ...state, clients: action.payload };
    case "SET_STOCK_MOVEMENTS":
      return { ...state, stockMovements: action.payload };
    case "ADD_CLIENT":
      return { ...state, clients: [...state.clients, action.payload] };
    case "UPDATE_CLIENT":
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === action.payload.id ? action.payload : c,
        ),
      };
    case "DELETE_CLIENT":
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === action.id ? { ...c, deleted: true } : c,
        ),
      };
    case "ADD_STOCK_MOVEMENT":
      return {
        ...state,
        stockMovements: [...state.stockMovements, action.payload],
      };
    case "ADD_AGENT_REPORT":
      return {
        ...state,
        agentReports: [...state.agentReports, action.payload],
      };
    case "UPDATE_AGENT_REPORT":
      return {
        ...state,
        agentReports: state.agentReports.map((r) =>
          r.id === action.payload.id ? action.payload : r,
        ),
      };
    case "DELETE_AGENT_REPORT":
      return {
        ...state,
        agentReports: state.agentReports.map((r) =>
          r.id === action.id ? { ...r, deleted: true } : r,
        ),
      };
    case "ADD_PAYMENT":
      return { ...state, payments: [...state.payments, action.payload] };
    case "ADD_BANK":
      return { ...state, banks: [...state.banks, action.payload] };
    case "DELETE_BANK":
      return { ...state, banks: state.banks.filter((b) => b.id !== action.id) };
    case "SET_BANKS":
      return { ...state, banks: action.payload };
    default:
      return state;
  }
}

const StoreContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  useEffect(() => {
    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (profile) {
          dispatch({
            type: "SET_USER",
            payload: {
              id: profile.id,
              name: profile.name,
              email: profile.email,
              role: profile.role,
              phone: profile.phone,
            },
          });
          if (!localStorage.getItem("sf_session_started")) {
            localStorage.setItem("sf_session_started", Date.now().toString());
          }
        }
      }
    }
    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) dispatch({ type: "SET_USER", payload: null });
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Enforce a 24h session limit ourselves, since Supabase's built-in
  // session timeout setting requires the Pro plan.
  useEffect(() => {
    function checkExpiry() {
      const startedAt = localStorage.getItem("sf_session_started");
      if (startedAt && Date.now() - Number(startedAt) > 24 * 60 * 60 * 1000) {
        localStorage.removeItem("sf_session_started");
        supabase.auth.signOut();
        dispatch({ type: "SET_USER", payload: null });
      }
    }
    checkExpiry();
    const interval = setInterval(checkExpiry, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadBanks() {
      const { data } = await supabase.from("banks").select("*").order("name");
      if (data) dispatch({ type: "SET_BANKS", payload: data });
    }
    if (state.user) loadBanks();
  }, [state.user?.id]);

  useEffect(() => {
    async function loadProducts() {
      const { data } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (data) {
        dispatch({
          type: "SET_PRODUCTS",
          payload: data.map((p: any) => ({
            id: p.id,
            name: p.name,
            qtyPerBox: p.qty_per_box,
            pricePerBox: p.price_per_box,
            lowStockThreshold: p.low_stock_threshold,
            deleted: p.deleted,
          })),
        });
      }
    }
    if (state.user) loadProducts();
  }, [state.user?.id]);

  useEffect(() => {
    async function loadClients() {
      const { data } = await supabase.from("clients").select("*").order("name");
      if (data) dispatch({ type: "SET_CLIENTS", payload: data });
    }
    if (state.user) loadClients();
  }, [state.user?.id]);

  useEffect(() => {
    async function loadStockMovements() {
      const { data } = await supabase
        .from("stock_movements")
        .select("*")
        .order("created_at");
      if (data) {
        dispatch({
          type: "SET_STOCK_MOVEMENTS",
          payload: data.map((m: any) => ({
            id: m.id,
            productId: m.product_id,
            date: m.date,
            type: m.type,
            agentId: m.agent_id ?? undefined,
            customerName: m.customer_name ?? undefined,
            location: m.location ?? undefined,
            isReturn: m.is_return,
            unit: m.unit,
            enteredQty: m.entered_qty,
            baseQty: m.base_qty,
            stockIn: m.stock_in,
            stockOut: m.stock_out,
            balance: m.balance,
            createdBy: m.created_by,
          })),
        });
      }
    }
    if (state.user) loadStockMovements();
  }, [state.user?.id]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
