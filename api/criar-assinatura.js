// api/criar-assinatura.js
// Vercel Serverless Function. Fica disponível em: /api/criar-assinatura
// Chamada pelo frontend quando o dono clica em "Assinar agora".

import { createClient } from "@supabase/supabase-js";
 
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  // 1) Valida quem está chamando, usando o token do usuário logado
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
    .select("id, plan_price")
    .eq("company_id", profile.company_id)
    .single();

  if (subError || !subscription) {
    return res.status(404).json({ erro: "Assinatura não encontrada para essa empresa" });
  }

  // 4) Cria a assinatura recorrente no Mercado Pago
  try {
    const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        reason: "Assinatura LavaJá",
        external_reference: profile.company_id,
        payer_email: userData.user.email,
        back_url: `${process.env.APP_URL}/`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: Number(subscription.plan_price),
          currency_id: "BRL",
        },
        status: "pending",
      }),
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Erro Mercado Pago:", mpData);
      return res.status(502).json({ erro: "Falha ao criar assinatura no Mercado Pago" });
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({ gateway_subscription_id: mpData.id, updated_at: new Date().toISOString() })
      .eq("id", subscription.id);

    return res.status(200).json({ init_point: mpData.init_point });
  } catch (err) {
    console.error("Erro inesperado:", err);
    return res.status(500).json({ erro: "Erro interno ao criar assinatura" });
  }
}
