import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2AABEE',
        'primary-hover': '#229ED9',
        secondary: '#8774E1',
        bg: {
          DEFAULT: '#17212B',
          dark: '#0E1621',
          light: '#1E2D3D',
          hover: '#242F3D',
          chat: '#0B141A',
        },
        text: {
          DEFAULT: '#FFFFFF',
          secondary: '#8E9DAF',
          muted: '#6C7883',
        },
        message: {
          out: '#2B5278',
          in: '#1E2D3D',
        },
        success: '#43B581',
        danger: '#E53935',
        warning: '#F5A623',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'pulse-dot': 'pulseDot 1.4s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
export default config
