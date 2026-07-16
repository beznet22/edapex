import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import viteConfig from './vite.config';

const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
	...viteConfig,
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: [
						'tests/unit/**/*.test.ts',
						'src/lib/server/mastra/provider/**/*.test.ts',
						'src/lib/server/mastra/storage/libsql/**/*.test.ts',
						'src/lib/utils/**/*.test.ts'
					],
					environment: 'node',
					globals: true,
					testTimeout: 10_000,
					setupFiles: ['./tests/unit/setup.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['tests/integration/**/*.test.ts'],
					environment: 'node',
					globals: true,
					testTimeout: 60_000,
					fileParallelism: true,
					globalSetup: ['./tests/integration/setup.global.ts'],
					setupFiles: ['./tests/integration/setup.ts']
				}
			}
		]
	},
	resolve: {
		alias: {
			$lib: r('./src/lib')
		}
	}
});
