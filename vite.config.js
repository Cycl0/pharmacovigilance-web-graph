import { defineConfig } from 'vite'

export default defineConfig({
  root: './',
  publicDir: 'src/data',
  server: {
    open: true,
    port: 5173
  },
  server: {
    fs: {
      allow: ['..']
    }
  }
})
