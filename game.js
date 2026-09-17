// ==========================================
// TEXAS HOLD'EM - GAME ENGINE
// ==========================================

// ---------- GAME DATA ----------

const suits = ["♠", "♥", "♦", "♣"];

const ranks = [
    { name: "2", value: 2 },
    { name: "3", value: 3 },
    { name: "4", value: 4 },
    { name: "5", value: 5 },
    { name: "6", value: 6 },
    { name: "7", value: 7 },
    { name: "8", value: 8 },
    { name: "9", value: 9 },
    { name: "10", value: 10 },
    { name: "J", value: 11 },
    { name: "Q", value: 12 },
    { name: "K", value: 13 },
    { name: "A", value: 14 }
];

let deck = [];
let playerHand = [];
let communityCards = [];

let bots = [
    {
        name: "Bot 1",
        chips: 1000,
        hand: [],
        folded: false,
        currentBet: 0
    },
    {
        name: "Bot 2",
        chips: 1000,
        hand: [],
        folded: false,
        currentBet: 0
    },
    {
        name: "Bot 3",
        chips: 1000,
        hand: [],
        folded: false,
        currentBet: 0
    }
];

let playerChips = 1000;

let pot = 0;
let currentBet = 0;
let stage = "waiting";
let handActive = false;


// ==========================================
// DECK FUNCTIONS
// ==========================================

function createDeck() {

    deck = [];

    for (const suit of suits) {

        for (const rank of ranks) {

            deck.push({
                suit: suit,
                rank: rank.name,
                value: rank.value
            });

        }
    }

    shuffleDeck();
}


// Fisher-Yates shuffle
function shuffleDeck() {

    for (let i = deck.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}


function drawCard() {

    return deck.pop();
}


// ==========================================
// START NEW HAND
// ==========================================

function startNewHand() {

    createDeck();

    playerHand = [];
    communityCards = [];

    pot = 0;
    currentBet = 0;

    stage = "preflop";

    handActive = true;

    playerHand.push(drawCard());
    playerHand.push(drawCard());

    for (const bot of bots) {

        bot.hand = [
            drawCard(),
            drawCard()
        ];

        bot.folded = false;
        bot.currentBet = 0;

    }

    updateDisplay();

    enablePlayerActions();

    document.getElementById("stage").textContent =
        "Pre-Flop";

    document.getElementById("hand-status").textContent =
        "Your turn";

    document.getElementById("current-bet").textContent =
        currentBet;

    setBotActions("");

    console.log("Your hand:", playerHand);

}


// ==========================================
// COMMUNITY CARDS
// ==========================================

function dealFlop() {

    drawCard();

    communityCards.push(drawCard());
    communityCards.push(drawCard());
    communityCards.push(drawCard());

    stage = "flop";

    updateDisplay();

    document.getElementById("stage").textContent =
        "Flop";

}


function dealTurn() {

    drawCard();

    communityCards.push(drawCard());

    stage = "turn";

    updateDisplay();

    document.getElementById("stage").textContent =
        "Turn";

}


function dealRiver() {

    drawCard();

    communityCards.push(drawCard());

    stage = "river";

    updateDisplay();

    document.getElementById("stage").textContent =
        "River";

}


// ==========================================
// DISPLAY CARDS
// ==========================================

function createCardElement(card) {

    const element = document.createElement("div");

    element.classList.add("card");

    element.textContent =
        card.rank + card.suit;

    if (card.suit === "♥" || card.suit === "♦") {

        element.style.color = "#c62828";

    }

    return element;
}


function updatePlayerCards() {

    const container =
        document.getElementById("player-cards");

    container.innerHTML = "";

    for (const card of playerHand) {

        container.appendChild(
            createCardElement(card)
        );

    }
}


function updateCommunityCards() {

    const container =
        document.getElementById("community-cards");

    container.innerHTML = "";

    for (let i = 0; i < 5; i++) {

        if (communityCards[i]) {

            container.appendChild(
                createCardElement(
                    communityCards[i]
                )
            );

        } else {

            const emptyCard =
                document.createElement("div");

            emptyCard.classList.add(
                "card",
                "empty"
            );

            container.appendChild(emptyCard);

        }
    }
}


// ==========================================
// DISPLAY PLAYER INFORMATION
// ==========================================

function updateDisplay() {

    updatePlayerCards();
    updateCommunityCards();

    document.getElementById(
        "player-chips"
    ).textContent =
        playerChips;

    document.getElementById(
        "pot"
    ).textContent =
        "$" + pot;

    document.getElementById(
        "current-bet"
    ).textContent =
        currentBet;

}


// ==========================================
// BUTTON CONTROLS
// ==========================================

function enablePlayerActions() {

    document.getElementById(
        "fold"
    ).disabled = false;

    document.getElementById(
        "check"
    ).disabled =
        currentBet !== 0;

    document.getElementById(
        "call"
    ).disabled =
        currentBet === 0;

    document.getElementById(
        "raise"
    ).disabled = false;

}


function disablePlayerActions() {

    document.getElementById(
        "fold"
    ).disabled = true;

    document.getElementById(
        "check"
    ).disabled = true;

    document.getElementById(
        "call"
    ).disabled = true;

    document.getElementById(
        "raise"
    ).disabled = true;

}


// ==========================================
// PLAYER ACTIONS
// ==========================================

function playerFold() {

    if (!handActive) return;

    handActive = false;

    disablePlayerActions();

    document.getElementById(
        "player-action"
    ).textContent =
        "Folded";

    document.getElementById(
        "hand-status"
    ).textContent =
        "You folded";

}


function playerCheck() {

    if (!handActive) return;

    document.getElementById(
        "player-action"
    ).textContent =
        "Check";

    botTurn();

}


function playerCall() {

    if (!handActive) return;

    const amount =
        Math.min(
            currentBet,
            playerChips
        );

    playerChips -= amount;

    pot += amount;

    document.getElementById(
        "player-action"
    ).textContent =
        "Call $" + amount;

    updateDisplay();

    botTurn();

}


function playerRaise() {

    if (!handActive) return;

    const raiseAmount = 50;

    const totalBet =
        currentBet + raiseAmount;

    if (totalBet > playerChips) {

        return;

    }

    const amountToPay =
        totalBet - currentBet;

    playerChips -= amountToPay;

    pot += amountToPay;

    currentBet = totalBet;

    document.getElementById(
        "player-action"
    ).textContent =
        "Raise to $" + currentBet;

    updateDisplay();

    botTurn();

}


// ==========================================
// BOT TURN
// ==========================================

function botTurn() {

    disablePlayerActions();

    setTimeout(() => {

        for (const bot of bots) {

            if (bot.folded) continue;

            const randomDecision =
                Math.random();

            if (randomDecision < 0.15) {

                bot.folded = true;

                setBotAction(
                    bot,
                    "Fold"
                );

            }

            else if (randomDecision < 0.75) {

                setBotAction(
                    bot,
                    "Call"
                );

            }

            else {

                setBotAction(
                    bot,
                    "Raise"
                );

                currentBet += 50;

            }

        }

        updateDisplay();

        advanceRound();

    }, 800);

}


// ==========================================
// ADVANCE THE HAND
// ==========================================

function advanceRound() {

    setTimeout(() => {

        if (stage === "preflop") {

            dealFlop();

        }

        else if (stage === "flop") {

            dealTurn();

        }

        else if (stage === "turn") {

            dealRiver();

        }

        else if (stage === "river") {

            finishHand();

            return;

        }

        enablePlayerActions();

        document.getElementById(
            "hand-status"
        ).textContent =
            "Your turn";

    }, 700);

}


// ==========================================
// END HAND
// ==========================================

function finishHand() {

    handActive = false;

    disablePlayerActions();

    document.getElementById(
        "stage"
    ).textContent =
        "Showdown";

    document.getElementById(
        "hand-status"
    ).textContent =
        "Hand complete";

    setBotActions(
        "Showdown"
    );

}


// ==========================================
// BOT UI
// ==========================================

function setBotAction(
    bot,
    message
) {

    let id = "";

    if (bot.name === "Bot 1") {
        id = "bot1-action";
    }

    if (bot.name === "Bot 2") {
        id = "bot2-action";
    }

    if (bot.name === "Bot 3") {
        id = "bot3-action";
    }

    document.getElementById(id)
        .textContent = message;

}


function setBotActions(message) {

    document.getElementById(
        "bot1-action"
    ).textContent = message;

    document.getElementById(
        "bot2-action"
    ).textContent = message;

    document.getElementById(
        "bot3-action"
    ).textContent = message;

}


// ==========================================
// BUTTON EVENT LISTENERS
// ==========================================

document.getElementById(
    "new-game"
).addEventListener(
    "click",
    startNewHand
);


document.getElementById(
    "fold"
).addEventListener(
    "click",
    playerFold
);


document.getElementById(
    "check"
).addEventListener(
    "click",
    playerCheck
);


document.getElementById(
    "call"
).addEventListener(
    "click",
    playerCall
);


document.getElementById(
    "raise"
).addEventListener(
    "click",
    playerRaise
);
