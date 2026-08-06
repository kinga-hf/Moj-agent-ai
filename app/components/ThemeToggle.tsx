"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem("lexai-theme") as Theme | null;
    const initialTheme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.dataset.theme = initialTheme;
    setTheme(initialTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("lexai-theme", nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button aria-label={theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw"} className="theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Jasny motyw" : "Ciemny motyw"} type="button">
      <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
      <span>{theme === "dark" ? "Jasny motyw" : "Ciemny motyw"}</span>
    </button>
  );
}
