/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: "mock" | "real";
  readonly VITE_ALLOW_MOCK?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_OPENAPI_REVISION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
