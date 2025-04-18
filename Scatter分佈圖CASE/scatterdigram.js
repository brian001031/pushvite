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

let scatterdigram_SearchData = [];

//取哲當前站別和當前選擇年月之電化學分析數據
router.get("/getanalyzedata", async (req, res) => {
  const { select_side_name, isChecked, itemYear, itemMonth } = req.query;

  // console.log(
  //   "select_side_name:" +
  //     select_side_name +
  //     " isChecked:" +
  //     isChecked +
  //     " itemYear:" +
  //     itemYear +
  //     " itemMonth:" +
  //     itemMonth
  // );

  //----------------搜尋total_all_Data 數據庫的資料 start---------------
  const select_columns = [
    "select modelId,VAHS28,VAHS32,VAHS35",
    "select modelId,VAHSA,VAHSB,VAHSC,averageV1,averageV2,averageV3",
  ];

  const select_columns_Date = [
    ",str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d') AS extracted_filter from ",
  ];

  const sql_Related_PFCC = [
    "mes.testmerge_pf where parameter like '023' and VAHS35 not like '' ",
    "mes.testmerge_cc1orcc2 where parameter like '010' and VAHSC not like '' ",
  ];
  //----------------end---------------

  //----------------搜尋total_minmax_Data 數據庫的資料 start---------------

  const select_min_col = [
    "select MIN(CAST(VAHS28 AS DECIMAL(10, 3))) as LH_VAHS2_8, MIN(CAST(VAHS32 AS DECIMAL(10, 3))) as LH_VAHS3_2, MIN(CAST(VAHS35 AS DECIMAL(10, 3))) as LH_VAHS3_5 ,'VASH_MIN_reult' as type ",
    "select MIN(CAST(VAHSA AS DECIMAL(10, 3))) as LH_VAHS2_8, MIN(CAST(VAHSB AS DECIMAL(10, 3))) as LH_VAHS3_2, MIN(CAST(VAHSC AS DECIMAL(10, 3))) as LH_VAHS3_5 , MIN(CAST(averageV1 AS DECIMAL(10, 3))) as LH_avgV1 , MIN(CAST(averageV2 AS DECIMAL(10, 3))) as LH_avgV2 , MIN(CAST(averageV3 AS DECIMAL(10, 3))) as LH_avgV3,  'VASH_MIN_reult' as type ",
  ];
  const select_max_col = [
    "select MAX(CAST(VAHS28 AS DECIMAL(10, 3))) , MAX(CAST(VAHS32 AS DECIMAL(10, 3))) , MAX(CAST(VAHS35 AS DECIMAL(10, 3))) ,'VASH_MAX_reult' ",
    "select MAX(CAST(VAHSA AS DECIMAL(10, 3))) , MAX(CAST(VAHSB AS DECIMAL(10, 3))) , MAX(CAST(VAHSC AS DECIMAL(10, 3))) , MAX(CAST(averageV1 AS DECIMAL(10, 3)))  , MAX(CAST(averageV2 AS DECIMAL(10, 3))) , MAX(CAST(averageV3 AS DECIMAL(10, 3))) ,'VASH_MAX_reult' ",
  ];

  const sql_Related_minmax_PFCC = [
    "from testmerge_pf where parameter like '023' and VAHS28 !=0 ",
    "from testmerge_cc1orcc2 where parameter like '010' and VAHSA !=0 ",
  ];

  //----------------end---------------

  try {
    let all_sql = "",
      sql_min = "";
    sql_max = "";
    sql_Min_Max_Merge = "";

    //確定要查詢那個table
    //化成站 PF
    if (select_side_name === "PF") {
      all_sql =
        select_columns[0] + select_columns_Date[0] + sql_Related_PFCC[0];

      sql_min = select_min_col[0] + sql_Related_minmax_PFCC[0];
      sql_max = select_max_col[0] + sql_Related_minmax_PFCC[0];
    }
    //分容站 CC1
    else if (select_side_name === "CC1") {
      all_sql =
        select_columns[1] + select_columns_Date[0] + sql_Related_PFCC[1];
      sql_min = select_min_col[1] + sql_Related_minmax_PFCC[1];
      sql_max = select_max_col[1] + sql_Related_minmax_PFCC[1];
    }

    //當有指定年月
    if (isChecked === "false") {
      console.log(`有指定${itemYear}年${itemMonth}月數據`);
      //sql_Related_PFCC += ` and str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d') >= '${itemYear}-${itemMonth}-01' and str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d') <= '${itemYear}-${itemMonth}-${nowdate}'`;
      all_sql += `and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}' and month( str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemMonth}'`;

      sql_min +=
        `and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}' and month(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemMonth}'` +
        " union all \n";
      sql_max += `and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}' and month(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemMonth}'`;
    } else {
      console.log(`總${itemYear}全年月數據`);
      all_sql += `and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}'`;

      sql_min +=
        `and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}'` +
        " union all \n";
      sql_max += `and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}'`;
    }

    //升冪排序(日期由舊到新),Not Desc
    all_sql += ` order by extracted_filter;`;

    console.log("all_sql:", all_sql);

    //先收集全部數據庫日期(由最舊到最新)
    const [PFCC_Analysis_data] = await dbmes.query(all_sql);

    //console.log("全部數據庫日期：", PFCC_Analysis_data);

    const filterAllData = [];
    PFCC_Analysis_data.forEach((item) => {
      const dateObj = new Date(item.extracted_filter);
      const year = dateObj.getFullYear();
      const month = (dateObj.getMonth() + 1).toString().padStart(2, "0"); // 确保月份是两位数
      const day = dateObj.getDate().toString().padStart(2, "0"); // 确保日期是两位数
      const formattedDate = `${year}-${month}-${day}`; // 格式化为 YYYY:MM:DD

      // 在原数据中替换 extracted_filter 字段为格式化后的日期
      filterAllData.push({
        ...item,
        extracted_filter: formattedDate,
      });
    });

    scatterdigram_SearchData = []; // 清空全域變數
    scatterdigram_SearchData.push({ overall: filterAllData }); // 將資料存入全域變數

    //在收集目前條件式所提供之每個電芯電性參數(Min,Max)->透過math計算的數據
    //PF 取值(LH_VAHS2_8 , LH_VAHS3_2 , LH_VAHS3_5)

    //const [PFCC_Analysis_Range] = await dbmes.query();

    //CC1 取值(LH_VAHS2_8,LH_VAHS3_2,LH_VAHS3_5,LH_avgV1,LH_avgV2,LH_avgV3)

    //console.log(filterAllData); // 顯示轉換後的日期數據

    // const filterAllData = PFCC_Analysis_data
    //   // .filter((item) => item.type === "plotDate")
    //   .map((item) => {
    //     const dateObj = new Date(item.extracted_filter);
    //     const formatted = dateObj.toISOString().split("T")[0]; // 抓 YYYY-MM-DD
    //     return formatted;
    //   });

    // console.log("filterAllData:", filterAllData[filterAllData.length - 1]);

    return res.status(200).json({
      message:
        isChecked === true
          ? "取得總電化學PFCC數據成功"
          : `取得${itemYear}年,${itemMonth}月份電化學PFCC數據成功`,
      AllContent: scatterdigram_SearchData[0].overall,
    });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得電化學PFCC數據錯誤",
    });
  }
});

module.exports = router;
