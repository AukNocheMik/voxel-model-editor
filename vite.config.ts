import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/app/',  // 部署在 https://www.wondercreater.cn/app/ 二级目录
  server: {
    port: 3001,
    open: true,
  },
})
