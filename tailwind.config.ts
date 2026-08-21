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
        primary: "#7c3aed",
        accent: "#22d3ee",
        danger: "#ef4444",
      },
    },
  },
  plugins: [],
};

export default config;
