import { AlertTriangle, TrendingUp, TrendingDown, Package, Users, CreditCard, DollarSign } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useStore } from '../lib/store'
import { useTypewriter } from '../lib/useTypewriter'
import { useI18n } from '../lib/i18n'
import { fmt, fmtDate } from '../lib/utils'
import { normalizeRole, type Page } from '../lib/types'

function getLastMonths(n: number, locale: string) {
  const out: { key: string; label: string }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(locale, { month: 'short' }),
    })
  }
  return out
}

interface Props { setPage: (p: Page) => void }

function currentStock(movements: ReturnType<typeof useStore>['state']['stockMovements'], productId: string) {
  if (!Array.isArray(movements)) return 0
  const filtered = movements.filter(m => m.productId === productId)
  return filtered.length ? filtered[filtered.length - 1].balance : 0
}

const EYEBROW_PHRASES: Record<string, string[]> = {
  en: [
    'Every bar.\nEvery box.\nEvery client.',
    'Track stock\nin real time.',
    'Manage your\nmarketing agents.',
    'Generate reports\nin one click.',
  ],
  fr: [
    'Chaque barre.\nChaque boîte.\nChaque client.',
    'Suivez le stock\nen temps réel.',
    'Gérez vos\nagents marketing.',
    'Générez des rapports\nen un clic.',
  ],
  rw: [
    'Buri barre.\nBuri gasanduku.\nBuri mukiriya.',
    'Kurikirana ibicuruzwa\nmu gihe nyacyo.',
    'Tegura ababoneka\nbwamamaza.',
    'Tunganya raporo\nmu gakoro kamwe.',
  ],
}

export default function Dashboard({ setPage }: Props) {
  const { state } = useStore()
  const { lang, t } = useI18n()
  const { stockMovements = [], agentReports = [], payments = [], products = [], clients = [], agents = [] } = state

  const eyebrow = useTypewriter(EYEBROW_PHRASES[lang], 45, 25, 1600).split('\n').join(' ')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('good_morning') : hour < 18 ? t('good_afternoon') : t('good_evening')
  const dateStr = new Date().toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const userRole = normalizeRole(state.user?.role)
  const isStockAgent = userRole === 'stock_agent'
  const userName = (state.user?.name || 'User').trim().split(' ')[0] || 'User'

  if (isStockAgent) {
    const activeProducts = products.filter(p => !p.deleted)

    // ── Per-product inventory ──────────────────────────────────
    // balance is in "boxes" from stock_movements
    const productInventory = activeProducts.map(p => {
      const balanceBoxes = currentStock(stockMovements, p.id)          // boxes
      const piecesPerBox = p.piecesPerBox ?? p.qtyPerBox ?? null
      const boxPrice     = p.boxPrice ?? p.pricePerBox ?? null
      const unitPrice    = p.unitPrice ?? 0

      // Total pieces from all stockIn/Out so we can split remaining
      const totalPieces = piecesPerBox ? balanceBoxes * piecesPerBox : null

      // Boxes and leftover pieces
      const fullBoxes    = piecesPerBox ? Math.floor(balanceBoxes) : balanceBoxes
      const leftoverPcs  = piecesPerBox ? Math.round((balanceBoxes - fullBoxes) * piecesPerBox) : 0

      // Stock value
      const stockValue   = boxPrice
        ? balanceBoxes * boxPrice
        : totalPieces != null
          ? totalPieces * unitPrice
          : balanceBoxes * unitPrice

      return { product: p, balanceBoxes, fullBoxes, leftoverPcs, totalPieces, stockValue, piecesPerBox, boxPrice }
    })

    const totalStockValue = productInventory.reduce((s, r) => s + r.stockValue, 0)

    // ── KPI numbers ────────────────────────────────────────────
    const totalStockIn  = stockMovements.reduce((s, m) => s + m.stockIn, 0)
    const totalStockOut = stockMovements.reduce((s, m) => s + m.stockOut, 0)
    const now = new Date()
    const monthlyNet = stockMovements
      .filter(m => {
        const d = new Date(m.date)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce((s, m) => s + m.stockIn - m.stockOut, 0)

    // ── Trend chart data ───────────────────────────────────────
    const trendMap = new Map<string, { In: number; Out: number }>()
    stockMovements.forEach(m => {
      const prev = trendMap.get(m.date) ?? { In: 0, Out: 0 }
      trendMap.set(m.date, { In: prev.In + m.stockIn, Out: prev.Out + m.stockOut })
    })
    const trendData = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, v]) => ({ date: fmtDate(date), In: v.In, Out: v.Out }))

    // ── Per-product balance bar chart ──────────────────────────
    const productBalanceData = activeProducts.map(p => ({
      name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
      Balance: currentStock(stockMovements, p.id),
    })).filter(d => d.Balance > 0)

    // ── Recent 8 movements ─────────────────────────────────────
    const recentMoves = [...stockMovements].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8)

    const kpis = [
      { label: 'total_stock_in',  value: `+${totalStockIn.toLocaleString()}`,  sub: 'all_time_boxes', color: '#3FA66B', icon: TrendingUp },
      { label: 'total_stock_out', value: `-${totalStockOut.toLocaleString()}`, sub: 'all_time_boxes', color: '#E05C5C', icon: TrendingDown },
      { label: 'this_month_net',  value: (monthlyNet >= 0 ? '+' : '') + monthlyNet.toLocaleString(), sub: 'net_change', color: '#D99A3D', icon: DollarSign },
    ]

    const PRODUCT_COLORS = ['#2E9E8F','#3FA66B','#D99A3D','#7C6FE0','#E05C5C','#5B9BD5']

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{greeting}, {userName} 👋</h1>
          <p className="text-muted text-sm mt-1">{dateStr}</p>
        </div>

        {/* ── Product Inventory Cards ──────────────────────────── */}
        <div className="mb-6 lg:mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('current_inventory')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('live_stock_from_database')}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted uppercase tracking-wide">{t('total_stock_value')}</div>
              <div className="text-base font-bold text-foreground">{totalStockValue.toLocaleString()} RWF</div>
            </div>
          </div>

          {activeProducts.length === 0 ? (
            <div className="bg-card border border-border rounded-[var(--radius-lg)] p-8 text-center text-sm text-muted">
              {t('no_products_found_add_products_first')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {productInventory.map((item, idx) => {
                const color = PRODUCT_COLORS[idx % PRODUCT_COLORS.length]
                const isLow = item.balanceBoxes < item.product.lowStockThreshold
                return (
                  <div
                    key={item.product.id}
                    className={`bg-card border rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${isLow ? 'border-amber-300 bg-amber-50/30' : 'border-border'}`}
                  >
                    {/* Product name + low stock badge */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-sm font-semibold text-foreground truncate">{item.product.name}</span>
                      </div>
                      {isLow && (
                        <span className="ml-2 flex-shrink-0 text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{t('low_stock')}</span>
                      )}
                    </div>

                    {/* Stock breakdown */}
                    <div className="space-y-1.5 mb-3">
                      {item.piecesPerBox ? (
                        <>
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-muted">{t('full_boxes')}</span>
                            <span className="text-sm font-bold text-foreground">{item.fullBoxes.toLocaleString()}</span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-muted">{t('leftover_pieces')}</span>
                            <span className="text-sm font-bold text-foreground">
                              {item.leftoverPcs > 0 ? item.leftoverPcs : '—'}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted/70">
                            {item.piecesPerBox} {t('pcs_per_box')}
                            {item.totalPieces != null && ` · ${item.totalPieces.toLocaleString()} ${t('pcs_total')}`}
                          </div>
                        </>
                      ) : (
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-muted">{t('boxes_in_stock')}</span>
                          <span className="text-sm font-bold text-foreground">{item.balanceBoxes.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border/60 pt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted">{t('stock_value')}</span>
                        <span className="text-xs font-semibold" style={{ color }}>
                          {item.stockValue.toLocaleString()} RWF
                        </span>
                      </div>
                      {/* Mini progress bar vs low stock threshold */}
                      {item.product.lowStockThreshold > 0 && (
                        <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, (item.balanceBoxes / item.product.lowStockThreshold) * 100)}%`,
                              background: isLow ? '#D99A3D' : color,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Total summary card */}
              <div className="bg-foreground/5 border border-border rounded-[var(--radius-lg)] p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{t('all_products')}</div>
                  <div className="text-sm font-semibold text-foreground mb-3">{t('total_inventory_value')}</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground">{totalStockValue.toLocaleString()}</div>
                  <div className="text-xs text-muted mt-0.5">RWF</div>
                  <div className="text-[11px] text-muted mt-2">{activeProducts.length} {t('products_tracked')}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── KPI strip ────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6 lg:mb-8">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-3 sm:p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-8 h-8 rounded-[var(--radius)] flex items-center justify-center mb-2" style={{ background: kpi.color + '18' }}>
                <kpi.icon size={15} style={{ color: kpi.color }} />
              </div>
              <div className="text-base sm:text-lg font-bold text-foreground leading-tight">{kpi.value}</div>
              <div className="text-[10px] text-muted mt-0.5">{t(kpi.label)}</div>
              <div className="text-[9px] text-muted/60">{t(kpi.sub)}</div>
            </div>
          ))}
        </div>

        {/* ── Charts row ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 lg:mb-8">
          {/* Stock In vs Out area chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
            <h3 className="text-sm font-semibold text-foreground mb-0.5">{t('stock_movement_trend')}</h3>
            <p className="text-xs text-muted mb-4">{t('daily_in_vs_out_last_30_days')}</p>
            {trendData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted">{t('no_movement_data_yet')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3FA66B" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3FA66B" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#E05C5C" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#E05C5C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7B78' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#6B7B78' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #E4EAE8', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    formatter={(v: any, name: any) => [`${v} boxes`, name]} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="In"  stroke="#3FA66B" strokeWidth={2} fill="url(#gradIn)"  dot={false} />
                  <Area type="monotone" dataKey="Out" stroke="#E05C5C" strokeWidth={2} fill="url(#gradOut)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Per-product balance bar chart */}
          <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
            <h3 className="text-sm font-semibold text-foreground mb-0.5">{t('balance_by_product')}</h3>
            <p className="text-xs text-muted mb-4">{t('current_stock_boxes')}</p>
            {productBalanceData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted">{t('no_data_yet')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={productBalanceData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#6B7B78' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7B78' }} tickLine={false} axisLine={false} width={72} />
                  <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #E4EAE8', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    formatter={(v: any) => [`${v} boxes`, 'Balance']} />
                  <Bar dataKey="Balance" radius={[0, 4, 4, 0]}>
                    {productBalanceData.map((_, i) => (
                      <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Recent movements feed ────────────────────────────── */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
          <h3 className="text-sm font-semibold text-foreground mb-4">{t('recent_movements')}</h3>
          {recentMoves.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">{t('no_movements_recorded_yet')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="border-b border-border/60">
                    {[
                      t('date_label'),
                      t('product'),
                      t('type_label'),
                      t('in_label'),
                      t('out_label'),
                      t('balance_label'),
                    ].map(h => (
                      <th key={h} className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentMoves.map((m, i) => {
                    const prod = products.find(p => p.id === m.productId)
                    return (
                      <tr key={m.id} className={`border-b border-border/40 hover:bg-accent/30 transition-colors ${i === recentMoves.length - 1 ? 'border-b-0' : ''}`}>
                        <td className="px-3 py-2.5 text-xs font-mono text-muted whitespace-nowrap">{fmtDate(m.date)}</td>
                        <td className="px-3 py-2.5 text-xs font-medium text-foreground whitespace-nowrap">{prod?.name ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            m.type === 'production'      ? 'bg-primary/10 text-primary' :
                            m.type === 'marketing_agent' ? 'bg-secondary/10 text-secondary' :
                            'bg-muted/20 text-muted'
                          }`}>
                            {m.type === 'production' ? t('production') : m.type === 'marketing_agent' ? t('dispatch') : t('other')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-success whitespace-nowrap">{m.stockIn > 0 ? `+${m.stockIn}` : '—'}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-danger whitespace-nowrap">{m.stockOut > 0 ? `-${m.stockOut}` : '—'}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-foreground whitespace-nowrap">{m.balance.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <button onClick={() => setPage('stock')} className="mt-4 text-xs text-primary font-medium hover:underline">
            {t('view_all_movements')} →
          </button>
        </div>
      </div>
    )
  }

  const isMarketingAgent = userRole === 'marketing_agent'
  if (isMarketingAgent) {
    const currentUserId = state.user?.id
    const activeClientsList = clients.filter(c => !c.deleted)

    // Clients assigned to this marketing agent — strictly their own, never a fallback to everyone
    const myClients = activeClientsList.filter(c => c.agentId === currentUserId || c.handlerId === currentUserId)
    const myClientIds = new Set(myClients.map(c => c.id))

    // Helper: calculate client outstanding loan
    const getClientLoanAmount = (clientId: string) => {
      const loanReports = agentReports.filter(r => !r.deleted && r.clientId === clientId && r.paymentStatus === 'loan')
      const totalLoan = loanReports.reduce((s, r) => s + r.totalPrice, 0)
      const totalPaid = payments.filter(p => p.clientId === clientId).reduce((s, p) => s + p.amount, 0)
      return Math.max(0, totalLoan - totalPaid)
    }

    // Reports for my clients only (agent_id is the reliable link, not the name string)
    const myReports = agentReports.filter(r => !r.deleted && r.agentId === currentUserId)
    const myPaidRevenue = myReports.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + r.totalPrice, 0)

    // KPI Summary metrics requested by user:
    const handlesCount = myClients.length
    const clientsWithLoansList = myClients.filter(c => getClientLoanAmount(c.id) > 0)
    const clientsWithLoansCount = clientsWithLoansList.length
    const totalLoansAmount = myClients.reduce((s, c) => s + getClientLoanAmount(c.id), 0)

    // Loan Summary Ranking: clients sorted by outstanding loan amount (descending)
    const loanRankings = [...myClients]
      .map(c => ({ client: c, loan: getClientLoanAmount(c.id) }))
      .sort((a, b) => b.loan - a.loan)

    // Chart Data: Loan vs Revenue monthly comparison
 // NEW — real data per month
const agentMonthlyData = getLastMonths(6, lang).map(({ key, label }) => {
  const monthReports = myReports.filter(r => r.date.startsWith(key))
  return {
    month: label,
    Revenue: monthReports.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + r.totalPrice, 0),
    Loans: monthReports.filter(r => r.paymentStatus === 'loan').reduce((s, r) => s + r.totalPrice, 0),
  }
})

    const maKpis = [
      { label: t('clients_handled'), value: handlesCount.toString(), sub: t('total_assigned_clients'), color: '#2E9E8F', icon: Users },
      { label: t('clients_with_loans'), value: clientsWithLoansCount.toString(), sub: t('unpaid_balances'), color: '#D99A3D', icon: CreditCard },
      { label: t('total_loans'), value: `${totalLoansAmount.toLocaleString()} RWF`, sub: t('outstanding_amount'), color: '#E05C5C', icon: DollarSign },
      { label: t('paid_revenue'), value: `${myPaidRevenue.toLocaleString()} RWF`, sub: t('collected_sales'), color: '#3FA66B', icon: TrendingUp },
    ]
    // NEW — stock accountability (what he's been given vs what he's given out)
    const myDispatchedValue = stockMovements
      .filter(m => m.type === 'marketing_agent' && m.agentId === currentUserId && !m.isReturn)
      .reduce((s, m) => s + (m.totalPrice ?? 0), 0)
    const myReturnedValue = stockMovements
      .filter(m => m.type === 'marketing_agent' && m.agentId === currentUserId && m.isReturn)
      .reduce((s, m) => s + (m.totalPrice ?? 0), 0)
    const myStockLoan = Math.max(0, myDispatchedValue - myReturnedValue)
    const myDistributedValue = myReports.reduce((s, r) => s + r.totalPrice, 0)
    const myRemainingStock = Math.max(0, myStockLoan - myDistributedValue)
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{greeting}, {userName} 👋</h1>
            <p className="text-muted text-sm mt-1">{t('marketing_agent_operations_portal')} · {dateStr}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage('clients')} className="px-3.5 py-2 text-xs font-semibold bg-primary text-white rounded-[var(--radius)] hover:bg-primary/90 transition-colors">
              + {t('add_client')}
            </button>
            <button onClick={() => setPage('reports')} className="px-3.5 py-2 text-xs font-semibold bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors">
              + {t('sales_report')}
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 lg:mb-8">
          {maKpis.map(kpi => (
            <div key={kpi.label} className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-9 h-9 rounded-[var(--radius)] flex items-center justify-center mb-3" style={{ background: kpi.color + '18' }}>
                <kpi.icon size={17} style={{ color: kpi.color }} />
              </div>
              <div className="text-lg sm:text-xl font-bold text-foreground leading-tight truncate">{kpi.value}</div>
              <div className="text-[11px] text-muted mt-1">{kpi.label}</div>
              <div className="text-[10px] text-muted/70 mt-0.5">{kpi.sub}</div>
            </div>
          ))}
        </div>

          {/* ── Stock Accountability ─────────────────────────────── */}
        <div className="mb-6 lg:mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('stock_accountability')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-secondary/10 border border-secondary/20 rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="text-[11px] text-secondary uppercase tracking-wide mb-1">{t('stock_given_to_me')}</div>
              <div className="text-xl font-mono text-secondary">{myStockLoan.toLocaleString()} RWF</div>
              <div className="text-[11px] text-muted mt-1">{t('dispatched_minus_returns')}</div>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="text-[11px] text-primary uppercase tracking-wide mb-1">{t('sales_distributed')}</div>
              <div className="text-xl font-mono text-primary">{myDistributedValue.toLocaleString()} RWF</div>
              <div className="text-[11px] text-muted mt-1">{t('given_out_to_my_clients')}</div>
            </div>
            <div className="bg-success/10 border border-success/20 rounded-[var(--radius-lg)] p-4 sm:p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="text-[11px] text-success uppercase tracking-wide mb-1">{t('still_in_my_hands')}</div>
              <div className="text-xl font-mono text-success">{myRemainingStock.toLocaleString()} RWF</div>
              <button onClick={() => setPage('loans')} className="text-[11px] text-success/80 hover:underline mt-1 block">
                {t('view_full_breakdown')} →
              </button>
            </div>
          </div>
        </div>

        {/* Charts Row: Revenue vs Loans */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 lg:mb-8">
          <div className="lg:col-span-2 bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
            <h3 className="text-sm font-semibold text-foreground mb-0.5">{t('loan_vs_revenue_overview')}</h3>
            <p className="text-xs text-muted mb-4">{t('monthly_collection_vs_pending_credit_rwf')}</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agentMonthlyData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B7B78' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#6B7B78' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [`${Number(v).toLocaleString()} RWF`]} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Revenue" fill="#3FA66B" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Loans" fill="#E05C5C" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Client Portfolio Overview */}
          <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 hover:shadow-md transition-shadow duration-200 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{t('portfolio_summary')}</h3>
              <p className="text-xs text-muted mb-4">{t('client_distribution')}</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-accent/40 rounded-[var(--radius)]">
                  <span className="text-xs font-medium text-foreground">{t('total_handled')}</span>
                  <span className="text-sm font-bold text-primary">{handlesCount}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-[var(--radius)] border border-amber-200/50">
                  <span className="text-xs font-medium text-amber-800">{t('clients_with_credit')}</span>
                  <span className="text-sm font-bold text-amber-700">{clientsWithLoansCount}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-[var(--radius)] border border-red-200/50">
                  <span className="text-xs font-medium text-red-800">{t('pending_exposure')}</span>
                  <span className="text-sm font-bold text-red-700">{totalLoansAmount.toLocaleString()} RWF</span>
                </div>
              </div>
            </div>
            <button onClick={() => setPage('clients')} className="mt-4 w-full py-2 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 rounded-[var(--radius)] transition-colors">
              {t('manage_clients')} →
            </button>
          </div>
        </div>

        {/* ── Loan Summary Ranking Table ─────────────────────── */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('client_loan_summary_ranking')}</h3>
              <p className="text-xs text-muted mt-0.5">{t('clients_ranked_by_highest_outstanding_loan_balance')}</p>
            </div>
            <button onClick={() => setPage('loans')} className="text-xs font-medium text-primary hover:underline">
              {t('view_all_loans')} →
            </button>
          </div>

          {loanRankings.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">{t('no_clients_registered_yet')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2">{t('rank')}</th>
                    <th className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2">{t('client')}</th>
                    <th className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2">{t('district_market')}</th>
                    <th className="text-left text-[10px] text-muted uppercase tracking-wide px-3 py-2">{t('phone')}</th>
                    <th className="text-right text-[10px] text-muted uppercase tracking-wide px-3 py-2">{t('outstanding_loan')}</th>
                    <th className="text-center text-[10px] text-muted uppercase tracking-wide px-3 py-2">{t('risk_status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loanRankings.map(({ client, loan }, index) => {
                    const risk = loan > 300000 ? 'High' : loan > 0 ? 'Moderate' : 'Clear'
                    return (
                      <tr key={client.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-3 text-xs font-mono font-bold text-muted">
                          #{index + 1}
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-foreground">
                          {client.name}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted">
                          {client.district || '—'} {client.center ? `(${client.center})` : ''}
                        </td>
                        <td className="px-3 py-3 text-xs font-mono text-muted">
                          {client.phone || '—'}
                        </td>
                        <td className="px-3 py-3 text-xs font-mono text-right text-foreground">
                          {loan > 0 ? `${loan.toLocaleString()} RWF` : '0 RWF'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            risk === 'High' ? 'bg-red-100 text-red-700' :
                            risk === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {risk === 'High' ? t('high_risk') : risk === 'Moderate' ? t('loan_active') : t('clear')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
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
    [t('balance')]: m.balance,
    [t('stock_in')]: m.stockIn,
    [t('stock_out')]: m.stockOut,
  }))

  const revenueKey = t('revenue')
  const loansKey = t('loans')

  // NEW — real data per month
  const monthlyData = getLastMonths(6, lang).map(({ key, label }) => {
  const monthReports = activeReports.filter(r => r.date.startsWith(key))
  return {
    month: label,
    Revenue: monthReports.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + r.totalPrice, 0),
    Loans: monthReports.filter(r => r.paymentStatus === 'loan').reduce((s, r) => s + r.totalPrice, 0),
  }
})

  const modeCounts = payments.reduce((acc, p) => {
    acc[p.mode] = (acc[p.mode] || 0) + p.amount
    return acc
  }, {} as Record<string, number>)
  const pieData = Object.entries(modeCounts).map(([name, value]) => ({ name, value }))
  const PIE_COLORS = ['#2E9E8F', '#D99A3D', '#3FA66B']

  const kpis = [
    { label: t('total_stock'), value: `${totalStock.toLocaleString()} ${t('boxes')}`, icon: Package, color: 'primary', trend: `+200 ${t('today')}`, trendUp: true },
    { label: t('revenue_paid'), value: fmt(totalRevenue), icon: DollarSign, color: 'success', trend: `${activeReports.filter(r => r.paymentStatus === 'paid').length} ${t('sales')}`, trendUp: true },
    { label: t('outstanding_loans'), value: fmt(outstandingLoans), icon: CreditCard, color: 'secondary', trend: `${activeReports.filter(r => r.paymentStatus === 'loan').length} ${t('clients')}`, trendUp: false },
    { label: t('active_clients'), value: activeClients.toString(), icon: Users, color: 'foreground', trend: `${agents.filter(a => !a.deleted).length} ${t('agents')}`, trendUp: true },
  ]

  const colorMap: Record<string, string> = {
    primary: '#2E9E8F', success: '#3FA66B', secondary: '#D99A3D', foreground: '#1B2321',
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-primary text-white p-5 sm:p-7 mb-6 lg:mb-8 shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-14 w-48 h-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -right-28 top-6 w-64 h-64 rounded-full bg-white/[0.06]" />
        <div className="relative">
          <div className="h-4 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
              {eyebrow}
              <span className="animate-pulse">|</span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold">{greeting}, {state.user?.name.split(' ')[0]} 👋</h1>
          <p className="text-white/80 text-sm mt-1">{dateStr}</p>
        </div>
      </div>
      {/* Low stock alert */}
      {lowStockProducts.length > 0 && (
        <div className="mb-6 bg-secondary/10 border border-secondary/30 rounded-[var(--radius)] px-4 py-3 flex items-center gap-3 animate-in fade-in duration-300">
          <AlertTriangle size={16} className="text-secondary flex-shrink-0" />
          <span className="text-sm text-foreground">
            <strong>{t('low_stock_alert')}</strong>{' '}
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
          <h3 className="text-sm font-semibold text-foreground mb-1">{t('stock_movement')}</h3>
          <p className="text-xs text-muted mb-5">{t('running_balance_over_time')}</p>
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
                formatter={(v: any) => [`${v} boxes`, 'Balance']}
              />
              <Area type="monotone" dataKey="Balance" stroke="#2E9E8F" strokeWidth={2} fill="url(#tealGrad)" dot={{ fill: '#2E9E8F', r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Payment modes */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-6 transition-shadow duration-200 hover:shadow-md">
          <h3 className="text-sm font-semibold text-foreground mb-1">{t('payment_modes')}</h3>
          <p className="text-xs text-muted mb-5">{t('by_total_amount_received')}</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => fmt(Number(v || 0))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-card border border-border rounded-[var(--radius-lg)] p-6 transition-shadow duration-200 hover:shadow-md">
          <h3 className="text-sm font-semibold text-foreground mb-1">{t('revenue_vs_outstanding_loans')}</h3>
          <p className="text-xs text-muted mb-5">{t('monthly_comparison_rwf')}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE8" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B7B78' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6B7B78' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => fmt(Number(v || 0))} />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Revenue" fill="#2E9E8F" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Loans" fill="#D99A3D" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quick links */}
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-6 transition-shadow duration-200 hover:shadow-md">
          <h3 className="text-sm font-semibold text-foreground mb-4">{t('recent_activity')}</h3>
          <div className="space-y-3">
            {stockMovements.slice(-5).reverse().map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.stockIn > 0 ? 'bg-success' : 'bg-danger'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground capitalize">
                    {m.type === 'production' ? t('production') : m.type === 'marketing_agent' ? t('dispatch') : t('other')}
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
            {t('view_all_movements')} →
          </button>
        </div>
      </div>
    </div>
  )
}