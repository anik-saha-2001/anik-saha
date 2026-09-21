import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          950: "#07070d",
          900: "#0b0b16",
          850: "#0f0f1d",
          800: "#141426",
          700: "#1b1b33",
          600: "#26264a",
          500: "#34345f",
        },
        moon: {
          100: "#fdfcf7",
          200: "#f3f1e6",
          300: "#e4e0cc",
        },
        accent: {
          DEFAULT: "#b9a6ff",
          soft: "#8b7ee8",
          dim: "#6c62a6",
          glow: "#d8ccff",
        },
        star: "#f5e6a8",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(185,166,255,0.35)",
      },
      backgroundImage: {
        "radial-fade": "radial-gradient(ellipse at top, rgba(185,166,255,0.08), transparent 60%)",
      },
    },
  },
  plugins: [],
};
export default config;
