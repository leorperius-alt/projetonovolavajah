import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <img src="/logo.png" alt="LavaJá" className="w-28 h-28 rounded-2xl shadow-sm" />
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 text-sm font-medium py-2 rounded-lg ${mode === "login" ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-600"}`}
            >
              Entrar
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 text-sm font-medium py-2 rounded-lg ${mode === "signup" ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-600"}`}
            >
              Criar empresa
            </button>
          </div>

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

            {error && <p className="text-xs text-rose-600">{error}</p>}

            <button
              disabled={loading}
              onClick={mode === "login" ? handleLogin : handleSignup}
              className="mt-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl"
            >
              {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar minha empresa"}
            </button>
          </div>
        </div>
        {mode === "signup" && (
          <p className="text-xs text-stone-400 text-center mt-4">
            Depois de criar a empresa, convide seus funcionários pedindo pra eles criarem login e você vinculando o company_id — veja o README.
          </p>
        )}
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
