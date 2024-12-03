import type { Config } from 'tailwindcss';
export default {
    experimental: { optimizeUniversalDefaults: true },
    content: ['./src/**/*.{html,js,svelte,ts}'],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#ffff9d',
                    500: '#f7951d',
                    950: '#55362e',
                },
                secondary: {
                    50: '#e5a9f5',
                    500: '#6a367a',
                    950: '#0a0016',
                },
                surface: {
                    50: '#f7f8f9',
                    500: '#352f62',
                    900: '#272544',
                    950: '#24223d',
                },
            },

            animation: {
                floatUpDown: '3s infinite floatUpDown',
            },

            keyframes: {
                floatUpDown: {
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
