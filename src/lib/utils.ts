export const fmt = (n: number) => `${n.toLocaleString()} RWF`
export const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
export const today = () => new Date().toISOString().split('T')[0]
