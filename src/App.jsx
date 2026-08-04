import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import LavaJaApp from "./LavaJaApp.jsx";
import InviteAccept from "./InviteAccept.jsx";
import { SpeedInsights } from "@vercel/speed-insights/react";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando, null = deslogado
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get("convite"));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (inviteToken) {
    return (
      <>
        <InviteAccept
          token={inviteToken}
          onDone={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("convite");
            window.history.replaceState({}, "", url.toString());
            setInviteToken(null);
          }}
        />
        <SpeedInsights />
      </>
    );
  }

  if (session === undefined) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center text-stone-400">Carregando...</div>
        <SpeedInsights />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Auth onAuthed={() => {}} />
        <SpeedInsights />
      </>
    );
  }

  return (
    <>
      <LavaJaApp onLogout={() => supabase.auth.signOut()} />
      <SpeedInsights />
    </>
  );
}
