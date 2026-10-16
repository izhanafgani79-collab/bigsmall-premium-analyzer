
"use strict";

const $ = id => document.getElementById(id);

const HISTORY_KEY = "bs_next_analyzer_history_v4";
const THEME_KEY = "bs_next_analyzer_theme_v4";

let historyResults = [];
let roundLog = [];
let lastModels = [];

/* HELPERS */

function resultName(value) {
  if (value === "B") return "BIG";
  if (value === "S") return "SMALL";
  return "—";
}

function countType(list, type) {
  return list.filter(value => value === type).length;
}

function percent(part, total) {
  return total ? ((part / total) * 100).toFixed(1) + "%" : "0.0%";
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function showMessage(message, type = "") {
  const el = $("inputMessage");
  if (!el) return;
  el.textContent = message;
  el.className = "message" + (type ? " " + type : "");
}

function makeElement(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/* PARSE HISTORY */

function parseHistory(raw) {
  let text = String(raw || "").trim().toUpperCase();

  if (!text) {
    return { results: [], error: "Pehle BIG/SMALL history enter karo." };
  }

  text = text.replace(/\bBIG\b/g, "B").replace(/\bSMALL\b/g, "S");

  let results;

  if (/^[BS\s,;|]+$/.test(text)) {
    results = text.match(/[BS]/g) || [];
  } else {
    results = text.split(/[\s,;|]+/).filter(Boolean);
    const invalid = results.find(value => value !== "B" && value !== "S");

    if (invalid) {
      return {
        results: [],
        error: `Invalid entry "${invalid}". Sirf B, S, BIG ya SMALL use karo.`
      };
    }
  }

  return results.length
    ? { results, error: "" }
    : { results: [], error: "Valid results nahi mile." };
}

/* STORAGE */

function saveData() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({
      history: historyResults,
      rounds: roundLog
    }));
  } catch (error) {
    console.warn("History save error:", error);
    showMessage("History browser mein save nahi ho saki.", "error");
  }
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "null");

    if (saved && Array.isArray(saved.history)) {
      historyResults = saved.history.filter(x => x === "B" || x === "S");
      roundLog = Array.isArray(saved.rounds) ? saved.rounds : [];
    } else if (Array.isArray(saved)) {
      historyResults = saved.filter(x => x === "B" || x === "S");
    }

    if (localStorage.getItem(THEME_KEY) === "light") {
      document.body.classList.add("light-theme");
    }
  } catch (error) {
    console.warn("Saved data load error:", error);
  }
}

/* STREAKS */

function getCurrentStreak(list) {
  if (!list.length) return { type: null, length: 0 };

  const type = list[list.length - 1];
  let length = 0;

  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] !== type) break;
    length++;
  }

  return { type, length };
}

function getLongestStreak(list, type) {
  let current = 0;
  let longest = 0;

  for (const value of list) {
    if (value === type) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}

/* MODELS */

function streakModel(list) {
  if (!list.length) {
    return { name: "Streak Model", pick: null, reason: "History available nahi hai." };
  }

  const streak = getCurrentStreak(list);

  return {
    name: "Streak Model",
    pick: streak.type,
    reason: `Latest ${streak.length} results lagataar ${resultName(streak.type)} rahe. Model current streak ko follow karta hai.`
  };
}

function alternationModel(list) {
  if (list.length < 2) {
    return { name: "Alternation Model", pick: null, reason: "Kam se kam 2 results chahiye." };
  }

  const a = list[list.length - 2];
  const b = list[list.length - 1];

  if (a === b) {
    const pick = b === "B" ? "S" : "B";
    return {
      name: "Alternation Model",
      pick,
      reason: `Last two results ${resultName(b)} the. Ye model opposite result test karta hai; ye pakka reversal nahi.`
    };
  }

  return {
    name: "Alternation Model",
    pick: b,
    reason: "Last two results alag hain. Is heuristic mein latest result ko follow kiya gaya."
  };
}

function recentFrequencyModel(list) {
  const recent = list.slice(-10);
  const big = countType(recent, "B");
  const small = countType(recent, "S");

  return {
    name: "Recent Frequency",
    pick: big === small ? null : big > small ? "B" : "S",
    reason: `Last ${recent.length} results mein BIG ${big} baar aur SMALL ${small} baar aaya.`
  };
}

function overallFrequencyModel(list) {
  const big = countType(list, "B");
  const small = countType(list, "S");

  return {
    name: "Overall Frequency",
    pick: big === small ? null : big > small ? "B" : "S",
    reason: `Total history mein BIG ${big} aur SMALL ${small} baar aaya.`
  };
}

function patternModel(list) {
  if (list.length < 10) {
    return {
      name: "Pattern Engine",
      pick: null,
      reason: "Matching sequence check ke liye kam se kam 10 results chahiye."
    };
  }

  let bigScore = 0;
  let smallScore = 0;
  let matches = 0;

  for (let size = 3; size <= Math.min(8, list.length - 1); size++) {
    const pattern = list.slice(-size).join("");

    for (let i = 0; i + size < list.length; i++) {
      if (list.slice(i, i + size).join("") !== pattern) continue;

      const next = list[i + size];
      if (next === "B") bigScore += size / 4;
      else smallScore += size / 4;

      matches++;
    }
  }

  if (!matches || bigScore === smallScore) {
    return {
      name: "Pattern Engine",
      pick: null,
      reason: matches ? "Matched patterns ke scores tie hain." : "Matching old sequence nahi mili."
    };
  }

  return {
    name: "Pattern Engine",
    pick: bigScore > smallScore ? "B" : "S",
    reason: `${matches} matching historical sequences mili. Ye heuristic score hai, verified probability nahi.`
  };
}

function calculateModels(list) {
  if (!list.length) return [];

  return [
    streakModel(list),
    alternationModel(list),
    recentFrequencyModel(list),
    overallFrequencyModel(list),
    patternModel(list)
  ];
}

/* MODEL VOTES */

function getConsensus(models) {
  const valid = models.filter(m => m.pick === "B" || m.pick === "S");
  const big = valid.filter(m => m.pick === "B").length;
  const small = valid.filter(m => m.pick === "S").length;

  if (!valid.length || big === small) {
    return {
      pick: null,
      big,
      small,
      total: valid.length,
      note: "Models se clear consensus nahi mila."
    };
  }

  return {
    pick: big > small ? "B" : "S",
    big,
    small,
    total: valid.length,
    note: `${Math.max(big, small)} of ${valid.length} active model votes ek direction mein hain.`
  };
}

/* NEXT RESULT — SEPARATE SECTION */

function renderNextResult() {
  const consensus = getConsensus(lastModels);
  const card = $("nextResultCard");
  const supporting = $("supportingModels");
  const other = $("otherModels");

  if (!card || !supporting || !other) return;

  card.className = "next-result-card neutral";
  supporting.replaceChildren();
  other.replaceChildren();

  if (!historyResults.length) {
    setText("nextResultValue", "WAITING FOR HISTORY");
    setText("nextResultVotes", "Pehle history analyze karo.");
    setText("nextResultReason", "Abhi analysis ke liye koi history available nahi hai.");

    supporting.appendChild(makeElement("p", "muted", "Abhi koi supporting model nahi."));
    other.appendChild(makeElement("p", "muted", "Abhi koi model result nahi."));
    return;
  }

  if (!consensus.pick) {
    setText("nextResultValue", "NO CLEAR SIGNAL");
    setText("nextResultVotes", `BIG ${consensus.big} votes · SMALL ${consensus.small} votes`);
    setText(
      "nextResultReason",
      "Available models tie mein hain ya unke paas clear output nahi hai. Isliye app BIG ya SMALL ko consensus result ke roop mein select nahi kar raha."
    );
  } else {
    card.classList.add(consensus.pick === "B" ? "big" : "small");

    setText("nextResultValue", resultName(consensus.pick));
    setText("nextResultVotes", `BIG ${consensus.big} votes · SMALL ${consensus.small} votes`);
    setText(
      "nextResultReason",
      `${consensus.note} ${resultName(consensus.pick)} ko zyada model votes mile. Ye historical heuristics ka output hai, agle result ki guarantee nahi.`
    );
  }

  const agree = lastModels.filter(m => m.pick && m.pick === consensus.pick);
  const disagree = lastModels.filter(m => !m.pick || m.pick !== consensus.pick);

  if (consensus.pick && agree.length) {
    agree.forEach(model => {
      const item = makeElement("div", "reason-item");
      item.append(
        makeElement("strong", "", `${model.name} · ${resultName(model.pick)}`),
        makeElement("span", "", model.reason)
      );
      supporting.appendChild(item);
    });
  } else {
    supporting.appendChild(
      makeElement("p", "muted", "Clear consensus ko support karne wale model votes nahi mile.")
    );
  }

  if (disagree.length) {
    disagree.forEach(model => {
      const item = makeElement("div", "reason-item");
      const label = model.pick
        ? `${model.name} · ${resultName(model.pick)}`
        : `${model.name} · No clear signal`;

      item.append(
        makeElement("strong", "", label),
        makeElement("span", "", model.reason)
      );
      other.appendChild(item);
    });
  } else {
    other.appendChild(
      makeElement("p", "muted", "Kisi active model ne alag direction nahi di.")
    );
  }
}

/* STATS */

function renderStats() {
  const total = historyResults.length;
  const big = countType(historyResults, "B");
  const small = countType(historyResults, "S");
  const streak = getCurrentStreak(historyResults);

  setText("totalCount", total);
  setText("bigCount", big);
  setText("smallCount", small);
  setText("bigPercent", percent(big, total));
  setText("smallPercent", percent(small, total));

  setText(
    "streakValue",
    streak.length ? `${streak.length} ${resultName(streak.type)}` : "—"
  );
  setText("streakLabel", streak.length ? "Current streak" : "No streak yet");

  setText("latestResult", total ? resultName(historyResults[total - 1]) : "—");
  setText(
    "recentTrend",
    total ? historyResults.slice(-10).map(resultName).join(" → ") : "No history yet"
  );
  setText("longBig", getLongestStreak(historyResults, "B"));
  setText("longSmall", getLongestStreak(historyResults, "S"));
}

/* MODEL DETAILS */

function renderModelDetails() {
  const container = $("modelResults");
  if (!container) return;

  container.replaceChildren();

  if (!lastModels.length) {
    container.appendChild(makeElement("p", "muted", "History analyze karne ke baad models yahan dikhenge."));
    return;
  }

  lastModels.forEach(model => {
    const card = makeElement("article", "model-card");
    card.appendChild(makeElement("h3", "", model.name));

    const pick = makeElement(
      "div",
      "model-pick" + (model.pick === "B" ? " big" : model.pick === "S" ? " small" : ""),
      model.pick ? resultName(model.pick) : "NO CLEAR SIGNAL"
    );

    card.appendChild(pick);
    card.appendChild(makeElement("p", "muted", model.reason));
    container.appendChild(card);
  });
}

/* BACKTEST */

function renderBacktest() {
  const container = $("backtestResults");
  if (!container) return;

  container.replaceChildren();

  if (historyResults.length < 12) {
    container.appendChild(makeElement("p", "muted", "Backtest ke liye kam se kam 12 results enter karo."));
    return;
  }

  let tested = 0;
  let correct = 0;
  const rows = [];

  for (let i = 10; i < historyResults.length; i++) {
    const past = historyResults.slice(0, i);
    const prediction = getConsensus(calculateModels(past));
    const actual = historyResults[i];

    if (!prediction.pick) continue;

    const match = prediction.pick === actual;
    tested++;
    if (match) correct++;

    rows.push({
      round: i + 1,
      prediction: prediction.pick,
      actual,
      match
    });
  }

  if (!tested) {
    container.appendChild(makeElement("p", "muted", "Test kiye gaye rounds mein clear consensus nahi mila."));
    return;
  }

  container.appendChild(makeElement(
    "p",
    "muted",
    `Historical matches: ${correct}/${tested} (${percent(correct, tested)}). Ye past performance hai, future guarantee nahi.`
  ));

  const wrap = makeElement("div", "table-wrap");
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");

  ["Round", "Model output", "Actual result", "Outcome"].forEach(text => {
    trHead.appendChild(makeElement("th", "", text));
  });

  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.slice(-20).reverse().forEach(row => {
    const tr = document.createElement("tr");
    [
      String(row.round),
      resultName(row.prediction),
      resultName(row.actual),
      row.match ? "Match" : "Miss"
    ].forEach(value => tr.appendChild(makeElement("td", "", value)));

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

/* TIMELINE */

function renderTimeline() {
  const container = $("historyTimeline");
  if (!container) return;

  container.replaceChildren();

  if (!historyResults.length) {
    container.appendChild(makeElement("p", "muted", "Abhi history empty hai."));
    return;
  }

  historyResults.forEach((value, index) => {
    const chip = makeElement(
      "span",
      `history-chip ${value === "B" ? "big" : "small"}`,
      `${index + 1}. ${value}`
    );
    chip.title = `${index + 1}: ${resultName(value)}`;
    container.appendChild(chip);
  });
}

function renderAll() {
  renderStats();
  renderNextResult();
  renderModelDetails();
  renderBacktest();
  renderTimeline();
}

/* ACTIONS */

function analyzeInput() {
  const input = $("historyInput");
  const parsed = parseHistory(input ? input.value : "");

  if (parsed.error) {
    showMessage(parsed.error, "error");
    return;
  }

  historyResults = parsed.results;
  roundLog = historyResults.map((result, index) => ({
    result,
    round: index + 1,
    time: new Date().toISOString()
  }));

  lastModels = calculateModels(historyResults);
  saveData();
  renderAll();

  showMessage(`${historyResults.length} results analyze ho gaye.`, "success");
}

function clearInput() {
  const input = $("historyInput");
  if (input) input.value = "";
  showMessage("Input clear ho gaya. Saved history safe hai.");
}

function addResult(result) {
  historyResults.push(result);
  roundLog.push({
    result,
    round: historyResults.length,
    time: new Date().toISOString()
  });

  const input = $("historyInput");
  if (input) input.value = historyResults.join(" ");

  lastModels = calculateModels(historyResults);
  saveData();
  renderAll();

  showMessage(`${resultName(result)} history mein add ho gaya.`, "success");
}

function undoLast() {
  if (!historyResults.length) {
    showMessage("Undo karne ke liye history empty hai.", "error");
    return;
  }

  historyResults.pop();
  roundLog.pop();

  const input = $("historyInput");
  if (input) input.value = historyResults.join(" ");

  lastModels = calculateModels(historyResults);
  saveData();
  renderAll();

  showMessage("Last result undo ho gaya.", "success");
}

function resetAll() {
  if (!confirm("Kya tum poori saved history reset karna chahte ho?")) return;

  historyResults = [];
  roundLog = [];
  lastModels = [];

  const input = $("historyInput");
  if (input) input.value = "";

  saveData();
  renderAll();
  showMessage("History reset ho gayi.", "success");
}

function exportHistory() {
  const data = {
    exportedAt: new Date().toISOString(),
    total: historyResults.length,
    big: countType(historyResults, "B"),
    small: countType(historyResults, "S"),
    history: historyResults,
    rounds: roundLog,
    note: "Historical analysis only; no guaranteed predictions."
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "big-small-history.json";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("History export ho gayi.", "success");
}

function toggleTheme() {
  const light = document.body.classList.toggle("light-theme");

  try {
    localStorage.setItem(THEME_KEY, light ? "light" : "dark");
  } catch (error) {
    console.warn("Theme preference save nahi hui:", error);
  }

  setText("themeBtn", light ? "🌙 Theme" : "☀️ Theme");
}

/* INITIALIZE */

function initApp() {
  loadData();

  $("analyzeBtn").addEventListener("click", analyzeInput);
  $("clearInputBtn").addEventListener("click", clearInput);
  $("addBigBtn").addEventListener("click", () => addResult("B"));
  $("addSmallBtn").addEventListener("click", () => addResult("S"));
  $("undoBtn").addEventListener("click", undoLast);
  $("exportBtn").addEventListener("click", exportHistory);
  $("resetBtn").addEventListener("click", resetAll);
  $("themeBtn").addEventListener("click", toggleTheme);

  setText(
    "themeBtn",
    document.body.classList.contains("light-theme") ? "🌙 Theme" : "☀️ Theme"
  );

  const input = $("historyInput");
  if (input && historyResults.length) input.value = historyResults.join(" ");

  lastModels = calculateModels(historyResults);
  renderAll();
}

initApp();
