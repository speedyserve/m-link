import type { Config } from 'tailwindcss';

/**
 * Colors mirror the warm neutral tokens in app/globals.css. Tailwind's default `rounded-lg` (8px) and `rounded-xl` (12px) already match MSB's
 * radii, so they are left alone.
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#faf8f6', 100: '#eee9e4', 200: '#dfd9d3', 500: '#827970',
          700: '#625b54', 800: '#4c4640', 900: '#332f2b',
        },
        orange: {
          50: '#fdeee9', 300: '#ff9466', 500: '#ea4e24', 600: '#d5401a', bright: '#ff6438',
        },
        canvas: '#fffdfa',
        danger: '#ef4444',
        success: '#157f4d',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
