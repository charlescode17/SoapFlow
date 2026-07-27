import { useState, useEffect } from 'react'
import { AlertTriangle, TrendingUp, TrendingDown, Package, Users, CreditCard, DollarSign } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useStore } from '../lib/store'
import { useTypewriter } from '../lib/useTypewriter'
import { fmt, fmtDate } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props { setPage: (p: Page) => void }

function currentStock(movements: ReturnType<typeof useStore>['state']['stockMovements'], productId: string) {
  const filtered = movements.filter(m => m.productId === productId)
  return filtered.length ? filtered[filtered.length - 1].balance : 0
}

const EYEBROW_PHRASES = [
  'Every bar.\nEvery box.\nEvery client.',
  'Track stock\nin real time.',
  'Manage your\nmarketing agents.',
  'Generate reports\nin one click.',
]

export default function Dashboard({ setPage }: Props) {
  const { state } = useStore()
  const { stockMovements, agentReports, payments, products, clients, agents } = state

  const eyebrow = useTypewriter(EYEBROW_PHRASES, 45, 25, 1600).split('\n').join(' ')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const isStockAgent = state.user?.role === 'stock_agent'

  if (isStockAgent) {
    const activeProducts = products.filter(p => !p.deleted)
    return (
      <div className="p-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">{greeting}, {state.user?.name.split(' ')[0]} 👋</h1>
          <p className="text-muted text-sm mt-1">{dateStr}</p>
        </div>

        <h2 className="text-sm font-semibold text-foreground mb-4">Products ({activeProducts.length})</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {activeProducts.map(p => {
            const baseStock = currentStock(stockMovements, p.id)
            const boxes = p.piecesPerBox ? Math.floor(baseStock / p.piecesPerBox) : null
            const remainder = p.piecesPerBox ? baseStock % p.piecesPerBox : baseStock
            const value = baseStock * p.unitPrice
            return (
              <div key={p.id} className="bg-card border border-border rounded-[var(--radius-lg)] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-[var(--radius)] bg-primary/10 flex items-center justify-center">
                    <Package size={16} className="text-primary" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">{p.name}</div>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {baseStock.toLocaleString()} {p.unitName}{baseStock !== 1 ? 's' : ''}
                </div>
                {boxes !== null && (
                  <div className="text-xs text-muted mt-1">
                    ≈ {boxes} box{boxes !== 1 ? 'es' : ''}{remainder > 0 ? ` + ${remainder} loose` : ''}
                  </div>
                )}
                <div className="text-xs text-muted mt-2 pt-2 border-t border-border/60">
                  Value: <span className="font-mono text-foreground">{fmt(value)}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5 max-w-sm">
          <div className="text-xs text-muted mb-1">Stock Value (All Products)</div>
          <div className="text-xl font-bold text-foreground">
            {fmt(activeProducts.reduce((s, p) => s + currentStock(stockMovements, p.id) * p.unitPrice, 0))}
          </div>
        </div>
      </div>
    )
  }

  const activeReports = agentReports.filter(r => !r.deleted)
  const totalRevenue = activeReports.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + r.totalPrice, 0)
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const loanReportTotal = activeReports.filter(r => r.paymentStatus === 'loan').reduce((s, r) => s + r.totalPrice, 0)
  const outstandingLoans = Math.max(0, loanReportTotal - totalPaid)
  const activeClients = clients.filter(c => !c.deleted).length
  const totalStock = products.filter(p => !p.deleted).reduce((s, p) => s + currentStock(stockMovements, p.id), 0)

  const lowStockProducts = products.filter(p => !p.deleted && currentStock(stockMovements, p.id) < p.lowStockThreshold)

  const stockChartData = stockMovements.map(m => ({
    date: fmtDate(m.date),
    Balance: m.balance,
    'Stock In': m.stockIn,
    'Stock Out': m.stockOut,
  }))

  const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
  const monthlyData = months.map((m, i) => ({
    month: m,
    Revenue: [210000, 385000, 297500, 440000, 522500, totalRevenue][i],
    Loans: [82500, 165000, 110000, 247500, 357500, outstandingLoans][i],
  }))

  const modeCounts = payments.reduce((acc, p) => {
    acc[p.mode] = (acc[p.mode] || 0) + p.amount
    return acc
  }, {} as Record<string, number>)
  const pieData = Object.entries(modeCounts).map(([name, value]) => ({ name, value }))
  const PIE_COLORS = ['#2E9E8F', '#D99A3D', '#3FA66B']

  const kpis = [
    { label: 'Total Stock', value: `${totalStock.toLocaleString()} boxes`, icon: Package, color: 'primary', trend: '+200 today', trendUp: true },
    { label: 'Revenue (Paid)', value: fmt(totalRevenue), icon: DollarSign, color: 'success', trend: `${activeReports.filter(r => r.paymentStatus === 'paid').length} sales`, trendUp: true },
    { label: 'Outstanding Loans', value: fmt(outstandingLoans), icon: CreditCard, color: 'secondary', trend: `${activeReports.filter(r => r.paymentStatus === 'loan').length} clients`, trendUp: false },
    { label: 'Active Clients', value: activeClients.toString(), icon: Users, color: 'foreground', trend: `${agents.filter(a => !a.deleted).length} agents`, trendUp: true },
  ]

  const colorMap: Record<string, string> = {
    primary: '#2E9E8F', success: '#3FA66B', secondary: '#D99A3D', foreground: '#1B2321',
  }

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="h-4 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary/70">
            {eyebrow}
            <span className="animate-pulse">|</span>
          </span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">{greeting}, {state.user?.name.split(' ')[0]} 👋</h1>
        <p className="text-muted text-sm mt-1">{dateStr}</p>
      </div>

      {/* Low stock alert */}
      {lowStockProducts.length > 0 && (
        <div className="mb-6 bg-secondary/10 border border-secondary/30 rounded-[var(--radius)] px-4 py-3 flex items-center gap-3 animate-in fade-in duration-300">
          <AlertTriangle size={16} className="text-secondary flex-shrink-0" />
          <span className="text-sm text-foreground">
            <strong>Low stock alert:</strong>{' '}
            {lowStockProducts.map(p => `${p.name} (${currentStock(stockMovements, p.id)} boxes remaining)`).join(', ')}
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map(kpi => (
          <div
            key={kpi.label}
            className="bg-card border border-border rounded-[var(--radius-lg)] p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20"
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-9 h-9 rounded-[var(--radius)] flex items-center justify-center"
                style={{ background: colorMap[kpi.color] + '18' }}
              >
                <kpi.icon size={17} style={{ color: colorMap[kpi.color] }} />
              </div>
            </div>
            <div className="text-xl font-bold text-foreground mb-0.5">{kpi.value}</div>
            <div className="text-xs text-muted mb-2">{kpi.label}</div>
            <div className="flex items-center gap-1">
              {kpi.trendUp
                ? <TrendingUp size={11} className="text-success" />
                : <TrendingDown size={11} className="text-success" />}
              <span className="text-[11px] text-muted">{kpi.trend}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Stock trend */}
        <div className="lg:col-span-2 bg-card border border-border rounded-[var(--radius-lg)] p-6 transition-shadow duration-200 hover:shadow-md">
          <h3 className="text-sm font-semibold text-foreground mb-1">Stock Movement</h3>
          <p className="text-xs text-muted mb-5">Running balance over time</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stockChartData}>
              <defs>
                <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2E9E8F" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#2E9E8F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7B78' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6B7B78' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: '1px solid #E4EAE8', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(v: number) => [`${v} boxes`, 'Balance']}
              />
              <Area type="monotone" dataKey="Balance" stroke="#2E9E8F" strokeWidth={2} fill="url(#tealGrad)" dot={{ fill: '#2E9E8F', r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Payment modes */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-6 transition-shadow duration-200 hover:shadow-md">
          <h3 className="text-sm font-semibold text-foreground mb-1">Payment Modes</h3>
          <p className="text-xs text-muted mb-5">By total amount received</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-card border border-border rounded-[var(--radius-lg)] p-6 transition-shadow duration-200 hover:shadow-md">
          <h3 className="text-sm font-semibold text-foreground mb-1">Revenue vs Outstanding Loans</h3>
          <p className="text-xs text-muted mb-5">Monthly comparison (RWF)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B7B78' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6B7B78' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => fmt(v)} />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Revenue" fill="#2E9E8F" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Loans" fill="#D99A3D" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quick links */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-6 transition-shadow duration-200 hover:shadow-md">
          <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {stockMovements.slice(-5).reverse().map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.stockIn > 0 ? 'bg-success' : 'bg-danger'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground capitalize">
                    {m.type === 'production' ? 'Production' : m.type === 'marketing_agent' ? 'Agent dispatch' : 'Other'}
                  </div>
                  <div className="text-[11px] text-muted">{fmtDate(m.date)}</div>
                </div>
                <div className={`text-xs font-mono ${m.stockIn > 0 ? 'text-success' : 'text-danger'}`}>
                  {m.stockIn > 0 ? `+${m.stockIn}` : `-${m.stockOut}`}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setPage('stock')}
            className="mt-4 text-xs text-primary font-medium hover:underline"
          >
            View all movements →
          </button>
        </div>
      </div>
    </div>
  )
}