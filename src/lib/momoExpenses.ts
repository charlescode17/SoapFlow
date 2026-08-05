import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type ReconciliationExpense = {
  id: string;
  name: string;
  amount: number;
  date: string;
  createdById: string;
  createdBy: string;
};

export function useReconciliationExpenses(
  agentId: string | undefined,
  dateFrom?: string,
  dateTo?: string,
) {
  const [expenses, setExpenses] = useState<ReconciliationExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!agentId) {
      setExpenses([]);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("momo_reconciliation_expenses")
      .select("*")
      .eq("agent_id", agentId)
      .order("date", { ascending: true });

    if (dateFrom) query = query.gte("date", dateFrom);
    if (dateTo) query = query.lte("date", dateTo);

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      console.error("Failed to load reconciliation expenses", error);
      setError(error.message);
      return;
    }
    setError(null);
    setExpenses(
      (data ?? []).map((e: any) => ({
        id: e.id,
        name: e.name,
        amount: Number(e.amount),
        date: e.date,
        createdById: e.created_by_id,
        createdBy: e.created_by,
      })),
    );
  }, [agentId, dateFrom, dateTo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addExpense = useCallback(
    async (name: string, amount: number, createdBy: string, createdById: string, date?: string) => {
      if (!agentId) return { error: "No agent selected" };
      const { error } = await supabase.from("momo_reconciliation_expenses").insert({
        agent_id: agentId,
        date: date ?? new Date().toISOString().slice(0, 10),
        name,
        amount,
        created_by: createdBy,
        created_by_id: createdById,
      });
      if (error) {
        setError(error.message);
        return { error: error.message };
      }
      await refresh();
      return { error: undefined };
    },
    [agentId, refresh],
  );

  const updateExpense = useCallback(
    async (id: string, fields: { name?: string; amount?: number }) => {
      const { error } = await supabase
        .from("momo_reconciliation_expenses")
        .update(fields)
        .eq("id", id);
      if (error) {
        setError(error.message);
        return { error: error.message };
      }
      await refresh();
      return { error: undefined };
    },
    [refresh],
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("momo_reconciliation_expenses").delete().eq("id", id);
      if (error) {
        setError(error.message);
        return { error: error.message };
      }
      await refresh();
      return { error: undefined };
    },
    [refresh],
  );

  return { expenses, loading, error, refresh, addExpense, updateExpense, deleteExpense };
}