/** @type {import('tailwindcss').Config} */

// Every colour is a CSS variable (index.css), so the coordinator console can switch to its
// dark theme without page changes. Warm colours only ever mean danger.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name) => Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [step, v(`${name}-${step}`)]));
// Stock Tailwind hues used by older screens follow the theme too: 50-100 soft fill, 200-300 border, 400+ the signal colour.
const signal = (name) => Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [step, step <= 100 ? v(`${name}-soft`) : step <= 300 ? v(`${name}-line`) : v(name)]));

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: scale('primary'),
        blue: scale('primary'),
        neutral: scale('neutral'),
        slate: scale('neutral'),
        gray: scale('neutral'),
        red: signal('critical'),
        rose: signal('critical'),
        orange: signal('high'),
        amber: signal('moderate'),
        yellow: signal('moderate'),
        green: signal('success'),
        emerald: signal('success'),
        sky: scale('primary'),
        cyan: scale('primary'),
        indigo: scale('primary'),
        purple: scale('primary'),
        violet: scale('primary'),
        paper: v('paper'),
        surface: v('surface'),
        ink: v('ink'),
        line: v('line'),
        'on-primary': v('on-primary'),
        flood: v('flood'),
        critical: v('critical'),
        high: v('high'),
        moderate: v('moderate'),
        low: v('low'),
        success: v('success'),
        warning: v('moderate'),
        error: v('critical'),
        info: v('primary-600'),
        accent: v('flood'),
        danger: '#DC2626',
        'critical-soft': v('critical-soft'),
        'high-soft': v('high-soft'),
        'moderate-soft': v('moderate-soft'),
        'success-soft': v('success-soft'),
        'low-soft': v('low-soft'),
        'critical-line': v('critical-line'),
        'high-line': v('high-line'),
        'moderate-line': v('moderate-line'),
        'success-line': v('success-line'),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        urdu: ['"Noto Nastaliq Urdu"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        panel: '16px',
        control: '10px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        cardHover: 'var(--shadow-lift)',
        lift: 'var(--shadow-lift)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { transform: 'translateX(100%)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.55' } },
      },
    },
  },
  plugins: [],
};
