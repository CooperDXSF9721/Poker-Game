const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }
  reset() {
    this.cards = [];
    for (let suit of SUITS) {
      for (let value of VALUES) {
        this.cards.push({ suit, value });
      }
    }
    this.shuffle();
  }
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  pop() { return this.cards.pop(); }
}

// Global Networking & Game Variables
let peer = null;
let connections = []; // Host tracks connections to clients
let hostConn = null;  // Client track connection to host
let isHost = false;
let myPeerId = "";
let myName = "Player";

let gameState = {
  players: [], // Array of { id, name, chips, currentBet, hand: [], folded: false }
  communityCards: [],
  pot: 0,
  currentHighBet: 0,
  dealerIndex: 0,
  activePlayerIndex: 0,
  lastRaiserIndex: 0,
  gameStage: 'idle', // 'preflop', 'flop', 'turn', 'river', 'showdown', 'idle'
  message: 'Waiting for players to join...'
};

// DOM Cache
const lobbyModal = document.getElementById('lobby-modal');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const joinCodeInput = document.getElementById('join-code-input');
const playerNameInput = document.getElementById('player-name-input');
const lobbyStatus = document.getElementById('lobby-status');

const displayRoomCode = document.getElementById('display-room-code');
const btnCopyCode = document.getElementById('btn-copy-code');

const btnDeal = document.getElementById('btn-deal');
const btnFold = document.getElementById('btn-fold');
const btnCheck = document.getElementById('btn-check');
const btnCall = document.getElementById('btn-call');
const btnRaise = document.getElementById('btn-raise');
const raiseInput = document.getElementById('raise-amount');
const messageBoard = document.getElementById('message-board');

// ---------------- LOBBY & NETWORKING (PeerJS) ----------------
btnCreateRoom.addEventListener('click', () => {
  myName = playerNameInput.value.trim() || "Host";
  isHost = true;
  lobbyStatus.textContent = "Creating room...";

  // Create Peer with random short ID
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  peer = new Peer(roomCode);

  peer.on('open', (id) => {
    myPeerId = id;
    displayRoomCode.textContent = id;
    lobbyModal.style.display = 'none';

    // Add Host as Player 0
    gameState.players.push({
      id: myPeerId,
      name: myName,
      chips: 1000,
      currentBet: 0,
      hand: [],
      folded: false
    });

    renderUI();
  });

  peer.on('connection', (conn) => {
    connections.push(conn);
    conn.on('data', (data) => handleHostReceiveData(conn, data));
    conn.on('close', () => {
      gameState.players = gameState.players.filter(p => p.id !== conn.peer);
      broadcastState();
    });
  });

  peer.on('error', (err) => {
    lobbyStatus.textContent = "Error creating room. Try again.";
  });
});

btnJoinRoom.addEventListener('click', () => {
  myName = playerNameInput.value.trim() || "Player";
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) { lobbyStatus.textContent = "Enter a valid code!"; return; }

  isHost = false;
  lobbyStatus.textContent = "Connecting to room...";

  peer = new Peer();
  peer.on('open', (id) => {
    myPeerId = id;
    hostConn = peer.connect(code);

    hostConn.on('open', () => {
      displayRoomCode.textContent = code;
      lobbyModal.style.display = 'none';
      // Register with host
      hostConn.send({ type: 'JOIN', name: myName, id: myPeerId });
    });

    hostConn.on('data', (data) => {
      if (data.type === 'SYNC') {
        gameState = data.state;
        renderUI();
      }
    });

    hostConn.on('error', () => {
      lobbyStatus.textContent = "Could not connect to host.";
    });
  });
});

btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(displayRoomCode.textContent);
  btnCopyCode.textContent = "Copied!";
  setTimeout(() => btnCopyCode.textContent = "Copy Code", 2000);
});

// ---------------- HOST STATE BROADCASTING ----------------
function broadcastState() {
  if (!isHost) return;
  
  // Send personalized state to each client (hiding other players' hidden cards)
  connections.forEach(conn => {
    const sanitizedState = JSON.parse(JSON.stringify(gameState));
    if (gameState.gameStage !== 'showdown') {
      sanitizedState.players.forEach(p => {
        if (p.id !== conn.peer) p.hand = p.hand.map(() => ({ hidden: true }));
      });
    }
    conn.send({ type: 'SYNC', state: sanitizedState });
  });

  renderUI();
}

function handleHostReceiveData(conn, data) {
  if (data.type === 'JOIN') {
    gameState.players.push({
      id: data.id,
      name: data.name,
      chips: 1000,
      currentBet: 0,
      hand: [],
      folded: false
    });
    gameState.message = `${data.name} joined the table.`;
    broadcastState();
  } else if (data.type === 'ACTION') {
    handlePlayerAction(data.id, data.action, data.amount);
  }
}

// ---------------- GAME LOGIC (HOST DRIVEN) ----------------
btnDeal.addEventListener('click', () => {
  if (!isHost) return;
  if (gameState.players.length < 2) {
    gameState.message = "Need at least 2 players to start!";
    broadcastState();
    return;
  }
  startNewHandHost();
});

function startNewHandHost() {
  const deck = new Deck();
  gameState.communityCards = [];
  gameState.pot = 0;
  gameState.currentHighBet = 0;

  gameState.players.forEach(p => {
    p.hand = [deck.pop(), deck.pop()];
    p.currentBet = 0;
    p.folded = false;
  });

  // Rotate Dealer
  gameState.dealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;

  // Post Blinds: SB (Dealer+1), BB (Dealer+2)
  const sbIdx = (gameState.dealerIndex + 1) % gameState.players.length;
  const bbIdx = (gameState.dealerIndex + 2) % gameState.players.length;

  postBetHost(gameState.players[sbIdx], 10);
  postBetHost(gameState.players[bbIdx], 20);
  gameState.currentHighBet = 20;

  gameState.activePlayerIndex = (bbIdx + 1) % gameState.players.length;
  gameState.lastRaiserIndex = bbIdx;
  gameState.gameStage = 'preflop';
  gameState.message = `Hand started. ${gameState.players[sbIdx].name} posted SB ($10), ${gameState.players[bbIdx].name} posted BB ($20).`;

  // Save remaining deck on host
  hostDeck = deck;
  broadcastState();
}

let hostDeck = null;

function postBetHost(player, amount) {
  const actual = Math.min(amount, player.chips);
  player.chips -= actual;
  player.currentBet += actual;
  gameState.pot += actual;
}

function handlePlayerAction(playerId, action, amount = 0) {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player || gameState.players[gameState.activePlayerIndex].id !== playerId) return;

  if (action === 'fold') {
    player.folded = true;
    gameState.message = `${player.name} folded.`;
  } else if (action === 'check') {
    gameState.message = `${player.name} checked.`;
  } else if (action === 'call') {
    const toCall = gameState.currentHighBet - player.currentBet;
    postBetHost(player, toCall);
    gameState.message = `${player.name} called $${toCall}.`;
  } else if (action === 'raise') {
    const added = amount - player.currentBet;
    postBetHost(player, added);
    gameState.currentHighBet = player.currentBet;
    gameState.lastRaiserIndex = gameState.activePlayerIndex;
    gameState.message = `${player.name} raised to $${gameState.currentHighBet}.`;
  }

  moveToNextPlayerHost();
}

function moveToNextPlayerHost() {
  const activePlayers = gameState.players.filter(p => !p.folded);
  
  if (activePlayers.length === 1) {
    activePlayers[0].chips += gameState.pot;
    gameState.message = `${activePlayers[0].name} wins $${gameState.pot} (Everyone else folded)!`;
    endHandHost();
    return;
  }

  // Find next non-folded player
  do {
    gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
  } while (gameState.players[gameState.activePlayerIndex].folded);

  // Check if betting round complete
  const everyoneMatched = activePlayers.every(p => p.currentBet === gameState.currentHighBet);
  if (everyoneMatched && gameState.activePlayerIndex === gameState.lastRaiserIndex) {
    advanceStageHost();
  } else {
    broadcastState();
  }
}

function advanceStageHost() {
  gameState.players.forEach(p => p.currentBet = 0);
  gameState.currentHighBet = 0;

  if (gameState.gameStage === 'preflop') {
    gameState.gameStage = 'flop';
    gameState.communityCards.push(hostDeck.pop(), hostDeck.pop(), hostDeck.pop());
  } else if (gameState.gameStage === 'flop') {
    gameState.gameStage = 'turn';
    gameState.communityCards.push(hostDeck.pop());
  } else if (gameState.gameStage === 'turn') {
    gameState.gameStage = 'river';
    gameState.communityCards.push(hostDeck.pop());
  } else if (gameState.gameStage === 'river') {
    gameState.gameStage = 'showdown';
    resolveShowdownHost();
    return;
  }

  gameState.activePlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
  while (gameState.players[gameState.activePlayerIndex].folded) {
    gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
  }
  gameState.lastRaiserIndex = gameState.activePlayerIndex;

  gameState.message = `Advanced to ${gameState.gameStage.toUpperCase()}. Action is on ${gameState.players[gameState.activePlayerIndex].name}.`;
  broadcastState();
}

function resolveShowdownHost() {
  let bestScore = -1;
  let winners = [];

  gameState.players.forEach(p => {
    if (!p.folded) {
      const score = evaluateHand(p.hand.concat(gameState.communityCards));
      if (score > bestScore) {
        bestScore = score;
        winners = [p];
      } else if (score === bestScore) {
        winners.push(p);
      }
    }
  });

  const share = Math.floor(gameState.pot / winners.length);
  winners.forEach(w => w.chips += share);
  
  gameState.message = `Showdown! ${winners.map(w => w.name).join(', ')} wins $${gameState.pot}!`;
  endHandHost();
}

function endHandHost() {
  gameState.gameStage = 'idle';
  broadcastState();
}

// ---------------- ACTION BUTTON EVENT LISTENERS ----------------
btnFold.addEventListener('click', () => sendAction('fold'));
btnCheck.addEventListener('click', () => sendAction('check'));
btnCall.addEventListener('click', () => sendAction('call'));
btnRaise.addEventListener('click', () => sendAction('raise', parseInt(raiseInput.value, 10)));

function sendAction(action, amount = 0) {
  if (isHost) {
    handlePlayerAction(myPeerId, action, amount);
  } else {
    hostConn.send({ type: 'ACTION', id: myPeerId, action, amount });
  }
}

// ---------------- UI RENDER ----------------
function renderUI() {
  messageBoard.textContent = gameState.message;
  document.getElementById('pot-amount').textContent = gameState.pot;

  // Host button controls
  btnDeal.disabled = !isHost || gameState.gameStage !== 'idle' || gameState.players.length < 2;

  const opponentsContainer = document.getElementById('opponents-container');
  opponentsContainer.innerHTML = '';

  const hero = gameState.players.find(p => p.id === myPeerId);

  gameState.players.forEach((p, idx) => {
    const isHero = p.id === myPeerId;
    if (isHero) {
      document.getElementById('hero-name').textContent = `${p.name} (You)${idx === gameState.dealerIndex ? ' (D)' : ''}`;
      document.getElementById('hero-chips').textContent = p.chips;
      document.getElementById('hero-bet').textContent = p.currentBet;

      const heroCardsEl = document.getElementById('hero-cards');
      heroCardsEl.innerHTML = '';
      p.hand.forEach(c => heroCardsEl.appendChild(createCardUI(c)));
    } else {
      // Create opponent node dynamically
      const oppDiv = document.createElement('div');
      oppDiv.className = 'player-area';
      oppDiv.innerHTML = `
        <div class="status-badge">${p.name}${idx === gameState.dealerIndex ? ' (D)' : ''}${p.folded ? ' [FOLD]' : ''}</div>
        <div class="cards" id="cards-opp-${idx}"></div>
        <div class="chips">Chips: $${p.chips}</div>
        <div class="bet">Bet: $${p.currentBet}</div>
      `;
      opponentsContainer.appendChild(oppDiv);

      const cardsEl = oppDiv.querySelector(`#cards-opp-${idx}`);
      p.hand.forEach(c => cardsEl.appendChild(createCardUI(c, c.hidden)));
    }
  });

  // Render Community Cards
  const commEl = document.getElementById('community-cards');
  commEl.innerHTML = '';
  gameState.communityCards.forEach(c => commEl.appendChild(createCardUI(c)));

  // Enable/Disable Hero Turn Buttons
  const isMyTurn = gameState.players[gameState.activePlayerIndex]?.id === myPeerId && gameState.gameStage !== 'idle';
  
  if (isMyTurn && hero && !hero.folded) {
    const toCall = gameState.currentHighBet - hero.currentBet;
    btnFold.disabled = false;
    btnCheck.disabled = toCall > 0;
    btnCall.disabled = toCall === 0;
    btnCall.textContent = toCall > 0 ? `Call $${toCall}` : 'Call';

    const minRaise = gameState.currentHighBet + 20;
    raiseInput.min = minRaise;
    if (parseInt(raiseInput.value, 10) < minRaise) raiseInput.value = minRaise;
    btnRaise.disabled = hero.chips <= toCall;
  } else {
    btnFold.disabled = true;
    btnCheck.disabled = true;
    btnCall.disabled = true;
    btnRaise.disabled = true;
  }
}

function createCardUI(card, isHidden = false) {
  const cardDiv = document.createElement('div');
  if (isHidden || !card || card.hidden) {
    cardDiv.className = 'card back';
    return cardDiv;
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  cardDiv.className = `card ${isRed ? 'red' : 'black'}`;
  cardDiv.innerHTML = `
    <div>${card.value}</div>
    <div class="card-suit">${card.suit}</div>
  `;
  return cardDiv;
}

function evaluateHand(cards) {
  const ranks = cards.map(c => VALUES.indexOf(c.value)).sort((a, b) => b - a);
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);

  const values = Object.values(counts);
  const maxCount = Math.max(...values);

  if (maxCount === 4) return 700 + ranks[0]; 
  if (values.includes(3) && values.includes(2)) return 600 + ranks[0]; 
  if (maxCount === 3) return 300 + ranks[0]; 
  if (values.filter(v => v === 2).length >= 2) return 200 + ranks[0]; 
  if (maxCount === 2) return 100 + ranks[0]; 
  return ranks[0];
}
