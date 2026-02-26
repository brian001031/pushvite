const express = require("express");
const router = express.Router();
const XLSX = require("xlsx");
const fs = require('fs');
const moment = require('moment');
const path = require('path');
const schedule = require("node-schedule");

const multer = require('multer');
const upload = multer({ dest: 'uploads/' })

// 使用共用的 mes promise pool（集中管理連線設定）
const dbmesPromise = require(__dirname + "/../modules/mysql_connect_mes.js");

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
    is_cleared: "",
    memo: ""
};

// 欄位對應表
const fieldMap01 = {
  assembly_batch: { 
    idField: "PLCCellID_CE", 
    fields: ["PARAM36", "PARAM37", "PARAM38", "PARAM39", "PARAM40", "PARAM44", "PARAM41", "PARAM07"] , 
  },
  schk_cellrule: { idField: "PLCCellID_CE", fields: ["acirRP12_CE"] },
  injection_batch_fin: { idField: "PLCCellID_CE", fields: ["Injection_batchNO", "nullWeight_CE", "packedWeight_CE"] },
  echk_batch: { idField: "PLCCellID_CE", fields: ["PARAM18", "PARAM19", "PARAM02"] },
  echk2_batch: { idField: "PLCCellID_CE", fields: ["PARAM18", "PARAM19", "PARAM02"] },
};

const fieldMap02 = {
    testmerge_cc2: { 
        idField: "modelId", 
        tableName: "testmerge_cc1orcc2",
        fields: ["mOhm", "VAHSC", "OCV"] , 
        whereCondition: "AND TRIM(Para) = 'CC2'"
    },
    testmerge_cc1: {
        idField: "modelId", 
        tableName: "testmerge_cc1orcc2",
        fields: ["VAHSB"] , 
        whereCondition: "AND TRIM(Para) = 'CC1'"
    },
};const otherTables = {
  kvalueforprodinfo_update: { idField: "cell", fields: ["Kvalue"] },
  cellinfo_v: { idField: "PLCCellID_CE", fields: ["cellthickness", "cellWeight"] },
};

const total_Table = {
    assembly_batch: { idField: "PLCCellID_CE", fields: ["PARAM36", "PARAM37", "PARAM38", "PARAM39", "PARAM40", "PARAM44", "PARAM41", "PARAM07"] },
    schk_cellrule: { idField: "PLCCellID_CE", fields: ["acirRP12_CE"] },
    injection_batch_fin: { idField: "PLCCellID_CE", fields: ["Injection_batchNO", "nullWeight_CE", "packedWeight_CE"] },
    echk_batch: { idField: "PLCCellID_CE", fields: ["PARAM18", "PARAM19", "PARAM02"] },
    echk2_batch: { idField: "PLCCellID_CE", fields: ["PARAM18", "PARAM19", "PARAM02"] },
    testmerge_cc2: { idField: "modelId", tableName: "testmerge_cc1orcc2", fields: ["mOhm", "VAHSC", "OCV"], whereCondition: "AND TRIM(Para) = 'CC2'" },
    testmerge_cc1: { idField: "modelId", tableName: "testmerge_cc1orcc2", fields: ["VAHSB"], whereCondition: "AND TRIM(Para) = 'CC1'" },
    kvalueforprodinfo_update: { idField: "cell", fields: ["Kvalue"] },
    cellinfo_v: { idField: "PLCCellID_CE", fields: ["cellthickness", "cellWeight"] },
}

const excelColumns = [
        "id",
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
        ];
function getServerIP() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 只取 IPv4 地址，跳過內部回環地址
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return null;
}

// // 每天 00:30 (半夜 12:30 AM) 執行 data_IntoDB，並指定台北時區，確保排程時間正確
schedule.scheduleJob({ hour: 12, minute: 30, tz: 'Asia/Taipei' }, async () => {
    console.log('⏰ [Scheduler] 每天 00:30 自動執行 data_IntoDB (Asia/Taipei)');
    const currentIP = getServerIP();
    const allowedIP = '192.168.3.207';
    
    if (currentIP !== allowedIP) {
        console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
        return;
    }
    
    try {
        // 呼叫時不帶 req/res，傳入預設 options
        await data_IntoDB(null, null, { mode: 'all', strategy: 'batch' });
        console.log('✅ [Scheduler] data_IntoDB 執行完成');
    } catch (err) {
        console.error('❌ [Scheduler] data_IntoDB 執行失敗:', err);
        // 不要 throw 出去導致整個程式意外中斷，僅記錄錯誤
    }
});

// 抓取當月 modelId
const autoGetMachineNo = async () => {
    // 建立本月起訖（確保 start <= end）以及方便的 currentMonth 字串
    const startOfMonth = moment().startOf('month').format('YYYY/MM/DD');
    const endOfMonth = moment().endOf('month').format('YYYY/MM/DD');
    const currentMonth = moment().format('YYYY/MM');

    console.log(`🔍 autoGetMachineNo 開始查詢，當月: ${currentMonth}`);

    const sql = `
        SELECT DISTINCT TRIM(modelId) AS modelId
        FROM testmerge_cc1orcc2
        WHERE EnddateD BETWEEN ? AND ?
        AND TRIM(modelId) <> '' AND modelId IS NOT NULL
        ORDER BY id
    `;

    // 使用正確的起訖順序：startOfMonth 00:00:00 -> endOfMonth 23:59:59
    const params = [startOfMonth + ' 00:00:00', endOfMonth + ' 23:59:59'];
    // const params = ['2000/01/01 00:00:00' , '2099/12/31 23:59:59']

    console.log("📝 查詢當月 modelId，條件:", params);

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
const fetchTableData = async (tableName, idField, fields, ids, dateField, dateParams, whereCondition = null) => {
    if (!ids || ids.length === 0) {
        console.warn(`⚠️ fetchTableData: ${tableName} 收到空的 ids 陣列`);
        return [];
    }

    let sql = `SELECT TRIM(${idField}) AS modelId, `;
    sql += fields.map(field => `TRIM(${field}) AS ${field}`).join(", ");
    sql += ` FROM ${tableName} WHERE TRIM(${idField}) IN (${ids.map(() => "?").join(",")})`;

    const params = [...ids];
    
    // 加入日期過濾條件
    if (dateField && dateParams && dateParams.length > 0) {
        if (dateField === 'EnddateD') {
            sql += ` AND EnddateD LIKE ?`;
            params.push(dateParams[0]);
        }
    }
    
    // 加入額外的 WHERE 條件
    if (whereCondition) {
        sql += ` ${whereCondition}`;
    }
    
    try {
        const [rows] = await dbmesPromise.query(sql, params);
        return rows;
    } catch (err) {
        console.error(`❌ 查詢 ${tableName} 時發生錯誤:`, err.message);
        return [];
    }
};

// 主要查詢函示 回傳標準化資料並處理缺失
const fetchIdFromTable = async (tableName, idField, fields, batchIds, whereCondition = null) => {

    const selectCols = [`TRIM(${idField}) AS modelId`, ...fields.map(f => `TRIM(${f}) AS ${f}`)];
    let sql = `SELECT ${selectCols.join(', ')} FROM ${tableName} WHERE TRIM(${idField}) IN (${batchIds.map(() => '?').join(',')})`;
    
    if (whereCondition) {
        sql += ` ${whereCondition}`;
    }
    
    try {
        const [rows] = await dbmesPromise.query(sql, batchIds);
        const normalized = rows.map(r => {
            
            // 處理 modelId
            const modelId = (r.modelId || '').toString().trim();
            
            // 處理其他欄位並檢查是否全部有值
            let allFieldsHaveValue = true;
            
            const fieldData = fields.reduce((acc, f) => {
                const val = r[f];
                
                // 標準化欄位值：未定義/NULL 轉為空字串，字串去空白
                let standardVal = '';
                if (val !== undefined && val !== null) {
                    standardVal = (typeof val === 'string' ? val.trim() : val.toString().trim());
                }

                acc[f] = standardVal;
                
                // 檢查是否所有欄位都有值
                if (standardVal === '') {
                    allFieldsHaveValue = false;
                }
                

                return acc;
            }, {});

            // 處理 is_cleared 欄位
            if (fieldData.hasOwnProperty('is_cleared')) {
                // 如果 is_cleared 存在於 fields 陣列中，則依據新邏輯設定其值
                fieldData.is_cleared = allFieldsHaveValue ? '1' : '0';
            }

            return {
                modelId: modelId,
                ...fieldData
            };
        });

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
        return batchIds.map(id => ({
            modelId: (id || '').toString().trim(),
            ...fields.reduce((acc, f) => { acc[f] = ''; return acc; }, {})
        }));
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
        case 'testmerge_cc1orcc2': // 支援實際表名
        case 'testmerge_cc1':
        case 'testmerge_cc2':
            // testmerge 表的欄位名直接對應
            Object.keys(row).forEach((k) => {
                if (k === 'modelId') return;
                out[k] = row[k];
            });
            break;
        default:
            // 其它表欄位名稱與 newDbData 相同，直接拷貝已存在的鍵
            Object.keys(row).forEach((k) => {
                if (k === 'modelId') return; 
                out[k] = row[k];
            });
    }
    return out;
};


const checkData_FindACIR = async (row, conn, batchSize = 1000) => {
    if (!Array.isArray(row) || row.length === 0) {
        return [];
    }

    try {
        const totalBatches = Math.ceil(row.length / batchSize);
        console.log(`📊 開始分批查詢，共 ${row.length} 筆，分 ${totalBatches} 批處理（每批 ${batchSize} 筆）`);

        // 建立所有批次的 Promise
        const batchPromises = [];
        
        for (let i = 0; i < row.length; i += batchSize) {
            const batch = row.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;

            // 使用簡化的直接 JOIN（移除子查詢，效能更好）
            const queryPromise = conn.query(
                `
                SELECT 
                    t1.modelId,
                    t1.Para,
                    t1.VAHSC,
                    t1.FileName,
                    t2.Kvalue,
                    t3.PLCCellIDClass_CE,
                    t3.acirVP12_CE
                FROM testmerge_cc1orcc2 AS t1
                LEFT JOIN kvalueforprodinfo_update AS t2 ON t1.modelId = t2.cell
                LEFT JOIN schk_cellrule AS t3 ON t1.modelId = t3.PLCCellID_CE
                WHERE t1.modelId IN (${batch.map(() => '?').join(',')})
                `,
                batch
            ).then(([results]) => {
                console.log(`✅ 第 ${batchNumber}/${totalBatches} 批完成，找到 ${results.length} 筆`);
                return results;
            });

            batchPromises.push(queryPromise);
        }

        // 並行執行所有批次查詢
        const batchResults = await Promise.all(batchPromises);
        
        // 合併所有結果
        const allResults = batchResults.flat();

        console.log(`✅ 資料庫查詢完成，共找到 ${allResults.length} 筆符合的 VAHSC 資料`);

        return allResults;

    } catch (err) {
        console.log("❌ checkData_FindACIR 錯誤:", err);
        throw err;
    }
}

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

    const conn = await dbmesPromise.query(sql, params)
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

    const conn = await dbmesPromise.getConnection();
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



// 依據缺失Data轉入 newDB 的純後端執行函式（無 req/res）
// 回傳一個結果物件或在錯誤時拋出例外，供 scheduler / CLI / 程式內呼叫
const runDataIntoDB = async (options = {}) => {
    const mode = 'all'
    const strategy = (options.strategy && options.strategy === 'single') ? 'single' : 'batch';

    const modelIds = await autoGetMachineNo();
    if (!modelIds || modelIds.length === 0) {
        return { success: true, message: '無 modelId 資料', data: [] };
    }

    console.log(`📊 共 ${modelIds.length} 筆 modelId 待處理`);
    const chunks = chunkArray(modelIds, 500);

    const metaKeys = new Set(['modelId','systemFillIn_Time','fillin_MemberName','fillin_Time','dataAllFillIn','is_cleared','memo']);
    const echkKeys = [
        "PARAM18_echk_batch","PARAM19_echk_batch","PARAM02_echk_batch",
        "PARAM18_echk2_batch","PARAM19_echk2_batch","PARAM02_echk2_batch",
    ];
    const requiredKeys = Object.keys(newDbData).filter(k => !metaKeys.has(k) && !echkKeys.includes(k));

    let inspected = 0, missingRows = 0, upsertCount = 0, batchUpsertCalls = 0;

    for (let i = 0; i < chunks.length; i++) {
        const batchIds = chunks[i];
        console.log(`🔍 第 ${i + 1}/${chunks.length} 批 (size=${batchIds.length}) 讀取 & upsert into db`);

        const tables = { ...fieldMap01, ...fieldMap02, ...otherTables };
        const merged = new Map();
        for (const rawId of batchIds) {
            const id = (rawId || '').toString().trim();
            if (id) merged.set(id, { modelId: id });
        }

        const fetchPromises = Object.keys(tables).map(tableKey => {
            const { idField, fields, tableName = null, whereCondition = null } = tables[tableKey];
            const actualTableName = (tableName && typeof tableName === 'string' && tableName.trim() !== '') ? tableName : tableKey;
            return fetchIdFromTable(actualTableName, idField, fields, batchIds, whereCondition).then(rows => ({ actualTableName, rows }));
        });

        const allTableResults = await Promise.all(fetchPromises);

        for (const { actualTableName, rows } of allTableResults) {
            const blank = rows.filter(r => !r.modelId || r.modelId.trim() === '');
            if (blank.length > 0) console.warn(`⚠️ [${actualTableName}] 回傳空 modelId 筆數=${blank.length} / ${rows.length}`);
            for (const row of rows) {
                const id = (row.modelId || '').toString().trim();
                if (!id) continue;
                const current = merged.get(id) || { modelId: id };
                Object.assign(current, mapRowToNewDbFields(actualTableName, row));
                merged.set(id, current);
            }
        }

        const shaped = [];
        for (const obj of merged.values()) {
            const row = { ...obj };
            const missing = [];
            for (const k of requiredKeys) {
                const v = row[k];
                if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
                    row[k] = '';
                    missing.push(k);
                } else if (typeof v === 'string') row[k] = v.trim();
            }

            const echk1Filled = (row.PARAM18_echk_batch || '').toString().trim() !== '' || (row.PARAM19_echk_batch || '').toString().trim() !== '' || (row.PARAM02_echk_batch || '').toString().trim() !== '';
            const echk2Filled = (row.PARAM18_echk2_batch || '').toString().trim() !== '' || (row.PARAM19_echk2_batch || '').toString().trim() !== '' || (row.PARAM02_echk2_batch || '').toString().trim() !== '';
            if (!echk1Filled && !echk2Filled) missing.push(...echkKeys);

            echkKeys.forEach(k => { if (row[k] === undefined || row[k] === null) row[k] = ''; else if (typeof row[k] === 'string') row[k] = row[k].trim(); });

            if (missing.length > 0) {
                row.dataAllFillIn = 'auto_missing'; row.memo = `missing: ${missing.join(',')}`; row.is_cleared = '0'; missingRows++;
            } else {
                row.dataAllFillIn = row.dataAllFillIn || 'auto_full'; row.memo = row.memo || ''; row.is_cleared = '1';
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
            if (i === 0) console.log(`🧪 第一批寫入示例 modelId:`, shaped.slice(0,5).map(r=>r.modelId));
            console.log(`✅ 批次寫入完成：rows=${shaped.length} affected=${result.inserted} fallback=${result.updatedFallback}`);
        } else {
            console.log(`⏭️ 本批無需寫入（mode=${mode}）`);
        }

        console.log(`📈 進度 ${(((i + 1) / chunks.length) * 100).toFixed(2)}% (inspected=${inspected} missingRows=${missingRows} written=${upsertCount})`);
    }

    return { success:true, mode, strategy, inspected, missingRows, writtenRows: upsertCount, batchUpsertCalls };
};

// Express wrapper（保留給 route 或舊呼叫）: 會把 req/res 轉成 options，並以 HTTP 回應結果
const data_IntoDB = async (req = null, res = null, options = {}) => {
    const mergedOptions = { ...(options || {}) };
    if (req && req.query) {
        if (req.query.mode) mergedOptions.mode = req.query.mode;
        if (req.query.strategy) mergedOptions.strategy = req.query.strategy;
    }
    try {
        const result = await runDataIntoDB(mergedOptions);
        if (res && !res.headersSent) return res.json(result);
        return result;
    } catch (err) {
        console.error('/dataInto_DB wrapper error:', err);
        if (res && !res.headersSent) {
            try { res.status(500).json({ success:false, error: err.message }); } catch(e){}
            return;
        }
        throw err;
    }
};


// 處理批次資料的函數_FOR Excel 
async function processBatch(batchData, conn) {
    const allDataForInsert = batchData.map(item => excelColumns.map(col => item[col] || ''));

    const sql_ExcelUpdate = `
        INSERT INTO mes.dataLost_collection (${excelColumns.join(', ')})
        VALUES ?
        ON DUPLICATE KEY UPDATE
        ${excelColumns.map(col => `${col} = VALUES(${col})`).join(', ')}
    `;

    try {
        await conn.beginTransaction();
        const response = await conn.query(sql_ExcelUpdate, [allDataForInsert]);
        await conn.commit();
        console.log(`✅ 批次處理成功:`, response[0]);
    } catch (err) {
        await conn.rollback();
        console.error("❌ 批次處理失敗:", err);
        throw err;
    }
}


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
      for (const tableKey of Object.keys(tables)) {
          const { idField, fields, tableName = null, whereCondition = null } = tables[tableKey];
          // 只有當 tableName 是非空字串時才使用，否則使用 tableKey
          const actualTableName = (tableName && typeof tableName === 'string' && tableName.trim() !== '') ? tableName : tableKey;
          
          let dateField = null;
          let dateParams = [];
          if (actualTableName === 'testmerge_cc1orcc2') {
              dateField = 'EnddateD';
              dateParams = [`${thisMonthQuery}%`];
          }
          
          const rows = await fetchTableData(actualTableName, idField, fields, batchIds, dateField, dateParams, whereCondition);
          
          // 檢查是否有空值或找不到資料
          batchIds.forEach(id => {
              const foundRow = rows.find(row => row.modelId.trim() === id.trim());
              if (!foundRow) {
                  // 找不到資料 - 將所有欄位合併成一筆記錄
                  allResults.push({
                      modelId: id,
                      tableName: actualTableName,
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
                            tableName: actualTableName,
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
            const queryPromises = Object.keys(tables).map(async (tableKey) => {
                const { idField, fields, tableName = null, whereCondition = null } = tables[tableKey];
                // 只有當 tableName 是非空字串時才使用，否則使用 tableKey
                const actualTableName = (tableName && typeof tableName === 'string' && tableName.trim() !== '') ? tableName : tableKey;
                
                let dateField = null;
                let dateParams = [];
                if (actualTableName === 'testmerge_cc1orcc2') {
                    dateField = 'EnddateD';
                    dateParams = [`${thisMonthQuery}%`];
                }
                
                try {
                    // 一次查詢整批 modelId，而不是逐個查詢
                    const rows = await fetchTableData(actualTableName, idField, fields, batchIds, dateField, dateParams, whereCondition);
                    
                    // 建立 modelId 對應的資料 Map
                    const dataMap = {};
                    rows.forEach(row => {
                        dataMap[row.modelId.trim()] = row;
                    });
                    
                    console.log(`✅ ${tableKey} (${actualTableName}): 查詢完成，找到 ${rows.length}/${batchIds.length} 筆資料`);
                    return { tableName: actualTableName, tableKey, fields, dataMap };
                } catch (error) {
                    console.error(`❌ ${tableKey} (${actualTableName}): 查詢失敗`, error.message);
                    return { tableName: actualTableName, tableKey, fields, dataMap: {} };
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
            let batchIncompleteCount = 0;
            
            for (const modelId of batchIds) {
                processedCount++;
                let modelData = { modelId: modelId };
                let isComplete = true;
                let incompleteReason = '';
                let missingTableCount = 0;
                let emptyFieldCount = 0;

                // 檢查每個表格的資料
                for (const { tableName, tableKey, fields, dataMap } of allTableData) {
                    const foundRow = dataMap[modelId.trim()];
                    
                    if (!foundRow) {
                        missingTableCount++;
                        incompleteReason = `${tableKey || tableName} 中找不到資料`;
                        // ⚠️ 不要 break，繼續檢查其他表格
                    } else {
                        // 檢查每個欄位是否有值
                        for (const field of fields) {
                            const value = foundRow[field];
                            if (value === null || value === undefined || value.toString().trim() === '') {
                                emptyFieldCount++;
                            } else {
                                modelData[field] = value.toString().trim();
                            }
                        }
                    }
                }

                    if (missingTableCount > 0 || emptyFieldCount > 0) {
                        isComplete = false;
                        continue; // 有缺失，跳過加入完整列表
                    }
                    
                    batchCompleteCount++;
                    // 按照 allData 的欄位順序重新排列
                    let orderedData = { modelId: modelId };
                    Object.keys(allData).forEach(key => {
                        orderedData[key] = modelData[key] || '';
                    });
                    orderedData.FindTime = moment().locale('zh-tw').format('YYYY-MM-DD HH:mm:ss');
                    completeModels.push(orderedData);
                
                
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

        if (completeModels.length === 0) {
            return res.json({ success: true, message: "查無完整資料", data: [] });
        }

        // 匯出 CSV - 依照 allData 欄位順序
        const fs = require('fs');
        const filePath = `./complete_models_${moment().format("YYYYMMDD_HHmmss")}.csv`;
        const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });
        
        // 建立標題行（按照 allData 順序）
        const headers = ['modelId', ...Object.keys(allData), 'FindTime'];
        writeStream.write(headers.join(',') + '\n');
        
        // 寫入資料行
        for (const model of completeModels) {
            const values = headers.map(header => {
                const val = model[header] || '';
                const str = val === null || val === undefined ? '' : String(val);
                // CSV 轉義：包含逗號、換行、引號的欄位需要用雙引號包裹
                if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            });
            writeStream.write(values.join(',') + '\n');
        }
        
        writeStream.end();
        
        // 等待寫入完成
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        console.log(`==== 完整資料匯出完成，結果已輸出 ${filePath} ====`);
        
        // 提供下載
        res.download(filePath, (err) => {
            if (err) {
                console.error("下載檔案錯誤:", err);
                if (!res.headersSent) {
                    res.status(500).send("下載檔案失敗");
                }
            }
        });

    } catch (err) {
        console.error("自動化匯出錯誤:", err);
        res.status(500).json({ error: "Server error", detail: err.message });
    }
});

// 單筆產品資訊查詢 API 
const handleDataFind = async (productId) => {
    console.log("handleDataFind 開始，原始 productId:", productId);
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
                sql: `SELECT PARAM36, PARAM37, PARAM38, PARAM39, PARAM40, PARAM44, PARAM41, PARAM07 FROM mes.assembly_batch WHERE TRIM(PLCCellID_CE) = ? ORDER BY id DESC LIMIT 1`,
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
                sql: `SELECT mOhm, VAHSC, OCV FROM mes.testmerge_cc1orcc2 WHERE TRIM(modelId) = ? AND TRIM(Para) = "CC2" ORDER BY id DESC LIMIT 1`,
                params: [productIdChange],
                fields: ["mOhm", "VAHSC", "OCV"]
            },
            {
                key: "testmerge_cc1",
                sql: `SELECT VAHSB FROM mes.testmerge_cc1orcc2 WHERE TRIM(modelId) = ? AND TRIM(Para) = "CC1" ORDER BY id DESC LIMIT 1`,
                params: [productIdChange],
                fields: ["VAHSB"]
            },
            {
                key: "injection_batch_fin",
                sql: `SELECT Injection_batchNO, nullWeight_CE, packedWeight_CE FROM mes.injection_batch_fin WHERE TRIM(PLCCellID_CE) = ? ORDER BY id DESC LIMIT 1`,
                params: [productIdChange],
                fields: ["Injection_batchNO", "nullWeight_CE", "packedWeight_CE"]
            },
            {
                key: "echk_batch",
                sql: `SELECT PARAM18, PARAM19, PARAM02 FROM mes.echk_batch WHERE PARAM01 = 3 AND TRIM(PLCCellID_CE) = ? ORDER BY id DESC LIMIT 1`,
                params: [productIdChange],
                fields: ["PARAM18", "PARAM19", "PARAM02"]
            },
            {
                key: "echk_batch2", 
                sql: `SELECT PARAM18, PARAM19, PARAM02 FROM mes.echk2_batch WHERE PARAM01 = 3 AND TRIM(PLCCellID_CE) = ? ORDER BY id DESC LIMIT 1`,
                params: [productIdChange],
                fields: ["PARAM18", "PARAM19", "PARAM02"]
            },
            {
                key: "cellinfo_v",
                sql: `SELECT cellthickness, cellWeight FROM cellinfo_v WHERE TRIM(PLCCellID_CE) = ? ORDER BY id DESC LIMIT 1`,
                params: [productIdChange],
                fields: ["cellthickness", "cellWeight"]
            },
            {
                key: "kvalueforprodinfo_update",
                sql: `SELECT Kvalue FROM mes.kvalueforprodinfo_update WHERE TRIM(cell) = ? ORDER BY id DESC LIMIT 1`,
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

// 資料待補清單補齊資料
router.get("/singleDataFind" , async (req , res) =>{
    const {productId ,  page=1 , pageSize=12} = req.query;

    const limit = parseInt(pageSize, 10);
    const offset = (parseInt(page, 10) - 1) * limit;
    console.log("singleData api be call  :", productId , typeof productId);

    try{
        const sql = `SELECT * FROM mes.dataLost_collection WHERE modelId LIKE '%${productId}%' LIMIT 1`
        const sql_count = `SELECT COUNT(*) as total FROM mes.dataLost_collection WHERE modelId LIKE '%${productId}%'`

        const [rows] = await dbmesPromise.query(sql);
        const [countResult] = await dbmesPromise.query(sql_count);
        const total = countResult[0]?.total || 0;

        console.log(`✅ /singleDataFind 查詢成功，筆數=${rows.length}` , rows);
        
        res.status(200).json({
            success:true,
            data:rows,
            pagination: {
                total,
                page: parseInt(page, 10),
                pageSize: limit,
                totalPage : Math.ceil(total / limit),
            }
        })
        
    }catch(error){
        console.error("Error in /singleDataFind:", error);
        res.status(500).json({
            success: false,
            message: "單筆產品資訊查詢失敗",
            error: error.message,
        });
    }
})

// 🚀 防止多重連線的鎖
isDownloading_Member = {}

// 🚀 串流下載進度 API (Server-Sent Events) - 加入單例鎖
router.get("/downloadExcel", async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const { startDate, endDate , memberId} = req.query;

    // 設定 SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (isDownloading_Member[memberId]){
        console.log(`⚠️ 會員 ${memberId} 有其他下載正在進行，拒絕新請求`);
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: '您有其他下載正在進行，請稍後再試' 
        })}\n\n`);
        return res.end();
    }

    // 🔒 鎖定下載
    isDownloading_Member[memberId] = true;

    const start = startDate ? moment(startDate).locale("zh-tw").format('YYYY-MM-DD 00:00:00') : '1900-01-01 00:00:00';
    const end = endDate ? moment(endDate).locale("zh-tw").format('YYYY-MM-DD 23:59:59') : '2100-12-31 23:59:59';

    try {
        // 🚀 先取得總筆數
        const countSql = `SELECT COUNT(*) as total FROM mes.dataLost_collection WHERE is_cleared = 0 AND systemFillIn_Time BETWEEN ? AND ?`;
        const [countResult] = await dbmesPromise.query(countSql, [start, end]);
        const totalRows = countResult[0]?.total || 0;
        
        console.log(`📊 /downloadExcel 準備串流下載，總筆數=${totalRows}`);
        
        // 發送總筆數給前端
        res.write(`data: ${JSON.stringify({ type: 'total', total: totalRows })}\n\n`);

        if (totalRows === 0) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: '查無資料' })}\n\n`);
            // isDownloading = false; // 🔓 解鎖
            isDownloading_Member[memberId] = false; // 🔓 解鎖
            return res.end();
        }

        const batchSize = 10000;
        const totalBatches = Math.ceil(totalRows / batchSize);
        let allRows = [];

        // 🚀 分批查詢並即時回報進度
        for (let i = 0; i < totalBatches; i++) {
            const offset = i * batchSize;
            const batchSql = `
                SELECT * FROM mes.dataLost_collection 
                WHERE is_cleared = 0 AND systemFillIn_Time BETWEEN ? AND ?
                ORDER BY fillin_Time DESC
                LIMIT ? OFFSET ?`;
            
            const [rows] = await dbmesPromise.query(batchSql, [start, end, batchSize, offset]);
            allRows.push(...rows);
            
            const progress = ((i + 1) / totalBatches * 100).toFixed(1);
            
            // 🚀 每批查詢完成後立即推送進度給前端
            res.write(`data: ${JSON.stringify({
                type: 'progress',
                batch: i + 1,
                totalBatches,
                currentBatch: rows.length,
                accumulated: allRows.length,
                progress: parseFloat(progress)
            })}\n\n`);
            
            console.log(`  📡 推送進度 ${i + 1}/${totalBatches} (${progress}%) 給前端`);
        }

        console.log(`✅ 資料查詢完成，準備生成 CSV... (${allRows.length} 筆)`);

        const fs = require('fs');
        const filePath = `./temp_reports/lost_data_${moment().format("YYYYMMDD")}.csv`;
        const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });
        
        // 寫入 CSV 標題
        if (allRows.length > 0) {
            const headers = Object.keys(allRows[0]);
            writeStream.write(headers.join(',') + '\n');
        }
        
        // 🚀 串流寫入 CSV（每 1000 筆一批）
        const chunkSize = 1000;
        for (let i = 0; i < allRows.length; i += chunkSize) {
            const chunk = allRows.slice(i, i + chunkSize);
            
            for (const row of chunk) {
                const values = Object.values(row).map(v => {
                    // CSV 轉義：包含逗號、換行、引號的欄位需要用雙引號包裹
                    const str = v === null || v === undefined ? '' : String(v);
                    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                });
                writeStream.write(values.join(',') + '\n');
            }
            
            if ((i + chunkSize) % 50000 === 0 || i + chunkSize >= allRows.length) {
                console.log(`  📝 寫入進度 ${Math.min(i + chunkSize, allRows.length)}/${allRows.length} (${((Math.min(i + chunkSize, allRows.length) / allRows.length) * 100).toFixed(1)}%)`);
            }
        }
        
        writeStream.end();
        
        // 等待寫入完成
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        
        console.log(`✅ CSV 檔案寫入完成`);

        // 發送完成訊息（包含完整的下載連結）
        const fileName = filePath.replace('./', '');
        // const downloadUrl = `http://localhost:3009/productBrochure/downloadFile?file=${encodeURIComponent(filePath)}`;
        const downloadUrl = `http://192.168.3.207:3009/productBrochure/downloadFile?file=${encodeURIComponent(filePath)}`;
        console.log (`📥 下載連結已生成：${downloadUrl}`);
        
        res.write(`data: ${JSON.stringify({
            type: 'complete',
            total: allRows.length,
            filePath,
            fileName,
            downloadUrl
        })}\n\n`);
        
        console.log(`✅ CSV 生成完成：${filePath}`);
        console.log(`📥 下載連結：${downloadUrl}`);
        res.end();

        // 🔓 解鎖
        // isDownloading = false;
        isDownloading_Member[memberId] = false;

    } catch (error) {
        console.error("❌ /downloadExcel 錯誤:", error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
        
        // 🔓 解鎖
        // isDownloading = false;
        isDownloading_Member[memberId] = false;
    } finally {
        // 🔓 解鎖（確保在任何情況下都能解鎖
        isDownloading_Member[memberId] = false;
    }
});

// 🚀 下載已生成的檔案
router.get("/downloadFile", (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    const { file } = req.query;
    
    if (!file) {
        return res.status(400).json({ success: false, message: "缺少檔案路徑" });
    }
    const absPath = path.resolve(file);
    res.download(absPath, (err) => {
        if (err) {
            console.error("Error sending file:", err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: "下載檔案失敗" });
            }
        }
    });
});




router.get("/displayAllLostData" , async (req , res) =>{
    const {memberId , page=1 , pageSize=8 , startDate , endDate} = req.query;

    const limit = parseInt(pageSize, 10);
    const offset = (parseInt(page, 10) - 1) * limit;
    
    let start = startDate ? moment(startDate).locale("zh-tw").format('YYYY-MM-DD 00:00:00') : '1900-01-01 00:00:00';
    let end = endDate ? moment(endDate).locale("zh-tw").format('YYYY-MM-DD 23:59:59') : '2100-12-31 23:59:59';

    console.log("displayAllLostData API called with:", { memberId, page, pageSize, startDate, endDate });
    let sql = `
        SELECT * FROM mes.dataLost_collection 
        WHERE is_cleared = 0 
        AND systemFillIn_Time BETWEEN ? AND ?
        ORDER BY fillin_Time DESC 
        LIMIT ? OFFSET ?`;
    
    let sql_count = `
        SELECT COUNT(*) as total FROM mes.dataLost_collection 
        WHERE is_cleared = 0 
        AND systemFillIn_Time BETWEEN ? AND ?`;
    
    let params = [start, end, limit, offset];
    
    try{
        const startTime = Date.now();
        
        // 🚀 並行執行資料查詢和總數查詢
        const [rowsPromise, countPromise] = await Promise.all([
            dbmesPromise.query(sql, params),
            dbmesPromise.query(sql_count , [start, end])
        ]);
        
        const [rows] = rowsPromise;
        const [countResult] = countPromise;
        const total = countResult[0]?.total || 0;
        
        const queryTime = Date.now() - startTime;
        console.log(`✅ /displayAllLostData 查詢成功，耗時 ${queryTime}ms，筆數=${rows.length}/${total}, page=${page}, pageSize=${pageSize}`);
        
        res.status(200).json({
            success:true,
            data:rows,
            pagination: {
                total,
                page: parseInt(page, 10),
                pageSize: limit,
                totalPage : Math.ceil(total / limit),
            }
        });

    }catch(error){
        console.error("Error in /displayAllLostData:", error);
        res.status(500).json({
            success: false,
            message: "取得所有缺失資料失敗",
            error: error.message,
        });
    }
})

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




router.post("/figureData", async (req, res) => {
    // ✅ 前端直接傳陣列，req.body 本身就是 dataList
    const dataList = Array.isArray(req.body) ? req.body : req.body.dataList;
    console.log("📥 figureData API 被調用，收到資料筆數:", dataList?.length);

    if (!dataList || !Array.isArray(dataList) || dataList.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: "請求資料列表為空或格式錯誤" 
        });
    }

    try {
        // 定義不需要檢查的元資料欄位
        const metaFields = new Set([
            'id', 'modelId', 'memo', 
            'systemFillIn_Time', 'fillin_MemberName', 'fillin_Time', 
            'dataAllFillIn', 'is_cleared'
        ]);
        
        // 準備所有要更新的資料項目
        const updateItems = [];

        dataList.forEach((item, index) => {
            if (!item.id || !item.modelId) {
                console.warn(`⚠️ [${index}] 缺少 id 或 modelId，跳過`);
                return;
            }

            // 檢查是否有空欄位（排除原資料）
            const emptyFields = [];
            Object.entries(item).forEach(([fieldName, fieldValue]) => {
                if (metaFields.has(fieldName)) return;
                if (fieldValue === "" || fieldValue === null || fieldValue === undefined) {
                    emptyFields.push(fieldName);
                }
            });

            const currentMemo = (item.memo || '').trim();
            let finalMemo;
            let isCleared; // ✅ 新增：標記是否完成
            
            if (emptyFields.length === 0) {
                // ✅ 完整資料：清除舊的 missing 記錄，只保留 alreadyClear
                finalMemo = 'alreadyClear';
                isCleared = 1; // ✅ 設定 is_cleared = 1 (已完成)
                console.log(`  ✅ [${index}] ${item.modelId} - 完整，設為 alreadyClear, is_cleared=1`);
            } else {
                // ⚠️ 不完整：更新 memo 為當前缺失欄位，移除舊的 alreadyClear
                const newMissingMemo = `missing: ${emptyFields.join(',')}`;
                // 如果原 memo 有其他非 missing/alreadyClear 的資訊，保留之
                const cleanMemo = currentMemo
                    .replace(/missing:[^;]*/g, '')
                    .replace(/;?alreadyClear/g, '')
                    .replace(/^;+|;+$/g, '')
                    .trim();
                finalMemo = cleanMemo ? `${cleanMemo};${newMissingMemo}` : newMissingMemo;
                isCleared = 0; // ✅ 設定 is_cleared = 0 (未完成)
                console.log(`  ⚠️ [${index}] ${item.modelId} - 缺 ${emptyFields.length} 個欄位: ${emptyFields.join(', ')}, is_cleared=0`);
            }
            
            updateItems.push({ 
                id: item.id, 
                modelId: item.modelId, 
                memo: finalMemo,
                is_cleared: isCleared, // ✅ 新增 is_cleared 欄位
                allFields: item
            });
        });

        console.log(`\n📊 總共準備更新 ${updateItems.length} 筆資料`);

        // 批量更新/插入所有資料
        let affectedRows = 0;
        if (updateItems.length > 0) {
            const conn = await dbmesPromise.getConnection();
            try {
                await conn.beginTransaction();
                const fields = Object.keys(newDbData);
                
                for (const item of updateItems) {
                    console.log(`  🔄 更新 modelId=${item.modelId}, is_cleared=${item.is_cleared}`);
                    
                    // 準備欄位值（按更新後的 fields 順序，缺失填 ''）
                    const values = fields.map(f => {
                        if (f === 'memo') return item.memo; // 使用新 memo
                        if (f === 'is_cleared') return item.is_cleared; // ✅ 使用計算出的 is_cleared 值
                        if (f === 'dataAllFillIn') return 'manual_complete';
                        const val = item.allFields[f];
                        return val != null ? val : '';
                    });
                    
                    // 構建 UPSERT SQL
                    const placeholders = fields.map(() => '?').join(', ');
                    const updateClause = fields
                        .filter(f => f !== 'modelId')
                        .map(f => `${f} = VALUES(${f})`)
                        .join(', ');
                    
                    const sql = `
                        INSERT INTO mes.dataLost_collection (${fields.join(', ')}) 
                        VALUES (${placeholders}) 
                        ON DUPLICATE KEY UPDATE ${updateClause}`;
                    
                    const [result] = await conn.query(sql, values);
                    affectedRows += result.affectedRows || 0;
                }
                
                await conn.commit();
                console.log(`✅ 批量更新完成，實際影響 ${affectedRows} 列`);
            } catch (err) {
                await conn.rollback();
                console.error("❌ 事務回滾:", err);
                throw err;
            } finally {
                conn.release();
            }
        }

        res.status(200).json({
            success: true,
            message: "更新成功",
            summary: {
                total: dataList.length,
                updated: updateItems.length,
                affectedRows
            }
        });

    } catch (error) {
        console.error("❌ /figureData 錯誤:", error);
        res.status(500).json({
            success: false,
            message: "批量更新資料失敗",
            error: error.message
        });
    }
});


router.post("/uploadExcel", upload.single('file'), async (req, res) => {
    const file = req.file || null;
    const memberId = req.body.memberId || 'unknown';

    const conn = await dbmesPromise.query(sql, params)
    console.log("📥 /uploadExcel API 被調用");

    if (!file) {
        conn.release();
        return res.status(400).json({ success: false, message: `${memberId}上傳檔案未成功` });
    }

    try {
        const filePath = file.path;
        const workbook = XLSX.readFile(filePath);

        let rowCount = 0;
        let chunkData = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            // 使用 header: 1 將每行轉為陣列，方便取標頭
            const sheetDataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

            if (sheetDataAsArray.length === 0) {
                continue; // 如果工作表是空的，跳到下一個
            }

            // 取得標頭行並檢查 modelId
            const headerRow = sheetDataAsArray[0];
            const modelIdIndex = headerRow.indexOf('modelId');

            if (modelIdIndex === -1) {
                // 如果在第一個工作表中找不到 modelId，就拒絕此檔案
                conn.release();
                fs.unlinkSync(filePath); // 同步刪除檔案
                return res.status(400).json({ success: false, message: "Excel 檔案缺少必要的 modelId 欄位" });
            }
            
            // 將剩下的資料轉為 JSON 物件陣列
            const sheetDataAsJson = XLSX.utils.sheet_to_json(worksheet, {raw: true});


            for (const row of sheetDataAsJson) {
                rowCount++;

                let isComplete = true; // 判斷資料是否完整

                // 再次確認，雖然 sheet_to_json 通常會建立這個屬性
                if (!row.hasOwnProperty('modelId')) {
                    row['modelId'] = ''; // 或提供一個預設值
                }

                // 檢查每一行資料的完整性
                for (const key of excelColumns) {
                    const value = row[key];
                    const isEmpty = value === null || value === undefined || value.toString().trim() === '';
                    if (isEmpty) {
                        isComplete = false;
                        // console.log(`⚠️ modelId=${row['modelId']} 欄位 ${key} 為空`);
                    }
                }

                row['is_cleared'] = isComplete ? "1" : "0"; // 根據每筆資料的完整性設置
                row['fillin_Time'] = moment().locale('zh-tw').format('YYYY-MM-DD HH:mm:ss');
                row['fillin_MemberName'] = memberId;

                chunkData.push(row); // 儲存每一筆資料

                // 每當處理500筆資料時，就批量提交一次資料庫
                if (chunkData.length >= 500) {
                    await processBatch(chunkData, conn);
                    chunkData = []; // 清空已處理的資料
                }
            }
        }

        // 處理剩餘小於500筆的資料
        if (chunkData.length > 0) {
            await processBatch(chunkData, conn);
        }

        // 刪除上傳的暫存檔案
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error(`❌ 刪除暫存檔案失敗: ${filePath}`, err);
            } else {
                console.log(`✅ 成功刪除暫存檔案: ${filePath}`);
            }
        });

        return res.status(200).json({
            success: true,
            message: `資料上傳成功，總筆數=${rowCount}`
        });

    } catch (error) {
        console.error("❌ /uploadExcel 錯誤:", error);
        // 確保在出錯時也刪除檔案
        if(req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error(`❌ 錯誤後刪除暫存檔案失敗: ${req.file.path}`, err);
            });
        }
        return res.status(500).json({
            success: false,
            message: "上傳 Excel 檔案失敗",
            error: error.message
        });
    } finally {
        conn.release(); // 確保釋放資料庫連線
    }
});


router.post("/batchVAHSC_Find", upload.array('file', 10), async (req, res) => {
    const files = req.files || [];

    const conn = await dbmesPromise.getConnection();
    console.log(`📥 /batchVAHSC_Find API 被調用，收到 ${files.length} 個檔案`)
    
    if (files.length === 0){
        conn.release();
        return res.status(404).json({success:false , message:`檔案上傳未成功`});
    }

    try {
        let allModelIds = []; // 儲存所有找到的 modelId
        const processedFiles = []; // 記錄處理過的檔案

        // 處理每一個上傳的檔案
        for (const file of files) {
            console.log(`📄 處理檔案: ${file.originalname}`);
            const filePath = file.path;
            const workbook = XLSX.readFile(filePath);

        for (const sheetName of workbook.SheetNames){
            const worksheet = workbook.Sheets[sheetName];
            
            // 取得所有資料（包含標題列）
            const allRows = XLSX.utils.sheet_to_json(worksheet , {header:1 , raw:true});
            
            if (allRows.length === 0){
                continue; // 如果工作表是空的，跳到下一個
            }

            // 第一列是標題列
            const headerRow = allRows[0];
            
            // 動態找到 modelId 欄位的索引位置
            const modelIdIndex = headerRow.findIndex(col => 
                col && col.toString().toLowerCase().trim() === 'modelid'
            );
            
            if (modelIdIndex === -1){
                continue; // 如果找不到 modelId 欄位，跳過這個工作表
            }

                console.log(`✅ 在 "${file.originalname}" 的工作表 "${sheetName}" 找到 modelId 欄位`);

            // 從第二列開始提取 modelId 資料（跳過標題列）
            for (let i = 1; i < allRows.length; i++){
                const row = allRows[i];
                const modelIdValue = row[modelIdIndex];
                
                // 過濾掉空值或無效值
                if (modelIdValue !== null && modelIdValue !== undefined && modelIdValue !== ''){
                    allModelIds.push(modelIdValue.toString().trim());
                }
                }
            }

            processedFiles.push(file.originalname);
            
            // 刪除上傳的暫存檔案
            fs.unlinkSync(filePath);
        }

        // 檢查是否有找到任何 modelId
        if (allModelIds.length === 0){
            conn.release();
            return res.status(404).json({ 
                success: false, 
                message: "上傳的檔案中沒有找到 modelId 欄位或該欄位沒有資料" 
            });
        }

        // 去除重複的 modelId（如果需要）
        const uniqueModelIds = [...new Set(allModelIds)];

        console.log(`📊 共從 ${processedFiles.length} 個檔案提取 ${allModelIds.length} 筆 modelId 資料（去重後: ${uniqueModelIds.length} 筆）`);
        
        const results = await checkData_FindACIR(uniqueModelIds, conn);
        conn.release();

        // 生成 Excel 檔案
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(results);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
        
        // 儲存到 uploads 資料夾
        const filename = `VAHSC_${Date.now()}.xlsx`;
        const filepath = path.join(__dirname, '../uploads', filename);
        XLSX.writeFile(workbook, filepath);

        return res.status(200).json({
            success: true,
            message: `成功從 ${processedFiles.length} 個檔案提取 ${allModelIds.length} 筆 modelId 資料`,
            downloadUrl: `/download/${filename}`,
            data: {
                totalModelIdsExtracted: allModelIds.length,
                uniqueModelIdsCount: uniqueModelIds.length,
                processedFiles,
                vahscResults: results
            }
        });

    } catch(error){
        console.error("❌ /batchVAHSC_Find 錯誤:", error);
        
        // 確保在出錯時也刪除所有檔案
        if(files && files.length > 0) {
            files.forEach(file => {
                if(file.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        
        if(conn) conn.release();
        
        return res.status(500).json({
            success: false,
            message: "批次查詢 VAHSC 失敗",
            error: error.message
        });
    }
})

// 新增下載路由
router.get("/download/:filename", (req, res) => {
    const filepath = path.join(__dirname, '../uploads', req.params.filename);
    res.download(filepath, (err) => {
        if (!err) fs.unlinkSync(filepath); // 下載後刪除
    });
});




module.exports = router;