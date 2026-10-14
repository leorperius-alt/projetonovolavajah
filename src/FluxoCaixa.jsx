import React, { useState } from "react";
import { Plus, Trash2, ArrowUpCircle, TrendingDown, Banknote, X } from "lucide-react";
import * as db from "./lib/db";

const money = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const localDateStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const dateStrOf = (iso) => {
  if (!iso) return "";
  if (iso.length === 10) return iso; // já é data pura (ex.: expense_date)
  return localDateStr(new Date(iso));
};
const daysAgoStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
};
const dayLabel = (dateStr) => {
  if (dateStr === localDateStr()) return "Hoje";
  if (dateStr === daysAgoStr(1)) return "Ontem";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

const RANGES = [
  { k: "hoje", l: "Hoje", start: () => localDateStr() },
  { k: "7dias", l: "7 dias", start: () => daysAgoStr(6) },
  { k: "30dias", l: "30 dias", start: () => daysAgoStr(29) },
  { k: "todos", l: "Tudo", start: () => "0000-00-00" },
];

// Fluxo de caixa = entradas (lavagens pagas + dinheiro adicionado) − saídas (despesas)
export default function FluxoCaixaView({ data, companyId, refetch }) {
  const [range, setRange] = useState("30dias");
  const [formOpen, setFormOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [desc, setDesc] = useState("");
  const [dataAporte, setDataAporte] = useState(localDateStr());
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const customerLine = (order) => {
    const customer = (data.customers || []).find((c) => c.id === order.customer_id);
    const vehicle = customer?.vehicles?.find((v) => v.id === order.vehicle_id);
    return [vehicle?.plate, customer?.name].filter(Boolean).join(" · ") || "Lavagem";
  };

  // 1) Junta todas as movimentações da história
  const movs = [
    ...(data.orders || [])
      .filter((o) => o.status === "entregue" && o.paid)
      .map((o) => ({ id: "o-" + o.id, kind: "venda", date: dateStrOf(o.created_at), ts: o.created_at || "", label: customerLine(o), amount: Number(o.total) || 0 })),
    ...(data.cashDeposits || []).map((c) => ({ id: "c-" + c.id, kind: "aporte", rawId: c.id, date: dateStrOf(c.deposit_date), ts: c.created_at || "", label: c.description || "Aporte", amount: Number(c.amount) || 0 })),
    ...(data.expenses || []).map((e) => ({ id: "e-" + e.id, kind: "despesa", date: dateStrOf(e.expense_date), ts: e.created_at || "", label: e.description, amount: -(Number(e.amount) || 0) })),
  ].sort((a, b) => (a.date + a.ts).localeCompare(b.date + b.ts));

  // 2) Saldo acumulado desde o começo
  let acc = 0;
  const withBalance = movs.map((m) => {
    acc += m.amount;
    return { ...m, balance: acc };
  });

  // 3) Recorte do período
  const start = RANGES.find((r) => r.k === range).start();
  const inPeriod = withBalance.filter((m) => m.date >= start);
  const saldoInicial = withBalance.filter((m) => m.date < start).reduce((_, m) => m.balance, 0);
  const vendas = inPeriod.filter((m) => m.kind === "venda").reduce((s, m) => s + m.amount, 0);
  const aportes = inPeriod.filter((m) => m.kind === "aporte").reduce((s, m) => s + m.amount, 0);
  const saidas = inPeriod.filter((m) => m.kind === "despesa").reduce((s, m) => s + -m.amount, 0);
  const entradas = vendas + aportes;
  const saldoAtual = acc;

  // 4) Agrupa por dia (mais recente primeiro)
  const days = [];
  [...inPeriod].reverse().forEach((m) => {
    let g = days[days.length - 1];
    if (!g || g.date !== m.date) {
      g = { date: m.date, items: [], net: 0 };
      days.push(g);
    }
    g.items.push(m);
    g.net += m.amount;
  });

  const salvar = async () => {
    const v = Number(String(valor).replace(",", "."));
    if (!v || v <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    setSaving(true);
    setErro("");
    try {
      await db.createCashDeposit(companyId, { description: desc, amount: Math.round(v * 100) / 100, deposit_date: dataAporte });
      setValor("");
      setDesc("");
      setDataAporte(localDateStr());
      setFormOpen(false);
      refetch();
    } catch (err) {
      setErro("Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const remover = async (m) => {
    if (!window.confirm(`Remover "${m.label}" (${money(m.amount)}) do caixa?`)) return;
    try {
      await db.deleteCashDeposit(m.rawId);
      refetch();
    } catch (err) {
      setErro("Não foi possível remover. Tente de novo.");
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 gap-3">
        <h1 className="font-display text-xl font-semibold">Fluxo de caixa</h1>
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
          {RANGES.map((o) => (
            <button key={o.k} onClick={() => setRange(o.k)} className={`text-xs font-medium px-3 py-1.5 rounded-lg ${range === o.k ? "bg-zinc-600 text-white" : "text-[var(--text-secondary)]"}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1">Saldo em caixa</p>
          <p className={`font-num text-2xl font-semibold ${saldoAtual >= 0 ? "text-[var(--text)]" : "text-rose-400"}`}>{money(saldoAtual)}</p>
        </div>
        <button onClick={() => { setFormOpen((o) => !o); setErro(""); }} className="flex items-center gap-1.5 bg-[#d4af6a] hover:brightness-95 text-[#2e3138] text-sm font-semibold px-4 py-2.5 rounded-lg shrink-0">
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Fechar" : "Adicionar dinheiro"}
        </button>
      </div>

      {formOpen && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Adicionar dinheiro ao caixa</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={valor} onChange={(e) => setValor(e.target.value)} type="number" inputMode="decimal" step="0.01" min="0" placeholder="Valor" className="w-full sm:w-32 px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm font-num focus:outline-none focus:ring-2 focus:ring-zinc-400" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição (ex: troco inicial, aporte do sócio)" className="flex-1 px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400" />
            <input value={dataAporte} onChange={(e) => setDataAporte(e.target.value)} type="date" className="w-full sm:w-40 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400" />
            <button onClick={salvar} disabled={saving} className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              <Plus size={15} /> {saving ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </div>
      )}
      {erro && <p className="text-xs text-rose-400 mb-3 px-1">{erro}</p>}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 md:p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Entradas</p>
          <p className="font-num text-base md:text-lg font-semibold text-emerald-400">{money(entradas)}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Lavagens {money(vendas)} · Aportes {money(aportes)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 md:p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Saídas</p>
          <p className="font-num text-base md:text-lg font-semibold text-rose-400">{money(saidas)}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Despesas</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 md:p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Saldo inicial</p>
          <p className="font-num text-base md:text-lg font-semibold">{money(saldoInicial)}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">No começo do período</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Movimentações</p>
      {days.length === 0 && <div className="text-center py-10 text-[var(--text-secondary)] text-sm">Nenhuma movimentação neste período</div>}
      <div className="flex flex-col gap-4">
        {days.map((g) => (
          <div key={g.date}>
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-xs font-medium text-[var(--text-secondary)] capitalize">{dayLabel(g.date)}</p>
              <p className={`font-num text-xs font-semibold ${g.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{g.net >= 0 ? "+" : "−"}{money(Math.abs(g.net))}</p>
            </div>
            <div className="flex flex-col gap-2">
              {g.items.map((m) => (
                <div key={m.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
                  {m.kind === "despesa" ? (
                    <TrendingDown size={16} className="text-rose-400 shrink-0" />
                  ) : m.kind === "aporte" ? (
                    <ArrowUpCircle size={16} className="text-[#d4af6a] shrink-0" />
                  ) : (
                    <Banknote size={16} className="text-emerald-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{m.kind === "venda" ? "Lavagem" : m.kind === "aporte" ? "Dinheiro adicionado" : "Despesa"} · saldo {money(m.balance)}</p>
                  </div>
                  <span className={`font-num text-sm font-semibold ${m.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{m.amount >= 0 ? "+" : "−"}{money(Math.abs(m.amount))}</span>
                  {m.kind === "aporte" && (
                    <button onClick={() => remover(m)} title="Remover" className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
