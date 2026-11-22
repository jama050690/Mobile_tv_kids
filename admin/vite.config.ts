import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Dev rejimida /api so'rovlari backend'ga proxy qilinadi —
// shunda panel va API bitta origin'da ishlaydi (httpOnly cookie, SameSite=Strict, CORS shart emas).
export default defineConfig(({ mode }) => {
  // '.' — loyiha papkasi (vite admin/ ichidan ishga tushiriladi); @types/node shart emas
  const env = loadEnv(mode, '.', '');
  const target = env.VITE_API_PROXY || 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: false },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 800,
    },
  };
});
