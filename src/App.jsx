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

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando, null = deslogado
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get("convite"));
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [checkingMfa, setCheckingMfa] = useState(true);
  const [subscription, setSubscription] = useState(undefined); // undefined = carregando, null = n/a (ex: admin sem empresa)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
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
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setNeedsMfa(data?.currentLevel === "aal1" && data?.nextLevel === "aal2");
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
      const result = await db.getMySubscription();
      setSubscription(result); // null quando o usuário não tem empresa (ex: admin de plataforma)
    })();
  }, [session]);

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
    return <MfaChallenge onVerified={() => setNeedsMfa(false)} onLogout={() => supabase.auth.signOut()} />;
  }

  // Ainda buscando o status da assinatura
  if (subscription === undefined) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Carregando...</div>;
  }

  // Bloqueia se trial acabou, pagamento atrasou ou foi cancelado
  const statusBloqueado = ["expirada", "atrasada", "cancelada"].includes(subscription?.status);
  if (statusBloqueado) {
    return <SubscriptionGate status={subscription.status} onLogout={() => supabase.auth.signOut()} />;
  }

  return <LavaJaApp onLogout={() => supabase.auth.signOut()} />;
}
