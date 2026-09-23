import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1F4E9E', dark: '#0F2A5C', light: '#E8EEF8' },
        ink: '#111111',
        surface: '#F4F6FA',
        line: '#E3E7EF',
        status: { green: '#1E9E5A', red: '#D93838', gray: '#8A94A6', blue: '#1F4E9E' },
      },
      borderRadius: { DEFAULT: '6px', md: '6px' },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
