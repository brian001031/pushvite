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
const { machine } = require("os");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

//宣告站 realtime table 變數
let query_realtable;
let statusnum = "";
let productnum;
let mysql_accmountnum;
let realtimebatch_RT_Aging = [],
  amount_alldata = [];
let strat = true;
let startoem_dt = "";
let endoem_dt = "";
let productnum_RT,
  productnum_accmountRT,
  productnum_eveningRT,
  productnum_morningtRT,
  productnum_adjmountRT;

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

async function bindShiftInputsToRequest(request, shiftsclass) {
  for (let i = 0; i < shiftsclass.length; i++) {
    const startName = `shift${i + 1}_start`;
    const endName = `shift${i + 1}_end`;

    // 如果是字串且包含 'Z' (UTC標示)，就轉成當地時間 Date 物件
    const startVal =
      typeof shiftsclass[i][0] === "string" && shiftsclass[i][0].includes("Z")
        ? dayjs.utc(shiftsclass[i][0]).tz("Asia/Taipei").toDate()
        : shiftsclass[i][0];

    const endVal =
      typeof shiftsclass[i][1] === "string" && shiftsclass[i][1].includes("Z")
        ? dayjs.utc(shiftsclass[i][1]).tz("Asia/Taipei").toDate()
        : shiftsclass[i][1];

    // console.log(
    //   `Binding inputs: ${startName} = ${startVal}, ${endName} = ${endVal}`
    // );

    request.input(startName, ms_newsql.DateTime, startVal);
    request.input(endName, ms_newsql.DateTime, endVal);
  }

  return request;
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
}

async function Mssql_connectToASRS_HTBI(
  action,
  query,
  fulltime,
  mode,
  adjustdate
) {
  try {
    // 初始化連接池
    const pool = new ms_newsql.ConnectionPool(MS_dbConfig);
    let HRT_product_amountnum;
    let result_RT;
    let result_accumul_RT,
      result_evening_RT,
      result_morning_RT,
      result_adjust_RT;
    let RT_shiftnum, RT_acmountnum;

    // 建立連接池
    await pool.connect();
    // console.log("成功 Successfully connected to SQL Server!");

    //常溫靜置走這段
    // 使用 pool 進行查詢操作等
    if (parseInt(mode) === 1) {
      result_RT = await pool.request().query(query);
      // console.log("result_RT = " + JSON.stringify(result_RT));
    } else {
      //執行改班別和自訂日期選擇產能資訊
      const startDay = currentDate + " 00:00:00";
      const endDayToTranslate = currentDate + " 23:59:59";
      const yesterday = moment()
        .tz("Asia/Taipei")
        .subtract(1, "day")
        .format("YYYY-MM-DD");

      const todayMorning = `${currentDate} 08:00:00`;
      // 計算昨天晚上8點到今天早上8點的產能 (晚班)
      const yesterdayEvening = `${yesterday} 20:00:00`;
      // 計算今天早上8點到今天晚上8點的產能 (早班)
      const todayEvening = `${currentDate} 20:00:00`;

      // console.log(
      //   "startDay = " + startDay,
      //   "  endDayToTranslate = " + endDayToTranslate,
      //   "todayMorning = " + todayMorning,
      //   "yesterdayEvening = " + yesterdayEvening,
      //   "todayEvening = " + todayEvening,
      //   "adjustdate = " + adjustdate
      // );

      //全天產能
      result_accumul_RT = await pool
        .request()
        .input("startDay", ms_newsql.DateTime, new Date(startDay))
        .input("endDay", ms_newsql.DateTime, new Date(endDayToTranslate))
        .query(query);

      //晚班產能
      result_evening_RT = await pool
        .request()
        .input("startDay", ms_newsql.DateTime, new Date(yesterdayEvening))
        .input("endDay", ms_newsql.DateTime, new Date(todayEvening))
        .query(query);

      //早班產能
      result_morning_RT = await pool
        .request()
        .input("startDay", ms_newsql.DateTime, new Date(todayMorning))
        .input("endDay", ms_newsql.DateTime, new Date(todayEvening))
        .query(query);

      //自選擇日期產能(累加)
      result_adjust_RT = await pool
        .request()
        .input("startDay", ms_newsql.DateTime, new Date(adjustdate))
        .input("endDay", ms_newsql.DateTime, new Date(endDayToTranslate))
        .query(query);

      // console.log(
      //   "result_accumul_RT 常溫累積= " + JSON.stringify(result_accumul_RT)
      // );
    }

    /*取得最新工作序號row data , 當天(00:00：00 ~ 23:59:59:+生產量 */

    //高常溫倉都走以下判斷
    //取當天總資訊
    if (fulltime) {
      if (parseInt(mode) === 1) {
        //當天fulltime總生產量
        result_RT.recordsets[0].map((row, index) => {
          HRT_product_amountnum = row.cell_HRT_product_num;
          //   console.log(
          //     "HRT_product_amountnum = " + parseInt(HRT_product_amountnum)
          //   );
        });
        result_RT.recordsets[1].map((row) => {
          row.CREATE_TYPE = parseInt(HRT_product_amountnum);
          // console.log(row.CREATE_TYPE);
          // console.log(JSON.stringify(row));
        });
        // console.log(
        //   "result_RT.recordsets[1] = " + JSON.stringify(result_RT.recordsets[1])
        // );
        realtimebatch_RT_Aging.push({ batchtable: result_RT.recordsets[1] });
        return realtimebatch_RT_Aging;
      }
    }
    //取當前->總/班別(早晚)/累積 生產量
    else {
      if (parseInt(mode) === 2) {
        productnum_accmountRT = JSON.stringify(
          result_accumul_RT.recordset[0]["cell_RT_period_product_num"] || 0
        );

        productnum_eveningRT = JSON.stringify(
          result_evening_RT.recordset[0]["cell_RT_period_product_num"] || 0
        );

        productnum_morningtRT = JSON.stringify(
          result_morning_RT.recordset[0]["cell_RT_period_product_num"] || 0
        );

        productnum_adjmountRT = JSON.stringify(
          result_adjust_RT.recordset[0]["cell_RT_period_product_num"] || 0
        );

        amount_alldata.push({
          fulltime: productnum_accmountRT,
          selectedDayCapacity: productnum_adjmountRT,
          nightShiftCapacity: productnum_eveningRT,
          morningShiftCapacity: productnum_morningtRT,
        });

        return amount_alldata;

        // console.log(
        //   "productnum_accmountRT 全天產能 = " +
        //     parseInt(productnum_accmountRT) +
        //     "  " +
        //     "productnum_adjmountRT 調整累積產能 = " +
        //     parseInt(productnum_adjmountRT) +
        //     "  " +
        //     "productnum_eveningRT 晚班產能 = " +
        //     parseInt(productnum_eveningRT) +
        //     "  " +
        //     "productnum_morningtRT 早班產能 = " +
        //     parseInt(productnum_morningtRT) +
        //     "  "
        // );
      }
    }

    // 關閉連接池
    if (!action) {
      await pool.close();
    }
  } catch (err) {
    console.error("Error connecting to SQL Server:", err);
  }
}

// Define your routes here
router.get("/updatepage", async (req, res) => {
  const { machineoption } = req.query;
  console.log("常溫倉 machineoption接收為= " + machineoption);

  let sql; // 在 switch 語句外部定義 sql 變數
  let params = []; // 定義參數陣列

  try {
    //先行更新日期
    update_sysdatetime();

    //常溫靜置站執行->mssql
    if (machineoption[machineoption.length - 1].match("%")) {
      //因預設無realtime , 這邊臨時新增seci&chroma_realtime table 做後續回傳生產資訊用
      const sql_format_cap = "SELECT * FROM mes.`seci&chroma_realtime`";
      const [temp_equimentdata] = await dbmes.query(sql_format_cap);

      // 機器狀態 假資料
      statusnum = temp_equimentdata[0].MachineStatus;
      changeruntime_display(parseInt(statusnum));
      temp_equimentdata[0].MachineStatus = stringrunstatus;
      temp_equimentdata[0].OP = parseInt(111);

      //先手動更新測試
      realtimebatch_RT_Aging.length = 0; // 清空陣列
      realtimebatch_RT_Aging.push({
        realtable: temp_equimentdata,
      });

      //這邊需要做count計算目前產能: (該天日期 00:00:00 ~ 23:59:59)
      startoem_dt = currentDate + " 00:00:00";
      endoem_dt = currentDate + " 23:59:59";

      let sql2 = `select count(*) AS cell_HRT_product_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between '${startoem_dt}' AND '${endoem_dt}' \
                and BIN_CODE like '${machineoption}' and type=4 and BOX_BATT <> 'NANANANANANA'; 
                SELECT TOP 1 * FROM ITFC_MES_UPLOAD_STATUS_TB WHERE BIN_CODE LIKE '${machineoption}' ORDER BY ID DESC;`;
      // console.log("sql2 = " + sql2);

      //常溫靜置站執行->mssql query 當天full產能
      await Mssql_connectToASRS_HTBI(!strat, sql2, true, 1, "");

      //常溫R.T站別將機台資訊/生產量回傳前端
      //   console.log(
      //     "常溫靜置站別回傳機台資訊/生產量=" +
      //       realtimebatch_RT_Aging[1]?.batchtable?.[0]?.CREATE_TYPE
      //   );

      // console.log(
      //   "常溫靜置站別回傳機台資訊/生產量=" +
      //     JSON.stringify(realtimebatch_RT_Aging, null, 2)
      // );

      res.status(200).json(realtimebatch_RT_Aging);
    } else {
      res
        .status(400)
        .json({ error: `Invalid machine option format->${machineoption}` });
    }
  } catch (error) {
    console.error("Error in /updatepage:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/groupname_capacitynum", async (req, res) => {
  const { machineoption, endDay, memeID } = req.query;
  const machine_stack = Array.isArray(machineoption)
    ? machineoption
    : [machineoption];

  const sql_HTAging = `select count(*) as cell_RT_period_product_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between @startDay AND @endDay \
                and BIN_CODE like '${machine_stack}' and type=4 and BOX_BATT <> 'NANANANANANA'`;

  // console.log("machine_stack = " + JSON.stringify(machine_stack));
  // console.log("sql_HTAging = " + sql_HTAging);

  try {
    amount_alldata.length = 0;
    //先行更新日期
    update_sysdatetime();

    //常溫靜置站執行->mssql query 當天/班別/累積 全部產能
    await Mssql_connectToASRS_HTBI(!strat, sql_HTAging, false, 2, endDay);

    const sql_StaffName = `SELECT memberName FROM hr_memberinfo WHERE memberID = ? `;

    // 獲取員工姓名
    const [staffName1] = await db2.query(sql_StaffName, [memeID]);
    const name = staffName1[0].memberName || "待搜尋";

    amount_alldata.push({ staffName1: name });

    res.status(200).json([amount_alldata]);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

//收集全機台當天生產產能數據回傳前端
router.get("/fullmachinecapacity", async (req, res) => {
  const { currentDay } = req.query;

  const startDay = currentDay + " 00:00:00";
  const endDayToTranslate = currentDay + " 23:59:59";

  const current = dayjs(currentDay);
  const previousDay = current.subtract(1, "day").format("YYYY-MM-DD");
  const nextDay = current.add(1, "day").format("YYYY-MM-DD");

  // 時間點 定義 (昨晚8點~今早8點,今早8點~今晚8點,今晚8點~明早8點)
  const lastnightStart = previousDay + " 20:00:00";
  const morningStart = currentDay + " 08:00:00";
  const morningEnd = currentDay + " 20:00:00";
  const nextnightEnd = nextDay + " 08:00:00";

  const shifts = [
    [lastnightStart, morningStart],
    [morningStart, morningEnd],
    [morningEnd, nextnightEnd],
  ];

  // console.log("shifts = " + JSON.stringify(shifts, null, 2));

  // console.log(
  //   "常溫站接收req param:" + "startDay = " + startDay,
  //   "endDayToTranslate = " + endDayToTranslate
  // );

  const sql_RTAging_all = `
                      SELECT 
                        COUNT(CASE WHEN BIN_CODE LIKE 'N%'  THEN 1 END) AS 常溫一期,
                        COUNT(CASE WHEN BIN_CODE LIKE 'N2%' THEN 1 END) AS 常溫二期,
                        COUNT(CASE WHEN BIN_CODE LIKE 'N%' THEN 1 END) + COUNT(CASE WHEN BIN_CODE LIKE 'N2%' THEN 1 END) AS 常溫當天總產能
                      FROM ITFC_MES_UPLOAD_STATUS_TB
                      WHERE 
                        TYPE = 4
                        AND BOX_BATT <> 'NANANANANANA'
                        AND REPLACE(CONVERT(NVARCHAR(100), create_date, 120), '.', '-') BETWEEN @startDay AND @endDay;
                    `;

  // const sql_RTAging_all = `
  //                     SELECT
  //                       SUM(CASE WHEN BIN_CODE LIKE 'N%' THEN 1 ELSE 0 END) AS 常溫一期,
  //                       SUM(CASE WHEN BIN_CODE LIKE 'N2%' THEN 1 ELSE 0 END) AS 常溫二期,
  //                       -- 修改這裡，將條件中的 'N%' 和 'N2%' 合併，確保涵蓋所有相關的 N 範圍
  //                       SUM(CASE WHEN BIN_CODE LIKE 'N%' THEN 1 ELSE 0 END) +
  //                       SUM(CASE WHEN BIN_CODE LIKE 'N2%' THEN 1 ELSE 0 END) AS 常溫當天總產能
  //                     FROM ITFC_MES_UPLOAD_STATUS_TB
  //                     WHERE
  //                       REPLACE(CONVERT(NVARCHAR(100), create_date, 120), '.', '-') BETWEEN @startDay AND @endDay
  //                       AND TYPE = 4
  //                       AND BOX_BATT <> 'NANANANANANA';
  //                   `;

  //計算各班別(昨晚班/今早班/今晚班)產能SQL範本
  const sql_RTAging_shifts = `
                              SELECT 
                                -- 夜班
                                COUNT(CASE
                                        WHEN replace(convert(nvarchar(100),create_date,120),'.','-') 
                                        BETWEEN @shift1_start AND @shift1_end
                                            AND (BIN_CODE LIKE 'N%' OR BIN_CODE LIKE 'N2%')
                                        THEN 1
                                      END) AS lastnight_total_capacity,

                                -- 早班
                                COUNT(CASE
                                        WHEN replace(convert(nvarchar(100),create_date,120),'.','-') 
                                        BETWEEN @shift2_start AND @shift2_end
                                            AND (BIN_CODE LIKE 'N%' OR BIN_CODE LIKE 'N2%')
                                        THEN 1
                                      END) AS todaymorning_total_capacity,

                                -- 晚班
                                COUNT(CASE
                                        WHEN replace(convert(nvarchar(100),create_date,120),'.','-') 
                                        BETWEEN @shift3_start AND @shift3_end
                                            AND (BIN_CODE LIKE 'N%' OR BIN_CODE LIKE 'N2%')
                                        THEN 1
                                      END) AS todayevening_total_capacity
                              FROM ITFC_MES_UPLOAD_STATUS_TB
                              WHERE 
                                TYPE = 4
                                AND BOX_BATT <> 'NANANANANANA'
                                OPTION (RECOMPILE)`;

  try {
    const RtAging_dt_range_result = {};
    // 初始化連接池
    const pool = new ms_newsql.ConnectionPool(MS_dbConfig);
    let result_accumulAll_RT;

    // 建立連接池
    await pool.connect();

    //全天產能(1期,2期,總加)
    result_accumulAll_RT = await pool
      .request()
      .input("startDay", ms_newsql.DateTime, new Date(startDay))
      .input("endDay", ms_newsql.DateTime, new Date(endDayToTranslate))
      .query(sql_RTAging_all);

    console.log(result_accumulAll_RT.recordset[0]); // 返回查詢結果，包含 N_count, N2_count, total_count

    //班別產能查詢區段(昨晚8點~今早8點,今早8點~今晚8點,今晚8點~明早8點)
    let request_shifts = pool.request();
    request_shifts = await bindShiftInputsToRequest(request_shifts, shifts);

    // console.log("sql_RTAging_shifts = " + sql_RTAging_shifts);

    // 執行查詢
    const result_amount_shifts = await request_shifts.query(sql_RTAging_shifts);

    console.log("常溫站各班別產能:");
    console.log(result_amount_shifts.recordset[0]); // 返回查詢結果，包含 各班別產能

    Object.entries(result_amount_shifts.recordset[0]).forEach(
      ([key, value], idx) => {
        let phase = "";
        const item = JSON.stringify(key, null, 2).replace(
          "_total_capacity",
          ""
        );

        if (item.includes("lastnight")) {
          //phase = "常溫倉昨晚班產能";
          phase = "昨晚班";
        } else if (item.includes("todaymorning")) {
          phase = "今早班";
        } else if (item.includes("todayevening")) {
          phase = "今晚班";
        }

        const keyitem = `常溫(一二期)站-${phase}總產能`;
        RtAging_dt_range_result[keyitem] = value;
      }
    );

    //關閉 disconnect to SQL Server
    await pool.close();

    res.status(200).json({
      data: result_accumulAll_RT.recordset[0],
      Total_capacity_shift: RtAging_dt_range_result,
    });
  } catch (err) {
    console.error("Error connecting to SQL Server:", err);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

module.exports = router;
