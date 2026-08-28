import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import ThemeToggle from "./ThemeToggle.jsx";

export default function MfaChallenge({ onVerified, onLogout }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.find((f) => f.status === "verified");
      setFactorId(totp?.id || null);
    })();
  }, []);

  const verificar = async () => {
    if (!factorId || code.length < 6) return;
    setLoading(true);
    setError("");
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setLoading(false);
      setError(challengeError.message);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    setLoading(false);
    if (verifyError) {
      setError("Código incorreto. Tente novamente.");
      return;
    }
    onVerified();
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <img src="/logo.png" alt="LavaJá" className="w-32 h-32 rounded-2xl shadow-sm" />
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <p className="text-sm text-[var(--text-secondary)] mb-4">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="input text-center tracking-[0.5em] text-xl"
            maxLength={6}
            autoFocus
          />
          {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
          <button
            disabled={loading || code.length < 6}
            onClick={verificar}
            className="mt-4 w-full bg-zinc-500 hover:bg-zinc-400 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl"
          >
            {loading ? "Verificando..." : "Verificar"}
          </button>
          <button onClick={onLogout} className="mt-3 w-full text-xs text-[var(--text-secondary)] text-center">
            Sair e entrar com outra conta
          </button>
        </div>
      </div>
      <style>{`
        .input { width: 100%; padding: 0.85rem 0.9rem; border-radius: 0.7rem; border: 1px solid var(--border); background-color: var(--surface); color: var(--text); font-size: 1rem; outline: none; }
        .input:focus { box-shadow: 0 0 0 2px var(--text-muted); border-color: var(--text-muted); }
      `}</style>
    </div>
  );
}
