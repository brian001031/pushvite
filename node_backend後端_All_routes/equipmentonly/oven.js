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

let searchclass = "",
  oven_all_data = [];

// 建立對應關係
const labelMap = {
  ceboard_IN_modle_count: "大烘箱入料量",
  ceboard_OUT_modle_count: "大烘箱出料量",
};

const oven_table_all = {
  oven_select_big_in_tb: {
    table: "cellbakingin_batch",
    field: "CS_board_number",
    label: "ceboard_IN_name",
    type: "ceboard_IN_modle_count",
    type_shift: "ceboard_IN_modle_shiftcount",
    type_acc: "ceboard_IN_modle_acccount",
  },
  oven_select_big_out_tb: {
    table: "cellbaking_batch",
    field: "CE_board_number",
    label: "ceboard_OUT_name",
    type: "ceboard_OUT_modle_count",
    type_shift: "ceboard_OUT_modle_shiftcount",
    type_acc: "ceboard_OUT_modle_acccount",
  },
  //......
};

async function confirm_group_xls(searid) {
  //先讀入電化學班表.xlsx
  const elecxlsx = process.env.electricxls;
  let workbook = XLSX.readFile(elecxlsx);
  let worksheet = workbook.Sheets["各站班表"];
  const range = XLSX.utils.decode_range(worksheet["!ref"]);

  // console.log(range);
  const workData = [];
  for (let index = 2; index <= range.e.r + 1; index++) {
    try {
      // 确保单元格存在再访问其值
      const id = worksheet[`A${index}`].v;
      const name = worksheet[`B${index}`].v;
      const work = worksheet[`C${index}`].v;

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
}

router.get("/updatepage", async (req, res) => {
  const { machineoption } = req.query;
  console.log("machineoption = " + machineoption);

  if (!machineoption || !machineoption.includes("真空電芯-大烘箱")) {
    return res.status(400).send("Invalid machine option");
  }

  let sql = `SELECT * FROM mes.cellbaking_realtime order by id desc LIMIT 1;`;
  let sql2 = `SELECT memberName FROM hr.hr_memberinfo where memberID = ? `;

  try {
    const [rows] = await db2.query(sql);
    if (!rows || rows.length === 0) {
      return res.status(404).send("No data found");
    }
    const row = rows[0];
    const memberID = String(row.OP).trim();
    const [memberName] = await db2.query(sql2, memberID);

    row.OPName = memberName.length > 0 ? memberName[0].memberName : null;

    res.status(200).json([row]);
  } catch (error) {
    console.error("Error in /updatepage:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/groupname_capacitynum", async (req, res) => {
  const { equipmentID, shiftclass, machineoption, accmount_stdate } = req.query;
  const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  const startDay = currentDay + " 00:00:00";
  const endDayToTranslate = currentDay + " 23:59:59";
  let startoem_dt = "";
  let endoem_dt = "";
  let { table, field, label, type } = {};
  let sql_oven = "";
  let ces_boardList,
    fullday_productnum,
    shift_productnum,
    makeproduce_accumulation_num;
  let result = {};
  const accmount_begindate = accmount_stdate.toString() + " 00:00:00";

  console.log(
    "烘箱groupname_capacitynum 提交查詢變數為=" + equipmentID.trim(" "),
    shiftclass.trim(" "),
    machineoption.trim(" "),
    accmount_stdate
  );

  //後續再讀取班表確認目前操作工號人員的組別
  const xls_taskID = equipmentID.toString().padStart(3, "0");
  confirm_group_xls(xls_taskID);

  //這邊只取組別即可,原先字串為(早A,早B,晚A,晚B)
  searchclass = searchclass.substring(1, searchclass.length);

  if (searchclass.includes("") || searchclass.length === 0) {
    //假設一個組別
    searchclass = "A";
  }

  if (shiftclass.toString().includes("早班")) {
    startoem_dt = currentDay + " 08:00:00";
    endoem_dt = currentDay + " 20:00:00";
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

  //根據字串(大or小) 切換table,載板欄位名稱,及入料數量或出數量
  //ex:真空電芯-大烘箱-入料 ...., 極片-小烘箱-出料
  const caculator_machine = machineoption.split("-");

  if (
    caculator_machine[1].includes("大") &&
    caculator_machine[2].includes("入")
  ) {
    ({ table, field, label, type, type_shift, type_acc } =
      oven_table_all.oven_select_big_in_tb);
  } else if (
    caculator_machine[1].includes("大") &&
    caculator_machine[2].includes("出")
  ) {
    ({ table, field, label, type, type_shift, type_acc } =
      oven_table_all.oven_select_big_out_tb);
  }
  //小烘箱待後續.....
  else {
  }

  // 當日產能查詢
  sql_oven = `
    SELECT   ${field} as ce_board_caculator,'${label}' as type FROM mes.${table} where 1=1 and Time between '${startDay}' AND '${endDayToTranslate}' 
union all SELECT count( ${field})*40 as ce_board_caculator,'${type}'  FROM mes.${table} where 1=1 and Time between '${startDay}' AND '${endDayToTranslate}'
union all SELECT count( ${field})*40 as ce_board_caculator_shift,'${type_shift}'  FROM mes.${table} where 1=1 and Time between '${startoem_dt}' AND '${endoem_dt}'
union all SELECT count( ${field})*40 as ce_board_caculator_amount,'${type_acc}'  FROM mes.${table} where 1=1 and Time between '${accmount_begindate}' AND '${endDayToTranslate}'
  `;

  // console.log("sql_oven = " + sql_oven);
  try {
    const [rowsToday] = await dbmes.query(sql_oven);

    // console.log("結果為:" + JSON.stringify(rowsToday, null, 2));

    rowsToday.forEach((item, index) => {
      const type = item.type;
      const value = item.ce_board_caculator;

      if (type === label) {
        // 若尚未存在，初始化為空字串
        if (!result[type]) result[type] = "";
        result[type] += value + " ";
      } else {
        result[type] = value;
      }

      if (index === rowsToday.length - 1) {
        if (!result["shiftclass"]) result["shiftclass"] = "";
        result["shiftclass"] = searchclass;
      }
    });

    // 去除多餘空格
    if (result[label]) {
      result[label] = result[label].trim();
    }

    // console.log(result);

    res.status(200).json(result);
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
  const oven_result = {};
  let sum_oven = 0;

  // console.log(
  //   "startDay = " + startDay,
  //   "endDayToTranslate = " + endDayToTranslate
  // );

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

  //cross join：time_ranges × directions (IN/OUT)
  //再 left join 大烘箱實際生產資料
  //最後 group by 時段與 IN/OUT 來確保每個時段都有資料，沒有的話就補 0
  const Oven_full_INOUT_shift_SQL = `
    WITH time_ranges AS (
      ${datetime_range_Sql}
    ),
    directions AS (
       SELECT 'IN' AS Direction
       UNION ALL
       SELECT 'OUT'
    ),
    Oven_Base_Case AS (
        SELECT 
          Time,
          count(CS_board_number) * 40 AS Qty,
          'IN' AS Direction
        FROM mes.cellbakingin_batch
        WHERE Time BETWEEN '${shifts[0][0]}' AND '${
    shifts[shifts.length - 1][1]
  }'
        GROUP BY Time
        UNION ALL
        SELECT 
          Time,
          count(CE_board_number) * 40 AS Qty,
          'OUT' AS Direction
        FROM mes.cellbaking_batch
        WHERE Time BETWEEN '${shifts[0][0]}' AND '${
    shifts[shifts.length - 1][1]
  }'
        GROUP BY Time
    ),     
    range_with_dir AS (
      SELECT tr.time_range, tr.start_time, tr.end_time, d.Direction
      FROM time_ranges tr
      CROSS JOIN directions d
    ),
    joined_data AS (
      SELECT 
        rwd.time_range,
        rwd.Direction,
        b.Qty
      FROM range_with_dir rwd
      LEFT JOIN Oven_Base_Case b
        ON b.Time BETWEEN rwd.start_time AND rwd.end_time
        AND b.Direction = rwd.Direction
    )
    SELECT
      time_range,
      Direction,
      IFNULL(SUM(Qty), 0) AS 總計
    FROM joined_data
    GROUP BY time_range, Direction
    ORDER BY time_range, Direction;
      `.trim();

  const all_temp_columnlist = `SELECT COLUMN_NAME
                                FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_SCHEMA = 'mes'
                                  AND TABLE_NAME = 'cellbaking_realtime'
                                  AND COLUMN_NAME LIKE 'Fixture_heating_temp%'                               
                                ORDER BY CAST(SUBSTRING(COLUMN_NAME, LENGTH('Fixture_heating_temp') + 1) AS UNSIGNED);`;

  const sql_realtime = `SELECT * FROM mes.cellbaking_realtime order by id desc limit 1`;

  const sql_oven_allPLCEnum = `SELECT count( CS_board_number)*40 as oven_industrial_in_out,'ceboard_IN_modle_count'  FROM mes.cellbakingin_batch where 1=1 and Time between '${startDay}' AND '${endDayToTranslate}'
union all SELECT count( CE_board_number)*40 ,'ceboard_OUT_modle_count'  FROM mes.cellbaking_batch where 1=1 and Time between '${startDay}' AND '${endDayToTranslate}'`;

  try {
    oven_all_data.length = 0; //先清空OVEN紀錄儲存空間
    const oven_dt_range_result = {};
    //只找Fixture_heating_temp 前綴欄位名稱
    // const [rows_col_Fixture_heating_temp] = await dbmes.query(
    //   all_temp_columnlist
    // );
    // const Fixture_heating_temp_list = rows_col_Fixture_heating_temp
    //   .map((col) => col.COLUMN_NAME)
    //   .join(", ");

    //找尋全資料表,後續再針對Fixture_heating_temp% 物件取value list
    const [rows_tempAll_value] = await db2.query(sql_realtime);

    // 產生一個新的物件，key 改為「溫度點-{編號}」
    const renamedFixtureTemps = Object.keys(rows_tempAll_value[0])
      .filter((key) => /^Fixture_heating_temp\d+$/.test(key))
      .reduce((acc, key) => {
        const number = parseInt(key.replace("Fixture_heating_temp", ""), 10);
        acc[`加熱點-${number}`] = rows_tempAll_value[0][key];
        return acc;
      }, {});

    const [rows_oven_all] = await db2.query(sql_oven_allPLCEnum);
    // console.log(
    //   "全機台當天生產產能數據 :",
    //   JSON.stringify(rows_oven_all, null, 2)
    // );

    // console.log(typeof renamedFixtureTemps);
    // console.log(renamedFixtureTemps);

    oven_all_data.push({ temp_address: renamedFixtureTemps });

    // 重整後的資料
    rows_oven_all.forEach((item, index) => {
      const labelKey = item.ceboard_IN_modle_count;
      const label = labelMap[labelKey] || labelKey;

      oven_result[label] = item.oven_industrial_in_out;
      sum_oven += parseInt(item.oven_industrial_in_out) || 0;

      if (index === rows_oven_all.length - 1) {
        oven_result["大烘箱總處理量"] = sum_oven;
      }
    });

    oven_all_data.push({ All_OVEN_CELL_NUM: oven_result });

    // 計算總和
    // const total = OvenAll_formatData.reduce((sum, item) => {
    //   return sum + Object.values(item)[0]; // 只取每筆的數值來加總
    // }, 0);

    // // 加入總處理量
    // OvenAll_formatData.push({
    //   大烘箱總處理量: total,
    // });

    //計算各(昨晚,今早,今晚)時段產能
    const [rows_Oven_shift] = await dbmes.query(Oven_full_INOUT_shift_SQL);

    // console.log(JSON.stringify(rows_Oven_shift, null, 2));

    if (!rows_Oven_shift || rows_Oven_shift.length === 0) {
      return res.status(404).json({ message: "No data found for Oven shifts" });
    }

    rows_Oven_shift.forEach((item, index) => {
      let phase = "";
      if (index <= 1) {
        item.Direction === "IN"
          ? (phase = "昨晚班入庫")
          : (phase = "昨晚班出庫");
      } else if (index > 1 && index <= 3) {
        item.Direction === "IN"
          ? (phase = "今早班入庫")
          : (phase = "今早班出庫");
      } else {
        item.Direction === "IN"
          ? (phase = "今晚班入庫")
          : (phase = "今晚班出庫");
      }

      const key = `真空電芯大烘箱站-${phase}總量能`;
      oven_dt_range_result[key] = item?.["總計"] ?? 0;
    });

    // console.log(JSON.stringify(oven_dt_range_result, null));

    // res.status(200).json({ data: oven_all_data });
    res.status(200).json({
      data: oven_all_data,
      Total_capacity_shift: oven_dt_range_result,
    });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

module.exports = router;
