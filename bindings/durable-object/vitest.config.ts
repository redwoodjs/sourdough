import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    execArgv: ['--experimental-sqlite'],
    pool: 'forks',
    server: {
      deps: {
        external: ['node:sqlite'],
      },
    },
  },
})
