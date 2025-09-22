import { createServer } from 'http';
import next from 'next';
import { WebSocketChatServer } from './websocket-server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server: ReturnType<typeof createServer> | null = null;
let wsServer: WebSocketChatServer | null = null;

export async function startServer() {
  if (server) return;

  await app.prepare();

  server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error('Error occurred handling request:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  // WebSocketサーバー初期化
  wsServer = new WebSocketChatServer(server);

  server.listen(port, (err?: any) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  // グレースフルシャットダウン
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

function gracefulShutdown() {
  console.log('Graceful shutdown initiated...');

  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}