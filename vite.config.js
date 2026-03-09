import { defineConfig } from 'vite';

// Custom plugin to proxy external SVG fetches (bypasses CORS)
function svgProxyPlugin() {
  return {
    name: 'svg-proxy',
    configureServer(server) {
      server.middlewares.use('/api/fetch-svg', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing ?url= parameter' }));
          return;
        }

        try {
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; SVGEditor/1.0)',
              'Accept': 'image/svg+xml, application/xml, text/xml, */*'
            }
          });

          if (!response.ok) {
            res.statusCode = response.status;
            res.end(JSON.stringify({ error: `Remote server returned ${response.status}` }));
            return;
          }

          const text = await response.text();
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(text);
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: `Fetch failed: ${err.message}` }));
        }
      });
    }
  };
}

export default defineConfig({
  base: '/svugly/',
  plugins: [svgProxyPlugin()]
});
