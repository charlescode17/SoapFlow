import { createContext, useContext, useReducer, type ReactNode } from 'react'
import { INITIAL_STATE } from './mock'
import type { AppState, Agent, Product, Client, StockMovement, AgentReport, Payment, Bank, User } from './types'

type Action =
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'ADD_AGENT'; payload: Agent }
  | { type: 'UPDATE_AGENT'; payload: Agent }
  | { type: 'DELETE_AGENT'; id: string }
  | { type: 'ADD_PRODUCT'; payload: Product }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'DELETE_PRODUCT'; id: string }
  | { type: 'ADD_CLIENT'; payload: Client }
  | { type: 'UPDATE_CLIENT'; payload: Client }
  | { type: 'DELETE_CLIENT'; id: string }
  | { type: 'ADD_STOCK_MOVEMENT'; payload: StockMovement }
  | { type: 'ADD_AGENT_REPORT'; payload: AgentReport }
  | { type: 'UPDATE_AGENT_REPORT'; payload: AgentReport }
  | { type: 'DELETE_AGENT_REPORT'; id: string }
  | { type: 'ADD_PAYMENT'; payload: Payment }
  | { type: 'ADD_BANK'; payload: Bank }
  | { type: 'DELETE_BANK'; id: string }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload }
    case 'ADD_AGENT':
      return { ...state, agents: [...state.agents, action.payload] }
    case 'UPDATE_AGENT':
      return { ...state, agents: state.agents.map(a => a.id === action.payload.id ? action.payload : a) }
    case 'DELETE_AGENT':
      return { ...state, agents: state.agents.map(a => a.id === action.id ? { ...a, deleted: true } : a) }
    case 'ADD_PRODUCT':
      return { ...state, products: [...state.products, action.payload] }
    case 'UPDATE_PRODUCT':
      return { ...state, products: state.products.map(p => p.id === action.payload.id ? action.payload : p) }
    case 'DELETE_PRODUCT':
      return { ...state, products: state.products.map(p => p.id === action.id ? { ...p, deleted: true } : p) }
    case 'ADD_CLIENT':
      return { ...state, clients: [...state.clients, action.payload] }
    case 'UPDATE_CLIENT':
      return { ...state, clients: state.clients.map(c => c.id === action.payload.id ? action.payload : c) }
    case 'DELETE_CLIENT':
      return { ...state, clients: state.clients.map(c => c.id === action.id ? { ...c, deleted: true } : c) }
    case 'ADD_STOCK_MOVEMENT':
      return { ...state, stockMovements: [...state.stockMovements, action.payload] }
    case 'ADD_AGENT_REPORT':
      return { ...state, agentReports: [...state.agentReports, action.payload] }
    case 'UPDATE_AGENT_REPORT':
      return { ...state, agentReports: state.agentReports.map(r => r.id === action.payload.id ? action.payload : r) }
    case 'DELETE_AGENT_REPORT':
      return { ...state, agentReports: state.agentReports.map(r => r.id === action.id ? { ...r, deleted: true } : r) }
    case 'ADD_PAYMENT':
      return { ...state, payments: [...state.payments, action.payload] }
    case 'ADD_BANK':
      return { ...state, banks: [...state.banks, action.payload] }
    case 'DELETE_BANK':
      return { ...state, banks: state.banks.filter(b => b.id !== action.id) }
    default:
      return state
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
