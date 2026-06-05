const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const stackNames = ["A'", "B", "C", "D"];
const targetRows = 13;
const maxStackHeight = 17;

const state = {
  round: 1,
  deck: [],
  current: null,
  selected: null,
  stacks: [[], [], [], []],
  goals: [[], [], [], []],
  goalSequences: [],
  history: [],
  streak: 0,
  completed: 0,
  score: 0,
  prefilledRows: 8,
  showFutureHints: false,
};

const currentCardEl = document.getElementById("currentCard");
const remainingEl = document.getElementById("remaining");
const roundEl = document.getElementById("round");
const stackGridEl = document.getElementById("stackGrid");
const goalGridEl = document.getElementById("goalGrid");
const streakEl = document.getElementById("streak");
const completedEl = document.getElementById("completed");
const scoreEl = document.getElementById("score");
const messageEl = document.getElementById("message");
const undoBtn = document.getElementById("undoBtn");
const restartBtn = document.getElementById("restartBtn");
const nextBtn = document.getElementById("nextBtn");
const prefillSlider = document.getElementById("prefillSlider");
const prefillValueEl = document.getElementById("prefillValue");
const hintToggle = document.getElementById("hintToggle");

function createDeck() {
  return buildGoalSequences().flatMap((sequence) => sequence.slice(state.prefilledRows));
}

function shuffle(cards) {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildGoalSequences() {
  return [1, 2, 3, 4].map((step) => {
    const sequence = [];
    let index = step - 1;
    while (sequence.length < targetRows) {
      sequence.push(ranks[index]);
      index = (index + step) % 13;
    }
    return sequence;
  });
}

function startRound(keepRound = false) {
  if (!keepRound) state.round = 1;
  state.deck = shuffle(createDeck());
  state.current = null;
  state.selected = null;
  state.stacks = [[], [], [], []];
  state.goalSequences = buildGoalSequences();
  state.goals = state.goalSequences.map((sequence) => sequence.slice(0, state.prefilledRows));
  state.history = [];
  state.streak = 0;
  state.completed = state.prefilledRows * 4;
  state.score = state.prefilledRows * 4;
  drawNextCard();
  setMessage(state.prefilledRows === 0 ? "挑戰模式：52 張全部自己排。" : `灰色區已排好 ${state.prefilledRows} 排，請把後面白色區補進去。`);
  render();
}

function snapshot() {
  return {
    deck: [...state.deck],
    current: state.current,
    selected: state.selected ? { ...state.selected } : null,
    stacks: state.stacks.map((stack) => [...stack]),
    goals: state.goals.map((goal) => [...goal]),
    streak: state.streak,
    completed: state.completed,
    score: state.score,
  };
}

function restore(data) {
  state.deck = data.deck;
  state.current = data.current;
  state.selected = data.selected;
  state.stacks = data.stacks;
  state.goals = data.goals;
  state.streak = data.streak;
  state.completed = data.completed;
  state.score = data.score;
  render();
}

function drawNextCard() {
  state.current = state.deck.length ? state.deck.pop() : null;
}

function sourceCard() {
  if (!state.selected) return state.current;
  const stack = state.stacks[state.selected.stackIndex];
  return stack[stack.length - 1] ?? null;
}

function canPushToStack(stackIndex) {
  return Boolean(sourceCard()) && state.stacks[stackIndex].length < maxStackHeight;
}

function canMoveToGoal(goalIndex) {
  const card = sourceCard();
  if (!card) return false;
  const nextIndex = state.goals[goalIndex].length;
  return state.goalSequences[goalIndex][nextIndex] === card;
}

function takeSourceCard() {
  if (state.selected) {
    return state.stacks[state.selected.stackIndex].pop();
  }
  const card = state.current;
  drawNextCard();
  return card;
}

function pushToStack(stackIndex) {
  if (!sourceCard()) {
    setMessage("現在沒有牌可以放。");
    return;
  }
  if (!canPushToStack(stackIndex)) {
    setMessage(`${stackNames[stackIndex]} 已滿，暫存最多 ${maxStackHeight} 張。`);
    return;
  }
  state.history.push(snapshot());
  const card = takeSourceCard();
  state.stacks[stackIndex].push(card);
  state.selected = null;
  state.score = Math.max(0, state.score - 1);
  setMessage(`${card} 放入 ${stackNames[stackIndex]}，新牌在最上面。`);
  render();
}

function moveToGoal(goalIndex) {
  const card = sourceCard();
  if (!card) {
    setMessage("現在沒有牌可以放。");
    return;
  }
  if (!canMoveToGoal(goalIndex)) {
    const need = state.goalSequences[goalIndex][state.goals[goalIndex].length] ?? "完成";
    setMessage(`+${goalIndex + 1} 目前需要 ${need}，不能放 ${card}。`);
    return;
  }
  state.history.push(snapshot());
  const moved = takeSourceCard();
  state.goals[goalIndex].push(moved);
  state.selected = null;
  state.streak += 1;
  state.completed += 1;
  state.score += 1 + state.streak;
  setMessage(`${moved} 放到 +${goalIndex + 1}。`);
  if (state.completed === targetRows * 4) {
    setMessage("完成本局！可以按下一局繼續。");
  }
  render();
}

function selectStackTop(stackIndex) {
  const stack = state.stacks[stackIndex];
  if (!stack.length) {
    if (sourceCard()) pushToStack(stackIndex);
    else setMessage(`${stackNames[stackIndex]} 是空的。`);
    return;
  }
  if (state.selected?.stackIndex === stackIndex) {
    state.selected = null;
    setMessage("已取消選取。");
  } else {
    state.selected = { stackIndex };
    setMessage(`已選取 ${stackNames[stackIndex]} 最上面的 ${stack[stack.length - 1]}。`);
  }
  render();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) {
    setMessage("沒有可以倒退的步驟。");
    return;
  }
  restore(previous);
  setMessage("已倒退一步。");
}

function setMessage(text) {
  messageEl.textContent = text;
}

function renderStacks() {
  stackGridEl.innerHTML = state.stacks
    .map((stack, stackIndex) => {
      const cards = stack
        .map((value, rowIndex) => {
          const isTop = rowIndex === stack.length - 1;
          const isSelected = state.selected?.stackIndex === stackIndex && isTop;
          return `<button class="stack-card${isTop ? " top-card" : ""}${isSelected ? " selected" : ""}" style="--i:${rowIndex}" data-rank="${value}" data-stack="${stackIndex}" data-row="${rowIndex}" type="button"><span>${value}</span></button>`;
        })
        .join("");
      const placeholder = stack.length ? "" : `<button class="stack-placeholder" data-stack="${stackIndex}" type="button"></button>`;
      return `<div class="stack-column" data-stack="${stackIndex}">${cards}${placeholder}</div>`;
    })
    .join("");
}

function renderGoals() {
  goalGridEl.innerHTML = state.goalSequences
    .map((sequence, goalIndex) => {
      const cards = sequence
        .map((value, rowIndex) => {
          const isLocked = rowIndex < state.prefilledRows;
          const isDone = rowIndex < state.goals[goalIndex].length;
          if (!state.showFutureHints && !isLocked && !isDone) return "";
          return `<button class="goal-card${isLocked ? " locked" : ""}${isDone && !isLocked ? " done" : ""}" style="--i:${rowIndex}" data-rank="${value}" data-goal="${goalIndex}" data-row="${rowIndex}" type="button"><span>${value}</span></button>`;
        })
        .join("");
      return `<div class="goal-column" data-goal="${goalIndex}">${cards}</div>`;
    })
    .join("");
}

function renderTabs() {
  document.querySelectorAll(".stack-tab, .goal-tab").forEach((tab) => {
    tab.classList.remove("can-drop");
  });
}

function render() {
  currentCardEl.textContent = state.current ?? "-";
  currentCardEl.dataset.rank = state.current ?? "";
  currentCardEl.classList.toggle("active", Boolean(state.current && !state.selected));
  remainingEl.textContent = state.deck.length + (state.current ? 1 : 0);
  roundEl.textContent = state.round;
  streakEl.textContent = state.streak;
  completedEl.textContent = state.completed;
  scoreEl.textContent = state.score;
  prefillValueEl.textContent = state.prefilledRows;
  prefillSlider.value = state.prefilledRows;
  hintToggle.checked = state.showFutureHints;
  undoBtn.disabled = state.history.length === 0;
  renderStacks();
  renderGoals();
  renderTabs();
}

currentCardEl.addEventListener("click", () => {
  state.selected = null;
  if (!state.current) {
    setMessage("牌已經發完了，請整理暫存 stack。");
  } else {
    setMessage(`目前牌面是 ${state.current}，請放入暫存或正確目標欄。`);
  }
  render();
});

document.querySelectorAll(".stack-tab").forEach((button) => {
  button.addEventListener("click", () => pushToStack(Number(button.dataset.stack)));
});

document.querySelectorAll(".goal-tab").forEach((button) => {
  button.addEventListener("click", () => moveToGoal(Number(button.dataset.goal)));
});

stackGridEl.addEventListener("click", (event) => {
  const card = event.target.closest(".stack-card");
  const column = event.target.closest(".stack-column, .stack-placeholder");
  if (!card && !column) return;
  const stackIndex = Number((card ?? column).dataset.stack);
  const stack = state.stacks[stackIndex];
  if (card && Number(card.dataset.row) !== stack.length - 1) {
    setMessage("暫存是 stack，只能拿最上面那張。");
    return;
  }
  selectStackTop(stackIndex);
});

goalGridEl.addEventListener("click", (event) => {
  const card = event.target.closest(".goal-card");
  const column = event.target.closest(".goal-column");
  if (!card && !column) return;
  moveToGoal(Number((card ?? column).dataset.goal));
});

undoBtn.addEventListener("click", undo);
restartBtn.addEventListener("click", () => startRound(true));
nextBtn.addEventListener("click", () => {
  state.round += 1;
  startRound(true);
});

prefillSlider.addEventListener("input", () => {
  state.prefilledRows = Number(prefillSlider.value);
  prefillValueEl.textContent = state.prefilledRows;
});

prefillSlider.addEventListener("change", () => {
  startRound(true);
});

hintToggle.addEventListener("change", () => {
  state.showFutureHints = hintToggle.checked;
  render();
});

startRound();
