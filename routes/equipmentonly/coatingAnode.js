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






module.exports = router;
