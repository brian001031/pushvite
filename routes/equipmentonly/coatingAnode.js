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

//宣告站 realtime table 變數
let query_realtable;

//計時累加數量(for 客戶)
let addnumber = 0;

let productnum;
let mysql_accmountnum;

//假塗佈正極 班別生產數量
let mes_cathnode_count = "3";
let mes_cathnode_amountcount = "28";
//假塗佈負極 班別生產數量
let mes_anode_count = "6";
let mes_anode_amountcount = "31";

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

const realtime_table = [
  "coating_realtime_c", // 正極塗佈
  "coating_realtime_a", // 負極塗佈
];

// 開始每分鐘執行
setInterval(() => {
  addnumber += 12;
  // console.log("塗佈站 每分鐘累加 12 pcs，現在值為:", addnumber);
}, 60000); // 一分鐘後執行（60000 毫秒）

async function update_sysdatetime() {
  // 獲取當前日期
  // now = new Date();
  // // 取得當前年份、月份和日期
  // nowyear = now.getFullYear();
  // nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
  // nowdate = new Date(nowyear, nowMonth, 0)
  //   .getDate()
  //   .toString()
  //   .padStart(2, "0");

  // console.log("更新函式 nowdate= " + nowdate);

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

      // const memberName = `SELECT memberName FROM hr_memberinfo where memberID = ${id}`;

      // console.log("memberName = " + memberName);

      // const [Name] = await db2.query(sqlopname);

      // searchclassname = mes_name;

      // console.log("操作機台姓名=" + searchclassname);

      //有鎖定到工號ID,在擷取對應之班別時段
      if (searid.includes(id)) {
        //console.log("have find!");
        searchclass = work;

        break;
      }

      //console.log("Reading record:", { id: id, name: name, work: work });
      //workData.push({ id: id, name: name, work: work });
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

  // runstatus = stringrunstatus.toString();
}

async function change_update_mestable(machineselect) {
  let selectMachine = machineselect;
  if (selectMachine === undefined || selectMachine === "") {
    console.log("selectMachine 為空，不繼續 MES 設備檢閱，返回!");
    return;
  }

  //搜尋機台名稱是正常的繼續往下判斷
  if (selectMachine != "" || selectMachine !== undefined) {
    // 塗佈區 --- start ---
    if (
      !Array.isArray(selectMachine) &&
      selectMachine.includes("c正極塗佈").toString()
    ) {
      query_realtable = realtime_table[0].toString();
      console.log("query_realtable (正極塗佈站)=", query_realtable);
    } else if (
      !Array.isArray(selectMachine) &&
      selectMachine.includes("a負極塗佈")
    ) {
      query_realtable = realtime_table[1].toString();
      console.log("query_realtable (負極塗佈站)=", query_realtable);
    }
    // 塗佈區 --- end ---//
  } else {
    console.log(selectMachine + "接收table空值, 異常ERROR");
  }
}

router.get("/updatepage", async (req, res) => {
  const { machineoption } = req.query;
  // console.log("machineoption接收為= " + machineoption);

  let sql; // 在 switch 語句外部定義 sql 變數
  let params = []; // 定義參數陣列

  switch (machineoption) {
    case "a負極塗佈":
      sql = `select * from mes.coating_realtime_a order by id desc limit 1 ;`;
      params = [machineoption];
      break;
    case "c正極塗佈":
      sql = `select * from mes.coating_realtime_c order by id desc limit 1 ;`;
      params = [machineoption];
      break;
    default:
      console.log("沒有符合的機台選項，請確認機台名稱");
      return res.status(400).send("Invalid machine option"); // 使用 return 避免後續程式碼執行
  }

  let sqlSearchName = `SELECT memberName FROM hr.hr_memberinfo WHERE memberID = ?`;

  try {
    const [rows] = await db2.query(sql, params);
    for (let row of rows){
    const IR3 = row.IR3_PV;
    
    // 確保 IR3 有值才賦值
    if (IR3 !== undefined && IR3 !== null) {
      row.IR4_PV_Renew = IR3;
      row.IR5_PV_Renew = IR3;
    }
  }

    const row = rows[0];
    const OPNumber = String(row.OP_Code).trim();

    const [searchName] = await db2.query(sqlSearchName, OPNumber);
    row.opName =
      searchName.length > 0 ? searchName[0].memberName : "無操作人員";

    res.status(200).json(rows);
  } catch (error) {
    console.error("Error in /updatepage:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/groupname_capacitynum" , async (req , res) =>{
  const {machineoption , startDate} = req.query || {};

  console.log("coating machineoption = " + machineoption , typeof machineoption);


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
    case ("c正極塗佈"):
      query_realtable = "coatingcathode_batch";
      break;
    case ("a負極塗佈"):
      query_realtable = "coatinganode_batch";
      break;
    default:
      query_realtable = "";
      break;
  }

  start = moment(startDate, 'YYYY/MM/DD').format('YYYY-MM-DD') + " 00:00:00";
  end = currentDate + " 23:59:59";
  nightStart = overnightdate + " 20:00:00";
  nightEnd = currentDate + " 08:00:00";
  morningStart = currentDate + " 08:00:00";
  morningEnd = currentDate + " 20:00:00";



  // 查找產能
  sql = `
    SELECT 
      SUM(CASE WHEN DATE(endTime) = CURDATE() AND lotNumber <> "" THEN productionMeters END) AS today_meters, -- 當天產能 (米)
      SUM(CASE WHEN DATE(endTime) = CURDATE() AND lotNumber <> "" THEN lostMeter END) AS today_lost, -- 當天廢料 (米)

      SUM(CASE WHEN endTime BETWEEN '${start}' AND '${end}' AND lotNumber <> "" THEN productionMeters END) AS amount_meters, -- 累計產能 (米)
      SUM(CASE WHEN endTime BETWEEN '${start}' AND '${end}' AND lotNumber <> "" THEN lostMeter END) AS amount_lost, -- 累計廢料 (米)

      SUM(CASE WHEN endTime BETWEEN '${nightStart}' AND '${nightEnd}' AND lotNumber <> "" THEN productionMeters END) AS nightShift_capacity, -- 晚班產能
      SUM(CASE WHEN endTime BETWEEN '${nightStart}' AND '${nightEnd}' AND lotNumber <> "" THEN lostMeter END) AS  nightShift_lost, -- 累計廢料 (米)

      SUM(CASE WHEN endTime BETWEEN '${morningStart}' AND '${morningEnd}' AND lotNumber <> "" THEN productionMeters END) AS morningShift_capacity, -- 早班產能
      SUM(CASE WHEN endTime BETWEEN '${morningStart}' AND '${morningEnd}' AND lotNumber <> "" THEN lostMeter END) AS  morningShift_lost -- 累計廢料 (米)

    FROM ${query_realtable}
  `

  sql_other = `
    SELECT 
    machineNo,
    memberName,
    memberNumber,
    lotNumber
    FROM ${query_realtable}
    WHERE DATE(endTime) = CURDATE()
    ORDER BY ID DESC LIMIT 1
  `

  try{
    // 抓到產能
    const [rows] = await dbmes.query(sql);
    const [otherrows] = await dbmes.query(sql_other);

    const todayCapacity = (rows[0]?.today_meters || 0) - (rows[0]?.today_lost || 0);
    const amountCapacity = (rows[0]?.amount_meters || 0) - (rows[0]?.amount_lost || 0);
    const nightShiftCapacity = (rows[0]?.nightShift_capacity || 0) - (rows[0]?.nightShift_lost || 0);
    const morningShiftCapacity = (rows[0]?.morningShift_capacity || 0) - (rows[0]?.morningShift_lost || 0);

    if (rows.length > 0) {
      const result = rows[0];
      res.status(200).json({
        // 產能數據
        todayCapacity: todayCapacity ? Number(todayCapacity) : 0,
        amountCapacity: amountCapacity ? Number(amountCapacity) : 0,
        nightShiftCapacity: nightShiftCapacity ? Number(nightShiftCapacity) : 0,
        morningShiftCapacity: morningShiftCapacity ? Number(morningShiftCapacity) : 0,

        // 其他數據
        otherdata : {
          machineNo: otherrows[0]?.machineNo || "",
          memberName: otherrows[0]?.memberName || "",
          memberNumber: otherrows[0]?.memberNumber || "",
          lotNumber: otherrows[0]?.lotNumber || "",
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

// 塗佈正極 (mes 副-表單)
router.get("/fullmachinecapacity_cathode", async (req, res) => {

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
  SUM(CASE WHEN endTime >= '${morningShiftStart}' AND endTime < '${morningShiftEnd}' THEN productionMeters END) AS morning__capacity,
  SUM(CASE WHEN endTime >= '${morningShiftStart}' AND endTime < '${morningShiftEnd}' THEN lostMeter END) AS mornging_lost,
  SUM(CASE WHEN endTime >= '${nightShiftStart}' AND endTime < '${nightShiftEnd}' THEN productionMeters END) AS night_capacity,
  SUM(CASE WHEN endTime >= '${nightShiftStart}' AND endTime < '${nightShiftEnd}' THEN lostMeter END) AS night_lost
  FROM mes.coatingcathode_batch
  WHERE is_deleted <> "1" AND lotNumber <> "" 
  AND engineerId != "349"
  `
  try {

    const [rows] = await dbmes.query(sql);

    console.log ("塗佈正極總產能 SQL = " + JSON.stringify(rows));
    const morningShift = rows[0]?.morning__capacity || 0;
    const nightShift = rows[0]?.night_capacity || 0;
    const mornging_lost = rows[0]?.mornging_lost || 0;
    const night_lost = rows[0]?.night_lost || 0;

    const final_morning = Number(morningShift) - Number(mornging_lost);
    const final_night = Number(nightShift) - Number(night_lost);


    const data ={
      "塗佈正極早班總產能": final_morning ? Number(final_morning) : 0,
      "塗佈正極夜班總產能": final_night ? Number(final_night) : 0,
      "總產能" : final_morning ? Number(final_morning) + Number(final_night) : 0,
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

// 塗佈正極 (mes 副-表單)
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
  SUM(CASE WHEN endTime >= '${morningShiftStart}' AND endTime < '${morningShiftEnd}' THEN productionMeters END) AS morning__capacity,
  SUM(CASE WHEN endTime >= '${morningShiftStart}' AND endTime < '${morningShiftEnd}' THEN lostMeter END) AS mornging_lost,
  SUM(CASE WHEN endTime >= '${nightShiftStart}' AND endTime < '${nightShiftEnd}' THEN productionMeters END) AS night_capacity,
  SUM(CASE WHEN endTime >= '${nightShiftStart}' AND endTime < '${nightShiftEnd}' THEN lostMeter END) AS night_lost
  FROM mes.coatingcathode_batch
  WHERE is_deleted <> "1" AND lotNumber <> "" 
  AND engineerId != "349"
  `
  try {

    const [rows] = await dbmes.query(sql);

    console.log ("塗佈正極總產能 SQL = " + JSON.stringify(rows));
    const morningShift = rows[0]?.morning__capacity || 0;
    const nightShift = rows[0]?.night_capacity || 0;
    const mornging_lost = rows[0]?.mornging_lost || 0;
    const night_lost = rows[0]?.night_lost || 0;

    const final_morning = Number(morningShift) - Number(mornging_lost);
    const final_night = Number(nightShift) - Number(night_lost);


    const data ={
      "塗佈負極早班總產能": final_morning ? Number(final_morning) : 0,
      "塗佈負極夜班總產能": final_night ? Number(final_night) : 0,
      "總產能" : final_morning ? Number(final_morning) + Number(final_night) : 0,
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
