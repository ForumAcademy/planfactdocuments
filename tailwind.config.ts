import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0A0A9F', dark: '#060670', light: '#E8E8F8' },
        ink: '#111111',
        surface: '#F4F6FA',
        line: '#E3E7EF',
        status: { green: '#1E9E5A', red: '#D93838', gray: '#8A94A6', blue: '#0A0A9F' },
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
