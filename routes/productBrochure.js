require("dotenv").config();
const express = require("express");
const router = express.Router();
const mysql = require("mysql2");
const sqlms = require("mssql");
const XLSX = require("xlsx");

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

// // MSSQL 設定
// const MS_dbConfig = {
// //   server: "192.168.200.52",
// //   database: "ASRS_HTBI",
// //   user: "HTBI_MES",
// //   password: "mes123",
// //   port: parseInt(process.env.MSSQL_PORT, 10) || 1433,
// //   options: {
// //     encrypt: true,
// //     trustServerCertificate: true,
// //   },
// };



// 產品資訊查詢
router.get("/:productId", async (req, res) => {
  const productId = req.params.productId.trim().toString();
  console.log("productId", productId);

  // let K_Value_Data = "";
  try {

    // Excel 抓法 K_value
    // const K_Value_Table = process.env.k_Value;
    // let workbook = XLSX.readFile(K_Value_Table);
    // let worksheet = workbook.Sheets["Sheet1"];
    // const range = XLSX.utils.decode_range(worksheet["!ref"]);
    // console.log(range);
    // const workData = []; // Not used, can be removed.

    // // Iterate through rows, starting from row 2 (assuming header is in row 1)
    // for (let rowNum = 2; rowNum <= range.e.r + 1; rowNum++) {
    //   try {
    //     // Construct cell addresses dynamically
    //     const BOX_BATT_Cell = `A${rowNum}`;
    //     const K_Value_Cell = `B${rowNum}`; // Corrected to use rowNum

    //     // Get cell values, handling potential undefined cells
    //     const BOX_BATT_Cell_Value = worksheet[BOX_BATT_Cell] ? worksheet[BOX_BATT_Cell].v : undefined;
    //     const K_Value_Cell_Value = worksheet[K_Value_Cell] ? worksheet[K_Value_Cell].v : undefined;
        

    //     if (BOX_BATT_Cell_Value && productId.includes(BOX_BATT_Cell_Value)) {
    //       console.log("have find!");
    //       K_Value_Data = K_Value_Cell_Value;
    //       break; // Exit the loop after finding a match
    //     }
    //   } catch (err) {
    //     console.log("Error reading row:", rowNum, err); // Include row number in error log
    //   }
    // }

    // // MSSQL 查詢
    // const pool = new sqlms.ConnectionPool(MS_dbConfig);
    // await pool.connect();
    // // MSSQL 查詢 K_Value -- start

    // // 先嘗試用 NVARCHAR
    // const HTBI_K_Value_MapperType2_V = await pool
    //   .request()
    //   .input("productId", sqlms.NVarChar, productId)
    //   .query(`
    //  SELECT *
    //  FROM HTBI_K_Value_MapperType_V
    //  WHERE TRY_CONVERT(DATETIME, @productId)
    //  `);

    // console.log("你好啊", HTBI_K_Value_MapperType2_V);
    // await pool.close();

    // MySQL 查詢 -- start
    const sql1 = `SELECT PARAM36 , PARAM37 , PARAM38 , PARAM39 , PARAM40 , PARAM44 , PARAM41 , PARAM07 FROM mes.assembly_batch WHERE TRIM(PLCCellID_CE) = ? `;
    const sql2 = `SELECT acirRP12_CE FROM mes.schk_cellrule  where 1=1 and trim(PLCCellID_CE) = ? ORDER BY id desc limit 1`;
    const sql3 = `SELECT mOhm , VAHSC , OCV FROM mes.testmerge_cc1orcc2 WHERE TRIM(modelId) = ? AND  TRIM(Para) = "CC2"`;
    const sql3_1 = `SELECT VAHSB FROM mes.testmerge_cc1orcc2 WHERE TRIM(modelId) = ? AND  TRIM(Para) = "CC1"`;
    const sql4 = `SELECT Injection_batchNO, nullWeight_CE , packedWeight_CE FROM mes.injection_batch_fin WHERE TRIM(PLCCellID_CE) = ? `;
    const sql5 = `SELECT PARAM18, PARAM19 , PARAM02 FROM mes.echk_batch WHERE PARAM01 = 3 AND TRIM(PLCCellID_CE) = ?`;
    const sql5_1 = `SELECT PARAM18, PARAM19 , PARAM02 FROM mes.echk2_batch WHERE PARAM01 = 3 AND TRIM(PLCCellID_CE) = ?`;
    const sql5_2 = `SELECT cellthickness , cellWeight FROM cellinfo_v WHERE TRIM(PLCCellID_CE) = ?`;
    const sql6 = `SELECT Kvalue FROM mes.kvalueforprodinfo WHERE TRIM(cell) = ?`;

    const [
      productInfo_assembly_batch,
      productInfo_schk_cellrule,
      productInfo_testmerge_cc1orcc2,
      productInfo_testmerge_cc1orcc2_1,
      productInfo_injection_batch_fin,
      productInfo_echk_batch,
      productInfo_echk_batch2,
      cellinfo_v,
      kvalueforprodinfo,
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
    // await mysqlConn.end();
    // MySQL 查詢 -- end

    const fieldMap = {
      assembly_batch: ["PARAM36", "PARAM37", "PARAM38", "PARAM39", "PARAM40", "PARAM44", "PARAM41", "PARAM07"],
      schk_cellrule: ["acirRP12_CE"],
      testmerge_cc2: ["mOhm", "VAHSC", "OCV"],
      testmerge_cc1: ["VAHSB"],
      injection_batch_fin: ["Injection_batchNO", "nullWeight_CE", "packedWeight_CE"],
      echk_batch: ["PARAM18", "PARAM19"],
      echk_batch2: ["PARAM18", "PARAM19"],
      cellinfo_v: ["cellthickness", "cellWeight"],
      kvalueforprodinfo: ["Kvalue"],
      // HTBI_K_Value_MapperType2_V: ["K_Value"],
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
      { key: "kvalueforprodinfo", data: kvalueforprodinfo[0][0] },
      // { key: "HTBI_K_Value_MapperType2_V", data: HTBI_K_Value_MapperType2_V[0][0] },
    ];

    console.log("dataArr", dataArr);


    // 組合資料
    let productDetails = {};
    for (const { key, data } of dataArr) {
      productDetails[key] = {};
      for (const field of fieldMap[key]) {
        let value =
          data && data[field] !== undefined && data[field] !== null
            ? data[field]
            : "N/A";
        if (typeof value === "string") value = value.trim();
        productDetails[key][field] = value;
      }
    }

    res.json({ success: true, data: productDetails });
  } catch (error) {
    console.error("Error in /:productId:", error);
    res.status(500).json({
      success: false,
      message: "取得產品詳細資訊失敗",
      error: error.message,
    });
  }
});

module.exports = router;
