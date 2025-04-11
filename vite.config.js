import { defineConfig } from 'vite'

export default defineConfig({
  root: './',
  build: {
    assetsInclude: ["**/*.gexf"], // Explicitly include GEXF files
  },
  publicDir: "public", // Ensure this points to your public folder
  server: {
    fs: {
      allow: ['..']
    }
  }
})
