require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../../modules/db_connect.js");
const dbmes = require(__dirname + "/../../modules/mysql_connect_mes.js");
const db2 = require(__dirname + "/../../modules/mysql_connect.js");
const dbms_pool = require(__dirname + "/../../modules/mssql_newconnect.js");
const ms_newsql = require("mssql");
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
const { machine, type } = require("os");
const { json } = require("body-parser");
const e = require("express");

//宣告站 realtime table 變數
let query_realtable;

let productnum;
let mysql_accmountnum;

// //假混漿正極 班別生產數量
// let mes_cathnode_count = "3";
// let mes_cathnode_amountcount = "28";
// //假混漿負極 班別生產數量
// let mes_anode_count = "6";
// let mes_anode_amountcount = "31";

// 取得台北時區的當前日期
let currentDate = moment.tz("Asia/Taipei").format("YYYY-MM-DD");
// 獲取當前日期
let now = new Date();

// 取得當前年份、月份和日期
let nowyear = now.getFullYear();
let nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
let nowdate = new Date(nowyear, nowMonth, 0)
  .getDate()
  .toString()
  .padStart(2, "0");

let stringrunstatus = "";
let searchclass = "";
let searchclassname = "";


// 開始每分鐘執行
// setInterval(() => {
//   addnumber += 12;
//   // console.log("混漿站 每分鐘累加 12 pcs，現在值為:", addnumber);
// }, 60000); // 一分鐘後執行（60000 毫秒）

async function update_sysdatetime() {
  // 取得台北時區的當前日期
  currentDate = moment.tz("Asia/Taipei").format("YYYY-MM-DD");
  //console.log("當前日期（台北時區）:", currentDate);
}

async function confirm_group_xls(searid) {
  //先讀入電化學班表.xlsx
  const elecxlsx = process.env.electricxls;
  let workbook = XLSX.readFile(elecxlsx);
  let worksheet = workbook.Sheets["各站班表"];
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  console.log(range);
  const workData = [];
  for (let index = 2; index <= range.e.r + 1; index++) {
    try {
      // 确保单元格存在再访问其值
      const id = worksheet[`A${index}`].v;
      const name = worksheet[`B${index}`].v;
      const work = worksheet[`C${index}`].v;

      //有鎖定到工號ID,在擷取對應之班別時段
      if (searid.includes(id)) {
        //console.log("have find!");
        searchclass = work;

        break;
      }

    } catch (error) {
      console.error("Error reading record:", error);
    }
  }

  // const shiftMap = {};
  // workData.forEach((employee) => {
  //   shiftMap[employee.id] = employee.work;
  // });
}

async function changeruntime_display(runstatus) {
  // console.log("runstatus = " + runstatus);

  switch (runstatus) {
    case 1:
      stringrunstatus = "RUN";
      break;
    case 2:
      stringrunstatus = "IDLE";
      break;
    case 3:
      stringrunstatus = "DOWN";
      break;
    case 4:
      stringrunstatus = "PM";
      break;
    case 5:
      stringrunstatus = "ALARM";
      break;

    default:
      stringrunstatus = "unknow";
      break;
  }

}

// Define your routes here
router.get("/updatepage", async (req, res) => {
  //console.log("收到刷新機器生產頁面需求");
  const { machineoption } = req.query;
  

  let sql = "";

  try {
    //先行更新日期
    update_sysdatetime();

    // console.log("machineoption接收為= " + machineoption);

    //正極混漿走這段
    if (
      machineoption?.includes("c") &&
      machineoption?.indexOf("c正極混漿") !== -1) {
      sql = `SELECT * FROM mixing_realtime_c ORDER BY ID DESC limit 1`;
      query_realtable = "mixing_realtime_c";
    }

    else if (
      machineoption?.includes("a") &&
      machineoption?.indexOf("a負極混漿") !== -1) {
      sql = `SELECT * FROM mixing_realtime_a ORDER BY ID DESC limit 1`;
      query_realtable = "mixing_realtime_a";
    }
    // console.log ("machineoption = " + machineoption + "|" + "sql = " + sql);

    //執行最新一筆row data 擷取所有欄位
    const [equipmentdata] = await dbmes.query(sql);

    res.status(200).json(equipmentdata);

    // res.json({
    //   message: "mixcathanode Node works!",
    // });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

router.get("/groupname_capacitynum" , async (req , res) =>{
  const  { machineoption , startDate}  = req.query || {};

  console.log("mixingAnode machineoption = " + machineoption , typeof machineoption);


  let sql = "";
  let start , end , nightStart , nightEnd , morningStart , morningEnd;
  let currentDate = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  let overnightdate = moment().tz("Asia/Taipei").subtract(1, 'days').format("YYYY-MM-DD");
  let query_realtable = "";

  if (!machineoption){
      res.status(404).json({error: "No machineoption provided"});
      return;
  }

  
  switch (String(machineoption).trim()) {
    case ("c正極混漿"):
      query_realtable = "mixingcathode_batch";
      break;
    case ("a負極混漿"):
      query_realtable = "mixinganode_batch";
      break;
    default:
      return res.status(400).json({ 
        error: "Invalid machineoption parameter", 
        received: machineoption,
        expected: ["c正極混漿", "a負極混漿"]
      });
  }

  start = moment(startDate).locale('zh-tw').format('YYYY-MM-DD') + " 00:00:00";
  end = currentDate + " 23:59:59";
  nightStart = overnightdate + " 20:00:00";
  nightEnd = currentDate + " 08:00:00";
  morningStart = currentDate + " 08:00:00";
  morningEnd = currentDate + " 20:00:00";



  // 查找產能
  sql = `
    SELECT 
      SUM(CASE WHEN DATE(CONVERT_TZ(Date, '+00:00', '+08:00')) = CURDATE() AND LotNo <> "" THEN 1 ELSE 0 END) AS todayCapacity_first_result, -- 當天產能（台灣時間）
      SUM(CASE WHEN Date BETWEEN '${start}' AND '${end}' AND LotNo <> "" THEN 1 ELSE 0 END) AS amountCapacity_first_result, -- 累計產能
      SUM(CASE WHEN Date BETWEEN '${nightStart}' AND '${nightEnd}' AND LotNo <> "" THEN 1 ELSE 0 END) AS nightShiftCapacity_first_result, -- 晚班產能
      SUM(CASE WHEN Date BETWEEN '${morningStart}' AND '${morningEnd}' AND LotNo <> "" THEN 1 ELSE 0 END) AS morningShiftCapacity_first_result -- 早班產能
    FROM ${query_realtable}
    WHERE System_Step = "5"
  `

  sql_other = `
    SELECT 
    deviceNo_Mixing,
    Member01_Name,
    Member01_No,
    Member02_Name,
    Member02_No,
    LotNo
    FROM ${query_realtable}
    WHERE System_Step = "5" AND DATE(CONVERT_TZ(Date, '+00:00', '+08:00')) = CURDATE()
    ORDER BY ID  DESC limit 1
  `

  try{
    // 抓到產能
    const [rows] = await dbmes.query(sql);
    const [otherrows] = await dbmes.query(sql_other);

    if (rows.length > 0) {
      const result = rows[0];
      res.status(200).json({
        // 產能數據
        todayCapacity: result.todayCapacity_first_result ? result.todayCapacity_first_result : 0,
        amountCapacity: result.amountCapacity_first_result ? result.amountCapacity_first_result : 0,
        nightShiftCapacity: result.nightShiftCapacity_first_result ? result.nightShiftCapacity_first_result : 0,
        morningShiftCapacity: result.morningShiftCapacity_first_result ? result.morningShiftCapacity_first_result : 0,

        // 其他數據
        otherdata : {
          deviceNo_Mixing: otherrows[0]?.deviceNo_Mixing || "",
          Member01_Name: otherrows[0]?.Member01_Name || "",
          Member01_No: otherrows[0]?.Member01_No || "",
          Member02_Name: otherrows[0]?.Member02_Name || "",
          Member02_No: otherrows[0]?.Member02_No || "",
          LotNo: otherrows[0]?.LotNo || "",
        }
        
      });
    } else {
      res.status(404).json({ error: "No data found" });
    }

  }catch(error){
      console.error("Database query error:", error);
      res.status(500).json({ error: "Internal server error" });
  }
})


// 混漿正極 (mes 副-表單)
router.get("/fullmachinecapacity_cathode", async (req, res) => {

  const {currentDay} = req.query || {};
  const now = moment().tz("Asia/Taipei");
  let nightShiftStart , nightShiftEnd
  
  // 使用當前時間判斷班別
  const currentTime = currentDay ? moment(currentDay).tz("Asia/Taipei") : now;
  
  // 早班：當天 08:00 - 20:00
  let morningShiftStart = currentTime.format("YYYY-MM-DD") + " 08:00:00";
  let morningShiftEnd = currentTime.format("YYYY-MM-DD") + " 20:00:00";
  

  if (moment(currentDay).hour() >=20 && moment(currentDay).hour() <=23){
    nightShiftStart = moment(currentTime).format("YYYY-MM-DD") + " 20:00:00";
    nightShiftEnd = moment(currentTime).format("YYYY-MM-DD") + " 23:59:59";
  }
  else if (moment(currentDay).hour() >=0 && moment(currentDay).hour() <8){
    nightShiftStart = moment(currentTime).subtract(1, 'day').format("YYYY-MM-DD") + " 20:00:00";
    nightShiftEnd = currentTime.format("YYYY-MM-DD") + " 08:00:00";
  }

  const sql = `SELECT 
  SUM(CASE WHEN BatchEnd >= '${morningShiftStart}' AND BatchEnd < '${morningShiftEnd}' THEN 1 ELSE 0 END) AS morning__capacity,
  SUM(CASE WHEN BatchEnd >= '${nightShiftStart}' AND BatchEnd < '${nightShiftEnd}' THEN 1 ELSE 0 END) AS night_capacity
  FROM mes.mixingcathode_batch
  WHERE System_Step IN ("5" , 5) AND LotNo <> ""
  AND EngineerNo != "349"
  `
  try {

    const [rows] = await dbmes.query(sql);

    console.log ("混漿正極總產能 SQL = " + JSON.stringify(rows));
    const morningShift = rows[0]?.morning__capacity || 0;
    const nightShift = rows[0]?.night_capacity || 0;


    const data ={
      "混漿正極早班總產能": morningShift ? Number(morningShift) : 0,
      "混漿正極夜班總產能": nightShift ? Number(nightShift) : 0,
      "總產能" : morningShift? Number(morningShift) + Number(nightShift) : 0,
    }


    res.status(200).json({
      success : true,
      data
    })
  } catch (error) {
    console.error("Error fetching full machine capacity:", error);
    res.status(500).json({ error: "Internal server error" });
  }

})


// 混漿負極 (mes 副-表單)
router.get("/fullmachinecapacity_anode", async (req, res) => {

  const {currentDay} = req.query || {};
  const now = moment().tz("Asia/Taipei");
  
  // 使用當前時間判斷班別
  const currentTime = currentDay ? moment(currentDay).tz("Asia/Taipei") : now;
  
  // 早班：當天 08:00 - 20:00
  let morningShiftStart = currentTime.format("YYYY-MM-DD") + " 08:00:00";
  let morningShiftEnd = currentTime.format("YYYY-MM-DD") + " 20:00:00";
  
  // 夜班：前一天 20:00 - 當天 08:00
  let nightShiftStart = moment(currentTime).subtract(1, 'day').format("YYYY-MM-DD") + " 20:00:00";
  let nightShiftEnd = currentTime.format("YYYY-MM-DD") + " 08:00:00";

  const sql = `SELECT 
  SUM(CASE WHEN BatchEnd >= '${morningShiftStart}' AND BatchEnd < '${morningShiftEnd}' THEN 1 ELSE 0 END) AS morning__capacity,
  SUM(CASE WHEN BatchEnd >= '${nightShiftStart}' AND BatchEnd < '${nightShiftEnd}' THEN 1 ELSE 0 END) AS night_capacity
  FROM mes.mixinganode_batch
  WHERE System_Step IN ("5" , 5) AND LotNo <> ""
  AND EngineerNo != "349"
  `
  try {

    const [rows] = await dbmes.query(sql);

    console.log ("混漿負極總產能 SQL = " + JSON.stringify(rows));
    const morningShift = rows[0]?.morning__capacity || 0;
    const nightShift = rows[0]?.night_capacity || 0;


    const data ={
      "混漿負極早班總產能": morningShift ? Number(morningShift) : 0,
      "混漿負極夜班總產能": nightShift ? Number(nightShift) : 0,
      "總產能" : morningShift? Number(morningShift) + Number(nightShift) : 0,
    }


    res.status(200).json({
      success : true,
      data
    })
  } catch (error) {
    console.error("Error fetching full machine capacity:", error);
    res.status(500).json({ error: "Internal server error" });
  }

})



module.exports = router;
