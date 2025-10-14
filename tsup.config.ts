import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  dts: true,
  target: 'node18',
  minify: false,
  splitting: false,
  bundle: true,
  platform: 'node',
})
