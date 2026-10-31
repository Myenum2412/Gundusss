import net from 'node:net';

// Fail fast when another backend instance is already running. Appwrite is the
// primary data store now, so the old PGlite port is no longer required.
const checks = [{ port: Number(process.env.PORT ?? 4000), label: 'backend API' }];

function isListening(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(true);
      else reject(err);
    });
    server.once('listening', () => server.close(() => resolve(false)));
    server.listen(port, '0.0.0.0');
  });
}

const busy = [];
for (const { port, label } of checks) {
  if (await isListening(port)) busy.push(`${port} (${label})`);
}

if (busy.length > 0) {
  console.error(
    `\nCannot start: port${busy.length > 1 ? 's' : ''} already in use: ${busy.join(', ')}.`
  );
  console.error('Another backend (or `npm run dev`) is already running.');
  console.error('Stop it first, or check with: netstat -ano | findstr :4000');
  process.exit(1);
}
