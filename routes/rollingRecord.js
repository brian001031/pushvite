require("dotenv").config();
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const axios = require("axios");
const mysql = require("mysql2");
const fs = require("fs");
const moment = require("moment");
const schedule = require("node-schedule");
const xlsx = require("xlsx");
const path = require("path");
const e = require("express");
const { Table } = require("mssql");
const { machine, type } = require("os");
const { table } = require("console");
const { default: Page } = require("twilio/lib/base/Page");
const { start } = require("repl");


// 讀取 .env 檔案
const envPath = path.resolve(__dirname, "../.env");
let envContent = fs.readFileSync(envPath, "utf-8");

const dbcon = mysql.createPool({
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "hr",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
});

// 建立 MySQL 連線池
const dbmes = mysql.createPool({
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "mes",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
});


dbcon.once("error", (err) => {
  console.log("Error in connecting to database: ", err);
});

if (!dbcon.__errorListenerAdded) {
  dbcon.on("error", (err) => {
    console.error("Database connection error:", err);
  });
  dbcon.__errorListenerAdded = true; 

  //確認連線狀況是否正常
  dbcon.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting connection:", err);
      return err;
    }
  });
  dbcon.promise();
}


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
  "id",
  "selectWork",
  "lotNumber",
  "machineNo",
  "dayShift",
  "memberName",
  "memberNumber",
  "employee_InputTime",
  "rollingThickness_EG_E",
  "rollingThickness_EG_S",
  "engineerName",
  "engineerId",
  "incomeLength",
  "averageCoatingWidth",
  "comingThickness",
  "startTime",
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
  "rollingLostLength",
  "announceCapacity",
  "remark",
  "rolling_LostWeight",
  "rolling_speed",
  "rolling_gap",
  "linearPressure",
  "rollingTemperature",
  "yield",
  "workTime",
  "errorStatus",
  "memo",
  "is_deleted",
  "deleted_at",
  "delete_operation"

];

const slittingRecordKeyNeed = [
  "id",
  "lotNumber_R",
  "lotNumber_L",
  "selectWork",
  "engineerName",
  "engineerId",
  "machineNo",
  "dayShift",
  "memberName",
  "memberNumber",
  "employee_InputTime",
  "startTime",
  "workTime",
  "remark_Filled",
  "announceCapacity",
  "remark",
  "Length_R",
  "LostLength_R",
  "incomeLength_R",
  "yield_R",
  "errorStatus_R",
  "slittingSpeed_R",
  "lostWeight_R",
  "Length_L",
  "LostLength_L",
  "incomeLength_L",
  "yield_L",
  "errorStatus_L",
  "slittingSpeed_L",
  "lostWeight_L",
  "is_deleted",
  "deleted_at",
  "delete_operation"
];

const slittingRecordKeyNeed_R =[
   "id",
  "lotNumber_R",
  "selectWork",
  "engineerName",
  "engineerId",
  "machineNo",
  "dayShift",
  "memberName",
  "memberNumber",
  "employee_InputTime",
  "startTime",
  "workTime",
  "remark_Filled",
  "announceCapacity",
  "remark",
  "Length_R",
  "LostLength_R",
  "incomeLength_R",
  "yield_R",
  "errorStatus_R",
  "slittingSpeed_R",
  "lostWeight_R",
  "is_deleted",
  "deleted_at",
  "delete_operation",
  "stock"
]
const slittingRecordKeyNeed_L =[
   "id",
  "lotNumber_L",
  "selectWork",
  "engineerName",
  "engineerId",
  "machineNo",
  "dayShift",
  "memberName",
  "memberNumber",
  "employee_InputTime",
  "startTime",
  "workTime",
  "remark_Filled",
  "announceCapacity",
  "remark",
  "Length_L",
  "LostLength_L",
  "incomeLength_L",
  "yield_L",
  "errorStatus_L",
  "slittingSpeed_L",
  "lostWeight_L",
  "is_deleted",
  "deleted_at",
  "delete_operation",
  "stock_L"
]


const discord_rollingNSlitting_notify = process.env.discord_rolling_notify || ""

// 早上 8:30 產能通知  
schedule.scheduleJob("30 08 * * *", async () => {
  console.log("開始執行早上8:30產能通知...");
  try {
    await sendDiscordNotification();
  } catch (error) {
    console.error("早上產能通知發送失敗:", error);
  }
});

// 晚上 8:30 產能通知  
schedule.scheduleJob("30 20 * * *", async () => {
  console.log("開始執行晚上8:30產能通知...");
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

    const [capacityResults] = await dbmes.promise().query(capacitySql, [
      startTime, endTime,  // 正極輾壓
      startTime, endTime,  // 負極輾壓
      startTime, endTime,  // 正極分切
      startTime, endTime   // 負極分切
    ]);

    // 建構通知訊息
    let Message_notify = `📊 **${shift}產能報告** (${moment().format('MM-DD HH:mm')})\n`;
    Message_notify += `⏰ 統計時間：${moment(startTime).format('MM-DD HH:mm')} ~ ${moment(endTime).format('MM-DD HH:mm')}\n\n`;

    let totalRecords = 0;
    let totalCapacity = 0;
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
        
        // 累加相同機器的數據
        machineData[row.machineNo].totalRecords += row.recordCount;
        machineData[row.machineNo].totalLength += parseFloat(row.totalLength);
        machineData[row.machineNo].totalLostLength += parseFloat(row.totalLostLength);
        
        // 收集操作員
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
        Message_notify += `      � 記錄數：${machine.totalRecords} 筆\n`;
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
          Authorization: `Bearer ${discord_rollingNSlitting_notify}`,
        },
      };

      await axios.post(discord_rollingNSlitting_notify, {
        content: Message_notify,
      }, config_Discord);
    

    res.status(200).json({
      success: true,
      message: "產能通知資料獲取成功",
      data: {
        shift: shift,
        timeRange: { startTime, endTime },
        summary: {
          totalRecords,
          totalCapacity: parseFloat(totalCapacity.toFixed(2)),
          totalLength: parseFloat(totalLength.toFixed(2)),
          totalLostLength: parseFloat(totalLostLength.toFixed(2))
        },
        details: capacityResults,
        notification: Message_notify
      }
    });

  } catch (error) {
    console.error("產能通知API錯誤:", error);
    res.status(500).json({
      success: false,
      message: "產能通知資料獲取失敗",
      error: error.message
    });
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
    const [result] = await dbmes.promise().query(sql, values);

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
      await dbmes.promise().query(sql_coater, values_coater);

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
      await dbmes.promise().query(sql_coater, values_coater);

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
    const [result] = await dbmes.promise().query(sql, values);

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

      await dbmes.promise().query(sql_coater_update, [lotNo_Clean]);

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

        await dbmes.promise().query(sql_coater, lotNUmber_Final);

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
      
      // 獲取當前每個類型現有的記錄
      const [existingCards] = await dbcon.promise().query(
        "SELECT id, engineerId, cardPosition FROM hr.rollingNslitting_register WHERE selectWork = ? AND is_deleted = 0 ORDER BY engineerId, cardPosition",
        [selectWork]
      );
      
      // 按工程師ID分組現有的卡片
      const existingCardsByEngineer = {};
      existingCards.forEach(card => {
        if (!existingCardsByEngineer[card.engineerId]) {
          existingCardsByEngineer[card.engineerId] = [];
        }
        existingCardsByEngineer[card.engineerId].push(card);
      });
      
      // 按工程師ID分組新的卡片，準備分配cardPosition
      const newCardsByEngineer = {};
      data[selectWork].forEach(item => {
        if (!newCardsByEngineer[item.engineerId]) {
          newCardsByEngineer[item.engineerId] = [];
        }
        // 先不設置cardPosition，稍後自動分配
        newCardsByEngineer[item.engineerId].push(item);
      });
      
      // 處理每個工程師的卡片
      for (const engineerId in newCardsByEngineer) {
        const cardsForEngineer = newCardsByEngineer[engineerId];
        
        // 開始事務處理，確保卡片位置分配的一致性
        const connection = await dbcon.promise().getConnection();
        await connection.beginTransaction();
        
        try {
          // 獲取工程師當前最大的cardPosition
          let maxPosition = -1;
          if (existingCardsByEngineer[engineerId]) {
            existingCardsByEngineer[engineerId].forEach(card => {
              if (card.cardPosition > maxPosition) {
                maxPosition = card.cardPosition;
              }
            });
          }
          
          // 為每張卡片分配cardPosition
          for (const item of cardsForEngineer) {
            // 跳過空的機台編號
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
                  cardPosition
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  machineNo = VALUES(machineNo),
                  rollingThickness_EG_S = VALUES(rollingThickness_EG_S),
                  rollingThickness_EG_E = VALUES(rollingThickness_EG_E),
                  rollingDensity_EG_S = VALUES(rollingDensity_EG_S),
                  rollingDensity_EG_E = VALUES(rollingDensity_EG_E),
                  announceCapacity = VALUES(announceCapacity),
                  remark = VALUES(remark),
                  engineerName = VALUES(engineerName)
              `;
              
              params = [
                selectWork,
                item.machineNo,
                item.rollingThickness_EG_S || null,
                item.rollingThickness_EG_E || null,
                item.rollingDensity_EG_S || null,
                item.rollingDensity_EG_E || null,
                item.announceCapacity || null,
                item.remark || null,
                item.engineerName,
                item.engineerId,
                cardPosition
              ];
            } else {
              // 分切类型只需要部分字段
              sql = `INSERT INTO hr.rollingNslitting_register (
                  selectWork,
                  machineNo,
                  announceCapacity,
                  remark,
                  engineerName,
                  engineerId,
                  cardPosition
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  machineNo = VALUES(machineNo),
                  announceCapacity = VALUES(announceCapacity),
                  remark = VALUES(remark),
                  engineerName = VALUES(engineerName)
              `;
              
              params = [
                selectWork,
                item.machineNo,
                item.announceCapacity || null,
                item.remark || null,
                item.engineerName,
                item.engineerId,
                cardPosition
              ];
            }
            
            // 使用事務連接
            const [result] = await connection.query(sql, params);
            
            results.success.push({
              type: selectWork,
              machineNo: item.machineNo,
              cardPosition: cardPosition,
              affectedRows: result.affectedRows
            });
          }
          
          // 重新排序該工程師的所有卡片，確保位置從0開始連續
          const [allCards] = await connection.query(
            "SELECT id FROM hr.rollingNslitting_register WHERE selectWork = ? AND engineerId = ? AND is_deleted = 0 ORDER BY cardPosition",
            [selectWork, engineerId]
          );
          
          // 更新所有卡片位置，從0開始
          for (let i = 0; i < allCards.length; i++) {
            await connection.query(
              "UPDATE hr.rollingNslitting_register SET cardPosition = ? WHERE id = ?",
              [i, allCards[i].id]
            );
          }
          
          // 提交事務
          await connection.commit();
        } catch (error) {
          // 如果出現錯誤，回滾事務
          await connection.rollback();
          console.error(`${selectWork}設定更新失敗 (engineerId: ${engineerId}):`, error);
          results.errors.push({
            type: selectWork,
            engineerId: engineerId,
            error: error.message
          });
        } finally {
          // 釋放連接
          connection.release();
        }
      }
    }

    // 返回结果
    res.status(200).json({
      success: true,
      message: "工程師設定批量更新完成，卡片位置已自動排序",
      results
    });
  } catch (error) {
    console.error("工程師設定更新失敗:", error);
    res.status(500).json({
      success: false,
      error: "工程師設定更新失敗",
      detail: error.message
    });
  }
})


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
    
    const [rows] = await dbcon.promise().query(sql, params);
    
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
    const connection = await dbcon.promise().getConnection();
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
        await connection.release();
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
    } finally {
      // 釋放連接
      connection.release();
    }
  } catch (error) {
    console.error("工程師設定刪除失敗:", error);
    res.status(500).json({
      success: false,
      error: "工程師設定刪除失敗",
      detail: error.message
    });
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
        tableName = ['rollingcathode_batch', 'rollinganode_batch' , 'slittingcathode_batch', 'slittinganode_batch'];
        keys = [RollingRecordKeyNeed , slittingRecordKeyNeed_R , slittingRecordKeyNeed_L]
      break;

      case "正極輾壓" : 
        tableName = ['rollingcathode_batch'];
        keys = [RollingRecordKeyNeed];
      break;

      case "負極輾壓" : 
        tableName = ['rollinganode_batch'];
        keys = [RollingRecordKeyNeed];
      break;

      case "正極分切_R" : 
        tableName = ['slittingcathode_batch'];
        keys = [slittingRecordKeyNeed_R];
      break;

      case "正極分切_L" : 
        tableName = ['slittingcathode_batch'];
        keys = [slittingRecordKeyNeed_L];
      break;

      case "負極分切_R" : 
        tableName = ['slittinganode_batch'];
        keys = [slittingRecordKeyNeed_R];
      break;

      case "負極分切_L" : 
        tableName = ['slittinganode_batch'];
        keys = [slittingRecordKeyNeed_L];
      break;

      case "error" :
        tableName = ['rollingcathode_batch', 'rollinganode_batch' , 'slittingcathode_batch', 'slittinganode_batch'];
        keys = [RollingRecordKeyNeed , slittingRecordKeyNeed_R , slittingRecordKeyNeed_L]
      break;

      default : 
        return res.status(400).json({ error: "無效的 option 參數" });
    }

    if (!tableName.length || !keys.length) {
      return res.status(400).json({ error: "查詢參數錯誤" });
    }

    // console.log ("tableName:", tableName , "keys:" , keys);
  

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

  const unionKeys = Array.from(new Set([...RollingRecordKeyNeed, ...slittingRecordKeyNeed , ...slittingRecordKeyNeed_R , ...slittingRecordKeyNeed_L]));

  // 產生 SELECT 欄位字串
    function buildSelect(keys, table, workType) {
  // 每個欄位如果存在於該表 keys 就用本身，否則補 NULL
    const cols = unionKeys.map(k => 
      keys.includes(k) ? `${table}.${k}` : `NULL AS ${k}`
    ).join(", ");

    let where = "WHERE employee_InputTime BETWEEN ? AND ?";
    if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
      if (searchTerm.length <= 5) {
        where += ` AND engineerId LIKE ? `;
      }
      else if (searchTerm.length > 5) {
        if (workType.includes('_R')) {
          where += ` AND lotNumber_R LIKE ? `;
        } 
        else if (workType.includes('_L')) {
          where += ` AND lotNumber_L LIKE ? `;
        } 
        else {
          where += ` AND lotNumber LIKE ? `;
        }
      }
    }
    return `SELECT ${cols} FROM ${table} ${where}`;
  }


    if (option === "all") {
     sql = `
      SELECT * FROM (
        ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch', '正極輾壓')}
        UNION ALL
        ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch', '負極輾壓')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_R, 'slittingcathode_batch', '正極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittingcathode_batch', '正極分切_L')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_R, 'slittinganode_batch', '負極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittinganode_batch', '負極分切_L')}
      ) AS combined
       WHERE (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY employee_InputTime DESC
      LIMIT ${offset}, ${pageSizeNum}
    `;
    

    sqlCount = `
      SELECT COUNT(*) AS totalCount FROM (
        ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch', '正極輾壓')}
        UNION ALL
        ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch', '負極輾壓')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_R, 'slittingcathode_batch', '正極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittingcathode_batch', '正極分切_L')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_R, 'slittinganode_batch', '負極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittinganode_batch', '負極分切_L')}
      ) AS combined_count
       WHERE (is_deleted IS NULL OR is_deleted = 0)
    `;
    
    // params 要有 6 組日期 + 6 組 searchTerm
    params.length = 0;
    for (let i = 0; i < 6; i++) {
      params.push(startDate, endDay);
      if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){

        //用工號找到 engineerId
        if ( typeof (Number(searchTerm)) === "number" ) {
          params.push(`%${searchTerm}%`);
        }
        // 找到 lotNumber
        else if (searchTerm && /^[a-zA-Z0-9]+$/.test(searchTerm)) {
          params.push(`%${searchTerm}%`);
        }
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
        ${buildSelect(slittingRecordKeyNeed_R, 'slittingcathode_batch', '正極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittingcathode_batch', '正極分切_L')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_R, 'slittinganode_batch', '負極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittinganode_batch', '負極分切_L')}
      ) AS combined
       WHERE is_deleted = 1
      ORDER BY employee_InputTime DESC
      LIMIT ${offset}, ${pageSizeNum}
    `;

    sqlCount = `
      SELECT COUNT(*) AS totalCount FROM (
        ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch', '正極輾壓')}
        UNION ALL
        ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch', '負極輾壓')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_R, 'slittingcathode_batch', '正極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittingcathode_batch', '正極分切_L')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_R, 'slittinganode_batch', '負極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittinganode_batch', '負極分切_L')}
      ) AS combined_count
       WHERE is_deleted = 1
      `

    // params 要有 6 組日期 + 6 組 searchTerm
    params.length = 0;
    for (let i = 0; i < 6; i++) {
      params.push(startDate, endDay);
      if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){

        //用工號找到 engineerId
        if ( typeof (Number(searchTerm)) === "number" ) {
          params.push(`%${searchTerm}%`);
        }
        // 找到 lotNumber
        else if (searchTerm && /^[a-zA-Z0-9]+$/.test(searchTerm)) {
          params.push(`%${searchTerm}%`);
        }
      }
    }
  }
  else if (tableName.length === 1) {
    console.log("單一表查詢:", tableName[0]);

    switch (option) {
      case "負極分切_R":
      case "正極分切_R": 
      
        sql = `SELECT ${keys[0].join(", ")} , stock FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND ( delete_operation NOT IN ('user_delete_R', 'user_delete_both') OR delete_operation IS NULL ) AND lotNumber_R IS NOT NULL AND lotNumber_R != '' `;
        sqlCount = `SELECT COUNT(*) AS totalCount FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ?  AND ( delete_operation NOT IN ('user_delete_R', 'user_delete_both') OR delete_operation IS NULL ) AND lotNumber_R IS NOT NULL AND lotNumber_R != '' `;
        break;
      case "正極分切_L":
      case "負極分切_L":
        sql = `SELECT ${keys[0].join(", ")} , stock_L FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND ( delete_operation NOT IN ('user_delete_L', 'user_delete_both') OR delete_operation IS NULL ) AND lotNumber_L IS NOT NULL AND lotNumber_L != '' `;
        sqlCount = `SELECT COUNT(*) AS totalCount FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ?  AND ( delete_operation NOT IN ('user_delete_L', 'user_delete_both') OR delete_operation IS NULL ) AND lotNumber_L IS NOT NULL AND lotNumber_L != '' `;
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
        sql += ` AND engineerId LIKE ? `;
        sqlCount += ` AND engineerId LIKE ? `;
      }
      else if (searchTerm.length > 5) {
        // 根據選項決定使用哪個 lotNumber 欄位
        if (option.includes('_R')) {
          sql += ` AND lotNumber_R LIKE ? `;
          sqlCount += ` AND lotNumber_R LIKE ? `;
        } else if (option.includes('_L')) {
          sql += ` AND lotNumber_L LIKE ? `;
          sqlCount += ` AND lotNumber_L LIKE ? `;
        } else {
          sql += ` AND lotNumber LIKE ? `;
          sqlCount += ` AND lotNumber LIKE ? `;
        }
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


    const [rows] = await dbmes.promise().query(sql, params);
    const [countResult] = await dbmes.promise().query(sqlCount, params);
    const totalRecords = countResult[0].totalCount;
    const totalPages = Math.ceil(totalRecords / pageSizeNum);
    
    for (let row of rows){
      row.employee_InputTime = moment(row.employee_InputTime).format("YYYY-MM-DD HH:mm:ss");
    }

    console.log("查詢結果:", rows);
    console.log("執行的 SQL:", sql);
    console.log("SQL 參數:", params);
    console.log("總記錄數:", totalRecords, "總頁數:", totalPages);

    res.status(200).json({
      message: "查詢頁面加載成功",
      data: rows,
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

  const connection = await dbmes.promise().getConnection();
  await connection.beginTransaction();

  try {
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
            // 只刪除 R 側的 lotNumber_R，設置為 NULL
            sql = `UPDATE ${tableName} SET 
                     lotNumber_R = NULL,
                     Length_R = NULL,
                     LostLength_R = NULL,
                     incomeLength_R = NULL,
                     yield_R = NULL,
                     errorStatus_R = NULL,
                     slittingSpeed_R = NULL,
                     lostWeight_R = NULL,
                     is_deleted = CASE 
                       WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 1 
                       ELSE 0 
                     END,
                     deleted_at = ?,
                     delete_operation = CASE 
                       WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 'user_delete_both'
                       ELSE 'user_delete_R'
                     END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else if (operation.side === 'L') {
            // 只刪除 L 側的 lotNumber_L，設置為 NULL
            sql = `UPDATE ${tableName} SET 
                     lotNumber_L = NULL,
                     Length_L = NULL,
                     LostLength_L = NULL,
                     incomeLength_L = NULL,
                     yield_L = NULL,
                     errorStatus_L = NULL,
                     slittingSpeed_L = NULL,
                     lostWeight_L = NULL,
                     is_deleted = CASE 
                       WHEN (lotNumber_R IS NULL OR lotNumber_R = '' OR lotNumber_R = '-R') THEN 1 
                       ELSE 0 
                     END,
                     deleted_at = ?,
                     delete_operation = CASE 
                       WHEN (lotNumber_R IS NULL OR lotNumber_R = '' OR lotNumber_R = '-R') THEN 'user_delete_both'
                       ELSE 'user_delete_L'
                     END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else {
            // 刪除整筆記錄
            sql = `UPDATE ${tableName} SET is_deleted = 1, deleted_at = ?, delete_operation = 'user_delete' WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          }
          break;
        case "slittingAnode":
        case "負極分切":
          tableName = "slittinganode_batch";
          if (operation.side === 'R') {
            // 只刪除 R 側的 lotNumber_R，設置為 NULL
            sql = `UPDATE ${tableName} SET 
                     lotNumber_R = NULL,
                     Length_R = NULL,
                     LostLength_R = NULL,
                     incomeLength_R = NULL,
                     yield_R = NULL,
                     errorStatus_R = NULL,
                     slittingSpeed_R = NULL,
                     lostWeight_R = NULL,
                     is_deleted = CASE 
                       WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 1 
                       ELSE 0 
                     END,
                     deleted_at = ?,
                     delete_operation = CASE 
                       WHEN (lotNumber_L IS NULL OR lotNumber_L = '' OR lotNumber_L = '-L') THEN 'user_delete_both'
                       ELSE 'user_delete_R'
                     END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else if (operation.side === 'L') {
            // 只刪除 L 側的 lotNumber_L，設置為 NULL
            sql = `UPDATE ${tableName} SET 
                     lotNumber_L = NULL,
                     Length_L = NULL,
                     LostLength_L = NULL,
                     incomeLength_L = NULL,
                     yield_L = NULL,
                     errorStatus_L = NULL,
                     slittingSpeed_L = NULL,
                     lostWeight_L = NULL,
                     is_deleted = CASE 
                       WHEN (lotNumber_R IS NULL OR lotNumber_R = '' OR lotNumber_R = '-R') THEN 1 
                       ELSE 0 
                     END,
                     deleted_at = ?,
                     delete_operation = CASE 
                       WHEN (lotNumber_R IS NULL OR lotNumber_R = '' OR lotNumber_R = '-R') THEN 'user_delete_both'
                       ELSE 'user_delete_L'
                     END
                   WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          } else {
            // 刪除整筆記錄
            sql = `UPDATE ${tableName} SET is_deleted = 1, deleted_at = ?, delete_operation = 'user_delete' WHERE id IN (${operation.ids.map(() => '?').join(',')})`;
          }
          break;
        default:
          console.error("未知的工作類型:", operation.selectWork);
          console.error("可用的操作物件:", operation);
          throw new Error(`無效的工作類型: ${operation.selectWork}`);
      }
      
      const params = [deletedAt, ...operation.ids];
      const [result] = await connection.query(sql, params);
      
      results.push({
        selectWork: operation.selectWork,
        side: operation.side,
        tableName: tableName,
        affectedRows: result.affectedRows,
        processedIds: operation.ids
      });
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: `批量刪除成功，共處理 ${selectedRows.length} 筆資料`,
      data: results,
      totalProcessed: selectedRows.length
    });

  } catch (error) {
    await connection.rollback();
    console.error("批量刪除失敗:", error);
    res.status(500).json({
      success: false,
      error: "批量刪除失敗",
      detail: error.message
    });
  } finally {
    connection.release();
  }
})

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
        keys = [RollingRecordKeyNeed , slittingRecordKeyNeed_R , slittingRecordKeyNeed_L]
      break;

      case "正極輾壓" : 
        tableName = ['rollingcathode_batch'];
        keys = [RollingRecordKeyNeed];
      break;

      case "負極輾壓" : 
        tableName = ['rollinganode_batch'];
        keys = [RollingRecordKeyNeed];
      break;

      case "正極分切_R" : 
        tableName = ['slittingcathode_batch'];
        keys = [slittingRecordKeyNeed_R];
      break;

      case "正極分切_L" : 
        tableName = ['slittingcathode_batch'];
        keys = [slittingRecordKeyNeed_L];
      break;

      case "負極分切_R" : 
        tableName = ['slittinganode_batch'];
        keys = [slittingRecordKeyNeed_R];
      break;

      case "負極分切_L" : 
        tableName = ['slittinganode_batch'];
        keys = [slittingRecordKeyNeed_L];
      break;

      case "error" :
        tableName = ['rollingcathode_batch', 'rollinganode_batch' , 'slittingcathode_batch', 'slittinganode_batch'];
        keys = [RollingRecordKeyNeed , slittingRecordKeyNeed_R , slittingRecordKeyNeed_L]
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
      formattedEndDate = moment(endDay).endOf('day').format("YYYY-MM-DD HH:mm:ss");
      console.log("格式化後的日期:", { formattedStartDate, formattedEndDate });
      
      params.push(formattedStartDate, formattedEndDate);
    }


  const unionKeys = Array.from(new Set([...RollingRecordKeyNeed, ...slittingRecordKeyNeed , ...slittingRecordKeyNeed_R , ...slittingRecordKeyNeed_L]));

  // 產生 SELECT 欄位字串
  function buildSelect(keys, table, workType) {
  // 每個欄位如果存在於該表 keys 就用本身，否則補 NULL
    const cols = unionKeys.map(k => 
      keys.includes(k) ? `${table}.${k}` : `NULL AS ${k}`
    ).join(", ");

    let where = "WHERE employee_InputTime BETWEEN ? AND ?";
    if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
      if (searchTerm.length <= 5) {
        where += ` AND engineerId LIKE ? `;
      }
      else if (searchTerm.length > 5) {
        if (workType.includes('_R')) {
          where += ` AND lotNumber_R LIKE ? `;
        } 
        else if (workType.includes('_L')) {
          where += ` AND lotNumber_L LIKE ? `;
        } 
        else {
          where += ` AND lotNumber LIKE ? `;
        }
      }
    }

      return `SELECT ${cols} FROM ${table} ${where}`;
  }

    
  if (option === "all") {
     sql = `
            SELECT * FROM (
            ${buildSelect(RollingRecordKeyNeed, 'rollingcathode_batch', '正極輾壓')}
            UNION ALL
            ${buildSelect(RollingRecordKeyNeed, 'rollinganode_batch', '負極輾壓')}
            UNION ALL
            ${buildSelect(slittingRecordKeyNeed_R, 'slittingcathode_batch', '正極分切_R')}
            UNION ALL
            ${buildSelect(slittingRecordKeyNeed_L, 'slittingcathode_batch', '正極分切_L')}
            UNION ALL
            ${buildSelect(slittingRecordKeyNeed_R, 'slittinganode_batch', '負極分切_R')}
            UNION ALL
            ${buildSelect(slittingRecordKeyNeed_L, 'slittinganode_batch', '負極分切_L')}
          ) AS combined
          WHERE (is_deleted IS NULL OR is_deleted = 0)
          ORDER BY employee_InputTime DESC
          `;
    // params 要有 6 組日期 + 6 組 searchTerm
    params.length = 0;
    for (let i = 0; i < 6; i++) {
      params.push(formattedStartDate, formattedEndDate);
      if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
        if ( searchTerm.length <= 5 ) {
          params.push(`%${searchTerm}%`);
        }
        else if (searchTerm.length > 5) {
          params.push(`%${searchTerm}%`);
        }
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
        ${buildSelect(slittingRecordKeyNeed_R, 'slittingcathode_batch', '正極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittingcathode_batch', '正極分切_L')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_R, 'slittinganode_batch', '負極分切_R')}
        UNION ALL
        ${buildSelect(slittingRecordKeyNeed_L, 'slittinganode_batch', '負極分切_L')}
      ) AS combined
       WHERE is_deleted = 1
      ORDER BY employee_InputTime DESC
    `;

    // params 要有 6 組日期 + 6 組 searchTerm
    params.length = 0;
    for (let i = 0; i < 6; i++) {
      params.push(formattedStartDate, formattedEndDate);
      if (searchTerm !== "" && searchTerm !== null && searchTerm !== undefined){
        if ( searchTerm.length <= 5 ) {
          params.push(`%${searchTerm}%`);
        }
        else if (searchTerm.length > 5) {
          params.push(`%${searchTerm}%`);
        }
      }
    }
  }
  else if (tableName.length === 1) {
    console.log("單一表查詢:", tableName[0]);

    switch (option) {
      case "負極分切_R":
      case "正極分切_R": 
      
        sql = `SELECT ${keys[0].join(", ")} , stock FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND ( delete_operation NOT IN ('user_delete_R', 'user_delete_both') OR delete_operation IS NULL ) AND lotNumber_R IS NOT NULL AND lotNumber_R != '' `;
        sqlCount = `SELECT COUNT(*) AS totalCount FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ?  AND ( delete_operation NOT IN ('user_delete_R', 'user_delete_both') OR delete_operation IS NULL ) AND lotNumber_R IS NOT NULL AND lotNumber_R != '' `;
        break;
      case "正極分切_L":
      case "負極分切_L":
        sql = `SELECT ${keys[0].join(", ")} , stock_L FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ? AND ( delete_operation NOT IN ('user_delete_L', 'user_delete_both') OR delete_operation IS NULL ) AND lotNumber_L IS NOT NULL AND lotNumber_L != '' `;
        sqlCount = `SELECT COUNT(*) AS totalCount FROM ${tableName[0]} WHERE employee_InputTime BETWEEN ? AND ?  AND ( delete_operation NOT IN ('user_delete_L', 'user_delete_both') OR delete_operation IS NULL ) AND lotNumber_L IS NOT NULL AND lotNumber_L != '' `;
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
        sql += ` AND engineerId LIKE ? `;
        sqlCount += ` AND engineerId LIKE ? `;
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

    const [rows] = await dbmes.promise().query(sql, params);

    console.log("sql 內容確認 :", sql  ,"params確認 :", params, "下載前查詢結果:", rows);

    // 添加調試查詢：檢查數據庫中是否有 is_deleted = 1 的記錄
    const debugSql = `
      SELECT COUNT(*) as count FROM rollingcathode_batch WHERE is_deleted = 1;
    `;
    const [debugResult] = await dbmes.promise().query(debugSql);
    console.log("rollingcathode_batch 中 is_deleted = 1 的記錄數:", debugResult);

    // 檢查日期範圍內是否有任何記錄
    const dateSql = `
      SELECT COUNT(*) as count FROM rollingcathode_batch WHERE employee_InputTime BETWEEN ? AND ?;
    `;
    const [dateResult] = await dbmes.promise().query(dateSql, [params[0], params[1]]);
    console.log("日期範圍內的記錄數:", dateResult);

    const sortRows = formatTimeFields(rows).map(row => {
      const { errorReason, ...rowWithoutErrorReason } = row;
      return rowWithoutErrorReason;
    });

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(sortRows);
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
      const [columns] = await dbcon.promise().query("SHOW COLUMNS FROM hr.rollingNslitting_register LIKE 'is_deleted'");
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
    
    const [rows] = await dbcon.promise().query(sql, params);
    
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
      const [columns] = await dbcon.promise().query("SHOW COLUMNS FROM hr.rollingNslitting_register LIKE 'is_deleted'");
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
    const connection = await dbcon.promise().getConnection();
    await connection.beginTransaction();
    
    try {
      // 查詢要恢復的記錄的 selectWork 和 engineerId
      const [record] = await connection.query(
        "SELECT selectWork, engineerId, cardPosition FROM hr.rollingNslitting_register WHERE id = ?",
        [id]
      );
      
      if (record.length === 0) {
        await connection.release();
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
        await connection.release();
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
      await connection.rollback();
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
    shift: frontendShift ,
    page = 1, 
    pageSize = 20
  } = req.query;
  
  // 支援兩種參數名稱：dayShift 或 shift
  const shiftParam = dayShift || frontendShift;

  let shift = "";
  let nowDate_S = ""; 
  let nowDate_E = "";
  let engineerIdSet = engineerId || "264";

  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;
  const currentPage = parseInt(page, 10);
  
  console.log("接收到的前端參數:", {
    engineerId,
    startTime,
    endTime,
    dayShift,
    frontendShift,
    finalShift: shiftParam
  });

  const now = new Date();
  const currentHour = now.getHours();
  let table_rolling = [
    'rollingcathode_batch', 
    'rollinganode_batch', 
    'slittingcathode_batch', 
    'slittinganode_batch'
  ];


  // 處理三種前端傳送資料的情況
  
  // 情況3: 送日期 startTime, endTime, shift (完全依據前端傳送資料來找資料庫)
  if (startTime && endTime && endTime.length > 5 && shiftParam) {
    shift = shiftParam;
    nowDate_S = startTime;
    nowDate_E = endTime;
    
    // console.log("情況3 - 使用前端完整參數:", {
    //   dayShift: shift,
    //   startTime: nowDate_S,
    //   endTime: nowDate_E,
    //   engineerId: engineerIdSet
    // });
  }
  // 情況2: 送日期(startTime) 與班別 (需把 startTime 當成 startDay)
  else if (startTime && shiftParam) {
    shift = shiftParam;
    const startDate = moment(startTime);
    
    if (shiftParam === "早班" || shiftParam === "早班") {
      nowDate_S = startDate.format("YYYY-MM-DD 08:00:00");
      nowDate_E = startDate.format("YYYY-MM-DD 20:00:00");
    } else if (shiftParam === "夜班") {
      nowDate_S = startDate.format("YYYY-MM-DD 20:00:00");
      nowDate_E = startDate.add(1, "day").format("YYYY-MM-DD 08:00:00");
    }
    
    // console.log("情況2 - 使用日期與班別:", {
    //   原始startTime: startTime,
    //   班別: shiftParam,
    //   計算後startTime: nowDate_S,
    //   計算後endTime: nowDate_E,
    //   engineerId: engineerIdSet
    // });
  } 
  // 情況1: 完全沒送資料 (用預設)
  else {
    if (currentHour >= 8 && currentHour < 20){
      shift = "早班";
      nowDate_S = moment(now).format("YYYY-MM-DD 08:00:00");
      nowDate_E = moment(now).format("YYYY-MM-DD 20:00:00");
    }
    else if (currentHour >= 20 || currentHour < 8){
      shift = "夜班";
      if (currentHour >= 20) {
        // 晚上8點到24點，夜班從當天20:00到次日08:00
        nowDate_S = moment(now).format("YYYY-MM-DD 20:00:00");
        nowDate_E = moment(now).add(1, "day").format("YYYY-MM-DD 08:00:00");
      } else {
        // 凌晨0點到8點，夜班從前一天20:00到當天08:00
        nowDate_S = moment(now).subtract(1, "day").format("YYYY-MM-DD 20:00:00");
        nowDate_E = moment(now).format("YYYY-MM-DD 08:00:00");
      }
    }
    
    // console.log("情況1 - 使用預設時間邏輯:", {
    //   當前時間: moment(now).format("YYYY-MM-DD HH:mm:ss"),
    //   dayShift: shift,
    //   startTime: nowDate_S,
    //   endTime: nowDate_E,
    //   engineerId: engineerIdSet
    // });
  }

  const sql_Find_machineNo = `SELECT DISTINCT machineNo, selectWork FROM hr.rollingnslitting_register WHERE engineerId = ? AND is_deleted = 0`;

  try{
    const [machineNoResult] = await dbcon.promise().query(sql_Find_machineNo, [engineerIdSet]);
    console.log("machineNoResult:", machineNoResult);

    // 根據 selectWork 分組機台號碼
    const machineGroups = {
      rollingCathode: [],
      rollingAnode: [],
      slittingCathode: [],
      slittingAnode: []
    };

    // 正確的分組邏輯
    for (let machine of machineNoResult) {
      switch(machine.selectWork) {
        case "rollingCathode":
          machineGroups.rollingCathode.push(machine.machineNo);
          break;
        case "rollingAnode":
          machineGroups.rollingAnode.push(machine.machineNo);
          break;
        case "slittingCathode":
          machineGroups.slittingCathode.push(machine.machineNo);
          break;
        case "slittingAnode":
          machineGroups.slittingAnode.push(machine.machineNo);
          break;
      }
    }

    console.log("machineGroups:", machineGroups);

    // 創建動態 SQL 查詢函數 - 依據機台ID分別查詢
    const createRollingQuery = (machines, tableName) => {
      if (machines.length === 0) {
        return Promise.resolve([[], [], []]);
      }

      const placeholders = machines.map(() => '?').join(',');
      console.log("Rolling Query Placeholders:", placeholders);

      const sql = `
        SELECT
          machineNo,
          SUM(rollingLength) AS rollingLength,
          SUM(rolling_LostWeight) AS rolling_LostWeight,
          SUM(workTime) AS workTime
        FROM ${tableName}
        WHERE employee_InputTime BETWEEN ? AND ? 
          AND dayShift = ? 
          AND machineNo IN (${placeholders})
          AND (is_deleted IS NULL OR is_deleted = 0)

        GROUP BY machineNo
      `;
      const sql2 = `
        SELECT 
          employee_InputTime, 
          rollingDensity, 
          averageThickness, 
          memberNumber, 
          lotNumber, 
          machineNo
        FROM (
          SELECT 
            employee_InputTime, 
            rollingDensity, 
            averageThickness, 
            memberNumber, 
            lotNumber, 
            machineNo,
            ROW_NUMBER() OVER (PARTITION BY machineNo ORDER BY employee_InputTime DESC) as rn
          FROM ${tableName}
          WHERE employee_InputTime BETWEEN ? AND ? 
            AND dayShift = ? 
            AND machineNo IN (${placeholders})
            AND (is_deleted IS NULL OR is_deleted = 0)

        ) ranked
        WHERE rn = 1
        LIMIT ? OFFSET ?
      `;
      
      // 新增計算總筆數的 SQL
      const sqlCount = `
        SELECT COUNT(DISTINCT machineNo) as totalCount
        FROM ${tableName}
        WHERE employee_InputTime BETWEEN ? AND ? 

          AND dayShift = ? 
          AND machineNo IN (${placeholders})
          AND (is_deleted IS NULL OR is_deleted = 0)
      `;

      const params = [nowDate_S, nowDate_E, shift, ...machines];
      const paramsWithPagination = [nowDate_S, nowDate_E, shift, ...machines, limit, offset];
      // console.log(`Rolling SQL (${tableName}):`, sql);
      // console.log(`Rolling Params (${tableName}):`, paramsWithPagination);

      return Promise.all([
        dbmes.promise().query(sql, params),
        dbmes.promise().query(sql2, paramsWithPagination),
        dbmes.promise().query(sqlCount, params)
      ]);
    };

    const createSlittingQuery = (machines, tableName) => {
      if (machines.length === 0) {
        return Promise.resolve([[], [], []]);
      }

      const placeholders = machines.map(() => '?').join(',');
      console.log("Slitting Query Placeholders:", placeholders);

      const sql = `
        SELECT
          machineNo,
          SUM(Length_R) AS Length_R,
          SUM(Length_L) AS Length_L,
          SUM(LostWeight_R) AS LostWeight_R,
          SUM(LostWeight_L) AS LostWeight_L,
          SUM(workTime) AS workTime
        FROM ${tableName}
        WHERE employee_InputTime BETWEEN ? AND ? 
          AND dayShift = ? 
          AND machineNo IN (${placeholders})
          AND (is_deleted IS NULL OR is_deleted = 0)

        GROUP BY machineNo
      `;
      const sql2 = `
        SELECT 
          employee_InputTime, 
          memberNumber, 
          lotNumber, 
          machineNo
        FROM (
          SELECT 
            employee_InputTime, 
            memberNumber, 
            lotNumber_R as lotNumber, 
            machineNo,
            ROW_NUMBER() OVER (PARTITION BY machineNo ORDER BY employee_InputTime DESC) as rn
          FROM ${tableName}
          WHERE employee_InputTime BETWEEN ? AND ? 
            AND dayShift = ? 
            AND machineNo IN (${placeholders})
            AND (is_deleted IS NULL OR is_deleted = 0)

        ) ranked
        WHERE rn = 1
        LIMIT ? OFFSET ?
      `;
      
      // 新增計算總筆數的 SQL
      const sqlCount = `
        SELECT COUNT(DISTINCT machineNo) as totalCount
        FROM ${tableName}
        WHERE employee_InputTime BETWEEN ? AND ? 
          AND dayShift = ? 
          
          AND machineNo IN (${placeholders})
          AND (is_deleted IS NULL OR is_deleted = 0)
      `;

      const params = [nowDate_S, nowDate_E, shift, ...machines];
      const paramsWithPagination = [nowDate_S, nowDate_E, shift, ...machines, limit, offset];
      // console.log(`Slitting SQL (${tableName}):`, sql);
      // console.log(`Slitting Params (${tableName}):`, params);
      
      return Promise.all([
        dbmes.promise().query(sql, params),
        dbmes.promise().query(sql2, paramsWithPagination),
        dbmes.promise().query(sqlCount, params)
      ]);
    };

    // 並行查詢所有類型
    const [
      rollingCathodeResult, 
      rollingAnodeResult, 
      slittingCathodeResult, 
      slittingAnodeResult
    ] = await Promise.all([
      createRollingQuery(machineGroups.rollingCathode, table_rolling[0]),
      createRollingQuery(machineGroups.rollingAnode, table_rolling[1]),
      createSlittingQuery(machineGroups.slittingCathode, table_rolling[2]),
      createSlittingQuery(machineGroups.slittingAnode, table_rolling[3])
    ]);

    console.log(
      "RollingCathodeResult  : " , Object.keys(rollingCathodeResult[0]).length ? rollingCathodeResult[0][0] : "No Data",
      "RollingAnodeResult    : " , Object.keys(rollingAnodeResult[0]).length ? rollingAnodeResult[0][0] : "No Data",
      "SlittingCathodeResult  : " , Object.keys(slittingCathodeResult[0]).length ? slittingCathodeResult[0][0] : "No Data",
      "SlittingAnodeResult    : " , Object.keys(slittingAnodeResult[0]).length ? slittingAnodeResult[0][0] : "No Data"
    )

    // 計算總筆數和頁數
    const totalCounts = {
      rollingCathode: rollingCathodeResult[2] && rollingCathodeResult[2][0] && rollingCathodeResult[2][0][0] ? rollingCathodeResult[2][0][0].totalCount : 0,
      rollingAnode: rollingAnodeResult[2] && rollingAnodeResult[2][0] && rollingAnodeResult[2][0][0] ? rollingAnodeResult[2][0][0].totalCount : 0,
      slittingCathode: slittingCathodeResult[2] && slittingCathodeResult[2][0] && slittingCathodeResult[2][0][0] ? slittingCathodeResult[2][0][0].totalCount : 0,
      slittingAnode: slittingAnodeResult[2] && slittingAnodeResult[2][0] && slittingAnodeResult[2][0][0] ? slittingAnodeResult[2][0][0].totalCount : 0
    };

    const totalRecords = totalCounts.rollingCathode + totalCounts.rollingAnode + totalCounts.slittingCathode + totalCounts.slittingAnode;
    const totalPages = Math.ceil(totalRecords / limit);

    console.log("總筆數統計:", totalCounts, "總記錄數:", totalRecords, "總頁數:", totalPages);

    // Rolling 區域 處理查詢結果 - 按機台分組
    const processRollingData = (results, type) => {
      const machines = {};
      let totalLength = 0;
      let totalLostWeight = 0;

      // 處理主要查詢結果 (results[0])
      if (results[0] && results[0][0] && results[0][0].length > 0) {
        results[0][0].forEach(row => {
          const rollingLength = parseFloat(row.rollingLength) || 0; // 完成米數(輾壓長度統整)
          const lostWeight = parseFloat(row.rolling_LostWeight) || 0; // 損失重量(統整)
          const workTime = parseFloat(row.workTime) || 0; // 工作時間
          const Factor = type === 'rollingCathode' ? 0.216 : type === 'rollingAnode' ? 0.034 : 1; // 用於換算損料長度
          const lostLength = lostWeight / Factor; // 損料長度(統整)
          const yield = rollingLength > 0 ? ((rollingLength - lostLength) / rollingLength) * 100 : 0; // 良率(統整)
          const averageRate = workTime > 0 ? (rollingLength / workTime) : 0; // 平均速度(統整)

          machines[row.machineNo] = {
            machineNo: row.machineNo,
            rollingLength,
            LostLength: lostLength,
            yield: parseFloat(yield.toFixed(2)),
            averageRate: parseFloat(averageRate.toFixed(2))
          };

          totalLength += rollingLength;
          totalLostWeight += lostWeight;
        });
      }

      // 處理最新記錄查詢結果 (results[1]) - 按機台分組
      if (results[1] && results[1][0] && results[1][0].length > 0) {
        results[1][0].forEach(latestRow => {
          const machineNo = latestRow.machineNo;
          const nowLotNo = latestRow.lotNumber;
          const lastSubmitTime = latestRow.employee_InputTime;
          const averageThickness = latestRow.averageThickness;
          const rollingDensity = latestRow.rollingDensity;
          const memberNumber = latestRow.memberNumber;

          // 將最新記錄資訊添加到對應的機台
          if (machines[machineNo]) {
            machines[machineNo] = {
              ...machines[machineNo],
              nowLotNo,
              lastSubmitTime,
              averageThickness,
              rollingDensity,
              memberNumber
            };
          }
        });
      }

      const totalLostLength = totalLostWeight / (type === 'rollingCathode' ? 0.216 : type === 'rollingAnode' ? 0.034 : null);
      const totalYield = totalLength > 0 ? ((totalLength - totalLostLength) / totalLength) * 100 : 0;

      return {
        machines,
        summary: {
          totalLength,
          totalLostWeight,
          totalLostLength,
          totalYield: parseFloat(totalYield.toFixed(2)),
        }
      };
    };

    // Slitting 區域
    const processSlittingData = (results, type) => {
      const machines = {};
      let totalLength_R = 0;
      let totalLength_L = 0;
      let totalLostWeight_R = 0;
      let totalLostWeight_L = 0;

      // 處理主要查詢結果 (results[0])
      if (results[0] && results[0][0] && results[0][0].length > 0) {
        results[0][0].forEach(row => {
          const length_R = parseFloat(row.Length_R) || 0;
          const length_L = parseFloat(row.Length_L) || 0;
          const lostWeight_R = parseFloat(row.LostWeight_R) || 0;
          const lostWeight_L = parseFloat(row.LostWeight_L) || 0;
          const rollingLength = length_R + length_L; // 輾壓長度 (統整)
          const lostWeight = lostWeight_R + lostWeight_L; // 損料重量(統整)
          
          console.log("調試資訊 - type:", type, "lostWeight_R:", lostWeight_R, "lostWeight_L:", lostWeight_L, "lostWeight:", lostWeight);
          
          const Factor = type === 'slittingCathode' ? 0.108 : type === 'slittingAnode' ? 0.067 : 1; // 用於換算損料長度，預設為1避免除以null
          const lostLength = Factor !== null ? parseFloat((lostWeight / Factor).toFixed(2)) : 0; // 損料長度(統整)
          const yield = rollingLength > 0 ? ((rollingLength - lostLength) / rollingLength) * 100 : 0; // 平均良率
          const averageRate = row.workTime > 0 ? (rollingLength / row.workTime) : 0; // 平均速度(統整)

          console.log("我要確認 是否有 Slitting lostLength:", lostLength + " | Factor:" + Factor + " | type:" + type);

          machines[row.machineNo] = {
            machineNo: row.machineNo,
            rollingLength,
            LostLength: lostLength,
            yield: parseFloat(yield.toFixed(2)),
            averageRate: parseFloat(averageRate.toFixed(2))
          };

          totalLength_R += length_R;
          totalLength_L += length_L;
          totalLostWeight_R += lostWeight_R;
          totalLostWeight_L += lostWeight_L;
        });
      }

      // 處理最新記錄查詢結果 (results[1]) - 按機台分組
      if (results[1] && results[1][0] && results[1][0].length > 0){
        results[1][0].forEach(latestRow => {
          const machineNo = latestRow.machineNo;
          const lotNumber = latestRow.lotNumber;
          const lastSubmitTime = latestRow.employee_InputTime;
          const memberNumber = latestRow.memberNumber;

          // 將最新記錄資訊添加到對應的機台
          if (machines[machineNo]) {
            machines[machineNo] = {
              ...machines[machineNo],
              lotNumber,
              lastSubmitTime,
              memberNumber
            };
          }
        });
      }


      const grandTotalLength = totalLength_R + totalLength_L;
      const grandTotalLostWeight = totalLostWeight_R + totalLostWeight_L;
      const grandTotalLostLengthFactor = type === 'slittingCathode' ? 0.108 : type === 'slittingAnode' ? 0.067 : 1;
      const grandTotalLostLength = grandTotalLostWeight / grandTotalLostLengthFactor;
      const grandTotalYield = grandTotalLength > 0 ? ((grandTotalLength - grandTotalLostLength) / grandTotalLength) * 100 : 0;

      return {
        machines,
        summary: {
          totalLength_R,
          totalLength_L,
          totalLength: grandTotalLength,
          totalLostWeight_R,
          totalLostWeight_L,
          totalLostWeight: grandTotalLostWeight,
          totalLostLength: grandTotalLostLength,
          totalYield: parseFloat(grandTotalYield.toFixed(2)),
        }
      };
    };

    // 處理所有結果
    const rollingCathodeData = processRollingData(rollingCathodeResult, 'rollingCathode');
    const rollingAnodeData = processRollingData(rollingAnodeResult, 'rollingAnode');
    const slittingCathodeData = processSlittingData(slittingCathodeResult, 'slittingCathode');
    const slittingAnodeData = processSlittingData(slittingAnodeResult, 'slittingAnode');

    console.log("處理後的查詢結果:", {
      rollingCathodeData,
      rollingAnodeData,
      slittingCathodeData,
      slittingAnodeData
    });

    // 組裝最終結果
    const result = {
      RollingCathode: rollingCathodeData,
      RollingAnode: rollingAnodeData,
      SlittingCathode: slittingCathodeData,
      SlittingAnode: slittingAnodeData
    };

    console.log("最終結果:", result);

    

    res.status(200).json({
      success: true,
      message: "及時戰報獲取成功",
      dayShift: shift,
      startTime: nowDate_S,
      endTime: nowDate_E,
      
      data: result,
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
        dayShift: shift,
        timeRange: { start: nowDate_S, end: nowDate_E },
        engineerId: engineerIdSet,
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
            LIMIT ? OFFSET ?`;
    sqlCount = `SELECT COUNT(*) AS totalCount FROM mes.rollinganode_batch 
                WHERE (is_deleted IS NULL OR is_deleted = 0) 
                  AND (stock IS NULL OR stock = 0) 
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
                    AND engineerId = ?
                    AND lotNumber_R IS NOT NULL AND lotNumber_R <> ''
                    AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_R', 'user_delete_both'))
                  UNION ALL
                  SELECT id FROM mes.slittingcathode_batch
                  WHERE (is_deleted IS NULL OR is_deleted = 0)
                    AND (stock_L IS NULL OR stock_L = 0)
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

    const [result] = await dbmes.promise().query(sql, queryParams);
    const [countResult] = await dbmes.promise().query(sqlCount, countParams);
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
        
        const [rResult] = await dbmes.promise().query(rSql, rIds);
        affectedRowsTotal += rResult.affectedRows;
        results.push({ side: 'R', affectedRows: rResult.affectedRows });
      }

      // 更新 L 側 (stock_L = 1)
      if (lIds.length > 0) {
        const lPlaceholders = lIds.map(() => '?').join(',');
        const lSql = `UPDATE ${table} SET stock_L = 1 WHERE id IN (${lPlaceholders})`;
        console.log("L側 SQL:", lSql, "參數:", lIds);
        
        const [lResult] = await dbmes.promise().query(lSql, lIds);
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
    const [result] = await dbmes.promise().query(sql, selectIds);
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
      sql = `SELECT lotNumber FROM coatingcathode_batch where (is_deleted IS NULL OR is_deleted = 0) AND stock = 1 and is_received NOT IN (1 , 2) ORDER BY id DESC LIMIT 100`;
      break;
    case "slittingAnode":
      sql = `SELECT lotNumber FROM coatinganode_batch where (is_deleted IS NULL OR is_deleted = 0) AND stock = 1 and is_received NOT IN (1 , 2) ORDER BY id DESC LIMIT 100`;
      break;
  }


  
  try{

    const [result] = await dbmes.promise().query(sql);
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
    const [result] = await dbmes.promise().query(sql);
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


  const row = await dbmes.promise().query(sql, deleteItems);
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


module.exports = router;
