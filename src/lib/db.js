import { supabase } from "../supabaseClient";
import {
  cacheGet,
  cacheSet,
  getCurrentUserId,
  isNetworkError,
  markNetDown,
  netCall,
  NET_TIMEOUT_MS,
  NET_TIMEOUT_LONG_MS,
  SUBSCRIPTION_GRACE_MS,
} from "./offline";
import { applyQueue, getQueue, mutate, newId } from "./syncQueue";

const localDateStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export async function getMyCompanyId() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", auth.user.id)
    .single();
  if (error) return null;
  return data.company_id;
}

export async function getMyProfile() {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  try {
    const { data, error } = await netCall(() => supabase.from("profiles").select("company_id, role, full_name, blocked").eq("id", uid).single(), NET_TIMEOUT_MS);
    if (error) throw error;
    await cacheSet("profile", data);
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await cacheGet("profile");
      return cached?.value || null;
    }
    return null;
  }
}

// Dados da empresa (nome e limites) — com cópia offline
export async function getCompanyInfo(companyId) {
  try {
    const { data, error } = await netCall(() => supabase.from("companies").select("name, loyalty_threshold, overdue_days_threshold").eq("id", companyId).single(), NET_TIMEOUT_MS);
    if (error) throw error;
    await cacheSet(`company:${companyId}`, data);
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await cacheGet(`company:${companyId}`);
      return cached?.value || null;
    }
    return null;
  }
}

export function subscribeToMyProfile(userId, onChange) {
  const channel = supabase
    .channel(`profile-${userId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function emptyData() {
  return {
    customers: [],
    services: [],
    orders: [],
    expenses: [],
    products: [],
    serviceProducts: [],
    team: [],
    categoryPrices: [],
    vehicleInspections: [],
  };
}

export async function fetchAll(companyId) {
  try {
    const results = await netCall(() => Promise.all([
        supabase.from("customers").select("*").eq("company_id", companyId).order("name"),
        supabase.from("vehicles").select("*").eq("company_id", companyId),
        supabase.from("services").select("*").eq("company_id", companyId).order("name"),
        supabase.from("orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("expenses").select("*").eq("company_id", companyId).order("expense_date", { ascending: false }),
        supabase.from("products").select("*").eq("company_id", companyId).order("name"),
        supabase.from("service_products").select("*").eq("company_id", companyId),
        supabase.from("profiles").select("id, full_name, role, commission_rate, blocked").eq("company_id", companyId).order("full_name"),
        supabase.from("service_category_prices").select("*").eq("company_id", companyId),
        supabase.from("vehicle_inspections").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      ]), NET_TIMEOUT_LONG_MS);

    // Falha de rede em qualquer tabela → usa a cópia salva (não mistura dado velho com novo)
    const netFail = results.find((r) => r.error && isNetworkError(r.error));
    if (netFail) {
      markNetDown();
      throw netFail.error;
    }

    const [customersRes, vehiclesRes, servicesRes, ordersRes, expensesRes, productsRes, serviceProductsRes, teamRes, categoryPricesRes, inspectionsRes] = results;

    const vehiclesByCustomer = {};
    (vehiclesRes.data || []).forEach((v) => {
      vehiclesByCustomer[v.customer_id] = vehiclesByCustomer[v.customer_id] || [];
      vehiclesByCustomer[v.customer_id].push(v);
    });

    const customers = (customersRes.data || []).map((c) => ({
      ...c,
      vehicles: vehiclesByCustomer[c.id] || [],
    }));

    const fresh = {
      customers,
      services: servicesRes.data || [],
      orders: ordersRes.data || [],
      expenses: expensesRes.data || [],
      products: productsRes.data || [],
      serviceProducts: serviceProductsRes.data || [],
      team: teamRes.data || [],
      categoryPrices: categoryPricesRes.data || [],
      vehicleInspections: inspectionsRes.data || [],
    };

    // Guarda a cópia sempre. Se alguma tabela deu erro (que não seja de rede), essa parte
    // mantém o que já estava salvo antes, em vez de impedir todo o cache.
    let toCache = fresh;
    if (results.some((r) => r.error)) {
      const prev = (await cacheGet(`data:${companyId}`))?.value;
      const keyOf = ["customers", "customers", "services", "orders", "expenses", "products", "serviceProducts", "team", "categoryPrices", "vehicleInspections"];
      toCache = { ...fresh };
      results.forEach((r, i) => {
        if (r.error && prev) {
          toCache[keyOf[i]] = prev[keyOf[i]] || [];
        }
      });
    }
    await cacheSet(`data:${companyId}`, toCache);
    // Alterações feitas offline que ainda não subiram continuam aparecendo na tela
    return applyQueue(fresh, await getQueue());
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await cacheGet(`data:${companyId}`);
      if (cached?.value) {
        return { ...applyQueue(cached.value, await getQueue()), _fromCache: true, _cachedAt: cached.savedAt };
      }
      // sem cópia salva: mesmo comportamento de antes (listas vazias)
      return { ...emptyData(), _fromCache: true, _cachedAt: null };
    }
    throw err;
  }
}

export function subscribeToChanges(companyId, onChange) {
  const channel = supabase
    .channel(`company-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "vehicles", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "service_products", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "service_category_prices", filter: `company_id=eq.${companyId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_inspections", filter: `company_id=eq.${companyId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---- Clientes e veículos ----
export async function createCustomer(companyId, { name, phone, vehicle }) {
  const customer = { id: newId(), company_id: companyId, name, phone };
  await mutate({ type: "insert", table: "customers", row: customer });
  let vehicleId = null;
  if (vehicle?.plate) {
    try {
      const id = newId();
      await mutate({ type: "insert", table: "vehicles", row: { id, company_id: companyId, customer_id: customer.id, ...vehicle } });
      vehicleId = id;
    } catch {
      // como antes: se só o veículo falhar, o cliente continua salvo
    }
  }
  return { ...customer, vehicleId };
}

export async function createVehicle(companyId, customerId, vehicle) {
  await mutate({ type: "insert", table: "vehicles", row: { id: newId(), company_id: companyId, customer_id: customerId, ...vehicle } });
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

export async function updateCustomer(id, { name, phone }) {
  await mutate({ type: "update", table: "customers", id, patch: { name, phone } });
}

export async function updateVehicle(id, { plate, model, color, category }) {
  await mutate({ type: "update", table: "vehicles", id, patch: { plate, model, color, category } });
}

export async function deleteVehicle(id) {
  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) throw error;
}

// ---- Serviços ----
export async function createService(companyId, { name, price }) {
  const { error } = await supabase.from("services").insert({ company_id: companyId, name, price });
  if (error) throw error;
}

export async function updateServicePrice(id, price) {
  const { error } = await supabase.from("services").update({ price }).eq("id", id);
  if (error) throw error;
}

export async function deleteService(id) {
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) throw error;
}

// ---- Pedidos ----
export async function createOrder(companyId, order) {
  const id = order.id || newId();
  await mutate({ type: "insert", table: "orders", row: { ...order, id, company_id: companyId } });
  return id;
}

export async function updateOrderStatus(id, status, extra = {}) {
  await mutate({ type: "update", table: "orders", id, patch: { status, ...extra } });
}

export async function togglePaid(id, paid) {
  await mutate({ type: "update", table: "orders", id, patch: { paid } });
}

export const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "a_faturar", label: "A faturar" },
];

export const VEHICLE_CATEGORIES = [
  { value: "carro", label: "Carro" },
  { value: "moto", label: "Moto" },
  { value: "suv_caminhonete", label: "SUV/Caminhonete" },
];

export function priceForCategory(service, category, categoryPrices) {
  if (category && category !== "carro") {
    const override = (categoryPrices || []).find((cp) => cp.service_id === service.id && cp.category === category);
    if (override) return Number(override.price);
  }
  return Number(service.price);
}

// Calcula o valor do desconto em R$ a partir do subtotal e do tipo escolhido.
// type: "percentual" (0–100) ou "valor" (R$ fixo). Nunca deixa o desconto passar do subtotal.
export function discountAmount(subtotal, type, value) {
  const base = Number(subtotal) || 0;
  const v = Number(value) || 0;
  if (base <= 0 || v <= 0) return 0;
  if (type === "percentual") {
    return Math.min(base, (base * Math.min(v, 100)) / 100);
  }
  return Math.min(base, v);
}

export async function setCategoryPrice(companyId, serviceId, category, price) {
  const { error } = await supabase
    .from("service_category_prices")
    .upsert({ company_id: companyId, service_id: serviceId, category, price }, { onConflict: "service_id,category" });
  if (error) throw error;
}

export async function removeCategoryPrice(id) {
  const { error } = await supabase.from("service_category_prices").delete().eq("id", id);
  if (error) throw error;
}

export async function finalizeDelivery(id, paymentMethod, adjust = {}) {
  const paid = paymentMethod !== "a_faturar";
  await mutate({ type: "update", table: "orders", id, patch: { status: "entregue", payment_method: paymentMethod, paid, ...adjust } });
}

export async function setPaymentMethod(id, paymentMethod) {
  const paid = paymentMethod !== "a_faturar";
  await mutate({ type: "update", table: "orders", id, patch: { payment_method: paymentMethod, paid } });
}

// ---- Vistoria de veículo (checklist de avarias) ----
// O bucket "vistorias" é privado (RLS de storage restringe leitura à própria
// empresa) — por isso guardamos o CAMINHO do arquivo, não uma URL pública.
// Para exibir a foto, gere uma URL assinada com getInspectionPhotoSignedUrls().
export async function uploadInspectionPhoto(companyId, orderId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${companyId}/${orderId || "sem-pedido"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("vistorias").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return path;
}

// Converte uma URL pública antiga (fotos salvas antes do bucket virar
// privado) ou um caminho já "cru" no caminho puro dentro do bucket.
function extractVistoriaPath(urlOrPath) {
  if (!urlOrPath) return null;
  const marker = "/vistorias/";
  const idx = urlOrPath.indexOf(marker);
  return idx !== -1 ? urlOrPath.slice(idx + marker.length) : urlOrPath;
}

// Gera URLs assinadas (temporárias, expiram em 1h por padrão) para exibir
// fotos de vistoria. Funciona tanto com o path novo quanto com URLs públicas
// antigas gravadas antes dessa mudança — não precisa migrar dado nenhum.
export async function getInspectionPhotoSignedUrls(urlsOrPaths, expiresInSeconds = 3600) {
  const paths = (urlsOrPaths || []).map(extractVistoriaPath).filter(Boolean);
  if (!paths.length) return [];
  const results = await Promise.all(
    paths.map((p) => supabase.storage.from("vistorias").createSignedUrl(p, expiresInSeconds))
  );
  return results.map((r) => r.data?.signedUrl).filter(Boolean);
}

// Salva a vistoria. As fotos (photoFiles) ficam guardadas no aparelho e sobem em segundo plano,
// então funciona mesmo sem internet. A vistoria "pulada" não tem fotos.
export async function saveVehicleInspection(companyId, { orderId, vehicleId, userId, status, marks, observations, photoFiles }) {
  const files = photoFiles || [];
  const id = newId();
  const row = {
    id,
    company_id: companyId,
    order_id: orderId || null,
    vehicle_id: vehicleId || null,
    created_by: userId || null,
    status: status || "realizada",
    marks: marks || [],
    observations: observations || null,
  };
  const photoExts = files.map((f) => ((f.name || "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg");
  await mutate({ type: "inspection", id, row, photoCount: files.length, photoExts }, { files });
  return row;
}

export const INSPECTION_MARK_TYPES = [
  { value: "arranhao", label: "Arranhão", color: "#f59e0b" },
  { value: "amassado", label: "Amassado", color: "#f97316" },
  { value: "quebrado", label: "Quebrado/trincado", color: "#e11d48" },
  { value: "outro", label: "Outro", color: "#a855f7" },
];

// ---- Equipe e convites ----
export async function fetchTeam(companyId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, blocked, commission_rate, created_at")
    .eq("company_id", companyId)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function setMemberCommission(id, rate) {
  const { error } = await supabase.from("profiles").update({ commission_rate: rate }).eq("id", id);
  if (error) throw error;
}

export async function setLoyaltyThreshold(companyId, value) {
  const { error } = await supabase.from("companies").update({ loyalty_threshold: value }).eq("id", companyId);
  if (error) throw error;
}

export async function setOverdueDaysThreshold(companyId, value) {
  const { error } = await supabase.from("companies").update({ overdue_days_threshold: value }).eq("id", companyId);
  if (error) throw error;
}

export async function setMemberBlocked(id, blocked) {
  const { error } = await supabase.from("profiles").update({ blocked }).eq("id", id);
  if (error) throw error;
}

export async function removeMember(id) {
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchInvites(companyId) {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createInvite(companyId, email) {
  const { data, error } = await supabase
    .from("invites")
    .insert({ company_id: companyId, email: email || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getInviteInfo(token) {
  const { data, error } = await supabase.rpc("get_invite_info", { p_token: token });
  if (error) throw error;
  return data?.[0] || null;
}

export async function redeemInvite(token, userId, fullName) {
  const { error } = await supabase.rpc("redeem_invite", {
    p_token: token,
    p_user_id: userId,
    p_full_name: fullName || null,
  });
  if (error) throw error;
}

// ---- Despesas ----
export async function createExpense(companyId, { description, amount, expense_date }) {
  await mutate({
    type: "insert",
    table: "expenses",
    row: {
      id: newId(),
      company_id: companyId,
      description,
      amount,
      expense_date: expense_date || localDateStr(),
    },
  });
}

export async function deleteExpense(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

// ---- Estoque ----
export async function createProduct(companyId, { name, unit, quantity, min_quantity }) {
  const { error } = await supabase.from("products").insert({
    company_id: companyId,
    name,
    unit: unit || "un",
    quantity: quantity || 0,
    min_quantity: min_quantity || 0,
  });
  if (error) throw error;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function registerMovement(productId, type, quantity, note) {
  await mutate({ type: "stock", opId: newId(), productId, moveType: type, quantity, note: note || null });
}

export async function fetchMovements(productId) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

// ---- Vínculo produtos x serviços ----
export async function addServiceProduct(companyId, serviceId, productId, quantity) {
  const { error } = await supabase.from("service_products").insert({
    company_id: companyId,
    service_id: serviceId,
    product_id: productId,
    quantity,
  });
  if (error) throw error;
}

export async function removeServiceProduct(id) {
  const { error } = await supabase.from("service_products").delete().eq("id", id);
  if (error) throw error;
}

function combineStockItems(serviceIds, extraProducts, serviceProducts) {
  const doServicos = (serviceProducts || [])
    .filter((sp) => (serviceIds || []).includes(sp.service_id))
    .map((sp) => ({ product_id: sp.product_id, quantity: sp.quantity }));
  const avulsos = (extraProducts || []).map((e) => ({ product_id: e.product_id, quantity: e.quantity }));
  return [...doServicos, ...avulsos];
}

export async function consumeOrderStock(serviceIds, extraProducts, serviceProducts, note) {
  for (const item of combineStockItems(serviceIds, extraProducts, serviceProducts)) {
    await registerMovement(item.product_id, "saida", item.quantity, note);
  }
}

export async function reverseOrderStock(serviceIds, extraProducts, serviceProducts, note) {
  for (const item of combineStockItems(serviceIds, extraProducts, serviceProducts)) {
    await registerMovement(item.product_id, "entrada", item.quantity, note);
  }
}

export async function cancelOrder(order, serviceProducts) {
  // se o pedido já tinha saído da agenda (ou seja, o estoque já foi descontado), estorna
  if (order.status !== "agendado") {
    await reverseOrderStock(order.service_ids, order.extra_products, serviceProducts, "Estorno — pedido cancelado");
  }
  await mutate({ type: "update", table: "orders", id: order.id, patch: { status: "cancelado" } });
}

export async function updateOrderServices(order, updates, serviceProducts) {
  const estoqueJaConsumido = order.status !== "agendado";
  if (estoqueJaConsumido) {
    await reverseOrderStock(order.service_ids, order.extra_products, serviceProducts, "Ajuste — edição de pedido");
  }
  await mutate({ type: "update", table: "orders", id: order.id, patch: updates });
  if (estoqueJaConsumido) {
    await consumeOrderStock(updates.service_ids, updates.extra_products, serviceProducts, "Ajuste — edição de pedido");
  }
}

// ---- Administração da plataforma (multi-empresa) ----
export async function checkIsPlatformAdmin() {
  try {
    const { data, error } = await netCall(() => supabase.rpc("is_platform_admin"), NET_TIMEOUT_MS);
    if (error) throw error;
    await cacheSet("is-admin", !!data);
    return !!data;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await cacheGet("is-admin");
      return !!cached?.value;
    }
    return false;
  }
}

export async function fetchAllCompanies() {
  const { data, error } = await supabase.from("companies").select("id, name, created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchAllOwnerInvites() {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("role", "owner")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function adminCreateCompanyWithOwnerInvite(name, email) {
  const { data: companyId, error: companyError } = await supabase.rpc("admin_create_company", { p_name: name });
  if (companyError) throw companyError;

  const { data: token, error: inviteError } = await supabase.rpc("admin_create_owner_invite", {
    p_company_id: companyId,
    p_email: email || null,
  });
  if (inviteError) throw inviteError;

  return { companyId, token };
}

// ---- Backup ----
export async function exportCompanyBackup(companyId) {
  const [customersRes, vehiclesRes, servicesRes, ordersRes, expensesRes, productsRes, serviceProductsRes, teamRes] = await Promise.all([
    supabase.from("customers").select("*").eq("company_id", companyId),
    supabase.from("vehicles").select("*").eq("company_id", companyId),
    supabase.from("services").select("*").eq("company_id", companyId),
    supabase.from("orders").select("*").eq("company_id", companyId),
    supabase.from("expenses").select("*").eq("company_id", companyId),
    supabase.from("products").select("*").eq("company_id", companyId),
    supabase.from("service_products").select("*").eq("company_id", companyId),
    supabase.from("profiles").select("id, full_name, role, commission_rate, created_at").eq("company_id", companyId),
  ]);
  return {
    exportado_em: new Date().toISOString(),
    clientes: customersRes.data || [],
    veiculos: vehiclesRes.data || [],
    servicos: servicesRes.data || [],
    pedidos: ordersRes.data || [],
    despesas: expensesRes.data || [],
    produtos: productsRes.data || [],
    vinculos_produto_servico: serviceProductsRes.data || [],
    equipe: teamRes.data || [],
  };
}


// ============================================================
// ADICIONE ESTE BLOCO AO FINAL DO SEU src/lib/db.js EXISTENTE
// (não substitua o arquivo, só cole isso no fim)
// ============================================================

export async function getMySubscription() {
  try {
    const { data, error } = await netCall(() => supabase.rpc("my_subscription_status"), NET_TIMEOUT_MS);
    if (error) throw error;
    const result = data?.[0] || null;
    await cacheSet("subscription", result);
    return result;
  } catch (err) {
    if (isNetworkError(err)) {
      // Sem internet: aceita o último status salvo por alguns dias (carência)
      const cached = await cacheGet("subscription");
      if (cached && Date.now() - cached.savedAt <= SUBSCRIPTION_GRACE_MS) return cached.value;
      return { __offlineExpired: true };
    }
    return null;
  }
}

export async function criarLinkAssinatura() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Sessão não encontrada");

  const resp = await fetch("/api/criar-assinatura", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.erro || "Erro ao criar assinatura");
  return data.init_point;
}

// Admin de plataforma: ver assinatura de todas as empresas
export async function fetchAllSubscriptions() {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("company_id, status, trial_fim, proxima_cobranca");
  if (error) throw error;
  return data || [];
}

// Admin de plataforma: liberar/ajustar manualmente (ex: cortesia)
export async function adminSetSubscriptionStatus(companyId, status) {
  const { error } = await supabase.rpc("admin_set_subscription_status", {
    p_company_id: companyId,
    p_status: status,
  });
  if (error) throw error;
}
