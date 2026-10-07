import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import LavaJaApp from "./LavaJaApp.jsx";
import InviteAccept from "./InviteAccept.jsx";
import ResetPassword from "./ResetPassword.jsx";
import MfaChallenge from "./MfaChallenge.jsx";
import SubscriptionGate from "./SubscriptionGate.jsx";
import * as db from "./lib/db";
import { setSentryUser } from "./sentry.js";
import { getSyncStatus, refreshSyncStatus, syncNow } from "./lib/syncQueue";
import { cacheGet, cacheSet, clearOfflineData, getIdentity, isNetworkError, setIdentity } from "./lib/offline";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando, null = deslogado
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get("convite"));
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [checkingMfa, setCheckingMfa] = useState(true);
  const [subscription, setSubscription] = useState(undefined); // undefined = carregando, null = n/a (ex: admin sem empresa)
  const [signupError, setSignupError] = useState(""); // falha ao criar a empresa do cadastro autônomo

  useEffect(() => {
    // Sessão local. Se o token venceu e não há internet, entra com a identidade salva
    // (só para ler os dados em cache; qualquer chamada ao servidor continua exigindo rede).
    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data.session) {
        setIdentity(data.session.user);
        setSession(data.session);
        return;
      }
      const ident = getIdentity();
      if (ident && (navigator.onLine === false || isNetworkError(error))) {
        setSession({ user: { id: ident.id, email: ident.email }, offline: true });
        return;
      }
      setSession(null);
    };
    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
      if (newSession?.user) {
        setIdentity(newSession.user);
        setSession(newSession);
        return;
      }
      // Sem sessão por falta de internet (não é logout de verdade): mantém o modo offline
      if (event !== "SIGNED_OUT" && getIdentity() && navigator.onLine === false) return;
      setSession(newSession);
    });

    // Voltou a internet: tenta recuperar a sessão real
    window.addEventListener("online", loadSession);
    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("online", loadSession);
    };
  }, []);

  useEffect(() => {
    if (session?.user) {
      setSentryUser({ id: session.user.id, email: session.user.email });
    } else if (session === null) {
      setSentryUser(null);
    }
  }, [session]);

  useEffect(() => {
    (async () => {
      if (!session) {
        setNeedsMfa(false);
        setCheckingMfa(false);
        return;
      }
      setCheckingMfa(true);
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;
        const needs = data?.currentLevel === "aal1" && data?.nextLevel === "aal2";
        setNeedsMfa(needs);
        await cacheSet("mfa-ok", !needs);
      } catch (err) {
        // Sem internet: só dispensa o 2FA se ele já foi confirmado antes neste aparelho
        const cached = await cacheGet("mfa-ok");
        setNeedsMfa(!(cached?.value === true));
      }
      setCheckingMfa(false);
    })();
  }, [session]);

  // Verifica o status da assinatura da empresa assim que o usuário loga
  useEffect(() => {
    (async () => {
      if (!session?.user) {
        setSubscription(undefined);
        return;
      }
      let result = await db.getMySubscription();

      // Cadastro autônomo: usuário recém-confirmado ainda não tem empresa.
      // Cria empresa + perfil de dono + teste de 14 dias (função idempotente no banco).
      const meta = session.user?.user_metadata;
      if (result === null && !session.offline && meta?.company_name) {
        const { error } = await supabase.rpc("signup_company", {
          p_company_name: meta.company_name,
          p_full_name: meta.full_name || null,
        });
        if (error) {
          console.error("signup_company falhou:", error);
          setSignupError(error.message || "Erro desconhecido");
        } else {
          setSignupError("");
          result = await db.getMySubscription();
        }
      }

      setSubscription(result); // null quando o usuário não tem empresa (ex: admin de plataforma)
    })();
  }, [session]);

  // Logout apaga a cópia offline deste aparelho (dados de cada empresa ficam isolados)
  const handleLogout = async () => {
    // Antes de sair, tenta enviar o que ficou pendente; se não der, avisa que vai perder
    await syncNow();
    await refreshSyncStatus();
    const pending = getSyncStatus().pending;
    if (pending > 0) {
      const ok = window.confirm(
        `Há ${pending} alteração(ões) que ainda não foram enviadas por falta de internet. Se sair agora, elas serão perdidas. Sair mesmo assim?`
      );
      if (!ok) return;
    }
    await clearOfflineData();
    try {
      await supabase.auth.signOut({ scope: navigator.onLine === false ? "local" : "global" });
    } catch {
      // segue: a sessão local é descartada abaixo
    }
    setSession(null);
  };

  if (passwordRecovery) {
    return (
      <ResetPassword
        onDone={() => {
          const url = new URL(window.location.href);
          url.hash = "";
          window.history.replaceState({}, "", url.toString());
          setPasswordRecovery(false);
        }}
      />
    );
  }

  if (inviteToken) {
    return (
      <InviteAccept
        token={inviteToken}
        onDone={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("convite");
          window.history.replaceState({}, "", url.toString());
          setInviteToken(null);
        }}
      />
    );
  }

  if (session === undefined || (session && checkingMfa)) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Carregando...</div>;
  }

  if (!session) {
    return <Auth onAuthed={() => {}} />;
  }

  if (needsMfa) {
    return <MfaChallenge onVerified={() => setNeedsMfa(false)} onLogout={handleLogout} />;
  }

  // Ainda buscando o status da assinatura
  if (subscription === undefined) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Carregando...</div>;
  }

  // Cadastro novo cuja empresa não pôde ser criada: mostra o motivo em vez de entrar num app vazio
  if (signupError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="font-medium">Não foi possível criar sua conta</p>
        <p className="text-sm text-zinc-400 max-w-sm">Tente novamente. Se o problema continuar, envie esta mensagem ao suporte:</p>
        <p className="text-xs text-rose-400 max-w-sm break-words">{signupError}</p>
        <button onClick={() => window.location.reload()} className="mt-2 bg-zinc-600 hover:bg-zinc-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl">
          Tentar novamente
        </button>
        <button onClick={handleLogout} className="text-xs text-zinc-400 mt-1">Sair</button>
      </div>
    );
  }

  // Ficou tempo demais sem internet para confirmar a assinatura
  if (subscription?.__offlineExpired) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="font-medium">Conecte-se à internet</p>
        <p className="text-sm text-zinc-400 max-w-sm">
          Faz alguns dias que o app não consegue confirmar sua assinatura. Conecte-se à internet para continuar.
        </p>
        <button onClick={() => window.location.reload()} className="mt-2 bg-zinc-600 hover:bg-zinc-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl">
          Tentar novamente
        </button>
        <button onClick={handleLogout} className="text-xs text-zinc-400 mt-1">Sair</button>
      </div>
    );
  }

  // Bloqueia se trial acabou, pagamento atrasou ou foi cancelado
  const statusBloqueado = ["expirada", "atrasada", "cancelada"].includes(subscription?.status);
  if (statusBloqueado) {
    return <SubscriptionGate status={subscription.status} onLogout={handleLogout} />;
  }

  return <LavaJaApp onLogout={handleLogout} />;
}
