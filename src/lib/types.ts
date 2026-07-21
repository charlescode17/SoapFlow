export type Role = "manager" | "owner";
export type StockType = "production" | "marketing_agent" | "other";
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
  qtyPerBox: number;
  pricePerBox: number;
  lowStockThreshold: number;
  deleted: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  district: string;
  sector: string;
  center: string;
  deleted: boolean;
}

export interface StockMovement {
  id: string;
  productId: string;
  date: string;
  type: StockType;
  agentId?: string;
  location?: string;
  stockIn: number;
  stockOut: number;
  balance: number;
  createdBy: string;
}

export interface AgentReport {
  id: string;
  agentId: string;
  clientId: string;
  productId: string;
  date: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  createdBy: string;
  deleted: boolean;
}

export interface Payment {
  id: string;
  clientId: string;
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

export interface AppState {
  user: User | null;
  agents: Agent[];
  products: Product[];
  clients: Client[];
  stockMovements: StockMovement[];
  agentReports: AgentReport[];
  payments: Payment[];
  banks: Bank[];
}
