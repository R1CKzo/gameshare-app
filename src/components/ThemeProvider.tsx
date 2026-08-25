"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "gameshare-theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Escuro sempre foi a unica opcao do app — continua sendo o padrao pra
// quem nunca escolheu nada. A escolha fica so em localStorage (por
// dispositivo, nao por conta) e vira o atributo data-theme na tag <html>,
// que e o que as variaveis de cor em globals.css leem. Ver o script inline
// em layout.tsx pra esse valor já vir aplicado ANTES da hidratacao, sem
// isso quem escolheu claro veria um flash de escuro a cada carregamento.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") setThemeState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // modo privado ou storage cheio — a escolha so nao sobrevive a um
      // recarregamento, sem quebrar nada
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
