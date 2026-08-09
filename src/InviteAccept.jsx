import React, { useEffect, useState } from "react";
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
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Carregando convite...</div>;
  }

  if (info === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="font-semibold text-zinc-200 mb-1">Convite inválido ou já utilizado</p>
          <p className="text-sm text-zinc-400">Peça ao responsável da lavagem para gerar um novo link de convite.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <img src="/logo.png" alt="LavaJá" className="w-32 h-32 rounded-2xl shadow-sm" />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <p className="text-sm text-zinc-400 mb-4">
            Você foi convidado para fazer parte da equipe de <span className="font-semibold">{info.company_name}</span>.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Seu nome"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
            <Field label="E-mail"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" /></Field>
            <Field label="Crie uma senha"><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" /></Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button disabled={loading} onClick={accept} className="mt-2 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl">
              {loading ? "Aguarde..." : "Entrar na equipe"}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .input { width: 100%; padding: 0.6rem 0.75rem; border-radius: 0.6rem; border: 1px solid #3f3f46; background-color: #18181b; color: #f4f4f5; font-size: 0.875rem; outline: none; }
        .input::placeholder { color: #71717a; }
        .input:focus { box-shadow: 0 0 0 2px #71717a; border-color: #71717a; }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-zinc-400 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
