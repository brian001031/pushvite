import express, { type Request, type Response } from "express";
import cron from "node-cron";
import moment from "moment-timezone";
import QRCode from "qrcode";
import redis from "../modules/redisConnect";
import os from "os";

type ShiftType = "DAY" | "NIGHT" | "REGULAR";

interface ScheduleTrackRecordRow {
  PositionArea: string | null;
  Position: string | null;
  AssignScheduleID: string | null;
  EmployeeWorkTime: string | null;
  SortWorkTimeStart: Date | null;
  SortWorkTimeEnd: Date | null;
  DeleteDateTime: Date | null;
}

interface CachedShiftEntry {
  userId: string;
  workDate: string;
  firstIn: number | null;
  lastOut: number | null;
  shift: string;
  status: "ACTIVE" | "INACTIVE" | "PREWARM";
  lastTimestamp: number;
  shiftStartTime: string;
}

// --- 初始化 ---
const app = express();
app.use(express.json());

const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();


// 批次掃描 Redis keys
async function scanRedisKeys(pattern: string, count = 500): Promise<string[]> {
  let cursor = "0";
  const keys: string[] = [];
  do {
    const reply: any = await redis.scan(cursor, {
      MATCH: pattern,
      COUNT: count,
    });

    if (Array.isArray(reply)) {
      cursor = String(reply[0]);
      keys.push(...(reply[1] || []));
    } else if (reply && typeof reply === "object") {
      cursor = String(reply.cursor ?? "0");
      if (Array.isArray(reply.keys)) {
        keys.push(...reply.keys);
      }
    } else {
      break;
    }
  } while (cursor !== "0");
  return keys;
}

// 依據時間切換班別範圍
function resolveShiftWindow(shiftType: ShiftType) {
  if (shiftType === "DAY") return { gte: "07:00:00", lte: "08:00:00" };
  if (shiftType === "NIGHT") return { gte: "19:00:00", lte: "20:00:00" };
  return { gte: "00:00:00", lte: "23:59:59" };
}

// 預載班別資訊到 Redis 
async function rollingPrewarm(shiftType: ShiftType) {
  console.log(`開始預載班別資訊，班別類型: ${shiftType}`);
  const prisma = prismaHr;
  const today = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  const { gte, lte } = resolveShiftWindow(shiftType);
  const gteStr = `${today} ${gte}`;
  const lteStr = `${today} ${lte}`;

  try {
    const todayMembers = await prisma.$queryRaw<ScheduleTrackRecordRow[]>`
      SELECT * FROM schedule_trackrecord
      WHERE 
        SortWorkTimeStart >= ${gteStr}
        AND SortWorkTimeStart <= ${lteStr}
        AND (
          DeleteDateTime IS NOT NULL
          OR DeleteDateTime NOT IN ('0000-00-00 00:00:00', '')
        )
      `;

    const tx = redis.multi();
    for (const member of todayMembers) {
      const posArea = member.PositionArea || "UNKNOWN";
      const pos = member.Position || "UNKNOWN";
      const userId = member.AssignScheduleID || "UNKNOWN";
      const redisKey = `tr-${posArea}:${pos}:${userId}`;
      const cacheEntry: CachedShiftEntry = {
        userId,
        workDate: member.SortWorkTimeStart ? moment(member.SortWorkTimeStart).format("YYYY-MM-DD") : today,
        firstIn: null,
        lastOut: null,
        shift: member.EmployeeWorkTime || "no_get",
        status: "PREWARM",
        lastTimestamp: 0,
        shiftStartTime: member.SortWorkTimeStart ? moment(member.SortWorkTimeStart).format("HH:mm") : "00:00",
      };
      tx.set(redisKey, JSON.stringify(cacheEntry));
    }

    const result = await tx.exec();
    console.log(`預熱完成：${result?.length ?? 0} 筆記錄已寫入 Redis。`);
    return todayMembers;
  } catch (error) {
    console.error("預載班別資訊失敗:", error);
    throw error;
  }
}

// 自動登出程序
async function forceLogout() {
  try {
    const keys = await scanRedisKeys("tr-*");
    if (!keys.length) {
      console.log("自動登出任務: 沒有找到任何 member");
      return;
    }

    const rawValues = await redis.mget(keys);
    const updates: Array<{ key: string; value: CachedShiftEntry }> = [];

    rawValues.forEach((raw: any, idx: number) => {
      if (!raw) return;
      try {
        const entry = JSON.parse(raw) as CachedShiftEntry;
        entry.status = "INACTIVE";
        const timestamp = Date.now();
        entry.lastOut = entry.lastOut ?? timestamp;
        entry.lastTimestamp = timestamp;
        updates.push({ key: keys[idx], value: entry });
      } catch (err) {
        console.warn(`自動登出任務: 無法解析 ${keys[idx]} 的資料`, err);
      }
    });

    if (!updates.length) {
      console.log("自動登出任務: 沒有需要更新的資料");
      return;
    }

    const tx = redis.multi();
    updates.forEach(({ key, value }) => tx.set(key, JSON.stringify(value)));
    await tx.exec();
    console.log(`自動登出任務: 已更新 ${updates.length} 筆資料`);
  } catch (err) {
    console.error("自動登出任務失敗:", err);
  }
}

// 生成 QR code
async function createNewLogin_QRcode() {
  const today = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  const prisma = prismaHr;

  try {
    const checkAllStation = await prisma.AbsentManagerRoster.findMany({
      select: { authPosition: true }
    });

    const allPositions = checkAllStation
      .map((s: any) => s.authPosition)
      .filter(Boolean)
      .flatMap((pos: any) => (Array.isArray(pos) ? pos : [pos]));

    const allStation = [...new Set(allPositions.map(String))];
    console.log("所有站別列表:", allStation);

    if (!allStation.length) {
      console.warn("沒有找到任何站別資訊，無法生成 QR code");
      return { success: false, message: "沒有站別資訊" };
    }

    const qrResults: Array<{ station: string; url: string; token: string; qrDataUrl: string }> = [];

    for (const station of allStation) {
      try {
        // 每天每站生成唯一 token（日期 + 隨機碼）
        const token = `${today}_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        
        // QR code 連結到前端頁面，帶上站別 + token 參數
        // 根據環境判斷 IP
        const currentIp = os.hostname() === "COLDmain" ? "192.168.3.101" : "localhost";
        const url = `http://${currentIp}:3000/bulletinboard_checkin?station=${encodeURIComponent(station as string)}&token=${token}`;
        console.log(`正在生成 ${station} 的 QR code，連結: ${url}`);

        const qrDataUrl = await QRCode.toDataURL(url, {
          width: 300,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" }
        });

        // 存 QR code 到 Redis，24 小時過期
        await redis.set(`qr:positionArea:${station}`, JSON.stringify({
          date: today,
          token,
          url,
          qrDataUrl
        }), "EX", 86400);

        qrResults.push({ station: String(station), url, token, qrDataUrl });
        console.log(`✅ ${station} QR code 已生成`);
      } catch (error) {
        console.error(`生成 ${station} QR code 失敗:`, error);
      }
    }

    console.log(`QR code 生成完成，共 ${qrResults.length} 個站別`);
    return { success: true, count: qrResults.length, stations: qrResults };
  } catch (error) {
    console.error("生成 QR code 失敗:", error);
    throw error;
  }
}

// ============ 定時任務 ============

// 每天 07:00 和 19:00 預載當天班別資訊
cron.schedule("0 7 * * *", async () => {
  try {
    await rollingPrewarm("DAY");
  } catch (err) {
    console.error("07:00 班別預載排程失敗:", err);
  }
});
cron.schedule("0 19 * * *", async () => {
  try {
    await rollingPrewarm("NIGHT");
  } catch (err) {
    console.error("19:00 班別預載排程失敗:", err);
  }
});

// 每天 12:00 和 00:00 自動登出
cron.schedule("0 12 * * *", async () => {
  try {
    await forceLogout();
  } catch (err) {
    console.error("12:00 自動登出排程失敗:", err);
  }
});
cron.schedule("0 0 * * *", async () => {
  try {
    await forceLogout();
  } catch (err) {
    console.error("00:00 自動登出排程失敗:", err);
  }
});

// 每天凌晨 00:05 重新生成 QR code
cron.schedule("5 0 * * *", async () => {
  console.log("🔄 每日 QR code 更新開始...");
  try {
    const result = await createNewLogin_QRcode();
    console.log(`📱 QR code 更新完成，共 ${result?.count || 0} 個站別`);
  } catch (err) {
    console.error("❌ QR code 更新失敗:", err);
  }
});

// ============ API 路由 ============

// 取得所有 QR code
app.get("/qrcodes", async (_req: Request, res: Response) => {
  let codeImg = "" as string 
  try {
    const keys = await scanRedisKeys("qr:positionArea:*");
    if (!keys.length) {
      return res.json({ count: 0, qrcodes: [] });
    }
    const rawValues = await redis.mget(keys);
    const qrcodes = keys.map((key, idx) => {
      const station = key.replace("qr:positionArea:", "");
      const data = rawValues[idx] ? JSON.parse(rawValues[idx] as string) : null;
      console.log (`QR code 資訊 - 站別: ${station}, 連結: ${data?.url} , QRcode Data , ${data}`);
      return { station, ...data };
    }).filter(Boolean);

    res.json({ count: qrcodes.length, qrcodes });
  } catch (err) {
    console.error("取得 QR code 失敗:", err);
    res.status(500).json({ error: true, msg: "伺服器錯誤" });
  }
});

// 驗證 token 是否有效（前端掃描 QR code 後先呼叫此 API）
app.get("/verify-token", async (req: Request, res: Response) => {
  const station = req.query.station as string;
  const token = req.query.token as string;

  if (!station || !token) {
    return res.status(400).json({ error: true, msg: "缺少 station 或 token" });
  }

  try {
    const qrDataRaw = await redis.get(`qr:positionArea:${station}`);
    if (!qrDataRaw) {
      return res.json({ error: true, valid: false, msg: "無效站別，QR code 不存在或已過期" });
    }

    const qrData = JSON.parse(qrDataRaw);
    if (qrData.token !== token) {
      return res.json({ error: true, valid: false, msg: "QR code 已過期，請重新掃描今日 QR code" });
    }

    return res.json({ 
      error: false, 
      valid: true, 
      msg: "驗證成功",
      station,
      date: qrData.date
    });
  } catch (err) {
    console.error("verify-token 錯誤:", err);
    return res.status(500).json({ error: true, msg: "伺服器錯誤" });
  }
});

// 前端登入後呼叫，確認 userId 是否在 Redis tr-* 中
// 需要驗證 station + token
app.post("/checkin", async (req: Request, res: Response) => {
  const { userId, station, token } = req.body;

  if (!userId) {
    return res.status(400).json({ error: true, msg: "缺少 userId" });
  }

  // 如果有帶 station + token，先驗證 token 是否有效
  if (station && token) {
    const qrDataRaw = await redis.get(`qr:positionArea:${station}`);
    if (!qrDataRaw) {
      return res.status(403).json({ error: true, msg: "無效站別，QR code 不存在或已過期" });
    }
    const qrData = JSON.parse(qrDataRaw);
    if (qrData.token !== token) {
      return res.status(403).json({ error: true, msg: "QR code 已過期，請重新掃描今日 QR code" });
    }
  }

  try {
    const keys = await scanRedisKeys("tr-*");
    let foundKey: string | null = null;
    let foundEntry: CachedShiftEntry | null = null;

    for (const key of keys) {
      if (key.endsWith(`:${userId}`)) {
        const raw = await redis.get(key);
        if (raw) {
          foundKey = key;
          foundEntry = JSON.parse(raw);
          break;
        }
      }
    }

    if (!foundKey || !foundEntry) {
      return res.json({ error: true, msg: "no data" });
    }

    // 更新登入時間
    const now = Date.now();
    foundEntry.status = "ACTIVE";
    foundEntry.firstIn = foundEntry.firstIn ?? now;
    foundEntry.lastTimestamp = now;

    await redis.set(foundKey, JSON.stringify(foundEntry));

    return res.json({
      error: false,
      msg: "打卡成功",
      data: foundEntry,
      station: station || null
    });
  } catch (err) {
    console.error("checkin 錯誤:", err);
    return res.status(500).json({ error: true, msg: "伺服器錯誤" });
  }
});

// 查看 Redis 中的 tr-* keys
app.get("/cache/keys", async (req: Request, res: Response) => {
  try {
    const keys = await scanRedisKeys("tr-*");
    if (req.query.detail === "true") {
      const rawValues = keys.length ? await redis.mget(keys) : [];
      const entries = keys.map((key, idx) => ({
        key,
        value: rawValues[idx] ? JSON.parse(rawValues[idx] as string) : null
      }));
      return res.json({ count: entries.length, entries });
    }
    res.json({ count: keys.length, keys });
  } catch (err) {
    console.error("cache/keys 查詢失敗", err);
    res.status(500).json({ error: "無法讀取 Redis key" });
  }
});

// 測試用路由：可測試各項功能
app.get("/test", async (req: Request, res: Response) => {
  const action = req.query.action as string;
  const checkNowTime = moment().tz("Asia/Taipei").format("HH:mm");
  
  let shiftType: ShiftType = "REGULAR";
  if (checkNowTime >= "07:00" && checkNowTime < "08:00") shiftType = "DAY";
  else if (checkNowTime >= "19:00" && checkNowTime < "20:00") shiftType = "NIGHT";

  try {
    let result: any;

    switch (action) {
      case "prewarm":
        result = await rollingPrewarm(shiftType);
        break;
      case "logout":
        result = await forceLogout();
        break;
      case "qrcode":
        result = await createNewLogin_QRcode();
        break;
      default:
        return res.json({
          msg: "請指定 action 參數",
          available: ["prewarm", "logout", "qrcode"],
          example: "/onBoardConfirm/test?action=qrcode",
          currentTime: checkNowTime,
          currentShift: shiftType
        });
    }

    res.json({
      msg: "測試完成",
      action,
      time: checkNowTime,
      shift: shiftType,
      result
    });
  } catch (err) {
    console.error("測試錯誤:", err);
    res.status(500).json({ error: true, msg: "測試失敗", detail: String(err) });
  }
});

// ============ 啟動時初始化 ============

// 啟動時自動生成 QR code
// (async () => {
//   try {
//     console.log("📱 啟動時初始化 QR code...");
//     const result = await createNewLogin_QRcode();
//     console.log(`✅ QR code 初始化完成，共 ${result?.count || 0} 個站別`);
//   } catch (err) {
//     console.error("❌ QR code 初始化失敗:", err);
//   }
// })();




module.exports = app;
