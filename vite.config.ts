import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4174",
      "/media": "http://127.0.0.1:4174"
    }
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
