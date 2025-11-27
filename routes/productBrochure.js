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

const allData = {
    "PARAM36": "",
    "PARAM37": "",
    "PARAM38": "",
    "PARAM39": "",
    "PARAM40": "",
    "PARAM44": "",
    "PARAM41": "",
    "PARAM07": "",
    "acirRP12_CE": "",
    "Injection_batchNO": "",
    "nullWeight_CE": "",
    "packedWeight_CE": "",
    "PARAM18": "",
    "PARAM19": "",
    "PARAM02": "",
    "mOhm": "",
    "VAHSC": "",
    "OCV": "",
    "VAHSB": "",
    "Kvalue": "",
    "cellthickness": "",
    "cellWeight": ""
};

const newDbData = {
    modelId: "",
    PARAM36: "",
    PARAM37: "",
    PARAM38: "",
    PARAM39: "",
    PARAM40: "",
    PARAM44: "",
    PARAM41: "",
    PARAM07: "",
    acirRP12_CE: "",
    Injection_batchNO: "",
    nullWeight_CE: "",
    packedWeight_CE: "",
    PARAM18_echk_batch: "",
    PARAM19_echk_batch: "",
    PARAM02_echk_batch: "",
    PARAM18_echk2_batch: "",
    PARAM19_echk2_batch: "",
    PARAM02_echk2_batch: "",
    mOhm: "",
    VAHSC: "",
    OCV: "",
    VAHSB: "",
    Kvalue: "",
    cellthickness: "",
    cellWeight: "",
    systemFillIn_Time: "",
    fillin_MemberName: "",
    fillin_Time: moment().format("YYYY-MM-DD HH:mm:ss"),
    dataAllFillIn: "",
    memo: ""
};

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

const total_Table = {
    assembly_batch: { idField: "PLCCellID_CE", fields: ["PARAM36", "PARAM37", "PARAM38", "PARAM39", "PARAM40", "PARAM44", "PARAM41", "PARAM07"] },
    schk_cellrule: { idField: "PLCCellID_CE", fields: ["acirRP12_CE"] },
    injection_batch_fin: { idField: "PLCCellID_CE", fields: ["Injection_batchNO", "nullWeight_CE", "packedWeight_CE"] },
    echk_batch: { idField: "PLCCellID_CE", fields: ["PARAM18", "PARAM19", "PARAM02"] },
    echk2_batch: { idField: "PLCCellID_CE", fields: ["PARAM18", "PARAM19", "PARAM02"] },
    testmerge_cc1orcc2: { idField: "modelId", fields: ["mOhm", "VAHSC", "OCV", "VAHSB"] },
    kvalueforprodinfo_update: { idField: "cell", fields: ["Kvalue"] },
    cellinfo_v: { idField: "PLCCellID_CE", fields: ["cellthickness", "cellWeight"] },
}

// 抓取當月 modelId
const autoGetMachineNo = async () => {
    const currentMonth = moment().format("YYYY/MM");
    console.log(`🔍 autoGetMachineNo 開始查詢，當月: ${currentMonth}`);

    const currentDay = moment().format("2025/09/14"); // 今天
    const prevDay = moment().format("2025/09/13"); // 昨天

    // 以 BETWEEN [昨日時00:00:00, 今日時00:00:00] 查詢完整一天區間
    const searchStart = prevDay + "上午 00:00:00"; // 昨天 00:00:00
    const searchEnd = currentDay + "上午 00:00:00"; // 今天 00:00:00

    const sql = `
        SELECT DISTINCT TRIM(modelId) AS modelId
        FROM testmerge_cc1orcc2
        -- 現在用於測試：抓取昨天一整天資料（以 EnddateD 落在 [昨天00:00:00, 今天00:00:00)）
        -- WHERE EnddateD BETWEEN ? AND ? AND
        WHERE 
        TRIM(modelId) <> '' AND modelId IS NOT NULL
        ORDER BY id
    `;
    // const params = [`${currentMonth}%`];
    // 注意：BETWEEN 起始時間必須小於等於結束時間 → [昨天00:00:00, 今天00:00:00]
    const params = [searchStart, searchEnd];

    // console.log("📝 執行 SQL FOR 抓到 modalId :", sql);
    console.log("📝 查modal 的參數:", params);

    try {
        const [rows] = await dbmesPromise.query(sql, params);
        console.log(`✅ 抓取 modelId 完成，共 ${rows.length} 筆`);
        if (rows.length > 0) {
            console.log("📋 前 3 筆結果:", rows.slice(0, 3));
        } else {
            console.log("⚠️ 查詢結果為空，可能原因:");
            console.log("   - 本月沒有資料");
            console.log("   - EnddateD 格式不符");
            console.log("   - modelId 都是空值");
        }
        return rows.map(r => r.modelId);
    } catch (err) {
        console.error("❌ autoGetMachineNo 錯誤:", err);
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
// tableName 參考: fieldMap01, fieldMap02, otherTables , idField , fields 為該表的 modelId 欄位名稱 , ids 為 modelId 陣列
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

// 強化版：永遠選取並 TRIM idField 為 modelId，避免回傳空白 modelId；欄位全部 TRIM
const fetchIdFromTable = async (tableName, idField, fields, batchIds) => {
    // if (!tableName || !idField || !Array.isArray(fields) || fields.length === 0 || !Array.isArray(batchIds) || batchIds.length === 0) {
    //     console.error(`fetchIdFromTable 參數錯誤: tableName=${tableName}, idField=${idField}, fields=${fields}, batchIds length=${batchIds?.length}`);
    //     return [];
    // }

    const selectCols = [`TRIM(${idField}) AS modelId`, ...fields.map(f => `TRIM(${f}) AS ${f}`)];
    const sql = `SELECT ${selectCols.join(', ')} FROM ${tableName} WHERE TRIM(${idField}) IN (${batchIds.map(() => '?').join(',')})`;
    try {
        const [rows] = await dbmesPromise.query(sql, batchIds);

        // 標準化查到的資料：確保 modelId 與欄位皆為去空白字串，未定義/NULL 轉為空字串
        const normalized = rows.map(r => ({
            modelId: (r.modelId || '').toString().trim(),
            ...fields.reduce((acc, f) => {
                const val = r[f];
                acc[f] = val !== undefined && val !== null ? (typeof val === 'string' ? val.trim() : val) : '';
                return acc;
            }, {})
        }));

        // 針對未回傳的 modelId，補上 skeleton（每個欄位給空字串）
        const requestedIds = batchIds.map(id => (id || '').toString().trim()).filter(Boolean);
        const foundIds = new Set(normalized.map(r => r.modelId).filter(Boolean));
        const missingIds = requestedIds.filter(id => !foundIds.has(id));

        if (missingIds.length > 0) {
            console.warn(`⚠️ fetchIdFromTable 部分/全部查無資料: table=${tableName}, missing=${missingIds.length}/${requestedIds.length}`);
        }

        const skeletons = missingIds.map(id => ({
            modelId: id,
            ...fields.reduce((acc, f) => { acc[f] = ''; return acc; }, {})
        }));

        return [...normalized, ...skeletons];
    } catch (err) {
        console.error(`查詢 ${tableName} 時發生錯誤:`, err.message);
        return [];
    }
};

// 將各資料表的欄位名稱映射到 newDbData 的鍵（特別處理 echk_*）
const mapRowToNewDbFields = (tableName, row) => {
    const out = {};
    if (!row) return out;
    switch (tableName) {
        case 'echk_batch':
            if (row.PARAM18 !== undefined) out.PARAM18_echk_batch = row.PARAM18;
            if (row.PARAM19 !== undefined) out.PARAM19_echk_batch = row.PARAM19;
            if (row.PARAM02 !== undefined) out.PARAM02_echk_batch = row.PARAM02;
            break;
        case 'echk2_batch':
            if (row.PARAM18 !== undefined) out.PARAM18_echk2_batch = row.PARAM18;
            if (row.PARAM19 !== undefined) out.PARAM19_echk2_batch = row.PARAM19;
            if (row.PARAM02 !== undefined) out.PARAM02_echk2_batch = row.PARAM02;
            break;
        default:
            // 其它表欄位名稱與 newDbData 相同，直接拷貝已存在的鍵
            Object.keys(row).forEach((k) => {
                if (k === 'modelId') return; // modelId 另外處理
                out[k] = row[k];
            });
    }
    return out;
};

// 批次寫入異常資料到資料庫（每批最多 500 筆）
const insertErrorsBatchToDb = async (errors, batchSize = 500) => {
    if (!Array.isArray(errors) || errors.length === 0) {
        return { inserted: 0, batches: 0 };
    }
    const fields = [
        "modelId",
        "PARAM36",
        "PARAM37",
        "PARAM38",
        "PARAM39",
        "PARAM40",
        "PARAM44",
        "PARAM41",
        "PARAM07",
        "acirRP12_CE",
        "Injection_batchNO",
        "nullWeight_CE",
        "packedWeight_CE",
        "PARAM18_echk_batch",
        "PARAM19_echk_batch",
        "PARAM02_echk_batch",
        "PARAM18_echk2_batch",
        "PARAM19_echk2_batch",
        "PARAM02_echk2_batch",
        "mOhm",
        "VAHSC",
        "OCV",
        "VAHSB",
        "Kvalue",
        "cellthickness",
        "cellWeight",
        "systemFillIn_Time",
        "fillin_MemberName",
        "fillin_Time",
        "dataAllFillIn",
        "memo"
    ]; // 對應 dataLost_errors 資料表
    const batches = chunkArray(errors, batchSize);
    let inserted = 0;

    const conn = await dbmes.promise().getConnection();
    try {
        await conn.beginTransaction();
        for (const batch of batches) {
            const values = batch.map(row => fields.map(k => (row && row[k] != null ? row[k] : "")));
            const placeholders = values.map(() => `(${fields.map(() => "?").join(", ")})`).join(", ");
            const flatValues = values.flat();
            const sql = `INSERT INTO dataLost_collection (${fields.join(", ")}) VALUES ${placeholders}`;
            const [result] = await conn.query(sql, flatValues);
            console.log(`✅ 插入錯誤資料批次，筆數=${batch.length}，影響列數=${result?.affectedRows || 0} , result=`, result);
            inserted += result?.affectedRows || 0;
        }
        await conn.commit();
        return { inserted, batches: batches.length };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 批次寫入（多筆）- 使用多值 INSERT + UPSERT；失敗時退回逐筆 UPSERT，避免整批中斷（依 newDbData 欄位補齊缺失為 ""）
const lostDataBatchToNewDb = async (dataList, batchSize = 500) => {
    if (!Array.isArray(dataList) || dataList.length === 0) {
        return { inserted: 0, updatedFallback: 0, batches: 0 };
    }

    const fields = Object.keys(newDbData);
    const updateClause = fields
        .filter((f) => f !== 'modelId')
        .map((f) => `${f} = VALUES(${f})`)
        .join(', ');

    const batches = chunkArray(
        dataList.filter((d) => d && (d.modelId || '').toString().trim() !== ''),
        batchSize
    );
    let inserted = 0;
    let updatedFallback = 0;

    const conn = await dbmes.promise().getConnection();
    try {
        await conn.beginTransaction();
        for (const batch of batches) {
            try {
                // 依 newDbData 欄位順序，補齊每筆資料缺失為 ""
                const values = batch.map((data) => fields.map((k) => (data[k] != null ? data[k] : '')));
                const placeholders = values.map(() => `(${fields.map(() => '?').join(', ')})`).join(', ');
                const flat = values.flat();
                const sql = `INSERT INTO dataLost_collection (${fields.join(', ')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updateClause}`;
                const [res] = await conn.query(sql, flat);
                inserted += res?.affectedRows || 0;
            } catch (batchErr) {
                console.warn('⚠️ 批次 UPSERT 失敗，改逐筆處理：', batchErr.message);
                for (const data of batch) {
                    try {
                        const row = fields.map((k) => (data[k] != null ? data[k] : ''));
                        const singleSql = `INSERT INTO dataLost_collection (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updateClause}`;
                        await conn.query(singleSql, row);
                        updatedFallback++;
                    } catch (singleErr) {
                        try {
                            const setClause = fields.filter((f) => f !== 'modelId').map((f) => `${f} = ?`).join(', ');
                            const params = fields.filter((f) => f !== 'modelId').map((f) => (data[f] != null ? data[f] : ''));
                            params.push((data.modelId || '').toString().trim());
                            const updateSql = `UPDATE dataLost_collection SET ${setClause} WHERE modelId = ?`;
                            await conn.query(updateSql, params);
                            updatedFallback++;
                        } catch (updateErr) {
                            console.error('❌ 單筆後援 UPDATE 仍失敗：', updateErr.message, 'modelId=', data.modelId);
                        }
                    }
                }
            }
        }
        await conn.commit();
        return { inserted, updatedFallback, batches: batches.length };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};



// 依據缺失Data轉入 newDB , 非紀錄 tableName 而是直接紀錄 columns
router.get("/dataInto_DB", async (req, res) => {
    const mode = req.query.mode === 'missing' ? 'missing' : 'all'; // 預設為 'all'
    const strategy = req.query.strategy === 'single' ? 'single' : 'batch'; // 預設為 'batch'

    try {
        const modelIds = await autoGetMachineNo();
        if (!modelIds || modelIds.length === 0) {
            return res.json({ success: true, message: '無 modelId 資料', data: [] });
        }

        console.log(`📊 共 ${modelIds.length} 筆 modelId 待處理`);
        const chunks = chunkArray(modelIds, 500); // 資料型態參考 [[id1, id2,...], [...], ...]
        
        const metaKeys = new Set(['modelId','systemFillIn_Time','fillin_MemberName','fillin_Time','dataAllFillIn','memo']);
        const requiredKeys = Object.keys(newDbData).filter(k => !metaKeys.has(k));

        let inspected = 0;            // 檢查總數
        let missingRows = 0;          // 有缺失的列
        let upsertCount = 0;          // 實際 UPSERT 次數（single 模式 = 次數；batch 模式 = rows 數）
        let batchUpsertCalls = 0;     // batch UPSERT 呼叫次數

        for (let i = 0; i < chunks.length; i++) {
            const batchIds = chunks[i];
            console.log(`🔍 第 ${i + 1}/${chunks.length} 批 (size=${batchIds.length}) 讀取 & upsert into db`);

            const tables = { ...fieldMap01, ...fieldMap02, ...otherTables };
            const merged = new Map(); // 將資料去重並合併 

            // 初始化每個 modelId 的基本結構 目前會變成 { modelId: 'xxx' } 並存入 merged 變成 [{modelId: 'xxx'}, {modelId: 'yyy'}, ...]
            for (const rawId of batchIds) {
                const id = (rawId || '').toString().trim();
                if (id) merged.set(id, { modelId: id });
            }

            for (const tableName of Object.keys(tables)) {
                const { idField, fields } = tables[tableName];
                const rows = await fetchIdFromTable(tableName, idField, fields, batchIds);
                
                // 除錯：統計空 modelId
                const blank = rows.filter(r => !r.modelId || r.modelId.trim() === '');
                if (blank.length > 0) {
                    console.warn(`⚠️ [${tableName}] 回傳空 modelId 筆數=${blank.length} / ${rows.length}，示例:`, blank.slice(0,3));
                }
                for (const row of rows) {
                    const id = (row.modelId || '').toString().trim();
                    if (!id){console.log(`⚠️ 無效的 modelId，跳過該列: ${JSON.stringify(row)}`); continue;}
                    const current = merged.get(id) || { modelId: id };
                    Object.assign(current, mapRowToNewDbFields(tableName, row));
                    merged.set(id, current);
                }
            }

            // 依 newDbData 欄位補齊，並依 mode 過濾（missing 只寫入有缺失）
            const metaKeys = new Set(['modelId','systemFillIn_Time','fillin_MemberName','fillin_Time','dataAllFillIn','memo']);
            const requiredKeys = Object.keys(newDbData).filter(k => !metaKeys.has(k));
            const shaped = [];
            for (const obj of merged.values()) {
                const row = { ...obj };
                const missing = [];
                for (const k of requiredKeys) {
                    const v = row[k];
                    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
                        row[k] = '';
                        missing.push(k);
                    } else if (typeof v === 'string') {
                        row[k] = v.trim();
                    }
                }
                if (missing.length > 0) {
                    row.dataAllFillIn = 'auto_missing';
                    row.memo = `missing: ${missing.join(',')}`;
                } else {
                    row.dataAllFillIn = row.dataAllFillIn || 'auto_full';
                    row.memo = row.memo || '';
                }
                row.systemFillIn_Time = row.systemFillIn_Time || moment().format('YYYY-MM-DD HH:mm:ss');
                row.fillin_MemberName = row.fillin_MemberName || '';
                row.fillin_Time = row.fillin_Time || moment().format('YYYY-MM-DD HH:mm:ss');
                if (mode === 'missing' && missing.length === 0) continue;
                shaped.push(row);
            }

            if (shaped.length > 0) {
                const result = await lostDataBatchToNewDb(shaped, 500);
                upsertCount += shaped.length;
                batchUpsertCalls += 1;
                if (i === 0) {
                    const sampleIds = shaped.slice(0, 5).map(r => r.modelId);
                    console.log(`🧪 第一批寫入示例 modelId:`, sampleIds);
                }
                console.log(`✅ 批次寫入完成：rows=${shaped.length} affected=${result.inserted} fallback=${result.updatedFallback}`);
            } else {
                console.log(`⏭️ 本批無需寫入（mode=${mode}）`);
            }

            const percent = (((i + 1) / chunks.length) * 100).toFixed(2);
            console.log(`📈 進度 ${percent}% (inspected=${inspected} missingRows=${missingRows} written=${upsertCount})`);
        }

        return res.json({
            success: true,
            mode,
            strategy,
            inspected,
            missingRows,
            writtenRows: upsertCount,
            batchUpsertCalls
        });

    } catch (error) {
        console.error('/dataInto_DB error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


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
                  // 找不到資料 - 將所有欄位合併成一筆記錄
                  allResults.push({
                      modelId: id,
                      tableName: tableName,
                      columnName: fields.join(", "),
                      FindTime: moment().locale('zh-tw').format('YYYY-MM-DD HH:mm:ss'),
                  });
              } 
              else {
                    // 找到資料，檢查欄位是否為空
                    const emptyFields = [];
                    fields.forEach(field => {
                        const value = foundRow[field];
                        if (value === null || value === undefined || value.toString().trim() === '') {
                            emptyFields.push(field);
                        }
                    });
                    
                    // 如果有空值欄位，合併成一筆記錄
                    if (emptyFields.length > 0) {
                        allResults.push({
                            modelId: id,
                            tableName: tableName,
                            columnName: emptyFields.join(", "),
                            FindTime: moment().locale('zh-tw').format('YYYY-MM-DD HH:mm:ss'),
                        });
                    }
                }
            });
        }

      const percent = (((i + 1) / chunks.length) * 100).toFixed(2);
      console.log(`進度：${i + 1}/${chunks.length} 批 (${percent}%)`);
    }
    
    console.log(`檢查完成！共找到 ${allResults.length} 筆異常資料`);
    // 批次寫入異常資料至 SQL（不影響後續 Excel 匯出與回應）
    if (allResults.length > 0) {
        try {
            const dbResult = await insertErrorsBatchToDb(allResults, 500);
            console.log(`✅ 異常資料已寫入 DB：插入 ${dbResult.inserted} 筆，批次 ${dbResult.batches}`);
        } catch (dbErr) {
            console.error("❌ 寫入異常資料至 DB 失敗（將繼續匯出 Excel）:", dbErr.message);
        }
    }
    if (allResults.length === 0) {
      return res.json({ success: true, message: "所有資料完整，無異常", data: [] });
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

// ===== 自動化匯出已做MODEL API =====
router.get("/allHaveDataModel", async (req, res) => {
    console.log("🚀 allHaveDataModel API 被調用了！");
    console.log("⏰ 開始時間:", moment().format('YYYY-MM-DD HH:mm:ss'));
    
    try {
        console.log("📋 正在執行 autoGetMachineNo()...");
        const modelIds = await autoGetMachineNo();
        
        console.log(`📊 autoGetMachineNo 結果: ${modelIds ? modelIds.length : 0} 筆`);
        
        if (!modelIds || modelIds.length === 0) {
            console.log("⚠️ 沒有找到任何 modelId，回傳空結果");
            return res.json({ success: true, message: "無 modelId 資料", data: [] });
        }

        console.log(`開始檢查 ${modelIds.length} 筆 modelId 的完整資料...`);
        console.log(`當月查詢條件: ${moment().format('YYYY/MM')}`);
        console.log(`分批處理: 每批 500 筆，共 ${Math.ceil(modelIds.length / 500)} 批`);

        const chunks = chunkArray(modelIds, 500);
        let completeModels = []; // 儲存完整資料的 modelId
        let processedCount = 0; // 已處理的 modelId 數量
        
        const thisMonthQuery = moment().format('YYYY/MM');

        for (let i = 0; i < chunks.length; i++) {
            const batchIds = chunks[i];
            console.log(`🚀 處理第 ${i + 1}/${chunks.length} 批 (共 ${batchIds.length} 筆) - 並行查詢開始`);
            const batchStartTime = Date.now();
            
            const tables = { ...fieldMap01, ...fieldMap02, ...otherTables };
            
            // 🚀 優化：並行查詢所有表格，一次查詢整批資料
            console.log(`📊 並行查詢 ${Object.keys(tables).length} 個表格...`);
            const queryPromises = Object.keys(tables).map(async (tableName) => {
                const { idField, fields } = tables[tableName];
                
                let dateField = null;
                let dateParams = [];
                if (tableName === 'testmerge_cc1orcc2') {
                    dateField = 'EnddateD';
                    dateParams = [`${thisMonthQuery}%`];
                }
                
                try {
                    // 一次查詢整批 modelId，而不是逐個查詢
                    const rows = await fetchTableData(tableName, idField, fields, batchIds, dateField, dateParams);
                    
                    // 建立 modelId 對應的資料 Map
                    const dataMap = {};
                    rows.forEach(row => {
                        dataMap[row.modelId.trim()] = row;
                    });
                    
                    console.log(`✅ ${tableName}: 查詢完成，找到 ${rows.length}/${batchIds.length} 筆資料`);
                    return { tableName, fields, dataMap };
                } catch (error) {
                    console.error(`❌ ${tableName}: 查詢失敗`, error.message);
                    return { tableName, fields, dataMap: {} };
                }
            });

            // 等待所有表格查詢完成
            const startQueryTime = Date.now();
            const allTableData = await Promise.all(queryPromises);
            const queryTime = Date.now() - startQueryTime;
            console.log(`📊 所有查詢完成，耗時 ${queryTime}ms`);

            // 🚀 優化：在記憶體中快速檢查完整性，避免重複查詢
            console.log(`🔍 開始檢查 ${batchIds.length} 筆資料的完整性...`);
            let batchCompleteCount = 0;
            
            for (const modelId of batchIds) {
                processedCount++;
                let modelData = { modelId: modelId };
                let isComplete = true;
                let incompleteReason = '';

                // 檢查每個表格的資料
                for (const { tableName, fields, dataMap } of allTableData) {
                    const foundRow = dataMap[modelId.trim()];
                    
                    if (!foundRow) {
                        isComplete = false;
                        incompleteReason = `${tableName} 中找不到資料`;
                        break;
                    }

                    // 檢查每個欄位是否有值
                    const emptyFields = [];
                    for (const field of fields) {
                        const value = foundRow[field];
                        if (value === null || value === undefined || value.toString().trim() === '') {
                            emptyFields.push(field);
                            isComplete = false;
                        } else {
                            modelData[field] = value.toString().trim();
                        }
                    }
                    
                    if (emptyFields.length > 0) {
                        incompleteReason = `${tableName} 中欄位 [${emptyFields.join(', ')}] 為空值`;
                        break;
                    }
                }

                // 只有完整的資料才加入結果
                if (isComplete) {
                    batchCompleteCount++;
                    // 按照 allData 的欄位順序重新排列
                    let orderedData = { modelId: modelId };
                    Object.keys(allData).forEach(key => {
                        orderedData[key] = modelData[key] || '';
                    });
                    orderedData.FindTime = moment().locale('zh-tw').format('YYYY-MM-DD HH:mm:ss');
                    
                    completeModels.push(orderedData);
                }
                
                // 簡化輸出，避免過多 console.log 影響效能
                if (processedCount % 50 === 0) {
                    console.log(`⏳ 已處理 ${processedCount}/${modelIds.length} 筆 (${(processedCount/modelIds.length*100).toFixed(1)}%)`);
                }
            }

            const batchTime = Date.now() - batchStartTime;
            const percent = (((i + 1) / chunks.length) * 100).toFixed(2);
            console.log(`✅ 第 ${i + 1} 批完成！耗時 ${batchTime}ms，新增完整資料: ${batchCompleteCount} 筆`);
            console.log(`📊 進度：${i + 1}/${chunks.length} 批 (${percent}%)，累積完整資料: ${completeModels.length} 筆\n`);
        }

        console.log(`檢查完成！找到 ${completeModels.length} 筆完整資料的 modelId`);

        // 匯出 Excel - 依照 allData 欄位順序
        const workbook = XLSX.utils.book_new();
        
        // 建立標題行（按照 allData 順序）
        const headers = ['modelId', ...Object.keys(allData), 'FindTime'];
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        
        // 添加資料行
        completeModels.forEach((model) => {
            const row = headers.map(header => model[header] || '');
            XLSX.utils.sheet_add_aoa(ws, [row], { origin: -1 });
        });
        
        XLSX.utils.book_append_sheet(workbook, ws, "Complete_Models");
        const filePath = `./complete_models_${moment().format("YYYYMMDD_HHmmss")}.xlsx`;
        XLSX.writeFile(workbook, filePath);

        console.log(`==== 完整資料匯出完成，結果已輸出 ${filePath} ====`);
        
        // 提供下載
        res.download(filePath, (err) => {
            if (err) {
                console.error("下載檔案錯誤:", err);
                res.status(500).send("下載檔案失敗");
            }
        });

        res.status(200).json({ 
            success: true, 
            message: "匯出完成", 
            data: completeModels.length 
        });

    } catch (err) {
        console.error("自動化匯出錯誤:", err);
        res.status(500).json({ error: "Server error", detail: err.message });
    }
});

// 單筆產品資訊查詢 API (保留不變)
const handleDataFind = async (productId) => {
    console.log("🚀 handleDataFind 開始，原始 productId:", productId);
    const startTime = Date.now();
    
    // 修正 productId 轉換
    let productIdChange = productId.trim();
    if (/^mw/i.test(productIdChange)) {
        productIdChange = "MW" + productIdChange.slice(2);
        console.log("🔄 productId 轉換:", productId, "→", productIdChange);
    }
    
    try {
        // 🚀 統一查詢配置，避免重複定義
        const queries = [
            {
                key: "assembly_batch",
                sql: `SELECT PARAM36, PARAM37, PARAM38, PARAM39, PARAM40, PARAM44, PARAM41, PARAM07 FROM mes.assembly_batch WHERE TRIM(PLCCellID_CE) = ?`,
                params: [productIdChange],
                fields: ["PARAM36", "PARAM37", "PARAM38", "PARAM39", "PARAM40", "PARAM44", "PARAM41", "PARAM07"]
            },
            {
                key: "schk_cellrule", 
                sql: `SELECT acirRP12_CE FROM mes.schk_cellrule WHERE TRIM(PLCCellID_CE) = ? ORDER BY id DESC LIMIT 1`,
                params: [productIdChange],
                fields: ["acirRP12_CE"]
            },
            {
                key: "testmerge_cc2",
                sql: `SELECT mOhm, VAHSC, OCV FROM mes.testmerge_cc1orcc2 WHERE TRIM(modelId) = ? AND TRIM(Para) = "CC2"`,
                params: [productIdChange],
                fields: ["mOhm", "VAHSC", "OCV"]
            },
            {
                key: "testmerge_cc1",
                sql: `SELECT VAHSB FROM mes.testmerge_cc1orcc2 WHERE TRIM(modelId) = ? AND TRIM(Para) = "CC1"`,
                params: [productIdChange],
                fields: ["VAHSB"]
            },
            {
                key: "injection_batch_fin",
                sql: `SELECT Injection_batchNO, nullWeight_CE, packedWeight_CE FROM mes.injection_batch_fin WHERE TRIM(PLCCellID_CE) = ?`,
                params: [productIdChange],
                fields: ["Injection_batchNO", "nullWeight_CE", "packedWeight_CE"]
            },
            {
                key: "echk_batch",
                sql: `SELECT PARAM18, PARAM19, PARAM02 FROM mes.echk_batch WHERE PARAM01 = 3 AND TRIM(PLCCellID_CE) = ?`,
                params: [productIdChange],
                fields: ["PARAM18", "PARAM19", "PARAM02"]
            },
            {
                key: "echk_batch2", 
                sql: `SELECT PARAM18, PARAM19, PARAM02 FROM mes.echk2_batch WHERE PARAM01 = 3 AND TRIM(PLCCellID_CE) = ?`,
                params: [productIdChange],
                fields: ["PARAM18", "PARAM19", "PARAM02"]
            },
            {
                key: "cellinfo_v",
                sql: `SELECT cellthickness, cellWeight FROM cellinfo_v WHERE TRIM(PLCCellID_CE) = ?`,
                params: [productIdChange],
                fields: ["cellthickness", "cellWeight"]
            },
            {
                key: "kvalueforprodinfo_update",
                sql: `SELECT Kvalue FROM mes.kvalueforprodinfo_update WHERE TRIM(cell) = ?`,
                params: [productIdChange],
                fields: ["Kvalue"]
            }
        ];

        console.log(`📊 並行執行 ${queries.length} 個查詢...`);
        
        // 🚀 並行查詢 + 錯誤隔離
        const queryStartTime = Date.now();
        const queryPromises = queries.map(async (query) => {
            try {
                const [rows] = await dbmesPromise.query(query.sql, query.params);
                return { 
                    ...query, 
                    data: rows && rows.length > 0 ? rows[0] : null,
                    success: true 
                };
            } catch (error) {
                console.warn(`⚠️ ${query.key} 查詢失敗:`, error.message);
                return { 
                    ...query, 
                    data: null, 
                    success: false, 
                    error: error.message 
                };
            }
        });
        
        const allResults = await Promise.all(queryPromises);
        const queryTime = Date.now() - queryStartTime;
        console.log(`⚡ 所有查詢完成，耗時 ${queryTime}ms`);

        // 🚀 統一資料處理
        const productDetails = {};
        let successCount = 0;
        let totalFields = 0;

        for (const result of allResults) {
            const { key, fields, data, success } = result;
            
            productDetails[key] = {};
            
            if (success && data) {
                successCount++;
                for (const field of fields) {
                    totalFields++;
                    let value = data[field] !== undefined && data[field] !== null 
                        ? data[field] 
                        : "N/A";
                    if (typeof value === "string") {
                        value = value.trim();
                    }
                    productDetails[key][field] = value;
                }
            } else {
                // 查詢失敗，填入 N/A
                for (const field of fields) {
                    totalFields++;
                    productDetails[key][field] = "N/A";
                }
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ handleDataFind 完成！總耗時 ${totalTime}ms`);
        console.log(`📊 成功查詢: ${successCount}/${queries.length} 個表格，${totalFields} 個欄位`);
        
        return productDetails;
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`❌ handleDataFind 失敗！耗時 ${totalTime}ms，錯誤:`, error);
        throw error;
    }
};


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


// 診斷 dataLost_collection 的資料狀態與表結構
router.get("/dataLost_collection/diag", async (req, res) => {
    try {
        const [countRows] = await dbmesPromise.query(
            `SELECT 
                 COUNT(*) AS totalRows,
                 COUNT(DISTINCT TRIM(IFNULL(modelId, ''))) AS distinctModelIds,
                 SUM(CASE WHEN TRIM(IFNULL(modelId, '')) = '' THEN 1 ELSE 0 END) AS blankModelIds
             FROM dataLost_collection`
        );

        const [sampleRows] = await dbmesPromise.query(
            `SELECT modelId, dataAllFillIn, memo, fillin_Time 
             FROM dataLost_collection 
             ORDER BY modelId 
             LIMIT 10`
        );

        const [createTbl] = await dbmesPromise.query('SHOW CREATE TABLE dataLost_collection');
        const createTableSQL = createTbl && createTbl[0] ? (createTbl[0]['Create Table'] || createTbl[0]['Create Table'.toLowerCase()]) : '';

        res.json({
            counts: countRows && countRows[0] ? countRows[0] : {},
            sample: sampleRows || [],
            createTable: createTableSQL
        });
    } catch (e) {
        console.error('診斷 API 錯誤:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;