const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const stackNames = ["暫A", "暫B", "暫C", "暫D"];
const targetRows = 13;
const maxStackHeight = 16;
const undoPenalty = 5;
const dragThreshold = 6;
const demoStepDelay = 420;
const demoSolverNodeLimit = 250000;
const demoSolverProfiles = [
  {
    name: "一般搜尋",
    progressWeight: 10000,
    deckWeight: 100,
    disorderWeight: 10,
    depthWeight: 1,
    mode: "urgency",
  },
  {
    name: "反向堆疊搜尋",
    progressWeight: 8000,
    deckWeight: 60,
    disorderWeight: 80,
    depthWeight: 1,
    mode: "reverse",
  },
];
const clearBonusesByPrefilledRows = [6000, 5000, 4200, 3500, 3000, 2500, 2000, 1600, 1200, 900, 600, 300, 100];

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
  soundEnabled: true,
  seed: initialSeed(),
  lastPlaced: null,
  stuckAnnounced: false,
  demoMode: false,
};

const dragState = {
  source: null,
  pointerId: null,
  originEl: null,
  ghostEl: null,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
  isDragging: false,
  activeTarget: null,
  suppressClick: false,
};

const currentCardEl = document.getElementById("currentCard");
const remainingEl = document.getElementById("remaining");
const summaryPrefillEl = document.getElementById("summaryPrefill");
const summaryDifficultyEl = document.getElementById("summaryDifficulty");
const stackGridEl = document.getElementById("stackGrid");
const goalGridEl = document.getElementById("goalGrid");
const streakEl = document.getElementById("streak");
const completedEl = document.getElementById("completed");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const scoreHelpBtn = document.getElementById("scoreHelpBtn");
const scoreHelpOverlay = document.getElementById("scoreHelpOverlay");
const scoreHelpCloseBtn = document.getElementById("scoreHelpCloseBtn");
const clearBonusTableEl = document.getElementById("clearBonusTable");
const messageEl = document.getElementById("message");
const undoBtn = document.getElementById("undoBtn");
const restartBtn = document.getElementById("restartBtn");
const nextBtn = document.getElementById("nextBtn");
const demoBtn = document.getElementById("demoBtn");
const prefillSlider = document.getElementById("prefillSlider");
const prefillValueEl = document.getElementById("prefillValue");
const difficultyNameEl = document.getElementById("difficultyName");
const hintToggle = document.getElementById("hintToggle");
const seedInput = document.getElementById("seedInput");
const seedApplyBtn = document.getElementById("seedApplyBtn");
const seedRandomBtn = document.getElementById("seedRandomBtn");
const soundToggle = document.getElementById("soundToggle");
const boardEl = document.querySelector(".board");
let audioContext = null;
let scoreHelpPreviousFocus = null;
let demoTimer = null;
let demoMoves = [];
let demoMoveIndex = 0;

function openScoreHelp() {
  scoreHelpPreviousFocus = document.activeElement;
  clearBonusTableEl.innerHTML = clearBonusesByPrefilledRows
    .map(
      (bonus, prefilledRows) =>
        `<div class="${prefilledRows === state.prefilledRows ? "current" : ""}"><span>${prefilledRows} 排</span><b>+${bonus}</b></div>`,
    )
    .join("");
  scoreHelpOverlay.hidden = false;
  scoreHelpCloseBtn.focus();
}

function closeScoreHelp() {
  scoreHelpOverlay.hidden = true;
  scoreHelpPreviousFocus?.focus();
}

function createDemoSolveState() {
  const goalSequences = buildGoalSequences();
  const deck = shuffle(goalSequences.flatMap((sequence) => sequence.slice(state.prefilledRows)), roundSeed());
  return {
    deck: deck.slice(0, -1),
    current: deck[deck.length - 1] ?? null,
    stacks: [[], [], [], []],
    goals: [state.prefilledRows, state.prefilledRows, state.prefilledRows, state.prefilledRows],
    goalSequences,
  };
}

function isDemoSolveCleared(solveState) {
  return solveState.goals.every((goalLength) => goalLength === targetRows);
}

function demoCanMoveToGoal(card, goalIndex, solveState) {
  if (!card) return false;
  return solveState.goalSequences[goalIndex][solveState.goals[goalIndex]] === card;
}

function demoCardUrgency(card, solveState) {
  let bestDistance = 99;
  for (let goalIndex = 0; goalIndex < solveState.goalSequences.length; goalIndex += 1) {
    const sequence = solveState.goalSequences[goalIndex];
    for (let row = solveState.goals[goalIndex]; row < targetRows; row += 1) {
      if (sequence[row] === card) {
        bestDistance = Math.min(bestDistance, row - solveState.goals[goalIndex]);
        break;
      }
    }
  }
  return bestDistance;
}

function demoCardUrgencyForGoal(card, goalIndex, solveState) {
  const sequence = solveState.goalSequences[goalIndex];
  for (let row = solveState.goals[goalIndex]; row < targetRows; row += 1) {
    if (sequence[row] === card) return row - solveState.goals[goalIndex];
  }
  return 99;
}

function demoCompletedCount(solveState) {
  return solveState.goals.reduce((total, goalLength) => total + goalLength, 0);
}

function canonicalDemoStacks(stacks) {
  return stacks.map((stack) => stack.join(",")).sort().join("|");
}

function demoSolveKey(solveState) {
  return [
    solveState.current ?? "",
    solveState.deck.join(","),
    solveState.goals.join(","),
    canonicalDemoStacks(solveState.stacks),
  ].join(";");
}

function demoStackDisorder(solveState) {
  let disorder = 0;
  for (const stack of solveState.stacks) {
    for (let index = stack.length - 1; index > 0; index -= 1) {
      const topUrgency = demoCardUrgency(stack[index], solveState);
      const buriedUrgency = demoCardUrgency(stack[index - 1], solveState);
      if (topUrgency > buriedUrgency) disorder += 20 + topUrgency - buriedUrgency;
    }
    disorder += stack.length * 0.2;
  }
  return disorder;
}

function demoReverseStackDisorder(stack, solveState) {
  if (!stack.length) return 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let goalIndex = 0; goalIndex < 4; goalIndex += 1) {
    let previousDistance = -1;
    let badOrder = 0;
    let gaps = 0;

    for (const card of stack) {
      const distance = demoCardUrgencyForGoal(card, goalIndex, solveState);
      if (previousDistance !== -1) {
        if (distance > previousDistance) badOrder += distance - previousDistance;
        else gaps += Math.max(0, previousDistance - distance - 1);
      }
      previousDistance = distance;
    }

    bestScore = Math.min(bestScore, badOrder * 100 + gaps);
  }

  return bestScore + stack.length * 0.5;
}

function demoReverseBoardDisorder(solveState) {
  return solveState.stacks.reduce((total, stack) => total + demoReverseStackDisorder(stack, solveState), 0);
}

function demoBoardDisorder(solveState, profile) {
  return profile.mode === "reverse" ? demoReverseBoardDisorder(solveState) : demoStackDisorder(solveState);
}

function demoSolvePriority(solveState, depth, profile) {
  return (
    -demoCompletedCount(solveState) * profile.progressWeight +
    solveState.deck.length * profile.deckWeight +
    demoBoardDisorder(solveState, profile) * profile.disorderWeight +
    depth * profile.depthWeight
  );
}

function demoStackMoveScore(stack, card, solveState, profile) {
  if (profile.mode === "reverse") {
    const before = demoReverseStackDisorder(stack, solveState);
    const after = demoReverseStackDisorder([...stack, card], solveState);
    const emptyBonus = stack.length ? 0 : -20;
    return (after - before) * 100 + stack.length * 3 + demoCardUrgency(card, solveState) + emptyBonus;
  }

  if (!stack.length) return -5;
  const currentUrgency = demoCardUrgency(card, solveState);
  const topCard = stack[stack.length - 1] ?? null;
  const topUrgency = topCard ? demoCardUrgency(topCard, solveState) : 999;
  const buriedPenalty = topCard && currentUrgency > topUrgency ? 1000 + currentUrgency - topUrgency : 0;
  return buriedPenalty + stack.length * 2 + (topCard ? topUrgency / 20 : -5);
}

function demoSolveActions(solveState, profile) {
  const goalMoves = [];
  for (let goalIndex = 0; goalIndex < 4; goalIndex += 1) {
    if (demoCanMoveToGoal(solveState.current, goalIndex, solveState)) goalMoves.push({ type: "current-goal", goalIndex });
  }
  for (let stackIndex = 0; stackIndex < 4; stackIndex += 1) {
    const stack = solveState.stacks[stackIndex];
    const card = stack[stack.length - 1] ?? null;
    for (let goalIndex = 0; goalIndex < 4; goalIndex += 1) {
      if (demoCanMoveToGoal(card, goalIndex, solveState)) goalMoves.push({ type: "stack-goal", stackIndex, goalIndex });
    }
  }
  if (goalMoves.length) return goalMoves;
  if (!solveState.current) return [];

  const seenStackShapes = new Set();
  const stackMoves = [];
  for (let stackIndex = 0; stackIndex < 4; stackIndex += 1) {
    const stack = solveState.stacks[stackIndex];
    if (stack.length >= maxStackHeight) continue;
    const stackShape = stack.join(",");
    if (seenStackShapes.has(stackShape)) continue;
    seenStackShapes.add(stackShape);
    stackMoves.push({
      type: "current-stack",
      stackIndex,
      score: demoStackMoveScore(stack, solveState.current, solveState, profile),
    });
  }
  stackMoves.sort((a, b) => a.score - b.score);
  return stackMoves.map(({ score, ...action }) => action);
}

function applyDemoSolveAction(solveState, action) {
  const nextState = {
    deck: solveState.deck,
    current: solveState.current,
    stacks: solveState.stacks.map((stack) => [...stack]),
    goals: [...solveState.goals],
    goalSequences: solveState.goalSequences,
  };

  if (action.type === "stack-goal") {
    nextState.stacks[action.stackIndex].pop();
    nextState.goals[action.goalIndex] += 1;
    return nextState;
  }

  if (action.type === "current-goal") {
    nextState.goals[action.goalIndex] += 1;
  } else {
    nextState.stacks[action.stackIndex].push(nextState.current);
  }

  nextState.current = nextState.deck[nextState.deck.length - 1] ?? null;
  nextState.deck = nextState.deck.slice(0, -1);
  return nextState;
}

function createDemoPriorityQueue() {
  const items = [];
  return {
    get length() {
      return items.length;
    },
    push(item) {
      items.push(item);
      let index = items.length - 1;
      while (index > 0) {
        const parentIndex = (index - 1) >> 1;
        if (items[parentIndex].priority <= item.priority) break;
        items[index] = items[parentIndex];
        index = parentIndex;
      }
      items[index] = item;
    },
    pop() {
      if (!items.length) return null;
      const top = items[0];
      const last = items.pop();
      if (items.length && last) {
        let index = 0;
        while (true) {
          const leftIndex = index * 2 + 1;
          const rightIndex = leftIndex + 1;
          if (leftIndex >= items.length) break;
          const childIndex = rightIndex < items.length && items[rightIndex].priority < items[leftIndex].priority ? rightIndex : leftIndex;
          if (items[childIndex].priority >= last.priority) break;
          items[index] = items[childIndex];
          index = childIndex;
        }
        items[index] = last;
      }
      return top;
    },
  };
}

function findDemoSolutionWithProfile(profile) {
  const seen = new Set();
  const queue = createDemoPriorityQueue();
  const searchNodes = [{ solveState: createDemoSolveState(), previous: -1, action: null, depth: 0 }];
  let visitedCount = 0;

  queue.push({ id: 0, priority: demoSolvePriority(searchNodes[0].solveState, 0, profile) });

  while (queue.length && visitedCount < demoSolverNodeLimit) {
    const item = queue.pop();
    const node = searchNodes[item.id];
    const key = demoSolveKey(node.solveState);
    if (seen.has(key)) continue;
    seen.add(key);
    visitedCount += 1;

    if (isDemoSolveCleared(node.solveState)) {
      const solution = [];
      let id = item.id;
      while (searchNodes[id].previous !== -1) {
        solution.push(searchNodes[id].action);
        id = searchNodes[id].previous;
      }
      return { solution: solution.reverse(), nodes: visitedCount };
    }

    for (const action of demoSolveActions(node.solveState, profile)) {
      const nextState = applyDemoSolveAction(node.solveState, action);
      const id = searchNodes.length;
      const depth = node.depth + 1;
      searchNodes.push({ solveState: nextState, previous: item.id, action, depth });
      queue.push({ id, priority: demoSolvePriority(nextState, depth, profile) });
    }
  }

  return { solution: null, nodes: visitedCount };
}

function findDemoSolution() {
  let searchedNodes = 0;

  for (const profile of demoSolverProfiles) {
    const result = findDemoSolutionWithProfile(profile);
    searchedNodes += result.nodes;
    if (result.solution) return { ...result, nodes: searchedNodes, profileName: profile.name };
  }

  return { solution: null, nodes: searchedNodes };
}

function applyDemoMove(action) {
  let moved = null;
  if (action.type === "current-stack") {
    moved = state.current;
    drawNextCard();
    state.stacks[action.stackIndex].push(moved);
    state.lastPlaced = { type: "stack", index: action.stackIndex, row: state.stacks[action.stackIndex].length - 1, card: moved };
    setMessage(`示範模式：${moved} 放入 ${stackNames[action.stackIndex]}，不計分。`);
  } else {
    const source = action.type === "stack-goal" ? state.stacks[action.stackIndex] : null;
    moved = source ? source.pop() : state.current;
    if (!source) drawNextCard();
    state.goals[action.goalIndex].push(moved);
    state.completed += 1;
    state.lastPlaced = { type: "goal", index: action.goalIndex, row: state.goals[action.goalIndex].length - 1, card: moved };
    setMessage(`示範模式：${moved} 放到 +${action.goalIndex + 1}，不計分。`);
  }

  state.selected = null;
  state.combo = 0;
  state.score = 0;
  render();
}

function finishDemo(message) {
  if (demoTimer) window.clearTimeout(demoTimer);
  demoTimer = null;
  demoMoves = [];
  demoMoveIndex = 0;
  state.demoMode = false;
  demoBtn.textContent = "完美示範";
  demoBtn.classList.remove("running");
  render();
  setMessage(message);
}

function runNextDemoMove() {
  if (!state.demoMode) return;
  if (demoMoveIndex >= demoMoves.length) {
    finishDemo("完美示範完成。本次示範不計分，也不更新最佳分數。");
    flashElement(boardEl, "round-clear");
    return;
  }

  applyDemoMove(demoMoves[demoMoveIndex]);
  demoMoveIndex += 1;
  demoTimer = window.setTimeout(runNextDemoMove, demoStepDelay);
}

function startPerfectDemo() {
  if (state.demoMode) {
    finishDemo("已停止示範。你可以重新開始或自己接著玩。");
    return;
  }

  setMessage("正在尋找完美示範解，請稍等。");
  demoBtn.disabled = true;
  window.setTimeout(() => {
    const { solution, nodes, profileName } = findDemoSolution();
    demoBtn.disabled = false;
    if (!solution) {
      setMessage(`示範器在 ${nodes.toLocaleString()} 個狀態內還沒找到路徑；這不代表無解，可以自己挑戰、換挑戰碼，或降低難度再試。`);
      return;
    }

    startRound(true);
    state.demoMode = true;
    state.score = 0;
    state.combo = 0;
    state.history = [];
    demoMoves = solution;
    demoMoveIndex = 0;
    demoBtn.textContent = "停止示範";
    demoBtn.classList.add("running");
    setMessage(`示範模式：${profileName}找到 ${solution.length} 步解法，正在自動演示，不計分。`);
    render();
    demoTimer = window.setTimeout(runNextDemoMove, demoStepDelay);
  }, 30);
}

function createDeck() {
  return buildGoalSequences().flatMap((sequence) => sequence.slice(state.prefilledRows));
}

function initialSeed() {
  const hashSeed = normalizeSeed(window.location.hash.slice(1));
  return hashSeed || randomSeed();
}

function randomSeed() {
  return Math.floor(0x100000 + Math.random() * 0xf00000)
    .toString(36)
    .toUpperCase();
}

function normalizeSeed(value) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 12).toUpperCase();
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seedText) {
  let seed = hashString(seedText);
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(cards, seedText) {
  const result = [...cards];
  const random = seededRandom(seedText);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function roundSeed() {
  return `${state.seed}:round-${state.round}:prefill-${state.prefilledRows}`;
}

function syncSeedHash() {
  const nextHash = `#${state.seed}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, "", nextHash);
  }
}

function audioSettings(kind) {
  const sounds = {
    place: [
      { frequency: 520, delay: 0, duration: 0.07, gain: 0.045 },
      { frequency: 780, delay: 0.065, duration: 0.08, gain: 0.035 },
    ],
    temp: [{ frequency: 330, delay: 0, duration: 0.06, gain: 0.035 }],
    invalid: [{ frequency: 180, delay: 0, duration: 0.09, gain: 0.035 }],
    undo: [
      { frequency: 420, delay: 0, duration: 0.055, gain: 0.03 },
      { frequency: 260, delay: 0.055, duration: 0.07, gain: 0.03 },
    ],
    clear: [
      { frequency: 520, delay: 0, duration: 0.07, gain: 0.04 },
      { frequency: 660, delay: 0.07, duration: 0.07, gain: 0.04 },
      { frequency: 880, delay: 0.14, duration: 0.1, gain: 0.04 },
    ],
    stuck: [
      { frequency: 240, delay: 0, duration: 0.075, gain: 0.03 },
      { frequency: 190, delay: 0.08, duration: 0.09, gain: 0.028 },
    ],
  };
  return sounds[kind] ?? [];
}

function playSound(kind) {
  if (!state.soundEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    const now = audioContext.currentTime;
    audioSettings(kind).forEach(({ frequency, delay, duration, gain }) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      gainNode.gain.setValueAtTime(0.0001, now + delay);
      gainNode.gain.exponentialRampToValueAtTime(gain, now + delay + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.02);
    });
  } catch {
    state.soundEnabled = false;
    soundToggle.checked = false;
  }
}

function flashElement(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
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
  syncSeedHash();
  state.deck = shuffle(createDeck(), roundSeed());
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
  state.stuckAnnounced = false;
  drawNextCard();
  setMessage(
    state.prefilledRows === 0
      ? `全排挑戰：52 張全部自己排。挑戰碼 ${state.seed}。`
      : `${difficultyLabel(state.prefilledRows)}：灰色區已排好 ${state.prefilledRows} 排。挑戰碼 ${state.seed}。`,
  );
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
  state.stuckAnnounced = false;
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

function cardFromSource(source) {
  if (!source) return null;
  if (source.type === "stack") {
    const stack = state.stacks[source.stackIndex];
    return stack[stack.length - 1] ?? null;
  }
  return state.current;
}

function canPushToStack(stackIndex) {
  return !state.selected && Boolean(state.current) && state.stacks[stackIndex].length < maxStackHeight;
}

function canMoveToGoal(goalIndex) {
  const card = sourceCard();
  if (!card) return false;
  return cardCanMoveToGoal(card, goalIndex);
}

function cardCanMoveToGoal(card, goalIndex) {
  const nextIndex = state.goals[goalIndex].length;
  return state.goalSequences[goalIndex][nextIndex] === card;
}

function nextNeededCard(goalIndex) {
  return state.goalSequences[goalIndex][state.goals[goalIndex].length] ?? "完成";
}

function cardCanMoveToAnyGoal(card) {
  return state.goalSequences.some((sequence, goalIndex) => cardCanMoveToGoal(card, goalIndex));
}

function autoGoalSource(goalIndex) {
  if (cardCanMoveToGoal(state.current, goalIndex)) return { type: "current" };

  for (let stackIndex = 0; stackIndex < state.stacks.length; stackIndex += 1) {
    const stack = state.stacks[stackIndex];
    const card = stack[stack.length - 1] ?? null;
    if (cardCanMoveToGoal(card, goalIndex)) return { type: "stack", stackIndex };
  }

  return null;
}

function hasAnyLegalMove() {
  if (isCleared()) return true;
  if (state.stacks.some((stack) => stack.length > 0 && cardCanMoveToAnyGoal(stack[stack.length - 1]))) return true;
  if (!state.current) return false;
  return state.stacks.some((stack) => stack.length < maxStackHeight) || cardCanMoveToAnyGoal(state.current);
}

function isStuck() {
  return !isCleared() && !hasAnyLegalMove();
}

function reflectionForGoal(goalIndex, card) {
  return `+${goalIndex + 1} 目前需要 ${nextNeededCard(goalIndex)}，不能放 ${card}。先想想：${card} 要等哪一條數列輪到它？`;
}

function scoreCorrectPlacement() {
  state.combo += 1;
  const gained = 20 + state.combo * 10;
  state.score += gained;
  return gained;
}

function breakComboForTempMove() {
  state.combo = 0;
  state.tempMoves += 1;
}

function applyUndoPenalty() {
  state.combo = 0;
  state.undoCount += 1;
  state.score = Math.max(0, state.score - undoPenalty);
}

function awardClearBonus() {
  if (state.lastClearBonus > 0) return 0;
  const clearBonus = clearBonusesByPrefilledRows[state.prefilledRows] ?? 0;
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
  playSound("invalid");
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

function clearDragHighlights() {
  document.querySelectorAll(".drop-available, .drop-active").forEach((element) => {
    element.classList.remove("drop-available", "drop-active");
  });
}

function dragZoneElements(type, index) {
  const selector =
    type === "stack"
      ? `.stack-column[data-stack="${index}"], .stack-tab[data-stack="${index}"]`
      : `.goal-column[data-goal="${index}"], .goal-tab[data-goal="${index}"]`;
  return [...document.querySelectorAll(selector)];
}

function markDropZones() {
  clearDragHighlights();
  for (let index = 0; index < 4; index += 1) {
    dragZoneElements("stack", index).forEach((element) => element.classList.add("drop-available"));
    dragZoneElements("goal", index).forEach((element) => element.classList.add("drop-available"));
  }
}

function dropTargetFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element) return null;

  const stackElement = element.closest("[data-stack]");
  if (stackElement) {
    return { type: "stack", index: Number(stackElement.dataset.stack), element: stackElement };
  }

  const goalElement = element.closest("[data-goal]");
  if (goalElement) {
    return { type: "goal", index: Number(goalElement.dataset.goal), element: goalElement };
  }

  return null;
}

function updateActiveDropTarget(clientX, clientY) {
  document.querySelectorAll(".drop-active").forEach((element) => element.classList.remove("drop-active"));
  const target = dropTargetFromPoint(clientX, clientY);
  dragState.activeTarget = target;
  if (!target) return;
  dragZoneElements(target.type, target.index).forEach((element) => element.classList.add("drop-active"));
}

function createDragGhost(clientX, clientY) {
  if (!dragState.originEl) return;
  const rect = dragState.originEl.getBoundingClientRect();
  const ghost = dragState.originEl.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  dragState.ghostEl = ghost;
  moveDragGhost(clientX, clientY);
  dragState.originEl.classList.add(dragState.source?.type === "stack" ? "drag-source-hidden" : "drag-source");
}

function moveDragGhost(clientX, clientY) {
  if (!dragState.ghostEl) return;
  dragState.ghostEl.style.left = `${clientX - dragState.offsetX}px`;
  dragState.ghostEl.style.top = `${clientY - dragState.offsetY}px`;
}

function resetDragState() {
  dragState.source = null;
  dragState.pointerId = null;
  dragState.originEl = null;
  dragState.ghostEl = null;
  dragState.startX = 0;
  dragState.startY = 0;
  dragState.offsetX = 0;
  dragState.offsetY = 0;
  dragState.isDragging = false;
  dragState.activeTarget = null;
}

function releaseClickSuppressionSoon() {
  window.setTimeout(() => {
    dragState.suppressClick = false;
  }, 0);
}

function endDragVisuals() {
  if (dragState.ghostEl) dragState.ghostEl.remove();
  if (dragState.originEl) dragState.originEl.classList.remove("drag-source", "drag-source-hidden");
  clearDragHighlights();
}

function startPointerDrag(event, source, originEl) {
  if (state.demoMode) return;
  if (!originEl || event.button > 0) return;
  if (source.type === "current" && !state.current) return;
  if (source.type === "stack") {
    const stack = state.stacks[source.stackIndex];
    if (!stack.length || Number(originEl.dataset.row) !== stack.length - 1) return;
  }

  const rect = originEl.getBoundingClientRect();
  dragState.source = source;
  dragState.pointerId = event.pointerId;
  dragState.originEl = originEl;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.offsetX = event.clientX - rect.left;
  dragState.offsetY = event.clientY - rect.top;
}

function beginDrag(event) {
  dragState.isDragging = true;
  dragState.suppressClick = true;
  createDragGhost(event.clientX, event.clientY);
  markDropZones();
  updateActiveDropTarget(event.clientX, event.clientY);
  setMessage("拖曳到暫存欄，或嘗試放到 +1～+4 目標欄。");
}

function finishDrag(event) {
  const target = dragState.activeTarget ?? dropTargetFromPoint(event.clientX, event.clientY);
  const source = dragState.source ? { ...dragState.source } : null;

  endDragVisuals();
  resetDragState();

  if (!source || !target) {
    setMessage("拖曳已取消，牌仍在原位。");
    render();
    releaseClickSuppressionSoon();
    return;
  }

  if (source.type === "current") {
    state.selected = null;
    if (target.type === "stack") pushToStack(target.index);
    else moveToGoal(target.index, target.element);
    releaseClickSuppressionSoon();
    return;
  }

  if (target.type === "stack" && target.index === source.stackIndex) {
    state.selected = null;
    setMessage(`${stackNames[source.stackIndex]}：已放回原本暫存欄。`);
    render();
    releaseClickSuppressionSoon();
    return;
  }

  state.selected = { stackIndex: source.stackIndex };
  if (target.type === "goal") moveToGoal(target.index, target.element);
  else pushToStack(target.index);
  releaseClickSuppressionSoon();
}

function onPointerMove(event) {
  if (dragState.pointerId !== event.pointerId || !dragState.source) return;
  const distanceX = event.clientX - dragState.startX;
  const distanceY = event.clientY - dragState.startY;
  if (!dragState.isDragging && Math.hypot(distanceX, distanceY) >= dragThreshold) beginDrag(event);
  if (!dragState.isDragging) return;
  event.preventDefault();
  moveDragGhost(event.clientX, event.clientY);
  updateActiveDropTarget(event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (dragState.pointerId !== event.pointerId || !dragState.source) return;
  if (dragState.isDragging) {
    event.preventDefault();
    finishDrag(event);
  } else {
    resetDragState();
  }
}

function onPointerCancel(event) {
  if (dragState.pointerId !== event.pointerId || !dragState.source) return;
  endDragVisuals();
  resetDragState();
  setMessage("拖曳已取消，牌仍在原位。");
  render();
  releaseClickSuppressionSoon();
}

function takeSourceCard() {
  if (state.selected) {
    return state.stacks[state.selected.stackIndex].pop();
  }
  const card = state.current;
  drawNextCard();
  return card;
}

function takeCardFromSource(source) {
  if (source.type === "stack") return state.stacks[source.stackIndex].pop();
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
  breakComboForTempMove();
  setMessage(`${card} 放入 ${stackNames[stackIndex]}，Combo 歸零，不扣分。`);
  playSound("temp");
  render();
  flashElement(scoreEl, "stat-pop");
}

function placeSourceOnGoal(goalIndex, source, feedbackTarget = null) {
  const card = cardFromSource(source);
  if (!card) {
    showInvalidFeedback(feedbackTarget ?? document.querySelector(`[data-goal="${goalIndex}"]`), "現在沒有牌可以放。Combo 歸零。");
    return;
  }
  if (!cardCanMoveToGoal(card, goalIndex)) {
    showInvalidFeedback(feedbackTarget ?? document.querySelector(`[data-goal="${goalIndex}"]`), `${reflectionForGoal(goalIndex, card)} Combo 歸零。`);
    return;
  }
  state.history.push(snapshot());
  const moved = takeCardFromSource(source);
  state.goals[goalIndex].push(moved);
  state.selected = null;
  state.completed += 1;
  state.lastPlaced = { type: "goal", index: goalIndex, row: state.goals[goalIndex].length - 1, card: moved };
  const gained = scoreCorrectPlacement();
  setMessage(`${moved} 放到 +${goalIndex + 1}，Combo ${state.combo}，+${gained} 分。`);
  let cleared = false;
  if (isCleared()) {
    const bonus = awardClearBonus();
    setMessage(`完成本局！清關加分 +${bonus}。下一局會少排好一排，難度提高。`);
    cleared = true;
  }
  playSound(cleared ? "clear" : "place");
  render();
  flashElement(scoreEl, "stat-pop");
  flashElement(completedEl, "stat-pop");
  if (cleared) flashElement(boardEl, "round-clear");
}

function moveToGoal(goalIndex, feedbackTarget = null) {
  const source = state.selected ? { type: "stack", stackIndex: state.selected.stackIndex } : { type: "current" };
  placeSourceOnGoal(goalIndex, source, feedbackTarget);
}

function autoMoveToGoal(goalIndex, feedbackTarget = null) {
  const source = autoGoalSource(goalIndex);
  if (!source) {
    showInvalidFeedback(
      feedbackTarget ?? document.querySelector(`[data-goal="${goalIndex}"]`),
      `+${goalIndex + 1} 目前需要 ${nextNeededCard(goalIndex)}，牌頂與暫A～暫D最上面都沒有可放的卡片。Combo 歸零。`,
    );
    return;
  }

  placeSourceOnGoal(goalIndex, source, feedbackTarget);
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
  playSound("undo");
  render();
  flashElement(scoreEl, "stat-pop");
}

function setMessage(text) {
  messageEl.textContent = text;
}

function updateStuckState() {
  const stuck = isStuck();
  messageEl.classList.toggle("stuck-message", stuck);
  if (!stuck) {
    state.stuckAnnounced = false;
    return;
  }
  if (state.stuckAnnounced) return;
  state.stuckAnnounced = true;
  setMessage("卡住了：目前沒有可以合法移動的牌。可以倒退一步想想，或再一次重新挑戰。");
  playSound("stuck");
}

function renderStacks() {
  stackGridEl.innerHTML = state.stacks
    .map((stack, stackIndex) => {
      const cards = stack
        .map((value, rowIndex) => {
          const isTop = rowIndex === stack.length - 1;
          const isSelected = state.selected?.stackIndex === stackIndex && isTop;
          const isPlaced = state.lastPlaced?.type === "stack" && state.lastPlaced.index === stackIndex && state.lastPlaced.row === rowIndex && state.lastPlaced.card === value;
          return `<button class="stack-card${isTop ? " top-card draggable-card" : ""}${isSelected ? " selected" : ""}${value.length > 1 ? " rank-wide" : ""}${isPlaced ? " placed-card" : ""}" style="--i:${rowIndex}" data-rank="${value}" data-stack="${stackIndex}" data-row="${rowIndex}" type="button"><span>${value}</span></button>`;
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
  document.querySelectorAll(".stack-tab, .goal-tab, .stack-column, .goal-column").forEach((element) => {
    element.classList.remove("can-drop", "drop-available", "drop-active");
  });
}

function render() {
  currentCardEl.textContent = state.current ?? "-";
  currentCardEl.dataset.rank = state.current ?? "";
  currentCardEl.classList.toggle("rank-wide", Boolean(state.current && state.current.length > 1));
  currentCardEl.classList.toggle("active", Boolean(state.current && !state.selected));
  currentCardEl.classList.toggle("empty", !state.current && state.deck.length === 0);
  remainingEl.textContent = state.deck.length + (state.current ? 1 : 0);
  summaryPrefillEl.textContent = state.prefilledRows;
  summaryDifficultyEl.textContent = difficultyLabel(state.prefilledRows);
  summaryDifficultyEl.dataset.difficulty = difficultyClass(state.prefilledRows);
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
  soundToggle.checked = state.soundEnabled;
  if (document.activeElement !== seedInput) seedInput.value = state.seed;
  undoBtn.disabled = state.demoMode || state.history.length === 0;
  restartBtn.disabled = state.demoMode;
  nextBtn.disabled = state.demoMode || !isCleared();
  currentCardEl.disabled = state.demoMode;
  prefillSlider.disabled = state.demoMode;
  hintToggle.disabled = state.demoMode;
  seedInput.disabled = state.demoMode;
  seedApplyBtn.disabled = state.demoMode;
  seedRandomBtn.disabled = state.demoMode;
  demoBtn.textContent = state.demoMode ? "停止示範" : "完美示範";
  demoBtn.classList.toggle("running", state.demoMode);
  renderStacks();
  renderGoals();
  renderTabs();
  state.lastPlaced = null;
  updateStuckState();
}

currentCardEl.addEventListener("click", () => {
  if (state.demoMode) return;
  if (dragState.suppressClick) {
    dragState.suppressClick = false;
    return;
  }
  state.selected = null;
  if (!state.current) {
    setMessage("牌已經發完了，請整理暫存 stack。");
  } else {
    setMessage(`目前牌面是 ${state.current}。連續放對可累積 Combo，暫存只會中斷 Combo，不扣分。`);
  }
  render();
});

currentCardEl.addEventListener("pointerdown", (event) => {
  startPointerDrag(event, { type: "current" }, currentCardEl);
});

document.querySelectorAll(".stack-tab").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.demoMode) return;
    pushToStack(Number(button.dataset.stack));
  });
});

document.querySelectorAll(".goal-tab").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.demoMode) return;
    autoMoveToGoal(Number(button.dataset.goal), button);
  });
});

stackGridEl.addEventListener("click", (event) => {
  if (state.demoMode) return;
  if (dragState.suppressClick) {
    dragState.suppressClick = false;
    return;
  }
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

stackGridEl.addEventListener("pointerdown", (event) => {
  if (state.demoMode) return;
  const card = event.target.closest(".stack-card.top-card");
  if (!card) return;
  startPointerDrag(event, { type: "stack", stackIndex: Number(card.dataset.stack) }, card);
});

goalGridEl.addEventListener("click", (event) => {
  if (state.demoMode) return;
  const card = event.target.closest(".goal-card");
  const column = event.target.closest(".goal-column");
  if (!card && !column) return;
  moveToGoal(Number((card ?? column).dataset.goal), card ?? column);
});

undoBtn.addEventListener("click", () => {
  if (state.demoMode) return;
  undo();
});
restartBtn.addEventListener("click", () => {
  if (state.demoMode) return;
  startRound(true);
});
nextBtn.addEventListener("click", () => {
  if (state.demoMode) return;
  if (!isCleared()) {
    setMessage("清完全部牌後才能進入下一局。");
    return;
  }
  state.round += 1;
  state.prefilledRows = Math.max(0, state.prefilledRows - 1);
  startRound(true);
});

prefillSlider.addEventListener("input", () => {
  if (state.demoMode) return;
  state.prefilledRows = Number(prefillSlider.value);
  summaryPrefillEl.textContent = state.prefilledRows;
  summaryDifficultyEl.textContent = difficultyLabel(state.prefilledRows);
  summaryDifficultyEl.dataset.difficulty = difficultyClass(state.prefilledRows);
  prefillValueEl.textContent = state.prefilledRows;
  difficultyNameEl.textContent = difficultyLabel(state.prefilledRows);
  difficultyNameEl.className = `difficulty-name ${difficultyClass(state.prefilledRows)}`;
});

prefillSlider.addEventListener("change", () => {
  if (state.demoMode) return;
  startRound(true);
});

hintToggle.addEventListener("change", () => {
  if (state.demoMode) return;
  state.showFutureHints = hintToggle.checked;
  render();
});

seedApplyBtn.addEventListener("click", () => {
  if (state.demoMode) return;
  state.seed = normalizeSeed(seedInput.value) || randomSeed();
  seedInput.value = state.seed;
  startRound(false);
});

seedInput.addEventListener("keydown", (event) => {
  if (state.demoMode) return;
  if (event.key !== "Enter") return;
  event.preventDefault();
  seedApplyBtn.click();
});

seedRandomBtn.addEventListener("click", () => {
  if (state.demoMode) return;
  state.seed = randomSeed();
  seedInput.value = state.seed;
  startRound(false);
});

soundToggle.addEventListener("change", () => {
  state.soundEnabled = soundToggle.checked;
  if (state.soundEnabled) playSound("place");
});

demoBtn.addEventListener("click", startPerfectDemo);

scoreHelpBtn.addEventListener("click", openScoreHelp);
scoreHelpCloseBtn.addEventListener("click", closeScoreHelp);
scoreHelpOverlay.addEventListener("click", (event) => {
  if (event.target === scoreHelpOverlay) closeScoreHelp();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !scoreHelpOverlay.hidden) closeScoreHelp();
});

window.addEventListener("pointermove", onPointerMove, { passive: false });
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerCancel);

startRound();
