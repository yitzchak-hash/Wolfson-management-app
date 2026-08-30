/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // The diagram's own line (owner's decisions 4–5): below 900px it
        // shows one building behind big tabs with the stage bar; at 900 and
        // up the desktop toolbar and the all-buildings view are untouched.
        // Deliberately NOT the drawer's 800px plan line — two thresholds,
        // two different questions.
        diag: '900px',
      },
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

