import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ variant = "auto", className = "" }) {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("lavaja-theme", next ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next ? "#18181b" : "#ffffff");
  };

  const style =
    variant === "dark"
      ? "bg-zinc-700 hover:bg-zinc-600 text-white"
      : "bg-[var(--surface)] hover:opacity-80 text-[var(--text)] border border-[var(--border)]";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      className={`p-2 rounded-lg transition ${style} ${className}`}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
