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
    .select("company_id, role, full_name")
    .eq("id", auth.user.id)
    .single();
  if (error) return null;
  return data;
}

export async function fetchAll(companyId) {
  const [customersRes, vehiclesRes, servicesRes, ordersRes, expensesRes] = await Promise.all([
    supabase.from("customers").select("*").eq("company_id", companyId).order("name"),
    supabase.from("vehicles").select("*").eq("company_id", companyId),
    supabase.from("services").select("*").eq("company_id", companyId).order("name"),
    supabase.from("orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("expenses").select("*").eq("company_id", companyId).order("expense_date", { ascending: false }),
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
    .select("id, full_name, role, created_at")
    .eq("company_id", companyId)
    .order("created_at");
  if (error) throw error;
  return data || [];
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
