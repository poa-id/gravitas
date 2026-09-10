import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// Vercel may invoke the default build command depending on project settings.
// Treat any Vercel build as a browser build so real Tauri APIs never leak in.
const isVercelBuild = Boolean(process.env.VERCEL);

const webAliases = {
  "@tauri-apps/plugin-fs": fileURLToPath(new URL("./src/web/tauriFs.ts", import.meta.url)),
  "@tauri-apps/plugin-dialog": fileURLToPath(new URL("./src/web/tauriDialog.ts", import.meta.url)),
  "@tauri-apps/plugin-store": fileURLToPath(new URL("./src/web/tauriStore.ts", import.meta.url)),
  "@tauri-apps/plugin-opener": fileURLToPath(new URL("./src/web/tauriOpener.ts", import.meta.url)),
  "@tauri-apps/api/core": fileURLToPath(new URL("./src/web/tauriCore.ts", import.meta.url)),
  "@tauri-apps/api/menu": fileURLToPath(new URL("./src/web/tauriMenu.ts", import.meta.url)),
};

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const isWebBuild = mode === "web" || isVercelBuild;

  return {
    plugins: [react()],
    resolve: {
      alias: isWebBuild ? webAliases : {},
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        usePolling: true,
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
