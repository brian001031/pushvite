const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs");
const moment = require("moment");
const schedule = require("node-schedule");
const xlsx = require("xlsx");
const path = require("path");

// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫
const dbcon = require(__dirname + "/../modules/mysql_connect.js");     // hr 資料庫
const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();


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
schedule.scheduleJob("30 08 * * *", async () => {
  console.log("開始執行早上8:30產能通知...");

  const currentIP = getServerIP();
  const allowedIP = '192.168.3.207';
    
    if (currentIP !== allowedIP) {
        console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
        return;
    }
  try {
    await sendDiscordNotification();
  } catch (error) {
    console.error("早上產能通知發送失敗:", error);
  }
});

// 晚上 8:30 產能通知  
schedule.scheduleJob("30 20 * * *", async () => {
  console.log("開始執行晚上8:30產能通知...");

  const currentIP = getServerIP();
  const allowedIP = '192.168.3.207';
    
    if (currentIP !== allowedIP) {
        console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
        return;
    }
  try {
    await sendDiscordNotification();
  } catch (error) {
    console.error("晚上產能通知發送失敗:", error);
  }
});

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

      console.log ("輾壓產能通知API成功發送");
    

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
    'rollingThickness_EG_S' : 'rollingThickness_EG_S(SV)',
    'rollingThickness_EG_E': 'rollingThickness_EG_E(SV)',
    'rollingDensity_EG_S': 'rollingDensity_EG_S(SV)',
    'rollingDensity_EG_E': 'rollingDensity_EG_E(SV)',
    'averageThickness': 'averageThickness(PV)',
    'rollingDensity': 'rollingDensity(PV)',
    'slittingWidth_R' : 'slittingWidth_R(mm)',
    'slittingWidth_L' : 'slittingWidth_L(mm)',
    'yield_R' : 'Utilization_R(PV)(%)',
    'yield_L' : 'Utilization_L(PV)(%)',
    'widthToMeter' : 'widthToMeter(PV)',
    'slittingWidth_S' : 'slittingWidth_S(PV)(mm)',
    'slittingWidth_E' : 'slittingWidth_E(PV)(mm)',
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



router.post("/postRolling", async(req, res) => {
  const body = req.body;
  let tableNameForCoater = "";

  // 檢查必要欄位
  if (!body.machineNo) {
    return res.status(400).json({
      error: "缺少必要欄位：machineNo (唯一鍵)"
    });
  }

  console.log("Received body:", body);

  const selectWork = body.selectWork;

  try {
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
        return res.status(400).json({ error: "無效的工作類型" });
    }

    console.log ("選擇工作類型 :", selectWork)
    const keys = RollingRecordKeyNeed;

    // 建立 UPSERT SQL
    const sql = `INSERT INTO ${tableName} (${keys.join(", ")})
      VALUES (${keys.map(() => "?").join(", ")})
      ON DUPLICATE KEY UPDATE
      ${keys.filter(key => key !== "id").map(key => `${key} = VALUES(${key})`).join(", ")}`;
    
    const values = extractRollingValues(body, keys);
    
    // console.log("執行的 SQL:", sql);
    // console.log("SQL 參數:", values);
    
    // 執行 UPSERT
    const [result] = await dbmes.query(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "沒有資料被更新或插入，請檢查提供的數據是否正確。",
      });
    }


    // 反向紀錄資料到coater 說此筆已經有被rolling 接收並送出了 讓他不要再送來
    if (tableNameForCoater  && selectWork === 'rollingCathode') {
      try{
      const sql_coater = `Update ${tableNameForCoater} SET is_received = 1 WHERE lotNumber = ?`;
      const values_coater = [body.lotNumber];
      await dbmes.query(sql_coater, values_coater);

      console.log("反向紀錄資料- 確認 tableNameForCoater :", tableNameForCoater , " | " , " lotNumber: " , body.lotNumber );

      }catch(err){
        console.error("反向紀錄資料到coater 發生錯誤：", err);

        res.status(500).json({
          error: "反向紀錄資料到coater 發生錯誤",
          detail: err.message
        });
        throw err;
      }
    }
    else if (tableNameForCoater && selectWork === 'rollingAnode') {
      try{
      const sql_coater = `Update ${tableNameForCoater} SET is_received = 2 WHERE lotNumber = ?`;
      const values_coater = [body.lotNumber];
      await dbmes.query(sql_coater, values_coater);

      console.log("反向紀錄資料- 確認 tableNameForCoater :", tableNameForCoater , " | " , " lotNumber: " , body.lotNumber );

      }catch(err){
        console.error("反向紀錄資料到coater 發生錯誤：", err);

        res.status(500).json({
          error: "反向紀錄資料到coater 發生錯誤",
          detail: err.message
        });
        throw err;
      }
    }

    res.status(200).json({
      message: `滾輪記錄 UPSERT 成功，影響筆數: ${result.affectedRows}`,
      insertId: result.insertId,
      affectedRows: result.affectedRows,
      id_Card: body.id_Card
    });
  } catch (error) {
    console.error("滾輪記錄 UPSERT 發生錯誤：", error);
    res.status(500).json({
      error: "滾輪記錄 UPSERT 發生異常",
      detail: error.message,
      sql: error.sql
    });
  }
});

router.post("/postSlittings", async(req, res) => {
  const body = req.body;
  console.log("Received body:", body); 

  // 檢查必要欄位
  if (!body.machineNo) {
    return res.status(400).json({
      error: "缺少必要欄位：machineNo (唯一鍵)"
    });
  }

  const selectWork = body.selectWork;

  try {
    let tableNameForCoater = "";
    let tableNameForAnode = "";
    switch (selectWork) {
      case "slittingCathode":
        tableName = "slittingcathode_batch";
        tableNameForCoater = "coatingcathode_batch";
        break;
      case "slittingAnode":
        tableName = "slittinganode_batch";
        tableNameForAnode = "coatinganode_batch";
        break;
      default:
        return res.status(400).json({ error: "無效的工作類型" });
    }

    console.log ("選擇工作類型 :", selectWork)
    const keys = slittingRecordKeyNeed;

// 建立 UPSERT SQL
    const sql = `INSERT INTO ${tableName} (${keys.join(", ")})
      VALUES (${keys.map(() => "?").join(", ")})
      ON DUPLICATE KEY UPDATE
      ${keys.filter(key => key !== "id").map(key => `${key} = VALUES(${key})`).join(", ")}`;
    
    const values = extractRollingValues(body, keys);

    // 執行 UPSERT
    const [result] = await dbmes.query(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "沒有資料被更新或插入，請檢查提供的數據是否正確。",
      });
    }



    // 更新coater 的 is_received 狀況為2 
    if (tableNameForCoater && selectWork === "slittingCathode"){
      try{
      const sql_coater_update = `Update coatingcathode_batch SET is_received = 2 WHERE lotNumber = ?`;
      const lotNo = body.lotNumber_R ? body.lotNumber_R : body.lotNumber_L;
      const lotNo_Clean = lotNo.replace(/-(L|R)$/, "");

      await dbmes.query(sql_coater_update, [lotNo_Clean]);

      console.log("selectWork === \"slittingCathode\" 更新coater is_received 狀況為2 - 確認 tableNameForCoater :", tableNameForCoater , " | " , " lotNumber: " , lotNo_Clean );
      } catch(error){
        console.log("更新coater is_received 狀況為2 發生錯誤：", error);

        res.status(500).json({
          error: "更新coater is_received 狀況為2 發生錯誤",
          detail: error.message
        });
        throw error;
      }
    }
    else if (tableNameForAnode && selectWork === 'slittingAnode') {
      try {
        const sql_coater = `Update ${tableNameForAnode} SET is_received = 1 WHERE lotNumber = ?`;
        const lotNUmber_Clean_CatchKey = body.lotNumber_R ? body.lotNumber_R : body.lotNumber_L;
        const lotNUmber_Final = lotNUmber_Clean_CatchKey.replace(/-(L|R)$/, "");

        await dbmes.query(sql_coater, lotNUmber_Final);

        console.log("tableNameForCoater && selectWork === 'slittingAnode' 反向紀錄資料- 確認 tableNameForAnode :", tableNameForAnode , " | " , " lotNumber: " , lotNUmber_Final );

      }catch(err){
        console.error("反向紀錄資料到coater 發生錯誤：", err);
        res.status(500).json({
          error: "反向紀錄資料到coater 發生錯誤",
          detail: err.message
        });
        throw err;
      }
    }

    res.status(200).json({
      message: `Slitting UPSERT 成功，影響筆數: ${result.affectedRows}`,
      insertId: result.insertId,
      affectedRows: result.affectedRows,
      id_Card: body.id_Card
    });

  } catch (error) {
    console.error("UPSERT 發生錯誤：", error);
    res.status(500).json({
      error: "Slitting UPSERT 發生異常",
      detail: error.message,
      sql: error.sql
    });
  }
});


router.post("/updateEngineerSet", async (req, res) => {
  const data = req.body;
  try {
    const results = {
      success: [],
      errors: []
    };

    for (const selectWork of Object.keys(data)) {
      if (!Array.isArray(data[selectWork]) || data[selectWork].length === 0) {
        continue;
      }

      const isRolling = selectWork.includes('rolling');
      
      const [existingCards] = await dbcon.query(
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
            params = [ selectWork, item.machineNo, item.rollingThickness_EG_S || null, item.rollingThickness_EG_E || null, item.rollingDensity_EG_S || null, item.rollingDensity_EG_E || null, item.announceCapacity || null, item.remark || null, item.engineerName, item.engineerId, cardPosition, item.widthToMeter || null, item.slittingWidth_S || null, item.slittingWidth_E || null ];
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
            params = [ selectWork, item.machineNo, item.announceCapacity || null, item.remark || null, item.engineerName, item.engineerId, cardPosition , item.widthToMeter || null, item.slittingWidth_S || null, item.slittingWidth_E || null ];
          }
          
          const [result] = await dbcon.query(sql, params);
          results.success.push({ type: selectWork, machineNo: item.machineNo, cardPosition: cardPosition, affectedRows: result.affectedRows  });
        }
        
        const [allCards] = await dbcon.query(
          "SELECT id FROM hr.rollingNslitting_register WHERE selectWork = ? AND engineerId = ? AND is_deleted = 0 ORDER BY cardPosition",
          [selectWork, engineerId]
        );
        
        for (let i = 0; i < allCards.length; i++) {
          await dbcon.query(
            "UPDATE hr.rollingNslitting_register SET cardPosition = ? WHERE id = ?",
            [i, allCards[i].id]
          );
        }
      }
    }
    res.status(200).json({ success: true, message: "工程師設定批量更新完成，卡片位置已自動排序", results });
  } catch (error) {
    console.error("工程師設定更新失敗:", error);
    res.status(500).json({ success: false, error: "工程師設定更新失敗", detail: error.message });
  }
});


// 逐筆查詢
router.get("/getEngineerSettings", async (req, res) => {
  try {
    const { selectWork, engineerId } = req.query;
    console.log("selectWork  : " , selectWork , " | " , "  engineerId:  " , engineerId);

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
  try {
    // 支援 query 參數和 body 參數
    const params = req.method === 'DELETE' ? req.query : req.body;
    const { selectWork, machineNo, engineerId } = params;
    
    if (!machineNo || !selectWork || !engineerId) {
      return res.status(400).json({
        success: false,
        error: "缺少必要參數: 需要提供 machineNo, selectWork 和 engineerId"
      });
    }
    
    // 開始事務處理，確保標記為刪除和重新排序在同一個事務中完成
    connection = await dbcon.getConnection();
    await connection.beginTransaction();
    
    try {
      // 獲取當前時間
      const deletedAt = moment().format("YYYY-MM-DD HH:mm:ss");
      
      // 標記記錄為已刪除
      const [markResult] = await connection.query(
        "UPDATE hr.rollingNslitting_register SET is_deleted = 1, deleted_at = ?, delete_operation = 'user_delete' WHERE machineNo = ? AND selectWork = ? AND engineerId = ?",
        [deletedAt, machineNo, selectWork, engineerId]
      );
      
      if (markResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "標記為刪除失敗，未找到符合條件的工程師設定"
        });
      }
      
      // 查詢剩餘的記錄並按 cardPosition 排序
      const [remainingCards] = await connection.query(
        "SELECT id FROM hr.rollingNslitting_register WHERE selectWork = ? AND engineerId = ? AND is_deleted = 0 ORDER BY cardPosition",
        [selectWork, engineerId]
      );
      
      // 更新剩餘卡片的 cardPosition，從0開始
      for (let i = 0; i < remainingCards.length; i++) {
        await connection.query(
          "UPDATE hr.rollingNslitting_register SET cardPosition = ? WHERE id = ?",
          [i, remainingCards[i].id]
        );
      }
      
      // 提交事務
      await connection.commit();
      
      res.status(200).json({
        success: true,
        message: "工程師設定已刪除且卡片位置已重新排序",
        affectedRows: markResult.affectedRows,
        reorderedCards: remainingCards.length
      });
    } catch (error) {
      // 如果出現錯誤，回滾事務
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error("工程師設定刪除失敗:", error);
    res.status(500).json({
      success: false,
      error: "工程師設定刪除失敗",
      detail: error.message
    });
  } finally {
    // 釋放連接
    if(connection) connection.release();
  }
});

// 逐筆查詢
router.get("/getSearchPage", async (req, res) => {
  const {
    option ,
    searchTerm,
    startDate,
    endDay,
    page,
    pageSize
  } = req.query

    let tableName = ""
    let keys = [];
    

    console.log("option:  ", decodeURIComponent(option))
    switch (decodeURIComponent(option)){
      case "all" : 
        tableName = [
          'rollingcathode_batch', 
          'rollinganode_batch' , 
          'slittingcathode_batch', 
          'slittinganode_batch'];
        keys = [RollingRecordKeyNeed , slittingRecordKeyNeed]
      break;

      case "正極輾壓" : 
        tableName = ['rollingcathode_batch'];
        keys = [RollingRecordKeyNeed];
      break;

      case "負極輾壓" : 
        tableName = ['rollinganode_batch'];
        keys = [RollingRecordKeyNeed];
      break;

      case "正極分切" : 
        tableName = ['slittingcathode_batch'];
        keys = [slittingRecordKeyNeed];
      break;

      case "負極分切" : 
        tableName = ['slittinganode_batch'];
        keys = [slittingRecordKeyNeed];
      break;

      case "error" :
        tableName = [
          'rollingcathode_batch', 
          'rollinganode_batch' , 
          'slittingcathode_batch', 
          'slittinganode_batch'
        ];
        keys = [RollingRecordKeyNeed , slittingRecordKeyNeed]
      break;

      default : 
        return res.status(400).json({ error: "無效的 option 參數" });
    }

    if (!tableName.length || !keys.length) {
      return res.status(400).json({ error: "查詢參數錯誤" });
    }

  try{
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

    let where = "WHERE employee_InputTime BETWEEN ? AND ?";
    if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
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

  for (let t of tables) {

    // --- 共同日期 ---
    params.push(startDate, endDay);

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
    } else { // rolling 表格
      // 輾壓只需要 1 個 lotNumber
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

  // params 要有 4 組日期 + 4 組 searchTerm
  params.length = 0;
  const tables = [
    "rollingcathode",
    "rollinganode",
    "slittingcathode",
    "slittinganode"
  ];

  for (let t of tables) {

    // --- 共同日期 ---
    params.push(startDate, endDay);

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

        sql = `SELECT ${keys[0].map(k => `t1.${k}`).join(", ")} , t1.stock 
        FROM ${tableName[0]} t1
        INNER JOIN (
          SELECT lotNumber_R, MAX(id) AS max_id
          FROM ${tableName[0]}
          WHERE employee_InputTime BETWEEN ? AND ?
            AND (delete_operation NOT IN ('user_delete_both') OR delete_operation IS NULL)
            AND lotNumber_R IS NOT NULL
            AND lotNumber_R != ''
            AND workTime IS NOT NULL
          GROUP BY lotNumber_R
        ) t2 ON t1.lotNumber_R = t2.lotNumber_R AND t1.id = t2.max_id`;

        sqlCount = `SELECT COUNT(*) AS totalCount 
        FROM ${tableName[0]} t1
        INNER JOIN (
          SELECT lotNumber_R, MAX(id) AS max_id
          FROM ${tableName[0]}
          WHERE employee_InputTime BETWEEN ? AND ?
            AND (delete_operation NOT IN ('user_delete_both') OR delete_operation IS NULL)
            AND lotNumber_R IS NOT NULL
            AND lotNumber_R != ''
            AND workTime IS NOT NULL
          GROUP BY lotNumber_R
        ) t2 ON t1.lotNumber_R = t2.lotNumber_R AND t1.id = t2.max_id`;
         
        break;


      case "正極輾壓":
      case "負極輾壓":
        sql = `SELECT ${keys[0].join(", ")} FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND (is_deleted IS NULL OR is_deleted = 0) `;
        sqlCount = `SELECT COUNT(*) AS totalCount FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND (is_deleted IS NULL OR is_deleted = 0) `;
        break;
      default:
        sql = `SELECT ${keys[0].join(", ")} FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND (is_deleted IS NULL OR is_deleted = 0) `;
        sqlCount = `SELECT COUNT(*) AS totalCount FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND (is_deleted IS NULL OR is_deleted = 0) `;
    }
    
    console.log("Base SQL:", sql); 
    console.log("Count SQL:", sqlCount);


    if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
      if ( searchTerm.length <= 5 ) {
        sql += ` AND memberNumber LIKE ? `;
        sqlCount += ` AND memberNumber LIKE ? `;
      }
      else if (searchTerm.length > 5) {   
        sql += ` AND lotNumber LIKE ? `;
        sqlCount += ` AND lotNumber LIKE ? `;
      }
    }
    sql += ` ORDER BY employee_InputTime DESC LIMIT ${offset}, ${pageSizeNum}`;
    // params 要有 1 組日期 + 1 組 searchTerm
    params.length = 0;
    params.push(startDate, endDay);
    if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
      if ( searchTerm.length <= 5 ) {
        params.push(`%${searchTerm}%`);
      }
      else if (searchTerm.length > 5) {
        params.push(`%${searchTerm}%`);
      }
    }
  }


    const [rows] = await dbmes.query(sql, params);
    const [countResult] = await dbmes.query(sqlCount, params);
    const totalRecords = countResult[0]?.totalCount;

    console.log ("totalRecords : " , totalRecords);
    const totalPages = Math.ceil(totalRecords / pageSizeNum);
    console.log ("totalPages : " , String(totalPages));
    
    for (let row of rows){
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
    console.log("SQL 參數:", params);
    console.log("總記錄數:", totalRecords, "總頁數:", totalPages);

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
    
  }catch(error){
    console.error("查詢頁面加載失敗:", error);
    return res.status(500).json({
      error: "查詢頁面加載失敗",
      detail: error.message
    });
  }
});


// 於查詢頁面假意刪除資料
router.put('/deleteData', async (req, res) => {
  const {selectedRows} = req.body
  console.log("selectedRows: " , selectedRows);

  let connection;
  try {
    connection = await dbmes.getConnection();
    await connection.beginTransaction();

    const results = [];
    const deletedAt = moment().format("YYYY-MM-DD HH:mm:ss");

    // 將相同表的操作分組，減少循環次數
    const groupedOperations = {};
    
    for (const row of selectedRows) {
      // 檢查並映射 selectWork 欄位，處理不同的命名
      let selectWork = row.selectWork;
      let side = row.side || 'full';


      if (row.hasOwnProperty('lotNumber_R')) {
        side = 'R';
      } else if (row.hasOwnProperty('lotNumber_L')) {
        side = 'L';
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
          if (operation.side === 'R') {
            sql = `UPDATE ${tableName} SET 
                     lotNumber_R = NULL, Length_R = NULL, LostLength_R = NULL, incomeLength_R = NULL, yield_R = NULL, errorStatus_R = NULL, slittingSpeed_R = NULL, lostWeight_R = NULL,
                     is_deleted = CASE WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 1 ELSE 0 END,
                     deleted_at = ?, delete_operation = CASE WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 'user_delete_both' ELSE 'user_delete_R' END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else if (operation.side === 'L') {
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
          if (operation.side === 'R') {
            sql = `UPDATE ${tableName} SET 
                     lotNumber_R = NULL, Length_R = NULL, LostLength_R = NULL, incomeLength_R = NULL, yield_R = NULL, errorStatus_R = NULL, slittingSpeed_R = NULL, lostWeight_R = NULL,
                     is_deleted = CASE WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 1 ELSE 0 END,
                     deleted_at = ?, delete_operation = CASE WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 'user_delete_both' ELSE 'user_delete_R' END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else if (operation.side === 'L') {
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
      message: `批量刪除成功，共處理 ${selectedRows.length} 筆資料`,
      data: results,
      totalProcessed: selectedRows.length
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("批量刪除失敗:", error);
    res.status(500).json({
      success: false,
      error: "批量刪除失敗",
      detail: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

router.get("/downloadData" , async (req, res) => {
  const {
    option ,
    searchTerm,
    startDate,
    endDay
  } = req.query

  console.log("Download 接收到的参数:", { option, searchTerm, startDate, endDay });

  let tableName = ""
    let sql = "";
    let keys = [];
    
    switch (option){
      case "all" : 
        tableName = ['rollingcathode_batch', 'rollinganode_batch' , 'slittingcathode_batch', 'slittinganode_batch'];
        keys = [RollingRecordKeyNeed , slittingRecordKeyNeed]
      break;

      case "正極輾壓" : 
        tableName = ['rollingcathode_batch'];
        keys = [RollingRecordKeyNeed];
      break;

      case "負極輾壓" : 
        tableName = ['rollinganode_batch'];
        keys = [RollingRecordKeyNeed];
      break;

      case "正極分切" : 
        tableName = ['slittingcathode_batch'];
        keys = [slittingRecordKeyNeed];
      break;

      case "負極分切" : 
        tableName = ['slittinganode_batch'];
        keys = [slittingRecordKeyNeed];
      break;

      case "error" :
        tableName = ['rollingcathode_batch', 'rollinganode_batch' , 'slittingcathode_batch', 'slittinganode_batch'];
        keys = [RollingRecordKeyNeed , slittingRecordKeyNeed]
      break;

      default : 
        return res.status(400).json({ error: "無效的 option 參數" });
    }

    if (!tableName.length || !keys.length) {
      return res.status(400).json({ error: "查詢參數錯誤" });
    }
  

  try{
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


  const unionKeys = Array.from(new Set([...RollingRecordKeyNeed, ...slittingRecordKeyNeed ]));

  // 產生 SELECT 欄位字串
  function buildSelect(keys, table, workType) {
  // 每個欄位如果存在於該表 keys 就用本身，否則補 NULL
    const cols = unionKeys.map(k => 
      keys.includes(k) ? `${table}.${k}` : `NULL AS ${k}`
    ).join(", ");

    let where = "WHERE employee_InputTime BETWEEN ? AND ?";
    if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
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


    if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
      if ( searchTerm.length <= 5 ) {
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
    if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
      if ( searchTerm.length <= 5 ) {
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

    if (String(option) === "正極分切" || String(option) === "負極分切"){
      for (let SortRow of sortRows){
        for (let egSetting of rowsOf_egSetting){
          if (SortRow.machineNo === egSetting.machineNo ){
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

    console.log("Final SortRow  :" , Array.isArray(sortRows) && sortRows.map ? sortRows.map(item => ({ ...item })) : sortRows);
    const finalData = changeKeyWords(sortRows, outputKeys);

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(finalData);
    xlsx.utils.book_append_sheet(workbook, worksheet, `${option}`);

    const excelBuffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(excelBuffer);

    return;

  }catch(error){
    console.log ("Download file failed : " , error.message)
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
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "缺少必要參數: id"
      });
    }
    
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
        message: "該表不支持軟刪除功能，無法恢復記錄"
      });
    }
    
    // 開始事務處理
    connection = await dbcon.getConnection();
    await connection.beginTransaction();
    
    try {
      // 查詢要恢復的記錄的 selectWork 和 engineerId
      const [record] = await connection.query(
        "SELECT selectWork, engineerId, cardPosition FROM hr.rollingNslitting_register WHERE id = ?",
        [id]
      );
      
      if (record.length === 0) {
        return res.status(404).json({
          success: false,
          message: "未找到指定 ID 的工程師設定"
        });
      }
      
      const targetSelectWork = record[0].selectWork;
      const targetEngineerId = record[0].engineerId;
      
      // 將記錄標記為未刪除
      const [restoreResult] = await connection.query(
        "UPDATE hr.rollingNslitting_register SET is_deleted = 0, deleted_at = NULL, delete_operation = NULL WHERE id = ?",
        [id]
      );
      
      if (restoreResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "恢復失敗，未找到符合條件的工程師設定"
        });
      }
      
      // 查詢所有未被刪除的記錄並按 cardPosition 排序
      const [activeCards] = await connection.query(
        "SELECT id, cardPosition FROM hr.rollingNslitting_register WHERE selectWork = ? AND engineerId = ? AND is_deleted = 0 ORDER BY cardPosition",
        [targetSelectWork, targetEngineerId]
      );
      
      // 更新所有卡片的 cardPosition
      for (let i = 0; i < activeCards.length; i++) {
        try {
          await connection.query(
            "UPDATE hr.rollingNslitting_register SET cardPosition = ? WHERE id = ?",
            [i, activeCards[i].id]
          );
        } catch (error) {
          console.error(`恢復時更新卡片位置失敗 (ID: ${activeCards[i].id}):`, error);
          // 繼續處理下一張卡片，不中斷整個過程
          continue;
        }
      }
      
      // 提交事務
      await connection.commit();
      
      res.status(200).json({
        success: true,
        message: "工程師設定已恢復且卡片位置已重新排序",
        affectedRows: restoreResult.affectedRows,
        reorderedCards: activeCards.length
      });
    } catch (error) {
      // 如果出現錯誤，回滾事務
      if (connection) await connection.rollback();
      throw error;
    } finally {
      // 釋放連接
      connection.release();
    }
  } catch (error) {
    console.error("工程師設定恢復失敗:", error);
    res.status(500).json({
      success: false,
      error: "工程師設定恢復失敗",
      detail: error.message
    });
  }
});


router.get("/nowReport" , async (req, res) =>{
  const { 
    engineerId, 
    startTime, 
    endTime, 
    dayShift, 
    page = 1, 
    pageSize = 20
  } = req.query;

  let shift = req.query.dayShift;
  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;
  const currentPage = parseInt(page, 10);

  console.log("接收到的前端參數:", {
    engineerId,
    startTime,
    endTime,
    shift,
  });
  let timeRanges = [];

  // 情況2: 有送日期+班別
  if (startTime && shift) {
    const startDate = moment(startTime).startOf('day');
    const endDate = moment(endTime).startOf('day');

    let currentDate = startDate.clone();
    while (currentDate.isSameOrBefore(endDate)) {
    if (shift === "早班") {
        // 早班：當天 08:00 到 當天 20:00
        timeRanges.push({
          start: currentDate.format("YYYY-MM-DD 08:00:00"),
          end: currentDate.format("YYYY-MM-DD 20:00:00")
        });
      } else if (shift === "晚班") {
        // 晚班：前一天 20:00 到 當天 08:00
        // 使用 .clone().subtract(1, 'day') 取得前一天
        timeRanges.push({
          start: currentDate.clone().subtract(1, 'day').format("YYYY-MM-DD 20:00:00"),
          end: currentDate.format("YYYY-MM-DD 08:00:00")
        });
      }
      currentDate.add(1, 'day');
    }
  }


  // 情況1: 完全沒送資料 (用預設)
  else {
    const now = moment();
    const currentHour = now.hour();
    if (currentHour >= 8 && currentHour < 20){
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

  const nowDate_S = timeRanges.length > 0 ? timeRanges[0].start : "";
  const nowDate_E = timeRanges.length > 0 ? timeRanges[timeRanges.length - 1].end : "";
  const table_rolling = [
    'rollingcathode_batch', 
    'rollinganode_batch', 
    'slittingcathode_batch', 
    'slittinganode_batch'
  ];
  const sql_Find_machineNo = `SELECT DISTINCT machineNo, selectWork 
  FROM hr.rollingnslitting_register WHERE engineerId = 264 AND is_deleted = 0`;

  try{
    const [machineNoResult] = await dbcon.query(sql_Find_machineNo);
    console.log("machineNoResult:", machineNoResult);

    const machineGroups = {
      rollingCathode: [],
      rollingAnode: [],
      slittingCathode: [],
      slittingAnode: []
    };

    for (let machine of machineNoResult) {
        if (!machine || !machine.selectWork) continue;
        const machineNoToAdd = machine.machineNo;

        switch(machine.selectWork) {
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

    const [ 
      rollingCathodeResult, 
      rollingAnodeResult, 
      slittingCathodeResult, 
      slittingAnodeResult
    ] = await Promise.all([


      createRollingQuery(machineGroups.rollingCathode, table_rolling[0], timeRanges),
      createRollingQuery(machineGroups.rollingAnode, table_rolling[1], timeRanges),
      createSlittingQuery(machineGroups.slittingCathode, table_rolling[2], timeRanges),
      createSlittingQuery(machineGroups.slittingAnode, table_rolling[3], timeRanges)
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
          const compositeKey = `${row.machineNo}-${row.memberName}`;
          const rollingLength = parseFloat(row.rollingLength) || 0;
          const lostWeight = parseFloat(row.rolling_LostWeight) || 0;
          const workTime = parseFloat(row.workTime) || 0;
          const Factor = type === 'rollingCathode' ? 0.216 : 0.034;
          const lostLength = lostWeight / Factor;
          const yieldVal = rollingLength > 0 ? ((rollingLength - lostLength) / rollingLength) * 100 : 0;
          const averageRate = workTime > 0 ? (rollingLength / workTime) : 0;

          machines[compositeKey] = {
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
          const compositeKey = `${latestRow.machineNo}-${latestRow.memberName}`;
          if (machines[compositeKey]) {
            Object.assign(machines[compositeKey], {
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
          const compositeKey = `${row.machineNo}-${row.memberName}`;
          const rollingLength = (parseFloat(row.Length_R) || 0) + (parseFloat(row.Length_L) || 0);
          const lostWeight = (parseFloat(row.LostWeight_R) || 0) + (parseFloat(row.LostWeight_L) || 0);
          const Factor = type === 'slittingCathode' ? 0.108 : 0.067;
          const lostLength = lostWeight / Factor;
          const yieldVal = rollingLength > 0 ? ((rollingLength - lostLength) / rollingLength) * 100 : 0;
          const averageRate = row.workTime > 0 ? (rollingLength / row.workTime) : 0;

          machines[compositeKey] = {
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

      if (results[1] && results[1][0] && results[1][0].length > 0){
        results[1][0].forEach(latestRow => {
          const compositeKey = `${latestRow.machineNo}-${latestRow.memberName}`;
          if (machines[compositeKey]) {
            Object.assign(machines[compositeKey], {
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
router.get("/findStock" ,  async(req, res) =>{
  const {
    selectWork,
    page = 1,
    pageSize = 10
  } = req.query || {};

  // console.log("selectWork :", selectWork , "page :", page , "pageSize :", pageSize);
  const engineerId =  "264";
  const pageNum = parseInt(page, 10);
  const pageSizeNum = parseInt(pageSize, 10);

  let sql = "";
  let sqlCount = "";

  if (selectWork === "rollingAnode"){
    sql = `SELECT 
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
            LIMIT ? OFFSET ?
            `;

    sqlCount = `SELECT COUNT(*) AS totalCount FROM mes.rollinganode_batch
                WHERE (is_deleted IS NULL OR is_deleted = 0) 
                  AND (stock IS NULL OR stock = 0) 
                  AND rollingLength IS NOT NULL
                  AND engineerId = ?`;
  } 
  else if (selectWork === "slittingCathode"){
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
           LIMIT ? OFFSET ?`;
           
    sqlCount = `SELECT COUNT(*) AS totalCount FROM (
                  SELECT id FROM mes.slittingcathode_batch
                  WHERE (is_deleted IS NULL OR is_deleted = 0)
                    AND (stock IS NULL OR stock = 0)
                    AND Length_R IS NOT NULL
                    AND engineerId = ?
                    AND lotNumber_R IS NOT NULL AND lotNumber_R <> ''
                    AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_R', 'user_delete_both'))
                  UNION ALL
                  SELECT id FROM mes.slittingcathode_batch
                  WHERE (is_deleted IS NULL OR is_deleted = 0)
                    AND (stock_L IS NULL OR stock_L = 0)
                    AND Length_L IS NOT NULL
                    AND engineerId = ?
                    AND lotNumber_L IS NOT NULL AND lotNumber_L <> ''
                    AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_L', 'user_delete_both'))
                ) AS cnt`;
  } else {
    return res.status(400).json({
      success: false,
      error: "無效的 selectWork 參數"
    });
  }

  try{
    let queryParams = [];
    let countParams = [];
    if (selectWork === "slittingCathode") {
      queryParams = [engineerId, engineerId, pageSizeNum, (pageNum - 1) * pageSizeNum];
      countParams = [engineerId, engineerId];
    } else {
      queryParams = [engineerId, pageSizeNum, (pageNum - 1) * pageSizeNum];
      countParams = [engineerId];
    }

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
    
  }catch (error){
    console.log("查詢失敗:", error.message);
    res.status(500).json({
      success: false,
      error: "查詢失敗",
      detail: error.message
    });
  }
});

router.post("/stockBeSend" , async(req,res) =>{
  console.log("Received request body:", req.body);

  const {
    selectWork ,
    selectAll
  } = req.body || {};

  console.log("selectWork :", selectWork , "selectAll :", Array.isArray(selectAll), "selectAll type:", typeof  Array.isArray(selectAll));

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
  switch (selectWork){
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

  // 針對 slittingCathode 進行特殊處理
  if (selectWork === "slittingCathode") {
    // 分離 R 和 L 的 ID
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

    try {
      // 更新 R 側 (stock = 1)
      if (rIds.length > 0) {
        const rPlaceholders = rIds.map(() => '?').join(',');
        const rSql = `UPDATE ${table} SET stock = 1 WHERE id IN (${rPlaceholders})`;
        console.log("R側 SQL:", rSql, "參數:", rIds);
        
        const [rResult] = await dbmes.query(rSql, rIds);
        affectedRowsTotal += rResult.affectedRows;
        results.push({ side: 'R', affectedRows: rResult.affectedRows });
      }

      // 更新 L 側 (stock_L = 1)
      if (lIds.length > 0) {
        const lPlaceholders = lIds.map(() => '?').join(',');
        const lSql = `UPDATE ${table} SET stock_L = 1 WHERE id IN (${lPlaceholders})`;
        console.log("L側 SQL:", lSql, "參數:", lIds);
        
        const [lResult] = await dbmes.query(lSql, lIds);
        affectedRowsTotal += lResult.affectedRows;
        results.push({ side: 'L', affectedRows: lResult.affectedRows });
      }

      res.status(200).json({
        success: true,
        message: `成功更新 ${affectedRowsTotal} 條紀錄`,
        affectedRows: affectedRowsTotal,
        details: results
      });

    } catch (error) {
      console.error("slittingCathode 更新失败:", error);
      res.status(500).json({
        success: false,
        error: "數據更新失敗",
        detail: error.message
      });
    }
    return; // 結束函數，不執行下面的一般處理邏輯
  }

  // 一般處理邏輯（非 slittingCathode）
  // 生成 SQL 占位符
  const placeholders = selectIds.map(() => '?').join(',');
  const sql = `UPDATE ${table} SET stock = 1 WHERE id IN (${placeholders})`;
  
  console.log("执行的 SQL:", sql);
  console.log("SQL 参数:", selectIds);

  try{
    const [result] = await dbmes.query(sql, selectIds);
    console.log("更新结果:", result);
    
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

  }catch(error){
    console.error("更新失败:", error);
    res.status(500).json({
      success: false,
      error: "更新失败",
      detail: error.message,
      sql: error.sql
    });
  }
})


// 於 lotNumber處自動抓到資料 ( rollingCathode 跟 SlittingAnode )
router.get("/getCoatingData_RCSA" , async (req , res) =>{
  const {selectWork} = req.query || {};

  let table = "";
  let sql = "";

  if (!selectWork){
    return res.status(400).json({
      success: false,
      error: "缺少 selectWork 參數"
    });
  }

  console.log("selectWork :", selectWork , typeof selectWork);

  switch (selectWork){
    case "rollingCathode":
      sql = `
      SELECT lotNumber 
      FROM coatingcathode_batch 
      where (is_deleted IS NULL OR is_deleted = 0) AND 
      stock = 1 AND 
      is_received NOT IN (1 , 2) 
      ORDER BY id DESC LIMIT 100`;
      break;

    case "slittingAnode":
      sql = `
      SELECT lotNumber 
      FROM coatinganode_batch 
      where (is_deleted IS NULL OR is_deleted = 0) AND 
      stock = 1 AND 
      is_received NOT IN (1 , 2) 
      ORDER BY id DESC LIMIT 100`;
      break;
  }
  
  try{

    const [result] = await dbmes.query(sql);
    console.log("獲取到的資料:", result);

    res.status(200).json({
      success: true,
      message: "獲取資料成功",
      data: result
    });

    
  }catch(error){
    console.error("獲取資料失敗:", error);
    res.status(500).json({
      success: false,
      error: "獲取資料失敗",
      detail: error.message
    });
  }
}),

// 於 lotNumber處自動抓到資料 ( slittingCathode 跟 RollingAnode )
router.get("/getCoatingData_SCRA", async (req , res) =>{
  const {selectWork} = req.query || {};

  let table = "";
  let sql = "";

  if (!selectWork){
    return res.status(400).json({
      success: false,
      error: "缺少 selectWork 參數"
    });
  }

  switch (selectWork){
    case "slittingCathode":
      table = "mes.coatingcathode_batch";
      sql = `SELECT lotNumber FROM ${table} where (is_deleted IS NULL OR is_deleted = 0) AND is_received NOT IN (0 , 2) AND stock = 1 ORDER BY id DESC LIMIT 100`;
      break;
    case "rollingAnode":
      table = "mes.coatinganode_batch";
      sql = `SELECT lotNumber FROM ${table} where (is_deleted IS NULL OR is_deleted = 0) AND is_received NOT IN (0, 2) AND stock = 1 ORDER BY id DESC LIMIT 100`;
      break;
  }

  // 檢查 SQL 語句是否成功組裝
  if (!sql) {
      return res.status(500).json({
        success: false,
        error: "內部錯誤: SQL 語句未組裝"
      });
  }

  try{
    const [result] = await dbmes.query(sql);
    console.log("獲取到的資料:", result);

    res.status(200).json({
      success: true,
      message: "獲取資料成功",
      data: result
    });
    
  }catch(error){
    console.error("獲取資料失敗:", error);
    res.status(500).json({
      success: false,
      error: "獲取資料失敗",
      detail: error.message
    });
  }})

  router.put("/stockDelete", async (req , res) => {
  const { selectWork , selectAll , delete_by} = req.body || {};

  if (!selectWork || !selectAll){
    return res.status(400).json({
      success: false,
      error: "缺少必要參數"
    });
  }

  console.log("selectWork :", selectWork , "selectAll :", selectAll , "delete_by:", delete_by);

let sql = '';
let deleteItems = []; // 儲存要刪除的項目
let placeholders = ''; // 最終傳入SQL 的佔位符字串Q
let deleteOp = "";
let Message_First = "";
let Message_Main = "";


if (selectWork === 'slittingCathode' && selectAll) {
  selectAll.split(",").forEach(item => {
    const [num, side , delete_operation] = item.split("-");
    console.log("item:", item);
    console.log("num:", num, "side:", side);
    console.log("delete_operation:", delete_operation);

    if (delete_operation === "user_delete_L" ) {
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
    else if (delete_operation === "user_delete_R" ) {
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
    else if (!delete_operation ||  delete_operation === "" )  {
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
    }else {
      res.status(405).json({
        success: false,
        error: "無效的 delete_operation 參數"
      })
    }
  sql = `UPDATE mes.slittingcathode_batch SET delete_operation = '${deleteOp}', delete_by = '${delete_by}' WHERE id IN (${placeholders.slice(0, -1)})`;

  });

}else if (selectWork === 'rollingAnode'){

  selectAll.split(",").forEach(item => {
  const [num, side , delete_operation] = item.split("-");
  sql = `UPDATE mes.rollinganode_batch SET is_deleted = 1, delete_by = '${delete_by}' WHERE id IN (${selectAll.split(",").map(() => '?').join(',')})`;
  deleteItems = selectAll.split(",");
  Message_First = `
================================================== \n
選擇站別: ${selectWork} \n
機台編號 : ${num}\n
🎉🎉 負極塗佈刪除成功 🎉🎉
================================================== \n
  `
  });
}else {
    return res.status(400).json({
      success: false,
      error: "無效的 selectWork 參數"
    });
}


  const row = await dbmes.query(sql, deleteItems);
  const config_Discord = {
     headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${discord_rollingNSlitting_notify}`,
        },
  }

  await axios.post (discord_rollingNSlitting_notify , {
    content : Message_First ,
  }, config_Discord)

  console.log("刪除結果:", row);
  
  try{
    res.status(200).json({
      success: true,
      message: "刪除成功",
      data: {
        selectWork: selectWork,
        selectAll: selectAll
      }
    });
  }catch(error){
    console.error("刪除失敗:", error);
    res.status(500).json({
      success: false,
      error: "刪除失敗",
      detail: error.message
    });
  }
});

router.post("/sendHandOverRecord" , async (req , res) => {
  const {payload} = req.body || {};

  if (!payload){
    return res.status(400).json({
      success: false,
      error: "缺少 payload 參數"
    });
  }

  console.log("Received payload for handover record:", payload);

  try{
    const prisma = prismaHr;

    const records = payload.records || {};
    const otherData = Array.isArray(records.otherData) ? records.otherData : [];

    if (otherData.length === 0) {
      return res.status(400).json({
        success: false,
        error: "payload.records.otherData 必須是陣列且至少 1 筆"
      });
    }

    const managerName = records.managerName ?? null;
    const managerNumber = records.managerNumber != null ? records.managerNumber : null;
    const shift = records.shift ?? null;
    const headerInnerText = records.innerText ?? null;

    const toDecimal = (value) => {
      if (value === null || value === undefined || value === '') return null;
      return String(value);
    };
    const toInt = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const toDate = (value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    // 使用 Interactive Transaction 確保原子性
    const results = await prisma.$transaction(async (tx) => {
      const txResults = [];

      for (const item of otherData) {
        const itemInnerText = (item && item.innerText != null && String(item.innerText).trim() !== '')
          ? item.innerText
          : headerInnerText;

        const station = item?.station != null ? String(item.station).trim() : null;

        const data = {
          selectWork: item?.selectWork ?? null,
          managerName,
          managerNumber,
          shift,
          station,
          producingMeter: toDecimal(item?.producingMeter),
          lostMeter: toDecimal(item?.lostMeter),
          annuanceCapacity: toDecimal(item?.annuanceCapacity),
          producingMeter_achieveRate: toDecimal(item?.producingMeter_achieveRate),
          errorCarryOnTime: toInt(item?.errorCarryOnTime),
          producingMeter_targetRate: toDecimal(item?.producingMeter_targetRate),
          innerText: itemInnerText,
          is_Delete: false,
          CreateAt: toDate(item?.createAt) || new Date(),
        };

        const itemId = item?.id != null && String(item.id).trim() !== '' ? Number(item.id) : null;

        // 若前端有提供每筆的 id，直接 update
        if (itemId && Number.isFinite(itemId) && itemId > 0) {
          const result = await tx.HandoverRollingnslitting.update({
            where: { id: itemId },
            data: data,
          });
          txResults.push(result);
          continue;
        }

        // 「當天同人同機」更新邏輯
        const canUseSameDayUpsert =
          data.managerName != null &&
          data.managerName !== '' &&
          data.managerNumber != null &&
          data.managerNumber !== '' &&
          data.station != null &&
          data.station !== '';

        if (canUseSameDayUpsert) {
          // 使用 upsert 自動判斷新增或更新
          // 使用 YYYY-MM-DD 格式的字串，避免時區問題
          const createDateStr = moment(data.CreateAt).format('YYYY-MM-DD');
          
          console.log('Upsert with:', {
            managerName: data.managerName,
            managerNumber: data.managerNumber,
            station: data.station,
            createDate: createDateStr,
          });
          
          const result = await tx.handoverRollingnslitting.upsert({
            where: {
              sameDay_Update: {
                managerName: data.managerName,
                managerNumber: data.managerNumber,
                station: data.station,
                createDate: new Date(createDateStr),
              }
            },
            update: data,
            create: data,
          });
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
      data: results,
    });
    
  }catch(error){
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
    const prisma = prismaHr;
    const [total, records] = await Promise.all([
      prisma.HandoverRollingnslitting.count({
        where: {
          CreateAt: {
            gte: new Date(startTime),
            lte: new Date(endTime)
          },
          is_Delete: false
        }
      }),
      prisma.HandoverRollingnslitting.findMany({
        where: {
          CreateAt: {
            gte: new Date(startTime),
            lte: new Date(endTime)
          },
          is_Delete: false
        },
        orderBy: { CreateAt: 'desc' },
        skip: offset,
        take: limit
      })
    ]);

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

module.exports = router;