// Standalone Vite config — no Lovable build tooling.
//
// Replaces `defineConfig` from @lovable.dev/vite-tanstack-config, reproducing only
// what affects a real build or dev server. Deliberately dropped (all sandbox-only,
// no-ops outside Lovable): sandbox detection, port-8080 forcing, HMR gate,
// dev-server bridge, `/__l5e/assets-v1` proxy, and the build-error diagnostics plugin.
//
// Also dropped: componentTagger (referenced nowhere in src/) and the Lovable
// dev-mode TanStack devtools overlay.
import { defineConfig, loadEnv, type PluginOption } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async ({ command, mode }) => {
  // Vite inlines VITE_* for the client itself, but TanStack Start's server build
  // also reads import.meta.env.* (see integrations/supabase/client.ts), so define
  // them for both environments.
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),

    // `server.entry: "server"` redirects TanStack Start's bundled server entry to
    // src/server.ts (our SSR error wrapper). importProtection keeps server-only
    // modules out of the client bundle.
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      server: { entry: "server" },
    }),
  ];

  // Production builds only: emits .output/ targeting Cloudflare Workers.
  // Imported lazily so `vite dev` never loads nitro.
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({ defaultPreset: "cloudflare-module" }));
  }

  plugins.push(react());

  return {
    define: envDefine,

    // lightningcss is declared in devDependencies — it used to arrive
    // transitively via the Lovable config package.
    css: { transformer: "lightningcss" },

    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },

    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },

    plugins,

    server: {
      host: "::",
      port: 8080,
      watch: { awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 } },
    },
  };
});
