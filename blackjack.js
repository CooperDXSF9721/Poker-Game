// ==========================================
// SINGLE-PLAYER BLACKJACK ENGINE (CASINO RULES)
// ==========================================

class BlackjackGame {
  constructor() {
    this.deck = [];
    this.playerHands = []; // Array of hand objects for split support
    this.currentHandIndex = 0;
    this.dealerHand = [];
    this.insuranceBet = 0;
    this.currentBet = 100;
    this.chips = 10000; // Unlimited / Free play starting stack
    this.gameStage = 'betting'; // 'betting', 'player_turn', 'dealer_turn', 'complete'
    
    this.initUI();
  }

  initUI() {
    this.msgEl = document.getElementById('bj-message');
    this.chipsEl = document.getElementById('bj-chips');
    this.betInput = document.getElementById('bj-bet-input');
    this.playerContainer = document.getElementById('bj-player-hands');
    this.dealerCardsEl = document.getElementById('bj-dealer-cards');
    this.dealerScoreEl = document.getElementById('bj-dealer-score');

    this.btnDeal = document.getElementById('bj-btn-deal');
    this.btnHit = document.getElementById('bj-btn-hit');
    this.btnStand = document.getElementById('bj-btn-stand');
    this.btnDouble = document.getElementById('bj-btn-double');
    this.btnSplit = document.getElementById('bj-btn-split');
    this.btnInsurance = document.getElementById('bj-btn-insurance');

    if (this.btnDeal) this.btnDeal.addEventListener('click', () => this.startHand());
    if (this.btnHit) this.btnHit.addEventListener('click', () => this.hit());
    if (this.btnStand) this.btnStand.addEventListener('click', () => this.stand());
    if (this.btnDouble) this.btnDouble.addEventListener('click', () => this.doubleDown());
    if (this.btnSplit) this.btnSplit.addEventListener('click', () => this.split());
    if (this.btnInsurance) this.btnInsurance.addEventListener('click', () => this.takeInsurance());

    this.updateUI();
  }

  createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    this.deck = [];
    // 6-Deck Shoe (Standard Casino)
    for (let d = 0; d < 6; d++) {
      for (let s of suits) {
        for (let v of values) {
          let val = parseInt(v, 10);
          if (['J', 'Q', 'K'].includes(v)) val = 10;
          if (v === 'A') val = 11;
          this.deck.push({ suit: s, value: v, weight: val });
        }
      }
    }
    // Shuffle
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  drawCard() {
    if (this.deck.length < 20) this.createDeck();
    return this.deck.pop();
  }

  getScore(hand) {
    let score = 0;
    let aces = 0;
    hand.forEach(c => {
      score += c.weight;
      if (c.value === 'A') aces++;
    });
    while (score > 21 && aces > 0) {
      score -= 10;
      aces--;
    }
    const isSoft = aces > 0 && score <= 21;
    return { score, isSoft };
  }

  startHand() {
    const betVal = parseInt(this.betInput ? this.betInput.value : 100, 10);
    if (isNaN(betVal) || betVal <= 0) return;

    this.currentBet = betVal;
    this.createDeck();
    this.insuranceBet = 0;

    this.playerHands = [{
      cards: [this.drawCard(), this.drawCard()],
      bet: this.currentBet,
      status: 'playing', // 'playing', 'bust', 'stood', 'blackjack'
      doubled: false
    }];

    this.dealerHand = [this.drawCard(), this.drawCard()];
    this.currentHandIndex = 0;
    this.gameStage = 'player_turn';

    // Check Insurance Option
    if (this.dealerHand[0].value === 'A') {
      this.msgEl.textContent = "Dealer shows Ace. Take Insurance?";
    } else {
      this.msgEl.textContent = "Your turn: Hit, Stand, or Double?";
    }

    // Check for Naturals
    const playerEval = this.getScore(this.playerHands[0].cards);
    if (playerEval.score === 21) {
      this.playerHands[0].status = 'blackjack';
      this.playDealer();
      return;
    }

    this.updateUI();
  }

  hit() {
    if (this.gameStage !== 'player_turn') return;
    const currentHand = this.playerHands[this.currentHandIndex];
    currentHand.cards.push(this.drawCard());

    const evalResult = this.getScore(currentHand.cards);
    if (evalResult.score > 21) {
      currentHand.status = 'bust';
      this.advanceHand();
    } else if (evalResult.score === 21) {
      this.stand();
    } else {
      this.updateUI();
    }
  }

  stand() {
    if (this.gameStage !== 'player_turn') return;
    const currentHand = this.playerHands[this.currentHandIndex];
    if (currentHand.status === 'playing') currentHand.status = 'stood';
    this.advanceHand();
  }

  doubleDown() {
    if (this.gameStage !== 'player_turn') return;
    const currentHand = this.playerHands[this.currentHandIndex];
    if (currentHand.cards.length !== 2) return;

    currentHand.bet *= 2;
    currentHand.doubled = true;
    currentHand.cards.push(this.drawCard());

    const evalResult = this.getScore(currentHand.cards);
    if (evalResult.score > 21) {
      currentHand.status = 'bust';
    } else {
      currentHand.status = 'stood';
    }
    this.advanceHand();
  }

  split() {
    if (this.gameStage !== 'player_turn') return;
    const currentHand = this.playerHands[this.currentHandIndex];
    if (currentHand.cards.length !== 2) return;

    const c1 = currentHand.cards[0];
    const c2 = currentHand.cards[1];
    if (c1.weight !== c2.weight) return; // Must be matching rank/value

    // Split into two distinct hands
    const hand1 = { cards: [c1, this.drawCard()], bet: currentHand.bet, status: 'playing', doubled: false };
    const hand2 = { cards: [c2, this.drawCard()], bet: currentHand.bet, status: 'playing', doubled: false };

    this.playerHands.splice(this.currentHandIndex, 1, hand1, hand2);
    this.updateUI();
  }

  takeInsurance() {
    if (this.dealerHand[0].value !== 'A' || this.insuranceBet > 0) return;
    this.insuranceBet = Math.floor(this.currentBet / 2);
    this.msgEl.textContent = `Insurance placed for $${this.insuranceBet}.`;
    this.updateUI();
  }

  advanceHand() {
    if (this.currentHandIndex < this.playerHands.length - 1) {
      this.currentHandIndex++;
      this.updateUI();
    } else {
      this.playDealer();
    }
  }

  playDealer() {
    this.gameStage = 'dealer_turn';

    // Dealer hits on soft 17
    let dealerEval = this.getScore(this.dealerHand);
    while (dealerEval.score < 17 || (dealerEval.score === 17 && dealerEval.isSoft)) {
      this.dealerHand.push(this.drawCard());
      dealerEval = this.getScore(this.dealerHand);
    }

    this.resolveOutcome();
  }

  resolveOutcome() {
    this.gameStage = 'complete';
    const dealerEval = this.getScore(this.dealerHand);
    let netPayout = 0;
    let summaryMessages = [];

    // Resolve Insurance
    if (this.insuranceBet > 0) {
      if (dealerEval.score === 21 && this.dealerHand.length === 2) {
        netPayout += this.insuranceBet * 2;
        summaryMessages.push("Insurance Paid (2:1)!");
      } else {
        netPayout -= this.insuranceBet;
        summaryMessages.push("Insurance Lost.");
      }
    }

    // Resolve Player Hands
    this.playerHands.forEach((hand, idx) => {
      const pEval = this.getScore(hand.cards);
      const handLabel = this.playerHands.length > 1 ? `Hand ${idx + 1}: ` : '';

      if (hand.status === 'blackjack') {
        if (dealerEval.score === 21 && this.dealerHand.length === 2) {
          summaryMessages.push(`${handLabel}Push (Both Blackjack).`);
        } else {
          const win = Math.floor(hand.bet * 1.5);
          netPayout += win;
          summaryMessages.push(`${handLabel}Blackjack! Wins $${win} (3:2)`);
        }
      } else if (pEval.score > 21) {
        netPayout -= hand.bet;
        summaryMessages.push(`${handLabel}Bust (-$${hand.bet})`);
      } else if (dealerEval.score > 21) {
        netPayout += hand.bet;
        summaryMessages.push(`${handLabel}Dealer Bust! Wins $${hand.bet}`);
      } else if (pEval.score > dealerEval.score) {
        netPayout += hand.bet;
        summaryMessages.push(`${handLabel}Wins $${hand.bet}`);
      } else if (pEval.score < dealerEval.score) {
        netPayout -= hand.bet;
        summaryMessages.push(`${handLabel}Loses (-$${hand.bet})`);
      } else {
        summaryMessages.push(`${handLabel}Push`);
      }
    });

    this.chips += netPayout;
    this.msgEl.textContent = summaryMessages.join(' | ');
    this.updateUI();
  }

  updateUI() {
    if (this.chipsEl) this.chipsEl.textContent = `$${this.chips.toLocaleString()}`;

    // Render Dealer
    if (this.dealerCardsEl) {
      this.dealerCardsEl.innerHTML = '';
      this.dealerHand.forEach((card, idx) => {
        const isHidden = idx === 1 && this.gameStage === 'player_turn';
        this.dealerCardsEl.appendChild(this.renderCard(card, isHidden));
      });
    }

    if (this.dealerScoreEl) {
      if (this.gameStage === 'player_turn') {
        this.dealerScoreEl.textContent = `Dealer Shows: ${this.dealerHand[0] ? this.dealerHand[0].weight : 0}`;
      } else {
        this.dealerScoreEl.textContent = `Dealer Total: ${this.getScore(this.dealerHand).score}`;
      }
    }

    // Render Player Hands
    if (this.playerContainer) {
      this.playerContainer.innerHTML = '';
      this.playerHands.forEach((hand, idx) => {
        const handDiv = document.createElement('div');
        const isActive = idx === this.currentHandIndex && this.gameStage === 'player_turn';
        handDiv.className = `bj-hand ${isActive ? 'active-hand' : ''}`;

        const scoreEval = this.getScore(hand.cards);
        handDiv.innerHTML = `
          <div class="hand-header">Hand ${idx + 1} (Bet: $${hand.bet}) - Score: ${scoreEval.score}</div>
          <div class="cards-list"></div>
        `;

        const cardsListEl = handDiv.querySelector('.cards-list');
        hand.cards.forEach(c => cardsListEl.appendChild(this.renderCard(c)));
        this.playerContainer.appendChild(handDiv);
      });
    }

    // Controls Logic
    const isPlaying = this.gameStage === 'player_turn';
    const activeHand = this.playerHands[this.currentHandIndex];

    if (this.btnDeal) this.btnDeal.disabled = isPlaying;
    if (this.btnHit) this.btnHit.disabled = !isPlaying;
    if (this.btnStand) this.btnStand.disabled = !isPlaying;

    if (this.btnDouble) {
      this.btnDouble.disabled = !isPlaying || !activeHand || activeHand.cards.length !== 2;
    }

    if (this.btnSplit) {
      const canSplit = isPlaying && activeHand && activeHand.cards.length === 2 && activeHand.cards[0].weight === activeHand.cards[1].weight;
      this.btnSplit.disabled = !canSplit;
    }

    if (this.btnInsurance) {
      this.btnInsurance.disabled = !isPlaying || !this.dealerHand[0] || this.dealerHand[0].value !== 'A' || this.insuranceBet > 0;
    }
  }

  renderCard(card, isHidden = false) {
    const el = document.createElement('div');
    if (isHidden || !card) {
      el.className = 'card back';
      return el;
    }
    const isRed = card.suit === '♥' || card.suit === '♦';
    el.className = `card ${isRed ? 'red' : 'black'}`;
    el.innerHTML = `<div>${card.value}</div><div class="card-suit">${card.suit}</div>`;
    return el;
  }
}

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  window.blackjackGame = new BlackjackGame();
});
