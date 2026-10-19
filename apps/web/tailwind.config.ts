import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        label: {
          DEFAULT: 'var(--label)',
          2: 'var(--label-2)',
          3: 'var(--label-3)',
        },
        separator: 'var(--separator)',
        fill: 'var(--fill)',
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
        },
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        ok: 'var(--ok)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Inter Variable"',
          'Inter',
          'system-ui',
          '"Noto Sans Devanagari"',
          'sans-serif',
        ],
      },
      borderRadius: {
        'ios-card': '14px',
        'ios-sheet': '24px',
      },
      fontSize: {
        'hero-num': ['3rem', { lineHeight: '3.25rem', fontWeight: '600' }],
        'large-title': ['2.125rem', { lineHeight: '2.5rem', fontWeight: '700' }],
        title: ['1.375rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        headline: ['1.0625rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        body: ['1.0625rem', { lineHeight: '1.5rem', fontWeight: '400' }],
        subhead: ['0.9375rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        footnote: ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '400' }],
        caption: ['0.6875rem', { lineHeight: '0.875rem', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
