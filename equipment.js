require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const dbms_pool = require(__dirname + "/../modules/mssql_newconnect.js");
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

//替代各站一二期搜尋條件變數
let seci_chroma_sitetype;

//高常溫字元
let hraging_title;

//高常溫數據列表
let HT_Aging_mesdata = [];
let RT_Aging_mesdata = [];
let strat = true;
let accmount_cul = false;
let currentday_fulltime = true;
let productnum;
let productnum_HT, productnum_accmountHT;
let productnum_RT, productnum_accmountRT;

let mysql_accmountnum;
let mssql_accmountnum;

//宣告注液機 realtime table 變數
let query_realtable;
//目前線上已使用的即時站資訊table
const realtime_table = [
  "assembly_realtime",
  "injection_realtime",
  "injection_realtime_2",
  "stacking_realtime",
  "seci_outport12",
  "chroma_outport123",
  "ITFC_MES_UPLOAD_STATUS_TB",
  "cutting_realtime_c",
  "cutting_realtime_a",
  "beforeinjectionstage",
];

const mes_hrtAging_period = ["H%", "N%", "N2%"];
const mes_Cathnod_Anode_Label = ["C%", "B%"];
const mes_Cutting_chs_condition = ["良品總計", "不良品總計", "報廢品總計"];
const mes_Cutting_MannulorAuto = ["Prdouction", "ManualInput"];
const mes_edgeFolding = ["精封機出料自動化寫入", "精封機出料自動化寫入二期"];

//確認期數
let check_period = "";

//確認高常溫字元格式%
let check_HRTperiod = "";
//確認正負極字元格式%
let check_Cathnod_Anode = "",
  Cuttingstatus_Amount_Num = "",
  Cuttingstatus_quality = "",
  CuttingSum_MannulorAuto = "";

let check_HRT = true;
let count_HT = 0;
let count_RT = 0;
let check_count_HT = false;
let check_count_RT = false;
let realtimebatch_HT_Aging = [];
let realtimebatch_RT_Aging = [];

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

const MS_dbConfig = {
  server: "192.168.200.52",
  database: "ASRS_HTBI",
  user: "HTBI_MES",
  password: "mes123",
  port: parseInt(process.env.MSSQL_PORT, 10) || 1433, // 使用默認端口
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
  options: {
    encrypt: true, // 如果使用 Azure SQL Database，需設為 true
    trustServerCertificate: true, // 若使用自簽名憑證，可設為 true
  },
};

//action (true/false) 控制MSSQL連結池開關 , platform 判斷站別 , period 期數判定 , query 提交查詢字串 , mode 選擇產量區別 1:全天  2:累績
async function Mssql_connectToASRS_HTBI(action, query, fulltime, mode) {
  try {
    // 初始化連接池
    const pool = new ms_newsql.ConnectionPool(MS_dbConfig);
    let HRT_product_amountnum;
    let result_HT, result_RT;
    let result_accumul_HT, result_accumul_RT;
    let RT_shiftnum, RT_acmountnum;

    // 建立連接池
    await pool.connect();
    // console.log("成功 Successfully connected to SQL Server!");

    //高溫靜置走這段
    if (check_HRTperiod.includes("H%")) {
      // 使用 pool 進行查詢操作等

      if (parseInt(mode) === 1) {
        result_HT = await pool.request().query(query);
        // console.log("result_HT 高溫= " + JSON.stringify(result_HT));
      } else {
        result_accumul_HT = await pool.request().query(query);
        // console.log(
        //   "result_accumul_HT 高溫累積= " + JSON.stringify(result_accumul_HT)
        // );
      }
    } //常溫靜置走這段
    else {
      // 使用 pool 進行查詢操作等
      if (parseInt(mode) === 1) {
        result_RT = await pool.request().query(query);
        // console.log("result_RT = " + JSON.stringify(result_RT));
      } else {
        result_accumul_RT = await pool.request().query(query);
        // console.log(
        //   "result_accumul_RT 常溫累積= " + JSON.stringify(result_accumul_RT)
        // );
      }
    }

    // console.log("result_RT = " + JSON.stringify(result_RT));

    // console.log(result.recordsets[0]);
    // console.log(result.recordsets[1]);

    // console.log(result_RT.recordsets[0]);

    /*取得最新工作序號row data , 當天(00:00：00 ~ 23:59:59:+生產量 */

    //高常溫倉都走以下判斷

    //取當天總資訊
    if (fulltime) {
      //判斷高常溫
      if (check_HRTperiod.includes("H%")) {
        if (parseInt(mode) === 1) {
          //當天fulltime總生產量
          result_HT.recordsets[0].map((row, index) => {
            HRT_product_amountnum = row.cell_HRT_product_num;
            // console.log(
            //   "HRT_product_amountnum = " + parseInt(HRT_product_amountnum)
            // );
          });
          result_HT.recordsets[1].map((row) => {
            row.CREATE_TYPE = parseInt(HRT_product_amountnum);
            // console.log(row.CREATE_TYPE);
            // console.log(JSON.stringify(row));
          });

          realtimebatch_HT_Aging.push({ batchtable: result_HT.recordsets[1] });
        } else {
          //累積年度計算fulltime總生產量
          // result_accumul_HT.recordsets[0].map((row, index) => {
          //   console.log("第" + index + "組: -> " + row);
          // });
        }
      } else {
        if (parseInt(mode) === 1) {
          //當天fulltime總生產量
          result_RT.recordsets[0].map((row, index) => {
            HRT_product_amountnum = row.cell_HRT_product_num;
            // console.log(
            //   "HRT_product_amountnum = " + parseInt(HRT_product_amountnum)
            // );
          });
          result_RT.recordsets[1].map((row) => {
            row.CREATE_TYPE = parseInt(HRT_product_amountnum);
            // console.log(row.CREATE_TYPE);
            // console.log(JSON.stringify(row));
          });
          realtimebatch_RT_Aging.push({ batchtable: result_RT.recordsets[1] });
        } else {
        }
      }
    } //取當前班別生產量
    else {
      //判斷高常溫
      if (check_HRTperiod.includes("H%")) {
        if (parseInt(mode) === 2) {
          // console.log(
          //   "高溫班別產量 = " +
          //     JSON.stringify(
          //       result_accumul_HT.recordset[0]["cell_HRTAccmount_num"]
          //     ) +
          //     " / 高溫總累積自選日期產量 = " +
          //     JSON.stringify(
          //       result_accumul_HT.recordset[1]["cell_HRTAccmount_num"]
          //     )
          // );

          productnum_HT = JSON.stringify(
            result_accumul_HT.recordset[0]["cell_HRTAccmount_num"]
          );
          productnum_accmountHT = JSON.stringify(
            result_accumul_HT.recordset[1]["cell_HRTAccmount_num"]
          );

          // result_accumul_HT.recordsets[1].map((row, index) => {
          //   // HRT_product_amountnum = row.cell_HRT_product_num;
          //   // productnum_HT = parseInt(HRT_product_amountnum);
          //   // console.log(
          //   //   "HRT_shift_productAll高溫班別產能 = " + parseInt(productnum_HT)
          //   // );

          //   console.log(index + "-高溫總產能 = " + row);
          // });
        } else {
        }
      } else {
        if (parseInt(mode) === 2) {
          // console.log("_))))))))有進來");

          productnum_RT = JSON.stringify(
            result_accumul_RT.recordset[0]["cell_HRTAccmount_num"]
          );
          productnum_accmountRT = JSON.stringify(
            result_accumul_RT.recordset[1]["cell_HRTAccmount_num"]
          );

          // result_RT.recordsets[0].map((row, index) => {
          //   HRT_product_amountnum = row.cell_HRT_product_num;
          //   productnum_RT = parseInt(HRT_product_amountnum);

          //   // console.log(
          //   //   "HRT_shift_productAll常溫班別產能 = " + parseInt(productnum_RT)
          //   // );
          // });
        } else {
        }
      }
    }

    // 關閉連接池
    if (!action) {
      await pool.close();
      // console.log("~關閉 disconnect to SQL Server~");
    }
  } catch (err) {
    console.error("Error connecting to SQL Server:", err);
  }
}

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
    console.log("selectMachine = ", selectMachine + " 不繼續MES設備檢閱,返回!");
    return;
  }

  // console.log("確認selectMachine = "+selectMachine);
  //搜尋機台名稱是正常的繼續往下判斷
  if (selectMachine != "" || selectMachine !== undefined) {
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
    } //化成和分容站走這邊判斷
    else if (!Array.isArray(selectMachine) && selectMachine.includes("%0")) {
      //seci_chroma -> 判斷化成1或2期
      const seci_chroma = selectMachine.split("_");

      // %023% , %010% , %017%
      seci_chroma_sitetype = seci_chroma[0].toString();
      // 1期或2期
      if (parseInt(seci_chroma[1]) === 1) {
        query_realtable = realtime_table[4].toString();
        check_period = "1";
      } else if (parseInt(seci_chroma[1]) === 2) {
        query_realtable = realtime_table[5].toString();
        check_period = "2";
      }

      //化成站
      if (seci_chroma_sitetype.match("%023%") && check_period.match("1")) {
        console.log("化成一期執行中!");
      } else if (
        seci_chroma_sitetype.match("%023%") &&
        check_period.match("2")
      ) {
        console.log("化成二期執行中!");
      }
      //分容站
      else if (seci_chroma_sitetype.match("%010%") && check_period.match("1")) {
        console.log("分容CC1一期執行中!");
      } else if (
        seci_chroma_sitetype.match("%010%") &&
        check_period.match("2")
      ) {
        console.log("分容CC1二期執行中!");
      } else if (
        seci_chroma_sitetype.match("%017%") &&
        check_period.match("1")
      ) {
        console.log("分容CC2一期執行中!");
      } else if (
        seci_chroma_sitetype.match("%017%") &&
        check_period.match("2")
      ) {
        console.log("分容CC2二期執行中!");
      }
    }
    // 高常溫靜置倉站走這邊判斷
    else if (
      !Array.isArray(selectMachine) &&
      typeof selectMachine[selectMachine.length - 1] === "string" &&
      selectMachine[selectMachine.length - 1].includes("%")
    ) {
      //h , r-> 判斷高溫或常溫
      hraging_title = selectMachine.substring(0, 1);

      //高溫
      if (hraging_title.match("H")) {
        count_HT++;

        if (count_HT >= 3) {
          count_HT = 0;
          check_count_HT = !check_count_HT;
          // console.log("count_HT 已經重設為 0");
        }

        check_HRTperiod = mes_hrtAging_period[0];
        console.log("高溫倉一期執行中!");
      } //常溫
      else if (hraging_title.match("N")) {
        const two_period = /N2%$/;
        count_RT++;

        if (count_RT >= 3) {
          count_RT = 0;
          check_count_RT = !check_count_RT;
          // console.log("count_RT 已經重設為 0");
        }
        //一期
        if (!two_period.test(selectMachine)) {
          check_HRTperiod = mes_hrtAging_period[1];
          console.log("常溫倉一期執行中!");
        } //二期
        else {
          check_HRTperiod = mes_hrtAging_period[2];
          console.log("常溫倉二期執行中!");
        }
      }
      query_realtable = realtime_table[6].toString();
    }
    //正負極五金模切走這邊判斷
    else if (
      !Array.isArray(selectMachine) &&
      typeof selectMachine[selectMachine.length - 1] === "string" &&
      selectMachine.length > 1 &&
      selectMachine[1].includes("%") &&
      selectMachine[2].includes("_")
    ) {
      //以第一筆字元判定正負極 C:正極  B:負極
      if (selectMachine[0].includes("C")) {
        query_realtable = realtime_table[7].toString();
        console.log("+正極五金模切執行中!");
      } else if (selectMachine[0].includes("B")) {
        query_realtable = realtime_table[8].toString();
        console.log("-負極五金模切執行中!");
      }
      //分析模切機台狀態
      analyze_mes_splitoption(selectMachine);
    } // 精封站Switch Function , 配對 realtime_table
    else if (
      (!Array.isArray(selectMachine) &&
        selectMachine.indexOf("精封機出料自動化寫入")) !== -1
    ) {
      query_realtable = realtime_table[9].toString();

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

async function analyze_mes_splitoption(sendoption) {
  let cutting_qua_status = "";
  const splitstr = sendoption.split("_");

  //參照格式
  // "C%_PASS",
  // "C%_NG",
  // "C%_M_PASS",
  // "C%_M_NG",
  // "C%_SCRAP",
  //目前M判定為手動模式
  if (splitstr.length >= 3 && splitstr[1].includes("M")) {
    Cuttingstatus_Amount_Num = "手工";
    //ManualInput
    CuttingSum_MannulorAuto = mes_Cutting_MannulorAuto[1].toString();

    if (splitstr[0].includes("C%")) {
      check_Cathnod_Anode = mes_Cathnod_Anode_Label[0].toString();
    } else if (splitstr[0].includes("B%")) {
      check_Cathnod_Anode = mes_Cathnod_Anode_Label[1].toString();
    }
    splitstr[2].includes("PASS")
      ? (Cuttingstatus_Amount_Num += mes_Cutting_chs_condition[0].toString())
      : (Cuttingstatus_Amount_Num += mes_Cutting_chs_condition[1].toString());

    //只取"總計"以外的字串
    cutting_qua_status = Cuttingstatus_Amount_Num.replace(
      new RegExp("總計", "gi"),
      ""
    );
    Cuttingstatus_quality = cutting_qua_status.toString();

    console.log("手工判定調....");
  } //一般兩個欄位判定以下
  else {
    //Prdouction
    CuttingSum_MannulorAuto = mes_Cutting_MannulorAuto[0].toString();

    if (splitstr[0].includes("C%")) {
      check_Cathnod_Anode = mes_Cathnod_Anode_Label[0].toString();
    } else if (splitstr[0].includes("B%")) {
      check_Cathnod_Anode = mes_Cathnod_Anode_Label[1].toString();
    }

    splitstr[1].includes("PASS")
      ? (Cuttingstatus_Amount_Num = mes_Cutting_chs_condition[0].toString())
      : splitstr[1].includes("NG")
      ? (Cuttingstatus_Amount_Num = mes_Cutting_chs_condition[1].toString())
      : (Cuttingstatus_Amount_Num = mes_Cutting_chs_condition[2].toString());

    //只取"總計"以外的字串
    cutting_qua_status = Cuttingstatus_Amount_Num.replace(
      new RegExp("總計", "gi"),
      ""
    );
    Cuttingstatus_quality = cutting_qua_status.toString();

    console.log("機器判定調....");
  }
}

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
  let realtimebatch_seci_and_chroma = [];
  let H_R_temperature_internal_Aging = [];
  let equipmentdata;
  let PLCCellID_CE_currentday_ALL;
  let sql;

  try {
    //先行更新日期
    update_sysdatetime();
    //在切換realtime table
    change_update_mestable(machineoption);

    //再判斷高溫，陣列清空,目前高溫站需要使用此陣列先清空防止讀取異常
    if (check_HRT && check_count_HT === true) {
      // console.log("HT高溫清除陣列");
      check_count_HT = !check_count_HT;
      realtimebatch_HT_Aging.length = 0;
      realtimebatch_HT_Aging.slice(0, realtimebatch_HT_Aging.length);
      // while (realtimebatch_HT_Aging.length > 0) {
      //   realtimebatch_HT_Aging.pop();
      // }

      // console.log(
      //   "realtimebatch_HT_Aging 清空狀態為 = " +
      //     JSON.stringify(realtimebatch_HT_Aging)
      // );
    } else if (check_HRT && check_count_RT === true) {
      // console.log("RT常溫清除陣列");
      check_count_RT = !check_count_RT;
      realtimebatch_RT_Aging.length = 0;
      realtimebatch_RT_Aging.slice(0, realtimebatch_RT_Aging.length);
    }

    //疊片機走這段
    if (machineoption.toString().includes("Stack")) {
      const numberresult = machineoption.match(/\d+/); // 匹配字串中的所有數字
      const isValidnum = parseInt(numberresult[0]);

      if (isValidnum >= 1 && isValidnum <= 9) {
        sql = `SELECT * FROM ${query_realtable} where MachineName like '${machineoption}' ORDER BY ID DESC limit 1`;
      } else {
        sql = `SELECT * FROM ${query_realtable} ORDER BY ID DESC limit 1`;
      }
    } //化成和分容走這段
    else if (machineoption.toString().includes("%0")) {
      sql = `SELECT * FROM ${query_realtable} where Param like '${seci_chroma_sitetype}' ORDER BY ID DESC limit 1`;
    } //高常溫靜置
    else if (machineoption[machineoption.length - 1].match("%")) {
      // sql = ` SELECT TOP 1 * FROM ${query_realtable} WHERE BIN_CODE LIKE '${machineoption}' ORDER BY ID DESC`;
    } //正負極五金模切
    else if (machineoption[1].match("%") && machineoption[2].match("_")) {
      sql = `SELECT * FROM ${query_realtable} ORDER BY ID DESC limit 1`;
    }
    // 精封站走這段抓取 SQL 資料 並判斷 為 一期 OR 二期
    else if (
      machineoption.toString().match("精封機出料自動化寫入") ||
      machineoption.toString().match("精封機出料自動化寫入二期")
    ) {
      sql = `SELECT * from ${query_realtable} where 1 = 1 AND stageid='分選機前站' and remark like '${machineoption}' ORDER BY ID DESC limit 1`;
    } else {
      sql = `SELECT * FROM ${query_realtable} ORDER BY ID DESC limit 1`;
    }

    console.log("sql realtime = " + sql);

    //高常溫靜置站執行->mssql
    if (machineoption[machineoption.length - 1].match("%")) {
    } //其他站都要走->mysql
    else {
      [equipmentdata] = await dbmes.query(sql);
    }

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
    } else if (
      query_realtable.includes("cutting_realtime_c") ||
      query_realtable.includes("cutting_realtime_a")
    ) {
      //五金模切目前無機器狀態可提供顯示......先預設run =1
      // console.log(JSON.stringify(equipmentdata[0]));
      statusnum = "1".toString();
    } else if (
      query_realtable.includes("seci_outport12") ||
      query_realtable.includes("chroma_outport123") ||
      query_realtable.includes("ITFC_MES_UPLOAD_STATUS_TB") ||
      query_realtable.includes("beforeinjectionstage")
    ) {
      //因預設無realtime , 這邊臨時新增seci&chroma_realtime table 做後續回傳生產資訊用
      const sql_format_cap = "SELECT * FROM mes.`seci&chroma_realtime`";
      const [temp_equimentdata] = await dbmes.query(sql_format_cap);

      // 機器狀態 假資料
      statusnum = temp_equimentdata[0].MachineStatus;
      changeruntime_display(parseInt(statusnum));
      temp_equimentdata[0].MachineStatus = stringrunstatus;

      // 精封站
      // 從 seci&chroma_realtime 抓資料 填入到 自訂參數
      if (query_realtable.includes("beforeinjectionstage")) {
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
          console.log("目前精封站batch表單狀態重整後為空值!,請確認");
        } else {
          console.log(
            `${equipmentdata[0].boxNO} + ${equipmentdata[0].stageID} + ${equipmentdata[0].cellNO}`
          );
        }
      }

      if (query_realtable.includes("ITFC_MES_UPLOAD_STATUS_TB")) {
        //先手動更新測試
        temp_equimentdata[0].OP = parseInt(111);
        //判斷高常溫
        if (check_HRTperiod.includes("H%")) {
          realtimebatch_HT_Aging.push({
            realtable: temp_equimentdata,
          });

          // console.log("高溫第一批 = " + JSON.stringify(realtimebatch_HT_Aging));
        } else {
          realtimebatch_RT_Aging.push({
            realtable: temp_equimentdata,
          });
          // console.log("常溫第一批 = " + JSON.stringify(realtimebatch_RT_Aging));
        }
      } else if (query_realtable.includes("beforeinjectionstage")) {
        equipmentdata[0].CurrentEdgeOP = parseInt(33);
        // console.log("beforeinjectionstage 暫時無需求,保持原狀態");
      } else {
        realtimebatch_seci_and_chroma.push({
          realtable: temp_equimentdata,
        });
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
    } //五金模切批次以下
    else if (
      query_realtable.includes("cutting_realtime_c") ||
      query_realtable.includes("cutting_realtime_a")
    ) {
      //因目前模切無生產機器狀態,這邊先預設先將狀態填入欄位(Curr_NG_Pieces) ,操作工號 188預設表單有的名額先存入欄位 (Curr_OK_Pieces)
      equipmentdata[0].Curr_NG_Pieces = stringrunstatus;
      equipmentdata[0].Curr_OK_Pieces = parseInt(188);
      batch_fin_table = "cutting_bath";
    } else if (query_realtable.includes("ITFC_MES_UPLOAD_STATUS_TB")) {
      batch_fin_table = "ITFC_MES_UPLOAD_STATUS_TB";
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
      } // 化成,分容站
      else if (
        query_realtable.includes("seci_outport12") ||
        query_realtable.includes("chroma_outport123")
      ) {
        sql2 = `SELECT count(DISTINCT Barcode) AS result, 'Seci_BarcodeCell_total' AS type FROM mes.seci_outport12 where Param like '${seci_chroma_sitetype}'  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != '' \
                UNION ALL SELECT count(DISTINCT Barcode),'Chroma_BarcodeCell_total' FROM mes.chroma_outport123  where Param like '${seci_chroma_sitetype}' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != ''`;
      } // 高常溫站
      else if (query_realtable.includes("ITFC_MES_UPLOAD_STATUS_TB")) {
        sql2 = `select count(*) AS cell_HRT_product_num from ${query_realtable} where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between '${startoem_dt}' AND '${endoem_dt}' \
                and BIN_CODE like '${machineoption}' and type=4 and BOX_BATT <> 'NANANANANANA'; 
                SELECT TOP 1 * FROM ${query_realtable} WHERE BIN_CODE LIKE '${machineoption}' ORDER BY ID DESC;`;
      } //正負極模切站
      else if (
        query_realtable.includes("cutting_realtime_c") ||
        query_realtable.includes("cutting_realtime_a")
      ) {
        // console.log(
        //   "切割站全域變數狀態:" +
        //     CuttingSum_MannulorAuto +
        //     " / " +
        //     Cuttingstatus_Amount_Num +
        //     " / " +
        //     Cuttingstatus_quality +
        //     " / " +
        //     check_Cathnod_Anode
        // );

        //手工sql
        if (CuttingSum_MannulorAuto.indexOf("ManualInput") !== -1) {
          sql2 = `SELECT case WHEN SUM( ${CuttingSum_MannulorAuto} ) is NULL then '0' ELSE SUM( ${CuttingSum_MannulorAuto} ) END \
${Cuttingstatus_Amount_Num} FROM cutting_bath tb1 WHERE 1=1 AND ( ${CuttingSum_MannulorAuto} <> '' OR ${CuttingSum_MannulorAuto} <> 'NA' ) AND OKNGSelection = '${Cuttingstatus_quality}' and Caseno like '${check_Cathnod_Anode}' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'`;
        } //機器sql
        else if (CuttingSum_MannulorAuto.indexOf("Prdouction") !== -1) {
          sql2 = `SELECT case WHEN SUM( ${CuttingSum_MannulorAuto} ) is NULL then '0' ELSE SUM( ${CuttingSum_MannulorAuto} ) END \
${Cuttingstatus_Amount_Num} FROM cutting_bath tb1 WHERE 1=1 AND OKNGSelection = '${Cuttingstatus_quality}' and Caseno like '${check_Cathnod_Anode}' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'`;
        }
      }
      //精封站抓 Count 資料 匯出目前產能與累計產能
      else if (query_realtable.includes("beforeinjectionstage")) {
        sql2 = `SELECT count(DISTINCT CellNO) AS result FROM ${query_realtable} where 1 = 1 AND stageid ='分選機前站'  AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND Remark like '${machineoption}' AND CellNO IS NOT NULL AND CellNO != ''`;
      } else {
        //沒有REMARK用以下這段query
        sql2 += ` where TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;
      }
    } else {
      //沒有REMARK用以下這段query
      sql2 += ` where TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;
    }

    // console.log("sql2 = " + sql2);

    //高常溫靜置站執行->mssql
    if (machineoption[machineoption.length - 1].match("%")) {
      Mssql_connectToASRS_HTBI(!strat, sql2, true, 1);
    } //其他站都要走->mysql
    else {
      [PLCCellID_CE_currentday_ALL] = await dbmes.query(sql2);
    }

    if (
      query_realtable.includes("seci_outport12") ||
      query_realtable.includes("chroma_outport123")
    ) {
      //化成分容 (一,二期總產量和)
      const Seci_barcode_total = PLCCellID_CE_currentday_ALL[0]["result"];
      const Chroma_barcode_total = PLCCellID_CE_currentday_ALL[1]["result"];
      // PLCCellID_CE_makenum =
      //   parseInt(Seci_barcode_total) + parseInt(Chroma_barcode_total);

      if (check_period.match("1")) {
        BarcodeID_SeciChroma_makenum = parseInt(Seci_barcode_total);
      } else if (check_period.match("2")) {
        BarcodeID_SeciChroma_makenum = parseInt(Chroma_barcode_total);
      }
    } else if (query_realtable.includes("ITFC_MES_UPLOAD_STATUS_TB")) {
    } else if (
      query_realtable.includes("cutting_realtime_c") ||
      query_realtable.includes("cutting_realtime_a")
    ) {
      // console.log(
      //   "切割站產能狀態:" +
      //     PLCCellID_CE_currentday_ALL[0][Cuttingstatus_Amount_Num]
      // );

      PLCCellID_CE_makenum =
        PLCCellID_CE_currentday_ALL[0][Cuttingstatus_Amount_Num];
    }
    // 精封站 傳出統計資料 當日產能
    else if (query_realtable.includes("beforeinjectionstage")) {
      PLCCellID_CE_makenum = PLCCellID_CE_currentday_ALL[0]["result"];
    } else {
      PLCCellID_CE_makenum =
        PLCCellID_CE_currentday_ALL[0]["COUNT(DISTINCT PLCCellID_CE )"];
    }

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
    } // PF化成,CC1,2分容站
    else if (machineoption.includes("%0")) {
      equipmentdata[0].ErrorCode = parseInt(BarcodeID_SeciChroma_makenum);

      realtimebatch_seci_and_chroma.push({
        batchtable: equipmentdata,
      });

      // console.log(
      //   "第二批 equimentdata = " + JSON.stringify(realtimebatch_seci_and_chroma)
      // );
    } else if (machineoption[machineoption.length - 1].match("%")) {
      //判斷高常溫
      // if (check_HRTperiod.includes("H%")) {
      //   console.log("高溫第二批  = " + JSON.stringify(realtimebatch_HT_Aging));
      // } else {
      //   console.log("常溫第二批   = " + JSON.stringify(realtimebatch_RT_Aging));
      // }
    } else if (machineoption[1].match("%") && machineoption[2].match("_")) {
      //正負極五金模切
      equipmentdata[0].Total_Pieces_produced = parseInt(PLCCellID_CE_makenum);
    }
    // 精封站 傳出統計資料 指定日期產能 與 當日產能
    else if (
      machineoption.includes("精封機出料自動化寫入") ||
      machineoption.includes("精封機出料自動化寫入二期")
    ) {
      const edgecellon_makenum = PLCCellID_CE_makenum.toString();
      equipmentdata[0].Time = parseInt(edgecellon_makenum);
      // console.log("精封站全天產能為= " + equipmentdata[0].Time);
    } else {
      //入殼機 REMARK欄位
      equipmentdata[0].REMARK = parseInt(PLCCellID_CE_makenum);
    }

    //最後final回傳送前端
    //  PF化成,CC1,2分容站
    if (machineoption.includes("%0")) {
      // console.log("化成分容有回傳到前端!!!!!!!!!!!!!");
      res.status(200).json(realtimebatch_seci_and_chroma);
    } // H.T.Aging高溫 / R.T.Aging常溫站
    else if (machineoption[machineoption.length - 1].match("%")) {
      // console.log("H.T/R.T Aging高常溫站有回傳到前端!!!!!!!!!!!!!");

      //判斷高常溫
      if (check_HRTperiod.includes("H%")) {
        // console.log(
        //   "高溫final最後  = " + JSON.stringify(realtimebatch_HT_Aging)
        // );

        res.status(200).json(realtimebatch_HT_Aging);
      } else {
        // console.log(
        //   "常溫final最後  = " + JSON.stringify(realtimebatch_RT_Aging)
        // );

        res.status(200).json(realtimebatch_RT_Aging);
      }
    } else {
      //錯誤示範,不能用這樣DEBUG
      // console.log(equipmentdata.json())

      // console.log(JSON.stringify(equipmentdata));

      res.status(200).json(equipmentdata); // 將報修紀錄回傳至前端
    }
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
  let makeproduce_num;
  let makeproduce_accumulation_num;
  let accmount_begindate;

  const { equipmentID, shiftclass, machineoption, accmount_stdate } = req.query;
  console.log("操作OP員工工號: " + equipmentID);

  accmount_begindate = accmount_stdate.toString() + " 00:00:00";
  console.log("查詢累積產能起始日期 " + accmount_begindate);

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

    //入殼機目前機台狀態碼column跟其他不同,這邊需要做判斷
    if (query_realtable.includes("assembly_realtime")) {
      //入殼機
      batch_fin_table = "assembly_batch";
    } else if (query_realtable.includes("stacking_realtime")) {
      //疊片機
      batch_fin_table = "stacking_batch";
    } else if (
      query_realtable.includes("seci_outport12") ||
      query_realtable.includes("chroma_outport123")
    ) {
      // 化成,分容機站
    } else if (
      query_realtable.includes("cutting_realtime_c") ||
      query_realtable.includes("cutting_realtime_a")
    ) {
      //正負極五金模切
      batch_fin_table = "cutting_bath";
    } else {
      //注液機
      batch_fin_table = "injection_batch_fin";
    }

    // 從mes資料庫中擷取目前生產量(依據REMARK判斷機台)
    // const sql = `SELECT  COUNT( PLCCellID_CE ) FROM  injection_batch_fin where  1 = 1  AND REMARK like '${machineoption}' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' \
    //   ORDER BY  ID DESC  LIMIT 0, 500000`;

    // let sql = `SELECT  COUNT(DISTINCT PLCCellID_CE ) FROM ${batch_fin_table}`;
    let sql = `SELECT  COUNT(DISTINCT PLCCellID_CE )  AS result, 'PLCCellID_total_currday' AS type FROM ${batch_fin_table}`;

    //代表有一到二多期的機台需要REMARK做搜尋,若只有一台就不用加這段query
    if (!query_realtable.includes("assembly_realtime")) {
      //注液站
      if (
        query_realtable.includes("injection_realtime") ||
        query_realtable.includes("injection_realtime_2")
      ) {
        sql += ` where 1 = 1 AND REMARK like '${machineoption}' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' \
              UNION ALL SELECT COUNT(DISTINCT PLCCellID_CE ),'PLCCellID_total_accmount' FROM ${batch_fin_table}  where 1 = 1 AND REMARK like '${machineoption}'  AND TIME BETWEEN '${accmount_begindate}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' `;
      } //疊片站
      else if (query_realtable.includes("stacking_realtime")) {
        sql += ` where 1 = 1 AND Machine like '${machineoption}' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' \
        UNION ALL SELECT COUNT(DISTINCT PLCCellID_CE ),'PLCCellID_total_accmount' FROM ${batch_fin_table} where 1 = 1 AND Machine like '${machineoption}' AND TIME BETWEEN '${accmount_begindate}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' `;
      } else if (
        query_realtable.includes("seci_outport12") ||
        query_realtable.includes("chroma_outport123")
      ) {
        // 化成,分容機站
        sql = `SELECT count(DISTINCT Barcode) AS result, 'PLCCellID_total_currday' AS type FROM ${query_realtable} where Param like '${seci_chroma_sitetype}'  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != '' \
        UNION ALL SELECT count(DISTINCT Barcode),'PLCCellID_total_accmount' FROM ${query_realtable} where Param like '${seci_chroma_sitetype}'  AND TIME BETWEEN '${accmount_begindate}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != ''`;
      } else if (
        query_realtable.includes("cutting_realtime_c") ||
        query_realtable.includes("cutting_realtime_a")
      ) {
        //五金模切站
        //手工sql
        if (CuttingSum_MannulorAuto.indexOf("ManualInput") !== -1) {
          sql = `SELECT case WHEN SUM( ${CuttingSum_MannulorAuto} ) is NULL then '0' ELSE SUM( ${CuttingSum_MannulorAuto} ) END \
        ${Cuttingstatus_Amount_Num} ,'Cutting_shiftcurrent_M_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND ( ${CuttingSum_MannulorAuto} <> '' OR ${CuttingSum_MannulorAuto} <> 'NA' ) AND OKNGSelection = '${Cuttingstatus_quality}' and Caseno like '${check_Cathnod_Anode}' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'
        UNION ALL SELECT case WHEN SUM( ${CuttingSum_MannulorAuto} ) is NULL then '0' ELSE SUM( ${CuttingSum_MannulorAuto} ) END \
        ${Cuttingstatus_Amount_Num},'Cutting_accmount_M_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND ( ${CuttingSum_MannulorAuto} <> '' OR ${CuttingSum_MannulorAuto} <> 'NA' ) AND OKNGSelection = '${Cuttingstatus_quality}' and Caseno like '${check_Cathnod_Anode}' AND TIME BETWEEN '${accmount_begindate}' AND '${endoem_dt}'`;
        } //機器sql
        else if (CuttingSum_MannulorAuto.indexOf("Prdouction") !== -1) {
          sql = `SELECT case WHEN SUM( ${CuttingSum_MannulorAuto} ) is NULL then '0' ELSE SUM( ${CuttingSum_MannulorAuto} ) END \
        ${Cuttingstatus_Amount_Num} ,'Cutting_shiftcurrent_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND OKNGSelection = '${Cuttingstatus_quality}' and Caseno like '${check_Cathnod_Anode}' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'
        UNION ALL SELECT case WHEN SUM( ${CuttingSum_MannulorAuto} ) is NULL then '0' ELSE SUM( ${CuttingSum_MannulorAuto} ) END \
        ${Cuttingstatus_Amount_Num} ,'Cutting_accmount_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND OKNGSelection = '${Cuttingstatus_quality}' and Caseno like '${check_Cathnod_Anode}' AND TIME BETWEEN '${accmount_begindate}' AND '${endoem_dt}'`;
        }
      } else if (query_realtable.includes("beforeinjectionstage")) {
        sql = `
        SELECT count(DISTINCT CellNO) AS result,'edge_shiftclass_currday' AS type  FROM ${query_realtable}  where 1 = 1 AND stageid = '分選機前站'  AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND   Remark like '${machineoption}' AND remark IS NOT NULL AND remark != '' \
        UNION ALL SELECT count(DISTINCT CellNO),'edge_amount_begintoend_currday'  FROM ${query_realtable}  where 1 = 1 AND stageid = '分選機前站'  AND TIME BETWEEN '${accmount_begindate}'  AND '${endoem_dt}' AND   Remark like '${machineoption}' AND remark IS NOT NULL AND remark != ''
      `;
      }
    } else {
      //沒有REMARK用以下這段query
      sql += ` where 1 = 1  AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' \
            UNION ALL SELECT COUNT(DISTINCT PLCCellID_CE ),'PLCCellID_total_accmount' FROM ${batch_fin_table}  where 1 = 1 AND TIME BETWEEN '${accmount_begindate}'  AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' `;
    }

    // console.log("Debug sql = :" + sql);

    const capacitynum = await dbmes.query(sql);

    if (
      query_realtable.includes("seci_outport12") ||
      query_realtable.includes("chroma_outport123")
    ) {
      // productnum = capacitynum[0][0]["count(DISTINCT Barcode)"];
      productnum = capacitynum[0][0]["result"];
      mysql_accmountnum = capacitynum[0][1]["result"];
      console.log("化成分容產能 = " + productnum);
      console.log("化成分容累積產能 = " + mysql_accmountnum);
    } else if (
      query_realtable.includes("cutting_realtime_c") ||
      query_realtable.includes("cutting_realtime_a")
    ) {
      // productnum = capacitynum[0][0]["SUM(Prdouction)"];
      productnum = capacitynum[0][0][Cuttingstatus_Amount_Num];
      mysql_accmountnum = capacitynum[0][1][Cuttingstatus_Amount_Num];
      console.log("五金模切產能 = " + productnum);
      console.log("五金模切累積產能 = " + mysql_accmountnum);
    }
    // 精封產能計算
    else if (query_realtable.includes("beforeinjectionstage")) {
      productnum = capacitynum[0][0]["result"];
      mysql_accmountnum = capacitynum[0][1]["result"];
      console.log("精封機出料產能 = " + productnum);
      console.log("精封機出料累積產能 = " + mysql_accmountnum);
    } else {
      // productnum = capacitynum[0][0]["COUNT(DISTINCT PLCCellID_CE )"];
      productnum = capacitynum[0][0]["result"];
      mysql_accmountnum = capacitynum[0][1]["result"];
      // console.log("中段各站產能 = " + productnum);
      // console.log("中段累積各站產能 = " + mysql_accmountnum);
    }

    //計算MYSQL各站累積產能 起始日期條件 -> accmount_begindate (00:00:00)

    //mysql_accmountnum

    makeproduce_num = parseInt(productnum).toString();
    makeproduce_accumulation_num = parseInt(mysql_accmountnum).toString();

    //後續再讀取班表確認目前操作工號人員的組別
    const xls_taskID = equipmentID.toString().padStart(3, "0");
    confirm_group_xls(xls_taskID);

    //這邊只取組別即可,原先字串為(早A,早B,晚A,晚B)
    searchclass = searchclass.substring(1, searchclass.length);

    // console.log("操作機台姓名=" + searchclassname);

    //其餘各站

    results =
      makeproduce_num +
      "|" +
      searchclass.toString() +
      "|" +
      searchclassname.toString() +
      "|" +
      makeproduce_accumulation_num;

    console.log("MYSQL各站 results = " + results);

    res.status(200).send(results);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "groupname_capacitynum 取得資料錯誤",
    });
  }
});

//獨立MSSQL API request
router.get("/groupname_capacitynum_for_MSSQL", async (req, res) => {
  let results = "";
  let startoem_dt = "";
  let endoem_dt = "";
  let batch_fin_table = "";
  let capacitynum;
  let makeproduce_HT_num, makeproduce_RT_num;
  let makeproduce_HT_accmountnum, makeproduce_RT_accmountnum;
  let makeproduce_num;
  let sql;
  let accmount_begindate;

  const { equipmentID, shiftclass, machineoption, accmount_stdate } = req.query;
  // console.log("操作OP員工工號: " + equipmentID);
  // console.log("操作班別: " + shiftclass);
  // console.log("操作站點: " + machineoption);
  accmount_begindate = accmount_stdate.toString() + " 00:00:00";

  // console.log("查詢累積起始日期: " + accmount_begindate);

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

    // 高常溫站
    if (query_realtable.includes("ITFC_MES_UPLOAD_STATUS_TB")) {
      // sql = `select count(*) AS cell_HRT_product_num from ${query_realtable} where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between '${startoem_dt}' AND '${endoem_dt}' and BIN_CODE like '${machineoption}' and type=4 and BOX_BATT <> 'NANANANANANA'`;
      sql = `select cell_HRTAccmount_num
      FROM (
          select count(*) AS cell_HRTAccmount_num
        from ${query_realtable}
        where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') 
        between '${startoem_dt}' AND '${endoem_dt}'
        and BIN_CODE like '${machineoption}' 
        and type = 4 
        and BOX_BATT <> 'NANANANANANA'
          UNION ALL
        select count(*) AS cell_HRTAccmount_num
          from ${query_realtable}
        where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') 
        between '${accmount_begindate}' AND '${endoem_dt}'
        and BIN_CODE like '${machineoption}' 
        and type = 4 
        and BOX_BATT <> 'NANANANANANA'
      ) AS CombinedResults `;
    }

    // console.log("Debug sql = :" + sql);

    if (machineoption[machineoption.length - 1].match("%")) {
      Mssql_connectToASRS_HTBI(!strat, sql, false, 2);
    }

    // 高溫H.T站別
    if (check_HRTperiod.includes("H%")) {
      makeproduce_HT_num = parseInt(productnum_HT).toString();
      makeproduce_HT_accmountnum = parseInt(productnum_accmountHT).toString();

      console.log("高溫靜置總累積產能:" + makeproduce_HT_accmountnum);
    } //常溫R.T站別
    else if (
      check_HRTperiod.includes("N%") ||
      check_HRTperiod.includes("N2%")
    ) {
      makeproduce_RT_num = parseInt(productnum_RT).toString();
      makeproduce_RT_accmountnum = parseInt(productnum_accmountRT).toString();
      console.log("常溫靜置總累積產能:" + makeproduce_RT_accmountnum);
    }

    //後續再讀取班表確認目前操作工號人員的組別
    const xls_taskID = equipmentID.toString().padStart(3, "0");
    confirm_group_xls(xls_taskID);

    //這邊只取組別即可,原先字串為(早A,早B,晚A,晚B)
    searchclass = searchclass.substring(1, searchclass.length);

    //console.log("操作機台姓名=" + searchclassname);

    // 高溫H.T站別
    if (check_HRTperiod.includes("H%")) {
      results =
        makeproduce_HT_num +
        "|" +
        searchclass.toString() +
        "|" +
        searchclassname.toString() +
        "|" +
        makeproduce_HT_accmountnum;

      console.log("MSSQL專用-高溫H.T站別 results = " + results);
    } //常溫R.T站別
    else if (
      check_HRTperiod.includes("N%") ||
      check_HRTperiod.includes("N2%")
    ) {
      results =
        makeproduce_RT_num +
        "|" +
        searchclass.toString() +
        "|" +
        searchclassname.toString() +
        "|" +
        makeproduce_RT_accmountnum;

      console.log("MSSQL專用-常溫R.T站別 results = " + results);
    }

    res.status(200).send(results);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

module.exports = router;
