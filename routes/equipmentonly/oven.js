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

  console.log(
    "startDay = " + startDay,
    "endDayToTranslate = " + endDayToTranslate
  );

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

    // console.log(JSON.stringify(oven_result, null, 2));

    //res.status(200).json({ data: oven_result });
    res.status(200).json({ data: oven_all_data });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

module.exports = router;
