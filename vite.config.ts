/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // 퍼즐 도우미로 옮겨 옛 서비스 워커는 스스로 해제한다(설치한 앱도 다음에 열 때 새 주소로 넘어감)
      selfDestroying: true,
      includeAssets: ['icon.svg'],
      manifest: {
        name: '노노그램 도우미',
        short_name: '노노그램 도우미',
        description: '노노그램 단서를 입력하면 한 단계씩 힌트를 주는 앱',
        lang: 'ko',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f6f7fb',
        theme_color: '#2f5bd3',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
