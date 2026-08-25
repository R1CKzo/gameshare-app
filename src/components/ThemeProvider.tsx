"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "gameshare-theme";
const GLASS_STORAGE_KEY = "gameshare-glass";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  // Interface "liquid glass" -- recurso em teste, independente do
  // escuro/claro (os dois combinam: vidro escuro ou vidro claro). So
  // aparece pra escolher nas Configuracoes pra quem tem "Permitir versoes
  // beta" ligado (ver ProfileTab em SettingsButton.tsx), mas o valor em si
  // fica salvo e aplicado sempre, do mesmo jeito que o tema.
  glass: boolean;
  setGlass: (glass: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  glass: false,
  setGlass: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Escuro sempre foi a unica opcao do app — continua sendo o padrao pra
// quem nunca escolheu nada. As duas escolhas ficam so em localStorage (por
// dispositivo, nao por conta) e viram atributos na tag <html>
// (data-theme/data-glass), que e o que as variaveis de cor em globals.css
// leem. Ver o script inline em layout.tsx pra esses valores ja virem
// aplicados ANTES da hidratacao, sem isso da um flash do padrao a cada
// carregamento.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [glass, setGlassState] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") setThemeState(storedTheme);
    setGlassState(localStorage.getItem(GLASS_STORAGE_KEY) === "true");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-glass", glass);
  }, [glass]);

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // modo privado ou storage cheio — a escolha so nao sobrevive a um
      // recarregamento, sem quebrar nada
    }
  }

  function setGlass(next: boolean) {
    setGlassState(next);
    try {
      localStorage.setItem(GLASS_STORAGE_KEY, String(next));
    } catch {
      // idem
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme, glass, setGlass }}>{children}</ThemeContext.Provider>;
}
