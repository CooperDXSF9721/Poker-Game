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

// ---------------- LOCAL STORAGE & BANKROLL ----------------
let playerBankroll = parseInt(localStorage.getItem('poker_bankroll'), 10);
if (isNaN(playerBankroll)) {
  playerBankroll = 1000;
  localStorage.setItem('poker_bankroll', playerBankroll);
}

let lastBonusTime = parseInt(localStorage.getItem('poker_last_bonus'), 10) || 0;

function updateBankrollUI() {
  document.getElementById('menu-chip-count').textContent = `$${playerBankroll.toLocaleString()}`;
  checkDailyBonus();
}

function checkDailyBonus() {
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const btnClaim = document.getElementById('btn-claim-bonus');
  const timerText = document.getElementById('bonus-timer');

  if (playerBankroll === 0 || now - lastBonusTime >= ONE_DAY_MS) {
    btnClaim.style.display = 'block';
    timerText.textContent = playerBankroll === 0 ? "Broke Bonus active!" : "Daily Bonus available!";
  } else {
    btnClaim.style.display = 'none';
    const remainingMs = ONE_DAY_MS - (now - lastBonusTime);
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    timerText.textContent = `Next Daily Bonus in ${hours}h ${mins}m`;
  }
}

document.getElementById('btn-claim-bonus').addEventListener('click', () => {
  playerBankroll += 1000;
  lastBonusTime = Date.now();
  localStorage.setItem('poker_bankroll', playerBankroll);
  localStorage.setItem('poker_last_bonus', lastBonusTime);
  updateBankrollUI();
});

// ---------------- NETWORKING & GLOBAL GAME STATE ----------------
let peer = null;
let connections = [];
let hostConn = null;
let isHost = false;
let myPeerId = "";
let myName = "Player";
let hostDeck = null;
let currentSessionMode = 'ranked'; // 'ranked' or 'quick'
let currentSessionBuyIn = 1000;
let initialBuyInPaid = 0;

const BIG_BLIND = 20;
const SMALL_BLIND = 10;

let gameState = {
  mode: 'ranked',
  buyIn: 1000,
  players: [],
  communityCards: [],
  pot: 0,
  currentHighBet: 0,
  minRaiseAmount: 20,
  dealerIndex: 0,
  activePlayerIndex: 0,
  lastRaiserIndex: -1,
  gameStage: 'idle',
  message: 'Waiting for players to join...'
};

// DOM Cache
const lobbyModal = document.getElementById('lobby-modal');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const hostGameModeSelect = document.getElementById('host-game-mode');
const hostBuyinInput = document.getElementById('host-buyin-input');
const buyinGroup = document.getElementById('buyin-input-group');

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

// UI Mode Selection
hostGameModeSelect.addEventListener('change', () => {
  if (hostGameModeSelect.value === 'quick') {
    buyinGroup.style.display = 'none';
  } else {
    buyinGroup.style.display = 'block';
  }
});

// ---------------- PUBLIC MATCHMAKING LOGIC ----------------
document.querySelectorAll('.btn-public').forEach(btn => {
  btn.addEventListener('click', () => {
    const buyIn = parseInt(btn.dataset.buyin, 10);
    joinPublicTable(buyIn);
  });
});

function joinPublicTable(buyIn) {
  myName = playerNameInput.value.trim() || "Player";
  currentSessionMode = 'ranked';
  currentSessionBuyIn = buyIn;

  if (playerBankroll < buyIn) {
    lobbyStatus.textContent = `Insufficient Bankroll! You need $${buyIn.toLocaleString()} to join.`;
    return;
  }

  const publicRoomCode = `PUBLIC_POKER_${buyIn}`;
  lobbyStatus.textContent = `Connecting to ${publicRoomCode}...`;

  peer = new Peer();

  peer.on('open', (id) => {
    myPeerId = id;
    hostConn = peer.connect(publicRoomCode);

    let connected = false;

    hostConn.on('open', () => {
      connected = true;
      deductBuyIn(buyIn);
      displayRoomCode.textContent = publicRoomCode;
      lobbyModal.style.display = 'none';
      hostConn.send({ type: 'JOIN', name: myName, id: myPeerId });
    });

    hostConn.on('data', (data) => {
      if (data.type === 'SYNC') {
        gameState = data.state;
        renderUI();
      }
    });

    // If room doesn't exist, claim the public host role
    setTimeout(() => {
      if (!connected) {
        peer.destroy();
        hostPublicTable(publicRoomCode, buyIn);
      }
    }, 1500);
  });

  peer.on('error', () => {
    hostPublicTable(publicRoomCode, buyIn);
  });
}

function hostPublicTable(roomCode, buyIn) {
  lobbyStatus.textContent = `Creating Public Table for $${buyIn}...`;
  deductBuyIn(buyIn);

  isHost = true;
  peer = new Peer(roomCode);

  peer.on('open', (id) => {
    myPeerId = id;
    displayRoomCode.textContent = roomCode;
    lobbyModal.style.display = 'none';

    gameState.mode = 'ranked';
    gameState.buyIn = buyIn;

    gameState.players.push({
      id: myPeerId,
      name: myName,
      chips: buyIn,
      currentBet: 0,
      hand: [],
      folded: false,
      allIn: false,
      actedThisRound: false
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
    lobbyStatus.textContent = "Public room busy, retrying...";
  });
}

function deductBuyIn(amount) {
  playerBankroll -= amount;
  initialBuyInPaid = amount;
  localStorage.setItem('poker_bankroll', playerBankroll);
  updateBankrollUI();
}

// ---------------- PRIVATE ROOM HOST & JOIN ----------------
btnCreateRoom.addEventListener('click', () => {
  myName = playerNameInput.value.trim() || "Host";
  currentSessionMode = hostGameModeSelect.value;
  currentSessionBuyIn = currentSessionMode === 'quick' ? 1000 : parseInt(hostBuyinInput.value, 10);

  if (isNaN(currentSessionBuyIn) || currentSessionBuyIn < 100) {
    lobbyStatus.textContent = "Buy-in must be at least $100!";
    return;
  }

  if (currentSessionMode === 'ranked') {
    if (playerBankroll < currentSessionBuyIn) {
      lobbyStatus.textContent = `Insufficient bankroll! You need $${currentSessionBuyIn}.`;
      return;
    }
    deductBuyIn(currentSessionBuyIn);
  }

  isHost = true;
  lobbyStatus.textContent = "Creating room...";

  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  peer = new Peer(roomCode);

  peer.on('open', (id) => {
    myPeerId = id;
    displayRoomCode.textContent = id;
    lobbyModal.style.display = 'none';

    gameState.mode = currentSessionMode;
    gameState.buyIn = currentSessionBuyIn;

    gameState.players.push({
      id: myPeerId,
      name: myName,
      chips: currentSessionBuyIn,
      currentBet: 0,
      hand: [],
      folded: false,
      allIn: false,
      actedThisRound: false
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
      hostConn.send({ type: 'REQUEST_JOIN_INFO' });
    });

    hostConn.on('data', (data) => {
      if (data.type === 'JOIN_REQUIREMENTS') {
        currentSessionMode = data.mode;
        currentSessionBuyIn = data.buyIn;

        if (currentSessionMode === 'ranked') {
          if (playerBankroll < currentSessionBuyIn) {
            lobbyStatus.textContent = `Need $${currentSessionBuyIn} bankroll to join this room!`;
            peer.destroy();
            return;
          }
          deductBuyIn(currentSessionBuyIn);
        }

        displayRoomCode.textContent = code;
        lobbyModal.style.display = 'none';
        hostConn.send({ type: 'JOIN', name: myName, id: myPeerId });
      } else if (data.type === 'SYNC') {
        gameState = data.state;
        renderUI();
      }
    });
  });
});

btnLeaveRoom.addEventListener('click', leaveTable);

function leaveTable() {
  if (currentSessionMode === 'ranked' && initialBuyInPaid > 0) {
    const hero = gameState.players.find(p => p.id === myPeerId);
    if (hero) {
      playerBankroll += hero.chips;
      localStorage.setItem('poker_bankroll', playerBankroll);
      updateBankrollUI();
    }
  }

  if (peer) peer.destroy();
  location.reload();
}

btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(displayRoomCode.textContent);
  btnCopyCode.textContent = "Copied!";
  setTimeout(() => btnCopyCode.textContent = "Copy Code", 2000);
});

// ---------------- STATE BROADCASTING ----------------
function broadcastState() {
  if (!isHost) return;
  
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
  if (data.type === 'REQUEST_JOIN_INFO') {
    conn.send({ type: 'JOIN_REQUIREMENTS', mode: gameState.mode, buyIn: gameState.buyIn });
  } else if (data.type === 'JOIN') {
    if (gameState.gameStage !== 'idle') {
      conn.send({ type: 'SYNC', state: gameState });
      return;
    }
    gameState.players.push({
      id: data.id,
      name: data.name,
      chips: gameState.buyIn,
      currentBet: 0,
      hand: [],
      folded: false,
      allIn: false,
      actedThisRound: false
    });
    gameState.message = `${data.name} joined the table.`;
    broadcastState();
  } else if (data.type === 'ACTION') {
    handlePlayerActionHost(data.id, data.action, data.totalBetTarget);
  }
}

// ---------------- GAME LOGIC (HOST ONLY) ----------------
btnDeal.addEventListener('click', () => {
  if (!isHost) return;
  const eligible = gameState.players.filter(p => p.chips > 0);
  if (eligible.length < 2) {
    gameState.message = "Need at least 2 players with chips to start!";
    broadcastState();
    return;
  }
  startNewHandHost();
});

function startNewHandHost() {
  hostDeck = new Deck();
  gameState.communityCards = [];
  gameState.pot = 0;
  gameState.currentHighBet = BIG_BLIND;
  gameState.minRaiseAmount = BIG_BLIND;

  gameState.players.forEach(p => {
    if (p.chips > 0) {
      p.hand = [hostDeck.pop(), hostDeck.pop()];
      p.currentBet = 0;
      p.folded = false;
      p.allIn = false;
      p.actedThisRound = false;
    } else {
      p.folded = true;
      p.hand = [];
    }
  });

  do {
    gameState.dealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
  } while (gameState.players[gameState.dealerIndex].chips <= 0);

  const activeList = gameState.players.filter(p => !p.folded);
  let sbIdx, bbIdx, UTGIdx;

  if (activeList.length === 2) {
    sbIdx = gameState.dealerIndex;
    bbIdx = getNextActivePlayerIndex(sbIdx);
    UTGIdx = sbIdx;
  } else {
    sbIdx = getNextActivePlayerIndex(gameState.dealerIndex);
    bbIdx = getNextActivePlayerIndex(sbIdx);
    UTGIdx = getNextActivePlayerIndex(bbIdx);
  }

  postBetHost(gameState.players[sbIdx], SMALL_BLIND);
  postBetHost(gameState.players[bbIdx], BIG_BLIND);

  gameState.activePlayerIndex = UTGIdx;
  gameState.lastRaiserIndex = bbIdx;
  gameState.gameStage = 'preflop';
  gameState.message = `Hand started! SB: ${gameState.players[sbIdx].name} ($${SMALL_BLIND}), BB: ${gameState.players[bbIdx].name} ($${BIG_BLIND}).`;

  broadcastState();
}

function postBetHost(player, amount) {
  const actualBet = Math.min(amount, player.chips);
  player.chips -= actualBet;
  player.currentBet += actualBet;
  gameState.pot += actualBet;

  if (player.chips === 0) {
    player.allIn = true;
  }
}

function getNextActivePlayerIndex(fromIdx) {
  let idx = (fromIdx + 1) % gameState.players.length;
  while (gameState.players[idx].folded || gameState.players[idx].allIn) {
    if (idx === fromIdx) break;
    idx = (idx + 1) % gameState.players.length;
  }
  return idx;
}

function handlePlayerActionHost(playerId, action, totalBetTarget = 0) {
  const player = gameState.players[gameState.activePlayerIndex];
  if (!player || player.id !== playerId) return;

  const amountToCall = gameState.currentHighBet - player.currentBet;

  if (action === 'fold') {
    player.folded = true;
    gameState.message = `${player.name} folded.`;
  } else if (action === 'check') {
    if (amountToCall > 0) {
      gameState.message = "Cannot check when facing a bet!";
      broadcastState();
      return;
    }
    gameState.message = `${player.name} checked.`;
  } else if (action === 'call') {
    const callAmount = Math.min(amountToCall, player.chips);
    postBetHost(player, callAmount);
    gameState.message = `${player.name} called $${callAmount}.`;
  } else if (action === 'raise') {
    const raiseIncrement = totalBetTarget - gameState.currentHighBet;
    const additionalChipsNeeded = totalBetTarget - player.currentBet;

    if (additionalChipsNeeded > player.chips) {
      gameState.message = "Error: Not enough chips!";
      broadcastState();
      return;
    }

    postBetHost(player, additionalChipsNeeded);
    gameState.minRaiseAmount = Math.max(BIG_BLIND, raiseIncrement);
    gameState.currentHighBet = player.currentBet;
    gameState.lastRaiserIndex = gameState.activePlayerIndex;
    gameState.message = `${player.name} raised to $${player.currentBet}.`;
  }

  player.actedThisRound = true;
  moveToNextPlayerHost();
}

function moveToNextPlayerHost() {
  const remainingPlayers = gameState.players.filter(p => !p.folded);
  
  if (remainingPlayers.length === 1) {
    remainingPlayers[0].chips += gameState.pot;
    gameState.message = `${remainingPlayers[0].name} wins $${gameState.pot}!`;
    endHandHost();
    return;
  }

  const playersCanAct = remainingPlayers.filter(p => !p.allIn);
  const everyoneMatched = remainingPlayers.every(p => p.currentBet === gameState.currentHighBet || p.allIn);
  const everyoneActed = playersCanAct.every(p => p.actedThisRound);

  if (playersCanAct.length <= 1 && everyoneMatched) {
    fastForwardToShowdownHost();
    return;
  }

  if (everyoneMatched && everyoneActed) {
    advanceStageHost();
  } else {
    gameState.activePlayerIndex = getNextActivePlayerIndex(gameState.activePlayerIndex);
    broadcastState();
  }
}

function advanceStageHost() {
  refundUncalledBetsHost();

  gameState.players.forEach(p => {
    p.currentBet = 0;
    p.actedThisRound = false;
  });
  gameState.currentHighBet = 0;
  gameState.minRaiseAmount = BIG_BLIND;

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

  gameState.activePlayerIndex = getNextActivePlayerIndex(gameState.dealerIndex);
  gameState.lastRaiserIndex = gameState.activePlayerIndex;
  gameState.message = `Stage: ${gameState.gameStage.toUpperCase()}. Action is on ${gameState.players[gameState.activePlayerIndex].name}.`;

  broadcastState();
}

function refundUncalledBetsHost() {
  const active = gameState.players.filter(p => !p.folded);
  if (active.length <= 1) return;

  const bets = active.map(p => p.currentBet).sort((a, b) => b - a);
  const highestBet = bets[0];
  const secondHighest = bets[1] || 0;

  if (highestBet > secondHighest) {
    const overbet = highestBet - secondHighest;
    const overbettor = active.find(p => p.currentBet === highestBet);
    if (overbettor) {
      overbettor.chips += overbet;
      overbettor.currentBet -= overbet;
      gameState.pot -= overbet;
      gameState.currentHighBet = secondHighest;
    }
  }
}

function fastForwardToShowdownHost() {
  refundUncalledBetsHost();
  while (gameState.communityCards.length < 5) {
    gameState.communityCards.push(hostDeck.pop());
  }
  gameState.gameStage = 'showdown';
  resolveShowdownHost();
}

// ---------------- SHOWDOWN ----------------
function resolveShowdownHost() {
  const activePlayers = gameState.players.filter(p => !p.folded);
  
  activePlayers.forEach(p => {
    p.handScore = evaluate7CardHand(p.hand.concat(gameState.communityCards));
  });

  activePlayers.sort((a, b) => b.handScore - a.handScore);

  let bestScore = activePlayers[0].handScore;
  let winners = activePlayers.filter(p => p.handScore === bestScore);

  const share = Math.floor(gameState.pot / winners.length);
  winners.forEach(w => w.chips += share);

  gameState.message = `Showdown! ${winners.map(w => w.name).join(', ')} wins $${gameState.pot}!`;
  endHandHost();
}

function endHandHost() {
  gameState.gameStage = 'idle';
  broadcastState();
}

// ---------------- CONTROLS ----------------
btnFold.addEventListener('click', () => sendAction('fold'));
btnCheck.addEventListener('click', () => sendAction('check'));
btnCall.addEventListener('click', () => sendAction('call'));
btnRaise.addEventListener('click', () => {
  const totalTarget = parseInt(raiseInput.value, 10);
  const hero = gameState.players.find(p => p.id === myPeerId);

  if (isNaN(totalTarget)) return;

  const minTotalBet = gameState.currentHighBet + gameState.minRaiseAmount;
  const maxTotalBet = hero.currentBet + hero.chips;

  if (totalTarget < minTotalBet && totalTarget < maxTotalBet) {
    alert(`Minimum total bet/raise amount is $${minTotalBet}!`);
    raiseInput.value = Math.min(minTotalBet, maxTotalBet);
    return;
  }

  sendAction('raise', totalTarget);
});

function sendAction(action, totalBetTarget = 0) {
  if (isHost) {
    handlePlayerActionHost(myPeerId, action, totalBetTarget);
  } else {
    hostConn.send({ type: 'ACTION', id: myPeerId, action, totalBetTarget });
  }
}

// ---------------- RENDER UI ----------------
function renderUI() {
  messageBoard.textContent = gameState.message;
  document.getElementById('pot-amount').textContent = gameState.pot;

  btnDeal.disabled = !isHost || gameState.gameStage !== 'idle' || gameState.players.filter(p => p.chips > 0).length < 2;

  const opponentsContainer = document.getElementById('opponents-container');
  opponentsContainer.innerHTML = '';

  const hero = gameState.players.find(p => p.id === myPeerId);

  gameState.players.forEach((p, idx) => {
    const isHero = p.id === myPeerId;
    let statusText = "";
    if (idx === gameState.dealerIndex) statusText += " (D)";
    if (p.folded) statusText += " [FOLD]";
    if (p.allIn) statusText += " [ALL-IN]";

    if (isHero) {
      document.getElementById('hero-name').textContent = `${p.name} (You)${statusText}`;
      document.getElementById('hero-chips').textContent = p.chips;
      document.getElementById('hero-bet').textContent = p.currentBet;

      const heroCardsEl = document.getElementById('hero-cards');
      heroCardsEl.innerHTML = '';
      p.hand.forEach(c => heroCardsEl.appendChild(createCardUI(c)));
    } else {
      const oppDiv = document.createElement('div');
      oppDiv.className = 'player-area';
      oppDiv.innerHTML = `
        <div class="status-badge">${p.name}${statusText}</div>
        <div class="cards" id="cards-opp-${idx}"></div>
        <div class="chips">Chips: $${p.chips}</div>
        <div class="bet">Bet: $${p.currentBet}</div>
      `;
      opponentsContainer.appendChild(oppDiv);

      const cardsEl = oppDiv.querySelector(`#cards-opp-${idx}`);
      p.hand.forEach(c => cardsEl.appendChild(createCardUI(c, c.hidden)));
    }
  });

  const commEl = document.getElementById('community-cards');
  commEl.innerHTML = '';
  gameState.communityCards.forEach(c => commEl.appendChild(createCardUI(c)));

  const isMyTurn = gameState.players[gameState.activePlayerIndex]?.id === myPeerId && gameState.gameStage !== 'idle';
  
  if (isMyTurn && hero && !hero.folded && !hero.allIn) {
    const amountToCall = gameState.currentHighBet - hero.currentBet;

    btnFold.disabled = false;
    btnCheck.disabled = amountToCall > 0;
    btnCall.disabled = amountToCall === 0;
    btnCall.textContent = amountToCall > 0 ? `Call $${Math.min(amountToCall, hero.chips)}` : 'Call';

    const minRaiseTotal = gameState.currentHighBet + gameState.minRaiseAmount;
    const maxRaiseTotal = hero.currentBet + hero.chips;

    raiseInput.min = minRaiseTotal;
    if (parseInt(raiseInput.value, 10) < minRaiseTotal) {
      raiseInput.value = minRaiseTotal;
    }

    btnRaise.disabled = hero.chips <= amountToCall;
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

// ---------------- HAND EVALUATION ----------------
function evaluate7CardHand(cards) {
  if (cards.length < 5) return 0;
  const combinations = kCombinations(cards, 5);
  let maxScore = -1;

  combinations.forEach(combo => {
    const score = evaluate5CardHand(combo);
    if (score > maxScore) maxScore = score;
  });

  return maxScore;
}

function kCombinations(set, k) {
  if (k > set.length || k <= 0) return [];
  if (k === set.length) return [set];
  if (k === 1) return set.map(e => [e]);

  const combos = [];
  for (let i = 0; i < set.length - k + 1; i++) {
    const head = set.slice(i, i + 1);
    const tailCombos = kCombinations(set.slice(i + 1), k - 1);
    tailCombos.forEach(tail => combos.push(head.concat(tail)));
  }
  return combos;
}

function evaluate5CardHand(hand) {
  const ranks = hand.map(c => VALUES.indexOf(c.value)).sort((a, b) => b - a);
  const suits = hand.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  
  let isStraight = false;
  let straightHighRank = -1;

  if (new Set(ranks).size === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHighRank = ranks[0];
    } else if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true;
      straightHighRank = 3; 
    }
  }

  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);

  const freqEntries = Object.entries(counts).map(([rank, count]) => ({
    rank: parseInt(rank, 10),
    count
  }));

  freqEntries.sort((a, b) => b.count - a.count || b.rank - a.rank);

  const primaryRank = freqEntries[0].rank;
  const secondaryRank = freqEntries[1] ? freqEntries[1].rank : 0;

  if (isStraight && isFlush) return 800000 + straightHighRank;
  if (freqEntries[0].count === 4) return 700000 + primaryRank * 100 + secondaryRank;
  if (freqEntries[0].count === 3 && freqEntries[1]?.count === 2) return 600000 + primaryRank * 100 + secondaryRank;
  if (isFlush) return 500000 + ranks[0] * 1000 + ranks[1] * 100 + ranks[2] * 10 + ranks[3];
  if (isStraight) return 400000 + straightHighRank;
  if (freqEntries[0].count === 3) return 300000 + primaryRank * 100 + ranks[3];
  if (freqEntries[0].count === 2 && freqEntries[1]?.count === 2) return 200000 + primaryRank * 100 + secondaryRank * 10 + freqEntries[2].rank;
  if (freqEntries[0].count === 2) return 100000 + primaryRank * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4];

  return ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4];
}

// Boot
updateBankrollUI();
