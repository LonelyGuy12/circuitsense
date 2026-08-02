/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#eef6ff',
          100: '#d9eaff',
          200: '#bbd8ff',
          300: '#8dbeff',
          400: '#589bff',
          500: '#3478f6',
          600: '#1f5dec',
          700: '#1748d8',
          800: '#193caf',
          900: '#1a388a',
          950: '#142254',
        },
        surface: {
          50:  '#f8f9fc',
          100: '#f0f2f8',
          200: '#e3e7f2',
          700: '#2a2f45',
          800: '#1e2235',
          850: '#171b2d',
          900: '#12151f',
          950: '#0b0d14',
        },
        severity: {
          critical: '#ef4444',
          warning:  '#f59e0b',
          info:     '#3b82f6',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          from: { boxShadow: '0 0 20px rgba(52,120,246,0.2)' },
          to:   { boxShadow: '0 0 40px rgba(52,120,246,0.5)' },
        },
      },
    },
  },
  plugins: [],
}
