const defaultRounds = [
  { id: 'taboo', name: 'Taboo', rule: 'Describe without saying the exact word.' },
  { id: 'charades', name: 'Charades', rule: 'Act it out with no words.' },
  { id: 'one-word', name: 'One Word', rule: 'Give a single-word clue only.' },
  { id: 'one-sound', name: 'One Sound', rule: 'Use one sound/noise only.' }
];

const wordInput = document.getElementById('word-input');
const wordList = document.getElementById('word-list');
const duplicateWarning = document.getElementById('duplicate-warning');
const submissionForm = document.getElementById('submission-form');
const startGameButton = document.getElementById('start-game');

const roundList = document.getElementById('round-list');
const gamePanel = document.getElementById('game-panel');
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

const state = {
  cards: [],
  rounds: defaultRounds.map((round) => ({ ...round, enabled: true })),
  currentRoundIndex: 0,
  activeDeck: [],
  currentCard: null,
  score: 0,
  secondsLeft: 60,
  timerId: null
};

function normalizeCard(value) {
  return value.trim().toLowerCase();
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderWordList() {
  const counts = state.cards.reduce((acc, card) => {
    const key = normalizeCard(card);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const duplicateWords = Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([word]) => word);

  duplicateWarning.hidden = duplicateWords.length === 0;
  duplicateWarning.textContent = duplicateWords.length
    ? `Repeated word(s): ${duplicateWords.join(', ')}`
    : '';

  wordList.innerHTML = '';
  state.cards.forEach((card, index) => {
    const li = document.createElement('li');
    if (counts[normalizeCard(card)] > 1) {
      li.classList.add('duplicate');
    }

    const text = document.createElement('span');
    text.textContent = card;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'secondary';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      state.cards.splice(index, 1);
      renderWordList();
    });

    li.append(text, removeBtn);
    wordList.appendChild(li);
  });
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

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function drawCard() {
  if (state.activeDeck.length === 0) {
    state.currentCard = null;
    cardDisplay.textContent = 'Round complete!';
    endRound('All cards guessed this round.');
    return;
  }

  state.currentCard = state.activeDeck.shift();
  cardDisplay.textContent = state.currentCard;
  remainingEl.textContent = String(state.activeDeck.length + 1);
}

function endRound(message) {
  stopTimer();
  correctBtn.disabled = true;
  skipBtn.disabled = true;
  nextRoundBtn.hidden = false;
  gameMessage.textContent = message;
}

function runTimer() {
  timerEl.textContent = String(state.secondsLeft);
  state.timerId = setInterval(() => {
    state.secondsLeft -= 1;
    timerEl.textContent = String(state.secondsLeft);
    if (state.secondsLeft <= 0) {
      endRound('Time is up!');
    }
  }, 1000);
}

function startRound() {
  const rounds = state.rounds.filter((round) => round.enabled);
  const round = rounds[state.currentRoundIndex];
  if (!round) {
    roundTitle.textContent = 'Game complete';
    roundRule.textContent = '';
    cardDisplay.textContent = 'Nice game!';
    gameMessage.textContent = `Final score: ${state.score}`;
    nextRoundBtn.hidden = true;
    return;
  }

  gamePanel.hidden = false;
  roundTitle.textContent = `Round ${state.currentRoundIndex + 1}: ${round.name}`;
  roundRule.textContent = round.rule;
  state.activeDeck = shuffle(state.cards);
  state.secondsLeft = 60;
  nextRoundBtn.hidden = true;
  gameMessage.textContent = '';
  correctBtn.disabled = false;
  skipBtn.disabled = false;
  remainingEl.textContent = String(state.activeDeck.length);
  drawCard();
  runTimer();
}

submissionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = wordInput.value.trim();
  if (!value) {
    return;
  }

  state.cards.push(value);
  wordInput.value = '';
  renderWordList();
});

startGameButton.addEventListener('click', () => {
  if (state.cards.length === 0) {
    window.alert('Add at least one card before starting.');
    return;
  }

  if (state.rounds.every((round) => !round.enabled)) {
    window.alert('Enable at least one round to play.');
    return;
  }

  state.currentRoundIndex = 0;
  state.score = 0;
  scoreEl.textContent = '0';
  startRound();
});

correctBtn.addEventListener('click', () => {
  if (!state.currentCard) {
    return;
  }

  state.score += 1;
  scoreEl.textContent = String(state.score);
  drawCard();
});

skipBtn.addEventListener('click', () => {
  if (!state.currentCard) {
    return;
  }

  state.activeDeck.push(state.currentCard);
  drawCard();
});

nextRoundBtn.addEventListener('click', () => {
  state.currentRoundIndex += 1;
  startRound();
});

renderWordList();
renderRounds();
