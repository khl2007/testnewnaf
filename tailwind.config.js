/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        nafath: {
          green: "#499184",
          dark: "#3d7a6f",
          mint: "#e8f5f1",
        },
      },
      fontFamily: {
        sans: ['system-ui', "Segoe UI", "Noto Sans Arabic", "sans-serif"],
      },
    },
  },
  plugins: [],
};
