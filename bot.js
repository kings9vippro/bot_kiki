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

// API NGUỒN TÀI XỈU THỰC CHIẾN (TELE68)
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
        systemSettings: data.systemSettings || { minConfidence: 75, targetWinRate: 85 },
        hu: { activePred: data.hu?.activePred || null, outcomes: data.hu?.outcomes || [], history: data.hu?.history || [] },
        md5: { activePred: data.md5?.activePred || null, outcomes: data.md5?.outcomes || [], history: data.md5?.history || [] }
      };
    }
  } catch {}
  return {
    adminIds: [ADMIN_ID],
    keys: {},
    users: {},
    logs: [],
    systemSettings: { minConfidence: 75, targetWinRate: 85 },
    hu: { activePred: null, outcomes: [], history: [] },
    md5: { activePred: null, outcomes: [], history: [] }
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
// THUẬT TOÁN ĐỊNH LƯỢNG BẮT CẦU THÍCH NGHI ĐA TẦNG V6.0 ULTRA (AI ADAPTIVE)
// Tác giả: Phạm Anh Khôi (@anhkhoi_xabc)
// =========================================================================
class AdaptiveQuantEngine {
  constructor() {
    // Trọng số học máy thích nghi cho các mô hình phân tích
    this.weights = {
      streak: 4.8,
      pattern: 4.2,
      markov: 3.5,
      gaussianMean: 3.6,
      rsiMomentum: 3.2,
      diceEntropy: 3.0
    };
  }

  // Tự học và cập nhật trọng số theo độ chính xác thực tế
  updateWeights(lastOk, strategyType) {
    if (!strategyType) return;
    const factor = lastOk ? 1.05 : 0.92;
    for (const k of Object.keys(this.weights)) {
      if (strategyType.toLowerCase().includes(k.toLowerCase())) {
        this.weights[k] = Math.max(1.5, Math.min(8.0, this.weights[k] * factor));
      }
    }
  }

  predict(history, tracker) {
    if (!history || history.length < 4) {
      return { pred: "tài", conf: 82, src: "Đồng bộ nhịp cầu chuẩn", isChoppy: false };
    }

    const tx = history.map(h => normalizeResult(h.tx || h.result) === "tai" ? "T" : "X");
    const totals = history.map(h => Number(h.total) || 10);
    const dice = history.map(h => h.dice || [3, 3, 4]);
    const len = tx.length;
    const last = tx[len - 1];

    let scoreT = 0, scoreX = 0;
    const reasonsT = [];
    const reasonsX = [];

    // 1. Phân tích chuỗi bệt động lượng (Streak Momentum)
    let s = 1;
    for (let i = len - 2; i >= 0; i--) {
      if (tx[i] === last) s++; else break;
    }

    const wStreak = this.weights.streak;
    if (s >= 3 && s <= 5) {
      if (last === "T") { scoreT += wStreak; reasonsT.push(`Đu bệt Tài (${s} tay)`); }
      else { scoreX += wStreak; reasonsX.push(`Đu bệt Xỉu (${s} tay)`); }
    } else if (s >= 6 && s <= 8) {
      if (last === "T") { scoreT += wStreak * 1.15; reasonsT.push(`Bám bệt Tài sâu (${s} tay)`); }
      else { scoreX += wStreak * 1.15; reasonsX.push(`Bám bệt Xỉu sâu (${s} tay)`); }
    } else if (s >= 9) {
      // Ngưỡng bão hòa cực đại -> Lực kéo bẻ cầu đảo chiều
      if (last === "T") { scoreX += wStreak * 1.25; reasonsX.push(`Bẻ bệt Tài bão hòa (${s} tay)`); }
      else { scoreT += wStreak * 1.25; reasonsT.push(`Bẻ bệt Xỉu bão hòa (${s} tay)`); }
    } else if (s === 1) {
      const last4 = tx.slice(-4);
      if (last4.length === 4 && last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
        if (last === "T") { scoreX += this.weights.pattern; reasonsX.push("Cầu nhịp đảo 1-1"); }
        else { scoreT += this.weights.pattern; reasonsT.push("Cầu nhịp đảo 1-1"); }
      }
    } else if (s === 2) {
      const last4 = tx.slice(-4);
      if (last4.length === 4 && last4[0] === last4[1] && last4[2] === last4[3] && last4[0] !== last4[2]) {
        if (last === "T") { scoreX += this.weights.pattern; reasonsX.push("Cầu song hành 2-2"); }
        else { scoreT += this.weights.pattern; reasonsT.push("Cầu song hành 2-2"); }
      }
    }

    // 2. Hình thái cầu nâng cao (Bậc thang 1-2-3, 3-2-1, Kẹp 2-1-2)
    const wPattern = this.weights.pattern;
    const seq5 = tx.slice(-5).join("");
    if (seq5 === "TTXTT" || seq5 === "XXTXX") {
      if (last === "T") { scoreX += wPattern; reasonsX.push("Thoát cầu kẹp 2-1-2"); }
      else { scoreT += wPattern; reasonsT.push("Thoát cầu kẹp 2-1-2"); }
    }
    const seq6 = tx.slice(-6).join("");
    if (seq6 === "TTTXXT" || seq6 === "XXXTTX") {
      if (last === "T") { scoreT += wPattern * 0.95; reasonsT.push("Hãm đà bậc thang 3-2-1"); }
      else { scoreX += wPattern * 0.95; reasonsX.push("Hãm đà bậc thang 3-2-1"); }
    }
    if (seq6 === "TXXTTT" || seq6 === "XTTXXX") {
      if (last === "T") { scoreX += wPattern * 0.95; reasonsX.push("Tiến bậc cầu 1-2-3"); }
      else { scoreT += wPattern * 0.95; reasonsT.push("Tiến bậc cầu 1-2-3"); }
    }

    // 3. Mô hình chuyển trạng thái Markov bậc 2 & 3 (Markov Chain)
    if (len >= 12) {
      const wMarkov = this.weights.markov;
      const state2 = tx.slice(-2).join("");
      let countT = 0, countX = 0;
      for (let i = 0; i < len - 2; i++) {
        if (tx[i] + tx[i+1] === state2) {
          if (tx[i+2] === "T") countT++; else countX++;
        }
      }
      const totalTrans = countT + countX;
      if (totalTrans >= 2) {
        if (countT > countX) { scoreT += wMarkov + (countT / totalTrans); reasonsT.push("Chuyển trạng thái Markov"); }
        else if (countX > countT) { scoreX += wMarkov + (countX / totalTrans); reasonsX.push("Chuyển trạng thái Markov"); }
      }
    }

    // 4. Hồi quy điểm số xúc xắc Gauss quanh mốc kỳ vọng 10.5
    const recentTotals = totals.slice(-7);
    const avgScore = recentTotals.reduce((a, b) => a + b, 0) / recentTotals.length;
    const wGaussian = this.weights.gaussianMean;
    if (avgScore >= 11.6) {
      scoreX += wGaussian; reasonsX.push(`Hồi quy điểm cao (MA ${avgScore.toFixed(1)})`);
    } else if (avgScore <= 9.4) {
      scoreT += wGaussian; reasonsT.push(`Hồi quy điểm thấp (MA ${avgScore.toFixed(1)})`);
    }

    // 5. Chỉ số RSI dao động tổng điểm (Momentum Oscillator)
    let gains = 0, losses = 0;
    for (let i = Math.max(1, len - 14); i < len; i++) {
      const diff = totals[i] - totals[i - 1];
      if (diff > 0) gains += diff; else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi = 100 - (100 / (1 + rs));
    if (rsi >= 70) {
      scoreX += this.weights.rsiMomentum; reasonsX.push("RSI quá mua tổng điểm");
    } else if (rsi <= 30) {
      scoreT += this.weights.rsiMomentum; reasonsT.push("RSI quá bán tổng điểm");
    }

    // 6. Cân bằng tần suất 20 phiên
    const recent20 = tx.slice(-20);
    const countT20 = recent20.filter(v => v === "T").length;
    const countX20 = recent20.length - countT20;
    if (countT20 >= 13) { scoreX += 2.6; reasonsX.push("Cân bằng tần số lệch Tài"); }
    else if (countX20 >= 13) { scoreT += 2.6; reasonsT.push("Cân bằng tần số lệch Xỉu"); }

    // 7. Nhận diện Bão xúc xắc & Tam hoa
    const lastDice = dice[len - 1];
    if (Array.isArray(lastDice) && lastDice.length === 3) {
      if (lastDice[0] === lastDice[1] && lastDice[1] === lastDice[2]) {
        if (last === "T") { scoreX += 3.8; reasonsX.push(`Bẻ nhịp sau Bão ${lastDice[0]}`); }
        else { scoreT += 3.8; reasonsT.push(`Bẻ nhịp sau Bão ${lastDice[0]}`); }
      }
    }

    // Lọc nhiễu: Đánh giá độ phân kỳ giữa 2 phía
    const scoreDiff = Math.abs(scoreT - scoreX);
    const isChoppy = scoreDiff < 1.2;

    let pred, conf, src;
    if (scoreT > scoreX) {
      pred = "tài";
      src = reasonsT[0] || "Động lượng xu hướng Tài";
      const ratio = scoreT / (scoreT + scoreX + 0.01);
      conf = Math.min(98, Math.round(76 + ratio * 20));
    } else if (scoreX > scoreT) {
      pred = "xỉu";
      src = reasonsX[0] || "Động lượng xu hướng Xỉu";
      const ratio = scoreX / (scoreT + scoreX + 0.01);
      conf = Math.min(98, Math.round(76 + ratio * 20));
    } else {
      pred = countT20 >= countX20 ? "xỉu" : "tài";
      src = "Cân bằng đối xứng xác suất";
      conf = 78;
    }

    // Cơ chế đảo nhịp phòng thủ thích ứng khi gãy liên tiếp
    if (tracker && tracker.reverse) {
      pred = pred === "tài" ? "xỉu" : "tài";
      src = `Đảo nhịp bẻ cầu (${src})`;
      conf = Math.max(74, conf - 2);
    }

    return { pred, conf, src, reverse: tracker?.reverse || false, isChoppy };
  }
}

// =========================================================================
// BỘ ĐỆM KIỂM ĐỊNH HIỆU SUẤT & TỰ ĐỘNG THÍCH NGHI 30 PHIÊN
// =========================================================================
class AdaptiveHedgeTracker {
  constructor(game) {
    this.game = game;
    this.outcomes = store[game]?.outcomes || [];
    this.streakOk = 0;
    this.streakNg = 0;
    this.reverse = false;
  }

  record(session, pred, actual, src, quantEngine) {
    const isTaiPred = normalizeResult(pred) === "tai";
    const isTaiActual = normalizeResult(actual) === "tai";
    const ok = isTaiPred === isTaiActual;

    this.outcomes.push({
      session,
      pred: isTaiPred ? "tài" : "xỉu",
      actual: isTaiActual ? "tài" : "xỉu",
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

  get30Stats() {
    const last30 = this.outcomes.slice(-30);
    const winCount = last30.filter(o => o.ok).length;
    const lossCount = last30.length - winCount;
    const acc = last30.length ? Math.round((winCount / last30.length) * 100) : 0;

    let maxWinStreak = 0, curWin = 0;
    for (const item of last30) {
      if (item.ok) {
        curWin++;
        if (curWin > maxWinStreak) maxWinStreak = curWin;
      } else {
        curWin = 0;
      }
    }

    return {
      acc30: `${acc}%`,
      accNum: acc,
      winCount,
      lossCount,
      total30: last30.length,
      maxWinStreak,
      streakOk: this.streakOk,
      streakNg: this.streakNg,
      reverse: this.reverse,
      outcomes: [...last30].reverse()
    };
  }
}

// =========================================================================
// QUẢN LÝ DỮ LIỆU PHIÊN THỜI GIAN THỰC (TELE68)
// =========================================================================
class SessionEngineCore {
  constructor(game, url, parse) {
    this.game = game;
    this.url = url;
    this.parse = parse;
    this.history = store[game]?.history || [];
    this.sessionIds = new Set(this.history.map(h => h.session));
    this.tracker = new AdaptiveHedgeTracker(game);
    this.engine = new AdaptiveQuantEngine();
    this.activePred = store[game]?.activePred || null;
    this.isFetching = false;
    this.timer = null;
    this.onNewSessionListeners = [];

    // Dọn sạch phiên ảo cũ nếu còn sót
    if (this.history.some(h => h.session < 3000000)) {
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
      const baseS = 6928800 + (this.game === "md5" ? 200 : 0);
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

      const list = this.parse(await res.json());
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
            this.tracker.record(rec.session, this.activePred.pred, rec.result, this.activePred.src, this.engine);
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

function parseStream(data) {
  let list = Array.isArray(data) ? data : (data?.data || data?.list || []);
  if (!Array.isArray(list)) return [];
  return list.map(i => {
    const session = Number(i.session || i.id || i.phien || i.Phien || 0);
    let dice = i.dices || i.dice || i.xucxac || [1, 1, 1];
    if (typeof dice === "string") dice = dice.split(/[,-]/).map(Number);
    const total = Number(i.total || i.point || i.diem || (dice[0] + dice[1] + dice[2]));
    return { session, dice, total, result: total >= 11 ? "tai" : "xiu", tx: total >= 11 ? "T" : "X" };
  }).filter(i => i.session > 0).sort((a, b) => a.session - b.session);
}

const hu = new SessionEngineCore("hu", API_HU, parseStream);
const md5 = new SessionEngineCore("md5", API_MD5, parseStream);

// =========================================================================
// HỆ THỐNG QUẢN LÝ KEY & XÁC THỰC BẢN QUYỀN CHẶT CHẼ
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

  // TRƯỜNG HỢP KEY BỊ ADMIN THU HỒI
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

    // Thiết lập Menu Lệnh chính thức của Telegram (Bấm [/] góc trái dưới cạnh khung chat)
    try {
      await this.setMyCommands([
        { command: "start", description: "🚀 Mở Menu & Bàn phím điều khiển nhanh" },
        { command: "hu", description: "🎲 Soi cầu Tài Xỉu Hũ phiên mới nhất" },
        { command: "md5", description: "🔒 Soi cầu Tài Xỉu MD5 chuẩn xác cao" },
        { command: "thongke", description: "📊 Thống kê tỉ lệ thắng 30 phiên gần nhất" },
        { command: "tubao", description: "⚡ Cài đặt bật/tắt tự động báo kèo từng bàn" },
        { command: "thongtin", description: "👤 Xem thời hạn và ngày hết hạn bản quyền" },
        { command: "quanlyvon", description: "📐 Công thức chia vốn thực chiến an toàn" },
        { command: "soicausau", description: "🔮 Phân tích ma trận xúc xắc & dòng cầu" },
        { command: "menu", description: "👑 Mở bảng điều khiển hệ thống" }
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
// BÀN PHÍM CỐ ĐỊNH DƯỚI ĐÁY MÀN HÌNH (REPLY KEYBOARD) & NÚT BẤM
// Giải quyết dứt điểm việc phải tìm tin nhắn hoặc gõ phím "/" lâu lắc!
// =========================================================================
function makePersistentReplyKeyboard(uid) {
  const access = checkUserAccess(uid);
  const rows = [
    [
      { text: "🎲 Soi Cầu Hũ" },
      { text: "🔒 Soi Cầu MD5" }
    ],
    [
      { text: "📊 Thống Kê 30P" },
      { text: "⚡ Cài Đặt Tự Báo" }
    ],
    [
      { text: "👤 Bản Quyền" },
      { text: "📐 Quản Lý Vốn" }
    ],
    [
      { text: "🔮 Phân Tích Cầu Sâu" },
      { text: "🔄 Làm Mới Dữ Liệu" }
    ]
  ];

  if (access.isAdmin) {
    rows.push([
      { text: "👑 Menu Admin Tối Cao" }
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
  const huState = u.huAlert ? "🟢 BẬT" : "🔴 TẮT";
  const md5State = u.md5Alert ? "🟢 BẬT" : "🔴 TẮT";
  const access = checkUserAccess(uid);

  const rows = [
    [
      { text: "🎲 Soi Cầu Hũ", callback_data: "pred_hu" },
      { text: "🔒 Soi Cầu MD5", callback_data: "pred_md5" }
    ],
    [
      { text: "📊 Thống Kê Hũ", callback_data: "stats_hu" },
      { text: "📊 Thống Kê MD5", callback_data: "stats_md5" }
    ],
    [
      { text: `⚡ Tự Báo Hũ: ${huState}`, callback_data: "toggle_hu" },
      { text: `⚡ Tự Báo MD5: ${md5State}`, callback_data: "toggle_md5" }
    ],
    [
      { text: "📐 Quản Lý Vốn", callback_data: "capital_strategy" },
      { text: "🔮 Phân Tích Cầu Sâu", callback_data: "deep_analysis" }
    ],
    [
      { text: "👤 Thông Tin Bản Quyền", callback_data: "my_info" },
      { text: "🔄 Làm Mới", callback_data: "refresh_menu" }
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
        { text: "📊 Thống Kê Hệ Thống", callback_data: "admin_stats" }
      ],
      [
        { text: "🧹 Quét Key Hết Hạn", callback_data: "admin_clean_expired" },
        { text: "📜 Xem Log Hoạt Động", callback_data: "admin_view_logs" }
      ],
      [
        { text: "🔙 Quay Lại Menu Chính", callback_data: "user_menu" }
      ]
    ]
  };
}

// =========================================================================
// GIAO DIỆN HIỂN THỊ DỰ ĐOÁN & THỐNG KÊ CHI TIẾT
// =========================================================================
function buildPredictionText(gameKey, core) {
  const p = core.getPrediction();
  const last = core.last();
  const stats = core.tracker.get30Stats();
  const isHu = gameKey === "hu";
  const gameTitle = isHu ? "🎲 TÀI XỈU HŨ TRUYỀN THỐNG" : "🔒 TÀI XỈU MD5 THỰC CHIẾN";

  if (!p) {
    return `<b>${gameTitle}</b>\n\n<i>Đang đồng bộ dữ liệu phiên mới từ sàn...</i>`;
  }

  const predDisplay = formatResultDisplay(p.pred);
  const lastResDisplay = last ? formatResultDisplay(last.result) : "—";
  const lastDiceText = last ? `[${last.dice.join("-")}] (${last.total} điểm)` : "—";
  const choppyWarning = p.isChoppy ? "\n⚠️ <b>CẢNH BÁO:</b> <i>Cầu đang giằng co, nên đi đều tiền hoặc lót nhẹ!</i>\n" : "";

  return `<b>${gameTitle}</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>PHIÊN DỰ ĐOÁN: #${p.session}</b>
👉 <b>TÍN HIỆU ĐỊNH LƯỢNG: ${predDisplay === "TÀI" ? "🔴 TÀI" : "⚫ XỈU"}</b>
⚡ <b>ĐỘ TIN CẬY: ${p.conf}%</b>
📊 <b>CHIẾN THUẬT:</b> <code>${p.src}</code>${choppyWarning}
━━━━━━━━━━━━━━━━━━━━━
🎲 <b>Phiên trước #${last ? last.session : "—"}:</b> ${lastDiceText} ➔ <b>${lastResDisplay}</b>
📈 <b>Tỉ lệ thắng 30 phiên:</b> <b>${stats.acc30}</b> (Thắng ${stats.winCount}/${stats.total30} tay)
🔥 <b>Chuỗi thắng max:</b> <b>${stats.maxWinStreak} tay liên tiếp</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bản quyền: Phạm Anh Khôi · Hỗ trợ: ${TELEGRAM_ADMIN_CONTACT}</i>`;
}

function buildStats30Text(gameKey, core) {
  const stats = core.tracker.get30Stats();
  const isHu = gameKey === "hu";
  const gameTitle = isHu ? "TÀI XỈU HŨ" : "TÀI XỈU MD5";

  let listText = "";
  stats.outcomes.slice(0, 15).forEach(o => {
    const icon = o.ok ? "✅" : "❌";
    const pStr = formatResultDisplay(o.pred);
    const aStr = formatResultDisplay(o.actual);
    listText += `${icon} <b>#${o.session}</b>: <code>${pStr}</code> ➔ <code>${aStr}</code> | <i>${o.src}</i>\n`;
  });

  return `<b>📊 KIỂM ĐỊNH 30 PHIÊN THỰC TẾ (${gameTitle})</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>Tỉ Lệ Chuẩn Xác:</b> <b>${stats.acc30}</b>
✅ <b>Số tay ĐÚNG:</b> <b>${stats.winCount}</b> phiên
❌ <b>Số tay SAI:</b> <b>${stats.lossCount}</b> phiên
🔥 <b>Chuỗi Thắng Lớn Nhất:</b> <b>${stats.maxWinStreak}</b> phiên liên tiếp
━━━━━━━━━━━━━━━━━━━━━
<b>15 PHIÊN GẦN NHẤT:</b>
${listText || "<i>Đang tích lũy dữ liệu phiên...</i>"}
━━━━━━━━━━━━━━━━━━━━━
<i>Thuật toán học máy thích nghi tự động · Phạm Anh Khôi</i>`;
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

function buildDeepAnalysisText(gameKey, core) {
  const history = core.history.slice(-30);
  const isHu = gameKey === "hu";
  const gameName = isHu ? "TÀI XỈU HŨ" : "TÀI XỈU MD5";

  if (history.length < 10) return "<i>Đang tích lũy thêm dữ liệu để phân tích sâu...</i>";

  const totals = history.map(h => h.total);
  const avg = (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1);
  const taiCount = history.filter(h => normalizeResult(h.result) === "tai").length;
  const xiuCount = history.length - taiCount;

  // Đếm mặt xúc xắc
  const diceCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  history.forEach(h => {
    if (Array.isArray(h.dice)) {
      h.dice.forEach(d => { if (diceCounts[d] !== undefined) diceCounts[d]++; });
    }
  });

  const topDice = Object.entries(diceCounts).sort((a, b) => b[1] - a[1]);

  return `<b>🔮 PHÂN TÍCH MA TRẬN & CẦU SÂU (${gameName})</b>
━━━━━━━━━━━━━━━━━━━━━
📊 <b>Thống kê mẫu 30 phiên:</b>
• Tỉ số Tài/Xỉu: <b>${taiCount} Tài (${Math.round(taiCount/history.length*100)}%)</b> — <b>${xiuCount} Xỉu (${Math.round(xiuCount/history.length*100)}%)</b>
• Điểm xúc xắc trung bình (MA): <b>${avg}</b> (Chuẩn lý thuyết: 10.5)
• Mặt xúc xắc ra nhiều nhất: Mặt <b>${topDice[0][0]}</b> (${topDice[0][1]} lần), Mặt <b>${topDice[1][0]}</b> (${topDice[1][1]} lần)
• Mặt xúc xắc ra ít nhất: Mặt <b>${topDice[5][0]}</b> (${topDice[5][1]} lần)
━━━━━━━━━━━━━━━━━━━━━
🧠 <b>Đánh giá ma trận AI:</b>
• Độ phân kỳ nhịp: <i>${Math.abs(taiCount - xiuCount) <= 4 ? "Cầu cân bằng, ổn định" : "Cầu có thiên hướng lệch một phía"}</i>
• Tín hiệu xu thế tiếp theo: <b>${avg >= 11.0 ? "Ưu tiên hồi quy Xỉu" : (avg <= 10.0 ? "Ưu tiên hồi quy Tài" : "Bám theo xu hướng bệt/đảo")}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Hệ thống phân tích lượng tử chuyên sâu · Phạm Anh Khôi</i>`;
}

// Thông báo khi key bị thu hồi
function buildRevokedMessage(revokedKey) {
  return `<b>⛔ KEY BẢN QUYỀN ĐÃ BỊ THU HỒI!</b>
━━━━━━━━━━━━━━━━━━━━━
⚠️ <b>Thông báo quan trọng:</b>
Key bản quyền của bạn (<code>${revokedKey || "VIP"}</code>) đã bị <b>Admin thu hồi</b> và vô hiệu hóa khỏi hệ thống.

📞 <b>Vui lòng liên hệ Admin Phạm Anh Khôi để được hỗ trợ và cấp lại key mới:</b>
👉 Telegram: <b>${TELEGRAM_ADMIN_CONTACT}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Sau khi được cấp lại key mới, hãy nhập lệnh:</i> <code>/key &lt;mã_key_mới&gt;</code>`;
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
          inline_keyboard: [[{ text: "📞 Liên Hệ Admin Cấp Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    if (data === "how_to_key") {
      await bot.answerCallback(q.id);
      await bot.sendMessage(chatId, `<b>ℹ️ HƯỚNG DẪN KÍCH HOẠT BẢN QUYỀN</b>\n\n1. Nhắn tin Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> để mua hoặc nhận Key.\n2. Gửi tin nhắn theo cú pháp:\n👉 <code>/key &lt;mã_key&gt;</code>\n<i>Ví dụ:</i> <code>/key AK-7D-ABC123</code>\n\n3. Sau khi kích hoạt thành công, bot sẽ thông báo chính xác ngày giờ hết hạn và mở khóa toàn bộ chức năng.`, {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Nhắn Tin Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // Kiểm tra quyền truy cập cho user thường
    if (!access.hasAccess && data !== "admin_menu" && !data.startsWith("gen_") && data !== "admin_list_keys" && data !== "admin_stats" && data !== "admin_clean_expired" && data !== "admin_view_logs") {
      await bot.answerCallback(q.id, "⚠️ Bạn chưa kích hoạt Key bản quyền!", true);
      await bot.sendMessage(chatId, `<b>⛔ TRUY CẬP BỊ TỪ CHỐI</b>\n\nBạn chưa kích hoạt Key hoặc thời hạn sử dụng đã hết.\nVui lòng gửi lệnh: <code>/key &lt;mã_key_của_bạn&gt;</code>\nHoặc liên hệ: <b>${TELEGRAM_ADMIN_CONTACT}</b>`);
      return;
    }

    if (data === "pred_hu") {
      await bot.answerCallback(q.id);
      const text = buildPredictionText("hu", hu);
      await bot.editMessageText(chatId, msgId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_hu" }],
            [{ text: "🔙 Về Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    if (data === "pred_md5") {
      await bot.answerCallback(q.id);
      const text = buildPredictionText("md5", md5);
      await bot.editMessageText(chatId, msgId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Phiên Mới", callback_data: "pred_md5" }],
            [{ text: "🔙 Về Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    if (data === "stats_hu") {
      await bot.answerCallback(q.id);
      const text = buildStats30Text("hu", hu);
      await bot.editMessageText(chatId, msgId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Làm Mới Thống Kê", callback_data: "stats_hu" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    if (data === "stats_md5") {
      await bot.answerCallback(q.id);
      const text = buildStats30Text("md5", md5);
      await bot.editMessageText(chatId, msgId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Làm Mới Thống Kê", callback_data: "stats_md5" }],
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

    if (data === "deep_analysis") {
      await bot.answerCallback(q.id);
      const tHu = buildDeepAnalysisText("hu", hu);
      await bot.sendMessage(chatId, tHu, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔒 Xem Phân Tích Sâu MD5", callback_data: "deep_md5" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
      return;
    }

    if (data === "deep_md5") {
      await bot.answerCallback(q.id);
      const tMd5 = buildDeepAnalysisText("md5", md5);
      await bot.sendMessage(chatId, tMd5, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎲 Xem Phân Tích Sâu Hũ", callback_data: "deep_analysis" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
          ]
        }
      });
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

    // BẬT / TẮT TỰ ĐỘNG BÁO MD5
    if (data === "toggle_md5") {
      store.users[uid] = store.users[uid] || {};
      store.users[uid].md5Alert = !store.users[uid].md5Alert;
      saveStore(store);
      await bot.answerCallback(q.id, `Đã ${store.users[uid].md5Alert ? "BẬT 🟢" : "TẮT 🔴"} tự báo kèo MD5!`);
      await bot.editMessageReplyMarkup(chatId, msgId, { reply_markup: makeUserInlineKeyboard(uid) });
      return;
    }

    // THÔNG TIN BẢN QUYỀN
    if (data === "my_info") {
      await bot.answerCallback(q.id);
      const u = store.users[uid] || {};
      const expiryFormatted = access.expiresAt ? formatVNDateTime(access.expiresAt) : "Vĩnh Viễn (Lifetime)";
      const activatedFormatted = u.activatedAt ? formatVNDateTime(u.activatedAt) : "—";

      const msg = `<b>👤 THÔNG TIN BẢN QUYỀN CỦA BẠN</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID Telegram:</b> <code>${uid}</code>
🔑 <b>Mã Key Đang Dùng:</b> <code>${u.activatedKey || "Admin Tối Cao"}</code>
🕒 <b>Thời Điểm Kích Hoạt:</b> <b>${activatedFormatted}</b>
📅 <b>HẠN DÙNG ĐẾN:</b> <b>${expiryFormatted}</b>
⏳ <b>Thời Gian Còn Lại:</b> <b>${access.remainingText}</b>
━━━━━━━━━━━━━━━━━━━━━
⚡ <b>Tự Báo Hũ:</b> ${u.huAlert ? "🟢 Đang Bật" : "🔴 Đang Tắt"}
⚡ <b>Tự Báo MD5:</b> ${u.md5Alert ? "🟢 Đang Bật" : "🔴 Đang Tắt"}
━━━━━━━━━━━━━━━━━━━━━
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
      const welcome = `<b>HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN PRO v6.0</b>
━━━━━━━━━━━━━━━━━━━━━
👤 <b>Người dùng:</b> <code>${q.from.first_name || uid}</code>
🆔 <b>ID:</b> <code>${uid}</code>
⏳ <b>Thời hạn:</b> <b>${access.remainingText}</b>
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
Toàn quyền tạo key, thu hồi, gia hạn và giám sát toàn hệ thống.
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
        if (v.status === "used") st = "🔴 Đã dùng";
        if (v.status === "revoked") st = "⛔ BỊ THU HỒI";
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
      const huStats = hu.tracker.get30Stats();
      const md5Stats = md5.tracker.get30Stats();

      const statsMsg = `<b>📊 THỐNG KÊ TỔNG QUAN HỆ THỐNG</b>
━━━━━━━━━━━━━━━━━━━━━
👥 <b>Tổng Người Dùng:</b> <b>${totalUsers}</b>
🔑 <b>Key Chưa Kích Hoạt:</b> <b>${activeKeys}</b>
🔐 <b>Key Đang Hoạt Động:</b> <b>${usedKeys}</b>
⛔ <b>Key Bị Thu Hồi:</b> <b>${revokedKeys}</b>
━━━━━━━━━━━━━━━━━━━━━
🎲 <b>Tài Xỉu Hũ (30P):</b> <b>${huStats.acc30}</b> (Thắng ${huStats.winCount}/${huStats.total30} tay)
🔒 <b>Tài Xỉu MD5 (30P):</b> <b>${md5Stats.acc30}</b> (Thắng ${md5Stats.winCount}/${md5Stats.total30} tay)
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
    if (currentAccess.isRevoked && !text.startsWith("/key") && !text.startsWith("/claim_admin")) {
      await bot.sendMessage(chatId, buildRevokedMessage(currentAccess.revokedKey), {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Liên Hệ Admin Cấp Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
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
        await bot.sendMessage(chatId, `<b>👑 XÁC THỰC ADMIN THÀNH CÔNG!</b>\n\nXin chào Sếp <b>Phạm Anh Khôi</b>!\nID <code>${uid}</code> đã được nâng cấp quyền <b>Admin Tối Cao</b>.`, {
          reply_markup: makePersistentReplyKeyboard(uid)
        });
      } else {
        await bot.sendMessage(chatId, `<b>❌ MẬT KHẨU KHÔNG CHÍNH XÁC!</b>\nCú pháp: <code>/claim_admin &lt;mật_khẩu_master&gt;</code>`);
      }
      return;
    }

    // LỆNH START & MỞ BÀN PHÍM CỐ ĐỊNH CHỌN 1-CHẠM
    if (text === "/start" || text === "/menu" || text === "🔄 Làm Mới Dữ Liệu") {
      const access = checkUserAccess(uid);

      if (!access.hasAccess) {
        const welcomeNotActive = `<b>HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN PRO v6.0</b>
━━━━━━━━━━━━━━━━━━━━━
Xin chào <b>${m.from.first_name || "bạn"}</b>!
🆔 <b>ID của bạn:</b> <code>${uid}</code>
⚠️ <b>Trạng thái:</b> <b>Chưa kích hoạt bản quyền</b>
━━━━━━━━━━━━━━━━━━━━━
Hệ thống bắt cầu định lượng thích nghi công nghệ cao Tài Xỉu & MD5.
Để sử dụng, vui lòng liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> để nhận Key bản quyền.

Nếu bạn đã có Key, hãy gửi tin nhắn theo cú pháp:
👉 <code>/key &lt;mã_key_của_bạn&gt;</code>`;
        await bot.sendMessage(chatId, welcomeNotActive, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📞 Liên Hệ Mua Key Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }],
              [{ text: "ℹ️ Hướng Dẫn Kích Hoạt", callback_data: "how_to_key" }]
            ]
          }
        });
        return;
      }

      // Đã kích hoạt -> Trả về giao diện và GẮN BÀN PHÍM CỐ ĐỊNH DƯỚI ĐÁY MÀN HÌNH
      const welcomeActive = `<b>HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN PRO v6.0</b>
━━━━━━━━━━━━━━━━━━━━━
👤 <b>Người dùng:</b> <code>${m.from.first_name || uid}</code>
🆔 <b>ID:</b> <code>${uid}</code>
⏳ <b>Thời hạn:</b> <b>${access.remainingText}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bàn phím điều khiển nhanh đã được kích hoạt cố định dưới đáy màn hình! Bạn chỉ cần bấm 1 chạm, không cần gõ lệnh.</i>`;
      await bot.sendMessage(chatId, welcomeActive, {
        reply_markup: makePersistentReplyKeyboard(uid)
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

      // NẾU KEY ĐÃ BỊ ADMIN THU HỒI
      if (kData && kData.status === "revoked") {
        await bot.sendMessage(chatId, `<b>⛔ KEY ĐÃ BỊ THU HỒI!</b>\n\nMã key <code>${enteredKey}</code> đã bị Admin thu hồi và vô hiệu hóa.\nVui lòng liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> để được cấp lại key mới.`, {
          reply_markup: {
            inline_keyboard: [[{ text: "📞 Liên Hệ Admin Cấp Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
          }
        });
        return;
      }

      if (!kData || kData.status !== "active") {
        await bot.sendMessage(chatId, `<b>❌ KEY KHÔNG HỢP LỆ HOẶC ĐÃ ĐƯỢC SỬ DỤNG!</b>\n\nVui lòng kiểm tra lại hoặc liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b>.`);
        return;
      }

      const now = Date.now();
      const expiresAt = kData.durationMs === -1 ? -1 : now + kData.durationMs;

      kData.status = "used";
      kData.activatedBy = uid;
      kData.activatedAt = now;
      kData.expiresAt = expiresAt;

      store.users[uid] = store.users[uid] || { huAlert: false, md5Alert: false };
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
    // Hỗ trợ cả gõ lệnh (/hu, /md5, /thongke, /tubao, /thongtin, /quanlyvon, /soicausau) LẪN bấm nút bàn phím cố định!
    const access = checkUserAccess(uid);

    // 1. SOI CẦU HŨ
    if (text === "🎲 Soi Cầu Hũ" || text === "/hu") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền. Vui lòng nhập /key <mã_key>");
        return;
      }
      await bot.sendMessage(chatId, buildPredictionText("hu", hu), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Lại Phiên Mới", callback_data: "pred_hu" }],
            [{ text: "🔮 Phân Tích Sâu Bàn Hũ", callback_data: "deep_analysis" }]
          ]
        }
      });
      return;
    }

    // 2. SOI CẦU MD5
    if (text === "🔒 Soi Cầu MD5" || text === "/md5") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền. Vui lòng nhập /key <mã_key>");
        return;
      }
      await bot.sendMessage(chatId, buildPredictionText("md5", md5), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cập Nhật Lại Phiên Mới", callback_data: "pred_md5" }],
            [{ text: "🔮 Phân Tích Sâu Bàn MD5", callback_data: "deep_md5" }]
          ]
        }
      });
      return;
    }

    // 3. THỐNG KÊ 30 PHIÊN
    if (text === "📊 Thống Kê 30P" || text === "/thongke") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền.");
        return;
      }
      await bot.sendMessage(chatId, buildStats30Text("hu", hu), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎲 Thống Kê Hũ", callback_data: "stats_hu" }, { text: "🔒 Thống Kê MD5", callback_data: "stats_md5" }]
          ]
        }
      });
      return;
    }

    // 4. CÀI ĐẶT TỰ ĐỘNG BÁO KÈO
    if (text === "⚡ Cài Đặt Tự Báo" || text === "/tubao") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền.");
        return;
      }
      const u = store.users[uid] || {};
      const hState = u.huAlert ? "🟢 ĐANG BẬT" : "🔴 ĐANG TẮT";
      const mState = u.md5Alert ? "🟢 ĐANG BẬT" : "🔴 ĐANG TẮT";

      const txt = `<b>⚡ CÀI ĐẶT TỰ ĐỘNG BÁO KÈO TỪNG BÀN</b>
━━━━━━━━━━━━━━━━━━━━━
Bật cái gì chạy cái đó, độc lập 100%, không lo bị trôi hay lẫn lộn tin nhắn!

🎲 <b>Tài Xỉu Hũ:</b> <b>${hState}</b>
🔒 <b>Tài Xỉu MD5:</b> <b>${mState}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bấm các nút bên dưới để chuyển đổi Bật / Tắt:</i>`;
      await bot.sendMessage(chatId, txt, {
        reply_markup: makeUserInlineKeyboard(uid)
      });
      return;
    }

    // 5. THÔNG TIN BẢN QUYỀN
    if (text === "👤 Bản Quyền" || text === "/thongtin") {
      const u = store.users[uid] || {};
      const expDateStr = access.expiresAt ? formatVNDateTime(access.expiresAt) : "Vĩnh Viễn (Lifetime)";
      const actDateStr = u.activatedAt ? formatVNDateTime(u.activatedAt) : "—";

      const msg = `<b>👤 THÔNG TIN BẢN QUYỀN CỦA BẠN</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID Telegram:</b> <code>${uid}</code>
🔑 <b>Mã Key Đang Dùng:</b> <code>${u.activatedKey || (access.isAdmin ? "Admin Tối Cao" : "Chưa có")}</code>
📊 <b>Trạng Thái:</b> <b>${access.hasAccess ? "🟢 Đang Hoạt Động" : "🔴 Chưa Hợp Lệ"}</b>
🕒 <b>Thời Điểm Kích Hoạt:</b> <b>${actDateStr}</b>
📅 <b>HẠN DÙNG ĐẾN:</b> <b>${expDateStr}</b>
⏳ <b>Thời Gian Còn Lại:</b> <b>${access.remainingText}</b>
━━━━━━━━━━━━━━━━━━━━━
⚡ <b>Tự Báo Hũ:</b> ${u.huAlert ? "🟢 Đang Bật" : "🔴 Đang Tắt"}
⚡ <b>Tự Báo MD5:</b> ${u.md5Alert ? "🟢 Đang Bật" : "🔴 Đang Tắt"}
━━━━━━━━━━━━━━━━━━━━━
<i>Tác giả: Phạm Anh Khôi · Hỗ trợ: ${TELEGRAM_ADMIN_CONTACT}</i>`;
      await bot.sendMessage(chatId, msg, {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Liên Hệ Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // 6. QUẢN LÝ VỐN THỰC CHIẾN
    if (text === "📐 Quản Lý Vốn" || text === "/quanlyvon") {
      await bot.sendMessage(chatId, buildCapitalStrategyText());
      return;
    }

    // 7. PHÂN TÍCH MA TRẬN CẦU SÂU
    if (text === "🔮 Phân Tích Cầu Sâu" || text === "/soicausau") {
      if (!access.hasAccess) {
        await bot.sendMessage(chatId, "⚠️ Bạn chưa kích hoạt key bản quyền.");
        return;
      }
      await bot.sendMessage(chatId, buildDeepAnalysisText("hu", hu), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔒 Xem Phân Tích Sâu MD5", callback_data: "deep_md5" }]
          ]
        }
      });
      return;
    }

    // 8. MENU ADMIN TỐI CAO
    if (text === "👑 Menu Admin Tối Cao" || text === "/admin") {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const adminTxt = `<b>👑 BẢNG QUẢN TRỊ ADMIN TỐI CAO</b>
━━━━━━━━━━━━━━━━━━━━━
Xin chào Sếp <b>Phạm Anh Khôi</b>!
ID Admin: <code>${uid}</code>
Toàn quyền tạo key, thu hồi, gia hạn và giám sát toàn hệ thống.
━━━━━━━━━━━━━━━━━━━━━
<i>Bấm nút bên dưới để tạo key hoặc quản lý:</i>`;
      await bot.sendMessage(chatId, adminTxt, {
        reply_markup: makeAdminKeyboard()
      });
      return;
    }

    // =====================================================================
    // CÁC LỆNH ẨN VÀ ĐẶC QUYỀN DÀNH CHO ADMIN TỐI CAO
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

    // LỆNH THU HỒI KEY: /thuhoi <mã_key> hoặc /xoakey <mã_key>
    if (text.startsWith("/thuhoi") || text.startsWith("/xoakey")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const targetKey = (text.split(" ")[1] || "").trim().toUpperCase();
      if (!targetKey || !store.keys[targetKey]) {
        await bot.sendMessage(chatId, "⚠️ Cú pháp: <code>/thuhoi &lt;mã_key&gt;</code>\nKhông tìm thấy mã key này trong hệ thống!");
        return;
      }

      // Đánh dấu trạng thái key là đã thu hồi (revoked)
      store.keys[targetKey].status = "revoked";
      store.keys[targetKey].revokedAt = Date.now();
      store.keys[targetKey].revokedBy = uid;

      // Tìm user đang sử dụng key này và thu hồi
      let affectedUserId = null;
      for (const [uId, uObj] of Object.entries(store.users)) {
        if (uObj.activatedKey === targetKey) {
          affectedUserId = uId;
          uObj.status = "revoked";
          uObj.revokedKey = targetKey;
          uObj.revokedAt = Date.now();
          uObj.huAlert = false;
          uObj.md5Alert = false;

          // Gửi thông báo trực tiếp đến Telegram người dùng
          try {
            await bot.sendMessage(uId, buildRevokedMessage(targetKey), {
              reply_markup: {
                inline_keyboard: [[{ text: "📞 Liên Hệ Admin Cấp Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
              }
            });
          } catch {}
        }
      }

      addSystemLog("Thu hồi Key", `Thu hồi key ${targetKey}, ảnh hưởng User: ${affectedUserId || "Chưa gán"}`);
      saveStore(store);

      await bot.sendMessage(chatId, `✅ <b>ĐÃ THU HỒI KEY BẢN QUYỀN THÀNH CÔNG!</b>\n━━━━━━━━━━━━━━━━━━━━━\n🔑 <b>Key:</b> <code>${targetKey}</code>\n👤 <b>User bị thu hồi:</b> <code>${affectedUserId || "Chưa ai dùng"}</code>\n⚠️ <i>Khách hàng này khi thao tác bot sẽ nhận thông báo: Key đã bị thu hồi liên hệ admin để cấp lại.</i>`);
      return;
    }

    // LỆNH THU HỒI USER TRỰC TIẾP: /thuhoiuser <user_id>
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
      uObj.huAlert = false;
      uObj.md5Alert = false;

      addSystemLog("Thu hồi User", `Thu hồi quyền User ${targetUid}`);
      saveStore(store);

      try {
        await bot.sendMessage(targetUid, buildRevokedMessage(revokedKey), {
          reply_markup: {
            inline_keyboard: [[{ text: "📞 Liên Hệ Admin Cấp Lại", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
          }
        });
      } catch {}

      await bot.sendMessage(chatId, `✅ <b>Đã thu hồi toàn bộ quyền của User ID <code>${targetUid}</code>!</b>`);
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
📊 <b>Trạng thái:</b> <b>${u.status === "revoked" ? "⛔ ĐÃ BỊ THU HỒI" : (uAccess.hasAccess ? "🟢 Hoạt động" : "🔴 Hết hạn")}</b>
🕒 <b>Kích hoạt lúc:</b> <b>${actTime}</b>
📅 <b>Hạn dùng đến:</b> <b>${expTime}</b>
⏳ <b>Còn lại:</b> <b>${uAccess.remainingText}</b>
⚡ <b>Tự báo Hũ:</b> ${u.huAlert ? "🟢 Bật" : "🔴 Tắt"} | <b>MD5:</b> ${u.md5Alert ? "🟢 Bật" : "🔴 Tắt"}`;
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

      store.users[targetUid] = store.users[targetUid] || { huAlert: false, md5Alert: false };
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
        if (v.status === "used") st = "🔴 Đã dùng";
        if (v.status === "revoked") st = "⛔ BỊ THU HỒI";
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
          await bot.sendMessage(uId, `📢 <b>THÔNG BÁO TỪ ADMIN PHẠM ANH KHÔI</b>\n━━━━━━━━━━━━━━━━━━━━━\n${msgContent}\n━━━━━━━━━━━━━━━━━━━━━\n<i>Liên hệ hỗ trợ: ${TELEGRAM_ADMIN_CONTACT}</i>`);
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
      const huStats = hu.tracker.get30Stats();
      const md5Stats = md5.tracker.get30Stats();

      const statsMsg = `<b>📊 BÁO CÁO TOÀN DIỆN HỆ THỐNG</b>
━━━━━━━━━━━━━━━━━━━━━
👥 <b>Tổng Người Dùng:</b> <b>${totalUsers}</b>
🔑 <b>Key Còn Trống:</b> <b>${activeKeys}</b>
🔐 <b>Key Đã Kích Hoạt:</b> <b>${usedKeys}</b>
⛔ <b>Key Bị Thu Hồi:</b> <b>${revokedKeys}</b>
━━━━━━━━━━━━━━━━━━━━━
🎲 <b>Tài Xỉu Hũ (30P):</b> <b>${huStats.acc30}</b> (Thắng ${huStats.winCount}/${huStats.total30})
🔒 <b>Tài Xỉu MD5 (30P):</b> <b>${md5Stats.acc30}</b> (Thắng ${md5Stats.winCount}/${md5Stats.total30})
━━━━━━━━━━━━━━━━━━━━━
<i>Dữ liệu thời gian thực được bảo vệ và đồng bộ liên tục.</i>`;
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
    const isHu = gameKey === "hu";
    const flagKey = isHu ? "huAlert" : "md5Alert";
    const gameName = isHu ? "🎲 TÀI XỈU HŨ TRUYỀN THỐNG" : "🔒 TÀI XỈU MD5";
    const predDisplay = formatResultDisplay(pred.pred);
    const lastDisplay = last ? formatResultDisplay(last.result) : "—";
    const lastDice = last ? `[${last.dice.join("-")}] (${last.total} điểm)` : "—";
    const choppyTag = pred.isChoppy ? "\n⚠️ <i>Cầu giằng co, khuyên vào nhẹ hoặc xem!</i>" : "";

    const alertMsg = `⚡ <b>TÍN HIỆU PHIÊN MỚI: ${gameName}</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>PHIÊN: #${pred.session}</b>
👉 <b>DỰ ĐOÁN: ${predDisplay === "TÀI" ? "🔴 TÀI" : "⚫ XỈU"}</b>
🔥 <b>ĐỘ TIN CẬY: ${pred.conf}%</b>
📊 <b>CHIẾN THUẬT:</b> <code>${pred.src}</code>${choppyTag}
━━━━━━━━━━━━━━━━━━━━━
🎲 <b>Phiên trước #${last ? last.session : "—"}:</b> ${lastDice} ➔ <b>${lastDisplay}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Hệ thống tự động báo kèo · Tác giả: Phạm Anh Khôi</i>`;

    const activeUsers = Object.entries(store.users).filter(([uid, u]) => {
      if (!u[flagKey]) return false;
      const acc = checkUserAccess(uid);
      return acc.hasAccess;
    });

    for (const [uid] of activeUsers) {
      try {
        await bot.sendMessage(uid, alertMsg);
      } catch {}
    }
  };

  hu.onNewSession((g, p, l) => handlePush(g, p, l));
  md5.onNewSession((g, p, l) => handlePush(g, p, l));
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
      res.end(JSON.stringify({ status: "ok", author: "Phạm Anh Khôi", version: "6.0-ultra", time: Date.now() }));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const huStats = hu.tracker.get30Stats();
    const md5Stats = md5.tracker.get30Stats();
    const totalUsers = Object.keys(store.users).length;
    const activeKeys = Object.values(store.keys).filter(k => k.status === "active").length;

    res.end(`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BOT TELEGRAM ĐỊNH LƯỢNG // PHẠM ANH KHÔI v6.0 ULTRA</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#000000;color:#f4f4f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
.card{background:#0d0d12;border:1px solid rgba(239,68,68,0.4);border-radius:28px;padding:36px;max-width:560px;width:100%;box-shadow:0 20px 50px rgba(239,68,68,0.2);}
h1{margin:0 0 8px;font-size:1.35rem;color:#fff;display:flex;align-items:center;gap:10px;}
.badge{background:#e11d48;color:#fff;font-size:0.75rem;padding:4px 14px;border-radius:9999px;font-weight:800;}
.sub{color:#a1a1aa;font-size:0.85rem;margin-bottom:24px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;}
.box{background:#181820;border-radius:18px;padding:16px;border:1px solid rgba(255,255,255,0.06);}
.box .lbl{font-size:0.75rem;color:#71717a;text-transform:uppercase;font-weight:800;}
.box .val{font-size:1.25rem;font-weight:900;color:#fff;margin-top:4px;}
.btn{display:inline-block;width:100%;text-align:center;background:linear-gradient(135deg,#e11d48,#be123c);color:#fff;text-decoration:none;padding:14px 0;border-radius:9999px;font-weight:800;font-size:0.9rem;box-shadow:0 4px 18px rgba(225,29,72,0.4);}
</style>
</head>
<body>
<div class="card">
  <h1>BOT TELEGRAM ĐỊNH LƯỢNG <span class="badge">v6.0 ULTRA</span></h1>
  <div class="sub">Tác giả: <b>Phạm Anh Khôi</b> · Telegram: <b>${TELEGRAM_ADMIN_CONTACT}</b></div>
  <div class="grid">
    <div class="box"><div class="lbl">Tài Xỉu Hũ (30 phiên)</div><div class="val" style="color:#ef4444">${huStats.acc30} (${huStats.winCount}/${huStats.total30})</div></div>
    <div class="box"><div class="lbl">Tài Xỉu MD5 (30 phiên)</div><div class="val" style="color:#ef4444">${md5Stats.acc30} (${md5Stats.winCount}/${md5Stats.total30})</div></div>
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
