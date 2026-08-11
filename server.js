const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 8080);
const rootDir = __dirname;
const roomCards = Object.create(null);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function safeRoomId(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return normalized || 'public';
}

function ensureRoom(roomId) {
  if (!roomCards[roomId]) {
    roomCards[roomId] = [];
  }
  return roomCards[roomId];
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(reqPath, res) {
  const candidate = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = path.resolve(rootDir, `.${candidate}`);

  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const type = ext === '.html'
      ? 'text/html; charset=utf-8'
      : ext === '.css'
        ? 'text/css; charset=utf-8'
        : ext === '.js'
          ? 'application/javascript; charset=utf-8'
          : 'text/plain; charset=utf-8';

    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const apiMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/cards(?:\/(\d+))?$/);

  if (apiMatch) {
    const roomId = safeRoomId(decodeURIComponent(apiMatch[1]));
    const cards = ensureRoom(roomId);

    if (req.method === 'GET' && !apiMatch[2]) {
      sendJson(res, 200, { roomId, cards });
      return;
    }

    if (req.method === 'POST' && !apiMatch[2]) {
      try {
        const body = await parseBody(req);
        const word = String(body.word || '').trim();
        if (!word || word.length > 60) {
          sendJson(res, 400, { error: 'word must be 1-60 chars' });
          return;
        }

        cards.push(word);
        sendJson(res, 201, { roomId, cards });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'DELETE' && apiMatch[2]) {
      const index = Number(apiMatch[2]);
      if (Number.isNaN(index) || index < 0 || index >= cards.length) {
        sendJson(res, 404, { error: 'card not found' });
        return;
      }

      cards.splice(index, 1);
      sendJson(res, 200, { roomId, cards });
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  serveFile(pathname, res);
});

server.listen(port, () => {
  console.log(`Fishbowl server running on http://localhost:${port}`);
});
