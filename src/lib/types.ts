export type Role = "manager" | "marketing_agent" | "stock_agent";

export function normalizeRole(role?: string): Role {
  if (!role) return "marketing_agent";
  const r = role.toLowerCase().trim().replace(/[-\s]/g, "_");
  if (r === "manager" || r === "stock_agent" || r === "marketing_agent") {
    return r as Role;
  }
  return "marketing_agent";
}

export type StockType = "production" | "marketing_agent" | "customer_sale" | "other";
export type PaymentStatus = "paid" | "loan";
export type PaymentMode = "cash" | "bank" | "telephone";
export type Page =
  | "dashboard"
  | "agents"
  | "products"
  | "clients"
  | "stock"
  | "reports"
  | "report"
  | "loans"
  | "payments"
  | "settings";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
}

export interface Agent {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  deleted: boolean;
}

export interface Product {
  id: string;
  name: string;
  unitName: string;          // e.g. "bar", "bottle", "piece"
  unitPrice: number;         // solo/piece price
  piecesPerBox: number | null;
  boxPrice: number | null;
  qtyPerBox?: number | null;  // legacy compatibility
  pricePerBox?: number | null;// legacy compatibility
  lowStockThreshold: number; // in base units (pieces)
  deleted: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  district: string;
  sector: string;
  center: string;
  agentId?: string;
  handlerId?: string;
  deleted: boolean;
}

export interface StockMovement {
  id: string;
  productId: string;
  date: string;
  type: StockType;
  agentId?: string;
  customerName?: string;
  location?: string;
  isReturn: boolean;
  unit: "box" | "piece";
  enteredQty: number;
  baseQty: number;
  stockIn: number;
  stockOut: number;
  balance: number;
  createdBy: string;
  unitPrice?: number;   // NEW
  totalPrice?: number;  // NEW
}

export interface AgentReport {
  id: string;
  agentId: string;
  clientId: string | null;
  customerName?: string;
  productId: string;
  date: string;
  unit: "box" | "piece";
  qty: number;       // entered quantity, in `unit`
  baseQty: number;    // boxes-equivalent, for stock accounting
  unitPrice: number;  // price per `unit`, editable per sale
  totalPrice: number;
  paymentStatus: PaymentStatus;
  createdBy: string;
  saleGroupId?: string;
  deleted: boolean;
}

export interface Payment {
  id: string;
  clientId?: string;
  agentId?: string;
  reportId?: string;
  date: string;
  amount: number;
  mode: PaymentMode;
  bankId?: string;
  receiverName?: string;
}

export interface Bank {
  id: string;
  name: string;
}

// NEW
export interface Expense {
  id: string;
  agentId: string;
  date: string;
  name: string;
  amount: number;
  createdBy: string;
}

export interface AppState {
  user: User | null;
  agents: Agent[];
  products: Product[];
  clients: Client[];
  stockMovements: StockMovement[];
  agentReports: AgentReport[];
  payments: Payment[];
  banks: Bank[];
  expenses: Expense[]; // NEW
}

export interface Versaiment {
  id: string;
  agentId: string;
  date: string;
  amount: number;
  status: "pending" | "approved";
  approvedBy?: string;
  approvedAt?: string;
}
