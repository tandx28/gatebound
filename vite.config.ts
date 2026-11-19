import { defineConfig, type Plugin } from "vite";

/**
 * The Content-Security-Policy for the published page. GitHub Pages cannot
 * send headers, so it goes in a meta tag, and only into the build: the dev
 * server needs inline scripts and a websocket for hot reload.
 *
 * - Scripts only from the site itself; nothing inline, nothing evaluated.
 * - Models are fetched from the site; their textures arrive as blob: and data: URLs.
 * - Inline styles are allowed for the page's own small <style> block.
 * - No plugins, no forms, no framing of other pages, no base-tag tricks.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// Relative base so the static build works on GitHub Pages and itch.io alike.
export default defineConfig({
  base: "./",
  plugins: [contentSecurityPolicy()],
  build: {
    rollupOptions: {
      output: {
        // three.js changes far less often than the game: its own file stays
        // cached in the player's browser across most releases.
        manualChunks: { three: ["three"] },
      },
    },
    // three.js alone is over 500 kB minified; that is expected, not a mistake.
    chunkSizeWarningLimit: 800,
  },
});
