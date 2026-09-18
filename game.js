// ==========================================
// SINGLE-SOURCE POKER ENGINE (TESTING / INFINITE MONEY)
// ==========================================

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class Deck {
  constructor() {
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
  draw() { return this.cards.pop(); }
}

// ---------------- GAME STATE & NETWORKING ----------------
let peer = null;
let connections = [];
let hostConn = null;
let isHost = false;
let myPeerId = "";
let myName = "Player";
let activeDeck = null;
let currentSessionMode = 'ranked';
let currentSessionBuyIn = 1000;

let gameState = {
  mode: 'ranked',
  buyIn: 1000,
  bigBlind: 20,
  smallBlind: 10,
  players: [],
  communityCards: [],
  pot: 0,
  currentHighBet: 0,
  minRaiseAmount: 20,
  dealerIndex: 0,
  activePlayerIndex: 0,
  lastRaiserIndex: -1,
  gameStage: 'idle',
  message: 'Waiting for players...'
};

// DOM Cache
const lobbyModal = document.getElementById('lobby-modal');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const hostBuyinInput = document.getElementById('host-buyin-input');

const joinCodeInput = document.getElementById('join-code-input');
const playerNameInput = document.getElementById('player-name-input');
const lobbyStatus = document.getElementById('lobby-status');

const displayRoomCode = document.getElementById('display-room-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnLeaveRoom = document.getElementById('btn-leave-room');

const btnDeal = document.getElementById('btn-deal');
const btnFold = document.getElementById('btn-fold');
const btnCheck = document.getElementById('btn-check');
const btnCall = document.getElementById('btn-call');
const btnRaise = document.getElementById('btn-raise');
const raiseInput = document.getElementById('raise-amount');
const messageBoard = document.getElementById('message-board');

// ---------------- PUBLIC MATCHMAKING ----------------
document.querySelectorAll('.btn-public').forEach(btn => {
  btn.addEventListener('click', () => {
    const tier = btn.dataset.tier;
    const inputEl = document.getElementById(`public-buyin-${tier}`);
    let buyIn = parseInt(inputEl.value, 10);

    if (isNaN(buyIn) || buyIn <= 0) {
      lobbyStatus.textContent = `Please enter a valid buy-in amount!`;
      return;
    }
    joinPublicTable(buyIn);
  });
});

function joinPublicTable(buyIn) {
  myName = playerNameInput.value.trim() || "Player";
  currentSessionMode = 'ranked';
  currentSessionBuyIn = buyIn;

  const publicRoomCode = `PUBLIC_POKER_${buyIn}`;
  lobbyStatus.textContent = `Connecting to $${buyIn.toLocaleString()} Public Table...`;

  peer = new Peer();
  peer.on('open', (id) => {
    myPeerId = id;
    hostConn = peer.connect(publicRoomCode);
    let connected = false;

    hostConn.on('open', () => {
      connected = true;
      displayRoomCode.textContent = publicRoomCode;
      if (lobbyModal) lobbyModal.style.display = 'none';
      hostConn.send({ type: 'JOIN', name: myName, id: myPeerId });
    });

    hostConn.on('data', (data) => {
      if (data.type === 'SYNC') {
        gameState = data.state;
        render();
      }
    });

    setTimeout(() => {
      if (!connected) {
        peer.destroy();
        hostPublicTable(publicRoomCode, buyIn);
      }
    }, 1500);
  });

  peer.on('error', () => hostPublicTable(publicRoomCode, buyIn));
}

function hostPublicTable(roomCode, buyIn) {
  lobbyStatus.textContent = `Creating Public Table for $${buyIn.toLocaleString()}...`;

  isHost = true;
  peer = new Peer(roomCode);

  peer.on('open', (id) => {
    myPeerId = id;
    displayRoomCode.textContent = roomCode;
    if (lobbyModal) lobbyModal.style.display = 'none';

    setupBlinds(buyIn);
    initGameState(buyIn, 'ranked');
    addPlayerToState(myPeerId, myName, buyIn);
    render();
  });

  peer.on('connection', (conn) => {
    connections.push(conn);
    conn.on('data', (data) => handleHostMessage(conn, data));
    conn.on('close', () => {
      gameState.players = gameState.players.filter(p => p.id !== conn.peer);
      syncAndRender();
    });
  });
}

function setupBlinds(buyIn) {
  gameState.bigBlind = Math.max(20, Math.floor(buyIn / 50));
  gameState.smallBlind = Math.floor(gameState.bigBlind / 2);
}

function initGameState(buyIn, mode) {
  gameState.mode = mode;
  gameState.buyIn = buyIn;
  gameState.players = [];
  gameState.communityCards = [];
  gameState.pot = 0;
  gameState.gameStage = 'idle';
  gameState.message = 'Waiting for players...';
}

function addPlayerToState(id, name, chips) {
  const exists = gameState.players.some(p => p.id === id);
  if (!exists) {
    gameState.players.push({
      id,
      name,
      chips,
      currentBet: 0,
      hand: [],
      folded: false,
      allIn: false,
      actedThisRound: false
    });
  }
}

if (btnCreateRoom) {
  btnCreateRoom.addEventListener('click', () => {
    myName = playerNameInput.value.trim() || "Host";
    currentSessionMode = 'ranked';
    currentSessionBuyIn = parseInt(hostBuyinInput.value, 10);

    if (isNaN(currentSessionBuyIn) || currentSessionBuyIn <= 0) {
      lobbyStatus.textContent = "Buy-in must be greater than $0!";
      return;
    }

    isHost = true;
    lobbyStatus.textContent = "Creating room...";
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    peer = new Peer(roomCode);
    peer.on('open', (id) => {
      myPeerId = id;
      displayRoomCode.textContent = id;
      if (lobbyModal) lobbyModal.style.display = 'none';

      setupBlinds(currentSessionBuyIn);
      initGameState(currentSessionBuyIn, currentSessionMode);
      addPlayerToState(myPeerId, myName, currentSessionBuyIn);
      render();
    });

    peer.on('connection', (conn) => {
      connections.push(conn);
      conn.on('data', (data) => handleHostMessage(conn, data));
      conn.on('close', () => {
        gameState.players = gameState.players.filter(p => p.id !== conn.peer);
        syncAndRender();
      });
    });
  });
}

if (btnJoinRoom) {
  btnJoinRoom.addEventListener('click', () => {
    myName = playerNameInput.value.trim() || "Player";
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) return;

    isHost = false;
    lobbyStatus.textContent = "Connecting...";

    peer = new Peer();
    peer.on('open', (id) => {
      myPeerId = id;
      hostConn = peer.connect(code);

      hostConn.on('open', () => {
        hostConn.send({ type: 'REQ_JOIN_INFO' });
      });

      hostConn.on('data', (data) => {
        if (data.type === 'JOIN_INFO') {
          displayRoomCode.textContent = code;
          if (lobbyModal) lobbyModal.style.display = 'none';
          hostConn.send({ type: 'JOIN', name: myName, id: myPeerId });
        } else if (data.type === 'SYNC') {
          gameState = data.state;
          render();
        }
      });
    });
  });
}

if (btnLeaveRoom) btnLeaveRoom.addEventListener('click', () => {
  if (peer) peer.destroy();
  location.reload();
});

if (btnCopyCode) {
  btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(displayRoomCode.textContent);
    btnCopyCode.textContent = "Copied!";
    setTimeout(() => btnCopyCode.textContent = "Copy Code", 2000);
  });
}

// ---------------- HOST NETWORK HANDLER ----------------
function syncAndRender() {
  if (!isHost) return;
  connections.forEach(conn => {
    const cleanState = JSON.parse(JSON.stringify(gameState));
    if (gameState.gameStage !== 'showdown') {
      cleanState.players.forEach(p => {
        if (p.id !== conn.peer) p.hand = p.hand.map(() => ({ hidden: true }));
      });
    }
    conn.send({ type: 'SYNC', state: cleanState });
  });
  render();
}

function handleHostMessage(conn, data) {
  if (data.type === 'REQ_JOIN_INFO') {
    conn.send({ type: 'JOIN_INFO', mode: gameState.mode, buyIn: gameState.buyIn });
  } else if (data.type === 'JOIN') {
    if (gameState.gameStage !== 'idle') {
      conn.send({ type: 'SYNC', state: gameState });
      return;
    }
    addPlayerToState(data.id, data.name, gameState.buyIn);
    gameState.message = `${data.name} joined.`;
    syncAndRender();
  } else if (data.type === 'ACTION') {
    processPlayerAction(data.id, data.action, data.targetBet);
  }
}

// ---------------- GAME FLOW CONTROL ----------------
if (btnDeal) {
  btnDeal.addEventListener('click', () => {
    if (!isHost) return;
    const eligible = gameState.players.filter(p => p.chips > 0);
    if (eligible.length < 2) {
      gameState.message = "Need at least 2 active players to start!";
      syncAndRender();
      return;
    }
    startHand();
  });
}

function getNextPlayerIndex(currIdx) {
  let idx = (currIdx + 1) % gameState.players.length;
  let count = 0;
  while ((gameState.players[idx].folded || gameState.players[idx].allIn) && count < gameState.players.length) {
    idx = (idx + 1) % gameState.players.length;
    count++;
  }
  return idx;
}

function startHand() {
  activeDeck = new Deck();
  gameState.communityCards = [];
  gameState.pot = 0;
  gameState.currentHighBet = gameState.bigBlind;
  gameState.minRaiseAmount = gameState.bigBlind;

  gameState.players.forEach(p => {
    if (p.chips > 0) {
      p.hand = [activeDeck.draw(), activeDeck.draw()];
      p.currentBet = 0;
      p.folded = false;
      p.allIn = false;
      p.actedThisRound = false;
    } else {
      p.folded = true;
      p.hand = [];
    }
  });

  // Advance Dealer
  do {
    gameState.dealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
  } while (gameState.players[gameState.dealerIndex].chips <= 0);

  const activeCount = gameState.players.filter(p => !p.folded).length;
  let sbIdx, bbIdx, utgIdx;

  if (activeCount === 2) {
    sbIdx = gameState.dealerIndex;
    bbIdx = getNextPlayerIndex(sbIdx);
    utgIdx = sbIdx;
  } else {
    sbIdx = getNextPlayerIndex(gameState.dealerIndex);
    bbIdx = getNextPlayerIndex(sbIdx);
    utgIdx = getNextPlayerIndex(bbIdx);
  }

  // Post Blinds
  commitBet(gameState.players[sbIdx], gameState.smallBlind);
  commitBet(gameState.players[bbIdx], gameState.bigBlind);

  gameState.players.forEach(p => p.actedThisRound = false);

  gameState.activePlayerIndex = utgIdx;
  gameState.lastRaiserIndex = bbIdx;
  gameState.gameStage = 'preflop';

  updateTurnMessage();
  syncAndRender();
}

function commitBet(player, amount) {
  const actual = Math.min(amount, player.chips);
  player.chips -= actual;
  player.currentBet += actual;
  gameState.pot += actual;
  if (player.chips === 0) player.allIn = true;
}

function updateTurnMessage() {
  const active = gameState.players[gameState.activePlayerIndex];
  const toCall = Math.max(0, gameState.currentHighBet - active.currentBet);
  const detailText = toCall === 0 ? "Option: CHECK or RAISE" : `To Call: $${toCall}`;
  gameState.message = `Turn: ${active.name} (${detailText})`;
}

function processPlayerAction(playerId, action, targetBet = 0) {
  const player = gameState.players[gameState.activePlayerIndex];
  if (!player || player.id !== playerId) return;

  const toCall = Math.max(0, gameState.currentHighBet - player.currentBet);

  if (action === 'fold') {
    player.folded = true;
  } else if (action === 'check') {
    if (toCall > 0) return;
  } else if (action === 'call') {
    commitBet(player, toCall);
  } else if (action === 'raise') {
    const additional = targetBet - player.currentBet;
    if (additional > player.chips) return;

    const raiseAmount = targetBet - gameState.currentHighBet;
    commitBet(player, additional);

    gameState.minRaiseAmount = Math.max(gameState.bigBlind, raiseAmount);
    gameState.currentHighBet = player.currentBet;
    gameState.lastRaiserIndex = gameState.activePlayerIndex;

    gameState.players.forEach((p, idx) => {
      if (idx !== gameState.activePlayerIndex && !p.folded && !p.allIn) {
        p.actedThisRound = false;
      }
    });
  }

  player.actedThisRound = true;
  advanceTurn();
}

function advanceTurn() {
  const survivors = gameState.players.filter(p => !p.folded);

  if (survivors.length === 1) {
    survivors[0].chips += gameState.pot;
    gameState.message = `${survivors[0].name} wins $${gameState.pot}!`;
    endHand();
    return;
  }

  const activeUnallin = survivors.filter(p => !p.allIn);
  const allMatched = survivors.every(p => p.currentBet === gameState.currentHighBet || p.allIn);
  const allActed = activeUnallin.every(p => p.actedThisRound);

  if (activeUnallin.length <= 1 && allMatched) {
    autoCompleteHand();
    return;
  }

  if (allMatched && allActed) {
    nextStage();
  } else {
    gameState.activePlayerIndex = getNextPlayerIndex(gameState.activePlayerIndex);
    updateTurnMessage();
    syncAndRender();
  }
}

function nextStage() {
  refundUncalledBets();

  gameState.players.forEach(p => {
    p.currentBet = 0;
    p.actedThisRound = false;
  });
  gameState.currentHighBet = 0;
  gameState.minRaiseAmount = gameState.bigBlind;

  if (gameState.gameStage === 'preflop') {
    gameState.gameStage = 'flop';
    gameState.communityCards.push(activeDeck.draw(), activeDeck.draw(), activeDeck.draw());
  } else if (gameState.gameStage === 'flop') {
    gameState.gameStage = 'turn';
    gameState.communityCards.push(activeDeck.draw());
  } else if (gameState.gameStage === 'turn') {
    gameState.gameStage = 'river';
    gameState.communityCards.push(activeDeck.draw());
  } else if (gameState.gameStage === 'river') {
    gameState.gameStage = 'showdown';
    resolveWinners();
    return;
  }

  gameState.activePlayerIndex = getNextPlayerIndex(gameState.dealerIndex);
  updateTurnMessage();
  syncAndRender();
}

function refundUncalledBets() {
  const active = gameState.players.filter(p => !p.folded);
  if (active.length <= 1) return;

  const sortedBets = active.map(p => p.currentBet).sort((a, b) => b - a);
  const highest = sortedBets[0];
  const second = sortedBets[1] || 0;

  if (highest > second) {
    const diff = highest - second;
    const overbettor = active.find(p => p.currentBet === highest);
    if (overbettor) {
      overbettor.chips += diff;
      overbettor.currentBet -= diff;
      gameState.pot -= diff;
      gameState.currentHighBet = second;
    }
  }
}

function autoCompleteHand() {
  refundUncalledBets();
  while (gameState.communityCards.length < 5) {
    gameState.communityCards.push(activeDeck.draw());
  }
  gameState.gameStage = 'showdown';
  resolveWinners();
}

function resolveWinners() {
  const contenders = gameState.players.filter(p => !p.folded);
  contenders.forEach(p => {
    p.score = evaluate7Cards(p.hand.concat(gameState.communityCards));
  });

  contenders.sort((a, b) => b.score - a.score);
  const bestScore = contenders[0].score;
  const winners = contenders.filter(p => p.score === bestScore);

  const splitPot = Math.floor(gameState.pot / winners.length);
  winners.forEach(w => w.chips += splitPot);

  gameState.message = `Showdown! ${winners.map(w => w.name).join(', ')} wins $${gameState.pot}!`;
  endHand();
}

function endHand() {
  gameState.gameStage = 'idle';
  syncAndRender();
}

// ---------------- CONTROLS ----------------
if (btnFold) btnFold.addEventListener('click', () => dispatchAction('fold'));
if (btnCheck) btnCheck.addEventListener('click', () => dispatchAction('check'));
if (btnCall) btnCall.addEventListener('click', () => dispatchAction('call'));
if (btnRaise) {
  btnRaise.addEventListener('click', () => {
    const targetBet = parseInt(raiseInput.value, 10);
    if (isNaN(targetBet)) return;
    dispatchAction('raise', targetBet);
  });
}

function dispatchAction(action, targetBet = 0) {
  if (isHost) {
    processPlayerAction(myPeerId, action, targetBet);
  } else {
    hostConn.send({ type: 'ACTION', id: myPeerId, action, targetBet });
  }
}

// ---------------- UI RENDERING ----------------
function render() {
  if (messageBoard) messageBoard.textContent = gameState.message;
  const potEl = document.getElementById('pot-amount');
  if (potEl) potEl.textContent = gameState.pot;

  if (btnDeal) {
    btnDeal.disabled = !isHost || gameState.gameStage !== 'idle' || gameState.players.filter(p => p.chips > 0).length < 2;
  }

  const opponentsContainer = document.getElementById('opponents-container');
  if (opponentsContainer) opponentsContainer.innerHTML = '';

  const hero = gameState.players.find(p => p.id === myPeerId);

  gameState.players.forEach((p, idx) => {
    const isHero = p.id === myPeerId;
    const isTurn = idx === gameState.activePlayerIndex && gameState.gameStage !== 'idle';

    let status = "";
    if (idx === gameState.dealerIndex) status += " (D)";
    if (p.folded) status += " [FOLD]";
    if (p.allIn) status += " [ALL-IN]";

    if (isHero) {
      const heroBadge = document.getElementById('hero-name');
      if (heroBadge) {
        heroBadge.textContent = `${p.name} (You)${status}`;
        heroBadge.className = `status-badge ${isTurn ? 'active-turn' : ''}`;
      }

      const hChips = document.getElementById('hero-chips');
      if (hChips) hChips.textContent = p.chips;

      const hBet = document.getElementById('hero-bet');
      if (hBet) hBet.textContent = p.currentBet;

      const heroCardsEl = document.getElementById('hero-cards');
      if (heroCardsEl) {
        heroCardsEl.innerHTML = '';
        p.hand.forEach(c => heroCardsEl.appendChild(renderCard(c)));
      }
    } else if (opponentsContainer) {
      const div = document.createElement('div');
      div.className = 'player-area';
      div.innerHTML = `
        <div class="status-badge ${isTurn ? 'active-turn' : ''}">${p.name}${status}</div>
        <div class="cards" id="cards-opp-${idx}"></div>
        <div class="chips">Chips: $${p.chips}</div>
        <div class="bet">Bet: $${p.currentBet}</div>
      `;
      opponentsContainer.appendChild(div);

      const cardsEl = div.querySelector(`#cards-opp-${idx}`);
      p.hand.forEach(c => cardsEl.appendChild(renderCard(c, c.hidden)));
    }
  });

  const commEl = document.getElementById('community-cards');
  if (commEl) {
    commEl.innerHTML = '';
    gameState.communityCards.forEach(c => commEl.appendChild(renderCard(c)));
  }

  // UI Action Controls
  const isMyTurn = gameState.players[gameState.activePlayerIndex]?.id === myPeerId && gameState.gameStage !== 'idle';

  if (isMyTurn && hero && !hero.folded && !hero.allIn) {
    const toCall = Math.max(0, gameState.currentHighBet - hero.currentBet);

    if (btnFold) btnFold.disabled = false;
    if (btnCheck) btnCheck.disabled = toCall > 0;
    
    if (btnCall) {
      btnCall.disabled = toCall <= 0;
      btnCall.textContent = toCall > 0 ? `Call $${Math.min(toCall, hero.chips)}` : 'Call';
    }

    const minRaise = gameState.currentHighBet === 0 
      ? gameState.bigBlind 
      : gameState.currentHighBet + gameState.minRaiseAmount;
    const maxRaise = hero.currentBet + hero.chips;

    if (raiseInput) {
      raiseInput.min = minRaise;
      raiseInput.step = gameState.bigBlind;
      if (parseInt(raiseInput.value, 10) < minRaise) {
        raiseInput.value = Math.min(minRaise, maxRaise);
      }
    }

    if (btnRaise) btnRaise.disabled = hero.chips <= toCall;
  } else {
    if (btnFold) btnFold.disabled = true;
    if (btnCheck) btnCheck.disabled = true;
    if (btnCall) btnCall.disabled = true;
    if (btnRaise) btnRaise.disabled = true;
  }
}

function renderCard(card, isHidden = false) {
  const el = document.createElement('div');
  if (isHidden || !card || card.hidden) {
    el.className = 'card back';
    return el;
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  el.className = `card ${isRed ? 'red' : 'black'}`;
  el.innerHTML = `<div>${card.value}</div><div class="card-suit">${card.suit}</div>`;
  return el;
}

// ---------------- EVALUATOR ----------------
function evaluate7Cards(cards) {
  if (cards.length < 5) return 0;
  const combos = getCombinations(cards, 5);
  let best = -1;
  combos.forEach(c => {
    const score = evaluate5Cards(c);
    if (score > best) best = score;
  });
  return best;
}

function getCombinations(set, k) {
  if (k > set.length || k <= 0) return [];
  if (k === set.length) return [set];
  if (k === 1) return set.map(e => [e]);
  const result = [];
  for (let i = 0; i < set.length - k + 1; i++) {
    const head = set.slice(i, i + 1);
    const tailCombos = getCombinations(set.slice(i + 1), k - 1);
    tailCombos.forEach(tail => result.push(head.concat(tail)));
  }
  return result;
}

function evaluate5Cards(hand) {
  const ranks = hand.map(c => VALUES.indexOf(c.value)).sort((a, b) => b - a);
  const suits = hand.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = -1;

  if (new Set(ranks).size === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    } else if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true;
      straightHigh = 3;
    }
  }

  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const sortedCounts = Object.entries(counts)
    .map(([r, c]) => ({ rank: parseInt(r, 10), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const r1 = sortedCounts[0].rank;
  const r2 = sortedCounts[1] ? sortedCounts[1].rank : 0;

  if (isStraight && isFlush) return 800000 + straightHigh;
  if (sortedCounts[0].count === 4) return 700000 + r1 * 100 + r2;
  if (sortedCounts[0].count === 3 && sortedCounts[1]?.count === 2) return 600000 + r1 * 100 + r2;
  if (isFlush) return 500000 + ranks[0] * 1000 + ranks[1] * 100 + ranks[2] * 10 + ranks[3];
  if (isStraight) return 400000 + straightHigh;
  if (sortedCounts[0].count === 3) return 300000 + r1 * 100 + ranks[3];
  if (sortedCounts[0].count === 2 && sortedCounts[1]?.count === 2) return 200000 + r1 * 100 + r2 * 10 + sortedCounts[2].rank;
  if (sortedCounts[0].count === 2) return 100000 + r1 * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4];

  return ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4];
}
