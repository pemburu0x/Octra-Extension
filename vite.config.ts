import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          crypto: ['tweetnacl', 'bip39'],
          ui: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast'
          ]
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://octra.network',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: true,
        configure: (proxy, _options) => {
          // Handle dynamic target based on X-RPC-URL header
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Get RPC URL from X-RPC-URL header
            const rpcUrl = req.headers['x-rpc-url'];
            if (rpcUrl && typeof rpcUrl === 'string') {
              try {
                const url = new URL(rpcUrl);
                
                // Update the target host for this request
                proxyReq.setHeader('host', url.host);
                
                // Log the dynamic routing
                // console.log(`Proxying request to: ${url.protocol}//${url.host}${req.url}`);
              } catch (error) {
                console.warn('Invalid RPC URL in header:', rpcUrl);
                // Keep default host
                proxyReq.setHeader('host', 'octra.network');
              }
            } else {
              // Default host if no header provided
              proxyReq.setHeader('host', 'octra.network');
            }
          });
        }
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
    cors: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer/',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
          process: true,
        }),
      ],
    },
  },
});