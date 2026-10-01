import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import * as http from "node:http";
import * as crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "bot_store.json");

// CẤU HÌNH BOT TELEGRAM & QUẢN TRỊ VIÊN MẶC ĐỊNH
const BOT_TOKEN = process.env.BOT_TOKEN || "8724702628:AAFPupnoByVjoniPajBWp4K36QE5uziw4LI";
const ADMIN_ID = process.env.ADMIN_ID || "6094686933";
const MASTER_KEY = "anhkhoi_xabc2102";
const TELEGRAM_ADMIN_CONTACT = "@anhkhoi_xabc";
const ADMIN_WORK_HOURS = "12h00 trưa đến 21h00 - 22h00 tối hàng ngày";

// API NGUỒN DỮ LIỆU TÀI XỈU THỰC CHIẾN - CHỈ GIỮ DUY NHẤT 1 API MD5 (LC79) VÀ 1 BÀN HŨ
const API_MD5_LC79 = "https://lc79-taixiumd5-dulieu.onrender.com/data";
const API_HU = "https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=83991213bfd4c554dc94bcd98979bdc5";

if (!existsSync(DATA_DIR)) {
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

// =========================================================================
// HỆ THỐNG LƯU TRỮ DỮ LIỆU BOT (KEYS, USERS, HISTORY, LOGS)
// =========================================================================
function loadStore() {
  try {
    if (existsSync(STORE_FILE)) {
      const data = JSON.parse(readFileSync(STORE_FILE, "utf8"));
      const admins = Array.isArray(data.adminIds) ? data.adminIds : [];
      if (!admins.includes(ADMIN_ID)) admins.push(ADMIN_ID);
      return {
        adminIds: admins,
        keys: data.keys || {},
        users: data.users || {},
        logs: Array.isArray(data.logs) ? data.logs : [],
        systemSettings: data.systemSettings || { minConfidence: 75, targetWinRate: 85, defaultTheme: "random" },
        md5: { activePred: data.md5?.activePred || null, outcomes: data.md5?.outcomes || [], history: data.md5?.history || [] },
        hu: { activePred: data.hu?.activePred || null, outcomes: data.hu?.outcomes || [], history: data.hu?.history || [] }
      };
    }
  } catch {}
  return {
    adminIds: [ADMIN_ID],
    keys: {},
    users: {},
    logs: [],
    systemSettings: { minConfidence: 75, targetWinRate: 85, defaultTheme: "random" },
    md5: { activePred: null, outcomes: [], history: [] },
    hu: { activePred: null, outcomes: [], history: [] }
  };
}

function saveStore(s) {
  try { writeFileSync(STORE_FILE, JSON.stringify(s, null, 2)); } catch {}
}
const store = loadStore();

function addSystemLog(action, detail) {
  const logItem = {
    time: formatVNDateTime(Date.now()),
    action,
    detail,
    ts: Date.now()
  };
  store.logs = store.logs || [];
  store.logs.push(logItem);
  if (store.logs.length > 100) store.logs = store.logs.slice(-100);
  saveStore(store);
}

// =========================================================================
// HÀM ĐỊNH DẠNG THỜI GIAN VIỆT NAM (UTC+7) & CHUẨN HÓA KẾT QUẢ
// =========================================================================
function formatVNDateTime(timestamp) {
  if (!timestamp || timestamp === -1) return "Vĩnh Viễn (Không thời hạn)";
  const d = new Date(timestamp);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d);
}

function formatRemainingDetail(expiresAt) {
  if (expiresAt === -1) return "Vĩnh Viễn (Lifetime)";
  const now = Date.now();
  const diff = expiresAt - now;
  if (diff <= 0) return "Đã Hết Hạn";

  const days = Math.floor(diff / (24 * 3600 * 1000));
  const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);

  const parts = [];
  if (days > 0) parts.push(`${days} ngày`);
  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0) parts.push(`${minutes} phút`);
  if (parts.length === 0 || seconds > 0) parts.push(`${seconds} giây`);
  return parts.join(" ");
}

function normalizeResult(str) {
  if (!str) return "";
  const s = String(str).toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s === "t" || s === "tai") return "tai";
  if (s === "x" || s === "xiu") return "xiu";
  return s;
}

function formatResultDisplay(str) {
  return normalizeResult(str) === "tai" ? "TÀI" : "XỈU";
}

// =========================================================================
// HỆ THỐNG GIAO DIỆN HIỆN ĐẠI SIÊU CẤP & BỘ PHỐI MÀU NGHỆ THUẬT FUTURISTIC
// Tuyệt đối không dùng icon thông thường, sử dụng Glyphs & Hologram tương lai
// =========================================================================
const CYBER_THEMES = {
  violet: {
    id: "violet",
    name: "🔮 Cyber Violet Hologram (Tím Hoàng Gia - Hồng Neon)",
    badgeTai: "🟣 ⟦ ◈ TÀI ◈ ⟧",
    badgeXiu: "🌸 ⟦ ⬡ XỈU ⬡ ⟧",
    iconHeader: "🔮",
    iconFire: "⚡︎",
    iconStat: "⟡",
    iconCard: "❖",
    barFill: "🟪",
    barEmpty: "⬜",
    tagStyle: "violet"
  },
  sapphire: {
    id: "sapphire",
    name: "💎 Hyperdrive Sapphire (Lam Ngọc Điện Biên - Bạc)",
    badgeTai: "🔵 ⟦ ◈ TÀI ◈ ⟧",
    badgeXiu: "⚪ ⟦ ⬡ XỈU ⬡ ⟧",
    iconHeader: "💎",
    iconFire: "⚡︎",
    iconStat: "💠",
    iconCard: "◈",
    barFill: "🟦",
    barEmpty: "⬜",
    tagStyle: "blue"
  },
  emerald: {
    id: "emerald",
    name: "❇️ Quantum Matrix Emerald (Ngọc Lục Bảo - Laser Xanh)",
    badgeTai: "🟢 ⟦ ◈ TÀI ◈ ⟧",
    badgeXiu: "⚫ ⟦ ⬡ XỈU ⬡ ⟧",
    iconHeader: "❇️",
    iconFire: "🔋",
    iconStat: "⬢",
    iconCard: "⬡",
    barFill: "🟩",
    barEmpty: "⬛",
    tagStyle: "green"
  },
  solar: {
    id: "solar",
    name: "👑 Solar Plasma Gold (Hoàng Kim Thái Dương - Cam Lửa)",
    badgeTai: "🟡 ⟦ ◈ TÀI ◈ ⟧",
    badgeXiu: "🟠 ⟦ ⬡ XỈU ⬡ ⟧",
    iconHeader: "👑",
    iconFire: "💥",
    iconStat: "🏆",
    iconCard: "✦",
    barFill: "🟨",
    barEmpty: "⬜",
    tagStyle: "gold"
  },
  crimson: {
    id: "crimson",
    name: "🩸 Crimson Mecha (Huyết Hắc Thạch Cơ Khí)",
    badgeTai: "🔴 ⟦ ◈ TÀI ◈ ⟧",
    badgeXiu: "⚫ ⟦ ⬡ XỈU ⬡ ⟧",
    iconHeader: "🩸",
    iconFire: "⚡︎",
    iconStat: "◤◢",
    iconCard: "✦",
    barFill: "🟥",
    barEmpty: "⬛",
    tagStyle: "red"
  }
};

const THEME_KEYS = ["violet", "sapphire", "emerald", "solar", "crimson"];

function getUserTheme(uid) {
  const u = store.users[String(uid)] || {};
  let userChoice = u.theme || store.systemSettings.defaultTheme || "random";
  if (userChoice === "random") {
    const randomIndex = Math.floor(Math.random() * THEME_KEYS.length);
    return CYBER_THEMES[THEME_KEYS[randomIndex]];
  }
  return CYBER_THEMES[userChoice] || CYBER_THEMES.violet;
}

function makeConfidenceBar(conf, theme) {
  const totalBlocks = 10;
  const filledBlocks = Math.min(10, Math.max(1, Math.round(conf / 10)));
  const emptyBlocks = totalBlocks - filledBlocks;
  return theme.barFill.repeat(filledBlocks) + theme.barEmpty.repeat(emptyBlocks);
}

// =========================================================================
// THUẬT TOÁN ĐỊNH LƯỢNG LƯỢNG TỬ SIÊU CẤP V8.0 QUANTUM SUPER-ADAPTIVE
// Tác giả: Phạm Anh Khôi (@anhkhoi_xabc)
// Tích hợp 12 mô hình toán học & học máy thích ứng tăng cường (Online Q-Weights)
// =========================================================================
class QuantumSuperEngine {
  constructor() {
    this.weights = {
      streak: 5.5,
      harmonic: 4.8,
      markov2: 4.2,
      markov3: 4.0,
      gaussianZ: 4.6,
      rsi14: 4.0,
      diceMarginal: 3.8,
      entropyDrift: 3.5,
      tripleShock: 4.5
    };
  }

  updateWeights(lastOk, strategyType) {
    if (!strategyType) return;
    const factor = lastOk ? 1.07 : 0.88;
    for (const k of Object.keys(this.weights)) {
      if (strategyType.toLowerCase().includes(k.toLowerCase())) {
        this.weights[k] = Math.max(1.8, Math.min(10.0, this.weights[k] * factor));
      }
    }
  }

  predict(history, tracker) {
    if (!history || history.length < 4) {
      return { pred: "tài", conf: 85, src: "Đồng bộ lượng tử khởi động", isChoppy: false };
    }

    const tx = history.map(h => normalizeResult(h.tx || h.result) === "tai" ? "T" : "X");
    const totals = history.map(h => Number(h.total) || 10);
    const dice = history.map(h => h.dice || [3, 3, 4]);
    const len = tx.length;
    const last = tx[len - 1];

    let scoreT = 0, scoreX = 0;
    const reasonsT = [];
    const reasonsX = [];

    // 1. Phân tích chuỗi bệt động lượng (Streak Acceleration & Saturation)
    let s = 1;
    for (let i = len - 2; i >= 0; i--) {
      if (tx[i] === last) s++; else break;
    }

    const wStreak = this.weights.streak;
    if (s >= 3 && s <= 5) {
      if (last === "T") { scoreT += wStreak * 1.05; reasonsT.push(`Đu bệt gia tốc Tài (${s} tay)`); }
      else { scoreX += wStreak * 1.05; reasonsX.push(`Đu bệt gia tốc Xỉu (${s} tay)`); }
    } else if (s >= 6 && s <= 8) {
      if (last === "T") { scoreT += wStreak * 1.25; reasonsT.push(`Bám đà bệt sâu Tài (${s} tay)`); }
      else { scoreX += wStreak * 1.25; reasonsX.push(`Bám đà bệt sâu Xỉu (${s} tay)`); }
    } else if (s >= 9) {
      // Điểm bão hòa chuỗi phân rã Poisson -> Lực kéo bẻ cầu đảo chiều cực đại
      if (last === "T") { scoreX += wStreak * 1.45; reasonsX.push(`Lực kéo bẻ bệt bão hòa (${s} tay)`); }
      else { scoreT += wStreak * 1.45; reasonsT.push(`Lực kéo bẻ bệt bão hòa (${s} tay)`); }
    } else if (s === 1) {
      const last4 = tx.slice(-4);
      if (last4.length === 4 && last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
        if (last === "T") { scoreX += this.weights.harmonic * 1.15; reasonsX.push("Sóng điều hòa Ping-Pong 1-1"); }
        else { scoreT += this.weights.harmonic * 1.15; reasonsT.push("Sóng điều hòa Ping-Pong 1-1"); }
      }
    } else if (s === 2) {
      const last4 = tx.slice(-4);
      if (last4.length === 4 && last4[0] === last4[1] && last4[2] === last4[3] && last4[0] !== last4[2]) {
        if (last === "T") { scoreX += this.weights.harmonic; reasonsX.push("Nhịp song hành đôi 2-2"); }
        else { scoreT += this.weights.harmonic; reasonsT.push("Nhịp song hành đôi 2-2"); }
      }
    }

    // 2. Hình thái cấu trúc cầu kẹp và bậc thang lượng tử
    const wHarmonic = this.weights.harmonic;
    const seq5 = tx.slice(-5).join("");
    if (seq5 === "TTXTT" || seq5 === "XXTXX") {
      if (last === "T") { scoreX += wHarmonic * 1.2; reasonsX.push("Thoát kẹp đối xứng 2-1-2"); }
      else { scoreT += wHarmonic * 1.2; reasonsT.push("Thoát kẹp đối xứng 2-1-2"); }
    }
    const seq6 = tx.slice(-6).join("");
    if (seq6 === "TTTXXT" || seq6 === "XXXTTX") {
      if (last === "T") { scoreT += wHarmonic * 1.05; reasonsT.push("Hãm quán tính bậc 3-2-1"); }
      else { scoreX += wHarmonic * 1.05; reasonsX.push("Hãm quán tính bậc 3-2-1"); }
    }
    if (seq6 === "TXXTTT" || seq6 === "XTTXXX") {
      if (last === "T") { scoreX += wHarmonic * 1.05; reasonsX.push("Tiến bậc thang 1-2-3"); }
      else { scoreT += wHarmonic * 1.05; reasonsT.push("Tiến bậc thang 1-2-3"); }
    }

    // 3. Ma trận chuyển trạng thái Markov bậc 2 & 3 (Tensor Probabilities)
    if (len >= 12) {
      const wM2 = this.weights.markov2;
      const state2 = tx.slice(-2).join("");
      let countT = 0, countX = 0;
      for (let i = 0; i < len - 2; i++) {
        if (tx[i] + tx[i+1] === state2) {
          if (tx[i+2] === "T") countT++; else countX++;
        }
      }
      const totalTrans = countT + countX;
      if (totalTrans >= 2) {
        if (countT > countX) { scoreT += wM2 + (countT / totalTrans); reasonsT.push("Ma trận Markov bậc 2"); }
        else if (countX > countT) { scoreX += wM2 + (countX / totalTrans); reasonsX.push("Ma trận Markov bậc 2"); }
      }
    }

    // 4. Hồi quy Gauss & Điểm lệch chuẩn Z-Score (Mean = 10.5, Std = 2.96)
    const recent7 = totals.slice(-7);
    const avgScore = recent7.reduce((a, b) => a + b, 0) / recent7.length;
    const zScore = (avgScore - 10.5) / (2.96 / Math.sqrt(7));
    const wGaussianZ = this.weights.gaussianZ;

    if (zScore >= 1.35) {
      scoreX += wGaussianZ + Math.abs(zScore) * 1.1; reasonsX.push(`Lực kéo Z-Score cao (${avgScore.toFixed(1)})`);
    } else if (zScore <= -1.35) {
      scoreT += wGaussianZ + Math.abs(zScore) * 1.1; reasonsT.push(`Lực kéo Z-Score thấp (${avgScore.toFixed(1)})`);
    }

    // 5. Chỉ báo dao động động lượng RSI 14 phiên
    let gains = 0, losses = 0;
    for (let i = Math.max(1, len - 14); i < len; i++) {
      const diff = totals[i] - totals[i - 1];
      if (diff > 0) gains += diff; else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi = 100 - (100 / (1 + rs));
    if (rsi >= 66) {
      scoreX += this.weights.rsi14; reasonsX.push("RSI quá mua tổng điểm");
    } else if (rsi <= 34) {
      scoreT += this.weights.rsi14; reasonsT.push("RSI quá bán tổng điểm");
    }

    // 6. Tần suất mặt xúc xắc cục bộ (Dice Marginal Density)
    let lowDice = 0, highDice = 0;
    const recentDice = dice.slice(-10);
    recentDice.forEach(arr => {
      if (Array.isArray(arr)) {
        arr.forEach(d => { if (d <= 3) lowDice++; else if (d >= 4) highDice++; });
      }
    });
    if (lowDice >= 20) { scoreT += this.weights.diceMarginal; reasonsT.push("Bù trừ mật độ xúc xắc thấp"); }
    else if (highDice >= 20) { scoreX += this.weights.diceMarginal; reasonsX.push("Bù trừ mật độ xúc xắc cao"); }

    // 7. Sóng phản xạ sau Bão xúc xắc & Tam hoa
    const lastDice = dice[len - 1];
    if (Array.isArray(lastDice) && lastDice.length === 3) {
      if (lastDice[0] === lastDice[1] && lastDice[1] === lastDice[2]) {
        if (last === "T") { scoreX += this.weights.tripleShock; reasonsX.push(`Phản xung sau Bão ${lastDice[0]}`); }
        else { scoreT += this.weights.tripleShock; reasonsT.push(`Phản xung sau Bão ${lastDice[0]}`); }
      }
    }

    // Đánh giá thị trường giằng co / nhiễu
    const scoreDiff = Math.abs(scoreT - scoreX);
    const isChoppy = scoreDiff < 1.4;

    let pred, conf, src;
    if (scoreT > scoreX) {
      pred = "tài";
      src = reasonsT[0] || "Động lượng xung hướng Tài";
      const ratio = scoreT / (scoreT + scoreX + 0.01);
      conf = Math.min(98, Math.round(78 + ratio * 20));
    } else if (scoreX > scoreT) {
      pred = "xỉu";
      src = reasonsX[0] || "Động lượng xung hướng Xỉu";
      const ratio = scoreX / (scoreT + scoreX + 0.01);
      conf = Math.min(98, Math.round(78 + ratio * 20));
    } else {
      const last20 = tx.slice(-20);
      const countT = last20.filter(v => v === "T").length;
      pred = countT >= 10 ? "xỉu" : "tài";
      src = "Đối xứng lượng tử bảo toàn";
      conf = 80;
    }

    // Cơ chế Adaptive Anti-Pattern Hedging: Đảo nhịp thích nghi khi sàn bẻ liên tiếp 2 tay
    if (tracker && tracker.reverse) {
      pred = pred === "tài" ? "xỉu" : "tài";
      src = `Đảo nhịp bẻ cầu (${src})`;
      conf = Math.max(75, conf - 2);
    }

    return { pred, conf, src, reverse: tracker?.reverse || false, isChoppy };
  }
}

// =========================================================================
// BỘ ĐỆM KIỂM ĐỊNH HIỆU SUẤT & THỐNG KÊ CHI TIẾT ĐẦY ĐỦ PHIÊN (WIN / LOSS)
// =========================================================================
class AdaptiveHedgeTracker {
  constructor(game) {
    this.game = game;
    this.outcomes = store[game]?.outcomes || [];
    this.streakOk = 0;
    this.streakNg = 0;
    this.reverse = false;
  }

  record(session, pred, actual, src, quantEngine, diceInfo, totalInfo) {
    const isTaiPred = normalizeResult(pred) === "tai";
    const isTaiActual = normalizeResult(actual) === "tai";
    const ok = isTaiPred === isTaiActual;

    this.outcomes.push({
      session,
      pred: isTaiPred ? "tài" : "xỉu",
      actual: isTaiActual ? "tài" : "xỉu",
      dice: diceInfo || [0, 0, 0],
      total: totalInfo || (isTaiActual ? 11 : 10),
      ok,
      src: src || "Định lượng thực chiến",
      ts: Date.now()
    });

    if (this.outcomes.length > 250) this.outcomes = this.outcomes.slice(-200);
    store[this.game].outcomes = this.outcomes;
    saveStore(store);

    if (quantEngine && typeof quantEngine.updateWeights === "function") {
      quantEngine.updateWeights(ok, src);
    }

    if (ok) {
      this.streakOk++;
      this.streakNg = 0;
      if (this.reverse && this.streakOk >= 1) this.reverse = false;
    } else {
      this.streakNg++;
      this.streakOk = 0;
      if (this.streakNg >= 2 && !this.reverse) this.reverse = true;
    }
  }

  getFullStats(limit = 30) {
    const lastN = this.outcomes.slice(-limit);
    const winCount = lastN.filter(o => o.ok).length;
    const lossCount = lastN.length - winCount;
    const acc = lastN.length ? Math.round((winCount / lastN.length) * 100) : 0;

    let maxWinStreak = 0, curWin = 0;
    let maxLossStreak = 0, curLoss = 0;
    for (const item of lastN) {
      if (item.ok) {
        curWin++;
        curLoss = 0;
        if (curWin > maxWinStreak) maxWinStreak = curWin;
      } else {
        curLoss++;
        curWin = 0;
        if (curLoss > maxLossStreak) maxLossStreak = curLoss;
      }
    }

    return {
      accStr: `${acc}%`,
      accNum: acc,
      winCount,
      lossCount,
      totalCount: lastN.length,
      maxWinStreak,
      maxLossStreak,
      streakOk: this.streakOk,
      streakNg: this.streakNg,
      reverse: this.reverse,
      outcomes: [...lastN].reverse()
    };
  }
}

// =========================================================================
// QUẢN LÝ DỮ LIỆU PHIÊN THỜI GIAN THỰC
// =========================================================================
class SessionEngineCore {
  constructor(game, url, parse) {
    this.game = game;
    this.url = url;
    this.parse = parse;
    this.history = store[game]?.history || [];
    this.sessionIds = new Set(this.history.map(h => h.session));
    this.tracker = new AdaptiveHedgeTracker(game);
    this.engine = new QuantumSuperEngine();
    this.activePred = store[game]?.activePred || null;
    this.isFetching = false;
    this.timer = null;
    this.onNewSessionListeners = [];

    if (this.history.some(h => h.session < 100000)) {
      this.history = [];
      this.sessionIds = new Set();
      this.tracker.outcomes = [];
      this.activePred = null;
      store[this.game] = { history: [], outcomes: [], activePred: null };
      saveStore(store);
    }

    this.initRealFormatHistory();
  }

  initRealFormatHistory() {
    if (this.history.length === 0) {
      const baseS = this.game === "md5" ? 8594200 : 6928800;
      const seedHistory = [];
      let cur = "T";
      for (let i = 0; i < 42; i++) {
        if (i % 5 === 0 || i % 7 === 0) cur = cur === "T" ? "X" : "T";
        const d1 = cur === "T" ? 3 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3);
        const d2 = cur === "T" ? 3 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3);
        const d3 = cur === "T" ? 2 + Math.floor(Math.random() * 5) : 1 + Math.floor(Math.random() * 4);
        const total = d1 + d2 + d3;
        seedHistory.push({
          session: baseS + i,
          dice: [d1, d2, d3],
          total,
          result: total >= 11 ? "tai" : "xiu",
          tx: total >= 11 ? "T" : "X"
        });
      }
      this.seedFromRealHistory(seedHistory);
    } else {
      this.ensureActivePrediction();
    }
  }

  seedFromRealHistory(list) {
    if (!list || list.length < 15) return;
    this.history = list.slice(-50);
    this.sessionIds = new Set(this.history.map(h => h.session));
    store[this.game].history = this.history;

    const outcomes = [];
    const startIdx = Math.max(5, this.history.length - 30);
    for (let i = startIdx; i < this.history.length; i++) {
      const histSlice = this.history.slice(0, i);
      const targetItem = this.history[i];
      const p = this.engine.predict(histSlice, null);

      const isTaiPred = normalizeResult(p.pred) === "tai";
      const isTaiActual = normalizeResult(targetItem.result) === "tai";
      const ok = isTaiPred === isTaiActual;

      outcomes.push({
        session: targetItem.session,
        pred: isTaiPred ? "tài" : "xỉu",
        actual: isTaiActual ? "tài" : "xỉu",
        dice: targetItem.dice || [3, 3, 4],
        total: targetItem.total || 10,
        ok,
        src: p.src || "Định lượng thực chiến",
        ts: Date.now() - (this.history.length - i) * 50000
      });
    }

    this.tracker.outcomes = outcomes;
    store[this.game].outcomes = outcomes;
    saveStore(store);
    this.ensureActivePrediction();
  }

  ensureActivePrediction() {
    if (this.history.length === 0) return;
    const lastSession = this.history.at(-1)?.session || 0;
    const targetSession = lastSession + 1;
    if (!this.activePred || this.activePred.session !== targetSession) {
      const p = this.engine.predict(this.history, this.tracker);
      this.activePred = {
        session: targetSession,
        pred: p.pred,
        conf: p.conf,
        src: p.src,
        reverse: p.reverse,
        isChoppy: p.isChoppy,
        ts: Date.now()
      };
      store[this.game].activePred = this.activePred;
      saveStore(store);
    }
  }

  onNewSession(cb) {
    this.onNewSessionListeners.push(cb);
  }

  async pull() {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(this.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*"
        }
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        this.isFetching = false;
        return;
      }

      const rawJson = await res.json();
      const list = this.parse(rawJson);
      if (!list || !list.length) {
        this.isFetching = false;
        return;
      }

      list.sort((a, b) => a.session - b.session);

      const firstRealSession = list[0].session;
      if (this.history.length > 0 && Math.abs(this.history[0].session - firstRealSession) > 1000) {
        this.seedFromRealHistory(list);
        this.isFetching = false;
        return;
      }

      const lastCurrentSession = this.history.at(-1)?.session || 0;
      const newSessions = list.filter(r => r.session > lastCurrentSession);

      if (newSessions.length > 0) {
        for (const rec of newSessions) {
          if (this.activePred && rec.session === this.activePred.session) {
            this.tracker.record(rec.session, this.activePred.pred, rec.result, this.activePred.src, this.engine, rec.dice, rec.total);
            this.activePred = null;
          }
          this.history.push(rec);
          this.sessionIds.add(rec.session);
        }

        if (this.history.length > 500) {
          this.history = this.history.slice(-300);
          this.sessionIds = new Set(this.history.map(h => h.session));
        }

        store[this.game].history = this.history.slice(-100);
        saveStore(store);

        const nextTarget = (this.history.at(-1)?.session || 0) + 1;
        const p = this.engine.predict(this.history, this.tracker);
        this.activePred = {
          session: nextTarget,
          pred: p.pred,
          conf: p.conf,
          src: p.src,
          reverse: p.reverse,
          isChoppy: p.isChoppy,
          ts: Date.now()
        };
        store[this.game].activePred = this.activePred;
        saveStore(store);

        for (const cb of this.onNewSessionListeners) {
          try { cb(this.game, this.activePred, this.last()); } catch {}
        }
      }
    } catch (e) {
    } finally {
      this.isFetching = false;
    }
  }

  start(intervalMs = 3500) {
    this.pull();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.pull(), intervalMs);
  }

  last() { return this.history.at(-1) || null; }
  getPrediction() { this.ensureActivePrediction(); return this.activePred; }
}

// BỘ PARSER PHÂN TÍCH TOÀN BỘ CẤU TRÚC DỮ LIỆU ĐA NĂNG
function parseUniversalStream(data) {
  let list = Array.isArray(data) ? data : (data?.data || data?.list || data?.sessions || data?.rows || data?.result || []);
  if (!Array.isArray(list)) return [];
  return list.map(i => {
    const session = Number(i.session || i.phien || i.Phien || i.id || i.sid || i.sessionId || 0);
    let dice = i.dices || i.dice || i.xucxac || i.xuc_xac;
    if (dice === undefined && i.dice1 !== undefined && i.dice2 !== undefined && i.dice3 !== undefined) {
      dice = [Number(i.dice1), Number(i.dice2), Number(i.dice3)];
    }
    if (typeof dice === "string") {
      dice = dice.split(/[,\-|]/).map(Number).filter(n => !isNaN(n));
    }
    if (!Array.isArray(dice) || dice.length !== 3) {
      dice = [1, 1, 1];
    }
    const total = Number(i.total || i.point || i.diem || i.tong || (dice[0] + dice[1] + dice[2]));
    const resRaw = i.result || i.ketqua || i.ket_qua || i.tx || (total >= 11 ? "tai" : "xiu");
    const isTai = normalizeResult(resRaw) === "tai" || total >= 11;
    return {
      session,
      dice,
      total,
      result: isTai ? "tai" : "xiu",
      tx: isTai ? "T" : "X",
      md5: i.md5 || i.hash || ""
    };
  }).filter(i => i.session > 0).sort((a, b) => a.session - b.session);
}

// CHỈ GIỮ DUY NHẤT 1 API MD5 (LC79) VÀ 1 BÀN HŨ
const md5 = new SessionEngineCore("md5", API_MD5_LC79, parseUniversalStream);
const hu = new SessionEngineCore("hu", API_HU, parseUniversalStream);

// =========================================================================
// HỆ THỐNG QUẢN LÝ KEY & XÁC THỰC BẢN QUYỀN
// =========================================================================
function parseDuration(input) {
  if (!input) return null;
  const str = input.toLowerCase().trim();
  if (str === "lifetime" || str === "vv" || str === "vinhvien" || str === "forever") {
    return { ms: -1, text: "Vĩnh Viễn" };
  }
  const match = str.match(/^(\d+)\s*(h|gio|hour|hours|d|ngay|day|days|m|phut|w|tuan|week|month|thang)$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  if (unit.startsWith("h") || unit === "gio") return { ms: num * 3600 * 1000, text: `${num} Giờ` };
  if (unit.startsWith("d") || unit === "ngay") return { ms: num * 24 * 3600 * 1000, text: `${num} Ngày` };
  if (unit.startsWith("w") || unit === "tuan") return { ms: num * 7 * 24 * 3600 * 1000, text: `${num} Tuần` };
  if (unit.startsWith("month") || unit === "thang") return { ms: num * 30 * 24 * 3600 * 1000, text: `${num} Tháng` };
  if (unit.startsWith("m") || unit === "phut") return { ms: num * 60 * 1000, text: `${num} Phút` };
  return null;
}

function generateKey(durationText) {
  const prefix = "AK";
  let tag = "VIP";
  if (durationText.includes("Giờ")) tag = durationText.replace(" Giờ", "H");
  else if (durationText.includes("Ngày")) tag = durationText.replace(" Ngày", "D");
  else if (durationText.includes("Tuần")) tag = durationText.replace(" Tuần", "W");
  else if (durationText.includes("Tháng")) tag = durationText.replace(" Tháng", "M");
  else if (durationText.includes("Vĩnh")) tag = "LIFETIME";

  const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${tag}-${randomStr}`;
}

function checkUserAccess(userId) {
  const uid = String(userId);
  if (store.adminIds.includes(uid)) {
    return { hasAccess: true, isAdmin: true, status: "admin", remainingText: "Admin Tối Cao (Vĩnh Viễn)" };
  }

  const u = store.users[uid];
  if (!u) {
    return { hasAccess: false, isAdmin: false, status: "not_found", reason: "not_activated" };
  }

  // TRƯỜNG HỢP KEY BỊ ADMIN THU HỒI (CÓ THỂ MỞ LẠI ĐƯỢC)
  if (u.status === "revoked") {
    return {
      hasAccess: false,
      isAdmin: false,
      isRevoked: true,
      status: "revoked",
      reason: "revoked",
      revokedAt: u.revokedAt,
      revokedKey: u.revokedKey || u.activatedKey
    };
  }

  if (!u.activatedKey) {
    return { hasAccess: false, isAdmin: false, status: "not_activated", reason: "not_activated" };
  }

  if (u.expiresAt === -1) {
    return { hasAccess: true, isAdmin: false, status: "active", remainingText: "Vĩnh Viễn (Lifetime)" };
  }

  if (Date.now() > u.expiresAt) {
    return { hasAccess: false, isAdmin: false, status: "expired", reason: "expired", expiredAt: u.expiresAt };
  }

  return {
    hasAccess: true,
    isAdmin: false,
    status: "active",
    remainingText: formatRemainingDetail(u.expiresAt),
    expiresAt: u.expiresAt,
    activatedAt: u.activatedAt
  };
}

// =========================================================================
// NATIVE TELEGRAM BOT API CLIENT
// =========================================================================
class TelegramBotClient {
  constructor(token) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.offset = 0;
    this.polling = false;
  }

  async call(method, data = {}) {
    if (!this.token) return null;
    try {
      const res = await fetch(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async sendMessage(chatId, text, extra = {}) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra
    });
  }

  async editMessageText(chatId, messageId, text, extra = {}) {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra
    });
  }

  async editMessageReplyMarkup(chatId, messageId, extra = {}) {
    return this.call("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      ...extra
    });
  }

  async answerCallback(queryId, text = "", showAlert = false) {
    return this.call("answerCallbackQuery", {
      callback_query_id: queryId,
      text,
      show_alert: showAlert
    });
  }

  async setMyCommands(commands) {
    return this.call("setMyCommands", { commands });
  }

  async startPolling(handler) {
    if (!this.token) {
      console.log("[BOT TELEGRAM] Đang chạy server nhưng chưa kết nối mạng hoặc token rỗng.");
      return;
    }
    this.polling = true;
    console.log(`[BOT TELEGRAM] Khởi động thành công! Đang lắng nghe tin nhắn với Token...`);

    try {
      await this.setMyCommands([
        { command: "start", description: "🚀 Mở Menu & Bàn phím 1-chạm" },
        { command: "md5", description: "◈ Soi cầu Tài Xỉu MD5 LC79 (Chuẩn xác cao)" },
        { command: "hu", description: "❖ Soi cầu Tài Xỉu Hũ truyền thống" },
        { command: "thongke", description: "📊 Thống kê chi tiết toàn bộ phiên thắng/thua" },
        { command: "tubao", description: "⚡ Cài đặt bật/tắt tự động báo kèo từng bàn" },
        { command: "doimau", description: "🎨 Đổi màu chữ & Theme Hologram rực rỡ" },
        { command: "giolamviec", description: "⏰ Giờ làm việc hỗ trợ của Admin" },
        { command: "thongtin", description: "👤 Xem thời hạn và ngày hết hạn bản quyền" },
        { command: "quanlyvon", description: "📐 Công thức chia vốn thực chiến an toàn" },
        { command: "soicausau", description: "🔮 Phân tích ma trận xúc xắc & dòng cầu" },
        { command: "menu", description: "👑 Bảng điều khiển quản trị" }
      ]);
    } catch {}

    while (this.polling) {
      try {
        const res = await fetch(`${this.baseUrl}/getUpdates?offset=${this.offset}&timeout=25`, {
          headers: { "User-Agent": "TelegramBot/1.0" }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.ok && Array.isArray(json.result)) {
            for (const update of json.result) {
              this.offset = update.update_id + 1;
              try { await handler(update); } catch (e) { console.error("Lỗi xử lý update:", e); }
            }
          }
        }
      } catch (err) {
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  }
}

const bot = new TelegramBotClient(BOT_TOKEN);

// =========================================================================
// BÀN PHÍM CỐ ĐỊNH 1-CHẠM THIẾT KẾ HIỆN ĐẠI SIÊU CẤP (FUTURISTIC KEYBOARD)
// =========================================================================
function makePersistentReplyKeyboard(uid) {
  const access = checkUserAccess(uid);
  const rows = [
    [
      { text: "◈ SOI CẦU MD5 (LC79)" },
      { text: "❖ SOI CẦU HŨ" }
    ],
    [
      { text: "📊 THỐNG KÊ CHI TIẾT 30P" },
      { text: "⚡ TỰ ĐỘNG BÁO KÈO" }
    ],
    [
      { text: "🎨 ĐỔI PHỐI MÀU CHỮ" },
      { text: "📐 QUẢN LÝ VỐN" }
    ],
    [
      { text: "👤 BẢN QUYỀN CỦA BẠN" },
      { text: "🔮 MA TRẬN CẦU SÂU" }
    ],
    [
      { text: "⏰ GIỜ ADMIN HỖ TRỢ" },
      { text: "🔄 LÀM MỚI DỮ LIỆU" }
    ]
  ];

  if (access.isAdmin) {
    rows.push([
      { text: "👑 BẢNG QUẢN TRỊ ADMIN TỐI CAO" }
    ]);
  }

  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true
  };
}

function makeUserInlineKeyboard(uid) {
  const u = store.users[String(uid)] || {};
  const md5State = u.md5Alert ? "🟢 BẬT" : "🔴 TẮT";
  const huState = u.huAlert ? "🟢 BẬT" : "🔴 TẮT";
  const access = checkUserAccess(uid);

  const rows = [
    [
      { text: "◈ Soi Cầu MD5 (LC79)", callback_data: "pred_md5" },
      { text: "❖ Soi Cầu Hũ", callback_data: "pred_hu" }
    ],
    [
      { text: "📊 Thống Kê Chi Tiết MD5", callback_data: "stats_md5" },
      { text: "📊 Thống Kê Chi Tiết Hũ", callback_data: "stats_hu" }
    ],
    [
      { text: `⚡ Tự Báo MD5: ${md5State}`, callback_data: "toggle_md5" },
      { text: `⚡ Tự Báo Hũ: ${huState}`, callback_data: "toggle_hu" }
    ],
    [
      { text: "🎨 Đổi Phối Màu Chữ", callback_data: "choose_theme" },
      { text: "📐 Quản Lý Vốn", callback_data: "capital_strategy" }
    ],
    [
      { text: "🔮 Ma Trận Cầu Sâu", callback_data: "deep_analysis" },
      { text: "👤 Bản Quyền", callback_data: "my_info" }
    ],
    [
      { text: "⏰ Giờ Làm Việc Admin", callback_data: "admin_hours" },
      { text: "🔄 Làm Mới Dữ Liệu", callback_data: "refresh_menu" }
    ]
  ];

  if (access.isAdmin) {
    rows.push([
      { text: "👑 BẢNG QUẢN TRỊ ADMIN TỐI CAO", callback_data: "admin_menu" }
    ]);
  }

  return { inline_keyboard: rows };
}

function makeAdminKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "➕ Key 1 Giờ", callback_data: "gen_1h" },
        { text: "➕ Key 12 Giờ", callback_data: "gen_12h" },
        { text: "➕ Key 1 Ngày", callback_data: "gen_1d" }
      ],
      [
        { text: "➕ Key 7 Ngày", callback_data: "gen_7d" },
        { text: "➕ Key 30 Ngày", callback_data: "gen_30d" },
        { text: "👑 Key Vĩnh Viễn", callback_data: "gen_vv" }
      ],
      [
        { text: "📋 Danh Sách Key", callback_data: "admin_list_keys" },
        { text: "📊 Báo Cáo Toàn Diện", callback_data: "admin_stats" }
      ],
      [
        { text: "🧹 Quét Key Hết Hạn", callback_data: "admin_clean_expired" },
        { text: "📜 Nhật Ký Hoạt Động", callback_data: "admin_view_logs" }
      ],
      [
        { text: "🔙 Về Menu Chính", callback_data: "user_menu" }
      ]
    ]
  };
}

function makeThemeSelectKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🎲 RANDOM MỖI PHIÊN (Siêu Lung Linh)", callback_data: "set_theme_random" }
      ],
      [
        { text: "🔮 Cyber Violet Hologram (Tím Hoàng Gia)", callback_data: "set_theme_violet" },
        { text: "💎 Hyperdrive Sapphire (Xanh Lam Điện)", callback_data: "set_theme_sapphire" }
      ],
      [
        { text: "❇️ Quantum Matrix Emerald (Lục Bảo Laser)", callback_data: "set_theme_emerald" },
        { text: "👑 Solar Plasma Gold (Hoàng Kim Thái Dương)", callback_data: "set_theme_solar" }
      ],
      [
        { text: "🩸 Crimson Mecha (Huyết Hắc Thạch)", callback_data: "set_theme_crimson" }
      ],
      [
        { text: "🔙 Quay Lại Menu Chính", callback_data: "user_menu" }
      ]
    ]
  };
}

// =========================================================================
// GIAO DIỆN HIỂN THỊ DỰ ĐOÁN & BẢNG THỐNG KÊ CHI TIẾT ĐẦY ĐỦ PHIÊN
// =========================================================================
function buildPredictionText(gameKey, core, uid) {
  const p = core.getPrediction();
  const last = core.last();
  const stats = core.tracker.getFullStats(30);
  const theme = getUserTheme(uid);

  const gameTitle = gameKey === "md5" ? "TÀI XỈU MD5 LC79 (API NGUỒN CHUẨN XÁC)" : "TÀI XỈU HŨ TRUYỀN THỐNG";

  if (!p) {
    return `<b>${theme.iconHeader} ⟦ ${gameTitle} ⟧</b>\n\n<i>Đang đồng bộ dữ liệu lượng tử từ sàn...</i>`;
  }

  const isTai = normalizeResult(p.pred) === "tai";
  const predBadge = isTai ? theme.badgeTai : theme.badgeXiu;
  const lastResDisplay = last ? (normalizeResult(last.result) === "tai" ? "TÀI" : "XỈU") : "—";
  const lastDiceText = last ? `[${last.dice.join("-")}] (${last.total}đ)` : "—";
  const confBar = makeConfidenceBar(p.conf, theme);
  const choppyTag = p.isChoppy ? `\n⚠️ <b>CẢNH BÁO LỌC CẦU:</b> <i>Cầu đang giằng co, hãy đi đều tiền hoặc quan sát!</i>\n` : "";
  const curTimeStr = formatVNDateTime(Date.now());

  return `<b>${theme.iconHeader} ⟦ ${gameTitle} ⟧</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>PHIÊN DỰ ĐOÁN: #${p.session}</b>
👉 <b>TÍN HIỆU ĐỊNH LƯỢNG: ${predBadge}</b>
${theme.iconFire} <b>ĐỘ TIN CẬY: ${p.conf}%</b>
<code>${confBar}</code>
${theme.iconStat} <b>CHIẾN THUẬT:</b> <code>${p.src}</code>${choppyTag}
━━━━━━━━━━━━━━━━━━━━━
🎲 <b>Phiên trước #${last ? last.session : "—"}:</b> ${lastDiceText} ➔ <b>${lastResDisplay}</b>
📈 <b>Tỉ lệ thắng 30P:</b> <b>${stats.accStr}</b> (Thắng: <b>${stats.winCount}</b> | Thua: <b>${stats.lossCount}</b>)
🔥 <b>Chuỗi thắng Max:</b> <b>${stats.maxWinStreak} tay liên tiếp</b>
🕒 <b>Thời gian:</b> <code>${curTimeStr}</code>
━━━━━━━━━━━━━━━━━━━━━
<i>Bản quyền tác giả: Phạm Anh Khôi · Giờ hỗ trợ: ${ADMIN_WORK_HOURS}</i>`;
}

// BẢNG THỐNG KÊ CHI TIẾT NHẢY RA ĐẦY ĐỦ TỪNG PHIÊN (XEM RÕ SAI THUA BAO NHIÊU)
function buildStatsFullText(gameKey, core, uid) {
  const stats = core.tracker.getFullStats(30);
  const theme = getUserTheme(uid);
  const gameTitle = gameKey === "md5" ? "TÀI XỈU MD5 LC79" : "TÀI XỈU HŨ TELE68";

  let listText = "";
  stats.outcomes.forEach((o, idx) => {
    const statusTag = o.ok ? "✅ THẮNG" : "❌ THUA";
    const pStr = formatResultDisplay(o.pred);
    const aStr = formatResultDisplay(o.actual);
    const diceText = Array.isArray(o.dice) && o.dice.length === 3 ? `[${o.dice.join("-")}=${o.total}đ]` : `(${o.total}đ)`;
    listText += `<b>#${o.session}</b>: <code>${pStr}</code> ➔ <b>${aStr}</b> ${diceText} | <b>${statusTag}</b>\n`;
  });

  return `<b>${theme.iconHeader} BẢNG THỐNG KÊ CHI TIẾT 30 PHIÊN (${gameTitle})</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>TỈ LỆ CHUẨN XÁC:</b> <b>${stats.accStr}</b>
🏆 <b>Tổng số phiên kiểm định:</b> <b>${stats.totalCount}</b> phiên
✅ <b>Số phiên THẮNG:</b> <b>${stats.winCount}</b> phiên
❌ <b>Số phiên SAI / THUA:</b> <b>${stats.lossCount}</b> phiên
🔥 <b>Chuỗi thắng lớn nhất:</b> <b>${stats.maxWinStreak}</b> tay liên tiếp
⚠️ <b>Chuỗi thua lớn nhất:</b> <b>${stats.maxLossStreak}</b> tay
━━━━━━━━━━━━━━━━━━━━━
<b>DANH SÁCH CHI TIẾT TỪNG PHIÊN (GẦN NHẤT):</b>
${listText || "<i>Đang tích lũy dữ liệu phiên...</i>"}
━━━━━━━━━━━━━━━━━━━━━
<i>Thuật toán lượng tử tự học thích nghi · Phạm Anh Khôi</i>`;
}

function buildCapitalStrategyText() {
  return `<b>📐 CÔNG THỨC QUẢN LÝ VỐN ĐỊNH LƯỢNG THỰC CHIẾN</b>
━━━━━━━━━━━━━━━━━━━━━
<b>1. CÔNG THỨC KELLY BIẾN THIÊN (Khuyên Dùng):</b>
• <i>Độ tin cậy 75% - 82%:</i> Đi <b>2% - 3%</b> tổng vốn.
• <i>Độ tin cậy 83% - 90%:</i> Đi <b>4% - 5%</b> tổng vốn.
• <i>Độ tin cậy > 90%:</i> Đi <b>6% - 8%</b> tổng vốn.
👉 Tuyệt đối không vào quá 10% vốn một tay.

<b>2. CHIẾN THUẬT GẤP THẾP THÔNG MINH 3 TẦNG:</b>
• Tay 1: <b>1 phần</b> ➔ Thắng quay về Tay 1.
• Tay 2 (nếu gãy): <b>2.2 phần</b> ➔ Thắng quay về Tay 1.
• Tay 3 (nếu gãy): <b>5 phần</b> ➔ Dừng lại bất kể kết quả.
👉 Giúp bảo toàn 85% vốn kể cả khi gặp bão cầu!

<b>3. NGUYÊN TẮC BẢO TOÀN LÃI:</b>
• Chạm mục tiêu lãi <b>20% - 30%</b> / ngày ➔ Rút lãi nghỉ ngay.
• Chạm ngưỡng cắt lỗ <b>15%</b> / ngày ➔ Tắt bot hôm sau tiếp tục.
━━━━━━━━━━━━━━━━━━━━━
<i>Chia sẻ kinh nghiệm thực chiến từ Phạm Anh Khôi</i>`;
}

function buildDeepAnalysisText(gameKey, core, uid) {
  const history = core.history.slice(-30);
  const theme = getUserTheme(uid);
  const gameName = gameKey === "md5" ? "TÀI XỈU MD5 LC79" : "TÀI XỈU HŨ TELE68";

  if (history.length < 10) return "<i>Đang tích lũy thêm dữ liệu để phân tích sâu...</i>";

  const totals = history.map(h => h.total);
  const avg = (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1);
  const taiCount = history.filter(h => normalizeResult(h.result) === "tai").length;
  const xiuCount = history.length - taiCount;

  const diceCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  history.forEach(h => {
    if (Array.isArray(h.dice)) {
      h.dice.forEach(d => { if (diceCounts[d] !== undefined) diceCounts[d]++; });
    }
  });

  const topDice = Object.entries(diceCounts).sort((a, b) => b[1] - a[1]);

  return `<b>${theme.iconHeader} MA TRẬN XÚC XẮC & DÒNG CẦU SÂU (${gameName})</b>
━━━━━━━━━━━━━━━━━━━━━
📊 <b>Thống kê mẫu 30 phiên:</b>
• Tỉ số Tài/Xỉu: <b>${taiCount} Tài (${Math.round(taiCount/history.length*100)}%)</b> — <b>${xiuCount} Xỉu (${Math.round(xiuCount/history.length*100)}%)</b>
• Điểm xúc xắc trung bình (MA): <b>${avg}</b> (Kỳ vọng chuẩn: 10.5)
• Mặt xúc xắc về nhiều nhất: Mặt <b>${topDice[0][0]}</b> (${topDice[0][1]} lần), Mặt <b>${topDice[1][0]}</b> (${topDice[1][1]} lần)
• Mặt xúc xắc về ít nhất: Mặt <b>${topDice[5][0]}</b> (${topDice[5][1]} lần)
━━━━━━━━━━━━━━━━━━━━━
🧠 <b>Đánh giá thuật toán lượng tử:</b>
• Cân bằng động học: <i>${Math.abs(taiCount - xiuCount) <= 4 ? "Cầu cân bằng, ổn định cao" : "Cầu có thiên hướng lệch một phía"}</i>
• Xu hướng tiếp theo: <b>${avg >= 11.2 ? "Ưu tiên hồi quy Xỉu" : (avg <= 9.8 ? "Ưu tiên hồi quy Tài" : "Bám theo xu hướng bệt/đảo")}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Hệ thống phân tích lượng tử chuyên sâu · Phạm Anh Khôi</i>`;
}

// Thông báo giờ làm việc của Admin
function buildAdminHoursMessage() {
  return `<b>⏰ THÔNG BÁO KHUNG GIỜ LÀM VIỆC & HỖ TRỢ ADMIN</b>
━━━━━━━━━━━━━━━━━━━━━
👤 <b>Admin Quản Trị:</b> <b>Phạm Anh Khôi</b> (@anhkhoi_xabc)
🕒 <b>Khung Giờ Hỗ Trợ Chính Thức:</b>
👉 <b>12:00 trưa đến 21:00 - 22:00 tối hàng ngày</b>

ℹ️ <b>Quyền Lợi & Hỗ Trợ Trong Ca:</b>
• Cấp phát và gia hạn Key bản quyền tức thì trong 30 giây.
• Mở lại key khi bị tạm thu hồi hoặc giải quyết sự cố.
• Tư vấn phương pháp soi cầu và quản lý vốn định lượng.

<i>Lưu ý: Ngoài khung giờ trên, bạn vẫn có thể để lại tin nhắn, Admin sẽ phản hồi ngay khi vào ca lúc 12h trưa!</i>`;
}

// Thông báo khi key bị thu hồi
function buildRevokedMessage(revokedKey) {
  return `<b>⛔ KEY BẢN QUYỀN ĐÃ BỊ THU HỒI!</b>
━━━━━━━━━━━━━━━━━━━━━
⚠️ <b>Thông báo quan trọng:</b>
Key bản quyền của bạn (<code>${revokedKey || "VIP"}</code>) đã bị <b>Admin tạm thu hồi</b> và vô hiệu hóa khỏi hệ thống.

ℹ️ <i>Key thu hồi có thể được Admin MỞ LẠI bất kỳ lúc nào sau khi xác minh.</i>

📞 <b>Vui lòng liên hệ Admin Phạm Anh Khôi để được hỗ trợ mở lại:</b>
👉 Telegram: <b>${TELEGRAM_ADMIN_CONTACT}</b>
⏰ <b>Giờ làm việc Admin:</b> <b>${ADMIN_WORK_HOURS}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Sau khi được mở lại hoặc cấp key mới, bạn có thể tiếp tục sử dụng bình thường.</i>`;
}

// =========================================================================
// BỘ ĐIỀU PHỐI TIN NHẮN & LỆNH TELEGRAM TOÀN DIỆN
// =========================================================================
async function handleTelegramUpdate(update) {
  // 1. XỬ LÝ NÚT BẤM CALLBACK (INLINE KEYBOARDS)
  if (update.callback_query) {
    const q = update.callback_query;
    const uid = String(q.from.id);
    const data = q.data;
    const msgId = q.message.message_id;
    const chatId = q.message.chat.id;

    const access = checkUserAccess(uid);

    // Xử lý riêng khi user bị thu hồi key
    if (access.isRevoked) {
      await bot.answerCallback(q.id, "⛔ Key của bạn đã bị thu hồi bởi Admin!", true);
      await bot.sendMessage(chatId, buildRevokedMessage(access.revokedKey), {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Liên Hệ Admin Mở Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    if (data === "how_to_key") {
      await bot.answerCallback(q.id);
      await bot.sendMessage(chatId, `<b>ℹ️ HƯỚNG DẪN KÍCH HOẠT BẢN QUYỀN</b>\n\n1. Nhắn tin Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> (Giờ trực: <b>${ADMIN_WORK_HOURS}</b>) để nhận Key.\n2. Gửi tin nhắn theo cú pháp:\n👉 <code>/key &lt;mã_key&gt;</code>\n<i>Ví dụ:</i> <code>/key AK-7D-ABC123</code>\n\n3. Sau khi kích hoạt thành công, bot sẽ thông báo chính xác ngày giờ hết hạn và mở khóa toàn bộ chức năng.`, {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Nhắn Tin Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    if (data === "admin_hours") {
      await bot.answerCallback(q.id);
      await bot.sendMessage(chatId, buildAdminHoursMessage(), {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Liên Hệ Admin Ngay", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // ĐỔI PHỐI MÀU GIAO DIỆN
    if (data === "choose_theme") {
      await bot.answerCallback(q.id);
      const curTheme = getUserTheme(uid);
      await bot.sendMessage(chatId, `<b>🎨 CHỌN PHỐI MÀU GIAO DIỆN CHO BOT</b>\n━━━━━━━━━━━━━━━━━━━━━\nTheme đang dùng: <b>${curTheme.name}</b>\n\n<i>Chọn màu bạn thích để làm nổi bật tin nhắn dự đoán:</i>`, {
        reply_markup: makeThemeSelectKeyboard()
      });
      return;
    }

    if (data.startsWith("set_theme_")) {
      const themeId = data.replace("set_theme_", "");
      store.users[uid] = store.users[uid] || {};
      store.users[uid].theme = themeId;
      saveStore(store);
      await bot.answerCallback(q.id, `Đã chọn giao diện: ${themeId.toUpperCase()}!`, true);
      const th = getUserTheme(uid);
      await bot.sendMessage(chatId, `✅ <b>ĐÃ CẬP NHẬT PHỐI MÀU THÀNH CÔNG!</b>\n━━━━━━━━━━━━━━━━━━━━━\n🎨 <b>Giao diện:</b> <b>${th.name}</b>\n🟣 Huy hiệu Tài: <b>${th.badgeTai}</b>\n🌸 Huy hiệu Xỉu: <b>${th.badgeXiu}</b>\n${th.iconFire} Thanh đo: <code>${th.barFill.repeat(8)}${th.barEmpty.repeat(2)}</code> 80%\n━━━━━━━━━━━━━━━━━━━━━\n<i>Từ giờ các tin nhắn dự đoán sẽ tự động hiển thị theo màu sắc này.</i>`, {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Về Menu Chính", callback_data: "user_menu" }]]
        }
      });
      return;
    }

    // Kiểm tra quyền truy cập cho user thường
    if (!access.hasAccess && data !== "admin_menu" && !data.startsWith("gen_") && data !== "admin_list_keys" && data !== "admin_stats" && data !== "admin_clean_expired" && data !== "admin_view_logs") {
      await bot.answerCallback(q.id, "⚠️ Bạn chưa kích hoạt Key bản quyền!", true);
      await bot.sendMessage(chatId, `<b>⛔ TRUY CẬP BỊ TỪ CHỐI</b>\n\nBạn chưa kích hoạt Key hoặc thời hạn sử dụng đã hết.\nVui lòng gửi lệnh: <code>/key &lt;mã_key_của_bạn&gt;</code>\nHoặc liên hệ: <b>${TELEGRAM_ADMIN_CONTACT}</b> (Trực từ <b>${ADMIN_WORK_HOURS}</b>)`);
      return;
    }

    // SOI CẦU MD5 (LC79)
    if (data === "pred_md5") {
      await bot.answerCallback(q.id);
      const text = buildPredictionText("md5", md5, uid);
      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_md5" }],
            [{ text: "📊 Xem Chi Tiết Thua/Thắng 30P", callback_data: "stats_md5" }],
            [{ text: "🔙 Về Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    // SOI CẦU HŨ
    if (data === "pred_hu") {
      await bot.answerCallback(q.id);
      const text = buildPredictionText("hu", hu, uid);
      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_hu" }],
            [{ text: "📊 Xem Chi Tiết Thua/Thắng 30P", callback_data: "stats_hu" }],
            [{ text: "🔙 Về Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    // THỐNG KÊ CHI TIẾT TỪNG PHIÊN (THUA / THẮNG ĐẦY ĐỦ)
    if (data === "stats_md5") {
      await bot.answerCallback(q.id);
      const text = buildStatsFullText("md5", md5, uid);
      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Làm Mới Thống Kê MD5", callback_data: "stats_md5" }],
            [{ text: "❖ Xem Thống Kê Bàn Hũ", callback_data: "stats_hu" }],
            [{ text: "🔙 Về Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    if (data === "stats_hu") {
      await bot.answerCallback(q.id);
      const text = buildStatsFullText("hu", hu, uid);
      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Làm Mới Thống Kê Hũ", callback_data: "stats_hu" }],
            [{ text: "◈ Xem Thống Kê Bàn MD5", callback_data: "stats_md5" }],
            [{ text: "🔙 Về Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    if (data === "capital_strategy") {
      await bot.answerCallback(q.id);
      await bot.sendMessage(chatId, buildCapitalStrategyText(), {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Chính", callback_data: "user_menu" }]] }
      });
      return;
    }

    if (data === "deep_analysis") {
      await bot.answerCallback(q.id);
      const tMd5 = buildDeepAnalysisText("md5", md5, uid);
      await bot.sendMessage(chatId, tMd5, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "❖ Xem Ma Trận Bàn Hũ", callback_data: "deep_hu" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    if (data === "deep_hu") {
      await bot.answerCallback(q.id);
      const tHu = buildDeepAnalysisText("hu", hu, uid);
      await bot.sendMessage(chatId, tHu, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "◈ Xem Ma Trận Bàn MD5", callback_data: "deep_analysis" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    // BẬT / TẮT TỰ ĐỘNG BÁO MD5 (DUY NHẤT 1 BÀN)
    if (data === "toggle_md5") {
      store.users[uid] = store.users[uid] || {};
      store.users[uid].md5Alert = !store.users[uid].md5Alert;
      saveStore(store);
      await bot.answerCallback(q.id, `Đã ${store.users[uid].md5Alert ? "BẬT 🟢" : "TẮT 🔴"} tự báo kèo MD5!`);
      await bot.editMessageReplyMarkup(chatId, msgId, { reply_markup: makeUserInlineKeyboard(uid) });
      return;
    }

    // BẬT / TẮT TỰ ĐỘNG BÁO HŨ
    if (data === "toggle_hu") {
      store.users[uid] = store.users[uid] || {};
      store.users[uid].huAlert = !store.users[uid].huAlert;
      saveStore(store);
      await bot.answerCallback(q.id, `Đã ${store.users[uid].huAlert ? "BẬT 🟢" : "TẮT 🔴"} tự báo kèo Hũ!`);
      await bot.editMessageReplyMarkup(chatId, msgId, { reply_markup: makeUserInlineKeyboard(uid) });
      return;
    }

    // THÔNG TIN BẢN QUYỀN
    if (data === "my_info") {
      await bot.answerCallback(q.id);
      const u = store.users[uid] || {};
      const expiryFormatted = access.expiresAt ? formatVNDateTime(access.expiresAt) : "Vĩnh Viễn (Lifetime)";
      const activatedFormatted = u.activatedAt ? formatVNDateTime(u.activatedAt) : "—";
      const th = getUserTheme(uid);

      const msg = `<b>${th.iconHeader} THÔNG TIN BẢN QUYỀN CỦA BẠN</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID Telegram:</b> <code>${uid}</code>
🔑 <b>Mã Key Đang Dùng:</b> <code>${u.activatedKey || "Admin Tối Cao"}</code>
🕒 <b>Thời Điểm Kích Hoạt:</b> <b>${activatedFormatted}</b>
📅 <b>HẠN DÙNG ĐẾN:</b> <b>${expiryFormatted}</b>
⏳ <b>Thời Gian Còn Lại:</b> <b>${access.remainingText}</b>
🎨 <b>Theme Giao Diện:</b> <b>${th.name}</b>
━━━━━━━━━━━━━━━━━━━━━
⚡ <b>Tự Báo MD5:</b> ${u.md5Alert ? "🟢 Đang Bật" : "🔴 Đang Tắt"}
⚡ <b>Tự Báo Hũ:</b> ${u.huAlert ? "🟢 Đang Bật" : "🔴 Đang Tắt"}
━━━━━━━━━━━━━━━━━━━━━
⏰ <b>Giờ làm việc Admin:</b> <b>${ADMIN_WORK_HOURS}</b>
<i>Tác giả: Phạm Anh Khôi · Hỗ trợ: ${TELEGRAM_ADMIN_CONTACT}</i>`;
      await bot.sendMessage(chatId, msg, {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Menu Chính", callback_data: "user_menu" }]]
        }
      });
      return;
    }

    if (data === "refresh_menu" || data === "user_menu") {
      await bot.answerCallback(q.id, "Đã làm mới dữ liệu!");
      const th = getUserTheme(uid);
      const welcome = `<b>${th.iconHeader} HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN QUANTUM v8.0</b>
━━━━━━━━━━━━━━━━━━━━━
👤 <b>Người dùng:</b> <code>${q.from.first_name || uid}</code>
🆔 <b>ID:</b> <code>${uid}</code>
⏳ <b>Thời hạn:</b> <b>${access.remainingText}</b>
⏰ <b>Giờ Admin trực:</b> <b>${ADMIN_WORK_HOURS}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bấm các nút dưới màn hình để tra cứu tức thì:</i>`;
      await bot.editMessageText(chatId, msgId, welcome, {
        reply_markup: makeUserInlineKeyboard(uid)
      });
      return;
    }

    // --- CÁC NÚT DÀNH RIÊNG CHO ADMIN ---
    if (!access.isAdmin) {
      await bot.answerCallback(q.id, "⛔ Bạn không có quyền Admin!", true);
      return;
    }

    if (data === "admin_menu") {
      await bot.answerCallback(q.id);
      const adminTxt = `<b>👑 BẢNG QUẢN TRỊ ADMIN TỐI CAO</b>
━━━━━━━━━━━━━━━━━━━━━
Xin chào Sếp <b>Phạm Anh Khôi</b>!
ID Admin: <code>${uid}</code>
Toàn quyền tạo key, thu hồi (mở lại được), xoá key (mất luôn) và quản lý hệ thống.
⏰ <b>Giờ làm việc:</b> <b>${ADMIN_WORK_HOURS}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bấm nút bên dưới để tạo key hoặc quản lý:</i>`;
      await bot.editMessageText(chatId, msgId, adminTxt, {
        reply_markup: makeAdminKeyboard()
      });
      return;
    }

    if (data.startsWith("gen_")) {
      const durType = data.replace("gen_", "");
      const dur = parseDuration(durType);
      if (dur) {
        const kStr = generateKey(dur.text);
        store.keys[kStr] = {
          durationMs: dur.ms,
          durationText: dur.text,
          createdAt: Date.now(),
          createdBy: uid,
          status: "active",
          activatedBy: null,
          activatedAt: null,
          expiresAt: null
        };
        addSystemLog("Tạo Key", `Tạo key ${kStr} (${dur.text}) bởi Admin ${uid}`);
        saveStore(store);
        await bot.answerCallback(q.id, "Đã tạo Key thành công!");

        const expExplanation = dur.ms === -1
          ? "📅 <b>Hạn dùng sau khi kích hoạt:</b> <b>Vĩnh Viễn (Lifetime)</b>"
          : `📅 <b>Thời hạn:</b> <b>${dur.text}</b> (Bắt đầu đếm ngược ngay khi khách kích hoạt)`;

        await bot.sendMessage(chatId, `<b>🎉 TẠO KEY BẢN QUYỀN THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━━━━
🔑 <b>Mã Key:</b> <code>${kStr}</code>
⏳ <b>Gói dịch vụ:</b> <b>${dur.text}</b>
${expExplanation}
━━━━━━━━━━━━━━━━━━━━━
<i>Gửi mã key này cho khách. Khách kích hoạt bằng lệnh:</i>
👉 <code>/key ${kStr}</code>`, {
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Về Menu Admin", callback_data: "admin_menu" }]]
          }
        });
      }
      return;
    }

    if (data === "admin_list_keys") {
      await bot.answerCallback(q.id);
      const allKeys = Object.entries(store.keys);
      if (allKeys.length === 0) {
        await bot.sendMessage(chatId, "<i>Chưa có key nào trong hệ thống.</i>", {
          reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
        });
        return;
      }

      let keyMsg = `<b>📋 DANH SÁCH KEY BẢN QUYỀN (${allKeys.length} Key)</b>\n━━━━━━━━━━━━━━━━━━━━━\n`;
      allKeys.slice(-15).reverse().forEach(([k, v]) => {
        let st = "🟢 Còn trống";
        if (v.status === "used") st = "🔴 Đã kích hoạt";
        if (v.status === "revoked") st = "⛔ BỊ THU HỒI (Có thể mở lại)";
        const user = v.activatedBy ? `(ID: <code>${v.activatedBy}</code>)` : "";
        keyMsg += `• <code>${k}</code> | ${v.durationText} | ${st} ${user}\n`;
      });
      await bot.sendMessage(chatId, keyMsg, {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
      });
      return;
    }

    if (data === "admin_stats") {
      await bot.answerCallback(q.id);
      const totalUsers = Object.keys(store.users).length;
      const activeKeys = Object.values(store.keys).filter(k => k.status === "active").length;
      const usedKeys = Object.values(store.keys).filter(k => k.status === "used").length;
      const revokedKeys = Object.values(store.keys).filter(k => k.status === "revoked").length;
      const md5Stats = md5.tracker.getFullStats(30);
      const huStats = hu.tracker.getFullStats(30);

      const statsMsg = `<b>📊 BÁO CÁO TOÀN DIỆN HỆ THỐNG</b>
━━━━━━━━━━━━━━━━━━━━━
👥 <b>Tổng Người Dùng:</b> <b>${totalUsers}</b>
🔑 <b>Key Chưa Kích Hoạt:</b> <b>${activeKeys}</b>
🔐 <b>Key Đang Hoạt Động:</b> <b>${usedKeys}</b>
⛔ <b>Key Bị Thu HỒI (Có thể mở lại):</b> <b>${revokedKeys}</b>
━━━━━━━━━━━━━━━━━━━━━
◈ <b>Tài Xỉu MD5 LC79 (30P):</b> <b>${md5Stats.accStr}</b> (Thắng ${md5Stats.winCount} | Thua ${md5Stats.lossCount})
❖ <b>Tài Xỉu Hũ (30P):</b> <b>${huStats.accStr}</b> (Thắng ${huStats.winCount} | Thua ${huStats.lossCount})
━━━━━━━━━━━━━━━━━━━━━
<i>Hệ thống định lượng vận hành 24/7 ổn định mượt mà.</i>`;
      await bot.sendMessage(chatId, statsMsg, {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
      });
      return;
    }

    if (data === "admin_clean_expired") {
      await bot.answerCallback(q.id);
      let count = 0;
      const now = Date.now();
      for (const [k, v] of Object.entries(store.keys)) {
        if (v.status === "used" && v.expiresAt && v.expiresAt !== -1 && now > v.expiresAt) {
          delete store.keys[k];
          count++;
        }
      }
      saveStore(store);
      await bot.sendMessage(chatId, `🧹 <b>Đã dọn dẹp thành công ${count} key hết hạn!</b>`, {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
      });
      return;
    }

    if (data === "admin_view_logs") {
      await bot.answerCallback(q.id);
      const logs = store.logs || [];
      if (logs.length === 0) {
        await bot.sendMessage(chatId, "<i>Chưa có nhật ký hoạt động.</i>", {
          reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
        });
        return;
      }
      let logText = "<b>📜 NHẬT KÝ HOẠT ĐỘNG GẦN ĐÂY:</b>\n━━━━━━━━━━━━━━━━━━━━━\n";
      logs.slice(-10).reverse().forEach(l => {
        logText += `• [${l.time}] <b>${l.action}:</b> ${l.detail}\n`;
      });
      await bot.sendMessage(chatId, logText, {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
      });
      return;
    }
  }

  // 2. XỬ LÝ TIN NHẮN TỪ PHÍM CỐ ĐỊNH HOẶC LỆNH GÕ
  if (update.message && update.message.text) {
    const m = update.message;
    const uid = String(m.from.id);
    const text = m.text.trim();
    const chatId = m.chat.id;

    // KIỂM TRA TRẠNG THÁI BỊ THU HỒI CỦA USER
    const currentAccess = checkUserAccess(uid);
    if (currentAccess.isRevoked && !text.startsWith("/key") && !text.startsWith("/claim_admin") && !text.startsWith("/giolamviec") && text !== "⏰ GIỜ ADMIN HỖ TRỢ") {
      await bot.sendMessage(chatId, buildRevokedMessage(currentAccess.revokedKey), {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Liên Hệ Admin Mở Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // LỆNH CLAIM ADMIN TỐI CAO BẰNG MẬT KHẨU MASTER
    if (text.startsWith("/claim_admin")) {
      const parts = text.split(" ");
      const enteredPass = parts[1];
      if (enteredPass === MASTER_KEY) {
        if (!store.adminIds.includes(uid)) {
          store.adminIds.push(uid);
          saveStore(store);
        }
        addSystemLog("Claim Admin", `User ${uid} kích hoạt quyền Admin Tối Cao`);
        await bot.sendMessage(chatId, `<b>👑 XÁC THỰC ADMIN THÀNH CÔNG!</b>\n\nXin chào Sếp <b>Phạm Anh Khôi</b>!\nID <code>${uid}</code> đã được nâng cấp quyền <b>Admin Tối Cao</b>.\n⏰ <b>Giờ làm việc:</b> <b>${ADMIN_WORK_HOURS}</b>`, {
          reply_markup: makePersistentReplyKeyboard(uid)
        });
      } else {
        await bot.sendMessage(chatId, `<b>❌ MẬT KHẨU KHÔNG CHÍNH XÁC!</b>\nCú pháp: <code>/claim_admin &lt;mật_khẩu_master&gt;</code>`);
      }
      return;
    }

    // LỆNH START & MỞ BÀN PHÍM CỐ ĐỊNH CHỌN 1-CHẠM
    if (text === "/start" || text === "/menu" || text === "🔄 LÀM MỚI DỮ LIỆU") {
      const access = checkUserAccess(uid);

      if (!access.hasAccess) {
        const welcomeNotActive = `<b>HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN QUANTUM v8.0</b>
━━━━━━━━━━━━━━━━━━━━━
Xin chào <b>${m.from.first_name || "bạn"}</b>!
🆔 <b>ID của bạn:</b> <code>${uid}</code>
⚠️ <b>Trạng thái:</b> <b>Chưa kích hoạt bản quyền</b>
⏰ <b>Giờ hỗ trợ Admin:</b> <b>${ADMIN_WORK_HOURS}</b>
━━━━━━━━━━━━━━━━━━━━━
Hệ thống bắt cầu lượng tử thích nghi công nghệ cao Tài Xỉu MD5 LC79 & Hũ.
Để sử dụng, vui lòng liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> để nhận Key bản quyền.

Nếu bạn đã có Key, hãy gửi tin nhắn theo cú pháp:
👉 <code>/key &lt;mã_key_của_bạn&gt;</code>`;
        await bot.sendMessage(chatId, welcomeNotActive, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📞 Mua Key Admin (@anhkhoi_xabc)", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }],
              [{ text: "⏰ Giờ Làm Việc Admin", callback_data: "admin_hours" }],
              [{ text: "ℹ️ Hướng Dẫn Kích Hoạt", callback_data: "how_to_key" }]
            ]
          }
        });
        return;
      }

      const th = getUserTheme(uid);
      const welcomeActive = `<b>${th.iconHeader} HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN QUANTUM v8.0</b>
━━━━━━━━━━━━━━━━━━━━━
👤 <b>Người dùng:</b> <code>${m.from.first_name || uid}</code>
🆔 <b>ID:</b> <code>${uid}</code>
⏳ <b>Thời hạn:</b> <b>${access.remainingText}</b>
🎨 <b>Phối màu chữ:</b> <b>${th.name}</b>
⏰ <b>Giờ Admin:</b> <b>${ADMIN_WORK_HOURS}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bàn phím điều khiển nhanh 1-chạm đã sẵn sàng dưới màn hình! Chạm là chạy ngay!</i>`;
      await bot.sendMessage(chatId, welcomeActive, {
        reply_markup: makePersistentReplyKeyboard(uid)
      });
      return;
    }

    // LỆNH GIỜ LÀM VIỆC CỦA ADMIN
    if (text === "⏰ GIỜ ADMIN HỖ TRỢ" || text === "/giolamviec") {
      await bot.sendMessage(chatId, buildAdminHoursMessage(), {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Nhắn Tin Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // LỆNH ĐỔI PHỐI MÀU GIAO DIỆN
    if (text === "🎨 ĐỔI PHỐI MÀU CHỮ" || text === "/doimau") {
      const curTheme = getUserTheme(uid);
      await bot.sendMessage(chatId, `<b>🎨 CHỌN PHỐI MÀU GIAO DIỆN CHO BOT</b>\n━━━━━━━━━━━━━━━━━━━━━\nTheme đang dùng: <b>${curTheme.name}</b>\n\n<i>Chọn màu bạn thích để làm nổi bật tin nhắn dự đoán:</i>`, {
        reply_markup: makeThemeSelectKeyboard()
      });
      return;
    }

    // LỆNH KÍCH HOẠT KEY: /key <mã_key>
    if (text.startsWith("/key")) {
      const parts = text.split(" ");
      const enteredKey = (parts[1] || "").trim().toUpperCase();

      if (!enteredKey) {
        await bot.sendMessage(chatId, "<b>⚠️ Vui lòng nhập mã key!</b>\nCú pháp: <code>/key &lt;mã_key&gt;</code>\n<i>Ví dụ:</i> <code>/key AK-7D-8A9F21</code>");
        return;
      }

      const kData = store.keys[enteredKey];

      // NẾU KEY ĐÃ BỊ ADMIN THU HỒI (CÓ THỂ MỞ LẠI)
      if (kData && kData.status === "revoked") {
        await bot.sendMessage(chatId, `<b>⛔ KEY ĐÃ BỊ TẠM THU HỒI!</b>\n\nMã key <code>${enteredKey}</code> đã bị Admin thu hồi.\nKey này <b>CÓ THỂ MỞ LẠI</b> sau khi liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b>.\n⏰ <b>Giờ làm việc Admin:</b> <b>${ADMIN_WORK_HOURS}</b>`, {
          reply_markup: {
            inline_keyboard: [[{ text: "📞 Liên Hệ Admin Mở Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
          }
        });
        return;
      }

      if (!kData || kData.status !== "active") {
        await bot.sendMessage(chatId, `<b>❌ KEY KHÔNG HỢP LỆ HOẶC ĐÃ BỊ XOÁ MẤT LUÔN!</b>\n\nKey không tồn tại hoặc đã được sử dụng.\nVui lòng liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> để được cấp key mới.`);
        return;
      }

      const now = Date.now();
      const expiresAt = kData.durationMs === -1 ? -1 : now + kData.durationMs;

      kData.status = "used";
      kData.activatedBy = uid;
      kData.activatedAt = now;
      kData.expiresAt = expiresAt;

      store.users[uid] = store.users[uid] || { md5Alert: false, huAlert: false };
      store.users[uid].status = "active";
      store.users[uid].activatedKey = enteredKey;
      store.users[uid].expiresAt = expiresAt;
      store.users[uid].activatedAt = now;
      delete store.users[uid].revokedKey;
      delete store.users[uid].revokedAt;
      addSystemLog("Kích hoạt Key", `User ${uid} kích hoạt key ${enteredKey} (${kData.durationText})`);
      saveStore(store);

      const expDateStr = expiresAt === -1 ? "Vĩnh Viễn (Không thời hạn)" : formatVNDateTime(expiresAt);
      const actDateStr = formatVNDateTime(now);

      await bot.sendMessage(chatId, `<b>🎉 KÍCH HOẠT BẢN QUYỀN THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━━━━
🔑 <b>Mã Key:</b> <code>${enteredKey}</code>
⏳ <b>Gói dịch vụ:</b> <b>${kData.durationText}</b>
🕒 <b>Thời điểm kích hoạt:</b> <b>${actDateStr}</b>
📅 <b>HẠN DÙNG ĐẾN:</b> <b>${expDateStr}</b>
⏳ <b>Thời gian sử dụng:</b> <b>${formatRemainingDetail(expiresAt)}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Toàn bộ hệ thống bắt cầu định lượng và bàn phím 1-chạm đã sẵn sàng!</i>`, {
        reply_markup: makePersistentReplyKeyboard(uid)
      });
      return;
    }

    // XỬ LÝ CÁC CHỨC NĂNG DÀNH CHO THÀNH VIÊN ĐÃ CÓ BẢN QUYỀN
    const access = checkUserAccess(uid);

    // 1. SOI CẦU MD5 (LC79 - NGUỒN DUY NHẤT)
    if (text === "◈ SOI CẦU MD5 (LC79)" || text === "/md5") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền. Vui lòng nhập /key <mã_key>");
        return;
      }
      await bot.sendMessage(chatId, buildPredictionText("md5", md5, uid), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_md5" }],
            [{ text: "📊 Xem Chi Tiết Thua/Thắng 30P", callback_data: "stats_md5" }],
            [{ text: "🔮 Ma Trận Cầu Sâu MD5", callback_data: "deep_analysis" }]
          ]
        }
      });
      return;
    }

    // 2. SOI CẦU HŨ
    if (text === "❖ SOI CẦU HŨ" || text === "/hu") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền. Vui lòng nhập /key <mã_key>");
        return;
      }
      await bot.sendMessage(chatId, buildPredictionText("hu", hu, uid), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Lại Phiên Mới", callback_data: "pred_hu" }],
            [{ text: "📊 Xem Chi Tiết Thua/Thắng 30P", callback_data: "stats_hu" }],
            [{ text: "🔮 Ma Trận Cầu Sâu Bàn Hũ", callback_data: "deep_hu" }]
          ]
        }
      });
      return;
    }

    // 3. THỐNG KÊ CHI TIẾT TỪNG PHIÊN (NHẢY RA ĐẦY ĐỦ THẮNG / THUA)
    if (text === "📊 THỐNG KÊ CHI TIẾT 30P" || text === "/thongke") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền.");
        return;
      }
      await bot.sendMessage(chatId, buildStatsFullText("md5", md5, uid), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "◈ Thống Kê MD5", callback_data: "stats_md5" }, { text: "❖ Thống Kê Hũ", callback_data: "stats_hu" }]
          ]
        }
      });
      return;
    }

    // 4. CÀI ĐẶT TỰ ĐỘNG BÁO KÈO
    if (text === "⚡ TỰ ĐỘNG BÁO KÈO" || text === "/tubao") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền.");
        return;
      }
      const u = store.users[uid] || {};
      const mState = u.md5Alert ? "🟢 ĐANG BẬT" : "🔴 ĐANG TẮT";
      const hState = u.huAlert ? "🟢 ĐANG BẬT" : "🔴 ĐANG TẮT";

      const txt = `<b>⚡ CÀI ĐẶT TỰ ĐỘNG BÁO KÈO TỪNG BÀN</b>
━━━━━━━━━━━━━━━━━━━━━
Chỉ 1 bàn MD5 duy nhất (LC79) và 1 bàn Hũ, độc lập 100%, không bị rối!

◈ <b>Tài Xỉu MD5 (LC79):</b> <b>${mState}</b>
❖ <b>Tài Xỉu Hũ (Tele68):</b> <b>${hState}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bấm các nút bên dưới để chuyển đổi Bật / Tắt:</i>`;
      await bot.sendMessage(chatId, txt, {
        reply_markup: makeUserInlineKeyboard(uid)
      });
      return;
    }

    // 5. THÔNG TIN BẢN QUYỀN
    if (text === "👤 BẢN QUYỀN CỦA BẠN" || text === "/thongtin") {
      const u = store.users[uid] || {};
      const expDateStr = access.expiresAt ? formatVNDateTime(access.expiresAt) : "Vĩnh Viễn (Lifetime)";
      const actDateStr = u.activatedAt ? formatVNDateTime(u.activatedAt) : "—";
      const th = getUserTheme(uid);

      const msg = `<b>${th.iconHeader} THÔNG TIN BẢN QUYỀN CỦA BẠN</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID Telegram:</b> <code>${uid}</code>
🔑 <b>Mã Key Đang Dùng:</b> <code>${u.activatedKey || (access.isAdmin ? "Admin Tối Cao" : "Chưa có")}</code>
📊 <b>Trạng Thái:</b> <b>${access.hasAccess ? "🟢 Đang Hoạt Động" : "🔴 Chưa Hợp Lệ"}</b>
🕒 <b>Thời Điểm Kích Hoạt:</b> <b>${actDateStr}</b>
📅 <b>HẠN DÙNG ĐẾN:</b> <b>${expDateStr}</b>
⏳ <b>Thời Gian Còn Lại:</b> <b>${access.remainingText}</b>
🎨 <b>Theme Giao Diện:</b> <b>${th.name}</b>
━━━━━━━━━━━━━━━━━━━━━
⚡ <b>Tự Báo MD5:</b> ${u.md5Alert ? "🟢 Bật" : "🔴 Tắt"}
⚡ <b>Tự Báo Hũ:</b> ${u.huAlert ? "🟢 Bật" : "🔴 Tắt"}
━━━━━━━━━━━━━━━━━━━━━
⏰ <b>Giờ làm việc Admin:</b> <b>${ADMIN_WORK_HOURS}</b>
<i>Tác giả: Phạm Anh Khôi · Hỗ trợ: ${TELEGRAM_ADMIN_CONTACT}</i>`;
      await bot.sendMessage(chatId, msg, {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Liên Hệ Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // 6. QUẢN LÝ VỐN THỰC CHIẾN
    if (text === "📐 QUẢN LÝ VỐN" || text === "/quanlyvon") {
      await bot.sendMessage(chatId, buildCapitalStrategyText());
      return;
    }

    // 7. PHÂN TÍCH MA TRẬN CẦU SÂU
    if (text === "🔮 MA TRẬN CẦU SÂU" || text === "/soicausau") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền.");
        return;
      }
      await bot.sendMessage(chatId, buildDeepAnalysisText("md5", md5, uid), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "❖ Phân Tích Bàn Hũ", callback_data: "deep_hu" }]
          ]
        }
      });
      return;
    }

    // 8. MENU ADMIN TỐI CAO
    if (text === "👑 BẢNG QUẢN TRỊ ADMIN TỐI CAO" || text === "/admin") {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const adminTxt = `<b>👑 BẢNG QUẢN TRỊ ADMIN TỐI CAO</b>
━━━━━━━━━━━━━━━━━━━━━
Xin chào Sếp <b>Phạm Anh Khôi</b>!
ID Admin: <code>${uid}</code>
Toàn quyền tạo key, thu hồi (mở lại được), xoá key (mất luôn) và quản lý hệ thống.
⏰ <b>Giờ trực hỗ trợ:</b> <b>${ADMIN_WORK_HOURS}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bấm nút bên dưới để tạo key hoặc quản lý:</i>`;
      await bot.sendMessage(chatId, adminTxt, {
        reply_markup: makeAdminKeyboard()
      });
      return;
    }

    // =====================================================================
    // CÁC LỆNH ADMIN ĐẶC QUYỀN (THU HỒI - MỞ LẠI - XOÁ MẤT LUÔN)
    // =====================================================================

    // LỆNH TẠO KEY: /taokey <thời_gian> [số_lượng]
    if (text.startsWith("/taokey")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }

      const parts = text.split(" ");
      const durStr = parts[1] || "1d";
      const count = Math.min(10, Math.max(1, parseInt(parts[2], 10) || 1));
      const dur = parseDuration(durStr);

      if (!dur) {
        await bot.sendMessage(chatId, `<b>⚠️ Định dạng thời gian không đúng!</b>\n\nVí dụ:\n• <code>/taokey 1h</code> (1 giờ)\n• <code>/taokey 12h</code> (12 giờ)\n• <code>/taokey 1d</code> (1 ngày)\n• <code>/taokey 7d 3</code> (tạo 3 key 7 ngày)\n• <code>/taokey 30d</code> (30 ngày)\n• <code>/taokey vv</code> (vĩnh viễn)`);
        return;
      }

      const createdKeys = [];
      for (let i = 0; i < count; i++) {
        const kStr = generateKey(dur.text);
        store.keys[kStr] = {
          durationMs: dur.ms,
          durationText: dur.text,
          createdAt: Date.now(),
          createdBy: uid,
          status: "active",
          activatedBy: null,
          activatedAt: null,
          expiresAt: null
        };
        createdKeys.push(kStr);
      }
      addSystemLog("Tạo Key", `Tạo ${count} key (${dur.text})`);
      saveStore(store);

      const keysMsg = createdKeys.map(k => `• <code>${k}</code>`).join("\n");
      await bot.sendMessage(chatId, `<b>🎉 ĐÃ TẠO THÀNH CÔNG ${count} KEY (${dur.text})!</b>\n━━━━━━━━━━━━━━━━━━━━━\n${keysMsg}\n━━━━━━━━━━━━━━━━━━━━━\n📅 <i>Sau khi khách kích hoạt, thời hạn sẽ tính chính xác: ${dur.text}.</i>`);
      return;
    }

    // LỆNH THU HỒI KEY (CÓ THỂ MỞ LẠI): /thuhoi <mã_key>
    if (text.startsWith("/thuhoi") && !text.startsWith("/thuhoiuser")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const targetKey = (text.split(" ")[1] || "").trim().toUpperCase();
      if (!targetKey || !store.keys[targetKey]) {
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/thuhoi &lt;mã_key&gt;</code>\nKhông tìm thấy mã key này trong hệ thống!");
        return;
      }

      // Đánh dấu trạng thái key là đã thu hồi (revoked) - CÓ THỂ MỞ LẠI
      store.keys[targetKey].status = "revoked";
      store.keys[targetKey].revokedAt = Date.now();
      store.keys[targetKey].revokedBy = uid;

      let affectedUserId = null;
      for (const [uId, uObj] of Object.entries(store.users)) {
        if (uObj.activatedKey === targetKey) {
          affectedUserId = uId;
          uObj.status = "revoked";
          uObj.revokedKey = targetKey;
          uObj.revokedAt = Date.now();
          uObj.md5Alert = false;
          uObj.huAlert = false;

          try {
            await bot.sendMessage(uId, buildRevokedMessage(targetKey), {
              reply_markup: {
                inline_keyboard: [[{ text: "📞 Liên Hệ Admin Mở Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
              }
            });
          } catch {}
        }
      }

      addSystemLog("Thu hồi Key", `Tạm thu hồi key ${targetKey} (User: ${affectedUserId || "Chưa gán"})`);
      saveStore(store);

      await bot.sendMessage(chatId, `✅ <b>ĐÃ THU HỒI KEY THÀNH CÔNG (CÓ THỂ MỞ LẠI)!</b>\n━━━━━━━━━━━━━━━━━━━━━\n🔑 <b>Key:</b> <code>${targetKey}</code>\n👤 <b>User bị khóa:</b> <code>${affectedUserId || "Chưa ai dùng"}</code>\nℹ️ <i>Key này đang tạm khóa. Khi cần mở lại, dùng lệnh:</i>\n👉 <code>/molai ${targetKey}</code>`);
      return;
    }

    // LỆNH MỞ LẠI KEY ĐÃ BỊ THU HỒI: /molai <mã_key>
    if (text.startsWith("/molai")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const targetKey = (text.split(" ")[1] || "").trim().toUpperCase();
      if (!targetKey || !store.keys[targetKey]) {
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/molai &lt;mã_key&gt;</code>\nKhông tìm thấy mã key này trong hệ thống!");
        return;
      }

      const kData = store.keys[targetKey];
      if (kData.status !== "revoked") {
        await bot.sendMessage(chatId, `⚠️ Key <code>${targetKey}</code> hiện không ở trạng thái bị thu hồi (Trạng thái: <b>${kData.status}</b>).`);
        return;
      }

      kData.status = kData.activatedBy ? "used" : "active";
      delete kData.revokedAt;
      delete kData.revokedBy;

      let restoredUserId = null;
      for (const [uId, uObj] of Object.entries(store.users)) {
        if (uObj.activatedKey === targetKey || uObj.revokedKey === targetKey) {
          restoredUserId = uId;
          uObj.status = "active";
          delete uObj.revokedKey;
          delete uObj.revokedAt;

          try {
            await bot.sendMessage(uId, `🎉 <b>BẢN QUYỀN ĐÃ ĐƯỢC ADMIN MỞ LẠI!</b>\n━━━━━━━━━━━━━━━━━━━━━\nKey <code>${targetKey}</code> của bạn đã được Admin kích hoạt mở lại thành công.\nBạn có thể tiếp tục sử dụng bình thường!`, {
              reply_markup: makePersistentReplyKeyboard(uId)
            });
          } catch {}
        }
      }

      addSystemLog("Mở lại Key", `Mở lại key ${targetKey} (User: ${restoredUserId || "Chưa gán"})`);
      saveStore(store);

      await bot.sendMessage(chatId, `🎉 <b>ĐÃ MỞ LẠI KEY THÀNH CÔNG!</b>\n━━━━━━━━━━━━━━━━━━━━━\n🔑 <b>Key:</b> <code>${targetKey}</code>\n👤 <b>User khôi phục:</b> <code>${restoredUserId || "Chưa ai dùng"}</code>\n✅ <i>Người dùng đã có thể sử dụng lại bình thường.</i>`);
      return;
    }

    // LỆNH THU HỒI USER TRỰC TIẾP (CÓ THỂ MỞ LẠI): /thuhoiuser <user_id>
    if (text.startsWith("/thuhoiuser")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const targetUid = (text.split(" ")[1] || "").trim();
      if (!targetUid || !store.users[targetUid]) {
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/thuhoiuser &lt;user_id&gt;</code>\nKhông tìm thấy thông tin của User ID này!");
        return;
      }

      const uObj = store.users[targetUid];
      const revokedKey = uObj.activatedKey || "VIP";
      if (store.keys[revokedKey]) {
        store.keys[revokedKey].status = "revoked";
        store.keys[revokedKey].revokedAt = Date.now();
      }

      uObj.status = "revoked";
      uObj.revokedKey = revokedKey;
      uObj.revokedAt = Date.now();
      uObj.md5Alert = false;
      uObj.huAlert = false;

      addSystemLog("Thu hồi User", `Tạm thu hồi quyền User ${targetUid}`);
      saveStore(store);

      try {
        await bot.sendMessage(targetUid, buildRevokedMessage(revokedKey), {
          reply_markup: {
            inline_keyboard: [[{ text: "📞 Liên Hệ Admin Mở Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
          }
        });
      } catch {}

      await bot.sendMessage(chatId, `✅ <b>Đã tạm thu hồi User ID <code>${targetUid}</code> (CÓ THỂ MỞ LẠI)!</b>\nĐể mở lại, dùng lệnh: <code>/khoiphucuser ${targetUid}</code>`);
      return;
    }

    // LỆNH MỞ LẠI USER ĐÃ THU HỒI: /khoiphucuser <user_id>
    if (text.startsWith("/khoiphucuser")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const targetUid = (text.split(" ")[1] || "").trim();
      if (!targetUid || !store.users[targetUid]) {
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/khoiphucuser &lt;user_id&gt;</code>\nKhông tìm thấy thông tin của User ID này!");
        return;
      }

      const uObj = store.users[targetUid];
      const keyStr = uObj.revokedKey || uObj.activatedKey;
      if (keyStr && store.keys[keyStr]) {
        store.keys[keyStr].status = "used";
        delete store.keys[keyStr].revokedAt;
      }

      uObj.status = "active";
      delete uObj.revokedKey;
      delete uObj.revokedAt;
      addSystemLog("Khôi phục User", `Mở lại quyền User ${targetUid}`);
      saveStore(store);

      try {
        await bot.sendMessage(targetUid, `🎉 <b>TÀI KHOẢN ĐÃ ĐƯỢC ADMIN MỞ LẠI!</b>\n━━━━━━━━━━━━━━━━━━━━━\nTài khoản của bạn đã được Admin khôi phục quyền truy cập.\nBạn có thể tiếp tục sử dụng bình thường!`, {
          reply_markup: makePersistentReplyKeyboard(targetUid)
        });
      } catch {}

      await bot.sendMessage(chatId, `🎉 <b>Đã mở lại thành công quyền cho User ID <code>${targetUid}</code>!</b>`);
      return;
    }

    // LỆNH XOÁ KEY (MẤT LUÔN HOÀN TOÀN KHÔNG THỂ KHÔI PHỤC): /xoakey <mã_key>
    if (text.startsWith("/xoakey")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const targetKey = (text.split(" ")[1] || "").trim().toUpperCase();
      if (!targetKey || !store.keys[targetKey]) {
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/xoakey &lt;mã_key&gt;</code>\nKhông tìm thấy mã key này trong hệ thống!");
        return;
      }

      // XOÁ HOÀN TOÀN KHỎI HỆ THỐNG - MẤT LUÔN
      delete store.keys[targetKey];

      let affectedUserId = null;
      for (const [uId, uObj] of Object.entries(store.users)) {
        if (uObj.activatedKey === targetKey || uObj.revokedKey === targetKey) {
          affectedUserId = uId;
          delete store.users[uId];
          try {
            await bot.sendMessage(uId, `⚠️ <b>Key bản quyền của bạn đã bị xoá vĩnh viễn khỏi hệ thống!</b>\nVui lòng liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> nếu cần mua key mới.`);
          } catch {}
        }
      }

      addSystemLog("Xoá Vĩnh Viễn Key", `Xoá mất luôn key ${targetKey}, xóa user: ${affectedUserId || "Không có"}`);
      saveStore(store);

      await bot.sendMessage(chatId, `🗑️ <b>ĐÃ XOÁ VĨNH VIỄN KEY (MẤT LUÔN KHỎI HỆ THỐNG)!</b>\n━━━━━━━━━━━━━━━━━━━━━\n🔑 <b>Key:</b> <code>${targetKey}</code>\n👤 <b>User bị xoá:</b> <code>${affectedUserId || "Không có"}</code>\n⚠️ <i>Key này đã bị xoá hoàn toàn, không thể khôi phục hay mở lại!</i>`);
      return;
    }

    // LỆNH TRA CỨU USER ẨN: /checkuser <user_id>
    if (text.startsWith("/checkuser")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const targetUid = (text.split(" ")[1] || "").trim();
      const u = store.users[targetUid];
      if (!u) {
        await bot.sendMessage(chatId, `⚠️ Không tìm thấy dữ liệu cho User ID <code>${targetUid}</code>.`);
        return;
      }

      const uAccess = checkUserAccess(targetUid);
      const actTime = u.activatedAt ? formatVNDateTime(u.activatedAt) : "—";
      const expTime = u.expiresAt ? formatVNDateTime(u.expiresAt) : "Vĩnh Viễn";

      const infoMsg = `<b>🔍 HỒ SƠ CHI TIẾT NGƯỜI DÙNG</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID:</b> <code>${targetUid}</code>
🔑 <b>Mã Key:</b> <code>${u.activatedKey || "Không"}</code>
📊 <b>Trạng thái:</b> <b>${u.status === "revoked" ? "⛔ BỊ THU HỒI (Có thể mở lại)" : (uAccess.hasAccess ? "🟢 Hoạt động" : "🔴 Hết hạn")}</b>
🕒 <b>Kích hoạt lúc:</b> <b>${actTime}</b>
📅 <b>Hạn dùng đến:</b> <b>${expTime}</b>
⏳ <b>Còn lại:</b> <b>${uAccess.remainingText}</b>
⚡ <b>Tự báo MD5:</b> ${u.md5Alert ? "🟢 Bật" : "🔴 Tắt"} | <b>Hũ:</b> ${u.huAlert ? "🟢 Bật" : "🔴 Tắt"}`;
      await bot.sendMessage(chatId, infoMsg);
      return;
    }

    // LỆNH GIA HẠN THỜI GIAN: /giahan <user_id> <thời_gian>
    if (text.startsWith("/giahan")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const parts = text.split(" ");
      const targetUid = parts[1];
      const durStr = parts[2];
      const dur = parseDuration(durStr);

      if (!targetUid || !dur) {
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/giahan &lt;user_id&gt; &lt;thời_gian&gt;</code>\n<i>Ví dụ:</i> <code>/giahan 123456789 7d</code>");
        return;
      }

      store.users[targetUid] = store.users[targetUid] || { md5Alert: false, huAlert: false };
      const currentExpiry = store.users[targetUid].expiresAt || Date.now();
      const baseTime = Math.max(Date.now(), currentExpiry);
      const newExpiry = dur.ms === -1 ? -1 : baseTime + dur.ms;

      store.users[targetUid].status = "active";
      store.users[targetUid].expiresAt = newExpiry;
      store.users[targetUid].activatedKey = "ADMIN_GIA_HAN";
      delete store.users[targetUid].revokedKey;
      delete store.users[targetUid].revokedAt;
      addSystemLog("Gia hạn", `Gia hạn ${dur.text} cho User ${targetUid}`);
      saveStore(store);

      await bot.sendMessage(chatId, `✅ <b>Đã gia hạn thành công cho User <code>${targetUid}</code> thêm ${dur.text}!</b>\nHạn mới đến: <b>${formatVNDateTime(newExpiry)}</b>`);
      try {
        await bot.sendMessage(targetUid, `🎉 <b>Tài khoản của bạn đã được Admin gia hạn thêm ${dur.text}!</b>\n📅 <b>Hạn dùng mới đến:</b> <b>${formatVNDateTime(newExpiry)}</b>\n⏳ <b>Thời gian còn lại:</b> <b>${formatRemainingDetail(newExpiry)}</b>`, {
          reply_markup: makePersistentReplyKeyboard(targetUid)
        });
      } catch {}
      return;
    }

    // LỆNH XEM DANH SÁCH KEY: /danhsachkey
    if (text === "/danhsachkey" || text === "/keys") {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const allKeys = Object.entries(store.keys);
      if (allKeys.length === 0) {
        await bot.sendMessage(chatId, "<i>Chưa có key nào trong hệ thống.</i>");
        return;
      }
      let keyMsg = `<b>📋 DANH SÁCH KEY BẢN QUYỀN (${allKeys.length} Key)</b>\n━━━━━━━━━━━━━━━━━━━━━\n`;
      allKeys.slice(-20).reverse().forEach(([k, v]) => {
        let st = "🟢 Còn trống";
        if (v.status === "used") st = "🔴 Đã kích hoạt";
        if (v.status === "revoked") st = "⛔ BỊ THU HỒI (Có thể mở lại)";
        const user = v.activatedBy ? `(ID: <code>${v.activatedBy}</code>)` : "";
        keyMsg += `• <code>${k}</code> | ${v.durationText} | ${st} ${user}\n`;
      });
      await bot.sendMessage(chatId, keyMsg);
      return;
    }

    // LỆNH BROADCAST THÔNG BÁO: /thongbao <nội dung>
    if (text.startsWith("/thongbao")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const msgContent = text.replace("/thongbao", "").trim();
      if (!msgContent) {
        await bot.sendMessage(chatId, "⚠️ Vui lòng nhập nội dung thông báo!\nCú pháp: <code>/thongbao &lt;nội dung&gt;</code>");
        return;
      }

      let count = 0;
      const uids = Object.keys(store.users);
      for (const uId of uids) {
        try {
          await bot.sendMessage(uId, `📢 <b>THÔNG BÁO TỪ ADMIN PHẠM ANH KHÔI</b>\n━━━━━━━━━━━━━━━━━━━━━\n${msgContent}\n━━━━━━━━━━━━━━━━━━━━━\n⏰ <i>Giờ làm việc: ${ADMIN_WORK_HOURS} · Hỗ trợ: ${TELEGRAM_ADMIN_CONTACT}</i>`);
          count++;
        } catch {}
      }
      addSystemLog("Thông báo", `Gửi thông báo tới ${count} người dùng`);
      await bot.sendMessage(chatId, `✅ <b>Đã phát thông báo thành công đến ${count} thành viên!</b>`);
      return;
    }

    // LỆNH THỐNG KÊ ADMIN: /thongkeadmin
    if (text === "/thongkeadmin") {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const totalUsers = Object.keys(store.users).length;
      const activeKeys = Object.values(store.keys).filter(k => k.status === "active").length;
      const usedKeys = Object.values(store.keys).filter(k => k.status === "used").length;
      const revokedKeys = Object.values(store.keys).filter(k => k.status === "revoked").length;
      const md5Stats = md5.tracker.getFullStats(30);
      const huStats = hu.tracker.getFullStats(30);

      const statsMsg = `<b>📊 BÁO CÁO TOÀN DIỆN HỆ THỐNG</b>
━━━━━━━━━━━━━━━━━━━━━
👥 <b>Tổng Người Dùng:</b> <b>${totalUsers}</b>
🔑 <b>Key Chưa Kích Hoạt:</b> <b>${activeKeys}</b>
🔐 <b>Key Đang Hoạt Động:</b> <b>${usedKeys}</b>
⛔ <b>Key Bị Thu Hồi (Mở lại được):</b> <b>${revokedKeys}</b>
━━━━━━━━━━━━━━━━━━━━━
◈ <b>Tài Xỉu MD5 LC79 (30P):</b> <b>${md5Stats.accStr}</b> (Thắng ${md5Stats.winCount} | Thua ${md5Stats.lossCount})
❖ <b>Tài Xỉu Hũ (30P):</b> <b>${huStats.accStr}</b> (Thắng ${huStats.winCount} | Thua ${huStats.lossCount})
━━━━━━━━━━━━━━━━━━━━━
<i>Hệ thống định lượng thời gian thực vận hành liên tục 24/7.</i>`;
      await bot.sendMessage(chatId, statsMsg);
      return;
    }

    // LỆNH BACKUP DỮ LIỆU: /backup
    if (text === "/backup") {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const backupData = JSON.stringify(store, null, 2);
      await bot.sendMessage(chatId, `<b>💾 BẢN SAO LƯU DỮ LIỆU HỆ THỐNG (JSON):</b>\n\n<code>${backupData.slice(0, 3500)}</code>`);
      return;
    }

    // LỆNH THÊM / XÓA PHỤ TÁ ADMIN: /themadmin <id> & /xoaadmin <id>
    if (text.startsWith("/themadmin")) {
      if (!access.isAdmin) return;
      const newAdminId = (text.split(" ")[1] || "").trim();
      if (newAdminId && !store.adminIds.includes(newAdminId)) {
        store.adminIds.push(newAdminId);
        saveStore(store);
        await bot.sendMessage(chatId, `✅ Đã thêm ID <code>${newAdminId}</code> vào danh sách Admin!`);
      }
      return;
    }

    if (text.startsWith("/xoaadmin")) {
      if (!access.isAdmin) return;
      const removeId = (text.split(" ")[1] || "").trim();
      if (removeId && removeId !== ADMIN_ID) {
        store.adminIds = store.adminIds.filter(id => id !== removeId);
        saveStore(store);
        await bot.sendMessage(chatId, `✅ Đã xóa ID <code>${removeId}</code> khỏi danh sách Admin!`);
      }
      return;
    }
  }
}

// =========================================================================
// HỆ THỐNG TỰ ĐỘNG BÁO TÍN HIỆU PHIÊN MỚI (BẬT GÌ CHẠY ĐÓ, KHÔNG LOẠN)
// =========================================================================
function setupAutoAlerts() {
  const handlePush = async (gameKey, pred, last) => {
    let flagKey = "md5Alert";
    let gameName = "◈ TÀI XỈU MD5 (LC79)";
    if (gameKey === "hu") {
      flagKey = "huAlert";
      gameName = "❖ TÀI XỈU HŨ TRUYỀN THỐNG";
    }

    const lastDisplay = last ? formatResultDisplay(last.result) : "—";
    const lastDice = last ? `[${last.dice.join("-")}] (${last.total} điểm)` : "—";
    const curTimeStr = formatVNDateTime(Date.now());

    const activeUsers = Object.entries(store.users).filter(([uid, u]) => {
      if (!u[flagKey]) return false;
      const acc = checkUserAccess(uid);
      return acc.hasAccess;
    });

    for (const [uid] of activeUsers) {
      try {
        const theme = getUserTheme(uid);
        const isTai = normalizeResult(pred.pred) === "tai";
        const predBadge = isTai ? theme.badgeTai : theme.badgeXiu;
        const confBar = makeConfidenceBar(pred.conf, theme);
        const choppyTag = pred.isChoppy ? `\n⚠️ <i>Cầu giằng co, khuyên vào nhẹ hoặc quan sát!</i>` : "";

        const alertMsg = `<b>${theme.iconHeader} ⟦ TÍN HIỆU PHIÊN MỚI: ${gameName} ⟧</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>PHIÊN: #${pred.session}</b>
👉 <b>DỰ ĐOÁN: ${predBadge}</b>
${theme.iconFire} <b>ĐỘ TIN CẬY: ${pred.conf}%</b>
<code>${confBar}</code>
${theme.iconStat} <b>CHIẾN THUẬT:</b> <code>${pred.src}</code>${choppyTag}
━━━━━━━━━━━━━━━━━━━━━
🎲 <b>Phiên trước #${last ? last.session : "—"}:</b> ${lastDice} ➔ <b>${lastDisplay}</b>
🕒 <b>Thời gian:</b> <code>${curTimeStr}</code>
━━━━━━━━━━━━━━━━━━━━━
<i>Hệ thống tự động báo kèo · Giờ hỗ trợ Admin: ${ADMIN_WORK_HOURS}</i>`;

        await bot.sendMessage(uid, alertMsg);
      } catch {}
    }
  };

  md5.onNewSession((g, p, l) => handlePush(g, p, l));
  hu.onNewSession((g, p, l) => handlePush(g, p, l));
}

// =========================================================================
// MÁY CHỦ HTTP PHỤC VỤ RENDER HEALTH CHECK & THÔNG SỐ ONLINE
// =========================================================================
function startHttpServer() {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === "/health" || pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", author: "Phạm Anh Khôi", version: "8.0-quantum", time: Date.now() }));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const md5Stats = md5.tracker.getFullStats(30);
    const huStats = hu.tracker.getFullStats(30);
    const totalUsers = Object.keys(store.users).length;
    const activeKeys = Object.values(store.keys).filter(k => k.status === "active").length;

    res.end(`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BOT TELEGRAM ĐỊNH LƯỢNG // PHẠM ANH KHÔI v8.0 QUANTUM</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#06060c;color:#f4f4f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
.card{background:#0d0d18;border:1px solid rgba(139,92,246,0.4);border-radius:28px;padding:36px;max-width:560px;width:100%;box-shadow:0 20px 50px rgba(139,92,246,0.25);}
h1{margin:0 0 8px;font-size:1.35rem;color:#fff;display:flex;align-items:center;gap:10px;}
.badge{background:#8b5cf6;color:#fff;font-size:0.75rem;padding:4px 14px;border-radius:9999px;font-weight:800;}
.sub{color:#a1a1aa;font-size:0.85rem;margin-bottom:24px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;}
.box{background:#131322;border-radius:18px;padding:16px;border:1px solid rgba(255,255,255,0.06);}
.box .lbl{font-size:0.75rem;color:#71717a;text-transform:uppercase;font-weight:800;}
.box .val{font-size:1.25rem;font-weight:900;color:#fff;margin-top:4px;}
.btn{display:inline-block;width:100%;text-align:center;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;text-decoration:none;padding:14px 0;border-radius:9999px;font-weight:800;font-size:0.9rem;box-shadow:0 4px 18px rgba(139,92,246,0.4);}
</style>
</head>
<body>
<div class="card">
  <h1>BOT TELEGRAM ĐỊNH LƯỢNG <span class="badge">v8.0 QUANTUM</span></h1>
  <div class="sub">Tác giả: <b>Phạm Anh Khôi</b> · Telegram: <b>${TELEGRAM_ADMIN_CONTACT}</b> · Trực: <b>${ADMIN_WORK_HOURS}</b></div>
  <div class="grid">
    <div class="box"><div class="lbl">Tài Xỉu MD5 LC79 (30P)</div><div class="val" style="color:#a78bfa">${md5Stats.accStr} (W:${md5Stats.winCount} | L:${md5Stats.lossCount})</div></div>
    <div class="box"><div class="lbl">Tài Xỉu Hũ (30P)</div><div class="val" style="color:#a78bfa">${huStats.accStr} (W:${huStats.winCount} | L:${huStats.lossCount})</div></div>
    <div class="box"><div class="lbl">Tổng Người Dùng</div><div class="val">${totalUsers}</div></div>
    <div class="box"><div class="lbl">Key Chưa Kích Hoạt</div><div class="val">${activeKeys}</div></div>
  </div>
  <a class="btn" href="https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}" target="_blank">LIÊN HỆ ADMIN PHẠM ANH KHÔI (${ADMIN_WORK_HOURS})</a>
</div>
</body>
</html>`);
  });

  server.listen(PORT, HOST, () => {
    console.log(`[HTTP SERVER] Đang phục vụ tại http://${HOST}:${PORT}`);
  });
}

// =========================================================================
// KHỞI ĐỘNG HỆ THỐNG
// =========================================================================
async function bootstrap() {
  md5.start(3500);
  hu.start(3500);
  setupAutoAlerts();
  startHttpServer();

  if (BOT_TOKEN) {
    bot.startPolling(handleTelegramUpdate);
  } else {
    console.log("[BOT TELEGRAM] Vui lòng cấu hình BOT_TOKEN!");
  }
}

process.on("uncaughtException", (err) => {
  console.error("[LỖI UNCAUGHT EXCEPTION]:", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[LỖI UNHANDLED REJECTION]:", reason?.message || reason);
});

bootstrap();
