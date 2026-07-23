const express = require("express");
const { console } = require("inspector");
const { isArray, includes, upperCase } = require("lodash");
const { where, NUMBER } = require("sequelize");
const router = express.Router();
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const mysql = require('mysql2');
const fs = require("fs");
const ExcelJS = require("exceljs");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const moment = require("moment");
//引入excel套件
const XLSX = require("xlsx");
const { json } = require("body-parser");

// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js");  // hr 資料庫

dayjs.extend(utc);
dayjs.extend(timezone);

// 獲取當前日期
let now = new Date();

// 取得當前年份、月份和日期
let nowyear = now.getFullYear();
let nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
let nowdate = now.getDate().toString().padStart(2, "0");
const today_datesstr = dayjs(now).endOf("day").format("YYYY-MM-DD HH:mm:ss");

//建立 Map 紀錄每個 batchId 的最後 request
const batchMap = new Map();
let data_safe_all=[];

let scatterdigram_SearchData = [] , serial_query ="";

const keyMap_CC1and2 = {
  VAHSA: "V2_0VAh",
  VAHSB: "V3_6VAh",
  VAHSC: "V3_5VAhcom",
};

const keyMap_CC_cap = {
  VAHSA: "V2_0VAh",
  VAHSB: "V3_6VAh",
  VAHSC: "V3_5VAhcom",
};

const sorting_change_mapping = {
  sulting_pf:
  {
    status_str:  "分選化成站",
    DB_table: "mes.testmerge_pf",
    ack_type : "t.parameter as PF_TYPE",
    column_map: ["t.VAHS28","t.VAHS32","t.VAHS35"],
    voltage_gap_list: ["V28_Null_None","V32_Null_None","V35_Null_None"]  
  },
  sulting_cc:
  {
    status_str:  "分選分容站",
    DB_table: "mes.testmerge_cc1orcc2",
    ack_type : "t.Para as CC_TYPE",
    column_map: ["t.VAHSA","t.VAHSB","t.VAHSC"],
    voltage_gap_list: ["V2_0VAh_Zero_None","V3_6VAh_Zero_None","V3_5VAhcom_Zero_None"] 
  }
};

const key_cc_type = ["010","017"]

const minmax_str = ["min_same_digit","max_same_digit"]

let progressMap , fileMap;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


function change_mergesort_param ( side_name) {
 
   if(side_name === "Formation")
   {



   }else if(side_name === "Capacity"){


   }
    

}

//電檢站的電池封口厚度數據,並計算每個位置(Param3~Param9)最小值和最大值
function Echk_Sealthick_SQL() {
  const para_start = 3; // PARAM03
  const para_end = 5;
  const para_length = para_end - para_start + 1;

  const fields = Array.from(
    { length: para_length },
    (_, i) => `${i + para_start}`
  );
  const baseCTE = `WITH cleaned AS (
  SELECT * FROM mes.echk_batch
  WHERE CAST(ID AS UNSIGNED) > 2
  )\n`;

  const sqlBlocks = [];

  fields.forEach((param) => {
    ["MIN", "MAX"].forEach((stat) => {
      const param_col = `PARAM${param.toString().padStart(2, "0")}`; // PARAM03  ← 兩位數補0
      const param_col_condition = `CAST(${param_col} AS DECIMAL(10,3))`; // → CAST(PARAM03 AS DECIMAL(10,3))
      const label = `bat_Sealthick_${param}_${stat === "MIN" ? "Min" : "Max"}`;
      const ConDition = `${param_col} REGEXP '^[0-9.]+$' AND ${param_col_condition} NOT LIKE '0' and ${param_col_condition} IS NOT NULL AND ${param_col_condition} > 0 `;

      const sql = `SELECT ${stat}(CAST(${param_col} AS DECIMAL(10,3))) AS result, '${label}' AS type FROM cleaned\nWHERE ${ConDition} `;
      sqlBlocks.push(sql);
    });
  });

  const fullSQL = baseCTE + sqlBlocks.join("\nUNION ALL\n") + ";";
  return fullSQL;
}


function find_serial_list ( side , sidename) {

  const setparam = sidename.includes('pf')? {ID_case:"IDK",sulting_query_table:"mes.testmerge_pf"}
                    :{ID_case:"IDH",sulting_query_table:"mes.testmerge_cc1orcc2"};

  if(side.toString() === "Sulting"){
      serial_query =`SELECT DISTINCT 
                        CASE 
                            WHEN model_prefix LIKE '${setparam.ID_case}0000%' THEN '${setparam.ID_case}0000'
                            ELSE model_prefix
                            END AS model_prefix                        
                        FROM (
                              SELECT REGEXP_SUBSTR(modelId, '^[A-Z]+[0-9]+') AS model_prefix
                              FROM ${setparam.sulting_query_table} 
                              WHERE REGEXP_SUBSTR(modelId, '^[A-Z]+[0-9]+') IS NOT NULL
                        ) t
                     ORDER BY model_prefix
                     `;
  }else{
     serial_query ="";
  }  
}

function convert_10digital( keyname , digitvalue) {

  let conv_base = Number(1);
  //再次確認是否數值
  if(!isNaN(digitvalue)){
    let conv_num = Number(digitvalue);
    //min 直接依照階層累積10
    if(keyname === minmax_str[0]){

      if(conv_num ===1)
         return conv_base ;

      while(conv_num-- !== 1){
        conv_base *= 10;
      }      
    }//max 直接依照階層除10 
    else if(keyname ===minmax_str[1]){

      while( conv_num >=10 ){
        conv_base *= 10;
        conv_num /=10;
      }
    }   
    return conv_base;
  }
   
}

//切換PF 或 CC query 搜尋條件式
function get_suliting_normal_condition ( side_option , sulit_case) {
  // side_option 查詢選單名稱 , sulit_case  PF或CC站別
   let con_str = [];

   //32-CC2分選分容(含CC1未分選)
   if(sulit_case.includes("sulting_cc")){
     const cc_private_case = side_option.includes("全部")?` Para <> ''`:`Para like '${side_option}'`;
     con_str.push(cc_private_case);
   }//化成PF充電站
   else if(sulit_case.includes("sulting_pf")){
     con_str.push(` parameter like '023' `);
   }
   return con_str;
}

//執行EXCEL資料轉換工作程序
async function generateExcelAsync(taskId, xls_params) {
   const {
        cc_serial,
        keyword,
        cap_side,
        stDate,
        edDate,
        sortOrder,
  } = xls_params;

  // 針對前端數據流參數
    const cctype_serial = cc_serial || "";
    const search_serial = !isNaN(keyword)? Number(keyword) : ""; // 電芯序號關鍵字
    const station = cap_side || ''; // 篩選分容side
    const sortOrder_case = sortOrder === 'asc' ? 'ASC' : 'DESC'; // 預設 DESC
    const stDate_str = stDate || '';
    const edDate_str = edDate || '';

    let whereClause = ` WHERE STR_TO_DATE(CONCAT(SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                          CASE 
                            WHEN EnddateD LIKE '%上午%' THEN 'AM'
                            WHEN EnddateD LIKE '%下午%' THEN 'PM'
                            ELSE ''
                          END
                        ),'%Y/%m/%d %I:%i:%s %p') BETWEEN '${stDate_str} 00:00:00' and '${edDate_str} 23:59:59'`;
    
    const orderbt_str = `ORDER BY STR_TO_DATE(
                          CONCAT(
                            SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
                            SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                            CASE 
                              WHEN EnddateD LIKE '%上午%' THEN 'AM'
                              WHEN EnddateD LIKE '%下午%' THEN 'PM'
                              ELSE ''
                            END
                          ),'%Y/%m/%d %I:%i:%s %p') ${sortOrder_case} `;


    // 動態條件組合
    const conditions = station.includes("全部")?[` Para <> ''`]:[`Para like '${station}'`];
    const params = [];

    if (cctype_serial) {        
      const serial_add = search_serial!=="" ?`modelId REGEXP '^${cctype_serial}.*${search_serial}'`:`modelId LIKE '${cctype_serial}%'`;
      conditions.push(`${serial_add}`);
      params.push(`'${cctype_serial}%'`);
    }

    const where_conditions_case = (conditions.length > 0 && whereClause!='') ? conditions.join(' AND ') : '';      
    whereClause? whereClause +=` AND ${where_conditions_case}`:'';

    progressMap.set(taskId, 10);
    await sleep(300);

    // 查當前param查詢資料數據流
      const dataSql_excelonly = `
        SELECT *
        FROM mes.testmerge_cc1orcc2
        ${whereClause}
        ${orderbt_str}       
      `;

      //執行電芯資料搜尋(包含進度)
     const [rows_excelinfo] = await dbmes.query(dataSql_excelonly);
   
     progressMap.set(taskId, 40);

    //產生 Excel（例如 exceljs）
    const filePath = `Z:/${cctype_serial}_${search_serial}_${station}站_日期_${stDate_str}_${edDate_str}.xlsx`;

    if( !rows_excelinfo[0] || rows_excelinfo.length < 1){
        progressMap.set(taskId, {
        progress: 100,
        status: "empty"
      });

      return;  
    }

    //// 🟢 不要 stringify
    // const conver2json = JSON.stringify(rows_excelinfo); 
    const parsedData = rows_excelinfo;


     //刪除舊檔（如果存在）
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log("🗑 舊檔已刪除");
      } catch (err) {
        console.error("❌ 刪除檔案失敗:", err);
      }
    }

    const workbook = new ExcelJS.Workbook();
    const sheetName = `${cctype_serial}_${search_serial}_${station}站`;

    // // 添加新的工作表
    const newbackupsheet = workbook.addWorksheet(sheetName);

    newbackupsheet.columns = [
        { header: "id", key: "id",  width: 20 },
        { header: "modelId", key:   "modelId",  width: 20 },
        { header: "parameter", key: "parameter",  width: 20 },
        { header: "VDA", key:"VDA",  width: 20 },
        { header: "VSA", key:"VSA",  width: 20 },
        { header: "VAHDA", key: "VAHDA",  width: 20 },
        { header: "VAHSA", key: "VAHSA",  width: 20 },
        { header: "VDB", key:"VDB",  width: 20 },
        { header: "VSB", key:"VSB",  width: 20 },
        { header: "VAHDB", key: "VAHDB",  width: 20 },
        { header: "VAHSB", key: "VAHSB",  width: 20 },
        { header: "VDC", key:"VDC",  width: 20 },
        { header: "VSC", key:"VSC",  width: 20 },
        { header: "VAHDC", key: "VAHDC",  width: 20 },
        { header: "VAHSC", key: "VAHSC",  width: 20 },
        { header: "Para", key:  "Para",  width: 20 },
        { header: "CCcurrent", key: "CCcurrent",  width: 20 },
        { header: "OCV", key:"OCV",  width: 20 },
        { header: "averageV1", key: "averageV1",  width: 20 },
        { header: "averageV2", key: "averageV2",  width: 20 },
        { header: "averageV3", key: "averageV3",  width: 20 },
        { header: "charge34V", key: "charge34V",  width: 20 },
        { header: "charge345V", key:"charge345V",  width: 20 },
        { header: "charge35V", key: "charge35V",  width: 20 },
        { header: "time50A", key:   "time50A",  width: 20 },
        { header: "v", key:  "v",  width: 20 },
        { header: "v1", key: "v1",  width: 20 },
        { header: "v2", key: "v2",  width: 20 },
        { header: "v3", key: "v3",  width: 20 },
        { header: "v4", key: "v4",  width: 20 },
        { header: "mOhm", key:  "mOhm",  width: 20 },
        { header: "interpretcode", key:"interpretcode",  width: 20 },
        { header: "position", key:  "position",  width: 20 },
        { header: "analysisDT", key:"analysisDT",  width: 100 },
        { header: "FileName", key:  "FileName",  width: 100 },
        { header: "StartDateD", key:"StartDateD",  width: 100 },
        { header: "EnddateD", key:  "EnddateD",  width: 100 },
        { header: "trayID", key:"trayID",  width: 20 },
        { header: "K_Value", key:   "K_Value",  width: 20 }
    ];

    // write excel (確定有數據樓存在至少一筆)
    if(rows_excelinfo.length > 0){
       //  console.log("log寫入進行中!");

         parsedData.forEach((row) => {

          const cleanRow = {};

          //每組ROW 
          Object.keys(row).forEach((key) => {
               const value = row[key];
               cleanRow[key] = typeof value === "string" ? value.trim(): value;
          });

          newbackupsheet.addRow(cleanRow);
       });
   }

   progressMap.set(taskId, 70);

   //寫入EXCEL 保存指定路徑
   await workbook.xlsx.writeFile(filePath)

   progressMap.set(taskId, 90);
   fileMap.set(taskId, filePath);
   progressMap.set(taskId, 100);

}

//取哲當前站別和當前選擇年月之電化學分析數據
router.get("/getanalyzedata", async (req, res) => {
  const {
    select_side_name,
    isChecked,
    itemYear,
    itemMonth,
    itemStartDate,
    itemEndDate,
  } = req.query;
  let newKey;
  console.log(
    "select_side_name:" +
      select_side_name +
      " isChecked:" +
      isChecked +
      " itemYear:" +
      itemYear +
      " itemMonth:" +
      itemMonth +
      "開始日期:" +
      itemStartDate,
    " 結束日期:" + itemEndDate
  );

  //----------------搜尋total_all_Data 數據庫的資料 start---------------
  const select_columns = [
    "select modelId,VAHS28,VAHS32,VAHS35,(CAST(VAHS28 AS DECIMAL(10,4))+CAST(VAHS32 AS DECIMAL(10,4))+CAST(VAHS35 AS DECIMAL(10,4))) AS VAHS_PF_SUM",
    "select modelId,VAHSA,VAHSB,VAHSC,(CAST(VAHSA AS DECIMAL(10,4))+CAST(VAHSB AS DECIMAL(10,4))+CAST(VAHSC AS DECIMAL(10,4))) AS VAHS_CC_SUM,averageV1,averageV2,averageV3",
  ];

  const select_columns_Date = [
    ",str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d') AS extracted_filter from ",
  ];

  const sql_Related_PFCC = [
    "mes.testmerge_pf where parameter like '023' and VAHS35 not like '' ",
    "mes.testmerge_cc1orcc2 where parameter like '010' and VAHSC not like '' ",
    "mes.testmerge_cc1orcc2 where parameter like '017' and VAHSC not like '' ",
  ];
  //----------------end---------------

  //----------------搜尋total_minmax_Data 數據庫的資料 start---------------

  const select_min_col = [
    "select MIN(CAST(VAHS28 AS DECIMAL(10, 3))) as LH_VAHS2_8, MIN(CAST(VAHS32 AS DECIMAL(10, 3))) as LH_VAHS3_2, MIN(CAST(VAHS35 AS DECIMAL(10, 3))) as LH_VAHS3_5 ,'VASH_MIN_result' as type ",
    "select MIN(CAST(VAHSA AS DECIMAL(10, 3))) as LH_VAHS2_8, MIN(CAST(VAHSB AS DECIMAL(10, 3))) as LH_VAHS3_2, MIN(CAST(VAHSC AS DECIMAL(10, 3))) as LH_VAHS3_5 , MIN(CAST(averageV1 AS DECIMAL(10, 3))) as LH_avgV1 , MIN(CAST(averageV2 AS DECIMAL(10, 3))) as LH_avgV2 , MIN(CAST(averageV3 AS DECIMAL(10, 3))) as LH_avgV3,  'VASH_MIN_result' as type ",
  ];
  const select_max_col = [
    "select MAX(CAST(VAHS28 AS DECIMAL(10, 3))) , MAX(CAST(VAHS32 AS DECIMAL(10, 3))) , MAX(CAST(VAHS35 AS DECIMAL(10, 3))) ,'VASH_MAX_result' ",
    "select MAX(CAST(VAHSA AS DECIMAL(10, 3))) , MAX(CAST(VAHSB AS DECIMAL(10, 3))) , MAX(CAST(VAHSC AS DECIMAL(10, 3))) , MAX(CAST(averageV1 AS DECIMAL(10, 3)))  , MAX(CAST(averageV2 AS DECIMAL(10, 3))) , MAX(CAST(averageV3 AS DECIMAL(10, 3))) ,'VASH_MAX_result' ",
  ];

  //使用with binding query MSSQL8.0+ 適用
  const select_filter_PFCC_titile = [
    `WITH filtered_PF AS (
      SELECT
        CAST(VAHS28 AS DECIMAL(10, 3)) as VAHS28, 
        CAST(VAHS32 AS DECIMAL(10, 3)) as VAHS32, 
        CAST(VAHS35 AS DECIMAL(10, 3)) as VAHS35 ` + "\n",
    `WITH filtered_CC AS (
      SELECT
        CAST(VAHSA AS DECIMAL(10, 3)) AS VAHSA,
        CAST(VAHSB AS DECIMAL(10, 3)) AS VAHSB,
        CAST(VAHSC AS DECIMAL(10, 3)) AS VAHSC,
        CAST(averageV1 AS DECIMAL(10, 3)) AS averageV1,
        CAST(averageV2 AS DECIMAL(10, 3)) AS averageV2,
        CAST(averageV3 AS DECIMAL(10, 3)) AS averageV3 ` + "\n",
  ];

  const select_minmax_PFCC_end = [
    `SELECT 
        MIN(VAHS28) AS LH_VAHS2_8,
        MIN(VAHS32) AS LH_VAHS3_2,
        MIN(VAHS35) AS LH_VAHS3_5,
        'VASH_MIN_result' AS type
      FROM filtered_PF
      UNION ALL
      SELECT 
        MAX(VAHS28),
        MAX(VAHS32),
        MAX(VAHS35),
        'VASH_MAX_result'
      FROM filtered_PF;`,
    `SELECT 
        MIN(VAHSA) AS LH_VAHS2_8,
        MIN(VAHSB) AS LH_VAHS3_2,
        MIN(VAHSC) AS LH_VAHS3_5,
        MIN(averageV1) AS LH_avgV1,
        MIN(averageV2) AS LH_avgV2,
        MIN(averageV3) AS LH_avgV3,
        'VASH_MIN_result' AS type
      FROM filtered_CC
      UNION ALL
      SELECT 
        MAX(VAHSA),
        MAX(VAHSB),
        MAX(VAHSC),
        MAX(averageV1),
        MAX(averageV2),
        MAX(averageV3),
        'VASH_MAX_result'
      FROM filtered_CC;`,
  ];

  const sql_Related_minmax_PFCC = [
    "from testmerge_pf where parameter like '023' and VS28!='' and VAHS28 !='' ",
    "from testmerge_cc1orcc2 where parameter like '010' and VSA!='' and VAHSA !='' ",
    "from testmerge_cc1orcc2 where parameter like '017' and VSA!='' and VAHSA !='' ",
  ];

  //日期區間
  const between_date = ` AND STR_TO_DATE(
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
      ) BETWEEN '${itemStartDate} 00:00:00' AND '${itemEndDate} 23:59:59' `;

  //----------------end---------------

  try {
    let all_sql = "",
      sql_min = "";
    sql_max = "";
    sql_minmax_combind = "";
    sql_Min_Max_Merge = "";

    //確定要查詢那個table
    //化成站 PF
    if (select_side_name === "PF") {
      all_sql =
        select_columns[0] + select_columns_Date[0] + sql_Related_PFCC[0];

      // sql_min = select_min_col[0] + sql_Related_minmax_PFCC[0];
      // sql_max = select_max_col[0] + sql_Related_minmax_PFCC[0];
      sql_minmax_combind =
        select_filter_PFCC_titile[0] + sql_Related_minmax_PFCC[0];
    }
    //分容站 CC1
    else if (select_side_name === "CC1") {
      all_sql =
        select_columns[1] + select_columns_Date[0] + sql_Related_PFCC[1];
      // sql_min = select_min_col[1] + sql_Related_minmax_PFCC[1];
      // sql_max = select_max_col[1] + sql_Related_minmax_PFCC[1];
      sql_minmax_combind =
        select_filter_PFCC_titile[1] + sql_Related_minmax_PFCC[1];
    }
    //分容站 CC2 (分選判別)
    else if (select_side_name === "CC2") {
      all_sql =
        select_columns[1] + select_columns_Date[0] + sql_Related_PFCC[2];
      // sql_min = select_min_col[1] + sql_Related_minmax_PFCC[2];
      // sql_max = select_max_col[1] + sql_Related_minmax_PFCC[2];
      sql_minmax_combind =
        select_filter_PFCC_titile[1] + sql_Related_minmax_PFCC[2];
    }

    //當有指定年月
    if (isChecked === "false") {
      console.log(
        `${select_side_name}站有指定-> ${itemYear}年${itemMonth}月數據`
      );
      //sql_Related_PFCC += ` and str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d') >= '${itemYear}-${itemMonth}-01' and str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d') <= '${itemYear}-${itemMonth}-${nowdate}'`;
      all_sql +=
        `and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}'` +
        between_date;

      // sql_min +=
      //   ` and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}'` +
      //   between_date;
      // (" union all \n");
      // sql_max +=
      //   ` and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}'` +
      //   between_date;

      sql_minmax_combind +=
        ` and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}'` +
        between_date +
        `\n ) \n`;
    } else {
      console.log(
        `${select_side_name}站總->${select_side_name}${itemYear}全年月數據`
      );
      all_sql += ` and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}' and month(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemMonth}' `;

      // sql_min +=
      //   `  and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}' and month(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemMonth}' ` +
      //   " union all \n";
      // sql_max += `and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}' and month(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemMonth}' `;

      sql_minmax_combind +=
        ` and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemYear}'
        and month(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) like '${itemMonth}'` +
        `\n ) \n`;
    }

    //升冪排序(日期由舊到新),Not Desc
    all_sql += ` order by extracted_filter;`;

    //重新query最大最小 (已合併)
    select_side_name === "PF"
      ? (sql_minmax_combind += select_minmax_PFCC_end[0])
      : (sql_minmax_combind += select_minmax_PFCC_end[1]);

    //將最(小,大)值的sql語法合併在一起
    // sql_Min_Max_Merge = sql_min + sql_max;

    console.log("all_sql:", all_sql);
    // console.log("sql_Min_Max_Merge: ", sql_Min_Max_Merge);
    // console.log("sql_minmax_combind:", sql_minmax_combind);

    //先收集全部數據庫日期(由最舊到最新)
    const [PFCC_Analysis_data] = await dbmes.query(all_sql);

    //console.log("全部數據庫日期：", PFCC_Analysis_data);

    const filterAllData = [];
    PFCC_Analysis_data.forEach((item) => {
      const dateObj = new Date(item.extracted_filter);
      const year = dateObj.getFullYear();
      const month = (dateObj.getMonth() + 1).toString().padStart(2, "0"); // 确保月份是两位数
      const day = dateObj.getDate().toString().padStart(2, "0"); // 确保日期是两位数
      const formattedDate = `${year}-${month}-${day}`; // 格式化为 YYYY:MM:DD

      // // 在原数据中替换 extracted_filter 字段为格式化后的日期
      // filterAllData.push({
      //   ...item,
      //   extracted_filter: formattedDate,
      // });
      // 创建一个新对象，转换字串数字为浮点数
      const transformedItem = {};

      Object.keys(item).forEach((key) => {
        const value = item[key];

        if (key === "VAHSA" || key === "VAHSB" || key === "VAHSC") {
          // CC1 站的鍵名轉換
          newKey = keyMap_CC1and2[key] || key; // 使用映射表转换键名
        } else {
          newKey = key; // 保持原键名
        }
        // 跳过 extracted_filter，因为我们单独处理
        if (key === "extracted_filter") {
          transformedItem[newKey] = formattedDate;
        } else if (typeof value === "string" && !isNaN(value)) {
          transformedItem[newKey] = parseFloat(value);
        } else {
          transformedItem[newKey] = value;
        }
      });

      filterAllData.push(transformedItem);
    });

    // console.log("filterAllData:", filterAllData); // 顯示轉換後的日期數據

    scatterdigram_SearchData = []; // 清空全域變數
    scatterdigram_SearchData.push({ overall: filterAllData }); // 將資料存入全域變數

    //在收集目前條件式所提供之每個電芯電性參數(Min,Max)->透過math計算的數據
    //PF 取值(LH_VAHS2_8 , LH_VAHS3_2 , LH_VAHS3_5)
    //CC1 取值(LH_VAHS2_8,LH_VAHS3_2,LH_VAHS3_5,LH_avgV1,LH_avgV2,LH_avgV3)

    const [PFCC_Analysis_Range] = await dbmes.query(sql_minmax_combind);

    // console.log(
    //   "PFCC_Analysis_Range 結果為= " +
    //     JSON.stringify(PFCC_Analysis_Range, null, 2)
    // );

    const minData = PFCC_Analysis_Range.find(
      (item) => item.type === "VASH_MIN_result"
    );

    const maxData = PFCC_Analysis_Range.find(
      (item) => item.type === "VASH_MAX_result"
    );

    const minValues = Object.entries(minData)
      .filter(([key]) => key !== "type") // 排除 type 欄位
      .map(([_, value]) => {
        const caculator_num = parseFloat(value);
        return !isNaN(caculator_num) ? caculator_num : "";
      }); // 轉換為浮點數);

    const maxValues = Object.entries(maxData)
      .filter(([key]) => key !== "type") // 排除 type 欄位
      .map(([_, value]) => {
        const caculator_num = parseFloat(value);
        return !isNaN(caculator_num) ? caculator_num : "";
      }); // 轉換為浮點數);

    // maxValues.forEach((value, index) => {
    //   if (value === null) {
    //     maxValues[index] = ""; // 將 null 值替換為空字串
    //   }
    // });

    // console.log("VASH_MIN_result 結果為:", minValues);
    // console.log("VASH_MAX_result 結果為:", maxValues);

    scatterdigram_SearchData.push({ min_list: minValues }); // 將資料存入全域變數
    scatterdigram_SearchData.push({ max_list: maxValues }); // 將資料存入全域變數

    // const LH_VAHS2_min = PFCC_Analysis_Range[0]["LH_VAHS2_8"];
    // const LH_VAHS2_max = PFCC_Analysis_Range[1]["LH_VAHS2_8"];

    // console.log(
    //   select_side_name === "PF" ? "PF_LH_VAHS2_min: " : "CC1_LH_VAHS2_min: ",
    //   LH_VAHS2_min
    // );
    // console.log(
    //   select_side_name === "PF" ? "PF_LH_VAHS2_max: " : "CC1_LH_VAHS2_max: ",
    //   LH_VAHS2_max
    // );

    //console.log(filterAllData); // 顯示轉換後的日期數據

    // const filterAllData = PFCC_Analysis_data
    //   // .filter((item) => item.type === "plotDate")
    //   .map((item) => {
    //     const dateObj = new Date(item.extracted_filter);
    //     const formatted = dateObj.toISOString().split("T")[0]; // 抓 YYYY-MM-DD
    //     return formatted;
    //   });

    // console.log("filterAllData:", filterAllData[filterAllData.length - 1]);

    // console.log(
    //   "scatterdigram_SearchData:",
    //   scatterdigram_SearchData[0].overall
    // );

    //以下為電檢站的電池封口厚度數據 (Min Max)-----start------------
    // const test_echk_sealthick_sql = Echk_Sealthick_SQL();
    // // console.log("test_echk_sealthick_sql: ", test_echk_sealthick_sql);
    // const [Sealthick_data] = await dbmes.query(test_echk_sealthick_sql);

    // const Sealthick_summary = {};

    // console.log("Sealthick_data:", Sealthick_data);

    // Sealthick_data.forEach((item) => {
    //   if (item.type.startsWith("bat_Sealthick_")) {
    //     const match = item.type.match(
    //       /bat_Sealthick_(?:PARAM)?(\d{1,2})_(Min|Max)/
    //     );
    //     if (match) {
    //       //const paramNum = match[1]; // 例如 "03"
    //       const paramNum = match[1].padStart(2, "0"); // 轉為 2 位數，例如 "3" → "03"
    //       const bound = match[2]; // "Min" 或 "Max"

    //       if (!Sealthick_summary[paramNum]) {
    //         Sealthick_summary[paramNum] = {};
    //       }

    //       Sealthick_summary[paramNum][bound] = item.result;
    //       console.log(
    //         `PARAM${paramNum} ${bound}: ${item.result} (${item.type})`
    //       );
    //     }
    //   }
    // });

    // console.log(Sealthick_summary["03"].Min); // 對應 PARAM03 的最小值
    // console.log(Sealthick_summary["03"].Max); // 對應 PARAM03 的最大值
    //---------電檢站的電池封口厚度數據 end ------------

    return res.status(200).json({
      message:
        isChecked === "true"
          ? "取得總電化學PFCC數據成功"
          : `取得${itemYear}年,${itemMonth}月份電化學PFCC數據成功`,
      overall: scatterdigram_SearchData[0].overall,
      min_list: scatterdigram_SearchData[1].min_list,
      max_list: scatterdigram_SearchData[2].max_list,
    });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得電化學PFCC數據錯誤",
    });
  }
});


//取得電芯前綴序號列表清單
router.get("/model_prefixlist", async (req, res) => {

  const {
    sidename ,
    sultingcase 
  } = req.query;

  //擷取對應之站別serial query
  find_serial_list(sidename ,sultingcase );
  //console.log("serial_query資料庫查詢 = " + serial_query);
   
  try {    
    //查詢目前各站之前綴清單
    const [serial_prefix_list] = await dbmes.query(serial_query);    
    // console.log("查詢結果 = " +  JSON.stringify(serial_prefix_list,null,2));

    if(Object.values(serial_prefix_list).length ===0){
       return res.status(401)({
        message:
          `查詢無任何清單: ${serial_query}`      
      });
    }

    return res.status(200).json({
      message:
        `分選站:${sultingcase} 查詢電芯前綴清單完成!`,
       data: serial_prefix_list      
    });

    // return res.status(200).json({
    //   message:
    //     "查詢電芯前綴清單完成!",
    //    data: `接收的參數為=${sidename} 和 ${sultingcase} `      
    // });

  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得數據錯誤",
    });
  }  
});

//取 Min , Max , DigitalNum , total做後續查詢位元指定
router.get("/get_serial_Digital", async (req, res) => {
    const {
      s_number, serial_number ,cc_type
  } =  req.query;

  //  console.log(
  //   "API request",
  //   req.method,
  //   req.url,
  //   req.query
  // );

  console.log( `[${Date.now()}] 第+ ${s_number} 組查詢 ,選擇前綴電芯查詢=  ${serial_number}  選擇CC樣式為 = ${cc_type}`);
  
  const init_minmax_sql = `
                WITH base AS (
                  SELECT
                      MIN(CAST(REGEXP_SUBSTR(modelId, '[0-9]+$') AS UNSIGNED)) AS min_seq,
                      MAX(CAST(REGEXP_SUBSTR(modelId, '[0-9]+$') AS UNSIGNED)) AS max_seq
                  FROM mes.testmerge_cc1orcc2
                  WHERE modelId LIKE '${serial_number}%'
                    AND parameter = '${cc_type}'
              )
              SELECT
                  b.min_seq,
                  b.max_seq,
                  LENGTH(b.min_seq) AS min_same_digit,    
                  POWER(10, LENGTH(b.max_seq)) - 1 AS max_same_digit,
                  COUNT(*) AS related_count
              FROM mes.testmerge_cc1orcc2 t
              JOIN base b
              WHERE t.modelId LIKE '${serial_number}%'
                AND t.parameter = '${cc_type}'
                AND CAST(REGEXP_SUBSTR(t.modelId, '[0-9]+$') AS UNSIGNED)
                    BETWEEN b.min_seq AND (POWER(10, LENGTH(b.max_seq)) - 1);`; 

                
  let push_level_list = [];
  const new_Gradespan_list = [];
  try {    

    // console.log("init_minmax_sql = "+ init_minmax_sql);
    //查詢最小最大範圍以及符合序號列名 最小(長度位元數) 最大(1~99XX)數列
    const [row_digital] = await dbmes.query(init_minmax_sql);    
    const adjust_result = row_digital.map(item => {    
       const adjusted_value = {};  
       Object.entries(item).forEach(([key, value]) => {
        // console.log("鍵名為: "+ key+ " 解取值為:"+value)
        //當最大最小digit 需要做轉換
        if(value !== null){   
            if(minmax_str.includes(key.trim(''))){
              adjusted_value[key] =  convert_10digital(key ,value);
              //將值存入並後續重整陣列
              push_level_list.push(adjusted_value[key]);
            } else{
              adjusted_value[key] = value ?? 0;
            }  
           
        }else {
          //當無效null 轉為值0 
          adjusted_value[key] = value ?? 0;
        }                
       });
       return adjusted_value;
    });

    // console.log(`電芯前綴:${serial_number} / 分容:${cc_type} , 最小最大範圍查詢結果  = ` +  JSON.stringify(adjust_result,null,2));


    //將重新制定義級距陣列元素list
    const min_index = push_level_list.length ? Math.min(...push_level_list) : 0;
    const max_index = push_level_list.length ? Math.max(...push_level_list) : 0;
    // console.log("最小值為: " +  min_index+  "最大值為: " +  max_index);

    if(min_index === max_index){
          new_Gradespan_list.push(min_index||max_index);
    }else{
        for (let i = min_index; i <= max_index; i *=10) {
            new_Gradespan_list.push(i);
         }
    }
    // console.log("最後回傳電容級距range="+ typeof new_Gradespan_list  +" 值為右項: " +  Object.values(new_Gradespan_list));
    
    res.status(200).json({message:"查詢MinMax驗證可!" , positive_data: Object.values(new_Gradespan_list)});

  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得最小最大數位碼錯誤",
    });
  }
});


//取得前綴序號*針對位元長度索引對應電芯號name 
router.post("/get_prefix_modelID_name", async (req, res) => {

  const  request_param = req.body;

  if (request_param.batchId === undefined || request_param.batchId === null) return res.status(400).json({ message: "缺少 batchId" });

  // console.log("取得前綴序號*針對位元長度索引參數為 = "+ JSON.stringify(request_param,null,2));

  //取當前batchId 內容
  const batchId = request_param.batchId;

  // 紀錄版本
  const current = batchMap.get(batchId) || { version: 0 };
  const newVersion = current.version + 1;
  batchMap.set(batchId, { version: newVersion });
  const thisVersion = newVersion;
 

  try {  
    // ⚠️ 只回最後一筆完成的 request
    const latest = batchMap.get(batchId);

    if (!latest || latest.version !== thisVersion) {
      console.log("舊 request，丟棄");
      return res.status(204).end();
    }

    const all_request_len = Object.values(request_param).length;
    const content_search = `最後request回傳控制ID號碼  = ", ${request_param.s_number} + " 分容為:" + ${request_param.cc_type}  + "查詢前綴序號為:" + ${request_param.serial_number} + " 級距:" + ${request_param.grade_span} + "批次碼:" ${batchId}`;
    // console.log(content_search);

    const grade_value = Number(!request_param.grade_span?'1':request_param.grade_span);
    
    //將收到級距針對 cctype 執行query
    const grade_modleid_sql = `                              
                              SELECT DISTINCT modelId 
                              FROM mes.testmerge_cc1orcc2 m 
                              WHERE m.modelId LIKE ?
                                AND m.parameter = ?
                                AND CAST(REGEXP_SUBSTR(m.modelId, '[0-9]+$') AS UNSIGNED)
                                  BETWEEN ? AND (POWER(10, LENGTH(?)) - 1)
                              `;
    // console.log("查詢針對cctype 級距 query 電芯list : "+grade_modleid_sql);

    // 電芯號modleID 查詢                    
    const [cell_modlename] = await dbmes.query(grade_modleid_sql ,[
      `${request_param.serial_number}%`,
      request_param.cc_type,
      grade_value,
      grade_value
    ]);  
    
    // if (cell_modlename.length === 0) {
    //     console.log("查無資料！");        
    // } else {
    //   console.log("原始取得電芯list = " + JSON.stringify(cell_modlename,null,2));      
    // }

    //因兩層陣列 , 需要攤平flatten 一層陣列
    const flattened = cell_modlename.flat();
    const modleid_all = flattened.map(r => r?.modelId).filter(id => id && id.trim() !== "");
    
    // console.log("結構為陣列: " +  Array.isArray(modleid_all)  + "總查詢數量為:" + modleid_all.length  + " 調整取得list為: " + modleid_all);

    res.status(200).json({ message:content_search , allmodleID:modleid_all , total: modleid_all.length === 1 && modleid_all[0] ===""?0:modleid_all.length});
  }catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得前綴序號針對位元長度索引參數錯誤!",
    });
  }

});

//透過使用者選定modleid,後續查詢對應壓段各電容量數值
router.post("/get_modle_capacity_val", async (req, res) => {
  const  search_modle_all = req.body; 
  const refix_define_dataall = {};
  console.log("得到body 變數結構是否為陣列:"+ Array.isArray(search_modle_all) +" 組態為:"+ JSON.stringify(search_modle_all,null,2));

   //物件內組態陣列
    Object.entries(search_modle_all).forEach(([key, matrix_data], index) => {

      if (!Array.isArray(matrix_data)) return;

      const total_length = Object.values(matrix_data).length;
      const total_modleod = [];
      let save_cctypekey = [];
      matrix_data.map((item,index)=>{
       const cc_name = item.cc_type;
       const model_name = item.modle_name;              
       
       total_modleod.push(model_name);

       //初始化key組態
        if (!refix_define_dataall[cc_name]) {
          refix_define_dataall[cc_name] = [];
          save_cctypekey.push(cc_name);
        }                
      })

       // 這組資料的 cc_type(確保都是同一個cctype)
      const cc_name_check_OK = save_cctypekey.length === 1 && key_cc_type.includes(save_cctypekey[0]);
      
      //將組態重整
      if(cc_name_check_OK){
        const cc_name_final = save_cctypekey[0] || matrix_data[0]?.cc_type;
        // console.log(cc_name_final + " 分選type 一共有 : "+ total_length+"組");
        refix_define_dataall[cc_name_final] = total_modleod;
      }      
  });

  //  console.log("送出JSON modlelist 重整組態為:"+ JSON.stringify(refix_define_dataall,null,2) );


  
  //應該使用 ? 佔位符 + array 傳入 JSON 參數，而不是把 JSON 字串直接插到 SQL 裡
  const keys = Object.keys(refix_define_dataall);

  // const unionAllSql_json = keys.map(key => {
  //  // JSON_TABLE 要的字串格式，直接 stringify 再用單引號包住即可
  //   const jsonStr = JSON.stringify(refix_define_dataall[key]);
  //   let totoal_json_all = `
  //     SELECT '${key}' AS parameter, jt.modelId FROM JSON_TABLE('${jsonStr}', '$[*]' COLUMNS(modelId VARCHAR(25) PATH '$')) AS jt
  //   ` .replace(/[\n\r\t]+/g, ' ')   // 去掉換行、回車、Tab
  //     .replace(/\s+/g, ' ')        // 多空格壓縮成一個
  //     .trim();;
  //   return totoal_json_all;
  // }).join(' UNION ALL ');

  const unionAllSql_in = keys.map(key => {
    const idList = refix_define_dataall[key].map(id => `'${id}'`).join(', ');
    return `SELECT '${key}' AS parameter, t.modelId ,t.VAHSA,t.VAHSB, t.VAHSC 
            FROM mes.testmerge_cc1orcc2 t
            WHERE t.parameter='${key}' AND t.modelId IN (${idList})`;
  }).join(' UNION ALL ');

  try {  
    // 查詢SQL
    // const Search_Sql = `SELECT t.* FROM mes.testmerge_cc1orcc2 t JOIN (${unionAllSql_json}) AS j ON t.parameter = j.parameter AND t.modelId = j.modelId`.replace(/\s+/g, ' ')
    //                 .trim();

    // 將 SQL 壓縮成單行
    const Search_Sql = unionAllSql_in.replace(/\s+/g, ' ').trim();
                   
    // const test_sql = `
    //                 SELECT '010' AS parameter, jt.modelId  
    //                 FROM JSON_TABLE(
    //                   '["MW2027B00101","MW2027B00106"]',
    //                   '$[*]' COLUMNS(modelId VARCHAR(25) PATH '$')
    //                 ) AS jt;
    //                 `;

    //MySQL 會正確識別 JSON，而不是普通字串
    const [results] = await dbmes.query(Search_Sql);
    // const [rows] = await dbmes.query('SELECT VERSION() AS version');
   // const [results] = await dbmes.query(test_sql);

    const cc_type_cap_total = results.reduce((acc,item) => {
       // 決定 prefix
        let prefix = "";
        if (item.parameter === "010") prefix = "CC1_cap_amount";
        else if (item.parameter === "017") prefix = "CC2_cap_amount";

        if (!prefix) return acc;

        // 初始化該 group
        if (!acc[prefix]) {
          acc[prefix] = {};
        }

       Object.keys(item).forEach( (key,index) => {                       
        //確認有前綴VAHS
        if(key.startsWith("VAHS")) {
          acc[prefix][key] = (acc[prefix][key] || 0) + Number(item[key] || 0);
        }
      });
      return acc;
    }, {});

    
                     
     res.status(200).json({ msg:"有收到get_modle_capacity_val需求,查詢OK"  , finallyResluts: results, cc_cap_total: cc_type_cap_total});

  }catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得電芯電容量資訊解取異常!",
    });
  }


});

//取得指定(分選選單CC1 or CC2) 或 (化成all)數據回傳到前端
router.post('/get_cellinfo_fromSulting', async (req, res) => {
  const  search_cap_Sulting = req.body;   
  console.log("得到body 變數結構是否為陣列:"+ Array.isArray(search_cap_Sulting) +" 組態為:"+ JSON.stringify(search_cap_Sulting,null,2));

    // 針對前端提交分頁參數
    const cctype_serial = search_cap_Sulting.cc_serial || "";
    const page = parseInt(search_cap_Sulting.numpage) || 1;
    const pageSize = parseInt(search_cap_Sulting.page_Size) || 20;
    const keyword = search_cap_Sulting.keyword || ''; // 電芯序號關鍵字
    const station = search_cap_Sulting.cap_side || ''; // 篩選分容side
    const sortOrder = search_cap_Sulting.sortOrder === 'asc' ? 'ASC' : 'DESC'; // 預設 DESC
    const stDate = search_cap_Sulting.stDate || '';
    const edDate = search_cap_Sulting.edDate || '';
    const sulting_side = search_cap_Sulting.sulting_side || "sulting_cc"; //  預設查詢分容CC
    // const isexport_excel = search_cap_Sulting.export_excel  ? true : false;

    const offset_sulting = (page - 1) * pageSize;

    //不用station 站點 wherecause 搜尋
    const ignore_station = [ "全部資料"]

    // 動態條件組合
    const conditions = station.includes("全部")?[` Para <> ''`]:[`Para like '${station}'`];
    const conditions_2 = get_suliting_normal_condition ( station , sulting_side) ;
    const final_search_table = sulting_side === "sulting_cc" ? "mes.testmerge_cc1orcc2":"mes.testmerge_pf";

    const params = [];

    if (cctype_serial) {        
      const serial_add = keyword !==undefined && keyword!=="" ?`modelId REGEXP '^${cctype_serial}.*${keyword.trim()}'`:`modelId LIKE '${cctype_serial}%'`;
      // conditions.push(`${serial_add}`);
      conditions_2.push(`${serial_add}`);
      params.push(`'${cctype_serial}%'`);
    }

    // if (keyword) {
    //   params.push(`%${keyword.trim()}%`);           
    // }


    let whereClause = ` WHERE STR_TO_DATE(CONCAT(SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                          CASE 
                            WHEN EnddateD LIKE '%上午%' THEN 'AM'
                            WHEN EnddateD LIKE '%下午%' THEN 'PM'
                            ELSE ''
                          END
                        ),'%Y/%m/%d %I:%i:%s %p') BETWEEN '${stDate} 00:00:00' and '${edDate} 23:59:59'`;
    
    const orderbt_str = `ORDER BY STR_TO_DATE(
                          CONCAT(
                            SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
                            SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                            CASE 
                              WHEN EnddateD LIKE '%上午%' THEN 'AM'
                              WHEN EnddateD LIKE '%下午%' THEN 'PM'
                              ELSE ''
                            END
                          ),'%Y/%m/%d %I:%i:%s %p') ${sortOrder} `;

    // const where_conditions_case = (conditions.length > 0 && whereClause!='') ? conditions.join(' AND ') : ''; 
    const where_conditions_case = (conditions_2.length > 0 && whereClause!='') ? conditions_2.join(' AND ') : '';      
    whereClause? whereClause +=` AND ${where_conditions_case}`:'';
        
  try {  
      // 先確定查詢的總筆數
      const countSql = `SELECT COUNT(*) as total FROM ${final_search_table} ${whereClause}`;      
      const [countResult] = await dbmes.query(countSql, params);
      const total = countResult[0].total;
      const totalPages = (!isNaN(total) && NUMBER(total)===0)?1:Math.ceil(total / pageSize);

       // 查當頁資料
      const dataSql = `
        SELECT *
        FROM ${final_search_table}
        ${whereClause}
        ${orderbt_str}
        LIMIT ? OFFSET ? 
      `;

      // LIMIT & OFFSET 加到參數
      const dataParams = [pageSize, offset_sulting];
      const [rows_info] = await dbmes.query(dataSql, dataParams);

      const detail_info ={
        page,
        pageSize,
        total,
        totalPages
      }

      // res.status(200).json({ msg:`查詢sql: ${sulting_side}站 電芯需求,回傳告知!` ,  result_allinfo: rows_info ,view_param:detail_info});

      res.status(200).json({ msg:"TEST 查詢分選電芯需求,回傳告知!" , count_sql:countSql   ,result_allinfo: countResult , view_param:detail_info , final_sql_result: rows_info});
  }
  catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得get_cellinfo_fromSulting -> 電芯電容量資訊解取異常!",
    });
  }
});

//匯出EXCEL for 分選站查詢頁面按鈕 (目前為前端產生excel使用數據流,但考慮到進度表不是真實,預留此)
router.get("/export_excel_sulting", async (req, res) => {
   const {
    cc_serial,
    keyword,
    cap_side,
    stDate,
    edDate,
    sortOrder,
    sulting_side
  } = req.query;

  // 針對前端數據流參數
    const cctype_serial = cc_serial.trim() || "";
    const search_serial = !isNaN(keyword.trim())? Number(keyword.trim()) : ""; // 電芯序號關鍵字
    const station = cap_side.trim() || ''; // 篩選分容side
    const sortOrder_case = sortOrder === 'asc' ? 'ASC' : 'DESC'; // 預設 DESC
    const stDate_str = stDate || '';
    const edDate_str = edDate || '';
    const sulting_sidecase = sulting_side.trim() || "sulting_cc"; //  預設查詢分容CC

    let whereClause = ` WHERE STR_TO_DATE(CONCAT(SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                          CASE 
                            WHEN EnddateD LIKE '%上午%' THEN 'AM'
                            WHEN EnddateD LIKE '%下午%' THEN 'PM'
                            ELSE ''
                          END
                        ),'%Y/%m/%d %I:%i:%s %p') BETWEEN '${stDate_str} 00:00:00' and '${edDate_str} 23:59:59'`;
    
    const orderbt_str = `ORDER BY STR_TO_DATE(
                          CONCAT(
                            SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
                            SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
                            CASE 
                              WHEN EnddateD LIKE '%上午%' THEN 'AM'
                              WHEN EnddateD LIKE '%下午%' THEN 'PM'
                              ELSE ''
                            END
                          ),'%Y/%m/%d %I:%i:%s %p') ${sortOrder_case} `;


    // 動態條件組合
    const conditions = station.includes("全部")?[` Para <> ''`]:[`Para like '${station}'`];
    const conditions_2 = get_suliting_normal_condition ( station ,  sulting_sidecase) ;
    const final_search_table = sulting_sidecase === "sulting_cc" ? "mes.testmerge_cc1orcc2":"mes.testmerge_pf";


    const params = [];

    if (cctype_serial) {        
      const serial_add = search_serial!=="" ?`modelId REGEXP '^${cctype_serial}.*${search_serial}'`:`modelId LIKE '${cctype_serial}%'`;
      // conditions.push(`${serial_add}`);
      conditions_2.push(`${serial_add}`);
      params.push(`'${cctype_serial}%'`);
    }

    const where_conditions_case = (conditions_2.length > 0 && whereClause!='') ? conditions_2.join(' AND ') : '';      
    whereClause? whereClause +=` AND ${where_conditions_case}`:'';

  
  try { 


     // 查當前param查詢資料數據流
      const dataSql_excelonly = `
        SELECT *
        FROM ${final_search_table}
        ${whereClause}
        ${orderbt_str}       
      `;

     const [rows_excelinfo] = await dbmes.query(dataSql_excelonly);

    res.status(200).json({ msg:"匯出EXCEL數據回傳告知!" , result_excel_allinfo: rows_excelinfo  });

  }catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得export_excel_sulting -> 電芯電容量資訊匯出EXEL有異常!",
    });
  }
});


//取得分選CC1 和 CC2 各自 總電芯查詢數量
router.get("/sultin_CapPercent", async (req, res) => {

  const { prefixname } = req.query;

  try{
      const dataSql_count = `SELECT COUNT(DISTINCT IF(Para = 'CC1', modelId, NULL)) AS CC1_count,
                                    COUNT(DISTINCT IF(Para = 'CC2', modelId, NULL)) AS CC2_count
                             FROM mes.testmerge_cc1orcc2
                             WHERE modelId REGEXP '^${prefixname}'`; 

      const [rows_cap_total] = await dbmes.query(dataSql_count);  
    


    res.status(200).json({ msg:`找出${prefixname} CC1 CC2比例數量回傳告知!` , cap_total: rows_cap_total });


  }catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得sultin_CapPercent -> 電芯電容量CC1 CC2 比例數量有異常!",
    });
  }

});


//取得taskID , 用此執行excel 進度在後端進行並將進度值回傳react 前端
router.get("/export_taskID", async (req, res) => {
  
   try {
        //自帶生成UUID ad TaskID
        const taskId = crypto.randomUUID();
        //重新宣告存取區
        progressMap = new Map();       
        progressMap.set(taskId, 0);

        // 真正 background job
        generateExcelAsync(taskId, req.query);

        res.status(200).send({ Task_ID :taskId});

    }catch (error) {
      console.error("發生錯誤", error);
      res.status(400).json({
        message: "取得export_taskID -> 取得taskID或轉換資料流有異常!",
      });
    }
});

//針對寫入進度做回應訊息監控
router.get("/progress_taskID/:taskId", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const taskId = req.params.taskId;

   const timer = setInterval(() => {

    // 🟢 safety check（很重要）
    if (!progressMap) {
      clearInterval(timer);
      return res.end();
    }

     const state = progressMap.get(taskId) || {
      progress: 0,
      status: "running"
    };

    res.write(`data: ${JSON.stringify(state)}\n\n`);

    // const p = progressMap.get(taskId) || 0;
    // res.write(`data: ${p}\n\n`);
 // ✅ 正確判斷 progress
    if (state.progress >= 100 || state.status === "done") {
      clearInterval(timer);
      res.end();
    }
  }, 200);
});

//下載EXCEL專用 api query here!
router.get("/exportdownload/:taskId", (req, res) => {
  const {taskId} = req.params;
  const filePath = fileMap.get(taskId);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("file not ready");
  }

  const cleanUp = () => {
    fileMap.delete(taskId);
    progressMap.delete(taskId);
  };

  // ✔ fallback（避免 user 沒下載）
  const timer = setTimeout(cleanUp, 1000 * 60 * 30);

  res.download(filePath, "export.xlsx", (err) => {
    clearTimeout(timer); // ❗避免 double cleanup
    cleanUp();
  });
  
});


//針對選擇的站別取出->異常trayID 清單 (條件為:有異常之電容maH ("",NUll,0))
router.get("/trayid_nglist", async (req, res) => {
  const {
    sidename 
  } = req.query;
  
  const start_date  = dayjs("2024-01-01").hour(0).minute(0).second(0).format("YYYY-MM-DD HH:mm:ss");
  //today_datesstr <- 當天日期 23:59:59

  // console.log("目前索引最終收尾日期為: "+ dayjs(today_datesstr).format("YYYY-MM-DD HH:mm:ss")); 

  const { status_str , DB_table , ack_type , column_map , voltage_gap_list } = sorting_change_mapping[sidename]||{};
  const all_change_param = `all_change:  ${status_str} -  ${DB_table}  -  ${ack_type} - ${column_map} -  ${voltage_gap_list}`;
  const get_ack_type_split = String(ack_type).split(' ');
  const ack_type_first = String(get_ack_type_split[0]).trim('');

  console.log(`
      得出 sorting change 結果為:
      status_str      : ${status_str}
      DB_table        : ${DB_table}
      ack_type        : ${ack_type}
      column_map      : ${column_map}
      voltage_gap_list: ${voltage_gap_list}
  `);


 // 用三層replace \r 並不是 ASCII 13 (0x0D)給予完整過濾掉
 //   REPLACE(
 //     REPLACE(
 //         REPLACE(TRIM(t.trayID), '\r', ''),
 //         '\n', ''
 //     ),
 //     '\t', ''
 //  ),


//  只保留最近 N 個
// 例如只要最近三個

// SUBSTRING_INDEX(
//     GROUP_CONCAT(
//         DISTINCT t.FileName
//         ORDER BY t.FileName DESC
//         SEPARATOR ','
//     ),
//     ',',
//     3
// ) AS FileName

  const trayID_NG_query = `
                          SELECT
                              GROUP_CONCAT(
                                   DISTINCT CASE
                                    WHEN
                                        COALESCE(NULLIF(TRIM(${column_map[0]}),''),'NULL') IN ('0','NULL','null','')
                                    OR COALESCE(NULLIF(TRIM(${column_map[1]}),''),'NULL') IN ('0','NULL','null','')
                                    OR COALESCE(NULLIF(TRIM(${column_map[2]}),''),'NULL') IN ('0','NULL','null','')
                                    THEN t.FileName
                                END
                                ORDER BY t.FileName DESC
                                SEPARATOR ','
                              ) AS FileName,
                             REGEXP_REPLACE(
                              t.trayID,
                              '[[:space:]]',
                              ''
                            ) AS tray_label,
                            ${ack_type},
                              sum(
                              COALESCE(NULLIF(TRIM(${column_map[0]}),''),'NULL') IN ('0','NULL','null','')
                              ) AS ${voltage_gap_list[0]},
                              sum(
                                COALESCE(NULLIF(TRIM(${column_map[1]}),''),'NULL') IN ('0','NULL','null','')
                              ) AS ${voltage_gap_list[1]},
                              sum(
                                  COALESCE(NULLIF(TRIM(${column_map[2]}),''),'NULL') IN ('0','NULL','null','')
                              ) AS ${voltage_gap_list[2]}
                          FROM ${DB_table} t
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
                                  '%Y/%m/%d %I:%i:%s %p'
                                ) BETWEEN '${start_date}' AND '${today_datesstr}'
                          GROUP BY
                              REGEXP_REPLACE(
                              t.trayID,
                              '[[:space:]]',
                              ''
                            ),
                            ${ack_type_first}
                          HAVING
                              ${voltage_gap_list[0]} > 0
                              OR ${voltage_gap_list[1]} > 0
                              OR ${voltage_gap_list[2]} > 0
                          ORDER BY MAX(
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
                            ) 
                          ) DESC;
                        `;
    
  //將NG query 換行,跳行,溢位的情況壓縮為一行顯示(DEBUG用)
   const sql_issue_trayid_list = trayID_NG_query
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();

   try {    
    //查詢目前各站之前綴清單
     const [error_trayid_nglist] = await dbmes.query(sql_issue_trayid_list);    
    //console.log("查詢結果 = " +  JSON.stringify(error_trayid_nglist,null,2));

    // if(Object.values(error_trayid_nglist).length ===0){
    //    return res.status(401)({
    //     message:
    //       `查詢無任何異常托盤清單: ${trayID_NG_query}`      
    //   });
    // }

    //console.log("目前要查詢異常trayID SQL = "+ trayID_NG_query);

    //依據站點回傳不同響應 
    //化成
    if( sidename.includes("sulting_pf")){
          //區分PF (SECI 或 CHROMA) 區塊
          const traylist_PF_SECI_parse =  Object.values(error_trayid_nglist??{})
          .filter(row => row.PF_TYPE  === "023" &&  /^PF.*-K/i.test(row.tray_label) ) 
          .map(row => ({
              ...row,
              PF_TYPE: "PF"
          }));


          const traylist_PF_CHROMA_parse =  Object.values(error_trayid_nglist??{})
          .filter(row => row.PF_TYPE  === "023" && /^FM.*/i.test(row.tray_label)) 
          .map(row => ({
              ...row,
              PF_TYPE: "PF"
          }));

         return res.status(200).json({
            message: `${status_str}->查詢異常電容量所屬托盤清單查詢完成!`,
            pf_SECI_traylist :  traylist_PF_SECI_parse,
            pf_CHROMA_traylist : traylist_PF_CHROMA_parse,          
        });
    } //分容(未分選, 32類已分選)
    else if( sidename.includes("sulting_cc")){
        //區分CC1尚未分選 與 CC2 32類分選 區塊, 且後續需要再區分 (SECI 和 CHROMA)廠商
        // const regex_SECI_EngOnly = /^CC-\d+-H/i;      // SECI-CC前綴trayid  條件(head 包含CC 開頭, end 包含 H開頭)
	      const regex_EngOnly = /^[A-Za-z]+$/;  //只有英文
        const regex_Chroma_Type = /^[A-Za-z0-9]+$/;   // 英文加數字

        //下列方法需要多次冗長判斷依照型態多少 ,就要建立多次(不建議但可)
        // const traylist_CC1_SECI_parse =  Object.values(error_trayid_nglist??{})
        //   .filter(row => 
        //     {
        //         if (row.CC_TYPE !== "CC1") return false;
        //         const [head, tail] = row.tray_label.split("-");
        //         return head.startsWith("CC") && tail.startsWith("H");
        //     }
        //   );

        //利用動態 Key 判定 (後續新增型態直接可,不用在多增加機制)
        const trayGroups = Object.values(error_trayid_nglist??{}).reduce(
          (acc, row) => {
              //找頭 ,尾的欄位
              const parts = String(row.tray_label).split("-");

              const head = parts[0];
              const tail = parts.at(-1);   // ES2022
              // const tail = parts[parts.length - 1];  // 舊版也可

              // const check_CC_HEAD_SECI =  head?.startsWith("CC") &&  regex_EngOnly.test(head);
              // const check_CC_HEAD_CHROMA =  head?.startsWith("CC") &&  regex_Chroma_Type.test(head);

              const vendor =
                head === "CC" && tail?.startsWith("H") ? "SECI" :
                head.startsWith("CC") && tail?.startsWith("CC") ? "CHROMA" :
                null;

              //如果都不在廠商列表就不繼續執行
              if (!vendor) return acc;

              const key = `${row.CC_TYPE}_${vendor}`;
              (acc[key] ??= []).push(row);
              return acc;
          },
          {}
        );

        const trayId_CC1_SECI_parse   = trayGroups.CC1_SECI ?? [];
        const trayId_CC1_CHROMA_parse = trayGroups.CC1_CHROMA ?? [];
        const trayId_CC2_SECI_parse   = trayGroups.CC2_SECI ?? [];
        const trayId_CC2_CHROMA_parse = trayGroups.CC2_CHROMA ?? [];

        return res.status(200).json({
            message: `${status_str}->查詢異常電容量所屬托盤清單查詢完成!`,         
            cc1_SECI_traylist: trayId_CC1_SECI_parse,
            cc1_CHROMA_traylist: trayId_CC1_CHROMA_parse,
            cc2_SECI_traylist: trayId_CC2_SECI_parse,
            cc2_CHROMA_traylist: trayId_CC2_CHROMA_parse,
            // finally_trayid_info: error_trayid_nglist
        });
    }else{
         return res.status(401).json({          
          message: `此:${sidename}站點目前無資料可查詢`
        });
    }
    
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得數據錯誤",
    });
  }  
});  
  
module.exports = router;
