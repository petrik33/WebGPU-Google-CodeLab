import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        // Ensure Vite serves static files correctly
    },
    build: {
        // Ensure WGSL files are included in the build
        assetsInclude: ['**/*.wgsl'],
    },
});