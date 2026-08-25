"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type TextSize = "small" | "normal" | "large";

const TEXT_SIZE_KEY = "gameshare-text-size";
const REDUCE_MOTION_KEY = "gameshare-reduce-motion";
const HIGH_CONTRAST_KEY = "gameshare-high-contrast";

type AccessibilityContextValue = {
  textSize: TextSize;
  setTextSize: (v: TextSize) => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue>({
  textSize: "normal",
  setTextSize: () => {},
  reduceMotion: false,
  setReduceMotion: () => {},
  highContrast: false,
  setHighContrast: () => {},
});

export function useAccessibility(): AccessibilityContextValue {
  return useContext(AccessibilityContext);
}

// Mesmo padrao do ThemeProvider.tsx: cada escolha fica em localStorage
// (por dispositivo) e vira atributo na tag <html>, que e o que as regras
// em globals.css leem. Ver o script inline em layout.tsx pra esses
// valores ja virem aplicados ANTES da hidratacao, sem flash do estado
// padrao a cada carregamento.
export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>("normal");
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [highContrast, setHighContrastState] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(TEXT_SIZE_KEY);
    if (stored === "small" || stored === "normal" || stored === "large") setTextSizeState(stored);
    setReduceMotionState(localStorage.getItem(REDUCE_MOTION_KEY) === "true");
    setHighContrastState(localStorage.getItem(HIGH_CONTRAST_KEY) === "true");
  }, []);

  useEffect(() => {
    if (textSize === "normal") document.documentElement.removeAttribute("data-text-size");
    else document.documentElement.setAttribute("data-text-size", textSize);
  }, [textSize]);

  useEffect(() => {
    if (reduceMotion) document.documentElement.setAttribute("data-reduce-motion", "true");
    else document.documentElement.removeAttribute("data-reduce-motion");
  }, [reduceMotion]);

  useEffect(() => {
    if (highContrast) document.documentElement.setAttribute("data-high-contrast", "true");
    else document.documentElement.removeAttribute("data-high-contrast");
  }, [highContrast]);

  function setTextSize(next: TextSize) {
    setTextSizeState(next);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, next);
    } catch {
      // modo privado ou storage cheio — a escolha so nao sobrevive a um
      // recarregamento, sem quebrar nada
    }
  }

  function setReduceMotion(next: boolean) {
    setReduceMotionState(next);
    try {
      localStorage.setItem(REDUCE_MOTION_KEY, String(next));
    } catch {
      // idem
    }
  }

  function setHighContrast(next: boolean) {
    setHighContrastState(next);
    try {
      localStorage.setItem(HIGH_CONTRAST_KEY, String(next));
    } catch {
      // idem
    }
  }

  return (
    <AccessibilityContext.Provider
      value={{ textSize, setTextSize, reduceMotion, setReduceMotion, highContrast, setHighContrast }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}
