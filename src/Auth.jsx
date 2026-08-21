import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import ThemeToggle from "./ThemeToggle.jsx";

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError("E-mail ou senha incorretos.");
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Digite seu e-mail.");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForgotSent(true);
  };

  const backToLogin = () => {
    setMode("login");
    setForgotSent(false);
    setError("");
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <img src="/logo.png" alt="LavaJá" className="w-44 h-44 rounded-2xl shadow-sm" />
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          {mode === "forgot" ? (
            forgotSent ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Se existir uma conta com o e-mail <span className="font-semibold">{email}</span>, enviamos um link pra você criar uma senha nova. Confira sua caixa de entrada (e o spam).
                </p>
                <button onClick={backToLogin} className="mt-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium text-sm py-3 rounded-xl">
                  Voltar para o login
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--text-secondary)] mb-1">Digite seu e-mail e mandamos um link pra você criar uma senha nova.</p>
                <Field label="E-mail">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" />
                </Field>
                {error && <p className="text-xs text-rose-400">{error}</p>}
                <button
                  disabled={loading}
                  onClick={handleForgotPassword}
                  className="mt-2 bg-zinc-500 hover:bg-zinc-400 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl"
                >
                  {loading ? "Aguarde..." : "Enviar link de recuperação"}
                </button>
                <button onClick={backToLogin} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] text-center mt-1">
                  Voltar para o login
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-3">
              <Field label="E-mail">
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" />
              </Field>
              <Field label="Senha">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" />
              </Field>

              <button onClick={() => { setMode("forgot"); setError(""); }} className="text-xs text-[var(--text)] hover:text-[var(--text)] text-right -mt-1">
                Esqueci minha senha
              </button>

              {error && <p className="text-xs text-rose-400">{error}</p>}

              <button
                disabled={loading}
                onClick={handleLogin}
                className="mt-2 bg-zinc-500 hover:bg-zinc-400 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl"
              >
                {loading ? "Aguarde..." : "Entrar"}
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-[var(--text-secondary)] text-center mt-4">
          Ainda não tem conta? Peça um link de acesso pra quem administra o LavaJá.
        </p>
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
