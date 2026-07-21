import { useState } from "react";
import { CreditCard, Search, List, LayoutGrid, MapPin } from "lucide-react";
import { useStore } from "../lib/store";
import { fmt, fmtDate } from "../lib/utils";
import type { Page } from "../lib/types";

interface Props {
  setPage: (p: Page) => void;
}

type ViewMode = "list" | "grid";

export default function Loans({ setPage }: Props) {
  const { state } = useStore();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");

  const activeClients = state.clients.filter((c) => !c.deleted);
  const activeReports = state.agentReports.filter((r) => !r.deleted);

  const clientLoans = activeClients
    .map((c) => {
      const loanReports = activeReports.filter(
        (r) => r.clientId === c.id && r.paymentStatus === "loan",
      );
      const paid = state.payments
        .filter((p) => p.clientId === c.id)
        .reduce((s, p) => s + p.amount, 0);
      const totalLoanAmt = loanReports.reduce((s, r) => s + r.totalPrice, 0);
      const outstanding = Math.max(0, totalLoanAmt - paid);
      const totalQty = loanReports.reduce((s, r) => s + r.qty, 0);
      const lastReport = loanReports.sort((a, b) =>
        b.date.localeCompare(a.date),
      )[0];
      return {
        client: c,
        outstanding,
        totalQty,
        lastDate: lastReport?.date ?? null,
      };
    })
    .filter((l) => l.outstanding > 0 || l.totalQty > 0);

  const withLoans = clientLoans.filter((l) => l.outstanding > 0);
  const settled = clientLoans.filter(
    (l) => l.outstanding === 0 && l.totalQty > 0,
  );

  const filtered = withLoans
    .filter(
      (l) =>
        l.client.name.toLowerCase().includes(search.toLowerCase()) ||
        l.client.district.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.outstanding - a.outstanding);

  const grandTotal = withLoans.reduce((s, l) => s + l.outstanding, 0);
  const totalBoxes = withLoans.reduce((s, l) => s + l.totalQty, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl font-bold text-foreground">Outstanding Loans</h1>
        <p className="text-sm text-muted mt-0.5">
          Clients with unpaid balances
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 lg:mb-8">
        <div className="bg-secondary/10 border border-secondary/20 rounded-[var(--radius-lg)] p-5">
          <div className="text-xs text-secondary uppercase tracking-wide mb-2">
            Total Outstanding
          </div>
          <div className="text-2xl text-secondary font-mono">
            {fmt(grandTotal)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5">
          <div className="text-xs text-muted uppercase tracking-wide mb-2">
            Clients with Loans
          </div>
          <div className="text-2xl font-bold text-foreground">
            {withLoans.length}
          </div>
        </div>
        <div className="bg-card border border-border rounded-[var(--radius-lg)] p-5">
          <div className="text-xs text-muted uppercase tracking-wide mb-2">
            Boxes on Credit
          </div>
          <div className="text-2xl font-bold text-foreground font-mono">
            {totalBoxes.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or district…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-0.5 bg-card border border-border rounded-[var(--radius)] p-1 flex-shrink-0">
          <button
            onClick={() => setView("list")}
            title="List view"
            className={`p-2 rounded-[var(--radius-sm)] transition-colors ${
              view === "list"
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground hover:bg-accent/40"
            }`}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setView("grid")}
            title="Grid view"
            className={`p-2 rounded-[var(--radius-sm)] transition-colors ${
              view === "grid"
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground hover:bg-accent/40"
            }`}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* Active loans */}
      <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-border bg-secondary/5 flex items-center gap-2">
          <CreditCard size={14} className="text-secondary flex-shrink-0" />
          <span className="text-sm text-secondary">
            Active Loans ({filtered.length})
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">
            No outstanding loans found
          </div>
        ) : view === "grid" ? (
          /* ---------- GRID VIEW ---------- */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {filtered.map((l) => (
              <div
                key={l.client.id}
                className="bg-background border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-secondary text-xs font-bold">
                      {l.client.name.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground truncate">
                      {l.client.name}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted truncate">
                      <MapPin size={10} className="flex-shrink-0" />
                      {l.client.district} · {l.client.center}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted">
                    {l.totalQty.toLocaleString()} boxes on loan
                  </span>
                  <span className="text-xs text-muted font-mono">
                    {l.lastDate ? fmtDate(l.lastDate) : "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border/60">
                  <span className="text-lg font-mono text-secondary">
                    {fmt(l.outstanding)}
                  </span>
                  <button
                    onClick={() => setPage("payments")}
                    className="text-xs text-primary font-medium hover:underline flex-shrink-0"
                  >
                    Record payment →
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Table: sm and up */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    {[
                      "Client",
                      "District / Center",
                      "Qty on Loan (boxes)",
                      "Outstanding Amount",
                      "Last Activity",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs text-muted uppercase tracking-wide px-5 py-3 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l, i) => (
                    <tr
                      key={l.client.id}
                      className={`border-b border-border/50 hover:bg-accent/40 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-secondary text-xs font-bold">
                              {l.client.name.charAt(0)}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-foreground whitespace-nowrap">
                            {l.client.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted whitespace-nowrap">
                        {l.client.district} · {l.client.center}
                      </td>
                      <td className="px-5 py-4 text-sm font-mono text-foreground">
                        {l.totalQty.toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-base font-mono text-secondary">
                          {fmt(l.outstanding)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted font-mono whitespace-nowrap">
                        {l.lastDate ? fmtDate(l.lastDate) : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => setPage("payments")}
                          className="text-xs text-primary font-medium hover:underline whitespace-nowrap"
                        >
                          Record payment →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stacked rows: below sm */}
            <div className="sm:hidden divide-y divide-border/50">
              {filtered.map((l) => (
                <div key={l.client.id} className="px-4 py-3.5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-secondary text-xs font-bold">
                        {l.client.name.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {l.client.name}
                      </div>
                      <div className="text-xs text-muted truncate">
                        {l.client.district} · {l.client.center}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {l.totalQty.toLocaleString()} boxes ·{" "}
                      {l.lastDate ? fmtDate(l.lastDate) : "—"}
                    </span>
                    <span className="text-sm font-mono text-secondary">
                      {fmt(l.outstanding)}
                    </span>
                  </div>
                  <button
                    onClick={() => setPage("payments")}
                    className="text-xs text-primary font-medium hover:underline mt-2"
                  >
                    Record payment →
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Settled clients */}
      {settled.length > 0 && (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-success/5 flex items-center gap-2">
            <span className="text-sm text-success">
              ✓ Settled Clients ({settled.length})
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {settled.map((l) => (
              <div
                key={l.client.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {l.client.name}
                  </span>
                  <span className="text-xs text-muted ml-3 hidden sm:inline">
                    {l.client.district}
                  </span>
                  <div className="text-xs text-muted sm:hidden">
                    {l.client.district}
                  </div>
                </div>
                <span className="text-xs text-success bg-success/10 px-2.5 py-1 rounded-full flex-shrink-0">
                  Fully Settled
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
