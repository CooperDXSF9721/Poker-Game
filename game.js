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

// ---------------- Game State Variables ----------------
const NUM_PLAYERS = 4;
let deck = new Deck();
let players = [];
let communityCards = [];
let pot = 0;
let currentHighBet = 0;
let dealerIndex = 0;
let activePlayerIndex = 0;
let lastRaiserIndex = null;
let gameStage = 'idle'; // 'preflop', 'flop', 'turn', 'river', 'showdown', 'idle'

class Player {
  constructor(id, name, isHuman = false) {
    this.id = id;
    this.name = name;
    this.isHuman = isHuman;
    this.chips = 1000;
    this.currentBet = 0;
    this.hand = [];
    this.folded = false;
    this.allIn = false;
  }
  resetForHand() {
    this.hand = [];
    this.currentBet = 0;
    this.folded = false;
    this.allIn = false;
  }
}

// Initialize Players
for (let i = 0; i < NUM_PLAYERS; i++) {
  players.push(new Player(i, i === 0 ? "You" : `Bot ${i}`, i === 0));
}

// DOM Cache
const btnDeal = document.getElementById('btn-deal');
const btnFold = document.getElementById('btn-fold');
const btnCheck = document.getElementById('btn-check');
const btnCall = document.getElementById('btn-call');
const btnRaise = document.getElementById('btn-raise');
const raiseInput = document.getElementById('raise-amount');
const messageBoard = document.getElementById('message-board');

// Controls
btnDeal.addEventListener('click', startNewHand);
btnFold.addEventListener('click', () => handleHumanAction('fold'));
btnCheck.addEventListener('click', () => handleHumanAction('check'));
btnCall.addEventListener('click', () => handleHumanAction('call'));
btnRaise.addEventListener('click', () => {
  const targetBet = parseInt(raiseInput.value, 10);
  handleHumanAction('raise', targetBet);
});

// ---------------- Hand Initialization & Blinds ----------------
function startNewHand() {
  deck.reset();
  communityCards = [];
  pot = 0;
  currentHighBet = 0;

  players.forEach(p => p.resetForHand());

  // Rotate Dealer Button
  dealerIndex = (dealerIndex + 1) % NUM_PLAYERS;
  
  // Deal Hands
  for (let i = 0; i < 2; i++) {
    players.forEach(p => p.hand.push(deck.pop()));
  }

  // Blinds: Small Blind (Dealer+1), Big Blind (Dealer+2)
  const sbIndex = (dealerIndex + 1) % NUM_PLAYERS;
  const bbIndex = (dealerIndex + 2) % NUM_PLAYERS;

  postBet(players[sbIndex], 10);
  postBet(players[bbIndex], 20);
  currentHighBet = 20;

  // Preflop action begins after Big Blind
  activePlayerIndex = (bbIndex + 1) % NUM_PLAYERS;
  lastRaiserIndex = bbIndex; 
  gameStage = 'preflop';

  updateUI();
  btnDeal.disabled = true;
  messageBoard.textContent = `${players[sbIndex].name} posted SB ($10), ${players[bbIndex].name} posted BB ($20).`;

  processTurn();
}

function postBet(player, amount) {
  const actualAmount = Math.min(amount, player.chips);
  player.chips -= actualAmount;
  player.currentBet += actualAmount;
  pot += actualAmount;
  if (player.chips === 0) player.allIn = true;
}

// ---------------- Turn Engine ----------------
function processTurn() {
  updateUI();

  // Check if betting round is complete
  if (isBettingRoundComplete()) {
    advanceStage();
    return;
  }

  const currentPlayer = players[activePlayerIndex];

  // Skip folded or all-in players
  if (currentPlayer.folded || currentPlayer.allIn) {
    moveToNextPlayer();
    processTurn();
    return;
  }

  if (currentPlayer.isHuman) {
    enableHumanControls();
  } else {
    disableHumanControls();
    setTimeout(executeAITurn, 800);
  }
}

function moveToNextPlayer() {
  activePlayerIndex = (activePlayerIndex + 1) % NUM_PLAYERS;
}

function isBettingRoundComplete() {
  const activePlayers = players.filter(p => !p.folded);
  if (activePlayers.length <= 1) return true;

  // Round is complete if everyone active matched the high bet or is All-In
  const allMatched = activePlayers.every(p => p.currentBet === currentHighBet || p.allIn);
  const everyoneActed = activePlayerIndex === lastRaiserIndex;

  return allMatched && everyoneActed;
}

// ---------------- Human Interaction ----------------
function enableHumanControls() {
  const hero = players[0];
  const toCall = currentHighBet - hero.currentBet;

  btnFold.disabled = false;
  btnCheck.disabled = toCall > 0;
  btnCall.disabled = toCall === 0;

  const minRaise = currentHighBet + 20;
  raiseInput.min = minRaise;
  if (parseInt(raiseInput.value, 10) < minRaise) raiseInput.value = minRaise;

  btnRaise.disabled = hero.chips <= toCall;
  btnCall.textContent = toCall > 0 ? `Call $${toCall}` : 'Call';
}

function disableHumanControls() {
  btnFold.disabled = true;
  btnCheck.disabled = true;
  btnCall.disabled = true;
  btnRaise.disabled = true;
}

function handleHumanAction(action, raiseTarget = 0) {
  const hero = players[0];
  if (action === 'fold') {
    hero.folded = true;
    messageBoard.textContent = "You folded.";
  } else if (action === 'check') {
    messageBoard.textContent = "You checked.";
  } else if (action === 'call') {
    const toCall = currentHighBet - hero.currentBet;
    postBet(hero, toCall);
    messageBoard.textContent = `You called $${toCall}.`;
  } else if (action === 'raise') {
    const additionalAmount = raiseTarget - hero.currentBet;
    postBet(hero, additionalAmount);
    currentHighBet = hero.currentBet;
    lastRaiserIndex = 0;
    messageBoard.textContent = `You raised to $${currentHighBet}.`;
  }

  disableHumanControls();
  moveToNextPlayer();
  processTurn();
}

// ---------------- Monte Carlo Equity AI ----------------
function executeAITurn() {
  const bot = players[activePlayerIndex];
  const toCall = currentHighBet - bot.currentBet;

  // Calculate Equity via Monte Carlo simulation (100 runs)
  const equity = calculateEquity(bot.hand, communityCards, 100);

  // Pot odds calculation
  const potOdds = toCall / (pot + toCall || 1);

  let decision = 'fold';

  if (toCall === 0) {
    if (equity > 0.6 && Math.random() < 0.4) {
      decision = 'raise';
    } else {
      decision = 'check';
    }
  } else {
    if (equity > potOdds + 0.15 && Math.random() < 0.3) {
      decision = 'raise';
    } else if (equity >= potOdds - 0.05) {
      decision = 'call';
    } else {
      decision = 'fold';
    }
  }

  if (decision === 'fold') {
    bot.folded = true;
    messageBoard.textContent = `${bot.name} folded.`;
  } else if (decision === 'check') {
    messageBoard.textContent = `${bot.name} checked.`;
  } else if (decision === 'call') {
    postBet(bot, toCall);
    messageBoard.textContent = `${bot.name} called $${toCall}.`;
  } else if (decision === 'raise') {
    const raiseSize = Math.min(bot.chips, currentHighBet + 20);
    const addedBet = raiseSize - bot.currentBet;
    postBet(bot, addedBet);
    currentHighBet = bot.currentBet;
    lastRaiserIndex = activePlayerIndex;
    messageBoard.textContent = `${bot.name} raised to $${currentHighBet}.`;
  }

  moveToNextPlayer();
  processTurn();
}

function calculateEquity(hand, board, simulations = 100) {
  let wins = 0;

  for (let i = 0; i < simulations; i++) {
    const simDeck = new Deck();
    // Remove known cards from simulation deck
    simDeck.cards = simDeck.cards.filter(c => 
      !hand.some(h => h.suit === c.suit && h.value === c.value) &&
      !board.some(b => b.suit === c.suit && b.value === c.value)
    );

    // Run complete random board fill
    const simBoard = [...board];
    while (simBoard.length < 5) simBoard.push(simDeck.pop());

    // Generate random opponent hands
    const oppHand = [simDeck.pop(), simDeck.pop()];

    const myScore = evaluate7CardHand(hand.concat(simBoard));
    const oppScore = evaluate7CardHand(oppHand.concat(simBoard));

    if (myScore >= oppScore) wins++;
  }

  return wins / simulations;
}

// ---------------- Stage Progression ----------------
function advanceStage() {
  // Reset street bets
  players.forEach(p => p.currentBet = 0);
  currentHighBet = 0;

  const activePlayers = players.filter(p => !p.folded);
  if (activePlayers.length === 1) {
    messageBoard.textContent = `${activePlayers[0].name} wins $${pot} (Everyone else folded)!`;
    activePlayers[0].chips += pot;
    endHand();
    return;
  }

  if (gameStage === 'preflop') {
    gameStage = 'flop';
    communityCards.push(deck.pop(), deck.pop(), deck.pop());
  } else if (gameStage === 'flop') {
    gameStage = 'turn';
    communityCards.push(deck.pop());
  } else if (gameStage === 'turn') {
    gameStage = 'river';
    communityCards.push(deck.pop());
  } else if (gameStage === 'river') {
    gameStage = 'showdown';
    handleShowdown();
    return;
  }

  // First active player after Dealer acts first post-flop
  activePlayerIndex = (dealerIndex + 1) % NUM_PLAYERS;
  lastRaiserIndex = activePlayerIndex;

  messageBoard.textContent = `Advanced to ${gameStage.toUpperCase()}. Action starts.`;
  processTurn();
}

// ---------------- Showdown & Hand Evaluation ----------------
function handleShowdown() {
  updateUI(true); // Show all cards

  let bestScore = -1;
  let winners = [];

  players.forEach(p => {
    if (!p.folded) {
      const score = evaluate7CardHand(p.hand.concat(communityCards));
      if (score > bestScore) {
        bestScore = score;
        winners = [p];
      } else if (score === bestScore) {
        winners.push(p);
      }
    }
  });

  const splitPot = Math.floor(pot / winners.length);
  winners.forEach(w => w.chips += splitPot);

  const winnerNames = winners.map(w => w.name).join(', ');
  messageBoard.textContent = `Showdown! ${winnerNames} wins $${pot}!`;

  endHand();
}

function endHand() {
  pot = 0;
  gameStage = 'idle';
  updateUI(true);
  btnDeal.disabled = false;
  disableHumanControls();
}

function evaluate7CardHand(cards) {
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

// ---------------- Render & UI ----------------
function updateUI(showAll = false) {
  document.getElementById('pot-amount').textContent = pot;

  players.forEach((p, idx) => {
    document.getElementById(`chips-${idx}`).textContent = p.chips;
    document.getElementById(`bet-${idx}`).textContent = p.currentBet;

    // Update Role badges
    let roleTag = "";
    if (idx === dealerIndex) roleTag = " (D)";
    document.getElementById(`name-${idx}`).textContent = `${p.name}${roleTag}${p.folded ? ' [FOLDED]' : ''}`;

    // Render Cards
    const cardsEl = document.getElementById(`cards-${idx}`);
    cardsEl.innerHTML = '';
    p.hand.forEach(card => {
      const hideCard = !p.isHuman && !showAll;
      cardsEl.appendChild(createCardUI(card, hideCard));
    });
  });

  // Render Community Cards
  const commEl = document.getElementById('community-cards');
  commEl.innerHTML = '';
  communityCards.forEach(card => commEl.appendChild(createCardUI(card)));
}

function createCardUI(card, isHidden = false) {
  const cardDiv = document.createElement('div');
  if (isHidden) {
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
