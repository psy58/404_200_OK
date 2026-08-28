import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // `npm run dev`         → 지금처럼 정적 mock JSON (백엔드 없이 동작, 기본값)
  // `npm run dev:backend` → /mocks/backend/* 요청을 백엔드로 넘겨 실데이터 사용
  //
  // 백엔드가 mock 과 같은 경로(/mocks/backend/*.json)로 같은 형태를 응답하므로
  // 화면·어댑터·zod 는 아무것도 바꾸지 않는다. docs/BACKEND_INTEGRATION.md 참고.
  const env = loadEnv(mode, __dirname, "");
  const backend = env.VITE_BACKEND_URL;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
      proxy: backend
        ? {
            "/mocks/backend": { target: backend, changeOrigin: true },
            "/api": { target: backend, changeOrigin: true },
          }
        : undefined,
    },
  };
});
