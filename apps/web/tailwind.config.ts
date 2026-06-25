import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#ecfdf8',
          100: '#d1fae9',
          200: '#a7f3d5',
          300: '#6ee7bc',
          400: '#34d99e',
          500: '#16f6ab',
          600: '#00c2c2',
          700: '#0080e8',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        agora: {
          // Theme-aware via CSS vars: light defaults live in :root, dark in
          // .dark (globals.css). RGB-channel form keeps Tailwind opacity
          // modifiers (e.g. bg-agora-card/50) working. Light values are
          // numerically identical to the previous static hexes.
          dark: 'rgb(var(--agora-dark) / <alpha-value>)',
          darker: 'rgb(var(--agora-darker) / <alpha-value>)',
          card: 'rgb(var(--agora-card) / <alpha-value>)',
          border: 'rgb(var(--agora-border) / <alpha-value>)',
          text: 'rgb(var(--agora-text) / <alpha-value>)',
          muted: 'rgb(var(--agora-muted) / <alpha-value>)',
          primary: '#16f6ab',
          secondary: '#00c2c2',
          tertiary: '#0080e8',
          success: '#10b981',
          accent: '#00c2c2',
          warning: '#f59e0b',
          error: '#ef4444',
        },
        // Dark theme variants
        'agora-dark': {
          dark: '#0f0f14',
          darker: '#0a0a0f',
          card: '#161621',
          border: '#2a2a3a',
          text: '#f8fafc',
          muted: '#94a3b8',
          primary: '#16f6ab',
          secondary: '#00c2c2',
          tertiary: '#0080e8',
          success: '#10b981',
          accent: '#00c2c2',
          warning: '#f59e0b',
          error: '#ef4444',
        },
        moss: {
          primary: '#16f6ab',
          secondary: '#00c2c2',
          tertiary: '#0080e8',
        },
        // Shadcn CSS variable colors
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'fade-out': 'fadeOut 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'bounce-in': 'bounceIn 0.5s ease-out',
        'highlight': 'highlight 2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        // Terminal animations
        'cursor-blink': 'cursorBlink 1.06s step-end infinite',
        'terminal-glow': 'terminalGlow 2s ease-in-out infinite',
        'data-flow': 'dataFlow 3s linear infinite',
        'scanline': 'scanline 8s linear infinite',
        'number-spin': 'numberSpin 0.3s ease-out',
        'rec-blink': 'recBlink 1.5s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'typing': 'typing 0.5s ease-out',
        // Shadcn animations
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '50%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        highlight: {
          '0%': { backgroundColor: 'rgba(22, 246, 171, 0.2)' },
          '100%': { backgroundColor: 'transparent' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Terminal keyframes
        cursorBlink: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        terminalGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        dataFlow: {
          '0%': { transform: 'translateX(0)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        numberSpin: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        recBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        typing: {
          '0%': { width: '0' },
          '100%': { width: '100%' },
        },
        // Shadcn keyframes
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      // Animation delay utilities
      animationDelay: {
        '75': '75ms',
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
        '400': '400ms',
        '500': '500ms',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
