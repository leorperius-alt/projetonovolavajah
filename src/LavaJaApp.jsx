import React, { useState, useEffect, useCallback } from "react";
import {
  Car, CalendarClock, Users, Wrench, Wallet, Plus, X, Check, Phone, Trash2, Clock,
  Search, Droplets, CheckCircle2, PlayCircle, LogIn, Banknote, LogOut, UserPlus, Copy, Mail,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import * as db from "./lib/db";

const genLocalId = () => Math.random().toString(36).slice(2, 9);
const money = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayStr = () => new Date().toISOString().slice(0, 10);
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
  const [data, setData] = useState({ customers: [], services: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("fila");
  const [modal, setModal] = useState(null);

  const refetch = useCallback(async (cid) => {
    const id = cid || companyId;
    if (!id) return;
    const fresh = await db.fetchAll(id);
    setData(fresh);
  }, [companyId]);

  useEffect(() => {
    (async () => {
      const cid = await db.getMyCompanyId();
      setCompanyId(cid);
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
    if (!companyId) return;
    const unsubscribe = db.subscribeToChanges(companyId, () => refetch(companyId));
    return unsubscribe;
  }, [companyId, refetch]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-stone-400">Carregando...</div>;
  }

  const NAV = [
    { id: "fila", label: "Fila", icon: Car },
    { id: "agenda", label: "Agenda", icon: CalendarClock },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "servicos", label: "Serviços", icon: Wrench },
    { id: "financeiro", label: "Financeiro", icon: Wallet },
    { id: "equipe", label: "Equipe", icon: UserPlus },
  ];

  return (
    <div className="w-full min-h-screen bg-stone-50 text-stone-900 flex flex-col md:flex-row" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-num { font-family: 'JetBrains Mono', monospace; }
        .input { width: 100%; padding: 0.6rem 0.75rem; border-radius: 0.6rem; border: 1px solid #e7e5e4; font-size: 0.875rem; outline: none; }
        .input:focus { box-shadow: 0 0 0 2px #059669; border-color: #059669; }
      `}</style>

      <div className="hidden md:flex md:flex-col w-56 shrink-0 bg-emerald-800 text-emerald-50 p-4">
        <div className="flex items-center gap-2 mb-1 px-2">
          <Droplets size={26} className="text-orange-400" />
          <span className="font-display font-semibold text-lg">LavaJá</span>
        </div>
        <p className="px-2 text-xs text-emerald-200/70 mb-6 truncate">{companyName}</p>
        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                tab === n.id ? "bg-emerald-700 text-white" : "text-emerald-100/80 hover:bg-emerald-700/50"
              }`}
            >
              <n.icon size={18} />
              {n.label}
            </button>
          ))}
        </nav>
        <button onClick={onLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-100/70 hover:bg-emerald-700/50">
          <LogOut size={18} /> Sair
        </button>
      </div>

      <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-emerald-800 text-emerald-50">
        <Droplets size={22} className="text-orange-400" />
        <span className="font-display font-semibold">LavaJá</span>
        <span className="text-xs text-emerald-200/70 truncate flex-1 text-right">{companyName}</span>
        <button onClick={onLogout} className="text-emerald-200/80">
          <LogOut size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {tab === "fila" && <FilaView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {tab === "agenda" && <AgendaView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {tab === "clientes" && <ClientesView data={data} companyId={companyId} refetch={refetch} setModal={setModal} />}
        {tab === "servicos" && <ServicosView data={data} companyId={companyId} refetch={refetch} />}
        {tab === "financeiro" && <FinanceiroView data={data} refetch={refetch} />}
        {tab === "equipe" && <EquipeView companyId={companyId} />}
      </div>

      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 flex justify-around py-1.5 z-30">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-medium ${tab === n.id ? "text-emerald-700" : "text-stone-400"}`}
          >
            <n.icon size={20} />
            {n.label}
          </button>
        ))}
      </div>

      {modal && <ModalRouter modal={modal} setModal={setModal} data={data} companyId={companyId} refetch={refetch} />}
    </div>
  );
}

function OrderCustomerLine({ data, order }) {
  const customer = data.customers.find((c) => c.id === order.customer_id);
  const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);
  return (
    <div>
      <p className="font-semibold text-sm">{vehicle ? vehicle.plate : "—"} · {vehicle?.model}</p>
      <p className="text-xs text-stone-500">{customer?.name}</p>
    </div>
  );
}

function OrderServicesLine({ data, order }) {
  const names = (order.service_ids || []).map((id) => data.services.find((s) => s.id === id)?.name).filter(Boolean);
  const extraNames = (order.extra_services || []).map((e) => e.name);
  return <p className="text-xs text-stone-500 truncate">{[...names, ...extraNames].join(", ")}</p>;
}

function FilaView({ data, refetch, setModal }) {
  const active = data.orders.filter((o) => ["aguardando", "lavando", "pronto"].includes(o.status));
  const advance = async (order, status) => {
    await db.updateOrderStatus(order.id, status);
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
          <p className="text-sm text-stone-500">{active.length} veículo(s) em atendimento</p>
        </div>
        <button onClick={() => setModal({ type: "novoCarro" })} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm">
          <Plus size={16} /> Novo carro
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col) => {
          const items = active.filter((o) => o.status === col.key);
          return (
            <div key={col.key} className="bg-white rounded-2xl border border-stone-200 p-3">
              <div className="flex items-center gap-2 mb-3 px-1">
                <col.icon size={16} className="text-stone-500" />
                <span className="text-sm font-semibold text-stone-700">{col.title}</span>
                <span className="ml-auto text-xs font-num text-stone-400">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2 min-h-[80px]">
                {items.length === 0 && <p className="text-xs text-stone-400 px-1 py-4 text-center">Nenhum carro aqui</p>}
                {items.map((order) => (
                  <div key={order.id} className="border border-stone-200 rounded-xl p-3 bg-stone-50">
                    <OrderCustomerLine data={data} order={order} />
                    <OrderServicesLine data={data} order={order} />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-stone-400">há {timeAgo(order.created_at)}</span>
                      <span className="font-num text-sm font-semibold text-emerald-700">{money(order.total)}</span>
                    </div>
                    <div className="mt-2">
                      {col.key === "aguardando" && (
                        <button onClick={() => advance(order, "lavando")} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg py-2">
                          <PlayCircle size={14} /> Iniciar lavagem
                        </button>
                      )}
                      {col.key === "lavando" && (
                        <button onClick={() => advance(order, "pronto")} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2">
                          <CheckCircle2 size={14} /> Marcar pronto
                        </button>
                      )}
                      {col.key === "pronto" && (
                        <button onClick={() => advance(order, "entregue")} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-stone-700 hover:bg-stone-800 text-white rounded-lg py-2">
                          <Check size={14} /> Entregar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
          <p className="text-sm text-stone-500">{scheduled.length} agendamento(s)</p>
        </div>
        <button onClick={() => setModal({ type: "novoAgendamento" })} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm">
          <Plus size={16} /> Novo agendamento
        </button>
      </div>

      {Object.keys(groups).length === 0 && <div className="text-center py-16 text-stone-400 text-sm">Nenhum agendamento cadastrado</div>}

      <div className="flex flex-col gap-5">
        {Object.entries(groups).map(([date, items]) => (
          <div key={date}>
            <p className="text-xs font-semibold uppercase text-stone-400 mb-2 px-1">
              {new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              {date === todayStr() && " · hoje"}
            </p>
            <div className="flex flex-col gap-2">
              {items.map((order) => (
                <div key={order.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
                  <div className="font-num text-sm font-semibold text-emerald-700 w-14 shrink-0">
                    {new Date(order.scheduled_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <OrderCustomerLine data={data} order={order} />
                    <OrderServicesLine data={data} order={order} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-num text-sm font-semibold">{money(order.total)}</p>
                    <button onClick={() => checkIn(order)} className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                      <LogIn size={12} /> Check-in
                    </button>
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
          <p className="text-sm text-stone-500">{data.customers.length} cliente(s) cadastrado(s)</p>
        </div>
        <button onClick={() => setModal({ type: "novoCliente" })} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-sm">
          <Plus size={16} /> Novo cliente
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone ou placa" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      {filtered.length === 0 && <div className="text-center py-16 text-stone-400 text-sm">Nenhum cliente encontrado</div>}

      <div className="flex flex-col gap-2">
        {filtered.map((c) => (
          <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-sm">{c.name}</p>
                {c.phone && <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5"><Phone size={11} /> {c.phone}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModal({ type: "novoVeiculo", customerId: c.id })} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
                  <Plus size={12} /> Veículo
                </button>
                <button onClick={() => removeCustomer(c.id)} className="text-stone-300 hover:text-rose-500">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {c.vehicles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.vehicles.map((v) => (
                  <span key={v.id} className="text-xs bg-stone-100 text-stone-700 rounded-lg px-2.5 py-1">
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

function ServicosView({ data, companyId, refetch }) {
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
      <p className="text-sm text-stone-500 mb-5">{data.services.length} serviço(s) cadastrado(s)</p>

      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-5 flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do serviço" className="flex-1 px-3 py-2.5 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" placeholder="Preço" className="w-full sm:w-32 px-3 py-2.5 rounded-lg border border-stone-200 text-sm font-num focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <button onClick={add} className="flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
          <Plus size={15} /> Adicionar
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {data.services.map((s) => (
          <div key={s.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
            <Wrench size={16} className="text-stone-400 shrink-0" />
            <span className="flex-1 text-sm font-medium">{s.name}</span>
            <div className="flex items-center gap-1 font-num text-sm">
              <span className="text-stone-400">R$</span>
              <input defaultValue={s.price} onBlur={(e) => updatePrice(s.id, e.target.value)} type="number" className="w-20 px-2 py-1 rounded-lg border border-stone-200 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <button onClick={() => remove(s.id)} className="text-stone-300 hover:text-rose-500">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinanceiroView({ data, refetch }) {
  const [range, setRange] = useState("hoje");

  const inRange = (order) => {
    if (order.status !== "entregue") return false;
    const d = new Date(order.created_at);
    const now = new Date();
    if (range === "hoje") return dateStrOf(order.created_at) === todayStr();
    if (range === "7dias") return now - d <= 7 * 24 * 3600 * 1000;
    return true;
  };

  const filteredOrders = data.orders.filter(inRange).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const totalPago = filteredOrders.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
  const totalPendente = filteredOrders.filter((o) => !o.paid).reduce((s, o) => s + o.total, 0);

  const toggle = async (order) => {
    await db.togglePaid(order.id, !order.paid);
    refetch();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-xl font-semibold">Financeiro</h1>
        <div className="flex gap-1 bg-white border border-stone-200 rounded-xl p-1">
          {[{ k: "hoje", l: "Hoje" }, { k: "7dias", l: "7 dias" }, { k: "todos", l: "Tudo" }].map((o) => (
            <button key={o.k} onClick={() => setRange(o.k)} className={`text-xs font-medium px-3 py-1.5 rounded-lg ${range === o.k ? "bg-emerald-700 text-white" : "text-stone-500"}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500 mb-1">Faturado</p>
          <p className="font-num text-lg font-semibold text-emerald-700">{money(totalPago)}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500 mb-1">A receber</p>
          <p className="font-num text-lg font-semibold text-amber-600">{money(totalPendente)}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs text-stone-500 mb-1">Lavagens</p>
          <p className="font-num text-lg font-semibold">{filteredOrders.length}</p>
        </div>
      </div>

      {filteredOrders.length === 0 && <div className="text-center py-16 text-stone-400 text-sm">Nenhuma lavagem concluída neste período</div>}

      <div className="flex flex-col gap-2">
        {filteredOrders.map((order) => (
          <div key={order.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <OrderCustomerLine data={data} order={order} />
              <OrderServicesLine data={data} order={order} />
            </div>
            <span className="font-num text-sm font-semibold">{money(order.total)}</span>
            <button onClick={() => toggle(order)} className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 ${order.paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              <Banknote size={12} /> {order.paid ? "Pago" : "Pendente"}
            </button>
          </div>
        ))}
      </div>
    </div>
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

  const pendentes = invites.filter((i) => !i.used_by);

  if (loading) return <div className="p-6 text-stone-400 text-sm">Carregando...</div>;

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-xl font-semibold mb-1">Equipe</h1>
      <p className="text-sm text-stone-500 mb-5">{team.length} pessoa(s) com acesso ao painel</p>

      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-5">
        <p className="text-xs font-semibold text-stone-400 uppercase mb-2">Convidar funcionário</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail do funcionário (opcional)"
            className="flex-1 px-3 py-2.5 rounded-lg border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button onClick={gerarConvite} className="flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
            <UserPlus size={15} /> Gerar link de convite
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-2">Gere o link e envie por WhatsApp, e-mail ou onde preferir. Ele funciona uma única vez.</p>
      </div>

      {pendentes.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-stone-400 uppercase mb-2 px-1">Convites pendentes</p>
          <div className="flex flex-col gap-2">
            {pendentes.map((inv) => (
              <div key={inv.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3 flex items-center gap-3">
                <Mail size={16} className="text-amber-600 shrink-0" />
                <span className="flex-1 text-sm text-amber-900">{inv.email || "Convite sem e-mail definido"}</span>
                <button onClick={() => copiarLink(inv)} className="flex items-center gap-1 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg">
                  <Copy size={12} /> {copiedId === inv.id ? "Copiado!" : "Copiar link"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs font-semibold text-stone-400 uppercase mb-2 px-1">Membros da equipe</p>
      <div className="flex flex-col gap-2">
        {team.map((p) => (
          <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-semibold shrink-0">
              {(p.full_name || "?").slice(0, 1).toUpperCase()}
            </div>
            <span className="flex-1 text-sm font-medium">{p.full_name || "Sem nome"}</span>
            <span className="text-xs text-stone-400 capitalize">{p.role === "owner" ? "dono" : "funcionário"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white">
          <h2 className="font-display font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalRouter({ modal, setModal, data, companyId, refetch }) {
  const close = () => setModal(null);
  if (modal.type === "novoCliente") return <NovoClienteModal data={data} companyId={companyId} refetch={refetch} close={close} />;
  if (modal.type === "novoVeiculo") return <NovoVeiculoModal data={data} companyId={companyId} refetch={refetch} close={close} customerId={modal.customerId} />;
  if (modal.type === "novoCarro") return <NovoPedidoModal data={data} companyId={companyId} refetch={refetch} close={close} mode="queue" />;
  if (modal.type === "novoAgendamento") return <NovoPedidoModal data={data} companyId={companyId} refetch={refetch} close={close} mode="schedule" />;
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
        <p className="text-xs font-semibold text-stone-400 uppercase mt-2">Veículo (opcional)</p>
        <Field label="Placa"><input value={plate} onChange={(e) => setPlate(e.target.value)} className="input" /></Field>
        <Field label="Modelo"><input value={model} onChange={(e) => setModel(e.target.value)} className="input" /></Field>
        <Field label="Cor"><input value={color} onChange={(e) => setColor(e.target.value)} className="input" /></Field>
        <button onClick={save} className="mt-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm py-3 rounded-xl">Salvar cliente</button>
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
        <button onClick={save} className="mt-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm py-3 rounded-xl">Salvar veículo</button>
      </div>
    </ModalShell>
  );
}

function NovoPedidoModal({ data, companyId, refetch, close, mode }) {
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [serviceIds, setServiceIds] = useState([]);
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

  const save = async () => {
    if (serviceIds.length === 0 && extraServices.length === 0) return;
    let finalCustomerId = customerId;
    let finalVehicleId = vehicleId;

    if (newCustomerMode) {
      if (!newName.trim() || !newPlate.trim()) return;
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
      if (!customerId || !vehicleId) return;
    }

    await db.createOrder(companyId, {
      customer_id: finalCustomerId,
      vehicle_id: finalVehicleId,
      service_ids: serviceIds,
      extra_services: extraServices.map(({ name, price }) => ({ name, price })),
      total,
      paid: false,
      status: mode === "queue" ? "aguardando" : "agendado",
      scheduled_time: mode === "schedule" ? new Date(`${date}T${time}:00`).toISOString() : null,
    });

    refetch();
    close();
  };

  return (
    <ModalShell title={mode === "queue" ? "Novo carro na fila" : "Novo agendamento"} onClose={close}>
      <div className="flex flex-col gap-3">
        {data.customers.length > 0 && (
          <div className="flex gap-2 mb-1">
            <button onClick={() => setNewCustomerMode(false)} className={`flex-1 text-xs font-medium py-2 rounded-lg ${!newCustomerMode ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-600"}`}>Cliente existente</button>
            <button onClick={() => setNewCustomerMode(true)} className={`flex-1 text-xs font-medium py-2 rounded-lg ${newCustomerMode ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-600"}`}>Novo cliente</button>
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
            {customer && customer.vehicles.length === 0 && <p className="text-xs text-amber-600">Este cliente não tem veículo cadastrado. Adicione um na aba Clientes.</p>}
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

        <p className="text-xs font-semibold text-stone-400 uppercase mt-2">Serviços</p>
        <div className="flex flex-col gap-1.5">
          {data.services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 border border-stone-200 rounded-lg px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
              <span className="flex-1 text-sm">{s.name}</span>
              <span className="font-num text-sm text-stone-500">{money(s.price)}</span>
            </label>
          ))}
        </div>

        <p className="text-xs font-semibold text-stone-400 uppercase mt-2">Serviço avulso</p>
        <p className="text-xs text-stone-400 -mt-2">Use para um serviço fora da lista, com valor livre</p>
        <div className="flex gap-2">
          <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="Descrição" className="input flex-1" />
          <input value={extraPrice} onChange={(e) => setExtraPrice(e.target.value)} type="number" placeholder="Valor" className="input w-24" />
          <button onClick={addExtraService} type="button" className="shrink-0 bg-stone-700 hover:bg-stone-800 text-white rounded-lg px-3">
            <Plus size={16} />
          </button>
        </div>
        {extraServices.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {extraServices.map((e) => (
              <div key={e.id} className="flex items-center gap-2 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2.5">
                <span className="flex-1 text-sm font-semibold text-amber-900">{e.name}</span>
                <span className="font-num text-sm font-semibold text-amber-700">{money(e.price)}</span>
                <button onClick={() => removeExtraService(e.id)} className="text-amber-400 hover:text-rose-500">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
          <span className="text-sm text-stone-500">Total</span>
          <span className="font-num text-lg font-semibold text-emerald-700">{money(total)}</span>
        </div>

        <button onClick={save} className="mt-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm py-3 rounded-xl">
          {mode === "queue" ? "Adicionar à fila" : "Salvar agendamento"}
        </button>
      </div>
    </ModalShell>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
