import { supabase } from "../supabaseClient";

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
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("company_id, role, full_name, blocked")
    .eq("id", auth.user.id)
    .single();
  if (error) return null;
  return data;
}

export function subscribeToMyProfile(userId, onChange) {
  const channel = supabase
    .channel(`profile-${userId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function fetchAll(companyId) {
  const [customersRes, vehiclesRes, servicesRes, ordersRes, expensesRes, productsRes, serviceProductsRes, teamRes] = await Promise.all([
    supabase.from("customers").select("*").eq("company_id", companyId).order("name"),
    supabase.from("vehicles").select("*").eq("company_id", companyId),
    supabase.from("services").select("*").eq("company_id", companyId).order("name"),
    supabase.from("orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("expenses").select("*").eq("company_id", companyId).order("expense_date", { ascending: false }),
    supabase.from("products").select("*").eq("company_id", companyId).order("name"),
    supabase.from("service_products").select("*").eq("company_id", companyId),
    supabase.from("profiles").select("id, full_name, role, commission_rate, blocked").eq("company_id", companyId).order("full_name"),
  ]);

  const vehiclesByCustomer = {};
  (vehiclesRes.data || []).forEach((v) => {
    vehiclesByCustomer[v.customer_id] = vehiclesByCustomer[v.customer_id] || [];
    vehiclesByCustomer[v.customer_id].push(v);
  });

  const customers = (customersRes.data || []).map((c) => ({
    ...c,
    vehicles: vehiclesByCustomer[c.id] || [],
  }));

  return {
    customers,
    services: servicesRes.data || [],
    orders: ordersRes.data || [],
    expenses: expensesRes.data || [],
    products: productsRes.data || [],
    serviceProducts: serviceProductsRes.data || [],
    team: teamRes.data || [],
  };
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
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---- Clientes e veículos ----
export async function createCustomer(companyId, { name, phone, vehicle }) {
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({ company_id: companyId, name, phone })
    .select()
    .single();
  if (error) throw error;
  if (vehicle?.plate) {
    await supabase.from("vehicles").insert({ company_id: companyId, customer_id: customer.id, ...vehicle });
  }
  return customer;
}

export async function createVehicle(companyId, customerId, vehicle) {
  const { error } = await supabase.from("vehicles").insert({ company_id: companyId, customer_id: customerId, ...vehicle });
  if (error) throw error;
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
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
  const { error } = await supabase.from("orders").insert({ company_id: companyId, ...order });
  if (error) throw error;
}

export async function updateOrderStatus(id, status, extra = {}) {
  const { error } = await supabase.from("orders").update({ status, ...extra }).eq("id", id);
  if (error) throw error;
}

export async function togglePaid(id, paid) {
  const { error } = await supabase.from("orders").update({ paid }).eq("id", id);
  if (error) throw error;
}

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
  const { error } = await supabase.from("expenses").insert({
    company_id: companyId,
    description,
    amount,
    expense_date: expense_date || new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
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
  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: productId,
    p_type: type,
    p_quantity: quantity,
    p_note: note || null,
  });
  if (error) throw error;
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
  const { error } = await supabase.from("orders").update({ status: "cancelado" }).eq("id", order.id);
  if (error) throw error;
}

export async function updateOrderServices(order, updates, serviceProducts) {
  const estoqueJaConsumido = order.status !== "agendado";
  if (estoqueJaConsumido) {
    await reverseOrderStock(order.service_ids, order.extra_products, serviceProducts, "Ajuste — edição de pedido");
  }
  const { error } = await supabase.from("orders").update(updates).eq("id", order.id);
  if (error) throw error;
  if (estoqueJaConsumido) {
    await consumeOrderStock(updates.service_ids, updates.extra_products, serviceProducts, "Ajuste — edição de pedido");
  }
}
