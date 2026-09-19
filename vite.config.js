import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: '家庭物資價格紀錄',
        short_name: '物資比價',
        description: '家庭物資採購歷史最低價記錄工具',
        theme_color: '#2563eb',
        background_color: '#f3f4f6',
        display: 'standalone', // 全螢幕隱藏瀏覽器網址列
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/3081/3081559.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://cdn-icons-png.flaticon.com/512/3081/3081559.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});