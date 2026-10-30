require("dotenv").config();
const express = require("express");
const axios = require("axios");
const dbmes = require(__dirname + "/../../modules/mysql_connect_mes.js");
const moment = require("moment-timezone");
const mysql = require("mysql2");
const { sql } = require("googleapis/build/src/apis/sql");
const router = express.Router();

// dbmes.once("error", (err) => {
//   console.log("Error in connecting to database: ", err);
// });

const switchOption = (option) => {
  let table, sql, sql_capacity, sql_other = "";

  switch (String(option).trim()) {
    case "二抽一期":
      table = "pack2_batch";
      sql = `SELECT * FROM mes.pack2_batch 
      WHERE Remark = '二抽出料自動寫入' 
      ORDER BY id DESC LIMIT 1;`;

      sql_capacity = "";
      break;

    case "二抽二期":
      table = "pack2_batch";
      sql = `SELECT * FROM mes.pack2_batch 
      WHERE Remark IN ('二抽二期出料自動寫入', '人工二期補帳') 
      ORDER BY id DESC LIMIT 1;`;

      sql_capacity = "";
      break;

    case "三抽一期":
        table = "pack3_batch";
        sql = `SELECT * FROM mes.pack3_batch 
        WHERE Remark IN ('一期三抽出料自動化寫入', '三抽出料自動寫入') 
        ORDER BY id DESC LIMIT 1;`;

        sql_capacity = `
      
      `
    break;

    case "三抽二期":
        table = "pack3_batch";
        sql = `SELECT * FROM mes.pack3_batch 
        WHERE Remark IN ('二期三抽出料自動寫入', '人工二期補帳', '二期第一台三抽出料自動寫入', '二期第二台三抽出料自動寫入') 
        ORDER BY id DESC LIMIT 1;`;

        sql_capacity = `
      
      `
    break;
    }
    return {table , sql , };
 }


router.get("/updatepage", async (req, res) => {
  //console.log("收到刷新機器生產頁面需求");
  const { machineoption } = req.query;

  console.log("machineoption接收為= " + machineoption , typeof machineoption);
  

  let sql = "";
  let table = "";

  try {

    ({table , sql} = switchOption(machineoption));

    //執行最新一筆row data 擷取所有欄位
    const [equipmentdata] = await dbmes.query(sql);

    res.status(200).json(equipmentdata);

  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

router.get("/groupname_capacitynum" , async (req , res) =>{
  const  {shiftclass , machineoption , startDate}  = req.query || {};

  console.log("mixingAnode machineoption = " + machineoption , typeof machineoption);


  let start , end , nightStart , nightEnd , morningStart , morningEnd , sql_capacity , sql_inner = '' ;

  let now = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  start = now + " 00:00:00";
  end = now + " 23:59:59";

  let currentDate = moment().tz("Asia/Taipei").format("YYYY-MM-DD") + " 23:59:59";
  let sql_table = ''

  switch (machineoption) {
    case "二抽一期":
    
      sql_table = "mes.pack2_batch";
      sql_inner = `REMARK IN ('二抽出料自動寫入')`
      break;
    case "二抽二期":
      sql_table = "mes.pack2_batch";
      sql_inner = `REMARK IN ('二抽二期出料自動寫入', '人工二期補帳')`
      break;
    case "三抽一期":
      sql_table = "mes.pack3_batch";
      sql_inner = `REMARK IN ('一期三抽出料自動化寫入', '三抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' `
      break;
    case "三抽二期":
      sql_table = "mes.pack3_batch";
      sql_inner = `REMARK IN ('二期三抽出料自動寫入', '人工二期補帳', '二期第一台三抽出料自動寫入', '二期第二台三抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> ''`
      break;
    default:
      res.status(400).json({ error: "Invalid machineoption" });
      return;
  }

  if (moment(startDate).hours() >= 8 && moment(startDate).hours() < 20){
    // 早班
    morningStart = moment(startDate).tz("Asia/Taipei").format("YYYY-MM-DD") + " 08:00:00";
    morningEnd = moment(startDate).tz("Asia/Taipei").format("YYYY-MM-DD") + " 20:00:00";
  }
  else if (moment(startDate).hours() >=20 && moment(startDate).hours() <=23){
    nightStart = moment(startDate).tz("Asia/Taipei").format("YYYY-MM-DD") + " 20:00:00";
    nightEnd = moment(startDate).tz("Asia/Taipei").format("YYYY-MM-DD") + " 23:59:59";
  }
  else if (moment(startDate).hours() >=0 && moment(startDate).hours() <8){
    nightStart = moment(startDate).tz("Asia/Taipei").subtract(1, 'days').format("YYYY-MM-DD") + " 20:00:00";
    nightEnd = moment(startDate).tz("Asia/Taipei").format("YYYY-MM-DD") + " 08:00:00";
  } 

  if (!machineoption){
      res.status(404).json({error: "No machineoption provided"});
      return;
  }

  // 班別區間（若未提供 startDate 則使用當天）
  const baseMoment = startDate ? moment(startDate).tz("Asia/Taipei") : moment().tz("Asia/Taipei");
  const todayStart = baseMoment.format("YYYY-MM-DD") + " 00:00:00";
  const todayEnd = baseMoment.format("YYYY-MM-DD") + " 23:59:59";
  // 早班與夜班半開區間
  const morningStartFinal = baseMoment.format("YYYY-MM-DD") + " 08:00:00";
  const morningEndFinal = baseMoment.format("YYYY-MM-DD") + " 20:00:00";
  const nightStartFinal = baseMoment.clone().subtract(1,'day').format("YYYY-MM-DD") + " 20:00:00";
  const nightEndFinal = baseMoment.format("YYYY-MM-DD") + " 08:00:00";

  // amount 區間：以今天起算到目前 (或指定 startDate 當日 23:59:59)
  const amountStart = todayStart;
  const amountEnd = todayEnd;

  // 統一補上必要的 NOT NULL 條件（若沒在 sql_inner 時針對二抽一期補）
  let innerCondition = sql_inner;
  if (!/PLCCellID12_CE/.test(innerCondition)) {
    innerCondition += " AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> ''";
  }

  // 使用參數化避免時間未加引號及 SQL 注入
  sql_capacity = `
    SELECT
      COUNT(DISTINCT CASE WHEN ${innerCondition} AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS today_capacitynum,
      COUNT(DISTINCT CASE WHEN ${innerCondition} AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS amount_capacitynum,
      COUNT(DISTINCT CASE WHEN ${innerCondition} AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS night_capacitynum,
      COUNT(DISTINCT CASE WHEN ${innerCondition} AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS morning_capacitynum
    FROM ${sql_table};
  `;

  const params = [
    todayStart, todayEnd,      // today
    amountStart, amountEnd,    // amount 累計（同一天）
    nightStartFinal, nightEndFinal, // 夜班
    morningStartFinal, morningEndFinal // 早班
  ];
  

  try{

    // 抓到產能
  const [rows] = await dbmes.query(sql_capacity, params);
    const data = {
      today_capacitynum: rows[0].today_capacitynum,
      amount_capacitynum: rows[0].amount_capacitynum,
      night_capacitynum: rows[0].night_capacitynum,
      morning_capacitynum: rows[0].morning_capacitynum,
    }
    
    res.status(200).json({
      machineoption,
      data: rows[0]
    });


   

  }catch(error){
      console.error("Database query error:", error);
      res.status(500).json({ error: "Internal server error" });
      throw error ; 
  }
})

router.get("/fullmachinecapacity" , async (req , res) =>{
  try {
    const { currentDay } = req.query || {};

    // 班別區間（若未提供 startDate 則使用當天）
    const baseMoment = currentDay ? moment(currentDay).tz("Asia/Taipei") : moment().tz("Asia/Taipei");
    const todayStart = baseMoment.format("YYYY-MM-DD") + " 00:00:00";
    const todayEnd = baseMoment.format("YYYY-MM-DD") + " 23:59:59";
    // 早班與夜班半開區間
    const morningStartFinal = baseMoment.format("YYYY-MM-DD") + " 08:00:00";
    const morningEndFinal = baseMoment.format("YYYY-MM-DD") + " 20:00:00";
    const nightStartFinal = baseMoment.clone().subtract(1,'day').format("YYYY-MM-DD") + " 20:00:00";
    const nightEndFinal = baseMoment.format("YYYY-MM-DD") + " 08:00:00";

    // 使用參數化避免時間未加引號及 SQL 注入
    sql_capacity = `
      SELECT
        -- 二抽一期 早晚班
        COUNT (DISTINCT CASE WHEN REMARK IN ('二抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS morning_capacitynum_01,
        COUNT (DISTINCT CASE WHEN REMARK IN ('二抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS night_capacitynum_01,

        -- 二抽二期 早晚班
        COUNT (DISTINCT CASE WHEN REMARK IN ('二抽二期出料自動寫入', '人工二期補帳') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS morning_capacitynum_02,
        COUNT (DISTINCT CASE WHEN REMARK IN ('二抽二期出料自動寫入', '人工二期補帳') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS night_capacitynum_02

      FROM mes.pack2_batch

      UNION ALL
      
      SELECT 
        -- 三抽一期 早晚班
        COUNT (DISTINCT CASE WHEN REMARK IN ('一期三抽出料自動化寫入', '三抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS morning_capacitynum_01,
        COUNT (DISTINCT CASE WHEN REMARK IN ('一期三抽出料自動化寫入', '三抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS night_capacitynum_01,

        -- 三抽二期 早晚班
        COUNT (DISTINCT CASE WHEN REMARK IN ('二期三抽出料自動寫入', '人工二期補帳', '二期第一台三抽出料自動寫入', '二期第二台三抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS morning_capacitynum_02,
        COUNT (DISTINCT CASE WHEN REMARK IN ('二期三抽出料自動寫入', '人工二期補帳', '二期第一台三抽出料自動寫入', '二期第二台三抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' AND Time >= ? AND Time < ? THEN PLCCellID12_CE END) AS night_capacitynum_02
    
        FROM mes.pack3_batch;
  
        `;

    const params = [
      // 二抽一期（早、晚）
      morningStartFinal, morningEndFinal,
      nightStartFinal, nightEndFinal,
      // 二抽二期（早、晚）
      morningStartFinal, morningEndFinal,
      nightStartFinal, nightEndFinal,
      // 三抽一期（早、晚）
      morningStartFinal, morningEndFinal,
      nightStartFinal, nightEndFinal,
      // 三抽二期（早、晚）
      morningStartFinal, morningEndFinal,
      nightStartFinal, nightEndFinal,
    ];

    const [row] = await dbmes.query(sql_capacity, params);
    console.log(
      "早班二抽一期" , row[0].morning_capacitynum_01,
        "夜班二抽一期", row[0].night_capacitynum_01,
        "早班二抽二期", row[0].morning_capacitynum_02,
        "夜班二抽二期", row[0].night_capacitynum_02,
        "早班三抽一期", row[1].morning_capacitynum_01,
        "夜班三抽一期", row[1].night_capacitynum_01,
        "早班三抽二期", row[1].morning_capacitynum_02,
        "夜班三抽二期", row[1].night_capacitynum_02
      )

    res.status(200).json({
      data: {
        "早班二抽一期": row[0].morning_capacitynum_01,
        "夜班二抽一期": row[0].night_capacitynum_01,
        "早班二抽二期": row[0].morning_capacitynum_02,
        "夜班二抽二期": row[0].night_capacitynum_02,
        "早班三抽一期": row[1].morning_capacitynum_01,
        "夜班三抽一期": row[1].night_capacitynum_01,
        "早班三抽二期": row[1].morning_capacitynum_02,
        "夜班三抽二期": row[1].night_capacitynum_02
      },
      Total_capacity_shift:{
        "二抽當天總產能" : row[0].morning_capacitynum_01 + row[0].night_capacitynum_01 + row[0].morning_capacitynum_02 + row[0].night_capacitynum_02,
        "三抽當天總產能" : row[1].morning_capacitynum_01 + row[1].night_capacitynum_01 + row[1].morning_capacitynum_02 + row[1].night_capacitynum_02
      }
    });

    
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
})

module.exports = router;