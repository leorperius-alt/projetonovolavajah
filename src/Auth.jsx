import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
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
    else onAuthed();
  };

  const handleSignup = async () => {
    if (!companyName.trim() || !name.trim() || !email.trim() || password.length < 6) {
      setError("Preencha todos os campos (senha com pelo menos 6 caracteres).");
      return;
    }
    setLoading(true);
    setError("");

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setLoading(false);
      setError(signUpError.message === "User already registered" ? "Este e-mail já está cadastrado." : signUpError.message);
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      setLoading(false);
      setError("Verifique seu e-mail para confirmar o cadastro e depois faça login.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("create_company", {
      p_name: companyName.trim(),
      p_full_name: name.trim(),
    });

    setLoading(false);
    if (rpcError) {
      setError("Erro ao criar empresa: " + rpcError.message);
      return;
    }
    onAuthed();
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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <img src="/logo.png" alt="LavaJá" className="w-44 h-44 rounded-2xl shadow-sm" />
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          {mode !== "forgot" && (
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setMode("login")}
                className={`flex-1 text-sm font-medium py-2 rounded-lg ${mode === "login" ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-400"}`}
              >
                Entrar
              </button>
              <button
                onClick={() => setMode("signup")}
                className={`flex-1 text-sm font-medium py-2 rounded-lg ${mode === "signup" ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-400"}`}
              >
                Criar empresa
              </button>
            </div>
          )}

          {mode === "forgot" ? (
            forgotSent ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-zinc-400">
                  Se existir uma conta com o e-mail <span className="font-semibold">{email}</span>, enviamos um link pra você criar uma senha nova. Confira sua caixa de entrada (e o spam).
                </p>
                <button onClick={backToLogin} className="mt-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm py-3 rounded-xl">
                  Voltar para o login
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-zinc-400 mb-1">Digite seu e-mail e mandamos um link pra você criar uma senha nova.</p>
                <Field label="E-mail">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" />
                </Field>
                {error && <p className="text-xs text-rose-400">{error}</p>}
                <button
                  disabled={loading}
                  onClick={handleForgotPassword}
                  className="mt-2 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl"
                >
                  {loading ? "Aguarde..." : "Enviar link de recuperação"}
                </button>
                <button onClick={backToLogin} className="text-xs text-zinc-400 hover:text-zinc-300 text-center mt-1">
                  Voltar para o login
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-3">
              {mode === "signup" && (
                <>
                  <Field label="Nome da sua lavagem">
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="input" placeholder="Ex: Lava-rápido do João" />
                  </Field>
                  <Field label="Seu nome">
                    <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
                  </Field>
                </>
              )}
              <Field label="E-mail">
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" />
              </Field>
              <Field label="Senha">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" />
              </Field>

              {mode === "login" && (
                <button onClick={() => { setMode("forgot"); setError(""); }} className="text-xs text-zinc-200 hover:text-zinc-100 text-right -mt-1">
                  Esqueci minha senha
                </button>
              )}

              {error && <p className="text-xs text-rose-400">{error}</p>}

              <button
                disabled={loading}
                onClick={mode === "login" ? handleLogin : handleSignup}
                className="mt-2 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl"
              >
                {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar minha empresa"}
              </button>
            </div>
          )}
        </div>
        {mode === "signup" && (
          <p className="text-xs text-zinc-500 text-center mt-4">
            Depois de criar a empresa, convide seus funcionários pela aba Equipe do painel.
          </p>
        )}
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
