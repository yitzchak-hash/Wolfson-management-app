/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#1e3a5f',
          orange: '#f5a623',
          blue: '#4aa8d8',
          light: '#d6e8ee',
        },
        wolfson: {
          copper: '#b8860b',
          light: '#d6e8ee',
        }
      },
    },
  },
  plugins: [],
}

