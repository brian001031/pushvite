// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // 使用 fs 模組的 Promise 版本，方便非同步操作
const path = require('path');       // 用於處理檔案路徑
require('dotenv').config();         // 載入 .env 檔案中的環境變數

const router = express.Router();
// --- 設定資料檔案的路徑 ---
// 優先從環境變數 DATA_FILE_PATH 讀取路徑。
// 如果環境變數未設定，則預設使用相對於當前檔案 (server.js) 的 'data/data.js' 路徑。
const DATA_FILE_PATH = process.env.DATA_FILE_PATH || path.join(__dirname, 'data', 'data.js');

// --- 輔助函數：讀取指定變數名的物件 ---
/**
 * 讀取 DATA_FILE_PATH 檔案，並解析出指定變數名的物件。
 * @param {string} varName - 要解析的 'export const' 變數名 (例如 'a', 'b', 'group_coating_realtime_a')。
 * @returns {Promise<Object|null>} 解析出的物件內容，如果未找到或解析失敗則返回 null。
 */
async function readSpecificObjectFromFile(varName) {
    try {
        // 讀取整個檔案的內容
        const content = await fs.readFile(DATA_FILE_PATH, 'utf8');
        const regex = new RegExp(`export const ${varName} = ({[\\s\\S]*?});`, 's');
        const match = content.match(regex);
        
        if (match && match[1]) {
            // 如果找到了匹配的物件字串，使用 eval() 將其解析為 JavaScript 物件。
            try {
                return eval(`(${match[1]})`); // 括號 `()` 是為了確保 eval() 將其視為表達式而不是程式碼塊
            } catch (evalError) {
                console.error(`解析變數 '${varName}' 的物件失敗 (eval 錯誤):`, evalError);
                return null; // 解析失敗返回 null
            }
        }
        console.warn(`未在檔案 ${DATA_FILE_PATH} 中找到變數 '${varName}' 的物件。`);
        return null; // 如果未找到匹配的物件，返回 null
    } catch (error) {
        // 處理檔案不存在的錯誤
        if (error.code === 'ENOENT') {
            console.error(`資料檔案不存在: ${DATA_FILE_PATH}`);
            throw new Error(`資料檔案不存在: ${DATA_FILE_PATH}。請確保檔案已創建且路徑正確。`);
        }
        // 處理其他讀取檔案的錯誤
        console.error(`讀取檔案 ${DATA_FILE_PATH} 失敗:`, error);
        throw error;
    }
}

// --- 輔助函數：寫入指定變數名的物件 ---
/**
 * 將更新後的指定物件寫回 DATA_FILE_PATH 檔案。
 * 會保留檔案中其他不相關的內容（例如其他 export 的物件或註解）。
 * @param {string} varName - 要更新的 'export const' 變數名。
 * @param {Object} updatedObject - 帶有更新內容的物件。
 */
async function writeSpecificObjectToFile(varName, updatedObject) {
    try {
        const currentFileContent = await fs.readFile(DATA_FILE_PATH, 'utf8');
        const newObjectString = JSON.stringify(updatedObject, null, 4);
        const exportStatement = `export const ${varName} = ${newObjectString};`;

        // 更強健的正則：包含換行與多重 `}` 等錯誤閉合清除
        const regex = new RegExp(`export const ${varName} = {[^]*?};`, 'gm');

        let updatedFileContent;
        if (regex.test(currentFileContent)) {
            // 取代舊的物件定義
            updatedFileContent = currentFileContent.replace(regex, exportStatement);
            console.log(`變數 '${varName}' 的物件已在檔案中被更新。`);
        } else {
            // 如果未找到，新增到檔案結尾，並保證只新增一次
            updatedFileContent = currentFileContent.trim() + `\n\n${exportStatement}\n`;
            console.warn(`檔案中未找到變數 '${varName}'，將在檔案末尾新增該物件。`);
        }

        await fs.writeFile(DATA_FILE_PATH, updatedFileContent, 'utf8');
        console.log(`資料已成功寫入檔案: ${DATA_FILE_PATH}`);
    } catch (error) {
        console.error(`寫入變數 '${varName}' 的物件到檔案失敗 ${DATA_FILE_PATH}:`, error);
        throw error;
    }
}


router.get('/data/:varName', async (req, res) => {
    const varName = req.params.varName;
    
    try {
        const currentData = await readSpecificObjectFromFile(varName);
        console.log(`接收到請求，獲取變數 '${varName}' 的資料... , 並獲取currentData:`, currentData);
        if (currentData) {
            console.log(`成功獲取變數 '${varName}' 的資料:`, currentData);
            res.json(currentData);
        } else {
            // 如果讀取函數返回 null (表示未找到物件或解析失敗)
            res.status(404).json({ message: `未找到變數 '${varName}' 的物件或檔案內容不符預期。` });
        }
    } catch (error) {
        // 處理讀取檔案或內部錯誤
        res.status(500).json({ message: `無法獲取變數 '${varName}' 的資料`, error: error.message });
    }
});

// --- API 接口：更新特定變數名的資料 ---
router.post('/data/update-data/:varName', async (req, res) => {
    const varName = req.params.varName;
    const incomingData = req.body; 

    console.log(`接收到請求，更新變數 '${varName}' 的資料...`, incomingData);

    try {
        let currentData = await readSpecificObjectFromFile(varName);
        // console.log(`讀取到變數 '${varName}' 的現有資料:`, currentData);

        if (!currentData) {
            currentData = {}; // 如果檔案中沒有這個物件，則從空物件開始更新
            console.warn(`檔案中未找到變數 '${varName}' 的物件，將從空物件開始更新或新增。`);
        }

        let changed = false; // 標記資料是否有實際變動
        
        if (!incomingData) {
            console.error(`請求體中未包含Body資料 (dataReference)。`);
        }

         if (JSON.stringify(currentData) !== JSON.stringify(incomingData)) {
            // 如果不同，則直接用新的資料覆蓋舊的資料
            // 這樣可以確保檔案中的 'change_edge_field' 會變成新的 'newReferenceData' 結構
            currentData = incomingData;
            changed = true;
            // console.log(`資料變動：變數 '${varName}' 的內容已更新`);
        } else {
            // console.log(`資料無變動：變數 '${varName}' 的內容與現有檔案內容相同`);
        }
        // --- 您提到的「不相同新增，相同蓋掉」邏輯已實現 ---
        // 上述迴圈已經處理了：
        // - 如果傳入資料的 key 在舊資料中不存在，則新增。
        // - 如果傳入資料的 key 在舊資料中存在但 value 不同，則覆蓋。
        // - 如果傳入資料的 key 在舊資料中存在且 value 相同，則不做任何事 (changed 保持 false)。

        // --- 如果您還需要處理「傳入資料中不存在，但舊資料中有的 key 則刪除」的邏輯，可以加上以下程式碼塊：
        for (const key in currentData) {
            if (Object.hasOwnProperty.call(currentData, key) && !Object.hasOwnProperty.call(incomingData, key)) {
                delete currentData[key]; // 從舊資料中刪除這個 key
                changed = true;
                console.log(`資料變動：變數 '${varName}' 的 Key "${key}" 被刪除`);
            }
        }

        if (changed) {
            // 如果有任何變動，才將更新後的物件寫回檔案
            await writeSpecificObjectToFile(varName, currentData);
            res.json({ message: `變數 '${varName}' 的資料已更新並寫入檔案`, updatedData: currentData });
        } else {
            // 如果沒有任何變動，則不寫入檔案，直接返回訊息
            res.json({ message: `變數 '${varName}' 的資料無變動`, currentData: currentData });
        }

    } catch (error) {
        console.error(`更新變數 '${varName}' 資料失敗:`, error);
        res.status(500).json({ message: `更新變數 '${varName}' 資料失敗`, error: error.message });
    }
});



module.exports = router;