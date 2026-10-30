const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs");
const moment = require("moment");
const schedule = require("node-schedule");
const xlsx = require("xlsx");
const path = require("path");
const { z } = require("zod");
const redisClient = require(__dirname + "/../modules/redisConnect.js");

// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫
const dbcon = require(__dirname + "/../modules/mysql_connect.js");     // hr 資料庫
const { prismaMes, prismaHr, MesPrisma } = require('../modules/prismaClients');
const { start } = require("repl");


// 讀取 .env 檔案
const envPath = path.resolve(__dirname, "../.env");
let envContent = fs.readFileSync(envPath, "utf-8");


// // 工程師設定 
// const rollingEngineerKeyNeed = [
//     "id",
//     "machineNo",
//     "rollingThickness_EG_S",
//     "rollingThickness_EG_E",
//     "rollingDensity_EG_S",
//     "rollingDensity_EG_E",
//     "announceCapacity",
//     "remark",
//     "engineerName",
//     "engineerId"
// ]
// const slittingEngineerKeyNeed = [
//     "id",
//     "machineNo",
//     "announceCapacity",
//     "remark",
//     "engineerName",
//     "engineerId"
// ];

// Rolling 紀錄需要的欄位
const RollingRecordKeyNeed = [
  "selectWork",
  "lotNumber",
  "machineNo",
  "dayShift",
  "memberName",
  "memberNumber",
  "startTime",
  "employee_InputTime",
  "workTime",
  "incomeLength",
  "averageCoatingWidth",
  "comingThickness",
  "rollingThickness_EG_S",
  "rollingThickness_EG_E",
  "averageThickness",
  "rollingDensity_EG_S",
  "rollingDensity_EG_E",
  "rollingDensity",
  "Thickness_0",
  "Thickness_200",
  "Thickness_400",
  "Thickness_600",
  "Thickness_800",
  "Thickness_1000",
  "Thickness_1200",
  "Thickness_1400",
  "rollingLength",
  "rolling_LostWeight",
  "rollingLostLength",
  "rolling_speed",
  "rolling_gap",
  "linearPressure",
  "rollingTemperature",
  "yield",
  "errorStatus",
  "id",
  "engineerName",
  "engineerId",
  "announceCapacity",
  "remark",
  "memo",
  "is_deleted",
  "deleted_at",
  "delete_operation",
];

const slittingRecordKeyNeed = [
  "id",
  "selectWork",
  "lotNumber_R",
  "lotNumber_L",
  "machineNo",
  "dayShift",
  "memberName",
  "memberNumber",
  "startTime",
  "employee_InputTime",
  "workTime",
  "incomeLength_R",
  "Length_R",
  "LostLength_R",
  "yield_R",
  "errorStatus_R",
  "slittingSpeed_R",
  "lostWeight_R",
  "slittingWidth_R",
  "incomeLength_L",
  "Length_L",
  "LostLength_L",
  "yield_L",
  "errorStatus_L",
  "slittingSpeed_L",
  "lostWeight_L",
  "slittingWidth_L",
  "remark_Filled",
  "announceCapacity",
  "remark",
  "is_deleted",
  "deleted_at",
  "delete_operation",
  "delete_by",
  "stock",
  "stock_L",
  "engineerName",
  "engineerId",
];

// 正極分切、負極分切專用的額外欄位（不包含在 unionKeys 中）
const slittingExtraKeys = ["slittingWidth_S", "slittingWidth_E", "widthToMeter"];


function getServerIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 只取 IPv4 地址，跳過內部回環地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}



const discord_rollingNSlitting_notify = process.env.discord_rolling_notify || ""

// 早上 8:30 產能通知  
// schedule.scheduleJob("30 08 * * *", async () => {
//   console.log("開始執行早上8:30產能通知...");

//   const currentIP = getServerIP();
//   const allowedIP = '192.168.3.207';

//     if (currentIP !== allowedIP) {
//         console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
//         return;
//     }
//   try {
//     await sendDiscordNotification();
//   } catch (error) {
//     console.error("早上產能通知發送失敗:", error);
//   }
// });

// 晚上 8:30 產能通知  
// schedule.scheduleJob("30 20 * * *", async () => {
//   console.log("開始執行晚上8:30產能通知...");

//   const currentIP = getServerIP();
//   const allowedIP = '192.168.3.207';

//     if (currentIP !== allowedIP) {
//         console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
//         return;
//     }
//   try {
//     await sendDiscordNotification();
//   } catch (error) {
//     console.error("晚上產能通知發送失敗:", error);
//   }
// });



//產能通知API
const sendDiscordNotification = async () => {
  try {
    const now = moment().locale("zh-tw");

    // 判斷班別和時間範圍
    const todayStartTime = moment().locale("zh-tw").hour(8).minute(30).second(0);
    const todayEndTime = moment().locale("zh-tw").hour(20).minute(30).second(0);

    let shift = "";
    let startTime = "";
    let endTime = "";

    if (now.isBetween(todayStartTime, todayEndTime, null, '[]')) {
      // 早班時間：08:30 - 20:30
      shift = "早班";
      startTime = todayStartTime.format("YYYY-MM-DD HH:mm:ss");
      endTime = todayEndTime.format("YYYY-MM-DD HH:mm:ss");
    } else {
      // 晚班時間：20:30 - 次日08:30
      shift = "晚班";
      if (now.isAfter(todayEndTime)) {
        // 當天晚上 20:30 後
        startTime = todayEndTime.format("YYYY-MM-DD HH:mm:ss");
        endTime = moment().add(1, 'day').hour(8).minute(30).format("YYYY-MM-DD HH:mm:ss");
      } else {
        // 隔天早上 08:30 前
        startTime = moment().subtract(1, 'day').hour(20).minute(30).format("YYYY-MM-DD HH:mm:ss");
        endTime = todayStartTime.format("YYYY-MM-DD HH:mm:ss");
      }
    }

    // 單一優化查詢 - 按機器分組統計產能與操作員資訊
    const capacitySql = `
      SELECT 
        '正極輾壓' as workType,
        selectWork,
        COUNT(*) as recordCount,
        SUM(COALESCE(rollingLength, 0)) as totalLength,
        SUM(COALESCE(rollingLostLength, 0)) as totalLostLength,
        CASE 
          WHEN SUM(COALESCE(rollingLength, 0)) + SUM(COALESCE(rollingLostLength, 0)) > 0 
          THEN ROUND(SUM(COALESCE(rollingLength, 0)) / (SUM(COALESCE(rollingLength, 0)) + SUM(COALESCE(rollingLostLength, 0))) * 100, 2)
          ELSE 0 
        END as yieldRate,
        GROUP_CONCAT(DISTINCT CONCAT(memberName, '(', memberNumber, ')') SEPARATOR ', ') as operators,
        COUNT(DISTINCT memberNumber) as operatorCount
      FROM rollingcathode_batch 
      WHERE employee_InputTime BETWEEN ? AND ? 
        AND (is_deleted IS NULL OR is_deleted = 0)
      GROUP BY machineNo
      
      UNION ALL
      
      SELECT 
        '負極輾壓' as workType,
        selectWork,
        COUNT(*) as recordCount,
        SUM(COALESCE(rollingLength, 0)) as totalLength,
        SUM(COALESCE(rollingLostLength, 0)) as totalLostLength,
        CASE 
          WHEN SUM(COALESCE(rollingLength, 0)) + SUM(COALESCE(rollingLostLength, 0)) > 0 
          THEN ROUND(SUM(COALESCE(rollingLength, 0)) / (SUM(COALESCE(rollingLength, 0)) + SUM(COALESCE(rollingLostLength, 0))) * 100, 2)
          ELSE 0 
        END as yieldRate,
        GROUP_CONCAT(DISTINCT CONCAT(memberName, '(', memberNumber, ')') SEPARATOR ', ') as operators,
        COUNT(DISTINCT memberNumber) as operatorCount
      FROM rollinganode_batch 
      WHERE employee_InputTime BETWEEN ? AND ? 
        AND (is_deleted IS NULL OR is_deleted = 0)
      GROUP BY machineNo
      
      UNION ALL
      
      SELECT 
        '正極分切' as workType,
        selectWork,
        COUNT(*) as recordCount,
        SUM(COALESCE(Length_R, 0) + COALESCE(Length_L, 0)) as totalLength,
        SUM(COALESCE(LostLength_R, 0) + COALESCE(LostLength_L, 0)) as totalLostLength,
        CASE 
          WHEN SUM(COALESCE(Length_R, 0) + COALESCE(Length_L, 0)) + SUM(COALESCE(LostLength_R, 0) + COALESCE(LostLength_L, 0)) > 0 
          THEN ROUND(SUM(COALESCE(Length_R, 0) + COALESCE(Length_L, 0)) / (SUM(COALESCE(Length_R, 0) + COALESCE(Length_L, 0)) + SUM(COALESCE(LostLength_R, 0) + COALESCE(LostLength_L, 0))) * 100, 2)
          ELSE 0 
        END as yieldRate,
        GROUP_CONCAT(DISTINCT CONCAT(memberName, '(', memberNumber, ')') SEPARATOR ', ') as operators,
        COUNT(DISTINCT memberNumber) as operatorCount
      FROM slittingcathode_batch 
      WHERE employee_InputTime BETWEEN ? AND ? 
        AND (delete_operation IS NULL OR delete_operation NOT LIKE '%user_delete_both%')
      GROUP BY machineNo
      
      UNION ALL
      
      SELECT 
        '負極分切' as workType,
        selectWork, 
        COUNT(*) as recordCount,
        SUM(COALESCE(Length_R, 0) + COALESCE(Length_L, 0)) as totalLength,
        SUM(COALESCE(LostLength_R, 0) + COALESCE(LostLength_L, 0)) as totalLostLength,
        CASE 
          WHEN SUM(COALESCE(Length_R, 0) + COALESCE(Length_L, 0)) + SUM(COALESCE(LostLength_R, 0) + COALESCE(LostLength_L, 0)) > 0 
          THEN ROUND(SUM(COALESCE(Length_R, 0) + COALESCE(Length_L, 0)) / (SUM(COALESCE(Length_R, 0) + COALESCE(Length_L, 0)) + SUM(COALESCE(LostLength_R, 0) + COALESCE(LostLength_L, 0))) * 100, 2)
          ELSE 0 
        END as yieldRate,
        GROUP_CONCAT(DISTINCT CONCAT(memberName, '(', memberNumber, ')') SEPARATOR ', ') as operators,
        COUNT(DISTINCT memberNumber) as operatorCount
      FROM slittinganode_batch 
      WHERE employee_InputTime BETWEEN ? AND ? 
        AND (delete_operation IS NULL OR delete_operation NOT LIKE '%user_delete_both%')
      GROUP BY machineNo
    `;

    const [capacityResults] = await dbmes.query(capacitySql, [
      startTime, endTime,  // 正極輾壓
      startTime, endTime,  // 負極輾壓
      startTime, endTime,  // 正極分切
      startTime, endTime   // 負極分切
    ]);

    // 建構通知訊息
    let Message_notify = `📊 **${shift}產能報告** (${moment().format('MM-DD HH:mm')})
`;
    Message_notify += `⏰ 統計時間：${moment(startTime).format('MM-DD HH:mm')} ~ ${moment(endTime).format('MM-DD HH:mm')}

`;

    let totalRecords = 0;
    let totalLength = 0;
    let totalLostLength = 0;
    let allOperators = new Set(); // 收集所有操作員

    // 按機器號碼分組數據
    const machineData = {};
    capacityResults.forEach(row => {
      if (row.recordCount > 0) {
        if (!machineData[row.machineNo]) {
          machineData[row.machineNo] = {
            machineNo: row.machineNo,
            workType: row.workType,
            totalRecords: 0,
            totalLength: 0,
            totalLostLength: 0,
            operators: new Set()
          };
        }

        machineData[row.machineNo].totalRecords += row.recordCount;
        machineData[row.machineNo].totalLength += parseFloat(row.totalLength);
        machineData[row.machineNo].totalLostLength += parseFloat(row.totalLostLength);

        if (row.operators) {
          row.operators.split(', ').forEach(op => {
            machineData[row.machineNo].operators.add(op);
            allOperators.add(op);
          });
        }
      }
    });

    // 按工作類型顯示，每個類型下按機器分列
    Object.keys(machineData).forEach(machineNo => {
      const machine = machineData[machineNo];
      const yieldRate = (machine.totalLength + machine.totalLostLength) > 0
        ? (machine.totalLength / (machine.totalLength + machine.totalLostLength) * 100)
        : 0;

      Message_notify += `🏭 **機台 ${machine.machineNo} (${machine.workType})**\n`;
      Message_notify += `      記錄數：${machine.totalRecords} 筆\n`;
      Message_notify += `      📏 完成長度：${machine.totalLength.toFixed(2)} 米\n`;
      Message_notify += `      📐 損料長度：${machine.totalLostLength.toFixed(2)} 米\n`;
      Message_notify += `      🎯 良率：${yieldRate.toFixed(2)}%\n`;
      Message_notify += `      👤 操作員 (${machine.operators.size}人)：${Array.from(machine.operators).join(', ') || '無'}\n`;

      totalRecords += machine.totalRecords;
      totalLength += machine.totalLength;
      totalLostLength += machine.totalLostLength;
    });

    if (totalRecords === 0) {
      Message_notify += "❌ 本時段暫無生產記錄\n";
    } else {
      // 計算總良率
      const totalYieldRate = (totalLength + totalLostLength) > 0
        ? (totalLength / (totalLength + totalLostLength) * 100)
        : 0;

      Message_notify += `━━━━━━━━━━━━━━━━━━━━\n`;
      Message_notify += `🎯 **${shift}總計**\n`;
      Message_notify += `📋 總記錄數：${totalRecords} 筆\n`;
      Message_notify += `📏 總長度：${totalLength.toFixed(2)} 米\n`;
      Message_notify += `📐 總損料長度：${totalLostLength.toFixed(2)} 米\n`;
      Message_notify += `🎯 總良率：${totalYieldRate.toFixed(2)}%\n`;
      Message_notify += `👥 參與操作員 (${allOperators.size}人)：${Array.from(allOperators).join(', ')}`;
    }

    const config_Discord = {
      headers: {
        "Content-Type": "application/json",
      },
    };

    await axios.post(discord_rollingNSlitting_notify, {
      content: Message_notify,
    }, config_Discord);

    console.log("輾壓產能通知API成功發送");


  } catch (error) {
    console.error("產能通知API錯誤:", error);
  }
};


const extractRollingValues = (body, keys) => {
  return keys.map(key => body[key] || null);
};

// 格式化時間欄位的函數
const formatTimeFields = (data) => {
  if (!data || !Array.isArray(data)) return data;

  return data.map(row => {
    const formattedRow = { ...row };

    // 需要格式化的時間欄位
    const timeFields = ['Date', 'BatchStart', 'BatchEnd', 'TransportStart', 'TransportEnd', 'FinalTime'];

    timeFields.forEach(field => {
      if (formattedRow[field]) {
        formattedRow[field] = moment(formattedRow[field]).locale("zh-tw").format("YYYY-MM-DD HH:mm:ss");
      }
    });

    return formattedRow;
  });
};

const changeKeyWords = (sortRows, unionKeys) => {
  const keyMapping = {
    'rollingThickness_EG_S': 'rollingThickness_EG_S(SV)',
    'rollingThickness_EG_E': 'rollingThickness_EG_E(SV)',
    'rollingDensity_EG_S': 'rollingDensity_EG_S(SV)',
    'rollingDensity_EG_E': 'rollingDensity_EG_E(SV)',
    'averageThickness': 'averageThickness(PV)',
    'rollingDensity': 'rollingDensity(PV)',
    'slittingWidth_R': 'slittingWidth_R(mm)',
    'slittingWidth_L': 'slittingWidth_L(mm)',
    'yield_R': 'Utilization_R(PV)(%)',
    'yield_L': 'Utilization_L(PV)(%)',
    'widthToMeter': 'widthToMeter(PV)',
    'slittingWidth_S': 'slittingWidth_S(PV)(mm)',
    'slittingWidth_E': 'slittingWidth_E(PV)(mm)',
    // 'averageCoatingWidth': 'averageCoatingWeight',
  };

  return sortRows.map(row => {
    const newRow = {};
    unionKeys.forEach(key => {
      // 如果有對應的新名稱就用新名稱，否則保持原名稱
      const newKey = keyMapping[key] || key;
      // 從 row 取值，如果 key 存在就用原值，否則補 null
      newRow[newKey] = key in row ? row[key] : null;
    });
    return newRow;
  });
};


// 比對舊值與新值是否有實質異動
const isFieldChanged = (oldVal, newVal, type) => {
  const isOldEmpty = oldVal === null || oldVal === undefined || oldVal === '';
  const isNewEmpty = newVal === null || newVal === undefined || newVal === '';
  if (isOldEmpty && isNewEmpty) return false;
  if (isOldEmpty !== isNewEmpty) return true;

  if (['Decimal', 'Float', 'Int'].includes(type)) {
    const numOld = Number(oldVal);
    const numNew = Number(newVal);
    if (isNaN(numOld) || isNaN(numNew)) return String(oldVal) !== String(newVal);
    return numOld !== numNew;
  }

  return String(oldVal).trim() !== String(newVal).trim();
};

// 紀錄更新系統操作的db
const setLog = async (txClient, { type, selectWork, engineerId, engineerName, items }) => {
  const client = txClient || prismaMes;
  try {
    for (const item of (items || [])) {
      await client.log_transfer_record.create({
        data: {
          empNumber: String(engineerId || ''),
          empName: String(engineerName || ''),
          transfer_Title: `${type} 站數據修改 (Lot: ${item.lotNumber})`,
          transfer_location: selectWork || item.selectWork || type || '',
          transfer_innerData: item.innerData || '',
          transfer_Time: new Date()
        }
      });
    }
    return { success: true };
  } catch (error) {
    console.error("setLog error:", error);
    throw new Error(`紀錄操作日誌失敗: ${error.message}`);
  }
};



router.post("/postRolling", async (req, res) => {
  const body = req.body;
  let connection;
  let tableName = "";
  let tableNameForCoater = "";

  // 檢查必要欄位
  if (!body.machineNo) {
    return res.status(400).json({
      error: "缺少必要欄位：machineNo (唯一鍵)"
    });
  }

  console.log("Received body:", body);

  const selectWork = body.selectWork;

  let isNetworkError = false;
  try {
    connection = await dbmes.getConnection();
    await connection.beginTransaction();

    switch (selectWork) {
      case "rollingCathode":
        tableName = "rollingcathode_batch";
        tableNameForCoater = "coatingcathode_batch";
        break;
      case "rollingAnode":
        tableName = "rollinganode_batch";
        tableNameForCoater = "coatinganode_batch";
        break;
      default:
        await connection.rollback();
        return res.status(400).json({ error: "無效的工作類型" });
    }

    console.log("選擇工作類型 :", selectWork)
    const keys = RollingRecordKeyNeed;
    const incomingLotNumber = body.lotNumber == null ? '' : String(body.lotNumber).trim();

    // 規則：先檢查同機台同 lotNumber，存在則 UPDATE，不存在則 INSERT
    const sql_findSameLot = `
      SELECT id
      FROM ${tableName}
      WHERE machineNo = ?
        AND lotNumber = ?
        AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `;

    const [sameLotRows] = await connection.query(sql_findSameLot, [body.machineNo, incomingLotNumber]);

    let result;
    let targetId = null;

    if (sameLotRows.length > 0) {
      targetId = sameLotRows[0].id;
      const updateKeys = keys.filter(key => key !== "id");
      const sql_update = `UPDATE ${tableName} SET ${updateKeys.map(key => `${key} = ?`).join(", ")} WHERE id = ?`;
      const updateValues = extractRollingValues(body, updateKeys);

      [result] = await connection.query(sql_update, [...updateValues, targetId]);
    } else {
      const sql_insert = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
      const insertValues = extractRollingValues(body, keys);

      [result] = await connection.query(sql_insert, insertValues);
      targetId = result.insertId;
    }


    // 反向紀錄資料到coater 說此筆已經有被rolling 接收並送出了 讓他不要再送來
    if (tableNameForCoater && selectWork === 'rollingCathode') {
      const sql_coater = `Update ${tableNameForCoater} SET is_received = 1 WHERE lotNumber = ?`;
      const values_coater = [body.lotNumber];
      await connection.query(sql_coater, values_coater);

      console.log("反向紀錄資料- 確認 tableNameForCoater :", tableNameForCoater, " | ", " lotNumber: ", body.lotNumber);
    }


    else if (selectWork === 'rollingAnode') {
      const incomingLot = body.lotNumber ? String(body.lotNumber).trim() : '';

      const isR = incomingLot.includes('_R') || incomingLot.endsWith('-R') || incomingLot.endsWith('R');
      const isL = incomingLot.includes('_L') || incomingLot.endsWith('-L') || incomingLot.endsWith('L');

      if (isR) {
        // 依據最新架構圖：將 slittinganode_batch 右側 (R) 的 stock 狀態更新為 2
        const sql_slitting_R = `UPDATE mes.slittinganode_batch SET stock = 2 WHERE lotNumber_R = ?`;
        await connection.query(sql_slitting_R, [incomingLot]);
        console.log("獨立更新 slittinganode_batch 右側 (R) stock = 2 | lotNumber:", incomingLot);
      }
      else if (isL) {
        // 依據最新架構圖：將 slittinganode_batch 左側 (L) 的 stock_L 狀態更新為 2
        const sql_slitting_L = `UPDATE mes.slittinganode_batch SET stock_L = 2 WHERE lotNumber_L = ?`;
        await connection.query(sql_slitting_L, [incomingLot]);
        console.log("獨立更新 slittinganode_batch 左側 (L) stock_L = 2 | lotNumber:", incomingLot);
      }
      else {
        // 無特定 R/L 標記時，精準匹配 lotNumber_R 或 lotNumber_L
        const sql_slitting_R = `UPDATE mes.slittinganode_batch SET stock = 2 WHERE lotNumber_R = ?`;
        await connection.query(sql_slitting_R, [incomingLot]);

        const sql_slitting_L = `UPDATE mes.slittinganode_batch SET stock_L = 2 WHERE lotNumber_L = ?`;
        await connection.query(sql_slitting_L, [incomingLot]);
      }

      // 同時檢查是否左右兩側均已完成 (stock 與 stock_L 皆已更新為 2)，全數完結時才更新 coatinganode_batch 狀態 is_received = 2
      if (tableNameForCoater) {
        const cleanLot = incomingLot.replace(/(-\d+)?[-_]?[RL]$/i, "").replace(/-\d+$/, "");
        const checkSql = `
          SELECT stock, stock_L, lotNumber_R, lotNumber_L 
          FROM mes.slittinganode_batch 
          WHERE (lotNumber_R LIKE CONCAT(?, '%') OR lotNumber_L LIKE CONCAT(?, '%')) 
            AND (is_deleted IS NULL OR is_deleted = 0)
        `;
        const [rows] = await connection.query(checkSql, [cleanLot, cleanLot]);
        let allCompleted = true;
        if (rows && rows.length > 0) {
          rows.forEach(r => {
            const sR = String(r.stock ?? '0').trim();
            const sL = String(r.stock_L ?? '0').trim();
            const hasR = r.lotNumber_R && String(r.lotNumber_R).trim() !== '';
            const hasL = r.lotNumber_L && String(r.lotNumber_L).trim() !== '';

            if ((hasR && sR !== '2') || (hasL && sL !== '2')) {
              allCompleted = false;
            }
          });
        }
        if (allCompleted) {
          const sql_coater = `UPDATE ${tableNameForCoater} SET is_received = 2 WHERE lotNumber = ? OR lotNumber = ?`;
          await connection.query(sql_coater, [incomingLot, cleanLot]);
        }
      }

      console.log("反向紀錄資料- 更新 slittinganode_batch 獨立側與 coatinganode_batch 狀態 | lotNumber: ", incomingLot);
    }

    await connection.commit();

    res.status(200).json({
      message: `滾輪記錄寫入成功，影響筆數: ${result.affectedRows}`,
      insertId: targetId,
      affectedRows: result.affectedRows,
      id_Card: body.id_Card
    });
  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("滾輪記錄 UPSERT 發生錯誤：", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "滾輪記錄 UPSERT 發生異常",
        detail: error.message,
        sql: error.sql
      });
    }
  } finally {
    if (connection) {
      if (isNetworkError || connection.destroyed) {
        connection.destroy();
      } else {
        connection.release();
      }
    }
  }
});

router.post("/postSlittings", async (req, res) => {
  const body = req.body;

  if (!body.machineNo) {
    return res.status(400).json({ error: "缺少必要欄位：machineNo (唯一鍵)" });
  }

  const selectWork = body.selectWork;

  let connection;
  let isNetworkError = false;
  try {
    connection = await dbmes.getConnection();
    await connection.beginTransaction();

    let tableName = "";
    let coaterTableName = "";

    switch (selectWork) {
      case "slittingCathode":
        tableName = "slittingcathode_batch";
        coaterTableName = "coatingcathode_batch";
        break;
      case "slittingAnode":
        tableName = "slittinganode_batch";
        coaterTableName = "coatinganode_batch";
        break;
      default:
        await connection.rollback();
        return res.status(400).json({ error: "無效的工作類型" });
    }

    const keys = slittingRecordKeyNeed;

    // ---------------- Step 1: UPSERT 主分切紀錄 ----------------
    const sql = `INSERT INTO ${tableName} (${keys.join(", ")})
      VALUES (${keys.map(() => "?").join(", ")})
      ON DUPLICATE KEY UPDATE
      ${keys.filter(key => key !== "id").map(key => `${key} = VALUES(${key})`).join(", ")}`;

    const values = extractRollingValues(body, keys);

    const [result] = await connection.query(sql, values);

    if (result.affectedRows === 0) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗:", rbErr.message);
      }
      return res.status(404).json({ message: "沒有資料被更新或插入。" });
    }

    const rawLot = body.lotNumber_R || body.lotNumber_L || body.lotNumber || '';
    const cleanLot = String(rawLot).replace(/-1[RL]$/i, "");

    // ---------------- Step 2: 反向更新與檢查 ----------------
    if (selectWork === "slittingCathode") {
      await connection.query(
        `UPDATE mes.${coaterTableName} SET is_received = 2 WHERE lotNumber = ?`,
        [cleanLot]
      );
    } else if (selectWork === "slittingAnode") {
      const isR = body.lotNumber_R && String(body.lotNumber_R).trim() !== '';
      const isL = body.lotNumber_L && String(body.lotNumber_L).trim() !== '';

      // A. 根據當前單次送出的右側 (R) 或左側 (L) 獨立更新 stock / stock_L 為 1
      if (isR) {
        const sql_r_stock = `
          UPDATE mes.${tableName} 
          SET stock = 1 
          WHERE (lotNumber_R = ? OR lotNumber_R LIKE CONCAT(?, '%')) 
            AND (is_deleted IS NULL OR is_deleted = 0)
        `;
        await connection.query(sql_r_stock, [body.lotNumber_R, cleanLot]);
      }

      if (isL) {
        const sql_l_stock = `
          UPDATE mes.${tableName} 
          SET stock_L = 1 
          WHERE (lotNumber_L = ? OR lotNumber_L LIKE CONCAT(?, '%')) 
            AND (is_deleted IS NULL OR is_deleted = 0)
        `;
        await connection.query(sql_l_stock, [body.lotNumber_L, cleanLot]);
      }


      // 更新 slittinganode 中 stock R 與 L side 的資料都為1
      if (!isR && !isL) {
        const sql_anode_stock = `
          UPDATE mes.${tableName} 
          SET stock = IF(lotNumber_R IS NOT NULL AND lotNumber_R <> '', 1, stock), 
              stock_L = IF(lotNumber_L IS NOT NULL AND lotNumber_L <> '', 1, stock_L) 
          WHERE (lotNumber_R LIKE CONCAT(?, '%') OR lotNumber_L LIKE CONCAT(?, '%')) 
            AND (is_deleted IS NULL OR is_deleted = 0)
        `;
        await connection.query(sql_anode_stock, [cleanLot, cleanLot]);
      }

      // D. 依據流程架構圖：slittingAnode 完成分切時，統一回寫 coatinganode_batch 為 is_received = 1
      await connection.query(
        `UPDATE mes.${coaterTableName} SET is_received = 1 WHERE lotNumber = ?`,
        [cleanLot]
      );
    }

    // 3. 全部步驟成功，提交交易
    await connection.commit();

    return res.status(200).json({
      message: `Slitting UPSERT 成功，影響筆數: ${result.affectedRows}`,
      insertId: result.insertId,
      affectedRows: result.affectedRows,
      id_Card: body.id_Card
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("交易失敗，執行 Rollback：", error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Slitting UPSERT 發生異常，已還原異動",
        detail: error.message
      });
    }
  } finally {
    if (connection) {
      if (isNetworkError || connection.destroyed) {
        connection.destroy();
      } else {
        connection.release();
      }
    }
  }
});


router.post("/updateEngineerSet", async (req, res) => {
  const data = req.body;
  let conn;
  let isNetworkError = false;
  try {
    conn = await dbcon.getConnection();
    await conn.beginTransaction();

    const results = {
      success: [],
      errors: []
    };

    for (const selectWork of Object.keys(data)) {
      if (!Array.isArray(data[selectWork]) || data[selectWork].length === 0) {
        continue;
      }

      const isRolling = selectWork.includes('rolling');

      const [existingCards] = await conn.query(
        "SELECT id, engineerId, cardPosition FROM hr.rollingNslitting_register WHERE selectWork = ? AND is_deleted = 0 ORDER BY engineerId, cardPosition",
        [selectWork]
      );

      const existingCardsByEngineer = {};
      existingCards.forEach(card => {
        if (!existingCardsByEngineer[card.engineerId]) {
          existingCardsByEngineer[card.engineerId] = [];
        }
        existingCardsByEngineer[card.engineerId].push(card);
      });

      const newCardsByEngineer = {};
      data[selectWork].forEach(item => {
        if (!newCardsByEngineer[item.engineerId]) {
          newCardsByEngineer[item.engineerId] = [];
        }
        newCardsByEngineer[item.engineerId].push(item);
      });

      for (const engineerId in newCardsByEngineer) {
        const cardsForEngineer = newCardsByEngineer[engineerId];

        let maxPosition = -1;
        if (existingCardsByEngineer[engineerId]) {
          existingCardsByEngineer[engineerId].forEach(card => {
            if (card.cardPosition > maxPosition) {
              maxPosition = card.cardPosition;
            }
          });
        }

        for (const item of cardsForEngineer) {
          if (!item.machineNo || item.machineNo.trim() === '') {
            console.log(`跳過空機台編號: ${selectWork}, engineerId: ${engineerId}`);
            continue;
          }

          let cardPosition = maxPosition + 1;
          maxPosition++;

          let sql;
          let params;

          if (isRolling) {
            sql = `
              INSERT INTO hr.rollingNslitting_register (
                selectWork, 
                machineNo, 
                rollingThickness_EG_S, 
                rollingThickness_EG_E, 
                rollingDensity_EG_S, 
                rollingDensity_EG_E, 
                announceCapacity, 
                remark, 
                engineerName, 
                engineerId, 
                cardPosition,
                widthToMeter,
                slittingWidth_S,
                slittingWidth_E
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                machineNo = VALUES(machineNo), 
                rollingThickness_EG_S = VALUES(rollingThickness_EG_S), 
                rollingThickness_EG_E = VALUES(rollingThickness_EG_E), 
                rollingDensity_EG_S = VALUES(rollingDensity_EG_S), 
                rollingDensity_EG_E = VALUES(rollingDensity_EG_E), 
                announceCapacity = VALUES(announceCapacity), 
                remark = VALUES(remark), 
                engineerName = VALUES(engineerName),
                widthToMeter = VALUES(widthToMeter),
                slittingWidth_S = VALUES(slittingWidth_S),
                slittingWidth_E = VALUES(slittingWidth_E)
            `;
            params = [selectWork, item.machineNo, item.rollingThickness_EG_S || null, item.rollingThickness_EG_E || null, item.rollingDensity_EG_S || null, item.rollingDensity_EG_E || null, item.announceCapacity || null, item.remark || null, item.engineerName, item.engineerId, cardPosition, item.widthToMeter || null, item.slittingWidth_S || null, item.slittingWidth_E || null];
          } else {
            sql = `INSERT INTO hr.rollingNslitting_register (
                selectWork,
                machineNo, 
                announceCapacity, 
                remark, 
                engineerName, 
                engineerId, 
                cardPosition ,
                widthToMeter,
                slittingWidth_S,
                slittingWidth_E
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                machineNo = VALUES(machineNo), 
                announceCapacity = VALUES(announceCapacity), 
                remark = VALUES(remark), 
                engineerName = VALUES(engineerName) ,
                widthToMeter = VALUES(widthToMeter),
                slittingWidth_S = VALUES(slittingWidth_S),
                slittingWidth_E = VALUES(slittingWidth_E)
            `;
            params = [selectWork, item.machineNo, item.announceCapacity || null, item.remark || null, item.engineerName, item.engineerId, cardPosition, item.widthToMeter || null, item.slittingWidth_S || null, item.slittingWidth_E || null];
          }

          const [result] = await conn.query(sql, params);
          results.success.push({ type: selectWork, machineNo: item.machineNo, cardPosition: cardPosition, affectedRows: result.affectedRows });
        }

        const [allCards] = await conn.query(
          "SELECT id FROM hr.rollingNslitting_register WHERE selectWork = ? AND engineerId = ? AND is_deleted = 0 ORDER BY cardPosition",
          [selectWork, engineerId]
        );

        for (let i = 0; i < allCards.length; i++) {
          await conn.query(
            "UPDATE hr.rollingNslitting_register SET cardPosition = ? WHERE id = ?",
            [i, allCards[i].id]
          );
        }
      }
    }

    await conn.commit();
    res.status(200).json({ success: true, message: "工程師設定批量更新完成，卡片位置已自動排序", results });
  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("工程師設定更新失敗:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "工程師設定更新失敗", detail: error.message });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
  }
});


// 逐筆查詢
router.get("/getEngineerSettings", async (req, res) => {
  try {
    const { selectWork, engineerId } = req.query;
    console.log("selectWork  : ", selectWork, " | ", "  engineerId:  ", engineerId);

    let sql = `SELECT * FROM hr.rollingNslitting_register WHERE 1=1 AND machineNo IS NOT NULL AND machineNo != '' AND is_deleted = 0 `;
    const params = [];

    if (selectWork) {
      sql += " AND selectWork = ?";
      params.push(selectWork);
    }

    if (engineerId) {
      sql += " AND engineerId = ?";
      params.push(engineerId);
    }

    sql += " ORDER BY selectWork, cardPosition";

    const [rows] = await dbcon.query(sql, params);

    const result = {
      rollingCathode: [],
      rollingAnode: [],
      slittingCathode: [],
      slittingAnode: []
    };

    rows.forEach(row => {
      if (row.selectWork === 'rollingCathode') {
        result.rollingCathode.push(row);
      } else if (row.selectWork === 'rollingAnode') {
        result.rollingAnode.push(row);
      } else if (row.selectWork === 'slittingCathode') {
        result.slittingCathode.push(row);
      } else if (row.selectWork === 'slittingAnode') {
        result.slittingAnode.push(row);
      }
    });

    res.status(200).json({
      success: true,
      message: "工程師設定查詢成功",
      data: result
    });
  } catch (error) {
    console.error("工程師設定查詢失敗:", error);
    res.status(500).json({
      success: false,
      error: "工程師設定查詢失敗",
      detail: error.message
    });
  }
});

// 刪除工程師設定頁面卡片
router.delete("/deleteEngineerSetting", async (req, res) => {
  let connection;
  let isNetworkError = false;
  try {
    const params = req.method === 'DELETE' ? req.query : req.body;
    const { selectWork, machineNo, engineerId } = params;

    if (!machineNo || !selectWork || !engineerId) {
      return res.status(400).json({
        success: false,
        error: "缺少必要參數: 需要提供 machineNo, selectWork 和 engineerId"
      });
    }

    connection = await dbcon.getConnection();
    await connection.beginTransaction();

    const deletedAt = moment().format("YYYY-MM-DD HH:mm:ss");

    const [markResult] = await connection.query(
      "UPDATE hr.rollingNslitting_register SET is_deleted = 1, deleted_at = ?, delete_operation = 'user_delete' WHERE machineNo = ? AND selectWork = ? AND engineerId = ?",
      [deletedAt, machineNo, selectWork, engineerId]
    );

    if (markResult.affectedRows === 0) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗:", rbErr.message);
      }
      return res.status(404).json({
        success: false,
        message: "標記為刪除失敗，未找到符合條件的工程師設定"
      });
    }

    const [remainingCards] = await connection.query(
      "SELECT id FROM hr.rollingNslitting_register WHERE selectWork = ? AND engineerId = ? AND is_deleted = 0 ORDER BY cardPosition",
      [selectWork, engineerId]
    );

    for (let i = 0; i < remainingCards.length; i++) {
      await connection.query(
        "UPDATE hr.rollingNslitting_register SET cardPosition = ? WHERE id = ?",
        [i, remainingCards[i].id]
      );
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "工程師設定已刪除且卡片位置已重新排序",
      affectedRows: markResult.affectedRows,
      reorderedCards: remainingCards.length
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("工程師設定刪除失敗:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "工程師設定刪除失敗",
        detail: error.message
      });
    }
  } finally {
    if (connection) {
      if (isNetworkError || connection.destroyed) {
        connection.destroy();
      } else {
        connection.release();
      }
    }
  }
});

// 逐筆查詢
router.get("/getSearchPage", async (req, res) => {
  const {
    option,
    searchTerm,
    startDate,
    endDay,
    page,
    pageSize
  } = req.query

  let tableName = ""
  let keys = [];


  console.log("option:  ", decodeURIComponent(option))
  switch (decodeURIComponent(option)) {
    case "all":
      tableName = [
        'rollingcathode_batch',
        'rollinganode_batch',
        'slittingcathode_batch',
        'slittinganode_batch'];
      keys = [RollingRecordKeyNeed, slittingRecordKeyNeed]
      break;

    case "正極輾壓":
      tableName = ['rollingcathode_batch'];
      keys = [RollingRecordKeyNeed];
      break;

    case "負極輾壓":
      tableName = ['rollinganode_batch'];
      keys = [RollingRecordKeyNeed];
      break;

    case "正極分切":
      tableName = ['slittingcathode_batch'];
      keys = [slittingRecordKeyNeed];
      break;

    case "負極分切":
      tableName = ['slittinganode_batch'];
      keys = [slittingRecordKeyNeed];
      break;

    case "error":
      tableName = [
        'rollingcathode_batch',
        'rollinganode_batch',
        'slittingcathode_batch',
        'slittinganode_batch'
      ];
      keys = [RollingRecordKeyNeed, slittingRecordKeyNeed]
      break;

    default:
      return res.status(400).json({ error: "無效的 option 參數" });
  }

  if (!tableName.length || !keys.length) {
    return res.status(400).json({ error: "查詢參數錯誤" });
  }

  try {
    const params = [];
    const todayEarlier = moment(startDate).startOf('day').format("YYYY-MM-DD 00:00:00");

    if (startDate && endDay) {
      params.push(
        moment(todayEarlier).startOf('day').format("YYYY-MM-DD HH:mm:ss"),
        moment(endDay).endOf('day').add(1, 'days').format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // page, pageSize 轉為數字並計算 offset
    const pageNum = parseInt(page, 10) || 1;
    const pageSizeNum = parseInt(pageSize, 10) || 10;
    const offset = (pageNum - 1) * pageSizeNum;

    let sql = "";
    let sqlCount = "";

    const unionKeys = Array.from(new Set([...RollingRecordKeyNeed, ...slittingRecordKeyNeed]));

    // 產生 SELECT 欄位字串
    function buildSelect(keys, table, workType) {
      // 每個欄位如果存在於該表 keys 就用本身，否則補 NULL
      const cols = unionKeys.map(k =>
        keys.includes(k) ? `${table}.${k}` : `NULL AS ${k}`
      ).join(", ");

      const hasSearch = searchTerm !== "" && searchTerm !== null && searchTerm !== undefined && String(searchTerm).trim() !== "";

      // 若有文字搜尋則忽略日期，否則依日期區間過濾
      let where = hasSearch ? "WHERE 1=1" : "WHERE employee_InputTime BETWEEN ? AND ?";
      if (hasSearch) {
        const trimmedSearch = String(searchTerm).trim();
        if (trimmedSearch.length <= 5) {
          where += ` AND memberNumber LIKE ? `;
        }
        else if (trimmedSearch.length > 5) {
          // 根據表格類型調整 lotNumber 篩選欄位
          if (table.includes('slitting')) {
            // 對分切表格，同時搜尋 R 和 L 兩個批號
            where += ` AND (lotNumber_R LIKE ? OR lotNumber_L LIKE ?) AND (is_deleted IS NULL OR is_deleted = 0) `;
          } else { // rolling 表格
            where += ` AND lotNumber LIKE ? `;
          }
        }
      }
      return `SELECT ${cols} FROM ${table} ${where}`;
    }

    // option === "all"
    if (option === "all") {

      sql = `
    SELECT * FROM (
      ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch')}
      UNION ALL
      ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch')}
      UNION ALL
      ${buildSelect(slittingRecordKeyNeed, 'slittingcathode_batch')}
      UNION ALL
      ${buildSelect(slittingRecordKeyNeed, 'slittinganode_batch')}
    ) AS combined
    WHERE (is_deleted IS NULL OR is_deleted = 0)
    GROUP BY id , selectWork , lotNumber_R , lotNumber_L 
    ORDER BY employee_InputTime DESC
    LIMIT ${offset}, ${pageSizeNum}
  `;

      sqlCount = `
    SELECT COUNT(*) AS totalCount FROM (
      SELECT 1 FROM (
      ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch')}
      UNION ALL
      ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch')}
      UNION ALL
      ${buildSelect(slittingRecordKeyNeed, 'slittingcathode_batch')}
      UNION ALL
      ${buildSelect(slittingRecordKeyNeed, 'slittinganode_batch')}
      ) AS combined
      WHERE (is_deleted IS NULL OR is_deleted = 0)
      GROUP BY id , selectWork , lotNumber_R , lotNumber_L 
    ) AS final_count
    `;


      params.length = 0;
      const tables = [
        "rollingcathode",
        "rollinganode",
        "slittingcathode",
        "slittinganode"
      ];

      const hasSearch = searchTerm !== "" && searchTerm !== null && searchTerm !== undefined && String(searchTerm).trim() !== "";
      const trimmedSearch = hasSearch ? String(searchTerm).trim() : "";

      for (let t of tables) {

        // 若無文字搜尋，才使用日期區間
        if (!hasSearch) {
          params.push(startDate, endDay);
          continue;
        }

        // 有文字搜尋：忽略日期，僅塞入搜尋參數
        if (trimmedSearch.length <= 5) {
          params.push(`%${trimmedSearch}%`);
          continue;
        }

        if (t.includes("slitting")) {
          // 分切要比對 lotNumber_R + lotNumber_L
          params.push(`%${trimmedSearch}%`, `%${trimmedSearch}%`);
        } else { // rolling 表格
          // 輾壓只需要 1 個 lotNumber
          params.push(`%${trimmedSearch}%`);
        }
      }

    }
    else if (option === "error") {
      sql = `
      SELECT * FROM (
        ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch', '正極輾壓')}
        UNION ALL
        ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch', '負極輾壓')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed, 'slittingcathode_batch', '正極分切')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed, 'slittinganode_batch', '負極分切')}
      ) AS combined
       WHERE is_deleted = 1
       GROUP BY id , selectWork , lotNumber_R , lotNumber_L 
      ORDER BY employee_InputTime DESC
      LIMIT ${offset}, ${pageSizeNum}
    `;

      sqlCount = `
      SELECT COUNT(*) AS totalCount FROM (
        SELECT 1 FROM (
        ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch', '正極輾壓')}
        UNION ALL
        ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch', '負極輾壓')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed, 'slittingcathode_batch', '正極分切')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed, 'slittinganode_batch', '負極分切')}
        ) AS combined
       WHERE is_deleted = 1
       GROUP BY id , selectWork , lotNumber_R , lotNumber_L 
      ) AS final_count
      `

      params.length = 0;
      const tables = [
        "rollingcathode",
        "rollinganode",
        "slittingcathode",
        "slittinganode"
      ];

      const hasSearch = searchTerm !== "" && searchTerm !== null && searchTerm !== undefined && String(searchTerm).trim() !== "";
      const trimmedSearch = hasSearch ? String(searchTerm).trim() : "";

      for (let t of tables) {

        // 若無文字搜尋，才使用日期區間
        if (!hasSearch) {
          params.push(startDate, endDay);
          continue;
        }

        // 有文字搜尋：忽略日期，僅塞入搜尋參數
        if (trimmedSearch.length <= 5) {
          params.push(`%${trimmedSearch}%`);
          continue;
        }

        if (t.includes("slitting")) {
          // 分切要比對 lotNumber_R + lotNumber_L
          params.push(`%${trimmedSearch}%`, `%${trimmedSearch}%`);
        } else { // 輾壓只需要 1 個 lotNumber
          params.push(`%${trimmedSearch}%`);
        }
      }

    }
    else if (tableName.length === 1) {
      console.log("單一表查詢:", tableName[0]);

      params.length = 0;
      const hasSearch = searchTerm !== "" && searchTerm !== null && searchTerm !== undefined && String(searchTerm).trim() !== "";
      const trimmedSearch = hasSearch ? String(searchTerm).trim() : "";

      // 若有文字搜尋則忽略日期，否則使用日期區間
      let dateFilter = " 1=1 ";
      if (!hasSearch && startDate && endDay) {
        dateFilter = " employee_InputTime BETWEEN ? AND ? ";
        params.push(startDate, endDay);
      }

      let searchFilter = "";
      if (hasSearch) {
        if (trimmedSearch.length <= 5) {
          searchFilter = " AND memberNumber LIKE ? ";
          params.push(`%${trimmedSearch}%`);
        } else {
          if (option === "負極分切" || option === "正極分切") {
            searchFilter = " AND (lotNumber_R LIKE ? OR lotNumber_L LIKE ?) ";
            params.push(`%${trimmedSearch}%`, `%${trimmedSearch}%`);
          } else {
            searchFilter = " AND lotNumber LIKE ? ";
            params.push(`%${trimmedSearch}%`);
          }
        }
      }

      switch (option) {
        case "負極分切":
        case "正極分切":

          sql = `SELECT ${keys[0].map(k => `t1.${k}`).join(", ")} , t1.stock 
          FROM ${tableName[0]} t1
          INNER JOIN (
            SELECT lotNumber_R, MAX(id) AS max_id
            FROM ${tableName[0]}
            WHERE ${dateFilter}
              AND (is_deleted IS NULL OR is_deleted = 0)
              AND (delete_operation NOT IN ('user_delete_both') OR delete_operation IS NULL)
              ${searchFilter}
              AND lotNumber_R IS NOT NULL
              AND lotNumber_R != ''
              AND workTime IS NOT NULL
            GROUP BY lotNumber_R
          ) t2 ON t1.lotNumber_R = t2.lotNumber_R AND t1.id = t2.max_id
          ORDER BY t1.employee_InputTime DESC LIMIT ${offset}, ${pageSizeNum}`;

          sqlCount = `SELECT COUNT(*) AS totalCount 
          FROM ${tableName[0]} t1
          INNER JOIN (
            SELECT lotNumber_R, MAX(id) AS max_id
            FROM ${tableName[0]}
            WHERE ${dateFilter}
              AND (is_deleted IS NULL OR is_deleted = 0)
              AND (delete_operation NOT IN ('user_delete_both') OR delete_operation IS NULL)
              ${searchFilter}
              AND lotNumber_R IS NOT NULL
              AND lotNumber_R != ''
              AND workTime IS NOT NULL
            GROUP BY lotNumber_R
          ) t2 ON t1.lotNumber_R = t2.lotNumber_R AND t1.id = t2.max_id`;

          break;

        case "正極輾壓":
        case "負極輾壓":
        default:
          sql = `SELECT ${keys[0].join(", ")} FROM ${tableName[0]} WHERE ${dateFilter} AND (is_deleted IS NULL OR is_deleted = 0) ${searchFilter} ORDER BY employee_InputTime DESC LIMIT ${offset}, ${pageSizeNum}`;
          sqlCount = `SELECT COUNT(*) AS totalCount FROM ${tableName[0]} WHERE ${dateFilter} AND (is_deleted IS NULL OR is_deleted = 0) ${searchFilter}`;
          break;
      }

      console.log("Base SQL:", sql);
      console.log("Count SQL:", sqlCount);
    }


    const [rows] = await dbmes.query(sql, params);
    const [countResult] = await dbmes.query(sqlCount, params);
    const totalRecords = countResult[0]?.totalCount;

    console.log("totalRecords : ", totalRecords);
    const totalPages = Math.ceil(totalRecords / pageSizeNum);
    console.log("totalPages : ", String(totalPages));

    for (let row of rows) {
      row.employee_InputTime = moment(row.employee_InputTime).format("YYYY-MM-DD HH:mm:ss");
    }

    // 正極分切、負極分切需要從 hr.rollingnslitting_register 取得額外欄位
    if (option === "正極分切" || option === "負極分切") {
      const sql_EgSetting = 'SELECT * FROM hr.rollingnslitting_register WHERE engineerId = 264 AND is_deleted = 0';
      const [rowsOf_egSetting] = await dbcon.query(sql_EgSetting);

      for (let row of rows) {
        for (let egSetting of rowsOf_egSetting) {
          if (row.machineNo === egSetting.machineNo) {
            row.slittingWidth_S = egSetting.slittingWidth_S;
            row.slittingWidth_E = egSetting.slittingWidth_E;
            row.widthToMeter = egSetting.widthToMeter;
          }
        }
      }
    }

    // 根據 option 決定使用哪個 key 順序
    // 正極分切、負極分切需要額外加入 slittingExtraKeys
    const outputKeys = (option === "正極分切" || option === "負極分切")
      ? [...slittingRecordKeyNeed, ...slittingExtraKeys]
      : (option === "正極輾壓" || option === "負極輾壓")
        ? RollingRecordKeyNeed
        : unionKeys;
    let finalData = changeKeyWords(rows, outputKeys);

    console.log("查詢結果:", finalData);
    console.log("執行的 SQL:", sql);
    // console.log("SQL 參數:", params);
    // console.log("總記錄數:", totalRecords, "總頁數:", totalPages);

    res.status(200).json({
      message: "查詢頁面加載成功",
      data: finalData,
      pagination: {
        currentPage: pageNum,
        pageSize: pageSizeNum,
        totalRecords: totalRecords,
        totalPages: totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error("查詢頁面加載失敗:", error);
    return res.status(500).json({
      error: "查詢頁面加載失敗",
      detail: error.message
    });
  }
});


// 於查詢頁面假意刪除資料
router.put('/deleteData', async (req, res) => {
  const { selectedRows } = req.body
  console.log("selectedRows: ", selectedRows);

  // 過濾無效或空的資料行
  const validRows = (selectedRows || []).filter(row => row !== null && row !== undefined);

  if (validRows.length === 0) {
    return res.status(200).json({
      success: true,
      message: "沒有需要處理的資料",
      data: [],
      totalProcessed: 0
    });
  }

  let connection;
  let isNetworkError = false;
  try {
    connection = await dbmes.getConnection();
    await connection.beginTransaction();

    const results = [];
    const deletedAt = moment().format("YYYY-MM-DD HH:mm:ss");

    // 將相同表的操作分組，減少循環次數
    const groupedOperations = {};

    for (const row of validRows) {
      // 檢查並映射 selectWork 欄位，處理不同的命名
      let selectWork = row.selectWork;
      let side = row.side || 'full';


      if (row.hasOwnProperty('lotNumber_R')) {
        side = '-1R';
      } else if (row.hasOwnProperty('lotNumber_L')) {
        side = '-1L';
      }


      console.log("處理行資料:", {
        id: row.id,
        selectWork: selectWork,
        lotNumber_R: row.lotNumber_R,
        lotNumber_L: row.lotNumber_L,
        determinedSide: side
      });

      const key = `${selectWork}_${side}`;
      if (!groupedOperations[key]) {
        groupedOperations[key] = {
          selectWork: selectWork,
          side: side,
          ids: []
        };
      }
      groupedOperations[key].ids.push(row.id);
    }

    // 批量執行相同的操作
    for (const [key, operation] of Object.entries(groupedOperations)) {
      let tableName = "";
      let sql = "";

      switch (operation.selectWork) {
        case "rollingCathode":
        case "正極輾壓":
          tableName = "rollingcathode_batch";
          sql = `UPDATE ${tableName} SET is_deleted = 1, deleted_at = ?, delete_operation = 'user_delete' WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          break;
        case "rollingAnode":
        case "負極輾壓":
          tableName = "rollinganode_batch";
          sql = `UPDATE ${tableName} SET is_deleted = 1, deleted_at = ?, delete_operation = 'user_delete' WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          break;
        case "slittingCathode":
        case "正極分切":
          tableName = "slittingcathode_batch";
          if (operation.side === '-1R') {
            sql = `UPDATE ${tableName} SET 
                     lotNumber_R = NULL, Length_R = NULL, LostLength_R = NULL, incomeLength_R = NULL, yield_R = NULL, errorStatus_R = NULL, slittingSpeed_R = NULL, lostWeight_R = NULL,
                     is_deleted = CASE WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 1 ELSE 0 END,
                     deleted_at = ?, delete_operation = CASE WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 'user_delete_both' ELSE 'user_delete_R' END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else if (operation.side === '-1L') {
            sql = `UPDATE ${tableName} SET 
                     lotNumber_L = NULL, Length_L = NULL, LostLength_L = NULL, incomeLength_L = NULL, yield_L = NULL, errorStatus_L = NULL, slittingSpeed_L = NULL, lostWeight_L = NULL,
                     is_deleted = CASE WHEN (lotNumber_R IS NULL OR lotNumber_R = '' OR lotNumber_R = '-R') THEN 1 ELSE 0 END,
                     deleted_at = ?, delete_operation = CASE WHEN (lotNumber_R IS NULL OR lotNumber_R = '' OR lotNumber_R = '-R') THEN 'user_delete_both' ELSE 'user_delete_L' END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else {
            sql = `UPDATE ${tableName} SET is_deleted = 1, deleted_at = ?, delete_operation = 'user_delete' WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          }
          break;
        case "slittingAnode":
        case "負極分切":
          tableName = "slittinganode_batch";
          if (operation.side === '-1R') {
            sql = `UPDATE ${tableName} SET 
                     lotNumber_R = NULL, Length_R = NULL, LostLength_R = NULL, incomeLength_R = NULL, yield_R = NULL, errorStatus_R = NULL, slittingSpeed_R = NULL, lostWeight_R = NULL,
                     is_deleted = CASE WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 1 ELSE 0 END,
                     deleted_at = ?, delete_operation = CASE WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 'user_delete_both' ELSE 'user_delete_R' END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else if (operation.side === '-1L') {
            sql = `UPDATE ${tableName} SET 
                     lotNumber_L = NULL, Length_L = NULL, LostLength_L = NULL, incomeLength_L = NULL, yield_L = NULL, errorStatus_L = NULL, slittingSpeed_L = NULL, lostWeight_L = NULL,
                     is_deleted = CASE WHEN (lotNumber_R IS NULL OR lotNumber_R = '' OR lotNumber_R = '-R') THEN 1 ELSE 0 END,
                     deleted_at = ?, delete_operation = CASE WHEN (lotNumber_R IS NULL OR lotNumber_R = '' OR lotNumber_R = '-R') THEN 'user_delete_both' ELSE 'user_delete_L' END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else {
            sql = `UPDATE ${tableName} SET is_deleted = 1, deleted_at = ?, delete_operation = 'user_delete' WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          }
          break;
        default:
          console.error("未知的工作類型:", operation.selectWork);
          throw new Error(`無效的工作類型: ${operation.selectWork}`);
      }

      const params = [deletedAt, ...operation.ids];
      const [result] = await connection.query(sql, params);

      results.push({ selectWork: operation.selectWork, side: operation.side, tableName: tableName, affectedRows: result.affectedRows, processedIds: operation.ids });
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: `批量刪除成功，共處理 ${validRows.length} 筆資料`,
      data: results,
      totalProcessed: validRows.length
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("批量刪除失敗:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "批量刪除失敗",
        detail: error.message
      });
    }
  } finally {
    if (connection) {
      if (isNetworkError || connection.destroyed) {
        connection.destroy();
      } else {
        connection.release();
      }
    }
  }
});

router.get("/downloadData", async (req, res) => {
  const {
    option,
    searchTerm,
    startDate,
    endDay
  } = req.query

  console.log("Download 接收到的参数:", { option, searchTerm, startDate, endDay });

  let tableName = ""
  let sql = "";
  let keys = [];

  switch (option) {
    case "all":
      tableName = ['rollingcathode_batch', 'rollinganode_batch', 'slittingcathode_batch', 'slittinganode_batch'];
      keys = [RollingRecordKeyNeed, slittingRecordKeyNeed]
      break;

    case "正極輾壓":
      tableName = ['rollingcathode_batch'];
      keys = [RollingRecordKeyNeed];
      break;

    case "負極輾壓":
      tableName = ['rollinganode_batch'];
      keys = [RollingRecordKeyNeed];
      break;

    case "正極分切":
      tableName = ['slittingcathode_batch'];
      keys = [slittingRecordKeyNeed];
      break;

    case "負極分切":
      tableName = ['slittinganode_batch'];
      keys = [slittingRecordKeyNeed];
      break;

    case "error":
      tableName = ['rollingcathode_batch', 'rollinganode_batch', 'slittingcathode_batch', 'slittinganode_batch'];
      keys = [RollingRecordKeyNeed, slittingRecordKeyNeed]
      break;

    default:
      return res.status(400).json({ error: "無效的 option 參數" });
  }

  if (!tableName.length || !keys.length) {
    return res.status(400).json({ error: "查詢參數錯誤" });
  }


  try {
    const params = [];

    console.log("原始日期參數:", { startDate, endDay });

    let formattedStartDate = "";
    let formattedEndDate = "";

    if (startDate && endDay) {
      formattedStartDate = moment(startDate).startOf('day').format("YYYY-MM-DD HH:mm:ss");
      formattedEndDate = moment(endDay).endOf('day').add(1, 'days').format("YYYY-MM-DD HH:mm:ss");
      console.log("格式化後的日期:", { formattedStartDate, formattedEndDate });

      params.push(formattedStartDate, formattedEndDate);
    }


    const unionKeys = Array.from(new Set([...RollingRecordKeyNeed, ...slittingRecordKeyNeed]));

    // 產生 SELECT 欄位字串
    function buildSelect(keys, table, workType) {
      // 每個欄位如果存在於該表 keys 就用本身，否則補 NULL
      const cols = unionKeys.map(k =>
        keys.includes(k) ? `${table}.${k}` : `NULL AS ${k}`
      ).join(", ");

      let where = "WHERE employee_InputTime BETWEEN ? AND ?";
      if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined) {
        if (searchTerm.length <= 5) {
          where += ` AND memberNumber LIKE ? `;
        }
        else if (searchTerm.length > 5) {
          // 根據表格類型調整 lotNumber 篩選欄位
          if (table.includes('slitting')) {
            // 對分切表格，同時搜尋 R 和 L 兩個批號
            where += ` AND (lotNumber_R LIKE ? OR lotNumber_L LIKE ?) `;
          } else { // rolling 表格
            where += ` AND lotNumber LIKE ? `;
          }
        }
      }
      return `SELECT ${cols} FROM ${table} ${where}`;
    }

    // option === "all"
    if (option === "all") {

      sql = `
    SELECT * FROM (
      ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch')}
      UNION ALL
      ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch')}
      UNION ALL
      ${buildSelect(slittingRecordKeyNeed, 'slittingcathode_batch')}
      UNION ALL
      ${buildSelect(slittingRecordKeyNeed, 'slittinganode_batch')}
    ) AS combined
    WHERE (is_deleted IS NULL OR is_deleted = 0)
    GROUP BY id , selectWork , lotNumber_R , lotNumber_L 
    ORDER BY employee_InputTime DESC
  `;

      // params 要有 6 組日期 + 6 組 searchTerm
      params.length = 0;
      const tables = [
        "rollingcathode",
        "rollinganode",
        "slittingcathode",
        "slittinganode"
      ];

      for (let t of tables) {

        // --- 共同日期 ---
        params.push(startDate + " 00:00:00", endDay + " 23:59:59");

        if (!searchTerm) continue;

        // --- 工號搜尋（長度 ≤ 5） ---
        if (/^\d+$/.test(searchTerm) && searchTerm.length <= 5) {
          params.push(`%${searchTerm}%`);
          continue;
        }

        // --- 批號搜尋（長度 > 5） ---
        if (t.includes("slitting")) {
          // 分切要比對 lotNumber_R + lotNumber_L
          params.push(`%${searchTerm}%`, `%${searchTerm}%`);
        } else { // 輾壓只需要 1 個 lotNumber
          params.push(`%${searchTerm}%`);
        }
      }

    }
    else if (option === "error") {
      sql = `
      SELECT * FROM (
        ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch', '正極輾壓')}
        UNION ALL
        ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch', '負極輾壓')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed, 'slittingcathode_batch', '正極分切')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed, 'slittinganode_batch', '負極分切')}
      ) AS combined
       WHERE is_deleted = 1
       GROUP BY id , selectWork , lotNumber_R , lotNumber_L   
      ORDER BY employee_InputTime DESC
    `;

      params.length = 0;
      const tables = [
        "rollingcathode",
        "rollinganode",
        "slittingcathode",
        "slittinganode"
      ];

      for (let t of tables) {

        // --- 共同日期 ---
        params.push(startDate + " 00:00:00", endDay + " 23:59:59");

        if (!searchTerm) continue;

        // --- 工號搜尋（長度 ≤ 5） ---
        if (/^\d+$/.test(searchTerm) && searchTerm.length <= 5) {
          params.push(`%${searchTerm}%`);
          continue;
        }
        // --- 批號搜尋（長度 > 5） ---
        if (t.includes("slitting")) {
          // 分切要比對 lotNumber_R + lotNumber_L
          params.push(`%${searchTerm}%`, `%${searchTerm}%`);
        } else { // 輾壓只需要 1 個 lotNumber
          params.push(`%${searchTerm}%`);
        }
      }

    }
    else if (tableName.length === 1) {
      console.log("單一表查詢:", tableName[0]);

      switch (option) {
        case "負極分切":
        case "正極分切":

          sql = `SELECT ${keys[0].join(", ")} , stock FROM ${tableName[0]} 
        WHERE employee_InputTime BETWEEN ? AND ? AND 
        (is_deleted IS NULL OR is_deleted = 0) AND 
        ( delete_operation NOT IN ('user_delete_both') OR delete_operation IS NULL ) AND 
        lotNumber_R IS NOT NULL AND lotNumber_R != '' AND
        lotNumber_L IS NOT NULL AND lotNumber_L != '' `;
          break;
        case "正極輾壓":
        case "負極輾壓":
          sql = `SELECT ${keys[0].join(", ")} FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND (is_deleted IS NULL OR is_deleted = 0) `;
          break;
        default:
          sql = `SELECT ${keys[0].join(", ")} FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND (is_deleted IS NULL OR is_deleted = 0) `;
      }

      console.log("Base SQL:", sql);


      if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined) {
        if (searchTerm.length <= 5) {
          sql += ` AND memberNumber LIKE ? `;
          // sqlCount += ` AND engineerId LIKE ? `;
        }
        else if (searchTerm.length > 5) {
          // 根據選項決定使用哪個 lotNumber 欄位
          if (option.includes('_R')) {
            sql += ` AND lotNumber_R LIKE ? `;
          } else if (option.includes('_L')) {
            sql += ` AND lotNumber_L LIKE ? `;
          } else {
            sql += ` AND lotNumber LIKE ? `;
          }
        }
      }
      sql += ` ORDER BY employee_InputTime DESC`;
      // params 要有 1 組日期 + 1 組 searchTerm
      params.length = 0;
      params.push(startDate + " 00:00:00", endDay + " 23:59:59");
      if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined) {
        if (searchTerm.length <= 5) {
          params.push(`%${searchTerm}%`);
        }
        else if (searchTerm.length > 5) {
          params.push(`%${searchTerm}%`);
        }
      }
    }



    let sql_EgSetting = 'SELECT * FROM hr.rollingnslitting_register WHERE engineerId = 264 AND is_deleted = 0';

    const [rows] = await dbmes.query(sql, params);
    const [rowsOf_egSetting] = await dbcon.query(sql_EgSetting);
    // console.log("sql 內容確認 :", sql  ,"params確認 :", params, "下載前查詢結果:", rows);
    // console.log("確認 rowsOf_egSetting資訊", Array.isArray(rowsOf_egSetting) && rowsOf_egSetting.map ? rowsOf_egSetting.map(item => ({ ...item })) : rowsOf_egSetting);

    const sortRows = formatTimeFields(rows).map(row => {
      const { errorReason, ...rowWithoutErrorReason } = row;
      return rowWithoutErrorReason;
    });

    if (String(option) === "正極分切" || String(option) === "負極分切") {
      for (let SortRow of sortRows) {
        for (let egSetting of rowsOf_egSetting) {
          if (SortRow.machineNo === egSetting.machineNo) {
            SortRow.slittingWidth_S = egSetting.slittingWidth_S;
            SortRow.slittingWidth_E = egSetting.slittingWidth_E;
            SortRow.widthToMeter = egSetting.widthToMeter;
          }
        }
      }
    }



    // 正極分切、負極分切需要額外加入 slittingExtraKeys
    const outputKeys = (option === "正極分切" || option === "負極分切")
      ? [...slittingRecordKeyNeed, ...slittingExtraKeys]
      : (option === "正極輾壓" || option === "負極輾壓")
        ? RollingRecordKeyNeed
        : unionKeys;

    console.log("Final SortRow  :", Array.isArray(sortRows) && sortRows.map ? sortRows.map(item => ({ ...item })) : sortRows);
    const finalData = changeKeyWords(sortRows, outputKeys);

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(finalData);
    xlsx.utils.book_append_sheet(workbook, worksheet, `${option}`);

    const excelBuffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(excelBuffer);

    return;

  } catch (error) {
    console.log("Download file failed : ", error.message)
  }
})


// 查詢已標記為刪除的工程師設定
router.get("/getDeletedEngineerSettings", async (req, res) => {
  const { selectWork, engineerId, startDate, endDate } = req.query;
  try {
    // 檢查表中是否有 is_deleted 列
    let hasIsDeletedColumn = true;
    try {
      // 嘗試查詢表結構
      const [columns] = await dbcon.query("SHOW COLUMNS FROM hr.rollingNslitting_register LIKE 'is_deleted'");
      hasIsDeletedColumn = columns.length > 0;
    } catch (error) {
      console.error("檢查表結構失敗:", error);
      hasIsDeletedColumn = false;
    }

    if (!hasIsDeletedColumn) {
      return res.status(400).json({
        success: false,
        message: "該表不支持軟刪除功能，無法查詢已刪除記錄"
      });
    }

    let sql = "SELECT * FROM hr.rollingNslitting_register WHERE is_deleted = 1";
    const params = [];

    if (selectWork) {
      sql += " AND selectWork = ?";
      params.push(selectWork);
    }

    if (engineerId) {
      sql += " AND engineerId = ?";
      params.push(engineerId);
    }

    if (startDate) {
      sql += " AND deleted_at >= ?";
      params.push(startDate);
    }

    if (endDate) {
      sql += " AND deleted_at <= ?";
      params.push(endDate);
    }

    sql += " ORDER BY deleted_at DESC";

    const [rows] = await dbcon.query(sql, params);

    res.status(200).json({
      success: true,
      message: "已刪除的工程師設定查詢成功",
      data: rows
    });
  } catch (error) {
    console.error("已刪除的工程師設定查詢失敗:", error);
    res.status(500).json({
      success: false,
      error: "已刪除的工程師設定查詢失敗",
      detail: error.message
    });
  }
});

// 恢復已刪除的工程師設定
router.post("/restoreEngineerSetting", async (req, res) => {
  let connection;
  let isNetworkError = false;
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "缺少必要參數: id"
      });
    }

    let hasIsDeletedColumn = true;
    try {
      const [columns] = await dbcon.query("SHOW COLUMNS FROM hr.rollingNslitting_register LIKE 'is_deleted'");
      hasIsDeletedColumn = columns.length > 0;
    } catch (error) {
      console.error("檢查表結構失敗:", error);
      hasIsDeletedColumn = false;
    }

    if (!hasIsDeletedColumn) {
      return res.status(400).json({
        success: false,
        message: "該表不支持軟刪除功能，無法恢復記錄"
      });
    }

    connection = await dbcon.getConnection();
    await connection.beginTransaction();

    const [record] = await connection.query(
      "SELECT selectWork, engineerId, cardPosition FROM hr.rollingNslitting_register WHERE id = ?",
      [id]
    );

    if (record.length === 0) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗:", rbErr.message);
      }
      return res.status(404).json({
        success: false,
        message: "未找到指定 ID 的工程師設定"
      });
    }

    const targetSelectWork = record[0].selectWork;
    const targetEngineerId = record[0].engineerId;

    const [restoreResult] = await connection.query(
      "UPDATE hr.rollingNslitting_register SET is_deleted = 0, deleted_at = NULL, delete_operation = NULL WHERE id = ?",
      [id]
    );

    if (restoreResult.affectedRows === 0) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗:", rbErr.message);
      }
      return res.status(404).json({
        success: false,
        message: "恢復失敗，未找到符合條件的工程師設定"
      });
    }

    const [activeCards] = await connection.query(
      "SELECT id, cardPosition FROM hr.rollingNslitting_register WHERE selectWork = ? AND engineerId = ? AND is_deleted = 0 ORDER BY cardPosition",
      [targetSelectWork, targetEngineerId]
    );

    for (let i = 0; i < activeCards.length; i++) {
      await connection.query(
        "UPDATE hr.rollingNslitting_register SET cardPosition = ? WHERE id = ?",
        [i, activeCards[i].id]
      );
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "工程師設定已恢復且卡片位置已重新排序",
      affectedRows: restoreResult.affectedRows,
      reorderedCards: activeCards.length
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("工程師設定恢復失敗:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "工程師設定恢復失敗",
        detail: error.message
      });
    }
  } finally {
    if (connection) {
      if (isNetworkError || connection.destroyed) {
        connection.destroy();
      } else {
        connection.release();
      }
    }
  }
});

router.get("/pastReport", async (req, res) => {
  const {
    startTime,
    endTime,
    dayShift,
    changeFile,
    engineerId,
    page = 1,
    pageSize = 20
  } = req.query;

  console.log('pastReport 接收到的參數 :', { startTime, endTime, dayShift, changeFile, engineerId, page, pageSize });

  const normalizeShift = (value) => {
    if (!value) return "";
    if (["早班", "日班", "白班"].includes(value)) return "早班";
    if (["晚班", "夜班"].includes(value)) return "晚班";
    return "";
  };

  let shift = normalizeShift(dayShift);
  let start = '';
  let end = '';
  let timeRanges = [];
  let useCteWindows = false;

  if (changeFile === 'accordingShift') {
    const baseDate = startTime ? moment(startTime).tz('Asia/Taipei') : moment().tz('Asia/Taipei');

    if (shift === '早班') {
      start = baseDate.clone().hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
      end = baseDate.clone().hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    } else if (shift === '晚班') {
      start = baseDate.clone().hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
      end = baseDate.clone().add(1, 'day').hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    } else {
      start = baseDate.clone().hour(0).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
      end = baseDate.clone().hour(23).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss');
    }
    timeRanges.push({ start, end });
  } else {
    // accordingTimeRange
    const baseStart = startTime ? moment(startTime).tz('Asia/Taipei') : moment().tz('Asia/Taipei');
    const baseEnd = endTime ? moment(endTime).tz('Asia/Taipei') : baseStart.clone();

    start = baseStart.clone().hour(0).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    end = baseEnd.clone().hour(23).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss');

    if (shift) {
      useCteWindows = true;
    } else {
      timeRanges.push({ start, end });
    }
  }

  const limit = parseInt(pageSize, 10) || 20;
  const offset = (parseInt(page, 10) - 1) * limit;
  const currentPage = parseInt(page, 10) || 1;

  const table_rolling = [
    'rollingcathode_batch',
    'rollinganode_batch',
    'slittingcathode_batch',
    'slittinganode_batch'
  ];

  let sql_Find_machineNo = `
    SELECT DISTINCT machineNo, selectWork 
    FROM hr.rollingnslitting_register 
    WHERE is_deleted = 0
  `;
  let machineQueryParams = [];


  try {
    const [machineNoResult] = await dbcon.query(sql_Find_machineNo, machineQueryParams);

    const machineGroups = {
      rollingCathode: [],
      rollingAnode: [],
      slittingCathode: [],
      slittingAnode: []
    };

    for (let machine of machineNoResult) {
      if (!machine || !machine.selectWork) continue;
      const machineNoToAdd = machine.machineNo;

      switch (machine.selectWork) {
        case "rollingCathode":
          if (!machineGroups.rollingCathode.some(m => m.machineNo === machineNoToAdd)) machineGroups.rollingCathode.push(machine);
          break;
        case "rollingAnode":
          if (!machineGroups.rollingAnode.some(m => m.machineNo === machineNoToAdd)) machineGroups.rollingAnode.push(machine);
          break;
        case "slittingCathode":
          if (!machineGroups.slittingCathode.some(m => m.machineNo === machineNoToAdd)) machineGroups.slittingCathode.push(machine);
          break;
        case "slittingAnode":
          if (!machineGroups.slittingAnode.some(m => m.machineNo === machineNoToAdd)) machineGroups.slittingAnode.push(machine);
          break;
      }
    }

    const createRollingQuery = (machines, tableName, timeRangesArr, targetShift) => {
      if (!machines || machines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const validMachines = machines.map(m => m.machineNo).filter(item => item && item !== "");
      if (validMachines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const placeholders = validMachines.map(() => '?').join(',');
      const timeConditions = timeRangesArr.map(() => `employee_InputTime BETWEEN ? AND ?`).join(' OR ');
      const timeParams = timeRangesArr.reduce((acc, range) => [...acc, range.start, range.end], []);
      const shiftCondition = targetShift ? `AND dayShift = ?` : ``;
      const shiftParams = targetShift ? [targetShift] : [];

      const sql = `
        SELECT
          IFNULL(machineNo, 'N/A_MACHINE') AS machineNo,
          IFNULL(memberName, 'N/A_OP') AS memberName,
          SUM(rollingLength) AS rollingLength,
          SUM(rolling_LostWeight) AS rolling_LostWeight,
          SUM(workTime) AS workTime
        FROM ${tableName}
        WHERE (${timeConditions})
          ${shiftCondition}
          AND machineNo IN (${placeholders})
          AND (is_deleted IS NULL OR is_deleted = 0)
          AND workTime IS NOT NULL
        GROUP BY IFNULL(machineNo, 'N/A_MACHINE'), IFNULL(memberName, 'N/A_OP')
      `;
      const sql2 = `
        SELECT 
          employee_InputTime, rollingDensity, averageThickness, memberName, lotNumber, machineNo
        FROM (
          SELECT 
            employee_InputTime, rollingDensity, averageThickness, 
            IFNULL(memberName, 'N/A_OP') AS memberName,
            lotNumber, IFNULL(machineNo, 'N/A_MACHINE') AS machineNo,
            ROW_NUMBER() OVER (PARTITION BY IFNULL(machineNo, 'N/A_MACHINE'), IFNULL(memberName, 'N/A_OP') ORDER BY employee_InputTime DESC) as rn
          FROM ${tableName}
          WHERE (${timeConditions})
            ${shiftCondition}
            AND machineNo IN (${placeholders})
            AND (is_deleted IS NULL OR is_deleted = 0)
            AND workTime IS NOT NULL
        ) ranked
        WHERE rn = 1
      `;

      const sqlCount = `
        SELECT COUNT(DISTINCT machineNo) as totalCount
        FROM ${tableName}
        WHERE (${timeConditions})
          ${shiftCondition}
          AND machineNo IN (${placeholders})
          AND workTime IS NOT NULL
          AND (is_deleted IS NULL OR is_deleted = 0)
      `;

      const params = [...timeParams, ...shiftParams, ...validMachines];
      return Promise.all([
        dbmes.query(sql, params),
        dbmes.query(sql2, params),
        dbmes.query(sqlCount, params)
      ]);
    };

    const createRollingQueryWithCte = (machines, tableName, startDateStr, endDateStr, targetShift) => {
      if (!machines || machines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const validMachines = machines.map(m => m.machineNo).filter(item => item && item !== "");
      if (validMachines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const placeholders = validMachines.map(() => '?').join(',');

      const sql = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        )
        SELECT
          IFNULL(t.machineNo, 'N/A_MACHINE') AS machineNo,
          IFNULL(t.memberName, 'N/A_OP') AS memberName,
          SUM(t.rollingLength) AS rollingLength,
          SUM(t.rolling_LostWeight) AS rolling_LostWeight,
          SUM(t.workTime) AS workTime
        FROM ${tableName} t
        JOIN shift_windows w
          ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
        WHERE t.dayShift = ?
          AND t.machineNo IN (${placeholders})
          AND (t.is_deleted IS NULL OR t.is_deleted = 0)
          AND t.workTime IS NOT NULL
        GROUP BY IFNULL(t.machineNo, 'N/A_MACHINE'), IFNULL(t.memberName, 'N/A_OP')
      `;

      const sql2 = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        ),
        ranked AS (
          SELECT
            t.employee_InputTime,
            t.rollingDensity,
            t.averageThickness,
            IFNULL(t.memberName, 'N/A_OP') AS memberName,
            t.lotNumber,
            IFNULL(t.machineNo, 'N/A_MACHINE') AS machineNo,
            ROW_NUMBER() OVER (
              PARTITION BY IFNULL(t.machineNo, 'N/A_MACHINE'), IFNULL(t.memberName, 'N/A_OP')
              ORDER BY t.employee_InputTime DESC
            ) AS rn
          FROM ${tableName} t
          JOIN shift_windows w
            ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
          WHERE t.dayShift = ?
            AND t.machineNo IN (${placeholders})
            AND (t.is_deleted IS NULL OR t.is_deleted = 0)
            AND t.workTime IS NOT NULL
        )
        SELECT employee_InputTime, rollingDensity, averageThickness, memberName, lotNumber, machineNo
        FROM ranked
        WHERE rn = 1
      `;

      const sqlCount = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        )
        SELECT COUNT(DISTINCT CONCAT(IFNULL(t.machineNo,''), '|', IFNULL(t.memberName,''))) AS totalCount
        FROM ${tableName} t
        JOIN shift_windows w
          ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
        WHERE t.dayShift = ?
          AND t.machineNo IN (${placeholders})
          AND t.workTime IS NOT NULL
          AND (t.is_deleted IS NULL OR t.is_deleted = 0)
      `;

      const params = [startDateStr, endDateStr, targetShift, targetShift, targetShift, ...validMachines];
      const params2 = [startDateStr, endDateStr, targetShift, targetShift, targetShift, ...validMachines];
      const paramsCount = [startDateStr, endDateStr, targetShift, targetShift, targetShift, ...validMachines];

      return Promise.all([
        dbmes.query(sql, params),
        dbmes.query(sql2, params2),
        dbmes.query(sqlCount, paramsCount)
      ]);
    };

    const createSlittingQuery = (machines, tableName, timeRangesArr, targetShift) => {
      if (!machines || machines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const validMachines = machines.map(m => m.machineNo).filter(item => item && item !== "");
      if (validMachines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const placeholders = validMachines.map(() => '?').join(',');
      const timeConditions = timeRangesArr.map(() => `employee_InputTime BETWEEN ? AND ?`).join(' OR ');
      const timeParams = timeRangesArr.reduce((acc, range) => [...acc, range.start, range.end], []);
      const shiftCondition = targetShift ? `AND dayShift = ?` : ``;
      const shiftParams = targetShift ? [targetShift] : [];

      const sql = `
        SELECT
          IFNULL(machineNo, 'N/A_MACHINE') AS machineNo,
          IFNULL(memberName, 'N/A_OP') AS memberName,
          SUM(Length_R) AS Length_R,
          SUM(Length_L) AS Length_L,
          SUM(LostWeight_R) AS LostWeight_R,
          SUM(LostWeight_L) AS LostWeight_L,
          SUM(workTime) AS workTime
        FROM ${tableName}
        WHERE (${timeConditions})
          ${shiftCondition}
          AND machineNo IN (${placeholders})
          AND (delete_operation IS NULL OR delete_operation NOT LIKE '%user_delete_both%')
          AND workTime IS NOT NULL
        GROUP BY IFNULL(machineNo, 'N/A_MACHINE'), IFNULL(memberName, 'N/A_OP')
      `;

      const sql2 = `
        SELECT 
          employee_InputTime, memberName, lotNumber_R as lotNumber, machineNo
        FROM (
          SELECT 
            employee_InputTime, memberName, lotNumber_R,
            IFNULL(machineNo, 'N/A_MACHINE') AS machineNo,
            ROW_NUMBER() OVER (PARTITION BY IFNULL(machineNo, 'N/A_MACHINE'), IFNULL(memberName, 'N/A_OP') ORDER BY employee_InputTime DESC) as rn
          FROM ${tableName}
          WHERE (${timeConditions})
            ${shiftCondition}
            AND machineNo IN (${placeholders})
            AND (delete_operation IS NULL OR delete_operation NOT LIKE '%user_delete_both%')
            AND workTime IS NOT NULL
        ) ranked
        WHERE rn = 1
      `;

      const sqlCount = `
        SELECT COUNT(DISTINCT machineNo) as totalCount
        FROM ${tableName}
        WHERE (${timeConditions}) 
          ${shiftCondition}
          AND machineNo IN (${placeholders})
          AND (delete_operation IS NULL OR delete_operation NOT LIKE '%user_delete_both%')
          AND workTime IS NOT NULL
      `;

      const params = [...timeParams, ...shiftParams, ...validMachines];
      return Promise.all([
        dbmes.query(sql, params),
        dbmes.query(sql2, params),
        dbmes.query(sqlCount, params)
      ]);
    };

    const createSlittingQueryWithCte = (machines, tableName, startDateStr, endDateStr, targetShift) => {
      if (!machines || machines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const validMachines = machines.map(m => m.machineNo).filter(item => item && item !== "");
      if (validMachines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const placeholders = validMachines.map(() => '?').join(',');

      const sql = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        )
        SELECT
          IFNULL(t.machineNo, 'N/A_MACHINE') AS machineNo,
          IFNULL(t.memberName, 'N/A_OP') AS memberName,
          SUM(t.Length_R) AS Length_R,
          SUM(t.Length_L) AS Length_L,
          SUM(t.LostWeight_R) AS LostWeight_R,
          SUM(t.LostWeight_L) AS LostWeight_L,
          SUM(t.workTime) AS workTime
        FROM ${tableName} t
        JOIN shift_windows w
          ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
        WHERE t.dayShift = ?
          AND t.machineNo IN (${placeholders})
          AND (t.delete_operation IS NULL OR t.delete_operation NOT LIKE '%user_delete_both%')
          AND t.workTime IS NOT NULL
        GROUP BY IFNULL(t.machineNo, 'N/A_MACHINE'), IFNULL(t.memberName, 'N/A_OP')
      `;

      const sql2 = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        ),
        ranked AS (
          SELECT
            t.employee_InputTime,
            IFNULL(t.memberName, 'N/A_OP') AS memberName,
            t.lotNumber_R AS lotNumber,
            IFNULL(t.machineNo, 'N/A_MACHINE') AS machineNo,
            ROW_NUMBER() OVER (
              PARTITION BY IFNULL(t.machineNo, 'N/A_MACHINE'), IFNULL(t.memberName, 'N/A_OP')
              ORDER BY t.employee_InputTime DESC
            ) AS rn
          FROM ${tableName} t
          JOIN shift_windows w
            ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
          WHERE t.dayShift = ?
            AND t.machineNo IN (${placeholders})
            AND (t.delete_operation IS NULL OR t.delete_operation NOT LIKE '%user_delete_both%')
            AND t.workTime IS NOT NULL
        )
        SELECT employee_InputTime, memberName, lotNumber, machineNo
        FROM ranked
        WHERE rn = 1
      `;

      const sqlCount = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        )
        SELECT COUNT(DISTINCT CONCAT(IFNULL(t.machineNo,''), '|', IFNULL(t.memberName,''))) AS totalCount
        FROM ${tableName} t
        JOIN shift_windows w
          ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
        WHERE t.dayShift = ?
          AND t.machineNo IN (${placeholders})
          AND (t.delete_operation IS NULL OR t.delete_operation NOT LIKE '%user_delete_both%')
          AND t.workTime IS NOT NULL
      `;

      const params = [startDateStr, endDateStr, targetShift, targetShift, targetShift, ...validMachines];
      const params2 = [startDateStr, endDateStr, targetShift, targetShift, targetShift, ...validMachines];
      const paramsCount = [startDateStr, endDateStr, targetShift, targetShift, targetShift, ...validMachines];

      return Promise.all([
        dbmes.query(sql, params),
        dbmes.query(sql2, params2),
        dbmes.query(sqlCount, paramsCount)
      ]);
    };

    const [
      rollingCathodeResult,
      rollingAnodeResult,
      slittingCathodeResult,
      slittingAnodeResult
    ] = await Promise.all([
      useCteWindows
        ? createRollingQueryWithCte(machineGroups.rollingCathode, table_rolling[0], start, end, shift)
        : createRollingQuery(machineGroups.rollingCathode, table_rolling[0], timeRanges, shift),
      useCteWindows
        ? createRollingQueryWithCte(machineGroups.rollingAnode, table_rolling[1], start, end, shift)
        : createRollingQuery(machineGroups.rollingAnode, table_rolling[1], timeRanges, shift),
      useCteWindows
        ? createSlittingQueryWithCte(machineGroups.slittingCathode, table_rolling[2], start, end, shift)
        : createSlittingQuery(machineGroups.slittingCathode, table_rolling[2], timeRanges, shift),
      useCteWindows
        ? createSlittingQueryWithCte(machineGroups.slittingAnode, table_rolling[3], start, end, shift)
        : createSlittingQuery(machineGroups.slittingAnode, table_rolling[3], timeRanges, shift)
    ]);

    const totalCounts = {
      rollingCathode: rollingCathodeResult[2][0]?.totalCount || 0,
      rollingAnode: rollingAnodeResult[2][0]?.totalCount || 0,
      slittingCathode: slittingCathodeResult[2][0]?.totalCount || 0,
      slittingAnode: slittingAnodeResult[2][0]?.totalCount || 0,
    };

    const totalRecords = Object.values(totalCounts).reduce((a, b) => a + b, 0);
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const processRollingData = (results, type) => {
      const machines = {};
      let totalLength = 0;
      let totalLostWeight = 0;

      if (results[0] && results[0][0] && results[0][0].length > 0) {
        results[0][0].forEach(row => {
          const shiftDate = row.shift_date || null;
          const compositeKey = `${row.machineNo}-${row.memberName}-${shiftDate || "no_date"}`;
          const rollingLength = parseFloat(row.rollingLength) || 0;
          const lostWeight = parseFloat(row.rolling_LostWeight) || 0;
          const workTime = parseFloat(row.workTime) || 0;
          const Factor = type === 'rollingCathode' ? 0.216 : 0.034;
          const lostLength = lostWeight / Factor;
          const yieldVal = rollingLength > 0 ? ((rollingLength - lostLength) / rollingLength) * 100 : 0;
          const averageRate = workTime > 0 ? (rollingLength / workTime) : 0;

          machines[compositeKey] = {
            ...(shiftDate ? { shiftDate } : {}),
            machineNo: row.machineNo,
            memberName: row.memberName,
            rollingLength,
            LostLength: lostLength,
            yield: parseFloat(yieldVal.toFixed(2)),
            averageRate: parseFloat(averageRate.toFixed(2))
          };

          totalLength += rollingLength;
          totalLostWeight += lostWeight;
        });
      }

      if (results[1] && results[1][0] && results[1][0].length > 0) {
        results[1][0].forEach(latestRow => {
          const shiftDate = latestRow.shift_date || null;
          const compositeKey = `${latestRow.machineNo}-${latestRow.memberName}-${shiftDate || "no_date"}`;
          if (machines[compositeKey]) {
            Object.assign(machines[compositeKey], {
              ...(shiftDate ? { shiftDate } : {}),
              nowLotNo: latestRow.lotNumber,
              lastSubmitTime: latestRow.employee_InputTime,
              averageThickness: latestRow.averageThickness,
              rollingDensity: latestRow.rollingDensity,
            });
          }
        });
      }
      const totalLostLength = totalLostWeight / (type === 'rollingCathode' ? 0.216 : 0.034);
      const totalYield = totalLength > 0 ? ((totalLength - totalLostLength) / totalLength) * 100 : 0;

      return {
        machines: Object.values(machines),
        summary: {
          totalLength,
          totalLostWeight,
          totalLostLength,
          totalYield: parseFloat(totalYield.toFixed(2)),
        }
      };
    };

    const processSlittingData = (results, type) => {
      const machines = {};
      let totalLength = 0, totalLostWeight = 0;

      if (results[0] && results[0][0] && results[0][0].length > 0) {
        results[0][0].forEach(row => {
          const shiftDate = row.shift_date || null;
          const compositeKey = `${row.machineNo}-${row.memberName}-${shiftDate || "no_date"}`;
          const rollingLength = (parseFloat(row.Length_R) || 0) + (parseFloat(row.Length_L) || 0);
          const lostWeight = (parseFloat(row.LostWeight_R) || 0) + (parseFloat(row.LostWeight_L) || 0);
          const Factor = type === 'slittingCathode' ? 0.108 : 0.067;
          const lostLength = lostWeight / Factor;
          const yieldVal = rollingLength > 0 ? ((rollingLength - lostLength) / rollingLength) * 100 : 0;
          const averageRate = row.workTime > 0 ? (rollingLength / row.workTime) : 0;

          machines[compositeKey] = {
            ...(shiftDate ? { shiftDate } : {}),
            machineNo: row.machineNo,
            memberName: row.memberName,
            rollingLength,
            LostLength: lostLength,
            yield: parseFloat(yieldVal.toFixed(2)),
            averageRate: parseFloat(averageRate.toFixed(2))
          };

          totalLength += rollingLength;
          totalLostWeight += lostWeight;
        });
      }

      if (results[1] && results[1][0] && results[1][0].length > 0) {
        results[1][0].forEach(latestRow => {
          const shiftDate = latestRow.shift_date || null;
          const compositeKey = `${latestRow.machineNo}-${latestRow.memberName}-${shiftDate || "no_date"}`;
          if (machines[compositeKey]) {
            Object.assign(machines[compositeKey], {
              ...(shiftDate ? { shiftDate } : {}),
              lotNumber: latestRow.lotNumber,
              lastSubmitTime: latestRow.employee_InputTime
            });
          }
        });
      }

      const totalLostLength = totalLostWeight / (type === 'slittingCathode' ? 0.108 : 0.067);
      const totalYield = totalLength > 0 ? ((totalLength - totalLostLength) / totalLength) * 100 : 0;

      return {
        machines: Object.values(machines),
        summary: {
          totalLength,
          totalLostWeight,
          totalLostLength,
          totalYield: parseFloat(totalYield.toFixed(2)),
        }
      };
    };

    const result = {
      RollingCathode: processRollingData(rollingCathodeResult, 'rollingCathode'),
      RollingAnode: processRollingData(rollingAnodeResult, 'rollingAnode'),
      SlittingCathode: processSlittingData(slittingCathodeResult, 'slittingCathode'),
      SlittingAnode: processSlittingData(slittingAnodeResult, 'slittingAnode')
    };

    const allMachines = [
      ...result.RollingCathode.machines,
      ...result.RollingAnode.machines,
      ...result.SlittingCathode.machines,
      ...result.SlittingAnode.machines,
    ];

    const paginatedData = allMachines.slice(offset, offset + limit);

    res.status(200).json({
      success: true,
      message: "過去戰報獲取成功",
      shift: shift,
      startTime: start,
      endTime: end,
      data: { ...result, paginatedMachines: paginatedData },
      pagination: {
        currentPage: currentPage,
        pageSize: limit,
        totalRecords: totalRecords,
        totalPages: totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        counts: totalCounts
      },
      metadata: {
        shift: shift,
        timeRange: { start: start, end: end },
        machineGroups: machineGroups,
        queryTime: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('過去排班表查詢錯誤:', error);
    res.status(500).json({
      success: false,
      error: '過去排班表查詢錯誤',
      detail: error.message
    });
  }
});

router.get("/nowReport", async (req, res) => {
  const {
    startTime,
    endTime,
    dayShift,
    page = 1,
    pageSize = 20
  } = req.query;

  const normalizeShift = (value) => {
    if (!value) return "";
    if (["早班", "日班", "白班"].includes(value)) return "早班";
    if (["晚班", "夜班"].includes(value)) return "晚班";
    return "";
  };

  const inputShift = req.query.dayShift;
  let shift = normalizeShift(inputShift);

  if (inputShift && !shift) {
    return res.status(400).json({
      success: false,
      error: "無效的 dayShift 參數，僅支援 早班/晚班（可接受同義詞：日班、白班、夜班）"
    });
  }

  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;
  const currentPage = parseInt(page, 10);
  const useCteWindows = Boolean(startTime && endTime && shift);

  // console.log("接收到的前端參數:", {
  //   engineerId,
  //   startTime,
  //   endTime,
  //   shift,
  // });

  let timeRanges = [];

  // 情況2: 有送日期+班別
  if (useCteWindows) {
    console.log("情況2: 有送日期和班別，使用 SQL 時窗生成...  :  startTime  : ", startTime, " | shift  : ", shift, " | endTime  :", endTime);
  } else if (startTime && shift) {
    console.log("情況2: 有送日期和班別，使用單一區間...  :  startTime  : ", startTime, " | shift  : ", shift, " | endTime  :", endTime);
    timeRanges.push({
      start: startTime,
      end: endTime
    });
  }


  // 情況1: 完全沒送資料 (用預設)
  else {
    const now = moment();
    const currentHour = now.hour();
    if (currentHour >= 8 && currentHour < 20) {
      shift = "早班";
      timeRanges.push({
        start: now.format("YYYY-MM-DD 08:00:00"),
        end: now.format("YYYY-MM-DD 20:00:00")
      });
    }


    else {
      shift = "晚班";
      if (currentHour >= 20) {
        // 晚上8點到24點，晚班從當天20:00到次日08:00
        timeRanges.push({
          start: now.format("YYYY-MM-DD 20:00:00"),
          end: now.clone().add(1, "day").format("YYYY-MM-DD 08:00:00")
        });


      } else {
        // 凌晨0點到8點，晚班從前一天20:00到當天08:00

        timeRanges.push({
          start: now.clone().subtract(1, "day").format("YYYY-MM-DD 20:00:00"),
          end: now.format("YYYY-MM-DD 08:00:00")
        });
      }
    }
  }

  if (!useCteWindows && timeRanges.length === 0) {
    return res.status(400).json({
      success: false,
      error: "查詢時間區間為空，請確認 startTime、endTime 與 dayShift 參數"
    });
  }

  const nowDate_S = useCteWindows ? startTime : (timeRanges.length > 0 ? timeRanges[0].start : "");
  const nowDate_E = useCteWindows ? endTime : (timeRanges.length > 0 ? timeRanges[timeRanges.length - 1].end : "");
  const table_rolling = [
    'rollingcathode_batch',
    'rollinganode_batch',
    'slittingcathode_batch',
    'slittinganode_batch'
  ];
  const sql_Find_machineNo = `SELECT DISTINCT machineNo, selectWork 
  FROM hr.rollingnslitting_register WHERE engineerId = 264 AND is_deleted = 0`;

  try {
    const [machineNoResult] = await dbcon.query(sql_Find_machineNo);
    // console.log("machineNoResult:", machineNoResult);

    const machineGroups = {
      rollingCathode: [],
      rollingAnode: [],
      slittingCathode: [],
      slittingAnode: []
    };

    for (let machine of machineNoResult) {
      if (!machine || !machine.selectWork) continue;
      const machineNoToAdd = machine.machineNo;

      switch (machine.selectWork) {
        case "rollingCathode":
          if (!machineGroups.rollingCathode.some(m => m.machineNo === machineNoToAdd)) machineGroups.rollingCathode.push(machine);
          break;
        case "rollingAnode":
          if (!machineGroups.rollingAnode.some(m => m.machineNo === machineNoToAdd)) machineGroups.rollingAnode.push(machine);
          break;
        case "slittingCathode":
          if (!machineGroups.slittingCathode.some(m => m.machineNo === machineNoToAdd)) machineGroups.slittingCathode.push(machine);
          break;
        case "slittingAnode":
          if (!machineGroups.slittingAnode.some(m => m.machineNo === machineNoToAdd)) machineGroups.slittingAnode.push(machine);
          break;
      }
    }
    console.log("machineGroups:", machineGroups);


    const createRollingQuery = (machines, tableName, timeRanges) => {
      if (!machines || machines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const validMachines = machines.map(m => m.machineNo).filter(item => item && item !== "");
      if (validMachines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const placeholders = validMachines.map(() => '?').join(',');
      const timeConditions = timeRanges.map(() => `employee_InputTime BETWEEN ? AND ?`).join(' OR ');
      const timeParams = timeRanges.reduce((acc, range) => [...acc, range.start, range.end], []);
      const sql = `
        SELECT
          IFNULL(machineNo, 'N/A_MACHINE') AS machineNo,
          IFNULL(memberName, 'N/A_OP') AS memberName,
          SUM(rollingLength) AS rollingLength,
          SUM(rolling_LostWeight) AS rolling_LostWeight,
          SUM(workTime) AS workTime
        FROM ${tableName}
        WHERE (${timeConditions})
          AND dayShift = ? 
          AND machineNo IN (${placeholders})
          AND (is_deleted IS NULL OR is_deleted = 0)
          AND workTime IS NOT NULL
        GROUP BY IFNULL(machineNo, 'N/A_MACHINE'), IFNULL(memberName, 'N/A_OP')
      `;
      const sql2 = `
        SELECT 
          employee_InputTime, rollingDensity, averageThickness, memberName, lotNumber, machineNo
        FROM (
          SELECT 
            employee_InputTime, rollingDensity, averageThickness, 
            IFNULL(memberName, 'N/A_OP') AS memberName,
            lotNumber, IFNULL(machineNo, 'N/A_MACHINE') AS machineNo,
            ROW_NUMBER() OVER (PARTITION BY IFNULL(machineNo, 'N/A_MACHINE'), IFNULL(memberName, 'N/A_OP') ORDER BY employee_InputTime DESC) as rn
          FROM ${tableName}
          WHERE (${timeConditions})
            AND dayShift = ? 
            AND machineNo IN (${placeholders})
            AND (is_deleted IS NULL OR is_deleted = 0)
            AND workTime IS NOT NULL
        ) ranked
        WHERE rn = 1
      `;

      const sqlCount = `
        SELECT COUNT(DISTINCT machineNo) as totalCount
        FROM ${tableName}
        WHERE (${timeConditions})
          AND dayShift = ? 
          AND machineNo IN (${placeholders})
          AND workTime IS NOT NULL
          AND (is_deleted IS NULL OR is_deleted = 0)
      `;

      const params = [...timeParams, shift, ...validMachines];
      const paramsWithPagination = [...timeParams, shift, ...validMachines, limit, offset];
      return Promise.all([
        dbmes.query(sql, params),
        dbmes.query(sql2, params),
        dbmes.query(sqlCount, params)
      ]);
    };

    const createRollingQueryWithCte = (machines, tableName) => {
      if (!machines || machines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const validMachines = machines.map(m => m.machineNo).filter(item => item && item !== "");
      if (validMachines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const placeholders = validMachines.map(() => '?').join(',');

      const sql = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        )
        SELECT
          IFNULL(t.machineNo, 'N/A_MACHINE') AS machineNo,
          IFNULL(t.memberName, 'N/A_OP') AS memberName,
          SUM(t.rollingLength) AS rollingLength,
          SUM(t.rolling_LostWeight) AS rolling_LostWeight,
          SUM(t.workTime) AS workTime
        FROM ${tableName} t
        JOIN shift_windows w
          ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
        WHERE t.dayShift = ?
          AND t.machineNo IN (${placeholders})
          AND (t.is_deleted IS NULL OR t.is_deleted = 0)
          AND t.workTime IS NOT NULL
        GROUP BY IFNULL(t.machineNo, 'N/A_MACHINE'), IFNULL(t.memberName, 'N/A_OP')
      `;

      const sql2 = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        ),
        ranked AS (
          SELECT
            t.employee_InputTime,
            t.rollingDensity,
            t.averageThickness,
            IFNULL(t.memberName, 'N/A_OP') AS memberName,
            t.lotNumber,
            IFNULL(t.machineNo, 'N/A_MACHINE') AS machineNo,
            ROW_NUMBER() OVER (
              PARTITION BY IFNULL(t.machineNo, 'N/A_MACHINE'), IFNULL(t.memberName, 'N/A_OP')
              ORDER BY t.employee_InputTime DESC
            ) AS rn
          FROM ${tableName} t
          JOIN shift_windows w
            ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
          WHERE t.dayShift = ?
            AND t.machineNo IN (${placeholders})
            AND (t.is_deleted IS NULL OR t.is_deleted = 0)
            AND t.workTime IS NOT NULL
        )
        SELECT employee_InputTime, rollingDensity, averageThickness, memberName, lotNumber, machineNo
        FROM ranked
        WHERE rn = 1
      `;

      const sqlCount = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        )
        SELECT COUNT(DISTINCT CONCAT(IFNULL(t.machineNo,''), '|', IFNULL(t.memberName,''))) AS totalCount
        FROM ${tableName} t
        JOIN shift_windows w
          ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
        WHERE t.dayShift = ?
          AND t.machineNo IN (${placeholders})
          AND t.workTime IS NOT NULL
          AND (t.is_deleted IS NULL OR t.is_deleted = 0)
      `;

      const params = [startTime, endTime, shift, shift, shift, ...validMachines];
      const params2 = [startTime, endTime, shift, shift, shift, ...validMachines];
      const paramsCount = [startTime, endTime, shift, shift, shift, ...validMachines];

      return Promise.all([
        dbmes.query(sql, params),
        dbmes.query(sql2, params2),
        dbmes.query(sqlCount, paramsCount)
      ]);
    };


    const createSlittingQuery = (machines, tableName, timeRanges) => {
      if (!machines || machines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const validMachines = machines.map(m => m.machineNo).filter(item => item && item !== "");
      if (validMachines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const placeholders = validMachines.map(() => '?').join(',');
      const timeConditions = timeRanges.map(() => `employee_InputTime BETWEEN ? AND ?`).join(' OR ');
      const timeParams = timeRanges.reduce((acc, range) => [...acc, range.start, range.end], []);

      const sql = `
        SELECT
          IFNULL(machineNo, 'N/A_MACHINE') AS machineNo,
          IFNULL(memberName, 'N/A_OP') AS memberName,
          SUM(Length_R) AS Length_R,
          SUM(Length_L) AS Length_L,
          SUM(LostWeight_R) AS LostWeight_R,
          SUM(LostWeight_L) AS LostWeight_L,
          SUM(workTime) AS workTime
        FROM ${tableName}
        WHERE (${timeConditions})
          AND dayShift = ? 
          AND machineNo IN (${placeholders})
          AND (delete_operation IS NULL OR delete_operation NOT LIKE '%user_delete_both%')
          AND workTime IS NOT NULL
        GROUP BY IFNULL(machineNo, 'N/A_MACHINE'), IFNULL(memberName, 'N/A_OP')
      `;


      const sql2 = `
        SELECT 
          employee_InputTime, memberName, lotNumber_R as lotNumber, machineNo
        FROM (
          SELECT 
            employee_InputTime, memberName, lotNumber_R,
            IFNULL(machineNo, 'N/A_MACHINE') AS machineNo,
            ROW_NUMBER() OVER (PARTITION BY IFNULL(machineNo, 'N/A_MACHINE'), IFNULL(memberName, 'N/A_OP') ORDER BY employee_InputTime DESC) as rn
          FROM ${tableName}
          WHERE (${timeConditions})
            AND dayShift = ? 
            AND machineNo IN (${placeholders})
            AND (delete_operation IS NULL OR delete_operation NOT LIKE '%user_delete_both%')
            AND workTime IS NOT NULL
        ) ranked
        WHERE rn = 1
      `;

      const sqlCount = `
        SELECT COUNT(DISTINCT machineNo) as totalCount
        FROM ${tableName}
        WHERE (${timeConditions}) 
          AND dayShift = ? 
          AND machineNo IN (${placeholders})
          AND (delete_operation IS NULL OR delete_operation NOT LIKE '%user_delete_both%')
          AND workTime IS NOT NULL
      `;

      const params = [...timeParams, shift, ...validMachines];

      return Promise.all([
        dbmes.query(sql, params),
        dbmes.query(sql2, params),
        dbmes.query(sqlCount, params)
      ]);
    };

    const createSlittingQueryWithCte = (machines, tableName) => {
      if (!machines || machines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const validMachines = machines.map(m => m.machineNo).filter(item => item && item !== "");
      if (validMachines.length === 0) {
        return Promise.resolve([[], [], [{ totalCount: 0 }]]);
      }
      const placeholders = validMachines.map(() => '?').join(',');

      const sql = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        )
        SELECT
          IFNULL(t.machineNo, 'N/A_MACHINE') AS machineNo,
          IFNULL(t.memberName, 'N/A_OP') AS memberName,
          SUM(t.Length_R) AS Length_R,
          SUM(t.Length_L) AS Length_L,
          SUM(t.LostWeight_R) AS LostWeight_R,
          SUM(t.LostWeight_L) AS LostWeight_L,
          SUM(t.workTime) AS workTime
        FROM ${tableName} t
        JOIN shift_windows w
          ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
        WHERE t.dayShift = ?
          AND t.machineNo IN (${placeholders})
          AND (t.delete_operation IS NULL OR t.delete_operation NOT LIKE '%user_delete_both%')
          AND t.workTime IS NOT NULL
        GROUP BY IFNULL(t.machineNo, 'N/A_MACHINE'), IFNULL(t.memberName, 'N/A_OP')
      `;

      const sql2 = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        ),
        ranked AS (
          SELECT
            t.employee_InputTime,
            IFNULL(t.memberName, 'N/A_OP') AS memberName,
            t.lotNumber_R AS lotNumber,
            IFNULL(t.machineNo, 'N/A_MACHINE') AS machineNo,
            ROW_NUMBER() OVER (
              PARTITION BY IFNULL(t.machineNo, 'N/A_MACHINE'), IFNULL(t.memberName, 'N/A_OP')
              ORDER BY t.employee_InputTime DESC
            ) AS rn
          FROM ${tableName} t
          JOIN shift_windows w
            ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
          WHERE t.dayShift = ?
            AND t.machineNo IN (${placeholders})
            AND (t.delete_operation IS NULL OR t.delete_operation NOT LIKE '%user_delete_both%')
            AND t.workTime IS NOT NULL
        )
        SELECT employee_InputTime, memberName, lotNumber, machineNo
        FROM ranked
        WHERE rn = 1
      `;

      const sqlCount = `
        WITH RECURSIVE date_span AS (
          SELECT DATE(?) AS shift_date
          UNION ALL
          SELECT DATE_ADD(shift_date, INTERVAL 1 DAY)
          FROM date_span
          WHERE shift_date < DATE(?)
        ),
        shift_windows AS (
          SELECT
            shift_date,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '08:00:00')
              ELSE TIMESTAMP(DATE_SUB(shift_date, INTERVAL 1 DAY), '20:00:00')
            END AS window_start,
            CASE
              WHEN ? = '早班' THEN TIMESTAMP(shift_date, '20:00:00')
              ELSE TIMESTAMP(shift_date, '08:00:00')
            END AS window_end
          FROM date_span
        )
        SELECT COUNT(DISTINCT CONCAT(IFNULL(t.machineNo,''), '|', IFNULL(t.memberName,''))) AS totalCount
        FROM ${tableName} t
        JOIN shift_windows w
          ON t.employee_InputTime BETWEEN w.window_start AND w.window_end
        WHERE t.dayShift = ?
          AND t.machineNo IN (${placeholders})
          AND (t.delete_operation IS NULL OR t.delete_operation NOT LIKE '%user_delete_both%')
          AND t.workTime IS NOT NULL
      `;

      const params = [startTime, endTime, shift, shift, shift, ...validMachines];
      const params2 = [startTime, endTime, shift, shift, shift, ...validMachines];
      const paramsCount = [startTime, endTime, shift, shift, shift, ...validMachines];

      return Promise.all([
        dbmes.query(sql, params),
        dbmes.query(sql2, params2),
        dbmes.query(sqlCount, paramsCount)
      ]);
    };

    const [
      rollingCathodeResult,
      rollingAnodeResult,
      slittingCathodeResult,
      slittingAnodeResult
    ] = await Promise.all([
      useCteWindows
        ? createRollingQueryWithCte(machineGroups.rollingCathode, table_rolling[0])
        : createRollingQuery(machineGroups.rollingCathode, table_rolling[0], timeRanges),
      useCteWindows
        ? createRollingQueryWithCte(machineGroups.rollingAnode, table_rolling[1])
        : createRollingQuery(machineGroups.rollingAnode, table_rolling[1], timeRanges),
      useCteWindows
        ? createSlittingQueryWithCte(machineGroups.slittingCathode, table_rolling[2])
        : createSlittingQuery(machineGroups.slittingCathode, table_rolling[2], timeRanges),
      useCteWindows
        ? createSlittingQueryWithCte(machineGroups.slittingAnode, table_rolling[3])
        : createSlittingQuery(machineGroups.slittingAnode, table_rolling[3], timeRanges)
    ]);

    // 計算總筆數和頁數
    const totalCounts = {
      rollingCathode: rollingCathodeResult[2][0]?.totalCount || 0,
      rollingAnode: rollingAnodeResult[2][0]?.totalCount || 0,
      slittingCathode: slittingCathodeResult[2][0]?.totalCount || 0,
      slittingAnode: slittingAnodeResult[2][0]?.totalCount || 0,
    };

    const totalRecords = Object.values(totalCounts).reduce((a, b) => a + b, 0);
    const totalPages = Math.ceil(totalRecords / limit);

    const processRollingData = (results, type) => {
      const machines = {};
      let totalLength = 0;
      let totalLostWeight = 0;

      if (results[0] && results[0][0] && results[0][0].length > 0) {
        results[0][0].forEach(row => {
          const shiftDate = row.shift_date || null;
          const compositeKey = `${row.machineNo}-${row.memberName}-${shiftDate || "no_date"}`;
          const rollingLength = parseFloat(row.rollingLength) || 0;
          const lostWeight = parseFloat(row.rolling_LostWeight) || 0;
          const workTime = parseFloat(row.workTime) || 0;
          const Factor = type === 'rollingCathode' ? 0.216 : 0.034;
          const lostLength = lostWeight / Factor;
          const yieldVal = rollingLength > 0 ? ((rollingLength - lostLength) / rollingLength) * 100 : 0;
          const averageRate = workTime > 0 ? (rollingLength / workTime) : 0;

          machines[compositeKey] = {
            ...(shiftDate ? { shiftDate } : {}),
            machineNo: row.machineNo,
            memberName: row.memberName,
            rollingLength,
            LostLength: lostLength,
            yield: parseFloat(yieldVal.toFixed(2)),
            averageRate: parseFloat(averageRate.toFixed(2))
          };

          totalLength += rollingLength;
          totalLostWeight += lostWeight;
        });
      }

      if (results[1] && results[1][0] && results[1][0].length > 0) {
        results[1][0].forEach(latestRow => {
          const shiftDate = latestRow.shift_date || null;
          const compositeKey = `${latestRow.machineNo}-${latestRow.memberName}-${shiftDate || "no_date"}`;
          if (machines[compositeKey]) {
            Object.assign(machines[compositeKey], {
              ...(shiftDate ? { shiftDate } : {}),
              nowLotNo: latestRow.lotNumber,
              lastSubmitTime: latestRow.employee_InputTime,
              averageThickness: latestRow.averageThickness,
              rollingDensity: latestRow.rollingDensity,
            });
          }
        });
      }
      const totalLostLength = totalLostWeight / (type === 'rollingCathode' ? 0.216 : 0.034);
      const totalYield = totalLength > 0 ? ((totalLength - totalLostLength) / totalLength) * 100 : 0;

      return {
        machines: Object.values(machines),
        summary: {
          totalLength,
          totalLostWeight,
          totalLostLength,
          totalYield: parseFloat(totalYield.toFixed(2)),
        }
      };
    };


    const processSlittingData = (results, type) => {
      const machines = {};
      let totalLength = 0, totalLostWeight = 0;

      if (results[0] && results[0][0] && results[0][0].length > 0) {
        results[0][0].forEach(row => {
          const shiftDate = row.shift_date || null;
          const compositeKey = `${row.machineNo}-${row.memberName}-${shiftDate || "no_date"}`;
          const rollingLength = (parseFloat(row.Length_R) || 0) + (parseFloat(row.Length_L) || 0);
          const lostWeight = (parseFloat(row.LostWeight_R) || 0) + (parseFloat(row.LostWeight_L) || 0);
          const Factor = type === 'slittingCathode' ? 0.108 : 0.067;
          const lostLength = lostWeight / Factor;
          const yieldVal = rollingLength > 0 ? ((rollingLength - lostLength) / rollingLength) * 100 : 0;
          const averageRate = row.workTime > 0 ? (rollingLength / row.workTime) : 0;

          machines[compositeKey] = {
            ...(shiftDate ? { shiftDate } : {}),
            machineNo: row.machineNo,
            memberName: row.memberName,
            rollingLength,
            LostLength: lostLength,
            yield: parseFloat(yieldVal.toFixed(2)),
            averageRate: parseFloat(averageRate.toFixed(2))
          };

          totalLength += rollingLength;
          totalLostWeight += lostWeight;
        });
      }

      if (results[1] && results[1][0] && results[1][0].length > 0) {
        results[1][0].forEach(latestRow => {
          const shiftDate = latestRow.shift_date || null;
          const compositeKey = `${latestRow.machineNo}-${latestRow.memberName}-${shiftDate || "no_date"}`;
          if (machines[compositeKey]) {
            Object.assign(machines[compositeKey], {
              ...(shiftDate ? { shiftDate } : {}),
              lotNumber: latestRow.lotNumber,
              lastSubmitTime: latestRow.employee_InputTime
            });
          }
        });
      }

      const totalLostLength = totalLostWeight / (type === 'slittingCathode' ? 0.108 : 0.067);
      const totalYield = totalLength > 0 ? ((totalLength - totalLostLength) / totalLength) * 100 : 0;

      return {
        machines: Object.values(machines),
        summary: {
          totalLength,
          totalLostWeight,
          totalLostLength,
          totalYield: parseFloat(totalYield.toFixed(2)),
        }
      };
    };

    // console.log("Rolling Cathode Result:", processRollingData(rollingCathodeResult, 'rollingCathode'), 'rollingCathode result raw:', rollingCathodeResult);


    const result = {
      RollingCathode: processRollingData(rollingCathodeResult, 'rollingCathode'),
      RollingAnode: processRollingData(rollingAnodeResult, 'rollingAnode'),
      SlittingCathode: processSlittingData(slittingCathodeResult, 'slittingCathode'),
      SlittingAnode: processSlittingData(slittingAnodeResult, 'slittingAnode')
    };

    const allMachines = [
      ...result.RollingCathode.machines,
      ...result.RollingAnode.machines,
      ...result.SlittingCathode.machines,
      ...result.SlittingAnode.machines,
    ];


    const paginatedData = allMachines.slice(offset, offset + limit);
    res.status(200).json({
      success: true,
      message: "及時戰報獲取成功",
      shift: shift,
      startTime: nowDate_S,
      endTime: nowDate_E,
      data: { ...result, paginatedMachines: paginatedData },
      pagination: {
        currentPage: currentPage,
        pageSize: limit,
        totalRecords: totalRecords,
        totalPages: totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        counts: totalCounts
      },


      metadata: {
        shift: shift,
        timeRange: { start: nowDate_S, end: nowDate_E },
        machineGroups: machineGroups,
        queryTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.log("及時戰報獲取失敗:", error.message);
    res.status(500).json({
      success: false,
      error: "及時戰報獲取失敗",
      detail: error.message
    });
  }
}),


  // 用於查詢庫存有哪些資料
  router.get("/findStock", async (req, res) => {
    const {
      selectWork,
      page = 1,
      pageSize = 10,
      engineerId
    } = req.query || {};

    // console.log("selectWork :", selectWork , "page :", page , "pageSize :", pageSize);
    const activeEngineerId = "264";
    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);

    let sql = "";
    let sqlCount = "";

    if (selectWork === "rollingAnode") {
      sql = `
            SELECT 
              combined.id, 
              combined.selectWork, 
              combined.machineNo, 
              combined.lotNumber, 
              combined.delete_operation, 
              combined.rollingLength
          FROM mes.rollinganode_batch combined
          WHERE  (combined.is_deleted IS NULL OR combined.is_deleted = 0)
            AND (combined.stock IS NULL OR combined.stock = '0')
            
          ORDER BY combined.id DESC
          LIMIT ? OFFSET ?`;

      sqlCount = `SELECT COUNT(*) AS totalCount 
        FROM mes.rollinganode_batch combined
        WHERE (combined.is_deleted IS NULL OR combined.is_deleted = 0)
          AND (combined.stock IS NULL OR combined.stock = '0')
        `;
    }
    else if (selectWork === "slittingCathode") {
      // 期望回傳格式：每個 lot（R/L）獨立一列，含 source_type, lotNumber
      sql = `SELECT id, selectWork, machineNo, lotNumber, delete_operation , source_type , rollingLength
           FROM (
             SELECT id, selectWork, machineNo, delete_operation ,
             lotNumber_R AS lotNumber, 
             'R' AS source_type,
             Length_R AS rollingLength
             FROM mes.slittingcathode_batch
             WHERE (is_deleted IS NULL OR is_deleted = 0)
               AND (stock IS NULL OR stock = 0)
               AND Length_R IS NOT NULL
               AND engineerId in ('349' , '264')
               AND lotNumber_R IS NOT NULL AND lotNumber_R <> ''
               AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_R', 'user_delete_both'))
             UNION ALL
             SELECT id, selectWork, machineNo, delete_operation ,
             lotNumber_L AS lotNumber, 
             'L' AS source_type,
              Length_L AS rollingLength
             FROM mes.slittingcathode_batch
             WHERE (is_deleted IS NULL OR is_deleted = 0)
               AND (stock_L IS NULL OR stock_L = 0)
               AND Length_L IS NOT NULL
               AND engineerId in ('349' , '264')
               AND lotNumber_L IS NOT NULL AND lotNumber_L <> ''
               AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_L', 'user_delete_both'))
           ) AS combined
           ORDER BY id DESC, source_type
           LIMIT ? OFFSET ?`;

      sqlCount = `SELECT COUNT(*) AS totalCount FROM (
                  SELECT id FROM mes.slittingcathode_batch
                  WHERE (is_deleted IS NULL OR is_deleted = 0)
                    AND (stock IS NULL OR stock = 0)
                    AND Length_R IS NOT NULL
                    AND engineerId in ('349' , '264')
                    AND lotNumber_R IS NOT NULL AND lotNumber_R <> ''
                    AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_R', 'user_delete_both'))
                  UNION ALL
                  SELECT id FROM mes.slittingcathode_batch
                  WHERE (is_deleted IS NULL OR is_deleted = 0)
                    AND (stock_L IS NULL OR stock_L = 0)
                    AND Length_L IS NOT NULL
                    AND engineerId in ('349' , '264')
                    AND lotNumber_L IS NOT NULL AND lotNumber_L <> ''
                    AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_L', 'user_delete_both'))
                ) AS cnt`;
    } else {
      return res.status(400).json({
        success: false,
        error: "無效的 selectWork 參數"
      });
    }

    try {
      const queryParams = [pageSizeNum, (pageNum - 1) * pageSizeNum];
      const countParams = [];

      const [result] = await dbmes.query(sql, queryParams);
      const [countResult] = await dbmes.query(sqlCount, countParams);
      const totalCount = countResult && countResult[0] ? countResult[0].totalCount : 0;
      const totalPages = Math.ceil(totalCount / pageSizeNum);
      console.log("查詢結果 :", result)

      res.status(200).json({
        success: true,
        data: result,
        pagination: {
          currentPage: pageNum,
          pageSize: pageSizeNum,
          totalRecords: totalCount,
          totalPages: totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        }
      });

    } catch (error) {
      console.log("查詢失敗:", error.message);
      res.status(500).json({
        success: false,
        error: "查詢失敗",
        detail: error.message
      });
    }
  });

router.post("/stockBeSend", async (req, res) => {
  console.log("Received request body:", req.body);

  const {
    selectWork,
    selectAll
  } = req.body || {};

  console.log("selectWork :", selectWork, "selectAll :", Array.isArray(selectAll), "selectAll type:", typeof Array.isArray(selectAll));

  // 驗證必要參數
  if (!selectWork) {
    return res.status(400).json({
      success: false,
      error: "缺少 selectWork 参数"
    });
  }

  if (!selectAll || selectAll.length === 0) {
    return res.status(400).json({
      success: false,
      error: "請選擇要更新的數據"
    });
  }

  let table = "";
  switch (selectWork) {
    case "rollingAnode":
      table = "mes.rollinganode_batch";
      break;
    case "slittingCathode":
      table = "mes.slittingcathode_batch";
      break;
    default:
      return res.status(400).json({
        success: false,
        error: "無效的 selectWork 參數"
      });
  }


  // 處理 selectAll 參數（可能是字符串或數組）
  let selectIds = [];
  if (typeof selectAll === 'string') {
    // 如果是字符串如 "1,2,3"，分割成數組
    selectIds = selectAll.split(',').map(id => id.trim()).filter(id => id);
  } else if (Array.isArray(selectAll)) {
    selectIds = selectAll.map(item =>
      typeof item === 'object' ? item.id : item
    ).filter(id => id);
  } else {
    return res.status(400).json({
      success: false,
      error: "selectAll 參數格式錯誤"
    });
  }

  console.log("處裡後的 selectIds:", selectIds);

  let conn;
  let isNetworkError = false;
  try {
    conn = await dbmes.getConnection();
    await conn.beginTransaction();

    if (selectWork === "slittingCathode") {
      const rIds = [];
      const lIds = [];

      selectIds.forEach(item => {
        if (item.endsWith('-R')) {
          rIds.push(item.replace('-R', ''));
        } else if (item.endsWith('-L')) {
          lIds.push(item.replace('-L', ''));
        }
      });

      console.log("R側 IDs:", rIds);
      console.log("L側 IDs:", lIds);

      let affectedRowsTotal = 0;
      const results = [];

      if (rIds.length > 0) {
        const rPlaceholders = rIds.map(() => '?').join(',');
        const rSql = `UPDATE ${table} SET stock = 1 WHERE id IN (${rPlaceholders})`;
        const [rResult] = await conn.query(rSql, rIds);
        affectedRowsTotal += rResult.affectedRows;
        results.push({ side: 'R', affectedRows: rResult.affectedRows });
      }

      if (lIds.length > 0) {
        const lPlaceholders = lIds.map(() => '?').join(',');
        const lSql = `UPDATE ${table} SET stock_L = 1 WHERE id IN (${lPlaceholders})`;
        const [lResult] = await conn.query(lSql, lIds);
        affectedRowsTotal += lResult.affectedRows;
        results.push({ side: 'L', affectedRows: lResult.affectedRows });
      }

      await conn.commit();

      return res.status(200).json({
        success: true,
        message: `成功更新 ${affectedRowsTotal} 條紀錄`,
        affectedRows: affectedRowsTotal,
        details: results
      });

    } else if (selectWork === "rollingAnode") {
      selectIds.forEach((item) => {
        const unique_Stock_Text = '2'
        item.stock = unique_Stock_Text
      });
    }

    const placeholders = selectIds.map(() => '?').join(',');
    const sql = `UPDATE ${table} SET stock = 1 WHERE id IN (${placeholders})`;

    console.log("执行的 SQL:", sql);
    console.log("SQL 参数:", selectIds);

    const [result] = await conn.query(sql, selectIds);
    console.log("更新结果:", result);

    await conn.commit();

    res.status(200).json({
      success: true,
      message: `成功更新 ${result.affectedRows} 條紀錄`,
      affectedRows: result.affectedRows,
      data: {
        table: table,
        updatedIds: selectIds,
        selectWork: selectWork
      }
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("更新失敗:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "更新失敗",
        detail: error.message,
        sql: error.sql
      });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
  }
});


// 於 lotNumber處自動抓到資料 ( rollingCathode 跟 SlittingAnode )
router.get("/getCoatingData_RCSA", async (req, res) => {
  const { selectWork } = req.query || {};

  let table = "";
  let sql = "";

  if (!selectWork) {
    return res.status(400).json({
      success: false,
      error: "缺少 selectWork 參數"
    });
  }

  console.log("selectWork :", selectWork, typeof selectWork);

  switch (selectWork) {
    case "rollingCathode":
      sql = `
      SELECT 
      lotNumber ,
      productionMeters
      FROM coatingcathode_batch 
      where (is_deleted IS NULL OR is_deleted = 0) AND 
      stock IN ('0' , '1') AND 
      is_received NOT IN (1 , 2) 
      ORDER BY id DESC LIMIT 10000`;
      break;

    case "slittingAnode":
      sql = `
      SELECT 
      lotNumber ,
      productionMeters
      FROM coatinganode_batch 
      where (is_deleted IS NULL OR is_deleted = 0) AND   
      stock IN ('0' , '1') AND 
      is_received NOT IN (1 , 2) AND 

      selectWork != 'coaterAnode_S'
      ORDER BY id DESC LIMIT 10000`;
      break;
  }

  try {

    const [result] = await dbmes.query(sql);
    console.log("獲取到的資料:", result);

    res.status(200).json({
      success: true,
      message: "獲取資料成功",
      data: result
    });


  } catch (error) {
    console.error("獲取資料失敗:", error);
    res.status(500).json({
      success: false,
      error: "獲取資料失敗",
      detail: error.message
    });
  }
}),

  // 於 lotNumber處自動抓到資料 ( slittingCathode 跟 RollingAnode )
  router.get("/getCoatingData_SCRA", async (req, res) => {
    const { selectWork } = req.query || {};

    let sql = "";

    if (!selectWork) {
      return res.status(400).json({
        success: false,
        error: "缺少 selectWork 參數"
      });
    }

    switch (selectWork) {
      case "slittingCathode":
        sql = `
          WITH coating_stock AS (
            SELECT lotNumber 
            FROM mes.coatingcathode_batch 
            WHERE (is_deleted IS NULL OR is_deleted = 0) 
              AND is_received NOT IN (0, 2) 
              AND stock IN ('0' , '1') 
          )
          SELECT t.lotNumber, t.rollingLength 
          FROM mes.rollingcathode_batch t
          INNER JOIN coating_stock c ON t.lotNumber COLLATE utf8mb4_unicode_ci = c.lotNumber COLLATE utf8mb4_unicode_ci
          WHERE (t.is_deleted IS NULL OR t.is_deleted = 0) 
          -- AND t.employee_InputTime > '2026-07-27 00:00:00'
          ORDER BY t.id DESC
        `;
        break;
      case "rollingAnode":
        sql = `
        WITH coating_stock AS (
            SELECT lotNumber 
            FROM mes.coatinganode_batch 
            WHERE (is_deleted IS NULL OR is_deleted = 0) 
              AND is_received = '1'
              AND selectWork = 'coaterAnode_D'
        )
        SELECT DISTINCT 
            t.lotNumber_R, 
            t.Length_R, 
            t.lotNumber_L, 
            t.Length_L, 
            t.stock, 
            t.stock_L
        FROM mes.slittinganode_batch t

        INNER JOIN coating_stock c 
          -- 比對 lotNumber_R 或 lotNumber_L 是否以 c.lotNumber 為前綴 (開頭相同，後面接 -R 或 -L)
          ON (t.lotNumber_R IS NOT NULL AND t.lotNumber_R <> '' AND (t.lotNumber_R LIKE CONCAT(c.lotNumber, '-%') OR t.lotNumber_R = c.lotNumber))
          OR (t.lotNumber_L IS NOT NULL AND t.lotNumber_L <> '' AND (t.lotNumber_L LIKE CONCAT(c.lotNumber, '-%') OR t.lotNumber_L = c.lotNumber))

        WHERE (t.is_deleted IS NULL OR t.is_deleted = 0)
          AND (t.stock = 1 OR t.stock_L = 1)
          AND t.lotNumber_R != "-1R"
          AND t.lotNumber_L != "-1L"
        ORDER BY t.id DESC;
        `;
        break;
    }

    // 檢查 SQL 語句是否成功組裝
    if (!sql) {
      return res.status(500).json({
        success: false,
        error: "內部錯誤: SQL 語句未組裝"
      });
    }

    try {
      const [result] = await dbmes.query(sql);
      console.log("獲取到的資料:", result);

      const payloadData = {
        lotNumber: [],
        rollingLength: [],
        lotNumber_R: [],
        Length_R: [],
        lotNumber_L: [],
        Length_L: []
      }

      const finalSend = []

      if (result.length > 0) {
        result.forEach(item => {
          payloadData.lotNumber.push(item.lotNumber ?? '');
          payloadData.rollingLength.push(item.rollingLength ?? '');
          if (selectWork === "rollingAnode") {
            if (item.stock == 1 && item.lotNumber_R && item.lotNumber_R.trim() !== '') {
              if (!payloadData.lotNumber_R.includes(item.lotNumber_R)) {
                payloadData.lotNumber_R.push(item.lotNumber_R);
                payloadData.Length_R.push(item.Length_R ?? '');
              }
            }
            if (item.stock_L == 1 && item.lotNumber_L && item.lotNumber_L.trim() !== '') {
              if (!payloadData.lotNumber_L.includes(item.lotNumber_L)) {
                payloadData.lotNumber_L.push(item.lotNumber_L);
                payloadData.Length_L.push(item.Length_L ?? '');
              }
            }
          } else {
            payloadData.lotNumber_L.push(item.lotNumber_L ?? '');
            payloadData.Length_L.push(item.Length_L ?? '');
            payloadData.lotNumber_R.push(item.lotNumber_R ?? '');
            payloadData.Length_R.push(item.Length_R ?? '');
          }
        });
        finalSend.push(payloadData);
      }

      res.status(200).json({
        success: true,
        message: "獲取資料成功",
        data: finalSend
      });

    } catch (error) {
      console.error("獲取資料失敗:", error);
      res.status(500).json({
        success: false,
        error: "獲取資料失敗",
        detail: error.message
      });
    }
  })

router.put("/stockDelete", async (req, res) => {
  const { selectWork, selectAll, delete_by } = req.body || {};

  if (!selectWork || !selectAll) {
    return res.status(400).json({
      success: false,
      error: "缺少必要參數"
    });
  }

  console.log("selectWork :", selectWork, "selectAll :", selectAll, "delete_by:", delete_by);

  let sql = '';
  let deleteItems = []; // 儲存要刪除的項目
  let placeholders = ''; // 最終傳入SQL 的佔位符字串
  let deleteOp = "";
  let Message_First = "";

  // 判斷是否為分切（有分 L/R 側）或 輥壓（沒有分 L/R 側）
  let targetTable = '';
  let hasSides = false;

  if (selectWork === 'slittingCathode' || selectWork === 'slittingAnode') {
    targetTable = selectWork === 'slittingCathode' ? 'mes.slittingcathode_batch' : 'mes.slittinganode_batch';
    hasSides = true;
  } else if (selectWork === 'rollingCathode' || selectWork === 'rollingAnode') {
    targetTable = selectWork === 'rollingCathode' ? 'mes.rollingcathode_batch' : 'mes.rollinganode_batch';
    hasSides = false;
  } else {
    return res.status(400).json({
      success: false,
      error: "無效的 selectWork 參數"
    });
  }

  if (hasSides) {
    selectAll.split(",").forEach(item => {
      const [num, side, delete_operation] = item.split("-");
      console.log("item:", item);
      console.log("num:", num, "side:", side);
      console.log("delete_operation:", delete_operation);

      if (delete_operation === "user_delete_L") {
        if (side === "R") {
          console.log(side, "是 R 側 要更新 delete_operation = Delete_R");
          deleteItems.push(num);
          placeholders += '?,';
          deleteOp = 'user_delete_both';

          Message_First = `
================================================== \n
選擇站別: ${selectWork} \n
機台編號 : ${num}\n
🎉🎉 刪除成功，已標記為雙側刪除 🎉🎉
================================================== \n
`;
        }
      }
      else if (delete_operation === "user_delete_R") {
        if (side === "L") {
          console.log(side, "是 L 側 要更新 delete_operation = Delete_L");
          deleteItems.push(num);
          placeholders += '?,';
          deleteOp = 'user_delete_both';

          Message_First = `
================================================== \n
選擇站別: ${selectWork} \n
機台編號 : ${num}\n
🎉🎉 刪除成功，已標記為雙側刪除 🎉🎉
================================================== \n
        `;
        }
      }
      else if (!delete_operation || delete_operation === "") {
        if (side === "L") {
          console.log(side, "是 L 側 要更新 delete_operation = Delete_L");
          deleteItems.push(num);
          placeholders += '?,';
          deleteOp = 'user_delete_L';

          Message_First = `
================================================== \n
選擇站別: ${selectWork} \n
機台編號 : ${num}\n
🎉🎉 刪除成功，已標記為L側刪除 🎉🎉
================================================== \n
`;
        } else if (side === "R") {
          console.log(side, "是 R 側 要更新 delete_operation = Delete_R");

          deleteItems.push(num);
          placeholders += '?,';
          deleteOp = 'user_delete_R';
          Message_First = `
================================================== \n
選擇站別: ${selectWork} \n
機台編號 : ${num}\n
🎉🎉 刪除成功，已標記為R側刪除 🎉🎉
================================================== \n
`;
        }
      }
    });

    if (deleteItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "無有效可被刪除的項目"
      });
    }

    sql = `UPDATE ${targetTable} SET delete_operation = '${deleteOp}', delete_by = '${delete_by}' WHERE id IN (${placeholders.slice(0, -1)})`;

  } else {
    // 輥壓（沒有分 L/R 側）
    selectAll.split(",").forEach(item => {
      const [num] = item.split("-");
      if (num) {
        deleteItems.push(num);
        placeholders += '?,';
      }
    });

    if (deleteItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "無有效可被刪除的項目"
      });
    }

    sql = `UPDATE ${targetTable} SET is_deleted = 1, deleted_at = NOW(), delete_operation = 'user_delete', delete_by = '${delete_by}' WHERE id IN (${placeholders.slice(0, -1)})`;

    Message_First = `
================================================== \n
選擇站別: ${selectWork} \n
機台編號 : ${deleteItems.join(', ')}\n
🎉🎉 刪除成功 🎉🎉
================================================== \n
`;
  }

  let conn;
  let isNetworkError = false;
  try {
    conn = await dbmes.getConnection();
    await conn.beginTransaction();

    const [row] = await conn.query(sql, deleteItems);
    await conn.commit();

    const config_Discord = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${discord_rollingNSlitting_notify}`,
      },
    }

    if (Message_First && discord_rollingNSlitting_notify) {
      try {
        await axios.post(discord_rollingNSlitting_notify, {
          content: Message_First,
        }, { ...config_Discord, timeout: 5000 });
      } catch (err) {
        console.error("Discord 通知失敗 (不影響 DB 已提交資料):", err.message);
      }
    }

    console.log("刪除結果:", row);

    res.status(200).json({
      success: true,
      message: "刪除成功",
      data: {
        selectWork: selectWork,
        selectAll: selectAll
      }
    });
  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("刪除失敗:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "刪除失敗",
        detail: error.message
      });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
  }
});

router.post("/sendHandOverRecord", async (req, res) => {
  const { payload } = req.body || {};

  if (!payload) {
    return res.status(400).json({
      success: false,
      error: "缺少 payload 參數"
    });
  }

  // console.log("Received payload for handover record:", payload);

  try {
    const prisma = prismaHr;

    const parseNaiveDateTime = (value) => {
      if (!value) return null;
      const parsed = moment(
        String(value),
        ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DDTHH:mm:ss.SSS"],
        true
      );
      if (!parsed.isValid()) return null;

      // Prisma DateTime 在某些設定會以 UTC 寫入 DATETIME，
      // 這裡用 UTC constructor 保留前端送來的時分秒數字不被位移。
      return new Date(Date.UTC(
        parsed.year(),
        parsed.month(),
        parsed.date(),
        parsed.hour(),
        parsed.minute(),
        parsed.second(),
        parsed.millisecond()
      ));
    };

    const records = payload.records || {};
    const startTime = parseNaiveDateTime(payload.records.otherData[0].createAt ?? new Date());
    const searchTime = parseNaiveDateTime(payload.searchTime);

    const otherData = Array.isArray(records.otherData) ? records.otherData : [];

    if (otherData.length === 0 && records.notAchieveReason === "") {
      return res.status(400).json({
        success: false,
        error: "payload.records.otherData 必須是陣列且至少 1 筆 或者勾選至少一項未達成原因"
      });
    }

    const nowDate = startTime
    const rearchTimeFinal = searchTime ?? new Date();
    // const now = new Date();
    // const nowDate = new Date(moment(now).tz('Asia/Taipei').format('YYYY-MM-DDTHH:mm:ss') + '+08:00'); // 台北時間，Prisma 需要 Date 物件

    const managerName = records.managerName ?? null;
    const managerNumber = records.managerNumber != null ? Number(records.managerNumber) : null;
    const shift = records.shift ?? null;
    const notAchieveReason = records.notAchieveReason ?? null;
    const headerInnerText = records.innerText ?? null;

    const toDecimal = (value) => {
      if (value === null || value === undefined || value === '') return null;
      return String(value);
    };

    const toInt = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      return Number.isFinite(num) ? Math.round(num) : null;
    };

    const results = await prisma.$transaction(async (tx) => {
      const txResults = [];

      for (const item of otherData) {
        const itemInnerText = (item && item.innerText != null && String(item.innerText).trim() !== '')
          ? item.innerText
          : headerInnerText;

        const station = item?.station != null ? String(item.station).trim() : null;
        console.log('check item  :', item);


        const data = {
          selectWork: item?.selectWork ?? null,
          managerName,
          managerNumber,
          shift,
          station,
          producingMeter: toInt(item?.producingMeter),
          lostMeter: toDecimal(item?.lostMeter),
          annuanceCapacity: toInt(item?.annuanceCapacity) ?? 0,
          producingMeterAchieveRate: toDecimal(item?.producingMeter_achieveRate ?? item?.producingMeterAchieveRate),
          errorCarryOnTime: toInt(item?.errorCarryOnTime) ?? 0,
          innerText: itemInnerText,
          isDelete: false,
          employeeName: item?.memberName ? String(item.memberName).trim() : '',
          createAt: nowDate ?? new Date(),
          searchTime: rearchTimeFinal,
          yield: item?.yield != null && item?.yield !== '' ? toDecimal(item.yield) : 0,
          notAchieveReason: notAchieveReason ? String(notAchieveReason).trim() : '',
        };

        if (item?.producingMeter_targetRate != null || item?.producingMeterTargetRate != null) {
          data.producingMeterTargetRate = toDecimal(item?.producingMeter_targetRate ?? item?.producingMeterTargetRate);
        }

        const itemId = item?.id != null && String(item.id).trim() !== '' ? Number(item.id) : null;

        // 若前端有提供每筆的 id，直接 update
        if (itemId && Number.isFinite(itemId) && itemId > 0) {
          const result = await tx.handoverRollingnslitting.update({
            where: { id: itemId },
            data: data,
          });
          txResults.push(result);
          continue;
        }

        // 「當天同人同機」更新邏輯
        const canUseSameDayUpsert =
          data.managerName != null &&
          data.managerNumber != null &&
          data.station != null &&
          data.station !== '';

        if (canUseSameDayUpsert) {

          console.log('Upsert with:', {
            managerName: data.managerName,
            managerNumber: data.managerNumber,
            station: data.station,
          });

          const existing = await tx.handoverRollingnslitting.findFirst({
            select: { id: true },
            where: {
              managerName: data.managerName,
              managerNumber: data.managerNumber,
              station: data.station,
              shift: data.shift,
              employeeName: data.employeeName,
              createAt: nowDate
            },
          });

          let result;
          if (existing) {
            result = await tx.handoverRollingnslitting.update({
              select: { id: true },
              where: { id: existing.id },
              data,
            });
          } else {
            result = await tx.handoverRollingnslitting.create({
              select: { id: true },
              data,
            });
          }
          txResults.push(result);
          continue;
        }

        // 條件不完整，建立新紀錄
        const result = await tx.handoverRollingnslitting.create({ data });
        txResults.push(result);
      }

      return txResults;
    });

    res.status(200).json({
      success: true,
      message: "交接班記錄寫入成功",
      inserted: results.length,
      // data: results,
    });

  } catch (error) {
    console.error("交接班記錄發送失敗:", error);
    res.status(500).json({
      success: false,
      error: "交接班記錄發送失敗",
      detail: error.message
    });
  }
})

router.get("/getHandOverRecord", async (req, res) => {
  const {
    startTime,
    endTime,
    page = 1,
    pageSize = 10,
  } = req.query || {};

  if (!moment(startTime).isValid() || !moment(endTime).isValid()) {
    console.log("startTime 或 endTime 格式無效:", startTime, endTime);
    return res.status(400).json({
      success: false,
      error: "缺少 startTime 或 endTime 參數"
    });
  }

  const currentPage = parseInt(page, 10) || 1;
  const limit = parseInt(pageSize, 10) || 10;
  const offset = (currentPage - 1) * limit;


  try {
    const startAt = moment(startTime).format("YYYY-MM-DD HH:mm:ss");
    const endAt = moment(endTime).format("YYYY-MM-DD HH:mm:ss");

    console.log("查詢交接班記錄的時間範圍:", startAt, endAt, "分頁參數 - page:", currentPage, "pageSize:", limit);

    const sqlData = `
      WITH ranked AS (
        SELECT
          t.id,
          t.selectWork,
          t.managerName,
          t.managerNumber,
          t.shift,
          t.station,
          t.producingMeter,
          t.lostMeter,
          t.annuanceCapacity,
          t.producingMeter_achieveRate,
          t.errorCarryOnTime,
          t.producingMeter_targetRate,
          t.innerText,
          t.is_Delete,
          t.deleteBy,
          t.deleteAt,
          t.createAt,
          t.searchTime,
          t.yield,
          t.employeeName,
          t.notAchieveReason,
          ROW_NUMBER() OVER (
            PARTITION BY t.managerName, t.shift, t.station, t.employeeName
            ORDER BY t.createAt DESC, t.id DESC
          ) AS rn
        FROM hr.handover_rollingnslitting t
        WHERE t.createAt >= ?
          AND t.createAt <= ?
          AND t.is_Delete = 0
          AND t.searchTime IS NOT NULL
          AND t.searchTime >= ?
          
      )
      SELECT
        id,
        selectWork,
        managerName,
        managerNumber,
        shift,
        station,
        producingMeter,
        lostMeter,
        annuanceCapacity,
        producingMeter_achieveRate AS producingMeterAchieveRate,
        errorCarryOnTime,
        producingMeter_targetRate AS producingMeterTargetRate,
        innerText,
        is_Delete AS isDelete,
        deleteBy,
        deleteAt,
        createAt,
        searchTime,
        yield,
        employeeName,
        notAchieveReason
      FROM ranked
      WHERE rn = 1
      ORDER BY  id DESC
      LIMIT ? OFFSET ?
    `;

    const sqlCount = `
      WITH ranked AS (
        SELECT
          ROW_NUMBER() OVER (
            PARTITION BY t.managerName, t.shift, t.station, t.employeeName
            ORDER BY t.createAt DESC, t.id DESC
          ) AS rn
        FROM hr.handover_rollingnslitting t
        WHERE t.createAt >= ?
          AND t.createAt <= ?
          AND t.is_Delete = 0
          AND t.searchTime IS NOT NULL
          AND t.searchTime >= ?
      )
      SELECT COUNT(*) AS total
      FROM ranked
      WHERE rn = 1
    `;

    const [[records], [countRows]] = await Promise.all([
      dbcon.query(sqlData, [startAt, endAt, startAt, limit, offset]),
      dbcon.query(sqlCount, [startAt, endAt, startAt])
    ]);

    const total = countRows[0]?.total || 0;

    console.log("查詢到的交接班記錄:", records);

    res.status(200).json({
      success: true,
      message: "交接班記錄接收成功",
      data: records,
      pagination: {
        currentPage,
        pageSize: limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: currentPage < Math.ceil(total / limit),
        hasPrevPage: currentPage > 1
      }
    });
  } catch (error) {
    console.error("交接班記錄發送失敗:", error);
    res.status(500).json({
      success: false,
      error: "交接班記錄發送失敗",
      detail: error.message
    });
  }
});


router.get('/announceLast', async (req, res) => {
  // 1. 定義要查詢的 4 個工種
  const selections = ['rollingCathode', 'rollingAnode', 'slittingCathode', 'slittingAnode'];
  const engineerId = '264';

  try {
    // 2. 高效 SQL：先 GROUP BY 找出「工種 + 機台」組合的最新 ID，再用這些 ID 抓資料
    const sql = `
      SELECT 
          t1.selectWork, 
          t1.machineNo, 
          t1.announceCapacity,
          t1.id
      FROM hr.rollingnslitting_register t1
      WHERE t1.id IN (
          SELECT MAX(id)
          FROM hr.rollingnslitting_register
          WHERE is_deleted = 0 
            AND engineerId = ? 
            AND selectWork IN (?)
          GROUP BY selectWork, machineNo
      )
      ORDER BY t1.selectWork, t1.machineNo;
    `;

    // 執行查詢 (使用參數化防止注入並加速)
    const [rows] = await dbcon.query(sql, [engineerId, selections]);
    console.log("查詢到的最新公告資料:", rows);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error("查詢失敗:", error);
    res.status(500).json({ success: false, error: "Database Error" });
  }
});

router.put('/deleteHandOverRecord', async (req, res) => {
  const { data } = req.body || {};

  console.log("Received delete request for handover record:", data.id, typeof data.id, "by user:", data.deleteUser, typeof data.deleteUser);
  const id = data.id;
  const deleteUser = data.deleteUser;


  if (String(deleteUser) !== '264' && String(deleteUser) !== '349') return res.status(403).json({
    success: false,
    message: "沒有權限刪除此記錄"
  });

  try {
    if (!id || !deleteUser) {
      return res.status(400).json({
        success: false,
        message: "缺少 id 或 deleteUser 參數"
      })
    }

    const prisma = prismaHr;
    const result = await prisma.handoverRollingnslitting.update({
      where: { id: Number(id) },
      data: {
        deleteBy: String(deleteUser),
        deleteAt: new Date(),
        isDelete: true,
      }
    });

    console.log("刪除結果:", result);

    res.status(200).json({
      success: true,
      message: "交接班記錄刪除成功",
      data: {
        id: result.id,
        deleteBy: result.deleteBy,
        deleteAt: result.deleteAt
      }
    });
  } catch (error) {
    console.error("刪除交接班記錄失敗:", error);
    res.status(500).json({
      success: false,
      error: "刪除交接班記錄失敗",
      detail: error.message
    });
  }
})


router.get("/stockCalculate", async (req, res) => {

  try {
    let finalSelect = [];

    sql_RA = `SELECT 
            id, 
            selectWork, 
            machineNo, 
            lotNumber , 
            rollingLength ,
            delete_operation
            FROM mes.rollinganode_batch 
            WHERE (is_deleted IS NULL OR is_deleted = 0) 
              AND (stock IS NULL OR stock = 0) 
              AND rollingLength IS NOT NULL
              AND engineerId = ?
            ORDER BY id DESC 
            `;
    sql_SC = `
        SELECT id, selectWork, machineNo, lotNumber, delete_operation , source_type , rollingLength
           FROM (
             SELECT id, selectWork, machineNo, delete_operation ,
             lotNumber_R AS lotNumber, 
             'R' AS source_type,
             Length_R AS rollingLength
             FROM mes.slittingcathode_batch
             WHERE (is_deleted IS NULL OR is_deleted = 0)
               AND (stock IS NULL OR stock = 0)
               AND Length_R IS NOT NULL
               AND engineerId = ?
               AND lotNumber_R IS NOT NULL AND lotNumber_R <> ''
               AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_R', 'user_delete_both'))
             UNION ALL
             SELECT id, selectWork, machineNo, delete_operation ,
             lotNumber_L AS lotNumber, 
             'L' AS source_type,
              Length_L AS rollingLength
             FROM mes.slittingcathode_batch
             WHERE (is_deleted IS NULL OR is_deleted = 0)
               AND (stock_L IS NULL OR stock_L = 0)
               AND Length_L IS NOT NULL
               AND engineerId = ?
               AND lotNumber_L IS NOT NULL AND lotNumber_L <> ''
               AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_L', 'user_delete_both'))
           ) AS combined
           ORDER BY id DESC, source_type
           
           `

    const [rollingAnodeResult] = await dbmes.query(sql_RA, ['264']);
    const [slittingCathodeResult] = await dbmes.query(sql_SC, ['264', '264']);

    console.log("Rolling Anode Result:", rollingAnodeResult);
    console.log("Slitting Cathode Result:", slittingCathodeResult);


    let totalCount_RA = 0; // 用於計算輾負總庫存數量
    let totalCount_SC = 0; // 用於計算分條總庫存數量

    for (let i = 0; i < rollingAnodeResult.length; i++) {
      raCount = Number(rollingAnodeResult[i].rollingLength);
      totalCount_RA += raCount;
    }
    finalSelect.push({
      selectWork: "rollingAnode",
      totalCount: totalCount_RA
    })


    for (let j = 0; j < slittingCathodeResult.length; j++) {
      scCount = Number(slittingCathodeResult[j].rollingLength);
      totalCount_SC += scCount;
    }
    finalSelect.push({
      selectWork: "slittingCathode",
      totalCount: totalCount_SC
    });

    console.log("最終庫存計算結果:", finalSelect);

    res.status(200).json({
      success: true,
      message: "庫存計算成功",
      data: finalSelect
    });

  } catch (error) {
    console.error("庫存計算失敗:", error);
    res.status(500).json({
      success: false,
      error: "庫存計算失敗",
      detail: error.message
    });
  }
});
// ==========================================
// ==========================================
// 操作人員上下班與班別 (Zod 檢驗 + Redis rPush / Hash + hr.emp_loginout DB)
// 包含【指數退避 Exponential Backoff】與【搭便車 Single-flight Piggybacking】
// ==========================================

// 自動檢查並確保 hr.emp_loginout 包含 diffTime 欄位
(async () => {
  try {
    const [cols] = await dbcon.query("SHOW COLUMNS FROM hr.emp_loginout LIKE 'diffTime'");
    if (!cols || cols.length === 0) {
      await dbcon.query("ALTER TABLE hr.emp_loginout ADD COLUMN diffTime int DEFAULT 0 COMMENT '休息時間'");
      console.log("✅ [DB] hr.emp_loginout 自動新增 diffTime 欄位完成");
    }
  } catch (err) {
    console.warn("檢查 diffTime 欄位資訊:", err.message);
  }
})();

/**
 * 具有隨機擾動的指數退避 (Exponential Backoff with Full Jitter) 重試函式
 */
async function withExponentialBackoff(operation, {
  retries = 3,
  baseDelayMs = 200,
  maxDelayMs = 3000,
  factor = 2,
  jitter = true,
  operationName = 'Async Operation',
} = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      if (attempt > retries) {
        console.error(`❌ [${operationName}] 指數退避重試已達上限 (${retries} 次):`, error?.message || error);
        throw error;
      }
      let delay = baseDelayMs * Math.pow(factor, attempt - 1);
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }
      delay = Math.min(delay, maxDelayMs);
      console.warn(`⚠️ [${operationName}] 發生錯誤 (第 ${attempt}/${retries} 次嘗試)，將於 ${Math.round(delay)}ms 後以指數退避重試... 原因: ${error?.message || error}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * 全域搭便車 (Single-Flight Request Coalescing) 任務 Map
 */
const inFlightShiftRequests = new Map();

/**
 * 搭便車 (Singleflight) 機制：避免相同人員/機台短時間內重複並行寫入資料庫造成衝突
 */
async function withPiggyback(key, operation) {
  if (inFlightShiftRequests.has(key)) {
    console.log(`🚗 [搭便車] 偵測到已有相同打卡任務正在執行 [${key}]，直接搭便車共用結果...`);
    return inFlightShiftRequests.get(key);
  }

  const promise = (async () => {
    try {
      return await operation();
    } finally {
      inFlightShiftRequests.delete(key);
    }
  })();

  inFlightShiftRequests.set(key, promise);
  return promise;
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

const OperatorShiftRecordSchema = z.object({
  action: z.enum(['login', 'logout', 'delete']),
  memberNumber: z.string().min(1, '工號不得為空'),
  memberName: z.string().min(1, '姓名不得為空'),
  shift: z.enum(['早班', '晚班', '常日A', '常日B'], {
    errorMap: () => ({ message: '請確認班別正確' })
  }),
  selectWork: z.enum([
    'rollingAnode', 'rollingCathode', 'slittingAnode', 'slittingCathode',
    '負極輾壓', '正極輾壓', '負極分切', '正極分切'
  ]),
  employeeWorkType: z.string().optional().nullable(),
  workType: z.string().optional().nullable(),
  machineId: z.union([z.number(), z.string()]),
  machineNo: z.string().min(1, '機台編號不得為空'),
  time: z.string().min(1, '時間戳記不得為空'),
  loginTime: z.string().optional().nullable(),
  logoutTime: z.string().optional().nullable(),
  nowWorkOp: z.string().optional().nullable(),
  diffTime: z.number().optional().default(0),
});

// 將英文或簡稱精確轉換為四大工作類型：正極輾壓、正極分切、負極輾壓、負極分切
function toWorkTypeName(selectWork, employeeWorkType) {
  const candidate = String(employeeWorkType || selectWork || '').trim();
  const lower = candidate.toLowerCase();
  if (candidate === '正極輾壓' || lower.includes('rollingcathode') || (lower.includes('cathode') && lower.includes('rolling'))) {
    return '正極輾壓';
  }
  if (candidate === '正極分切' || lower.includes('slittingcathode') || (lower.includes('cathode') && lower.includes('slitting'))) {
    return '正極分切';
  }
  if (candidate === '負極輾壓' || lower.includes('rollinganode') || (lower.includes('anode') && lower.includes('rolling'))) {
    return '負極輾壓';
  }
  if (candidate === '負極分切' || lower.includes('slittinganode') || (lower.includes('anode') && lower.includes('slitting'))) {
    return '負極分切';
  }
  return candidate || '未知';
}

// 紀錄操作人員上下班打卡與班別 (Redis rPush & Hash + MySQL hr.emp_loginout)
router.post("/recordOperatorShift", async (req, res) => {
  res.set(NO_CACHE_HEADERS);
  try {
    const parseResult = OperatorShiftRecordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: "資料格式驗證失敗",
        errors: parseResult.error.errors,
      });
    }

    const data = parseResult.data;
    const machineKey = `${data.selectWork}-${data.machineId}-${data.machineNo}`;
    const dedupeKey = `shift:${data.selectWork}:${data.machineId}:${data.memberNumber}:${data.action}:${data.time}`;

    // 透過【搭便車 Single-Flight】機制處理並行請求
    const payload = await withPiggyback(dedupeKey, async () => {
      // 1. 取得先前該機台的暫存狀態 (若有)
      let prevData = {};
      try {
        const prevStr = await redisClient.hGet('rollingNSlitting:activeBreakTime', machineKey);
        if (prevStr) {
          prevData = JSON.parse(prevStr);
        }
      } catch (readErr) {
        console.warn("讀取機台前次狀態失敗 (忽略繼續):", readErr.message);
      }

      // 判斷人員名稱/工號是否相同 (名稱相同才算 diff，名稱不同不需要，且同人員累加)
      const prevMemberName = prevData.memberName || "";
      const prevMemberNo = prevData.machineLoginNumber || prevData.nowWorkOp || "";
      const isSameMember = Boolean(
        (prevMemberName && prevMemberName === data.memberName) ||
        (prevMemberNo && prevMemberNo === data.memberNumber)
      );

      let calculatedDiffTime = 0;
      if (data.action === 'logout') {
        if (isSameMember) {
          const rawLogin = prevData.machineLoginTime || data.loginTime;
          const sessionDiff = rawLogin
            ? Math.max(0, moment(data.time).diff(moment(rawLogin), 'minutes'))
            : 0;
          const previousDiffTime = Number(prevData.diffTime || 0);
          calculatedDiffTime = previousDiffTime + sessionDiff;
          console.log(`⏱️ [累加 diffTime] 人員相同: ${data.memberName}(${data.memberNumber}), 本次: ${sessionDiff} 分鐘, 前次累加: ${previousDiffTime} 分鐘, 總累加: ${calculatedDiffTime} 分鐘`);
        } else {
          calculatedDiffTime = 0;
          console.log(`⏱️ [不計算 diffTime] 人員不同 (前: ${prevMemberName}/${prevMemberNo}, 現: ${data.memberName}/${data.memberNumber}), 不需要計算 diff`);
        }
      } else if (data.action === 'login') {
        // 若機台原本有未登出之人員，且本次登入為不同人員，自動為前一位人員結清登出
        if (prevMemberNo && !isSameMember && (!prevData.machineLogoutTime || prevData.machineLogoutTime === "")) {
          console.log(`🔄 [交接自動結清] 機台 ${machineKey} 由新人員 ${data.memberName}(${data.memberNumber}) 接手，前一位人員 ${prevMemberName}(${prevMemberNo}) 自動結清登出`);
          try {
            const autoLogoutTime = data.time || moment().format('YYYY-MM-DD HH:mm:ss');
            const autoLogoutPayload = {
              ...prevData,
              action: 'logout',
              logoutTime: autoLogoutTime,
              machineLogoutNumber: prevMemberNo,
              machineLogoutTime: autoLogoutTime,
              errorRecord: `系統交接自動結清 (新人員 ${data.memberName}(${data.memberNumber}) 登入)`,
            };

            await withExponentialBackoff(async () => {
              await redisClient.rPush('shiftRecord:rollingNSlitting:logs', JSON.stringify(autoLogoutPayload));
              await redisClient.rPush(`shiftRecord:member:${prevMemberNo}`, JSON.stringify(autoLogoutPayload));
            }, { operationName: 'Redis 自動結清寫入', retries: 2, baseDelayMs: 150 });

            const prevWorkType = toWorkTypeName(prevData.selectWork, prevData.employeeWorkType);
            const prevStation = `${prevWorkType}-${data.machineId}`;

            const autoLogoutSql = `
              INSERT INTO hr.emp_loginout (
                memberId,
                memberName,
                action,
                shift,
                selectWork,
                employeeWorkType,
                station,
                errorRecord,
                created_at,
                diffTime
              ) VALUES (?, ?, 'logout', ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                action = VALUES(action),
                selectWork = VALUES(selectWork),
                employeeWorkType = VALUES(employeeWorkType),
                errorRecord = VALUES(errorRecord),
                diffTime = VALUES(diffTime)
            `;

            await withExponentialBackoff(async () => {
              await dbcon.query(autoLogoutSql, [
                String(prevMemberNo),
                String(prevMemberName || prevMemberNo),
                String(prevData.shift || data.shift),
                prevWorkType,
                prevWorkType,
                prevStation,
                `系統交接自動結清 (新人員 ${data.memberName}(${data.memberNumber}) 登入)`,
                autoLogoutTime,
                Number(prevData.diffTime || 0),
              ]);
            }, { operationName: 'MySQL 前人員自動結清寫入', retries: 2, baseDelayMs: 200 });

          } catch (autoErr) {
            console.error("前一位人員自動結清失敗 (忽略繼續):", autoErr);
          }
        }

        // 登入時若同一人員保留先前累計 diffTime，若換人則歸零
        calculatedDiffTime = isSameMember ? Number(prevData.diffTime || 0) : 0;
      }

      const currentWorkTypeName = toWorkTypeName(data.selectWork, data.employeeWorkType);

      const currentPayload = {
        ...data,
        selectWork: data.selectWork,
        employeeWorkType: currentWorkTypeName,
        workType: currentWorkTypeName,
        diffTime: calculatedDiffTime,
        machineLoginNumber: data.action === 'login' ? data.memberNumber : (prevData.machineLoginNumber || data.memberNumber),
        machineLoginTime: data.action === 'login' ? data.time : (prevData.machineLoginTime || data.loginTime || data.time),
        machineLogoutNumber: data.action === 'login' ? "" : (data.action === 'logout' ? data.memberNumber : (prevData.machineLogoutNumber || "")),
        machineLogoutTime: data.action === 'login' ? "" : (data.action === 'logout' ? data.time : (prevData.machineLogoutTime || "")),
        logoutTime: data.action === 'login' ? "" : (data.action === 'logout' ? data.time : (data.logoutTime || "")),
        nowWorkOp: data.memberNumber,
      };

      // 2. 寫入 Redis (結合指數退避，依據機器名稱 machineNo 儲存)
      await withExponentialBackoff(async () => {
        await redisClient.rPush('shiftRecord:rollingNSlitting:logs', JSON.stringify(currentPayload));
        await redisClient.rPush(`shiftRecord:member:${data.memberNumber}`, JSON.stringify(currentPayload));

        const machineNameKey = String(data.machineNo).trim();
        const fullMachineKey = `${data.selectWork}-${data.machineId}-${data.machineNo}`;

        if (data.action === 'delete') {
          await redisClient.hDel('rollingNSlitting:activeBreakTime', machineNameKey);
          await redisClient.hDel('rollingNSlitting:activeBreakTime', fullMachineKey);
        } else {
          // 同時以 機器名稱 (machineNo) 與 全機台鍵名 儲存，確保依據機器名稱精確獲取
          await redisClient.hSet('rollingNSlitting:activeBreakTime', machineNameKey, JSON.stringify(currentPayload));
          await redisClient.hSet('rollingNSlitting:activeBreakTime', fullMachineKey, JSON.stringify(currentPayload));
        }
      }, { operationName: 'Redis 打卡寫入', retries: 3, baseDelayMs: 150 });

      // 3. 同步寫入 MySQL hr.emp_loginout 資料庫 (結合指數退避)
      if (data.action === 'login' || data.action === 'logout') {
        await withExponentialBackoff(async () => {
          const createdAt = data.time ? moment(data.time).format('YYYY-MM-DD HH:mm:ss') : moment().format('YYYY-MM-DD HH:mm:ss');
          const station = `${currentWorkTypeName}-${data.machineNo || data.machineId}`;

          const insertSql = `
            INSERT INTO hr.emp_loginout (
              memberId,
              memberName,
              action,
              shift,
              selectWork,
              employeeWorkType,
              station,
              created_at,
              diffTime
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              memberId = VALUES(memberId),
              memberName = VALUES(memberName),
              action = VALUES(action),
              shift = VALUES(shift),
              selectWork = VALUES(selectWork),
              employeeWorkType = VALUES(employeeWorkType),
              station = VALUES(station),
              created_at = VALUES(created_at),
              diffTime = VALUES(diffTime)
          `;

          await dbcon.query(insertSql, [
            String(data.memberNumber),
            String(data.memberName),
            String(data.action),
            String(data.shift),
            currentWorkTypeName,
            currentWorkTypeName,
            station,
            createdAt,
            calculatedDiffTime,
          ]);

          console.log(`💾 [DB] 成功寫入 hr.emp_loginout: ${data.memberName}(${data.memberNumber}) [${data.action}] 作業:${currentWorkTypeName} 班別:${data.shift} 休息:${calculatedDiffTime}分 機台:${station} at ${createdAt}`);
        }, { operationName: 'MySQL hr.emp_loginout 寫入', retries: 3, baseDelayMs: 200 });
      }

      return currentPayload;
    });

    console.log(`⚡ [Redis & DB] 操作人員打卡成功: [${data.action}] ${data.memberName}(${data.memberNumber}) 班別:${data.shift} diffTime:${payload.diffTime} 機台:${data.machineNo}`);

    res.status(200).json({
      success: true,
      message: "操作人員紀錄已寫入 Redis 與 hr.emp_loginout (含指數退避與搭便車機制)",
      data: payload,
    });
  } catch (error) {
    console.error("寫入操作人員打卡記錄失敗:", error);
    res.status(500).json({
      success: false,
      message: "寫入操作人員打卡記錄失敗",
      detail: error.message,
    });
  }
});

// 取得當前班別與班別起始時間 (早班 08:00 - 20:00, 晚班 20:00 - 次日 08:00)
function getCurrentShiftInfo() {
  const now = moment();
  const startDay = moment().startOf('day').add(8, 'hours');   // 08:00
  const endDay = moment().startOf('day').add(20, 'hours');    // 20:00
  const currentShift = (now.isSameOrAfter(startDay) && now.isBefore(endDay)) ? '早班' : '晚班';
  let shiftStartTime;
  if (currentShift === '早班') {
    shiftStartTime = startDay;
  } else {
    shiftStartTime = now.isBefore(startDay)
      ? moment().subtract(1, 'day').startOf('day').add(20, 'hours')
      : endDay;
  }
  return { currentShift, shiftStartTime };
}

// 每日早晨 08:00 與晚上 20:00 自動清理交班操作人員狀態排程
schedule.scheduleJob("0 0 8,20 * * *", async () => {
  console.log("⏰ 觸發 08:00/20:00 換班操作人員清理排程...");
  try {
    const rawHash = await redisClient.hGetAll('rollingNSlitting:activeBreakTime');
    if (rawHash) {
      const nowStr = moment().format('YYYY-MM-DD HH:mm:ss');
      for (const [key, v] of Object.entries(rawHash)) {
        try {
          const info = JSON.parse(v);
          if (info.machineLoginNumber && (!info.machineLogoutTime || info.machineLogoutTime === "")) {
            const workType = toWorkTypeName(info.selectWork, info.employeeWorkType);
            const station = `${workType}-${info.machineNo || info.machineId}`;
            await dbcon.query(`
              INSERT INTO hr.emp_loginout (
                memberId, memberName, action, shift, selectWork, employeeWorkType, station, errorRecord, created_at, diffTime
              ) VALUES (?, ?, 'logout', ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE action = VALUES(action), errorRecord = VALUES(errorRecord), diffTime = VALUES(diffTime)
            `, [
              String(info.machineLoginNumber),
              String(info.memberName || info.machineLoginNumber),
              String(info.shift || '早班'),
              workType,
              workType,
              station,
              '交班時間到達(08:00/20:00)系統自動結清',
              nowStr,
              Number(info.diffTime || 0)
            ]);
          }
        } catch (itemErr) {
          console.error("換班結清個別機台失敗:", itemErr);
        }
      }
    }
    await redisClient.del('rollingNSlitting:activeBreakTime');
    console.log("✅ 08:00/20:00 換班已完成全數機台 Redis 清理與自動結清");
  } catch (err) {
    console.error("換班清理排程失敗:", err);
  }
});

// 取得所有機台當前操作人員狀態 (依據機器名稱索引，過期班別自動過濾清理)
router.get("/getOperatorShiftStatus", async (req, res) => {
  res.set(NO_CACHE_HEADERS);
  try {
    const { currentShift, shiftStartTime } = getCurrentShiftInfo();
    const rawHash = await redisClient.hGetAll('rollingNSlitting:activeBreakTime');
    const result = {};
    if (rawHash) {
      for (const [k, v] of Object.entries(rawHash)) {
        try {
          const parsed = JSON.parse(v);
          const recordTime = parsed.machineLoginTime || parsed.time;
          // 若打卡時間早於目前班別起始時間 (跨越 08:00 或 20:00)，視為過期記錄自動刪除
          if (recordTime && moment(recordTime).isBefore(shiftStartTime)) {
            await redisClient.hDel('rollingNSlitting:activeBreakTime', k);
            continue;
          }
          result[k] = parsed;
        } catch (e) {
          result[k] = v;
        }
      }
    }
    res.status(200).json({
      success: true,
      currentShift,
      data: result,
    });
  } catch (error) {
    console.error("讀取操作人員狀態失敗:", error);
    res.status(500).json({
      success: false,
      message: "讀取 Redis 狀態失敗",
      detail: error.message,
    });
  }
});

// 清除指定機台的操作人員暫存狀態 (Confirm 成功送出後呼叫，支援機器名稱)
router.post("/clearOperatorShiftStatus", async (req, res) => {
  res.set(NO_CACHE_HEADERS);
  try {
    const { machineKey, machineNo } = req.body;
    const targetKey = String(machineNo || machineKey || "").trim();
    if (!targetKey) {
      return res.status(400).json({ success: false, message: "缺少 machineKey 或 machineNo" });
    }
    await redisClient.hDel('rollingNSlitting:activeBreakTime', targetKey);
    if (machineKey && machineKey !== targetKey) {
      await redisClient.hDel('rollingNSlitting:activeBreakTime', machineKey);
    }
    console.log(`⚡ [Redis] 已清除機台暫存狀態: ${targetKey}`);
    res.status(200).json({
      success: true,
      message: `已清除 ${targetKey} 之狀態`,
    });
  } catch (error) {
    console.error("清除操作人員狀態失敗:", error);
    res.status(500).json({
      success: false,
      message: "清除 Redis 狀態失敗",
      detail: error.message,
    });
  }
});

// 獨立操作人員工號查詢 API (不修改原 mixprocess/getEngineerName，獨立防快取與 Zod 驗證)
router.get("/getOperatorName", async (req, res) => {
  res.set(NO_CACHE_HEADERS);
  const { employeeNo } = req.query;

  try {
    if (!employeeNo || String(employeeNo).trim() === "") {
      return res.status(400).json({ success: false, message: "缺少 employeeNo 參數" });
    }

    const cleanInput = String(employeeNo).trim();
    const numbers = cleanInput.split(",").map(n => n.trim()).filter(Boolean);

    for (let number of numbers) {
      const numberFind = number.replace(/^0+/, '') || '0';
      const [rows] = await dbcon.query(
        `SELECT reg_schedulename AS memberName, memberID FROM hr.schedule_reginfo WHERE memberID = ? OR memberID = ?`,
        [numberFind, number]
      );

      if (rows && rows.length > 0) {
        return res.status(200).json({
          success: true,
          data: rows,
          message: `找到符合條件人員: ${employeeNo} | ${rows[0].memberName}`,
        });
      }
    }

    return res.status(404).json({
      success: false,
      data: [],
      message: "查無此工號對應之人員",
    });
  } catch (error) {
    console.error("查詢操作人員姓名失敗:", error);
    res.status(500).json({ success: false, error: "查詢操作人員姓名失敗", detail: error.message });
  }
});


router.post('/engineerChangeData', async (req, res) => {
  const { data, user } = req.body;
  const type = req.body.optionType || '未知'

  if (!data) {
    return res.status(400).json({
      success: false,
      message: "缺少必要資料，無法執行操作"
    })
  } else if (!user) {
    return res.status(400).json({
      success: false,
      message: "缺少操作人員資訊，無法執行操作"
    })
  }

  console.log("操作人員異動資料:", data, "操作人員:", user, "optionType", type);

  let clientModel = '';
  let modelDmmfName = '';
  switch (type) {
    case '正極輾壓':
      clientModel = 'rollingcathodeBatch';
      modelDmmfName = 'RollingcathodeBatch';
      break;
    case '正極分切':
      clientModel = 'slittingcathodeBatch';
      modelDmmfName = 'SlittingcathodeBatch';
      break;
    case '負極輾壓':
      clientModel = 'rollinganodeBatch';
      modelDmmfName = 'RollinganodeBatch';
      break;
    case '負極分切':
      clientModel = 'slittinganodeBatch';
      modelDmmfName = 'SlittinganodeBatch';
      break;
    default:
      return res.status(400).json({
        success: false,
        message: "無法識別的 'optionType'"
      });
  }

  try {
    const mes = prismaMes;

    // 取得該模型的欄位對照表 (支援資料庫欄位名稱 dbName 或 Prisma 屬性名稱 name)
    const modelMeta = MesPrisma.dmmf.datamodel.models.find(
      (m) => m.name.toLowerCase() === modelDmmfName.toLowerCase()
    );

    const fieldMap = {};
    if (modelMeta && Array.isArray(modelMeta.fields)) {
      modelMeta.fields.forEach((f) => {
        fieldMap[f.name] = f;
        if (f.dbName) fieldMap[f.dbName] = f;
      });
    }

    // 不允許透過此介面覆寫的系統欄位
    const forbiddenFields = [
      'id',
      'is_deleted',
      'isDeleted',
      'deleted_at',
      'deletedAt',
      'delete_operation',
      'deleteOperation',
      'delete_by',
      'deleteBy',
      'selectWork',
      'startTime',
      'employee_InputTime',
      'employeeInputTime'
    ];

    const engineerName = user?.reg_schedulename || '';
    const engineerId = String(user?.memberID || '');

    // 整理每一筆要更新的資料
    const preparedItems = [];
    for (const item of data) {
      if (!item || !item.id) continue;

      const updateData = {};

      for (const [key, val] of Object.entries(item)) {
        if (forbiddenFields.includes(key)) continue;

        const meta = fieldMap[key];
        if (!meta) continue; // 略過不在模型中的多餘欄位，避免 Prisma 報錯

        // 處理空字串與型態轉換 (避免 Decimal/Int/DateTime 傳空字串報錯)
        if (['Decimal', 'Float', 'Int', 'DateTime'].includes(meta.type) && (val === '' || val === null || val === undefined)) {
          updateData[meta.name] = null;
        } else if (meta.type === 'Int' && val !== null && val !== undefined && val !== '') {
          updateData[meta.name] = parseInt(val, 10);
        } else {
          updateData[meta.name] = val;
        }
      }

      // 紀錄修改的工程師資訊
      if (engineerName && fieldMap['engineerName']) updateData.engineerName = engineerName;
      if (engineerId && fieldMap['engineerId']) updateData.engineerId = engineerId;

      preparedItems.push({
        id: Number(item.id),
        selectWork: item.selectWork || type,
        updateData
      });
    }

    if (preparedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "沒有有效的資料需要更新"
      });
    }

    // 執行互動式事務更新 (Interactive Transaction)，保證更新資料與寫入 log 同生共死
    const results = await mes.$transaction(async (tx) => {
      // 1. 先從資料庫撈取現有資料進行比對
      const targetIds = preparedItems.map((p) => p.id);
      const existingRows = await tx[clientModel].findMany({
        where: {
          id: { in: targetIds }
        }
      });
      const existingMap = new Map(existingRows.map((r) => [r.id, r]));

      const updatedRows = [];
      const logItems = [];

      for (const row of preparedItems) {
        const existing = existingMap.get(row.id);
        if (!existing) continue;

        // 比對實質變動的欄位
        const diff = {};
        for (const [field, newVal] of Object.entries(row.updateData)) {
          // 略過簽名欄位比對
          if (['engineerName', 'engineerId'].includes(field)) continue;

          const meta = fieldMap[field];
          const oldVal = existing[field];

          if (isFieldChanged(oldVal, newVal, meta?.type)) {
            const oldStr = oldVal !== null && oldVal !== undefined && typeof oldVal === 'object' && 'toString' in oldVal
              ? oldVal.toString()
              : (oldVal ?? '空');
            const newStr = newVal !== null && newVal !== undefined ? String(newVal) : '空';
            diff[field] = { old: oldStr, new: newStr };
          }
        }

        // 若無任何欄位有實質變更，跳過此筆更新與日誌
        if (Object.keys(diff).length === 0) continue;

        // 執行該筆資料更新
        const updated = await tx[clientModel].update({
          where: {
            id: row.id
          },
          data: row.updateData
        });
        updatedRows.push(updated);

        // 取得該筆批號
        const lotNumber = existing.lotNumber || existing.lotNumber_L || existing.lotNumber_R || row.lotNumber || String(row.id);

        // 產生欄位變更明細 (例如: "rollingSpeed: 10 ➔ 15; remark: 空 ➔ 測試")
        const diffText = Object.entries(diff)
          .map(([k, v]) => `${k}: ${v.old} ➔ ${v.new}`)
          .join('; ');
        const innerData = diffText.length > 255 ? diffText.slice(0, 251) + '...' : diffText;

        logItems.push({
          id: row.id,
          lotNumber,
          selectWork: row.selectWork,
          innerData
        });
      }

      // 2. 僅對有實質變更的資料寫入日誌 (log_transfer_record)
      if (logItems.length > 0) {
        await setLog(tx, {
          type,
          engineerId,
          engineerName,
          items: logItems
        });
      }

      return updatedRows;
    });

    if (results.length === 0) {
      return res.status(200).json({
        success: true,
        message: "資料比對後無任何變更，已略過更新",
        updatedCount: 0,
        data: []
      });
    }

    return res.status(200).json({
      success: true,
      message: `成功更新 ${results.length} 筆資料並完成異動紀錄`,
      updatedCount: results.length,
      data: results
    });
  } catch (error) {
    console.error("操作失敗:", error);
    return res.status(500).json({
      success: false,
      message: "操作失敗",
      detail: error.message,
    });
  }
});

router.setLog = setLog;
module.exports = router;
