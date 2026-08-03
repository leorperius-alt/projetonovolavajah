import React, { useEffect, useState } from "react";
import { Droplets } from "lucide-react";
import { supabase } from "./supabaseClient";
import * as db from "./lib/db";

export default function InviteAccept({ token, onDone }) {
  const [info, setInfo] = useState(undefined); // undefined = carregando, null = inválido
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await db.getInviteInfo(token);
        if (!data || !data.valid) {
          setInfo(null);
        } else {
          setInfo(data);
          setEmail(data.email || "");
        }
      } catch (e) {
        setInfo(null);
      }
    })();
  }, [token]);

  const accept = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError("Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    setError("");

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setLoading(false);
      setError(signUpError.message === "User already registered" ? "Este e-mail já está cadastrado. Faça login normalmente." : signUpError.message);
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      setLoading(false);
      setError("Verifique seu e-mail para confirmar o cadastro e depois abra este link de convite novamente.");
      return;
    }

    try {
      await db.redeemInvite(token, userId, name.trim());
    } catch (e) {
      setLoading(false);
      setError("Não foi possível confirmar o convite: " + e.message);
      return;
    }

    setLoading(false);
    onDone();
  };

  if (info === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-stone-400">Carregando convite...</div>;
  }

  if (info === null) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="font-semibold text-stone-800 mb-1">Convite inválido ou já utilizado</p>
          <p className="text-sm text-stone-500">Peça ao responsável da lavagem para gerar um novo link de convite.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Droplets size={28} className="text-orange-500" />
          <span className="font-semibold text-xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>LavaJá</span>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <p className="text-sm text-stone-600 mb-4">
            Você foi convidado para fazer parte da equipe de <span className="font-semibold">{info.company_name}</span>.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Seu nome"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
            <Field label="E-mail"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" /></Field>
            <Field label="Crie uma senha"><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" /></Field>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button disabled={loading} onClick={accept} className="mt-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl">
              {loading ? "Aguarde..." : "Entrar na equipe"}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .input { width: 100%; padding: 0.6rem 0.75rem; border-radius: 0.6rem; border: 1px solid #e7e5e4; font-size: 0.875rem; outline: none; }
        .input:focus { box-shadow: 0 0 0 2px #059669; border-color: #059669; }
      `}</style>
    </div>
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
