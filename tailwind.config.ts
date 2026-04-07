import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        wabi: {
          50: "#F4F1EA",
          100: "#EDE9E3",
          200: "#E3DED6",

          300: "#B7B7A4",
          400: "#8A8A7A",
          500: "#6B705C",

          600: "#3A3A38",
          700: "#2F2F2F",
          800: "#1F1F1F",

          red: {
            100: "#E6CFC9",
            300: "#C97C5D",
            500: "#A44A3F",
          },

          green: {
            100: "#DDE5D9",
            300: "#9CAF88",
            500: "#6B8F71",
          },

          yellow: {
            100: "#F3E9D2",
            300: "#E0C097",
            500: "#C6A56B",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
