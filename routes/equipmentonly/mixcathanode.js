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

// Define your routes here
router.get("/updatepage", async (req, res) => {
  //console.log("收到刷新機器生產頁面需求");
  const { machineoption } = req.query;
  console.log("machineoption接收為= " + machineoption);

  let startoem_dt = "";
  let endoem_dt = "";
  let statusnum = "";
  let batch_fin_table = "";
  let PLCCellID_CE_makenum;
  let BarcodeID_SeciChroma_makenum;
  let equipmentdata;
  let PLCCellID_CE_currentday_ALL;
  let assbatch_remark;
  let sql;

  try {
    //先行更新日期
    update_sysdatetime();
    //在切換realtime table
    change_update_mestable(machineoption);

    //正極塗佈走這段
    if (machineoption?.indexOf("c正極塗佈") !== -1) {
      let query_realtable = realtime_table[0].toString().trim();
      sql = `SELECT * FROM ${query_realtable} ORDER BY ID DESC limit 1`;
      console.log("sql realtime = " + sql);
    }
    //負極塗佈走這段
    else if (machineoption?.indexOf("a負極塗佈") !== -1) {
      let query_realtable = realtime_table[1].toString().trim();
      sql = `SELECT * FROM ${query_realtable} ORDER BY ID DESC limit 1`;
      console.log("sql realtime = " + sql);
    }

    //執行最新一筆row data 擷取所有欄位
    [equipmentdata] = await dbmes.query(sql);

    //將指定IR位置值做交替
    if (
      query_realtable.includes("coating_realtime_c" || "coating_realtime_a")
    ) {
      const IR3 = equipmentdata[0].IR3_PV;
      const Oven2_PV = equipmentdata[0].Oven2_PV;

      // console.log("IR3 我要確認我有值= " + IR3);

      console.log("IR3 我要確認我有值= " + IR3);

      equipmentdata[0].IR4_PV_Renew = IR3;
      equipmentdata[0].IR5_PV_Renew = IR3;
      // equipmentdata[0].Oven1_PV_Renew = Oven2_PV;
      console.log("已加欄位", equipmentdata[0]);
    }

    //因塗佈無批次 batch 這邊不需要做任何動作
    console.log("coating塗佈(正負極)站 無批次 batchtable");

    //改變機器原先數字轉為通規顯示狀態
    changeruntime_display(parseInt(statusnum));

    //這邊需要做count計算目前產能: (該天日期 00:00:00 ~ 23:59:59)
    startoem_dt = currentDate + " 00:00:00";
    endoem_dt = currentDate + " 23:59:59";
    let sql2;

    //正負極塗佈目前realtable 無提供即時數量,先不計算
    if (
      query_realtable.includes("coating_realtime_c") ||
      query_realtable.includes("coating_realtime_a")
    ) {
      sql2 = `SELECT count(distinct MACHINENO) AS result FROM ${query_realtable} where 1 = 1 AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}'`;
    }

    [PLCCellID_CE_currentday_ALL] = await dbmes.query(sql2);

    //這邊先自行測試目前當天上線機台數量
    PLCCellID_CE_makenum = PLCCellID_CE_currentday_ALL[0]["result"];

    if (
      query_realtable.includes("coating_realtime_c") ||
      query_realtable.includes("coating_realtime_a")
    ) {
      //不帶入equipmentdata 資料欄位
    }

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

router.get("/groupname_capacitynum", async (req, res) => {
  let results = "";
  let startoem_dt = "";
  let endoem_dt = "";
  let batch_fin_table = "";
  let makeproduce_num;
  let makeproduce_accumulation_num;
  let accmount_begindate;
  let assbatch_remark;
  let cc2_sulting_start_date, cc2_sulting_end_date;

  const { equipmentID, shiftclass, machineoption, accmount_stdate } = req.query;
  console.log("操作OP員工工號: " + equipmentID);

  accmount_begindate = accmount_stdate.toString() + " 00:00:00";
  console.log("查詢累積產能起始日期 " + accmount_begindate);

  try {
    const dqlname = `SELECT memberName FROM hr_memberinfo where memberID = ${equipmentID}`;
    const [Name] = await db2.query(dqlname);

    searchclassname = Name[0].memberName;

    console.log("查詢名字為:" + searchclassname);

    //先行更新日期
    update_sysdatetime();

    // console.log("shiftclass= " + shiftclass);

    //在切換realtime table
    change_update_mestable(machineoption);

    if (shiftclass.toString().includes("早班")) {
      startoem_dt = currentDate + " 08:00:00";
      endoem_dt = currentDate + " 20:00:00";
    } else if (shiftclass.toString().includes("晚班")) {
      //取得當前日期和下一個日期
      const nowcurrent = new Date();
      const overnightdate = new Date(nowcurrent);
      overnightdate
        .setDate(nowcurrent.getDate() + 1)
        .toString()
        .padStart(2, "0");

      startoem_dt = nowcurrent.toISOString().split("T")[0] + " 20:00:00";
      endoem_dt = overnightdate.toISOString().split("T")[0] + " 08:00:00"; // toISOString().split("T")[0] ->格式化為 YYYY-MM-DD
    }

    //塗佈正負極站因目前無batchtable ,這邊不做處理
    // batch_fin_table = "";

    if (
      query_realtable.includes("coating_realtime_c") ||
      query_realtable.includes("coating_realtime_a")
    ) {
      //這邊先用假生產數據讓前端可顯示數量,日後有正確計算產量在實施query
      if (query_realtable.includes("coating_realtime_c")) {
        //正極塗佈假數據生產數量
        productnum = Number(parseInt(mes_cathnode_count)) + addnumber;
        mysql_accmountnum =
          Number(parseInt(mes_cathnode_amountcount)) + addnumber;
      } else {
        //負極塗佈假數據生產數量
        productnum = Number(parseInt(mes_anode_count)) + addnumber;
        mysql_accmountnum = Number(parseInt(mes_anode_amountcount)) + addnumber;
      }

      console.log(
        query_realtable.indexOf("realtime_c") !== -1
          ? "正極塗佈班別產能 ="
          : "負極塗佈班別產能 =" + productnum
      );
      console.log(
        query_realtable.indexOf("realtime_c") !== -1
          ? "正極塗佈累積產能 ="
          : "負極塗佈累積產能 =" + mysql_accmountnum
      );
    }

    makeproduce_num = parseInt(productnum).toString();
    makeproduce_accumulation_num = parseInt(mysql_accmountnum).toString();

    //後續再讀取班表確認目前操作工號人員的組別
    const xls_taskID = equipmentID.toString().padStart(3, "0");
    confirm_group_xls(xls_taskID);

    //這邊只取組別即可,原先字串為(早A,早B,晚A,晚B)
    searchclass = searchclass.substring(1, searchclass.length);

    results =
      makeproduce_num +
      "|" +
      searchclass.toString() +
      "|" +
      searchclassname.toString() +
      "|" +
      makeproduce_accumulation_num;

    console.log(
      "MYSQL->" + query_realtable.includes("coating_realtime_c")
        ? "正極塗佈站"
        : "負極塗佈站" + "results = " + results
    );

    res.status(200).send(results);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "groupname_capacitynum 取得資料錯誤",
    });
  }
});
module.exports = router;
