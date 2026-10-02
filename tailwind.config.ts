import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0f1720', muted: '#5b6672', faint: '#8b959f' },
        line: '#e3e7ea',
        surface: { DEFAULT: '#ffffff', sunken: '#f6f8f9' },
        accent: { DEFAULT: '#1c5d8c', soft: '#eaf2f8' },
        good: '#1a7f4f',
        warn: '#a86a12',
        bad: '#a32d2d',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
