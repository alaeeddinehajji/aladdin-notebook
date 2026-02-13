/// <reference types="vite-plugin-pwa/vanillajs" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-svgr/client" />
interface ImportMetaEnv {
  // The port to run the dev server
  VITE_APP_PORT: string;

  // collaboration WebSocket server
  VITE_APP_WS_SERVER_URL: string;

  // Appwrite configuration
  VITE_APPWRITE_ENDPOINT: string;
  VITE_APPWRITE_PROJECT_ID: string;
  VITE_APPWRITE_DATABASE_ID: string;
  VITE_APPWRITE_BUCKET_ID: string;

  // whether to disable live reload / HMR
  VITE_APP_DEV_DISABLE_LIVE_RELOAD: string;

  // Set this flag to false if you want to open the overlay by default
  VITE_APP_COLLAPSE_OVERLAY: string;

  // Enable eslint in dev server
  VITE_APP_ENABLE_ESLINT: string;

  // Enable PWA in dev server
  VITE_APP_ENABLE_PWA: string;

  VITE_APP_GIT_SHA: string;

  // Prevent unload dialog
  VITE_APP_DISABLE_PREVENT_UNLOAD: string;

  // Admin panel secret PIN
  VITE_ADMIN_SECRET_PIN: string;

  MODE: string;

  DEV: string;
  PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
