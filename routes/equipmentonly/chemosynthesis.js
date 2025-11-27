require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../../modules/db_connect.js");
const dbmes = require(__dirname + "/../../modules/mysql_connect_mes.js");
const db2 = require(__dirname + "/../../modules/mysql_connect.js");
const XLSX = require("xlsx");
const dayjs = require("dayjs");
const moment = require("moment-timezone");

// 取得台北時區的當前日期
let currentDate = moment.tz("Asia/Taipei").format("YYYY-MM-DD");

//宣告 realtime table 變數
let query_realtable;

let stringrunstatus = "";
//替代各站一二期搜尋條件變數
let seci_chroma_sitetype;

//宣告班別
let searchclass = "";

//確認期數
let check_period = "";

const realtime_table = ["seci_outport12", "chroma_outport123"];

// 🕒 動態生成時間區段（早/晚班）
function getTimeCondition(now, columnName = "Time") {
  const moment = require("moment-timezone"); // 確保 moment-timezone 已經引入
  const taipeiTime = moment(now).tz("Asia/Taipei");

  // 確保時間條件是封閉區間 [startTime, endTime)
  return `DATE(${columnName}) = CURDATE()`;
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

async function change_update_mestable(machineselect) {
  const selectMachine = machineselect.toString().trim();
  if (!Array.isArray(selectMachine) && selectMachine.includes("%0")) {
    //seci_chroma -> 判斷化成1或2期
    const seci_chroma = selectMachine.split("_");

    // %023% , %010% , %017%
    seci_chroma_sitetype = seci_chroma[0].toString();
    // 1期或2期
    if (parseInt(seci_chroma[1]) === 1) {
      query_realtable = realtime_table[0].toString();
      check_period = "1";
      console.log("query_realtable 設定為 (化成1期):", query_realtable); // 增加
    } else if (parseInt(seci_chroma[1]) === 2) {
      query_realtable = realtime_table[1].toString();
      check_period = "2";
      console.log("query_realtable 設定為 (化成2期):", query_realtable); // 增加
    }
  } else {
    return res.status(408).json({
      error: `Error machineOption 化成站 parameter = ${selectMachine}`,
    });
  }
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
      const id = worksheet[`A${index}`].v ?? "";
      const name = worksheet[`B${index}`].v ?? "";
      const work = worksheet[`C${index}`].v ?? "";

      // const memberName = `SELECT memberName FROM hr_memberinfo where memberID = ${id}`;

      // console.log("memberName = " + memberName);

      // const [Name] = await db2.query(sqlopname);

      // searchclassname = mes_name;

      // console.log("操作機台姓名=" + searchclassname);

      // Skip empty rows (no ID)
      if (!id) continue;

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
// 化成站最新一筆資料查詢
router.get("/updatepage", async (req, res) => {
  const { machineOption } = req.query;
  let sql = "";
  let sql2 = `SELECT memberName FROM hr.hr_memberinfo where memberID = ? `;

  console.log("PF Received machineOption:", machineOption);

  if (!machineOption) {
    return res.status(400).json({ error: "Missing machineOption parameter" });
  }

  //先行更新日期
  update_sysdatetime();
  //在切換realtime table
  change_update_mestable(machineOption);

  //化成走這段
  if (machineOption.toString().includes("%0")) {
    sql = `SELECT * FROM ${query_realtable} where Param like '${seci_chroma_sitetype}'  ORDER BY ID DESC limit 1`;
  }

  //   console.log("sql = " + sql);

  if (!sql || sql.trim() === "") {
    return res.status(400).json({ error: "SQL query is empty" });
  }

  try {
    const [rows] = await dbmes.query(sql);
    // console.log("sql:", sql);

    //預設2 (IDLE)
    changeruntime_display(parseInt(rows?.[0]?.MachineStatus ?? "2"));
    rows[0].MachineStatus = stringrunstatus;

    //若無OP欄位,預設300
    const memberID = !isNaN(rows[0]?.OP) ? rows[0]?.OP : "300";
    const [memberName] = await db2.query(sql2, memberID);
    rows[0].OP = parseInt(memberID).toString();
    rows[0].OPNAME = memberName[0].memberName;

    // console.log("Query Result:", rows);

    res.status(200).json(rows);
  } catch (err) {
    // console.error("Database query error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/groupname_capacitynum", async (req, res) => {
  //startDay === 選定開始時間
  //endDay === 由前端系統送出確認查詢當下的時間

  const { machineOption, startscanDay, member_ID } = req.query || {};

  console.log("machineOption :", machineOption, typeof machineOption);
  console.log("startscanDay :", startscanDay);
  console.log("member_ID :", member_ID);

  const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  const startDay_current = currentDay + " 00:00:00"; //   為當天日期的00:00:00
  const endDayToTranslate = currentDay + " 23:59:59"; //  為當天日期的23:59:59

  const user_define_date = moment(startscanDay)
    .tz("Asia/Taipei")
    .format("YYYY-MM-DD 00:00:00"); // 前端送來 使用者選定開始日期

  const nightShiftStart =
    moment(startDay_current).subtract(1, "days").format("YYYY-MM-DD") +
    " 20:00:00"; // 夜班開始時間
  const nightShiftEnd =
    moment(startDay_current).format("YYYY-MM-DD") + " 08:00:00"; // 夜班結束時間

  const morningShiftStart =
    moment(startDay_current).format("YYYY-MM-DD") + " 08:00:00"; // 早班開始時間
  const morningShiftEnd =
    moment(startDay_current).format("YYYY-MM-DD") + " 20:00:00"; // 早班結束時間

  if (!machineOption) {
    return res.status(400).json({ error: "Missing machineOption parameter" });
  }

  const side_param = machineOption.split("_");
  const side_paramLike = side_param[0].toString().trim();
  const side_period = side_param[1].toString().trim();
  const pf_batch_table =
    parseInt(side_period) === 1
      ? "mes.seci_outport12"
      : "mes.chroma_outport123";

  let sql = `
  WITH all_PF_data AS (
      SELECT Barcode, Param, time FROM ${pf_batch_table}     
    )
    SELECT
      -- 今日化成數量
      COUNT(DISTINCT CASE WHEN Param LIKE '${side_paramLike}' AND time BETWEEN '${startDay_current}' AND '${endDayToTranslate}' THEN Barcode END) AS todayCapacity_result,

      -- 累計時間化成數量
      COUNT(DISTINCT CASE WHEN Param LIKE '${side_paramLike}' AND time BETWEEN '${user_define_date}' AND '${endDayToTranslate}' THEN Barcode END) AS amountCapacity_result,

      -- 晚班化成數量
      COUNT(DISTINCT CASE WHEN Param LIKE '${side_paramLike}' AND time BETWEEN '${nightShiftStart}' AND '${nightShiftEnd}' THEN Barcode END) AS nightShiftCapacity_result,

      -- 早班化成數量
      COUNT(DISTINCT CASE WHEN Param LIKE '${side_paramLike}' AND time BETWEEN '${morningShiftStart}' AND '${morningShiftEnd}' THEN Barcode END) AS morningShiftCapacity_result
    FROM all_PF_data;
  `;

  // console.log("計算sql-PF 各班別產能query:" + sql);

  try {
    //先將OPNAME索引

    const [rows] = await dbmes.query(sql);

    // console.log("PF shifts rows result = " + JSON.stringify(rows, null, 2));

    const xls_taskID = member_ID.toString().padStart(3, "0");
    confirm_group_xls(xls_taskID);

    res.status(200).json({
      todayCapacity_first_result: rows[0]?.todayCapacity_result || "0",
      amountCapacity_first_result: rows[0]?.amountCapacity_result || "0",
      nightShiftCapacity_first_result:
        rows[0]?.nightShiftCapacity_result || "0",
      morningShiftCapacity_first_result:
        rows[0]?.morningShiftCapacity_result || "0",
      staffRows: searchclass, // 即時班別
    });
  } catch (error) {
    console.error("Database query error:", error);
    return res.status(500).json({ error: "Internal server error" });
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

  try {
    const chemosynthesis_result = {};
    const chemosynthesis_dt_range_result = {};
    //計算當天全產能(及一二期加總)
    const sql_currentday_amount_pf = `
      WITH all_currentday_PF_data AS (     
        SELECT 'SECI' AS PF_Side, Barcode, Param, time FROM mes.seci_outport12
        UNION ALL
        SELECT 'CHROMA' AS PF_Side, Barcode, Param, time FROM mes.chroma_outport123 
      )
      SELECT
        -- 今日化成(一期,二期,加總)生產數量
        COALESCE(PF_Side, 'ALL') AS PF_Side,        
        COUNT(DISTINCT CASE WHEN Param LIKE '%023%' AND time BETWEEN '${startDay}' AND '${endDayToTranslate}' THEN Barcode END) AS today_all_pf_result
      FROM all_currentday_PF_data
      GROUP BY PF_Side WITH ROLLUP
      ORDER BY 
         CASE COALESCE(PF_Side, 'ALL')
          WHEN 'SECI' THEN 1
          WHEN 'CHROMA' THEN 2
          WHEN 'ALL' THEN 3
      END;      
    `;

    //計算chemosynthesis PF化成站全機台(昨晚,今早,今晚)各班別產能量
    const PF_full_amount_SQL = `
                                WITH source_table AS (
                                  SELECT 'SECI' AS PF_Side, Barcode, Param, time FROM mes.seci_outport12
                                        UNION ALL
                                        SELECT 'CHROMA' AS PF_Side, Barcode, Param, time FROM mes.chroma_outport123

                                ),
                                time_ranges AS (
                                    ${datetime_range_Sql}
                                ),
                                base_run_stable AS (
                                        SELECT 
                                        s.PF_Side,
                                        s.time,
                                        CASE WHEN s.Param LIKE '%023%' THEN 1 ELSE 0 END AS PF_all_amount
                                    FROM source_table s
                                    WHERE s.time BETWEEN '${
                                      shifts[0][0]
                                    }' AND '${shifts[shifts.length - 1][1]}'
                                    )
                                    
                                    SELECT 
                                      tr.time_range,                                    
                                    COALESCE(SUM(b.PF_all_amount), 0) AS total_amount
                                    FROM time_ranges tr                          
                                    LEFT JOIN base_run_stable b
                                          ON b.time BETWEEN tr.start_time AND tr.end_time
                                    GROUP BY tr.time_range
                                    ORDER BY tr.time_range;
                                    `;

    // console.log("sql_amount_pf = " + sql_amount_pf);
    // console.log("PF_full_amount_SQL = " + PF_full_amount_SQL);

    // 計算化成PF站全機器,當天全部產能
    const [rows_fullmachine] = await db2.query(sql_currentday_amount_pf, [
      startDay,
      endDayToTranslate,
    ]);

    // console.log(
    //   "計算化成PF站各機台當天全產能數據列為: " +
    //     rows_fullmachine.length +
    //     JSON.stringify(rows_fullmachine, null, 2)
    // );

    //計算各(昨晚,今早,今晚)時段產能
    const [rows_pf_shift] = await dbmes.query(PF_full_amount_SQL);

    if (!rows_pf_shift || rows_pf_shift.length === 0) {
      return res.status(404).json({ message: "No data found for pf shifts" });
    }

    // console.log(
    //   "PF全機台(1,2期)各自班別(昨晚,今早,今晚)產能" +
    //     JSON.stringify(rows_pf_shift, null, 2)
    // );

    rows_fullmachine.forEach((item, index) => {
      //確認期數
      const sidealias = item.PF_Side.includes("SECI")
        ? "一期"
        : item.PF_Side.includes("CHROMA")
        ? "二期"
        : "全總";

      const key = `PF站${sidealias}產能`;
      chemosynthesis_result[key] = item.today_all_pf_result;
    });

    rows_pf_shift.forEach((item, index) => {
      const phase = index === 0 ? "昨晚班" : index > 1 ? "今晚班" : "今早班";
      const key = `化成(一二期)站${phase}產能`;
      chemosynthesis_dt_range_result[key] = item?.total_amount ?? 0;
    });

    //另外方法
    // STEP 1: 將結果轉為 key-value 物件
    // const map_dt_between = Object.fromEntries(
    //   rows_pf_shift.map((obj) => [obj.time_range, obj])
    // );

    // // STEP 2: 遍歷班別時間段，填寫對應總產能
    // shifts.forEach(([start, end], index) => {
    //   const key = `${start}~${end}`;
    //   const data = map_dt_between[key];

    //   const totalsum = data?.total_amount ?? 0;
    //   if (!data) {
    //     console.warn(`化成站 ⚠️ 無資料 for 時段: ${key}，預設為 0`);
    //   }

    //   chemosynthesis_dt_range_result[
    //     `化成站-${["昨晚班", "今早班", "今晚班"][index]}總產能`
    //   ] = totalsum;

    //   console.log(`index = ${index} : ${key} :`, data);
    // });

    // console.log(
    //   "PF一二期(含加總)全天產能" +
    //     JSON.stringify(chemosynthesis_result, null, 2)
    // );

    // console.log(
    //   "PF加總(一二期)各時段班別" +
    //     JSON.stringify(chemosynthesis_dt_range_result, null, 2)
    // );

    res.status(200).json({
      data: chemosynthesis_result,
      Total_capacity_shift: chemosynthesis_dt_range_result,
    });
  } catch (error) {
    console.error("Database query error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
