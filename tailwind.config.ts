import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        muted: "#667085",
        line: "#d8dee8",
        panel: "#f7f8fb",
        accent: "#16736b",
        warning: "#b45309",
        danger: "#b42318"
      },
      boxShadow: {
        soft: "0 12px 40px rgba(16, 24, 40, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
