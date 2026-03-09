import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        // Generate sourcemaps for debugging
        sourcemap: true,
        // Create a library build
        lib: {
            // The entry point for our library
            entry: resolve(__dirname, 'src/index.ts'),
            // The global variable name when used in a <script> tag
            name: 'VoiceAiWidget',
            // The format of the output bundle (Universal Module Definition)
            formats: ['umd'],
            // The name of the output file
            fileName: (format) => `voice-ai-widget.${format}.js`,
        },
    },
    // Add the dts plugin to generate TypeScript declaration files
    plugins: [dts()],
});