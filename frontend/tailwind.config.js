/** @type {import('tailwindcss').Config} */

// Cool colours are the system; warm colours only ever mean danger.
const teal = {
  50: '#E8F4F2',
  100: '#CDE8E4',
  200: '#9ED1CA',
  300: '#66B3AA',
  400: '#2E9488',
  500: '#0E7D72',
  600: '#0B6E66',
  700: '#085750',
  800: '#07463F',
  900: '#063A35',
  950: '#032421',
};
// Neutral 400+ is tuned to pass 4.5:1 on white and on paper, because it is used for text.
const ink = {
  50: '#F6F8F8',
  100: '#EEF2F1',
  200: '#DCE4E2',
  300: '#C3CFCD',
  400: '#617475',
  500: '#56696A',
  600: '#44585A',
  700: '#2F4347',
  800: '#1D3237',
  900: '#10262C',
  950: '#0A1A1E',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: teal,
        blue: teal,
        neutral: ink,
        slate: ink,
        paper: '#EEF2F1',
        ink: '#10262C',
        flood: '#1C9AA6',
        line: '#CFD9D7',
        critical: '#C8261B',
        high: '#C2510C',
        moderate: '#946000',
        low: '#3D6B5A',
        success: '#2F7A57',
        warning: '#946000',
        error: '#C8261B',
        info: '#0B6E66',
        accent: '#1C9AA6',
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        display: ['"Barlow Semi Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
        urdu: ['"Noto Nastaliq Urdu"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        panel: '12px',
        control: '8px',
      },
      boxShadow: {
        card: '0 1px 0 rgb(16 38 44 / 0.04)',
        cardHover: '0 2px 8px rgb(16 38 44 / 0.08)',
        lift: '0 12px 32px -12px rgb(16 38 44 / 0.25)',
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
