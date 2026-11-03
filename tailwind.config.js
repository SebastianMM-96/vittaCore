/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#24352f',
        muted: '#7c8983',
        canvas: '#f7f8f6',
        line: '#e8ece8',
        brand: '#347c62',
        'brand-dark': '#285f4b',
        'brand-light': '#e8f2ed',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(28, 50, 39, 0.035), 0 1px 2px rgba(28, 50, 39, 0.025)',
      },
    },
  },
  plugins: [],
}
