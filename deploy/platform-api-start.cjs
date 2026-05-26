const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const entryPath = path.resolve(__dirname, '..', 'packages', 'server', 'dist', 'index.js');
  const mod = await import(pathToFileURL(entryPath).href);
  const config = mod.loadConfig(process.env);
  const server = await mod.startPlatformApiServer(config);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(`Platform API listening on http://${config.host}:${port}`);
  console.log(`Database: ${config.databaseUrl}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
