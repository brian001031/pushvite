const express = require("express");
const router = express.Router();
const moment = require("moment");
require('moment-timezone'); // 載入時區支援
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const mysql = require("mysql2");

// 設定 moment 預設時區為台灣
moment.tz.setDefault('Asia/Taipei');


// 讀取 .env 檔案
const envPath = path.resolve(__dirname, "../.env");
const discord_rollingNSlitting_notify = process.env.discord_coating_notify || "";

// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js");     // hr 資料庫
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫

// 定義欄位結構
const engineerSettings = [
  "selectWork",
  "engineerId",
  "engineerName",
  "tabStart",
  "tabEnd",
  "surfaceDensity_S",
  "surfaceDensity_E",
  "remark",
  "machineForOPselect",
  "receipt_OPselect",
  "weight_OPselect",
  "first_weight_left_S",
  "first_weight_left_E",
  "first_weight_middle_S",
  "first_weight_middle_E",
  "first_weight_right_S",
  "first_weight_right_E",
  "last_weight_left_S",
  "last_weight_left_E",
  "last_weight_middle_S",
  "last_weight_middle_E",
  "last_weight_right_S",
  "last_weight_right_E",
  "CreateAt",
  "updateAt",
];


const coatingCathode_batch = [
  "selectWork",
  "engineerName",
  "engineerId",
  "tabStart",
  "tabEnd",
  "tabStart_employee",
  "tabEnd_employee",
  "surfaceDensity_S",
  "surfaceDensity_E",
  "remark",
  "dayShift",
  "startTime",
  "endTime",
  "memberName",
  "memberNumber",
  "machineNo",
  "lotNumber",
  "slurryBatch",
  "productionMeters",
  "scantechAverage_Weight",
  "first_weight_left",
  "first_weight_middle",
  "first_weight_right",
  "first_density_left",
  "first_density_middle",
  "first_density_right",
  "last_weight_left",
  "last_weight_middle",
  "last_weight_right",
  "last_density_left",
  "last_density_middle",
  "last_density_right",
  "pieceDry_thickness_left",
  "pieceDry_thickness_middle",
  "pieceDry_thickness_right",
  "errorStatus",
  "remarkEmployee",
  "coater_speed",
  "stock",
  "is_deleted",
  "deleted_at",
  "delete_operation",
  "lostResult",
  "lostWeight",
  "lostMeter",
  "lost_handleMember",
  "first_Density_average",
  "last_Density_average",
  "deleted_by"
];

const coatingAnode_batch = [
  "id",
  "selectWork",
  "engineerName",
  "engineerId",
  "tabStart",
  "tabEnd",
  "tabStart_employee",
  "tabEnd_employee",
  "surfaceDensity_S",
  "surfaceDensity_E",
  "remark",
  "dayShift",
  "startTime",
  "endTime",
  "memberName",
  "memberNumber",
  "machineNo",
  "lotNumber",
  "lotNumber_SinglePage",
  "lotNumber_SinglePage_meter",
  "slurryBatch",
  "twoσ",
  "productionMeters",
  "ndc_averageWeight",
  "supplyPressure",
  "first_weight_left",
  "first_weight_middle",
  "first_weight_right",
  "first_density_left",
  "first_density_middle",
  "first_density_right",
  "last_weight_left",
  "last_weight_middle",
  "last_weight_right",
  "last_density_left",
  "last_density_middle",
  "last_density_right",
  "pieceDry_thickness_left",
  "pieceDry_thickness_middle",
  "pieceDry_thickness_right",
  "errorStatus",
  "remarkEmployee",
  "coater_speed",
  "stock",
  "is_deleted",
  "deleted_at",
  "delete_operation",
  "lostResult",
  "lostWeight",
  "lostMeter",
  "lost_handleMember",
  "first_Density_average",
  "last_Density_average",
  "deleted_by"
];


// 於混漿區查找對應的混漿批次
const findMixingBatch = async (slurryBatch , selectWork) => {
  let sql = null;
  let params = [];

  let searchTable = "";

  switch (selectWork) {
    case "coaterCathode":
      searchTable = "mes.mixingcathode_batch";
      break;
    case "coaterAnode_S":
    case "coaterAnode_D":
      searchTable = "mes.mixinganode_batch";
      break;
    default:
      console.log("findMixingBatch: 無效的 selectWork 類型");
      return null;
  }

  if (Array.isArray(slurryBatch) && slurryBatch.length >= 2) {
    sql = `
     (
      SELECT F.loadingTankNo, F.TransportEnd, F.LotNo
      FROM ${searchTable} AS F
      JOIN (
        SELECT loadingTankNo, MAX(TransportEnd) AS lastEnd
        FROM ${searchTable}
        WHERE loadingTankNo = ?
      ) t ON t.loadingTankNo = F.loadingTankNo
      WHERE F.loadingTankNo = ?
        AND F.TransportEnd >= DATE_SUB(t.lastEnd, INTERVAL 12 HOUR)
    )
    UNION ALL
    (
      SELECT F.loadingTankNo, F.TransportEnd, F.LotNo
      FROM ${searchTable} AS F
      JOIN (
        SELECT loadingTankNo, MAX(TransportEnd) AS lastEnd
        FROM ${searchTable}
        WHERE loadingTankNo = ?
      ) t ON t.loadingTankNo = F.loadingTankNo
      WHERE F.loadingTankNo = ?
        AND F.TransportEnd >= DATE_SUB(t.lastEnd, INTERVAL 12 HOUR)
    )
    ORDER BY loadingTankNo, TransportEnd DESC
    `;

    params = [slurryBatch[0].trim(), slurryBatch[0].trim(), slurryBatch[1].trim() , slurryBatch[1].trim()];
  }
  else if (Array.isArray(slurryBatch) && slurryBatch.length === 1){
    sql = `
      (
      SELECT F.loadingTankNo, F.TransportEnd, F.LotNo
      FROM ${searchTable} AS F
      JOIN (
        SELECT loadingTankNo, MAX(TransportEnd) AS lastEnd
        FROM ${searchTable}
        WHERE loadingTankNo = ?
      ) t ON t.loadingTankNo = F.loadingTankNo
      WHERE F.loadingTankNo = ?
        AND F.TransportEnd >= DATE_SUB(t.lastEnd, INTERVAL 12 HOUR)
    )
    `
    params = [slurryBatch[0].trim(), slurryBatch[0].trim()];
  }

  try{
    const [rows] = await dbmes.query(sql, params);
    console.log("findMixingBatch 查詢結果:", rows , "typeof rows (slurryBatch):", typeof rows);
    return rows;

  }catch(error){
    console.log("Error in findMixingBatch:", error);
  }
}


// 萬用函數(FOR engineerSetting)：將資料轉換成 SQL VALUES 格式
const filmInDB = (dataObject, type) => {
  let values = [];
  const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
  
  if (type === 'coating_machine_settings') {
    // 遍歷三種類型的塗佈機
    const coaterTypes = ['coaterAnode_D', 'coaterAnode_S', 'coaterCathode'];
    
    for (let coaterType of coaterTypes) {
      const data = dataObject[coaterType];
      
      // 如果該類型存在資料
      if (data) {
        // 處理 machineForOPselect - 轉成 JSON 字串
        let machineListStr = '[]';
        if (Array.isArray(data.machineForOPselect)) {
          machineListStr = JSON.stringify(data.machineForOPselect);
        } else if (typeof data.machineForOPselect === 'string') {
          try {
            // 嘗試解析，確認是有效的 JSON
            JSON.parse(data.machineForOPselect);
            machineListStr = data.machineForOPselect;
          } catch (e) {
            // 如果不是 JSON，假設是逗號分隔字串，轉成陣列再轉 JSON
            machineListStr = JSON.stringify(data.machineForOPselect.split(','));
          }
        }

        // 處理 receipt_OPselect - 轉成 JSON 字串
        let receiptListStr = '[]';
        const receiptData = data.receipt_OPselect 
        
        if (Array.isArray(receiptData)) {
          receiptListStr = JSON.stringify(receiptData);
        } else if (typeof receiptData === 'string') {
           try {
            JSON.parse(receiptData);
            receiptListStr = receiptData;
          } catch (e) {
            receiptListStr = JSON.stringify(receiptData.split(','));
          }
        }

        // 處理 weight_OPselect - 轉成 JSON 字串
        let weightListStr = '[]';
        const weightData = data.weight_OPselect;

        if (Array.isArray(weightData)) {
          weightListStr = JSON.stringify(weightData);
        } else if (typeof weightData === 'string') {
           try {
            JSON.parse(weightData);
            weightListStr = weightData;
          } catch (e) {
            weightListStr = JSON.stringify(weightData.split(','));
          }
        }

        console.log(`處理 ${coaterType} 的 machineForOPselect:`, data.machineForOPselect, '→', machineListStr);
        console.log(`處理 ${coaterType} 的 receipt_OPselect:`, receiptData, '→', receiptListStr);
        console.log(`處理 ${coaterType} 的 weight_OPselect:`, weightData, '→', weightListStr);

        console.log(`處理 ${coaterType} 的 machineForOPselect:`, data.machineForOPselect, '→', machineListStr);
        console.log(`處理 ${coaterType} 的 receipt_OPselect:`, data.receipt_OPselect, '→', receiptListStr);
        console.log(`處理 ${coaterType} 的 weight_OPselect:`, data.weight_OPselect, '→', weightListStr);

        // 按照 engineerSettings 順序組裝欄位值
        const rowValues = [
          mysql.escape(coaterType),  // selectWork
          mysql.escape(data.engineerId || null),  // engineerId
          mysql.escape(data.engineerName || null),  // engineerName
          mysql.escape(data.tabStart || null),
          mysql.escape(data.tabEnd || null),
          mysql.escape(data.surfaceDensity_S || null),
          mysql.escape(data.surfaceDensity_E || null),
          mysql.escape(data.remark || null),
          mysql.escape(machineListStr), 
          mysql.escape(receiptListStr),
          mysql.escape(weightListStr),
          mysql.escape(data.first_weight_left_S || null),
          mysql.escape(data.first_weight_left_E || null),
          mysql.escape(data.first_weight_middle_S || null),
          mysql.escape(data.first_weight_middle_E || null),
          mysql.escape(data.first_weight_right_S || null),
          mysql.escape(data.first_weight_right_E || null),
          mysql.escape(data.last_weight_left_S || null),
          mysql.escape(data.last_weight_left_E || null),
          mysql.escape(data.last_weight_middle_S || null),
          mysql.escape(data.last_weight_middle_E || null),
          mysql.escape(data.last_weight_right_S || null),
          mysql.escape(data.last_weight_right_E || null),
          mysql.escape(now),
          mysql.escape(now)
        ];
        
        values.push(`(${rowValues.join(",")})`);
      }
    }
  }
  
  return values.join(",");
}

// 轉換 工程師設定 (SV) , OP輸入 (PV) 
const searchForIsoForm = (rows) => {
  for (let row of rows) {
        // 工程師設定 -- start
        if (row.hasOwnProperty('tabStart')) {
          row['tabStart(SV)'] = row.tabStart; 
          delete row.tabStart;          
        }
        if (row.hasOwnProperty('tabEnd')) {
          row['tabEnd(SV)'] = row.tabEnd; 
          delete row.tabEnd;
        }
        if (row.hasOwnProperty('first_weight_left_S')){
          row['first_weight_left_S(SV)'] = row.first_weight_left_S;
          delete row.first_weight_left_S;
        }
        if (row.hasOwnProperty('first_weight_left_E')){
          row['first_weight_left_E(SV)'] = row.first_weight_left_E;
          delete row.first_weight_left_E;
        }
        if (row.hasOwnProperty('first_weight_middle_S')){
          row['first_weight_middle_S(SV)'] = row.first_weight_middle_S;
          delete row.first_weight_middle_S;
        }
        if (row.hasOwnProperty('first_weight_middle_E')){
          row['first_weight_middle_E(SV)'] = row.first_weight_middle_E;
          delete row.first_weight_middle_E;
        }
        if (row.hasOwnProperty('first_weight_right_S')){
          row['first_weight_right_S(SV)'] = row.first_weight_right_S;
          delete row.first_weight_right_S;
        }
        if (row.hasOwnProperty('first_weight_right_E')){
          row['first_weight_right_E(SV)'] = row.first_weight_right_E;
          delete row.first_weight_right_E;
        }
        if (row.hasOwnProperty('last_weight_left_S')){
          row['last_weight_left_S(SV)'] = row.last_weight_left_S;
          delete row.last_weight_left_S;
        }
        if (row.hasOwnProperty('last_weight_left_E')){
          row['last_weight_left_E(SV)'] = row.last_weight_left_E;
          delete row.last_weight_left_E;
        }
        if (row.hasOwnProperty('last_weight_middle_S')){
          row['last_weight_middle_S(SV)'] = row.last_weight_middle_S;
          delete row.last_weight_middle_S;
        }
        if (row.hasOwnProperty('last_weight_middle_E')){
          row['last_weight_middle_E(SV)'] = row.last_weight_middle_E;
          delete row.last_weight_middle_E;
        }
        if (row.hasOwnProperty('last_weight_right_S')){
          row['last_weight_right_S(SV)'] = row.last_weight_right_S;
          delete row.last_weight_right_S;
        }
        if (row.hasOwnProperty('last_weight_right_E')){
          row['last_weight_right_E(SV)'] = row.last_weight_right_E;
          delete row.last_weight_right_E;
        }
        // 工程師設定 -- end 

        // 操作員輸入 -- start
        if (row.hasOwnProperty('first_weight_left')) {
          row['first_weight_left(PV)'] = row.first_weight_left;
          delete row.first_weight_left;
        }
        if (row.hasOwnProperty('first_weight_middle')) {
          row['first_weight_middle(PV)'] = row.first_weight_middle;
          delete row.first_weight_middle;
        }
        if (row.hasOwnProperty('first_weight_right')) {
          row['first_weight_right(PV)'] = row.first_weight_right;
          delete row.first_weight_right;
        }
        if (row.hasOwnProperty('last_weight_left')) {
          row['last_weight_left(PV)'] = row.last_weight_left;
          delete row.last_weight_left;
        }
        if (row.hasOwnProperty('last_weight_middle')) {
          row['last_weight_middle(PV)'] = row.last_weight_middle;
          delete row.last_weight_middle;
        }
        if (row.hasOwnProperty('last_weight_right')) {
          row['last_weight_right(PV)'] = row.last_weight_right;
          delete row.last_weight_right;
        }
        // 操作員輸入 -- end
      }
  return rows;
}

// 萬用函數：將資料轉換成 SQL 欄位與值陣列
const coatingFetchDB = (machineData, selectDB) => {
  const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
  let dbColumns = [];

  if (selectDB === "coatingcathode_batch") {
    dbColumns = coatingCathode_batch;
  } 
  else if (selectDB === "coatinganode_batch") {
    dbColumns = coatingAnode_batch;
  }

  const columnsArray = [];  // 欄位名稱陣列
  const valuesArray = [];   // 對應的值陣列（不用 escape，交給參數化查詢處理）
  
  for (let column of dbColumns) {
    if (machineData[column] !== undefined) {
      columnsArray.push(column);
      
      // 處理特殊欄位的值
      if (column === 'machineForOPselect' || column === 'errorStatus') {
        let str = '';
        if (Array.isArray(machineData[column])) {
          str = machineData[column].join(',');
        } else if (typeof machineData[column] === 'string') {
          str = machineData[column];
        }
        valuesArray.push(str);
      } else if (column === 'CreateAt' || column === 'updateAt') {
        // 時間欄位自動填入當前時間
        valuesArray.push(now);
      } else {
        // 一般欄位直接使用前端傳來的值
        valuesArray.push(machineData[column]);
      }
    }
  }

  return {
    columnsArray, 
    valuesArray
  };
}

const stockDelete = async (data) => {
  // 依照 selectWork 分組，例如：
  // { coaterAnode_D: [id1, id2], coaterCathode: [id3, id4] }
  const grouped = {};

  for (const item of data) {
    const { selectWork, id } = item;
    if (!grouped[selectWork]) grouped[selectWork] = [];
    grouped[selectWork].push(id);
  }

  // 依照 selectWork 執行對應 SQL
  const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
  const deleted_by = data[0]?.deleted_by || "SYSTEM";

  const promises = Object.entries(grouped).map(async ([work, ids]) => {
    let table = "";
    switch (work) {
      case "coaterCathode":
        table = "coatingcathode_batch";
        break;
      case "coaterAnode_D":
        table = "coatinganode_batch";
        break;
      default:
        console.warn(`未定義的 selectWork: ${work}`);
        return null;
    }

    const placeholders = ids.map(() => "?").join(", ");
    const sql = `
      UPDATE ${table} 
      SET is_deleted = 1, deleted_at = ?, delete_operation = ?, deleted_by = ? 
      WHERE id IN (${placeholders})
    `;
    const params = [now, "DELETE_VIA_StockPage", deleted_by, ...ids];

    console.log("執行 SQL:", sql);
    console.log("參數:", params);

    return await dbmes.query(sql, params);
  });

  // 等待全部批次執行完畢
  await Promise.all(promises);
};


// 上傳工程師設定
router.post("/engineerSetting", async (req, res) => {
  const machineSettings = req.body;  // { coaterAnode_D: {...}, coaterAnode_S: {...}, coaterCathode: {...} }

  console.log("塗佈機設定請求:", machineSettings);

  try {
    // 使用萬用函數生成 VALUES 部分
    const valuesString = filmInDB(machineSettings, 'coating_machine_settings');
    
    // 如果沒有任何資料
    if (!valuesString) {
      return res.status(400).json({ 
        success: false,
        message: "沒有提供任何塗佈機設定資料" 
      });
    }

    // 組裝完整 SQL
    const sql = `
      INSERT INTO coating_register (${engineerSettings.join(",")}) 
      VALUES ${valuesString}
      ON DUPLICATE KEY UPDATE 
        selectWork = VALUES(selectWork),
        engineerName = VALUES(engineerName),
        engineerId = VALUES(engineerId),
        tabStart = VALUES(tabStart),
        tabEnd = VALUES(tabEnd),
        surfaceDensity_S = VALUES(surfaceDensity_S),
        surfaceDensity_E = VALUES(surfaceDensity_E),
        remark = VALUES(remark),
        machineForOPselect = VALUES(machineForOPselect),
        receipt_OPselect = VALUES(receipt_OPselect),
        weight_OPselect = VALUES(weight_OPselect),
        first_weight_left_S = VALUES(first_weight_left_S),
        first_weight_left_E = VALUES(first_weight_left_E),
        first_weight_middle_S = VALUES(first_weight_middle_S),
        first_weight_middle_E = VALUES(first_weight_middle_E),
        first_weight_right_S = VALUES(first_weight_right_S),
        first_weight_right_E = VALUES(first_weight_right_E),
        last_weight_left_S = VALUES(last_weight_left_S),
        last_weight_left_E = VALUES(last_weight_left_E),
        last_weight_middle_S = VALUES(last_weight_middle_S),
        last_weight_middle_E = VALUES(last_weight_middle_E),
        last_weight_right_S = VALUES(last_weight_right_S),
        last_weight_right_E = VALUES(last_weight_right_E),
        updateAt = VALUES(updateAt)
    `;

    console.log("執行 SQL:", sql);

    // 執行 SQL
    await dbcon.query(sql);
    
    res.status(200).json({ 
      success: true,
      message: "塗佈機設定儲存成功", 
      data: machineSettings 
    });

  } catch (error) {
    console.error("Error in /engineerSetting:", error);
    res.status(500).json({ 
      success: false,
      message: "塗佈機設定儲存失敗",
      error: error.message 
    });
  }
});  


// 抓取工程師設定
router.get("/getEngineerSetting", async (req, res) => {
  
  const {
    engineerId,
    engineerName
  } = req.query;

  console.log("查詢塗佈機設定:", engineerId, engineerName);
  console.log(typeof engineerId, typeof engineerName);

  let sql = `
  SELECT 
    id,
    selectWork,
    engineerName,
    engineerId,
    tabStart,
    tabEnd,
    surfaceDensity_S,
    surfaceDensity_E,
    remark,
    first_weight_left_S,
    first_weight_left_E,
    first_weight_middle_S,
    first_weight_middle_E,
    first_weight_right_S,
    first_weight_right_E,
    last_weight_left_S,
    last_weight_left_E,
    last_weight_middle_S,
    last_weight_middle_E,
    last_weight_right_S,
    last_weight_right_E,
    machineForOPselect,
    receipt_OPselect,
    weight_OPselect,
    DATE_FORMAT(CreateAt, '%Y-%m-%d %H:%i:%s') as CreateAt,
    DATE_FORMAT(updateAt, '%Y-%m-%d %H:%i:%s') as updateAt
  FROM coating_register
  WHERE 
    (
    selectWork = 'coaterCathode' OR 
    selectWork = 'coaterAnode_S' OR 
    selectWork = 'coaterAnode_D'
    )
    AND engineerId = ? AND engineerName = ?
  `;

  const PARAMS = [engineerId, engineerName];

  try {
    const [rows] = await dbcon.query(sql, PARAMS);
    
    console.log(rows);

    res.json({ 
      success: true,
      coaterCathode: rows[2],
      coaterAnode_S: rows[1],
      coaterAnode_D: rows[0]
    });

  } catch (error) {
    console.error("Error in /getEngineerSetting:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message 
    });
  }
}),



// 塗佈區 OP 作業區域
router.post("/postCoatingRecord", async (req, res) => {
  const recordData = req.body;
  console.log("收到塗佈記錄:", recordData);
  let insertTable = ""; // 具 schema 的實際表名
  let columnTemplateKey = ""; // 用於欄位模板的 key

  // 僅根據傳入欄位建立查詢用的桶號陣列（最多兩個）
  const slurryBatchInput = [
    recordData.slurryBatch01,
    recordData.slurryBatch02
  ].filter(v => v !== undefined && v !== null && String(v).trim() !== "").map(v => String(v).trim());

  console.log("處理後的 slurryBatch (input):", slurryBatchInput);

  // 依 selectWork 決定實際寫入的表與欄位模板
  switch(recordData.selectWork) {
    case 'coaterCathode':
      insertTable = "mes.coatingcathode_batch";
      columnTemplateKey = "coatingcathode_batch";
      break;
    case "coaterAnode_S":
    case "coaterAnode_D":
      insertTable = "mes.coatinganode_batch";
      columnTemplateKey = "coatinganode_batch";
      break;
    default:
      return res.status(400).json({
        success: false,
        message: "無效的 selectWork 類型"
      });
  }

  // 嘗試從混漿批次表查出 LotNo，查不到就沿用原始輸入
  try {
    const rows = await findMixingBatch(slurryBatchInput, recordData.selectWork);
    if (Array.isArray(rows) && rows.length > 0) {
      recordData.slurryBatch = rows.map(r => r.LotNo).join(", ");
    } else {
      recordData.slurryBatch = slurryBatchInput.join(",");
    }
  } catch (e) {
    console.log("查詢混漿批次失敗，改用原始輸入:", e?.message);
    recordData.slurryBatch = slurryBatchInput.join(",");
  }
  


  try {
    // 以 columnTemplateKey 取得欄位模板，insertTable 作為實際寫入表
    const { columnsArray, valuesArray } = coatingFetchDB(recordData, columnTemplateKey);

    if (!columnsArray || !valuesArray || valuesArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "沒有提供任何塗佈記錄資料"
      });
    }
    const placeholders = valuesArray.map(() => '?').join(', ');
    const sql = `INSERT INTO ${insertTable} (${columnsArray.join(', ')}) VALUES (${placeholders})`;

    console.log("執行 SQL:", sql);
    console.log("參數:", valuesArray);

    const [rows] = await dbmes.query(sql, valuesArray);
    console.log("插入結果:", rows);

    res.status(200).json({
      success: true,
      message: "塗佈記錄儲存成功",
      data: recordData
    });

  } catch(error) {
    console.error("Error in /postCoatingRecord:", error);
    res.status(500).json({
      success: false,
      message: "儲存失敗",
      error: error.message 
    });
  }

});

// 不良品設定get 
router.get("/getFaultProduct", async (req, res) => {
  const { startDay, endDay, selectWork, page=1, pageSize=10 } = req.query;
  let tableName = "";


  const pageSizeNum = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * pageSizeNum;

  console.log("確認開始時間:", { startDay, endDay, selectWork });

  // 驗證必要參數
  if (!startDay || !endDay || !selectWork) {
    return res.status(400).json({
      success: false,
      message: "缺少必要參數: startDay, endDay, selectWork"
    });
  }

  switch(selectWork) {
    case 'coaterCathode':
      tableName = "coatingCathode_batch";
      break;
    case "coaterAnode_S":
    case "coaterAnode_D":
      tableName = "coatinganode_batch";
      break;
    default:
      return res.status(400).json({
        success: false,
        message: "無效的 selectWork 類型"
      });
  }
  // const allowedTables = ['coatingCathode_batch', 'coatinganode_batch'];
  // if (!allowedTables.includes(tableName)) {
  //   console.log("無效的表格名稱");
  //   return res.status(400).json({
  //     success: false,
  //     message: "無效的表格名稱"
  //   });
  // }


  const formattedStartDay = startDay.replace(/\//g, '-');
  const formattedEndDay = endDay.replace(/\//g, '-');
  
  const sql = `SELECT * FROM ${tableName} 
               WHERE lostMeter <> "" 
               AND lostMeter IS NOT NULL 
               AND DATE(startTime) BETWEEN ? AND ? 
               AND (is_deleted IS NULL OR is_deleted != "1") 
               ORDER BY id DESC
               LIMIT ? OFFSET ?`;

  const sql_count = `
  SELECT COUNT(*) as totalCount 
  FROM ${tableName}
    WHERE lostMeter <> "" 
    AND lostMeter IS NOT NULL
    AND DATE(startTime) BETWEEN ? AND ? 
    AND (is_deleted IS NULL OR is_deleted != "1")
  `;
  
  const params = [formattedStartDay, formattedEndDay, pageSizeNum, offset];
  const count_params = [formattedStartDay, formattedEndDay];

  console.log("執行SQL:", sql);
  console.log("參數:", params);
  console.log("COUNT SQL:", sql_count);
  console.log("COUNT 參數:", count_params);

  try {
    const [rows] = await dbmes.query(sql, params);
    const [countResult] = await dbmes.query(sql_count, count_params);
    const totalCount = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / pageSizeNum);

    // console.log("=== 分頁 DEBUG 資訊 ===");
    // console.log("當前頁面:", parseInt(page, 10));
    // console.log("每頁筆數:", pageSizeNum);
    // console.log("總筆數:", totalCount);
    // console.log("總頁數:", totalPages);
    // console.log("hasNextPage 計算:", parseInt(page, 10), "<", totalPages, "=", parseInt(page, 10) < totalPages);
    // console.log("查詢結果筆數:", rows.length);
    // console.log("========================");

    // 不需要額外加 startTime 物件，直接回傳查詢結果
    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: "查無不良品資料",
        data: [],
        pagination: {
          currentPage: parseInt(page, 10),
          pageSize: pageSizeNum,
          totalPages: totalPages,
          totalRecords: totalCount,
          hasNextPage: false,
          hasPrevPage: false
        }
      });
    }

    res.status(200).json({
      success: true,
      data: rows,  // 直接使用 SQL 查詢結果，不再額外過濾
      pagination: {
        currentPage: parseInt(page, 10),
        pageSize: pageSizeNum,
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNextPage: parseInt(page, 10) < totalPages,
        hasPrevPage: parseInt(page, 10) > 1
      }
    });
  } catch(error) {
    console.error("Error in /getFaultProduct:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message 
    });
  }
});



router.post("/upsertFaultProduct", async (req, res) => {
  const { products } = req.body;
  console.log("收到不良品資料:", req.body);

  // 驗證資料
  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      success: false,
      message: "沒有提供不良品資料或格式錯誤"
    });
  }

  

  // 根據 selectWork 判斷表名的函數
  const getTableName = (selectWork) => {
    switch (selectWork) {
      case 'coaterCathode':
        return "coatingcathode_batch";
      case "coaterAnode_S":
      case "coaterAnode_D":
        return "coatinganode_batch";
      default:
        return null;
    }
  };

  Object.keys(products).forEach((key)=>{
    if(!products[key].is_deleted === "1"){
      products[key].is_deleted = null;
      products[key].deleted_at = null;
      products[key].delete_operation = null;
      products[key].delete_by = null;
    }
  });

  try {
    // 第一步：按表名分組（批次插入優化）
    const groupedByTable = {};
    const invalidProducts = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const tableName = getTableName(product.selectWork);

      if (!tableName) {
        console.error(`第 ${i+1} 筆資料 selectWork 無效:`, product.selectWork);
        invalidProducts.push({
          error: `無效的 selectWork: ${product.selectWork}`
        });
        continue;
      }

      // 分組：相同表名的資料放在一起
      if (!groupedByTable[tableName]) {
        groupedByTable[tableName] = [];
      }
      groupedByTable[tableName].push(product);
    }

    // 第二步：批次插入（每個表只執行一次 SQL）
    const results = [];
    let totalInserted = 0;

    for (let tableName in groupedByTable) {
      const productsInTable = groupedByTable[tableName];
      const placeholders = productsInTable.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ? , ?)').join(', ');
      const sql = `
        INSERT INTO ${tableName} (
          selectWork,
          dayShift,
          lotNumber,
          lostResult, 
          lostWeight, 
          lostMeter, 
          lost_handleMember,
          startTime,
          is_deleted,
          deleted_at,
          delete_operation,
          deleted_by,
          memberName,
          memberNumber
        ) 
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          lostWeight = VALUES(lostWeight),
          lostMeter = VALUES(lostMeter),
          lost_handleMember = VALUES(lost_handleMember),
          startTime = VALUES(startTime),
          is_deleted = VALUES(is_deleted),
          deleted_at = VALUES(deleted_at),
          delete_operation = VALUES(delete_operation),
          deleted_by = VALUES(deleted_by)
      `;

      const params = [];
      productsInTable.forEach(product => {
        params.push(
          product.selectWork,
          product.dayShift,
          product.lotNumber,
          product.lostResult,
          product.lostWeight,
          product.lostMeter,
          product.lost_handleMember,
          product.startTime || moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
          product.is_deleted || null,
          product.deleted_at || null,
          product.delete_operation || null,
          product.deleted_by || null,
          product.memberName || null,
          product.memberNumber || null
        );
      });

      console.log(`批次插入 ${tableName}：${productsInTable.length} 筆資料`);
      
      const [result] = await dbmes.query(sql, params);
      totalInserted += result.affectedRows;
      
      results.push({
        tableName,
        count: productsInTable.length,
        firstInsertId: result.insertId,
        affectedRows: result.affectedRows
      });
    }

    res.json({
      success: invalidProducts.length === 0,
      message: `批次插入完成：成功 ${totalInserted} 筆，無效 ${invalidProducts.length} 筆`,
      total: products.length,
      inserted: totalInserted,
      invalid: invalidProducts.length,
      invalidProducts,
      results
    });

  } catch(error) {
    console.error("Error in /upsertFaultProduct:", error);
    res.status(500).json({
      success: false,
      message: "儲存失敗",
      error: error.message
    });
  }
});


router.post("/renewListNo" , async (req, res) => {
  const data = req.body;

  // console.log("renewListNo 接收到的 data :", data);

  let Message_notify = `
===============================================================
📢 塗佈區批次號碼更新通知 📢\n\n
𖣁 更新機器: ${data.machineNo}\n
🔄 新批次號碼: ${data.ListNo} (舊批次號碼: ${data.listNo_old})\n
🕒 更新時間: ${moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss')}\n
👤 操作人員: ${data.memberName} (${data.memberId})\n
===============================================================
  `;

  const config_Discord = {
    headers: {
      'Content-Type': 'application/json'
    }
  }

  try{

    await axios.post(process.env.discord_coating_notify, {
      content: Message_notify
    }, config_Discord);

    res.status(200).json({
      success: true,
      message: "更新成功",
      data: data
    })

    
  }catch(error){
    console.error("Error in /renewListNo:", error);
    res.status(500).json({
      success: false,
      message: "更新失敗",
      error: error.message 
    });
  }
});


// 查詢待轉入庫存的資料
router.get("/getStockData", async (req, res) => {
  const { startDay, endDay, selectWork, page=1, pageSize=10 } = req.query;
  // console.log("確認資料是否有收到  : " , startDay ,"|", endDay,"|", selectWork,"|", page, "|", pageSize );

  let tableName = "";

  if (selectWork === "coaterCathode") {
    tableName = "coatingCathode_batch";
  }
  else if (selectWork.includes("coaterAnode")) {
    tableName = "coatinganode_batch";
  }

  const sql = `
  SELECT 
    id,
    machineNo , 
    lotNumber ,
    selectWork ,
    productionMeters
  FROM ${tableName} 
  WHERE startTime BETWEEN ? AND ? 
    AND is_deleted IN (0, "0") 
    AND (stock IS NULL OR Stock in (0 , "0"))
    AND is_received = "0"
    AND selectWork != "coaterAnode_S"
  ORDER BY id DESC LIMIT ? OFFSET ?`;

  const sql_count = `SELECT COUNT(*) as totalCount 
  FROM ${tableName} WHERE startTime BETWEEN ? AND ? 
  AND is_deleted IN (0, "0") 
  AND (stock IS NULL OR Stock in (0 , "0")) 
  AND is_received = "0"
  AND selectWork != "coaterAnode_S"`;

  const pageSizeNum = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * pageSizeNum;
  const params = [
    moment(startDay).format('YYYY-MM-DD 00:00:00'), 
    moment(endDay).format('YYYY-MM-DD 23:59:59'), 
    pageSizeNum, 
    offset
  ];


  try{
    const [rows] = await dbmes.query(sql, params);

    console.log ("rows", rows);

    const [countResult] = await dbmes.query(sql_count, [
      moment(startDay).tz('Asia/Taipei').format('YYYY-MM-DD 00:00:00'), 
      moment(endDay).tz('Asia/Taipei').format('YYYY-MM-DD 23:59:59')]);
    const totalCount = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / pageSizeNum);

    const stockNeedFilter = JSON.parse(JSON.stringify(rows));
    console.log("stockNeedFilter", stockNeedFilter);

    res.json({
      success: true,
      data: {
        rows,
        totalCount,
        totalPages,
        currentPage: page,
        pageSize: pageSizeNum,
        hasNextPage: parseInt(page, 10) < totalPages,
        hasPrevPage: parseInt(page, 10) > 1
      }
    });
  }catch(error){
    console.error("Error in /getStockData:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message 
    });
  }
})


// 庫存轉出到下一站
router.post("/transferStock", async (req, res) => {
  const data = req.body;

  console.log("transferStock 接收到的 data:", data);

  // 驗證資料
  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({
      success: false,
      message: "沒有提供任何資料或格式錯誤"
    });
  }

  try {
    // 根據 selectWork 判斷表名
    const getTableName = (selectWork) => {
      switch (selectWork) {
        case 'coaterCathode':
          return "coatingcathode_batch";
        case "coaterAnode_S":
        case "coaterAnode_D":
          return "coatinganode_batch";
        default:
          return "coatingcathode_batch"; 
      }
    };
    
    const updatePromises = data.map(async item => {
      const tableName = getTableName(item.selectWork);
      const sql = `UPDATE ${tableName} SET stock = 1 WHERE lotNumber = ? AND machineNo = ?`;
      const params = [item.lotNumber, item.machineNo];
      
      console.log(`更新: 將 ${item.lotNumber} (${item.machineNo}) 標記為已轉入庫存`);
      
      return await dbmes.query(sql, params);
    });

    // 並行執行所有 UPDATE
    const results = await Promise.all(updatePromises);
    
    // 計算成功更新的筆數
    const totalAffected = results.reduce((sum, [result]) => sum + result.affectedRows, 0);

    res.status(200).json({
      success: true,
      message: `批次更新完成：成功更新 ${totalAffected} 筆資料`,
      total: data.length,
      updated: totalAffected,
      data: data
    });

  } catch(error) {
    console.error("Error in /transferStock:", error);
    res.status(500).json({
      success: false,
      message: "批次更新失敗",
      error: error.message 
    });
  }
});




router.get("/getSearchPage", async (req, res) => {
  const { option, startDay, endDay, page = 1, pageSize = 10, searchTerm = "" } = req.query;

  // 參數驗證
  if (!startDay || !endDay || !option) {
    return res.status(400).json({
      success: false,
      message: "缺少必要參數: startDay, endDay, option"
    });
  }

  const start = moment(startDay).format('YYYY-MM-DD 00:00:00');
  const end = moment(endDay).format('YYYY-MM-DD 23:59:59');
  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;

  console.log("查詢參數:", { option, start, end, page, pageSize, searchTerm });

  try {
    let mainQuery = "";
    let countQuery = "";
    let mainParams = [];
    let countParams = [];

    let searchTermField = ""

    if (searchTerm.length >4){
      searchTermField = "lotNumber"
    }
    else {
      searchTermField = "memberNumber"
    }

    // 搜尋條件
    const searchCondition = searchTerm ? 
      `AND (machineNo LIKE ? OR ${searchTermField} LIKE ?)` : '';
    const searchParams = searchTerm ? 
      [`%${searchTerm}%`, `%${searchTerm}%`] : [];

    switch (option) {
      case "all":
        // 分開查詢兩個表，避免 UNION 字符集問題，保留所有原始欄位
        const cathodeQuery = `
          SELECT *, 'cathode' as type FROM coatingcathode_batch
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted != "1")
            ${searchCondition}
        `;
        
        const anodeQuery = `
          SELECT *, 'anode' as type FROM coatinganode_batch
          WHERE startTime BETWEEN ? AND ?
            AND (is_deleted IS NULL OR is_deleted != "1")
            ${searchCondition}
        `;

        const cathodeCountQuery = `
          SELECT COUNT(*) as count FROM coatingcathode_batch 
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted != "1")
            ${searchCondition}
        `;

        const anodeCountQuery = `
          SELECT COUNT(*) as count FROM coatinganode_batch 
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted != "1")
            ${searchCondition}
        `;

        // 並行查詢所有資料
        const [cathodeRows] = await dbmes.query(cathodeQuery, [start, end, ...searchParams]);
        const [anodeRows] = await dbmes.query(anodeQuery, [start, end, ...searchParams]);
        const [cathodeCount] = await dbmes.query(cathodeCountQuery, [start, end, ...searchParams]);
        const [anodeCount] = await dbmes.query(anodeCountQuery, [start, end, ...searchParams]);

        // 合併資料並按時間排序
        const allData = [...cathodeRows, ...anodeRows].sort((a, b) => {
          const timeA = new Date(a.startTime);
          const timeB = new Date(b.startTime);
          if (timeB - timeA !== 0) return timeB - timeA; // DESC
          return b.id - a.id; // DESC
        });

        // 手動分頁
        const totalCount = (cathodeCount[0]?.count || 0) + (anodeCount[0]?.count || 0);
        const totalPages = Math.ceil(totalCount / limit);
        const paginatedData = allData.slice(offset, offset + limit);

        return res.status(200).json({
          success: true,
          message: "查詢成功",
          data: paginatedData,
          pagination: {
            currentPage: parseInt(page, 10),
            pageSize: limit,
            totalPages: totalPages,
            totalRecords: totalCount,
            hasNextPage: parseInt(page, 10) < totalPages,
            hasPrevPage: parseInt(page, 10) > 1
          }
        });

      case "正極塗佈":
        mainQuery = `
          SELECT * FROM coatingcathode_batch 
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted != "1")
            ${searchCondition}
          ORDER BY startTime DESC, id DESC
          LIMIT ? OFFSET ?
        `;
        
        countQuery = `
          SELECT COUNT(*) as totalCount FROM coatingcathode_batch 
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted != "1")
            ${searchCondition}
        `;

        mainParams = [start, end, ...searchParams, limit, offset];
        countParams = [start, end, ...searchParams];
        break;

      case "負極塗佈":
        mainQuery = `
          SELECT * FROM coatinganode_batch 
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted != "1")
            ${searchCondition}
          ORDER BY startTime DESC, id DESC
          LIMIT ? OFFSET ?
        `;
        
        countQuery = `
          SELECT COUNT(*) as totalCount FROM coatinganode_batch 
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted != "1")
            ${searchCondition}
        `;

        mainParams = [start, end, ...searchParams, limit, offset];
        countParams = [start, end, ...searchParams];
        break;

        case "error" :
        const cathodeQuery_error = `
          SELECT *, 'cathode' as type FROM coatingcathode_batch
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted = "1")
            ${searchCondition}
        `;
        
        const anodeQuery_error = `
          SELECT *, 'anode' as type FROM coatinganode_batch
          WHERE startTime BETWEEN ? AND ?
            AND (is_deleted IS NULL OR is_deleted = "1")
            ${searchCondition}
        `;

        const cathodeCountQuery_error = `
          SELECT COUNT(*) as count FROM coatingcathode_batch 
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted = "1")
            ${searchCondition}
        `;

        const anodeCountQuery_error = `
          SELECT COUNT(*) as count FROM coatinganode_batch 
          WHERE startTime BETWEEN ? AND ? 
            AND (is_deleted IS NULL OR is_deleted = "1")
            ${searchCondition}
        `;

        // 並行查詢所有資料
        const [cathodeRows_error] = await dbmes.query(cathodeQuery_error, [start, end, ...searchParams]);
        const [anodeRows_error] = await dbmes.query(anodeQuery_error, [start, end, ...searchParams]);
        const [cathodeCount_error] = await dbmes.query(cathodeCountQuery_error, [start, end, ...searchParams]);
        const [anodeCount_error] = await dbmes.query(anodeCountQuery_error, [start, end, ...searchParams]);

        // 合併資料並按時間排序
        const allData_error = [...cathodeRows_error, ...anodeRows_error].sort((a, b) => {
          const timeA = new Date(a.startTime);
          const timeB = new Date(b.startTime);
          return timeA - timeB;
        });
        // 手動分頁
        const totalCount_error = (cathodeCount_error[0]?.count || 0) + (anodeCountQuery_error[0]?.count || 0);
        const totalPages_error = Math.ceil(totalCount_error / limit);
        const paginatedData_error = allData_error.slice(offset, offset + limit);
        return res.status(200).json({
          success: true,
          message: "查詢成功",
          data: paginatedData_error,
          pagination: {
            currentPage: parseInt(page, 10),
            pageSize: limit,
            totalPages: totalPages_error,
            totalRecords: totalCount_error,
            hasNextPage: parseInt(page, 10) < totalPages_error,
            hasPrevPage: parseInt(page, 10) > 1
          }
        });

      default:
        return res.status(400).json({
          success: false,
          message: "無效的查詢選項"
        });
    }

    // 並行執行主查詢和計數查詢
    const [rows] = await dbmes.query(mainQuery, mainParams);
    const [countResult] = await dbmes.query(countQuery, countParams);
    
    const totalCount = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      message: "查詢成功",
      data: rows,
      pagination: {
        currentPage: parseInt(page, 10),
        pageSize: limit,
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNextPage: parseInt(page, 10) < totalPages,
        hasPrevPage: parseInt(page, 10) > 1
      }
    });

  } catch (error) {
    console.error("Error in /getSearchPage:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message
    });
  }
});



router.put("/deleteData", async (req, res) => {
  const { selectedRows } = req.body;
  console.log("收到的刪除資料:", selectedRows);
  
  // 驗證資料
  if (!Array.isArray(selectedRows) || selectedRows.length === 0) {
    return res.status(400).json({
      success: false,
      message: "沒有提供刪除資料或格式錯誤"
    });
  }

  const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
  
  try {
    // 使用 Promise.all 批次處理多筆刪除
    const deletePromises = selectedRows.map(async (row, index) => {
      let sql = "";
      let params = [];
      
      console.log(`處理第 ${index + 1} 筆:`, {
        id: row.id,
        selectWork: row.selectWork,
        deleted_by: row.deleted_by
      });

      // 根據 selectWork 決定表格
      if (row.selectWork === "coaterCathode") {
        sql = `UPDATE coatingcathode_batch 
               SET is_deleted = 1, deleted_at = ?, delete_operation = ?, deleted_by = ? 
               WHERE id = ?`;
        params = [
          now,
          row.delete_operation || "塗佈生產查詢表-手動刪除",
          row.deleted_by || "",
          row.id
        ];
      } 
      else if (row.selectWork === "coaterAnode_S" || row.selectWork === "coaterAnode_D") {
        sql = `UPDATE coatinganode_batch 
               SET is_deleted = 1, deleted_at = ?, delete_operation = ?, deleted_by = ? 
               WHERE id = ?`;
        params = [
          now,
          row.delete_operation || "塗佈生產查詢表-手動刪除", 
          row.deleted_by || "",
          row.id
        ];
      }
      else {
        throw new Error(`無效的 selectWork: ${row.selectWork}`);
      }

      console.log(`第 ${index + 1} 筆 SQL:`, sql);
      console.log(`第 ${index + 1} 筆參數:`, params);

      // 回傳 Promise
      return await dbmes.query(sql, params);
    });

    // 並行執行所有刪除操作
    const results = await Promise.all(deletePromises);
    
    // 計算影響的資料筆數
    const totalAffected = results.reduce((sum, [result]) => sum + result.affectedRows, 0);

    console.log(`批次刪除完成: 影響 ${totalAffected} 筆資料`);

    res.status(200).json({
      success: true,
      message: `批次刪除成功: ${totalAffected} 筆資料已標記為刪除`,
      totalProcessed: selectedRows.length,
      totalAffected: totalAffected,
      data: selectedRows
    });

  } catch (error) {
    console.error("Error in /deleteData:", error);
    res.status(500).json({
      success: false,
      message: "刪除失敗",
      error: error.message
    });
  }
});


const changeTime = () =>{

  let dayShift = "";
  let startTime = "";
  let endTime = "";

  const now = moment().tz('Asia/Taipei');

  if (now.hour() >= 8 && now.hour() < 20) {
    dayShift = "早班";
    startTime = now.clone().hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    endTime = now.clone().hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
  }
  else {
    dayShift = "晚班";
    startTime = now.clone().subtract(now.hour() < 8 ? 1 : 0, 'day').hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
    endTime = now.clone().hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
  }
  return [dayShift, startTime, endTime];
}


router.get("/nowReport", async (req, res) => {

  let dayShift = "";
  let startTime = "";
  let endTime = "";

  let params_useToCount = [];
  let params_getNoCount_cathode = [];
  let params_getNoCount_anode = [];


  [dayShift, startTime, endTime] = changeTime();


  console.log('查詢區間:', startTime, endTime);

  try {

    const sql_useToCount = `
      SELECT 
        t1.coatingCathode_Count,
        t1.coatingCathode_faultyMeter_EmptySolder,
        t1.coatingCathode_faultyMeter_Faulty,
        t1.coatingCathode_faultyMeter_test,
        t1.shiftMeter_percent AS coatingCathode_shiftPercent,
        t2.coatingAnode_Count,
        t2.coatingAnode_faultyMeter_EmptySolder,
        t2.coatingAnode_faultyMeter_Faulty,
        t2.coatingAnode_faultyMeter_test,
        t2.shiftMeter_percent AS coatingAnode_shiftPercent
      FROM
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingCathode_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatingcathode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1') AND dayShift = ? AND startTime BETWEEN ? AND ?
        ) AS t1
      CROSS JOIN
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingAnode_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatinganode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1')AND dayShift = ? AND startTime BETWEEN ? AND ?
        ) AS t2;
    `;
    params_useToCount = [dayShift, startTime, endTime, dayShift, startTime, endTime];

    const sql_getNoCount_cathode = `
      SELECT
        t1.memberName,
        t1.memberNumber,
        t2.latest_startTime 
      FROM (
          SELECT DISTINCT memberName, memberNumber
          FROM mes.coatingcathode_batch
          WHERE (is_deleted IS NULL OR is_deleted <> '1')
          AND dayShift = ?
          AND startTime BETWEEN ? AND ?
      ) AS t1
      CROSS JOIN (
          SELECT MAX(startTime) AS latest_startTime
          FROM mes.coatingcathode_batch
          WHERE (is_deleted IS NULL OR is_deleted <> '1')
          AND dayShift = ?
          AND startTime BETWEEN ? AND ?
      ) AS t2
      ORDER BY t1.memberNumber;
    `;

    params_getNoCount_cathode = [dayShift, startTime, endTime, dayShift, startTime, endTime];
    

    const sql_getNoCount_anode = `
      SELECT
        t1.memberName,
        t1.memberNumber,
        t2.latest_startTime 
      FROM (
          SELECT DISTINCT memberName, memberNumber
          FROM mes.coatinganode_batch
          WHERE (is_deleted IS NULL OR is_deleted <> '1')
          AND dayShift = ?
          AND startTime BETWEEN ? AND ?
      ) AS t1
      CROSS JOIN (
          SELECT MAX(startTime) AS latest_startTime
          FROM mes.coatinganode_batch
          WHERE (is_deleted IS NULL OR is_deleted <> '1')
          AND dayShift = ?
          AND startTime BETWEEN ? AND ?
      ) AS t2 
      ORDER BY t1.memberNumber;
    `;

    params_getNoCount_anode = [dayShift, startTime, endTime, dayShift, startTime, endTime];

    

    // ✅ 同時查詢三筆 SQL
    const [[countRows], [cathodeRows], [anodeRows]] = await Promise.all([
      dbmes.query(sql_useToCount , params_useToCount),
      dbmes.query(sql_getNoCount_cathode , params_getNoCount_cathode),
      dbmes.query(sql_getNoCount_anode , params_getNoCount_anode),
    ]);

    console.log("countRows:", countRows);
    console.log("cathodeRows:", cathodeRows);
    console.log("anodeRows:", anodeRows);

    const countResult_Data = countRows[0] || {};

    // ✅ 只取 "姓名|工號" 組合
    const cathode_memberInfo = Array.from(
      new Set(
        cathodeRows.map(row => `${row.memberName || ""}(${row.memberNumber || ""})`)
      )
    );

    const anode_memberInfo = Array.from(
      new Set(
        anodeRows.map(row => `${row.memberName || ""}(${row.memberNumber || ""})`)
      )
    );

    // ✅ 只取其中一筆 startTime（全表最大值即可）
    const dataResult_Cathode = cathodeRows[0] || {};
    const dataResult_Anode = anodeRows[0] || {};

    // ✅ 計算稼動率
    const cathode_mixing_utilization =
      1 -
      ((
        (countResult_Data.coatingCathode_faultyMeter_Faulty || 0) +
        (countResult_Data.coatingCathode_faultyMeter_test || 0)
      ) /
        ((countResult_Data.coatingCathode_Count || 0) +
          (countResult_Data.coatingCathode_faultyMeter_Faulty || 0) +
          (countResult_Data.coatingCathode_faultyMeter_test || 0)));

    const anode_mixing_utilization =
      1 -
      ((
        (countResult_Data.coatingAnode_faultyMeter_Faulty || 0) +
        (countResult_Data.coatingAnode_faultyMeter_test || 0)
      ) /
        ((countResult_Data.coatingAnode_Count || 0) +
          (countResult_Data.coatingAnode_faultyMeter_Faulty || 0) +
          (countResult_Data.coatingAnode_faultyMeter_test || 0)));

    // ✅ 組合回傳資料
    const finalSend = {
      coaterCathode: {
        station: "正極塗佈(米)",
        time: dataResult_Cathode.latest_startTime
          ? moment(dataResult_Cathode.latest_startTime)
              .tz("Asia/Taipei")
              .format("YYYY-MM-DD HH:mm:ss")
          : "",
        count: countResult_Data.coatingCathode_Count || 0,
        faultyMeter_EmptySolder:
          countResult_Data.coatingCathode_faultyMeter_EmptySolder || 0,
        faultyMeter_Faulty:
          countResult_Data.coatingCathode_faultyMeter_Faulty || 0,
        faultyMeter_test: countResult_Data.coatingCathode_faultyMeter_test || 0,
        shiftMeter_percent: countResult_Data.coatingCathode_shiftPercent || 0,
        mixing_utilization: cathode_mixing_utilization || 0,
        memberInfo: cathode_memberInfo,
      },
      coaterAnode: {
        station: "負極塗佈(米)",
        time: dataResult_Anode.latest_startTime
          ? moment(dataResult_Anode.latest_startTime)
              .tz("Asia/Taipei")
              .format("YYYY-MM-DD HH:mm:ss")    
          : "",
        count: countResult_Data.coatingAnode_Count || 0,
        faultyMeter_EmptySolder:
          countResult_Data.coatingAnode_faultyMeter_EmptySolder || 0,
        faultyMeter_Faulty:
          countResult_Data.coatingAnode_faultyMeter_Faulty || 0,
        faultyMeter_test: countResult_Data.coatingAnode_faultyMeter_test || 0,
        shiftMeter_percent: countResult_Data.coatingAnode_shiftPercent || 0,
        mixing_utilization: anode_mixing_utilization || 0,
        memberInfo: anode_memberInfo, // ✅ 修正為 ["謝宗哲|333","周柏全|349"]
      },
    };

    res.status(200).json({
      success: true,
      message: "查詢成功",
      data: finalSend,
    });
  } catch (error) {
    console.error("❌ Error in /nowReport:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message,
    });
  }
});


router.get("/pastReport" , async (req , res) => {
  const { startDate , endDate , dayShift } = req.query;
  console.log("pastReport 接收到的參數 :", startDate , "|" , endDate , "|" , dayShift );
  // console.log("type of get DATA :", typeof startDate , "|" , typeof endDate , "|" , typeof dayShift );

  let start = "";
  let end = "";
  let shift = "";
  let params = [];
  let sql = "";

  if (!dayShift) {
    return res.status(400).json({
      success: false,
      message: "缺少必要參數: dayShift"
    });
  }

  // 先判斷 startDate && endDate 皆有，查詢區間
  if (startDate && endDate) {
    start = moment(startDate).format('YYYY-MM-DD 00:00:00');
    end = moment(endDate).format('YYYY-MM-DD 23:59:59');
    shift = dayShift;
    sql = `
    SELECT 
        t1.coatingCathode_Count,
        t1.coatingCathode_faultyMeter_EmptySolder,
        t1.coatingCathode_faultyMeter_Faulty,
        t1.coatingCathode_faultyMeter_test,
        t1.shiftMeter_percent AS coatingCathode_shiftPercent,
        t2.coatingAnode_Count,
        t2.coatingAnode_faultyMeter_EmptySolder,
        t2.coatingAnode_faultyMeter_Faulty,
        t2.coatingAnode_faultyMeter_test,
        t2.shiftMeter_percent AS coatingAnode_shiftPercent
      FROM
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingCathode_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatingcathode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1') AND dayShift = ? AND startTime BETWEEN ? AND ?
        ) AS t1
      CROSS JOIN
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingAnode_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatinganode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1') AND dayShift = ? AND startTime BETWEEN ? AND ?
        ) AS t2;
    `;
    params = [
      dayShift, start, end,
      dayShift, start, end
    ];
  }
  // 只查單日
  else if (startDate) {
    start = moment(startDate).format('YYYY-MM-DD 00:00:00');
    end = moment(startDate).format('YYYY-MM-DD 23:59:59');
    shift = dayShift;
    sql = `
    SELECT 
        t1.coatingCathode_Count,
        t1.coatingCathode_faultyMeter_EmptySolder,
        t1.coatingCathode_faultyMeter_Faulty,
        t1.coatingCathode_faultyMeter_test,
        t1.shiftMeter_percent AS coatingCathode_shiftPercent,
        t2.coatingAnode_Count,
        t2.coatingAnode_faultyMeter_EmptySolder,
        t2.coatingAnode_faultyMeter_Faulty,
        t2.coatingAnode_faultyMeter_test,
        t2.shiftMeter_percent AS coatingAnode_shiftPercent
      FROM
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingCathode_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatingcathode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1') AND dayShift = ? AND startTime BETWEEN ? AND ?
        ) AS t1
      CROSS JOIN
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingAnode_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingAnode_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatinganode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1') AND dayShift = ? AND startTime BETWEEN ? AND ?
        ) AS t2;
    `;
    params = [
      dayShift, start, end,
      dayShift, start, end
    ];
  }
   
  try{

    console.log ("執行的 params :", params);
    const [rows] = await dbmes.query(sql, params);
    const data = Object.entries(rows[0]).reduce((acc, [key, value]) => {
    if (key.startsWith("coatingCathode_")) {
      const newKey = key.replace("coatingCathode_", "");
      acc.cathode = acc.cathode || {};
      acc.cathode[newKey] = value;
    } 
    else if (key.startsWith("coatingAnode_")) {
      const newKey = key.replace("coatingAnode_", "");
      acc.anode = acc.anode || {};
      acc.anode[newKey] = value;
    }
    return acc;
  }, {});

    console.log("整理後的 data :", data);

    res.status(200).json({
      success: true,
      message: "查詢成功",
      data: data
    })

  }catch(error){
    console.error("Error in /pastReport:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message 
    });
  }
})


router.get("/getHandOverRecord" , async (req , res) => {
  const {
    startTime, 
    endTime,
    page = 1,
    pageSize = 10,
    searchTerm
  } = req.query;

  const start = moment(startTime).tz('Asia/Taipei').format('YYYY-MM-DD 00:00:00');
  const end = moment(endTime).tz('Asia/Taipei').format('YYYY-MM-DD 23:59:59');
  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;
  

  let sql = `SELECT * FROM hr.handover_coating WHERE createAt BETWEEN ? AND ? AND selectWork = "coating"  `;
  const params = [ start, end ];

  let sql_count = `SELECT COUNT(*) as totalCount FROM hr.handover_coating WHERE createAt BETWEEN ? AND ? AND selectWork = "coating"`;
  const params_count = [ start, end ];

  if (searchTerm){
    sql+= `AND innerText LIKE ? `;
    sql_count += `AND innerText LIKE ? `;
    const likeTerm = `%${searchTerm}%`;
    params.push(likeTerm);
    params_count.push(likeTerm);
  }

  sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try{

    const[rows] = await dbmes.query(sql, params);
    const[totalCount] = await dbmes.query(sql_count, params_count);


    //總頁數
    totalPage_set = Math.ceil(totalCount[0].totalCount / limit);

    res.status(200).json({
      success: true,
      message: "查詢成功",
      data: rows,
      page: page,
      totalPages: totalPage_set
    });

  }catch(error){
    console.error("Error in /getHandOverRecord:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message 
    });
  }
})

router.post("/sendHandOverRecord" , async (req , res) =>{
  const { payload } = req.body;

  console.log("sendHandOverRecord 接收到的 data :", payload);

  try{
    const sql = `INSERT INTO hr.handover_coating (
    selectWork,
    shift,
    managerName,
    managerNumber,
    errorCarryOnTime,
    coatingMachine_Meter,
    producingMeter,
    producingMeter_achieveRate,
    producingMeter_targetRate,
    innerText,
    productionStatus,
    createAt,
    handOver_Name,
    handOver_Number
    ) VALUES (?, ?, ?, ?, ?, ? , ? , ? , ?, ?, ?, ?, ?, ?)`;
    const params = [
      "coating",
      payload.records.shift,
      payload.records.managerName,
      payload.records.managerNumber,
      payload.records.errorCarryOnTime,
      payload.records.coatingMachine_Meter,
      payload.records.producingMeter,
      payload.records.producingMeter_achieveRate,
      payload.records.producingMeter_targetRate,
      payload.records.innerText,
      payload.records.productionStatus,
      moment(payload.records.submitTime).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
      "",
      "",
    ];

    const [result] = await dbmes.query(sql, params);


    res.status(200).json({
      success: true,
      message: "新增成功",
      data: {
        id: result.insertId,
        ...payload.records
      }
    });

  }catch(error){
    console.error("Error in /sendHandOverRecord:", error);
    res.status(500).json({
      success: false,
      message: "新增失敗",
      error: error.message 
    });
  }
})

router.get("/downloadData" , async (req , res) => {

  const { option, searchTerm = "", startDay, endDay , memberID} = req.query;
  const xlsx = require("xlsx");
  const moment = require("moment");
  let selectWork = "";

  switch(option){
    case "正極塗佈" : 
      selectWork = "coaterCathode";
      break;
    case "負極塗佈" :
      selectWork = "coaterAnode_D";
      break;
    default :
      selectWork = "";
      break;
  }

  let sql_findEngineerSet = `
  SELECT 
    first_weight_left_S,
    first_weight_left_E,
    first_weight_middle_S,
    first_weight_middle_E,
    first_weight_right_S,
    first_weight_right_E,
    last_weight_left_S,
    last_weight_left_E,
    last_weight_middle_S,
    last_weight_middle_E,
    last_weight_right_S,
    last_weight_right_E
  FROM hr.coating_register
  WHERE engineerId = ${memberID}
  AND selectWork = "${selectWork}"
  ORDER BY id DESC
  LIMIT 1
  `

  console.log(
    "downloadData:",
    "option", option, "|",
    "searchTerm", searchTerm, "|",
    "startDay", startDay, "|",
    "endDay", endDay , "|" ,
    "memberID", memberID
  );

  // 參數驗證
  if (!startDay || !endDay || !option) {
    return res.status(400).json({
      success: false,
      message: "缺少必要參數: startDay, endDay, option"
    });
  }

  const start = moment(startDay).tz('Asia/Taipei').format('YYYY-MM-DD 00:00:00');
  const end = moment(endDay).tz('Asia/Taipei').format('YYYY-MM-DD 23:59:59');

  let searchTermField = "";
  if (searchTerm.length > 4) {
    searchTermField = "lotNumber";
  } else {
    searchTermField = "memberNumber";
  }
  const searchCondition = searchTerm
    ? `AND (machineNo LIKE ? OR ${searchTermField} LIKE ?)`
    : "";
  const searchParams = searchTerm ? [`%${searchTerm}%`, `%${searchTerm}%`] : [];

  try {
    let rows = [];
    if (option === "all") {
      // 查詢正極與負極，合併
      const cathodeQuery = `
        SELECT *, 'cathode' as type FROM coatingcathode_batch
        WHERE startTime BETWEEN ? AND ?
          AND (is_deleted IS NULL OR is_deleted != "1")
          ${searchCondition}
      `;
      const anodeQuery = `
        SELECT *, 'anode' as type FROM coatinganode_batch
        WHERE startTime BETWEEN ? AND ?
          AND (is_deleted IS NULL OR is_deleted != "1")
          ${searchCondition}
      `;
      const [cathodeRows] = await dbmes.query(cathodeQuery, [start, end, ...searchParams]);
      const [anodeRows] = await dbmes.query(anodeQuery, [start, end, ...searchParams]);
      rows = [...cathodeRows, ...anodeRows].sort((a, b) => {
        const timeA = new Date(a.startTime);
        const timeB = new Date(b.startTime);
        if (timeB - timeA !== 0) return timeB - timeA;
        return b.id - a.id;
      });

      console.log("合併後的 rows 數量:", rowsFinal.length , Object.entries(rowsFinal || {}) , "typeof rows :" , typeof rowsFinal);
    } else if (option === "正極塗佈") {
      const cathodeQuery = `
        SELECT * FROM coatingcathode_batch
        WHERE startTime BETWEEN ? AND ?
          AND (is_deleted IS NULL OR is_deleted != "1")
          ${searchCondition}
      `;
      const [cathodeRows] = await dbmes.query(cathodeQuery, [start, end, ...searchParams]);
      const [cathodeEngineerSet] = await dbcon.query(sql_findEngineerSet);

      rows = [...cathodeRows , ...cathodeEngineerSet];

      const rowsFinal = searchForIsoForm(rows)
      console.log("合併後的 rows 數量:", rowsFinal.length , Object.entries(rowsFinal || {}) , "typeof rows :" , typeof rowsFinal);

    } else if (option === "負極塗佈") {
      const anodeQuery = `
        SELECT * FROM coatinganode_batch
        WHERE startTime BETWEEN ? AND ?
          AND (is_deleted IS NULL OR is_deleted != "1")
          ${searchCondition}
      `;
      const [anodeRows] = await dbmes.query(anodeQuery, [start, end, ...searchParams]);
      const [anodeEngineerSet] = await dbcon.query(sql_findEngineerSet);
      rows = [...anodeRows , ...anodeEngineerSet];

      const rowsFinal = searchForIsoForm(rows)

      console.log("合併後的 rows 數量:", rowsFinal.length , Object.entries(rowsFinal || {}) , "typeof rows :" , typeof rowsFinal);

    }else if (option === "error") {
      const cathodeQuery = `
        SELECT *, 'cathode' as type FROM coatingcathode_batch
        WHERE startTime BETWEEN ? AND ?
          AND (is_deleted IS NULL OR is_deleted = "1")
          ${searchCondition}
      `;
      const anodeQuery = `
        SELECT *, 'anode' as type FROM coatinganode_batch
        WHERE startTime BETWEEN ? AND ?
          AND (is_deleted IS NULL OR is_deleted = "1")
          ${searchCondition}
      `;
      const [cathodeRows] = await dbmes.query(cathodeQuery, [start, end, ...searchParams]);
      const [anodeRows] = await dbmes.query(anodeQuery, [start, end, ...searchParams]);
      rows = [...cathodeRows, ...anodeRows].sort((a, b) => {
        const timeA = new Date(a.startTime);
        const timeB = new Date(b.startTime);
        if (timeB - timeA !== 0) return timeB - timeA;
        return b.id - a.id;
      });

      console.log("合併後的 rows 數量:", rows.length , Object.entries(rows || {}) , "typeof rows :" , typeof rows);
    }

    
    else {
      return res.status(400).json({
        success: false,
        message: "無效的查詢選項"
      });
    }

    // 匯出 Excel
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Coating Data");
    const excelBuffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=coating_data.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.status(200).send(excelBuffer);
  } catch (error) {
    console.log("downloadData error :", error);
    res.status(500).json({
      success: false,
      message: "下載失敗",
      error: error.message
    });
  }
})



// Stock 刪除功能
router.put("/deleteSuccess", async (req, res) => {
  const deleteSelected = req.body;
  console.log("deleteSuccess 接收到的資料 :", deleteSelected);

  if (!Array.isArray(deleteSelected) || deleteSelected.length === 0) {
    return res.status(400).json({ success: false, message: "無刪除資料" });
  }

let Message_notify = `
===============================================================
📢 塗佈區刪除資料通知 📢

𖣁 選擇站別: ${deleteSelected[0]?.selectWork || '無'}
🔄 刪除id: ${deleteSelected.map(item => item.id).join(', ') || '無'}
🕒 更新時間: ${moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss')}
👤 操作人員: ${deleteSelected[0]?.deleted_by || '無'}
===============================================================
`;

  const config_Discord = {
    headers: {
      'Content-Type': 'application/json'
    }
  }

  try {

    
    await stockDelete(deleteSelected);
    await axios.post(discord_rollingNSlitting_notify, { content: Message_notify }, config_Discord);
    res.status(200).json({ success: true, message: "刪除成功" });
    
  } catch (error) {
    console.error("Error in /deleteSuccess:", error);
    res.status(500).json({
      success: false,
      message: "刪除失敗",
      error: error.message,
    });
  }
});

// 從負極塗佈單面 到 負極塗佈雙面 的顯示
router.get("/singleAnode" , async (req , res) =>{
  const { selectWork} = req.query;

  const sql = `SELECT DISTINCT lotNumber, productionMeters
  FROM mes.coatinganode_batch 
  WHERE is_deleted = 0 AND 
  selectWork = "coaterAnode_S" AND 
  is_received NOT IN ("1" , "2" , "3")
  order by id desc;`
  
  try{

    const [rows] = await dbmes.query(sql);
    console.log("查詢結果:", rows);

    res.status(200).json({
      success: true,
      message: "查找負極單面lotNumber成功",
      data: rows
    });

  }catch(error){
    console.error("Error in /singleAnode:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message 
    });
  }
})

router.put("/updateSingleLotNumberStatus" , async (req , res) =>{
  const {lotNumber} = req.body;

  console.log("updateSingleLotNumberStatus 接收到的 lotNumber :", lotNumber);

  if (!lotNumber) {
    return res.status(400).json({
      success: false,
      message: "無lotNumber資料"
    });
  }
  
  const sql = `UPDATE mes.coatinganode_batch SET is_received = "3" WHERE lotNumber = ? AND is_deleted = 0 AND selectWork = "coaterAnode_S";`

  try{
    const [result] = await dbmes.query(sql, [lotNumber]);
    console.log("更新結果:", result);
    res.status(200).json({
      message: "更新負極單面lotNumber成功",
      success: true,
      data: {
        originalLotNumber: lotNumber,
        affectedRows: result.affectedRows
      }
    })
    
  }catch(error){
    console.error("Error in /updateSingleLotNumberStatus:", error);
    res.status(500).json({
      success: false,
      message: "更新失敗",
      error: error.message 
    });
  }
})

module.exports = router;
