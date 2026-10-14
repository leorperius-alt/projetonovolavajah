import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import ThemeToggle from "./ThemeToggle.jsx";

// Primeiro acesso com Google: o Google não informa o nome da lavagem,
// então pedimos aqui e criamos empresa + perfil de dono + teste de 14 dias.
export default function CompleteSignup({ defaultName, onDone, onLogout }) {
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState(defaultName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!companyName.trim() || !fullName.trim()) {
      setError("Preencha o nome da lavagem e o seu nome.");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await supabase.rpc("signup_company", {
      p_company_name: companyName.trim(),
      p_full_name: fullName.trim(),
    });
    if (error) {
      setLoading(false);
      setError(error.message || "Não foi possível criar sua conta.");
      return;
    }
    await onDone();
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <img src="/logo.png" alt="Detalha Pro" className="w-32 h-32 rounded-2xl shadow-sm" />
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-3">
          <p className="text-sm text-[var(--text-secondary)] mb-1">
            Quase lá! Só mais um passo para ativar seus 14 dias de teste grátis.
          </p>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">Nome da lavagem</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">Seu nome</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button
            disabled={loading}
            onClick={submit}
            className="mt-2 bg-[#2e3138] hover:bg-[#3a3d45] disabled:opacity-60 text-[#f3ede0] font-medium text-sm py-3 rounded-xl"
          >
            {loading ? "Aguarde..." : "Começar o teste grátis"}
          </button>
          <button onClick={onLogout} className="text-xs text-[var(--text-secondary)] text-center mt-1">
            Sair
          </button>
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
