import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import ThemeToggle from "./ThemeToggle.jsx";
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
    return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center text-[var(--text-secondary)]">Carregando convite...</div>;
  }

  if (info === null) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="font-semibold text-[var(--text)] mb-1">Convite inválido ou já utilizado</p>
          <p className="text-sm text-[var(--text-secondary)]">Peça ao responsável da lavagem para gerar um novo link de convite.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <img src="/logo.png" alt="LavaJá" className="w-32 h-32 rounded-2xl shadow-sm" />
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Você foi convidado para fazer parte da equipe de <span className="font-semibold">{info.company_name}</span>.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Seu nome"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
            <Field label="E-mail"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" /></Field>
            <Field label="Crie uma senha"><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" /></Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button disabled={loading} onClick={accept} className="mt-2 bg-zinc-500 hover:bg-zinc-400 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl">
              {loading ? "Aguarde..." : "Entrar na equipe"}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .input { width: 100%; padding: 0.85rem 0.9rem; border-radius: 0.7rem; border: 1px solid var(--border); background-color: var(--surface); color: var(--text); font-size: 1rem; outline: none; }
        .input::placeholder { color: var(--text-muted); }
        .input:focus { box-shadow: 0 0 0 2px var(--text-muted); border-color: var(--text-muted); }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">{label}</label>
      {children}
    </div>
  );
}
