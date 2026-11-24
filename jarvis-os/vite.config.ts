import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      output: {
        inlineDynamicImports: true,
        paths: {
          react: 'https://esm.sh/react@19.1.1',
          'react-dom': 'https://esm.sh/react-dom@19.1.1',
          'react-dom/client': 'https://esm.sh/react-dom@19.1.1/client',
          'react/jsx-runtime': 'https://esm.sh/react@19.1.1/jsx-runtime',
        },
      },
    },
  },
});
