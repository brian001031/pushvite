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
const dayjs = require("dayjs");
const e = require("express");
const { url } = require("inspector");

const currentDate = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
const startoem_dt = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss"); // 今天 00:00:00
const endoem_dt = moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"); // 今天 23:59:59

let stringrunstatus = "";
let searchclass = "";
let searchclassname = "";

// 支援多種符號分割（包含 / ／ 、 | ， , － 空白）
// const filter_split_flag = /[\/／\\、|，,－\s]+/;
// 支援分隔符：/ ／ | 、 （不包含逗號！）
const filter_split_flag = /[\/／|、－]+/;

//關鍵字前綴比對清單,符合就視為相同狀態
const prefixMatchKeys = ["阻值計算失敗,有空值導致"];

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

function checkPrefixMatch(error_item, message, prefixKeys) {
  const enable = prefixKeys.some((p) => error_item.includes(p));
  return enable && prefixKeys.some((p) => message.startsWith(p));
}

function normalizeText(str) {
  if (!str) return "";
  return (
    str
      // 全形轉半形（Full-width → Half-width）
      .replace(/[\uFF01-\uFF5E]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
      )
      // 全形空白 → 半形空白
      .replace(/\u3000/g, " ")
      // 移除多餘空白
      .trim()
    // 全部轉小寫
    // .toLowerCase()
  );
}

async function parseErrorLog(ng_status, ng_select_date) {
  const ng_log_file = process.env.sulting_errorfile;
  const alldata = fs.readFileSync(ng_log_file, "utf-8");
  const sections = alldata.split(/-{5,}結束-{5,}/).filter(Boolean); //過濾空白項目
  const dateSet = new Set(); //  用來蒐集有NG紀錄的日期
  const results = [];

  // ✅ 分隔多符號支援（- , \ ／ 、 | ， －）
  const ngArray = Array.isArray(ng_status)
    ? ng_status
    : typeof ng_status === "string"
    ? ng_status
        .split(filter_split_flag)
        .map((s) => normalizeText(s))
        .filter(Boolean)
    : [];

  //只將有錯誤訊息的行記錄下來
  sections.forEach((section) => {
    const dateMatch = section.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}/);
    const date = dateMatch ? dateMatch[1] : null;
    const date_add_calendar = dateMatch
      ? moment(dateMatch[1], "YYYY-MM-DD").format("YYYY-MM-DD")
      : null;

    if (!date) return; //無日期則跳過

    //確認選單或是日期篩選條件
    const nodateFilter = ng_select_date.trim() === "" || !ng_select_date;

    // 年月日篩選條件
    const dateFilter =
      date_add_calendar &&
      date_add_calendar === ng_select_date.trim() &&
      ng_select_date.trim() !== ""
        ? true
        : false;

    // if (ng_select_date && ng_select_date.trim() !== "" && !dateFilter) {
    //   return; // 若有指定篩選日期且不符合，則跳過
    // } else {
    //   console.log("符合篩選日期條件結果 = " + dateFilter);
    //   console.log("符合篩選日期條件 date_add_calendar = " + date_add_calendar);
    // }

    //異常檔案列蒐集
    const fileLines = section.match(/([A-Z0-9_]+\.csv)\s+(.+)/g);

    if (fileLines) {
      fileLines.forEach((line) => {
        const [filename, message] = line.split(/\s+(.+)/);

        //模糊比對：正規化 message
        const normalizedMsg = normalizeText(message);

        // 🔹 若啟用前綴比對，才檢查 normalizedMsg 是否以該前綴開頭
        const isPrefixMatch = checkPrefixMatch(
          ngArray,
          normalizedMsg,
          prefixMatchKeys
        );

        // 判斷完整匹配
        const isFullMatch = ngArray.find((key) => normalizedMsg === key);

        // 若有指定篩選日期且不符合，則跳過
        // if (!nodateFilter && !dateFilter) {
        //   return;
        // }

        // 若 ngArray 為空，則不篩選，全部加入結果 或符合篩選條件的加入結果
        if (isPrefixMatch || ngArray.includes("All全部") || isFullMatch) {
          // if (isPrefixMatch) console.log("前綴匹配成功: " + normalizedMsg);
          dateSet.add(date_add_calendar);
          results.push({
            date,
            filename,
            error_status: normalizedMsg || "未制定狀態 (前綴匹配)",
          });
          // return; // 已匹配前綴，跳過後續判斷
        }
      });
    }
  });

  return {
    allinfo: results, // 符合條件的錯誤紀錄
    log_date: Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b)), // 所有出現過的日期(最早到最新)
  };
}

router.get("/updatepage", async (req, res) => {
  const { machineoption } = req.query;
  console.log("32分選判別->參數選單接收為= " + machineoption);

  if (!machineoption || machineoption === undefined || machineoption === null) {
    console.error("機台選項未提供");
    return res.status(400).send("Invalid machine option");
  }

  let sql =
    "SELECT * FROM mes.testmerge_cc1orcc2 WHERE parameter LIKE ? order by id DESC limit 1";
  let params = ["017"]; // 定義分選參數

  let sqlSearchName = `SELECT memberName FROM hr.hr_memberinfo WHERE memberID = ?`;
  try {
    // console.log("SQL查詢語句= " + mysql.format(sql, params));
    const [results_rows] = await dbmes.query(sql, params);

    changeruntime_display(
      parseInt(results_rows?.[0]?.MachineStatusCode ?? "2")
    );
    results_rows[0].MachineStatusCode = stringrunstatus;

    const OPNumber = String(results_rows?.[0]?.OPNO ?? "007").trim();
    results_rows[0].OPNO = OPNumber;

    const [searchName] = await db2.query(sqlSearchName, OPNumber);
    results_rows[0].OpName =
      searchName.length > 0 ? searchName[0].memberName : "待更新";

    // console.log("查詢結果= ", JSON.stringify(results_rows[0], null, 2));

    res.status(200).json(results_rows);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

router.get("/groupname_capacitynum", async (req, res) => {
  const { equipmentID, shiftclass, machineoption, accmount_stdate } = req.query;

  // console.log(
  //   `分選判別->參數接收為= equipmentID: ${equipmentID}, shiftclass: ${shiftclass}, machineoption: ${machineoption}, accmount_stdate: ${accmount_stdate}`
  // );

  let machine_sulting = Array.isArray(machineoption)
    ? machineoption
    : [machineoption];

  machine_sulting[0] = machineoption;

  //理想為有前綴"分選判別"中文字需要filter不考慮
  const sulting_keyword = machine_sulting[0].match(/[^\u4E00-\u9FA5]/g);

  //無CC1或CC2關鍵字則回傳錯誤
  if (!sulting_keyword) {
    return res.status(400).json({ message: "無效的機台選項" });
  }

  machine_sulting[0] = sulting_keyword.join("");

  //   console.log("分選機台關鍵字為= " + machine_sulting[0]);

  const sulting_parameter = machine_sulting[0] === "CC2" ? "017" : "010"; // 根據關鍵字設定參數

  const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  const startDay = currentDay + " 00:00:00";
  const endDayToTranslate = currentDay + " 23:59:59";

  // console.log("查詢日期區間為= " + startDay + " ~ " + endDayToTranslate);

  //當日產能查詢
  let sql = `SELECT COUNT(DISTINCT modelId) as 'Sulting_total_sum'
           FROM mes.testmerge_cc1orcc2
           WHERE parameter LIKE ?
           AND STR_TO_DATE(
            CONCAT(
              SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
              SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
              CASE 
                WHEN EnddateD LIKE '%上午%' THEN 'AM'
                WHEN EnddateD LIKE '%下午%' THEN 'PM'
                ELSE ''
              END
            ),
            '%Y/%m/%d %I:%i:%s %p') BETWEEN ? AND ?`;

  try {
    const [results_All] = await dbmes.query(sql, [
      sulting_parameter,
      startDay,
      endDayToTranslate,
    ]);

    //自定義查詢某日到今日結束產能
    const [results_end] = await dbmes.query(sql, [
      sulting_parameter,
      accmount_stdate,
      endDayToTranslate,
    ]);

    const Sulting_CrrentDay_sum = results_All[0]?.Sulting_total_sum || 0;
    const Sulting_end_sum = results_end[0]?.Sulting_total_sum || 0;

    // // 計算昨天晚上8點到今天早上8點的產能 (晚班)
    const yesterday = moment()
      .tz("Asia/Taipei")
      .subtract(1, "day")
      .format("YYYY-MM-DD");
    const yesterdayEvening = `${yesterday} 20:00:00`;
    const todayMorning = `${currentDay} 08:00:00`;
    const [nightShiftRows] = await dbmes.query(sql, [
      sulting_parameter,
      yesterdayEvening,
      todayMorning,
    ]);
    // 計算今天早上8點到今天晚上8點的產能 (早班)
    const todayEvening = `${currentDay} 20:00:00`;
    const [morningShiftRows] = await dbmes.query(sql, [
      sulting_parameter,
      todayMorning,
      todayEvening,
    ]);

    const Sulting_nightShift_sum = nightShiftRows[0]?.Sulting_total_sum || 0;
    const Sulting_morningShift_sum =
      morningShiftRows[0]?.Sulting_total_sum || 0;

    const dataToSend = {
      todayCapacity_result: Sulting_CrrentDay_sum,
      amountCapacity_result: Sulting_end_sum,
      nightShiftDayCapacity_result: Sulting_nightShift_sum,
      morningShiftDayCapacity_result: Sulting_morningShift_sum,
      searchclass: searchclass,
    };

    // console.log(
    //   `分選產能(${machine_sulting[0]}-${sulting_parameter})資料回傳= `,
    //   JSON.stringify(dataToSend, null, 2)
    // );

    //後續再讀取班表確認目前操作工號人員的組別
    const xls_taskID = equipmentID.toString().padStart(3, "0");
    confirm_group_xls(xls_taskID);

    res.status(200).json([dataToSend]);
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

  const datetime_range_Sql = shifts
    .map(([start, end], idx) => {
      // return `WHEN TIME BETWEEN '${start}' AND '${end}' THEN '${start}~${end}'`; 原先寫法

      //shift 時間區段表（time_ranges），來實作「查無資料時預設為 0」
      const label = `${start}~${end}`; // or `Shift ${idx + 1}` if you prefer
      return `SELECT '${label}' AS time_range, '${start}' AS start_time, '${end}' AS end_time`;
    })
    .join("\nUNION ALL\n");

  //cross join：time_ranges × Selection (class/normal)
  //再 left join 分選判別實際生產資料
  //最後 group by 時段與 class/normal 來確保每個時段都有資料，沒有的話就補 0
  const CC1ANDCC2_Sulting_shift_SQL = `
    WITH time_ranges AS (
      ${datetime_range_Sql}
    ),
    already_select AS (
      SELECT 'class' AS Selection
      UNION ALL
      SELECT 'normal'
    ),
    machine_list AS (
      SELECT 'CC1' AS Machine
      UNION ALL
      SELECT 'Sulting_CC2'
    ),
    Sulting_Base_Case AS (
      SELECT
        Time,
        Machine,
        Selection,
        COUNT(DISTINCT modelId) AS Total_Count
        FROM (
          SELECT
            STR_TO_DATE(
              CONCAT(
                SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
                SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                CASE 
                  WHEN EnddateD LIKE '%上午%' THEN 'AM'
                  WHEN EnddateD LIKE '%下午%' THEN 'PM'
                  ELSE ''
                END
              ),
              '%Y/%m/%d %I:%i:%s %p'
            ) AS Time,
            CASE 
              WHEN parameter LIKE '010' THEN 'CC1'
              WHEN parameter LIKE '017' THEN 'Sulting_CC2'
            END AS Machine,
            CASE
              WHEN parameter IN ('017') THEN 'class'
              ELSE 'normal'
            END AS Selection,
            modelId
          FROM mes.testmerge_cc1orcc2
        ) AS derived
        WHERE Time BETWEEN '${shifts[0][0]}' AND '${
    shifts[shifts.length - 1][1]
  }'
      GROUP BY Time, Machine
    ),
    range_with_dir AS (
      SELECT tr.time_range, tr.start_time, tr.end_time, m.Machine 
      FROM time_ranges tr
      CROSS JOIN machine_list m
    ),
    -- 統計每個區間 + 機台 + 班別的總和
    joined_data AS (
      SELECT 
        rwd.time_range,        
        rwd.Machine,
        IFNULL(SUM(b.Total_Count), 0) AS Case_Sulting_Sum
      FROM range_with_dir rwd
      LEFT JOIN Sulting_Base_Case b       
        ON b.Time BETWEEN rwd.start_time AND rwd.end_time       
        AND b.Machine = rwd.Machine
      GROUP BY rwd.time_range, rwd.Machine 
    )
    SELECT
      time_range,
      Machine,
      Case_Sulting_Sum
    FROM joined_data    
    ORDER BY time_range, Machine;
      `.trim();

  try {
    const sulting_result = {};
    const sulting_dt_range_result = {};
    //目前分選判別站有1~2機台
    // 當日產能查詢
    let sqlAll = `
                   WITH Machines AS (
                     SELECT 'CC1' AS Machine
                     UNION ALL
                     SELECT 'Sulting_CC2'
                  ),				
		              Production AS 
                    (
                    SELECT 
                      CASE 
                          WHEN parameter LIKE '010' THEN 'CC1'
                          WHEN parameter LIKE '017' THEN 'Sulting_CC2'
                      END AS Machine,
                          COUNT(DISTINCT modelId) as 'Sulting_Total_Sum'
                      FROM mes.testmerge_cc1orcc2 
                      WHERE STR_TO_DATE(
                      CONCAT(
                        SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
                        SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                        CASE 
                        WHEN EnddateD LIKE '%上午%' THEN 'AM'
                        WHEN EnddateD LIKE '%下午%' THEN 'PM'
                        ELSE ''
                        END
                      ),
                      '%Y/%m/%d %I:%i:%s %p') BETWEEN ? AND ?				                       
                    group by Machine
                    )                                           
                    SELECT 
                        m.Machine,
                        COALESCE(p.Sulting_Total_Sum, 0) AS Sulting_Total_Sum
                    FROM Machines m
                    LEFT JOIN Production p ON m.Machine = p.Machine
                    ORDER BY m.Machine;
                    `;

    // 計算分選判別站全機器,當天全部產能
    const [rows_fullmachine] = await db2.query(sqlAll, [
      startDay,
      endDayToTranslate,
    ]);

    console.log(
      "計算分選判別站各機台當天全產能數據列為: " +
        rows_fullmachine.length +
        JSON.stringify(rows_fullmachine, null, 2)
    );

    rows_fullmachine.forEach((item, index) => {
      const SulNumber = parseInt(item.Machine.replace(/[^\d]/g, ""));

      //確認為數字格式
      const sidealias =
        !isNaN(SulNumber) && SulNumber === 2 ? "32分選判別類" : "尚未分選類";
      const key = `${sidealias}-CC${SulNumber}`;
      sulting_result[key] = item.Sulting_Total_Sum;
    });

    // console.log("計算sulting班別產能 sql = " + CC1ANDCC2_Sulting_shift_SQL);

    //計算各(昨晚,今早,今晚)時段產能
    const [rows_sulting_shift] = await dbmes.query(CC1ANDCC2_Sulting_shift_SQL);

    // console.log(JSON.stringify(rows_Oven_shift, null, 2));

    if (!rows_sulting_shift || rows_sulting_shift.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for sulting shifts" });
    }

    // console.log(
    //   "計算分選判別站各機台班別區間產能數據列為:" +
    //     JSON.stringify(rows_sulting_shift, null, 2)
    // );

    // console.log(
    //   "計算分選判別站各機台當天全產能數據列為:" +
    //     JSON.stringify(sulting_result, null, 2)
    // );

    rows_sulting_shift.forEach((item, index) => {
      let phase = "";
      if (index <= 1) {
        item.Machine === "CC1"
          ? (phase = "昨晚班尚未分類CC1")
          : (phase = "昨晚班32類判選CC2");
      } else if (index > 1 && index <= 3) {
        item.Machine === "CC1"
          ? (phase = "今早班尚未分類CC1")
          : (phase = "今早班32類判選CC2");
      } else {
        item.Machine === "CC1"
          ? (phase = "今晚班尚未分類CC1")
          : (phase = "今晚班32類判選CC2");
      }

      const key = `分選判別站-${phase}產能`;
      sulting_dt_range_result[key] = item?.Case_Sulting_Sum ?? 0;
    });

    res.status(200).json({
      data: sulting_result,
      Total_capacity_shift: sulting_dt_range_result,
    });
  } catch (error) {
    console.error("Error in /fullmachinecapacity:", error);
    res.status(500).send("Internal Server Error");
  }
});

//取得error_record.txt NG狀態記錄文本內容
router.get("/ng_record_content", async (req, res) => {
  const { errorstatus, runlogDate, sideoption } = req.query; // 篩選條件 (錯誤狀態,站別)

  const ng_error_status = decodeURIComponent(req.query.errorstatus || "");
  // console.log("type of errorstatus = " + typeof errorstatus);
  // console.log("解析URL原型態為:" + ng_error_status);

  const error_item = Array.isArray(ng_error_status)
    ? ng_error_status
        .split(filter_split_flag)
        .map((s) => s.trim())
        .filter(Boolean)
    : ng_error_status; //支援多選錯誤狀態

  // console.log("重配置 error_item = " + error_item);
  // console.log("異常發生日期 = " + runlogDate);
  // console.log("異常接收站選項站別 = " + sideoption);

  //分選判別站 error_record.txt 路徑
  if (sideoption.includes("sulting")) {
    const data = await parseErrorLog(error_item, runlogDate);

    // console.log("data.allinfo  = " + JSON.stringify(data.allinfo, null, 2));
    // console.log(
    //   "異常選單相關回傳數量:" +
    //     data.allinfo.length +
    //     "  異常紀錄日期  = " +
    //     data.log_date.length +
    //     "筆 -> " +
    //     data.log_date[0] +
    //     " ~ " +
    //     data.log_date.slice(-1) +
    //     "\r\n" +
    //     " 異常日期列:" +
    //     JSON.stringify(data.log_date, null, 2)
    // );

    //無符合條件紀錄回傳提示
    if (!data || data.allinfo.length === 0) {
      console.log("無符合條件紀錄回傳提示");
      return res.status(200).json({
        message: "No matching records found",
        allinfo: [],
        log_date: [],
      });
    }

    res.status(200).json(data);
  } else {
    res.status(200).json([]); //其他站別暫無資料
  }
});

module.exports = router;
