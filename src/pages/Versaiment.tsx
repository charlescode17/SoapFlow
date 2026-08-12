import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  Wallet,
  Banknote,
  Receipt,
  Smartphone,
  Square,
  CheckSquare,
  X,
} from "lucide-react";
import { useStore } from "../lib/store";
import { fmt, fmtDate, today } from "../lib/utils";
import { normalizeRole } from "../lib/types";
import { useVersaimentState, keyFor } from "../lib/versaimentState";

type DayEntry = { date: string; dayCash: number; dayTel: number; dayExp: number };

export default function Versaiment() {
  const { state } = useStore();
  const role = normalizeRole(state.user?.role);
  const isManager = role === "manager";

  const activeAgents = state.agents.filter((a) => !a.deleted);
  const [pickedAgentId, setPickedAgentId] = useState(activeAgents[0]?.id ?? "");
  const effectiveAgentId = isManager ? pickedAgentId : state.user?.id ?? "";

  const { map, setRecord } = useVersaimentState();

  const effectiveAgentName = isManager
    ? activeAgents.find((a) => a.id === pickedAgentId)?.name ?? ""
    : state.user?.name ?? "";
  const [madeBy, setMadeBy] = useState(effectiveAgentName);
  useEffect(() => {
    setMadeBy(effectiveAgentName);
  }, [effectiveAgentName]);

  const myPayments = state.payments.filter((p) => p.agentId === effectiveAgentId);
  const myExpenses = state.expenses.filter((e) => e.agentId === effectiveAgentId);
  const clients = state.clients.filter((c) => !c.deleted);
  const getClientName = (id?: string) => (id ? clients.find((c) => c.id === id)?.name ?? "—" : "—");

  const [detailDate, setDetailDate] = useState<string | null>(null);

  const dayKeys = Array.from(
    new Set([...myPayments.map((p) => p.date), ...myExpenses.map((e) => e.date)]),
  ).sort((a, b) => b.localeCompare(a));

  const days: DayEntry[] = useMemo(() => {
    return dayKeys
      .map((date) => ({
        date,
        dayCash: myPayments.filter((p) => p.date === date && p.mode === "cash").reduce((s, p) => s + p.amount, 0),
        dayTel: myPayments.filter((p) => p.date === date && p.mode === "telephone").reduce((s, p) => s + p.amount, 0),
        dayExp: myExpenses.filter((e) => e.date === date).reduce((s, e) => s + e.amount, 0),
      }))
      .filter((d) => d.dayCash > 0 || d.dayTel > 0); // nothing to remit if neither channel has funds
  }, [dayKeys, myPayments, myExpenses]);

  const detailDay = days.find((d) => d.date === detailDate) ?? null;
  const detailRecord = detailDate ? map[keyFor(effectiveAgentId, detailDate)] : undefined;

  const recordFor = (date: string) => map[keyFor(effectiveAgentId, date)];
  const sourceFor = (d: DayEntry): "cash" | "telephone" =>
    recordFor(d.date)?.source ?? (d.dayCash > 0 ? "cash" : "telephone");
  const amountFor = (d: DayEntry) => {
    const source = sourceFor(d);
    return (source === "cash" ? d.dayCash : d.dayTel) - d.dayExp;
  };

  const pendingDays = days.filter((d) => !recordFor(d.date)?.approved);
  const approvedDays = days.filter((d) => recordFor(d.date)?.approved);
  const totalPending = pendingDays.reduce((s, d) => s + amountFor(d), 0);
  const totalApproved = approvedDays.reduce((s, d) => s + amountFor(d), 0);

  const setSource = (date: string, source: "cash" | "telephone") => {
    const existing = recordFor(date);
    setRecord(keyFor(effectiveAgentId, date), {
      approved: existing?.approved ?? false,
      versaimentDate: existing?.versaimentDate,
      source,
      madeBy: existing?.madeBy,
    });
  };

  // ── batch approval ──
  const [selected, setSelected] = useState<string[]>([]);
  const [versaimentDate, setVersaimentDate] = useState(today());

  const toggleSelect = (date: string) => {
    setSelected((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]));
  };

  const selectedTotal = pendingDays
    .filter((d) => selected.includes(d.date))
    .reduce((s, d) => s + amountFor(d), 0);

  const approveSelected = () => {
    selected.forEach((date) => {
      const d = days.find((dd) => dd.date === date);
      if (!d) return;
      setRecord(keyFor(effectiveAgentId, date), {
        approved: true,
        versaimentDate,
        source: sourceFor(d),
        madeBy: madeBy.trim() || effectiveAgentName,
      });
    });
    setSelected([]);
  };

  const undoApproval = (date: string) => {
    const d = days.find((dd) => dd.date === date);
    const existing = recordFor(date);
    setRecord(keyFor(effectiveAgentId, date), {
      approved: false,
      source: d ? sourceFor(d) : "cash",
      madeBy: existing?.madeBy,
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-primary via-primary to-emerald-600 text-white p-5 sm:p-7 mb-6 shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-14 w-56 h-56 rounded-full bg-card/10" />
        <div className="pointer-events-none absolute -right-32 top-10 w-72 h-72 rounded-full bg-card/[0.06]" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-card/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2.5">
              <Wallet size={11} />
              Versaiment
            </div>
            <h1 className="text-xl sm:text-2xl font-bold">Cash Remittance Tracker</h1>
            <p className="text-xs sm:text-sm text-white/80 mt-1">
              Daily cash (or mobile money) collected minus expenses
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card/10 backdrop-blur-sm border border-white/15 rounded-[var(--radius)] px-4 py-2.5">
              <div className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">Pending</div>
              <div className="text-base font-bold">{fmt(totalPending)}</div>
            </div>
            <div className="bg-card/10 backdrop-blur-sm border border-white/15 rounded-[var(--radius)] px-4 py-2.5">
              <div className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">Approved</div>
              <div className="text-base font-bold">{fmt(totalApproved)}</div>
            </div>
          </div>
        </div>
      </div>

      {isManager && (
        <div className="mb-6 max-w-xs">
          <label className="text-xs text-muted uppercase tracking-wide block mb-1.5">Marketing Agent</label>
          <select
            value={pickedAgentId}
            onChange={(e) => {
              setPickedAgentId(e.target.value);
              setSelected([]);
            }}
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {activeAgents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Batch approval bar */}
      {selected.length > 0 && (
        <div className="sticky top-2 z-10 mb-5 bg-primary text-white rounded-[var(--radius-lg)] px-4 py-3 shadow-lg flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold">
            {selected.length} day{selected.length > 1 ? "s" : ""} selected · {fmt(selectedTotal)}
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <label className="text-[11px] text-white/80">Made by</label>
            <input
              type="text"
              value={madeBy}
              onChange={(e) => setMadeBy(e.target.value)}
              placeholder={effectiveAgentName}
              className="px-2.5 py-1.5 text-xs rounded-[var(--radius-sm)] border-0 text-foreground"
            />
            <label className="text-[11px] text-white/80">Versaiment date</label>
            <input
              type="date"
              value={versaimentDate}
              onChange={(e) => setVersaimentDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-[var(--radius-sm)] border-0 text-foreground"
            />
            <button
              onClick={approveSelected}
              className="px-3.5 py-1.5 text-xs font-semibold bg-card text-primary rounded-[var(--radius)] hover:bg-card/90 transition-colors"
            >
              Approve Selected
            </button>
            <button onClick={() => setSelected([])} className="px-2.5 py-1.5 text-xs text-white/80 hover:text-white">
              Clear
            </button>
          </div>
        </div>
      )}

      {days.length === 0 ? (
        <div className="bg-card border border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center py-16">
          <Wallet size={32} className="text-muted/40 mb-3" />
          <p className="text-sm text-muted">No cash or mobile money records yet</p>
        </div>
      ) : (
        <>
          {/* Pending */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={15} className="text-secondary" />
              <h3 className="text-sm font-bold text-foreground">Pending Versaiment</h3>
              <span className="text-xs text-muted">({pendingDays.length})</span>
            </div>

            {pendingDays.length === 0 ? (
              <div className="text-xs text-muted bg-card border border-border rounded-[var(--radius)] px-4 py-6 text-center">
                Nothing pending — all caught up 🎉
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingDays.map((d) => {
                  const source = sourceFor(d);
                  return (
                    <div
                      key={d.date}
                      onClick={() => setDetailDate(d.date)}
                      className="relative bg-card border border-border rounded-[var(--radius-lg)] p-5 hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 right-0 h-[3px] bg-secondary/40" />
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <button onClick={(e) => { e.stopPropagation(); toggleSelect(d.date); }} className="text-primary">
                            {selected.includes(d.date) ? <CheckSquare size={16} /> : <Square size={16} className="text-muted/50" />}
                          </button>
                          <span className="text-xs font-mono text-muted">{fmtDate(d.date)}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20">
                          <Clock size={10} /> Pending
                        </span>
                      </div>

                      <div className="text-2xl font-bold text-foreground mb-1">{fmt(amountFor(d))}</div>
                      <div className="text-[11px] text-muted mb-3">via {source === "cash" ? "Cash" : "Mobile Money"}</div>

                      {d.dayCash <= 0 && (
                        <div className="text-[11px] text-secondary bg-secondary/10 border border-secondary/20 rounded-[var(--radius-sm)] px-2.5 py-1.5 mb-3">
                          No cash collected today — versaiment will be made from Mobile Money
                        </div>
                      )}

                      <div className="flex gap-1.5 mb-4">
                        <button
                                  disabled={d.dayCash <= 0}
                                  onClick={(e) => { e.stopPropagation(); setSource(d.date, "cash"); }}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold rounded-[var(--radius-sm)] border transition-colors ${
                            source === "cash" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30"
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          <Banknote size={12} /> Cash
                        </button>
                        <button
                                  disabled={d.dayTel <= 0}
                                  onClick={(e) => { e.stopPropagation(); setSource(d.date, "telephone"); }}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold rounded-[var(--radius-sm)] border transition-colors ${
                            source === "telephone" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/30"
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          <Smartphone size={12} /> Mobile Money
                        </button>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-muted">
                          <span className="flex items-center gap-1.5"><Banknote size={12} /> Cash</span>
                          <span className="font-mono">{fmt(d.dayCash)}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span className="flex items-center gap-1.5"><Smartphone size={12} /> Mobile Money</span>
                          <span className="font-mono">{fmt(d.dayTel)}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span className="flex items-center gap-1.5"><Receipt size={12} /> Depense</span>
                          <span className="font-mono text-danger">-{fmt(d.dayExp)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Approved */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={15} className="text-success" />
              <h3 className="text-sm font-bold text-foreground">Approved Versaiment</h3>
              <span className="text-xs text-muted">({approvedDays.length})</span>
            </div>

            {approvedDays.length === 0 ? (
              <div className="text-xs text-muted bg-card border border-border rounded-[var(--radius)] px-4 py-6 text-center">
                No approved versaiment yet
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {approvedDays.map((d) => {
                  const record = recordFor(d.date);
                  return (
                    <div
                      key={d.date}
                      onClick={() => setDetailDate(d.date)}
                      className="relative rounded-[var(--radius-lg)] p-5 overflow-hidden shadow-lg shadow-success/10 border border-success/30 bg-gradient-to-br from-success/[0.07] via-card to-card cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-success via-emerald-400 to-success" />
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono text-muted">{fmtDate(d.date)}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success text-white shadow-sm">
                          <CheckCircle2 size={10} /> Approved
                        </span>
                      </div>

                      <div className="text-2xl font-bold text-success mb-1">{fmt(amountFor(d))}</div>
                      <div className="text-[11px] text-muted mb-4">
                        via {sourceFor(d) === "cash" ? "Cash" : "Mobile Money"}
                        {record?.versaimentDate && ` · versed ${fmtDate(record.versaimentDate)}`}
                        {record?.madeBy && ` · by ${record.madeBy}`}
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); undoApproval(d.date); }}
                        className="w-full py-2 text-xs font-semibold bg-card border border-border text-foreground rounded-[var(--radius)] hover:bg-accent/40 transition-colors"
                      >
                        Undo Approval
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {detailDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setDetailDate(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card border border-border rounded-[var(--radius-lg)] shadow-2xl overflow-hidden"
          >
            <div
              className={`relative p-5 text-white ${
                detailRecord?.approved
                  ? "bg-gradient-to-br from-success via-emerald-500 to-success"
                  : "bg-gradient-to-br from-primary via-primary to-secondary"
              }`}
            >
              <button onClick={() => setDetailDate(null)} className="absolute top-3 right-3 text-white/70 hover:text-white">
                <X size={18} />
              </button>
              <div className="text-xs font-mono text-white/80 mb-1">{fmtDate(detailDay.date)}</div>
              <div className="text-2xl font-bold">{fmt(amountFor(detailDay))}</div>
              <div className="text-xs text-white/80 mt-1">
                via {sourceFor(detailDay) === "cash" ? "Cash" : "Mobile Money"}
                {detailRecord?.approved ? " · Approved" : " · Pending"}
                {detailRecord?.madeBy && ` · by ${detailRecord.madeBy}`}
              </div>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {detailRecord?.approved && detailRecord.versaimentDate && (
                <div className="text-xs text-success bg-success/10 border border-success/20 rounded-[var(--radius)] px-3 py-2">
                  Versed on {fmtDate(detailRecord.versaimentDate)}
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Banknote size={12} /> Cash Payments ({fmt(detailDay.dayCash)})
                </div>
                {myPayments.filter((p) => p.date === detailDay.date && p.mode === "cash").length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <div className="space-y-1">
                    {myPayments.filter((p) => p.date === detailDay.date && p.mode === "cash").map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{getClientName(p.clientId)}</span>
                        <span className="font-mono text-success">{fmt(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Smartphone size={12} /> Mobile Money ({fmt(detailDay.dayTel)})
                </div>
                {myPayments.filter((p) => p.date === detailDay.date && p.mode === "telephone").length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <div className="space-y-1">
                    {myPayments.filter((p) => p.date === detailDay.date && p.mode === "telephone").map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{getClientName(p.clientId)}</span>
                        <span className="font-mono text-secondary">{fmt(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Receipt size={12} /> Depense ({fmt(detailDay.dayExp)})
                </div>
                {myExpenses.filter((e) => e.date === detailDay.date).length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <div className="space-y-1">
                    {myExpenses.filter((e) => e.date === detailDay.date).map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{e.name}</span>
                        <span className="font-mono text-danger">-{fmt(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}