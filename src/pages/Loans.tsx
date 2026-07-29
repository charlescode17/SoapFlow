import { useState } from "react";
import {
  CreditCard,
  Search,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  MapPin,
} from "lucide-react";
import { useStore } from "../lib/store";
import { fmt, fmtDate } from "../lib/utils";
import { normalizeRole, type Page } from "../lib/types";

interface Props {
  setPage: (p: Page) => void;
}

type View = "agents" | "clients" | "detail";

export default function Loans({ setPage }: Props) {
  const { state } = useStore();
  const role = normalizeRole(state.user?.role);

  const activeAgents = state.agents.filter((a) => !a.deleted);
  const activeClients = state.clients.filter((c) => !c.deleted);
  const loanReports = state.agentReports.filter(
    (r) => !r.deleted && r.paymentStatus === "loan",
  );

  const getPaidForReport = (reportId: string) =>
    state.payments
      .filter((p) => p.reportId === reportId)
      .reduce((s, p) => s + p.amount, 0);

  const getRemaining = (report: (typeof loanReports)[number]) =>
    Math.max(0, report.totalPrice - getPaidForReport(report.id));

  // If the logged-in user IS a marketing agent, skip the agent-picker level.
  const forcedAgentId = role === "marketing_agent" ? state.user?.id : null;

  const [view, setView] = useState<View>(forcedAgentId ? "clients" : "agents");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    forcedAgentId ?? null,
  );
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const getProductName = (id: string) =>
    state.products.find((p) => p.id === id)?.name ?? "—";

  /* ---------- LEVEL 1: agent cards ---------- */
  const agentSummaries = activeAgents
    .map((agent) => {
      const reports = loanReports.filter((r) => r.agentId === agent.id);
      const byClient = new Map<string, number>();
      let total = 0;
      reports.forEach((r) => {
        const remaining = getRemaining(r);
        if (remaining <= 0) return;
        total += remaining;
        byClient.set(r.clientId, (byClient.get(r.clientId) ?? 0) + remaining);
      });
      return { agent, total, clientCount: byClient.size };
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);

  const filteredAgentSummaries = agentSummaries.filter((s) =>
    s.agent.name.toLowerCase().includes(search.toLowerCase()),
  );

  /* ---------- LEVEL 2: clients for selected agent ---------- */
  const selectedAgent = activeAgents.find((a) => a.id === selectedAgentId);
  const clientSummaries = selectedAgentId
    ? activeClients
        .map((client) => {
          const reports = loanReports.filter(
            (r) => r.agentId === selectedAgentId && r.clientId === client.id,
          );
          const total = reports.reduce((s, r) => s + getRemaining(r), 0);
          return { client, total, reportCount: reports.length };
        })
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total)
    : [];

  const filteredClientSummaries = clientSummaries.filter((s) =>
    s.client.name.toLowerCase().includes(search.toLowerCase()),
  );

  /* ---------- LEVEL 3: per-date breakdown for selected client ---------- */
  const selectedClient = activeClients.find((c) => c.id === selectedClientId);
  const clientReports = (selectedAgentId && selectedClientId
    ? loanReports.filter(
        (r) => r.agentId === selectedAgentId && r.clientId === selectedClientId,
      )
    : []
  )
    .map((r) => ({
      report: r,
      paid: getPaidForReport(r.id),
      remaining: getRemaining(r),
    }))
    .filter((r) => r.remaining > 0)
    .sort((a, b) => b.report.date.localeCompare(a.report.date));

  const clientTotal = clientReports.reduce((s, r) => s + r.remaining, 0);

  const openAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    setSearch("");
    setView("clients");
  };
  const openClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setSearch("");
    setView("detail");
  };
  const backToAgents = () => {
    setView("agents");
    setSelectedAgentId(null);
    setSelectedClientId(null);
    setSearch("");
  };
  const backToClients = () => {
    setView("clients");
    setSelectedClientId(null);
    setSearch("");
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      {/* Breadcrumb / header */}
      <div className="mb-6 lg:mb-8">
        <div className="flex items-center gap-1.5 text-sm text-muted mb-1">
          {view !== "agents" && !forcedAgentId && (
            <button
              onClick={backToAgents}
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <ChevronLeft size={14} /> Agents
            </button>
          )}
          {view === "detail" && (
            <>
              <span>/</span>
              <button
                onClick={backToClients}
                className="hover:text-primary transition-colors"
              >
                {selectedAgent?.name}
              </button>
            </>
          )}
        </div>
        <h1 className="text-xl font-bold text-foreground">
          {view === "agents"
            ? "Outstanding Loans"
            : view === "clients"
              ? `${selectedAgent?.name}'s Clients`
              : `${selectedClient?.name} — Loan History`}
        </h1>
        <p className="text-sm text-muted mt-0.5">
          {view === "agents"
            ? "Loans grouped by marketing agent"
            : view === "clients"
              ? "Outstanding balance per client"
              : `${selectedClient?.district} · ${selectedClient?.center}`}
        </p>
      </div>

      {/* Search (agents & clients levels only) */}
      {view !== "detail" && (
        <div className="relative mb-6 max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === "agents" ? "Search agent…" : "Search client…"}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      {/* ============ LEVEL 1: AGENT CARDS ============ */}
      {view === "agents" && (
        filteredAgentSummaries.length === 0 ? (
          <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center py-16">
            <CreditCard size={32} className="text-muted/40 mb-3" />
            <p className="text-sm text-muted">No outstanding loans</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgentSummaries.map(({ agent, total, clientCount }) => (
              <button
                key={agent.id}
                onClick={() => openAgent(agent.id)}
                className="text-left bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-secondary text-base font-bold">
                      {agent.name.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {agent.name}
                    </div>
                    <div className="text-xs text-muted">
                      {clientCount} client{clientCount !== 1 ? "s" : ""} with loans
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted flex-shrink-0" />
                </div>
                <div className="pt-3 border-t border-border/60">
                  <div className="text-[11px] text-muted uppercase tracking-wide mb-1">
                    Total Outstanding
                  </div>
                  <div className="text-xl font-mono text-secondary">
                    {fmt(total)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* ============ LEVEL 2: CLIENTS FOR AGENT ============ */}
      {view === "clients" && (
        filteredClientSummaries.length === 0 ? (
          <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center py-16">
            <UserIcon size={32} className="text-muted/40 mb-3" />
            <p className="text-sm text-muted">No outstanding loans for this agent</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClientSummaries.map(({ client, total, reportCount }) => (
              <button
                key={client.id}
                onClick={() => openClient(client.id)}
                className="text-left bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-secondary text-xs font-bold">
                      {client.name.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {client.name}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted truncate">
                      <MapPin size={10} className="flex-shrink-0" />
                      {client.district} · {client.center}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted flex-shrink-0" />
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-border/60">
                  <span className="text-xs text-muted">
                    {reportCount} unpaid entr{reportCount !== 1 ? "ies" : "y"}
                  </span>
                  <span className="text-base font-mono text-secondary">
                    {fmt(total)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* ============ LEVEL 3: PER-DATE DETAIL ============ */}
      {view === "detail" && (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-secondary/5 flex items-center justify-between">
            <span className="text-sm text-secondary font-medium">
              {clientReports.length} unpaid entr{clientReports.length !== 1 ? "ies" : "y"}
            </span>
            <span className="text-lg font-mono text-secondary">{fmt(clientTotal)}</span>
          </div>

          {clientReports.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">
              No outstanding balance — fully settled
            </div>
          ) : (
            <>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      {["Date", "Product", "Qty", "Total", "Paid", "Remaining"].map((h) => (
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
                    {clientReports.map(({ report, paid, remaining }, i) => (
                      <tr
                        key={report.id}
                        className={`border-b border-border/50 ${i === clientReports.length - 1 ? "border-b-0" : ""}`}
                      >
                        <td className="px-5 py-3.5 text-sm font-mono text-foreground whitespace-nowrap">
                          {fmtDate(report.date)}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">
                          {getProductName(report.productId)}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-mono text-muted">
                          {report.qty}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-mono text-foreground">
                          {fmt(report.totalPrice)}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-mono text-success">
                          {paid > 0 ? fmt(paid) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-mono text-secondary font-semibold">
                          {fmt(remaining)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sm:hidden divide-y divide-border/50">
                {clientReports.map(({ report, paid, remaining }) => (
                  <div key={report.id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">
                        {getProductName(report.productId)}
                      </span>
                      <span className="text-xs text-muted font-mono">
                        {fmtDate(report.date)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>Total {fmt(report.totalPrice)} · Paid {paid > 0 ? fmt(paid) : "0"}</span>
                      <span className="font-mono font-semibold text-secondary">
                        {fmt(remaining)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="px-5 py-4 border-t border-border">
            <button
              onClick={() => setPage("payments")}
              className="text-xs text-primary font-medium hover:underline"
            >
              Record a payment for this client →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}