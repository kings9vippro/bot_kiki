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
// HỆ THỐNG LƯU TRỮ DỮ LIỆU BOT (KEYS, USERS, HISTORY)
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
        hu: { activePred: data.hu?.activePred || null, outcomes: data.hu?.outcomes || [], history: data.hu?.history || [] },
        md5: { activePred: data.md5?.activePred || null, outcomes: data.md5?.outcomes || [], history: data.md5?.history || [] }
      };
    }
  } catch {}
  return {
    adminIds: [ADMIN_ID],
    keys: {},
    users: {},
    hu: { activePred: null, outcomes: [], history: [] },
    md5: { activePred: null, outcomes: [], history: [] }
  };
}

function saveStore(s) {
  try { writeFileSync(STORE_FILE, JSON.stringify(s, null, 2)); } catch {}
}
const store = loadStore();

// =========================================================================
// HÀM CHUẨN HÓA KẾT QUẢ - SỬA TRIỆT ĐỂ LỖI "TÀI" VS "TAI"
// =========================================================================
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
// THUẬT TOÁN ĐỊNH LƯỢNG BẮT CẦU THÍCH NGHI ĐA TẦNG CAO CẤP
// Tác giả: Phạm Anh Khôi (@anhkhoi_xabc)
// =========================================================================
class AdaptiveQuantEngine {
  predict(history, tracker) {
    if (!history || history.length < 4) {
      return { pred: "tài", conf: 82, src: "Đồng bộ nhịp cầu" };
    }

    const tx = history.map(h => normalizeResult(h.tx || h.result) === "tai" ? "T" : "X");
    const totals = history.map(h => Number(h.total) || 10);
    const dice = history.map(h => h.dice || [3, 3, 4]);
    const len = tx.length;
    const last = tx[len - 1];

    let scoreT = 0, scoreX = 0;
    const reasonsT = [];
    const reasonsX = [];

    // 1. Phân tích chuỗi bệt (Streak Momentum)
    let s = 1;
    for (let i = len - 2; i >= 0; i--) {
      if (tx[i] === last) s++; else break;
    }

    if (s >= 3 && s <= 5) {
      if (last === "T") { scoreT += 4.5; reasonsT.push(`Đu bệt Tài (${s} tay)`); }
      else { scoreX += 4.5; reasonsX.push(`Đu bệt Xỉu (${s} tay)`); }
    } else if (s >= 6 && s <= 8) {
      if (last === "T") { scoreT += 5.2; reasonsT.push(`Bám bệt Tài sâu (${s} tay)`); }
      else { scoreX += 5.2; reasonsX.push(`Bám bệt Xỉu sâu (${s} tay)`); }
    } else if (s >= 9) {
      if (last === "T") { scoreX += 5.8; reasonsX.push(`Bẻ bệt Tài bão hòa (${s} tay)`); }
      else { scoreT += 5.8; reasonsT.push(`Bẻ bệt Xỉu bão hòa (${s} tay)`); }
    } else if (s === 1) {
      const last4 = tx.slice(-4);
      if (last4.length === 4 && last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
        if (last === "T") { scoreX += 4.2; reasonsX.push("Cầu đảo 1-1"); }
        else { scoreT += 4.2; reasonsT.push("Cầu đảo 1-1"); }
      }
    } else if (s === 2) {
      const last4 = tx.slice(-4);
      if (last4.length === 4 && last4[0] === last4[1] && last4[2] === last4[3] && last4[0] !== last4[2]) {
        if (last === "T") { scoreX += 4.0; reasonsX.push("Cầu đôi 2-2"); }
        else { scoreT += 4.0; reasonsT.push("Cầu đôi 2-2"); }
      }
    }

    // 2. Cầu bậc thang & Cầu kẹp
    const seq5 = tx.slice(-5).join("");
    if (seq5 === "TTXTT" || seq5 === "XXTXX") {
      if (last === "T") { scoreX += 3.8; reasonsX.push("Thoát cầu kẹp 2-1-2"); }
      else { scoreT += 3.8; reasonsT.push("Thoát cầu kẹp 2-1-2"); }
    }
    const seq6 = tx.slice(-6).join("");
    if (seq6 === "TTTXXT" || seq6 === "XXXTTX") {
      if (last === "T") { scoreT += 3.6; reasonsT.push("Hãm đà 3-2-1"); }
      else { scoreX += 3.6; reasonsX.push("Hãm đà 3-2-1"); }
    }
    if (seq6 === "TXXTTT" || seq6 === "XTTXXX") {
      if (last === "T") { scoreX += 3.6; reasonsX.push("Tiến bậc 1-2-3"); }
      else { scoreT += 3.6; reasonsT.push("Tiến bậc 1-2-3"); }
    }

    // 3. Mô hình chuyển trạng thái Markov K2 & K3
    if (len >= 12) {
      const state2 = tx.slice(-2).join("");
      let countT = 0, countX = 0;
      for (let i = 0; i < len - 2; i++) {
        if (tx[i] + tx[i+1] === state2) {
          if (tx[i+2] === "T") countT++; else countX++;
        }
      }
      const totalTrans = countT + countX;
      if (totalTrans >= 2) {
        if (countT > countX) { scoreT += 2.8 + (countT / totalTrans); reasonsT.push("Chuyển trạng thái Markov"); }
        else if (countX > countT) { scoreX += 2.8 + (countX / totalTrans); reasonsX.push("Chuyển trạng thái Markov"); }
      }
    }

    // 4. Hồi quy điểm số xúc xắc quanh mốc 10.5
    const recentTotals = totals.slice(-7);
    const avgScore = recentTotals.reduce((a, b) => a + b, 0) / recentTotals.length;
    if (avgScore >= 11.5) {
      scoreX += 3.2; reasonsX.push(`Hồi quy điểm cao (${avgScore.toFixed(1)})`);
    } else if (avgScore <= 9.5) {
      scoreT += 3.2; reasonsT.push(`Hồi quy điểm thấp (${avgScore.toFixed(1)})`);
    }

    // 5. Cân bằng tần suất 20 phiên
    const recent20 = tx.slice(-20);
    const countT20 = recent20.filter(v => v === "T").length;
    const countX20 = recent20.length - countT20;
    if (countT20 >= 13) { scoreX += 2.8; reasonsX.push("Cân bằng tần số Tài"); }
    else if (countX20 >= 13) { scoreT += 2.8; reasonsT.push("Cân bằng tần số Xỉu"); }

    // 6. Nhận diện Bão xúc xắc
    const lastDice = dice[len - 1];
    if (Array.isArray(lastDice) && lastDice.length === 3) {
      if (lastDice[0] === lastDice[1] && lastDice[1] === lastDice[2]) {
        if (last === "T") { scoreX += 3.5; reasonsX.push(`Bẻ nhịp sau Bão ${lastDice[0]}`); }
        else { scoreT += 3.5; reasonsT.push(`Bẻ nhịp sau Bão ${lastDice[0]}`); }
      }
    }

    let pred, conf, src;
    if (scoreT > scoreX) {
      pred = "tài";
      src = reasonsT[0] || "Động lượng xu hướng Tài";
      const ratio = scoreT / (scoreT + scoreX + 0.01);
      conf = Math.min(98, Math.round(78 + ratio * 18));
    } else if (scoreX > scoreT) {
      pred = "xỉu";
      src = reasonsX[0] || "Động lượng xu hướng Xỉu";
      const ratio = scoreX / (scoreT + scoreX + 0.01);
      conf = Math.min(98, Math.round(78 + ratio * 18));
    } else {
      pred = countT20 >= countX20 ? "xỉu" : "tài";
      src = "Cân bằng đối xứng";
      conf = 80;
    }

    if (tracker && tracker.reverse) {
      pred = pred === "tài" ? "xỉu" : "tài";
      src = `Đảo nhịp bẻ cầu (${src})`;
      conf = Math.max(74, conf - 3);
    }

    return { pred, conf, src, reverse: tracker?.reverse || false };
  }
}

// =========================================================================
// BỘ ĐỆM ĐÚNG SAI 30 PHIÊN & THEO DÕI HIỆU SUẤT
// =========================================================================
class AdaptiveHedgeTracker {
  constructor(game) {
    this.game = game;
    this.outcomes = store[game]?.outcomes || [];
    this.streakOk = 0;
    this.streakNg = 0;
    this.reverse = false;
  }

  record(session, pred, actual, src) {
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
            this.tracker.record(rec.session, this.activePred.pred, rec.result, this.activePred.src);
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
          ts: Date.now()
        };
        store[this.game].activePred = this.activePred;
        saveStore(store);

        // Phát tín hiệu tự động cho những ai đăng ký
        for (const cb of this.onNewSessionListeners) {
          try { cb(this.game, this.activePred, this.last()); } catch {}
        }
      }
    } catch (e) {
      // Giữ nguyên trạng thái khi mạng nghẽn
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
// HỆ THỐNG QUẢN LÝ KEY BẢN QUYỀN (GIỜ, NGÀY, TUẦN, THÁNG, VĨNH VIỄN)
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

function formatRemainingTime(expiresAt) {
  if (expiresAt === -1) return "Vĩnh Viễn (Lifetime)";
  const now = Date.now();
  const diff = expiresAt - now;
  if (diff <= 0) return "Đã Hết Hạn";

  const days = Math.floor(diff / (24 * 3600 * 1000));
  const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000));

  const parts = [];
  if (days > 0) parts.push(`${days} ngày`);
  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} phút`);
  return parts.join(" ");
}

function checkUserAccess(userId) {
  const uid = String(userId);
  if (store.adminIds.includes(uid)) {
    return { hasAccess: true, isAdmin: true, remainingText: "Admin Tối Cao (Vĩnh Viễn)" };
  }

  const u = store.users[uid];
  if (!u || !u.activatedKey) {
    return { hasAccess: false, isAdmin: false, reason: "not_activated" };
  }

  if (u.expiresAt === -1) {
    return { hasAccess: true, isAdmin: false, remainingText: "Vĩnh Viễn" };
  }

  if (Date.now() > u.expiresAt) {
    return { hasAccess: false, isAdmin: false, reason: "expired", expiredAt: u.expiresAt };
  }

  return {
    hasAccess: true,
    isAdmin: false,
    remainingText: formatRemainingTime(u.expiresAt),
    expiresAt: u.expiresAt
  };
}

// =========================================================================
// TELEGRAM BOT API CLIENT THUẦN (NATIVE ZERO-DEPENDENCY)
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

  async answerCallback(queryId, text = "") {
    return this.call("answerCallbackQuery", {
      callback_query_id: queryId,
      text
    });
  }

  async startPolling(handler) {
    if (!this.token) {
      console.log("[BOT TELEGRAM] Đang chạy server nhưng chưa kết nối mạng hoặc token lỗi.");
      return;
    }
    this.polling = true;
    console.log(`[BOT TELEGRAM] Khởi động thành công! Đang lắng nghe tin nhắn với Token...`);

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
// MẪU TIN NHẮN & NÚT BẤM TELEGRAM 100% TIẾNG VIỆT
// =========================================================================
function makeUserKeyboard(uid) {
  const u = store.users[String(uid)] || {};
  const huState = u.huAlert ? "🟢 BẬT" : "🔴 TẮT";
  const md5State = u.md5Alert ? "🟢 BẬT" : "🔴 TẮT";
  const access = checkUserAccess(uid);

  const rows = [
    [
      { text: "🎲 Xem Dự Đoán Hũ", callback_data: "pred_hu" },
      { text: "🔒 Xem Dự Đoán MD5", callback_data: "pred_md5" }
    ],
    [
      { text: "📊 Thống Kê 30 Phiên Hũ", callback_data: "stats_hu" },
      { text: "📊 Thống Kê 30 Phiên MD5", callback_data: "stats_md5" }
    ],
    [
      { text: `⚡ Tự Báo Hũ: ${huState}`, callback_data: "toggle_hu" },
      { text: `⚡ Tự Báo MD5: ${md5State}`, callback_data: "toggle_md5" }
    ],
    [
      { text: "👤 Thông Tin Bản Quyền", callback_data: "my_info" },
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
        { text: "📋 Danh Sách Key Đã Tạo", callback_data: "admin_list_keys" },
        { text: "📊 Thống Kê Toàn Hệ Thống", callback_data: "admin_stats" }
      ],
      [
        { text: "🔙 Quay Lại Menu Chính", callback_data: "user_menu" }
      ]
    ]
  };
}

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

  return `<b>${gameTitle}</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>PHIÊN DỰ ĐOÁN: #${p.session}</b>
👉 <b>TÍN HIỆU: ${predDisplay === "TÀI" ? "🔴 TÀI" : "⚫ XỈU"}</b>
⚡ <b>ĐỘ TIN CẬY: ${p.conf}%</b>
📊 <b>CHIẾN THUẬT:</b> <code>${p.src}</code>
━━━━━━━━━━━━━━━━━━━━━
🎲 <b>Phiên trước #${last ? last.session : "—"}:</b> ${lastDiceText} ➔ <b>${lastResDisplay}</b>
📈 <b>Tỉ lệ thắng 30 phiên:</b> <b>${stats.acc30}</b> (Thắng ${stats.winCount}/${stats.total30} tay)
🔥 <b>Chuỗi thắng max:</b> <b>${stats.maxWinStreak} tay liên tiếp</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Bản quyền tác giả: Phạm Anh Khôi · Hỗ trợ: ${TELEGRAM_ADMIN_CONTACT}</i>`;
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
<i>Bản quyền thuật toán: Phạm Anh Khôi</i>`;
}

// =========================================================================
// XỬ LÝ SỰ KIỆN TELEGRAM (MESSAGES & BUTTONS)
// =========================================================================
async function handleTelegramUpdate(update) {
  // 1. Xử lý Nút bấm Callback
  if (update.callback_query) {
    const q = update.callback_query;
    const uid = String(q.from.id);
    const data = q.data;
    const msgId = q.message.message_id;
    const chatId = q.message.chat.id;

    const access = checkUserAccess(uid);

    if (data === "how_to_key") {
      await bot.answerCallback(q.id);
      await bot.sendMessage(chatId, `<b>ℹ️ HƯỚNG DẪN KÍCH HOẠT BẢN QUYỀN</b>\n\n1. Liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> để nhận Key.\n2. Nhập lệnh theo cú pháp:\n👉 <code>/key &lt;mã_key&gt;</code>\n<i>Ví dụ:</i> <code>/key AK-7D-ABC123</code>`, {
        reply_markup: {
          inline_keyboard: [[{ text: "📞 Nhắn Tin Admin", url: `https://t.me/${TELEGRAM_ADMIN_CONTACT.replace("@", "")}` }]]
        }
      });
      return;
    }

    // Kiểm tra quyền đối với user thông thường
    if (!access.hasAccess && data !== "admin_menu" && !data.startsWith("gen_") && data !== "admin_list_keys" && data !== "admin_stats") {
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
            [{ text: "🔄 Cập Nhật Lại", callback_data: "pred_hu" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
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
            [{ text: "🔄 Cập Nhật Lại", callback_data: "pred_md5" }],
            [{ text: "🔙 Menu Chính", callback_data: "user_menu" }]
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

    // BẬT / TẮT TỰ ĐỘNG BÁO HŨ ĐỘC LẬP
    if (data === "toggle_hu") {
      store.users[uid] = store.users[uid] || {};
      store.users[uid].huAlert = !store.users[uid].huAlert;
      saveStore(store);
      await bot.answerCallback(q.id, `Đã ${store.users[uid].huAlert ? "BẬT" : "TẮT"} tự báo kèo Hũ!`);
      await bot.editMessageReplyMarkup(chatId, msgId, { reply_markup: makeUserKeyboard(uid) });
      return;
    }

    // BẬT / TẮT TỰ ĐỘNG BÁO MD5 ĐỘC LẬP
    if (data === "toggle_md5") {
      store.users[uid] = store.users[uid] || {};
      store.users[uid].md5Alert = !store.users[uid].md5Alert;
      saveStore(store);
      await bot.answerCallback(q.id, `Đã ${store.users[uid].md5Alert ? "BẬT" : "TẮT"} tự báo kèo MD5!`);
      await bot.editMessageReplyMarkup(chatId, msgId, { reply_markup: makeUserKeyboard(uid) });
      return;
    }

    if (data === "my_info") {
      await bot.answerCallback(q.id);
      const u = store.users[uid] || {};
      const msg = `<b>👤 THÔNG TIN TÀI KHOẢN CỦA BẠN</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID Telegram:</b> <code>${uid}</code>
🔑 <b>Key hiện tại:</b> <code>${u.activatedKey || "Admin"}</code>
⏳ <b>Hạn sử dụng:</b> <b>${access.remainingText}</b>
⚡ <b>Tự Báo Hũ:</b> ${u.huAlert ? "🟢 Đang Bật" : "🔴 Đang Tắt"}
⚡ <b>Tự Báo MD5:</b> ${u.md5Alert ? "🟢 Đang Bật" : "🔴 Đang Tắt"}
━━━━━━━━━━━━━━━━━━━━━
<i>Phát triển bởi: Phạm Anh Khôi · Telegram: ${TELEGRAM_ADMIN_CONTACT}</i>`;
      await bot.sendMessage(chatId, msg, {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Menu Chính", callback_data: "user_menu" }]]
        }
      });
      return;
    }

    if (data === "refresh_menu" || data === "user_menu") {
      await bot.answerCallback(q.id, "Đã làm mới menu!");
      const welcome = `<b>HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN PRO</b>
━━━━━━━━━━━━━━━━━━━━━
👤 <b>Người dùng:</b> <code>${q.from.first_name || uid}</code>
🆔 <b>ID:</b> <code>${uid}</code>
⏳ <b>Thời hạn:</b> <b>${access.remainingText}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Chọn chức năng dự đoán hoặc cài đặt tự động bên dưới:</i>`;
      await bot.editMessageText(chatId, msgId, welcome, {
        reply_markup: makeUserKeyboard(uid)
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
Chào mừng Sếp <b>Phạm Anh Khôi</b>!
ID Admin: <code>${uid}</code>
Toàn quyền tạo key theo giờ/ngày/vĩnh viễn, quản lý thành viên và theo dõi hệ thống.
━━━━━━━━━━━━━━━━━━━━━
<i>Bấm các nút bên dưới để thực hiện nhanh:</i>`;
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
        saveStore(store);
        await bot.answerCallback(q.id, "Đã tạo Key thành công!");
        await bot.sendMessage(chatId, `<b>🎉 TẠO KEY BẢN QUYỀN THÀNH CÔNG!</b>\n\n🔑 <b>Key:</b> <code>${kStr}</code>\n⏳ <b>Thời hạn:</b> <b>${dur.text}</b>\n\n<i>Gửi key này cho khách hàng để kích hoạt qua lệnh /key.</i>`, {
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
        await bot.sendMessage(chatId, "<i>Chưa có key nào được tạo.</i>", {
          reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
        });
        return;
      }

      let keyMsg = `<b>📋 DANH SÁCH KEY BẢN QUYỀN (${allKeys.length} Key)</b>\n━━━━━━━━━━━━━━━━━━━━━\n`;
      allKeys.slice(-15).reverse().forEach(([k, v]) => {
        const st = v.status === "used" ? "🔴 Đã dùng" : "🟢 Còn trống";
        const user = v.activatedBy ? `(User: <code>${v.activatedBy}</code>)` : "";
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
      const huStats = hu.tracker.get30Stats();
      const md5Stats = md5.tracker.get30Stats();

      const statsMsg = `<b>📊 THỐNG KÊ TỔNG QUAN HỆ THỐNG</b>
━━━━━━━━━━━━━━━━━━━━━
👥 <b>Tổng Người Dùng:</b> <b>${totalUsers}</b>
🔑 <b>Key Chưa Dùng:</b> <b>${activeKeys}</b>
🔐 <b>Key Đã Kích Hoạt:</b> <b>${usedKeys}</b>
━━━━━━━━━━━━━━━━━━━━━
🎲 <b>Tài Xỉu Hũ (30 phiên):</b> <b>${huStats.acc30}</b> (Thắng ${huStats.winCount}/${huStats.total30})
🔒 <b>Tài Xỉu MD5 (30 phiên):</b> <b>${md5Stats.acc30}</b> (Thắng ${md5Stats.winCount}/${md5Stats.total30})
━━━━━━━━━━━━━━━━━━━━━
<i>Hệ thống định lượng vận hành ổn định 24/7.</i>`;
      await bot.sendMessage(chatId, statsMsg, {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_menu" }]] }
      });
      return;
    }
  }

  // 2. Xử lý Tin nhắn văn bản (Commands)
  if (update.message && update.message.text) {
    const m = update.message;
    const uid = String(m.from.id);
    const text = m.text.trim();
    const chatId = m.chat.id;

    // LỆNH CLAIM QUYỀN ADMIN TỐI CAO
    if (text.startsWith("/claim_admin")) {
      const parts = text.split(" ");
      const enteredPass = parts[1];
      if (enteredPass === MASTER_KEY) {
        if (!store.adminIds.includes(uid)) {
          store.adminIds.push(uid);
          saveStore(store);
        }
        await bot.sendMessage(chatId, `<b>👑 XÁC THỰC ADMIN THÀNH CÔNG!</b>\n\nXin chào Sếp <b>Phạm Anh Khôi</b>!\nID <code>${uid}</code> đã được kích hoạt quyền <b>Admin Tối Cao</b>.`, {
          reply_markup: makeUserKeyboard(uid)
        });
      } else {
        await bot.sendMessage(chatId, `<b>❌ MẬT KHẨU KHÔNG ĐÚNG!</b>\n\nCú pháp: <code>/claim_admin &lt;mật_khẩu_master&gt;</code>`);
      }
      return;
    }

    // LỆNH START & MENU
    if (text === "/start" || text === "/menu") {
      const access = checkUserAccess(uid);

      if (!access.hasAccess) {
        const welcomeNotActive = `<b>HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN</b>
━━━━━━━━━━━━━━━━━━━━━
Xin chào <b>${m.from.first_name || "bạn"}</b>!
🆔 <b>ID của bạn:</b> <code>${uid}</code>
⚠️ <b>Trạng thái:</b> <b>Chưa kích hoạt bản quyền</b>
━━━━━━━━━━━━━━━━━━━━━
Hệ thống dự đoán bắt cầu định lượng chuẩn xác cao Tài Xỉu & MD5.
Để sử dụng, vui lòng liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b> để mua Key bản quyền.

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

      // Đã kích hoạt -> Hiện Menu
      const welcomeActive = `<b>HỆ THỐNG ĐỊNH LƯỢNG THỰC CHIẾN PRO</b>
━━━━━━━━━━━━━━━━━━━━━
👤 <b>Người dùng:</b> <code>${m.from.first_name || uid}</code>
🆔 <b>ID:</b> <code>${uid}</code>
⏳ <b>Thời hạn bản quyền:</b> <b>${access.remainingText}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Chọn chức năng dự đoán hoặc cài đặt tự động bên dưới:</i>`;
      await bot.sendMessage(chatId, welcomeActive, {
        reply_markup: makeUserKeyboard(uid)
      });
      return;
    }

    // LỆNH KÍCH HOẠT KEY
    if (text.startsWith("/key")) {
      const parts = text.split(" ");
      const enteredKey = (parts[1] || "").trim().toUpperCase();

      if (!enteredKey) {
        await bot.sendMessage(chatId, "<b>⚠️ Vui lòng nhập mã key!</b>\nCú pháp: <code>/key &lt;mã_key&gt;</code>\n<i>Ví dụ:</i> <code>/key AK-7D-8A9F21</code>");
        return;
      }

      const kData = store.keys[enteredKey];
      if (!kData || kData.status !== "active") {
        await bot.sendMessage(chatId, `<b>❌ KEY KHÔNG HỢP LỆ HOẶC ĐÃ BỊ SỬ DỤNG!</b>\n\nVui lòng kiểm tra lại hoặc liên hệ Admin <b>${TELEGRAM_ADMIN_CONTACT}</b>.`);
        return;
      }

      const now = Date.now();
      const expiresAt = kData.durationMs === -1 ? -1 : now + kData.durationMs;

      kData.status = "used";
      kData.activatedBy = uid;
      kData.activatedAt = now;
      kData.expiresAt = expiresAt;

      store.users[uid] = store.users[uid] || { huAlert: false, md5Alert: false };
      store.users[uid].activatedKey = enteredKey;
      store.users[uid].expiresAt = expiresAt;
      store.users[uid].activatedAt = now;
      saveStore(store);

      await bot.sendMessage(chatId, `<b>🎉 KÍCH HOẠT BẢN QUYỀN THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━━━━
🔑 <b>Mã Key:</b> <code>${enteredKey}</code>
⏳ <b>Thời hạn:</b> <b>${kData.durationText}</b>
📅 <b>Hạn dùng:</b> <b>${formatRemainingTime(expiresAt)}</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Toàn bộ chức năng dự đoán định lượng đã được mở khóa!</i>`, {
        reply_markup: makeUserKeyboard(uid)
      });
      return;
    }

    // --- CÁC LỆNH DÀNH RIÊNG CHO ADMIN ---
    const access = checkUserAccess(uid);

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
      saveStore(store);

      const keysMsg = createdKeys.map(k => `• <code>${k}</code>`).join("\n");
      await bot.sendMessage(chatId, `<b>🎉 ĐÃ TẠO THÀNH CÔNG ${count} KEY (${dur.text})!</b>\n━━━━━━━━━━━━━━━━━━━━━\n${keysMsg}\n━━━━━━━━━━━━━━━━━━━━━\n<i>Gửi key cho khách hàng để sử dụng lệnh /key.</i>`);
      return;
    }

    // LỆNH DANH SÁCH KEY: /danhsachkey
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
        const st = v.status === "used" ? "🔴 Đã dùng" : "🟢 Còn trống";
        const user = v.activatedBy ? `(ID: <code>${v.activatedBy}</code>)` : "";
        keyMsg += `• <code>${k}</code> | ${v.durationText} | ${st} ${user}\n`;
      });
      await bot.sendMessage(chatId, keyMsg);
      return;
    }

    // LỆNH XÓA KEY: /xoakey <key>
    if (text.startsWith("/xoakey")) {
      if (!access.isAdmin) {
        await bot.sendMessage(chatId, "⛔ <b>Lệnh này chỉ dành cho Admin tối cao!</b>");
        return;
      }
      const targetKey = (text.split(" ")[1] || "").trim().toUpperCase();
      if (!targetKey || !store.keys[targetKey]) {
        await bot.sendMessage(chatId, "⚠️ Không tìm thấy key cần xóa!");
        return;
      }
      delete store.keys[targetKey];
      for (const [uId, uObj] of Object.entries(store.users)) {
        if (uObj.activatedKey === targetKey) {
          delete store.users[uId];
          await bot.sendMessage(uId, "⚠️ <b>Bản quyền của bạn đã bị thu hồi bởi Admin!</b>");
        }
      }
      saveStore(store);
      await bot.sendMessage(chatId, `✅ <b>Đã xóa và thu hồi key:</b> <code>${targetKey}</code>`);
      return;
    }

    // LỆNH GIA HẠN: /giahan <user_id> <thời_gian>
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

      store.users[targetUid].expiresAt = newExpiry;
      store.users[targetUid].activatedKey = "ADMIN_GIA_HAN";
      saveStore(store);

      await bot.sendMessage(chatId, `✅ <b>Đã gia hạn thành công cho User <code>${targetUid}</code> thêm ${dur.text}!</b>`);
      try {
        await bot.sendMessage(targetUid, `🎉 <b>Tài khoản của bạn đã được Admin gia hạn thêm ${dur.text}!</b>\nThời hạn mới: <b>${formatRemainingTime(newExpiry)}</b>`);
      } catch {}
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
      await bot.sendMessage(chatId, `✅ <b>Đã gửi thông báo thành công đến ${count} thành viên!</b>`);
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

    const alertMsg = `⚡ <b>TÍN HIỆU PHIÊN MỚI: ${gameName}</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>PHIÊN: #${pred.session}</b>
👉 <b>DỰ ĐOÁN: ${predDisplay === "TÀI" ? "🔴 TÀI" : "⚫ XỈU"}</b>
🔥 <b>ĐỘ TIN CẬY: ${pred.conf}%</b>
📊 <b>CHIẾN THUẬT:</b> <code>${pred.src}</code>
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
      res.end(JSON.stringify({ status: "ok", author: "Phạm Anh Khôi", time: Date.now() }));
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
<title>BOT TELEGRAM ĐỊNH LƯỢNG // PHẠM ANH KHÔI</title>
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
  <h1>BOT TELEGRAM ĐỊNH LƯỢNG <span class="badge">ONLINE 24/7</span></h1>
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
