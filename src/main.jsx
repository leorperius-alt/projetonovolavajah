import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initSentry, SentryErrorBoundary } from "./sentry.js";

initSentry();

function ErrorFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 16, fontFamily: "Inter, sans-serif", textAlign: "center" }}>
      <p style={{ fontWeight: 600, fontSize: 16 }}>Algo deu errado.</p>
      <p style={{ fontSize: 14, color: "#71717a", maxWidth: 320 }}>
        Já fomos avisados automaticamente. Tenta recarregar a página.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ marginTop: 8, background: "#52525b", color: "#fff", border: "none", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
      >
        Recarregar
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </SentryErrorBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
