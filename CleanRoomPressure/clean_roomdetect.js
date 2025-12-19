const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const mysql = require("mysql2");
const multer = require("multer");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const fs = require("fs");
const readline = require("readline");
const path = require("path");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const { parseString } = require("fast-csv");
const moment = require("moment-timezone");

// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js"); // hr 資料庫
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫

const inert_field = [
  "dtinfo",
  "month",
  "CR1B22_1",
  "CR1B22_2",
  "CR1B24_1",
  "CR1B24_2",
];
let default_clean_presure = [-100, -2, 10, 20];

const getTaiwanTime = () => {
  const options = {
    timeZone: "Asia/Taipei", // 设置时区为台北 (UTC+8)
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false, // 24小时制
  };

  const taiwanTime = new Date().toLocaleString("en-GB", options);
  // 假設你希望格式為 年-日-月 時:分:秒
  const formattedTime = taiwanTime
    .replace(",", "")
    .replace("/", "-")
    .replace("/", "-")
    .split(" ");
  const datePart = formattedTime[0].split("-");
  const timePart = formattedTime[1];

  return `${datePart[2]}-${datePart[1]}-${datePart[0]} ${timePart}`;
};

// setInterval(async () => {
//   const current_dateTime = getTaiwanTime(); // 获取当前时间

//   // 取得台北時區的當前'月份'
//   const curr_Month = moment.tz("Asia/Taipei").format("MM");

//   try {
//     const applyRandomValue = default_clean_presure.map(
//       (value) => value + Math.floor(Math.random() * 101) - 50
//     );

//     let total_insert_value = [];
//     total_insert_value.push(current_dateTime);
//     total_insert_value.push(curr_Month);
//     total_insert_value.push(...applyRandomValue); // 展開 applyRandomValue 使每個數值成為單獨元素

//     const values = total_insert_value.map((row) =>
//       row != null && row !== "" ? row : ""
//     );
//     const placeholders = `(${values.map(() => "?").join(", ")})`;

//     const test_sql = `INSERT INTO test_presure_simulation (${inert_field.join(
//       ","
//     )}) VALUES ${placeholders}`;

//     const [insert_simulation_Raw] = await dbcon.query(test_sql, values);
//     // console.log("模擬結果 result = " + JSON.stringify(insert_simulation_Raw));
//   } catch (error) {
//     console.error("發生錯誤", error);
//   }
// }, 10000); // 10 秒 = 10000 毫秒

// 即時監控數據更新靜壓值
router.get("/detect_current_value", async (req, res) => {
  const { current_date, record_type } = req.query;
  // console.log(
  //   "即時監控數據接收日期為:" + current_date + " , 檢視紀錄型態=" + record_type
  // );

  const test_date = "";

  const St_current_Date =
    test_date !== "" ? test_date + " 00:00:00" : current_date + " 00:00:00";
  const Ed_current_Date =
    test_date !== "" ? test_date + " 23:59:59" : current_date + " 23:59:59";

  const Pa_record_table_with_datetime =
    record_type === "realtime"
      ? "mes.cr1bdata where Time"
      : "mes.coating_pressure_log where datetime";

  const sort_Data_field = record_type === "realtime" ? "ID" : "datetime";

  try {
    // 宣告存取每個欄位的陣列
    const realtime_result = {};
    //將日期,CR1B22/24 1~2 資料列打包各list 回傳前端
    //模擬測試動態sql
    //const sql = `SELECT * FROM hr.test_presure_simulation where dtinfo BETWEEN '${St_current_Date}' and '${Ed_current_Date}' order by dtinfo`;
    //實際靜壓表
    const sql = `SELECT * FROM ${Pa_record_table_with_datetime} BETWEEN '${St_current_Date}' and '${Ed_current_Date}' order by ${sort_Data_field}`;

    // console.log("sql = " + sql);

    const [date_realtime_Raw] = await dbmes.query(sql);

    if (!date_realtime_Raw || date_realtime_Raw.length === 0) {
      console.log("date_realtime_Raw.length = " + date_realtime_Raw.length);
      return res.status(401).json({
        message: "即時監控無數據 ,空狀態",
        rawdata: [],
      });
    }

    const timeField = record_type === "realtime" ? "Time" : "datetime";

    // 取得非(month)欄位名稱（動態）
    const real_presure_fields = Object.keys(date_realtime_Raw[0]).filter(
      (f) => f !== "month" && f !== "ID"
    );

    // console.log(
    //   "date_presure_fields = " + real_presure_fields,
    //   Array.isArray(real_presure_fields)
    // );

    // console.log(
    //   "date_realtime_Raw 組態為: " + JSON.stringify(date_realtime_Raw)
    // );

    let detect_zero = false;
    let zeroEvents = [];

    const config_Discord = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.discord_botToken}`,
      },
    };

    //透過欄位將數據list 收集個自一組態
    real_presure_fields.forEach((field) => {
      realtime_result[field] = date_realtime_Raw.map((row, index, arr) => {
        const value = row[field];

        if (value === null || value === "" || typeof value === "undefined") {
          return "";
        } else if (typeof value === "string") {
          const num = parseFloat(value);

          if (isNaN(num)) {
            return "";
          }
          const converted = (num / 4095) * -100.0;
          if (
            field !== timeField &&
            index === arr.length - 1 &&
            parseFloat(converted.toFixed(4)) === 0
          ) {
            detect_zero = true;
            zeroEvents.push({
              category: field, // 分類名稱
              time: row[timeField], // 對應時間
              value: parseFloat(converted.toFixed(4)),
            });
          }
          return parseFloat(converted.toFixed(4)); // 四位小數
        } else {
          return value;
        }
      });
    });

    const message = zeroEvents
      .map(
        (error) =>
          `----------------------------------------
      🚨靜壓無塵數值異常🚨\n類別: ${error.category}\n時間: ${error.time}\n數值: ${error.value}\n----------------------------------------`
      )
      .join("\n");

    if (detect_zero && zeroEvents.length > 0) {
      const presure_request_URL = `${process.env.discord_presure_error}`;
      await axios.post(
        presure_request_URL,
        { content: message },
        config_Discord
      );
    }

    // console.log(
    //   "realtime_result 結果為 = " + JSON.stringify(realtime_result, null, 2)
    // );

    res.status(200).json(realtime_result);
  } catch (error) {
    console.error("發生錯誤", error);
    return res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

// 查詢鎖定日期區間靜壓值
router.post("/detect_long_value", async (req, res) => {
  const date_searchall = req.body;
  const Start_Date = date_searchall.startDate + " 00:00:00";
  const End_Date = date_searchall.endDate + " 23:59:59";
  const record_type = date_searchall.record_type;

  const Pa_record_table_with_datetime =
    record_type === "realtime"
      ? "mes.cr1bdata where Time"
      : "mes.coating_pressure_log where datetime";

  const sort_Data_field = record_type === "realtime" ? "ID" : "datetime";

  try {
    // 宣告存取每個欄位的陣列
    const final_result = {};
    //將日期,CR1B22/24 1~2 資料列打包各list 回傳前端
    const sql = `SELECT * FROM ${Pa_record_table_with_datetime} BETWEEN '${Start_Date}' and '${End_Date}' order by ${sort_Data_field}`;

    // console.log("sql = " + sql);

    const [date_presure_Raw] = await dbmes.query(sql);

    // 取得非(month)欄位名稱（動態）
    const date_presure_fields = Object.keys(date_presure_Raw[0]).filter(
      (f) => f !== "month" && f !== "ID"
    );

    // console.log(
    //   "date_presure_fields = " + date_presure_fields,
    //   Array.isArray(date_presure_fields)
    // );

    //透過欄位將數據list 收集個自一組態
    date_presure_fields.forEach((field) => {
      final_result[field] = date_presure_Raw.map((row, index) => {
        const value = row[field];

        if (value === null || value === "" || typeof value === "undefined") {
          return "";
        } else if (typeof value === "string") {
          const num = parseFloat(value);

          if (isNaN(num)) {
            return "";
          }
          const converted = (num / 4095) * -100.0;
          return parseFloat(converted.toFixed(4)); // 四位小數
        } else {
          return value;
        }
      });
    });

    res.status(200).json(final_result);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

module.exports = router;
