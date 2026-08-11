const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = Number(process.env.PORT || 8080);
const rootDir = __dirname;
const roomState = Object.create(null);
const ROUND_SECONDS = 60;

const defaultRounds = [
  { id: 'taboo', name: 'Taboo', rule: 'Describe without saying the exact word.' },
  { id: 'charades', name: 'Charades', rule: 'Act it out with no words.' },
  { id: 'one-word', name: 'One Word', rule: 'Give a single-word clue only.' },
  { id: 'one-sound', name: 'One Sound', rule: 'Use one sound/noise only.' }
];

function withCors(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers
  };
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, withCors({ 'Content-Type': 'application/json; charset=utf-8' }));
  res.end(JSON.stringify(data));
}

function safeRoomId(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return normalized || 'public';
}

function normalizeCard(value) {
  return String(value || '').trim().toLowerCase();
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createEmptyGame() {
  return {
    status: 'idle',
    rounds: defaultRounds.map((round) => ({ ...round, enabled: true })),
    currentRoundIndex: 0,
    deck: [],
    currentCard: null,
    scoreByPlayerId: Object.create(null),
    totalScore: 0,
    roundEndsAt: null,
    secondsLeft: ROUND_SECONDS,
    activePlayerIndex: -1,
    message: 'Press start to play.'
  };
}

function ensureRoom(roomId) {
  if (!roomState[roomId]) {
    roomState[roomId] = {
      cards: [],
      players: [],
      game: createEmptyGame()
    };
  }
  return roomState[roomId];
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 20000) {
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

function updateGameClock(game) {
  if (game.status !== 'running' || !game.roundEndsAt) {
    return;
  }

  const secondsLeft = Math.max(0, Math.ceil((game.roundEndsAt - Date.now()) / 1000));
  game.secondsLeft = secondsLeft;

  if (secondsLeft <= 0) {
    game.status = 'round-ended';
    game.currentCard = null;
    game.message = 'Time is up!';
  }
}

function drawCard(game) {
  if (game.deck.length === 0) {
    game.currentCard = null;
    game.status = 'round-ended';
    game.message = 'All cards guessed this round.';
    return;
  }
  game.currentCard = game.deck.shift();
}

function startRound(room) {
  const game = room.game;
  const enabledRounds = game.rounds.filter((round) => round.enabled);
  const round = enabledRounds[game.currentRoundIndex];

  if (!round) {
    game.status = 'complete';
    game.currentCard = null;
    game.secondsLeft = 0;
    game.message = 'Game complete!';
    return;
  }

  game.activePlayerIndex = room.players.length ? (game.activePlayerIndex + 1) % room.players.length : -1;
  game.status = 'running';
  game.deck = shuffle(room.cards.map((card) => card.word));
  game.roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
  game.secondsLeft = ROUND_SECONDS;
  game.message = '';
  drawCard(game);
}

function startGame(room, rounds) {
  room.game = createEmptyGame();
  room.game.rounds = Array.isArray(rounds) && rounds.length
    ? rounds
      .map((round) => {
        const defaultRound = defaultRounds.find((candidate) => candidate.id === round.id);
        return defaultRound ? { ...defaultRound, enabled: round.enabled !== false } : null;
      })
      .filter(Boolean)
    : defaultRounds.map((round) => ({ ...round, enabled: true }));

  room.players.forEach((player) => {
    room.game.scoreByPlayerId[player.id] = 0;
  });

  startRound(room);
}

function currentRound(room) {
  const enabledRounds = room.game.rounds.filter((round) => round.enabled);
  return enabledRounds[room.game.currentRoundIndex] || null;
}

function gameView(room) {
  const game = room.game;
  updateGameClock(game);
  const round = currentRound(room);
  const activePlayer = room.players[game.activePlayerIndex] || null;
  const enabledRoundCount = game.rounds.filter((entry) => entry.enabled).length;

  return {
    status: game.status,
    roundTitle: round ? `Round ${game.currentRoundIndex + 1}: ${round.name}` : 'Game complete',
    roundRule: round ? round.rule : '',
    roundIndex: game.currentRoundIndex,
    roundCount: enabledRoundCount,
    secondsLeft: game.secondsLeft,
    totalScore: game.totalScore,
    remaining: game.currentCard ? game.deck.length + 1 : game.deck.length,
    currentCard: game.currentCard,
    message: game.message,
    activePlayerId: activePlayer ? activePlayer.id : null,
    activePlayerName: activePlayer ? activePlayer.name : null,
    nextRoundAvailable: game.status === 'round-ended' && game.currentRoundIndex + 1 < enabledRoundCount,
    playerScores: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: game.scoreByPlayerId[player.id] || 0
    }))
  };
}

function roomView(roomId, room) {
  const counts = room.cards.reduce((acc, card) => {
    acc[card.normalized] = (acc[card.normalized] || 0) + 1;
    return acc;
  }, {});

  return {
    roomId,
    cards: room.cards.map((card) => card.word),
    duplicates: Object.entries(counts).filter(([, count]) => count > 1).map(([word]) => word),
    players: room.players,
    game: gameView(room)
  };
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

  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    res.writeHead(204, withCors());
    res.end();
    return;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(.+))?$/);
  if (roomMatch) {
    const roomId = safeRoomId(decodeURIComponent(roomMatch[1]));
    const room = ensureRoom(roomId);
    const tail = roomMatch[2] || '';

    if (req.method === 'GET' && (tail === '' || tail === 'state')) {
      sendJson(res, 200, roomView(roomId, room));
      return;
    }

    if (req.method === 'GET' && tail === 'cards') {
      sendJson(res, 200, { roomId, cards: room.cards.map((card) => card.word) });
      return;
    }

    if (req.method === 'POST' && tail === 'cards') {
      try {
        const body = await parseBody(req);
        const word = String(body.word || '').trim();
        const normalized = normalizeCard(word);

        if (!word || word.length > 60) {
          sendJson(res, 400, { error: 'word must be 1-60 chars' });
          return;
        }

        const duplicate = room.cards.find((card) => card.normalized === normalized);
        if (duplicate) {
          sendJson(res, 409, {
            error: 'duplicate',
            message: `"${word}" is already in the room list.`,
            cards: room.cards.map((card) => card.word)
          });
          return;
        }

        room.cards.push({
          word,
          normalized,
          submittedBy: String(body.playerId || ''),
          submittedAt: Date.now()
        });
        sendJson(res, 201, { roomId, cards: room.cards.map((card) => card.word) });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    const cardDeleteMatch = tail.match(/^cards\/(\d+)$/);
    if (req.method === 'DELETE' && cardDeleteMatch) {
      const index = Number(cardDeleteMatch[1]);
      if (Number.isNaN(index) || index < 0 || index >= room.cards.length) {
        sendJson(res, 404, { error: 'card not found' });
        return;
      }

      room.cards.splice(index, 1);
      sendJson(res, 200, { roomId, cards: room.cards.map((card) => card.word) });
      return;
    }

    if (req.method === 'POST' && tail === 'players/join') {
      try {
        const body = await parseBody(req);
        const name = String(body.name || '').trim().slice(0, 32);
        if (!name) {
          sendJson(res, 400, { error: 'name required' });
          return;
        }

        const player = {
          id: crypto.randomUUID(),
          name
        };
        room.players.push(player);
        if (!(player.id in room.game.scoreByPlayerId)) {
          room.game.scoreByPlayerId[player.id] = 0;
        }
        sendJson(res, 201, { player, players: room.players });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'GET' && tail === 'game') {
      sendJson(res, 200, { roomId, game: gameView(room) });
      return;
    }

    if (req.method === 'POST' && tail === 'game/start') {
      try {
        const body = await parseBody(req);
        if (room.cards.length === 0) {
          sendJson(res, 400, { error: 'add at least one card' });
          return;
        }
        if (room.players.length === 0) {
          sendJson(res, 400, { error: 'join at least one player' });
          return;
        }

        startGame(room, body.rounds);
        sendJson(res, 200, { roomId, game: gameView(room) });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && tail === 'game/action') {
      try {
        const body = await parseBody(req);
        const playerId = String(body.playerId || '');
        const action = String(body.action || '');
        const player = room.players.find((entry) => entry.id === playerId);

        updateGameClock(room.game);

        if (!player) {
          sendJson(res, 403, { error: 'player not joined' });
          return;
        }

        const activePlayer = room.players[room.game.activePlayerIndex];
        if (action !== 'next-round' && (!activePlayer || activePlayer.id !== playerId)) {
          sendJson(res, 403, { error: 'not your turn' });
          return;
        }

        if (action === 'correct') {
          if (room.game.status !== 'running' || !room.game.currentCard) {
            sendJson(res, 400, { error: 'round not active' });
            return;
          }
          room.game.totalScore += 1;
          room.game.scoreByPlayerId[playerId] = (room.game.scoreByPlayerId[playerId] || 0) + 1;
          drawCard(room.game);
          sendJson(res, 200, { roomId, game: gameView(room) });
          return;
        }

        if (action === 'skip') {
          if (room.game.status !== 'running' || !room.game.currentCard) {
            sendJson(res, 400, { error: 'round not active' });
            return;
          }
          room.game.deck.push(room.game.currentCard);
          drawCard(room.game);
          sendJson(res, 200, { roomId, game: gameView(room) });
          return;
        }

        if (action === 'next-round') {
          if (room.game.status !== 'round-ended') {
            sendJson(res, 400, { error: 'current round not ended' });
            return;
          }
          room.game.currentRoundIndex += 1;
          startRound(room);
          sendJson(res, 200, { roomId, game: gameView(room) });
          return;
        }

        sendJson(res, 400, { error: 'unknown action' });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
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
