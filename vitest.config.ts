import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts', 'src/**/*.property.test.ts'],
		testTimeout: 30000
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib')
		}
	}
});
