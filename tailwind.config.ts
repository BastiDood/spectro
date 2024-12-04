import type { Config } from 'tailwindcss';
import DaisyUI from 'daisyui';
import typo from '@tailwindcss/typography';

export default {
    experimental: { optimizeUniversalDefaults: true },
    content: ['./src/**/*.{html,js,svelte,ts}'],
    plugins: [DaisyUI, typo],
    daisyui: {
        themes: [
            {
                spectro: {
                    primary: '#f7951d',
                    'primary-content': '#150800',
                    secondary: '#6367b5',
                    'secondary-content': '#dde0f1',
                    accent: '#6a367a',
                    'accent-content': '#e0d5e4',
                    neutral: '#352f62',
                    'neutral-content': '#d2d2df',
                    'base-100': '#24223d',
                    'base-200': '#1e1c34',
                    'base-300': '#18162b',
                    'base-content': '#ceced5',
                    info: '#0891b2',
                    'info-content': '#00070c',
                    success: '#1b6f43',
                    'success-content': '#d2e1d7',
                    warning: '#ffc852',
                    'warning-content': '#160f02',
                    error: '#ab3030',
                    'error-content': '#f3d6d3',
                },
            },
        ],
        logs: false,
    },
    theme: {
        extend: {
            animation: {
                float: '3s infinite float',
            },
            keyframes: {
                float: {
                    '0%, 100%': {
                        transform: 'translateY(0)',
                    },
                    '50%': {
                        transform: 'translateY(-12px)',
                    },
                },
            },
        },
    },
} satisfies Config;
