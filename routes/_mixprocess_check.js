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

  console.log(
    `統計時間範圍: ${yesterday12pm.format(
      "YYYY-MM-DD HH:mm:ss"
    )} 到 ${today12pm.format("YYYY-MM-DD HH:mm:ss")}`
  );

  const sql_Cathode = `
    SELECT 
      deviceNo_Mixing,
      COUNT(*) AS count
    FROM mes.mixingcathode_batch 
    WHERE BatchStart >= ? AND BatchStart < ?
      AND deviceNo_Mixing IS NOT NULL 
      AND deviceNo_Mixing != ''
    GROUP BY deviceNo_Mixing
    ORDER BY deviceNo_Mixing
  `;

  const sql_Anode = `
    SELECT 
      deviceNo_Mixing,
      COUNT(*) AS count
    FROM mes.mixinganode_batch 
    WHERE BatchStart >= ? AND BatchStart < ?
      AND deviceNo_Mixing IS NOT NULL 
      AND deviceNo_Mixing != ''
    GROUP BY deviceNo_Mixing
    ORDER BY deviceNo_Mixing
  `;

  try {
    let Message_notify = "";
    const config_Discord = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.discord_botToken}`,
      },
    };
    const [cathodeResults] = await dbmes.query(sql_Cathode, [
      yesterday12pm.format("YYYY-MM-DD HH:mm:ss"),
      today12pm.format("YYYY-MM-DD HH:mm:ss"),
    ]);

    const [anodeResults] = await dbmes.query(sql_Anode, [
      yesterday12pm.format("YYYY-MM-DD HH:mm:ss"),
      today12pm.format("YYYY-MM-DD HH:mm:ss"),
    ]);

    // 計算總數量
    const cathodeCount = cathodeResults.reduce(
      (total, row) => total + row.count,
      0
    );
    const anodeCount = anodeResults.reduce(
      (total, row) => total + row.count,
      0
    );

    // console.log("正極混漿批次數量:", cathodeCount);
    // console.log("負極混漿批次數量:", anodeCount);
    // console.log("正極設備分組詳情:", cathodeResults);
    // console.log("負極設備分組詳情:", anodeResults);

    // 格式化設備產量詳情
    const formatDeviceDetails = (results, type) => {
      if (results.length === 0) return `${type}: 無設備記錄`;
      return results
        .map((row) => `  設備 ${row.deviceNo_Mixing}: ${row.count} 批次`)
        .join("\n");
    };

    Message_notify = `
============================================================================================ 
混漿生產日報 - ${yesterday12pm.format("YYYY-MM-DD")} 12:00 ~ ${today12pm.format(
      "YYYY-MM-DD"
    )} 12:00 📢📢

正極混漿批次數量: ${cathodeCount} 批次
${formatDeviceDetails(cathodeResults, "正極設備明細")}

負極混漿批次數量: ${anodeCount} 批次
${formatDeviceDetails(anodeResults, "負極設備明細")}

總計批次數量: ${cathodeCount + anodeCount} 批次

統計時間: ${moment().locale("zh-tw").format("YYYY-MM-DD HH:mm:ss")}
============================================================================================
    `;

    if (Message_notify && discord_mixing_notify) {
      await axios.post(
        discord_mixing_notify,
        { content: Message_notify },
        config_Discord
      );
      console.log("Discord 通知已發送");
    } else {
      console.log("Discord webhook URL 未設定，無法發送通知");
    }
  } catch (error) {
    console.error("Error executing scheduled task:", error);
  }
});

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

    // 檢查密碼是否正確
    const mix_engineer_regino = rows_mix_reg[0];
    // const isPasswordValid = await bcrypt.compare(
    //   password,
    //   mix_engineer_regino.Password
    // );

    // // 直接比較密碼，假設已經是明文存儲
    // const isPasswordValid = mix_engineer_regino.Password === password;

    // if (!isPasswordValid) {
    //   return res
    //     .status(402)
    //     .json({ error: `${password}<-登入密碼比對註冊密碼不一致,錯誤!` });
    // }

    // 目前設定為每次登入都更新
    // 這樣可以確保每次登入都使用新的密鑰
    // update_jwtmix_secret();

    // 確認工號正確才往下走
    if (fix_3size_enginneerID !== rows_mix_reg[0]?.EngineerNo) {
      return res.status(401).json({
        error: `工號不正確，請確認輸入的工號與註冊資料一致`,
      });
    }

    // 檢查密碼是否正確
    if (password !== rows_mix_reg[0]?.Password) {
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
      detail: error.message,})
    }
});
