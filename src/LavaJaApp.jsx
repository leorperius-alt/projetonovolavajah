import React, { useState, useEffect, useCallback } from "react";
import {
  Car, CalendarClock, Users, Wrench, Wallet, Plus, X, Check, Phone, Trash2, Clock,
  Search, Droplets, CheckCircle2, PlayCircle, LogIn, Banknote, LogOut, UserPlus, Copy, Mail,
  TrendingDown, FileBarChart, Download, ChevronRight, ShieldOff, ShieldCheck, UserX,
  Package, ArrowDownCircle, ArrowUpCircle, History, AlertTriangle, MessageCircle, Percent,
  Edit2, XCircle,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import * as db from "./lib/db";
import ThemeToggle from "./ThemeToggle.jsx";

const genLocalId = () => Math.random().toString(36).slice(2, 9);
const money = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayStr = () => new Date().toISOString().slice(0, 10);

const waLink = (phone, message) => {
  let digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11) digits = "55" + digits; // assume BR se não veio com país
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
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
  const [myRole, setMyRole] = useState(null);
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

      const profile = await loadProfileWithRetry();
      if (profile?.blocked) {
        setBlocked(true);
        setLoading(false);
        return;
      }
      const cid = profile?.company_id || null;
      setCompanyId(cid);
      setMyRole(profile?.role || null);
      if (cid) {
        const { data: company } = await supabase.from("companies").select("name").eq("id", cid).single();
        setCompanyName(company?.name || "");
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

  if (!companyId) {
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
    { id: "fila", label: "Fila", icon: Car },
    { id: "agenda", label: "Agenda", icon: CalendarClock },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "servicos", label: "Serviços", icon: Wrench },
    { id: "estoque", label: "Estoque", icon: Package },
    { id: "financeiro", label: "Financeiro", icon: Wallet, ownerOnly: true },
    { id: "relatorios", label: "Relatórios", icon: FileBarChart, ownerOnly: true },
    { id: "comissoes", label: "Comissões", icon: Percent, ownerOnly: true },
    { id: "equipe", label: "Equipe", icon: UserPlus, ownerOnly: true },
  ];
  const NAV = FULL_NAV.filter((n) => !n.ownerOnly || isOwner);
  const activeTab = NAV.some((n) => n.id === tab) ? tab : "fila";

  return (
    <div className="w-full min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col md:flex-row" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-num { font-family: 'JetBrains Mono', monospace; }
        .input { width: 100%; padding: 0.6rem 0.75rem; border-radius: 0.6rem; border: 1px solid var(--border); background-color: var(--surface); color: var(--text); font-size: 0.875rem; outline: none; }
        .input::placeholder { color: var(--text-muted); }
        .input:focus { box-shadow: 0 0 0 2px var(--text-muted); border-color: var(--text-muted); }
      `}</style>

      <div className="hidden md:flex md:flex-col w-56 shrink-0 bg-zinc-800 text-zinc-100 p-4">
        <div className="flex items-center gap-2 mb-1 px-2">
          <img src="/logo.png" alt="LavaJá" className="w-8 h-8 rounded-lg" />
          <span className="font-display font-semibold text-lg">LavaJá</span>
        </div>
        <p className="px-2 text-xs text-zinc-400/70 mb-6 truncate">{companyName}</p>
        <nav className="flex flex-col gap-1 flex-1">
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
        <ThemeToggle variant="dark" className="mr-1" />
        <button onClick={onLogout} className="text-zinc-400/80">
          <LogOut size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {activeTab === "fila" && <FilaView data={data} companyId={companyId} companyName={companyName} refetch={refetch} setModal={setModal} />}
        {activeTab === "agenda" && <AgendaView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {activeTab === "clientes" && <ClientesView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {activeTab === "servicos" && <ServicosView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {activeTab === "estoque" && <EstoqueView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {activeTab === "financeiro" && isOwner && <FinanceiroView data={data} companyId={companyId} refetch={refetch} />}
        {activeTab === "relatorios" && isOwner && <RelatoriosView data={data} />}
        {activeTab === "comissoes" && isOwner && <ComissoesView data={data} />}
        {activeTab === "equipe" && isOwner && <EquipeView companyId={companyId} />}
      </div>

      <div className="md:hidden fixed bottom-0 inset-x-0 bg-zinc-800 border-t border-zinc-700 flex justify-around py-1.5 z-30">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-medium ${activeTab === n.id ? "text-zinc-200" : "text-zinc-400"}`}
          >
            <n.icon size={20} />
            {n.label}
          </button>
        ))}
      </div>

      {modal && <ModalRouter modal={modal} setModal={setModal} data={data} companyId={companyId} refetch={refetch} myUserId={myUserId} />}
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
                          <button onClick={() => setModal({ type: "editarPedido", order })} title="Editar pedido" className="text-[var(--text-muted)] hover:text-[var(--text)]">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => cancelar(order)} title="Cancelar pedido" className="text-[var(--text-muted)] hover:text-rose-400">
                            <XCircle size={15} />
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
                          <button onClick={() => advance(order, "lavando")} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg py-2">
                            <PlayCircle size={14} /> Iniciar lavagem
                          </button>
                        )}
                        {col.key === "lavando" && (
                          <button onClick={() => advance(order, "pronto")} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-zinc-500 hover:bg-zinc-600 text-white rounded-lg py-2">
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
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-2"
                              >
                                <MessageCircle size={14} /> Avisar no WhatsApp
                              </a>
                            ) : (
                              <p className="text-[11px] text-[var(--text-muted)] text-center">Cliente sem telefone cadastrado</p>
                            )}
                            <button onClick={() => advance(order, "entregue")} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg py-2">
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
                    <button onClick={() => setModal({ type: "editarPedido", order })} title="Editar" className="text-[var(--text-muted)] hover:text-[var(--text)]">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => cancelar(order)} title="Cancelar" className="text-[var(--text-muted)] hover:text-rose-400">
                      <XCircle size={15} />
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

function ClientesView({ data, companyId, refetch, setModal }) {
  const [q, setQ] = useState("");
  const filtered = data.customers.filter((c) =>
    (c.name + (c.phone || "") + c.vehicles.map((v) => v.plate).join(" ")).toLowerCase().includes(q.toLowerCase())
  );

  const removeCustomer = async (id) => {
    await db.deleteCustomer(id);
    refetch();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl font-semibold">Clientes</h1>
          <p className="text-sm text-[var(--text-secondary)]">{data.customers.length} cliente(s) cadastrado(s)</p>
        </div>
        <button onClick={() => setModal({ type: "novoCliente" })} className="flex items-center gap-1.5 bg-zinc-500 hover:bg-zinc-400 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm">
          <Plus size={16} /> Novo cliente
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone ou placa" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--border)] text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-zinc-400" />
      </div>

      {filtered.length === 0 && <div className="text-center py-16 text-[var(--text-secondary)] text-sm">Nenhum cliente encontrado</div>}

      <div className="flex flex-col gap-2">
        {filtered.map((c) => (
          <div key={c.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-sm">{c.name}</p>
                {c.phone && <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mt-0.5"><Phone size={11} /> {c.phone}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModal({ type: "novoVeiculo", customerId: c.id })} className="text-xs font-medium text-[var(--text)] hover:text-[var(--text)] flex items-center gap-1">
                  <Plus size={12} /> Veículo
                </button>
                <button onClick={() => removeCustomer(c.id)} className="text-[var(--text-muted)] hover:text-rose-400">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {c.vehicles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.vehicles.map((v) => (
                  <span key={v.id} className="text-xs bg-zinc-700 text-zinc-300 rounded-lg px-2.5 py-1">
                    {v.plate} · {v.model} {v.color ? `(${v.color})` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
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
              <button onClick={() => remove(s.id)} className="text-[var(--text-muted)] hover:text-rose-400">
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinanceiroView({ data, companyId, refetch }) {
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

  const toggle = async (order) => {
    await db.togglePaid(order.id, !order.paid);
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
            </div>
            <span className="font-num text-sm font-semibold">{money(order.total)}</span>
            <button onClick={() => toggle(order)} className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 ${order.paid ? "bg-zinc-700 text-zinc-100" : "bg-amber-950 text-amber-300"}`}>
              <Banknote size={12} /> {order.paid ? "Pago" : "Pendente"}
            </button>
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
            <button onClick={() => removeExpense(exp.id)} className="text-[var(--text-muted)] hover:text-rose-400">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatoriosView({ data }) {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(todayStr());
  const [servicoSelecionado, setServicoSelecionado] = useState(null);

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
    const linhas = [["Data", "Cliente", "Placa", "Serviços", "Total", "Status pagamento"]];
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
          new Date(o.created_at).toLocaleDateString("pt-BR"),
          customer?.name || "",
          vehicle?.plate || "",
          nomesServicos,
          o.total,
          o.paid ? "Pago" : "Pendente",
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
                  <p className="text-xs text-[var(--text-secondary)]">{new Date(o.data).toLocaleDateString("pt-BR")}</p>
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
                  <Trash2 size={15} />
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
            <span className="text-xs text-[var(--text-muted)] shrink-0">{new Date(m.created_at).toLocaleDateString("pt-BR")}</span>
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
                <button onClick={() => remove(v.id)} className="text-[var(--text-muted)] hover:text-rose-400">
                  <X size={15} />
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
                  <X size={14} />
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
                <button onClick={() => removeExtraProduct(e.id)} className="text-[var(--text-muted)] hover:text-rose-400">
                  <X size={14} />
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
                  {p.blocked ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
                  {p.blocked ? "Desbloquear" : "Bloquear"}
                </button>
                <button
                  onClick={() => removerMembro(p)}
                  title="Remover da equipe"
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-rose-950 hover:text-rose-400"
                >
                  <UserX size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
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

function ModalRouter({ modal, setModal, data, companyId, refetch, myUserId }) {
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
  return null;
}

function NovoClienteModal({ data, companyId, refetch, close }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    await db.createCustomer(companyId, {
      name: name.trim(),
      phone: phone.trim(),
      vehicle: plate.trim() ? { plate: plate.trim().toUpperCase(), model: model.trim(), color: color.trim() } : null,
    });
    refetch();
    close();
  };

  return (
    <ModalShell title="Novo cliente" onClose={close}>
      <div className="flex flex-col gap-3">
        <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
        <Field label="Telefone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" /></Field>
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mt-2">Veículo (opcional)</p>
        <Field label="Placa"><input value={plate} onChange={(e) => setPlate(e.target.value)} className="input" /></Field>
        <Field label="Modelo"><input value={model} onChange={(e) => setModel(e.target.value)} className="input" /></Field>
        <Field label="Cor"><input value={color} onChange={(e) => setColor(e.target.value)} className="input" /></Field>
        <button onClick={save} className="mt-2 bg-zinc-600 hover:bg-[var(--surface)] text-white font-medium text-sm py-3 rounded-xl">Salvar cliente</button>
      </div>
    </ModalShell>
  );
}

function NovoVeiculoModal({ companyId, refetch, close, customerId }) {
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");

  const save = async () => {
    if (!plate.trim()) return;
    await db.createVehicle(companyId, customerId, { plate: plate.trim().toUpperCase(), model: model.trim(), color: color.trim() });
    refetch();
    close();
  };

  return (
    <ModalShell title="Novo veículo" onClose={close}>
      <div className="flex flex-col gap-3">
        <Field label="Placa"><input value={plate} onChange={(e) => setPlate(e.target.value)} className="input" /></Field>
        <Field label="Modelo"><input value={model} onChange={(e) => setModel(e.target.value)} className="input" /></Field>
        <Field label="Cor"><input value={color} onChange={(e) => setColor(e.target.value)} className="input" /></Field>
        <button onClick={save} className="mt-2 bg-zinc-600 hover:bg-[var(--surface)] text-white font-medium text-sm py-3 rounded-xl">Salvar veículo</button>
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
        const created = await db.createCustomer(companyId, {
          name: newName.trim(),
          phone: newPhone.trim(),
          vehicle: { plate: newPlate.trim().toUpperCase(), model: newModel.trim(), color: newColor.trim() },
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
                  <X size={14} />
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
                <button onClick={() => removeExtraProduct(e.id)} className="text-[var(--text-muted)] hover:text-rose-400">
                  <X size={14} />
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
