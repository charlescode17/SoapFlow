import type { AppState } from './types'

export const INITIAL_STATE: AppState = {
  user: null,
  agents: [],
  products: [],
  clients: [],
  stockMovements: [],
  agentReports: [],
  payments: [],
  banks: [
    { id: 'b1', name: 'Bank of Kigali' },
    { id: 'b2', name: 'Equity Bank Rwanda' },
    { id: 'b3', name: 'I&M Bank Rwanda' },
    { id: 'b4', name: 'Cogebanque' },
    { id: 'b5', name: 'Ecobank Rwanda' },
  ],
  expenses: [],
}
