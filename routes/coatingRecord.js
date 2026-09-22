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
const { PrismaClient: MesClient } = require("../generated/mes");
const prismaMes = new MesClient();

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
  "slurryBatch_b",
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
  "deleted_by",

  // 2026.06.01 新增欄位 for 極耳
  "tabRight",
  "tabLeft",
  "tabSingleLeft",
  "tabSingleRight",
  "tabLeftDiff",
  "tabRightDiff"
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
  "deleted_by",

  // 2026.06.01 新增欄位 for 極耳
  "tabRight",
  "tabLeft",
  "tabSingleLeft",
  "tabSingleRight",
  "tabLeftDiff",
  "tabRightDiff",
  "cucode",
  "cucode_meter",
  "singleUseCount",
  "singleUseBalance"
];


// 於混漿區查找對應的混漿批次
const findMixingBatch = async (slurryBatch, selectWork) => {
  if (!Array.isArray(slurryBatch) || slurryBatch.length === 0) {
    return [];
  }

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
      return [];
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

    params = [slurryBatch[0].trim(), slurryBatch[0].trim(), slurryBatch[1].trim(), slurryBatch[1].trim()];
  }
  else if (Array.isArray(slurryBatch) && slurryBatch.length === 1) {
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

  try {
    const [rows] = await dbmes.query(sql, params);
    console.log("findMixingBatch 查詢結果:", rows, "typeof rows (slurryBatch):", typeof rows);
    return rows;

  } catch (error) {
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
    if (row.hasOwnProperty('first_weight_left_S')) {
      row['first_weight_left_S(SV)'] = row.first_weight_left_S;
      delete row.first_weight_left_S;
    }
    if (row.hasOwnProperty('first_weight_left_E')) {
      row['first_weight_left_E(SV)'] = row.first_weight_left_E;
      delete row.first_weight_left_E;
    }
    if (row.hasOwnProperty('first_weight_middle_S')) {
      row['first_weight_middle_S(SV)'] = row.first_weight_middle_S;
      delete row.first_weight_middle_S;
    }
    if (row.hasOwnProperty('first_weight_middle_E')) {
      row['first_weight_middle_E(SV)'] = row.first_weight_middle_E;
      delete row.first_weight_middle_E;
    }
    if (row.hasOwnProperty('first_weight_right_S')) {
      row['first_weight_right_S(SV)'] = row.first_weight_right_S;
      delete row.first_weight_right_S;
    }
    if (row.hasOwnProperty('first_weight_right_E')) {
      row['first_weight_right_E(SV)'] = row.first_weight_right_E;
      delete row.first_weight_right_E;
    }
    if (row.hasOwnProperty('last_weight_left_S')) {
      row['last_weight_left_S(SV)'] = row.last_weight_left_S;
      delete row.last_weight_left_S;
    }
    if (row.hasOwnProperty('last_weight_left_E')) {
      row['last_weight_left_E(SV)'] = row.last_weight_left_E;
      delete row.last_weight_left_E;
    }
    if (row.hasOwnProperty('last_weight_middle_S')) {
      row['last_weight_middle_S(SV)'] = row.last_weight_middle_S;
      delete row.last_weight_middle_S;
    }
    if (row.hasOwnProperty('last_weight_middle_E')) {
      row['last_weight_middle_E(SV)'] = row.last_weight_middle_E;
      delete row.last_weight_middle_E;
    }
    if (row.hasOwnProperty('last_weight_right_S')) {
      row['last_weight_right_S(SV)'] = row.last_weight_right_S;
      delete row.last_weight_right_S;
    }
    if (row.hasOwnProperty('last_weight_right_E')) {
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

// machineNo 可能是 object / JSON 字串 / 舊版純字串，統一在各流程處理
const parseMachineNo = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {

      if (parsed.hasOwnProperty("mainName") || parsed.hasOwnProperty("subNo")) {
        return parsed;
      }
    }
  } catch (error) {
    // 非 JSON 字串，保留原值
  }

  return value;
};

const serializeMachineNoForDb = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
};

const formatMachineNoForDisplay = (value) => {
  const machineNoObj = parseMachineNo(value);
  if (!machineNoObj || typeof machineNoObj !== "object") {
    return machineNoObj || "";
  }

  const mainName = machineNoObj.mainName || "";
  const subNo = machineNoObj.subNo || "";
  if (mainName && subNo) return `${mainName} (${subNo})`;
  if (mainName) return mainName;
  if (subNo) return subNo;

  return JSON.stringify(machineNoObj);
};

const parseMachineNoInRows = (rows = []) => {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row || typeof row !== "object" || !("machineNo" in row)) return row;
    return {
      ...row,
      machineNo: parseMachineNo(row.machineNo)
    };
  });
};

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
      } else if (column === "machineNo") {
        valuesArray.push(serializeMachineNoForDb(machineData[column]));
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
const checkIfLotNoExists = async (selectWork, lotNumber) => {
  console.log('確認所有參數 :', selectWork, lotNumber);

  if (!lotNumber) return false;

  let sql = "";
  let params = [];

  if (selectWork === 'coaterAnode_D') {
    sql = `
    SELECT id 
    FROM mes.coatinganode_batch 
    WHERE lotNumber = ?
      AND selectWork = ?
      AND(deleted_by = '' OR deleted_by IS NULL) 
    LIMIT 1;
    `;
    params = [lotNumber, selectWork];
  } else if (selectWork === 'coaterCathode') {
    sql = `
    SELECT id 
    FROM mes.coatingcathode_batch 
    WHERE lotNumber = ? 
      AND (deleted_by = '' OR deleted_by IS NULL) 
    LIMIT 1;
    `;
    params = [lotNumber];
  } else {
    return false;
  }

  try {
    const [rows] = await dbmes.query(sql, params);
    return rows && rows.length > 0;
  } catch (error) {
    console.error("Error in checkIfLotNoExists:", error);
    return false;
  }
}

const stockDelete = async (data, conn = dbmes) => {
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

    // console.log("執行 SQL:", sql);
    // console.log("參數:", params);

    return await conn.query(sql, params);
  });

  // 等待全部批次執行完畢
  await Promise.all(promises);
};

// 用於更新單機版塗佈機資料
const fillIntoSingle = async (singleUseCount, LotNumber, ProductionMeter, conn = dbmes) => {
  let sql = "";
  let params = [];

  console.log('確認所有參數  ：', singleUseCount, LotNumber, ProductionMeter)

  if (singleUseCount === '1') {
    // 第一次由 coaterAnode_D 送出，更新 coaterAnode_S 的 singleUseCount 為 1 並記錄 balance
    sql = `UPDATE mes.coatinganode_batch
           SET singleUseCount = ?, 
               singleUseBalance = ?

           WHERE lotNumber = ? AND selectWork = 'coaterAnode_S'`;
    params = [singleUseCount, ProductionMeter, LotNumber];
  }
  else if (singleUseCount === '2') {
    // 第二次由 coaterAnode_D 送出，更新 coaterAnode_S 的 singleUseCount 為 2 並設定為完全用盡 (is_received = 3)
    sql = `UPDATE mes.coatinganode_batch
           SET singleUseCount = ?, is_received = '3'
           WHERE lotNumber = ? AND selectWork = 'coaterAnode_S'`;
    params = [singleUseCount, LotNumber];
  } else {
    return;
  }

  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } catch (error) {
    console.error("Error in /postCoatingRecord (fillIntoSingle):", error);
    throw error;
  }
}

// 上傳工程師設定
router.post("/engineerSetting", async (req, res) => {
  const machineSettings = req.body;  // { coaterAnode_D: {...}, coaterAnode_S: {...}, coaterCathode: {...} }

  console.log("塗佈機設定請求:", machineSettings);

  let conn;
  let isNetworkError = false;
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

    conn = await dbcon.getConnection();
    await conn.beginTransaction();

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

    // console.log("執行 SQL:", sql);

    // 執行 SQL
    await conn.query(sql);
    await conn.commit();

    res.status(200).json({
      success: true,
      message: "塗佈機設定儲存成功",
      data: machineSettings
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("Error in /engineerSetting:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "塗佈機設定儲存失敗",
        error: error.message
      });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
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

    const slurryBatchInput_b = [
      recordData.slurryBatch01_b,
      recordData.slurryBatch02_b
    ].filter(v => v !== undefined && v !== null && String(v).trim() !== "").map(v => String(v).trim());

    console.log("處理後的 slurryBatch (input):", slurryBatchInput);

    let conn;
    let isNetworkError = false;

    try {
      conn = await dbmes.getConnection();
      await conn.beginTransaction();

      // 依 selectWork 決定實際寫入的表與欄位模板
      switch (recordData.selectWork) {
        case 'coaterCathode':
          insertTable = "mes.coatingcathode_batch";
          columnTemplateKey = "coatingcathode_batch";
          break;
        case "coaterAnode_S":
          insertTable = "mes.coatinganode_batch";
          columnTemplateKey = "coatinganode_batch";
          break;
        case "coaterAnode_D":
          insertTable = "mes.coatinganode_batch";
          columnTemplateKey = "coatinganode_batch";

          if (recordData.lotNumber_SinglePage) {
            const sql_single_update = `UPDATE mes.coatinganode_batch SET is_received = '3' WHERE lotNumber = ? AND selectWork = 'coaterAnode_S'`;
            await conn.query(sql_single_update, [recordData.lotNumber_SinglePage]);
            console.log("更新 coaterAnode_S 狀態為 is_received = '3' | lotNumber:", recordData.lotNumber_SinglePage);
          }

          if (recordData.singleUseCount !== undefined && recordData.singleUseCount !== null && String(recordData.singleUseCount) === '0') {
            console.log('我有先確認 有跑進入if (recordData.singleUseCount === 0)')
            await fillIntoSingle('1', recordData.lotNumber_SinglePage, recordData.lotNumber_SinglePage_meter, conn)
          }

          if (recordData.singleUseCount !== undefined && recordData.singleUseCount !== null && String(recordData.singleUseCount) === '1') {
            console.log('我有先確認 有跑進入if (recordData.singleUseCount === 1)')
            await fillIntoSingle('2', recordData.lotNumber_SinglePage, recordData.lotNumber_SinglePage_meter, conn)
          }
          break;
        default:
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: "無效的 selectWork 類型"
          });
      }

      // 嘗試從混漿批次表查出 LotNo，查不到就沿用原始輸入
      try {
        const rows = await findMixingBatch(slurryBatchInput, recordData.selectWork);
        const rows_B = await findMixingBatch(slurryBatchInput_b, recordData.selectWork);

        if (Array.isArray(rows) && rows.length > 0) {
          recordData.slurryBatch = rows.map(r => r.LotNo).join(", ");
        } else {
          recordData.slurryBatch = slurryBatchInput.join(",");
        }
        if (Array.isArray(rows_B) && rows_B.length > 0) {
          recordData.slurryBatch_b = rows_B.map(r => r.LotNo).join(", ");
        } else {
          recordData.slurryBatch_b = slurryBatchInput_b.join(",");
        }
      } catch (e) {
        console.log("查詢混漿批次失敗，改用原始輸入:", e?.message);
        recordData.slurryBatch = slurryBatchInput.join(",");
        recordData.slurryBatch_b = slurryBatchInput_b.join(",");
      }

      // 以 columnTemplateKey 取得欄位模板，insertTable 作為實際寫入表
      const { columnsArray, valuesArray } = coatingFetchDB(recordData, columnTemplateKey);

      if (!columnsArray || !valuesArray || valuesArray.length === 0) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "沒有提供任何塗佈記錄資料"
        });
      }

      // 檢查 LotNumber 是否已存在
      const isExists = await checkIfLotNoExists(recordData.selectWork, recordData.lotNumber)
      if (isExists) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "LotNumber 已存在"
        });
      }
      const placeholders = valuesArray.map(() => '?').join(', ');
      const sql = `INSERT INTO ${insertTable} (${columnsArray.join(', ')}) VALUES (${placeholders})`;

      // console.log("執行 SQL:", sql);
      // console.log("參數:", valuesArray);

      const [rows] = await conn.query(sql, valuesArray);
      console.log("插入結果:", rows);

      await conn.commit();

      res.status(200).json({
        success: true,
        message: "塗佈記錄儲存成功",
        data: recordData
      });

    } catch (error) {
      if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
        isNetworkError = true;
      }
      if (conn) {
        try {
          await conn.rollback();
        } catch (rbErr) {
          console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
        }
      }
      console.error("Error in /postCoatingRecord:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "儲存失敗",
          error: error.message
        });
      }
    } finally {
      if (conn) {
        if (isNetworkError || conn.destroyed) {
          conn.destroy();
        } else {
          conn.release();
        }
      }
    }

  });

// 不良品設定get 
router.get("/getFaultProduct", async (req, res) => {
  const { startDay, endDay, selectWork, page = 1, pageSize = 10 } = req.query;
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

  switch (selectWork) {
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
  } catch (error) {
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

  Object.keys(products).forEach((key) => {
    if (!products[key].is_deleted === "1") {
      products[key].is_deleted = null;
      products[key].deleted_at = null;
      products[key].delete_operation = null;
      products[key].delete_by = null;
    }
  });

  let conn;
  let isNetworkError = false;

  try {
    // 第一步：按表名分組（批次插入優化）
    const groupedByTable = {};
    const invalidProducts = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const tableName = getTableName(product.selectWork);

      if (!tableName) {
        console.error(`第 ${i + 1} 筆資料 selectWork 無效:`, product.selectWork);
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

    conn = await dbmes.getConnection();
    await conn.beginTransaction();

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

      const [result] = await conn.query(sql, params);
      totalInserted += result.affectedRows;

      results.push({
        tableName,
        count: productsInTable.length,
        firstInsertId: result.insertId,
        affectedRows: result.affectedRows
      });
    }

    await conn.commit();

    res.json({
      success: invalidProducts.length === 0,
      message: `批次插入完成：成功 ${totalInserted} 筆，無效 ${invalidProducts.length} 筆`,
      total: products.length,
      inserted: totalInserted,
      invalid: invalidProducts.length,
      invalidProducts,
      results
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("Error in /upsertFaultProduct:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "儲存失敗",
        error: error.message
      });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
  }
});


router.post("/renewListNo", async (req, res) => {
  const data = req.body;

  // console.log("renewListNo 接收到的 data :", data);

  let Message_notify = `
===============================================================
📢 塗佈區批次號碼更新通知 📢\n\n
𖣁 更新機器: ${formatMachineNoForDisplay(data.machineNo)}\n
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

  try {

    if (process.env.discord_coating_notify) {
      try {
        await axios.post(process.env.discord_coating_notify, {
          content: Message_notify
        }, { ...config_Discord, timeout: 5000 });
      } catch (notifyErr) {
        console.error("Discord 塗佈批次號碼更新通知失敗:", notifyErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "更新成功",
      data: data
    })

  } catch (error) {
    console.error("Error in /renewListNo:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "更新失敗",
        error: error.message
      });
    }
  }
});


// 查詢待轉入庫存的資料
router.get("/getStockData", async (req, res) => {
  const { startDay, endDay, selectWork, page = 1, pageSize = 10 } = req.query;
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


  try {
    const [rowsRaw] = await dbmes.query(sql, params);
    const rows = parseMachineNoInRows(rowsRaw);

    let finalSend = [];

    if (Array.isArray(rows) && rows.length > 0) {
      finalSend = rows.map(row => {
        return {

          ...row,
          machineNo: row.machineNo.mainName || row.machineNo || "",
        }
      })
    }

    console.log("rows", rows);

    const [countResult] = await dbmes.query(sql_count, [
      moment(startDay).tz('Asia/Taipei').format('YYYY-MM-DD 00:00:00'),
      moment(endDay).tz('Asia/Taipei').format('YYYY-MM-DD 23:59:59')]);
    const totalCount = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / pageSizeNum);



    res.json({
      success: true,
      data: {
        finalSend,
        totalCount,
        totalPages,
        currentPage: page,
        pageSize: pageSizeNum,
        hasNextPage: parseInt(page, 10) < totalPages,
        hasPrevPage: parseInt(page, 10) > 1
      }
    });
  } catch (error) {
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

  let conn;
  let isNetworkError = false;
  try {
    conn = await dbmes.getConnection();
    await conn.beginTransaction();

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
      const machineNoParsed = parseMachineNo(item.machineNo);
      const machineNoForDb = serializeMachineNoForDb(machineNoParsed);

      let sql = "";
      let params = [];

      if (machineNoParsed && typeof machineNoParsed === "object") {
        sql = `UPDATE ${tableName} SET stock = 1 WHERE lotNumber = ? AND JSON_CONTAINS(machineNo, CAST(? AS JSON))`;
        params = [item.lotNumber, machineNoForDb];
      } else {
        sql = `UPDATE ${tableName} SET stock = 1 WHERE lotNumber = ? AND machineNo = ?`;
        params = [item.lotNumber, machineNoForDb];
      }

      console.log(`更新: 將 ${item.lotNumber} (${formatMachineNoForDisplay(item.machineNo)}) 標記為已轉入庫存`);

      return await conn.query(sql, params);
    });

    const results = await Promise.all(updatePromises);

    const totalAffected = results.reduce((sum, [result]) => sum + result.affectedRows, 0);

    await conn.commit();

    res.status(200).json({
      success: true,
      message: `批次更新完成：成功更新 ${totalAffected} 筆資料`,
      total: data.length,
      updated: totalAffected,
      data: data
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("Error in /transferStock:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "批次更新失敗",
        error: error.message
      });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
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

    if (searchTerm.length > 4) {
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
        const [cathodeRowsRaw] = await dbmes.query(cathodeQuery, [start, end, ...searchParams]);
        const [anodeRowsRaw] = await dbmes.query(anodeQuery, [start, end, ...searchParams]);
        const cathodeRows = parseMachineNoInRows(cathodeRowsRaw);
        const anodeRows = parseMachineNoInRows(anodeRowsRaw);
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

      case "error":
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
    const [rowsRaw] = await dbmes.query(mainQuery, mainParams);
    const rows = parseMachineNoInRows(rowsRaw);
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

  // 過濾無效或空的資料行
  const validRows = (selectedRows || []).filter(row => row !== null && row !== undefined);

  // 驗證資料
  if (!Array.isArray(validRows) || validRows.length === 0) {
    return res.status(400).json({
      success: false,
      message: "沒有提供刪除資料或格式錯誤"
    });
  }

  const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');

  let conn;
  let isNetworkError = false;
  try {
    conn = await dbmes.getConnection();
    await conn.beginTransaction();

    const deletePromises = validRows.map(async (row, index) => {
      let sql = "";
      let params = [];

      console.log(`處理第 ${index + 1} 筆:`, {
        id: row.id,
        selectWork: row.selectWork,
        deleted_by: row.deleted_by
      });

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

      return await conn.query(sql, params);
    });

    const results = await Promise.all(deletePromises);

    const totalAffected = results.reduce((sum, [result]) => sum + result.affectedRows, 0);

    console.log(`批次刪除完成: 影響 ${totalAffected} 筆資料`);

    await conn.commit();

    res.status(200).json({
      success: true,
      message: `批次刪除成功: ${totalAffected} 筆資料已標記為刪除`,
      totalProcessed: validRows.length,
      totalAffected: totalAffected,
      data: validRows
    });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("Error in /deleteData:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "刪除失敗",
        error: error.message
      });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
  }
});


const changeTime = () => {

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
        -- 正極塗佈
        t1.coatingCathode_Count,
        t1.coatingCathode_faultyMeter_EmptySolder,
        t1.coatingCathode_faultyMeter_Faulty,
        t1.coatingCathode_faultyMeter_test,
        t1.shiftMeter_percent AS coatingCathode_shiftPercent,

        -- 負極塗佈雙面
        t2.coatingAnode_D_Count,
        t2.coatingAnode_D_faultyMeter_EmptySolder,
        t2.coatingAnode_D_faultyMeter_Faulty,
        t2.coatingAnode_D_faultyMeter_test,
        t2.shiftMeter_percent AS coatingAnode_D_shiftPercent,

        -- 負極塗佈單面
        t3.coatingAnode_S_Count,
        t3.coatingAnode_S_faultyMeter_EmptySolder,
        t3.coatingAnode_S_faultyMeter_Faulty,
        t3.coatingAnode_S_faultyMeter_test,
        t3.shiftMeter_percent AS coatingAnode_S_shiftPercent

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
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingAnode_D_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingAnode_D_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingAnode_D_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingAnode_D_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatinganode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1')
              AND dayShift = ? AND startTime BETWEEN ? AND ?
              AND selectWork = 'coaterAnode_D'
        ) AS t2
      CROSS JOIN
        (
          SELECT 
            SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingAnode_S_Count,
            SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingAnode_S_faultyMeter_EmptySolder,
            SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingAnode_S_faultyMeter_Faulty,
            SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingAnode_S_faultyMeter_test,
            ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
          FROM mes.coatinganode_batch 
          WHERE (is_deleted IS NULL OR is_deleted <> '1')
            AND dayShift = ? AND startTime BETWEEN ? AND ?
            AND selectWork = 'coaterAnode_S'
        ) AS t3
    `;
    params_useToCount = [dayShift, startTime, endTime, dayShift, startTime, endTime, dayShift, startTime, endTime];

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
          AND selectWork = 'coaterCathode'
      ) AS t2
      ORDER BY t1.memberNumber;
    `;

    params_getNoCount_cathode = [dayShift, startTime, endTime, dayShift, startTime, endTime];


    const sql_getNoCount_anode_D = `
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
          AND selectWork = 'coaterAnode_D'
      ) AS t1
      CROSS JOIN (
          SELECT MAX(startTime) AS latest_startTime
          FROM mes.coatinganode_batch
          WHERE (is_deleted IS NULL OR is_deleted <> '1')
          AND dayShift = ?
          AND startTime BETWEEN ? AND ?
          AND selectWork = 'coaterAnode_D'
      ) AS t2 
      ORDER BY t1.memberNumber;
    `;

    params_getNoCount_anode_D = [dayShift, startTime, endTime, dayShift, startTime, endTime];

    const sql_getNoCount_anode_S = `
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
          AND selectWork = 'coaterAnode_S'
      ) AS t1
      CROSS JOIN (
          SELECT MAX(startTime) AS latest_startTime
          FROM mes.coatinganode_batch
          WHERE (is_deleted IS NULL OR is_deleted <> '1')
          AND dayShift = ?
          AND startTime BETWEEN ? AND ?
          AND selectWork = 'coaterAnode_S'
      ) AS t2 
      ORDER BY t1.memberNumber;
    `;

    params_getNoCount_anode_S = [dayShift, startTime, endTime, dayShift, startTime, endTime];



    // ✅ 同時查詢四筆 SQL
    const [[countRows], [cathodeRows], [anodeDRows], [anodeSRows]] = await Promise.all([
      dbmes.query(sql_useToCount, params_useToCount),
      dbmes.query(sql_getNoCount_cathode, params_getNoCount_cathode),
      dbmes.query(sql_getNoCount_anode_D, params_getNoCount_anode_D),
      dbmes.query(sql_getNoCount_anode_S, params_getNoCount_anode_S),
    ]);

    console.log("countRows:", countRows);
    console.log("cathodeRows:", cathodeRows);
    console.log("anodeDRows:", anodeDRows);
    console.log("anodeSRows:", anodeSRows);

    const countResult_Data = countRows[0] || {};

    // ✅ 只取 "姓名|工號" 組合
    const cathode_memberInfo = Array.from(
      new Set(
        cathodeRows.map(row => `${row.memberName || ""}(${row.memberNumber || ""})`)
      )
    );

    const anode_D_memberInfo = Array.from(
      new Set(
        anodeDRows.map(row => `${row.memberName || ""}(${row.memberNumber || ""})`)
      )
    );

    const anode_S_memberInfo = Array.from(
      new Set(
        anodeSRows.map(row => `${row.memberName || ""}(${row.memberNumber || ""})`)
      )
    );

    // ✅ 只取其中一筆 startTime（全表最大值即可）
    const dataResult_Cathode = cathodeRows[0] || {};
    const dataResult_Anode_D = anodeDRows[0] || {};
    const dataResult_Anode_S = anodeSRows[0] || {};

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

    const anode_D_mixing_utilization =
      1 -
      ((
        (countResult_Data.coatingAnode_D_faultyMeter_Faulty || 0) +
        (countResult_Data.coatingAnode_D_faultyMeter_test || 0)
      ) /
        ((countResult_Data.coatingAnode_D_Count || 0) +
          (countResult_Data.coatingAnode_D_faultyMeter_Faulty || 0) +
          (countResult_Data.coatingAnode_D_faultyMeter_test || 0)));

    const anode_S_mixing_utilization =
      1 -
      ((
        (countResult_Data.coatingAnode_S_faultyMeter_Faulty || 0) +
        (countResult_Data.coatingAnode_S_faultyMeter_test || 0)
      ) /
        ((countResult_Data.coatingAnode_S_Count || 0) +
          (countResult_Data.coatingAnode_S_faultyMeter_Faulty || 0) +
          (countResult_Data.coatingAnode_S_faultyMeter_test || 0)));

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
      coaterAnode_D: {
        station: "負極塗佈雙面(米)",
        time: dataResult_Anode_D.latest_startTime
          ? moment(dataResult_Anode_D.latest_startTime)
            .tz("Asia/Taipei")
            .format("YYYY-MM-DD HH:mm:ss")
          : "",
        count: countResult_Data.coatingAnode_D_Count || 0,
        faultyMeter_EmptySolder:
          countResult_Data.coatingAnode_D_faultyMeter_EmptySolder || 0,
        faultyMeter_Faulty:
          countResult_Data.coatingAnode_D_faultyMeter_Faulty || 0,
        faultyMeter_test: countResult_Data.coatingAnode_D_faultyMeter_test || 0,
        shiftMeter_percent: countResult_Data.coatingAnode_D_shiftPercent || 0,
        mixing_utilization: anode_D_mixing_utilization || 0,
        memberInfo: anode_D_memberInfo,
      },
      coaterAnode_S: {
        station: "負極塗佈單面(米)",
        time: dataResult_Anode_S.latest_startTime
          ? moment(dataResult_Anode_S.latest_startTime)
            .tz("Asia/Taipei")
            .format("YYYY-MM-DD HH:mm:ss")
          : "",
        count: countResult_Data.coatingAnode_S_Count || 0,
        faultyMeter_EmptySolder:
          countResult_Data.coatingAnode_S_faultyMeter_EmptySolder || 0,
        faultyMeter_Faulty:
          countResult_Data.coatingAnode_S_faultyMeter_Faulty || 0,
        faultyMeter_test: countResult_Data.coatingAnode_S_faultyMeter_test || 0,
        shiftMeter_percent: countResult_Data.coatingAnode_S_shiftPercent || 0,
        mixing_utilization: anode_S_mixing_utilization || 0,
        memberInfo: anode_S_memberInfo,
      }
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


router.get("/pastReport", async (req, res) => {
  const { startDate, endDate, dayShift } = req.query;
  console.log("pastReport 接收到的參數 :", startDate, "|", endDate, "|", dayShift);

  let start = "";
  let end = "";
  let shift = dayShift ? dayShift : "";
  let params = [];
  let sql = "";

  let baseStart = ''; // 若有班別
  let baseEnd = ''; // 若有班別


  // 依班別
  if (shift && shift !== '') {
    if (shift === '早班') {
      baseStart = startDate
        ? moment(startDate).tz('Asia/Taipei').hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss')
        : moment().tz('Asia/Taipei').hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');

      baseEnd = startDate
        ? moment(startDate).tz('Asia/Taipei').hour(19).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss')
        : moment().tz('Asia/Taipei').hour(19).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss');
    } else {
      baseStart = startDate
        ? moment(startDate).tz('Asia/Taipei').hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss')
        : moment().tz('Asia/Taipei').hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');

      baseEnd = startDate
        ? moment(startDate).tz('Asia/Taipei').add(1, 'day').hour(7).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss')
        : moment().tz('Asia/Taipei').add(1, 'day').hour(7).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss');
    }
  }
  else {
    baseStart = startDate
      ? moment(startDate).tz('Asia/Taipei').hour(0).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss')
      : moment().tz('Asia/Taipei').hour(0).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');

    baseEnd = endDate
      ? moment(endDate).tz('Asia/Taipei').hour(23).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss')
      : moment().tz('Asia/Taipei').hour(23).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss');
  }

  // 建構三工序的 SQL 查詢範本
  const buildSql = () => `
    SELECT 
        -- 正極塗佈
        t1.coatingCathode_Count,
        t1.coatingCathode_faultyMeter_EmptySolder,
        t1.coatingCathode_faultyMeter_Faulty,
        t1.coatingCathode_faultyMeter_test,
        t1.shiftMeter_percent AS coatingCathode_shiftPercent,

        -- 負極塗佈雙面
        t2.coatingAnode_D_Count,
        t2.coatingAnode_D_faultyMeter_EmptySolder,
        t2.coatingAnode_D_faultyMeter_Faulty,
        t2.coatingAnode_D_faultyMeter_test,
        t2.shiftMeter_percent AS coatingAnode_D_shiftPercent,

        -- 負極塗佈單面
        t3.coatingAnode_S_Count,
        t3.coatingAnode_S_faultyMeter_EmptySolder,
        t3.coatingAnode_S_faultyMeter_Faulty,
        t3.coatingAnode_S_faultyMeter_test,
        t3.shiftMeter_percent AS coatingAnode_S_shiftPercent
      FROM
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingCathode_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingCathode_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatingcathode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1') ${shift ? 'AND dayShift = ? ' : ''} AND startTime BETWEEN ? AND ?
        ) AS t1
      CROSS JOIN
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingAnode_D_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingAnode_D_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingAnode_D_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingAnode_D_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatinganode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1') ${shift ? 'AND dayShift = ? ' : ''} AND startTime BETWEEN ? AND ?
              AND selectWork = 'coaterAnode_D'
        ) AS t2
      CROSS JOIN
        (
            SELECT
                SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) AS coatingAnode_S_Count,
                SUM(CASE WHEN lostResult = '空箔' THEN lostMeter ELSE 0 END) AS coatingAnode_S_faultyMeter_EmptySolder,
                SUM(CASE WHEN lostResult IN ('收卷廢料', '架上廢料') THEN lostMeter ELSE 0 END) AS coatingAnode_S_faultyMeter_Faulty,
                SUM(CASE WHEN lostResult = '測試料' THEN lostMeter ELSE 0 END) AS coatingAnode_S_faultyMeter_test,
                ROUND(SUM(CASE WHEN productionMeters IS NOT NULL THEN productionMeters ELSE 0 END) / 10800 * 100, 2) AS shiftMeter_percent
            FROM mes.coatinganode_batch 
            WHERE (is_deleted IS NULL OR is_deleted <> '1') ${shift ? 'AND dayShift = ? ' : ''} AND startTime BETWEEN ? AND ?
              AND selectWork = 'coaterAnode_S'
        ) AS t3;
  `;

  sql = buildSql();

  const subQueryParams = shift
    ? [shift, baseStart, baseEnd]
    : [baseStart, baseEnd];

  params = [...subQueryParams, ...subQueryParams, ...subQueryParams];

  try {

    console.log("執行的 params :", params);
    const [rows] = await dbmes.query(sql, params);
    const data = Object.entries(rows[0] || {}).reduce((acc, [key, value]) => {
      if (key.startsWith("coatingCathode_")) {
        const newKey = key.replace("coatingCathode_", "");
        acc.coaterCathode = acc.coaterCathode || {};
        acc.coaterCathode[newKey] = value;
      }
      else if (key.startsWith("coatingAnode_D_")) {
        const newKey = key.replace("coatingAnode_D_", "");
        acc.coaterAnode_D = acc.coaterAnode_D || {};
        acc.coaterAnode_D[newKey] = value;
      }
      else if (key.startsWith("coatingAnode_S_")) {
        const newKey = key.replace("coatingAnode_S_", "");
        acc.coaterAnode_S = acc.coaterAnode_S || {};
        acc.coaterAnode_S[newKey] = value;
      }
      return acc;
    }, {});

    console.log("整理後的 data :", data);

    res.status(200).json({
      success: true,
      message: "查詢成功",
      data: data
    })

  } catch (error) {
    console.error("Error in /pastReport:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message
    });
  }
})


router.get("/getHandOverRecord", async (req, res) => {
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
  const params = [start, end];

  let sql_count = `SELECT COUNT(*) as totalCount FROM hr.handover_coating WHERE createAt BETWEEN ? AND ? AND selectWork = "coating"`;
  const params_count = [start, end];

  if (searchTerm) {
    sql += `AND innerText LIKE ? `;
    sql_count += `AND innerText LIKE ? `;
    const likeTerm = `%${searchTerm}%`;
    params.push(likeTerm);
    params_count.push(likeTerm);
  }

  sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try {

    const [rows] = await dbmes.query(sql, params);
    const [totalCount] = await dbmes.query(sql_count, params_count);


    //總頁數
    totalPage_set = Math.ceil(totalCount[0].totalCount / limit);

    res.status(200).json({
      success: true,
      message: "查詢成功",
      data: rows,
      page: page,
      totalPages: totalPage_set
    });

  } catch (error) {
    console.error("Error in /getHandOverRecord:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message
    });
  }
})

router.post("/sendHandOverRecord", async (req, res) => {
  const { payload } = req.body;

  console.log("sendHandOverRecord 接收到的 data :", payload);

  try {
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

  } catch (error) {
    console.error("Error in /sendHandOverRecord:", error);
    res.status(500).json({
      success: false,
      message: "新增失敗",
      error: error.message
    });
  }
})

router.get("/downloadData", async (req, res) => {

  const { option, searchTerm = "", startDay, endDay, memberID } = req.query;
  const xlsx = require("xlsx");
  const moment = require("moment");
  let selectWork = "";

  switch (option) {
    case "正極塗佈":
      selectWork = "coaterCathode";
      break;
    case "負極塗佈":
      selectWork = "coaterAnode_D";
      break;
    default:
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
    "endDay", endDay, "|",
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
      const [cathodeRowsRaw] = await dbmes.query(cathodeQuery, [start, end, ...searchParams]);
      const [anodeRowsRaw] = await dbmes.query(anodeQuery, [start, end, ...searchParams]);
      const cathodeRows = parseMachineNoInRows(cathodeRowsRaw);
      const anodeRows = parseMachineNoInRows(anodeRowsRaw);
      rows = [...cathodeRows, ...anodeRows].sort((a, b) => {
        const timeA = new Date(a.startTime);
        const timeB = new Date(b.startTime);
        if (timeB - timeA !== 0) return timeB - timeA;
        return b.id - a.id;
      });

      console.log("合併後的 rows 數量:", rowsFinal.length, Object.entries(rowsFinal || {}), "typeof rows :", typeof rowsFinal);
    } else if (option === "正極塗佈") {
      const cathodeQuery = `
        SELECT * FROM coatingcathode_batch
        WHERE startTime BETWEEN ? AND ?
          AND (is_deleted IS NULL OR is_deleted != "1")
          ${searchCondition}
      `;
      const [cathodeRowsRaw] = await dbmes.query(cathodeQuery, [start, end, ...searchParams]);
      const cathodeRows = parseMachineNoInRows(cathodeRowsRaw);
      const [cathodeEngineerSet] = await dbcon.query(sql_findEngineerSet);

      rows = [...cathodeRows, ...cathodeEngineerSet];

      const rowsFinal = searchForIsoForm(rows)
      console.log("合併後的 rows 數量:", rowsFinal.length, Object.entries(rowsFinal || {}), "typeof rows :", typeof rowsFinal);

    } else if (option === "負極塗佈") {
      const anodeQuery = `
        SELECT * FROM coatinganode_batch
        WHERE startTime BETWEEN ? AND ?
          AND (is_deleted IS NULL OR is_deleted != "1")
          ${searchCondition}
      `;
      const [anodeRowsRaw] = await dbmes.query(anodeQuery, [start, end, ...searchParams]);
      const anodeRows = parseMachineNoInRows(anodeRowsRaw);
      const [anodeEngineerSet] = await dbcon.query(sql_findEngineerSet);
      rows = [...anodeRows, ...anodeEngineerSet];

      const rowsFinal = searchForIsoForm(rows)

      console.log("合併後的 rows 數量:", rowsFinal.length, Object.entries(rowsFinal || {}), "typeof rows :", typeof rowsFinal);

    } else if (option === "error") {
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
      const [cathodeRowsRaw] = await dbmes.query(cathodeQuery, [start, end, ...searchParams]);
      const [anodeRowsRaw] = await dbmes.query(anodeQuery, [start, end, ...searchParams]);
      const cathodeRows = parseMachineNoInRows(cathodeRowsRaw);
      const anodeRows = parseMachineNoInRows(anodeRowsRaw);
      rows = [...cathodeRows, ...anodeRows].sort((a, b) => {
        const timeA = new Date(a.startTime);
        const timeB = new Date(b.startTime);
        if (timeB - timeA !== 0) return timeB - timeA;
        return b.id - a.id;
      });

      console.log("合併後的 rows 數量:", rows.length, Object.entries(rows || {}), "typeof rows :", typeof rows);
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

  let conn;
  let isNetworkError = false;
  try {
    conn = await dbmes.getConnection();
    await conn.beginTransaction();

    await stockDelete(deleteSelected, conn);
    await conn.commit();

    if (process.env.discord_rollingNSlitting_notify) {
      try {
        await axios.post(
          discord_rollingNSlitting_notify,
          { content: Message_notify },
          { ...config_Discord, timeout: 5000 }
        );
      } catch (notifyErr) {
        console.error("Discord 塗佈刪除通知失敗 (不影響 DB 已提交資料):", notifyErr.message);
      }
    }

    res.status(200).json({ success: true, message: "刪除成功" });

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("Error in /deleteSuccess:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "刪除失敗",
        error: error.message,
      });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
  }
});

// 從負極塗佈單面 到 負極塗佈雙面 的顯示
// 負極塗佈單面查詢
router.get("/singleAnode", async (req, res) => {
  const { selectWork } = req.query;

  const now = new Date();
  // 改用大寫 HH:mm:ss，建議結束時間取當天最後一秒或當前時間
  const today = moment(now).endOf('day').format('YYYY-MM-DD HH:mm:ss');
  const lastTwoWeek = moment(now).subtract(14, 'days').startOf('day').format('YYYY-MM-DD HH:mm:ss');

  const sql = `SELECT 
  lotNumber, 
  singleUseCount,
  productionMeters , 
  singleUseBalance
  FROM mes.coatinganode_batch 
  WHERE is_deleted = 0 AND 
  selectWork = "coaterAnode_S" AND
  startTime between ? AND ?
  order by id desc;`;

  try {
    const [rows] = await dbmes.query(sql, [lastTwoWeek, today]);
    console.log("查詢結果:", rows);

    typeof rows === 'object' && rows.forEach((item) => {
      item.productionMeters = (String(item.singleUseCount) === '1') ? item.productionMeters - item.singleUseBalance : item.productionMeters;
    });

    res.status(200).json({
      success: true,
      message: "查找負極單面lotNumber成功",
      data: rows
    });
  } catch (error) {
    console.error("Error in /singleAnode:", error);
    res.status(500).json({
      success: false,
      message: "查詢失敗",
      error: error.message
    });
  }
});


router.put("/updateSingleLotNumberStatus", async (req, res) => {
  const { lotNumber } = req.body;

  console.log("updateSingleLotNumberStatus 接收到的 lotNumber :", lotNumber);

  if (!lotNumber) {
    return res.status(400).json({
      success: false,
      message: "無lotNumber資料"
    });
  }

  const sql = `UPDATE mes.coatinganode_batch SET is_received = "3" WHERE lotNumber = ? AND is_deleted = 0 AND selectWork = "coaterAnode_S";`

  let conn;
  let isNetworkError = false;
  try {
    conn = await dbmes.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query(sql, [lotNumber]);
    await conn.commit();

    console.log("更新結果:", result);
    res.status(200).json({
      message: "更新負極單面lotNumber成功",
      success: true,
      data: {
        originalLotNumber: lotNumber,
        affectedRows: result.affectedRows
      }
    })

  } catch (error) {
    if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE'].includes(error?.code)) {
      isNetworkError = true;
    }
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.warn("Rollback 執行失敗(網路已中斷或連線已關閉):", rbErr.message);
      }
    }
    console.error("Error in /updateSingleLotNumberStatus:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "更新失敗",
        error: error.message
      });
    }
  } finally {
    if (conn) {
      if (isNetworkError || conn.destroyed) {
        conn.destroy();
      } else {
        conn.release();
      }
    }
  }
})

module.exports = router;
