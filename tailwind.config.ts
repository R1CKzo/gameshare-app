import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0d12",
        surface: "#151822",
        rail: "#08090d",
        sidebar: "#0e1018",
        main: "#14161f",
        elevated: "#1c202c",
        "elevated-hover": "#242938",
        primary: "#7c3aed",
        "primary-hover": "#8b5cf6",
        accent: "#22d3ee",
        away: "#f5a524",
        danger: "#ef4444",
        "danger-hover": "#f87171",
        muted: "#838a99",
        dim: "#6b7280",
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
