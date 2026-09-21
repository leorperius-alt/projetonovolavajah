// api/webhook-mercadopago.js
// Vercel Serverless Function. Fica disponível em: /api/webhook-mercadopago
// Configure essa URL completa no painel do Mercado Pago (Webhooks).

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function mpFetch(path) {
  const resp = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  return resp.json();
}

// Valida o header x-signature conforme a doc oficial do Mercado Pago:
// https://www.mercadopago.com.br/developers/en/docs/order/online-payments/notifications
// manifest = "id:{data.id};request-id:{x-request-id};ts:{ts};"
// v1 = HMAC-SHA256(manifest, MP_WEBHOOK_SECRET) em hex
function isValidSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("MP_WEBHOOK_SECRET não configurado — recusando webhook por segurança.");
    return false;
  }

  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];
  if (!signatureHeader) return false;

  // data.id vem da query string da URL da notificação, não do corpo.
  const dataIdRaw = req.query?.["data.id"];
  if (!dataIdRaw) return false;
  // A doc pede para converter para minúsculas quando o id é alfanumérico.
  const dataId = String(dataIdRaw).toLowerCase();

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  let manifest = `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(v1, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Converte o status da assinatura (preapproval) do Mercado Pago para o status interno.
// Retorna null para estados transitórios (ex.: "pending") que NÃO devem alterar nada —
// antes, qualquer status diferente de "authorized" virava "cancelada" e bloqueava o dono
// logo após ele criar o link de pagamento.
function mapPreapprovalStatus(mpStatus) {
  switch (mpStatus) {
    case "authorized":
      return "ativa";
    case "paused":
      return "atrasada";
    case "cancelled":
    case "canceled":
      return "cancelada";
    default:
      return null;
  }
}

// Usa a data real da próxima cobrança informada pelo Mercado Pago;
// se não vier, cai para "daqui a 1 mês" como antes.
function proximaCobrancaDe(preapproval) {
  const mpDate = preapproval?.next_payment_date ? new Date(preapproval.next_payment_date) : null;
  if (mpDate && !Number.isNaN(mpDate.getTime())) return mpDate.toISOString();
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok"); // MP às vezes testa com GET

  if (!isValidSignature(req)) {
    console.warn("Webhook Mercado Pago recusado: assinatura inválida ou ausente.");
    return res.status(401).send("invalid signature");
  }

  try {
    const { type, data } = req.body || {};

    // ---------------------------------------------------------------
    // Mudança de estado da assinatura (criada, autorizada, pausada, cancelada)
    // ---------------------------------------------------------------
    if (type === "subscription_preapproval" && data?.id) {
      const preapproval = await mpFetch(`/preapproval/${data.id}`);
      const companyId = preapproval.external_reference;
      if (!companyId) return res.status(200).send("ok");

      const novoStatus = mapPreapprovalStatus(preapproval.status);
      if (!novoStatus) {
        console.log(`Preapproval ${data.id} com status "${preapproval.status}" — ignorado (transitório).`);
        return res.status(200).send("ok");
      }

      const { data: atual } = await supabaseAdmin
        .from("subscriptions")
        .select("id, gateway_subscription_id")
        .eq("company_id", companyId)
        .maybeSingle();

      if (!atual) return res.status(200).send("ok");

      // Só uma assinatura AUTORIZADA pode "assumir" a empresa. Pausas/cancelamentos vindos
      // de uma assinatura antiga ou órfã (ex.: link gerado duas vezes) não podem derrubar
      // a assinatura que está valendo.
      const ehAtual = atual.gateway_subscription_id === String(data.id);
      if (novoStatus !== "ativa" && !ehAtual) {
        console.log(`Preapproval ${data.id} (${preapproval.status}) não é a assinatura atual da empresa — ignorado.`);
        return res.status(200).send("ok");
      }

      const update = { status: novoStatus, updated_at: new Date().toISOString() };
      if (novoStatus === "ativa") {
        update.gateway_subscription_id = String(data.id);
        update.proxima_cobranca = proximaCobrancaDe(preapproval);
      }

      await supabaseAdmin.from("subscriptions").update(update).eq("id", atual.id);
    }

    // ---------------------------------------------------------------
    // Pagamento (cobrança mensal aprovada, recusada, etc.)
    // ---------------------------------------------------------------
    if (type === "payment" && data?.id) {
      const payment = await mpFetch(`/v1/payments/${data.id}`);
      const preapprovalId =
        payment.metadata?.preapproval_id || payment.point_of_interaction?.transaction_data?.subscription_id;

      // Busca a assinatura pelo id salvo (preferencial) ou, se faltar, pela referência externa (company_id)
      let subscription = null;
      if (preapprovalId) {
        const { data: found } = await supabaseAdmin
          .from("subscriptions")
          .select("id, company_id, status")
          .eq("gateway_subscription_id", String(preapprovalId))
          .maybeSingle();
        subscription = found || null;
      }
      if (!subscription && payment.external_reference && UUID_RE.test(String(payment.external_reference))) {
        const { data: found } = await supabaseAdmin
          .from("subscriptions")
          .select("id, company_id, status")
          .eq("company_id", payment.external_reference)
          .maybeSingle();
        subscription = found || null;
      }

      if (subscription) {
        // Registra o pagamento sem duplicar: o MP reenvia notificações do mesmo pagamento
        // quando o status muda (ex.: pending -> approved), então atualizamos se já existir.
        const gatewayPaymentId = String(data.id);
        const { data: existente } = await supabaseAdmin
          .from("subscription_payments")
          .select("gateway_payment_id")
          .eq("gateway_payment_id", gatewayPaymentId)
          .maybeSingle();

        const dadosPagamento = {
          valor: payment.transaction_amount,
          status: payment.status,
          payload: payment,
        };

        if (existente) {
          await supabaseAdmin
            .from("subscription_payments")
            .update(dadosPagamento)
            .eq("gateway_payment_id", gatewayPaymentId);
        } else {
          await supabaseAdmin.from("subscription_payments").insert({
            subscription_id: subscription.id,
            gateway_payment_id: gatewayPaymentId,
            ...dadosPagamento,
          });
        }

        if (payment.status === "approved") {
          let proximaCobranca = proximaCobrancaDe(null);
          if (preapprovalId) {
            try {
              proximaCobranca = proximaCobrancaDe(await mpFetch(`/preapproval/${preapprovalId}`));
            } catch (e) {
              console.warn("Não foi possível ler next_payment_date do MP, usando +1 mês:", e);
            }
          }

          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: "ativa",
              proxima_cobranca: proximaCobranca,
              updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.id);
        } else if (payment.status === "rejected" && subscription.status === "ativa") {
          // Cobrança recorrente recusada em assinatura que estava em dia => atrasada.
          // (Recusa da PRIMEIRA cobrança não altera o status: o dono segue no trial/gate.)
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "atrasada", updated_at: new Date().toISOString() })
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
