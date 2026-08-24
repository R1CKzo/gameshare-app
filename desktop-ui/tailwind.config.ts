import type { Config } from "tailwindcss";

// Mesmo tema do site (ver ../tailwind.config.ts) -- duplicado de proposito
// (nao importado) porque configuracao de build de cada projeto fica
// melhor isolada; o conteudo escaneado inclui ../src pra pegar as classes
// usadas nos componentes reaproveitados de la.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "../src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        rail: "var(--color-rail)",
        sidebar: "var(--color-sidebar)",
        main: "var(--color-main)",
        elevated: "var(--color-elevated)",
        "elevated-hover": "var(--color-elevated-hover)",
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        accent: "var(--color-accent)",
        online: "var(--color-online)",
        away: "var(--color-away)",
        danger: "var(--color-danger)",
        "danger-hover": "var(--color-danger-hover)",
        muted: "var(--color-muted)",
        dim: "var(--color-dim)",
        foreground: "var(--color-foreground)",
        "foreground-secondary": "var(--color-foreground-secondary)",
        border: "var(--color-border)",
        ring: "var(--color-ring)",
        overlay: {
          weak: "var(--color-overlay-weak)",
          DEFAULT: "var(--color-overlay)",
          strong: "var(--color-overlay-strong)",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["'Manrope'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
