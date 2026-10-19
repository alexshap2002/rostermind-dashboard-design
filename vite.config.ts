import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// У цьому репозиторії сервера немає: дані дає src/demo/mockApi.ts (VITE_DEMO=1).
// Проксі лишено таким, як у програмі, — щоб файли можна було перенести назад без змін.
const target = process.env.VITE_PROXY_TARGET || "http://webapp:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    assetsDir: "app-assets",
  },
  server: {
    host: true,
    port: 5173,
    // Same-origin proxy so the HttpOnly auth cookie set by /auth/login flows
    // automatically to /api/* requests (everything is localhost:5173 to the browser).
    // changeOrigin: false — бекенд бачить Host браузера (localhost:5173) і будує
    // зовнішні посилання (наприклад, календар вчителя) на адресу, що працює
    // у користувача, а не на внутрішній docker-хост webapp:8000.
    proxy: {
      "/api": { target, changeOrigin: false },
      "/auth": { target, changeOrigin: false },
      "/admin": { target, changeOrigin: false },
      "/static": { target, changeOrigin: false },
    },
  },
});
