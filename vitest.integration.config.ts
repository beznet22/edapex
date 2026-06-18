import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.integration.test.ts'],
		setupFiles: ['tests/integration-setup.ts'],
		testTimeout: 60000,
		pool: 'forks',
		maxWorkers: 1,
		isolate: false,
		sequence: {
			concurrent: false
		}
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib')
		}
	}
});