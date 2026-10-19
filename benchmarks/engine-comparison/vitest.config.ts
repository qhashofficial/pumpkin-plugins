import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            { extends: true, test: { name: 'unit', include: ['test/**/*.test.ts'] } },
            {
                extends: true,
                test: {
                    name: 'integration',
                    include: ['test/**/*.itest.ts'],
                    globalSetup: ['./test/global-setup.ts'],
                    testTimeout: 120_000,
                    hookTimeout: 180_000,
                },
            },
        ],
    },
});
