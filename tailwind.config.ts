import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // As cores da marca são VARIÁVEIS, não hex. O valor padrão (em
        // globals.css) é o verde/dourado de sempre — o site e o CRM não
        // mudam. O atendimento redefine as mesmas variáveis no seu escopo
        // e, com isso, os 340 usos de `bg-arini`/`text-gold` obedecem sem
        // precisar de uma única troca de classe.
        arini: {
          DEFAULT: "hsl(var(--marca) / <alpha-value>)",
          dark: "hsl(var(--marca-dark) / <alpha-value>)",
          light: "hsl(var(--marca-light) / <alpha-value>)",
          50: "hsl(var(--marca-50) / <alpha-value>)",
          900: "hsl(var(--marca-900) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "hsl(var(--destaque) / <alpha-value>)",
          from: "hsl(var(--destaque-from) / <alpha-value>)",
          to: "hsl(var(--destaque-to) / <alpha-value>)",
          dark: "hsl(var(--destaque-dark) / <alpha-value>)",
        },
        // Cor de AÇÃO: botão, link, anel de foco. É o que a paleta troca.
        acao: {
          DEFAULT: "hsl(var(--acao) / <alpha-value>)",
          foreground: "hsl(var(--acao-fg) / <alpha-value>)",
        },
        // Bolha da mensagem enviada (a recebida usa `card`).
        bolha: {
          out: "hsl(var(--bolha-out) / <alpha-value>)",
          "out-foreground": "hsl(var(--bolha-out-fg) / <alpha-value>)",
        },
        // Fundo da thread de conversa.
        chat: "hsl(var(--superficie-chat) / <alpha-value>)",
        // Sidebar do atendimento — verde fixo nos dois temas.
        sidebar: {
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-fg) / <alpha-value>)",
          muted: "hsl(var(--sidebar-muted) / <alpha-value>)",
          hover: "hsl(var(--sidebar-hover) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
      },
      backgroundImage: {
        "gold-gradient":
          "linear-gradient(135deg, hsl(var(--destaque-from)) 0%, hsl(var(--destaque-to)) 100%)",
        "gold-gradient-soft":
          "linear-gradient(135deg, hsl(var(--destaque-from) / 0.15) 0%, hsl(var(--destaque-to) / 0.15) 100%)",
        "arini-radial":
          "radial-gradient(ellipse at top, #0e3622 0%, #092316 60%, #061a10 100%)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
