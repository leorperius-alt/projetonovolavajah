import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não são iguais.");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <img src="/logo.png" alt="LavaJá" className="w-44 h-44 rounded-2xl shadow-sm" />
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <p className="text-sm text-stone-600 mb-4">Crie uma nova senha para sua conta.</p>
          <div className="flex flex-col gap-3">
            <Field label="Nova senha">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" />
            </Field>
            <Field label="Confirme a nova senha">
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" className="input" />
            </Field>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              disabled={loading}
              onClick={save}
              className="mt-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-xl"
            >
              {loading ? "Aguarde..." : "Salvar nova senha"}
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
