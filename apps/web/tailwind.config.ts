import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  theme: { extend: { colors: { ink: '#10231d', brand: '#087f5b', mint: '#dff5eb', canvas: '#f4f7f5' } } },
  plugins: [],
} satisfies Config;

