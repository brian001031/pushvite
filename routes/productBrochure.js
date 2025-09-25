require("dotenv").config();
const express = require("express");
const router = express.Router();
const mysql = require("mysql2");
const XLSX = require("xlsx");
const moment = require('moment');

// 建立 MySQL 連線池
const dbmes = mysql.createPool({
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "mes",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
});

const dbmesPromise = dbmes.promise();

// 欄位對應表
const fieldMap01 = {
  assembly_batch: { idField: "PLCCellID_CE", fields: ["PARAM36", "PARAM37", "PARAM38", "PARAM39", "PARAM40", "PARAM44", "PARAM41", "PARAM07"] },
  schk_cellrule: { idField: "PLCCellID_CE", fields: ["acirRP12_CE"] },
  injection_batch_fin: { idField: "PLCCellID_CE", fields: ["Injection_batchNO", "nullWeight_CE", "packedWeight_CE"] },
  echk_batch: { idField: "PLCCellID_CE", fields: ["PARAM18", "PARAM19", "PARAM02"] },
  echk2_batch: { idField: "PLCCellID_CE", fields: ["PARAM18", "PARAM19", "PARAM02"] },
};

const fieldMap02 = {
  testmerge_cc1orcc2: { idField: "modelId", fields: ["mOhm", "VAHSC", "OCV", "VAHSB"] },
};

const otherTables = {
  kvalueforprodinfo_update: { idField: "cell", fields: ["Kvalue"] },
  cellinfo_v: { idField: "PLCCellID_CE", fields: ["cellthickness", "cellWeight"] },
};

// 抓取當月 modelId
const autoGetMachineNo = async () => {
    const currentMonth = moment().format("YYYY/MM");

    const sql = `
        SELECT DISTINCT TRIM(modelId) AS modelId
        FROM testmerge_cc1orcc2
        WHERE EnddateD LIKE ?
        AND TRIM(modelId) <> '' AND modelId IS NOT NULL
    `;
    const params = [`${currentMonth}%`];

    try {
        const [rows] = await dbmesPromise.query(sql, params);
        console.log(`抓取 modelId 完成，共 ${rows.length} 筆`);
        return rows.map(r => r.modelId);
    } catch (err) {
        console.error("autoGetMachineNo 錯誤:", err);
        return [];
    }
};

// 分批工具
const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// 查詢單一表格的資料
const fetchTableData = async (tableName, idField, fields, ids, dateField, dateParams) => {
    let sql = `SELECT TRIM(${idField}) AS modelId, `;
    sql += fields.map(field => `TRIM(${field}) AS ${field}`).join(", ");
    sql += ` FROM ${tableName} WHERE TRIM(${idField}) IN (${ids.map(() => "?").join(",")})`;

    const params = [...ids];
    if (dateField && dateParams.length > 0) {
        if (dateField === 'EnddateD') {
            sql += ` AND EnddateD LIKE ?`;
            params.push(dateParams[0]);
        }
        // Other tables do not have time filters
    }
    
    try {
        const [rows] = await dbmesPromise.query(sql, params);
        return rows;
    } catch (err) {
        console.error(`查詢 ${tableName} 時發生錯誤:`, err);
        return [];
    }
};

// ===== 自動化檢查 API =====
router.get("/errors", async (req, res) => {
  try {
    const modelIds = await autoGetMachineNo();
    if (!modelIds || modelIds.length === 0) {
      return res.json({ success: true, message: "無 modelId 資料", data: [] });
    }

    console.log(`開始檢查 ${modelIds.length} 筆 modelId...`);

    const chunks = chunkArray(modelIds, 500);
    let allResults = [];
    
    const thisMonthQuery = moment().format('YYYY/MM');


    for (let i = 0; i < chunks.length; i++) {
      const batchIds = chunks[i];
      console.log(`處理第 ${i + 1}/${chunks.length} 批 (共 ${batchIds.length} 筆)`);
      
      const tables = { ...fieldMap01, ...fieldMap02, ...otherTables };
      for (const tableName of Object.keys(tables)) {
          const { idField, fields } = tables[tableName];
          
          let dateField = null;
          let dateParams = [];
          if (tableName === 'testmerge_cc1orcc2') {
              dateField = 'EnddateD';
              dateParams = [`${thisMonthQuery}%`];
          }
          
          const rows = await fetchTableData(tableName, idField, fields, batchIds, dateField, dateParams);
          
          // 檢查是否有空值或找不到資料
          batchIds.forEach(id => {
              const foundRow = rows.find(row => row.modelId.trim() === id.trim());
              if (!foundRow) {
                  // 找不到資料
                  allResults.push({
                      modelId: id,
                      tableName: tableName,
                      columnName: '資料不存在',
                      FindTime: moment().locale('zh-tw').format('YYYY-MM-DD HH:mm:ss'),
                  });
              } 
              else {
                    // 找到資料，檢查欄位是否為空
                    fields.forEach(field => {
                        const value = foundRow[field];
                        if (value === null || value === undefined || value.toString().trim() === '') {
                            allResults.push({
                                modelId: id,
                                tableName: tableName,
                                columnName: field,
                                FindTime: moment().locale('zh-tw').format('YYYY-MM-DD HH:mm:ss'),
                            });
                        }
                    });
                }
            });
        }

      const percent = (((i + 1) / chunks.length) * 100).toFixed(2);
      console.log(`進度：${i + 1}/${chunks.length} 批 (${percent}%)`);
    }



    // 匯出 Excel
    const workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(allResults);
    XLSX.utils.book_append_sheet(workbook, ws, "Abnormal_Report");
    const filePath = `./errors_${moment().format("YYYYMMDD_HHmmss")}.xlsx`;
    XLSX.writeFile(workbook, filePath);

    console.log(`==== 所有處理完成，結果已輸出 ${filePath} ====`);
    res.download(filePath, (err) => {
        if (err) {
            console.error("下載檔案錯誤:", err);
            res.status(500).send("下載檔案失敗");
        }
    });

  } catch (err) {
    console.error("自動化檢查錯誤:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

// 單筆產品資訊查詢 API (保留不變)
const handleDataFind = async (productId) => {
  console.log("啟動 handleDataFind");
  try {
    const sql1 = `SELECT PARAM36 , PARAM37 , PARAM38 , PARAM39 , PARAM40 , PARAM44 , PARAM41 , PARAM07 FROM mes.assembly_batch WHERE TRIM(PLCCellID_CE) = ? `;
    const sql2 = `SELECT acirRP12_CE FROM mes.schk_cellrule where 1=1 and trim(PLCCellID_CE) = ? ORDER BY id desc limit 1`;
    const sql3 = `SELECT mOhm , VAHSC , OCV FROM mes.testmerge_cc1orcc2 WHERE TRIM(modelId) = ? AND TRIM(Para) = "CC2"`;
    const sql3_1 = `SELECT VAHSB FROM mes.testmerge_cc1orcc2 WHERE TRIM(modelId) = ? AND TRIM(Para) = "CC1"`;
    const sql4 = `SELECT Injection_batchNO, nullWeight_CE , packedWeight_CE FROM mes.injection_batch_fin WHERE TRIM(PLCCellID_CE) = ? `;
    const sql5 = `SELECT PARAM18, PARAM19 , PARAM02 FROM mes.echk_batch WHERE PARAM01 = 3 AND TRIM(PLCCellID_CE) = ?`;
    const sql5_1 = `SELECT PARAM18, PARAM19 , PARAM02 FROM mes.echk2_batch WHERE PARAM01 = 3 AND TRIM(PLCCellID_CE) = ?`;
    const sql5_2 = `SELECT cellthickness , cellWeight FROM cellinfo_v WHERE TRIM(PLCCellID_CE) = ?`;
    const sql6 = `SELECT Kvalue FROM mes.kvalueforprodinfo_update WHERE TRIM(cell) = ?`;

    const [
      productInfo_assembly_batch,
      productInfo_schk_cellrule,
      productInfo_testmerge_cc1orcc2,
      productInfo_testmerge_cc1orcc2_1,
      productInfo_injection_batch_fin,
      productInfo_echk_batch,
      productInfo_echk_batch2,
      cellinfo_v,
      kvalueforprodinfo_update,
    ] = await Promise.all([
      dbmesPromise.query(sql1, [productId]),
      dbmesPromise.query(sql2, [productId]),
      dbmesPromise.query(sql3, [productId]),
      dbmesPromise.query(sql3_1, [productId]),
      dbmesPromise.query(sql4, [productId]),
      dbmesPromise.query(sql5, [productId]),
      dbmesPromise.query(sql5_1, [productId]),
      dbmesPromise.query(sql5_2, [productId]),
      dbmesPromise.query(sql6, [productId]),
    ]);

      const fieldMap = {
        assembly_batch: ["PARAM36", "PARAM37", "PARAM38", "PARAM39", "PARAM40", "PARAM44", "PARAM41", "PARAM07"],
        schk_cellrule: ["acirRP12_CE"],
        testmerge_cc2: ["mOhm", "VAHSC", "OCV"],
        testmerge_cc1: ["VAHSB"],
        injection_batch_fin: ["Injection_batchNO", "nullWeight_CE", "packedWeight_CE"],
        echk_batch: ["PARAM18", "PARAM19", "PARAM02"],
        echk_batch2: ["PARAM18", "PARAM19", "PARAM02"],
        kvalueforprodinfo_update: ["Kvalue"],
        cellinfo_v: ["cellthickness", "cellWeight"],
      };

    const dataArr = [
      { key: "assembly_batch", data: productInfo_assembly_batch[0][0] },
      { key: "schk_cellrule", data: productInfo_schk_cellrule[0][0] },
      { key: "testmerge_cc2", data: productInfo_testmerge_cc1orcc2[0][0] },
      { key: "testmerge_cc1", data: productInfo_testmerge_cc1orcc2_1[0][0] },
      { key: "injection_batch_fin", data: productInfo_injection_batch_fin[0][0] },
      { key: "echk_batch", data: productInfo_echk_batch[0][0] },
      { key: "echk_batch2", data: productInfo_echk_batch2[0][0] },
      { key: "cellinfo_v", data: cellinfo_v[0][0] },
      { key: "kvalueforprodinfo_update", data: kvalueforprodinfo_update[0][0] },
    ];

    let productDetails = {};
    for (const { key, data } of dataArr) {
      productDetails[key] = {};
      const fieldList = fieldMap[key] || [];
        for (const field of fieldList) {
        let value = data && data[field] !== undefined && data[field] !== null
          ? data[field]
          : "N/A";
        if (typeof value === "string") value = value.trim();
        productDetails[key][field] = value;
      }
    }
    console.log("productDetails", productDetails);
    return productDetails;
  } catch (error) {
    console.error("Error in handleDataFind:", error);
    throw error;
  }
}


router.get("/:productId", async (req, res) => {
  const productId = req.params.productId.trim().toString();
  console.log("productId", productId);
  try{
    const productInfo = await handleDataFind(productId);
    res.json({ success: true, data: productInfo });
  }catch(error){
    console.error("Error in /:productId:", error);
    res.status(500).json({
      success: false,
      message: "取得產品詳細資訊失敗",
      error: error.message,
    });
  }
});

module.exports = router;