// api/cancelar-assinatura.js
// Vercel Serverless Function. Fica disponível em: /api/cancelar-assinatura
// Chamada pelo frontend quando o dono clica em "Cancelar assinatura".

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  // 1) Valida quem está chamando
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ erro: "Não autenticado" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ erro: "Sessão inválida" });
  }

  // 2) Busca o perfil e a empresa desse usuário
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("company_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.company_id) {
    return res.status(400).json({ erro: "Usuário sem empresa vinculada" });
  }
  if (profile.role !== "owner") {
    return res.status(403).json({ erro: "Só o dono pode gerenciar a assinatura" });
  }

  // 3) Busca a assinatura atual da empresa
  const { data: subscription, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, gateway_subscription_id")
    .eq("company_id", profile.company_id)
    .single();

  if (subError || !subscription) {
    return res.status(404).json({ erro: "Assinatura não encontrada para essa empresa" });
  }

  if (!["ativa", "atrasada"].includes(subscription.status)) {
    return res.status(400).json({ erro: "Não há assinatura ativa para cancelar" });
  }

  if (!subscription.gateway_subscription_id) {
    // Não deveria acontecer (status ativa/atrasada sem id do MP), mas por segurança
    // não deixa a empresa travada: cancela localmente mesmo assim.
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("id", subscription.id);
    return res.status(200).json({ ok: true });
  }

  try {
    // 4) Cancela no Mercado Pago
    const mpResp = await fetch(`https://api.mercadopago.com/preapproval/${subscription.gateway_subscription_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const mpData = await mpResp.json();

    // Se o MP já não conhece mais essa assinatura (404) trata como já cancelada
    // em vez de travar o dono numa assinatura "ativa" que não existe mais no gateway.
    if (!mpResp.ok && mpResp.status !== 404) {
      console.error("Erro Mercado Pago ao cancelar:", mpData);
      return res.status(502).json({ erro: "Falha ao cancelar no Mercado Pago" });
    }

    // 5) Atualiza localmente. O webhook também vai receber essa mudança e
    // confirmar o mesmo status — essa atualização aqui é só pra não deixar
    // o dono esperando a notificação assíncrona pra ver a tela mudar.
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("id", subscription.id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erro inesperado ao cancelar:", err);
    return res.status(500).json({ erro: "Erro interno ao cancelar assinatura" });
  }
}
