



// 此檔案為測試用 主要是為了抓取全部都有值得資訊!!!!!!!!!!!!!!!!!
const express = require("express");
const router = express.Router();
const moment = require('moment');

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
}// 抓取當月 modelId
const autoGetMachineNo = async () => {
    const currentMonth = moment().format("YYYY/MM");
    // const lastMonth = moment().subtract(1, 'months').format("YYYY/MM");
    console.log(`🔍 autoGetMachineNo 開始查詢，當月: ${currentMonth}`);

    const sql = `
        SELECT DISTINCT TRIM(modelId) AS modelId
        FROM testmerge_cc1orcc2
        WHERE EnddateD LIKE ?
        AND TRIM(modelId) <> '' AND modelId IS NOT NULL
        ORDER BY id
    `;
    const params = [`${currentMonth}%`];

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

// const fetchIdFromTable = async (tableName, idField, fields, batchIds, whereCondition = null) => {

//     const selectCols = [`TRIM(${idField}) AS modelId`, ...fields.map(f => `TRIM(${f}) AS ${f}`)];
//     let sql = `SELECT ${selectCols.join(', ')} FROM ${tableName} WHERE TRIM(${idField}) IN (${batchIds.map(() => '?').join(',')})`;
    
//     // 加入額外的 WHERE 條件
//     if (whereCondition) {
//         sql += ` ${whereCondition}`;
//     }
//     try {
//         const [rows] = await dbmesPromise.query(sql, batchIds);

//         // 標準化查到的資料：確保 modelId 與欄位皆為去空白字串，未定義/NULL 轉為空字串
//         const normalized = rows.map(r => ({
//             modelId: (r.modelId || '').toString().trim(),
//             ...fields.reduce((acc, f) => {
//                 const val = r[f];
//                 acc[f] = val !== undefined && val !== null ? (typeof val === 'string' ? val.trim() : val) : '';
//                 return acc;
//             }, {})
//         }));

//         // 針對未回傳的 modelId，補上 skeleton（每個欄位給空字串）
//         const requestedIds = batchIds.map(id => (id || '').toString().trim()).filter(Boolean);
//         const foundIds = new Set(normalized.map(r => r.modelId).filter(Boolean));
//         const missingIds = requestedIds.filter(id => !foundIds.has(id));

//         if (missingIds.length > 0) {
//             console.warn(`⚠️ fetchIdFromTable 部分/全部查無資料: table=${tableName}, missing=${missingIds.length}/${requestedIds.length}`);
//         }

//         const skeletons = missingIds.map(id => ({
//             modelId: id,
//             ...fields.reduce((acc, f) => { acc[f] = ''; return acc; }, {})
//         }));

//         return [...normalized, ...skeletons];
//     } catch (err) {
//         console.error(`查詢 ${tableName} 時發生錯誤:`, err.message);
//         return [];
//     }
// };


// 保持原本的 mapRowToNewDbFields 函數，用於寫入 dataLost_collection (使用 newDbData 的特殊欄位名)
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
        case 'testmerge_cc1orcc2':
        case 'testmerge_cc1':
        case 'testmerge_cc2':
            Object.keys(row).forEach((k) => {
                if (k === 'modelId') return;
                out[k] = row[k];
            });
            break;
        default:
            Object.keys(row).forEach((k) => {
                if (k === 'modelId') return;
                out[k] = row[k];
            });
    }
    return out;
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

    const conn = await dbmesPromise.query(sql, params)
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

// 新增一個輔助函數：將各資料表的欄位名稱映射到 allData 的鍵（只包含 allDataKeys）
const mapRowToAllDataFields = (tableName, row) => {
    const out = {};
    if (!row) return out;
    
    const allDataKeys = Object.keys(allData);

    Object.keys(row).forEach((k) => {
        if (k === 'modelId') return; 
        
        if (allDataKeys.includes(k)) {
            out[k] = row[k];
        } else {
            // 處理 echk_* 表的特殊情況：它們的欄位名是 PARAM**，與 allData 中的鍵直接匹配
            // 由於 echk_batch 和 echk2_batch 查詢的欄位名稱相同，這裡會用 echk2 的資料覆蓋 echk 的資料
            if (tableName === 'echk_batch' || tableName === 'echk2_batch') {
                if (k === 'PARAM18' || k === 'PARAM19' || k === 'PARAM02') {
                    out[k] = row[k];
                }
            }
        }
    });

    return out;
};

// ===== 自動化匯出已做MODEL API - 最終修正版 (並行處理) =====
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
        let incompleteDataForDB = []; // 儲存不完整資料用於寫入資料庫
        let totalProcessedCount = 0; // 總計已處理的 modelId 數量
        
        const thisMonthQuery = moment().format('YYYY/MM');
        const allTablesMap = { ...fieldMap01, ...fieldMap02, ...otherTables };
        const allDataKeys = Object.keys(allData);

        for (let i = 0; i < chunks.length; i++) {
            const batchIds = chunks[i];
            console.log(`🚀 處理第 ${i + 1}/${chunks.length} 批 (共 ${batchIds.length} 筆) - 並行查詢開始`);
            const batchStartTime = Date.now();
            
            // 1. 並行查詢所有表格 (I/O 密集)
            const queryPromises = Object.keys(allTablesMap).map(async (tableKey) => {
                const tables = allTablesMap[tableKey];
                const { idField, fields, tableName = null, whereCondition = null } = tables;
                const actualTableName = (tableName && typeof tableName === 'string' && tableName.trim() !== '') ? tableName : tableKey;
                
                let dateField = null;
                let dateParams = [];
                // 統一日期過濾條件
                if (actualTableName === 'testmerge_cc1orcc2') {
                    dateField = 'EnddateD';
                    dateParams = [`${thisMonthQuery}%`];
                }
                
                try {
                    const rows = await fetchTableData(actualTableName, idField, fields, batchIds, dateField, dateParams, whereCondition);
                    const dataMap = {};
                    // 由於 ID 等同 modelId, 直接使用 modelId 查詢結果
                    rows.forEach(row => {
                        dataMap[(row.modelId || '').toString().trim()] = row;
                    });
                    
                    console.log(`✅ ${tableKey} (${actualTableName}): 查詢完成，找到 ${rows.length}/${batchIds.length} 筆資料`);
                    return { tableKey, dataMap };
                } catch (error) {
                    console.error(`❌ ${tableKey} (${actualTableName}): 查詢失敗, ${error.message}`);
                    return { tableKey, dataMap: {} };
                }
            });

            const startQueryTime = Date.now();
            const allTableDataMaps = await Promise.all(queryPromises);
            const queryTime = Date.now() - startQueryTime;
            console.log(`📊 所有查詢完成，耗時 ${queryTime}ms`);

            // 2. 並行檢查與整理單批次的資料 (CPU 密集)
            console.log(`🔍 開始並行檢查 ${batchIds.length} 筆資料的完整性...`);
            
            const checkPromises = batchIds.map(modelId => {
                const trimmedModelId = modelId.trim();
                let modelData = {}; // 收集所有資料 for allDataKeys (檢查完整性用)
                let newDbRow = { ...newDbData, modelId: trimmedModelId }; // 收集所有資料 for dataLost_collection
                
                let isComplete = true; 
                let incompleteReason = '';

                // 檢查每個表格的資料
                for (const { tableKey, dataMap } of allTableDataMaps) {
                    const foundRow = dataMap[trimmedModelId];
                    
                    if (foundRow) {
                        // 寫入 newDbRow (含 echk_* 欄位)
                        const mappedFields = mapRowToNewDbFields(tableKey, foundRow);
                        Object.assign(newDbRow, mappedFields);

                        // 寫入 modelData (只含 allData 的欄位，用於檢查完整性)
                        const mappedAllDataFields = mapRowToAllDataFields(tableKey, foundRow);
                        Object.assign(modelData, mappedAllDataFields);
                    }
                }
                
                // 檢查是否所有 allData 的欄位都有非空值
                for (const key of allDataKeys) {
                    const value = modelData[key];
                    if (value === null || value === undefined || (value.toString && value.toString().trim() === '')) {
                        isComplete = false;
                        incompleteReason = `欄位 ${key} 缺失或為空`;
                        break;
                    }
                }
                
                if (isComplete) {
                    // 準備完整資料的輸出格式
                    let orderedData = { modelId: trimmedModelId };
                    allDataKeys.forEach(key => {
                        orderedData[key] = modelData[key] || '';
                    });
                    orderedData.FindTime = moment().locale('zh-tw').format('YYYY-MM-DD HH:mm:ss');
                    return { type: 'complete', data: orderedData };
                } else {
                    // 處理不完整資料
                    newDbRow.dataAllFillIn = 'N';
                    newDbRow.memo = `不完整原因: ${incompleteReason}`;
                    newDbRow.fillin_Time = moment().format("YYYY-MM-DD HH:mm:ss");
                    return { type: 'incomplete', data: newDbRow };
                }
            });

            const checkStartTime = Date.now();
            const results = await Promise.all(checkPromises);
            const checkTime = Date.now() - checkStartTime;
            
            // 3. 收集結果
            let batchCompleteCount = 0;
            let batchIncompleteCount = 0;
            results.forEach(result => {
                if (result.type === 'complete') {
                    completeModels.push(result.data);
                    batchCompleteCount++;
                } else {
                    incompleteDataForDB.push(result.data);
                    batchIncompleteCount++;
                }
            });
            
            totalProcessedCount += batchIds.length;
            const batchTime = Date.now() - batchStartTime;
            const percent = (((i + 1) / chunks.length) * 100).toFixed(2);
            
            console.log(`✅ 第 ${i + 1} 批完成！(檢查耗時 ${checkTime}ms，總耗時 ${batchTime}ms)`);
            console.log(`   - 完整資料: ${batchCompleteCount} 筆，不完整資料: ${batchIncompleteCount} 筆`);
            console.log(`📊 進度：${i + 1}/${chunks.length} 批 (${percent}%)，累積完整資料: ${completeModels.length} 筆\n`);
        }

        console.log(`檢查完成！找到 ${completeModels.length} 筆完整資料的 modelId`);
        
        // 將不完整的資料批次寫入資料庫
        if (incompleteDataForDB.length > 0) {
            console.log(`💾 開始寫入 ${incompleteDataForDB.length} 筆不完整資料到 dataLost_collection...`);
            const dbResult = await lostDataBatchToNewDb(incompleteDataForDB);
            console.log(`✅ 不完整資料寫入完成: 插入/更新 ${dbResult.inserted} 筆，後援更新 ${dbResult.updatedFallback} 筆，共 ${dbResult.batches} 批`);
        }


        if (completeModels.length === 0) {
            return res.json({ success: true, message: "查無完整資料", data: [] });
        }

        // 匯出 CSV - 依照 allData 欄位順序
        const fs = require('fs');
        const filePath = `./complete_models_${moment().format("YYYYMMDD_HHmmss")}.csv`;
        const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });
        
        // 建立標題行（按照 allData 順序）
        const headers = ['modelId', ...allDataKeys, 'FindTime'];
        writeStream.write(headers.join(',') + '\n');
        
        // 寫入資料行
        for (const model of completeModels) {
            const values = headers.map(header => {
                const val = model[header] || '';
                const str = val === null || val === undefined ? '' : String(val);
                // CSV 轉義：包含逗號、換行、引號的欄位需要用雙引號包裹
                if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes(',')) {
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
            } else {
                // 下載成功後刪除檔案
                fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) console.error("刪除匯出檔案錯誤:", unlinkErr);
                });
            }
        });

    } catch (err) {
        console.error("自動化匯出錯誤:", err);
        res.status(500).json({ error: "Server error", detail: err.message });
    }
});




module.exports = router;