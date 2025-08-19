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

let productnum;
let mysql_accmountnum;

const realtime_table = ["beforeinjectionstage"];

const mes_edgeFolding = ["精封機出料自動化寫入", "精封機出料自動化寫入二期"];

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

  // console.log(range);

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
      // console.error("Error reading record:", error);
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
    // console.log("selectMachine 為空，不繼續 MES 設備檢閱，返回!");
    return;
  }
  //搜尋機台名稱是正常的繼續往下判斷
  if (selectMachine != "" || selectMachine !== undefined) {
    if (
      (!Array.isArray(selectMachine) &&
        selectMachine.indexOf("精封機出料自動化寫入")) !== -1
    ) {
      query_realtable = realtime_table[0].toString();
      // console.log("query_realtable 設定為 (精封機):", query_realtable); // 增加

      // if (
      //   selectMachine.includes("精封機出料自動化寫入") &&
      //   selectMachine.length === 9
      // ) {
      //   // console.log("精封機站一期寫入執行中!");
      // } else {
      //   // console.log("精封機站二期寫入執行中!");
      // }
      // // 精封機 切換 Option
      // // console.log("精封站Switch 成功 , 資料如後" + selectMachine);
    }
    // 精封站 --- end ---
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

    if (
      machineoption.toString().match("精封機出料自動化寫入") ||
      machineoption.toString().match("精封機出料自動化寫入二期")
    ) {
      sql = `SELECT * from ${query_realtable} where 1 = 1 AND stageid='分選機前站' and remark like '${machineoption}' ORDER BY ID DESC limit 1`;
    }

    //執行最新一筆row data 擷取
    [equipmentdata] = await dbmes.query(sql);

    // 精封站
    // 從 seci&chroma_realtime 抓資料 填入到 自訂參數
    if (query_realtable.includes("beforeinjectionstage")) {
      //因預設無realtime , 這邊臨時新增seci&chroma_realtime table 做後續回傳生產資訊用
      const sql_format_cap = "SELECT * FROM mes.`seci&chroma_realtime`";
      const [temp_equimentdata] = await dbmes.query(sql_format_cap);

      // 2025.02.11 seci&chroma_realtime 提出資料
      statusnum = equipmentdata[0].boxNO = "1".toString(); // 目前狀態
      changeruntime_display(parseInt(statusnum));
      temp_equimentdata[0].MachineStatus = stringrunstatus; // 目前狀態
      deviceCode = temp_equimentdata[0].WO; // 工單號
      MachineNO_Edge = temp_equimentdata[0].MachineNO; //設備編號

      // 2025.02.11 將資料重新存回beforeinjectionstage
      equipmentdata[0].boxNO = stringrunstatus; // 目前狀態
      equipmentdata[0].stageID = deviceCode; // 目前工單號
      equipmentdata[0].cellNO = MachineNO_Edge; // 設備編號

      if (
        stringrunstatus === "" ||
        deviceCode === "" ||
        MachineNO_Edge === ""
      ) {
        // console.log("目前精封站batch表單狀態重整後為空值!,請確認");
      } else {
        console.log(
          `${equipmentdata[0].boxNO} + ${equipmentdata[0].stageID} + ${equipmentdata[0].cellNO}`
        );
      }
      //指定製令OP操作人員
      equipmentdata[0].CurrentEdgeOP = parseInt(33);
    }

    changeruntime_display(parseInt(statusnum));

    equipmentdata[0].MachineStatus = stringrunstatus;
    // batch_fin_table = "injection_batch_fin";

    //這邊需要做count計算目前產能: (該天日期 00:00:00 ~ 23:59:59)
    startoem_dt = currentDate + " 00:00:00";
    endoem_dt = currentDate + " 23:59:59";

    let sql2;

    //精封站只有realtime table ,無 batch_fin_table
    if (query_realtable.includes("beforeinjectionstage")) {
      sql2 = `SELECT count(DISTINCT CellNO) AS result FROM ${query_realtable} where 1 = 1 AND stageid ='分選機前站'  AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND Remark like '${machineoption}' AND CellNO IS NOT NULL AND CellNO != ''`;
    }

    //精封站當天全時段產能擷取數量
    [PLCCellID_CE_currentday_ALL] = await dbmes.query(sql2);

    PLCCellID_CE_makenum = PLCCellID_CE_currentday_ALL[0]["result"];

    if (
      machineoption.includes("精封機出料自動化寫入") ||
      machineoption.includes("精封機出料自動化寫入二期")
    ) {
      const edgecellon_makenum = PLCCellID_CE_makenum.toString();
      equipmentdata[0].Time = parseInt(edgecellon_makenum);
      // console.log("精封站全天產能為= " + equipmentdata[0].Time);
    }

    res.status(200).json(equipmentdata);

    // res.json({
    //   message: "Edge Folder Node works!",
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
  // console.log("操作OP員工工號: " + equipmentID);

  accmount_begindate = String(accmount_stdate).trim() + " 00:00:00";
  // console.log("查詢累積產能起始日期 " + accmount_begindate);

  try {
    const dqlname = `SELECT memberName FROM hr_memberinfo where memberID = ${equipmentID}`;
    const [Name] = await db2.query(dqlname);

    searchclassname = Name[0].memberName;

    // console.log("查詢名字為:" + searchclassname);

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

    let sql;

    //query精封站班別產能
    if (query_realtable.includes("beforeinjectionstage")) {
      sql = `
        SELECT count(DISTINCT CellNO) AS result,'edge_shiftclass_currday' AS type  FROM ${query_realtable}  where 1 = 1 AND stageid = '分選機前站'  AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND   Remark like '${machineoption}' AND remark IS NOT NULL AND remark != '' \
        UNION ALL SELECT count(DISTINCT CellNO),'edge_amount_begintoend_currday'  FROM ${query_realtable}  where 1 = 1 AND stageid = '分選機前站'  AND TIME BETWEEN '${accmount_begindate}'  AND '${endoem_dt}' AND   Remark like '${machineoption}' AND remark IS NOT NULL AND remark != ''
      `;
    }

    const capacitynum = await dbmes.query(sql);

    // 擷取精封班別產能
    if (query_realtable.includes("beforeinjectionstage")) {
      productnum = capacitynum[0][0]["result"];
      mysql_accmountnum = capacitynum[0][1]["result"];

      console.log("精封機出料產能 = " + productnum);
      console.log("精封機出料累積產能 = " + mysql_accmountnum);
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

    // console.log("MYSQL 精封站 results = " + results);

    res.status(200).send(results);
  } catch (error) {
    // console.error("發生錯誤", error);
    res.status(500).json({
      message: "groupname_capacitynum 取得資料錯誤",
    });
  }
});

//收集全機台當天生產產能數據回傳前端
router.get("/fullmachinecapacity", async (req, res) => {
    const { currentDay } = req.query;

    let sql = `
        SELECT 
            COALESCE(COUNT(DISTINCT CASE WHEN remark LIKE "精封機出料自動化寫入" THEN CellNO END), 0) AS 精封機出料自動化寫入,
            COALESCE(COUNT(DISTINCT CASE WHEN remark LIKE "精封機出料自動化寫入二期" THEN CellNO END), 0) AS 精封機出料自動化寫入二期
 
        FROM mes.beforeinjectionstage
        WHERE Time BETWEEN ? AND ?
    `;

    
    try {
        const startDay = currentDay + " 00:00:00";
        const endDay = currentDay + " 23:59:59";
        
        const [rows] = await db2.query(sql, [startDay, endDay]);
        console.log("全機台當天生產產能數據 :", rows[0]);
       
        res.status(200).json({data: rows[0]});
        
        
    } catch (error) {
        console.error("發生錯誤", error);
        res.status(500).json({
            message: "取得資料錯誤",
        });
    }
});

module.exports = router;
