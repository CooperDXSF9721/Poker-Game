// Multi-Stakes & Private Room Texas Hold'em Engine (PeerJS)
class PokerGame {
  constructor() {
    this.peer = null;
    this.myId = null;
    this.connections = [];
    this.isHost = false;

    // Table settings
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.startingStack = 1000;

    // Game State
    this.players = [];
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.currentTurnIndex = 0;
    this.highestBet = 0;
    this.stage = 'waiting';

    this.initUI();
    this.initPeer();
  }

  initUI() {
    this.lblMyId = document.getElementById('my-peer-id');
    this.lblPot = document.getElementById('lbl-pot');
    this.lblSb = document.getElementById('lbl-small-blind');
    this.lblBb = document.getElementById('lbl-big-blind');
    this.msgEl = document.getElementById('status-message');
    
    this.communityCardsEl = document.getElementById('community-cards');
    this.playersContainer = document.getElementById('players-container');

    this.btnJoin = document.getElementById('btn-join');
    this.btnHost = document.getElementById('btn-create-host');
    this.btnStart = document.getElementById('btn-start-game');

    this.btnFold = document.getElementById('btn-fold');
    this.btnCheckCall = document.getElementById('btn-check-call');
    this.btnRaise = document.getElementById('btn-raise');
    this.raiseInput = document.getElementById('raise-amount');

    this.btnHost.addEventListener('click', () => this.setupHost());
    this.btnJoin.addEventListener('click', () => {
      const hostId = document.getElementById('host-id-input').value.trim();
      if (hostId) this.connectToHost(hostId);
    });

    this.btnStart.addEventListener('click', () => this.startNewHand());
    this.btnFold.addEventListener('click', () => this.handleAction('fold'));
    this.btnCheckCall.addEventListener('click', () => this.handleAction('check_call'));
    this.btnRaise.addEventListener('click', () => {
      const amt = parseInt(this.raiseInput.value, 10);
      this.handleAction('raise', amt);
    });
  }

  initPeer() {
    this.peer = new Peer();
    this.peer.on('open', (id) => {
      this.myId = id;
      this.lblMyId.textContent = id;
    });

    this.peer.on('connection', (conn) => {
      if (this.isHost) {
        this.connections.push(conn);
        this.setupConnListeners(conn);
      }
    });
  }

  setStakes(sb, bb, buyIn) {
    this.smallBlind = sb;
    this.bigBlind = bb;
    this.startingStack = buyIn;
    this.lblSb.textContent = sb;
    this.lblBb.textContent = bb;
  }

  setupHost() {
    this.isHost = true;
    document.getElementById('lobby-panel').style.display = 'none';
    document.getElementById('game-panel').style.display = 'block';
    this.btnStart.style.display = 'inline-block';

    this.players.push({
      id: this.myId,
      name: 'Host (You)',
      chips: this.startingStack,
      currentBet: 0,
      cards: [],
      folded: false
    });

    this.updateUI();
  }

  connectToHost(hostId) {
    this.isHost = false;
    const conn = this.peer.connect(hostId);
    this.connections.push(conn);
    this.setupConnListeners(conn);

    document.getElementById('lobby-panel').style.display = 'none';
    document.getElementById('game-panel').style.display = 'block';
  }

  setupConnListeners(conn) {
    conn.on('open', () => {
      if (!this.isHost) {
        conn.send({ type: 'JOIN', id: this.myId });
      }
    });

    conn.on('data', (data) => {
      if (this.isHost) {
        if (data.type === 'JOIN') {
          this.players.push({
            id: data.id,
            name: `Player ${this.players.length + 1}`,
            chips: this.startingStack,
            currentBet: 0,
            cards: [],
            folded: false
          });
          this.broadcastState();
        } else if (data.type === 'ACTION') {
          this.processAction(data.id, data.action, data.amount);
        }
      } else {
        if (data.type === 'STATE_UPDATE') {
          this.syncState(data.state);
        }
      }
    });
  }

  broadcastState() {
    const state = {
      players: this.players,
      communityCards: this.communityCards,
      pot: this.pot,
      currentTurnIndex: this.currentTurnIndex,
      highestBet: this.highestBet,
      stage: this.stage,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind
    };

    this.syncState(state);
    this.connections.forEach(conn => conn.send({ type: 'STATE_UPDATE', state }));
  }

  syncState(state) {
    this.players = state.players;
    this.communityCards = state.communityCards;
    this.pot = state.pot;
    this.currentTurnIndex = state.currentTurnIndex;
    this.highestBet = state.highestBet;
    this.stage = state.stage;
    this.smallBlind = state.smallBlind;
    this.bigBlind = state.bigBlind;

    this.lblSb.textContent = this.smallBlind;
    this.lblBb.textContent = this.bigBlind;
    this.updateUI();
  }

  createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    this.deck = [];
    for (let s of suits) {
      for (let v of values) {
        let weight = parseInt(v, 10);
        if (v === 'J') weight = 11;
        if (v === 'Q') weight = 12;
        if (v === 'K') weight = 13;
        if (v === 'A') weight = 14;
        this.deck.push({ suit: s, value: v, weight });
      }
    }
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  startNewHand() {
    if (!this.isHost || this.players.length < 2) return;

    this.createDeck();
    this.communityCards = [];
    this.pot = 0;
    this.stage = 'preflop';

    this.players.forEach(p => {
      p.cards = [this.deck.pop(), this.deck.pop()];
      p.folded = false;
      p.currentBet = 0;
    });

    const sbPlayer = this.players[0];
    const bbPlayer = this.players[1];

    sbPlayer.chips -= this.smallBlind;
    sbPlayer.currentBet = this.smallBlind;
    bbPlayer.chips -= this.bigBlind;
    bbPlayer.currentBet = this.bigBlind;

    this.pot = this.smallBlind + this.bigBlind;
    this.highestBet = this.bigBlind;
    this.currentTurnIndex = (this.players.length > 2) ? 2 : 0;

    this.broadcastState();
  }

  handleAction(action, amount = 0) {
    if (this.isHost) {
      this.processAction(this.myId, action, amount);
    } else {
      this.connections[0].send({ type: 'ACTION', id: this.myId, action, amount });
    }
  }

  processAction(playerId, action, amount) {
    const player = this.players[this.currentTurnIndex];
    if (player.id !== playerId) return;

    if (action === 'fold') {
      player.folded = true;
    } else if (action === 'check_call') {
      const diff = this.highestBet - player.currentBet;
      const callAmt = Math.min(diff, player.chips);
      player.chips -= callAmt;
      player.currentBet += callAmt;
      this.pot += callAmt;
    } else if (action === 'raise') {
      const totalBet = amount;
      const diff = totalBet - player.currentBet;
      if (diff > 0 && player.chips >= diff) {
        player.chips -= diff;
        player.currentBet = totalBet;
        this.pot += diff;
        this.highestBet = totalBet;
      }
    }

    this.advanceTurn();
  }

  advanceTurn() {
    const activePlayers = this.players.filter(p => !p.folded);
    if (activePlayers.length === 1) {
      activePlayers[0].chips += this.pot;
      this.stage = 'waiting';
      this.broadcastState();
      return;
    }

    let nextIndex = (this.currentTurnIndex + 1) % this.players.length;
    while (this.players[nextIndex].folded) {
      nextIndex = (nextIndex + 1) % this.players.length;
    }

    this.currentTurnIndex = nextIndex;

    const roundComplete = this.players.every(p => p.folded || p.currentBet === this.highestBet);
    if (roundComplete) {
      this.nextStage();
    } else {
      this.broadcastState();
    }
  }

  nextStage() {
    this.players.forEach(p => p.currentBet = 0);
    this.highestBet = 0;

    if (this.stage === 'preflop') {
      this.stage = 'flop';
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else if (this.stage === 'flop') {
      this.stage = 'turn';
      this.communityCards.push(this.deck.pop());
    } else if (this.stage === 'turn') {
      this.stage = 'river';
      this.communityCards.push(this.deck.pop());
    } else if (this.stage === 'river') {
      this.stage = 'waiting';
      const winner = this.players.find(p => !p.folded);
      if (winner) winner.chips += this.pot;
    }

    this.broadcastState();
  }

  updateUI() {
    this.lblPot.textContent = this.pot;

    this.communityCardsEl.innerHTML = '';
    this.communityCards.forEach(card => {
      this.communityCardsEl.appendChild(this.renderCard(card));
    });

    this.playersContainer.innerHTML = '';
    this.players.forEach((p, idx) => {
      const isMe = p.id === this.myId;
      const isTurn = idx === this.currentTurnIndex && this.stage !== 'waiting';

      const seatDiv = document.createElement('div');
      seatDiv.className = `player-seat ${isTurn ? 'active-turn' : ''} ${p.folded ? 'folded' : ''}`;
      seatDiv.innerHTML = `
        <div><strong>${p.name} ${isMe ? '(You)' : ''}</strong></div>
        <div>Chips: $${p.chips}</div>
        <div>Bet: $${p.currentBet}</div>
        <div class="cards" style="margin-top: 5px;"></div>
      `;

      const cardsContainer = seatDiv.querySelector('.cards');
      if (p.cards && p.cards.length > 0) {
        p.cards.forEach(c => {
          cardsContainer.appendChild(this.renderCard(c, !isMe && this.stage !== 'waiting'));
        });
      }

      this.playersContainer.appendChild(seatDiv);
    });

    const myTurn = this.players[this.currentTurnIndex] && this.players[this.currentTurnIndex].id === this.myId;
    const activeGame = this.stage !== 'waiting';

    this.btnFold.disabled = !myTurn || !activeGame;
    this.btnCheckCall.disabled = !myTurn || !activeGame;
    this.btnRaise.disabled = !myTurn || !activeGame;

    if (myTurn) {
      const currentP = this.players[this.currentTurnIndex];
      const callDiff = this.highestBet - currentP.currentBet;
      this.btnCheckCall.textContent = callDiff > 0 ? `Call $${callDiff}` : 'Check';
      this.msgEl.textContent = "Your turn to act!";
    } else {
      this.msgEl.textContent = activeGame ? "Waiting for other players..." : "Waiting to start next hand.";
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
    el.innerHTML = `<div>${card.value}</div><div style="align-self: flex-end;">${card.suit}</div>`;
    return el;
  }
}

function selectStakes(sb, bb, buyIn) {
  document.querySelectorAll('.stake-card').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  if (window.pokerGame) {
    window.pokerGame.setStakes(sb, bb, buyIn);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.pokerGame = new PokerGame();
});
