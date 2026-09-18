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
          50: '#f2f5fa', 100: '#dee5ef', 200: '#c3cfe1', 500: '#505f79',
          700: '#1c3461', 800: '#12294f', 900: '#091e42',
        },
        orange: {
          50: '#feefe7', 300: '#ffa95a', 500: '#f4600c', 600: '#e45f35', bright: '#ff6a00',
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
