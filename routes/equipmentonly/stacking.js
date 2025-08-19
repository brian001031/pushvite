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

const currentDate = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
const startoem_dt = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss"); // 今天 00:00:00
const endoem_dt = moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"); // 今天 23:59:59

let stringrunstatus = "";

let Stack_machine_list = [
  //因原先1,2號機傳接系統異常,目前不顯示狀態,從原先3號機開始,length -2
  ...Array.from({ length: 7 }, (_, i) => `Stack${i + 3}`),
  ...Array.from({ length: 3 }, (_, i) => `Stack-${i + 1}`),
];

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
}

router.get("/updatepage", async (req, res) => {
  const { machineoption } = req.query;
  // console.log("machineoption接收為= " + machineoption);

  let sql; // 在 switch 語句外部定義 sql 變數
  let params = []; // 定義參數陣列

  //疊片機走這段
  if (machineoption.toString().includes("Stack")) {
    //目前2期機器選單會多一個 '-'分隔,不同廠商
    const dashcheck = machineoption.includes("-");

    const numberresult = machineoption.match(/\d+/); // 匹配字串中的所有數字
    const isValidnum = parseInt(numberresult[0]);
    //原先
    if (!dashcheck && isValidnum >= 1 && isValidnum <= 9) {
      sql = `SELECT * FROM stacking_realtime where MachineName like ? ORDER BY ID DESC limit 1`;
    } //新廠商 信力特2期
    else if (dashcheck && isValidnum >= 1) {
      sql = `SELECT * FROM stacking2_batch where Machine like ? ORDER BY ID DESC limit 1`;
    } else {
      sql = `SELECT * FROM stacking_realtime ORDER BY ID DESC limit 1`;
    }
    params = [machineoption];
  }

  let sqlSearchName = `SELECT memberName FROM hr.hr_memberinfo WHERE memberID = ?`;

  try {
    const [rows] = await dbmes.query(sql, params);

    const row = rows[0];

    //預設2 (IDLE)
    changeruntime_display(parseInt(rows?.[0]?.MachineStatusCode ?? "2"));
    rows[0].MachineStatusCode = stringrunstatus;

    const OPNumber = String(rows?.[0]?.OPNO ?? "-1").trim();

    const [searchName] = await db2.query(sqlSearchName, OPNumber);
    row.opName = searchName.length > 0 ? searchName[0].memberName : "待更新";

    res.status(200).json(rows);
  } catch (error) {
    console.error("Error in /updatepage:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/groupname_capacitynum", async (req, res) => {
  const { machineoption, endDay } = req.query;
  const machine_stack = Array.isArray(machineoption)
    ? machineoption
    : [machineoption];

  //console.log("machine_stack 結構為= " + typeof machine_stack, machine_stack);

  const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  const startDay = currentDay + " 00:00:00";
  const endDayToTranslate = currentDay + " 23:59:59";

  // console.log(startDay + "  " + endDayToTranslate);

  //目前2期機器選單會多一個 '-'分隔,不同廠商
  const dashcheck = machineoption.includes("-");

  const stacking_runbat =
    dashcheck === true ? "stacking2_batch" : "stacking_batch";

  // 當日產能查詢
  let sql = `
          SELECT 
            Machine,
            COUNT(DISTINCT CASE 
                    WHEN PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' 
                    THEN PLCCellID_CE 
               END) AS PLCCellID_CE_makenum
            FROM mes.${stacking_runbat}
            WHERE Machine IN (?)
              AND TIME BETWEEN ? AND ?
            GROUP BY Machine
            ORDER BY Machine
            `;

  //console.log("sql = " + sql);

  try {
    // 計算總體產能
    const [rowsToday] = await db2.query(sql, [
      machine_stack,
      startDay,
      endDayToTranslate,
    ]);
    const [rows] = await db2.query(sql, [
      machine_stack,
      endDay,
      endDayToTranslate,
    ]);

    const todayRow = rowsToday.find((row) => row.Machine === machineoption);
    const totalRow = rows.find((row) => row.Machine === machineoption);

    const todayMakenum = todayRow?.PLCCellID_CE_makenum ?? 0;
    const amountMakenum = totalRow?.PLCCellID_CE_makenum ?? 0;

    // // 計算昨天晚上8點到今天早上8點的產能 (晚班)
    const yesterday = moment()
      .tz("Asia/Taipei")
      .subtract(1, "day")
      .format("YYYY-MM-DD");
    const yesterdayEvening = `${yesterday} 20:00:00`;
    const todayMorning = `${currentDay} 08:00:00`;
    const [nightShiftRows] = await db2.query(sql, [
      machine_stack,
      yesterdayEvening,
      todayMorning,
    ]);
    // 計算今天早上8點到今天晚上8點的產能 (早班)
    const todayEvening = `${currentDay} 20:00:00`;
    const [morningShiftRows] = await db2.query(sql, [
      machine_stack,
      todayMorning,
      todayEvening,
    ]);

    const nightRow = nightShiftRows.find(
      (row) => row.Machine === machineoption
    );
    const morningRow = morningShiftRows.find(
      (row) => row.Machine === machineoption
    );

    const nightMakenum = nightRow?.PLCCellID_CE_makenum ?? 0;
    const morningMakenum = morningRow?.PLCCellID_CE_makenum ?? 0;

    // console.log("今日產能: 疊片機(" + machineoption + ")-> " + todayMakenum);
    // console.log("累積產能: 疊片機(" + machineoption + ")-> " + amountMakenum);
    // console.log("晚班產能: 疊片機(" + machineoption + ")-> " + nightMakenum);
    // console.log("早班產能: 疊片機(" + machineoption + ")-> " + morningMakenum);

    const dataToSend = {
      todayCapacity_result: todayMakenum,
      amountCapacity_result: amountMakenum,
      nightShiftDayCapacity_result: nightMakenum,
      morningShiftDayCapacity_result: morningMakenum,
    };

    // console.log("最後回傳前端: " + JSON.stringify(dataToSend, null, 2));

    res.status(200).json([dataToSend]);
  } catch (error) {
    console.error("Error in /groupname_capacitynum:", error);
    res.status(500).send("Internal Server Error");
  }
});

//收集全機台當天生產產能數據回傳前端
router.get("/fullmachinecapacity", async (req, res) => {
  const { currentDay } = req.query;

  const startDay = currentDay + " 00:00:00";
  const endDayToTranslate = currentDay + " 23:59:59";

  // const machineSubQuery = Stack_machine_list.map((name, index) => {
  //   // return index === 0
  //   //   ? `SELECT '${name}' AS Machine`
  //   //   : `UNION ALL SELECT '${name}'`;

  //   //多新增信力特2期機台判斷如下
  //   const isDash = name.includes("-");
  //   const tableName = isDash ? "stacking2_batch" : "stacking_batch";
  //   return `
  //     SELECT
  //       '${name}' AS Machine,
  //       COUNT(DISTINCT CASE
  //         WHEN s.PLCCellID_CE IS NOT NULL AND s.PLCCellID_CE != ''
  //         THEN s.PLCCellID_CE
  //       END) AS PLCCellID_CE_makenum
  //     FROM (
  //       SELECT '${name}' AS MachineName
  //     ) AS m
  //     LEFT JOIN mes.${tableName} s
  //       ON s.Machine = m.MachineName
  //       AND s.TIME BETWEEN ? AND ?
  //   `;
  // });

  // 動態產生 Stacking machine_list（含來源資料表）, 動態組成 SQL 子查詢
  const machineSubQuery = Stack_machine_list.map((name, idx) => {
    //多新增信力特2期機台判斷如下
    const table = name.includes("-") ? "stacking2_batch" : "stacking_batch";
    const prefix = idx === 0 ? "" : "UNION ";
    return `${prefix}SELECT '${name}' AS MachineName, '${table}' AS SourceTable`;
  }).join("\n");

  const orderByClause = `
  ORDER BY
    CASE
      ${Stack_machine_list.map(
        (name, idx) => `WHEN Machine = '${name}' THEN ${idx + 1}`
      ).join("\n      ")}
      ELSE 99
    END
`;

  try {
    if (currentDay) {
      const stack_result = {};
      //目前疊片站有1~9機台
      // 當日產能查詢
      let sqlAll = `WITH machine_list AS (
                      ${machineSubQuery}
                    ),
                    all_batches AS (
                    SELECT 
                      Machine,
                      PLCCellID_CE,
                      TIME
                    FROM mes.stacking_batch
                    WHERE TIME BETWEEN ? AND ?
                    UNION ALL
                    SELECT 
                      Machine,
                      PLCCellID_CE,
                      TIME
                    FROM mes.stacking2_batch
                    WHERE TIME BETWEEN ? AND ?
                  ),
                  aggregated AS (
                    SELECT
                      ml.MachineName AS Machine,
                      COUNT(DISTINCT CASE 
                        WHEN ab.PLCCellID_CE IS NOT NULL AND ab.PLCCellID_CE != '' 
                        THEN ab.PLCCellID_CE 
                      END) AS PLCCellID_CE_makenum
                    FROM machine_list ml
                    LEFT JOIN all_batches ab
                      ON ml.MachineName = ab.Machine
                    GROUP BY ml.MachineName
                  )
                  SELECT * FROM aggregated
                  UNION ALL
                  SELECT 'TotalSum' AS Machine, SUM(PLCCellID_CE_makenum) FROM aggregated                 
                  ORDER BY
                   CASE WHEN Machine = 'TotalSum' THEN 2 ELSE 1 END,
                   Machine;
                  `;
      //要排序
      //${orderByClause};

      //不排序
      // ORDER BY
      //   CASE WHEN Machine = 'TotalSum' THEN 2 ELSE 1 END,
      //   Machine;

      // 🔁 為每個 stack 加入對應時間參數
      const params = [
        startDay,
        endDayToTranslate, // for stacking_batch
        startDay,
        endDayToTranslate, // for stacking2_batch
      ];

      // 為每個 stack 加入對應時間參數（共 10 台，每台 2 個參數）,Stack_machine_list.length × 2 個參數，例如你有 10 台機台就會變成：
      //[startTime, endTime, startTime, endTime, ..., 10 次],會爆掉
      // const params = Stack_machine_list.flatMap(() => [
      //   startDay,
      //   endDayToTranslate,
      // ]);

      // 計算疊片站全機器,當天全部產能
      const [rows_fullmachine] = await db2.query(sqlAll, params);

      // console.log(
      //   "計算疊片站各機台當天全產能數據列為: " +
      //     JSON.stringify(rows_fullmachine, null, 2)
      // );

      rows_fullmachine.forEach((item, index) => {
        //計算全部機台總產能
        if (index === rows_fullmachine.length - 1) {
          const key = `疊片機台總產能`;
          stack_result[key] = item.PLCCellID_CE_makenum;
        } else {
          const stackNumber = parseInt(item.Machine.replace("Stack", ""));
          const dashcheck = item.Machine.toString().includes("-");
          const phase = dashcheck
            ? "疊片二期新機台"
            : index < 6
            ? "疊片一期機台"
            : "疊片二期機台";

          const key = `${phase}${stackNumber}`;
          stack_result[key] = item.PLCCellID_CE_makenum;
        }
      });

      // console.log(
      //   "計算疊片站各機台當天全產能數據列為:" +
      //     JSON.stringify(stack_result, null, 2)
      // );

      res.status(200).json({
        data: stack_result,
      });
    }
  } catch (error) {
    console.error("Error in /groupname_capacitynum:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
