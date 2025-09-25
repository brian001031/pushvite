require("dotenv").config();
const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const { Sequelize } = require("sequelize");
const jwt = require("jsonwebtoken");
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const axios = require("axios");
const _ = require("lodash");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const mysql = require("mysql2");
const fs = require("fs");
const moment = require("moment");
const util = require("util");
const schedule = require("node-schedule");
const xlsx = require("xlsx");
const { group } = require("console");
const { sql } = require("googleapis/build/src/apis/sql");
const path = require("path");
const e = require("express");

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

let Mixingdigram_SearchData = [];

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
];
const discord_mixing_notify = process.env.discord_mixing_notify;
const discord_mixing_LotNoChange = process.env.discord_mixing_LotNoChange || "";
const nowDay = moment().locale("zh-tw").format("YYYY-MM-DD HH:mm:ss");

// 格式化時間欄位的函數
const formatTimeFields = (data) => {
  if (!data || !Array.isArray(data)) return data;

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
          .locale("zh-tw")
          .format("YYYY-MM-DD HH:mm:ss");
      }
    });

    return formattedRow;
  });
};

// 每天中午12點執行混漿批次統計並發送 Discord 通知
schedule.scheduleJob({ hour: 12, minute: 0 }, async () => {
  console.log("每天中午12點執行的計算任務");

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
    const [cathodeResults] = await dbmes
      .promise()
      .query(sql_Cathode, [
        yesterday12pm.format("YYYY-MM-DD HH:mm:ss"),
        today12pm.format("YYYY-MM-DD HH:mm:ss"),
      ]);

    const [anodeResults] = await dbmes
      .promise()
      .query(sql_Anode, [
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

    console.log("正極混漿批次數量:", cathodeCount);
    console.log("負極混漿批次數量:", anodeCount);
    console.log("正極設備分組詳情:", cathodeResults);
    console.log("負極設備分組詳情:", anodeResults);

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
    const [existingUser] = await dbcon
      .promise()
      .query("SELECT * FROM mixing_register WHERE EngineerNo = ?", [
        fix_3size_enginneerID,
      ]);

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

    await dbcon.promise().query(reg_sql);

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
    const [rows_mix_reg] = await dbcon
      .promise()
      .query("SELECT * FROM hr.mixing_register WHERE EngineerNo = ?", [
        fix_3size_enginneerID,
      ]);

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

    const [rows_mix_dataset] = await dbcon
      .promise()
      .query(
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
  ];

  try {
    const sql_mixparam_update = `
          UPDATE mixing_register
          SET
            Submittime = ?,
            ProductionType = ?,
            ReceipeNo = ?,
            deviceNo_Mixing = ?,
            deviceNo_surgeTank = ?,
            Recipe = ?,
            Filter_Mesh = ?,
            batch_time_min_Smaller = ?,
            batch_time_min_Bigger = ?,
            Water_1_LoadingWeight = ?,
            Water_2_LoadingWeight = ?,
            Water_3_LoadingWeight = ?,
            NMP = ?,
            NMP_1_Loading_Weight = ?,
            NMP_2_Loading_Weight = ?,
            CNT_1_Loading_Weight = ?,
            NMP_3 = ?,
            loadingTankNo = ?,
            ListNo = ?
          WHERE
            EngineerName = ?
            AND (
            ? = ''        
            OR MixingSelect = ?
            );        
         `;

    const [result] = await dbcon
      .promise()
      .query(sql_mixparam_update, updateParams);

    if (result.affectedRows > 0) {
      res.status(200).json({
        message: `工程師:${MixUpdateParams.EngineerName} ${MixUpdateParams.MixingSelect} 混槳工作序參數設定值已更新`,
      });
    } else {
      res.status(404).json({
        error: `工程師:${MixUpdateParams.EngineerName} ${MixUpdateParams.MixingSelect} 混槳工作序參數設定值不存在或未變更`,
      });
    }
  } catch (error) {
    // console.error("Error put update engineerDataSet:", error);
    res.status(500).json({ error: "put mix engineerDataSet error" });
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
    const [mixinfo_inner_alldata] = await dbmes
      .promise()
      .query(
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

    const [mixinfo_inner_alldata] = await dbmes.promise().query(
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
      const [rows] = await dbcon
        .promise()
        .query(`SELECT memberName FROM hr.hr_memberinfo WHERE memberID = ?`, [
          number,
        ]);

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
  const { MixingSelect, System_Step, ReturnStatus } = body;

  // 調試：檢查是否收到 errorReason
  console.log("收到的 body:", JSON.stringify(body, null, 2));
  console.log("errorReason 值:", body.errorReason);

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

    const [result] = await dbmes.promise().query(sql, values);
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
    const [rows] = await dbcon
      .promise()
      .query(sql, [engineerID_3WORD, MixingSelect]);

    console.log("getEngineerSetting rows:", rows);
    res.status(200).json(rows[0] || {});
  } catch (error) {
    console.error("Error fetching engineer setting:", error);
    res.status(500).json({ error: "Error fetching engineer setting" });
  }
});

router.get("/getSearchPage", async (req, res) => {
  const {
    option,
    searchTerm = "",
    startDate,
    endDay,
    page = 1,
    pageSize = 20,
  } = req.query;

  const start = startDate.replace(/\//g, "-") + " 00:00:00";
  const end = endDay.replace(/\//g, "-") + " 23:59:59";
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
          WHERE errorReason NOT IN ('error', 'Error') AND BatchStart BETWEEN ? AND ?${
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
          WHERE System_Step NOT LIKE "error" AND BatchStart BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
        ) AS all_mix
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      params =
        searchTerm && FinalFind
          ? [
              start,
              end,
              `%${searchTerm}%`,
              start,
              end,
              `%${searchTerm}%`,
              limit,
              offset,
            ]
          : [start, end, start, end, limit, offset];
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
          batch_time_min_Bigger
        FROM mixingcathode_batch
        WHERE System_Step NOT LIKE "error" AND BatchStart BETWEEN ? AND ?${
          searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
        }
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
          batch_time_min_Smaller
        FROM mixinganode_batch
        WHERE 
        System_Step NOT LIKE "error" AND
        BatchStart BETWEEN ? AND ?
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
            Member01_Name,  
            Member01_No
          FROM mixinganode_batch
          WHERE System_Step = "error" AND BatchStart BETWEEN ? AND ?${
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
            Member01_Name, 
            Member01_No
          FROM mixingcathode_batch
          WHERE System_Step = "error" AND BatchStart BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
        ) AS all_mix
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      params =
        searchTerm && FinalFind
          ? [
              start,
              end,
              `%${searchTerm}%`,
              start,
              end,
              `%${searchTerm}%`,
              limit,
              offset,
            ]
          : [start, end, start, end, limit, offset];
      break;
    default:
  }

  // 只有正極/負極混漿才加分頁
  if (option === "正極混漿" || option === "負極混漿") {
    sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
  }

  try {
    const [rows] = await dbmes.promise().query(sql, params);

    for (const row of rows) {
      if (row["BatchStart"] || row["BatchEnd"]) {
        const batchStartTime = moment(row["BatchStart"]);
        const batchEndTime = moment(row["BatchEnd"]);
        row["batch_time_diff"] = batchEndTime.diff(batchStartTime, "minutes");
      }
    }

    // 計算總筆數
    let sql_Count = "";
    let countParams = [];
    if (option === "全部資料") {
      sql_Count = `
        SELECT COUNT(*) AS totalCount FROM (
          SELECT id FROM mixinganode_batch WHERE Date BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
          UNION ALL
          SELECT id FROM mixingcathode_batch WHERE System_Step NOT LIKE "error" AND Date BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
        ) AS all_mix
      `;
      countParams =
        searchTerm && FinalFind
          ? [start, end, `%${searchTerm}%`, start, end, `%${searchTerm}%`]
          : [start, end, start, end];
    } else if (option === "正極混漿") {
      sql_Count = `SELECT COUNT(*) AS totalCount FROM mixingcathode_batch WHERE Date BETWEEN ? AND ?${
        searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
      }`;
      countParams =
        searchTerm && FinalFind
          ? [start, end, `%${searchTerm}%`]
          : [start, end];
    } else if (option === "負極混漿") {
      sql_Count = `SELECT COUNT(*) AS totalCount FROM mixinganode_batch WHERE Date BETWEEN ? AND ?${
        searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
      }`;
      countParams =
        searchTerm && FinalFind
          ? [start, end, `%${searchTerm}%`]
          : [start, end];
    } else if (option === "已刪除資訊") {
      sql_Count = `
        SELECT COUNT(*) AS totalCount FROM (
          SELECT id FROM mixinganode_batch WHERE System_Step = "error" AND Date BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ?` : ""
          }
          UNION ALL
          SELECT id FROM mixingcathode_batch WHERE System_Step = "error" AND Date BETWEEN ? AND ?${
            searchTerm && FinalFind ? ` AND ${FinalFind} LIKE ? ` : ""
          }
        ) AS all_mix
      `;
      countParams =
        searchTerm && FinalFind
          ? [start, end, `%${searchTerm}%`, start, end, `%${searchTerm}%`]
          : [start, end, start, end];
    }

    const [countResult] = await dbmes.promise().query(sql_Count, countParams);
    const totalRowsInbackend = countResult[0].totalCount;
    const sortRows = formatTimeFields(rows).map((row) => {
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
            id,
            '負極混漿' AS MixType,
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
    const [rows] = await dbmes.promise().query(sql, params);
    const sortRows = formatTimeFields(rows).map((row) => {
      const { errorReason, ...rowWithoutErrorReason } = row;
      return rowWithoutErrorReason;
    });

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(sortRows);
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
    //(-)負極
    `select distinct LotNo, Nvalue,Viscosity,ParticalSize ,SolidContent , CONCAT(DATE_FORMAT(BatchEnd, '%Y-%m-%d')) AS WorkDate FROM mes.mixinganode_batch`,
  ];

  //----------------end---------------

  //----------------搜尋total_min_max_avg_Data 數據庫的資料 start---------------

  const select_min_col = [
    //(-)負極
    "select MIN(CAST(Nvalue AS DECIMAL(10, 5))) as LH_Nvalue, \
     MIN(CAST(Viscosity AS DECIMAL(10, 3))) as LH_Viscosity , \
     MIN(CAST(ParticalSize AS DECIMAL(10, 5))) as LH_Partical , \
     MIN(CAST(SolidContent AS DECIMAL(10, 5))) as LH_SolidContent, \
     'AnodeMix_MIN_reult' as type FROM mes.mixinganode_batch",
  ];

  const select_max_col = [
    //(-)負極
    "select max(CAST(Nvalue AS DECIMAL(10, 5))) ,\
     max(CAST(Viscosity AS DECIMAL(10, 3))) , \
     max(CAST(ParticalSize AS DECIMAL(10, 5))) ,\
     max(CAST(SolidContent AS DECIMAL(10, 5))) ,\
    'AnodeMix_MAX_reult' FROM mes.mixinganode_batch ",
  ];

  //最小值query補償條件
  const Min_compensate = [
    //(-)負極
    "AND Viscosity REGEXP '^[0-9]{4,5}\\.[0-9]+$'",
  ];

  //最大值query補償條件
  const Max_compensate = [
    //(-)負極
    "AND Nvalue REGEXP '^[0-9]{1,2}\\.[0-9]{5}$' \
    AND SolidContent REGEXP '^[0-9]{2,3}\\.[0-9]{2}+$'",
  ];

  const select_avg_col = [
    //(-)負極
    "SELECT ROUND(AVG(CAST(Nvalue AS DECIMAL(10, 5))), 5) AS AVG_Nvalue , \
    ROUND(AVG(CAST(Viscosity AS DECIMAL(10, 1))), 1) AS AVG_Viscosity, \
    ROUND(AVG(CAST(ParticalSize AS DECIMAL(10,2))), 2) AS AVG_Partical, \
    ROUND(AVG(CAST(SolidContent AS DECIMAL(10,2))), 2) AS AVG_SolidContent,\
    'Mixing_AVG_Result' as type FROM mes.mixinganode_batch ",
  ];

  const sql_Related_Mixing = [
    //(-)負極
    ` where System_Step like '5' and  EngineerNo not like '349' and  BatchEnd BETWEEN  '${sortStartDate} 00:00:00' and '${sortEndDate} 23:59:59' `,
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

    //判定要查詢那個table
    //負極(-)混漿
    if (select_side_name === "-負極") {
      //升冪排序(日期由舊到新),Not Desc
      all_sql =
        select_columns[0] + sql_Related_Mixing[0] + "order by WorkDate;";

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
    }
    //正極(+)混漿
    else if (select_side_name === "+正極") {
    }

    // console.log("all_sql:", all_sql);
    // console.log("sql_Min_Max_Merge: ", sql_Min_Max_Merge);
    // console.log("sql_AVG平均值list: ", sql_Avg);

    //先收集全部數據庫日期(由最舊到最新)
    const [Mixing_Analysis_data] = await dbmes.promise().query(all_sql);

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

    const [Mixing_AnysisMinMax_Range] = await dbmes
      .promise()
      .query(sql_Min_Max_Merge);

    const minData = Mixing_AnysisMinMax_Range.find(
      (item) => item.type === "AnodeMix_MIN_reult"
    );

    const maxData = Mixing_AnysisMinMax_Range.find(
      (item) => item.type === "AnodeMix_MAX_reult"
    );

    const [Mixing_Average_Range] = await dbmes.promise().query(sql_Avg);

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

module.exports = router;
