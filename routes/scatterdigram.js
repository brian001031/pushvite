const express = require("express");
const router = express.Router();
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");


// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js");  // hr 資料庫

let scatterdigram_SearchData = [] , serial_query ="";

const keyMap_CC1and2 = {
  VAHSA: "V2_0VAh",
  VAHSB: "V3_6VAh",
  VAHSC: "V3_5VAhcom",
};

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


function find_serial_list ( side ) {

  if(side.toString() === "Sulting"){
      serial_query =`SELECT DISTINCT REGEXP_SUBSTR(modelId, '^[A-Z]+[0-9]+') AS model_prefix
                     FROM mes.testmerge_cc1orcc2 WHERE REGEXP_SUBSTR(modelId, '^[A-Z]+[0-9]+') IS NOT NULL
                    ORDER BY model_prefix;`;
  }else{
     serial_query ="";
  }  
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

    // console.log("all_sql:", all_sql);
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
    sidename    
  } = req.query;

  // console.log("sidename 接收為= "+ sidename);

  //擷取對應之站別serial query
  find_serial_list(sidename);
   // console.log("serial_query資料庫查詢 = " + serial_query);
   
  try {    
    //查詢目前各站之前綴清單
    const [serial_prefix_list] = await dbmes.query(serial_query);    
    console.log("查詢結果 = " +  JSON.stringify(serial_prefix_list,null,2));

    if(Object.values(serial_prefix_list).length ===0){
       return res.status(401)({
        message:
          `查詢無任何清單: ${serial_query}`      
      });
    }

    return res.status(200).json({
      message:
        "查詢電芯前綴清單完成!",
       data: serial_prefix_list      
    });

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
    prefix_serial_number    
    ,cc_type
  } =  req.query;

  console.log("選擇前綴電芯查詢= "+ prefix_serial_number + "  選擇CC樣式為 = " + cc_type);

  const search_sql = `
                WITH base AS (
                  SELECT
                      MIN(CAST(REGEXP_SUBSTR(modelId, '[0-9]+$') AS UNSIGNED)) AS min_seq,
                      MAX(CAST(REGEXP_SUBSTR(modelId, '[0-9]+$') AS UNSIGNED)) AS max_seq
                  FROM mes.testmerge_cc1orcc2
                  WHERE modelId LIKE 'RD0013%'
                    AND parameter = '010'
              )
              SELECT
                  b.min_seq,
                  b.max_seq,
                  LENGTH(b.min_seq) AS min_same_digit,    
                  POWER(10, LENGTH(b.max_seq)) - 1 AS max_same_digit,
                  COUNT(*) AS related_count
              FROM mes.testmerge_cc1orcc2 t
              JOIN base b
              WHERE t.modelId LIKE 'RD0013%'
                AND t.parameter = '010'
                AND CAST(REGEXP_SUBSTR(t.modelId, '[0-9]+$') AS UNSIGNED)
                    BETWEEN b.min_seq AND (POWER(10, LENGTH(b.max_seq)) - 1);`; 


  try {    
    //查詢最小最大範圍以及符合序號列名 最小(長度位元數) 最大(1~99XX)數列
   // const [row_digital] = await dbmes.query(search_sql);    
    // console.log("查詢結果 = " +  JSON.stringify(serial_prefix_list,null,2));

    
    // return res.status(200).json({
    //   message:
    //     "查詢電芯前綴清單完成!",
    //    data: serial_prefix_list      
    // });

  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得最小最大數位碼錯誤",
    });
  }




});

module.exports = router;
