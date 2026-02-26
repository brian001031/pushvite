const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs");
const moment = require("moment");
const schedule = require("node-schedule");
const xlsx = require("xlsx");
const path = require("path");
const { json } = require("body-parser");
const { warn } = require("console");
const { conforms } = require("lodash");

// 讀取 .env 檔案
const envPath = path.resolve(__dirname, "../.env");
let envContent = fs.readFileSync(envPath, "utf-8");

// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js");     // hr 資料庫
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫

let Mixingdigram_SearchData = [];


// 獲取伺服器 IP 地址的函數
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

const mapToFloatArray = (data) => {
  return Object.entries(data)
    .filter(([key]) => key !== "type") // 排除 type 欄位
    .map(([_, value]) => {
      const num = parseFloat(value);
      return Number.isFinite(num) ? num : ""; //轉回浮點數格式
    });
};

//權限擁有人(engineer)清單
const engineer_foremanlist = [
  "349|周柏全",
  "068|洪彰澤",
  "003|陳昱昇",
  "109|黃之奕",
  "292|張宇翔",
  "255|林冠達",
  "264|張庭瑋",
  '374|郭鴻寬',
];
const discord_mixing_notify = process.env.discord_mixing_notify;
const discord_mixing_LotNoChange = process.env.discord_mixing_LotNoChange || "";
const nowDay = moment().locale("zh-tw").format("YYYY-MM-DD HH:mm:ss");

// 格式化時間欄位的函數
const formatTimeFields = (data) => {

  // if (!data || !Array.isArray(data)) return data;

  console.log ("formatTimeFields data  :" , data );

  return data.map((row) => {
    const formattedRow = { ...row };

    // 需要格式化的時間欄位
    const timeFields = [
      "Date",
      "BatchStart",
      "BatchEnd",
      "TransportStart",
      "TransportEnd",
      "FinalTime",
    ];

    timeFields.forEach((field) => {
      if (formattedRow[field]) {
        formattedRow[field] = moment(formattedRow[field])
          .tz("Asia/Taipei")
          .format("YYYY-MM-DD HH:mm:ss");
      }
    });

    return formattedRow;
  });
};

// // 每天中午12點執行混漿批次統計並發送 Discord 通知
schedule.scheduleJob({ hour: 12, minute: 0 }, async () => {
  console.log("每天中午12點執行的計算任務");

  const currentIP = getServerIP();
    const allowedIP = '192.168.3.207';
    
    if (currentIP !== allowedIP) {
        console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
        return;
    }

  // 計算昨天12:00到今天12:00的時間範圍
  const today12pm = moment().hour(12).minute(0).second(0).millisecond(0);
  const yesterday12pm = moment(today12pm).subtract(1, "day");

  // 此排程其餘邏輯目前被註解停用；先在這裡結束排程函式，避免語法括號不平衡
});

//   console.log(
//     `統計時間範圍: ${yesterday12pm.format(
//       "YYYY-MM-DD HH:mm:ss"
//     )} 到 ${today12pm.format("YYYY-MM-DD HH:mm:ss")}`
//   );

//   const sql_Cathode = `
//     SELECT 
//       deviceNo_Mixing,
//       COUNT(*) AS count
//     FROM mes.mixingcathode_batch 
//     WHERE BatchStart >= ? AND BatchStart < ?
//       AND deviceNo_Mixing IS NOT NULL 
//       AND deviceNo_Mixing != ''
//     GROUP BY deviceNo_Mixing
//     ORDER BY deviceNo_Mixing
//   `;

//   const sql_Anode = `
//     SELECT 
//       deviceNo_Mixing,
//       COUNT(*) AS count
//     FROM mes.mixinganode_batch 
//     WHERE BatchStart >= ? AND BatchStart < ?
//       AND deviceNo_Mixing IS NOT NULL 
//       AND deviceNo_Mixing != ''
//     GROUP BY deviceNo_Mixing
//     ORDER BY deviceNo_Mixing
//   `;

//   try {
//     let Message_notify = "";
//     const config_Discord = {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//         Authorization: `Bearer ${process.env.discord_botToken}`,
//       },
//     };
//     const [cathodeResults] = await dbmes.query(sql_Cathode, [
//       yesterday12pm.format("YYYY-MM-DD HH:mm:ss"),
//       today12pm.format("YYYY-MM-DD HH:mm:ss"),
//     ]);

//     const [anodeResults] = await dbmes.query(sql_Anode, [
//       yesterday12pm.format("YYYY-MM-DD HH:mm:ss"),
//       today12pm.format("YYYY-MM-DD HH:mm:ss"),
//     ]);

//     // 計算總數量
//     const cathodeCount = cathodeResults.reduce(
//       (total, row) => total + row.count,
//       0
//     );
//     const anodeCount = anodeResults.reduce(
//       (total, row) => total + row.count,
//       0
//     );

//     console.log("正極混漿批次數量:", cathodeCount);
//     console.log("負極混漿批次數量:", anodeCount);
//     console.log("正極設備分組詳情:", cathodeResults);
//     console.log("負極設備分組詳情:", anodeResults);

//     // 格式化設備產量詳情
//     const formatDeviceDetails = (results, type) => {
//       if (results.length === 0) return `${type}: 無設備記錄`;
//       return results
//         .map((row) => `  設備 ${row.deviceNo_Mixing}: ${row.count} 批次`)
//         .join("\n");
//     };

//     Message_notify = `
// ============================================================================================ 
// 混漿生產日報 - ${yesterday12pm.format("YYYY-MM-DD")} 12:00 ~ ${today12pm.format(
//       "YYYY-MM-DD"
//     )} 12:00 📢📢

// 正極混漿批次數量: ${cathodeCount} 批次
// ${formatDeviceDetails(cathodeResults, "正極設備明細")}

// 負極混漿批次數量: ${anodeCount} 批次
// ${formatDeviceDetails(anodeResults, "負極設備明細")}

// 總計批次數量: ${cathodeCount + anodeCount} 批次

// 統計時間: ${moment().locale("zh-tw").format("YYYY-MM-DD HH:mm:ss")}
// ============================================================================================
//     `;

//     if (Message_notify && discord_mixing_notify) {
//       await axios.post(
//         discord_mixing_notify,
//         { content: Message_notify },
//         config_Discord
//       );
//       console.log("Discord 通知已發送");
//     } else {
//       console.log("Discord webhook URL 未設定，無法發送通知");
//     }
//   } catch (error) {
//     console.error("Error executing scheduled task:", error);
//   }
// });

// CathNode正極混漿取指定欄位
const CathNodeMixKeyNeed = [
  "BatchStart",
  "EngineerName",
  "EngineerNo",
  "BatchEnd",
  "TransportStart",
  "TransportEnd",
  "loadingTankNo",
  "System_Step",
  "ReturnStatus",
  "Member01_Name",
  "Member01_No",
  "Member02_Name",
  "Member02_No",
  "LFP_1",
  "LFP_2",
  "SuperP_1",
  "SuperP_2",
  "PVDF_1",
  "PVDF_2",
  "CNT_1",
  "CNT_2",
  "CNT_3",
  "CNT_4",
  "NMP_1",
  "NMP_2",
  "Date",
  "LotNo",
  "Nvalue",
  "Viscosity",
  "ParticalSize",
  "SolidContent",
  "FinalTime",
  "ProductionType",
  "NMP_1_Loading_Weight",
  "NMP_2_Loading_Weight",
  "CNT_1_Loading_Weight",
  "NMP_3",
  "ReceipeNo",
  "deviceNo_Mixing",
  "deviceNo_surgeTank",
  "Recipe",
  "ListNo",
  "Filter_Mesh",
  "batch_time_min_Smaller",
  "batch_time_min_Bigger",
  "batch_time_diff",
  "errorReason",
];

// Anode負極混漿取指定欄位
const AnodeMixKeyNeed = [
  "BatchStart",
  "EngineerName",
  "EngineerNo",
  "BatchEnd",
  "TransportStart",
  "TransportEnd",
  "loadingTankNo",
  "System_Step",
  "ReturnStatus",
  "Member01_Name",
  "Member01_No",
  "Member02_Name",
  "Member02_No",
  "Graphite1_1",
  "Graphite1_2",
  "Super_P_1",
  "Super_P_2",
  "CMC_1",
  "CMC_2",
  "Graphite_2_1",
  "Graphite_2_2",
  "SBR_1",
  "SBR_2",
  "NMP_1_1",
  "NMP_1_2",
  "PAA_1",
  "PAA_2",
  "Date",
  "LotNo",
  "FinalTime",
  "Nvalue",
  "Viscosity",
  "ParticalSize",
  "SolidContent",
  "ProductionType",
  "ReceipeNo",
  "deviceNo_Mixing",
  "deviceNo_surgeTank",
  "Recipe",
  "Filter_Mesh",
  "batch_time_min_Smaller",
  "batch_time_min_Bigger",
  "Water_1_LoadingWeight",
  "Water_2_LoadingWeight",
  "NMP",
  "Water_3_LoadingWeight",
  "ListNo",
  "batch_time_diff",
  "errorReason",
];

function buildUpsertSQL(tableName, keys) {
  const columns = keys.join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const updates = keys
    .filter((key) => key !== "ReturnStatus")
    .map((key) => `${key} = VALUES(${key})`)
    .join(",\n        ");

  return ` INSERT INTO ${tableName} (${columns})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${updates}`;
}

// 共用函式：根據欄位從 body 抽出值
function extractValues(body, keys) {
  return keys.map((key) => body[key] ?? null);
}


// 轉換 工程師設定 (SV) , OP輸入 (PV) 
const searchForIsoForm = (rows) => {
  for (let row of rows) {
        // 工程師設定 -- start
        if (row.hasOwnProperty('Nvalue_Engineer_S')) {
          row['Nvalue_Start(SV)'] = row.Nvalue_Engineer_S; 
          delete row.Nvalue_Engineer_S;
        }
        if (row.hasOwnProperty('Nvalue_Engineer_E')) {
          row['Nvalue_End(SV)'] = row.Nvalue_Engineer_E; 
          delete row.Nvalue_Engineer_E;
        }
        if (row.hasOwnProperty('Viscosity_Engineer_S')) {
          row['Viscosity_Start(SV)'] = row.Viscosity_Engineer_S;
          delete row.Viscosity_Engineer_S;
        }
        if (row.hasOwnProperty('Viscosity_Engineer_E')) {
          row['Viscosity_End(SV)'] = row.Viscosity_Engineer_E;
          delete row.Viscosity_Engineer_E;
        }
        if (row.hasOwnProperty('ParticalSize_Engineer_S')) {
          row['ParticalSize_Start(SV)'] = row.ParticalSize_Engineer_S;
          delete row.ParticalSize_Engineer_S;
        }
        if (row.hasOwnProperty('ParticalSize_Engineer_E')) {
          row['ParticalSize_End(SV)'] = row.ParticalSize_Engineer_E;
          delete row.ParticalSize_Engineer_E;
        }
        if (row.hasOwnProperty('SolidContent_Engineer_S')) {
          row['SolidContent_Start(SV)'] = row.SolidContent_Engineer_S;
          delete row.SolidContent_Engineer_S;
        }
        if (row.hasOwnProperty('SolidContent_Engineer_E')) {
          row['SolidContent_End(SV)'] = row.SolidContent_Engineer_E;
          delete row.SolidContent_Engineer_E;
        }
        // 工程師設定 -- end
        // OP輸入 -- start
        if (row.hasOwnProperty('Nvalue')) {
          row['Nvalue(PV)'] = row.Nvalue;
          delete row.Nvalue;
        }
        if (row.hasOwnProperty('Viscosity')) {
          row['Viscosity(PV)'] = row.Viscosity;
          delete row.Viscosity;
        }
        if (row.hasOwnProperty('ParticalSize')) {
          row['ParticalSize(PV)'] = row.ParticalSize;
          delete row.ParticalSize;
        }
        if (row.hasOwnProperty('SolidContent')) {
          row['SolidContent(PV)'] = row.SolidContent;
          delete row.SolidContent;
        }
        // OP輸入 -- end
      }
      console.log("searchForIsoForm outPut" , Object.entries(rows).map(([key, value]) => `${key}: ${value}`));
  return rows;
}

const changeTime = () =>{

  let dayShift = "";
  let startTime = "";
  let endTime = "";
  let timeResult = [];

  const now = moment().tz('Asia/Taipei');

  if (now.hour() >= 8 && now.hour() < 20) {
    dayShift = "早班";
    startTime = now.clone().hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    endTime = now.clone().hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    timeResult.push(dayShift, startTime, endTime);
  }
  else {
    dayShift = "晚班";
    startTime = now.clone().subtract(now.hour() < 8 ? 1 : 0, 'day').hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    endTime = now.clone().hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    timeResult.push(dayShift, startTime, endTime);
  }
  return timeResult;
}
const changePast_data = (startDate, endDay, dayShift) => {
  let start = "";
  let end = "";

  switch(dayShift) {
    case "早班":
      start = moment(startDate).tz('Asia/Taipei').format('YYYY-MM-DD 08:00:00');
      end = moment(endDay).tz('Asia/Taipei').format('YYYY-MM-DD 20:00:00');
      break;
    case "晚班":
      start = moment(startDate).tz('Asia/Taipei').format('YYYY-MM-DD 20:00:00');
      end = moment(endDay).tz('Asia/Taipei').add(1, 'day').format('YYYY-MM-DD 08:00:00');
      break;
    default:
      start = moment(startDate).tz('Asia/Taipei').format('YYYY-MM-DD 00:00:00');
      end = moment(endDay).tz('Asia/Taipei').format('YYYY-MM-DD 23:59:59');
  }
  
  return { start, end };
}

//註冊混槳使用者(只有工程師)
router.post("/Register", async (req, res) => {
  try {
    const { engineer_id, engineer_name, password } = req.body;
    const fix_3size_enginneerID = engineer_id.toString().padStart(3, "0");

    // 檢查工程師是否在權限清單中
    if (
      !engineer_foremanlist.includes(
        `${fix_3size_enginneerID}|${engineer_name}`
      )
    ) {
      return res.status(401).json({
        error: `工號:${fix_3size_enginneerID} ${engineer_name}無法註冊,權限僅工程師身份`,
      });
    }

    // 檢查是否已存在相同的 engineer_id
    const [existingUser] = await dbcon.query(
      "SELECT * FROM mixing_register WHERE EngineerNo = ?",
      [fix_3size_enginneerID]
    );

    if (existingUser.length > 0) {
      return res.status(402).json({
        status: 402,
        message: `工號:${fix_3size_enginneerID} 已存在,請勿重複註冊`,
      });
    }

    // 使用 bcrypt 加密密碼
    // const hashedPassword = await bcrypt.hash(password, 10);
    // 插入新使用者資料
    //     selectMixing: "正極混漿"
    // selectMixing: "負極混漿"

    const reg_sql = `
    INSERT INTO mixing_register (EngineerNo, EngineerName, Password, MixingSelect) 
    VALUES 
      ('${fix_3size_enginneerID}', '${engineer_name}', '${password}', '正極混漿'),
      ('${fix_3size_enginneerID}', '${engineer_name}', '${password}', '負極混漿');
  `;

    await dbcon.query(reg_sql);

    res.status(200).json({
      message: `工號:${fix_3size_enginneerID} ${engineer_name} 混槳操作站註冊成功`,
    });
  } catch (error) {
    console.error("Error in /Register:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//登入混槳使用者(工程師或OP)
router.get("/Login", async (req, res) => {
  let check_Isenginneer;
  try {
    const { engineer_id, engineer_name, password, mix_select_side } = req.query;
    console.log("Login attempt:", {
      engineer_id,
      engineer_name,
      mix_select_side,
      password,
    });

    const fix_3size_enginneerID = engineer_id.toString().padStart(3, "0");

    // 查詢混槳資料
    const [rows_mix_reg] = await dbcon.query(
      "SELECT * FROM hr.mixing_register WHERE EngineerNo = ?",
      [fix_3size_enginneerID]
    );
    const [mainAuth_ped] = await dbcon.query(
      "SELECT originalpasswd , memberID FROM hr.schedule_reginfo WHERE memberID = ?",
      [fix_3size_enginneerID]
    )

    if (rows_mix_reg.length === 0) {
      if (
        engineer_foremanlist.includes(
          `${fix_3size_enginneerID}|${engineer_name}`
        )
      ) {
        return res.status(401).json({
          error: `工號:${fix_3size_enginneerID} ${engineer_name}請先註冊,判定確認為工程師身份!`,
        });
      }
    }
    // 檢查是否為工程師身份
    if (
      !engineer_foremanlist.includes(
        `${fix_3size_enginneerID}|${engineer_name}`
      ) &&
      rows_mix_reg.length === 0
    ) {
      // 代表是OP身份
      check_Isenginneer = false;
    } else {
      //代表是工程師身份
      check_Isenginneer = true;
    }
    const mix_engineer_regino = rows_mix_reg[0];


    // 確認工號正確才往下走
    if (fix_3size_enginneerID !== rows_mix_reg[0]?.EngineerNo 


    ) {
      return res.status(401).json({
        error: `工號不正確，請確認輸入的工號與註冊資料一致`,
      });
    }

    // 檢查密碼是否正確
    if (
      mainAuth_ped[0]?.originalpasswd !== password 
    ) {
      return res.status(402).json({
        error: "密碼錯誤，請確認輸入的密碼是否正確",
      });
    }

    const [rows_mix_dataset] = await dbcon.query(
      "SELECT * FROM mixing_register WHERE EngineerName = ? AND MixingSelect = ? ",
      [engineer_name, mix_select_side]
    );

    console.log("rows_mix_dataset:", JSON.stringify(rows_mix_dataset, null, 2));
    res.status(200).json({
      data: rows_mix_dataset[0],
      message: `工程師工號:${fix_3size_enginneerID} ${engineer_name} ${mix_select_side} 登入成功`,
      // token: token,
      EngineerLoginStaus: check_Isenginneer,
    });
  } catch (error) {
    //  console.error("Error Mix Login:", error);
    res.status(500).json({ error: "Error Mix Login" });
  }
});

//修改混槳工作序參數設定值
router.put("/set_engineerDataSet", async (req, res) => {
  const mixparamList = req.body;
  console.log(
    "要修正/包含第一次新增 mixparamList = ",
    JSON.stringify({ mixparamList }, null, 2)
  );

  // 取指定欄位
  const MixKeyNeed = [
    "Submittime",
    "EngineerName",
    "EngineerNo",
    "Password",
    "ProductionType",
    "MixingSelect",
    "ReceipeNo",
    "deviceNo_Mixing",
    "deviceNo_surgeTank",
    "Recipe",
    "Filter_Mesh",
    "batch_time_min_Smaller",
    "batch_time_min_Bigger",
    "Water_1_LoadingWeight",
    "Water_2_LoadingWeight",
    "Water_3_LoadingWeight",
    "NMP",
    "NMP_1_Loading_Weight",
    "NMP_2_Loading_Weight",
    "CNT_1_Loading_Weight",
    "NMP_3",
    "loadingTankNo",
    "ListNo",


    // common settings
    "Nvalue_Engineer_S",
    "Nvalue_Engineer_E",
    "SolidContent_Engineer_S",
    "SolidContent_Engineer_E",
    "Viscosity_Engineer_S",
    "Viscosity_Engineer_E",
    "ParticalSize_Engineer_S",
    "ParticalSize_Engineer_E",

  ];

  const MixUpdateParams = {};
  MixKeyNeed.forEach((key) => {
    MixUpdateParams[key] =
      mixparamList[key] !== undefined ? mixparamList[key] : null;
  });

  //針對 Submittime 日期時間欄位進行格式化
  const rawDate = mixparamList.Submittime;

  //判斷有值就格式化，否則給 null
  const formattedDate = rawDate
    ? moment(rawDate).locale("zh-tw").format("YYYY-MM-DD HH:mm:ss")
    : null;
  MixUpdateParams.Submittime = formattedDate;
  MixUpdateParams.deviceNo_Mixing = Array.isArray(
    MixUpdateParams.deviceNo_Mixing
  )
    ? MixUpdateParams.deviceNo_Mixing.join(",")
    : MixUpdateParams.deviceNo_Mixing;
  MixUpdateParams.deviceNo_surgeTank = Array.isArray(
    MixUpdateParams.deviceNo_surgeTank
  )
    ? MixUpdateParams.deviceNo_surgeTank.join(",")
    : MixUpdateParams.deviceNo_surgeTank;
  MixUpdateParams.loadingTankNo = Array.isArray(MixUpdateParams.loadingTankNo)
    ? MixUpdateParams.loadingTankNo.join(",")
    : MixUpdateParams.loadingTankNo;

  const updateParams = [
    MixUpdateParams.Submittime,
    MixUpdateParams.ProductionType,
    MixUpdateParams.ReceipeNo,
    MixUpdateParams.deviceNo_Mixing,
    MixUpdateParams.deviceNo_surgeTank,
    MixUpdateParams.Recipe,
    MixUpdateParams.Filter_Mesh,
    MixUpdateParams.batch_time_min_Smaller,
    MixUpdateParams.batch_time_min_Bigger,
    MixUpdateParams.Water_1_LoadingWeight,
    MixUpdateParams.Water_2_LoadingWeight,
    MixUpdateParams.Water_3_LoadingWeight,
    MixUpdateParams.NMP,
    MixUpdateParams.NMP_1_Loading_Weight,
    MixUpdateParams.NMP_2_Loading_Weight,
    MixUpdateParams.CNT_1_Loading_Weight,
    MixUpdateParams.NMP_3,
    MixUpdateParams.loadingTankNo,
    MixUpdateParams.ListNo,
    MixUpdateParams.EngineerName,
    MixUpdateParams.MixingSelect,
    MixUpdateParams.MixingSelect,

    // common settings
    MixUpdateParams.Nvalue_Engineer_S,
    MixUpdateParams.Nvalue_Engineer_E,
    MixUpdateParams.Viscosity_Engineer_S,
    MixUpdateParams.Viscosity_Engineer_E,
    MixUpdateParams.ParticalSize_Engineer_S,
    MixUpdateParams.ParticalSize_Engineer_E,
    MixUpdateParams.SolidContent_Engineer_S,
    MixUpdateParams.SolidContent_Engineer_E,
  ];

  try {
   
      const sql_mixparam_insert = `
        INSERT INTO hr.mixing_register (
          EngineerName,
          EngineerNo,
          MixingSelect,
          Submittime,
          ProductionType,
          ReceipeNo,
          deviceNo_Mixing,
          deviceNo_surgeTank,
          Recipe,
          Filter_Mesh,
          batch_time_min_Smaller,
          batch_time_min_Bigger,
          Water_1_LoadingWeight,
          Water_2_LoadingWeight,
          Water_3_LoadingWeight,
          NMP,
          NMP_1_Loading_Weight,
          NMP_2_Loading_Weight,
          CNT_1_Loading_Weight,
          NMP_3,
          loadingTankNo,
          ListNo,
          Nvalue_Engineer_S,
          Nvalue_Engineer_E,
          Viscosity_Engineer_S,
          Viscosity_Engineer_E,
          ParticalSize_Engineer_S,
          ParticalSize_Engineer_E,
          SolidContent_Engineer_S,
          SolidContent_Engineer_E
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
          Submittime = VALUES(Submittime),
          ProductionType = VALUES(ProductionType),
          ReceipeNo = VALUES(ReceipeNo),
          deviceNo_Mixing = VALUES(deviceNo_Mixing),
          deviceNo_surgeTank = VALUES(deviceNo_surgeTank),
          Recipe = VALUES(Recipe),
          Filter_Mesh = VALUES(Filter_Mesh),
          batch_time_min_Smaller = VALUES(batch_time_min_Smaller),
          batch_time_min_Bigger = VALUES(batch_time_min_Bigger),
          Water_1_LoadingWeight = VALUES(Water_1_LoadingWeight),
          Water_2_LoadingWeight = VALUES(Water_2_LoadingWeight),
          Water_3_LoadingWeight = VALUES(Water_3_LoadingWeight),
          NMP = VALUES(NMP),
          NMP_1_Loading_Weight = VALUES(NMP_1_Loading_Weight),
          NMP_2_Loading_Weight = VALUES(NMP_2_Loading_Weight),
          CNT_1_Loading_Weight = VALUES(CNT_1_Loading_Weight),
          NMP_3 = VALUES(NMP_3),
          loadingTankNo = VALUES(loadingTankNo),
          ListNo = VALUES(ListNo),
          Nvalue_Engineer_S = VALUES(Nvalue_Engineer_S),
          Nvalue_Engineer_E = VALUES(Nvalue_Engineer_E),
          Viscosity_Engineer_S = VALUES(Viscosity_Engineer_S),
          Viscosity_Engineer_E = VALUES(Viscosity_Engineer_E),
          ParticalSize_Engineer_S = VALUES(ParticalSize_Engineer_S),
          ParticalSize_Engineer_E = VALUES(ParticalSize_Engineer_E),
          SolidContent_Engineer_S = VALUES(SolidContent_Engineer_S),
          SolidContent_Engineer_E = VALUES(SolidContent_Engineer_E)
        
      `;
      
      const insertParams = [
        MixUpdateParams.EngineerName,
        MixUpdateParams.EngineerNo,
        MixUpdateParams.MixingSelect,
        MixUpdateParams.Submittime,
        MixUpdateParams.ProductionType,
        MixUpdateParams.ReceipeNo,
        MixUpdateParams.deviceNo_Mixing,
        MixUpdateParams.deviceNo_surgeTank,
        MixUpdateParams.Recipe,
        MixUpdateParams.Filter_Mesh,
        MixUpdateParams.batch_time_min_Smaller,
        MixUpdateParams.batch_time_min_Bigger,
        MixUpdateParams.Water_1_LoadingWeight,
        MixUpdateParams.Water_2_LoadingWeight,
        MixUpdateParams.Water_3_LoadingWeight,
        MixUpdateParams.NMP,
        MixUpdateParams.NMP_1_Loading_Weight,
        MixUpdateParams.NMP_2_Loading_Weight,
        MixUpdateParams.CNT_1_Loading_Weight,
        MixUpdateParams.NMP_3,
        MixUpdateParams.loadingTankNo,
        MixUpdateParams.ListNo,
        MixUpdateParams.Nvalue_Engineer_S,
        MixUpdateParams.Nvalue_Engineer_E,
        MixUpdateParams.Viscosity_Engineer_S,
        MixUpdateParams.Viscosity_Engineer_E,
        MixUpdateParams.ParticalSize_Engineer_S,
        MixUpdateParams.ParticalSize_Engineer_E,
        MixUpdateParams.SolidContent_Engineer_S,
        MixUpdateParams.SolidContent_Engineer_E
      ];


      console.log("insertParams SQL:", insertParams);
      [result] = await dbcon.query(sql_mixparam_insert, insertParams);
      console.log("Put update engineerDataSet result:", result);

      res.status(200).json({
        message: `工程師:${MixUpdateParams.EngineerName} ${MixUpdateParams.MixingSelect} 混槳參數設定更新成功`,
        
      })

  } catch (error) {
    // console.error("Error put update engineerDataSet:", error);
    res.status(500).json({ error: "put mix engineerDataSet error" });
    throw error;
  }
});

//混槳主要批次畫面依據前端提供(工程師名稱和選擇正負極Mix切換數據表單)
router.get("/mixingInfo_inner_get", async (req, res) => {
  const { engineer_name, mix_select_side } = req.query;
  console.log("params", engineer_name + " | " + mix_select_side);

  try {
    //目前只需要將Mix選擇其一
    const Mix_batch_table =
      mix_select_side.indexOf("正極混漿") !== -1
        ? "mixingcathode_batch"
        : "mixinganode_batch";

    //將主表批次紀錄資料擷取並回傳
    const [mixinfo_inner_alldata] = await dbmes.query(
      `SELECT * FROM ${Mix_batch_table} WHERE EngineerName = ? AND System_Step NOT IN ('5', '-1', 'error') AND ReturnStatus != '' ORDER BY id DESC`,
      [engineer_name]
    );

    //都將目前搜尋的結果數據回傳前端,即便是空資料
    const hasData = mixinfo_inner_alldata.length > 0;
    const message =
      `工程師:${
        mixinfo_inner_alldata[0]?.EngineerName || engineer_name
      } ${mix_select_side}分配工作批次` +
      (hasData ? "尚未完成進度資訊回傳前端" : "第一次執行批次");

    // console.log("原始資料可用於參考  : " , JSON.stringify(mixinfo_inner_alldata, null, 2));

    const dataFinalSend = mixinfo_inner_alldata.filter(
      (data) =>
        data.loadingTankNo === null ||
        (data.System_Step !== "5" && data.loadingTankNo !== null)
    );

    // 格式化時間欄位並排除 errorReason 欄位
    const formattedData = formatTimeFields(dataFinalSend).map((row) => {
      const { errorReason, ...rowWithoutErrorReason } = row;
      return rowWithoutErrorReason;
    });
    
    console.log("formattedData to send:", JSON.stringify(formattedData, null, 2));  

    res.status(200).json({
      data: formattedData,
      message,
    });
  } catch (error) {
    res.status(500).json({ error: "mixingInfo_inner_get error" });
  }
});

// 為了 1F 設定的 API GET

//混槳主要批次畫面依據前端提供(工程師名稱和選擇正負極Mix切換數據表單)
router.get("/mixingInfo_CheckType", async (req, res) => {
  const { engineer_name, mix_select_side } = req.query;

  console.log(
    "engineer_name:",
    engineer_name,
    "| typeof:",
    typeof engineer_name,
    "| length:",
    engineer_name.length
  );
  console.log(
    "mix_select_side:",
    mix_select_side,
    "| typeof:",
    typeof mix_select_side,
    "| length:",
    mix_select_side.length
  );
  try {
    //目前只需要將Mix選擇其一
    const Mix_batch_table =
      mix_select_side.indexOf("正極混漿") !== -1
        ? "mixingcathode_batch"
        : "mixinganode_batch";

    const [mixinfo_inner_alldata] = await dbmes.query(
      `
          SELECT * 
          FROM ${Mix_batch_table} 
          WHERE EngineerName = ?
        AND (
          loadingTankNo IS NULL OR TRIM(loadingTankNo) = '' 
          OR deviceNo_surgeTank IS NULL OR TRIM(deviceNo_surgeTank) = ''
        )
          ORDER BY id DESC;
          `,
      [engineer_name]
    );

    // console.log("查詢結果:", JSON.stringify(mixinfo_inner_alldata, null, 2));

    //都將目前搜尋的結果數據回傳前端,即便是空資料
    const hasData = mixinfo_inner_alldata.length > 0;
    const message =
      `工程師:${
        mixinfo_inner_alldata[0]?.EngineerName || engineer_name
      } ${mix_select_side}分配工作批次` +
      (hasData ? "尚未完成進度資訊回傳前端" : "第一次執行批次");

    // console.log("原始資料可用於參考  : " , JSON.stringify(mixinfo_inner_alldata, null, 2));

    // 格式化時間欄位並排除 errorReason 欄位
    const formattedData = formatTimeFields(mixinfo_inner_alldata).map((row) => {
      const { errorReason, ...rowWithoutErrorReason } = row;
      return rowWithoutErrorReason;
    });

    res.status(200).json({
      data: formattedData,
      message,
    });
  } catch (error) {
    res.status(500).json({ error: "mixingInfo_inner_get error" });
  }
});

router.get("/getEngineerName", async (req, res) => {
  const { employeeNo } = req.query;
  console.log("getEngineerName employeeNo:", employeeNo);

  try {
    if (!employeeNo) {
      return res.status(400).json({ message: "缺少 employee No. 參數" });
    }

    const numbers = employeeNo.split(",").map((number) => number.trim()); // 使用 split() 方法分割字串

    for (let number of numbers) {
      const [rows] = await dbcon.query(
        `SELECT memberName FROM hr.hr_memberinfo WHERE memberID = ?`,
        [number]
      );

      if (rows.length > 0) {
        return res.status(200).json({
          // 使用 return 停止迴圈
          data: rows,
          message: `找到符合條件人員: ${employeeNo} | ${rows[0].memberName}`,
        });
      }
    }

    res.status(404).json({
      message: "沒有找到符合條件的人員",
    });
  } catch (error) {
    console.error("Error searching engineer by name:", error);
    res.status(500).json({ error: "Error searching engineer by name" });
  }
});

router.post("/mixingInfo_inner_post", async (req, res) => {
  const body = req.body;
  const { MixingSelect, System_Step, ReturnStatus , warningData } = body;


  // 調試：檢查是否收到 errorReason
  console.log("收到的 body:", JSON.stringify(body, null, 2));
  

  if (!MixingSelect || !System_Step || !ReturnStatus) {
    return res.status(400).json({
      error: "缺少必要欄位：MixingSelect、System_Step 或 ReturnStatus",
    });
  }

  try {
    let tableName, keys;
    let Message_notify = "";
    const config_Discord = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.discord_botToken}`,
      },
    };

    if (System_Step === "1") {
      Message_notify = `


${body.MixingSelect}啟動生產通知 📢📢

投入生產批號${body.LotNo}
混漿人員 ${body.Member01_Name}|${body.Member01_No}
混漿啟動時間 ${moment(body.BatchStart)
        .locale("zh-tw")
        .format("YYYY-MM-DD HH:mm:ss")}

============================================================================================        
`;
    } else if (System_Step === "2") {
      Message_notify = `

${body.MixingSelect}啟動生產通知 📢📢

生產批號${body.LotNo}。
混漿人員(2 Floor) ${body.Member01_Name}|${body.Member01_No}
混漿人員(1 Floor) ${body.Member02_Name}|${body.Member02_No}
混漿啟動時間 ${moment(body.BatchStart)
        .locale("zh-tw")
        .format("YYYY-MM-DD HH:mm:ss")}
混漿結束時間 ${moment(body.BatchEnd)
        .locale("zh-tw")
        .format("YYYY-MM-DD HH:mm:ss")}
N值 (N value) :  ${body.Nvalue}
粘度 (Viscosity) : ${body.Viscosity}
顆粒大小 (Partical Size) : ${body.ParticalSize}
固體含量 (Solid Content) : ${body.SolidContent}
下料桶槽號 (Loading Tank No) : ${body.loadingTankNo}
裝置號 (Device No) : ${body.deviceNo}
Machine Recipe : ${body.Recipe}
發送時間: ${body.Date}

============================================================================================
`;
    } else if (System_Step === "5") {
      Message_notify = `

${body.MixingSelect}啟動生產通知 📢📢

生產批號${body.LotNo}。
混漿人員 ${body.Member01_Name}|${body.Member01_No}
混漿啟動時間 ${moment(body.BatchStart)
        .locale("zh-tw")
        .format("YYYY-MM-DD HH:mm:ss")}
混漿結束時間 ${moment(body.BatchEnd)
        .locale("zh-tw")
        .format("YYYY-MM-DD HH:mm:ss")}
輸送起始時間 ${moment(body.TransportStart)
        .locale("zh-tw")
        .format("YYYY-MM-DD HH:mm:ss")}
輸送結束時間 ${moment(body.TransportEnd)
        .locale("zh-tw")
        .format("YYYY-MM-DD HH:mm:ss")}
N值 (N value) :  ${body.Nvalue}
粘度 (Viscosity) : ${body.Viscosity}
顆粒大小 (Partical Size) : ${body.ParticalSize}
固體含量 (Solid Content) : ${body.SolidContent}
下料桶槽號 (Loading Tank No) : ${body.loadingTankNo}
裝置號 (Device No) : ${body.deviceNo}
Machine Receipe : ${body.Recipe}
發送時間: ${nowDay}

============================================================================================
`;
    }

    // 檢查混漿結束時間是否少於預期時間或多於預期時間 10 分鐘，若是則發送警告
    if (body.BatchEnd && body.BatchStart && body.batch_time_min_Smaller) {
      const batchEndTime = moment(body.BatchEnd);
      const batchStartTime = moment(body.BatchStart);
      const expectedDurationSmaller = Number(body.batch_time_min_Smaller);
      const expectedDurationBigger = Number(body.batch_time_min_Bigger);
      const expectedDurationMs = expectedDurationSmaller * 60 * 1000;
      const actualDurationMs = batchEndTime.diff(batchStartTime);

      if (actualDurationMs < expectedDurationMs) {
        Message_notify += `
警告 ❗❗: 混漿時間少於預期的 ${expectedDurationSmaller} 分鐘，請檢查混漿過程是否正常。

============================================================================================
    `;
      } else if (actualDurationMs > expectedDurationMs + 10 * 60 * 1000) {
        Message_notify += `
警告 ❗❗: 混漿時間多於預期的 ${
          expectedDurationBigger + 10
        } 分鐘，請檢查混漿過程是否正常。

============================================================================================
    `;
      }
    }

  let warningData_Json = [];
  if (warningData) {
    try {
      warningData_Json = JSON.parse(warningData);
      console.log("收到的 warningData 長度:", warningData_Json.length);
      console.log("解析後的 warningData_Json:", JSON.stringify(warningData_Json, null, 2));

      // 收集所有警告訊息
      const warningMessages = [];
      
      warningData_Json.forEach((warning, index) => {
        console.log(`警告 ${index + 1}:`, warning);
        
        const warningMessage = `
警告 ${index + 1} ❗❗: 混漿參數異常通知 📢📢

生產批號: ${warning.lotNumber}
混漿人員: ${body.Member01_Name} | ${body.Member01_No}
異常參數名稱: ${warning.errorPosition}
異常參數值: ${warning.value}
異常說明: ${warning.errorText}
============================================================================================
        `;
        
        warningMessages.push(warningMessage);
      });

      // 合併所有警告訊息
      if (warningMessages.length > 0) {
        Message_notify = warningMessages.join('\n');
      }

    } catch (error) {
      console.error("warningData JSON 解析失敗:", error);
      console.error("原始 warningData:", warningData);
    }
  }


    if (MixingSelect === "正極混漿") {
      tableName = "mixingcathode_batch";
      keys = CathNodeMixKeyNeed;
    } else if (MixingSelect === "負極混漿") {
      tableName = "mixinganode_batch";
      keys = AnodeMixKeyNeed;
    } else {
      return res.status(400).json({ error: `未知的混漿類型: ${MixingSelect}` });
    }

    const sql = buildUpsertSQL(tableName, keys);

    // 確保時間格式正確存儲
    const timeFields = [
      "Date",
      "BatchStart",
      "BatchEnd",
      "TransportStart",
      "TransportEnd",
      "FinalTime",
    ];
    timeFields.forEach((field) => {
      if (body[field]) {
        // 確保時間格式為 MySQL 標準格式
        body[field] = moment(body[field]).format("YYYY-MM-DD HH:mm:ss");
      }
    });

    if (!body.BatchStart || !body.BatchEnd) {
      console.log("缺少批次結束或開始時間");
    }

    // 在插入資料庫之前計算 batch_time_diff
    if (body.BatchStart && body.BatchEnd) {
      const batchStartTime = moment(body.BatchStart);
      const batchEndTime = moment(body.BatchEnd);
      body.batch_time_diff = batchEndTime.diff(batchStartTime, "minutes");
      console.log("計算的批次時間差:", body.batch_time_diff, "分鐘");
    }

    const values = extractValues(body, keys);

    const [result] = await dbmes.query(sql, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: `沒有資料被更新或插入，請檢查提供的數據是否正確。`,
      });
    }

    if (Message_notify) {
      await axios.post(
        discord_mixing_notify,
        { content: Message_notify },
        config_Discord
      );
    }

    res.status(200).json({
      message: `UPSERT 成功 (${MixingSelect})，影響筆數: ${result.affectedRows}`,
    });
  } catch (error) {
    console.error("UPSERT 發生錯誤：", error);
    res.status(500).json({
      error: "UPSERT 發生異常",
      detail: error.message,
      sql: error.sql,
    });
  }
});

router.get("/getEngineerSetting", async (req, res) => {
  const { engineer_id, MixingSelect } = req.query;
  console.log("getEngineerSetting engineer_id:", engineer_id);

  let engineerID_3WORD = "";
  if (engineer_id.length < 3) {
    engineerID_3WORD = engineer_id.toString().padStart(3, "0");
  }

  const sql = `
    SELECT * FROM hr.mixing_register WHERE EngineerNo = ? AND MixingSelect = ?
  `;

  try {
    const [rows] = await dbcon.query(sql, [engineerID_3WORD, MixingSelect]);

    console.log("getEngineerSetting rows:", rows);
    res.status(200).json(rows[0] || {});
  } catch (error) {
    console.error("Error fetching engineer setting:", error);
    res.status(500).json({ error: "Error fetching engineer setting" });
  }
});

router.get("/getSearchPage", async (req, res) => {
  const { option, searchTerm = "", startDate, endDay, page = 1, pageSize = 20 } = req.query;

  const start = moment(startDate).tz('Asia/Taipei').format('YYYY-MM-DD') + " 00:00:00";
  const end = moment(endDay).tz('Asia/Taipei').format('YYYY-MM-DD') + " 23:59:59";
  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;

  let sql = "";
  let params = [];

  // 決定查詢欄位
  let FinalFind = "";
  if (searchTerm && searchTerm.length > 5) {
    FinalFind = `LotNo`;
  } else if (searchTerm) {
    FinalFind = `EngineerNo`;
  }

  switch (option) {
    case "全部資料":
      sql = `
        SELECT * FROM (
          SELECT
            '負極混漿' AS MixType,
            System_Step,
            LotNo,
            Member01_Name,  
            Member01_No,
            loadingTankNo,
            Date,
            BatchStart,
            BatchEnd,
            batch_time_diff,
            TransportStart,
            TransportEnd,
            Nvalue,
            Viscosity,
            ParticalSize,
            SolidContent,
            NULL AS LFP_1, 
            NULL AS LFP_2, 
            NULL AS SuperP_1, 
            NULL AS SuperP_2, 
            NULL AS PVDF_1, 
            NULL AS PVDF_2, 
            NULL AS CNT_1, 
            NULL AS CNT_2, 
            NULL AS CNT_3, 
            NULL AS CNT_4, 
            NULL AS NMP_1, 
            NULL AS NMP_2,
            Graphite1_1, 
            Graphite1_2, 
            Super_P_1, 
            Super_P_2,
            CMC_1, CMC_2, 
            Graphite_2_1, 
            Graphite_2_2, 
            SBR_1, SBR_2, 
            NMP_1_1, 
            NMP_1_2, 
            PAA_1, 
            PAA_2,
            EngineerNo,
            EngineerName,
            id
          FROM mixinganode_batch
          WHERE System_Step <> "error" AND BatchStart BETWEEN ? AND ? ${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}
          UNION ALL
          SELECT
            '正極混漿' AS MixType,
            System_Step,
            LotNo,
            Member01_Name,  
            Member01_No,
            loadingTankNo,
            Date,
            BatchStart,
            BatchEnd,
            batch_time_diff,
            TransportStart,
            TransportEnd,
            Nvalue,
            Viscosity,
            ParticalSize,
            SolidContent,
            LFP_1, 
            LFP_2, 
            SuperP_1, 
            SuperP_2, 
            PVDF_1, 
            PVDF_2, 
            CNT_1, 
            CNT_2, 
            CNT_3, 
            CNT_4,
            NMP_1, 
            NMP_2,
            NULL AS Graphite1_1, 
            NULL AS Graphite1_2,
            NULL AS Super_P_1, 
            NULL AS Super_P_2, 
            NULL AS CMC_1, 
            NULL AS CMC_2, 
            NULL AS Graphite_2_1, 
            NULL AS Graphite_2_2, 
            NULL AS SBR_1, 
            NULL AS SBR_2, 
            NULL AS NMP_1_1, 
            NULL AS NMP_1_2, 
            NULL AS PAA_1, 
            NULL AS PAA_2,
            EngineerNo,
            EngineerName,
            id
          FROM mixingcathode_batch
          WHERE System_Step <> "error" AND BatchStart BETWEEN ? AND ? 
          ${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}
        ) AS all_mix
        ORDER BY BatchStart DESC, id DESC
        LIMIT ? OFFSET ?
      `;
      sql_count = ``
      params = searchTerm && FinalFind
        ? [start, end, `%${searchTerm}%`, start, end, `%${searchTerm}%`, limit, offset]
        : [start, end, start, end, limit, offset];
      break;
    case "正極混漿":
      sql = `
        SELECT 
          System_Step,
          LotNo,
          Member01_Name,
          Member01_No,
          BatchStart,
          BatchEnd,
          batch_time_diff,
          TransportStart,
          TransportEnd,
          Nvalue,
          Viscosity,
          ParticalSize,
          SolidContent,
          loadingTankNo,
          LFP_1,
          LFP_2,
          SuperP_1,
          SuperP_2,
          PVDF_1,
          PVDF_2,
          CNT_1,
          CNT_2,
          CNT_3,
          CNT_4,
          NMP_1,
          NMP_2,
          Date,
          Nvalue,
          Viscosity,
          ParticalSize,
          SolidContent,
          FinalTime,
          ProductionType,
          NMP_1_Loading_Weight,
          NMP_2_Loading_Weight,
          CNT_1_Loading_Weight,
          NMP_3,
          ReceipeNo,
          deviceNo_Mixing,
          deviceNo_surgeTank,
          Recipe,
          ListNo,
          Filter_Mesh,
          batch_time_min_Smaller,
          batch_time_min_Bigger,
          EngineerNo,
          EngineerName,
          id
        FROM mixingcathode_batch
        WHERE System_Step <> "error" AND BatchStart BETWEEN ? AND ?${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''} 
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      params = searchTerm && FinalFind
        ? [start, end, `%${searchTerm}%`, limit, offset]
        : [start, end, limit, offset];
      break;
    case "負極混漿":
      sql = `
        SELECT
          System_Step,
          LotNo,
          Member01_Name,
          Member01_No,
          BatchStart,
          BatchEnd,
          TransportStart,
          TransportEnd,
          Nvalue,
          Viscosity,
          ParticalSize,
          SolidContent,
          batch_time_diff,
          loadingTankNo,
          Member01_Name,
          Member01_No,
          Graphite1_1,
          Graphite1_2,
          Super_P_1,
          Super_P_2,
          CMC_1,
          CMC_2,
          Graphite_2_1,
          Graphite_2_2,
          SBR_1,
          SBR_2,
          NMP_1_1,
          NMP_1_2,
          PAA_1,
          PAA_2,
          Date,
          FinalTime,
          Nvalue,
          Viscosity,
          ParticalSize,
          SolidContent,
          ProductionType,
          ReceipeNo,
          deviceNo_Mixing,
          deviceNo_surgeTank,
          Recipe,
          Filter_Mesh,
          batch_time_min_Smaller,
          EngineerNo,
          EngineerName,
          id
        FROM mixinganode_batch
        WHERE 
        System_Step <> "error" AND
        BatchStart BETWEEN ? AND ?
        ${searchTerm && FinalFind ? `AND ${FinalFind} LIKE ?` : ''}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      params = searchTerm && FinalFind
        ? [start, end, `%${searchTerm}%`, limit, offset]
        : [start, end, limit, offset];
      break;
      case "已刪除資訊":
      sql = `
        SELECT * FROM (
          SELECT
            id,
            '負極混漿' AS MixType,
            System_Step,
            EngineerNo,
            EngineerName,
            LotNo,
            Member01_Name,  
            Member01_No
          FROM mixinganode_batch
          WHERE System_Step = "error" AND BatchStart BETWEEN ? AND ?${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}
          UNION ALL
          SELECT
            id,
            '正極混漿' AS MixType,
            System_Step,
            EngineerNo,
            EngineerName,
            LotNo,
            Member01_Name, 
            Member01_No
          FROM mixingcathode_batch
          WHERE System_Step = "error" AND BatchStart BETWEEN ? AND ?${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}
        ) AS all_mix
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      params = searchTerm && FinalFind
        ? [start, end, `%${searchTerm}%`, start, end, `%${searchTerm}%`, limit, offset]
        : [start, end, start, end, limit, offset];
      break;
    default:

  }

  try {
    const [rows] = await dbmes.query(sql, params);

    for (const row of rows) {
      // 只在資料庫沒有 batch_time_diff 或為空時才計算
      if ((!row["batch_time_diff"] || row["batch_time_diff"] === "") && row["BatchStart"] && row["BatchEnd"]) {
        const batchStartTime = moment(row["BatchStart"]).tz("Asia/Taipei");
        const batchEndTime = moment(row["BatchEnd"]).tz("Asia/Taipei");
        row["batch_time_diff"] = batchEndTime.diff(batchStartTime, "minutes");
      }
    }
    console.log("Fetched rows:", rows);

    // 計算總筆數
    let sql_Count = "";
    let countParams = [];
    if (option === "全部資料") {
      sql_Count = `
        SELECT COUNT(*) AS totalCount FROM (
          SELECT id FROM mixinganode_batch WHERE BatchStart BETWEEN ? AND ? AND System_Step <> "error"${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}
          UNION ALL
          SELECT id FROM mixingcathode_batch WHERE BatchStart BETWEEN ? AND ? AND System_Step <> "error"${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}
        ) AS all_mix
      `;
      countParams = searchTerm && FinalFind
        ? [start, end, `%${searchTerm}%`, start, end, `%${searchTerm}%`]
        : [start, end, start, end];
    } else if (option === "正極混漿") {
      sql_Count = `SELECT COUNT(*) AS totalCount FROM mixingcathode_batch WHERE BatchStart BETWEEN ? AND ? AND System_Step <> "error"${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}`
      countParams = searchTerm && FinalFind
        ? [start, end, `%${searchTerm}%`]
        : [start, end];
    } else if (option === "負極混漿") {
      sql_Count = `SELECT COUNT(*) AS totalCount FROM mixinganode_batch WHERE BatchStart BETWEEN ? AND ? AND System_Step <> "error"${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}`
      countParams = searchTerm && FinalFind
        ? [start, end, `%${searchTerm}%`]
        : [start, end];
    } else if (option === "已刪除資訊") {
      sql_Count = `
        SELECT COUNT(*) AS totalCount FROM (
          SELECT id FROM mixinganode_batch WHERE System_Step = "error" AND BatchStart BETWEEN ? AND ?${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}
          UNION ALL
          SELECT id FROM mixingcathode_batch WHERE System_Step = "error" AND BatchStart BETWEEN ? AND ?${searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ''}
        ) AS all_mix
      `;
      countParams = searchTerm && FinalFind
        ? [start, end, `%${searchTerm}%`, start, end, `%${searchTerm}%`]
        : [start, end, start, end];
    }


    const [countResult] = await dbmes.query(sql_Count, countParams);
    const totalRowsInbackend = countResult[0].totalCount;
    const sortRows = formatTimeFields(rows).map(row => {
      const { errorReason, ...rowWithoutErrorReason } = row;
      return rowWithoutErrorReason;
    });

    res.status(200).json({
      data: sortRows,
      totalCount: totalRowsInbackend,
      page: parseInt(page, 10),
      totalPages: Math.ceil(totalRowsInbackend / parseInt(pageSize, 10)),
    });

  } catch (error) {
    console.error("Error fetching mixing batch record:", error);
    res.status(500).json({ error: "Error fetching mixing batch record" });
  }
});

router.post("/lotNoNotify", async (req, res) => {
  const { selectMixing, newListNo, employeeId } = req.body;

  let now = moment().locale("zh-tw").format("YYYY-MM-DD HH:mm:ss");

  try {
    let Message_notify = "";
    const config_Discord = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.discord_botToken}`,
      },
    };

    if (selectMixing && newListNo && employeeId) {
      Message_notify = `
員工編號: ${employeeId} 於 ${now} 更改混漿批號通知 📢📢
更改批號成: ${newListNo}

============================================================================================   
`;
    }

    if (Message_notify) {
      await axios.post(
        discord_mixing_LotNoChange,
        { content: Message_notify },
        config_Discord
      );
    }
    res.status(200).json({
      message: `通知${selectMixing}${now}混漿批號更改成功`,
    });
  } catch (error) {
    console.error("function call have some problem:", error);
  }
});

router.get("/downloadData", async (req, res) => {
  const { option, searchTerm = "", startDate, endDay } = req.query;

  const start = startDate.replace(/\//g, "-") + " 00:00:00";
  const end = endDay.replace(/\//g, "-") + " 23:59:59";

  let dataForCSV = []; // 用於轉excel 的最終資料
  let dataFinal = []; // 用於轉csv 的資料
  let sql = "";
  let params = [];
  let sql_register = "";
  let selectWork = '';

  // console.log("downloadData option:", option);
  if (String(option) === "正極混漿" || String(option) === "負極混漿") {
  sql_register = 
  `SELECT 
      Nvalue_Engineer_S,
      Nvalue_Engineer_E,
      Viscosity_Engineer_S,
      Viscosity_Engineer_E,
      ParticalSize_Engineer_S,
      ParticalSize_Engineer_E,
      SolidContent_Engineer_S,
      SolidContent_Engineer_E
      FROM hr.mixing_register 
      WHERE MixingSelect = '${option}' AND 
      EngineerNo = '109'
      order by id desc limit 1
  `
  }
  

  // 決定查詢欄位
  let FinalFind = "";
  if (searchTerm && searchTerm.length > 5) {
    FinalFind = `LotNo`;
  } else if (searchTerm) {
    FinalFind = `EngineerNo`;
  }

  switch (option) {
    case "全部資料":
      sql = `
        SELECT * FROM (
          SELECT
            id,
            '負極混漿' AS MixType,
            System_Step,
            EngineerNo,
            EngineerName,
            loadingTankNo,
            LotNo,
            BatchStart,
            BatchEnd,
            batch_time_diff,
            TransportStart,
            TransportEnd,
            Date,
            Nvalue,
            Viscosity,
            ParticalSize,
            SolidContent,
            NULL AS LFP_1, 
            NULL AS LFP_2, 
            NULL AS SuperP_1, 
            NULL AS SuperP_2, 
            NULL AS PVDF_1, 
            NULL AS PVDF_2, 
            NULL AS CNT_1, 
            NULL AS CNT_2, 
            NULL AS CNT_3, 
            NULL AS CNT_4, 
            NULL AS NMP_1, 
            NULL AS NMP_2,
            Graphite1_1, 
            Graphite1_2, 
            Super_P_1, 
            Super_P_2,
            CMC_1, CMC_2, 
            Graphite_2_1, 
            Graphite_2_2, 
            SBR_1, SBR_2, 
            NMP_1_1, 
            NMP_1_2, 
            PAA_1, 
            PAA_2,
            Member01_Name,  
            Member01_No
          FROM mixinganode_batch
          WHERE System_Step NOT LIKE "error" AND BatchStart BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
          UNION ALL
          SELECT
            id,
            '正極混漿' AS MixType,
            System_Step,
            EngineerNo,
            EngineerName,
            loadingTankNo,
            LotNo,
            BatchStart,
            BatchEnd,
            batch_time_diff,
            TransportStart,
            TransportEnd,
            Date,
            Nvalue,
            Viscosity,
            ParticalSize,
            SolidContent,
            LFP_1, 
            LFP_2, 
            SuperP_1, 
            SuperP_2, 
            PVDF_1, 
            PVDF_2, 
            CNT_1, 
            CNT_2, 
            CNT_3, 
            CNT_4, 
            NMP_1, 
            NMP_2,
            NULL AS Graphite1_1, 
            NULL AS Graphite1_2,
            NULL AS Super_P_1, 
            NULL AS Super_P_2, 
            NULL AS CMC_1, 
            NULL AS CMC_2, 
            NULL AS Graphite_2_1, 
            NULL AS Graphite_2_2, 
            NULL AS SBR_1, 
            NULL AS SBR_2, 
            NULL AS NMP_1_1, 
            NULL AS NMP_1_2, 
            NULL AS PAA_1, 
            NULL AS PAA_2,
            Member01_Name, 
            Member01_No
          FROM mixingcathode_batch
          WHERE System_Step NOT LIKE "error" AND BatchStart BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
        ) AS all_mix
        ORDER BY id DESC
      `;
      params =
        searchTerm && FinalFind
          ? [start, end, `%${searchTerm}%`, start, end, `%${searchTerm}%`]
          : [start, end, start, end];
      break;
    case "正極混漿":
      sql = `
        SELECT 
          id,
          System_Step,
          EngineerNo,
          EngineerName,
          LotNo,
          BatchStart,
          BatchEnd,
          batch_time_diff,
          TransportStart,
          TransportEnd,
          Date,
          Nvalue,
          Viscosity,
          ParticalSize,
          SolidContent,
          loadingTankNo,
          Member01_Name,
          Member01_No,
          LFP_1,
          LFP_2,
          SuperP_1,
          SuperP_2,
          PVDF_1,
          PVDF_2,
          CNT_1,
          CNT_2,
          CNT_3,
          CNT_4,
          NMP_1,
          NMP_2,
          Nvalue,
          Viscosity,
          ParticalSize,
          SolidContent,
          FinalTime,
          ProductionType,
          NMP_1_Loading_Weight,
          NMP_2_Loading_Weight,
          CNT_1_Loading_Weight,
          NMP_3,
          ReceipeNo,
          deviceNo_Mixing,
          deviceNo_surgeTank,
          Recipe,
          ListNo,
          Filter_Mesh,
          batch_time_min_Smaller,
          batch_time_min_Bigger
        FROM mixingcathode_batch
        WHERE System_Step NOT LIKE "error" AND BatchStart BETWEEN ? AND ?
        ${searchTerm && FinalFind ? `AND ${FinalFind} LIKE ?` : ""}
      `;
      params =
        searchTerm && FinalFind
          ? [start, end, `%${searchTerm}%`]
          : [start, end];
      break;
    case "負極混漿":
      sql = `
        SELECT
          id,
          System_Step,
          EngineerNo,
          EngineerName,
          LotNo,
          BatchStart,
          BatchEnd,
          batch_time_diff,
          TransportStart,
          TransportEnd,
          Date,
          Nvalue,
          Viscosity,
          ParticalSize,
          SolidContent,
          loadingTankNo,
          Member01_Name,
          Member01_No,
          Graphite1_1,
          Graphite1_2,
          Super_P_1,
          Super_P_2,
          CMC_1,
          CMC_2,
          Graphite_2_1,
          Graphite_2_2,
          SBR_1,
          SBR_2,
          NMP_1_1,
          NMP_1_2,
          PAA_1,
          PAA_2,
          FinalTime,
          Nvalue,
          Viscosity,
          ParticalSize,
          SolidContent,
          ProductionType,
          ReceipeNo,
          deviceNo_Mixing,
          deviceNo_surgeTank,
          Recipe,
          Filter_Mesh,
          batch_time_min_Smaller
        FROM mixinganode_batch
        WHERE System_Step NOT LIKE "error" AND BatchStart BETWEEN ? AND ?
        ${searchTerm && FinalFind ? `AND ${FinalFind} LIKE ?` : ""}
      `;
      params =
        searchTerm && FinalFind
          ? [start, end, `%${searchTerm}%`]
          : [start, end];
      break;
    case "已刪除資訊":
      sql = `
        SELECT * FROM (
          SELECT
            id,
            '負極混漿' AS MixType,
            System_Step,
            EngineerNo,
            EngineerName,
            LotNo,
            Date,
            BatchStart,
            BatchEnd,
            batch_time_diff,
            TransportStart,
            TransportEnd,
            Nvalue,
            Viscosity,
            ParticalSize,
            SolidContent,
            NULL AS LFP_1, 
            NULL AS LFP_2, 
            NULL AS SuperP_1, 
            NULL AS SuperP_2, 
            NULL AS PVDF_1, 
            NULL AS PVDF_2, 
            NULL AS CNT_1, 
            NULL AS CNT_2, 
            NULL AS CNT_3, 
            NULL AS CNT_4, 
            NULL AS NMP_1, 
            NULL AS NMP_2,
            Graphite1_1, 
            Graphite1_2, 
            Super_P_1, 
            Super_P_2,
            CMC_1, CMC_2, 
            Graphite_2_1, 
            Graphite_2_2, 
            SBR_1, SBR_2, 
            NMP_1_1, 
            NMP_1_2, 
            PAA_1, 
            PAA_2,
            Member01_Name,  
            Member01_No
          FROM mixinganode_batch
          WHERE System_Step LIKE 'error' AND BatchStart BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
          UNION ALL
          SELECT
            id,
            '正極混漿' AS MixType,
            System_Step,
            EngineerNo,
            EngineerName,
            LotNo,
            Date,
            BatchStart,
            BatchEnd,
            batch_time_diff,
            TransportStart,
            TransportEnd,
            Nvalue,
            Viscosity,
            ParticalSize,
            SolidContent,
            LFP_1, 
            LFP_2, 
            SuperP_1, 
            SuperP_2, 
            PVDF_1, 
            PVDF_2, 
            CNT_1, 
            CNT_2, 
            CNT_3, 
            CNT_4, 
            NMP_1, 
            NMP_2,
            NULL AS Graphite1_1, 
            NULL AS Graphite1_2,
            NULL AS Super_P_1, 
            NULL AS Super_P_2, 
            NULL AS CMC_1, 
            NULL AS CMC_2, 
            NULL AS Graphite_2_1, 
            NULL AS Graphite_2_2, 
            NULL AS SBR_1, 
            NULL AS SBR_2, 
            NULL AS NMP_1_1, 
            NULL AS NMP_1_2, 
            NULL AS PAA_1, 
            NULL AS PAA_2,
            Member01_Name, 
            Member01_No
          FROM mixingcathode_batch
          WHERE System_Step LIKE "error" AND BatchStart BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
        ) AS all_mix
        ORDER BY id DESC
      `;

      params =
        searchTerm && FinalFind
          ? [start, end, `%${searchTerm}%`, start, end, `%${searchTerm}%`]
          : [start, end, start, end];
      break;
  }
  try {
    let engineerSettingRows = [];

    // console.log("downloadData sql:", sql , "params:", params);
    const [rows] = await dbmes.query(sql, params);
    // console.log("rows  :" , rows );

    // 當選擇正極或負極時，同時查詢工程師設定參數
    if (String(option) === "正極混漿" || String(option) === "負極混漿") { 
      [engineerSettingRows] = await dbcon.query(sql_register);
      console.log("engineerSettingRows :" , engineerSettingRows );
    }
   
    const sortRows = formatTimeFields(rows).map((row) => {
      const { errorReason, ...rowWithoutErrorReason } = row;
      console.log("rowWithoutErrorReason  :" , rowWithoutErrorReason );
      return rowWithoutErrorReason;
    });
    console.log("sortRows  :" , sortRows , "|" , "engineerSettingRows", engineerSettingRows);
    
    dataForCSV = [...sortRows , ...engineerSettingRows];
    dataFinal = searchForIsoForm(dataForCSV , option );
    console.log("typeof dataFinal  :" , typeof dataFinal , "|" , "dataFinal", dataFinal);

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(dataFinal);
    xlsx.utils.book_append_sheet(workbook, worksheet, "MixingData");

    const excelBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });
    res.setHeader("Content-Disposition", "attachment");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(excelBuffer);

    return;
  } catch (error) {
    console.error("Error fetching mixing batch record:", error);
    res.status(500).json({ error: "Error fetching mixing batch record" });
  }
});

//取混漿實際操作執行完畢之參數(Nvalue	Viscosity	ParticalSize	SolidContent)
router.get("/getMixProductParam", async (req, res) => {
  const { select_side_name, sortStartDate, sortEndDate } = req.query;
  let newKey;

  //依據正負極切換search 混漿指定表單
  const mixing_querytable = select_side_name.includes("-負")
    ? "mes.mixinganode_batch"
    : select_side_name.includes("+正")
    ? "mes.mixingcathode_batch"
    : "";

  console.log(
    "選擇混漿站:" +
      select_side_name +
      " 尋開始日期:" +
      sortStartDate +
      " 尋結束日期:" +
      sortEndDate
  );

  //----------------搜尋Mixing_all_Data 數據庫的資料 start---------------
  const select_columns = [
    //(-)負極 (+)正極
    `select distinct LotNo, Nvalue,Viscosity,ParticalSize ,SolidContent , CONCAT(DATE_FORMAT(BatchEnd, '%Y-%m-%d')) AS WorkDate FROM ${mixing_querytable}`,
  ];

  //----------------end---------------

  //----------------搜尋total_min_max_avg_Data 數據庫的資料 start---------------

  const select_min_col = [
    //(-)負極 (+)正極
    `select MIN(CAST(Nvalue AS DECIMAL(10, 5))) as LH_Nvalue, \
     MIN(CAST(Viscosity AS DECIMAL(10, 3))) as LH_Viscosity , \
     MIN(CAST(ParticalSize AS DECIMAL(10, 5))) as LH_Partical , \
     MIN(CAST(SolidContent AS DECIMAL(10, 5))) as LH_SolidContent, \
     'AnodeMix_MIN_reult' as type FROM ${mixing_querytable}`,
  ];

  const select_max_col = [
    //(-)負極 (+)正極
    `select max(CAST(Nvalue AS DECIMAL(10, 5))) ,\
     max(CAST(Viscosity AS DECIMAL(10, 3))) , \
     max(CAST(ParticalSize AS DECIMAL(10, 5))) ,\
     max(CAST(SolidContent AS DECIMAL(10, 5))) ,\
    'AnodeMix_MAX_reult' FROM ${mixing_querytable} `,
  ];

  //最小值query補償條件
  const Min_compensate = [
    //(-)負極 (+)正極
    "AND Viscosity REGEXP '^[0-9]{4,5}\\.[0-9]+$'",
  ];

  //最大值query補償條件
  const Max_compensate = [
    //(-)負極 (+)正極
    "AND Nvalue REGEXP '^[0-9]{1,2}\\.[0-9]{5}$' \
    AND SolidContent REGEXP '^[0-9]{2,3}\\.[0-9]{2}+$'",
  ];

  const select_avg_col = [
    //(-)負極
    `SELECT ROUND(AVG(CAST(Nvalue AS DECIMAL(10, 5))), 5) AS AVG_Nvalue , \
    ROUND(AVG(CAST(Viscosity AS DECIMAL(10, 1))), 1) AS AVG_Viscosity, \
    ROUND(AVG(CAST(ParticalSize AS DECIMAL(10,2))), 2) AS AVG_Partical, \
    ROUND(AVG(CAST(SolidContent AS DECIMAL(10,2))), 2) AS AVG_SolidContent,\
    'Mixing_AVG_Result' as type FROM ${mixing_querytable} `,
  ];

  const sql_Related_Mixing = [
    //(-)負極
    ` where System_Step like '5' and  EngineerNo not like '349' and BatchEnd BETWEEN '${sortStartDate} 00:00:00' and '${sortEndDate} 23:59:59' `,
  ];

  const select_avg_condition = [
    //(-)負極
    "AND (Nvalue REGEXP '^[0-9]{1,2}\\.[0-9]{5}$') \
     AND (Viscosity REGEXP '^[0-9]{4,5}\\.[0-9]+$') \
     AND ( ParticalSize REGEXP '^[0-9]{2,3}$' OR ParticalSize REGEXP '^[0-9]{2,3}\\.[0-9]+$') \
     AND ( SolidContent REGEXP '^[0-9]{2}\\.[0-9]{2}$')",
  ];

  //----------------end---------------

  try {
    let all_sql = "",
      sql_Min_Max_Merge = "",
      sql_Avg = "";

    //負極(-)混漿 / 正極(+)混漿
    //升冪排序(日期由舊到新),Not Desc
    all_sql = select_columns[0] + sql_Related_Mixing[0] + "order by WorkDate;";

    //將最(小,大)值的sql語法合併在一起
    sql_Min_Max_Merge =
      select_min_col[0] +
      sql_Related_Mixing[0] +
      Min_compensate[0] +
      " union all \n" +
      select_max_col[0] +
      sql_Related_Mixing[0] +
      Max_compensate[0];

    //平均值獨立運算在此
    sql_Avg =
      select_avg_col[0] + sql_Related_Mixing[0] + select_avg_condition[0];

    // console.log("all_sql:", all_sql);
    // console.log("sql_Min_Max_Merge: ", sql_Min_Max_Merge);
    // console.log("sql_AVG平均值list: ", sql_Avg);

    //先收集全部數據庫日期(由最舊到最新)
    const [Mixing_Analysis_data] = await dbmes.query(all_sql);

    //console.log("全部數據庫日期：", PFCC_Analysis_data);

    const filterAllData = [];
    Mixing_Analysis_data.forEach((item) => {
      const dateObj = new Date(item.WorkDate);
      const year = dateObj.getFullYear();
      const month = (dateObj.getMonth() + 1).toString().padStart(2, "0"); // 确保月份是两位数
      const day = dateObj.getDate().toString().padStart(2, "0"); // 确保日期是两位数
      const formattedDate = `${year}-${month}-${day}`; // 格式化为 YYYY:MM:DD

      // // 在原数据中替换 WorkDate 字段为格式化后的日期
      // filterAllData.push({
      //   ...item,
      //   WorkDate: formattedDate,
      // });
      // 创建一个新对象，转换字串数字为浮点数
      const transformedItem = {};

      Object.keys(item).forEach((key) => {
        const value = item[key];

        // console.log("原生key = " + key + ", value = " + value);

        if (key === "VAHSA" || key === "VAHSB" || key === "VAHSC") {
          // CC1 站的鍵名轉換
          newKey = keyMap_CC1and2[key] || key; // 使用映射表转换键名
        } else {
          newKey = key; // 保持原键名
        }
        // 跳过 WorkDate，因为我们单独处理
        if (key === "WorkDate") {
          transformedItem[newKey] = formattedDate;
        } else if (typeof value === "string" && !isNaN(value)) {
          transformedItem[newKey] = parseFloat(value);
        } else {
          transformedItem[newKey] = value;
        }
      });

      filterAllData.push(transformedItem);
    });

    // console.log("filterAllData:", filterAllData); // 顯示轉換後的日期數據

    Mixingdigram_SearchData.length = 0; // 清空全域變數
    Mixingdigram_SearchData.push({ overall: filterAllData }); // 將資料存入全域變數

    //在收集目前條件式所提供之每個電芯電性參數(Min,Max)->透過math計算的數據
    //(-)負極Anode 取值(LH_Nvalue~Solient , AVG_Nvalue~Solient)

    const [Mixing_AnysisMinMax_Range] = await dbmes.query(sql_Min_Max_Merge);

    const minData = Mixing_AnysisMinMax_Range.find(
      (item) => item.type === "AnodeMix_MIN_reult"
    );

    const maxData = Mixing_AnysisMinMax_Range.find(
      (item) => item.type === "AnodeMix_MAX_reult"
    );

    const [Mixing_Average_Range] = await dbmes.query(sql_Avg);

    const avgData = Mixing_Average_Range.find(
      (item) => item.type === "Mixing_AVG_Result"
    );

    const minValues = mapToFloatArray(minData);
    const maxValues = mapToFloatArray(maxData);
    const avgValues = mapToFloatArray(avgData);

    // console.log("統查數據列為filterAllData = " + filterAllData);
    // console.log("AnodeMix_MIN_reult 結果為:", minValues);
    // console.log("AnodeMix_MAX_reult 結果為:", maxValues);
    // console.log("Mixing_AVG_Result 結果為:", avgValues);

    // 將資料(min,max,avg)存入全域變數
    Mixingdigram_SearchData.push({ min_list: minValues });
    Mixingdigram_SearchData.push({ max_list: maxValues });
    Mixingdigram_SearchData.push({ avg_list: avgValues });

    // console.log(
    //   `混漿站:${select_side_name}-準備傳回前端總組態:` +
    //     JSON.stringify(Mixingdigram_SearchData, null, 2)
    // );

    return res.status(200).json({
      message: `查詢開始日期:${sortStartDate},結束日期:${sortEndDate}->${select_side_name}混漿數據成功`,
      AllContent: Mixingdigram_SearchData[0].overall,
      min_list: Mixingdigram_SearchData[1].min_list,
      max_list: Mixingdigram_SearchData[2].max_list,
      avg_list: Mixingdigram_SearchData[3].avg_list,
    });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得混漿數據錯誤",
    });
  }
});

router.get("/nowReport", async (req, res) => {

  let startTime = "";
  let endTime = "";
  let dayShift = "";
  let allData = [];

  let station = [
    "mixingcathode_batch", 
    "mixinganode_batch", 
  ]

  timeResult = changeTime()
  dayShift = timeResult[0];
  startTime = timeResult[1];
  endTime = timeResult[2];
  
  try {
    if (Array.isArray(station) && station.length > 0) {
      for (let i = 0; i < station.length; i++) {
        let tableNow = station[i];

        let sql = `
        SELECT 
          COUNT(CASE WHEN lotNo <> '' AND errorReason IS NULL THEN 1 END) AS LotCount,
          t2.Nvalue,
          t2.Viscosity,
          t2.ParticalSize,
          t2.SolidContent
        FROM mes.${tableNow} t1
        LEFT JOIN (
          SELECT Nvalue, Viscosity, ParticalSize, SolidContent
          FROM mes.${tableNow}
          WHERE BatchEnd BETWEEN '${startTime}' AND '${endTime}'
          ORDER BY id DESC LIMIT 1
        ) t2 ON 1=1
        WHERE t1.BatchEnd BETWEEN '${startTime}' AND '${endTime}'
      `;

        // console.log(`混漿即時報表sql (${tableNow}):`, sql);
        const [rows] = await dbmes.query(sql);

        if (Array.isArray(rows) && rows.length > 0) {
          rows.forEach((row) => {
            if (row.Nvalue === null) row.Nvalue = 0;
            if (row.Viscosity === null) row.Viscosity = 0;
            if (row.ParticalSize === null) row.ParticalSize = 0;
            if (row.SolidContent === null) row.SolidContent = 0;
            
            // 添加表名標識
            row.tableType = tableNow === "mixingcathode_batch" ? "正極混漿" : "負極混漿";
            allData.push(row);
          });
        }
      }
    }
    
    // console.log("混漿即時報表資料:", allData);

    res.status(200).json({
      message: `取得混漿即時報表成功`,
      data: allData
    })

  } catch(error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得混漿即時報表錯誤",
    });
  }

})

router.get("/pastReport", async (req, res) => {
  const { startDate, endDay, dayShift , page, pageSize} = req.query;

  let { start, end } = changePast_data(startDate, endDay, dayShift);
  // console.log("混漿過去報表時間區間:", start, end);
  let allData = [];

  let station = [
    "mixingcathode_batch", 
    "mixinganode_batch", 
  ];

  try {

    // page, pageSize 轉為數字並計算 offset
    const pageNum = parseInt(page, 10) || 1;
    const pageSizeNum = parseInt(pageSize, 10) || 10;
    const offset = (pageNum - 1) * pageSizeNum;

    
    for (let i = 0; i < station.length; i++) {
      let tableNow = station[i];
      let sql = `
        SELECT 
          '${tableNow === "mixingcathode_batch" ? "正極混漿" : "負極混漿"}' AS tableType,
          COUNT(CASE WHEN lotNo <> '' AND errorReason IS NULL THEN 1 END) AS LotCount,
          COALESCE(MAX(Nvalue), 0) AS Nvalue,
          COALESCE(MAX(Viscosity), 0) AS Viscosity,
          COALESCE(MAX(ParticalSize), 0) AS ParticalSize,
          COALESCE(MAX(SolidContent), 0) AS SolidContent,
          COALESCE(Member01_Name, '') AS Member01_Name,
          COALESCE(REGEXP_REPLACE(Member01_No, '[^0-9a-zA-Z]', ''), '') AS Member01_No
        FROM mes.${tableNow}
        WHERE BatchEnd BETWEEN '${start}' AND '${end}'
          AND errorReason IS NULL 
          AND EngineerNo != '349'
          AND System_Step = '5'
        GROUP BY Member01_Name, REGEXP_REPLACE(Member01_No, '[^0-9a-zA-Z]', '')
        LIMIT ${pageSizeNum} OFFSET ${offset};
      `;

      let sql_count = `
        SELECT 
          '${tableNow === "mixingcathode_batch" ? "正極混漿" : "負極混漿"}' AS tableType,
          COUNT(CASE WHEN lotNo <> '' AND errorReason IS NULL THEN 1 END) AS LotCount
        FROM mes.${tableNow}
        WHERE BatchEnd BETWEEN '${start}' AND '${end}'
          AND errorReason IS NULL 
          AND EngineerNo != '349'
          AND System_Step = '5'
        GROUP BY Member01_Name, REGEXP_REPLACE(Member01_No, '[^0-9a-zA-Z]', '')
      `

      const [rows] = await dbmes.query(sql);
      const [countRows] = await dbmes.query(sql_count);
      const totalRowsInbackend = countRows.length;
      // console.log(`混漿過去報表資料 (${tableNow}):`, rows);

      if (Array.isArray(rows) && rows.length > 0) {
        allData.push(...rows);
      }
    }


    const totalRows = allData.length;
    console.log("混漿過去報表資料:", allData , " | totalRows : " , totalRows , " | PageSize : " , Math.ceil(totalRows / pageSizeNum));
    

    res.status(200).json({
      message: `取得混漿過去報表成功`,
      data: allData ,
      pagination: {
        totalCount: totalRows,
        totalPages: Math.ceil(totalRows / pageSizeNum),
      }
    });

  } catch(error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得混漿過去報表錯誤",
    });
  }
})

router.post("/prescription", async (req, res) => {
   const formData_final = req.body;

  // 過濾掉 key 為 prescription_info 的欄位
  const filter_body = Object.fromEntries(
    Object.entries(formData_final).filter(([key, _]) => key !== "prescription_info")
  );

  // console.log("收到整體結構為:"+ JSON.stringify(filter_body));
 
  let prescriptionArray = [];
    if (formData_final.prescription_info) {
            // 如果是字串就 parse，否則直接使用
        if (typeof formData_final.prescription_info === "string") {
          try {
            prescriptionArray = JSON.parse(formData_final.prescription_info);
          } catch (e) {
            console.error("prescription_info JSON 解析失敗:", e);
            prescriptionArray = [];
          }
        } else if (Array.isArray(formData_final.prescription_info)) {
          prescriptionArray = formData_final.prescription_info;
        }
    }

     console.log("收到配方資料結構為:"+ JSON.stringify(prescriptionArray));

    const station_name = filter_body.station.includes("Cathod")?"正極混漿":"負極混漿";

    try {

        //存入指定配方表單
        const sql = `
          INSERT INTO mes.mixing_prescription
            (mainform_code, prescription_info, create_date, memberID, submit_name, station, control_version, isdelete)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

      const parameter_values = [
          filter_body.mainform_code,
          JSON.stringify(prescriptionArray), // JSON 欄位
          filter_body.create_date,
          filter_body.memberID,
          filter_body.submit_name,
          filter_body.station,
          filter_body.control_version || "v1.0", // 若缺少 control_version, 給預設
          Number(filter_body.isdelete || 0),
      ];

      const [result] = await dbmes.query(sql , parameter_values);

      res.status(200).json({ msg: `成功存入${station_name}配方表單`, insertedId: result.ID });
        
    } catch (error) {
      console.error("插入混漿配方失敗:", error);
      res.status(500).json({ success: false, error: error.message });
    }
});

//取得配方-> 主單號/項目碼(名稱)-清單
router.get("/get_prescription_mixed", async (req, res) => {
  const { select_side , mainform_first_str } = req.query;
  const open_search = false;
  let prescription_detec = [];
  // console.log("前端傳送為中文配方站別為: " + select_side + " 站點Eng為:" + mainform_first_str);
  const MixingRun_side = select_side.includes("正極混漿") ? "MixingC%":"MixingA%";


  const search_maincode = open_search === true
  ? `and mainform_code LIKE '${MixingRun_side}'`
  : '';

  const search_itemall = open_search === true
  ? `and mp.mainform_code LIKE '${MixingRun_side}'`
  : '';

  console.log("MixingRun_side = " + MixingRun_side + " 有無打開索引查詢條件:" +   open_search);

  const sql = `
               SELECT
                  -- mainform_codes
                  (
                      SELECT JSON_ARRAYAGG(mainform_code)
                      FROM (
                          SELECT DISTINCT mainform_code
                          FROM mes.mixing_prescription
                          WHERE station like '${mainform_first_str}'
                          ${search_maincode}
                          ORDER BY ID DESC
                      ) AS mf
                  ) AS mainform_codes,
                  -- itemcodes
                  (
                      SELECT JSON_ARRAYAGG(itemcode)
                      FROM (
                          SELECT DISTINCT jt.itemcode
                          FROM mes.mixing_prescription mp
                          JOIN JSON_TABLE(
                              mp.prescription_info,
                              '$[*]' COLUMNS (
                                  itemcode LONGTEXT PATH '$.itemcode'
                              )
                          ) jt
                          WHERE station like '${mainform_first_str}'
                          ${search_itemall}
                      ) AS sub_itemcode
                  ) AS itemcodes,
                  -- itemnames
                  (
                      SELECT JSON_ARRAYAGG(itemname)
                      FROM (
                          SELECT DISTINCT jt.itemname
                          FROM mes.mixing_prescription mp
                          JOIN JSON_TABLE(
                              mp.prescription_info,
                              '$[*]' COLUMNS (
                                  itemname LONGTEXT PATH '$.itemname'
                              )
                          ) jt
                          WHERE station like '${mainform_first_str}'
                          ${search_itemall}
                      ) AS sub_itemname
                  ) AS itemnames;
              `;

  try{

    const [rowinfo] = await dbmes.query(sql);

    // console.log("一開始先取得選單資訊為: "+  JSON.stringify(rowinfo[0],null,2));

    // const maincode_info = Object.values(rowinfo[0].mainform_codes);

    Object.keys(rowinfo[0]).forEach((key) => {     
        const rawData = rowinfo[0][key]; // 直接取欄位的 array
        if( Array.isArray(rawData)){
          prescription_detec.push({ item: key  , label_list: rawData});
        }
       
    });

    // console.log(" 實際收到選單list 量為= "+Object.values(prescription_detec.label_list).length);

    // 取得所有 label_list
     const allLabelLists = prescription_detec.map(obj => obj.label_list);
    //有確定擷取道3個選單list 資料
    // if( allLabelLists.length < 3)
    // {          
    //       res.status(400).json({
    //       message: "取得混漿配方選單列表有缺失",
    //     });
    // }

    console.log(`擷取到 ${allLabelLists.length} 個選單list資料`);

      // console.log("最終回傳前端為= "+ JSON.stringify(prescription_detec,null,2));
      res.status(200).send(prescription_detec);
   } catch(error) {
      console.error("發生錯誤", error);
      res.status(400).json({
        message: "取得混漿配方選單列表錯誤",
      });
  }

});

router.post("/findver_number", async (req, res) => {
  const { masterNo , mainform_first_str } = req.body;
  // console.log(" 搜到Ver 查詢 參數條件為-> "+ masterNo.trim('') + " - " +mainform_first_str);
  
  try{

    const get_ver_sql = `SELECT count(*) as ver_num FROM mes.mixing_prescription where mainform_code = '${masterNo.trim()}' and station like '${mainform_first_str}';`;
    // console.log("get_ver_sql 查詢字串為: "+ get_ver_sql);
    const [result] = await dbmes.query(get_ver_sql);
    const maincode_ver = Number(result[0].ver_num || 0).toFixed(1);
    // console.log(`目前 站別:${mainform_first_str}  主單號->${masterNo } 最新版本號為 = ` + maincode_ver);
    res.status(201).send({ Msg: `成功擷取${masterNo.trim()}` ,  CurrentVersion: maincode_ver }); 

  }catch(error) {
      console.error("發生錯誤", error);
      res.status(400).json({
        message: "取得混漿配方主單號版本碼錯誤!",
      });
  }
				    	
});


//取得指定單號或全部-> 混漿配方提交紀錄
router.get('/recipe_submit_info', async (req, res) => {

    // 針對前端提交分頁參數
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5;
    const keyword = req.query.keyword || ''; // mainform_code 關鍵字
    const station = req.query.station || ''; // 篩選 station
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC'; // 預設 DESC

    const offset = (page - 1) * pageSize;

    // 動態條件組合
    const conditions = ['isdelete = 0'];
    const params = [];

    if (keyword) {
      conditions.push('mainform_code LIKE ?');
      params.push(`%${keyword}%`);
    }

    if (station) {
      conditions.push('station = ?');
      params.push(station);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    try{
      // 先確定查詢的總筆數
      const countSql = `SELECT COUNT(*) as total FROM mes.mixing_prescription ${whereClause}`;
      const [countResult] = await dbmes.query(countSql, params);
      const total = countResult[0].total;
      const totalPages = Math.ceil(total / pageSize);

      // 查當頁資料
      const dataSql = `
        SELECT *
        FROM mes.mixing_prescription
        ${whereClause}
        ORDER BY ID ${sortOrder}
        LIMIT ? OFFSET ?
      `;

      // LIMIT & OFFSET 加到參數
      const dataParams = [...params, pageSize, offset];
      const [rows] = await dbmes.query(dataSql, dataParams);

      // 回傳結果
      res.status(200).send({
        data: rows,
        page,
        pageSize,
        total,
        totalPages
      });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Server Error', error: err });
  }
});

module.exports = router;
