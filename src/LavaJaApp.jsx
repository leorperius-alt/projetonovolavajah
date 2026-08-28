import React, { useState, useEffect, useCallback } from "react";
import {
  Car, CalendarClock, Users, Wrench, Wallet, Plus, X, Check, Phone, Trash2, Clock,
  Search, Droplets, CheckCircle2, PlayCircle, LogIn, Banknote, LogOut, UserPlus, Copy, Mail,
  TrendingDown, FileBarChart, Download, ChevronRight, ShieldOff, ShieldCheck, UserX,
  Package, ArrowDownCircle, ArrowUpCircle, History, AlertTriangle, MessageCircle, Percent,
  Edit2, XCircle, LayoutDashboard, ArrowUp, ArrowDown, Minus, CreditCard, FileText, Crown,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import * as db from "./lib/db";
import { reportError } from "./sentry.js";
import ThemeToggle from "./ThemeToggle.jsx";

const genLocalId = () => Math.random().toString(36).slice(2, 9);
const money = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayStr = () => new Date().toISOString().slice(0, 10);
const dateTimeStr = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const waLink = (phone, message) => {
  let digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11) digits = "55" + digits; // assume BR se não veio com país
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

// ---- Validação de telefone (BR) ----
const onlyDigits = (v) => (v || "").replace(/\D/g, "");
const isValidPhone = (raw) => {
  if (!raw || !raw.trim()) return true; // telefone é opcional
  const d = onlyDigits(raw);
  return d.length === 10 || d.length === 11 || d.length === 12 || d.length === 13;
};
const formatPhone = (raw) => {
  let d = onlyDigits(raw);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // exibe sem o 55 se já tiver
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
};

// ---- Validação de placa (BR) — aceita padrão antigo (ABC1234) e Mercosul (ABC1D23) ----
const normalizePlate = (raw) => (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isValidPlate = (raw) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(raw));
const formatPlate = (raw) => {
  const p = normalizePlate(raw);
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
};
const dateStrOf = (iso) => (iso ? iso.slice(0, 10) : "");
const timeAgo = (iso) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h`;
};

export default function LavaJaApp({ onLogout }) {
  const [companyId, setCompanyId] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [loyaltyThreshold, setLoyaltyThreshold] = useState(10);
  const [overdueDaysThreshold, setOverdueDaysThreshold] = useState(7);
  const [relatoriosInitialDate, setRelatoriosInitialDate] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [myUserId, setMyUserId] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [data, setData] = useState({ customers: [], services: [], orders: [], expenses: [], products: [], serviceProducts: [], team: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("fila");
  const [modal, setModal] = useState(null);

  const isOwner = myRole === "owner";

  const refetch = useCallback(async (cid) => {
    const id = cid || companyId;
    if (!id) return;
    const fresh = await db.fetchAll(id);
    setData(fresh);
  }, [companyId]);

  const loadProfileWithRetry = async (retries = 8, delayMs = 600) => {
    for (let i = 0; i < retries; i++) {
      const profile = await db.getMyProfile();
      if (profile?.company_id) return profile;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  };

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMyUserId(auth?.user?.id || null);

      const [profile, admin] = await Promise.all([loadProfileWithRetry(), db.checkIsPlatformAdmin()]);
      setIsPlatformAdmin(admin);
      if (profile?.blocked) {
        setBlocked(true);
        setLoading(false);
        return;
      }
      const cid = profile?.company_id || null;
      setCompanyId(cid);
      setMyRole(profile?.role || null);
      if (profile?.role === "owner") setTab("dashboard");
      else if (!cid && admin) setTab("admin");
      if (cid) {
        const { data: company } = await supabase.from("companies").select("name, loyalty_threshold, overdue_days_threshold").eq("id", cid).single();
        setCompanyName(company?.name || "");
        setLoyaltyThreshold(company?.loyalty_threshold || 10);
        setOverdueDaysThreshold(company?.overdue_days_threshold || 7);
        await refetch(cid);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!myUserId) return;
    const unsubscribe = db.subscribeToMyProfile(myUserId, (payload) => {
      if (payload.new?.blocked) setBlocked(true);
    });
    return unsubscribe;
  }, [myUserId]);

  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = db.subscribeToChanges(companyId, () => refetch(companyId));
    return unsubscribe;
  }, [companyId, refetch]);

  useEffect(() => {
    if (!companyId) return;
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal({ type: "buscaGlobal" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [companyId]);

  if (loading) {
    return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center text-[var(--text-secondary)]">Carregando...</div>;
  }

  if (blocked) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-[var(--text-secondary)] font-medium">Seu acesso foi bloqueado.</p>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm">Fale com o responsável da empresa se achar que isso é um engano.</p>
        <button onClick={onLogout} className="mt-2 bg-zinc-600 hover:bg-zinc-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl">
          Sair
        </button>
      </div>
    );
  }

  if (!companyId && !isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-[var(--text-secondary)] font-medium">Não conseguimos encontrar sua empresa ainda.</p>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm">Isso pode acontecer logo após criar a conta. Atualize a página em alguns segundos.</p>
        <button onClick={() => window.location.reload()} className="mt-2 bg-zinc-600 hover:bg-[var(--surface)] text-white text-sm font-medium px-4 py-2.5 rounded-xl">
          Atualizar página
        </button>
        <button onClick={onLogout} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] mt-1">Sair</button>
      </div>
    );
  }

  const FULL_NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, ownerOnly: true },
    { id: "fila", label: "Fila", icon: Car },
    { id: "agenda", label: "Agenda", icon: CalendarClock },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "servicos", label: "Serviços", icon: Wrench },
    { id: "estoque", label: "Estoque", icon: Package },
    { id: "financeiro", label: "Financeiro", icon: Wallet, ownerOnly: true },
    { id: "relatorios", label: "Relatórios", icon: FileBarChart, ownerOnly: true },
    { id: "comissoes", label: "Comissões", icon: Percent, ownerOnly: true },
    { id: "equipe", label: "Equipe", icon: UserPlus, ownerOnly: true },
    { id: "admin", label: "Admin", icon: Crown, platformAdminOnly: true },
  ];
  const NAV = FULL_NAV.filter((n) => {
    if (n.platformAdminOnly) return isPlatformAdmin;
    if (n.ownerOnly) return isOwner;
    return !!companyId;
  });
  const activeTab = NAV.some((n) => n.id === tab) ? tab : companyId ? "fila" : "admin";

  return (
    <div className="w-full min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col md:flex-row" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-num { font-family: 'JetBrains Mono', monospace; }
        .input { width: 100%; padding: 0.85rem 0.9rem; border-radius: 0.7rem; border: 1px solid var(--border); background-color: var(--surface); color: var(--text); font-size: 1rem; outline: none; }
        .input::placeholder { color: var(--text-muted); }
        .input:focus { box-shadow: 0 0 0 2px var(--text-muted); border-color: var(--text-muted); }
      `}</style>

      <div className="hidden md:flex md:flex-col w-56 shrink-0 bg-zinc-800 text-zinc-100 p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-1 px-2">
          <img src="/logo.png" alt="LavaJá" className="w-8 h-8 rounded-lg" />
          <span className="font-display font-semibold text-lg">LavaJá</span>
        </div>
        <p className="px-2 text-xs text-zinc-400/70 mb-3 truncate">{companyName}</p>
        {companyId && (
          <button
            onClick={() => setModal({ type: "buscaGlobal" })}
            className="flex items-center gap-2 px-3 py-2 mb-3 rounded-xl text-sm text-zinc-400 border border-zinc-700 hover:bg-zinc-700/50"
          >
            <Search size={15} />
            Buscar
            <span className="ml-auto text-[10px] text-zinc-500 border border-zinc-600 rounded px-1">Ctrl K</span>
          </button>
        )}
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === n.id ? "bg-zinc-600 text-white" : "text-zinc-300/80 hover:bg-zinc-600/50"
              }`}
            >
              <n.icon size={18} />
              {n.label}
            </button>
          ))}
        </nav>
        <button onClick={() => setModal({ type: "seguranca" })} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-300/70 hover:bg-zinc-600/50 mt-2">
          <ShieldCheck size={18} /> Segurança
        </button>
        <button onClick={onLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-300/70 hover:bg-zinc-600/50">
          <LogOut size={18} /> Sair
        </button>
        <div className="mt-3 flex justify-center">
          <ThemeToggle variant="dark" />
        </div>
      </div>

      <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-zinc-800 text-zinc-100">
        <img src="/logo.png" alt="LavaJá" className="w-7 h-7 rounded-lg" />
        <span className="font-display font-semibold">LavaJá</span>
        <span className="text-xs text-zinc-400/70 truncate flex-1 text-right">{companyName}</span>
        {companyId && (
          <button onClick={() => setModal({ type: "buscaGlobal" })} className="text-zinc-400/80 p-1.5 -m-1.5">
            <Search size={18} />
          </button>
        )}
        <button onClick={() => setModal({ type: "seguranca" })} className="text-zinc-400/80 p-1.5 -m-1.5">
          <ShieldCheck size={18} />
        </button>
        <ThemeToggle variant="dark" className="mr-1" />
        <button onClick={onLogout} className="text-zinc-400/80">
          <LogOut size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
        {activeTab === "dashboard" && isOwner && (
          <DashboardView
            data={data}
            setTab={setTab}
            overdueDaysThreshold={overdueDaysThreshold}
            onSelectDay={(iso) => {
              setRelatoriosInitialDate(iso);
              setTab("relatorios");
            }}
          />
        )}
        {activeTab === "fila" && <FilaView data={data} companyId={companyId} companyName={companyName} refetch={refetch} setModal={setModal} />}
        {activeTab === "agenda" && <AgendaView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {activeTab === "clientes" && (
          <ClientesView
            data={data}
            companyId={companyId}
            refetch={refetch}
            setModal={setModal}
            isOwner={isOwner}
            loyaltyThreshold={loyaltyThreshold}
            setLoyaltyThreshold={setLoyaltyThreshold}
          />
        )}
        {activeTab === "servicos" && <ServicosView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {activeTab === "estoque" && <EstoqueView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {activeTab === "financeiro" && isOwner && (
          <FinanceiroView
            data={data}
            companyId={companyId}
            refetch={refetch}
            setModal={setModal}
            overdueDaysThreshold={overdueDaysThreshold}
            setOverdueDaysThreshold={setOverdueDaysThreshold}
          />
        )}
        {activeTab === "relatorios" && isOwner && (
          <RelatoriosView data={data} initialDate={relatoriosInitialDate} onConsumedInitialDate={() => setRelatoriosInitialDate(null)} setModal={setModal} />
        )}
        {activeTab === "comissoes" && isOwner && <ComissoesView data={data} />}
        {activeTab === "equipe" && isOwner && <EquipeView companyId={companyId} />}
        {activeTab === "admin" && isPlatformAdmin && <AdminView />}
      </div>

      <div className="md:hidden fixed bottom-0 inset-x-0 bg-zinc-800 border-t border-zinc-700 flex overflow-x-auto gap-1 px-1 py-2 z-30">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            className={`shrink-0 min-w-[72px] flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[12px] font-medium ${activeTab === n.id ? "text-zinc-100 bg-zinc-700" : "text-zinc-400"}`}
          >
            <n.icon size={24} />
            {n.label}
          </button>
        ))}
      </div>

      {modal && <ModalRouter modal={modal} setModal={setModal} data={data} companyId={companyId} refetch={refetch} myUserId={myUserId} companyName={companyName} setTab={setTab} />}
    </div>
  );
}

function OrderCustomerLine({ data, order }) {
  const customer = data.customers.find((c) => c.id === order.customer_id);
  const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);
  return (
    <div>
      <p className="font-semibold text-sm">{vehicle ? vehicle.plate : "—"} · {vehicle?.model}</p>
      <p className="text-xs text-[var(--text-secondary)]">{customer?.name}</p>
    </div>
  );
}

function OrderServicesLine({ data, order }) {
  const names = (order.service_ids || []).map((id) => data.services.find((s) => s.id === id)?.name).filter(Boolean);
  const extraNames = (order.extra_services || []).map((e) => e.name);
  return <p className="text-xs text-[var(--text-secondary)] truncate">{[...names, ...extraNames].join(", ")}</p>;
}

function DashboardView({ data, setTab, onSelectDay, overdueDaysThreshold }) {
  const hoje = todayStr();
  const ontemDate = new Date();
  ontemDate.setDate(ontemDate.getDate() - 1);
  const ontem = ontemDate.toISOString().slice(0, 10);
  const mesAtual = hoje.slice(0, 7); // YYYY-MM

  const entregues = data.orders.filter((o) => o.status === "entregue");
  const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
  const vencidas = entregues.filter((o) => !o.paid && diasDesde(o.created_at) >= overdueDaysThreshold);
  const totalVencido = vencidas.reduce((s, o) => s + o.total, 0);
  const pagosHoje = entregues.filter((o) => o.paid && dateStrOf(o.created_at) === hoje).reduce((s, o) => s + o.total, 0);
  const pagosOntem = entregues.filter((o) => o.paid && dateStrOf(o.created_at) === ontem).reduce((s, o) => s + o.total, 0);
  const lavagensHoje = entregues.filter((o) => dateStrOf(o.created_at) === hoje).length;
  const totalHoje = entregues.filter((o) => dateStrOf(o.created_at) === hoje).reduce((s, o) => s + o.total, 0);
  const ticketMedioHoje = lavagensHoje ? totalHoje / lavagensHoje : 0;
  const aReceber = entregues.filter((o) => !o.paid).reduce((s, o) => s + o.total, 0);

  const entreguesMes = entregues.filter((o) => dateStrOf(o.created_at).startsWith(mesAtual));
  const faturadoMes = entreguesMes.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
  const despesasMes = (data.expenses || []).filter((e) => e.expense_date.startsWith(mesAtual)).reduce((s, e) => s + Number(e.amount), 0);
  const lucroMes = faturadoMes - despesasMes;

  const comissoesMes = (data.team || []).reduce((soma, membro) => {
    const total = entreguesMes.filter((o) => o.attendant_id === membro.id).reduce((s, o) => s + o.total, 0);
    return soma + (total * (Number(membro.commission_rate) || 0)) / 100;
  }, 0);

  const filaAguardando = data.orders.filter((o) => o.status === "aguardando").length;
  const filaLavando = data.orders.filter((o) => o.status === "lavando").length;
  const filaPronto = data.orders.filter((o) => o.status === "pronto").length;

  const produtosBaixoEstoque = (data.products || []).filter((p) => Number(p.quantity) <= Number(p.min_quantity));

  const dias = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const iso = d.toISOString().slice(0, 10);
    const total = entregues.filter((o) => o.paid && dateStrOf(o.created_at) === iso).reduce((s, o) => s + o.total, 0);
    return { iso, total, label: d.toLocaleDateString("pt-BR", { day: "2-digit" }) };
  });
  const maxDia = Math.max(1, ...dias.map((d) => d.total));

  const porServicoMes = {};
  entreguesMes.forEach((o) => {
    (o.service_ids || []).forEach((id) => {
      const s = data.services.find((sv) => sv.id === id);
      if (s) porServicoMes[s.name] = (porServicoMes[s.name] || 0) + 1;
    });
    (o.extra_services || []).forEach((e) => {
      porServicoMes[e.name] = (porServicoMes[e.name] || 0) + 1;
    });
  });
  const topServicos = Object.entries(porServicoMes).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const variacao = pagosOntem > 0 ? ((pagosHoje - pagosOntem) / pagosOntem) * 100 : pagosHoje > 0 ? 100 : 0;

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold mb-1">Dashboard</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-5">Visão geral do negócio</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Faturado hoje</p>
          <p className="font-num text-xl font-semibold text-[var(--text)]">{money(pagosHoje)}</p>
          <p className={`text-xs mt-1 flex items-center gap-1 ${variacao > 0 ? "text-emerald-400" : variacao < 0 ? "text-rose-400" : "text-[var(--text-muted)]"}`}>
            {variacao > 0 ? <ArrowUp size={12} /> : variacao < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
            {Math.abs(variacao).toFixed(0)}% vs ontem
          </p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Lavagens hoje</p>
          <p className="font-num text-xl font-semibold text-[var(--text)]">{lavagensHoje}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Ticket médio {money(ticketMedioHoje)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">A receber</p>
          <p className="font-num text-xl font-semibold text-amber-400">{money(aReceber)}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Lavagens entregues e não pagas</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Lucro líquido no mês</p>
          <p className={`font-num text-xl font-semibold ${lucroMes >= 0 ? "text-[var(--text)]" : "text-rose-400"}`}>{money(lucroMes)}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Faturado {money(faturadoMes)} · Despesas {money(despesasMes)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Faturamento — últimos 14 dias</p>
          <p className="text-[11px] text-[var(--text-muted)] mb-3">Valores em R$ · toque num dia pra ver o relatório dele</p>
          <div className="flex items-stretch gap-1.5 h-40">
            {dias.map((d) => (
              <button
                key={d.iso}
                onClick={() => onSelectDay(d.iso)}
                title={`Ver relatório de ${d.label}: ${money(d.total)}`}
                className="flex-1 h-full flex flex-col items-center justify-end gap-1 rounded-lg hover:bg-[var(--bg)] transition-colors py-1"
              >
                <span className="text-[9px] sm:text-[10px] font-num text-[var(--text-secondary)] leading-none whitespace-nowrap">
                  {d.total > 0 ? Math.round(d.total) : ""}
                </span>
                <div className="w-full flex-1 flex items-end min-h-0">
                  <div
                    className="w-full rounded-t bg-zinc-500 hover:bg-zinc-400 transition-all"
                    style={{ height: `${Math.max(4, (d.total / maxDia) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-[var(--text-muted)]">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-3">Fila agora</p>
          <button onClick={() => setTab("fila")} className="w-full flex flex-col gap-2 text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)] flex items-center gap-1.5"><Clock size={13} /> Aguardando</span>
              <span className="font-num font-semibold text-[var(--text)]">{filaAguardando}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)] flex items-center gap-1.5"><Droplets size={13} /> Lavando</span>
              <span className="font-num font-semibold text-[var(--text)]">{filaLavando}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)] flex items-center gap-1.5"><CheckCircle2 size={13} /> Pronto</span>
              <span className="font-num font-semibold text-[var(--text)]">{filaPronto}</span>
            </div>
          </button>
          <div className="border-t border-[var(--border)] mt-3 pt-3">
            <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><Percent size={13} /> Comissões do mês</p>
            <p className="font-num text-lg font-semibold text-[var(--text)] mt-1">{money(comissoesMes)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-3">Top serviços do mês</p>
          {topServicos.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nenhuma lavagem concluída neste mês ainda</p>}
          <div className="flex flex-col gap-2">
            {topServicos.map(([nome, qtd]) => (
              <div key={nome} className="flex items-center justify-between text-sm">
                <span className="text-[var(--text)]">{nome}</span>
                <span className="font-num text-[var(--text-secondary)]">{qtd}x</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-3">Estoque</p>
          {produtosBaixoEstoque.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nenhum produto com estoque baixo 👍</p>
          ) : (
            <button onClick={() => setTab("estoque")} className="w-full text-left">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                <p className="text-sm text-amber-300">{produtosBaixoEstoque.length} produto(s) com estoque baixo</p>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{produtosBaixoEstoque.map((p) => p.name).join(", ")}</p>
            </button>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 md:col-span-2">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-3">Cobranças "a faturar" vencidas</p>
          {vencidas.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nenhuma cobrança vencida 👍</p>
          ) : (
            <button onClick={() => setTab("financeiro")} className="w-full text-left">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                <p className="text-sm text-rose-300">{vencidas.length} cobrança(s) vencida(s) — {money(totalVencido)} em atraso</p>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilaView({ data, companyName, refetch, setModal }) {
  const active = data.orders.filter((o) => ["aguardando", "lavando", "pronto"].includes(o.status));
  const advance = async (order, status) => {
    await db.updateOrderStatus(order.id, status);
    refetch();
  };
  const cancelar = async (order) => {
    const ok = window.confirm("Cancelar esse pedido? Se o estoque já tiver sido usado, ele volta automaticamente.");
    if (!ok) return;
    await db.cancelOrder(order, data.serviceProducts);
    refetch();
  };
  const columns = [
    { key: "aguardando", title: "Aguardando", icon: Clock },
    { key: "lavando", title: "Lavando", icon: Droplets },
    { key: "pronto", title: "Pronto", icon: CheckCircle2 },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl font-semibold">Fila do dia</h1>
          <p className="text-sm text-[var(--text-secondary)]">{active.length} veículo(s) em atendimento</p>
        </div>
        <button onClick={() => setModal({ type: "novoCarro" })} className="flex items-center gap-1.5 bg-zinc-500 hover:bg-zinc-400 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm">
          <Plus size={16} /> Novo carro
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col) => {
          const items = active.filter((o) => o.status === col.key);
          return (
            <div key={col.key} className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-3">
              <div className="flex items-center gap-2 mb-3 px-1">
                <col.icon size={16} className="text-[var(--text-secondary)]" />
                <span className="text-sm font-semibold text-[var(--text-secondary)]">{col.title}</span>
                <span className="ml-auto text-xs font-num text-[var(--text-secondary)]">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2 min-h-[80px]">
                {items.length === 0 && <p className="text-xs text-[var(--text-secondary)] px-1 py-4 text-center">Nenhum carro aqui</p>}
                {items.map((order) => {
                  const customer = data.customers.find((c) => c.id === order.customer_id);
                  const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);
                  const mensagem = `Olá${customer?.name ? ", " + customer.name.split(" ")[0] : ""}! Seu veículo${vehicle?.plate ? ` (${vehicle.plate})` : ""} já está pronto na ${companyName || "lavagem"}. Pode vir buscar quando quiser! 🚗✨`;
                  const link = waLink(customer?.phone, mensagem);
                  return (
                    <div key={order.id} className="border border-[var(--border)] rounded-xl p-3 bg-[var(--bg)]">
                      <div className="flex items-start justify-between gap-2">
                        <OrderCustomerLine data={data} order={order} />
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setModal({ type: "editarPedido", order })} title="Editar pedido" className="text-[var(--text-muted)] hover:text-[var(--text)] p-1.5 -m-1.5">
                            <Edit2 size={17} />
                          </button>
                          <button onClick={() => cancelar(order)} title="Cancelar pedido" className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
                            <XCircle size={18} />
                          </button>
                        </div>
                      </div>
                      <OrderServicesLine data={data} order={order} />
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-[var(--text-secondary)]">há {timeAgo(order.created_at)}</span>
                        <span className="font-num text-sm font-semibold text-[var(--text)]">{money(order.total)}</span>
                      </div>
                      <div className="mt-2 flex flex-col gap-1.5">
                        {col.key === "aguardando" && (
                          <button onClick={() => advance(order, "lavando")} className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg py-3">
                            <PlayCircle size={14} /> Iniciar lavagem
                          </button>
                        )}
                        {col.key === "lavando" && (
                          <button onClick={() => advance(order, "pronto")} className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-zinc-500 hover:bg-zinc-600 text-white rounded-lg py-3">
                            <CheckCircle2 size={14} /> Marcar pronto
                          </button>
                        )}
                        {col.key === "pronto" && (
                          <>
                            {link ? (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-3"
                              >
                                <MessageCircle size={14} /> Avisar no WhatsApp
                              </a>
                            ) : (
                              <p className="text-[11px] text-[var(--text-muted)] text-center">Cliente sem telefone cadastrado</p>
                            )}
                            <button onClick={() => setModal({ type: "confirmarEntrega", order })} className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg py-3">
                              <Check size={14} /> Entregar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({ data, refetch, setModal }) {
  const scheduled = data.orders
    .filter((o) => o.status === "agendado")
    .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));

  const checkIn = async (order) => {
    await db.updateOrderStatus(order.id, "aguardando", { created_at: new Date().toISOString() });
    await db.consumeOrderStock(order.service_ids, order.extra_products, data.serviceProducts, "Consumo automático — check-in de agendamento");
    refetch();
  };

  const cancelar = async (order) => {
    const ok = window.confirm("Cancelar esse agendamento?");
    if (!ok) return;
    await db.cancelOrder(order, data.serviceProducts);
    refetch();
  };

  const groups = {};
  scheduled.forEach((o) => {
    const d = dateStrOf(o.scheduled_time);
    groups[d] = groups[d] || [];
    groups[d].push(o);
  });

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl font-semibold">Agenda</h1>
          <p className="text-sm text-[var(--text-secondary)]">{scheduled.length} agendamento(s)</p>
        </div>
        <button onClick={() => setModal({ type: "novoAgendamento" })} className="flex items-center gap-1.5 bg-zinc-500 hover:bg-zinc-400 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm">
          <Plus size={16} /> Novo agendamento
        </button>
      </div>

      {Object.keys(groups).length === 0 && <div className="text-center py-16 text-[var(--text-secondary)] text-sm">Nenhum agendamento cadastrado</div>}

      <div className="flex flex-col gap-5">
        {Object.entries(groups).map(([date, items]) => (
          <div key={date}>
            <p className="text-xs font-semibold uppercase text-[var(--text-secondary)] mb-2 px-1">
              {new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              {date === todayStr() && " · hoje"}
            </p>
            <div className="flex flex-col gap-2">
              {items.map((order) => (
                <div key={order.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
                  <div className="font-num text-sm font-semibold text-[var(--text)] w-14 shrink-0">
                    {new Date(order.scheduled_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <OrderCustomerLine data={data} order={order} />
                    <OrderServicesLine data={data} order={order} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setModal({ type: "editarPedido", order })} title="Editar" className="text-[var(--text-muted)] hover:text-[var(--text)] p-1.5 -m-1.5">
                      <Edit2 size={17} />
                    </button>
                    <button onClick={() => cancelar(order)} title="Cancelar" className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
                      <XCircle size={18} />
                    </button>
                    <div className="text-right">
                      <p className="font-num text-sm font-semibold">{money(order.total)}</p>
                      <button onClick={() => checkIn(order)} className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--text)] hover:text-[var(--text)]">
                        <LogIn size={12} /> Check-in
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientesView({ data, companyId, refetch, setModal, isOwner, loyaltyThreshold, setLoyaltyThreshold }) {
  const [q, setQ] = useState("");
  const filtered = data.customers.filter((c) =>
    (c.name + (c.phone || "") + c.vehicles.map((v) => v.plate).join(" ")).toLowerCase().includes(q.toLowerCase())
  );

  const removeCustomer = async (id) => {
    await db.deleteCustomer(id);
    refetch();
  };

  const statsDoCliente = (customerId) => {
    const pedidos = data.orders.filter((o) => o.customer_id === customerId && o.status === "entregue");
    const lavagens = pedidos.length;
    const gasto = pedidos.reduce((s, o) => s + o.total, 0);
    const ultima = pedidos.reduce((max, o) => (!max || o.created_at > max ? o.created_at : max), null);
    return { lavagens, gasto, ultima, pedidos };
  };

  const salvarMeta = async (value) => {
    const v = Math.max(1, Number(value) || 1);
    setLoyaltyThreshold(v);
    await db.setLoyaltyThreshold(companyId, v);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Clientes</h1>
          <p className="text-sm text-[var(--text-secondary)]">{data.customers.length} cliente(s) cadastrado(s)</p>
        </div>
        <button onClick={() => setModal({ type: "novoCliente" })} className="flex items-center gap-1.5 bg-zinc-500 hover:bg-zinc-400 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm">
          <Plus size={16} /> Novo cliente
        </button>
      </div>

      {isOwner && (
        <div className="flex items-center gap-2 mb-4 text-xs text-[var(--text-secondary)]">
          <span>Fidelidade: a cada</span>
          <input
            defaultValue={loyaltyThreshold}
            onBlur={(e) => salvarMeta(e.target.value)}
            type="number"
            min="1"
            className="w-14 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-center"
          />
          <span>lavagens, o cliente ganha 1 grátis</span>
        </div>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone ou placa" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--border)] text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-zinc-400" />
      </div>

      {filtered.length === 0 && <div className="text-center py-16 text-[var(--text-secondary)] text-sm">Nenhum cliente encontrado</div>}

      <div className="flex flex-col gap-2">
        {filtered.map((c) => {
          const { lavagens, gasto, ultima } = statsDoCliente(c.id);
          const posicaoNoCiclo = lavagens % loyaltyThreshold;
          const pronto = lavagens > 0 && posicaoNoCiclo === 0;
          const completas = pronto ? loyaltyThreshold : posicaoNoCiclo;
          const restantes = loyaltyThreshold - completas;
          return (
            <div key={c.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{c.name}</p>
                  {c.phone && <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mt-0.5"><Phone size={11} /> {formatPhone(c.phone)}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setModal({ type: "editarCliente", customer: c })} title="Editar cliente" className="text-[var(--text-muted)] hover:text-[var(--text)] p-1.5 -m-1.5">
                    <Edit2 size={17} />
                  </button>
                  <button onClick={() => setModal({ type: "novoVeiculo", customerId: c.id })} className="text-xs font-medium text-[var(--text)] hover:text-[var(--text)] flex items-center gap-1">
                    <Plus size={12} /> Veículo
                  </button>
                  <button onClick={() => removeCustomer(c.id)} className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              {c.vehicles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.vehicles.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setModal({ type: "editarVeiculo", vehicle: v })}
                      title="Editar veículo"
                      className="text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 rounded-lg px-2.5 py-1 flex items-center gap-1.5"
                    >
                      {v.plate} · {v.model} {v.color ? `(${v.color})` : ""}
                      <Edit2 size={10} className="text-zinc-400" />
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-[var(--text-secondary)]">
                  <span className="font-num font-semibold text-[var(--text)]">{lavagens}</span> lavagem(ns) ·{" "}
                  <span className="font-num font-semibold text-[var(--text)]">{money(gasto)}</span> gasto
                  {ultima && <> · última em {dateTimeStr(ultima).split(" ")[0]}</>}
                </div>
                <button onClick={() => setModal({ type: "historicoCliente", customer: c })} className="text-xs font-medium text-[var(--text)] underline hover:no-underline">
                  Ver histórico
                </button>
              </div>

              {lavagens > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${pronto ? "bg-emerald-500" : "bg-zinc-500"}`}
                      style={{ width: `${(completas / loyaltyThreshold) * 100}%` }}
                    />
                  </div>
                  <p className={`text-[11px] mt-1 ${pronto ? "text-emerald-400" : "text-[var(--text-muted)]"}`}>
                    {pronto ? "🎉 Já pode ganhar a lavagem grátis!" : `Faltam ${restantes} lavagem(ns) para a grátis`}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmarEntregaModal({ data, refetch, close, order, setModal, companyName }) {
  const [saving, setSaving] = useState(false);
  const [entregue, setEntregue] = useState(false);
  const [metodoEscolhido, setMetodoEscolhido] = useState(null);
  const customer = data.customers.find((c) => c.id === order.customer_id);
  const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);

  const icons = {
    dinheiro: Banknote,
    cartao_credito: CreditCard,
    cartao_debito: CreditCard,
    a_faturar: FileText,
  };

  const escolher = async (method) => {
    if (saving) return;
    setSaving(true);
    try {
      await db.finalizeDelivery(order.id, method);
      refetch();
      setMetodoEscolhido(method);
      setEntregue(true);
    } finally {
      setSaving(false);
    }
  };

  if (entregue) {
    return (
      <ModalShell title="Entrega registrada!" onClose={close}>
        <div className="flex flex-col gap-3 items-center text-center py-2">
          <CheckCircle2 size={40} className="text-emerald-500" />
          <p className="text-sm text-[var(--text-secondary)]">Quer imprimir ou mandar o comprovante pro cliente?</p>
          <button
            onClick={() =>
              setModal({
                type: "comprovante",
                order: { ...order, status: "entregue", payment_method: metodoEscolhido, paid: metodoEscolhido !== "a_faturar" },
              })
            }
            className="w-full bg-zinc-600 hover:bg-zinc-500 text-white font-medium text-sm py-3 rounded-xl"
          >
            Ver comprovante
          </button>
          <button onClick={close} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)]">
            Fechar sem imprimir
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Entregar — ${vehicle?.plate || "veículo"}`} onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--text-secondary)]">{customer?.name} · total <span className="font-num font-semibold text-[var(--text)]">{money(order.total)}</span></p>
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-1">Como o cliente pagou?</p>
        <div className="grid grid-cols-2 gap-2">
          {db.PAYMENT_METHODS.map((m) => {
            const Icon = icons[m.value];
            return (
              <button
                key={m.value}
                disabled={saving}
                onClick={() => escolher(m.value)}
                className="flex flex-col items-center gap-2 border border-[var(--border)] hover:border-zinc-400 rounded-xl py-4 disabled:opacity-60"
              >
                <Icon size={20} className="text-[var(--text)]" />
                <span className="text-xs font-medium text-[var(--text)]">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}

function SegurancaModal({ close }) {
  const [factors, setFactors] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp || []);
    setLoadingList(false);
  };

  useEffect(() => {
    load();
  }, []);

  const iniciarAtivacao = async () => {
    setError("");
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) {
      setError(error.message);
      return;
    }
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setEnrolling(true);
  };

  const confirmarAtivacao = async () => {
    if (!factorId || code.length < 6) return;
    setLoading(true);
    setError("");
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setLoading(false);
      setError(challengeError.message);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    setLoading(false);
    if (verifyError) {
      setError("Código incorreto. Confira o app autenticador e tente de novo.");
      return;
    }
    setEnrolling(false);
    setQr(null);
    setCode("");
    load();
  };

  const cancelarAtivacao = async () => {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId });
    setEnrolling(false);
    setQr(null);
    setCode("");
    setError("");
  };

  const remover = async (id) => {
    const ok = window.confirm("Desativar a verificação em duas etapas? Você vai poder entrar só com a senha de novo.");
    if (!ok) return;
    await supabase.auth.mfa.unenroll({ factorId: id });
    load();
  };

  const verificado = factors.find((f) => f.status === "verified");

  return (
    <ModalShell title="Segurança da conta" onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--text-secondary)]">
          A verificação em duas etapas pede um código do seu celular toda vez que você entrar, além da senha — protege sua conta mesmo se alguém descobrir sua senha.
        </p>

        {loadingList ? (
          <p className="text-sm text-[var(--text-muted)]">Carregando...</p>
        ) : verificado ? (
          <div className="border border-emerald-800 bg-emerald-950 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-emerald-300 flex items-center gap-1.5"><ShieldCheck size={15} /> Ativada</span>
            <button onClick={() => remover(verificado.id)} className="text-xs font-medium text-rose-400 hover:text-rose-300">Desativar</button>
          </div>
        ) : enrolling ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--text-secondary)]">
              Escaneie este código com o Google Authenticator, Microsoft Authenticator ou app parecido:
            </p>
            {qr && <img src={qr} alt="QR code de ativação" className="w-40 h-40 mx-auto bg-white p-2 rounded-lg" />}
            <p className="text-[11px] text-[var(--text-muted)] text-center break-all">Ou digite manualmente no app: {secret}</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Código de 6 dígitos"
              className="input text-center tracking-[0.4em]"
              maxLength={6}
              autoFocus
            />
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              disabled={loading || code.length < 6}
              onClick={confirmarAtivacao}
              className="bg-zinc-600 hover:bg-zinc-500 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl"
            >
              {loading ? "Confirmando..." : "Confirmar e ativar"}
            </button>
            <button onClick={cancelarAtivacao} className="text-xs text-[var(--text-secondary)] text-center">Cancelar</button>
          </div>
        ) : (
          <>
            <button onClick={iniciarAtivacao} className="bg-zinc-600 hover:bg-zinc-500 text-white font-medium text-sm py-3 rounded-xl">
              Ativar verificação em duas etapas
            </button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </>
        )}
      </div>
    </ModalShell>
  );
}

function BuscaGlobalModal({ data, close, setModal, setTab }) {
  const [q, setQ] = useState("");
  const inputRef = React.useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const termo = q.trim().toLowerCase();

  const resultados = termo.length === 0 ? [] : data.customers
    .map((c) => {
      const veiculoBatendo = c.vehicles.find((v) => normalizePlate(v.plate).includes(normalizePlate(termo)) || (v.model || "").toLowerCase().includes(termo));
      const bateNome = c.name.toLowerCase().includes(termo);
      const batePhone = onlyDigits(c.phone || "").includes(onlyDigits(termo));
      if (!bateNome && !batePhone && !veiculoBatendo) return null;
      return { customer: c, vehicle: veiculoBatendo || c.vehicles[0] };
    })
    .filter(Boolean)
    .slice(0, 20);

  const abrirCliente = (customer) => {
    setTab("clientes");
    setModal({ type: "historicoCliente", customer });
  };

  return (
    <ModalShell title="Buscar" onClose={close}>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, telefone ou placa..."
            className="input pl-9"
          />
        </div>

        {termo.length === 0 && <p className="text-xs text-[var(--text-muted)]">Digite pra buscar clientes e veículos por nome, telefone ou placa.</p>}
        {termo.length > 0 && resultados.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-4">Nada encontrado.</p>}

        <div className="flex flex-col gap-2">
          {resultados.map(({ customer, vehicle }) => (
            <button
              key={customer.id}
              onClick={() => abrirCliente(customer)}
              className="flex items-center gap-3 border border-[var(--border)] rounded-xl p-3 text-left hover:border-zinc-400"
            >
              <Users size={16} className="text-[var(--text-secondary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{customer.name}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {customer.phone ? formatPhone(customer.phone) : "sem telefone"}
                  {vehicle ? ` · ${vehicle.plate} (${vehicle.model || "—"})` : ""}
                </p>
              </div>
              <ChevronRight size={16} className="text-[var(--text-muted)] shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

function HistoricoClienteModal({ data, customer, close, setModal }) {
  const pedidos = data.orders
    .filter((o) => o.customer_id === customer.id && o.status === "entregue")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const totalGasto = pedidos.reduce((s, o) => s + o.total, 0);

  return (
    <ModalShell title={`Histórico — ${customer.name}`} onClose={close}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Total de lavagens</p>
          <p className="font-num text-lg font-semibold text-[var(--text)]">{pedidos.length}</p>
        </div>
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Total gasto</p>
          <p className="font-num text-lg font-semibold text-[var(--text)]">{money(totalGasto)}</p>
        </div>
      </div>

      {pedidos.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-6">Nenhuma lavagem concluída ainda.</p>}

      <div className="flex flex-col gap-2">
        {pedidos.map((o) => (
          <div key={o.id} className="border border-[var(--border)] rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <OrderServicesLine data={data} order={o} />
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-num text-sm font-semibold text-[var(--text)]">{money(o.total)}</span>
                <button onClick={() => setModal({ type: "comprovante", order: o })} title="Ver/imprimir comprovante" className="text-[var(--text-muted)] hover:text-[var(--text)] p-1.5 -m-1.5">
                  <FileText size={16} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-[var(--text-muted)]">{dateTimeStr(o.created_at)}</p>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${o.paid ? "bg-zinc-700 text-zinc-100" : "bg-amber-950 text-amber-300"}`}>
                {o.paid ? "Pago" : "Pendente"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

function ServicosView({ data, companyId, refetch, setModal }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const add = async () => {
    if (!name.trim() || !price) return;
    await db.createService(companyId, { name: name.trim(), price: Number(price) });
    setName("");
    setPrice("");
    refetch();
  };

  const remove = async (id) => {
    await db.deleteService(id);
    refetch();
  };

  const updatePrice = async (id, value) => {
    await db.updateServicePrice(id, Number(value) || 0);
    refetch();
  };

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold mb-1">Serviços</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-5">{data.services.length} serviço(s) cadastrado(s)</p>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-5 flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do serviço" className="flex-1 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400" />
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" placeholder="Preço" className="w-full sm:w-32 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm font-num focus:outline-none focus:ring-2 focus:ring-zinc-400" />
        <button onClick={add} className="flex items-center justify-center gap-1.5 bg-zinc-600 hover:bg-[var(--surface)] text-white text-sm font-medium px-4 py-2.5 rounded-lg">
          <Plus size={15} /> Adicionar
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {data.services.map((s) => {
          const vinculos = data.serviceProducts.filter((sp) => sp.service_id === s.id);
          return (
            <div key={s.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
              <Wrench size={16} className="text-[var(--text-secondary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{s.name}</span>
                {vinculos.length > 0 && (
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    Consome: {vinculos.map((v) => {
                      const p = data.products.find((pr) => pr.id === v.product_id);
                      return p ? `${v.quantity} ${p.unit} de ${p.name}` : null;
                    }).filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 font-num text-sm">
                <span className="text-[var(--text-secondary)]">R$</span>
                <input defaultValue={s.price} onBlur={(e) => updatePrice(s.id, e.target.value)} type="number" className="w-20 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-right focus:outline-none focus:ring-2 focus:ring-zinc-400" />
              </div>
              <button
                onClick={() => setModal({ type: "vincularProdutos", servico: s })}
                title="Vincular produtos do estoque"
                className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
              >
                <Package size={15} />
              </button>
              <button onClick={() => remove(s.id)} className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinanceiroView({ data, companyId, refetch, setModal, overdueDaysThreshold, setOverdueDaysThreshold }) {
  const [range, setRange] = useState("hoje");
  const [expDesc, setExpDesc] = useState("");
  const [expValor, setExpValor] = useState("");
  const [expData, setExpData] = useState(todayStr());

  const inRangeOrder = (order) => {
    if (order.status !== "entregue") return false;
    const d = new Date(order.created_at);
    const now = new Date();
    if (range === "hoje") return dateStrOf(order.created_at) === todayStr();
    if (range === "7dias") return now - d <= 7 * 24 * 3600 * 1000;
    return true;
  };

  const inRangeExpense = (exp) => {
    const d = new Date(exp.expense_date + "T00:00:00");
    const now = new Date();
    if (range === "hoje") return exp.expense_date === todayStr();
    if (range === "7dias") return now - d <= 7 * 24 * 3600 * 1000;
    return true;
  };

  const filteredOrders = data.orders.filter(inRangeOrder).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const filteredExpenses = (data.expenses || []).filter(inRangeExpense).sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
  const totalPago = filteredOrders.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
  const totalPendente = filteredOrders.filter((o) => !o.paid).reduce((s, o) => s + o.total, 0);
  const totalDespesas = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const lucroLiquido = totalPago - totalDespesas;

  const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
  const vencidas = data.orders
    .filter((o) => o.status === "entregue" && !o.paid && diasDesde(o.created_at) >= overdueDaysThreshold)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const totalVencido = vencidas.reduce((s, o) => s + o.total, 0);

  const salvarLimiteVencido = async (value) => {
    const v = Math.max(1, Number(value) || 1);
    setOverdueDaysThreshold(v);
    await db.setOverdueDaysThreshold(companyId, v);
  };

  const alterarFormaPagamento = async (order, method) => {
    await db.setPaymentMethod(order.id, method);
    refetch();
  };

  const addExpense = async () => {
    if (!expDesc.trim() || !expValor) return;
    await db.createExpense(companyId, { description: expDesc.trim(), amount: Number(expValor), expense_date: expData });
    setExpDesc("");
    setExpValor("");
    refetch();
  };

  const removeExpense = async (id) => {
    await db.deleteExpense(id);
    refetch();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-xl font-semibold">Financeiro</h1>
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
          {[{ k: "hoje", l: "Hoje" }, { k: "7dias", l: "7 dias" }, { k: "todos", l: "Tudo" }].map((o) => (
            <button key={o.k} onClick={() => setRange(o.k)} className={`text-xs font-medium px-3 py-1.5 rounded-lg ${range === o.k ? "bg-zinc-600 text-white" : "text-[var(--text-secondary)]"}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {vencidas.length > 0 && (
        <div className="bg-rose-950 border border-rose-800 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            <p className="text-sm text-rose-300 font-medium">
              {vencidas.length} cobrança(s) "a faturar" vencida(s) — {money(totalVencido)} em atraso há mais de {overdueDaysThreshold} dia(s)
            </p>
          </div>
          <div className="flex flex-col gap-1.5 mb-2">
            {vencidas.slice(0, 5).map((o) => {
              const customer = data.customers.find((c) => c.id === o.customer_id);
              return (
                <div key={o.id} className="flex items-center justify-between text-xs text-rose-200">
                  <span>{customer?.name || "—"} — há {diasDesde(o.created_at)} dia(s)</span>
                  <span className="font-num font-semibold">{money(o.total)}</span>
                </div>
              );
            })}
            {vencidas.length > 5 && <p className="text-xs text-rose-400">+ {vencidas.length - 5} outra(s)</p>}
          </div>
          <div className="flex items-center gap-2 text-xs text-rose-300">
            <span>Avisar como vencida a partir de</span>
            <input
              defaultValue={overdueDaysThreshold}
              onBlur={(e) => salvarLimiteVencido(e.target.value)}
              type="number"
              min="1"
              className="w-14 px-2 py-1 rounded-lg border border-rose-800 bg-rose-950 text-rose-200 text-center"
            />
            <span>dia(s) sem pagar</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Faturado</p>
          <p className="font-num text-lg font-semibold text-[var(--text)]">{money(totalPago)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">A receber</p>
          <p className="font-num text-lg font-semibold text-amber-500">{money(totalPendente)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Despesas</p>
          <p className="font-num text-lg font-semibold text-rose-400">{money(totalDespesas)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Lucro líquido</p>
          <p className={`font-num text-lg font-semibold ${lucroLiquido >= 0 ? "text-[var(--text)]" : "text-rose-400"}`}>{money(lucroLiquido)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Lavagens</p>
          <p className="font-num text-lg font-semibold">{filteredOrders.length}</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Recebimentos</p>
      {filteredOrders.length === 0 && <div className="text-center py-10 text-[var(--text-secondary)] text-sm">Nenhuma lavagem concluída neste período</div>}
      <div className="flex flex-col gap-2 mb-6">
        {filteredOrders.map((order) => (
          <div key={order.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <OrderCustomerLine data={data} order={order} />
              <OrderServicesLine data={data} order={order} />
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{dateTimeStr(order.created_at)}</p>
            </div>
            <span className="font-num text-sm font-semibold">{money(order.total)}</span>
            <button onClick={() => setModal({ type: "comprovante", order })} title="Ver/imprimir comprovante" className="text-[var(--text-muted)] hover:text-[var(--text)] p-1.5 -m-1.5">
              <FileText size={17} />
            </button>
            <select
              value={order.payment_method || ""}
              onChange={(e) => alterarFormaPagamento(order, e.target.value)}
              className={`text-xs font-medium px-2 py-1.5 rounded-lg border-0 ${order.paid ? "bg-zinc-700 text-zinc-100" : "bg-amber-950 text-amber-300"}`}
            >
              <option value="" disabled>{order.paid ? "Pago" : "Pendente"}</option>
              {db.PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Despesas</p>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Descrição (ex: produtos de limpeza)" className="flex-1 px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          <input value={expValor} onChange={(e) => setExpValor(e.target.value)} type="number" placeholder="Valor" className="w-full sm:w-28 px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm font-num focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          <input value={expData} onChange={(e) => setExpData(e.target.value)} type="date" className="w-full sm:w-40 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          <button onClick={addExpense} className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
            <Plus size={15} /> Adicionar
          </button>
        </div>
      </div>

      {filteredExpenses.length === 0 && <div className="text-center py-10 text-[var(--text-secondary)] text-sm">Nenhuma despesa neste período</div>}
      <div className="flex flex-col gap-2">
        {filteredExpenses.map((exp) => (
          <div key={exp.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
            <TrendingDown size={16} className="text-rose-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{exp.description}</p>
              <p className="text-xs text-[var(--text-secondary)]">{new Date(exp.expense_date + "T00:00:00").toLocaleDateString("pt-BR")}</p>
            </div>
            <span className="font-num text-sm font-semibold text-rose-400">{money(exp.amount)}</span>
            <button onClick={() => removeExpense(exp.id)} className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatoriosView({ data, initialDate, onConsumedInitialDate, setModal }) {
  const [start, setStart] = useState(() => {
    if (initialDate) return initialDate;
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => initialDate || todayStr());
  const [servicoSelecionado, setServicoSelecionado] = useState(null);

  useEffect(() => {
    if (initialDate && onConsumedInitialDate) onConsumedInitialDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordersInRange = data.orders.filter((o) => {
    if (o.status !== "entregue") return false;
    const d = dateStrOf(o.created_at);
    return d >= start && d <= end;
  });
  const expensesInRange = (data.expenses || []).filter((e) => e.expense_date >= start && e.expense_date <= end);

  const totalFaturado = ordersInRange.reduce((s, o) => s + o.total, 0);
  const totalPago = ordersInRange.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
  const totalDespesas = expensesInRange.reduce((s, e) => s + Number(e.amount), 0);
  const lucroLiquido = totalPago - totalDespesas;
  const ticketMedio = ordersInRange.length ? totalFaturado / ordersInRange.length : 0;

  const labelFormaPagamento = (method) => db.PAYMENT_METHODS.find((m) => m.value === method)?.label || "Não informado";

  const porFormaPagamento = {};
  ordersInRange.forEach((o) => {
    const label = labelFormaPagamento(o.payment_method);
    porFormaPagamento[label] = (porFormaPagamento[label] || 0) + o.total;
  });

  const porServico = {};
  const registrarOcorrencia = (nome, valor, order) => {
    const customer = data.customers.find((c) => c.id === order.customer_id);
    const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);
    if (!porServico[nome]) porServico[nome] = { qtd: 0, total: 0, ocorrencias: [] };
    porServico[nome].qtd += 1;
    porServico[nome].total += valor;
    porServico[nome].ocorrencias.push({
      data: order.created_at,
      cliente: customer?.name || "—",
      placa: vehicle?.plate || "—",
      valor,
      pago: order.paid,
    });
  };
  ordersInRange.forEach((o) => {
    (o.service_ids || []).forEach((id) => {
      const s = data.services.find((sv) => sv.id === id);
      if (!s) return;
      registrarOcorrencia(s.name, s.price, o);
    });
    (o.extra_services || []).forEach((e) => {
      registrarOcorrencia(e.name, e.price, o);
    });
  });
  const rankingServicos = Object.entries(porServico).sort((a, b) => b[1].qtd - a[1].qtd);

  const baixarCsv = () => {
    const linhas = [["Data e hora", "Cliente", "Placa", "Serviços", "Total", "Status pagamento", "Forma de pagamento"]];
    ordersInRange
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .forEach((o) => {
        const customer = data.customers.find((c) => c.id === o.customer_id);
        const vehicle = customer?.vehicles.find((v) => v.id === o.vehicle_id);
        const nomesServicos = [
          ...(o.service_ids || []).map((id) => data.services.find((s) => s.id === id)?.name).filter(Boolean),
          ...(o.extra_services || []).map((e) => e.name),
        ].join(" + ");
        linhas.push([
          dateTimeStr(o.created_at),
          customer?.name || "",
          vehicle?.plate || "",
          nomesServicos,
          o.total,
          o.paid ? "Pago" : "Pendente",
          labelFormaPagamento(o.payment_method),
        ]);
      });
    linhas.push([]);
    linhas.push(["Despesas"]);
    linhas.push(["Data", "Descrição", "Valor"]);
    expensesInRange.forEach((e) => {
      linhas.push([new Date(e.expense_date + "T00:00:00").toLocaleDateString("pt-BR"), e.description, e.amount]);
    });

    const csv = linhas.map((linha) => linha.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${start}_a_${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="font-display text-xl font-semibold">Relatórios</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm" />
          <span className="text-[var(--text-secondary)] text-sm">até</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm" />
          <button onClick={baixarCsv} className="flex items-center gap-1.5 bg-zinc-600 hover:bg-[var(--surface)] text-white text-sm font-medium px-4 py-2.5 rounded-xl">
            <Download size={15} /> Baixar CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Faturado</p>
          <p className="font-num text-lg font-semibold text-[var(--text)]">{money(totalFaturado)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Despesas</p>
          <p className="font-num text-lg font-semibold text-rose-400">{money(totalDespesas)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Lucro líquido</p>
          <p className={`font-num text-lg font-semibold ${lucroLiquido >= 0 ? "text-[var(--text)]" : "text-rose-400"}`}>{money(lucroLiquido)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Lavagens</p>
          <p className="font-num text-lg font-semibold">{ordersInRange.length}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Ticket médio</p>
          <p className="font-num text-lg font-semibold">{money(ticketMedio)}</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Faturamento por forma de pagamento</p>
      {Object.keys(porFormaPagamento).length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] mb-6">Nenhuma venda nesse período</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {db.PAYMENT_METHODS.map((m) => (
            <div key={m.value} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-secondary)] mb-1">{m.label}</p>
              <p className="font-num text-base font-semibold text-[var(--text)]">{money(porFormaPagamento[m.label] || 0)}</p>
            </div>
          ))}
          {porFormaPagamento["Não informado"] > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-secondary)] mb-1">Não informado</p>
              <p className="font-num text-base font-semibold text-[var(--text)]">{money(porFormaPagamento["Não informado"])}</p>
            </div>
          )}
        </div>
      )}

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Vendas do período</p>
      {ordersInRange.length === 0 && <p className="text-sm text-[var(--text-secondary)] mb-6">Nenhuma venda nesse período</p>}
      <div className="flex flex-col gap-2 mb-6">
        {[...ordersInRange]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map((o) => {
            const customer = data.customers.find((c) => c.id === o.customer_id);
            const vehicle = customer?.vehicles.find((v) => v.id === o.vehicle_id);
            return (
              <div key={o.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{customer?.name || "—"} · {vehicle?.plate || "—"}</p>
                  <OrderServicesLine data={data} order={o} />
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{dateTimeStr(o.created_at)} · {labelFormaPagamento(o.payment_method)}</p>
                </div>
                <span className="font-num text-sm font-semibold text-[var(--text)] shrink-0">{money(o.total)}</span>
                <button onClick={() => setModal({ type: "comprovante", order: o })} title="Ver/imprimir comprovante" className="text-[var(--text-muted)] hover:text-[var(--text)] p-1.5 -m-1.5 shrink-0">
                  <FileText size={16} />
                </button>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg shrink-0 ${o.paid ? "bg-zinc-700 text-zinc-100" : "bg-amber-950 text-amber-300"}`}>
                  {o.paid ? "Pago" : "Pendente"}
                </span>
              </div>
            );
          })}
      </div>

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Serviços mais pedidos no período</p>
      {rankingServicos.length === 0 && <p className="text-sm text-[var(--text-secondary)] mb-6">Nenhum serviço registrado nesse período</p>}
      <div className="flex flex-col gap-2">
        {rankingServicos.map(([nome, info]) => (
          <button
            key={nome}
            onClick={() => setServicoSelecionado(nome)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3 text-left hover:border-zinc-500 hover:bg-zinc-700/40 transition"
          >
            <span className="flex-1 text-sm font-medium">{nome}</span>
            <span className="font-num text-sm text-[var(--text-secondary)]">{info.qtd}x</span>
            <span className="font-num text-sm font-semibold text-[var(--text)]">{money(info.total)}</span>
            <ChevronRight size={16} className="text-[var(--text-muted)]" />
          </button>
        ))}
      </div>

      {servicoSelecionado && (
        <ServicoDetalheModal
          nome={servicoSelecionado}
          info={porServico[servicoSelecionado]}
          onClose={() => setServicoSelecionado(null)}
        />
      )}
    </div>
  );
}

function ServicoDetalheModal({ nome, info, onClose }) {
  const ocorrencias = [...(info?.ocorrencias || [])].sort((a, b) => new Date(b.data) - new Date(a.data));
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-[var(--surface)] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)]">
          <h2 className="font-display font-semibold text-base">{nome}</h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)]">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-secondary)] mb-1">Vezes pedido</p>
              <p className="font-num text-lg font-semibold">{info?.qtd || 0}x</p>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-secondary)] mb-1">Total gerado</p>
              <p className="font-num text-lg font-semibold text-[var(--text)]">{money(info?.total || 0)}</p>
            </div>
          </div>

          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Lavagens com esse serviço</p>
          <div className="flex flex-col gap-2">
            {ocorrencias.map((o, i) => (
              <div key={i} className="border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{o.cliente} · {o.placa}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{dateTimeStr(o.data)}</p>
                </div>
                <span className="font-num text-sm font-semibold">{money(o.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EstoqueView({ data, companyId, refetch, setModal }) {
  const produtos = [...(data.products || [])].sort((a, b) => a.name.localeCompare(b.name));
  const baixoEstoque = produtos.filter((p) => Number(p.quantity) <= Number(p.min_quantity));

  const remove = async (p) => {
    const ok = window.confirm(`Remover "${p.name}" do estoque?`);
    if (!ok) return;
    await db.deleteProduct(p.id);
    refetch();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl font-semibold">Estoque</h1>
          <p className="text-sm text-[var(--text-secondary)]">{produtos.length} produto(s) cadastrado(s)</p>
        </div>
        <button onClick={() => setModal({ type: "novoProduto" })} className="flex items-center gap-1.5 bg-zinc-600 hover:bg-zinc-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm">
          <Plus size={16} /> Novo produto
        </button>
      </div>

      {baixoEstoque.length > 0 && (
        <div className="bg-amber-950 border border-amber-800 rounded-xl p-3 flex items-center gap-2 mb-5">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">
            {baixoEstoque.length} produto(s) com estoque baixo: {baixoEstoque.map((p) => p.name).join(", ")}
          </p>
        </div>
      )}

      {produtos.length === 0 && <div className="text-center py-16 text-[var(--text-muted)] text-sm">Nenhum produto cadastrado ainda</div>}

      <div className="flex flex-col gap-2">
        {produtos.map((p) => {
          const baixo = Number(p.quantity) <= Number(p.min_quantity);
          return (
            <div key={p.id} className={`bg-[var(--surface)] border rounded-xl p-3 flex items-center gap-3 ${baixo ? "border-amber-800" : "border-[var(--border)]"}`}>
              <Package size={18} className={`shrink-0 ${baixo ? "text-amber-400" : "text-[var(--text-muted)]"}`} />
              <button onClick={() => setModal({ type: "historicoEstoque", produto: p })} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate hover:underline">{p.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Mínimo: {p.min_quantity} {p.unit}
                </p>
              </button>
              <span className={`font-num text-sm font-semibold shrink-0 ${baixo ? "text-amber-400" : "text-[var(--text)]"}`}>
                {p.quantity} {p.unit}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setModal({ type: "movimentoEstoque", produto: p, tipo: "entrada" })}
                  title="Registrar entrada"
                  className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
                >
                  <ArrowUpCircle size={16} />
                </button>
                <button
                  onClick={() => setModal({ type: "movimentoEstoque", produto: p, tipo: "saida" })}
                  title="Registrar saída"
                  className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
                >
                  <ArrowDownCircle size={16} />
                </button>
                <button onClick={() => remove(p)} title="Remover produto" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NovoProdutoModal({ companyId, refetch, close }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("un");
  const [quantity, setQuantity] = useState("");
  const [minQuantity, setMinQuantity] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    await db.createProduct(companyId, {
      name: name.trim(),
      unit: unit.trim() || "un",
      quantity: Number(quantity) || 0,
      min_quantity: Number(minQuantity) || 0,
    });
    refetch();
    close();
  };

  return (
    <ModalShell title="Novo produto" onClose={close}>
      <div className="flex flex-col gap-3">
        <Field label="Nome do produto"><input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ex: Shampoo automotivo" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Unidade"><input value={unit} onChange={(e) => setUnit(e.target.value)} className="input" placeholder="un, L, kg..." /></Field>
          <Field label="Quantidade inicial"><input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" className="input" /></Field>
        </div>
        <Field label="Estoque mínimo (avisa quando chegar aqui)"><input value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} type="number" className="input" /></Field>
        <button onClick={save} className="mt-2 bg-zinc-600 hover:bg-zinc-500 text-white font-medium text-sm py-3 rounded-xl">Salvar produto</button>
      </div>
    </ModalShell>
  );
}

function MovimentoEstoqueModal({ companyId, refetch, close, produto, tipo }) {
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const isEntrada = tipo === "entrada";

  const save = async () => {
    const qtd = Number(quantity);
    if (!qtd || qtd <= 0) return;
    await db.registerMovement(produto.id, tipo, qtd, note.trim());
    refetch();
    close();
  };

  return (
    <ModalShell title={isEntrada ? `Entrada — ${produto.name}` : `Saída — ${produto.name}`} onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--text-secondary)]">
          Estoque atual: <span className="font-semibold text-[var(--text)]">{produto.quantity} {produto.unit}</span>
        </p>
        <Field label={`Quantidade (${produto.unit})`}>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" className="input" autoFocus />
        </Field>
        <Field label="Observação (opcional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder={isEntrada ? "Ex: compra no fornecedor X" : "Ex: usado na lavagem do dia"} />
        </Field>
        <button
          onClick={save}
          className={`mt-2 text-white font-medium text-sm py-3 rounded-xl ${isEntrada ? "bg-emerald-700 hover:bg-emerald-600" : "bg-rose-700 hover:bg-rose-600"}`}
        >
          {isEntrada ? "Registrar entrada" : "Registrar saída"}
        </button>
      </div>
    </ModalShell>
  );
}

function HistoricoEstoqueModal({ produto, close }) {
  const [movs, setMovs] = useState(null);

  useEffect(() => {
    db.fetchMovements(produto.id).then(setMovs);
  }, [produto.id]);

  return (
    <ModalShell title={`Histórico — ${produto.name}`} onClose={close}>
      {movs === null && <p className="text-sm text-[var(--text-muted)]">Carregando...</p>}
      {movs?.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nenhuma movimentação registrada ainda.</p>}
      <div className="flex flex-col gap-2">
        {movs?.map((m) => (
          <div key={m.id} className="border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
            {m.type === "entrada" ? (
              <ArrowUpCircle size={16} className="text-emerald-400 shrink-0" />
            ) : (
              <ArrowDownCircle size={16} className="text-rose-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{m.type === "entrada" ? "Entrada" : "Saída"} de {m.quantity} {produto.unit}</p>
              {m.note && <p className="text-xs text-[var(--text-muted)] truncate">{m.note}</p>}
            </div>
            <span className="text-xs text-[var(--text-muted)] shrink-0">{dateTimeStr(m.created_at)}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

function VincularProdutosModal({ data, companyId, refetch, close, servico }) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const vinculos = data.serviceProducts.filter((sp) => sp.service_id === servico.id);

  const add = async () => {
    if (!productId || !quantity) return;
    await db.addServiceProduct(companyId, servico.id, productId, Number(quantity));
    setProductId("");
    setQuantity("1");
    refetch();
  };

  const remove = async (id) => {
    await db.removeServiceProduct(id);
    refetch();
  };

  return (
    <ModalShell title={`Produtos usados — ${servico.name}`} onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[var(--text-secondary)]">
          Toda vez que esse serviço for usado num carro da fila, os produtos abaixo são descontados do estoque automaticamente.
        </p>

        {data.products.length === 0 && (
          <p className="text-sm text-amber-300 bg-amber-950 border border-amber-800 rounded-lg p-3">
            Você ainda não tem produtos cadastrados no Estoque. Cadastre lá primeiro pra poder vincular aqui.
          </p>
        )}

        {data.products.length > 0 && (
          <div className="flex gap-2">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="input flex-1">
              <option value="">Selecione um produto</option>
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
              ))}
            </select>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" step="any" className="input w-20" />
            <button onClick={add} className="shrink-0 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg px-3">
              <Plus size={16} />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-1">
          {vinculos.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nenhum produto vinculado ainda.</p>}
          {vinculos.map((v) => {
            const p = data.products.find((pr) => pr.id === v.product_id);
            return (
              <div key={v.id} className="border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
                <Package size={15} className="text-[var(--text-secondary)] shrink-0" />
                <span className="flex-1 text-sm">{p ? p.name : "Produto removido"}</span>
                <span className="font-num text-sm text-[var(--text-secondary)]">{v.quantity} {p?.unit || ""}</span>
                <button onClick={() => remove(v.id)} className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
                  <X size={17} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}

function ComissoesView({ data }) {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(todayStr());

  const ordersInRange = data.orders.filter((o) => {
    if (o.status !== "entregue") return false;
    const d = dateStrOf(o.created_at);
    return d >= start && d <= end;
  });

  const semAtendente = ordersInRange.filter((o) => !o.attendant_id).length;

  const porAtendente = {};
  ordersInRange.forEach((o) => {
    if (!o.attendant_id) return;
    porAtendente[o.attendant_id] = porAtendente[o.attendant_id] || { qtd: 0, total: 0 };
    porAtendente[o.attendant_id].qtd += 1;
    porAtendente[o.attendant_id].total += o.total;
  });

  const linhas = data.team
    .map((membro) => {
      const info = porAtendente[membro.id] || { qtd: 0, total: 0 };
      const taxa = Number(membro.commission_rate) || 0;
      const comissao = (info.total * taxa) / 100;
      return { membro, ...info, taxa, comissao };
    })
    .filter((l) => l.qtd > 0 || l.taxa > 0)
    .sort((a, b) => b.comissao - a.comissao);

  const totalComissoes = linhas.reduce((s, l) => s + l.comissao, 0);

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="font-display text-xl font-semibold">Comissões</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm" />
          <span className="text-[var(--text-secondary)] text-sm">até</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm" />
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-5">
        <p className="text-xs text-[var(--text-muted)] mb-1">Total a pagar de comissão no período</p>
        <p className="font-num text-2xl font-semibold text-[var(--text)]">{money(totalComissoes)}</p>
      </div>

      {semAtendente > 0 && (
        <div className="bg-amber-950 border border-amber-800 rounded-xl p-3 flex items-center gap-2 mb-5">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">
            {semAtendente} lavagem(ns) nesse período sem atendente definido — não entraram no cálculo de ninguém.
          </p>
        </div>
      )}

      {linhas.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] text-center py-10">
          Nenhum funcionário com comissão configurada ou lavagens no período. Defina a % de cada um na aba Equipe.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {linhas.map((l) => (
          <div key={l.membro.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-700 text-zinc-100 flex items-center justify-center text-xs font-semibold shrink-0">
              {(l.membro.full_name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{l.membro.full_name || "Sem nome"}</p>
              <p className="text-xs text-[var(--text-muted)]">{l.qtd} lavagem(ns) · {money(l.total)} faturado · {l.taxa}% de comissão</p>
            </div>
            <span className="font-num text-base font-semibold text-[var(--text)] shrink-0">{money(l.comissao)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditarPedidoModal({ data, refetch, close, order }) {
  const [serviceIds, setServiceIds] = useState(order.service_ids || []);
  const [extraServices, setExtraServices] = useState(order.extra_services || []);
  const [extraName, setExtraName] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const [extraProducts, setExtraProducts] = useState(order.extra_products || []);
  const [pickedProductId, setPickedProductId] = useState("");
  const [pickedQuantity, setPickedQuantity] = useState("1");
  const [attendantId, setAttendantId] = useState(order.attendant_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const customer = data.customers.find((c) => c.id === order.customer_id);
  const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);

  const total =
    serviceIds.reduce((s, id) => s + (data.services.find((sv) => sv.id === id)?.price || 0), 0) +
    extraServices.reduce((s, e) => s + e.price, 0);

  const toggleService = (id) => setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addExtraService = () => {
    if (!extraName.trim() || !extraPrice) return;
    setExtraServices((prev) => [...prev, { id: genLocalId(), name: extraName.trim(), price: Number(extraPrice) || 0 }]);
    setExtraName("");
    setExtraPrice("");
  };
  const removeExtraService = (id) => setExtraServices((prev) => prev.filter((e) => e.id !== id));

  const addExtraProduct = () => {
    if (!pickedProductId || !pickedQuantity) return;
    const produto = data.products.find((p) => p.id === pickedProductId);
    if (!produto) return;
    setExtraProducts((prev) => [
      ...prev,
      { id: genLocalId(), product_id: produto.id, name: produto.name, unit: produto.unit, quantity: Number(pickedQuantity) || 0 },
    ]);
    setPickedProductId("");
    setPickedQuantity("1");
  };
  const removeExtraProduct = (id) => setExtraProducts((prev) => prev.filter((e) => e.id !== id));

  const save = async () => {
    if (saving) return;
    if (serviceIds.length === 0 && extraServices.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await db.updateOrderServices(
        order,
        {
          service_ids: serviceIds,
          extra_services: extraServices.map(({ name, price }) => ({ name, price })),
          extra_products: extraProducts.map(({ product_id, name, unit, quantity }) => ({ product_id, name, unit, quantity })),
          total,
          attendant_id: attendantId || null,
        },
        data.serviceProducts
      );
      refetch();
      close();
    } catch (e) {
      reportError(e, { where: "salvar pedido/cadastro" });
      setError("Não foi possível salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Editar pedido — ${vehicle?.plate || "veículo"}`} onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--text-secondary)]">{customer?.name} · {vehicle?.model}</p>

        <Field label="Atendente responsável">
          <select value={attendantId} onChange={(e) => setAttendantId(e.target.value)} className="input">
            <option value="">Não definido</option>
            {data.team.filter((t) => !t.blocked).map((t) => (
              <option key={t.id} value={t.id}>{t.full_name || "Sem nome"}</option>
            ))}
          </select>
        </Field>

        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-2">Serviços</p>
        <div className="flex flex-col gap-1.5">
          {data.services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
              <span className="flex-1 text-sm">{s.name}</span>
              <span className="font-num text-sm text-[var(--text-secondary)]">{money(s.price)}</span>
            </label>
          ))}
        </div>

        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-2">Serviço avulso</p>
        <div className="flex flex-col gap-2">
          <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="Descrição do serviço" className="input" />
          <div className="flex gap-2">
            <input value={extraPrice} onChange={(e) => setExtraPrice(e.target.value)} type="number" placeholder="Valor (R$)" className="input flex-1" />
            <button onClick={addExtraService} type="button" className="shrink-0 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg px-4">
              <Plus size={16} />
            </button>
          </div>
        </div>
        {extraServices.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {extraServices.map((e) => (
              <div key={e.id} className="flex items-center gap-2 border border-amber-800 bg-amber-950 rounded-lg px-3 py-2.5">
                <span className="flex-1 text-sm font-semibold text-amber-200">{e.name}</span>
                <span className="font-num text-sm font-semibold text-amber-400">{money(e.price)}</span>
                <button onClick={() => removeExtraService(e.id)} className="text-amber-500 hover:text-rose-400">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-2">Produtos do estoque usados</p>
        {data.products.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Nenhum produto cadastrado no Estoque ainda.</p>
        ) : (
          <div className="flex gap-2">
            <select value={pickedProductId} onChange={(e) => setPickedProductId(e.target.value)} className="input flex-1">
              <option value="">Selecione um produto</option>
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.unit}) — {p.quantity} em estoque</option>
              ))}
            </select>
            <input value={pickedQuantity} onChange={(e) => setPickedQuantity(e.target.value)} type="number" step="any" className="input w-20" />
            <button onClick={addExtraProduct} type="button" className="shrink-0 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg px-3">
              <Plus size={16} />
            </button>
          </div>
        )}
        {extraProducts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {extraProducts.map((e) => (
              <div key={e.id} className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2">
                <Package size={14} className="text-[var(--text-secondary)] shrink-0" />
                <span className="flex-1 text-sm">{e.name}</span>
                <span className="font-num text-sm text-[var(--text-secondary)]">{e.quantity} {e.unit}</span>
                <button onClick={() => removeExtraProduct(e.id)} className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
          <span className="text-sm text-[var(--text-secondary)]">Total</span>
          <span className="font-num text-lg font-semibold text-[var(--text)]">{money(total)}</span>
        </div>

        {order.status !== "agendado" && (
          <p className="text-xs text-amber-400">O estoque já usado por esse pedido será ajustado automaticamente pra bater com os serviços e produtos novos.</p>
        )}

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button onClick={save} disabled={saving} className="mt-2 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl">
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </ModalShell>
  );
}

function AdminView() {
  const [companies, setCompanies] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [novoLink, setNovoLink] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([db.fetchAllCompanies(), db.fetchAllOwnerInvites()]);
    setCompanies(c);
    setInvites(i);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const criar = async () => {
    if (saving) return;
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { token } = await db.adminCreateCompanyWithOwnerInvite(name.trim(), email.trim());
      setNovoLink(`${window.location.origin}${window.location.pathname}?convite=${token}`);
      setName("");
      setEmail("");
      load();
    } catch (e) {
      setError("Não foi possível criar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const copiarLink = (token, id) => {
    const link = `${window.location.origin}${window.location.pathname}?convite=${token}`;
    navigator.clipboard?.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <div className="p-6 text-[var(--text-secondary)] text-sm">Carregando...</div>;

  const pendentes = invites.filter((i) => !i.used_by);
  const usados = invites.filter((i) => i.used_by);

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Crown size={20} className="text-amber-400" />
        <h1 className="font-display text-xl font-semibold">Administração da plataforma</h1>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-5">{companies.length} empresa(s) cadastrada(s) no LavaJá</p>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-5">
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Criar nova empresa</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da empresa (ex: Lava-rápido do João)" className="flex-1 input" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail do dono (opcional)" className="sm:w-64 input" />
          <button onClick={criar} disabled={saving} className="flex items-center justify-center gap-1.5 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg shrink-0">
            <Plus size={15} /> {saving ? "Criando..." : "Criar e gerar convite"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
        {novoLink && (
          <div className="mt-3 border border-emerald-800 bg-emerald-950 rounded-lg p-3 flex items-center gap-2 flex-wrap">
            <p className="text-xs text-emerald-300 flex-1 break-all">{novoLink}</p>
            <button
              onClick={() => { navigator.clipboard?.writeText(novoLink); }}
              className="flex items-center gap-1 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg shrink-0"
            >
              <Copy size={12} /> Copiar link
            </button>
          </div>
        )}
        <p className="text-xs text-[var(--text-muted)] mt-2">Copie o link e envie pro dono da lavagem. Ele entra, cria a senha e já cai direto na empresa dele.</p>
      </div>

      {pendentes.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Convites de dono pendentes</p>
          <div className="flex flex-col gap-2">
            {pendentes.map((inv) => {
              const empresa = companies.find((c) => c.id === inv.company_id);
              return (
                <div key={inv.id} className="border border-amber-800 bg-amber-950 rounded-xl p-3 flex items-center gap-3">
                  <Mail size={16} className="text-amber-400 shrink-0" />
                  <span className="flex-1 text-sm text-amber-200">{empresa?.name || "Empresa"} {inv.email ? `· ${inv.email}` : ""}</span>
                  <button onClick={() => copiarLink(inv.token, inv.id)} className="flex items-center gap-1 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg">
                    <Copy size={12} /> {copiedId === inv.id ? "Copiado!" : "Copiar link"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Empresas cadastradas</p>
      {companies.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nenhuma empresa criada ainda.</p>}
      <div className="flex flex-col gap-2">
        {companies.map((c) => {
          const conviteUsado = usados.find((i) => i.company_id === c.id);
          const convitePendente = pendentes.find((i) => i.company_id === c.id);
          return (
            <div key={c.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-[var(--text-muted)]">Criada em {new Date(c.created_at).toLocaleDateString("pt-BR")}</p>
              </div>
              {conviteUsado ? (
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-700 text-zinc-100">Dono já ativo</span>
              ) : convitePendente ? (
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-950 text-amber-300">Aguardando dono</span>
              ) : (
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-700 text-zinc-300">Sem convite</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComprovanteModal({ data, close, order, companyName }) {
  const customer = data.customers.find((c) => c.id === order.customer_id);
  const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);

  const servicos = [
    ...(order.service_ids || [])
      .map((id) => data.services.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({ name: s.name, price: s.price })),
    ...(order.extra_services || []).map((e) => ({ name: e.name, price: e.price })),
  ];

  const metodoLabel = db.PAYMENT_METHODS.find((m) => m.value === order.payment_method)?.label || "Não informado";

  return (
    <ModalShell title="Comprovante" onClose={close}>
      <div id="comprovante-print" className="bg-white text-black rounded-xl p-5" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="text-center mb-3">
          <img src="/logo.png" alt="" className="w-14 h-14 mx-auto mb-1 rounded-lg" />
          <p className="font-bold text-base">{companyName}</p>
          <p className="text-xs text-gray-500">Comprovante de serviço</p>
        </div>

        <div className="text-xs border-t border-b border-gray-200 py-2 my-2 flex flex-col gap-1">
          <div className="flex justify-between"><span className="text-gray-500">Data</span><span className="font-medium">{dateTimeStr(order.created_at)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-medium">{customer?.name || "—"}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Veículo</span><span className="font-medium">{vehicle?.plate || "—"} · {vehicle?.model || ""}</span></div>
        </div>

        <div className="text-xs flex flex-col gap-1.5 my-3">
          {servicos.length === 0 && <p className="text-gray-400">Nenhum serviço registrado</p>}
          {servicos.map((s, i) => (
            <div key={i} className="flex justify-between">
              <span>{s.name}</span>
              <span className="font-medium">{money(s.price)}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between font-bold text-sm border-t border-gray-200 pt-2 mt-2">
          <span>Total</span>
          <span>{money(order.total)}</span>
        </div>
        <div className="text-xs text-gray-500 flex justify-between mt-1">
          <span>Forma de pagamento</span>
          <span>{metodoLabel}</span>
        </div>
        <div className="text-xs text-gray-500 flex justify-between mt-0.5">
          <span>Status</span>
          <span>{order.paid ? "Pago" : "Pendente"}</span>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">Obrigado pela preferência! 🚗✨</p>
      </div>

      <button onClick={() => window.print()} className="w-full mt-4 flex items-center justify-center gap-2 bg-zinc-600 hover:bg-zinc-500 text-white font-medium text-sm py-3 rounded-xl">
        <FileText size={16} /> Imprimir / Salvar PDF
      </button>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #comprovante-print, #comprovante-print * { visibility: visible; }
          #comprovante-print { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </ModalShell>
  );
}

function EquipeView({ companyId }) {
  const [team, setTeam] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    const [t, i] = await Promise.all([db.fetchTeam(companyId), db.fetchInvites(companyId)]);
    setTeam(t);
    setInvites(i);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (companyId) load();
  }, [companyId, load]);

  const baixarBackup = async () => {
    const backup = await db.exportCompanyBackup(companyId);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-lavaja-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const gerarConvite = async () => {
    await db.createInvite(companyId, email.trim());
    setEmail("");
    load();
  };

  const copiarLink = (invite) => {
    const link = `${window.location.origin}${window.location.pathname}?convite=${invite.token}`;
    navigator.clipboard?.writeText(link);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const alternarBloqueio = async (membro) => {
    await db.setMemberBlocked(membro.id, !membro.blocked);
    load();
  };

  const removerMembro = async (membro) => {
    const confirmado = window.confirm(`Remover ${membro.full_name || "esse funcionário"} da equipe? Ele perde o acesso imediatamente e precisaria de um novo convite pra voltar.`);
    if (!confirmado) return;
    await db.removeMember(membro.id);
    load();
  };

  const salvarComissao = async (membro, value) => {
    const rate = Math.max(0, Number(value) || 0);
    await db.setMemberCommission(membro.id, rate);
    load();
  };

  const pendentes = invites.filter((i) => !i.used_by);

  if (loading) return <div className="p-6 text-[var(--text-secondary)] text-sm">Carregando...</div>;

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold mb-1">Equipe</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-5">{team.length} pessoa(s) com acesso ao painel</p>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-5">
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Convidar funcionário</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail do funcionário (opcional)"
            className="flex-1 px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <button onClick={gerarConvite} className="flex items-center justify-center gap-1.5 bg-zinc-600 hover:bg-[var(--surface)] text-white text-sm font-medium px-4 py-2.5 rounded-lg">
            <UserPlus size={15} /> Gerar link de convite
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-2">Gere o link e envie por WhatsApp, e-mail ou onde preferir. Ele funciona uma única vez.</p>
      </div>

      {pendentes.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Convites pendentes</p>
          <div className="flex flex-col gap-2">
            {pendentes.map((inv) => (
              <div key={inv.id} className="border border-amber-800 bg-amber-950 rounded-xl p-3 flex items-center gap-3">
                <Mail size={16} className="text-amber-500 shrink-0" />
                <span className="flex-1 text-sm text-amber-200">{inv.email || "Convite sem e-mail definido"}</span>
                <button onClick={() => copiarLink(inv)} className="flex items-center gap-1 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg">
                  <Copy size={12} /> {copiedId === inv.id ? "Copiado!" : "Copiar link"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1">Membros da equipe</p>
      <div className="flex flex-col gap-2">
        {team.map((p) => (
          <div key={p.id} className={`bg-[var(--surface)] border rounded-xl p-3 flex items-center gap-3 ${p.blocked ? "border-rose-800 bg-rose-950/40" : "border-[var(--border)]"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${p.blocked ? "bg-rose-950 text-rose-400" : "bg-zinc-700 text-zinc-100"}`}>
              {(p.full_name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.full_name || "Sem nome"}</p>
              <span className="text-xs text-[var(--text-secondary)] capitalize">
                {p.role === "owner" ? "dono" : "funcionário"}
                {p.blocked && <span className="text-rose-400 font-medium"> · bloqueado</span>}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <label className="text-xs text-[var(--text-muted)]">Comissão</label>
              <input
                defaultValue={p.commission_rate}
                onBlur={(e) => salvarComissao(p, e.target.value)}
                type="number"
                min="0"
                max="100"
                className="w-16 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm text-right focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              <span className="text-xs text-[var(--text-muted)]">%</span>
            </div>
            {p.role !== "owner" && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => alternarBloqueio(p)}
                  title={p.blocked ? "Desbloquear acesso" : "Bloquear acesso"}
                  className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg ${p.blocked ? "bg-zinc-700 text-zinc-100 hover:bg-zinc-600" : "bg-amber-950 text-amber-300 hover:bg-amber-800"}`}
                >
                  {p.blocked ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}
                  {p.blocked ? "Desbloquear" : "Bloquear"}
                </button>
                <button
                  onClick={() => removerMembro(p)}
                  title="Remover da equipe"
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-rose-950 hover:text-rose-400"
                >
                  <UserX size={15} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2 px-1 mt-6">Dados da empresa</p>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-medium">Backup dos dados</p>
          <p className="text-xs text-[var(--text-secondary)]">Baixa clientes, veículos, pedidos, financeiro e estoque num arquivo só.</p>
        </div>
        <button onClick={baixarBackup} className="flex items-center gap-1.5 bg-zinc-600 hover:bg-zinc-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg shrink-0">
          <Download size={15} /> Baixar backup
        </button>
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-[var(--surface)] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)]">
          <h2 className="font-display font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)]">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalRouter({ modal, setModal, data, companyId, refetch, myUserId, companyName, setTab }) {
  const close = () => setModal(null);
  if (modal.type === "novoCliente") return <NovoClienteModal data={data} companyId={companyId} refetch={refetch} close={close} />;
  if (modal.type === "novoVeiculo") return <NovoVeiculoModal data={data} companyId={companyId} refetch={refetch} close={close} customerId={modal.customerId} />;
  if (modal.type === "novoCarro") return <NovoPedidoModal data={data} companyId={companyId} refetch={refetch} close={close} mode="queue" myUserId={myUserId} />;
  if (modal.type === "novoAgendamento") return <NovoPedidoModal data={data} companyId={companyId} refetch={refetch} close={close} mode="schedule" myUserId={myUserId} />;
  if (modal.type === "novoProduto") return <NovoProdutoModal companyId={companyId} refetch={refetch} close={close} />;
  if (modal.type === "movimentoEstoque") return <MovimentoEstoqueModal companyId={companyId} refetch={refetch} close={close} produto={modal.produto} tipo={modal.tipo} />;
  if (modal.type === "historicoEstoque") return <HistoricoEstoqueModal produto={modal.produto} close={close} />;
  if (modal.type === "vincularProdutos") return <VincularProdutosModal data={data} companyId={companyId} refetch={refetch} close={close} servico={modal.servico} />;
  if (modal.type === "editarPedido") return <EditarPedidoModal data={data} refetch={refetch} close={close} order={modal.order} />;
  if (modal.type === "historicoCliente") return <HistoricoClienteModal data={data} customer={modal.customer} close={close} setModal={setModal} />;
  if (modal.type === "confirmarEntrega") return <ConfirmarEntregaModal data={data} refetch={refetch} close={close} order={modal.order} setModal={setModal} companyName={companyName} />;
  if (modal.type === "buscaGlobal") return <BuscaGlobalModal data={data} close={close} setModal={setModal} setTab={setTab} />;
  if (modal.type === "seguranca") return <SegurancaModal close={close} />;
  if (modal.type === "editarCliente") return <EditarClienteModal refetch={refetch} close={close} customer={modal.customer} />;
  if (modal.type === "editarVeiculo") return <EditarVeiculoModal refetch={refetch} close={close} vehicle={modal.vehicle} />;
  if (modal.type === "comprovante") return <ComprovanteModal data={data} close={close} order={modal.order} companyName={companyName} />;
  return null;
}

function EditarClienteModal({ refetch, close, customer }) {
  const [name, setName] = useState(customer.name || "");
  const [phone, setPhone] = useState(formatPhone(customer.phone || ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!name.trim()) return;
    if (!isValidPhone(phone)) {
      setError("Telefone inválido. Digite com DDD, só números (ex: 51999998888).");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await db.updateCustomer(customer.id, { name: name.trim(), phone: onlyDigits(phone) });
      refetch();
      close();
    } catch (e) {
      reportError(e, { where: "salvar pedido/cadastro" });
      setError("Não foi possível salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Editar cliente" onClose={close}>
      <div className="flex flex-col gap-3">
        <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
        <Field label="Telefone"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(51) 99999-8888" className="input" /></Field>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button onClick={save} disabled={saving} className="mt-2 bg-zinc-600 hover:bg-[var(--surface)] disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl">
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </ModalShell>
  );
}

function EditarVeiculoModal({ refetch, close, vehicle }) {
  const [plate, setPlate] = useState(vehicle.plate || "");
  const [model, setModel] = useState(vehicle.model || "");
  const [color, setColor] = useState(vehicle.color || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!plate.trim()) return;
    if (!isValidPlate(plate)) {
      setError("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await db.updateVehicle(vehicle.id, { plate: normalizePlate(plate), model: model.trim(), color: color.trim() });
      refetch();
      close();
    } catch (e) {
      reportError(e, { where: "salvar pedido/cadastro" });
      setError("Não foi possível salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = window.confirm("Remover esse veículo do cliente?");
    if (!ok) return;
    await db.deleteVehicle(vehicle.id);
    refetch();
    close();
  };

  return (
    <ModalShell title="Editar veículo" onClose={close}>
      <div className="flex flex-col gap-3">
        <Field label="Placa"><input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC1234" className="input" /></Field>
        <Field label="Modelo"><input value={model} onChange={(e) => setModel(e.target.value)} className="input" /></Field>
        <Field label="Cor"><input value={color} onChange={(e) => setColor(e.target.value)} className="input" /></Field>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button onClick={save} disabled={saving} className="mt-2 bg-zinc-600 hover:bg-[var(--surface)] disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl">
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
        <button onClick={remove} className="text-xs text-rose-400 hover:text-rose-300 text-center">Remover veículo</button>
      </div>
    </ModalShell>
  );
}

function NovoClienteModal({ data, companyId, refetch, close }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!name.trim()) return;
    if (!isValidPhone(phone)) {
      setError("Telefone inválido. Digite com DDD, só números (ex: 51999998888).");
      return;
    }
    if (plate.trim() && !isValidPlate(plate)) {
      setError("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await db.createCustomer(companyId, {
        name: name.trim(),
        phone: onlyDigits(phone),
        vehicle: plate.trim() ? { plate: normalizePlate(plate), model: model.trim(), color: color.trim() } : null,
      });
      refetch();
      close();
    } catch (e) {
      reportError(e, { where: "salvar pedido/cadastro" });
      setError("Não foi possível salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Novo cliente" onClose={close}>
      <div className="flex flex-col gap-3">
        <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
        <Field label="Telefone"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(51) 99999-8888" className="input" /></Field>
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-2">Veículo (opcional)</p>
        <Field label="Placa"><input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC1234" className="input" /></Field>
        <Field label="Modelo"><input value={model} onChange={(e) => setModel(e.target.value)} className="input" /></Field>
        <Field label="Cor"><input value={color} onChange={(e) => setColor(e.target.value)} className="input" /></Field>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button onClick={save} disabled={saving} className="mt-2 bg-zinc-600 hover:bg-[var(--surface)] disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl">
          {saving ? "Salvando..." : "Salvar cliente"}
        </button>
      </div>
    </ModalShell>
  );
}

function NovoVeiculoModal({ companyId, refetch, close, customerId }) {
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!plate.trim()) return;
    if (!isValidPlate(plate)) {
      setError("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await db.createVehicle(companyId, customerId, { plate: normalizePlate(plate), model: model.trim(), color: color.trim() });
      refetch();
      close();
    } catch (e) {
      reportError(e, { where: "salvar pedido/cadastro" });
      setError("Não foi possível salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Novo veículo" onClose={close}>
      <div className="flex flex-col gap-3">
        <Field label="Placa"><input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC1234" className="input" /></Field>
        <Field label="Modelo"><input value={model} onChange={(e) => setModel(e.target.value)} className="input" /></Field>
        <Field label="Cor"><input value={color} onChange={(e) => setColor(e.target.value)} className="input" /></Field>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button onClick={save} disabled={saving} className="mt-2 bg-zinc-600 hover:bg-[var(--surface)] disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl">
          {saving ? "Salvando..." : "Salvar veículo"}
        </button>
      </div>
    </ModalShell>
  );
}

function NovoPedidoModal({ data, companyId, refetch, close, mode, myUserId }) {
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [serviceIds, setServiceIds] = useState([]);
  const [attendantId, setAttendantId] = useState(() => (data.team.some((t) => t.id === myUserId) ? myUserId : ""));
  const [newCustomerMode, setNewCustomerMode] = useState(data.customers.length === 0);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newColor, setNewColor] = useState("");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("09:00");
  const [extraServices, setExtraServices] = useState([]);
  const [extraName, setExtraName] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const [extraProducts, setExtraProducts] = useState([]);
  const [pickedProductId, setPickedProductId] = useState("");
  const [pickedQuantity, setPickedQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const customer = data.customers.find((c) => c.id === customerId);
  const total =
    serviceIds.reduce((s, id) => s + (data.services.find((sv) => sv.id === id)?.price || 0), 0) +
    extraServices.reduce((s, e) => s + e.price, 0);

  const toggleService = (id) => setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addExtraService = () => {
    if (!extraName.trim() || !extraPrice) return;
    setExtraServices((prev) => [...prev, { id: genLocalId(), name: extraName.trim(), price: Number(extraPrice) || 0 }]);
    setExtraName("");
    setExtraPrice("");
  };
  const removeExtraService = (id) => setExtraServices((prev) => prev.filter((e) => e.id !== id));

  const addExtraProduct = () => {
    if (!pickedProductId || !pickedQuantity) return;
    const produto = data.products.find((p) => p.id === pickedProductId);
    if (!produto) return;
    setExtraProducts((prev) => [
      ...prev,
      { id: genLocalId(), product_id: produto.id, name: produto.name, unit: produto.unit, quantity: Number(pickedQuantity) || 0 },
    ]);
    setPickedProductId("");
    setPickedQuantity("1");
  };
  const removeExtraProduct = (id) => setExtraProducts((prev) => prev.filter((e) => e.id !== id));

  const save = async () => {
    if (saving) return;
    if (serviceIds.length === 0 && extraServices.length === 0) return;
    setError("");
    setSaving(true);
    try {
      let finalCustomerId = customerId;
      let finalVehicleId = vehicleId;

      if (newCustomerMode) {
        if (!newName.trim() || !newPlate.trim()) {
          setError("Preencha ao menos o nome do cliente e a placa.");
          return;
        }
        if (!isValidPhone(newPhone)) {
          setError("Telefone inválido. Digite com DDD, só números (ex: 51999998888).");
          return;
        }
        if (!isValidPlate(newPlate)) {
          setError("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
          return;
        }
        const created = await db.createCustomer(companyId, {
          name: newName.trim(),
          phone: onlyDigits(newPhone),
          vehicle: { plate: normalizePlate(newPlate), model: newModel.trim(), color: newColor.trim() },
        });
        // recarrega para pegar o veículo criado junto
        const fresh = await db.fetchAll(companyId);
        const freshCustomer = fresh.customers.find((c) => c.id === created.id);
        finalCustomerId = created.id;
        finalVehicleId = freshCustomer?.vehicles[0]?.id;
      } else {
        if (!customerId || !vehicleId) {
          setError("Selecione o cliente e o veículo.");
          return;
        }
      }

      const extraProductsPayload = extraProducts.map(({ product_id, name, unit, quantity }) => ({ product_id, name, unit, quantity }));

      await db.createOrder(companyId, {
        customer_id: finalCustomerId,
        vehicle_id: finalVehicleId,
        service_ids: serviceIds,
        extra_services: extraServices.map(({ name, price }) => ({ name, price })),
        extra_products: extraProductsPayload,
        total,
        paid: false,
        attendant_id: attendantId || null,
        status: mode === "queue" ? "aguardando" : "agendado",
        scheduled_time: mode === "schedule" ? new Date(`${date}T${time}:00`).toISOString() : null,
      });

      if (mode === "queue") {
        await db.consumeOrderStock(serviceIds, extraProductsPayload, data.serviceProducts, "Consumo automático — carro na fila");
      }

      refetch();
      close();
    } catch (e) {
      reportError(e, { where: "salvar pedido/cadastro" });
      setError("Não foi possível salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={mode === "queue" ? "Novo carro na fila" : "Novo agendamento"} onClose={close}>
      <div className="flex flex-col gap-3">
        {data.customers.length > 0 && (
          <div className="flex gap-2 mb-1">
            <button onClick={() => setNewCustomerMode(false)} className={`flex-1 text-xs font-medium py-2 rounded-lg ${!newCustomerMode ? "bg-zinc-600 text-white" : "bg-zinc-700 text-zinc-300"}`}>Cliente existente</button>
            <button onClick={() => setNewCustomerMode(true)} className={`flex-1 text-xs font-medium py-2 rounded-lg ${newCustomerMode ? "bg-zinc-600 text-white" : "bg-zinc-700 text-zinc-300"}`}>Novo cliente</button>
          </div>
        )}

        {!newCustomerMode && (
          <>
            <Field label="Cliente">
              <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId(""); }} className="input">
                <option value="">Selecione</option>
                {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {customer && (
              <Field label="Veículo">
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="input">
                  <option value="">Selecione</option>
                  {customer.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.model}</option>)}
                </select>
              </Field>
            )}
            {customer && customer.vehicles.length === 0 && <p className="text-xs text-amber-500">Este cliente não tem veículo cadastrado. Adicione um na aba Clientes.</p>}
          </>
        )}

        {newCustomerMode && (
          <>
            <Field label="Nome do cliente"><input value={newName} onChange={(e) => setNewName(e.target.value)} className="input" /></Field>
            <Field label="Telefone"><input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="input" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Placa"><input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} className="input" /></Field>
              <Field label="Modelo"><input value={newModel} onChange={(e) => setNewModel(e.target.value)} className="input" /></Field>
            </div>
            <Field label="Cor"><input value={newColor} onChange={(e) => setNewColor(e.target.value)} className="input" /></Field>
          </>
        )}

        {mode === "schedule" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" /></Field>
            <Field label="Hora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input" /></Field>
          </div>
        )}

        <Field label="Atendente responsável">
          <select value={attendantId} onChange={(e) => setAttendantId(e.target.value)} className="input">
            <option value="">Não definido</option>
            {data.team.filter((t) => !t.blocked).map((t) => (
              <option key={t.id} value={t.id}>{t.full_name || "Sem nome"}</option>
            ))}
          </select>
        </Field>

        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-2">Serviços</p>
        <div className="flex flex-col gap-1.5">
          {data.services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
              <span className="flex-1 text-sm">{s.name}</span>
              <span className="font-num text-sm text-[var(--text-secondary)]">{money(s.price)}</span>
            </label>
          ))}
        </div>

        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-2">Serviço avulso</p>
        <p className="text-xs text-[var(--text-secondary)] -mt-2">Use para um serviço fora da lista, com valor livre</p>
        <div className="flex flex-col gap-2">
          <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="Descrição do serviço" className="input" />
          <div className="flex gap-2">
            <input value={extraPrice} onChange={(e) => setExtraPrice(e.target.value)} type="number" placeholder="Valor (R$)" className="input flex-1" />
            <button onClick={addExtraService} type="button" className="shrink-0 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg px-4">
              <Plus size={16} />
            </button>
          </div>
        </div>
        {extraServices.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {extraServices.map((e) => (
              <div key={e.id} className="flex items-center gap-2 border border-amber-800 bg-amber-950 rounded-lg px-3 py-2.5">
                <span className="flex-1 text-sm font-semibold text-amber-200">{e.name}</span>
                <span className="font-num text-sm font-semibold text-amber-300">{money(e.price)}</span>
                <button onClick={() => removeExtraService(e.id)} className="text-amber-500 hover:text-rose-400">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-2">Produtos do estoque usados</p>
        <p className="text-xs text-[var(--text-secondary)] -mt-2">Escolha produtos extras usados nesse carro, além dos já vinculados aos serviços</p>
        {data.products.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Nenhum produto cadastrado no Estoque ainda.</p>
        ) : (
          <div className="flex gap-2">
            <select value={pickedProductId} onChange={(e) => setPickedProductId(e.target.value)} className="input flex-1">
              <option value="">Selecione um produto</option>
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.unit}) — {p.quantity} em estoque</option>
              ))}
            </select>
            <input value={pickedQuantity} onChange={(e) => setPickedQuantity(e.target.value)} type="number" step="any" className="input w-20" />
            <button onClick={addExtraProduct} type="button" className="shrink-0 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg px-3">
              <Plus size={16} />
            </button>
          </div>
        )}
        {extraProducts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {extraProducts.map((e) => (
              <div key={e.id} className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2">
                <Package size={14} className="text-[var(--text-secondary)] shrink-0" />
                <span className="flex-1 text-sm">{e.name}</span>
                <span className="font-num text-sm text-[var(--text-secondary)]">{e.quantity} {e.unit}</span>
                <button onClick={() => removeExtraProduct(e.id)} className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 -m-1.5">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
          <span className="text-sm text-[var(--text-secondary)]">Total</span>
          <span className="font-num text-lg font-semibold text-[var(--text)]">{money(total)}</span>
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="mt-2 bg-zinc-500 hover:bg-zinc-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-sm py-3 rounded-xl"
        >
          {saving ? "Salvando..." : mode === "queue" ? "Adicionar à fila" : "Salvar agendamento"}
        </button>
      </div>
    </ModalShell>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">{label}</label>
      {children}
    </div>
  );
}
