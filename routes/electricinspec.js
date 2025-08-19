require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const _ = require("lodash");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const csv = require("fast-csv");
const { parse } = require("path");
const { google } = require("googleapis");
const path = require("path");
//const ngrok = require("@ngrok/ngrok");
const ngrok = require("ngrok");
const { nextTick } = require("process");

// let oauth2Client_ALL = new google.auth.OAuth2(
//   "300678730069-7a856akso2jvvmd2jpvh9ibpbcf6jbja.apps.googleusercontent.com",
//   "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"
//   // 這裡填入你的 OAuth2 回調 URL
// );

let oauth2Client = null; // 初始化 OAuth2 客戶端

let echk_digram_SearchData = [];
let newKey;

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid", // 如果你還需要登入資訊，可保留
];

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

const ngrokUrl = process.env.NGROK_PUBLIC_URL || "尚未啟動 ngrok";

const keyMap_echk = {
  Thick: "厚度",
  sealThick: "封口厚度",
  edge: "臨界電壓",
  modleID: "電芯號",
  date_sort: "日期",
  ir_: "絕緣阻抗",
  ocv_: "過保護電壓值",
};

function transformKeysWithPrefix(obj, prefixMap) {
  const result = {};
  Object.entries(obj).forEach(([key, value]) => {
    const matchedPrefix = Object.keys(prefixMap).find((prefix) =>
      key.startsWith(prefix)
    );

    // 如果有對應前綴才轉換，否則保留原 key
    const finalKey = matchedPrefix
      ? prefixMap[matchedPrefix] + key.slice(matchedPrefix.length)
      : key;

    if (typeof value === "string") {
      result[finalKey] = !isNaN(value)
        ? parseFloat(value.trim())
        : value.trim();
    } else {
      result[finalKey] = value;
    }
  });

  return result;
}

router.get("/authurl", async (req, res) => {
  console.log("接收到/authurl的請求，生成授權 URL");

  try {
    const redirectUri = `${global.ngrokUrl}/oauth2callback`;

    oauth2Client = new google.auth.OAuth2(
      "300678730069-7a856akso2jvvmd2jpvh9ibpbcf6jbja.apps.googleusercontent.com",
      "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",
      redirectUri
    );
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent", // 確保拿到 refresh_token
    });

    res.status(200).send({ url: authUrl });
    console.log("✅ 授權 URL 已生成:", authUrl);
  } catch (error) {
    res.status(500).send("❌ 生成授權 URL 時發生錯誤");
  }
});

router.get("/getapibaseURL", async (req, res) => {
  // const redirectUri = `${global.ngrokUrl}`;
  //  console.log(
  //   `接收到/getapibaseURL的請求，回傳 API 基礎 URL = " ${redirectUri}`
  // );

  const url = await ngrok.connect(3009); // 假設您的應用程式在 3009 埠上運行
  console.log(`ngrok 公開網址：${url}`);

  // 在此處設定您的 API 基礎 URL
  const redirectUri = `${url}`;

  console.log("✅ API 基礎 URL 已生成:", redirectUri);

  res.status(200).send({
    redUri: redirectUri,
    message: "✅ API 基礎 URL 已回傳",
  });
});

router.post("/oauth2callback", async (req, res) => {
  const { code, apiBase } = req.body;

  console.log("收到授權碼：", code);
  console.log("API 基礎 URL：", apiBase);

  try {
    const redirectUri = `${apiBase}/oauth2callback`;

    // 💡 在取得 token 時，明確指定 redirect_uri
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: redirectUri,
    });

    oauth2Client.setCredentials(tokens);

    // ✅ 儲存 token（推薦儲存在資料庫或安全檔案中）
    // fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));

    res.status(200).send({
      message: "✅ Token 已儲存",
      tokens: tokens,
    });
  } catch (err) {
    console.error("❌ 取得 token 錯誤：", err);
    res.status(500).send("取得 token 發生錯誤");
  }
});

router.get("/call_thickAndseal_irocv", async (req, res) => {
  const { view_selectside, isChecked, itemYear, itemMonth, selectedOption } =
    req.query;
  const uploadpath_echk = process.env.test_echk_batch;
  const filterAllData = [];
  let echk_run_table;

  // console.log(
  //   // "接收到get_thickweight_irocv的請求：",
  //   "電檢表站->" + "瀏覽總年數據->" + isChecked,
  //   "選擇站別為:" + view_selectside,
  //   itemYear,
  //   itemMonth,
  //   "選擇廠商為:" + selectedOption
  // );

  //工作模式
  const ceMode = view_selectside.split("_")[2]?.trim();
  //電檢特性檢視名稱
  const echk_viewtitle = view_selectside.split("_")[0]?.trim();

  //檢視廠商選取
  const vender_select = selectedOption.split("_")[1]?.trim();

  //切換echk 表單tch表單
  echk_run_table =
    vender_select === "option1"
      ? "echk_batch"
      : vender_select === "option2"
      ? "echk2_batch"
      : "";

  if (echk_run_table === "") {
    // console.error("發生選擇echk_batch錯誤", error);
    return res.status(401).send({
      message: `選擇echk_batch錯誤,原因為->${vender_select}無法辨識!`,
    });
  }

  //----------------搜尋total_all_Data 數據庫的資料 start---------------
  const select_columns = [
    //電池厚度
    ` CAST(PARAM03 AS DECIMAL(10,3)) as Thick1,
            CAST(PARAM04 AS DECIMAL(10,3)) as Thick2, 
            CAST(PARAM05 AS DECIMAL(10,3)) as Thick3,  
            CAST(PARAM06 AS DECIMAL(10,3)) as Thick4, 
            CAST(PARAM07 AS DECIMAL(10,3)) as Thick5, 
            CAST(PARAM08 AS DECIMAL(10,3)) as Thick6, 
            CAST(PARAM09 AS DECIMAL(10,3)) as Thick7,  
            CAST(PARAM10 AS DECIMAL(10,3)) as Thick8,  
            CAST(PARAM11 AS DECIMAL(10,3)) as Thick9`,
    //電池封口厚度
    ` ROUND(PARAM12, 7) AS sealThick1,ROUND(PARAM13, 7) AS sealThick2,ROUND(PARAM14, 7) AS sealThick3`,
    //電池IR-OCV
    ` ROUND(PARAM16, 11) AS ir_ce,TRUNCATE(PARAM17, 3) AS ocv_ce`,
    //臨界邊緣電壓edge(1 , 2)
    " TRUNCATE(PARAM18, 7) AS edgeV1 , TRUNCATE(PARAM19, 7) AS edgeV2",
  ];

  const select_columns_2 = [
    //電池厚度
    ` CAST(PARAM19 AS DECIMAL(10,3)) as Thick1,
            CAST(PARAM22 AS DECIMAL(10,3)) as Thick2, 
            CAST(PARAM25 AS DECIMAL(10,3)) as Thick3,  
            CAST(PARAM28 AS DECIMAL(10,3)) as Thick4, 
            CAST(PARAM31 AS DECIMAL(10,3)) as Thick5, 
            CAST(PARAM34 AS DECIMAL(10,3)) as Thick6, 
            CAST(PARAM37 AS DECIMAL(10,3)) as Thick7,  
            CAST(PARAM40 AS DECIMAL(10,3)) as Thick8,  
            CAST(PARAM43 AS DECIMAL(10,3)) as Thick9`,
    //電池封口厚度
    ` ROUND(PARAM08, 7) AS sealThick1,ROUND(PARAM13, 7) AS sealThick2,ROUND(PARAM16, 7) AS sealThick3`,
    //電池IR-OCV
    ` ROUND(PARAM49, 11) AS ir_ce,TRUNCATE(PARAM52, 3) AS ocv_ce`,
    //臨界邊緣電壓edge(1 , 2)
    " TRUNCATE(PARAM55, 7) AS edgeV1 , TRUNCATE(PARAM58, 7) AS edgeV2",
  ];

  const select_columns_Date_echk = [
    `,DATE_FORMAT(TIME, '%Y-%m-%d') AS date_sort from mes.${echk_run_table} WHERE CAST(ID AS UNSIGNED) > 2 `,
  ];

  //----------------end---------------

  try {
    let all_sql;

    const echk_vender1 = vender_select === "option1"; //右洋一期
    const echk_vender2 = vender_select === "option2"; //孟申二期

    // 防止一開始沒有選擇廠商導致 SQL syntax error
    if (echk_vender1 === false && echk_vender2 === false) {
      return res.status(402).send({
        message: "無法辨識供應商(vender)，請確認選項。",
      });
    }

    const echk_ackmode = echk_vender1
      ? "PARAM01"
      : echk_vender2
      ? "TESTMODE"
      : "";

    //初始化 all_sql
    all_sql = "SELECT  PLCCellID_CE as modleID,";

    //確定已找到電檢表"echk" 關鍵字
    if (selectedOption.includes("echk")) {
      if (String(echk_viewtitle).includes("厚度")) {
        //厚度
        if (!String(echk_viewtitle).includes("封口")) {
          all_sql += echk_vender1
            ? select_columns[0]
            : echk_vender2
            ? select_columns_2[0]
            : "";
        } //封口厚度
        else {
          all_sql += echk_vender1
            ? select_columns[1]
            : echk_vender2
            ? select_columns_2[1]
            : "";
        }
      } else {
        if (String(echk_viewtitle).includes("IR-OCV")) {
          all_sql += echk_vender1
            ? select_columns[2]
            : echk_vender2
            ? select_columns_2[2]
            : "";
        } else if (String(echk_viewtitle).includes("臨界邊緣電壓")) {
          all_sql += echk_vender1
            ? select_columns[3]
            : echk_vender2
            ? select_columns_2[3]
            : "";
        }
      }

      all_sql += `${select_columns_Date_echk[0]} AND year(TiME) = ${itemYear} AND ${echk_ackmode} = '${ceMode}'`;

      //需要多增加月份查詢
      if (isChecked === "false") {
        console.log(`有增加月份選取,該年 ${itemYear}/${itemMonth}月總數據`);
        all_sql += ` AND month(TiME) = ${itemMonth}`;
      } else {
        console.log(`求該年 ${itemYear}總數據`);
      }
    }

    // all_sql += " ORDER by ID DESC";
    // console.log("電檢表SQL= " + all_sql);

    //先收集全部數據庫日期(由最舊到最新)
    const [echk_Analysis_data] = await dbmes.query(all_sql);

    echk_Analysis_data.forEach((item) => {
      const dateObj = new Date(item.date_sort);
      const year = dateObj.getFullYear();
      const month = (dateObj.getMonth() + 1).toString().padStart(2, "0"); // 确保月份是两位数
      const day = dateObj.getDate().toString().padStart(2, "0"); // 确保日期是两位数
      const formattedDate = `${year}-${month}-${day}`; // 格式化为 YYYY:MM:DD
      let transformedItem = {};

      Object.keys(item).forEach((key) => {
        const value = item[key];

        // if (
        //   key.startsWith("Thick") ||
        //   key.startsWith("sealThick") ||
        //   key.startsWith("edge") ||
        //   key.startsWith("modleID")
        // ) {
        //   // CC1 站的鍵名轉換
        //   newKey = keyMap_echk[key] || key;
        // } else {
        //   newKey = key; // 保持原键名
        // }

        // 顯示->使用映射表转换键名
        transformedItem = transformKeysWithPrefix(item, keyMap_echk);

        // 顯示-> 保持原來鍵名
        // newKey = key; // 保持原键名
        // if (key === "date_sort") {
        //   transformedItem[newKey] = formattedDate;
        // } else if (typeof value === "string") {
        //   transformedItem[newKey] = !isNaN(value)
        //     ? parseFloat(value.trim())
        //     : value.trim();
        // } else {
        //   transformedItem[newKey] = value;
        // }
      });

      filterAllData.push(transformedItem);
    });

    // console.log("電檢表echk數據 = " + JSON.stringify(filterAllData, null, 2));

    //將總查詢數據data存入鍵名 'echkall'
    echk_digram_SearchData = []; // 清空全域變數
    echk_digram_SearchData.push({ echkall: filterAllData });

    res.status(200).json({
      message:
        isChecked === "true"
          ? "取得總電檢表echk數據成功"
          : `取得${itemYear}年,${itemMonth}月份電檢表echk數據成功`,
      echkall: echk_digram_SearchData[0].echkall,
      ceMode: ceMode,
    });
  } catch (error) {
    return res.status(500).json({
      message: "⚠️ 尚未成功查詢(電檢表數據)，有錯誤。",
      error: error.message,
    });

    // // 如果還沒送出 response，再回傳錯誤訊息
    // if (!res.headersSent) {
    //   return res.status(500).json({
    //     message: "⚠️ 尚未成功查詢(電檢表數據)，有錯誤。",
    //     error: error.message,
    //   });
    // }
  }

  // try {
  //   const tokenData = fs.readFileSync("token.json", "utf8");
  //   oauth2Client.setCredentials(JSON.parse(tokenData));
  //   console.log("✅ Token 已載入");
  // } catch (e) {
  //   console.error("❌ 無法載入 token.json，請先走過 /authurl 流程");
  //   return res.status(401).send("⚠️ 尚未授權，請先走過 /authurl 流程");
  // }

  // const drive = google.drive({ version: "v3", auth: oauth2Client });

  // if (!fs.existsSync(uploadpath_echk)) {
  //   return res
  //     .status(400)
  //     .json({ error: "上傳路徑不存在：" + uploadpath_echk });
  // }

  // try {
  //   const driveRes = await drive.files.create({
  //     requestBody: {
  //       name: "echk_batch_export_1_500.csv",
  //       mimeType: "text/csv",
  //     },
  //     media: {
  //       mimeType: "text/csv",
  //       body: fs.createReadStream(uploadpath_echk),
  //     },
  //   });

  //   console.log("✅ 上傳成功:", driveRes.data);
  //   res.status(200).send({
  //     message: "電檢表格參數已接收",
  //     fileId: driveRes.data.id,
  //   });
  // } catch (err) {
  //   console.error("❌ 上傳檔案失敗:", err);
  //   if (err.response?.status === 401 || err.response?.status === 403) {
  //     return res.status(401).send("Token 權限不足，請重新授權 /authurl");
  //   }
  //   res.status(500).send("上傳失敗");
  // }
});

router.post("/vaildmodle_list", async (req, res) => {
  const datainfo = req.body;

  // console.log(
  //   "接收到vaildmodle_list的請求，日期接收為：",
  //   JSON.stringify(datainfo, null, 2)
  // );

  const stDate = datainfo.startDate;
  const endDate = datainfo.endDate;

  const vender_table =
    datainfo.echkvender === "echk1" ? "mes.echk_batch" : "mes.echk2_batch"; // 切換對應的mes電檢表名稱

  try {
    const sql = `SELECT distinct PLCCellID_CE FROM ${vender_table} WHERE DATE(Time) BETWEEN '${stDate}' AND '${endDate}'
                 ORDER BY id DESC;`;
    const [echk_modle_all] = await db2.query(sql);

    // console.log(
    //   "" + "取得電檢表echk 電芯列表成功：",
    //   JSON.stringify(echk_modle_all, null, 2)
    // );

    const echk_modle_list = echk_modle_all.map((item, idx) => {
      const modleID = item.PLCCellID_CE;
      // if (!modleID) {
      //   console.warn(
      //     `第 ${idx} 筆資料的 PLCCellID_CE 為 null 或 undefined`,
      //     item
      //   );
      // }
      return modleID ? modleID.replace(/\s+/g, "") : ""; // 若為 null，回傳空字串或其他預設值
    });

    // console.log(
    //   "取得電檢表echk 電芯列表成功：",
    //   JSON.stringify(echk_modle_list, null, 2)
    // );

    const vender = datainfo.echkvender === "echk1" ? "右洋" : "孟申"; // 取得前端傳來的廠商選擇
    const echk_finaldata = { vender: vender, modle_list: echk_modle_list }; // 使用 lodash 去除重複值

    res.status(200).send(echk_finaldata); // 將廠商及電芯列表名稱回傳至前端
  } catch (error) {
    // disconnect_handler(db);
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

//取得電檢表echk 單一電芯數據
router.get("/characteristics_modle", async (req, res) => {
  const { modle, RadioValue } = req.query;
  let thick = [],
    sealthick = [],
    ir_edge = [],
    ocv = [];

  // console.log(
  //   "接收到characteristics_modle的請求，電芯號為：",
  //   modle,
  //   "RadioValue為:",
  //   RadioValue
  // );

  const vender_table =
    RadioValue === "echk1" ? "mes.echk_batch" : "mes.echk2_batch"; // 切換對應的mes電檢表名稱

  try {
    const sql = `SELECT * FROM ${vender_table} WHERE TRIM(PLCCellID_CE) = '${modle}' ORDER BY ID DESC LIMIT 1;`;

    // console.log("SQL 查詢語句:", sql);

    const [echk_modle] = await db2.query(sql);

    if (echk_modle.length === 0) {
      return res.status(404).json({
        message: `未找到電芯號 ${modle} 的數據`,
      });
    }

    // 遍歷 echk_modle 的每個鍵，並對值進行 trim() 操作
    if (Array.isArray(echk_modle)) {
      echk_modle.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          Object.keys(item).forEach((key) => {
            // 檢查物件值是否為字串且包含空格
            if (typeof item[key] === "string" && item[key].includes(" ")) {
              item[key] = item[key].trim(); // 刪除字串兩端的空白字符
              // console.log(`鍵: ${key}, 經過 trim 處理後的值: ${item[key]}`);
            }

            const paramIndex = parseInt(key.replace("PARAM", ""));
            //判定為數字格式
            if (!isNaN(paramIndex)) {
              const num = parseFloat(item[key]);
              //右洋一期--------------------start------------
              if (!isNaN(num) && RadioValue === "echk1") {
                //厚度和OCV
                if (
                  (paramIndex >= 3 && paramIndex <= 11) ||
                  paramIndex === 17
                ) {
                  item[key] = num.toFixed(3); // 轉成字串，保留 3 位小數

                  paramIndex === 17
                    ? ocv.push(item[key])
                    : thick.push(item[key]);
                } //封口厚度和臨界電壓
                else if (
                  (paramIndex >= 12 && paramIndex <= 14) ||
                  paramIndex === 18 ||
                  paramIndex === 19
                ) {
                  item[key] = num.toFixed(10); // 轉成字串，保留 10 位小數

                  paramIndex >= 12 && paramIndex <= 14
                    ? sealthick.push(item[key])
                    : ir_edge.push(item[key]);
                } //IR 紅外線微電壓
                else if (paramIndex === 16) {
                  item[key] = num.toFixed(11); // 轉成字串，保留 11 位小數
                  ir_edge.push(item[key]);
                }
              } //--------------------end--------------------------
              //孟申二期--------------------start------------
              else if (!isNaN(num) && RadioValue === "echk2") {
                //厚度和OCV  選取 PARAM22,25,28...43
                if (
                  (paramIndex > 16 &&
                    paramIndex < 44 &&
                    (paramIndex - 16) % 3 === 0) ||
                  paramIndex === 52
                ) {
                  item[key] = num.toFixed(3); // 轉成字串，保留 3 位小數

                  paramIndex === 52
                    ? ocv.push(item[key])
                    : thick.push(item[key]);
                } //封口厚度和臨界電壓
                else if (
                  (paramIndex <= 16 && paramIndex % 8 === 0) ||
                  paramIndex === 13 ||
                  paramIndex === 55 ||
                  paramIndex === 58
                ) {
                  item[key] = num.toFixed(10); // 轉成字串，保留 10 位小數

                  paramIndex === 55 || paramIndex === 58
                    ? ir_edge.push(item[key])
                    : sealthick.push(item[key]);
                } //IR 紅外線微電壓
                else if (paramIndex === 49) {
                  item[key] = num.toFixed(11); // 轉成字串，保留 11 位小數
                  ir_edge.push(item[key]);
                }
              }
            }
          });
        }
      });
    }

    // console.log(
    //   `取得電檢表:${vender_table} 電芯->${modle}參數成功：`,
    //   JSON.stringify(echk_modle, null, 2)
    // );

    // console.log("thick 重整為 = " + thick);
    // console.log("sealthick重整為 = " + sealthick);
    // console.log("ir_edge重整為 = " + ir_edge);
    // console.log("ocv重整為 = " + ocv);

    // realtimebatch_RT_Aging.push({ batchtable: result_RT.recordsets[1] });
    const vender = RadioValue === "echk1" ? "右洋" : "孟申"; // 取得前端傳來的廠商選擇
    const model_echk_characteristic = {
      vender: vender,
      modleID: modle,
      thick: thick,
      sealthick: sealthick,
      ir_edge: ir_edge,
      ocv: ocv,
    };

    // console.log(
    //   "model_echk_characteristic = " +
    //     JSON.stringify(model_echk_characteristic, null, 2)
    // );

    res.status(200).send(model_echk_characteristic); // 將廠商及索引電芯參數回傳至前端
  } catch (error) {
    console.error("發生錯誤", error);
    return res.status(500).json({
      message: "取得電檢表echk 單一電芯數據錯誤",
    });
  }
});

module.exports = router;
