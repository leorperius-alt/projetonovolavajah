import React, { useState } from "react";
import { CreditCard, LogOut } from "lucide-react";
import * as db from "./lib/db";

// Tela mostrada quando o trial acabou ou o pagamento está atrasado/cancelado.
// Bloqueia o acesso ao painel até a assinatura ficar ativa de novo.
export default function SubscriptionGate({ status, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const assinar = async () => {
    setLoading(true);
    setErro("");
    try {
      const link = await db.criarLinkAssinatura();
      window.location.href = link;
    } catch (e) {
      setErro(e.message || "Não foi possível gerar o link de pagamento");
      setLoading(false);
    }
  };

  const mensagens = {
    expirada: "Seu período de teste gratuito acabou.",
    atrasada: "Identificamos um atraso no pagamento da sua assinatura.",
    cancelada: "Sua assinatura está cancelada.",
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full text-center">
        <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <CreditCard size={22} className="text-amber-400" />
        </div>
        <h1 className="text-lg font-semibold text-zinc-100 mb-1">Assinatura necessária</h1>
        <p className="text-sm text-zinc-400 mb-5">
          {mensagens[status] || "Sua assinatura precisa ser regularizada para continuar usando o LavaJá."}
        </p>

        <button
          onClick={assinar}
          disabled={loading}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg mb-2"
        >
          {loading ? "Gerando link..." : "Assinar agora"}
        </button>

        {erro && <p className="text-xs text-rose-400 mb-2">{erro}</p>}

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs py-2"
        >
          <LogOut size={13} /> Sair
        </button>
      </div>
    </div>
  );
}
