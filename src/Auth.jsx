import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import ThemeToggle from "./ThemeToggle.jsx";

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupSent, setSignupSent] = useState(false);
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

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    // Em caso de sucesso o navegador é redirecionado para o Google; só voltamos aqui se der erro
    if (error) {
      setLoading(false);
      setError("Não foi possível entrar com o Google. Tente novamente.");
    }
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

  const handleSignup = async () => {
    if (!companyName.trim() || !fullName.trim() || !email.trim()) {
      setError("Preencha o nome da lavagem, seu nome e o e-mail.");
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        // Guardado no usuário; o app cria a empresa + teste de 14 dias no primeiro login
        data: { company_name: companyName.trim(), full_name: fullName.trim() },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message === "User already registered" ? "Este e-mail já está cadastrado. Faça login normalmente." : error.message);
      return;
    }
    // Com confirmação de e-mail ligada, e-mail já cadastrado volta sem identidades
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError("Este e-mail já está cadastrado. Faça login ou use \"Esqueci minha senha\".");
      return;
    }
    // Se a confirmação estiver desligada, já vem com sessão e o App entra sozinho
    if (!data.session) setSignupSent(true);
  };

  const backToLogin = () => {
    setMode("login");
    setForgotSent(false);
    setSignupSent(false);
    setError("");
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <img src="/logo.png" alt="Detalha Pro" className="w-44 h-44 rounded-2xl shadow-sm" />
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
                                 className="mt-2 bg-[#2e3138] hover:bg-[#3a3d45] disabled:opacity-60 text-[#f3ede0] font-medium text-sm py-3 rounded-xl"
                >
                  {loading ? "Aguarde..." : "Enviar link de recuperação"}
                </button>
                <button onClick={backToLogin} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] text-center mt-1">
                  Voltar para o login
                </button>
              </div>
            )
          ) : mode === "signup" ? (
            signupSent ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Quase lá! Enviamos um link de confirmação para <span className="font-semibold">{email}</span>. Abra o e-mail (confira o spam) e clique no link para ativar seus 14 dias de teste grátis.
                </p>
                <button onClick={backToLogin} className="mt-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium text-sm py-3 rounded-xl">
                  Voltar para o login
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--text-secondary)] mb-1">Crie sua conta e teste o Detalha Pro grátis por 14 dias.</p>
                <Field label="Nome da lavagem">
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="input" />
                </Field>
                <Field label="Seu nome">
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
                </Field>
                <Field label="E-mail">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" />
                </Field>
                <Field label="Senha">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" />
                </Field>
                {error && <p className="text-xs text-rose-400">{error}</p>}
                <button
                  disabled={loading}
                  onClick={handleSignup}
                  className="mt-2 bg-[#2e3138] hover:bg-[#3a3d45] disabled:opacity-60 text-[#f3ede0] font-medium text-sm py-3 rounded-xl"
                >
                  {loading ? "Aguarde..." : "Criar conta e testar grátis"}
                </button>

                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-xs text-[var(--text-secondary)]">ou</span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
                <GoogleButton onClick={handleGoogle} disabled={loading} />
                <button onClick={backToLogin} className="text-xs text-[var(--text-secondary)] text-center mt-1">
                  Já tenho conta
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
                     className="mt-2 bg-[#2e3138] hover:bg-[#3a3d45] disabled:opacity-60 text-[#f3ede0] font-medium text-sm py-3 rounded-xl"
              >
                {loading ? "Aguarde..." : "Entrar"}
              </button>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--text-secondary)]">ou</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
              <GoogleButton onClick={handleGoogle} disabled={loading} />
            </div>
          )}
        </div>
        {mode === "login" && (
          <p className="text-xs text-[var(--text-secondary)] text-center mt-4">
            Ainda não tem conta?{" "}
            <button onClick={() => { setMode("signup"); setError(""); }} className="font-semibold text-[var(--text)] underline">
              Teste grátis por 14 dias
            </button>
          </p>
        )}
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

function GoogleButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-zinc-50 disabled:opacity-60 text-zinc-800 border border-zinc-300 font-medium text-sm py-3 rounded-xl"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Continuar com o Google
    </button>
  );
}
