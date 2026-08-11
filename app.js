const defaultRounds = [
  { id: 'taboo', name: 'Taboo', rule: 'Describe without saying the exact word.' },
  { id: 'charades', name: 'Charades', rule: 'Act it out with no words.' },
  { id: 'one-word', name: 'One Word', rule: 'Give a single-word clue only.' },
  { id: 'one-sound', name: 'One Sound', rule: 'Use one sound/noise only.' }
];

const roomForm = document.getElementById('room-form');
const roomInput = document.getElementById('room-input');
const currentRoom = document.getElementById('current-room');
const serverStatus = document.getElementById('server-status');

const apiForm = document.getElementById('api-form');
const apiInput = document.getElementById('api-input');

const playerForm = document.getElementById('player-form');
const playerInput = document.getElementById('player-input');
const currentPlayer = document.getElementById('current-player');
const playerList = document.getElementById('player-list');

const wordInput = document.getElementById('word-input');
const wordList = document.getElementById('word-list');
const duplicateWarning = document.getElementById('duplicate-warning');
const submissionForm = document.getElementById('submission-form');
const startGameButton = document.getElementById('start-game');

const roundList = document.getElementById('round-list');
const roundTitle = document.getElementById('round-title');
const roundRule = document.getElementById('round-rule');
const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const remainingEl = document.getElementById('remaining');
const cardDisplay = document.getElementById('card-display');
const correctBtn = document.getElementById('correct-btn');
const skipBtn = document.getElementById('skip-btn');
const nextRoundBtn = document.getElementById('next-round');
const gameMessage = document.getElementById('game-message');

const params = new URLSearchParams(window.location.search);
const roomFromUrl = params.get('room');
const apiFromUrl = params.get('api');

if (apiFromUrl) {
  window.localStorage.setItem('fishbowl-api-base', apiFromUrl);
}

const state = {
  roomId: normalizeRoom(roomFromUrl || 'public'),
  apiBase: String(window.localStorage.getItem('fishbowl-api-base') || ''),
  storageMode: 'server',
  cards: [],
  duplicates: [],
  players: [],
  playerId: String(window.localStorage.getItem('fishbowl-player-id') || ''),
  playerName: String(window.localStorage.getItem('fishbowl-player-name') || ''),
  rounds: defaultRounds.map((round) => ({ ...round, enabled: true })),
  game: null,
  pollingId: null
};

function normalizeRoom(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'public';
}

function roomApiUrl(path = '') {
  const base = state.apiBase.trim().replace(/\/$/, '');
  return `${base}/api/rooms/${encodeURIComponent(state.roomId)}${path}`;
}

function roomStorageKey() {
  return `fishbowl-room-${state.roomId}`;
}

function requestJson(url, options) {
  return fetch(url, options).then(async (response) => {
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (!response.ok) {
      throw Object.assign(new Error(data.message || data.error || `Request failed (${response.status})`), {
        status: response.status,
        data
      });
    }
    return data;
  });
}

function showServerError(message) {
  serverStatus.hidden = false;
  serverStatus.textContent = message;
}

function clearServerError() {
  serverStatus.hidden = true;
  serverStatus.textContent = '';
}

function writeLocalCards(cards) {
  window.localStorage.setItem(roomStorageKey(), JSON.stringify(cards));
}

function readLocalCards() {
  try {
    const raw = window.localStorage.getItem(roomStorageKey());
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function updateRoomUrl() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('room', state.roomId);
  if (state.apiBase.trim()) {
    nextUrl.searchParams.set('api', state.apiBase.trim());
  } else {
    nextUrl.searchParams.delete('api');
  }
  window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
}

function renderWordList() {
  const counts = state.cards.reduce((acc, card) => {
    const normalized = card.trim().toLowerCase();
    acc[normalized] = (acc[normalized] || 0) + 1;
    return acc;
  }, {});

  const duplicateWords = state.storageMode === 'server'
    ? state.duplicates
    : Object.entries(counts).filter(([, count]) => count > 1).map(([word]) => word);

  duplicateWarning.hidden = duplicateWords.length === 0;
  duplicateWarning.textContent = duplicateWords.length ? `Repeated word(s): ${duplicateWords.join(', ')}` : '';

  wordList.innerHTML = '';
  state.cards.forEach((card, index) => {
    const li = document.createElement('li');
    if (counts[card.trim().toLowerCase()] > 1) {
      li.classList.add('duplicate');
    }

    const text = document.createElement('span');
    text.textContent = card;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'secondary';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      try {
        if (state.storageMode === 'local') {
          state.cards.splice(index, 1);
          writeLocalCards(state.cards);
          renderWordList();
          return;
        }
        await requestJson(roomApiUrl(`/cards/${index}`), { method: 'DELETE' });
        await syncRoomState();
      } catch (error) {
        showServerError('Could not remove card. Try again.');
      }
    });

    li.append(text, removeBtn);
    wordList.appendChild(li);
  });
}

function renderPlayers() {
  playerList.innerHTML = '';
  state.players.forEach((player) => {
    const li = document.createElement('li');
    li.textContent = player.id === state.playerId ? `${player.name} (you)` : player.name;
    playerList.appendChild(li);
  });

  currentPlayer.textContent = state.playerName || 'Not joined';
}

function renderRounds() {
  roundList.innerHTML = '';
  state.rounds.forEach((round, index) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = round.enabled;
    checkbox.addEventListener('change', (event) => {
      state.rounds[index].enabled = event.target.checked;
    });

    label.append(checkbox, ` ${round.name}`);

    const controls = document.createElement('div');
    controls.className = 'round-controls';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'secondary';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      [state.rounds[index - 1], state.rounds[index]] = [state.rounds[index], state.rounds[index - 1]];
      renderRounds();
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'secondary';
    downBtn.textContent = '↓';
    downBtn.disabled = index === state.rounds.length - 1;
    downBtn.addEventListener('click', () => {
      [state.rounds[index + 1], state.rounds[index]] = [state.rounds[index], state.rounds[index + 1]];
      renderRounds();
    });

    controls.append(upBtn, downBtn);
    li.append(label, controls);
    roundList.appendChild(li);
  });
}

function renderGame() {
  if (!state.game) {
    roundTitle.textContent = 'No active game';
    roundRule.textContent = '';
    timerEl.textContent = '60';
    scoreEl.textContent = '0';
    remainingEl.textContent = '0';
    cardDisplay.textContent = 'Press start to play';
    gameMessage.textContent = '';
    nextRoundBtn.hidden = true;
    correctBtn.disabled = true;
    skipBtn.disabled = true;
    return;
  }

  roundTitle.textContent = state.game.roundTitle;
  roundRule.textContent = state.game.roundRule;
  timerEl.textContent = String(state.game.secondsLeft);
  scoreEl.textContent = String(state.game.totalScore);
  remainingEl.textContent = String(state.game.remaining);
  cardDisplay.textContent = state.game.currentCard || (state.game.status === 'complete' ? 'Nice game!' : 'Round complete!');

  const isActive = state.playerId && state.game.activePlayerId === state.playerId && state.game.status === 'running';
  correctBtn.disabled = !isActive;
  skipBtn.disabled = !isActive;
  nextRoundBtn.hidden = !state.game.nextRoundAvailable;

  const statusLine = state.storageMode === 'local'
    ? 'Single-browser mode only. Shared turn sync needs a running server API.'
    : state.game.activePlayerName
      ? `Turn: ${state.game.activePlayerName}`
      : 'No active player';

  gameMessage.textContent = [statusLine, state.game.message].filter(Boolean).join(' • ');
}

async function syncRoomState() {
  if (state.storageMode === 'local') {
    state.cards = readLocalCards();
    state.duplicates = [];
    renderWordList();
    renderPlayers();
    renderGame();
    return;
  }

  try {
    const data = await requestJson(roomApiUrl('/state'));
    state.cards = Array.isArray(data.cards) ? data.cards : [];
    state.duplicates = Array.isArray(data.duplicates) ? data.duplicates : [];
    state.players = Array.isArray(data.players) ? data.players : [];
    state.game = data.game || null;

    if (state.playerId && !state.players.some((player) => player.id === state.playerId)) {
      state.playerId = '';
      state.playerName = '';
      window.localStorage.removeItem('fishbowl-player-id');
      window.localStorage.removeItem('fishbowl-player-name');
    }

    renderWordList();
    renderPlayers();
    renderGame();
    clearServerError();
  } catch (error) {
    state.storageMode = 'local';
    state.cards = readLocalCards();
    state.players = [];
    state.game = null;
    renderWordList();
    renderPlayers();
    renderGame();
    showServerError('Server unavailable. Single-browser fallback mode is active. For cross-device sync on GitHub Pages, host server.js and set API URL.');
  }
}

async function joinPlayer(name) {
  if (state.storageMode === 'local') {
    state.playerName = name;
    state.playerId = 'local-player';
    window.localStorage.setItem('fishbowl-player-id', state.playerId);
    window.localStorage.setItem('fishbowl-player-name', state.playerName);
    renderPlayers();
    return;
  }

  const data = await requestJson(roomApiUrl('/players/join'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });

  state.playerId = data.player.id;
  state.playerName = data.player.name;
  window.localStorage.setItem('fishbowl-player-id', state.playerId);
  window.localStorage.setItem('fishbowl-player-name', state.playerName);
  await syncRoomState();
}

roomForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  state.roomId = normalizeRoom(roomInput.value || 'public');
  state.storageMode = 'server';
  updateRoomUrl();
  currentRoom.textContent = state.roomId;
  await syncRoomState();
});

apiForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  state.apiBase = apiInput.value.trim();
  window.localStorage.setItem('fishbowl-api-base', state.apiBase);
  state.storageMode = 'server';
  updateRoomUrl();
  await syncRoomState();
});

playerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = playerInput.value.trim();
  if (!name) {
    return;
  }

  try {
    await joinPlayer(name);
    playerInput.value = '';
  } catch (error) {
    showServerError('Could not join player. Try again.');
  }
});

submissionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = wordInput.value.trim();
  if (!value) {
    return;
  }

  try {
    if (state.storageMode === 'local') {
      state.cards.push(value);
      writeLocalCards(state.cards);
      renderWordList();
      wordInput.value = '';
      return;
    }

    await requestJson(roomApiUrl('/cards'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: value, playerId: state.playerId })
    });
    wordInput.value = '';
    await syncRoomState();
  } catch (error) {
    if (error.status === 409) {
      showServerError(error.message);
      return;
    }
    showServerError('Could not submit card. Try again.');
  }
});

startGameButton.addEventListener('click', async () => {
  if (state.storageMode === 'local') {
    showServerError('Start game sync requires server mode. Local fallback is single-browser only.');
    return;
  }

  if (!state.playerId) {
    showServerError('Join as a player before starting.');
    return;
  }

  if (state.rounds.every((round) => !round.enabled)) {
    window.alert('Enable at least one round to play.');
    return;
  }

  try {
    await requestJson(roomApiUrl('/game/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rounds: state.rounds })
    });
    await syncRoomState();
  } catch (error) {
    showServerError(error.message || 'Could not start game.');
  }
});

correctBtn.addEventListener('click', async () => {
  if (!state.playerId || state.storageMode === 'local') {
    return;
  }
  try {
    await requestJson(roomApiUrl('/game/action'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: state.playerId, action: 'correct' })
    });
    await syncRoomState();
  } catch (error) {
    showServerError(error.message || 'Action failed.');
  }
});

skipBtn.addEventListener('click', async () => {
  if (!state.playerId || state.storageMode === 'local') {
    return;
  }
  try {
    await requestJson(roomApiUrl('/game/action'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: state.playerId, action: 'skip' })
    });
    await syncRoomState();
  } catch (error) {
    showServerError(error.message || 'Action failed.');
  }
});

nextRoundBtn.addEventListener('click', async () => {
  if (!state.playerId || state.storageMode === 'local') {
    return;
  }
  try {
    await requestJson(roomApiUrl('/game/action'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: state.playerId, action: 'next-round' })
    });
    await syncRoomState();
  } catch (error) {
    showServerError(error.message || 'Could not start next round.');
  }
});

function startPolling() {
  if (state.pollingId) {
    clearInterval(state.pollingId);
  }
  state.pollingId = setInterval(syncRoomState, 1000);
}

window.addEventListener('storage', (event) => {
  if (event.key === roomStorageKey()) {
    syncRoomState();
  }
});

roomInput.value = state.roomId;
currentRoom.textContent = state.roomId;
apiInput.value = state.apiBase;
renderRounds();
renderGame();
renderPlayers();
syncRoomState();
startPolling();
