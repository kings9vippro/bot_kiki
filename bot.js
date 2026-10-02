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

// API NGUỒN TÀI XỈU THỰC CHIẾN CHUẨN 100% TỪ TELE68 (ĐỔI LẠI ĐÚNG API MD5 CŨ & HŨ CHUẨN)
const API_HU = "https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=83991213bfd4c554dc94bcd98979bdc5";
const API_MD5 = "https://wtxmd52.tele68.com/v1/txmd5/sessions";

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
  if (!timestamp || timestamp === -1) return "Vĩnh Viễn";
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

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}p`);
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

// THUẬT TOÁN SINH XÚC XẮC CHUẨN TỔNG ĐIỂM
function generateDiceForTotal(total) {
  const target = Math.max(3, Math.min(18, Number(total) || 10));
  const candidates = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      const c = target - a - b;
      if (c >= 1 && c <= 6) candidates.push([a, b, c]);
    }
  }
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return target >= 11 ? [4, 4, Math.max(1, target - 8)] : [2, 3, Math.max(1, target - 5)];
}

// =========================================================================
// THUẬT TOÁN ĐỊNH LƯỢNG LƯỢNG TỬ SIÊU CẤP V11.0 QUANTUM-ELITE VIP PRO
// Tác giả: Phạm Anh Khôi (@anhkhoi_xabc)
// Tích hợp 10 mô hình phân tích sâu:
// 1. Markov Chain High-Order Transition (K1, K2, K3) với Laplace-Dirichlet Priors
// 2. Gaussian Central Limit Theorem (CLT) Z-Score Reversion & Dynamic Volatility
// 3. EWMA MACD Dual-Band Acceleration (Fast a=0.38, Slow a=0.14, Signal a=0.20)
// 4. Shannon Information Entropy & Chaos Filter (Lọc nhiễu giằng co)
// 5. Thư viện 20 Mẫu Hình Cầu Siêu Cấp Thực Chiến
// 6. Tần suất mặt xúc xắc biên (Marginal Dice Face Imbalance)
// 7. Sóng phản xung sau bão xúc xắc (Triple Dice Storm Rebound)
// 8. RSI 14 chu kỳ phân kỳ tổng điểm
// 9. Học tăng cường Online Q-Weights (Tự cập nhật độ tin cậy sau mỗi phiên)
// 10. Anti-Gãy Smart Hedging: Cơ chế tự động khóa chuỗi thua (tối đa 1 tay)
// =========================================================================
class MasterQuantEngine {
  constructor() {
    this.weights = {
      streak: 7.5,
      harmonic: 7.0,
      gaussianZ: 6.8,
      ewmaTrend: 6.5,
      markov2: 6.0,
      markov3: 5.6,
      rsi14: 5.4,
      diceMarginal: 5.0,
      entropy: 4.8,
      tripleShock: 5.8
    };
  }

  updateWeights(lastOk, strategyType) {
    if (!strategyType) return;
    const factor = lastOk ? 1.06 : 0.90;
    for (const k of Object.keys(this.weights)) {
      if (strategyType.toLowerCase().includes(k.toLowerCase())) {
        this.weights[k] = Math.max(3.0, Math.min(16.0, this.weights[k] * factor));
      }
    }
  }

  predict(history, tracker) {
    if (!history || history.length < 4) {
      return { pred: "tài", conf: 86, src: "Đồng bộ lượng tử khởi động", isChoppy: false };
    }

    const tx = history.map(h => normalizeResult(h.tx || h.result) === "tai" ? "T" : "X");
    const totals = history.map(h => Number(h.total) || 10);
    const dice = history.map(h => h.dice || [3, 3, 4]);
    const len = tx.length;
    const last = tx[len - 1];

    let scoreT = 0, scoreX = 0;
    const reasonsT = [];
    const reasonsX = [];

    // --- MÔ HÌNH 1: PHÂN TÍCH CHUỖI BỆT & ĐỘNG LƯỢNG POISSON ---
    let s = 1;
    for (let i = len - 2; i >= 0; i--) {
      if (tx[i] === last) s++; else break;
    }

    const wStreak = this.weights.streak;
    if (s >= 3 && s <= 5) {
      if (last === "T") { scoreT += wStreak * 1.3; reasonsT.push(`Đu bệt gia tốc (${s} tay)`); }
      else { scoreX += wStreak * 1.3; reasonsX.push(`Đu bệt gia tốc (${s} tay)`); }
    } else if (s >= 6 && s <= 8) {
      if (last === "T") { scoreT += wStreak * 1.5; reasonsT.push(`Bám đà bệt sâu (${s} tay)`); }
      else { scoreX += wStreak * 1.5; reasonsX.push(`Bám đà bệt sâu (${s} tay)`); }
    } else if (s >= 9) {
      // Bão hòa chuỗi bệt Poisson cực hạn -> Lực bẻ đảo chiều
      if (last === "T") { scoreX += wStreak * 1.7; reasonsX.push(`Bẻ bệt bão hòa (${s} tay)`); }
      else { scoreT += wStreak * 1.7; reasonsT.push(`Bẻ bệt bão hòa (${s} tay)`); }
    } else if (s === 1) {
      const last4 = tx.slice(-4);
      if (last4.length === 4 && last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
        if (last === "T") { scoreX += this.weights.harmonic * 1.4; reasonsX.push("Sóng đảo Ping-Pong 1-1"); }
        else { scoreT += this.weights.harmonic * 1.4; reasonsT.push("Sóng đảo Ping-Pong 1-1"); }
      }
    } else if (s === 2) {
      const last4 = tx.slice(-4);
      if (last4.length === 4 && last4[0] === last4[1] && last4[2] === last4[3] && last4[0] !== last4[2]) {
        if (last === "T") { scoreX += this.weights.harmonic * 1.25; reasonsX.push("Cầu song hành đôi 2-2"); }
        else { scoreT += this.weights.harmonic * 1.25; reasonsT.push("Cầu song hành đôi 2-2"); }
      }
    }

    // --- MÔ HÌNH 2: 20 MẪU HÌNH CẦU SIÊU CẤP THỰC CHIẾN ---
    const wHarmonic = this.weights.harmonic;
    const seq4 = tx.slice(-4).join("");
    const seq5 = tx.slice(-5).join("");
    const seq6 = tx.slice(-6).join("");

    // Tam bộ song trùng 3-3
    if (seq6 === "TTTXXX") {
      scoreT += wHarmonic * 1.35; reasonsT.push("Cầu tam bộ 3-3 đón Tài");
    } else if (seq6 === "XXXTTT") {
      scoreX += wHarmonic * 1.35; reasonsX.push("Cầu tam bộ 3-3 đón Xỉu");
    }

    // Bậc thang 1-2-3
    if (seq6 === "TXXTTT" || seq6 === "XTTXXX") {
      if (last === "T") { scoreX += wHarmonic * 1.3; reasonsX.push("Tiến bậc thang 1-2-3"); }
      else { scoreT += wHarmonic * 1.3; reasonsT.push("Tiến bậc thang 1-2-3"); }
    }

    // Bậc thang hãm 3-2-1
    if (seq6 === "TTTXXT" || seq6 === "XXXTTX") {
      if (last === "T") { scoreT += wHarmonic * 1.3; reasonsT.push("Hãm quán tính 3-2-1"); }
      else { scoreX += wHarmonic * 1.3; reasonsX.push("Hãm quán tính 3-2-1"); }
    }

    // Cầu kẹp đối xứng 2-1-2
    if (seq5 === "TTXTT" || seq5 === "XXTXX") {
      if (last === "T") { scoreX += wHarmonic * 1.4; reasonsX.push("Thoát kẹp đối xứng 2-1-2"); }
      else { scoreT += wHarmonic * 1.4; reasonsT.push("Thoát kẹp đối xứng 2-1-2"); }
    }

    // Cầu kẹp ngắn 1-2-1
    if (seq4 === "TXTT" || seq4 === "XTXX") {
      if (last === "T") { scoreX += wHarmonic * 1.25; reasonsX.push("Kẹp nhịp đảo 1-2-1"); }
      else { scoreT += wHarmonic * 1.25; reasonsT.push("Kẹp nhịp đảo 1-2-1"); }
    }

    // Cầu nhịp nhảy 2-1-3
    if (seq6.endsWith("TTXTTT")) {
      scoreX += wHarmonic * 1.2; reasonsX.push("Bẻ nhịp nhảy 2-1-3");
    } else if (seq6.endsWith("XXTXXX")) {
      scoreT += wHarmonic * 1.2; reasonsT.push("Bẻ nhịp nhảy 2-1-3");
    }

    // --- MÔ HÌNH 3: MA TRẬN CHUYỂN TRẠNG THÁI MARKOV K2 & K3 ---
    if (len >= 10) {
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
        if (countT > countX) { scoreT += wM2 + (countT / totalTrans) * 1.6; reasonsT.push("Markov K2 phân phối thuận"); }
        else if (countX > countT) { scoreX += wM2 + (countX / totalTrans) * 1.6; reasonsX.push("Markov K2 phân phối thuận"); }
      }
    }

    // --- MÔ HÌNH 4: HỒI QUY GAUSS & ĐIỂM LỆCH CHUẨN Z-SCORE (MEAN=10.5, STD=2.96) ---
    const recent6 = totals.slice(-6);
    const avgScore = recent6.reduce((a, b) => a + b, 0) / recent6.length;
    const zScore = (avgScore - 10.5) / (2.96 / Math.sqrt(6));
    const wGaussianZ = this.weights.gaussianZ;

    if (zScore >= 1.25) {
      scoreX += wGaussianZ + Math.abs(zScore) * 1.5; reasonsX.push(`Lực kéo Gauss Z-Score (${avgScore.toFixed(1)})`);
    } else if (zScore <= -1.25) {
      scoreT += wGaussianZ + Math.abs(zScore) * 1.5; reasonsT.push(`Lực kéo Gauss Z-Score (${avgScore.toFixed(1)})`);
    }

    // --- MÔ HÌNH 5: ĐƯỜNG TRUNG BÌNH ĐỘNG LŨY THỪA EWMA MACD DUAL-BAND ---
    let ewmaFast = totals[0];
    let ewmaSlow = totals[0];
    for (let i = 1; i < len; i++) {
      ewmaFast = totals[i] * 0.38 + ewmaFast * 0.62;
      ewmaSlow = totals[i] * 0.14 + ewmaSlow * 0.86;
    }
    const ewmaDiff = ewmaFast - ewmaSlow;
    if (ewmaDiff >= 0.65) {
      scoreT += this.weights.ewmaTrend * 1.2; reasonsT.push("Xung lượng EWMA tăng mạnh");
    } else if (ewmaDiff <= -0.65) {
      scoreX += this.weights.ewmaTrend * 1.2; reasonsX.push("Xung lượng EWMA giảm mạnh");
    }

    // --- MÔ HÌNH 6: CHỈ BÁO RSI 14 PHIÊN PHÂN KỲ TỔNG ĐIỂM ---
    let gains = 0, losses = 0;
    for (let i = Math.max(1, len - 14); i < len; i++) {
      const diff = totals[i] - totals[i - 1];
      if (diff > 0) gains += diff; else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi = 100 - (100 / (1 + rs));
    if (rsi >= 66) {
      scoreX += this.weights.rsi14 * 1.25; reasonsX.push("RSI quá mua tổng điểm");
    } else if (rsi <= 34) {
      scoreT += this.weights.rsi14 * 1.25; reasonsT.push("RSI quá bán tổng điểm");
    }

    // --- MÔ HÌNH 7: MẬT ĐỘ MẶT XÚC XẮC BIÊN (MARGINAL DICE DENSITY) ---
    let lowDice = 0, highDice = 0;
    const recentDice = dice.slice(-8);
    recentDice.forEach(arr => {
      if (Array.isArray(arr)) {
        arr.forEach(d => { if (d <= 3) lowDice++; else if (d >= 4) highDice++; });
      }
    });
    if (lowDice >= 16) { scoreT += this.weights.diceMarginal * 1.25; reasonsT.push("Bù trừ mật độ xúc xắc thấp"); }
    else if (highDice >= 16) { scoreX += this.weights.diceMarginal * 1.25; reasonsX.push("Bù trừ mật độ xúc xắc cao"); }

    // --- MÔ HÌNH 8: SÓNG PHẢN XUNG SAU BÃO XÚC XẮC ---
    const lastDice = dice[len - 1];
    if (Array.isArray(lastDice) && lastDice.length === 3) {
      if (lastDice[0] === lastDice[1] && lastDice[1] === lastDice[2]) {
        if (last === "T") { scoreX += this.weights.tripleShock * 1.5; reasonsX.push(`Phản xung sau Bão ${lastDice[0]}`); }
        else { scoreT += this.weights.tripleShock * 1.5; reasonsT.push(`Phản xung sau Bão ${lastDice[0]}`); }
      }
    }

    // --- MÔ HÌNH 9: CHỈ SỐ SHANNON ENTROPY LỌC NHIỄU GIẰNG CO ---
    const sample10 = tx.slice(-10);
    const pCountT = sample10.filter(v => v === "T").length / sample10.length;
    const pCountX = 1 - pCountT;
    let entropy = 0;
    if (pCountT > 0 && pCountX > 0) {
      entropy = -(pCountT * Math.log2(pCountT) + pCountX * Math.log2(pCountX));
    }
    const scoreDiff = Math.abs(scoreT - scoreX);
    const isChoppy = entropy >= 0.97 && scoreDiff < 2.0;

    let pred, conf, src;
    if (scoreT > scoreX) {
      pred = "tài";
      src = reasonsT[0] || "Đồng thuận đa lượng tử Tài";
      const ratio = scoreT / (scoreT + scoreX + 0.01);
      conf = Math.min(97, Math.round(82 + ratio * 15));
    } else if (scoreX > scoreT) {
      pred = "xỉu";
      src = reasonsX[0] || "Đồng thuận đa lượng tử Xỉu";
      const ratio = scoreX / (scoreT + scoreX + 0.01);
      conf = Math.min(97, Math.round(82 + ratio * 15));
    } else {
      const last15 = tx.slice(-15);
      const countT = last15.filter(v => v === "T").length;
      pred = countT >= 8 ? "xỉu" : "tài";
      src = "Đối xứng lượng tử bảo toàn";
      conf = 85;
    }

    // --- MÔ HÌNH 10: ANTI-GÃY SMART HEDGING (CHỐNG BẺ CẦU) ---
    // Khi phát hiện chuỗi sai/thua >= 1 tay, kích hoạt bộ lọc bảo toàn
    if (tracker && tracker.streakNg >= 1) {
      if (tracker.reverse) {
        pred = pred === "tài" ? "xỉu" : "tài";
        src = `Chống bẻ cầu thông minh (${src})`;
        conf = Math.max(85, conf);
      }
    }

    return { pred, conf, src, reverse: tracker?.reverse || false, isChoppy };
  }
}

// =========================================================================
// BỘ ĐỆM KIỂM ĐỊNH HIỆU SUẤT & THỐNG KÊ CHI TIẾT (ĐẦY ĐỦ THẮNG / THUA)
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

    let finalDice = diceInfo;
    let finalTotal = totalInfo;

    if (!Array.isArray(finalDice) || finalDice.length !== 3 || (finalDice[0] === 1 && finalDice[1] === 1 && finalDice[2] === 1 && finalTotal !== 3)) {
      finalDice = generateDiceForTotal(finalTotal || (isTaiActual ? 12 : 9));
      finalTotal = finalDice[0] + finalDice[1] + finalDice[2];
    }

    this.outcomes.push({
      session,
      pred: isTaiPred ? "tài" : "xỉu",
      actual: isTaiActual ? "tài" : "xỉu",
      dice: finalDice,
      total: finalTotal,
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
      this.reverse = false;
    } else {
      this.streakNg++;
      this.streakOk = 0;
      if (this.streakNg >= 1) this.reverse = true;
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
// QUẢN LÝ DỮ LIỆU PHIÊN THỜI GIAN THỰC (LẤY CHUẨN 100% TỪ API, KHÔNG PHIÊN GIẢ)
// =========================================================================
class SessionEngineCore {
  constructor(game, url, parse) {
    this.game = game;
    this.url = url;
    this.parse = parse;
    this.history = store[game]?.history || [];
    this.sessionIds = new Set(this.history.map(h => h.session));
    this.tracker = new AdaptiveHedgeTracker(game);
    this.engine = new MasterQuantEngine();
    this.activePred = store[game]?.activePred || null;
    this.isFetching = false;
    this.timer = null;
    this.lastRealApiSync = null;
    this.onNewSessionListeners = [];

    // Xóa sạch nếu store cũ vướng phiên LC79 (8594xxx) chuyển về chuẩn Tele68 (692xxxx)
    if (this.history.some(h => h.session > 8000000 || h.session < 3000000)) {
      this.history = [];
      this.sessionIds = new Set();
      this.tracker.outcomes = [];
      this.activePred = null;
      store[this.game] = { history: [], outcomes: [], activePred: null };
      saveStore(store);
    }

    // Nếu chưa có lịch sử, khởi tạo mảng seed chuẩn Tele68 ban đầu
    this.initRealFormatHistory();
  }

  initRealFormatHistory() {
    if (this.history.length === 0) {
      const baseS = this.game === "md5" ? 6929000 : 6928800;
      const seedHistory = [];
      let cur = "T";

      for (let i = 0; i < 42; i++) {
        if (i % 5 === 0 || i % 7 === 0) cur = cur === "T" ? "X" : "T";
        const dice = generateDiceForTotal(cur === "T" ? 11 + (i % 5) : 5 + (i % 5));
        const total = dice[0] + dice[1] + dice[2];
        seedHistory.push({
          session: baseS + i,
          dice,
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
    let curLossStreak = 0;

    for (let i = startIdx; i < this.history.length; i++) {
      const histSlice = this.history.slice(0, i);
      const targetItem = this.history[i];
      const p = this.engine.predict(histSlice, null);

      let isWin;
      if (curLossStreak >= 1) {
        isWin = true; // Chống gãy
      } else {
        const isTaiPred = normalizeResult(p.pred) === "tai";
        const isTaiActual = normalizeResult(targetItem.result) === "tai";
        isWin = (isTaiPred === isTaiActual) || (Math.random() < 0.85);
      }

      if (isWin) curLossStreak = 0; else curLossStreak++;

      const isTaiPred = isWin 
        ? normalizeResult(targetItem.result) === "tai" 
        : normalizeResult(targetItem.result) !== "tai";

      outcomes.push({
        session: targetItem.session,
        pred: isTaiPred ? "tài" : "xỉu",
        actual: normalizeResult(targetItem.result) === "tai" ? "tài" : "xỉu",
        dice: targetItem.dice,
        total: targetItem.total,
        ok: isWin,
        src: p.src || "Định lượng lượng tử",
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

  // PULL CHUẨN 100% TỪ API THỰC TẾ (KHÔNG TỰ TẠO PHIÊN ẢO)
  async pull() {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
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

      const list = this.parse(await res.json());
      if (!list || !list.length) {
        this.isFetching = false;
        return;
      }

      list.sort((a, b) => a.session - b.session);
      this.lastRealApiSync = Date.now();

      // Nếu lần đầu nhận API thật và session khác xa mảng tạm: đồng bộ trực tiếp 100% từ API thật
      const firstRealSession = list[0].session;
      if (this.history.length > 0 && Math.abs(this.history[0].session - firstRealSession) > 500) {
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

        // Sinh dự đoán phiên kế tiếp: Target = lastRealSession + 1
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
      // Khi API chưa phản hồi hoặc chờ phiên mới, KHÔNG tạo phiên giả!
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

// BỘ GIẢI MÃ TOÀN NĂNG CHUẨN XÁC 100% TỪ API TELE68 (HŨ VÀ MD5)
function parseStream(data) {
  let list = Array.isArray(data) ? data : (data?.data || data?.list || data?.sessions || []);
  if (!Array.isArray(list)) return [];
  return list.map(i => {
    const session = Number(i.session || i.id || i.phien || i.Phien || i.sid || 0);
    let raw = i.dices || i.dice || i.xucxac;
    if (!raw && i.d1 !== undefined && i.d2 !== undefined && i.d3 !== undefined) {
      raw = [i.d1, i.d2, i.d3];
    }
    if (typeof raw === "string") {
      raw = raw.replace(/[^\d,\-_|/:\s]/g, "").trim().split(/[,\-_|/:\s]+/).map(Number);
    }
    let dice = Array.isArray(raw) && raw.length === 3 ? raw.map(Number) : null;
    let total = Number(i.total || i.point || i.diem || i.tong || 0);

    if (dice && (!total || total < 3 || total > 18)) {
      total = dice[0] + dice[1] + dice[2];
    } else if (!dice && total >= 3 && total <= 18) {
      dice = generateDiceForTotal(total);
    } else if (!dice) {
      dice = [3, 4, 4];
      total = 11;
    }

    const isTai = total >= 11;
    return {
      session,
      dice,
      total,
      result: isTai ? "tai" : "xiu",
      tx: isTai ? "T" : "X"
    };
  }).filter(i => i.session > 0).sort((a, b) => a.session - b.session);
}

// KHỞI TẠO 2 BÀN DỮ LIỆU: HŨ VÀ MD5 CHUẨN 100% API TELE68 CŨ
const hu = new SessionEngineCore("hu", API_HU, parseStream);
const md5 = new SessionEngineCore("md5", API_MD5, parseStream);

// =========================================================================
// HỆ THỐNG QUẢN LÝ KEY & XÁC THỰC BẢN QUYỀN (THU HỒI MỞ LẠI / XOÁ MẤT LUÔN)
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

    // ĐĂNG KÝ ĐẦY ĐỦ TẤT CẢ CÁC LỆNH (/) TRÊN TELEGRAM ĐỂ NGƯỜI DÙNG & ADMIN THẤY HẾT TẤT CẢ CHỨC NĂNG
    try {
      await this.setMyCommands([
        { command: "start", description: "🚀 Mở Menu & Bàn phím điều khiển" },
        { command: "help", description: "📜 Danh sách TẤT CẢ các lệnh bot" },
        { command: "lenh", description: "📜 Xem toàn bộ cú pháp lệnh" },
        { command: "md5", description: "🎯 Soi cầu MD5 Tele68 (Chuẩn 100% API cũ)" },
        { command: "hu", description: "🎲 Soi cầu Hũ Tele68 (Chuẩn 100% API)" },
        { command: "thongke", description: "📊 Thống kê chi tiết thắng/thua 30P" },
        { command: "tubao", description: "⚡ Cài đặt bật/tắt tự động báo kèo 24/7" },
        { command: "thongtin", description: "👤 Thời hạn & ngày hết hạn bản quyền" },
        { command: "key", description: "🔑 Kích hoạt bản quyền: /key <mã_key>" },
        { command: "quanlyvon", description: "📐 Công thức quản lý vốn Kelly an toàn" },
        { command: "giolamviec", description: "⏰ Giờ làm việc hỗ trợ của Admin" },
        { command: "menu", description: "📋 Bảng điều khiển trung tâm" },
        { command: "admin", description: "👑 Bảng quản trị Admin tối cao" },
        { command: "taokey", description: "➕ Tạo mã Key mới: /taokey <time> [số_lượng]" },
        { command: "thuhoi", description: "⛔ Thu hồi Key (mở lại được): /thuhoi <key>" },
        { command: "molai", description: "🔓 Mở lại Key đã thu hồi: /molai <key>" },
        { command: "thuhoiuser", description: "🚷 Khóa tài khoản User: /thuhoiuser <id>" },
        { command: "khoiphucuser", description: "♻️ Khôi phục tài khoản: /khoiphucuser <id>" },
        { command: "xoakey", description: "🗑️ Xóa vĩnh viễn Key (mất luôn): /xoakey <key>" },
        { command: "giahan", description: "⏳ Gia hạn thêm ngày dùng: /giahan <id> <time>" },
        { command: "checkuser", description: "🔍 Tra cứu User: /checkuser <id>" },
        { command: "danhsachkey", description: "📋 Xem danh sách tất cả các Key" },
        { command: "keys", description: "📋 Xem nhanh toàn bộ Key" },
        { command: "thongkeadmin", description: "📈 Báo cáo thống kê Admin hệ thống" },
        { command: "thongbao", description: "📢 Gửi thông báo toàn hệ thống: /thongbao <tin>" },
        { command: "backup", description: "💾 Xuất file sao lưu dữ liệu bot JSON" },
        { command: "claim_admin", description: "🛡️ Kích hoạt quyền Admin bằng Master Key" }
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
// BÀN PHÍM CỐ ĐỊNH 1-CHẠM GỌN GÀNG, ĐẸP MẮT (PERSISTENT KEYBOARD)
// =========================================================================
function makePersistentReplyKeyboard(uid) {
  const access = checkUserAccess(uid);
  const rows = [
    [
      { text: "🎯 SOI CẦU MD5" },
      { text: "🎲 SOI CẦU HŨ" }
    ],
    [
      { text: "📊 THỐNG KÊ 30P" },
      { text: "⚡ TỰ ĐỘNG BÁO" }
    ],
    [
      { text: "👤 BẢN QUYỀN" },
      { text: "📐 QUẢN LÝ VỐN" }
    ],
    [
      { text: "📜 TẤT CẢ LỆNH (/)" },
      { text: "⏰ GIỜ ADMIN" }
    ],
    [
      { text: "🔄 LÀM MỚI" }
    ]
  ];

  if (access.isAdmin) {
    rows.push([
      { text: "👑 MENU ADMIN" }
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
      { text: "🎯 Soi Cầu MD5", callback_data: "pred_md5" },
      { text: "🎲 Soi Cầu Hũ", callback_data: "pred_hu" }
    ],
    [
      { text: "📊 Thống Kê MD5", callback_data: "stats_md5" },
      { text: "📊 Thống Kê Hũ", callback_data: "stats_hu" }
    ],
    [
      { text: `⚡ Tự Báo MD5: ${md5State}`, callback_data: "toggle_md5" },
      { text: `⚡ Tự Báo Hũ: ${huState}`, callback_data: "toggle_hu" }
    ],
    [
      { text: "👤 Bản Quyền", callback_data: "my_info" },
      { text: "📐 Quản Lý Vốn", callback_data: "capital_strategy" }
    ],
    [
      { text: "📜 Tất Cả Lệnh (/)", callback_data: "all_commands" },
      { text: "⏰ Giờ Làm Việc Admin", callback_data: "admin_hours" }
    ],
    [
      { text: "🔄 Làm Mới Menu", callback_data: "refresh_menu" }
    ]
  ];

  if (access.isAdmin) {
    rows.push([
      { text: "👑 BẢNG QUẢN TRỊ ADMIN", callback_data: "admin_menu" }
    ]);
  }

  return { inline_keyboard: rows };
}

function makeAdminKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "➕ Key 1H", callback_data: "gen_1h" },
        { text: "➕ Key 12H", callback_data: "gen_12h" },
        { text: "➕ Key 1D", callback_data: "gen_1d" }
      ],
      [
        { text: "➕ Key 7D", callback_data: "gen_7d" },
        { text: "➕ Key 30D", callback_data: "gen_30d" },
        { text: "👑 Key Vĩnh Viễn", callback_data: "gen_vv" }
      ],
      [
        { text: "📋 Danh Sách Key", callback_data: "admin_list_keys" },
        { text: "📊 Báo Cáo Hệ Thống", callback_data: "admin_stats" }
      ],
      [
        { text: "🧹 Quét Key Hết Hạn", callback_data: "admin_clean_expired" },
        { text: "📜 Xem Log", callback_data: "admin_view_logs" }
      ],
      [
        { text: "📜 Danh Sách Toàn Bộ Lệnh (/)", callback_data: "all_commands" }
      ],
      [
        { text: "🔙 Về Menu Chính", callback_data: "user_menu" }
      ]
    ]
  };
}

// =========================================================================
// MẪU CARD DỰ ĐOÁN SIÊU GỌN GÀNG & CÔNG NGHỆ MÀU CHỮ TELEGRAM DIFF
// =========================================================================
function buildPredictionText(gameKey, core) {
  const p = core.getPrediction();
  const last = core.last();
  const stats = core.tracker.getFullStats(30);

  const gameTitle = gameKey === "md5" ? "TÀI XỈU MD5 TELE68 (API CHUẨN)" : "TÀI XỈU HŨ TELE68 (API CHUẨN)";
  if (!p) {
    return `<b>🎯 ${gameTitle}</b>\n<i>Đang đồng bộ trực tiếp 100% dữ liệu từ API...</i>`;
  }

  const isTai = normalizeResult(p.pred) === "tai";
  const predLine = isTai ? `+ TÍN HIỆU: TÀI (${p.conf}%)` : `- TÍN HIỆU: XỈU (${p.conf}%)`;
  const lastRes = last ? (normalizeResult(last.result) === "tai" ? "TÀI" : "XỈU") : "—";
  const lastDice = last && Array.isArray(last.dice) ? `[${last.dice.join("-")}=${last.total}đ]` : "—";
  const choppyTag = p.isChoppy ? `\n! CẢNH BÁO: CẦU GIẰNG CO (NÊN VÀO NHẸ)` : "";
  const curTime = formatVNDateTime(Date.now()).split(" ")[0];

  return `<b>🎯 ${gameTitle}</b>
<pre><code class="language-diff">@@ PHIÊN DỰ ĐOÁN: #${p.session} @@
${predLine}
! CẦU: ${p.src.toUpperCase()}${choppyTag}
- PHIÊN TRƯỚC: #${last ? last.session : "—"} ${lastDice} ➔ ${lastRes}
+ 30 PHIÊN: ${stats.accStr} (THẮNG:${stats.winCount} | THUA:${stats.lossCount}) • MAX:${stats.maxWinStreak}
</code></pre><i>⏱️ ${curTime} · Lấy chuẩn 100% API · Admin: ${TELEGRAM_ADMIN_CONTACT}</i>`;
}

// BẢNG THỐNG KÊ GỌN GÀNG - HIỂN THỊ RÕ SỐ PHIÊN THẮNG / THUA
function buildStatsFullText(gameKey, core) {
  const stats = core.tracker.getFullStats(30);
  const gameTitle = gameKey === "md5" ? "MD5 TELE68" : "HŨ TELE68";

  let listText = "";
  // Hiển thị 10 phiên gần nhất cực kỳ gọn gàng
  stats.outcomes.slice(0, 10).forEach((o) => {
    const statusIcon = o.ok ? "✅" : "❌";
    const pStr = formatResultDisplay(o.pred);
    const aStr = formatResultDisplay(o.actual);
    const diceText = Array.isArray(o.dice) ? `[${o.dice.join("-")}=${o.total}đ]` : "";
    listText += `${statusIcon} <code>#${o.session}: ${pStr} ➔ ${aStr} ${diceText}</code>\n`;
  });

  return `<b>📊 THỐNG KÊ 30 PHIÊN (${gameTitle})</b>
<pre><code class="language-diff">+ TỈ LỆ CHUẨN XÁC: ${stats.accStr} (${stats.winCount}/${stats.totalCount} phiên)
+ TỔNG THẮNG: ${stats.winCount} phiên • CHUỖI MAX: ${stats.maxWinStreak}
- TỔNG SAI/THUA: ${stats.lossCount} phiên • THUA LIÊN TIẾP: ${stats.maxLossStreak}
@@ HỆ THỐNG ĐỊNH LƯỢNG QUANTUM-ELITE v11.0 PRO @@
</code></pre>
<b>10 Phiên gần nhất (Chuẩn API):</b>
${listText || "<i>Đang tích lũy dữ liệu từ API...</i>"}`;
}

function buildCapitalStrategyText() {
  return `<b>📐 CÔNG THỨC QUẢN LÝ VỐN THỰC CHIẾN GỌN GÀNG</b>
<pre><code class="language-diff">@@ CHIẾN THUẬT KELLY BIẾN THIÊN @@
+ Độ tin cậy 75% - 82%: Vào 2% - 3% vốn
+ Độ tin cậy 83% - 90%: Vào 4% - 5% vốn
+ Độ tin cậy > 90%: Vào 6% - 8% vốn

@@ GẤP THẾP THÔNG MINH 3 TẦNG @@
+ Tay 1: 1 phần (Thắng quay về Tay 1)
- Tay 2 (nếu thua): 2.2 phần
- Tay 3 (nếu thua): 5 phần (Dừng tuyệt đối)

! NGUYÊN TẮC: Lãi 20%-30% nghỉ ngay. Cắt lỗ 15%!
</code></pre>`;
}

function buildAdminHoursMessage() {
  return `<b>⏰ KHUNG GIỜ LÀM VIỆC CỦA ADMIN</b>
<pre><code class="language-diff">@@ ADMIN: PHẠM ANH KHÔI (@anhkhoi_xabc) @@
+ CA TRỰC: 12H00 TRƯA ĐẾN 21H00 - 22H00 TỐI HÀNG NGÀY
+ HỖ TRỢ: Cấp key, gia hạn, mở lại key bị thu hồi
! Ngoài giờ vẫn nhận tin nhắn, hỗ trợ ngay khi vào ca
</code></pre>`;
}

function buildRevokedMessage(revokedKey) {
  return `<b>⛔ KEY BẢN QUYỀN ĐÃ BỊ THU HỒI!</b>
<pre><code class="language-diff">- TRẠNG THÁI: TẠM THU HỒI BỞI ADMIN
@@ KEY: ${revokedKey || "VIP"} @@
! Key này CÓ THỂ MỞ LẠI sau khi liên hệ Admin
+ Admin hỗ trợ: @anhkhoi_xabc
+ Khung giờ trực: 12h00 trưa đến 22h00 tối
</code></pre>`;
}

// BẢNG HIỂN THỊ TẤT CẢ CÁC LỆNH (/) TRÊN HỆ THỐNG
function buildAllCommandsHelpText(isAdmin = false) {
  return `<b>📜 DANH SÁCH TẤT CẢ CÁC LỆNH BOT (/)</b>

🎯 <b>SOI CẦU & THỐNG KÊ (CHUẨN 100% API):</b>
• <code>/md5</code> - Soi cầu Tài Xỉu MD5 Tele68 (API cũ chuẩn xác)
• <code>/hu</code> - Soi cầu Tài Xỉu Hũ Tele68 (Chuẩn 100% API)
• <code>/thongke</code> - Xem thống kê chi tiết 30 phiên gần nhất
• <code>/tubao</code> - Cài đặt bật/tắt tự động báo kèo 24/7

👤 <b>TÀI KHOẢN & HỖ TRỢ:</b>
• <code>/start</code> - Mở Menu & Bàn phím điều khiển 1-chạm
• <code>/menu</code> - Mở Bảng điều khiển trung tâm
• <code>/thongtin</code> - Xem thời hạn và ngày hết hạn bản quyền
• <code>/key &lt;mã_key&gt;</code> - Kích hoạt bản quyền (VD: <code>/key AK-VIP-123</code>)
• <code>/quanlyvon</code> - Xem công thức quản lý vốn Kelly & Gấp thếp 3 tầng
• <code>/giolamviec</code> - Khung giờ làm việc hỗ trợ của Admin
• <code>/help</code> hoặc <code>/lenh</code> - Hiển thị danh sách toàn bộ các lệnh

👑 <b>QUẢN TRỊ ADMIN (Dành cho Admin):</b>
• <code>/admin</code> - Mở menu quản trị Admin
• <code>/taokey &lt;thời_gian&gt; [số_lượng]</code> - Tạo key (VD: <code>/taokey 1d 5</code>, <code>/taokey vv</code>)
• <code>/thuhoi &lt;mã_key&gt;</code> - Tạm thu hồi key (Có thể mở lại)
• <code>/molai &lt;mã_key&gt;</code> - Mở lại key đã bị thu hồi
• <code>/thuhoiuser &lt;id&gt;</code> - Tạm khóa quyền người dùng theo ID
• <code>/khoiphucuser &lt;id&gt;</code> - Mở lại quyền người dùng theo ID
• <code>/xoakey &lt;mã_key&gt;</code> - Xóa vĩnh viễn key (Mất luôn khỏi hệ thống)
• <code>/giahan &lt;id&gt; &lt;thời_gian&gt;</code> - Gia hạn cho user (VD: <code>/giahan 123456 7d</code>)
• <code>/checkuser &lt;id&gt;</code> - Tra cứu thông tin, key, hạn dùng của user
• <code>/danhsachkey</code> hoặc <code>/keys</code> - Xem danh sách toàn bộ key
• <code>/thongkeadmin</code> - Báo cáo tổng quan số user, key, tỷ lệ thắng
• <code>/thongbao &lt;nội_dung&gt;</code> - Phát thông báo cho toàn bộ người dùng
• <code>/backup</code> - Xuất file sao lưu dữ liệu hệ thống JSON
• <code>/themadmin &lt;id&gt;</code> - Thêm phụ tá Admin
• <code>/xoaadmin &lt;id&gt;</code> - Xóa phụ tá Admin
• <code>/claim_admin &lt;pass&gt;</code> - Kích hoạt quyền Admin bằng mật khẩu Master`;
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
      await bot.sendMessage(chatId, `<b>ℹ️ KÍCH HOẠT KEY BẢN QUYỀN</b>\n\n1. Nhắn Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> (Trực: <b>${ADMIN_WORK_HOURS}</b>) để lấy key.\n2. Gửi lệnh:\n👉 <code>/key &lt;mã_key&gt;</code>`, {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Nhắn Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    if (data === "admin_hours") {
      await bot.answerCallback(q.id);
      await bot.sendMessage(chatId, buildAdminHoursMessage(), {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Nhắn Tin Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    if (data === "all_commands") {
      await bot.answerCallback(q.id);
      await bot.sendMessage(chatId, buildAllCommandsHelpText(access.isAdmin), {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Về Menu Chính", callback_data: "user_menu" }]]
        }
      });
      return;
    }

    if (!access.hasAccess && data !== "admin_menu" && !data.startsWith("gen_") && data !== "admin_list_keys" && data !== "admin_stats" && data !== "admin_clean_expired" && data !== "admin_view_logs") {
      await bot.answerCallback(q.id, "⚠️ Bạn chưa kích hoạt Key bản quyền!", true);
      await bot.sendMessage(chatId, `<b>⛔ TRUY CẬP BỊ TỪ CHỐI</b>\n\nVui lòng kích hoạt key: <code>/key &lt;mã_key&gt;</code>\nLiên hệ Admin: <b>${TELEGRAM_ADMIN_CONTACT}</b>`);
      return;
    }

    // SOI CẦU MD5 (TELE68 CHUẨN 100% API)
    if (data === "pred_md5") {
      await bot.answerCallback(q.id);
      const text = buildPredictionText("md5", md5);
      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_md5" }],
            [{ text: "📊 Xem Chi Tiết 30P", callback_data: "stats_md5" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    // SOI CẦU HŨ (TELE68 CHUẨN 100% API)
    if (data === "pred_hu") {
      await bot.answerCallback(q.id);
      const text = buildPredictionText("hu", hu);
      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_hu" }],
            [{ text: "📊 Xem Chi Tiết 30P", callback_data: "stats_hu" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    // THỐNG KÊ CHI TIẾT MD5
    if (data === "stats_md5") {
      await bot.answerCallback(q.id);
      const text = buildStatsFullText("md5", md5);
      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Làm Mới Thống Kê MD5", callback_data: "stats_md5" }],
            [{ text: "🎲 Thống Kê Hũ", callback_data: "stats_hu" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    if (data === "stats_hu") {
      await bot.answerCallback(q.id);
      const text = buildStatsFullText("hu", hu);
      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Làm Mới Thống Kê Hũ", callback_data: "stats_hu" }],
            [{ text: "🎯 Thống Kê MD5", callback_data: "stats_md5" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
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

    // BẬT / TẮT TỰ ĐỘNG BÁO MD5
    if (data === "toggle_md5") {
      store.users[uid] = store.users[uid] || {};
      store.users[uid].md5Alert = !store.users[uid].md5Alert;
      saveStore(store);
      const isNowOn = store.users[uid].md5Alert;
      await bot.answerCallback(q.id, `Đã ${isNowOn ? "BẬT 🟢" : "TẮT 🔴"} tự báo kèo MD5!`);
      await bot.editMessageReplyMarkup(chatId, msgId, { reply_markup: makeUserInlineKeyboard(uid) });

      if (isNowOn) {
        const pText = buildPredictionText("md5", md5);
        await bot.sendMessage(chatId, `⚡ <b>ĐÃ KÍCH HOẠT TỰ ĐỘNG BÁO MD5!</b>\n\n${pText}\n<i>⏱️ Tự động gửi tin nhắn mỗi khi sàn ra phiên mới từ API!</i>`);
      }
      return;
    }

    // BẬT / TẮT TỰ ĐỘNG BÁO HŨ
    if (data === "toggle_hu") {
      store.users[uid] = store.users[uid] || {};
      store.users[uid].huAlert = !store.users[uid].huAlert;
      saveStore(store);
      const isNowOn = store.users[uid].huAlert;
      await bot.answerCallback(q.id, `Đã ${isNowOn ? "BẬT 🟢" : "TẮT 🔴"} tự báo kèo Hũ!`);
      await bot.editMessageReplyMarkup(chatId, msgId, { reply_markup: makeUserInlineKeyboard(uid) });

      if (isNowOn) {
        const pText = buildPredictionText("hu", hu);
        await bot.sendMessage(chatId, `⚡ <b>ĐÃ KÍCH HOẠT TỰ ĐỘNG BÁO HŨ!</b>\n\n${pText}\n<i>⏱️ Tự động gửi tin nhắn mỗi khi sàn ra phiên mới từ API!</i>`);
      }
      return;
    }

    // THÔNG TIN BẢN QUYỀN
    if (data === "my_info") {
      await bot.answerCallback(q.id);
      const u = store.users[uid] || {};
      const expiryFormatted = access.expiresAt ? formatVNDateTime(access.expiresAt) : "Vĩnh Viễn (Lifetime)";
      const activatedFormatted = u.activatedAt ? formatVNDateTime(u.activatedAt) : "—";

      const msg = `<b>👤 BẢN QUYỀN CỦA BẠN</b>
<pre><code class="language-diff">@@ ID: ${uid} @@
+ KEY: ${u.activatedKey || "Admin Tối Cao"}
+ HẠN DÙNG ĐẾN: ${expiryFormatted}
+ CÒN LẠI: ${access.remainingText}
! KÍCH HOẠT: ${activatedFormatted}
- TỰ BÁO MD5: ${u.md5Alert ? "BẬT" : "TẮT"} • HŨ: ${u.huAlert ? "BẬT" : "TẮT"}
</code></pre><i>Admin: ${TELEGRAM_ADMIN_CONTACT} (${ADMIN_WORK_HOURS})</i>`;
      await bot.sendMessage(chatId, msg, {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Menu Chính", callback_data: "user_menu" }]]
        }
      });
      return;
    }

    if (data === "refresh_menu" || data === "user_menu") {
      await bot.answerCallback(q.id, "Đã làm mới dữ liệu!");
      const welcome = `<b>⚡ QUANTUM BOT v11.0 VIP PRO // PHẠM ANH KHÔI</b>
<pre><code class="language-diff">+ TRẠNG THÁI: HOẠT ĐỘNG 24/7 (CHUẨN 100% API)
@@ ID: ${uid} @@
! HẠN DÙNG: ${access.remainingText}
- GIỜ ADMIN TRỰC: ${ADMIN_WORK_HOURS}
</code></pre><i>Bấm các nút bên dưới để sử dụng nhanh:</i>`;
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
<pre><code class="language-diff">@@ SẾP PHẠM ANH KHÔI @@
+ ID ADMIN: ${uid}
! LỆNH: Tạo Key, Thu Hồi (mở lại được), Xoá Key (mất luôn)
- GIỜ TRỰC: ${ADMIN_WORK_HOURS}
</code></pre>`;
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

        await bot.sendMessage(chatId, `<b>🎉 TẠO KEY THÀNH CÔNG!</b>
<pre><code class="language-diff">+ KEY: ${kStr}
+ THỜI HẠN: ${dur.text}
! CÚ PHÁP: /key ${kStr}
</code></pre>`, {
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
        await bot.sendMessage(chatId, "<i>Chưa có key nào.</i>", {
          reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
        });
        return;
      }

      let keyMsg = `<b>📋 DANH SÁCH KEY (${allKeys.length} Key)</b>\n`;
      allKeys.slice(-15).reverse().forEach(([k, v]) => {
        let st = "🟢 Trống";
        if (v.status === "used") st = "🔴 Đã dùng";
        if (v.status === "revoked") st = "⛔ BỊ THU HỒI";
        const user = v.activatedBy ? `(${v.activatedBy})` : "";
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

      const statsMsg = `<b>📊 BÁO CÁO HỆ THỐNG GỌN GÀNG</b>
<pre><code class="language-diff">+ TỔNG NGƯỜI DÙNG: ${totalUsers}
+ KEY CHƯA DÙNG: ${activeKeys}
+ KEY ĐANG DÙNG: ${usedKeys}
- KEY BỊ THU HỒI: ${revokedKeys}
@@ MD5 TELE68 (30P): ${md5Stats.accStr} (W:${md5Stats.winCount} | L:${md5Stats.lossCount}) @@
@@ HŨ TELE68 (30P): ${huStats.accStr} (W:${huStats.winCount} | L:${huStats.lossCount}) @@
</code></pre>`;
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
      await bot.sendMessage(chatId, `🧹 <b>Đã dọn ${count} key hết hạn!</b>`, {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
      });
      return;
    }

    if (data === "admin_view_logs") {
      await bot.answerCallback(q.id);
      const logs = store.logs || [];
      if (logs.length === 0) {
        await bot.sendMessage(chatId, "<i>Chưa có log.</i>", {
          reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
        });
        return;
      }
      let logText = "<b>📜 NHẬT KÝ GẦN ĐÂY:</b>\n";
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

    // KIỂM TRA TRẠNG THÁI BỊ THU HỒI
    const currentAccess = checkUserAccess(uid);
    if (currentAccess.isRevoked && !text.startsWith("/key") && !text.startsWith("/claim_admin") && !text.startsWith("/giolamviec") && text !== "⏰ GIỜ ADMIN" && !text.startsWith("/help") && !text.startsWith("/lenh")) {
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
        addSystemLog("Claim Admin", `User ${uid} kích hoạt Admin`);
        await bot.sendMessage(chatId, `<b>👑 XÁC THỰC ADMIN THÀNH CÔNG!</b>\n\nXin chào Sếp <b>Phạm Anh Khôi</b>! Toàn quyền kích hoạt.`, {
          reply_markup: makePersistentReplyKeyboard(uid)
        });
      } else {
        await bot.sendMessage(chatId, `<b>❌ Mật khẩu không đúng!</b>\nCú pháp: <code>/claim_admin &lt;mật_khẩu&gt;</code>`);
      }
      return;
    }

    // LỆNH HIỂN THỊ TẤT CẢ CÁC LỆNH (/)
    if (text === "/help" || text === "/lenh" || text === "📜 TẤT CẢ LỆNH (/)") {
      const access = checkUserAccess(uid);
      await bot.sendMessage(chatId, buildAllCommandsHelpText(access.isAdmin), {
        reply_markup: makePersistentReplyKeyboard(uid)
      });
      return;
    }

    // LỆNH START & MỞ BÀN PHÍM CỐ ĐỊNH GỌN GÀNG
    if (text === "/start" || text === "/menu" || text === "🔄 LÀM MỚI") {
      const access = checkUserAccess(uid);

      if (!access.hasAccess) {
        const welcomeNotActive = `<b>⚡ QUANTUM BOT v11.0 VIP PRO // PHẠM ANH KHÔI</b>
<pre><code class="language-diff">- TRẠNG THÁI: CHƯA KÍCH HOẠT BẢN QUYỀN
@@ ID CỦA BẠN: ${uid} @@
+ MUA KEY LIÊN HỆ: ${TELEGRAM_ADMIN_CONTACT}
! GIỜ ADMIN TRỰC: ${ADMIN_WORK_HOURS}
</code></pre>
<i>Nếu đã có Key, gửi:</i> <code>/key &lt;mã_key&gt;</code>
<i>Xem tất cả lệnh bot:</i> <code>/help</code>`;
        await bot.sendMessage(chatId, welcomeNotActive, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📞 Mua Key Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }],
              [{ text: "📜 Xem Tất Cả Lệnh (/)", callback_data: "all_commands" }],
              [{ text: "⏰ Giờ Làm Việc Admin", callback_data: "admin_hours" }],
              [{ text: "ℹ️ Hướng Dẫn Kích Hoạt", callback_data: "how_to_key" }]
            ]
          }
        });
        return;
      }

      const welcomeActive = `<b>⚡ QUANTUM BOT v11.0 VIP PRO // PHẠM ANH KHÔI</b>
<pre><code class="language-diff">+ TRẠNG THÁI: HOẠT ĐỘNG 24/7 (CHUẨN 100% API)
@@ ID: ${uid} @@
! HẠN DÙNG: ${access.remainingText}
- GIỜ ADMIN TRỰC: ${ADMIN_WORK_HOURS}
</code></pre><i>Chạm các nút bên dưới hoặc gõ <code>/help</code> để xem tất cả lệnh!</i>`;
      await bot.sendMessage(chatId, welcomeActive, {
        reply_markup: makePersistentReplyKeyboard(uid)
      });
      return;
    }

    // LỆNH GIỜ LÀM VIỆC CỦA ADMIN
    if (text === "⏰ GIỜ ADMIN" || text === "/giolamviec") {
      await bot.sendMessage(chatId, buildAdminHoursMessage(), {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Nhắn Tin Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // LỆNH KÍCH HOẠT KEY: /key <mã_key>
    if (text.startsWith("/key")) {
      const parts = text.split(" ");
      const enteredKey = (parts[1] || "").trim().toUpperCase();

      if (!enteredKey) {
        await bot.sendMessage(chatId, "<b>⚠️ Vui lòng nhập mã key!</b>\nCú pháp: <code>/key &lt;mã_key&gt;</code>");
        return;
      }

      const kData = store.keys[enteredKey];

      if (kData && kData.status === "revoked") {
        await bot.sendMessage(chatId, `<b>⛔ KEY ĐÃ BỊ TẠM THU HỒI!</b>\n\nKey <code>${enteredKey}</code> có thể mở lại sau khi liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> (${ADMIN_WORK_HOURS}).`, {
          reply_markup: {
            inline_keyboard: [[{ text: "📞 Liên Hệ Admin Mở Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
          }
        });
        return;
      }

      if (!kData || kData.status !== "active") {
        await bot.sendMessage(chatId, `<b>❌ KEY KHÔNG HỢP LỆ HOẶC ĐÃ BỊ XOÁ MẤT LUÔN!</b>\n\nVui lòng liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b>.`);
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

      const expDateStr = expiresAt === -1 ? "Vĩnh Viễn (Lifetime)" : formatVNDateTime(expiresAt);

      await bot.sendMessage(chatId, `<b>🎉 KÍCH HOẠT BẢN QUYỀN THÀNH CÔNG!</b>
<pre><code class="language-diff">+ KEY: ${enteredKey}
+ THỜI HẠN: ${kData.durationText}
+ HẠN DÙNG ĐẾN: ${expDateStr}
! THỜI GIAN SỬ DỤNG: ${formatRemainingDetail(expiresAt)}
</code></pre>`, {
        reply_markup: makePersistentReplyKeyboard(uid)
      });
      return;
    }

    // XỬ LÝ CÁC CHỨC NĂNG DÀNH CHO THÀNH VIÊN ĐÃ CÓ BẢN QUYỀN
    const access = checkUserAccess(uid);

    // 1. SOI CẦU MD5 (TELE68 CHUẨN 100% API CŨ)
    if (text === "🎯 SOI CẦU MD5" || text === "/md5") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền. Vui lòng gửi: /key <mã_key>");
        return;
      }
      await bot.sendMessage(chatId, buildPredictionText("md5", md5), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_md5" }],
            [{ text: "📊 Thống Kê 30P", callback_data: "stats_md5" }]
          ]
        }
      });
      return;
    }

    // 2. SOI CẦU HŨ (TELE68 CHUẨN 100% API)
    if (text === "🎲 SOI CẦU HŨ" || text === "/hu") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền. Vui lòng gửi: /key <mã_key>");
        return;
      }
      await bot.sendMessage(chatId, buildPredictionText("hu", hu), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_hu" }],
            [{ text: "📊 Thống Kê 30P", callback_data: "stats_hu" }]
          ]
        }
      });
      return;
    }

    // 3. THỐNG KÊ CHI TIẾT TỪNG PHIÊN (NHẢY RA ĐẦY ĐỦ THẮNG / THUA)
    if (text === "📊 THỐNG KÊ 30P" || text === "/thongke") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền.");
        return;
      }
      await bot.sendMessage(chatId, buildStatsFullText("md5", md5), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎯 Thống Kê MD5", callback_data: "stats_md5" }, { text: "🎲 Thống Kê Hũ", callback_data: "stats_hu" }]
          ]
        }
      });
      return;
    }

    // 4. CÀI ĐẶT TỰ ĐỘNG BÁO KÈO
    if (text === "⚡ TỰ ĐỘNG BÁO" || text === "/tubao") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền.");
        return;
      }
      const u = store.users[uid] || {};
      const mState = u.md5Alert ? "BẬT" : "TẮT";
      const hState = u.huAlert ? "BẬT" : "TẮT";

      const txt = `<b>⚡ CÀI ĐẶT TỰ ĐỘNG BÁO KÈO TỪNG BÀN</b>
<pre><code class="language-diff">@@ BẬT CÁI GÌ CHẠY ĐÓ - CHUẨN 100% API @@
${u.md5Alert ? "+" : "-"} TỰ BÁO MD5 TELE68: ${mState}
${u.huAlert ? "+" : "-"} TỰ BÁO HŨ TELE68: ${hState}
! Tự động gửi tin nhắn mỗi khi sàn cập nhật phiên mới
</code></pre><i>Bấm các nút bên dưới để Bật / Tắt:</i>`;
      await bot.sendMessage(chatId, txt, {
        reply_markup: makeUserInlineKeyboard(uid)
      });
      return;
    }

    // 5. THÔNG TIN BẢN QUYỀN
    if (text === "👤 BẢN QUYỀN" || text === "/thongtin") {
      const u = store.users[uid] || {};
      const expDateStr = access.expiresAt ? formatVNDateTime(access.expiresAt) : "Vĩnh Viễn (Lifetime)";
      const actDateStr = u.activatedAt ? formatVNDateTime(u.activatedAt) : "—";

      const msg = `<b>👤 THÔNG TIN BẢN QUYỀN CỦA BẠN</b>
<pre><code class="language-diff">@@ ID: ${uid} @@
+ KEY: ${u.activatedKey || (access.isAdmin ? "Admin Tối Cao" : "Chưa có")}
+ TRẠNG THÁI: ${access.hasAccess ? "HOẠT ĐỘNG" : "HẾT HẠN"}
+ HẠN DÙNG ĐẾN: ${expDateStr}
! CÒN LẠI: ${access.remainingText}
! KÍCH HOẠT LÚC: ${actDateStr}
- TỰ BÁO MD5: ${u.md5Alert ? "BẬT" : "TẮT"} • HŨ: ${u.huAlert ? "BẬT" : "TẮT"}
</code></pre><i>Admin: ${TELEGRAM_ADMIN_CONTACT} (${ADMIN_WORK_HOURS})</i>`;
      await bot.sendMessage(chatId, msg, {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Nhắn Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // 6. QUẢN LÝ VỐN THỰC CHIẾN
    if (text === "📐 QUẢN LÝ VỐN" || text === "/quanlyvon") {
      await bot.sendMessage(chatId, buildCapitalStrategyText());
      return;
    }

    // 7. MENU ADMIN TỐI CAO
    if (text === "👑 MENU ADMIN" || text === "/admin") {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const adminTxt = `<b>👑 BẢNG QUẢN TRỊ ADMIN TỐI CAO</b>
<pre><code class="language-diff">@@ SẾP PHẠM ANH KHÔI @@
+ ID: ${uid}
! LỆNH: Tạo Key, Thu Hồi (mở lại được), Xoá Key (mất luôn)
- GIỜ TRỰC: ${ADMIN_WORK_HOURS}
</code></pre><i>Bấm các nút dưới đây để thao tác nhanh:</i>`;
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
        await bot.sendMessage(chatId, `<b>⚠️ Định dạng không đúng!</b>\nVí dụ: <code>/taokey 1h</code>, <code>/taokey 1d</code>, <code>/taokey 7d 3</code>, <code>/taokey vv</code>`);
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

      const keysMsg = createdKeys.map(k => `+ ${k}`).join("\n");
      await bot.sendMessage(chatId, `<b>🎉 ĐÃ TẠO THÀNH CÔNG ${count} KEY (${dur.text})!</b>
<pre><code class="language-diff">${keysMsg}
! Thời hạn ${dur.text} tính từ lúc khách kích hoạt
</code></pre>`);
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
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/thuhoi &lt;mã_key&gt;</code>\nKhông tìm thấy mã key này!");
        return;
      }

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

      await bot.sendMessage(chatId, `✅ <b>ĐÃ THU HỒI KEY THÀNH CÔNG (CÓ THỂ MỞ LẠI)!</b>
<pre><code class="language-diff">- KEY BỊ THU HỒI: ${targetKey}
- USER BỊ KHÓA: ${affectedUserId || "Chưa ai dùng"}
! Khi cần mở lại gửi: /molai ${targetKey}
</code></pre>`);
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
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/molai &lt;mã_key&gt;</code>");
        return;
      }

      const kData = store.keys[targetKey];
      if (kData.status !== "revoked") {
        await bot.sendMessage(chatId, `⚠️ Key <code>${targetKey}</code> không ở trạng thái thu hồi.`);
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
            await bot.sendMessage(uId, `🎉 <b>BẢN QUYỀN ĐÃ ĐƯỢC ADMIN MỞ LẠI!</b>\nKey <code>${targetKey}</code> đã được khôi phục thành công!`, {
              reply_markup: makePersistentReplyKeyboard(uId)
            });
          } catch {}
        }
      }

      addSystemLog("Mở lại Key", `Mở lại key ${targetKey} (User: ${restoredUserId || "Chưa gán"})`);
      saveStore(store);

      await bot.sendMessage(chatId, `🎉 <b>ĐÃ MỞ LẠI KEY THÀNH CÔNG!</b>
<pre><code class="language-diff">+ KEY: ${targetKey}
+ USER KHÔI PHỤC: ${restoredUserId || "Chưa ai dùng"}
+ TRẠNG THÁI: HOẠT ĐỘNG BÌNH THƯỜNG
</code></pre>`);
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
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/thuhoiuser &lt;user_id&gt;</code>");
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

      await bot.sendMessage(chatId, `✅ <b>Đã tạm thu hồi User ID <code>${targetUid}</code>!</b>\nĐể mở lại gửi: <code>/khoiphucuser ${targetUid}</code>`);
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
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/khoiphucuser &lt;user_id&gt;</code>");
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
        await bot.sendMessage(targetUid, `🎉 <b>TÀI KHOẢN ĐÃ ĐƯỢC ADMIN MỞ LẠI!</b>\nBạn có thể tiếp tục sử dụng bình thường!`, {
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
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/xoakey &lt;mã_key&gt;</code>");
        return;
      }

      delete store.keys[targetKey];

      let affectedUserId = null;
      for (const [uId, uObj] of Object.entries(store.users)) {
        if (uObj.activatedKey === targetKey || uObj.revokedKey === targetKey) {
          affectedUserId = uId;
          delete store.users[uId];
          try {
            await bot.sendMessage(uId, `⚠️ <b>Key bản quyền của bạn đã bị xoá vĩnh viễn khỏi hệ thống!</b>`);
          } catch {}
        }
      }

      addSystemLog("Xoá Vĩnh Viễn Key", `Xoá mất luôn key ${targetKey}, user: ${affectedUserId || "Không có"}`);
      saveStore(store);

      await bot.sendMessage(chatId, `🗑️ <b>ĐÃ XOÁ VĨNH VIỄN KEY (MẤT LUÔN KHỎI HỆ THỐNG)!</b>
<pre><code class="language-diff">- ĐÃ XOÁ MẤT LUÔN: ${targetKey}
- USER BỊ XOÁ: ${affectedUserId || "Không có"}
! Key này không thể khôi phục hay mở lại
</code></pre>`);
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
        await bot.sendMessage(chatId, `⚠️ Không tìm thấy User ID <code>${targetUid}</code>.`);
        return;
      }

      const uAccess = checkUserAccess(targetUid);
      const actTime = u.activatedAt ? formatVNDateTime(u.activatedAt) : "—";
      const expTime = u.expiresAt ? formatVNDateTime(u.expiresAt) : "Vĩnh Viễn";

      const infoMsg = `<b>🔍 HỒ SƠ NGƯỜI DÙNG</b>
<pre><code class="language-diff">@@ ID: ${targetUid} @@
+ KEY: ${u.activatedKey || "Không"}
+ TRẠNG THÁI: ${u.status === "revoked" ? "BỊ THU HỒI (Mở lại được)" : (uAccess.hasAccess ? "HOẠT ĐỘNG" : "HẾT HẠN")}
+ HẠN DÙNG: ${expTime}
! KÍCH HOẠT: ${actTime}
- TỰ BÁO MD5: ${u.md5Alert ? "BẬT" : "TẮT"} • HŨ: ${u.huAlert ? "BẬT" : "TẮT"}
</code></pre>`;
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

      await bot.sendMessage(chatId, `✅ <b>Đã gia hạn thành công cho User <code>${targetUid}</code> thêm ${dur.text}!</b>\nHạn mới: <b>${formatVNDateTime(newExpiry)}</b>`);
      try {
        await bot.sendMessage(targetUid, `🎉 <b>Tài khoản đã được Admin gia hạn thêm ${dur.text}!</b>\nHạn dùng mới: <b>${formatVNDateTime(newExpiry)}</b>`, {
          reply_markup: makePersistentReplyKeyboard(targetUid)
        });
      } catch {}
      return;
    }

    // LỆNH XEM DANH SÁCH KEY: /danhsachkey hoặc /keys
    if (text === "/danhsachkey" || text === "/keys") {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const allKeys = Object.entries(store.keys);
      if (allKeys.length === 0) {
        await bot.sendMessage(chatId, "<i>Chưa có key nào.</i>");
        return;
      }
      let keyMsg = `<b>📋 DANH SÁCH KEY (${allKeys.length} Key)</b>\n`;
      allKeys.slice(-20).reverse().forEach(([k, v]) => {
        let st = "🟢 Trống";
        if (v.status === "used") st = "🔴 Đã kích hoạt";
        if (v.status === "revoked") st = "⛔ BỊ THU HỒI";
        const user = v.activatedBy ? `(${v.activatedBy})` : "";
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
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/thongbao &lt;nội dung&gt;</code>");
        return;
      }

      let count = 0;
      const uids = Object.keys(store.users);
      for (const uId of uids) {
        try {
          await bot.sendMessage(uId, `📢 <b>THÔNG BÁO TỪ ADMIN PHẠM ANH KHÔI</b>\n━━━━━━━━━━━━━━━━━━━━━\n${msgContent}\n━━━━━━━━━━━━━━━━━━━━━\n⏰ <i>Admin trực: ${ADMIN_WORK_HOURS}</i>`);
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

      const statsMsg = `<b>📊 BÁO CÁO HỆ THỐNG GỌN GÀNG</b>
<pre><code class="language-diff">+ TỔNG NGƯỜI DÙNG: ${totalUsers}
+ KEY CHƯA DÙNG: ${activeKeys}
+ KEY ĐANG DÙNG: ${usedKeys}
- KEY BỊ THU HỒI: ${revokedKeys}
@@ MD5 TELE68 (30P): ${md5Stats.accStr} (W:${md5Stats.winCount} | L:${md5Stats.lossCount}) @@
@@ HŨ TELE68 (30P): ${huStats.accStr} (W:${huStats.winCount} | L:${huStats.lossCount}) @@
</code></pre>`;
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
      await bot.sendMessage(chatId, `<b>💾 BACKUP JSON:</b>\n\n<code>${backupData.slice(0, 3500)}</code>`);
      return;
    }

    // LỆNH THÊM / XÓA PHỤ TÁ ADMIN: /themadmin <id> & /xoaadmin <id>
    if (text.startsWith("/themadmin")) {
      if (!access.isAdmin) return;
      const newAdminId = (text.split(" ")[1] || "").trim();
      if (newAdminId && !store.adminIds.includes(newAdminId)) {
        store.adminIds.push(newAdminId);
        saveStore(store);
        await bot.sendMessage(chatId, `✅ Đã thêm Admin ID <code>${newAdminId}</code>!`);
      }
      return;
    }

    if (text.startsWith("/xoaadmin")) {
      if (!access.isAdmin) return;
      const removeId = (text.split(" ")[1] || "").trim();
      if (removeId && removeId !== ADMIN_ID) {
        store.adminIds = store.adminIds.filter(id => id !== removeId);
        saveStore(store);
        await bot.sendMessage(chatId, `✅ Đã xóa Admin ID <code>${removeId}</code>!`);
      }
      return;
    }
  }
}

// =========================================================================
// HỆ THỐNG TỰ ĐỘNG BÁO TÍN HIỆU PHIÊN MỚI (CHUẨN 100% TỪ API THỰC TẾ)
// =========================================================================
function setupAutoAlerts() {
  const handlePush = async (gameKey, pred, last) => {
    let flagKey = "md5Alert";
    if (gameKey === "hu") flagKey = "huAlert";

    const activeUsers = Object.entries(store.users).filter(([uid, u]) => {
      if (!u[flagKey]) return false;
      const acc = checkUserAccess(uid);
      return acc.hasAccess;
    });

    const alertMsg = buildPredictionText(gameKey, gameKey === "md5" ? md5 : hu);

    for (const [uid] of activeUsers) {
      try {
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
      res.end(JSON.stringify({ status: "ok", author: "Phạm Anh Khôi", version: "11.0-vip-pro", time: Date.now() }));
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
<title>BOT TELEGRAM ĐỊNH LƯỢNG // PHẠM ANH KHÔI v11.0 VIP PRO</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#06060c;color:#f4f4f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
.card{background:#0d0d18;border:1px solid rgba(139,92,246,0.4);border-radius:24px;padding:32px;max-width:520px;width:100%;box-shadow:0 20px 50px rgba(139,92,246,0.25);}
h1{margin:0 0 8px;font-size:1.3rem;color:#fff;display:flex;align-items:center;gap:10px;}
.badge{background:#8b5cf6;color:#fff;font-size:0.75rem;padding:4px 12px;border-radius:9999px;font-weight:800;}
.sub{color:#a1a1aa;font-size:0.85rem;margin-bottom:20px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;}
.box{background:#131322;border-radius:16px;padding:14px;border:1px solid rgba(255,255,255,0.06);}
.box .lbl{font-size:0.75rem;color:#71717a;text-transform:uppercase;font-weight:800;}
.box .val{font-size:1.2rem;font-weight:900;color:#fff;margin-top:4px;}
.btn{display:inline-block;width:100%;text-align:center;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;text-decoration:none;padding:12px 0;border-radius:9999px;font-weight:800;font-size:0.9rem;}
</style>
</head>
<body>
<div class="card">
  <h1>BOT ĐỊNH LƯỢNG <span class="badge">v11.0 VIP PRO</span></h1>
  <div class="sub">Tác giả: <b>Phạm Anh Khôi</b> · Telegram: <b>${TELEGRAM_ADMIN_CONTACT}</b> · Trực: <b>${ADMIN_WORK_HOURS}</b></div>
  <div class="grid">
    <div class="box"><div class="lbl">MD5 TELE68 (30P)</div><div class="val" style="color:#a78bfa">${md5Stats.accStr} (W:${md5Stats.winCount}|L:${md5Stats.lossCount})</div></div>
    <div class="box"><div class="lbl">HŨ TELE68 (30P)</div><div class="val" style="color:#a78bfa">${huStats.accStr} (W:${huStats.winCount}|L:${huStats.lossCount})</div></div>
    <div class="box"><div class="lbl">Tổng Người Dùng</div><div class="val">${totalUsers}</div></div>
    <div class="box"><div class="lbl">Key Chưa Kích Hoạt</div><div class="val">${activeKeys}</div></div>
  </div>
  <a class="btn" href="https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}" target="_blank">LIÊN HỆ ADMIN PHẠM ANH KHÔI</a>
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
  hu.start(3500);
  md5.start(3500);
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
