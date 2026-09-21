import type { Config } from 'tailwindcss';

/**
 * Colors mirror the tokens in app/globals.css so markup can use `bg-navy-900`, `text-orange-500`
 * and so on. Tailwind's default `rounded-lg` (8px) and `rounded-xl` (12px) already match MSB's
 * radii, so they are left alone.
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f2f5fa', 100: '#dee5ef', 200: '#c3cfe1', 500: '#647694',
          700: '#3a5279', 800: '#2c4268', 900: '#1f3357',
        },
        orange: {
          50: '#fdeee9', 300: '#ff9466', 500: '#ea4e24', 600: '#d5401a', bright: '#ff6438',
        },
        canvas: '#f7f8f9',
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
