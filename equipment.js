require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
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

//宣告注液機 realtime table 變數
let query_realtable;
//目前線上已使用的即時站資訊table
const realtime_table = [
  "assembly_realtime",
  "injection_realtime",
  "injection_realtime_2",
  "stacking_realtime",
];

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

const dbmeslocal = mysql.createPool({
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "mes",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
});

const dbhr = mysql.createPool({
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "hr",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
});

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

  // console.log("確認selectMachine = "+selectMachine);
  //搜尋機台名稱是正常的繼續往下判斷
  if (selectMachine != "" || selectMachine === undefined) {
    //判斷是否為注液機台
    if (!Array.isArray(selectMachine) && selectMachine.includes("注液機")) {
      //"注液機二期"
      if (selectMachine.substring(0, 5).includes("注液機二期")) {
        query_realtable = realtime_table[2].toString();
        // console.log("query_realtable 二期=" + query_realtable);
      } else {
        //"注液機一期"
        query_realtable = realtime_table[1].toString();
        // console.log("query_realtable 一期=" + query_realtable);
      }
    } //判斷是否為入殼機台
    else if (
      !Array.isArray(selectMachine) &&
      selectMachine.includes("自動組立機")
    ) {
      query_realtable = realtime_table[0].toString();
      // console.log("query_realtable 自動組立機(入殼站)=" + query_realtable);
    } //判斷是否為疊片機台
    else if (!Array.isArray(selectMachine) && selectMachine.includes("Stack")) {
      const numberresult = selectMachine.match(/\d+/); // 匹配字串中的所有數字
      const isValidnum = parseInt(numberresult[0]);

      console.log("確認比對機器數字為:" + parseInt(isValidnum));
      //當 numberresult 介於 (1~5) 疊片機一期
      if (isValidnum >= 1 && isValidnum <= 5) {
        console.log(" (疊片機一期)執行中!");
      } else {
        console.log(" (疊片機二期)執行中!");
      }

      // where MachineName like 'Stack6'

      // query_realtable = realtime_table[3].toString() + ` where MachineName like '${machineselect}' `;

      query_realtable = realtime_table[3].toString();
    }
  } else {
    console.log(selectMachine + "接收table空值, 異常ERROR");
  }

  //---本機local 使用正常,遠端目前尚未驗證---  start---//
  // const selectMachine = machineselect.toString();

  // //搜尋機台名稱是正常的繼續往下判斷
  // if (selectMachine != "") {
  //   //判斷是否為注液機台
  //   if (selectMachine.includes("注液機")) {
  //     //"注液機二期"
  //     if (selectMachine.substring(0, 5).includes("注液機二期")) {
  //       query_realtable = realtime_table[2];
  //     } else {
  //       //"注液機一期"
  //       query_realtable = realtime_table[1];
  //     }
  //   }
  // } else {
  //   console.log(selectMachine + "接收table空值, 異常ERROR");
  // }
  //---end---//
}

router.get("/updatepage", async (req, res) => {
  //console.log("收到刷新機器生產頁面需求");
  const { machineoption } = req.query;
  console.log("machineoption接收為= " + machineoption);
  let startoem_dt = "";
  let endoem_dt = "";
  let statusnum = "";
  let batch_fin_table = "";
  let sql;
  try {
    //先行更新日期
    update_sysdatetime();
    //在切換realtime table
    change_update_mestable(machineoption);

    //疊片機走這段
    if (machineoption.toString().includes("Stack")) {
      const numberresult = machineoption.match(/\d+/); // 匹配字串中的所有數字
      const isValidnum = parseInt(numberresult[0]);

      if (isValidnum >= 1 && isValidnum <= 9) {
        sql = `SELECT * FROM ${query_realtable} where MachineName like '${machineoption}' ORDER BY ID DESC limit 1`;
      } else {
        sql = `SELECT * FROM ${query_realtable} ORDER BY ID DESC limit 1`;
      }
    } else {
      sql = `SELECT * FROM ${query_realtable} ORDER BY ID DESC limit 1`;
    }

    // console.log("sql realtime = "+sql);

    const [equipmentdata] = await dbmes.query(sql);

    console.log("query_realtable = " + query_realtable);
    //針對設備運作狀態,顯示字串做判斷變化
    if (
      query_realtable.includes("assembly_realtime") ||
      query_realtable.includes("stacking_realtime")
    ) {
      // console.log("equipmentdata = "+ equipmentdata[0]);

      if (equipmentdata[0] === undefined || equipmentdata[0] === "") {
        console.log("目前query全部都為空殖");
        statusnum = 0;
        // console.log("equipmentdata[0].MachineStatusCode狀態為 = "+equipmentdata[0].MachineStatusCode);
      } else {
        statusnum = equipmentdata[0].MachineStatusCode;
      }
    } else {
      statusnum = equipmentdata[0].MachineStatus;
    }

    changeruntime_display(parseInt(statusnum));

    //入殼機目前機台狀態碼column跟其他不同,這邊需要做判斷
    if (query_realtable.includes("assembly_realtime")) {
      // console.log("入殼機台狀態為:" + stringrunstatus);
      equipmentdata[0].MachineStatusCode = stringrunstatus;
      batch_fin_table = "assembly_batch";
    } else if (query_realtable.includes("stacking_realtime")) {
      console.log("疊片機台狀態為:" + stringrunstatus);

      if (equipmentdata[0] === undefined || equipmentdata[0] === "") {
        // equipmentdata[0].MachineStatusCode = stringrunstatus;
      } else {
        equipmentdata[0].MachineStatusCode = stringrunstatus;
      }
      batch_fin_table = "stacking_batch";
    } else {
      equipmentdata[0].MachineStatus = stringrunstatus;
      batch_fin_table = "injection_batch_fin";
    }

    //這邊需要做count計算目前產能: (該天日期 00:00:00 ~ 23:59:59)
    startoem_dt = currentDate + " 00:00:00";
    endoem_dt = currentDate + " 23:59:59";

    // const sql2 = `SELECT  COUNT( PLCCellID_CE ) FROM  injection_batch_fin where REMARK like '${machineoption}' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}'`;

    let sql2 = `SELECT  COUNT(DISTINCT PLCCellID_CE ) FROM  ${batch_fin_table}`;
    //代表有一到二多期的機台需要REMARK做搜尋,若只有一台就不用加這段query
    if (!query_realtable.includes("assembly_realtime")) {
      //注液站
      if (
        query_realtable.includes("injection_realtime") ||
        query_realtable.includes("injection_realtime_2")
      ) {
        sql2 += ` where REMARK like '${machineoption}' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;
      } //疊片站
      else if (query_realtable.includes("stacking_realtime")) {
        sql2 += ` where Machine like '${machineoption}' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;
      }
    } else {
      //沒有REMARK用以下這段query
      sql2 += ` where TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;
    }

    //  console.log(sql2);

    const [PLCCellID_CE_currentday_ALL] = await dbmes.query(sql2);
    const PLCCellID_CE_makenum =
      PLCCellID_CE_currentday_ALL[0]["COUNT(DISTINCT PLCCellID_CE )"];

    // console.log(
    //   "目前PLCCellID_CE_currentday_ALL產能狀態:" + PLCCellID_CE_makenum
    // );

    // console.log("目前machineoption狀態:" + machineoption);

    //將上述計算過的目前生產量 取代原先realtime 欄位的生產數量, 這邊以計算的為主
    if (machineoption.includes("注液機出料自動寫入")) {
      //一期生產量
      equipmentdata[0].PARAM42 = parseInt(PLCCellID_CE_makenum);
    } else if (machineoption.includes("注液機二期出料自動寫入")) {
      //二期生產量
      equipmentdata[0].PARAMB33 = parseInt(PLCCellID_CE_makenum);
      // console.log("目前注液機二期產能為:" + equipmentdata[0].PARAMB33);
    } else if (machineoption.includes("Stack")) {
      const numberresult = machineoption.match(/\d+/); // 匹配字串中的所有數字

      const isValidnum = parseInt(numberresult[0]);

      //機台編號從1開始
      if (isValidnum >= 1) {
        equipmentdata[0].PLCErrorCode = parseInt(PLCCellID_CE_makenum);
        console.log(
          machineoption + " 疊片機目前產量qty:" + equipmentdata[0].PLCErrorCode
        );
      }
      // //當 numberresult 介於 (1~5) 疊片機一期
      // if (isValidnum >= 1 && isValidnum <= 5) {

      // } else {

      // }
    } else {
      //入殼機 REMARK欄位
      equipmentdata[0].REMARK = parseInt(PLCCellID_CE_makenum);
    }

    res.status(200).json(equipmentdata); // 將報修紀錄回傳至前端

    // res.status(200).json(charttotalamont);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

//查詢目前值班操作人員隸屬組別(目前編制A或B)/目前生產量
router.get("/groupname_capacitynum", async (req, res) => {
  let results = "";
  let startoem_dt = "";
  let endoem_dt = "";
  let batch_fin_table = "";

  const { equipmentID, shiftclass, machineoption } = req.query;
  //console.log("操作OP員工工號: " + equipmentID);

  try {
    const dqlname = `SELECT memberName FROM hr_memberinfo where memberID = ${equipmentID}`;
    const [Name] = await db2.query(dqlname);
    searchclassname = Name[0].memberName;

    //先行更新日期
    update_sysdatetime();

    // console.log("shiftclass= " + shiftclass);

    //在切換realtime table
    change_update_mestable(machineoption);

    if (shiftclass.toString().includes("早班")) {
      startoem_dt = currentDate + " 08:00:00";
      endoem_dt = currentDate + " 20:00";
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

    //入殼機目前機台狀態碼column跟其他不同,這邊需要做判斷
    if (query_realtable.includes("assembly_realtime")) {
      //入殼機
      batch_fin_table = "assembly_batch";
    } else if (query_realtable.includes("stacking_realtime")) {
      //疊片機
      batch_fin_table = "stacking_batch";
    } else {
      //注液機
      batch_fin_table = "injection_batch_fin";
    }

    // 從mes資料庫中擷取目前生產量(依據REMARK判斷機台)
    // const sql = `SELECT  COUNT( PLCCellID_CE ) FROM  injection_batch_fin where  1 = 1  AND REMARK like '${machineoption}' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' \
    //   ORDER BY  ID DESC  LIMIT 0, 500000`;

    let sql = `SELECT  COUNT(DISTINCT PLCCellID_CE ) FROM  ${batch_fin_table}`;
    //代表有一到二多期的機台需要REMARK做搜尋,若只有一台就不用加這段query
    if (!query_realtable.includes("assembly_realtime")) {
      //注液站
      if (
        query_realtable.includes("injection_realtime") ||
        query_realtable.includes("injection_realtime_2")
      ) {
        sql += ` where 1 = 1 AND REMARK like '${machineoption}' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;
      } //疊片站
      else if (query_realtable.includes("stacking_realtime")) {
        sql += ` where 1 = 1 AND Machine like '${machineoption}' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;
      }
    } else {
      //沒有REMARK用以下這段query
      sql += ` where 1 = 1  AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' ORDER BY  ID DESC  LIMIT 0, 500000`;
    }

    console.log("Debug sql = :" + sql);

    const [capacitynum] = await dbmes.query(sql);
    const productnum = capacitynum[0]["COUNT(DISTINCT PLCCellID_CE )"];

    console.log("productnum = " + productnum);

    // res.status(200).json(equipmentID); // 將組別名稱回傳至前端
    const makeproduce_num = productnum.toString();

    //後續再讀取班表確認目前操作工號人員的組別
    const xls_taskID = equipmentID.toString().padStart(3, "0");
    confirm_group_xls(xls_taskID);

    //這邊只取組別即可,原先字串為(早A,早B,晚A,晚B)
    searchclass = searchclass.substring(1, searchclass.length);

    //console.log("操作機台姓名=" + searchclassname);

    results =
      makeproduce_num +
      "|" +
      searchclass.toString() +
      "|" +
      searchclassname.toString();
    // console.log(results);
    console.log("results = " + results);
    res.status(200).send(results);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

module.exports = router;
