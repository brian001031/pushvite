require("dotenv").config();
const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const { Sequelize } = require("sequelize");
const jwt = require("jsonwebtoken");
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
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

dbcon.once("error", (err) => {
  console.log("Error in connecting to database: ", err);
});

if (!dbcon.__errorListenerAdded) {
  dbcon.on("error", (err) => {
    console.error("Database connection error:", err);
  });
  dbcon.__errorListenerAdded = true; // 标记监听器已添加

  //確認連線狀況是否正常
  dbcon.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting connection:", err);
      return err;
    }
  });
  dbcon.promise();
}

//需要更新的鍵名
let update_key_column = {};
let updateParams_step2to5 = [];
let main_mixselect, mixing_sql_column, mixingbatch_run_record;

//權限擁有人(engineer)清單
const engineer_foremanlist = ["349|周柏全", "068|洪彰澤"];

// CathNode正極混漿取指定欄位
const CathNodeMixKeyNeed = [
  "EngineerName",
  "EngineerNo",
  "BatchStart",
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
  "MNP_3",
  "ReceipeNo",
  "deviceNo",
  "Recipe",
  "ListNo",
  "Filter_Mesh",
  "batch_time_min",
];

// Anode負極混漿取指定欄位
const AnodeMixKeyNeed = [
  "EngineerName",
  "EngineerNo",
  "BatchStart",
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
  "deviceNo",
  "Recipe",
  "Filter_Mesh",
  "batch_time_min",
  "Water_1_LoadingWeight",
  "Water_2_LoadingWeight",
  "NMP",
  "Water_3_LoadingWeight",
  "ListNo",
];

const update_jwtmix_secret = () => {
  try {
    // 產生隨機 32 bytes 並轉成 hex
    const newSecret = crypto.randomBytes(32).toString("hex");

    // 替換或新增 JWT_SECRET_MIX
    if (envContent.includes("JWT_SECRET_MIX=")) {
      envContent = envContent.replace(
        /JWT_SECRET_MIX=.*/g,
        `JWT_SECRET_MIX=${newSecret}`
      );
    } else {
      envContent += `\nJWT_SECRET_MIX=${newSecret}`;
    }

    // 寫回 .env 檔案
    fs.writeFileSync(envPath, envContent);
    console.log("JWT_SECRET_Mixed updated successfully.");
  } catch (error) {
    console.error("Error updating JWT_SECRET_Mixed:", error);
    throw new Error("Failed to update JWT_SECRET_Mixed");
  }
};

async function Batch_Transport_Final_upkeycheck(mixquery_data) {
  //查詢目前前端提交更新mixingkey datalist
  console.log(JSON.stringify(mixquery_data, null, 2));

  const mixselect = mixquery_data?.MixingSelect?.toString?.() || "";

  main_mixselect = mixselect;

  console.log("目前要更新站為= " + main_mixselect);

  // 清空暫存 KEY UPDATE 數據
  update_key_column = {}; // 重設為空物件

  const targetMixingKeys = mixselect.includes("正極混漿")
    ? CathNodeMixKeyNeed
    : mixselect.includes("負極混漿")
    ? AnodeMixKeyNeed
    : [];

  //有請求提交數據
  if (targetMixingKeys) {
    targetMixingKeys.forEach((key) => {
      if (key in mixquery_data) {
        //只找尋前端前有提供的key存入update Key空間區
        update_key_column[key] = mixquery_data[key] ?? "";
      }
    });
  }

  // 使用時確定 update_key_column 有資料再呼叫
  //確認要update 的正負極batch參數list
  if (Object.keys(update_key_column).length > 0) {
    updateParams_step2to5.length = 0;
    updateParams_step2to5 = getUpdateMixParams(update_key_column, mixselect);
  }
}

async function comfirm_mixing_patch_query(
  mixselect,
  mixingpatch_acktable,
  step_num
) {
  //StartMixing 執行 insert ----------step_num 1
  if (parseInt(step_num) === 1) {
    //正負極欄位一致
    mixing_sql_column = `INSERT INTO ${mixingpatch_acktable} (EngineerName,EngineerNo,BatchStart,LoadingTankNo,System_Step,ReturnStatus,LotNo)
                         VALUES
                             ('${update_key_column.EngineerName}',
                              '${update_key_column.EngineerNo}',
                              '${update_key_column.BatchStart}',
                              '${update_key_column.LoadingTankNo}',
                              '${update_key_column.System_Step}',
                              '${update_key_column.ReturnStatus}',
                              '${update_key_column.LotNo}');
                         `;
  }
  //StartTransport -> End  執行 update  ----------step_num 2~5
  else {
    mixing_sql_column = `UPDATE ${mixingpatch_acktable} SET `;

    if (mixselect.indexOf("正極混漿") !== -1) {
      mixing_sql_column += ` 
        EngineerName = ?,
        EngineerNo = ?,
        BatchStart = ?,
        BatchEnd = ?,
        TransportStart = ?,
        TransportEnd = ?,
        loadingTankNo = ?,
        System_Step = ?,
        ReturnStatus = ?,
        Member01_Name = ?,
        Member01_No = ?,
        Member02_Name = ?,
        Member02_No = ?,
        LFP_1 = ?,
        LFP_2 = ?,
        SuperP_1 = ?,
        SuperP_2 = ?,
        PVDF_1 = ?,
        PVDF_2 = ?,
        CNT_1 = ?,
        CNT_2 = ?,
        NMP_1 = ?,
        NMP_2 = ?,
        Date = ?,
        LotNo = ?,
        Nvalue = ?,
        Viscosity = ?,
        ParticalSize = ?,
        SolidContent = ?,
        FinalTime = ?,
        ProductionType = ?,
        NMP_1_Loading_Weight = ?,
        NMP_2_Loading_Weight = ?,
        CNT_1_Loading_Weight = ?,
        MNP_3 = ?,
        ReceipeNo = ?,
        deviceNo = ?,
        Recipe = ?,
        ListNo = ?,
        Filter_Mesh = ?,
        batch_time_min = ?`;
    } else if (mixselect.indexOf("負極混漿") !== -1) {
      mixing_sql_column += `
        EngineerName = ?,
        EngineerNo = ?,
        BatchStart = ?,
        BatchEnd = ?,
        TransportStart = ?,
        TransportEnd = ?,
        loadingTankNo = ?,
        System_Step = ?,
        ReturnStatus = ?,
        Member01_Name = ?,
        Member01_No = ?,
        Member02_Name = ?,
        Member02_No = ?,
        Graphite1_1 = ?,
        Graphite1_2 = ?,
        Super_P_1 = ?,
        Super_P_2 = ?,
        CMC_1 = ?,
        CMC_2 = ?,
        Graphite_2_1 = ?,
        Graphite_2_2 = ?,
        SBR_1 = ?,
        SBR_2 = ?,
        NMP_1_1 = ?,
        NMP_1_2 = ?,
        PAA_1 = ?,
        PAA_2 = ?,
        Date = ?,
        LotNo = ?,
        FinalTime = ?,
        Nvalue = ?,
        Viscosity = ?,
        ParticalSize = ?,
        SolidContent = ?,
        ProductionType = ?,
        ReceipeNo = ?,
        deviceNo = ?,
        Recipe = ?,
        Filter_Mesh = ?,
        batch_time_min = ?,
        Water_1_LoadingWeight = ?,
        Water_2_LoadingWeight = ?,
        NMP = ?,
        Water_3_LoadingWeight = ?,
        ListNo = ?`;
    }
    //最後where條件一致
    mixing_sql_column += `
    WHERE
        EngineerName = ?
      AND
        loadingTankNo = ?
      AND        
        ReturnStatus = ?`;
  }
}

async function getUpdateMixParams(update_key_column, mixselect) {
  if (mixselect.includes("正極混漿")) {
    //update_MixCathNodeParams
    return [
      update_key_column.EngineerName,
      update_key_column.EngineerNo,
      update_key_column.BatchStart,
      update_key_column.BatchEnd,
      update_key_column.TransportStart,
      update_key_column.TransportEnd,
      update_key_column.loadingTankNo,
      update_key_column.System_Step,
      update_key_column.ReturnStatus,
      update_key_column.Member01_Name,
      update_key_column.Member01_No,
      update_key_column.Member02_Name,
      update_key_column.Member02_No,
      update_key_column.LFP_1,
      update_key_column.LFP_2,
      update_key_column.SuperP_1,
      update_key_column.SuperP_2,
      update_key_column.PVDF_1,
      update_key_column.PVDF_2,
      update_key_column.CNT_1,
      update_key_column.CNT_2,
      update_key_column.NMP_1,
      update_key_column.NMP_2,
      update_key_column.Date,
      update_key_column.LotNo,
      update_key_column.Nvalue,
      update_key_column.Viscosity,
      update_key_column.ParticalSize,
      update_key_column.SolidContent,
      update_key_column.FinalTime,
      update_key_column.ProductionType,
      update_key_column.NMP_1_Loading_Weight,
      update_key_column.NMP_2_Loading_Weight,
      update_key_column.CNT_1_Loading_Weight,
      update_key_column.MNP_3,
      update_key_column.ReceipeNo,
      update_key_column.deviceNo,
      update_key_column.Recipe,
      update_key_column.ListNo,
      update_key_column.Filter_Mesh,
      update_key_column.batch_time_min,
      update_key_column.EngineerName,
      update_key_column.loadingTankNo,
      update_key_column.ReturnStatus,
    ];
  } else if (mixselect.includes("負極混漿")) {
    //update_MixAnodeParams
    return [
      update_key_column.EngineerName,
      update_key_column.EngineerNo,
      update_key_column.BatchStart,
      update_key_column.BatchEnd,
      update_key_column.TransportStart,
      update_key_column.TransportEnd,
      update_key_column.loadingTankNo,
      update_key_column.System_Step,
      update_key_column.ReturnStatus,
      update_key_column.Member01_Name,
      update_key_column.Member01_No,
      update_key_column.Member02_Name,
      update_key_column.Member02_No,
      update_key_column.Graphite1_1,
      update_key_column.Graphite1_2,
      update_key_column.Super_P_1,
      update_key_column.Super_P_2,
      update_key_column.CMC_1,
      update_key_column.CMC_2,
      update_key_column.Graphite_2_1,
      update_key_column.Graphite_2_2,
      update_key_column.SBR_1,
      update_key_column.SBR_2,
      update_key_column.NMP_1_1,
      update_key_column.NMP_1_2,
      update_key_column.PAA_1,
      update_key_column.PAA_2,
      update_key_column.Date,
      update_key_column.LotNo,
      update_key_column.FinalTime,
      update_key_column.Nvalue,
      update_key_column.Viscosity,
      update_key_column.ParticalSize,
      update_key_column.SolidContent,
      update_key_column.ProductionType,
      update_key_column.ReceipeNo,
      update_key_column.deviceNo,
      update_key_column.Recipe,
      update_key_column.Filter_Mesh,
      update_key_column.batch_time_min,
      update_key_column.Water_1_LoadingWeight,
      update_key_column.Water_2_LoadingWeight,
      update_key_column.NMP,
      update_key_column.Water_3_LoadingWeight,
      update_key_column.ListNo,
      update_key_column.EngineerName,
      update_key_column.loadingTankNo,
      update_key_column.ReturnStatus,
    ];
  }
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

    const fix_3size_enginneerID = engineer_id.toString().padStart(3, "0");

    // 查詢混槳資料
    const [rows_mix_reg] = await dbcon
      .promise()
      .query("SELECT * FROM mixing_register WHERE EngineerNo = ?", [
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

    // 直接比較密碼，假設已經是明文存儲
    const isPasswordValid = mix_engineer_regino.Password === password;

    if (!isPasswordValid) {
      return res
        .status(402)
        .json({ error: `${password}<-登入密碼比對註冊密碼不一致,錯誤!` });
    }

    // 目前設定為每次登入都更新
    // 這樣可以確保每次登入都使用新的密鑰
    update_jwtmix_secret();

    const [rows_mix_dataset] = await dbcon
      .promise()
      .query(
        "SELECT * FROM mixing_register WHERE EngineerName = ? AND MixingSelect = ? ",
        [engineer_name, mix_select_side]
      );

    // 建立 JWT token
    // const token = jwt.sign(
    //   {
    //     engineer_id: mix_engineer_regino.EngineerNo,
    //     engineer_name: mix_engineer_regino.EngineerName,
    //   },
    //   process.env.JWT_SECRET_MIX, // 使用新的 JWT_SECRET_MIX
    //   { expiresIn: "1h" }
    // );
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

//取得混槳工作序參數設定值
// router.get("/engineerDataSet", async (req, res) => {
//   const { engineer_name, mix_select_side } = req.query;
//   // const fix_3size_enginneerID = engineer_id.toString().padStart(3, "0");
//   try {
//     // 查詢混槳資料(正極或負極)當下登入工程師設定的各項參數
//     const [rows_mix_dataset] = await dbcon
//       .promise()
//       .query(
//         "SELECT * FROM mixing_register WHERE EngineerName = ? AND MixingSelect = ? ",
//         [engineer_name, mix_select_side]
//       );

//     if (rows_mix_dataset.length >= 0) {
//       return res.status(200).json({
//         data: rows_mix_dataset[0],
//         setting_msg:
//           rows_mix_dataset.length === 0
//             ? `工程師:${engineer_name} ${mix_select_AnorCath} 混槳工作序參數設定值不存在`
//             : `工程師:${engineer_name} ${mix_select_AnorCath} 混槳工作序參數設定值已存在`,
//       });
//     }
//   } catch (error) {
//     //console.error("Error mix engineerDataSet:", error);
//     res.status(500).json({ error: "Error mix Get engineerDataSet" });
//   }
// });

//提交混槳工作序參數設定值
router.post("/engineerDataSet", async (req, res) => {
  const mixparamList = req.body;
  console.log("接收 insert mixparamList = ", JSON.stringify({ mixparamList }));

  try {
  } catch (error) {
    console.error("Error in /engineerDataSet:", error);
    res.status(500).json({ error: "post mix Dataset error" });
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
    "deviceNo",
    "Recipe",
    "Filter_Mesh",
    "batch_time_min",
    "Water_1_LoadingWeight",
    "Water_2_LoadingWeight",
    "Water_3_LoadingWeight",
    "NMP",
    "NMP_1_Loading_Weight",
    "NMP_2_Loading_Weight",
    "CNT_1_Loading_Weight",
    "MNP_3",
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
    ? moment(rawDate).format("YYYY-MM-DD HH:mm:ss")
    : null;
  MixUpdateParams.Submittime = formattedDate;

  //因deviceNo (設備編號和) 和 loadingTankNo (下料桶號)前端送來格是有確認為array,最終要存入資料庫的欄位是字串
  //所以要轉成字串
  MixUpdateParams.deviceNo = Array.isArray(MixUpdateParams.deviceNo)
    ? MixUpdateParams.deviceNo.join(",")
    : MixUpdateParams.deviceNo;
  MixUpdateParams.loadingTankNo = Array.isArray(MixUpdateParams.loadingTankNo)
    ? MixUpdateParams.loadingTankNo.join(",")
    : MixUpdateParams.loadingTankNo;

  const updateParams = [
    MixUpdateParams.Submittime,
    MixUpdateParams.ProductionType,
    MixUpdateParams.ReceipeNo,
    MixUpdateParams.deviceNo,
    MixUpdateParams.Recipe,
    MixUpdateParams.Filter_Mesh,
    MixUpdateParams.batch_time_min,
    MixUpdateParams.Water_1_LoadingWeight,
    MixUpdateParams.Water_2_LoadingWeight,
    MixUpdateParams.Water_3_LoadingWeight,
    MixUpdateParams.NMP,
    MixUpdateParams.NMP_1_Loading_Weight,
    MixUpdateParams.NMP_2_Loading_Weight,
    MixUpdateParams.CNT_1_Loading_Weight,
    MixUpdateParams.MNP_3,
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
            deviceNo = ?,
            Recipe = ?,
            Filter_Mesh = ?,
            batch_time_min = ?,
            Water_1_LoadingWeight = ?,
            Water_2_LoadingWeight = ?,
            Water_3_LoadingWeight = ?,
            NMP = ?,
            NMP_1_Loading_Weight = ?,
            NMP_2_Loading_Weight = ?,
            CNT_1_Loading_Weight = ?,
            MNP_3 = ?,
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

  //目前只需要將Mix選擇其一
  const Mix_batch_table =
    mix_select_side.indexOf("正極混漿") !== -1
      ? "mixingcathode_batch"
      : "mixinganode_batch";

  //將主表批次紀錄資料擷取並回傳
  const [mixinfo_inner_alldata] = await dbmes
    .promise()
    .query(
      `SELECT * FROM ${Mix_batch_table} WHERE EngineerName = ? AND System_Step !='5' AND ReturnStatus !='' ORDER BY id DESC`,
      [engineer_name]
    );

  //都將目前搜尋的結果數據回傳前端,即便是空資料
  const hasData = mixinfo_inner_alldata.length > 0;
  const message =
    `工程師:${
      mixinfo_inner_alldata[0]?.EngineerName || engineer_name
    } ${mix_select_side}分配工作批次` +
    (hasData ? "尚未完成進度資訊回傳前端" : "第一次執行批次");

  res.status(200).json({
    data: mixinfo_inner_alldata, // 空陣列也送
    message,
  });
});

//混槳主要批次畫面依據前端提供req.body (...更新鍵名指定值)
router.post("/mixingInfo_inner_post", async (req, res) => {
  const mixinfoupdate = req.body;
  let mixinginner_table;

  //整理後續要更新的key
  Batch_Transport_Final_upkeycheck(mixinfoupdate);

  //目前依據System_Step 的回傳(1執行insert,其餘都update)
  const update_step = parseInt(update_key_column.System_Step);

  //若mixselect空
  if (main_mixselect === "" || update_step === "") {
    res.status(404).json({
      error: `目前錯誤狀態->選擇站別為:${main_mixselect} 流程step為 ${update_step} `,
    });
  } else {
    //選擇主要提交update/insert 正負極innertable
    mixinginner_table =
      main_mixselect.indexOf("正極混漿") !== -1
        ? "mixingcathode_batch"
        : "mixinganode_batch";

    //確認那些column並重整sql ,依據正負極混漿有不同組合(目前正極col數量比負極少)
    comfirm_mixing_patch_query(main_mixselect, mixinginner_table, update_step);
  }

  //最終要執行的SQL
  console.log(
    `${main_mixselect},Step(${update_step})要執行的SQL= ` + mixing_sql_column
  );

  //後續執行query , insert 不需要param,update 需要
  if (update_step === 1) {
    [mixingbatch_run_record] = await dbmes.promise().query(mixing_sql_column);
  } else {
    //要更新的param
    console.log(updateParams_step2to5);
    [mixingbatch_run_record] = await dbmes
      .promise()
      .query(mixing_sql_column, updateParams_step2to5);
  }

  //都將目前搜尋的結果數據回傳前端,即便是空資料

  const message = `已完成:${main_mixselect} 第${update_step} step ${mixinginner_table}工作批次`;

  //確定INSERT/UPDATE 一筆單有正常運行
  if (mixingbatch_run_record.length > 0) {
    res.status(200).json({
      message,
    });
  } else {
    res.status(500).json({
      error: "mixingInfo_inner_post error ! 請確認傳輸結構是否有異常",
    });
  }
});

module.exports = router;
