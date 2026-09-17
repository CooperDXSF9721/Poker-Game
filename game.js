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

  pop() {
    return this.cards.pop();
  }
}

// Game State
const deck = new Deck();
let playerHand = [];
let opponentHand = [];
let communityCards = [];

let playerChips = 1000;
let opponentChips = 1000;
let pot = 0;

let playerBet = 0;
let opponentBet = 0;
let currentBet = 0;

// Phases: 'preflop', 'flop', 'turn', 'river', 'showdown'
let gameStage = 'preflop';

// DOM Elements
const playerCardsEl = document.getElementById('player-cards');
const opponentCardsEl = document.getElementById('opponent-cards');
const communityCardsEl = document.getElementById('community-cards');

const playerChipsEl = document.getElementById('player-chips');
const opponentChipsEl = document.getElementById('opponent-chips');
const playerBetEl = document.getElementById('player-bet');
const opponentBetEl = document.getElementById('opponent-bet');
const potAmountEl = document.getElementById('pot-amount');
const messageBoardEl = document.getElementById('message-board');

const btnDeal = document.getElementById('btn-deal');
const btnFold = document.getElementById('btn-fold');
const btnCheck = document.getElementById('btn-check');
const btnCall = document.getElementById('btn-call');
const btnRaise = document.getElementById('btn-raise');

// Event Listeners
btnDeal.addEventListener('click', startNewHand);
btnFold.addEventListener('click', () => handlePlayerAction('fold'));
btnCheck.addEventListener('click', () => handlePlayerAction('check'));
btnCall.addEventListener('click', () => handlePlayerAction('call'));
btnRaise.addEventListener('click', () => handlePlayerAction('raise'));

function updateUI() {
  playerChipsEl.textContent = playerChips;
  opponentChipsEl.textContent = opponentChips;
  playerBetEl.textContent = playerBet;
  opponentBetEl.textContent = opponentBet;
  potAmountEl.textContent = pot;

  // Toggle action buttons depending on game status
  const canCall = currentBet > playerBet;
  btnCheck.disabled = canCall;
  btnCall.disabled = !canCall;
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

function renderCards(showOpponent = false) {
  playerCardsEl.innerHTML = '';
  playerHand.forEach(card => playerCardsEl.appendChild(createCardUI(card)));

  opponentCardsEl.innerHTML = '';
  opponentHand.forEach(card => {
    opponentCardsEl.appendChild(createCardUI(card, !showOpponent));
  });

  communityCardsEl.innerHTML = '';
  communityCards.forEach(card => communityCardsEl.appendChild(createCardUI(card)));
}

function startNewHand() {
  if (playerChips <= 0 || opponentChips <= 0) {
    messageBoardEl.textContent = "Game over! Refresh the page to restart.";
    return;
  }

  deck.reset();
  playerHand = [deck.pop(), deck.pop()];
  opponentHand = [deck.pop(), deck.pop()];
  communityCards = [];

  pot = 0;
  playerBet = 0;
  opponentBet = 0;
  currentBet = 0;
  gameStage = 'preflop';

  // Blinds ($10 / $20)
  postBet('player', 10);
  postBet('opponent', 20);
  currentBet = 20;

  renderCards(false);
  updateUI();

  btnDeal.disabled = true;
  toggleActionButtons(true);
  messageBoardEl.textContent = "Blinds posted ($10/$20). Your move!";
}

function postBet(player, amount) {
  const actualAmount = Math.min(amount, player === 'player' ? playerChips : opponentChips);
  if (player === 'player') {
    playerChips -= actualAmount;
    playerBet += actualAmount;
  } else {
    opponentChips -= actualAmount;
    opponentBet += actualAmount;
  }
  pot += actualAmount;
}

function toggleActionButtons(enable) {
  btnFold.disabled = !enable;
  btnRaise.disabled = !enable;
  btnCheck.disabled = !enable;
  btnCall.disabled = !enable;
}

function handlePlayerAction(action) {
  if (action === 'fold') {
    messageBoardEl.textContent = "You folded. Opponent wins the pot.";
    opponentChips += pot;
    endHand();
    return;
  }

  if (action === 'check') {
    messageBoardEl.textContent = "You checked.";
  } else if (action === 'call') {
    const callAmount = currentBet - playerBet;
    postBet('player', callAmount);
    messageBoardEl.textContent = "You called.";
  } else if (action === 'raise') {
    const raiseAmount = (currentBet - playerBet) + 20;
    postBet('player', raiseAmount);
    currentBet = playerBet;
    messageBoardEl.textContent = "You raised $20.";
  }

  updateUI();
  toggleActionButtons(false);

  // Simple Opponent AI Turn
  setTimeout(opponentTurn, 1000);
}

function opponentTurn() {
  // Simple AI Logic: Call if needed, otherwise check/match
  if (opponentBet < currentBet) {
    const callAmount = currentBet - opponentBet;
    postBet('opponent', callAmount);
    messageBoardEl.textContent = "Opponent called.";
  } else {
    messageBoardEl.textContent = "Opponent checked.";
  }

  updateUI();
  setTimeout(advanceStage, 1000);
}

function advanceStage() {
  // Reset bets for next street
  playerBet = 0;
  opponentBet = 0;
  currentBet = 0;

  if (gameStage === 'preflop') {
    gameStage = 'flop';
    communityCards.push(deck.pop(), deck.pop(), deck.pop());
    messageBoardEl.textContent = "Flop dealt. Action is on you.";
  } else if (gameStage === 'flop') {
    gameStage = 'turn';
    communityCards.push(deck.pop());
    messageBoardEl.textContent = "Turn dealt. Action is on you.";
  } else if (gameStage === 'turn') {
    gameStage = 'river';
    communityCards.push(deck.pop());
    messageBoardEl.textContent = "River dealt. Final betting round.";
  } else if (gameStage === 'river') {
    gameStage = 'showdown';
    showdown();
    return;
  }

  renderCards(false);
  updateUI();
  toggleActionButtons(true);
}

function showdown() {
  renderCards(true); // Reveal opponent cards

  // Evaluate Hand Strength (Simplified scoring logic)
  const playerScore = getHandValue(playerHand.concat(communityCards));
  const opponentScore = getHandValue(opponentHand.concat(communityCards));

  if (playerScore > opponentScore) {
    messageBoardEl.textContent = "You win the hand with a stronger combination!";
    playerChips += pot;
  } else if (opponentScore > playerScore) {
    messageBoardEl.textContent = "Opponent wins the hand.";
    opponentChips += pot;
  } else {
    messageBoardEl.textContent = "It's a tie! Pot is split.";
    playerChips += Math.floor(pot / 2);
    opponentChips += Math.floor(pot / 2);
  }

  endHand();
}

function endHand() {
  pot = 0;
  updateUI();
  toggleActionButtons(false);
  btnDeal.disabled = false;
}

// Basic Hand Evaluator - Higher number = better hand
function getHandValue(cards) {
  const ranks = cards.map(c => VALUES.indexOf(c.value)).sort((a, b) => b - a);
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);

  const values = Object.values(counts);
  const maxCount = Math.max(...values);

  // Score multiplier based on basic card matches
  if (maxCount === 4) return 700 + ranks[0]; // Four of a kind
  if (values.includes(3) && values.includes(2)) return 600 + ranks[0]; // Full House
  if (maxCount === 3) return 300 + ranks[0]; // Three of a kind
  if (values.filter(v => v === 2).length >= 2) return 200 + ranks[0]; // Two Pair
  if (maxCount === 2) return 100 + ranks[0]; // Pair
  return ranks[0]; // High Card
}
