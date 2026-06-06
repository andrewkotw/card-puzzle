const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const stackNames = ["暫A", "暫B", "暫C", "暫D"];
const targetRows = 13;
const maxStackHeight = 14;
const tempMovePenalty = 1;
const undoPenalty = 5;

const state = {
  round: 1,
  deck: [],
  current: null,
  selected: null,
  stacks: [[], [], [], []],
  goals: [[], [], [], []],
  goalSequences: [],
  history: [],
  combo: 0,
  completed: 0,
  score: 0,
  bestScore: 0,
  tempMoves: 0,
  undoCount: 0,
  lastClearBonus: 0,
  prefilledRows: 8,
  showFutureHints: false,
  lastPlaced: null,
};

const currentCardEl = document.getElementById("currentCard");
const remainingEl = document.getElementById("remaining");
const roundEl = document.getElementById("round");
const stackGridEl = document.getElementById("stackGrid");
const goalGridEl = document.getElementById("goalGrid");
const streakEl = document.getElementById("streak");
const completedEl = document.getElementById("completed");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const messageEl = document.getElementById("message");
const undoBtn = document.getElementById("undoBtn");
const restartBtn = document.getElementById("restartBtn");
const nextBtn = document.getElementById("nextBtn");
const prefillSlider = document.getElementById("prefillSlider");
const prefillValueEl = document.getElementById("prefillValue");
const difficultyNameEl = document.getElementById("difficultyName");
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
  state.combo = 0;
  state.completed = state.prefilledRows * 4;
  state.score = 0;
  state.tempMoves = 0;
  state.undoCount = 0;
  state.lastClearBonus = 0;
  state.lastPlaced = null;
  drawNextCard();
  setMessage(state.prefilledRows === 0 ? "全排挑戰：52 張全部自己排。連續放對可累積 Combo。" : `${difficultyLabel(state.prefilledRows)}：灰色區已排好 ${state.prefilledRows} 排，連續放對可累積 Combo。`);
  render();
}

function snapshot() {
  return {
    deck: [...state.deck],
    current: state.current,
    selected: state.selected ? { ...state.selected } : null,
    stacks: state.stacks.map((stack) => [...stack]),
    goals: state.goals.map((goal) => [...goal]),
    combo: state.combo,
    completed: state.completed,
    score: state.score,
    tempMoves: state.tempMoves,
    undoCount: state.undoCount,
    lastClearBonus: state.lastClearBonus,
  };
}

function restore(data) {
  state.deck = data.deck;
  state.current = data.current;
  state.selected = data.selected;
  state.stacks = data.stacks;
  state.goals = data.goals;
  state.combo = data.combo;
  state.completed = data.completed;
  state.score = data.score;
  state.tempMoves = data.tempMoves;
  state.undoCount = data.undoCount;
  state.lastClearBonus = data.lastClearBonus;
  state.lastPlaced = null;
  render();
}

function isCleared() {
  return state.completed === targetRows * 4;
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
  return !state.selected && Boolean(state.current) && state.stacks[stackIndex].length < maxStackHeight;
}

function canMoveToGoal(goalIndex) {
  const card = sourceCard();
  if (!card) return false;
  const nextIndex = state.goals[goalIndex].length;
  return state.goalSequences[goalIndex][nextIndex] === card;
}

function scoreCorrectPlacement() {
  state.combo += 1;
  const gained = Math.min(50, 10 + (state.combo - 1) * 5);
  state.score += gained;
  return gained;
}

function applyTempMovePenalty() {
  state.combo = 0;
  state.tempMoves += 1;
  state.score = Math.max(0, state.score - tempMovePenalty);
}

function applyUndoPenalty() {
  state.combo = 0;
  state.undoCount += 1;
  state.score = Math.max(0, state.score - undoPenalty);
}

function awardClearBonus() {
  if (state.lastClearBonus > 0) return 0;
  const clearBonus = (targetRows - state.prefilledRows) * 20;
  state.lastClearBonus = clearBonus;
  state.score += clearBonus;
  return clearBonus;
}

function difficultyLabel(prefilledRows) {
  if (prefilledRows === 0) return "全排挑戰";
  if (prefilledRows <= 3) return "專家";
  if (prefilledRows <= 6) return "困難";
  if (prefilledRows <= 9) return "普通";
  return "入門";
}

function difficultyClass(prefilledRows) {
  if (prefilledRows === 0) return "difficulty-challenge";
  if (prefilledRows <= 3) return "difficulty-expert";
  if (prefilledRows <= 6) return "difficulty-hard";
  if (prefilledRows <= 9) return "difficulty-normal";
  return "difficulty-easy";
}

function showInvalidFeedback(target, message) {
  state.combo = 0;
  setMessage(message);
  const stackIndex = target?.dataset?.stack ?? target?.closest?.("[data-stack]")?.dataset?.stack;
  const goalIndex = target?.dataset?.goal ?? target?.closest?.("[data-goal]")?.dataset?.goal;
  const targetSelector =
    stackIndex !== undefined
      ? `.stack-column[data-stack="${stackIndex}"], .stack-tab[data-stack="${stackIndex}"]`
      : goalIndex !== undefined
        ? `.goal-column[data-goal="${goalIndex}"], .goal-tab[data-goal="${goalIndex}"]`
        : target?.id
          ? `#${target.id}`
          : null;

  render();

  messageEl.classList.remove("invalid-flash");
  void messageEl.offsetWidth;
  messageEl.classList.add("invalid-flash");

  const feedbackTarget = targetSelector ? document.querySelector(targetSelector) : target;
  if (feedbackTarget) {
    feedbackTarget.classList.remove("invalid-shake");
    void feedbackTarget.offsetWidth;
    feedbackTarget.classList.add("invalid-shake");
  }
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
  if (state.selected) {
    showInvalidFeedback(document.querySelector(`[data-stack="${stackIndex}"]`), "暫存牌不能移到其他暫存欄，只能放到正確的 +1～+4。Combo 歸零。");
    return;
  }
  if (!sourceCard()) {
    showInvalidFeedback(document.querySelector(`[data-stack="${stackIndex}"]`), "現在沒有牌可以放。Combo 歸零。");
    return;
  }
  if (!canPushToStack(stackIndex)) {
    showInvalidFeedback(document.querySelector(`[data-stack="${stackIndex}"]`), `${stackNames[stackIndex]} 已滿，暫存最多 ${maxStackHeight} 張。Combo 歸零。`);
    return;
  }
  state.history.push(snapshot());
  const card = takeSourceCard();
  state.stacks[stackIndex].push(card);
  state.selected = null;
  state.lastPlaced = { type: "stack", index: stackIndex, row: state.stacks[stackIndex].length - 1, card };
  applyTempMovePenalty();
  setMessage(`${card} 放入 ${stackNames[stackIndex]}，扣 ${tempMovePenalty} 分，Combo 歸零。`);
  render();
}

function moveToGoal(goalIndex, feedbackTarget = null) {
  const card = sourceCard();
  if (!card) {
    showInvalidFeedback(feedbackTarget ?? document.querySelector(`[data-goal="${goalIndex}"]`), "現在沒有牌可以放。Combo 歸零。");
    return;
  }
  if (!canMoveToGoal(goalIndex)) {
    const need = state.goalSequences[goalIndex][state.goals[goalIndex].length] ?? "完成";
    showInvalidFeedback(feedbackTarget ?? document.querySelector(`[data-goal="${goalIndex}"]`), `+${goalIndex + 1} 目前需要 ${need}，不能放 ${card}。Combo 歸零。`);
    return;
  }
  state.history.push(snapshot());
  const moved = takeSourceCard();
  state.goals[goalIndex].push(moved);
  state.selected = null;
  state.completed += 1;
  state.lastPlaced = { type: "goal", index: goalIndex, row: state.goals[goalIndex].length - 1, card: moved };
  const gained = scoreCorrectPlacement();
  setMessage(`${moved} 放到 +${goalIndex + 1}，Combo ${state.combo}，+${gained} 分。`);
  if (isCleared()) {
    const bonus = awardClearBonus();
    setMessage(`完成本局！清關加分 +${bonus}。下一局會少排好一排，難度提高。`);
  }
  render();
}

function selectStackTop(stackIndex) {
  const stack = state.stacks[stackIndex];
  if (!stack.length) {
    if (state.selected) showInvalidFeedback(document.querySelector(`[data-stack="${stackIndex}"]`), "暫存牌不能移到其他暫存欄，只能放到正確的 +1～+4。Combo 歸零。");
    else if (sourceCard()) pushToStack(stackIndex);
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
  applyUndoPenalty();
  setMessage(`已倒退一步，扣 ${undoPenalty} 分，Combo 歸零。`);
  render();
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
          const isPlaced = state.lastPlaced?.type === "stack" && state.lastPlaced.index === stackIndex && state.lastPlaced.row === rowIndex && state.lastPlaced.card === value;
          return `<button class="stack-card${isTop ? " top-card" : ""}${isSelected ? " selected" : ""}${value.length > 1 ? " rank-wide" : ""}${isPlaced ? " placed-card" : ""}" style="--i:${rowIndex}" data-rank="${value}" data-stack="${stackIndex}" data-row="${rowIndex}" type="button"><span>${value}</span></button>`;
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
          const isPlaced = state.lastPlaced?.type === "goal" && state.lastPlaced.index === goalIndex && state.lastPlaced.row === rowIndex && state.lastPlaced.card === value;
          return `<button class="goal-card${isLocked ? " locked" : ""}${isDone && !isLocked ? " done" : ""}${value.length > 1 ? " rank-wide" : ""}${isPlaced ? " placed-card" : ""}" style="--i:${rowIndex}" data-rank="${value}" data-goal="${goalIndex}" data-row="${rowIndex}" type="button"><span>${value}</span></button>`;
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
  currentCardEl.classList.toggle("rank-wide", Boolean(state.current && state.current.length > 1));
  currentCardEl.classList.toggle("active", Boolean(state.current && !state.selected));
  remainingEl.textContent = state.deck.length + (state.current ? 1 : 0);
  roundEl.textContent = state.round;
  streakEl.textContent = state.combo;
  completedEl.textContent = state.completed;
  state.bestScore = Math.max(state.bestScore, state.score);
  scoreEl.textContent = state.score;
  bestScoreEl.textContent = state.bestScore;
  prefillValueEl.textContent = state.prefilledRows;
  difficultyNameEl.textContent = difficultyLabel(state.prefilledRows);
  difficultyNameEl.className = `difficulty-name ${difficultyClass(state.prefilledRows)}`;
  prefillSlider.value = state.prefilledRows;
  hintToggle.checked = state.showFutureHints;
  undoBtn.disabled = state.history.length === 0;
  nextBtn.disabled = !isCleared();
  renderStacks();
  renderGoals();
  renderTabs();
  state.lastPlaced = null;
}

currentCardEl.addEventListener("click", () => {
  state.selected = null;
  if (!state.current) {
    setMessage("牌已經發完了，請整理暫存 stack。");
  } else {
    setMessage(`目前牌面是 ${state.current}。連續放對可累積 Combo，暫存會扣 ${tempMovePenalty} 分。`);
  }
  render();
});

document.querySelectorAll(".stack-tab").forEach((button) => {
  button.addEventListener("click", () => pushToStack(Number(button.dataset.stack)));
});

document.querySelectorAll(".goal-tab").forEach((button) => {
  button.addEventListener("click", () => moveToGoal(Number(button.dataset.goal), button));
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
  moveToGoal(Number((card ?? column).dataset.goal), card ?? column);
});

undoBtn.addEventListener("click", undo);
restartBtn.addEventListener("click", () => startRound(true));
nextBtn.addEventListener("click", () => {
  if (!isCleared()) {
    setMessage("清完全部牌後才能進入下一局。");
    return;
  }
  state.round += 1;
  state.prefilledRows = Math.max(0, state.prefilledRows - 1);
  startRound(true);
});

prefillSlider.addEventListener("input", () => {
  state.prefilledRows = Number(prefillSlider.value);
  prefillValueEl.textContent = state.prefilledRows;
  difficultyNameEl.textContent = difficultyLabel(state.prefilledRows);
  difficultyNameEl.className = `difficulty-name ${difficultyClass(state.prefilledRows)}`;
});

prefillSlider.addEventListener("change", () => {
  startRound(true);
});

hintToggle.addEventListener("change", () => {
  state.showFutureHints = hintToggle.checked;
  render();
});

startRound();
