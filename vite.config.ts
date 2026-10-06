import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // 钉钉 OAuth / 内部 API 预留代理（PRD 12.3）：后端就绪后放开
      '/api': {
        target: process.env.VITE_API_BASE || 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // 显式关掉「构建前清空 outDir」。
    // 原因：vite 的 emptyDir 会对目录做整体递归删除，在启用了安全删除护栏的环境里
    // 会被判定为批量删除而中断构建；产物文件名带内容哈希，vite 覆写同名文件即可，
    // 清空并非必需。旧的无哈希残留文件不影响运行（index.html 只引用当次产物）。
    emptyOutDir: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // 首屏 ≤2s（PRD 7.1）：按体积拆分 vendor，避免单包过大阻塞钉钉内 H5 首屏
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          charts: ['recharts'],
        },
      },
    },
  },
});
