import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
// The page under test is the real one; only the Supabase client is swapped.
const src = path.resolve(__dirname, '../../src');
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:4555'), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('test') },
  resolve: { alias: [
    { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, 'mock-client.ts') },
    { find: /^@\//, replacement: src + '/' },
  ] },
  build: { outDir: path.resolve(__dirname, 'dist'), emptyOutDir: true },
});
