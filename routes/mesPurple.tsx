const express = require("express");
const router = express.Router();

import { json } from "body-parser";
import { group } from "console";
import { create } from "domain";
import moment from 'moment-timezone';
import { format } from "path";
const nodemailer = require('nodemailer');
const MS_dbConfig = require(__dirname + "/../modules/mssql_newconnect.js"); // 新增 MSSQL 共用連線池


const axios = require("axios");
const path = require("path");
const envPath = path.resolve(__dirname, "../.env");
const mssql = require('mssql');


// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫
const dbcon = require(__dirname + "/../modules/mysql_connect.js");     // hr 資料庫

const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();

const redisClient = require(__dirname + "/../modules/redisConnect.js"); // Redis 連線模組
const schedule = require("node-schedule");
const { getSocketServer } = require(__dirname + "/../modules/socketServer.ts");



const connectMssql = async (query) => {
  let now = new Date();
  const taipeiTime = moment(now).tz("Asia/Taipei");
  const hour = taipeiTime.hour();
  let start, end;

  // if (hour >= 8 && hour < 20) {
  //   // 早班: 8:00 - 20:00
  //   start = taipeiTime
  //     .clone()
  //     .set({ hour: 8, minute: 0, second: 0 })
  //     .format("YYYY-MM-DD HH:mm:ss");
  //   end = taipeiTime
  //     .clone()
  //     .set({ hour: 20, minute: 0, second: 0 })
  //     .format("YYYY-MM-DD HH:mm:ss");
  // } else {
  //   // 晚班: 20:00 - 次日8:00
  //   start = taipeiTime
  //     .clone()
  //     .set({ hour: 20, minute: 0, second: 0 })
  //     .format("YYYY-MM-DD HH:mm:ss");
  //   end = taipeiTime
  //     .clone()
  //     .add(1, "day")
  //     .set({ hour: 8, minute: 0, second: 0 })
  //     .format("YYYY-MM-DD HH:mm:ss");
  // }

  start = taipeiTime.startOf('day').format("YYYY-MM-DD HH:mm:ss");
  end = taipeiTime.endOf('day').format("YYYY-MM-DD HH:mm:ss");

  try {
    const pool = await mssql.connect(MS_dbConfig);
    const request = pool.request(); // ✅ 必須從 pool 拿出 request 物件
    request.input("start", start);
    request.input("end", end);

    const result = await request.query(query); // 執行查詢

    await pool.close(); // 查詢完即關閉
    return result.recordset; // 取主要結果集
  } catch (err) {
    console.error("Error connecting to SQL Server:", err);
    return [];
  }
};

let checkIfWindowOn = false;
let socketBindingInitialized = false;
let mesPurpleIo = null;
let mesPurpleRoomKey = "mes:main_FrontSet_Page";



// preWarning 給到Redis 的資料格式
const dataSendToRedis = async () => {
  let front = await main_FrontSet_Page_front();
  let middle = await main_FrontSet_Page_middle();
  let end = await main_FrontSet_Page_end();
  
  try{

    let keyFront = 'mes:front'
    let valueFront = JSON.stringify(front);

    let keyMiddle = 'mes:middle'
    let valueMiddle = JSON.stringify(middle);

    let keyEnd = 'mes:end'
    let valueEnd = JSON.stringify(end);

    await redisClient.set(keyFront, valueFront);
    await redisClient.set(keyMiddle, valueMiddle);
    await redisClient.set(keyEnd, valueEnd);


  }catch(error){
    console.error("Redis 連線錯誤:", error);
  }
  
}

const DATA_SEND_REDIS_REFRESH_JOB_NAME = "mesPurple:dataSendToRedis:refresh1m";
const DATA_SEND_REDIS_LIVE_JOB_NAME = "mesPurple:dataSendToRedis:live10s";
const MES_PURPLE_ROOM = "mes:main_FrontSet_Page";
const MES_PURPLE_EVENT = "mesPurple:update";
let lastRedisBroadcastSignature = null;
let isRedisPushInFlight = false;
let isSqlRefreshInFlight = false;

const resolveRoomName = (roomInput) => {
  if (typeof roomInput === "string") {
    return roomInput.trim();
  }

  if (roomInput && typeof roomInput === "object" && typeof roomInput.room === "string") {
    return roomInput.room.trim();
  }

  return "";
};

const safeParseJson = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
};

const getMesRoomSize = () => {
  if (!mesPurpleIo || !mesPurpleIo.adapter || !mesPurpleIo.adapter.rooms) {
    return 0;
  }

  const room = mesPurpleIo.adapter.rooms.get(mesPurpleRoomKey);
  return room ? room.size : 0;
};

const refreshWindowStateByRoom = () => {
  checkIfWindowOn = getMesRoomSize() > 0;
  return checkIfWindowOn;
};

const getMesRedisPayload = async () => {
  const [frontRaw, middleRaw, endRaw] = await Promise.all([
    redisClient.get("mes:front"),
    redisClient.get("mes:middle"),
    redisClient.get("mes:end"),
  ]);

  const signature = JSON.stringify([
    frontRaw ?? null,
    middleRaw ?? null,
    endRaw ?? null,
  ]);

  return {
    front: safeParseJson(frontRaw),
    middle: safeParseJson(middleRaw),
    end: safeParseJson(endRaw),
    signature,
    hasValue: frontRaw != null || middleRaw != null || endRaw != null,
  };
};

const pushMesPayloadToRoom = async ({ force = false } = {}) => {
  if (isRedisPushInFlight) {
    return { pushed: false, reason: "in-flight" };
  }

  isRedisPushInFlight = true;

  const payload = await getMesRedisPayload();

  try {
    if (!payload.hasValue) {
      return { pushed: false, reason: "empty" };
    }

    if (!force && payload.signature === lastRedisBroadcastSignature) {
      return { pushed: false, reason: "unchanged" };
    }

    if (mesPurpleIo) {
      mesPurpleIo.to(mesPurpleRoomKey).emit(MES_PURPLE_EVENT, {
        front: payload.front,
        middle: payload.middle,
        end: payload.end,
        updatedAt: new Date().toISOString(),
      });
    }

    lastRedisBroadcastSignature = payload.signature;
    return { pushed: true, reason: force ? "forced" : "changed" };
  } finally {
    isRedisPushInFlight = false;
  }
};

const pushMesPayloadToSocket = async (socket) => {
  if (!socket) {
    return false;
  }

  const payload = await getMesRedisPayload();
  if (!payload.hasValue) {
    return false;
  }

  socket.emit(MES_PURPLE_EVENT, {
    front: payload.front,
    middle: payload.middle,
    end: payload.end,
    updatedAt: new Date().toISOString(),
  });

  return true;
};

const triggerRedisPushAsync = (source) => {
  Promise.resolve()
    .then(() => pushMesPayloadToRoom())
    .then((result) => {
      if (result && result.pushed) {
        // console.log(`[mesPurple] redis diff push from ${source}:`, result.reason);
      }
    })
    .catch((error) => {
      console.error(`[mesPurple] redis diff push failed from ${source}:`, error);
    });
};

const triggerSqlRefreshAsync = (source) => {
  if (isSqlRefreshInFlight) {
    return;
  }

  isSqlRefreshInFlight = true;

  Promise.resolve()
    .then(() => dataSendToRedis())
    .then(() => {
      // console.log(`[mesPurple] SQL->Redis refresh finished from ${source}`);
    })
    .catch((error) => {
      console.error(`[mesPurple] SQL->Redis refresh failed from ${source}:`, error);
    })
    .finally(() => {
      isSqlRefreshInFlight = false;
    });
};

// SQL 持續更新 Redis：每 1 分鐘背景刷新一次，不阻塞前端推播。
if (!schedule.scheduledJobs[DATA_SEND_REDIS_REFRESH_JOB_NAME]) {
  schedule.scheduleJob(DATA_SEND_REDIS_REFRESH_JOB_NAME, "*/1 * * * *", async () => {
    triggerSqlRefreshAsync("refresh-1m");
  });

  // console.log("[mesPurple] refresh job registered: SQL->Redis refresh (*/1 * * * *)");
}

triggerSqlRefreshAsync("startup");

// 有人開窗且進房時，每 1 分鐘只做 Redis 差異檢查與推播。
if (!schedule.scheduledJobs[DATA_SEND_REDIS_LIVE_JOB_NAME]) {
  schedule.scheduleJob(DATA_SEND_REDIS_LIVE_JOB_NAME, "*/1 * * * *", async () => {
    if (!checkIfWindowOn) {
      return;
    }

    triggerRedisPushAsync("live-1m");
  });

  // console.log("[mesPurple] live job registered: Redis diff push (*/1 * * * *)");
}

const bindMesPurpleSocketHandlers = ({ io, redis, roomKey }) => {
  if (socketBindingInitialized) {
    return;
  }

  mesPurpleIo = io;
  mesPurpleRoomKey = roomKey || MES_PURPLE_ROOM;
  socketBindingInitialized = true;

  io.on("connection", (socket) => {
    console.log(`[mesPurple] 使用者連線成功 ${socket.id}`);

    socket.on("joinRoom", async (roomInput) => {
      const roomName = resolveRoomName(roomInput);
      if (roomName !== mesPurpleRoomKey) {
        return;
      }

      await socket.join(roomName);

      refreshWindowStateByRoom();

      // 進房後先單獨推送給該連線，避免等待下一輪 1 分鐘排程。
      Promise.resolve()
        .then(() => pushMesPayloadToSocket(socket))
        .catch((error) => {
          console.error("[mesPurple] room joined initial socket push failed:", error);
        });

      triggerRedisPushAsync("join-room");
    });

    socket.on("leaveRoom", async (roomInput) => {
      const roomName = resolveRoomName(roomInput);
      if (roomName !== mesPurpleRoomKey) {
        return;
      }

      await socket.leave(roomName);

      setImmediate(() => {
        refreshWindowStateByRoom();
      });
    });

    socket.on("disconnect", () => {
      refreshWindowStateByRoom();
    });
  });

  refreshWindowStateByRoom();
};

const main_FrontSet_Page_front = async () => {
  const finalSend = [];

  // 🕒 動態生成時間區段（早/晚班）
  function getTimeCondition(now, columnName = "Time") {
    const moment = require("moment-timezone"); // 確保 moment-timezone 已經引入
    const taipeiTime = moment(now).tz("Asia/Taipei");

    // 確保時間條件是封閉區間 [startTime, endTime)
    return `DATE(${columnName}) = CURDATE()`;
  }
  const rollingTimeSelect = getTimeCondition(new Date(), "employee_InputTime");
  const mixingTimeSelect = getTimeCondition(new Date(), "BatchStart");
  const coaterTimeSelect = getTimeCondition(new Date(), "CreateAt");
  const coaterMesTime = getTimeCondition(new Date(), "startTime");

  // ------------------------
  // 📊 SQL 區塊
  // ------------------------

  // HR：混漿設備數
  const sql_mixing_devices = `
    SELECT 
      COUNT(CASE WHEN MixingSelect = "正極混漿" THEN 1 END) AS mixingDevice_cathode_count,
      COUNT(CASE WHEN MixingSelect = "負極混漿" THEN 1 END) AS mixingDevice_anode_count
    FROM mixing_register 
    WHERE MixingSelect IN ("正極混漿", "負極混漿")
    AND EngineerNo = "109"
    ;
  `;

  // HR：輾壓 / 分切設備數
  const sql_rolling_devices = `
    SELECT 
      COUNT(DISTINCT CASE WHEN selectWork = 'rollingcathode' THEN machineNo END) AS rollingDevice_cathode_count,
      COUNT(DISTINCT CASE WHEN selectWork = 'rollinganode' THEN machineNo END) AS rollingDevice_anode_count,
      COUNT(DISTINCT CASE WHEN selectWork = 'slittingcathode' THEN machineNo END) AS slittingDevice_cathode_count,
      COUNT(DISTINCT CASE WHEN selectWork = 'slittinganode' THEN machineNo END) AS slittingDevice_anode_count
    FROM rollingnslitting_register 
    WHERE selectWork IN ('rollingcathode', 'rollinganode', 'slittingcathode', 'slittinganode')
      AND engineerId = "264"
      AND (is_deleted IS NULL OR is_deleted = 0);
  `;

  // HR：塗佈設備數
  const sql_coating_devices = `
    SELECT 
    (SELECT machineForOPselect FROM coating_register WHERE selectWork = "coaterCathode" ORDER BY id DESC LIMIT 1 ) AS coater_Cathode_MachineSelect,
    (SELECT machineForOPselect FROM coating_register WHERE selectWork = "coaterAnode_S" ORDER BY id DESC LIMIT 1 ) AS coater_Anode_S_MachineSelect,
    (SELECT machineForOPselect FROM coating_register WHERE selectWork = "coaterAnode_D" ORDER BY id DESC LIMIT 1 ) AS coater_Anode_D_MachineSelect
  `;

  // MES：混漿資訊 (已修正為 FULL JOIN 邏輯，確保任一邊有資料都能回傳)
  const sql_mixing_other = `
    WITH
      LatestCathode AS (
          SELECT 'key' AS join_key, LotNo AS mixingCathode_LotNo, 
          ReceipeNo AS mixingCathode_ReceipeNo
          FROM mixingcathode_batch
          WHERE ${mixingTimeSelect} 
          AND EngineerNo = "109"
          ORDER BY BatchStart DESC LIMIT 1
      ),
      LatestAnode AS (
          SELECT 'key' AS join_key, LotNo AS mixingAnode_LotNo, 
          ReceipeNo AS mixingAnode_ReceipeNo
          FROM mixinganode_batch
          WHERE ${mixingTimeSelect} 
          AND EngineerNo = "109"
          ORDER BY BatchStart DESC LIMIT 1
      )
    -- 1. LEFT JOIN: 保留陰極資料，並嘗試匹配陽極
    SELECT
      C.mixingCathode_LotNo,
      C.mixingCathode_ReceipeNo,
      A.mixingAnode_LotNo,
      A.mixingAnode_ReceipeNo
    FROM LatestCathode AS C
    LEFT JOIN LatestAnode AS A ON C.join_key = A.join_key

    UNION ALL

    -- 2. RIGHT JOIN 邏輯: 保留陽極資料，但只保留那些在 1. 中沒有被匹配到的
    SELECT
      C.mixingCathode_LotNo,
      C.mixingCathode_ReceipeNo,
      A.mixingAnode_LotNo,
      A.mixingAnode_ReceipeNo
    FROM LatestAnode AS A
    LEFT JOIN LatestCathode AS C ON A.join_key = C.join_key
    WHERE C.join_key IS NULL;
  `;

  // MES：混漿批次完成數 (已修正 COUNT 函數空格問題)

  const sql_mixing_CountFinish = `
    WITH 
      CathodeCount AS (
        SELECT COUNT(CASE System_Step = "5" WHEN LotNo THEN 1 END) AS cathode_batch_count 
        FROM mixingcathode_batch
        WHERE ${mixingTimeSelect}
        AND EngineerNo != "349"
      ),
      AnodeCount AS (
        SELECT COUNT(CASE System_Step = "5" WHEN LotNo THEN 1 END) AS anode_batch_count 
        FROM mixinganode_batch
        WHERE ${mixingTimeSelect}
        AND EngineerNo != "349"
      )
    SELECT 
      CC.cathode_batch_count,
      AC.anode_batch_count
    FROM CathodeCount AS CC
    CROSS JOIN AnodeCount AS AC; 
  `;

  // mes 塗佈批次完成數
  const sql_coater_CountFinish = `
    WITH
    CathodeCount AS (
      SELECT SUM(CASE WHEN lotNumber IS NOT NULL THEN productionMeters END) AS coaterCathode_meter_sum,
             SUM(CASE WHEN lotNumber IS NOT NULL THEN lostMeter END) AS coaterCathode_lost_sum
      FROM mes.coatingcathode_batch
      WHERE ${coaterMesTime}
    ),
    AnodeCount AS (
      SELECT SUM(CASE WHEN lotNumber IS NOT NULL THEN productionMeters END) AS coaterCathode_meter_sum,
             SUM(CASE WHEN lotNumber IS NOT NULL THEN lostMeter END) AS coaterCathode_lost_sum
      FROM mes.coatinganode_batch
      WHERE ${coaterMesTime}
    )
    SELECT 
      CC.coaterCathode_meter_sum,
      CC.coaterCathode_lost_sum,
      AC.coaterCathode_meter_sum AS coaterAnode_meter_sum,
      AC.coaterCathode_lost_sum AS coaterAnode_lost_sum
    FROM CathodeCount AS CC
    CROSS JOIN AnodeCount AS AC;
  `;

  // MES：輾壓
  const sql_rolling_other = `
    SELECT 
      (SELECT lotNumber FROM rollingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS rollingCathode_LotNo,
      (SELECT SUM(rollingLength) FROM rollingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS rollingCathode_Length,
      (SELECT SUM(rollingLostLength) FROM rollingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS rollingcathode_LostLength,
      (SELECT lotNumber FROM rollinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS rollinganode_LotNo,
      (SELECT SUM(rollingLength) FROM rollinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS rollinganode_Length,
      (SELECT SUM(rollingLostLength) FROM rollinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS rollinganode_LostLength;
  `;

  // MES：分切
  const sql_slitting_other = `
    SELECT 
      (SELECT lotNumber_R FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS slittingcathode_LotNo_R,
      (SELECT lotNumber_L FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS slittingcathode_LotNo_L,
      (SELECT SUM(Length_R) FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittingcathode_Length_R,
      (SELECT SUM(Length_L) FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittingcathode_Length_L,
      (SELECT SUM(LostLength_R) FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittingcathode_LostLength_R,
      (SELECT SUM(LostLength_L) FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittingcathode_LostLength_L,
      (SELECT lotNumber_R FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS slittinganode_LotNo_R,
      (SELECT lotNumber_L FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS slittinganode_LotNo_L,
      (SELECT SUM(Length_R) FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittinganode_Length_R,
      (SELECT SUM(Length_L) FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittinganode_Length_L,
      (SELECT SUM(LostLength_R) FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittinganode_LostLength_R,
      (SELECT SUM(LostLength_L) FROM slittinganode_batch WHERE ${rollingTimeSelect}) AS slittinganode_LostLength_L;
  `;

  const sql_coater_other = `
    SELECT 
    (SELECT lotNumber FROM coatingcathode_batch WHERE ${coaterMesTime} ORDER BY id DESC LIMIT 1) AS lotNumber_Cathode,
    (SELECT lotNumber FROM coatinganode_batch WHERE ${coaterMesTime} ORDER BY id DESC LIMIT 1) AS lotNumber_Anode;
  `;

  try {
    const [
      [mixingDevicesArray],
      [rollingDevicesArray],
      [mixingOtherArray],
      [rollingOtherArray],
      [slittingOtherArray],
      [mixingCountArray],
      [coaterDevicesArray],
      [coaterCountFinishArray],
      [coaterOtherArray],
    ] = await Promise.all([
      dbcon.query(sql_mixing_devices),
      dbcon.query(sql_rolling_devices),
      dbmes.query(sql_mixing_other),
      dbmes.query(sql_rolling_other),
      dbmes.query(sql_slitting_other),
      dbmes.query(sql_mixing_CountFinish),
      dbcon.query(sql_coating_devices),
      dbmes.query(sql_coater_CountFinish),
      dbmes.query(sql_coater_other),
    ]);

    const rollingDevices = rollingDevicesArray[0] || {};
    const mixingDevices = mixingDevicesArray[0] || {};
    const mixingOther = mixingOtherArray[0] || {};

    const rollingOther = rollingOtherArray[0] || {};
    const slittingOther = slittingOtherArray[0] || {};
    const mixingCountFinish = mixingCountArray[0] || {};

    // 用於計算 Coater 機器數量 --start
  // coaterDevicesArray should be an array of rows returned from the query
  const coaterDevicesRow = Array.isArray(coaterDevicesArray) ? coaterDevicesArray.length : 0;
  // console.log("coaterDevicesRow:", coaterDevicesRow);

    const coaterDevices = coaterDevicesArray[0] || {};

    // 安全地解析 JSON 字符串，即使它是 null 或不是有效的 JSON
    const safeJsonParse = (input) => {
      // Normalize many possible input shapes to an array of strings
      if (input == null) return [];
      // If it's already an array, map to strings
      if (Array.isArray(input)) return input.map(String);
      if (typeof input !== 'string') return [];

      const str = input.trim();

      // Try JSON.parse first (handles '[]' and '"x"')
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        if (typeof parsed === 'string') return [parsed];
      } catch (e) {
        // ignore and fallback to heuristics below
      }

      // If there are quoted items, extract them
      const quoted = str.match(/"([^"]+)"/g);
      if (quoted) return quoted.map((s) => s.replace(/"/g, '').trim());

      // Comma-separated list
      if (str.indexOf(',') !== -1) {
        return str.split(',').map((s) => s.trim()).filter(Boolean);
      }

      // If string contains multiple machine tokens separated by whitespace but intended as one entry,
      // return the whole string as a single item (safer than splitting arbitrarily)
      if (str.length > 0) return [str];

      return [];
    };

    const cathodeArr = safeJsonParse(coaterDevices.coater_Cathode_MachineSelect);
    const anodeSArr = safeJsonParse(coaterDevices.coater_Anode_S_MachineSelect);
    const anodeDArr = safeJsonParse(coaterDevices.coater_Anode_D_MachineSelect);
    
    const anodeArr = [...anodeSArr, ...anodeDArr];

    const countCoaterMachines = cathodeArr.length + anodeArr.length;

    // console.log("Total Coater Machines Counted:", countCoaterMachines);
    // 用於計算 Coater 機器數量 --end

    const coaterCountFinish = coaterCountFinishArray[0] || {};
    // console.log("coaterCountFinish:", coaterCountFinish);

    const coaterArr = coaterOtherArray[0] || {};

    const rolling = {
      cathode: {
        deviceCount: rollingDevices.rollingDevice_cathode_count ?? 0,
        lotNo: rollingOther.rollingCathode_LotNo ?? "暫未生產",
        length: rollingOther.rollingCathode_Length ?? 0,
        lostLength: rollingOther.rollingcathode_LostLength ?? 0,
      },
      anode: {
        deviceCount: rollingDevices.rollingDevice_anode_count ?? 0,
        lotNo: rollingOther.rollinganode_LotNo ?? "暫未生產",
        length: rollingOther.rollinganode_Length ?? 0,
        lostLength: rollingOther.rollinganode_LostLength ?? 0,
      },
    };

    const slitting = {
      cathode: {
        deviceCount: rollingDevices.slittingDevice_cathode_count ?? 0,
        lotNo_R: slittingOther.slittingcathode_LotNo_R ?? "暫未生產",
        lotNo_L: slittingOther.slittingcathode_LotNo_L ?? "暫未生產",
        length_R: slittingOther.slittingcathode_Length_R ?? 0,
        length_L: slittingOther.slittingcathode_Length_L ?? 0,
        lostLength_R: slittingOther.slittingcathode_LostLength_R ?? 0,
        lostLength_L: slittingOther.slittingcathode_LostLength_L ?? 0,
      },
      anode: {
        deviceCount: rollingDevices.slittingDevice_anode_count ?? 0,
        lotNo_R: slittingOther.slittinganode_LotNo_R ?? "暫未生產",
        lotNo_L: slittingOther.slittinganode_LotNo_L ?? "暫未生產",
        length_R: slittingOther.slittinganode_Length_R ?? 0,
        length_L: slittingOther.slittinganode_Length_L ?? 0,
        lostLength_R: slittingOther.slittinganode_LostLength_R ?? 0,
        lostLength_L: slittingOther.slittinganode_LostLength_L ?? 0,
      },
    };

    const mixing = {
      cathode: {
        deviceCount: mixingDevices.mixingDevice_cathode_count ?? 0,
        lotNo: mixingOther.mixingCathode_LotNo ?? "暫未生產",
        receipeNo: mixingOther.mixingCathode_ReceipeNo ?? "",
        capacity: mixingCountFinish.cathode_batch_count ?? 0,
      },
      anode: {
        deviceCount: mixingDevices.mixingDevice_anode_count ?? 0,
        lotNo: mixingOther.mixingAnode_LotNo ?? "暫未生產",
        receipeNo: mixingOther.mixingAnode_ReceipeNo ?? "",
        capacity: mixingCountFinish.anode_batch_count ?? 0,
      },
    };

    const coater = {
      cathode: {
        deviceCount: cathodeArr.length ?? 0,
        lotNo: coaterArr.lotNumber_Cathode ?? "暫未生產",
        capacity: coaterCountFinish.coaterCathode_meter_sum ?? 0,
        lostLength: coaterCountFinish.coaterCathode_lost_sum ?? 0,
      },
      anode: {
        deviceCount: anodeArr.length ?? 0,
        lotNo: coaterArr.lotNumber_Anode ?? "暫未生產",
        capacity: coaterCountFinish.coaterAnode_meter_sum ?? 0,
        lostLength: coaterCountFinish.coaterAnode_lost_sum ?? 0,
      },
    };

    finalSend.push({ rolling, slitting, mixing, coater });

    return finalSend;
  } catch (error) {    
    console.error("❌ API 錯誤詳細:", error);
    return [];
  }
}

const main_FrontSet_Page_middle = async () => {
  
  const finalSend = [];
  // 根據現在時間動態生成 WHERE time 條件函數
  function getTimeCondition(now, columnName = "Time") {
    const taipeiTime = moment(now).tz("Asia/Taipei");
    const hour = taipeiTime.hour();
    let startTime, endTime;

    if (hour >= 8 && hour < 20) {
      // 早班: 8:00 - 20:00
      // startTime = taipeiTime.clone().set({ hour: 8, minute: 0, second: 0 });
      // endTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
      startTime = taipeiTime.clone().set({ hour: 0, minute: 0, second: 0 });
      endTime = taipeiTime.clone().set({ hour: 23, minute: 59, second: 59 });
    } else {
      // 晚班: 20:00 - 次日8:00
      startTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
      endTime = taipeiTime
        .clone()
        .add(1, "day")
        .set({ hour: 8, minute: 0, second: 0 });
    }

    return `${columnName} >= '${startTime.format(
      "YYYY-MM-DD HH:mm:ss"
    )}' AND ${columnName} < '${endTime.format("YYYY-MM-DD HH:mm:ss")}'`;
  }

  const now = new Date();
  const timeCondition = getTimeCondition(now, "Time");

  // mes db

  // 模切資訊:
  let sql_cutting_all = `
  SELECT
    -- Cathode 正極數據
    COUNT(DISTINCT CASE WHEN Caseno LIKE 'C%' THEN machine END) AS cuttingcathode_deviceCount,
    SUM(CASE WHEN OKNGSelection = '良品' AND Caseno LIKE 'C%' THEN Prdouction ELSE 0 END) AS cuttingcathode_autoGoodCapacity,
    SUM(CASE WHEN (ManualInput <> '' OR ManualInput <> 'NA') AND OKNGSelection = '手工良品' AND Caseno LIKE 'C%' THEN ManualInput ELSE 0 END) AS cuttingcathode_manualGoodCapacity,
    COUNT(DISTINCT CASE WHEN Caseno LIKE 'C%' AND StaffNo1 <> '' THEN StaffNo1 END) + COUNT(DISTINCT CASE WHEN Caseno LIKE 'C%' AND StaffNo2 <> '' THEN StaffNo2 END) AS cuttingcathode_staffCount,
    MAX(CASE WHEN Caseno LIKE 'C%' THEN Rollno ELSE NULL END) AS cuttingcathode_LotNo,


    -- Anode 負極數據 
    COUNT(DISTINCT CASE WHEN Caseno LIKE 'B%' THEN machine END) AS cuttinganode_deviceCount,
    SUM(CASE WHEN OKNGSelection = '良品' AND Caseno LIKE 'B%' THEN Prdouction ELSE 0 END) AS cuttinganode_autoGoodCapacity,
    SUM(CASE WHEN (ManualInput <> '' OR ManualInput <> 'NA') AND OKNGSelection = '手工良品' AND Caseno LIKE 'B%' THEN ManualInput ELSE 0 END) AS cuttinganode_manualGoodCapacity,
    COUNT(DISTINCT CASE WHEN Caseno LIKE 'B%' THEN StaffNo1 END) + COUNT(DISTINCT CASE WHEN Caseno LIKE 'B%' THEN StaffNo2 END) AS cuttinganode_staffCount,
    MAX(CASE WHEN Caseno LIKE 'B%' THEN Rollno ELSE NULL END) AS cuttinganode_LotNo
  FROM mes.cutting_bath
  WHERE ${timeCondition};
`;

  // 疊片資訊:
  let sql_stacking_all = `
  SELECT
      -- 1. 碟片機台數/人數/工單 (來自 stacking_realtime)
      T1.stacking_deviceCount_old,
      T1.stacking_staffCount,
      T1.stacking_WONO,
      -- 2. 算碟片機產能 (舊機台) (來自 stacking_batch)
      T2.stacking_capacit_old,
      -- 3. 算碟片機產能 (新/全部機台) (來自 stacking2_batch)
      T3.stacking_deviceCount_new,
      T3.stacking_capacit_new
  FROM
      -- 子查詢 A: 碟片機台數/人數/工單
      (
          SELECT
              COUNT(DISTINCT CASE WHEN MachineName NOT IN ('Stack1','Stack2') THEN MachineName END) AS stacking_deviceCount_old,
              COUNT(DISTINCT OPNO) AS stacking_staffCount,
              (SELECT WONO 
                FROM mes.stacking_realtime 
                WHERE MachineName NOT IN ('Stack1','Stack2') 
                  AND ${timeCondition}
                ORDER BY ID DESC LIMIT 1) AS stacking_WONO
              
          FROM mes.stacking_realtime
          WHERE ${timeCondition}
      ) AS T1
  CROSS JOIN
      -- 子查詢 B: 碟片機產能 (舊機台)
      ( 
          SELECT 
              COUNT(DISTINCT PLCCellID_CE) AS stacking_capacit_old
          FROM mes.stacking_batch
          WHERE Machine NOT IN ('Stack1','Stack2') 
            AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''
            AND ${timeCondition}
      ) AS T2
  CROSS JOIN
      -- 子查詢 C: 碟片機產能 (新/全部機台)
      (
          SELECT 
            COUNT(DISTINCT PLCCellID_CE) AS stacking_capacit_new,
            COUNT(DISTINCT Machine ) AS stacking_deviceCount_new
          FROM mes.stacking2_batch
          WHERE ${timeCondition}
            AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''
            AND Machine IN ('Stack-1', 'Stack-2', 'Stack-10')
      ) AS T3;
`;

  // 入殼資訊:
  let sql_assembly_all = `
    SELECT 
    -- 1. 入殼機台數/人數/工單 (來自 assembly_realtime)
    T1.assembly_deviceCount,
    T1.assembly_staffCount,
    T1.assembly_WONO,

    -- 2. 算入殼產能 (來自 assembly_batch)
    T2.assembly_capacity_First,
    T2.assembly_capacity_Second
    FROM
    -- 1. 入殼機台數/人數/工單 (來自 assembly_realtime)
      (
        SELECT 
          COUNT(DISTINCT MachineNO) AS assembly_deviceCount,
          COUNT(DISTINCT OPNO) AS assembly_staffCount,
          MAX(CellNO) AS assembly_WONO
        FROM mes.assembly_realtime
        WHERE ${timeCondition}
      ) AS T1
    CROSS JOIN
      -- 2. 算入殼產能 (來自 assembly_batch)
      (
        SELECT
          COUNT(DISTINCT CASE WHEN Remark IS NULL AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' THEN PLCCellID_CE END) AS assembly_capacity_First,
          COUNT(DISTINCT CASE WHEN Remark LIKE '二期' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' THEN PLCCellID_CE END) AS assembly_capacity_Second
        FROM mes.assembly_batch
        WHERE ${timeCondition}
      ) AS T2
    `;

  // 烘箱資訊:
  let sql_oven_all = `
      SELECT
          -- 1. 入庫數量 (來自 T1)
          T1.oven_InStock,
          -- 2. 出庫數量 (來自 T2)
          T2.oven_OutStock,
          T2.oven_StaffCount,
          T2.oven_DeviceCount,
          T2.oven_WONO
      FROM
          (
              -- T1: 查詢入庫/投入批次資料
              SELECT
                  COUNT( CS_board_number ) AS oven_InStock  -- 假設 T1 表中每筆紀錄都是一個批次
              FROM
                  mes.cellbakingin_batch
              WHERE
                  ${timeCondition}
          ) AS T1
      CROSS JOIN
          (
              -- T2: 查詢出庫/產出批次資料
              SELECT
                  COUNT(CE_board_number) * 40 AS oven_OutStock,
                  COUNT(DISTINCT OP) AS oven_StaffCount,
                  COUNT(DISTINCT Machine) AS oven_DeviceCount,
                  MAX(WO) AS oven_WONO
              FROM
                  mes.cellbaking_batch
              WHERE
                  ${timeCondition}
          ) AS T2;
      `;

  // 注液資訊:
  let sql_injection_all = `
  SELECT
    COUNT(CASE WHEN REMARK = '人工作業寫入' THEN PLCCellID_CE END) AS injection_handleMade_count,
    COUNT(CASE WHEN REMARK = '注液機出料自動寫入' THEN PLCCellID_CE END) AS injection_auto_count_1,
    COUNT(CASE WHEN REMARK = '注液機二期出料自動寫入' THEN PLCCellID_CE END) AS injection_auto_count_2,
    COUNT(DISTINCT MachineNO) AS injection_machine_count,
    COUNT(DISTINCT OPNO) AS injection_staff_count,
    (SELECT WORKNO FROM mes.injection_batch_fin WHERE ${timeCondition} ORDER BY ID DESC LIMIT 1) AS injection_WO_count
  FROM mes.injection_batch_fin
  WHERE ${timeCondition}
  `;


  //Degassing 資訊:
  let sql_degassing_all = `
    SELECT
        -- 使用 COALESCE 確保沒資料時顯示 0
        COALESCE(T1.pump3_01, 0) AS pump3_Capacity_01,
        COALESCE(T1.pump3_02, 0) AS pump3_Capacity_02,
        COALESCE(T2.pump2_01, 0) AS pump2_Capacity_01,
        COALESCE(T2.pump2_02, 0) AS pump2_Capacity_02,
        T3.WO_pump3,
        T3.Time_pump3,
        T4.WO_pump2,
        T4.Time_pump2
    FROM (SELECT 1 AS dual_id) d 
    LEFT JOIN (
        SELECT 1 AS id,
            COUNT(DISTINCT CASE WHEN REMARK IN ('一期三抽出料自動化寫入', '三抽出料自動寫入') THEN PLCCellID12_CE END) AS pump3_01,
            COUNT(DISTINCT CASE WHEN REMARK IN ('二期三抽出料自動寫入', '人工二期補帳', '二期第一台三抽出料自動寫入', '二期第二台三抽出料自動寫入') THEN PLCCellID12_CE END) AS pump3_02
        FROM mes.pack3_batch
        WHERE ${timeCondition} AND PLCCellID12_CE > ''
    ) AS T1 ON d.dual_id = T1.id
    LEFT JOIN (
        SELECT 1 AS id,
            COUNT(DISTINCT CASE WHEN REMARK IN ('二抽出料自動寫入') THEN PLCCellID12_CE END) AS pump2_01,
            COUNT(DISTINCT CASE WHEN REMARK IN ('二抽二期出料自動寫入', '人工二期補帳') THEN PLCCellID12_CE END) AS pump2_02
        FROM mes.pack2_batch
        WHERE ${timeCondition} AND PLCCellID12_CE > ''
    ) AS T2 ON d.dual_id = T2.id
    LEFT JOIN (
        SELECT 1 AS id, PLCCellID12_CE AS WO_pump3, Time AS Time_pump3
        FROM mes.pack3_batch
        WHERE ${timeCondition} AND PLCCellID12_CE > ''
        ORDER BY Time DESC LIMIT 1
    ) AS T3 ON d.dual_id = T3.id
    LEFT JOIN (
        SELECT 1 AS id, PLCCellID12_CE AS WO_pump2, Time AS Time_pump2
        FROM mes.pack2_batch
        WHERE ${timeCondition} AND PLCCellID12_CE > ''
        ORDER BY Time DESC LIMIT 1
    ) AS T4 ON d.dual_id = T4.id;  

  `;

  // 合併多段 SQL：先去除每段尾部的分號與多餘空白，避免產生空的 SQL 語句導致 MySQL ER_PARSE_ERROR
  const middleSectionQuery = [
    sql_cutting_all,
    sql_stacking_all,
    sql_assembly_all,
    sql_oven_all,
    sql_injection_all,
    sql_degassing_all,
  ]
    .map((s) => (typeof s === "string" ? s.trim().replace(/;+\s*$/g, "") : ""))
    .filter((s) => s.length > 0)
    .join(";\n") + ";";

  try {
    const [middleResults] = await dbmes.query(middleSectionQuery);

    const [
      cuttingData = [],
      stackingData = [],
      assemblyData = [],
      ovenData = [],
      injectionData = [],
      degassingData = [],
    ] = middleResults || [];

    // 模切
    const cutting = {
      cathode: {
        deviceCount: cuttingData[0]?.cuttingcathode_deviceCount || 0,
        autoGoodCapacity: cuttingData[0]?.cuttingcathode_autoGoodCapacity || 0,
        manualGoodCapacity:
          cuttingData[0]?.cuttingcathode_manualGoodCapacity || 0,
        staffCount: cuttingData[0]?.cuttingcathode_staffCount || 0,
        lotNo: cuttingData[0]?.cuttingcathode_LotNo || "",
      },
      anode: {
        deviceCount: cuttingData[0]?.cuttinganode_deviceCount || 0, //設備數
        autoGoodCapacity: cuttingData[0]?.cuttinganode_autoGoodCapacity || 0, // 自動良品
        manualGoodCapacity:
          cuttingData[0]?.cuttinganode_manualGoodCapacity || 0, // 手工良品
        staffCount: cuttingData[0]?.cuttinganode_staffCount || 0, // 人員數
        lotNo: cuttingData[0]?.cuttinganode_LotNo || "",
      },
    };


    // console.log("cuttingData:", stackingData[0]);
    // 疊片站
    const stacking = {
      deviceCount_old: stackingData[0]?.stacking_deviceCount_old ?? 0, //設備數
      deviceCount_new: stackingData[0]?.stacking_deviceCount_new ?? 0, //設備數
      deviceCount: (stackingData[0]?.stacking_deviceCount_new ?? 0) + (stackingData[0]?.stacking_deviceCount_old ?? 0), // 總設備數
      staffCount: stackingData[0]?.stacking_staffCount ?? 0, // 人員數
      WO: stackingData[0]?.stacking_WONO ? stackingData[0]?.stacking_WONO :  "", // 工單
      old_capacity: stackingData[0]?.stacking_capacit_old ?? 0, // 舊機台產能
      new_capacity: stackingData[0]?.stacking_capacit_new ?? 0, // 新機台產能
    };

    // 入殼站
    const assembly = {
      deviceCount: assemblyData[0]?.assembly_deviceCount ?? 0, //設備數
      staffCount: assemblyData[0]?.assembly_staffCount ?? 0, // 人員數
      WO: assemblyData[0]?.assembly_WONO?.slice(0, 7) ?? "", // 工單
      capacity_First: assemblyData[0]?.assembly_capacity_First ?? 0, // 產能
      capacity_Second: assemblyData[0]?.assembly_capacity_Second ?? 0, // 產能
    };
    // 烘箱站
    const oven = {
      deviceCount: ovenData[0]?.oven_DeviceCount ?? 0, //設備數
      staffCount: ovenData[0]?.oven_StaffCount ?? 0, // 人員數
      WO: ovenData[0]?.oven_WONO ?? "", // 工單
      InStock: ovenData[0]?.oven_InStock ?? 0, // 入庫數量
      OutStock: ovenData[0]?.oven_OutStock ?? 0, // 出庫數量
    };

    // 注液站
    const injection = {
      deviceCount: injectionData[0]?.injection_machine_count ?? 0, //設備數
      staffCount: injectionData[0]?.injection_staff_count ?? 0, // 人員數
      WO: injectionData[0]?.injection_WO_count ?? 0, // 工單數
      handleMade_count: injectionData[0]?.injection_handleMade_count ?? 0, // 人工作業寫入 數量
      auto_count_1: injectionData[0]?.injection_auto_count_1 ?? 0, // 注液機出料自動寫入 數量
      auto_count_2: injectionData[0]?.injection_auto_count_2 ?? 0, // 注液機二期出料自動寫入 數量
    };

    //Degassing
    const degassing = {
      WO:
        degassingData[0]?.Time_pump2 &&
        degassingData[0]?.Time_pump3 &&
        degassingData[0]?.Time_pump2 > degassingData[0]?.Time_pump3
          ? (degassingData[0]?.WO_pump2 ?? "").substring(0, 7)
          : (degassingData[0]?.WO_pump3 ?? "").substring(0, 7),
      pump3_phase_1_capacity: degassingData[0]?.pump3_Capacity_01 ?? 0,
      pump3_phase_2_capacity: degassingData[0]?.pump3_Capacity_02 ?? 0,
      pump2_phase_1_capacity: degassingData[0]?.pump2_Capacity_01 ?? 0,
      pump2_phase_2_capacity: degassingData[0]?.pump2_Capacity_02 ?? 0,
    };

    finalSend.push({
      cutting,
      stacking,
      assembly,
      oven,
      injection,
      degassing,
    });
    return finalSend;
    } catch (error) {
    console.error("❌ API 錯誤詳細:", error);
    throw error; // 繼續拋出錯誤以便在路由處理器中捕獲
    }
}


const main_FrontSet_Page_end = async () => {
  const finalSend = [];
    // 根據現在時間動態生成 WHERE time 條件函數
  function getTimeCondition(now, columnName = "time") {
    const taipeiTime = moment(now).tz("Asia/Taipei");
    const hour = taipeiTime.hour();
    let startTime, endTime;

    if (hour >= 8 && hour < 20) {
      // 早班: 8:00 - 20:00
      startTime = taipeiTime.clone().set({ hour: 0, minute: 0, second: 0 });
      endTime = taipeiTime.clone().set({ hour: 23, minute: 59, second: 59 });
    } else {
      // 晚班: 20:00 - 次日8:00
      startTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
      endTime = taipeiTime
        .clone()
        .add(1, "day")
        .set({ hour: 8, minute: 0, second: 0 });
    }

    return `${columnName} >= '${startTime.format(
      "YYYY-MM-DD HH:mm:ss"
    )}' AND ${columnName} < '${endTime.format("YYYY-MM-DD HH:mm:ss")}'`;
  }

  const timeCondition = getTimeCondition(new Date(), "time");
  const analysisDTCondition = getTimeCondition(new Date(), "analysisDT");

  // mes db

  // 化成資訊:
  let sql_formation_all = `
    SELECT
      T1.formationcathode_capacity_01,
      T2.formationcathode_capacity_02
    FROM 
      (SELECT 
        COUNT(DISTINCT Barcode) AS formationcathode_capacity_01
      FROM mes.seci_outport12
      WHERE ${getTimeCondition(new Date(), "Time")}
        AND Param LIKE '023%'
        AND Barcode IS NOT NULL
        AND Barcode != ''
      ) AS T1
    CROSS JOIN
      (SELECT 
        COUNT(DISTINCT Barcode) AS formationcathode_capacity_02
      FROM mes.chroma_outport123
      WHERE ${getTimeCondition(new Date(), "Time")}
        AND Param LIKE '0-023%'
        AND Barcode IS NOT NULL
        AND Barcode != ''
      ) AS T2;
  `;
  // 分容資訊:

  // ${getTimeCondition(new Date(), "Time")}
  let sql_capacity_all = `
      SELECT
        d.source,
        d.type,
        COALESCE(r.total, 0) AS total
      FROM (
          SELECT 
          'SECI' AS source, 
          'CC1' AS type
          UNION ALL SELECT 'SECI', 'CC2'
          UNION ALL SELECT 'CHROMA', 'CC1'    
          UNION ALL SELECT 'CHROMA', 'CC2'
      ) d
      LEFT JOIN (
          SELECT
              source,
              CASE
                  WHEN Param LIKE '%010%' THEN 'CC1'
                  WHEN Param LIKE '%017%' THEN 'CC2'
              END AS type,
              COUNT(DISTINCT Barcode) AS total
          FROM (
              SELECT Barcode, Param, 'SECI' AS source
              FROM mes.seci_outport12
              WHERE  ${getTimeCondition(new Date(), "Time")}
              UNION ALL
              SELECT Barcode, Param, 'CHROMA' AS source
              FROM mes.chroma_outport123
              WHERE ${getTimeCondition(new Date(), "Time")}
          ) t
          WHERE Barcode IS NOT NULL
            AND Barcode != ''
            AND (
                  Param LIKE '%010%'
                  OR Param LIKE '%017%'
            )
          GROUP BY source, type
      ) r
      ON d.source = r.source AND d.type = r.type
      ORDER BY d.source, d.type;
  `;

  // 精封資訊
  let sql_edgeFolding_all = `
SELECT
    t1.edgeFolding_auto_count_1,
    t1.edgeFolding_auto_count_2,
    t1.edgeFolding_handmade_count,
    t2.cellNO
FROM
    (
        SELECT  
            COUNT(DISTINCT CASE WHEN stageID = '分選機前站' AND 
            remark = '精封機出料自動化寫入' 
            THEN cellNO END) AS edgeFolding_auto_count_1,

            COUNT(DISTINCT CASE WHEN stageID = '分選機前站' AND 
            remark = '精封機出料自動化寫入二期' 
            THEN cellNO END) AS edgeFolding_auto_count_2,

            COUNT(DISTINCT CASE WHEN stageID = '分選機前站' AND 
            remark LIKE '%人工作業%' 
            THEN cellNO END) AS edgeFolding_handmade_count
        FROM mes.beforeinjectionstage
        WHERE ${timeCondition}
    ) AS t1
CROSS JOIN
    (
        SELECT cellNO
        FROM mes.beforeinjectionstage
        WHERE stageID = '分選機前站' AND cellNO <> '' AND cellNO IS NOT NULL
        ORDER BY time DESC
        LIMIT 1
    ) AS t2
  `;

  const timeMomentStart = moment().tz("Asia/Taipei").format("YYYY-MM-DD") + " 00:00:00";
  const split_YMD_date = timeMomentStart.split("-");
  const nowday = split_YMD_date[2].split(" ")[0];
  
  // 分選資訊:
  let sql_sorting_all = `
    SELECT
      MAX(modelId) AS sortingWO,
      (
        SELECT COUNT(DISTINCT modelId)
        FROM mes.testmerge_cc1orcc2
        WHERE parameter LIKE '017'
          AND year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) = '${split_YMD_date[0]}'
          AND month(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) = '${split_YMD_date[1]}'
          AND day(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) = '${nowday}'
          AND TIME(
            STR_TO_DATE(
              CONCAT(
                SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
                SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                CASE
                  WHEN EnddateD LIKE '%上午%' THEN 'AM'
                  WHEN EnddateD LIKE '%下午%' THEN 'PM'
                  ELSE ''
                END
              ),
              '%Y/%m/%d %I:%i:%s %p'
            )
          ) BETWEEN '00:00:00' AND '23:59:59'
      ) AS sortingCapacity

    FROM mes.testmerge_cc1orcc2
    WHERE 
      parameter = '017' AND
      ${analysisDTCondition}
  `;
  // RT/HT Aging 資訊:
  let sql_RTNHT_all = `
    SELECT 
      T1.H_COUNT,
      T1.N_COUNT_01,
      T1.N_COUNT_02,
      (
        SELECT TOP 1 BOX_BATT
        FROM ITFC_MES_UPLOAD_STATUS_TB
        WHERE TYPE = 4
          AND BOX_BATT <> 'NANANANANANA'
          AND TEST_STATUS = 0
          AND (BIN_CODE LIKE 'N%' OR BIN_CODE LIKE 'N2%')
          AND replace(convert(nvarchar(100), create_date, 120), '.', '-') BETWEEN @start AND @end
        ORDER BY ID DESC
      ) AS WO_RT,
      (
        SELECT TOP 1 BOX_BATT
        FROM ITFC_MES_UPLOAD_STATUS_TB
        WHERE TYPE = 4
          AND BOX_BATT <> 'NANANANANANA'
          AND TEST_STATUS = 0
          AND BIN_CODE LIKE 'H%'
          AND replace(convert(nvarchar(100), create_date, 120), '.', '-') BETWEEN @start AND @end
        ORDER BY ID DESC
      ) AS WO_HT
    FROM 
        (
            SELECT 
          COUNT(CASE WHEN BIN_CODE LIKE 'H%' THEN 1 END) AS H_COUNT,
          COUNT(CASE WHEN BIN_CODE LIKE 'N%' AND BIN_CODE NOT LIKE 'N2%' THEN 1 END) AS N_COUNT_01,
          COUNT(CASE WHEN BIN_CODE LIKE 'N2%' THEN 1 END) AS N_COUNT_02
            FROM ITFC_MES_UPLOAD_STATUS_TB
        WHERE TYPE = 4
                AND BOX_BATT <> 'NANANANANANA'
          AND TEST_STATUS = 0
          AND replace(convert(nvarchar(100), create_date, 120), '.', '-') BETWEEN @start AND @end
        ) AS T1
    `;

  try {
    // MES DB :
    const [formationArray, capacityArray, edgeFoldingArray, sortingArray] =
      await Promise.all([
        dbmes.query(sql_formation_all),
        dbmes.query(sql_capacity_all),
        dbmes.query(sql_edgeFolding_all),
        dbmes.query(sql_sorting_all),
      ]);
    const agingArray = await connectMssql(sql_RTNHT_all);

    // 每個 dbmes.query 似乎返回 [rows, fields]，所以我們要取出 rows
    const formationData = formationArray[0];
    const capacityData = capacityArray[0];
    const edgeFoldingData = edgeFoldingArray[0];
    const sortingData = sortingArray[0];

    // MSSQL 撈出來 HTaging , RTaging 資料
    const agingData = agingArray && agingArray[0] ? agingArray[0] : {};

    // 化成
    const formation = {
      deviceCount: 2,
      staffCount: 2,
      WO: "MW2008A",
      auto_count_1: formationData[0]?.formationcathode_capacity_01 ?? 0, // 一期
      auto_count_2: formationData[0]?.formationcathode_capacity_02 ?? 0, // 二期
    };

    // 分容
    const Capacity_Check = {
      deviceCount: 2,
      staffCount: 2,
      WO: "MW2008A",
      Chroma_CC1_two_total : capacityData[0]["total"] ?? 0 ,
      SECI_CC1_two_total : capacityData[2]["total"] ?? 0 ,
      Chroma_CC2_two_total : capacityData[1]["total"] ?? 0 ,
      SECI_CC2_two_total : capacityData[3]["total"] ?? 0 ,
    };


    // console.log (' ******check edgeFoldingData : ', typeof edgeFoldingData , Object.entries(edgeFoldingData[0] || {}) );
    // 精封
    const edgeFolding = {
      deviceCount: 2,
      staffCount: 2,
      WO: edgeFoldingData[0]?.cellNO?.substring(0, 7) ?? "", // 取前7碼當工單
      auto_count_1: edgeFoldingData[0]?.edgeFolding_auto_count_1 ?? 0, // 精封機出料自動寫入
      auto_count_2: edgeFoldingData[0]?.edgeFolding_auto_count_2 ?? 0, // 精封機出料自動寫入二期
      handmade_count: edgeFoldingData[0]?.edgeFolding_handmade_count ?? 0, // 人工作業
    };

    // 分選
    const sorting = {
      deviceCount: 2,
      staffCount: 2,
      WO: sortingData[0]?.sortingWO?.substring(0, 7) ?? "",
      capacity: sortingData[0]?.sortingCapacity ?? 0,
    };

    const ht_aging = {
      deviceCount: 1,
      staffCount: 1,
      WO: agingData?.WO_HT?.substring(0, 7) ?? agingData?.WO_RT?.substring(0, 7) ?? "", // 工單/批號
      capacity: agingData?.H_COUNT ?? 0,
      template: "44.8℃",
    };

    const rt_aging = {
      deviceCount: 1,
      staffCount: 1,
      WO: agingData?.WO_RT?.substring(0, 7) ?? "", // 工單/批號
      auto_count_1: agingData?.N_COUNT_01 ?? 0,
      auto_count_2: agingData?.N_COUNT_02 ?? 0,
      template: "25.3℃",
    };

    finalSend.push({
      formation,
      Capacity_Check,
      edgeFolding,
      sorting,
      ht_aging,
      rt_aging,
    });
    return finalSend;
    
    
  }catch(error){
    console.error("❌ API 錯誤詳細:", error);
    throw error; // 繼續拋出錯誤以便在路由處理器中捕獲
  }
  
}
  
  
router.get("/main_FrontSet_Page_socket_status", async (_req, res) => {
  try {
    const payload = await getMesRedisPayload();

    res.status(200).json({
      message: "socket 推播模式狀態",
      checkIfWindowOn,
      room: MES_PURPLE_ROOM,
      roomSize: getMesRoomSize(),
      hasRedisValue: payload.hasValue,
      data: {
        front: payload.front,
        middle: payload.middle,
        end: payload.end,
      },
    });
  } catch (error) {
    console.error("[mesPurple] socket status API error:", error);
    res.status(500).json({
      message: "socket 狀態查詢失敗",
      error: error.message,
      details: error.stack,
    });
  }
});


Object.assign(router, {
  bindMesPurpleSocketHandlers,
});

module.exports = router;