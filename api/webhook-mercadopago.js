// api/webhook-mercadopago.js
// Vercel Serverless Function. Fica disponível em: /api/webhook-mercadopago
// Configure essa URL completa no painel do Mercado Pago (Webhooks).

import { createClient } from "@supabase/supabase-js";
 
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function mpFetch(path) {
  const resp = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  return resp.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok"); // MP às vezes testa com GET

  try {
    const { type, data } = req.body || {};

    if (type === "subscription_preapproval" && data?.id) {
      const preapproval = await mpFetch(`/preapproval/${data.id}`);
      const companyId = preapproval.external_reference;
      if (!companyId) return res.status(200).send("ok");

      const status = preapproval.status === "authorized" ? "ativa" : "cancelada";
      const proximaCobranca = new Date();
      proximaCobranca.setMonth(proximaCobranca.getMonth() + 1);

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status,
          gateway_subscription_id: data.id,
          proxima_cobranca: proximaCobranca.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);
    }

    if (type === "payment" && data?.id) {
      const payment = await mpFetch(`/v1/payments/${data.id}`);
      const preapprovalId = payment.metadata?.preapproval_id || payment.point_of_interaction?.transaction_data?.subscription_id;

      // Busca a assinatura pelo id salvo (preferencial) ou tenta achar pela referência externa
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, company_id")
        .eq("gateway_subscription_id", preapprovalId)
        .maybeSingle();

      if (subscription) {
        await supabaseAdmin.from("subscription_payments").insert({
          subscription_id: subscription.id,
          gateway_payment_id: String(data.id),
          valor: payment.transaction_amount,
          status: payment.status,
          payload: payment,
        });

        if (payment.status === "approved") {
          const proximaCobranca = new Date();
          proximaCobranca.setMonth(proximaCobranca.getMonth() + 1);

          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: "ativa",
              proxima_cobranca: proximaCobranca.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.id);
        }
      }
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Erro no webhook Mercado Pago:", err);
    return res.status(200).send("ok"); // sempre 200 pro MP não ficar reenviando em loop
  }
}
