import { readFileSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDevServer = command === 'serve'
  const host = isDevServer ? env.DEV_LAN_HOST || 'localhost' : 'localhost'
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(host)
  let https

  if (isDevServer && !isLoopback) {
    const certDirectory = path.join(
      process.env.LOCALAPPDATA || '',
      'FaultTolerantIoT',
      'mosquitto',
      'certs'
    )
    const certPath = env.DEV_TLS_CERT_PATH || path.join(certDirectory, 'server.crt')
    const keyPath = env.DEV_TLS_KEY_PATH || path.join(certDirectory, 'server.key')
    https = {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath)
    }
  }

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_LAN_BRIDGE_URL': JSON.stringify(
        isDevServer ? env.VITE_LAN_BRIDGE_URL || '' : ''
      )
    },
    ...(isDevServer
      ? {
          server: {
            host,
            port: 5173,
            strictPort: true,
            ...(https ? { https } : {})
          }
        }
      : {}),
    build: {
      outDir: '..',
      emptyOutDir: false,
      rollupOptions: {
        output: {
          entryFileNames: 'app.js',
          chunkFileNames: 'app-[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return 'style.css'
            }
            return '[name].[ext]'
          },
        },
      },
    },
  }
})

