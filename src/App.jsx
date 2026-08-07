import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import LavaJaApp from "./LavaJaApp.jsx";
import InviteAccept from "./InviteAccept.jsx";
import ResetPassword from "./ResetPassword.jsx";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando, null = deslogado
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get("convite"));
  const [passwordRecovery, setPasswordRecovery] = useState(false);

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

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-stone-400">Carregando...</div>;
  }

  if (!session) {
    return <Auth onAuthed={() => {}} />;
  }

  return <LavaJaApp onLogout={() => supabase.auth.signOut()} />;
}
