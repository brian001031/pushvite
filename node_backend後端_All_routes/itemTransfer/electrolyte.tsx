import { json } from "body-parser";
import { group } from "console";
import { create } from "domain";
import moment from 'moment-timezone';


const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");
const jwt = require("jsonwebtoken");
const xlsx = require("xlsx");

const { getSocketServer } = require('../../modules/socketServer');
const redisClient = require(__dirname + "/../../modules/redisConnect.js"); // Redis 連線模組
const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const { prismaHr, prismaMes } = require('../../modules/prismaClients');
const roomName = `Ingredients_EachDepartment_management_room`

// 抓取 原料領取 :
const getElectronicMaterial = async () => {

    let checkToSetIntoElectric = []

    try {
        const prismaMES = prismaMes
        const getData = await prismaMES.ErpMaterialPickUpEach.findMany({
            where: {
                pickUp_Department: {
                    contains: '研發'
                },
                iscostover: 0,
            }
        })

        const redis = redisClient;
        const getRedisData = await redis.get(roomName);
        if (!getRedisData) return {}

        const parseData = JSON.parse(getRedisData);

        Array.isArray(parseData) && parseData.map((item: any) => {
            if (item.pickupDepartment.includes('研發')) {
                checkToSetIntoElectric.push(item)
            }
        })



        return getData



    } catch (error: any | undefined) {
        console.error("getElectronicMaterial Error:", error);
        return {
            status: 'error',
            data: [],
            message: 'Connect to Database Error'
        }
    }
}

const insertIntoData_RnDtoOp = async (payload: any) => {

    const {
        electrolyteUniqueCode,
        electrolyteCapacity,
        electrolyteMemo,
        createDepartment,
        createTime,
        createNumber,
        createName,
        stock_origin,
        status
    } = payload

    const targetCode = typeof electrolyteUniqueCode === 'string' ? electrolyteUniqueCode.trim() : '';

    try {
        const createTimeVal = createTime instanceof Date ? createTime : (createTime ? new Date(createTime) : new Date());
        const result = await prismaMes.electrolytehandoversystem.create({
            data: {
                electrolyteUniqueCode: targetCode,
                electrolyteCapacity: electrolyteCapacity !== undefined && electrolyteCapacity !== null ? String(electrolyteCapacity) : '1',
                electrolyteMemo: (typeof electrolyteMemo === 'string' ? electrolyteMemo.trim() : '') || '',
                createDepartment: (typeof createDepartment === 'string' ? createDepartment.trim() : '') || '研發一處',
                createTime: isNaN(createTimeVal.getTime()) ? new Date() : createTimeVal,
                createNumber: createNumber ?? '',
                createName: createName ?? '',
                stock_origin: (typeof stock_origin === 'string' ? stock_origin.trim() : '') || '研發',
                stock_using: '',
                status: status || 'create'
            }
        });

        return {
            status: 'success',
            data: result,
            message: 'Insert success'
        };

    } catch (error: any | null) {
        console.log('error', error.message)
        return {
            status: 'error',
            data: null,
            message: error.message || 'Connect to Database Error'
        }
    }
}

router.get('/checkNowUseFunction', async (req: any, res: any) => {

    try {

        const data = await getElectronicMaterial()

        console.log('確認一下 data :', data)
        return res.status(200).json({
            status: 'success',
            data: data,
            message: 'Get Electronic Material Success'
        });

    } catch (error: any | undefined) {
        return res.status(500).json({
            status: 'error',
            message: 'Test function failed',
            data: []
        });
    }
})



router.get('/FindEmpData', async (req, res) => {
    const empNo = req.query.empNo as string
    console.log(empNo);


    try {
        const hr = prismaHr
        const result = await hr.ScheduleRegInfo.findMany({
            where: {
                memberID: empNo
            }
        });

        res.status(200).json({ success: true, data: result });

    } catch (error: any) {
        console.error("FindEmpData Error:", error);
        res.status(500).json({
            message: 'network error'
        });
    }
});

router.post('/InsertPickupData', async (req, res) => {
    const data = req.body;
    console.log(data);
    const mes = prismaMes;
    try {
        const qrCode = typeof data.qrCode === 'string' ? data.qrCode.trim() : '';
        if (!qrCode) {
            return res.status(400).json({
                status: 'error',
                message: '請輸入電解液唯一碼 (Please enter the electrolyte unique code)'
            });
        }

        const existing = await mes.electrolytehandoversystem.findUnique({
            where: { electrolyteUniqueCode: qrCode }
        });

        // 嚴格防呆：OP 不可隨意領取未建立的物料！
        if (!existing) {
            console.warn(`⚠️ [InsertPickupData] 領料阻擋: 條碼 [${qrCode}] 不存在（未由研發入庫建立）`);
            return res.status(400).json({
                status: 'error',
                message: `電解液唯一碼 [${qrCode}] 尚未由研發建立入庫，現場無法領取！ (Electrolyte code [${qrCode}] has not been stocked by R&D and cannot be picked up!)`
            });
        }

        // 防呆：防止重複領取
        if (existing.status === 'using' || existing.pickupTime) {
            console.warn(`⚠️ [InsertPickupData] 領料阻擋: 條碼 [${qrCode}] 已被領取過`);
            return res.status(400).json({
                status: 'error',
                message: `電解液唯一碼 [${qrCode}] 已於先前被領取（領取人: ${existing.pickUpName || existing.pickUpNumber || '未知'}），請勿重複領取！ (Electrolyte code [${qrCode}] has already been picked up by [${existing.pickUpName || existing.pickUpNumber || 'Unknown'}], please do not duplicate!)`
            });
        }

        const pickupDate = data.nowTime ? new Date(data.nowTime) : new Date();

        // 僅更新研發已建立的該筆電解液資料，填入 OP 領料資訊
        const result = await mes.electrolytehandoversystem.update({
            where: { id: existing.id },
            data: {
                pickupDepartment: data.department || '',
                pickUpNumber: data.empNo || '',
                pickUpName: data.empName || '',
                pickupTime: pickupDate,
                stock_using: data.floor || '',
                status: data.status || 'using'
            }
        });
        console.log(`⚡ [DB] 電解液領料更新成功: ID ${result.id}, 唯一碼 ${qrCode}`);
        // 1. 同步更新 Redis 中的 ZSET 與 Hash 快取
        try {
            const redis = require('../../modules/redisConnect.js');
            const zsetKey = 'itemTransfer:electrolyte:zset';
            const hashKey = 'itemTransfer:electrolyte:data';

            const mapped = {
                id: result.id,
                electrolyteUniqueCode: result.electrolyteUniqueCode,
                pickupDepartment: result.pickupDepartment,
                pickUpNumber: result.pickUpNumber,
                pickUpName: result.pickUpName,
                pickupTime: result.pickupTime,
                pickUpTime: result.pickupTime,
                stockUsing: result.stock_using,
                stock_using: result.stock_using,
                stockOrigin: result.stock_origin,
                stock_origin: result.stock_origin,
                status: result.status,
                createTime: result.createTime,
                createNumber: result.createNumber,
                createName: result.createName,
                electrolyteCapacity: result.electrolyteCapacity,
                electrolyteMemo: result.electrolyteMemo
            };
            const score = new Date(result.pickupTime || result.createTime || new Date()).getTime();
            await redis.hSet(hashKey, String(result.id), JSON.stringify(mapped));
            await redis.zAdd(zsetKey, { score, value: String(result.id) });
            console.log(`⚡ [Redis] REST 領料資料同步快取成功: ID ${result.id}`);

        } catch (redisErr) {
            console.error("InsertPickupData Redis Sync Error:", redisErr);
        }

        // 2. 透過 Socket 廣播通知其他在線使用者更新 UI (發送至 /itemTransfer 命名空間)
        try {
            const { getSocketServer } = require('../../modules/socketServer');
            const io = getSocketServer();
            if (io) {
                io.of('/itemTransfer').to('materialForPickup:electrolyte').emit('stock:updated', { message: '有新領料資料已新增 / New pickup record added' });
                console.log('⚡ [Socket] 已成功廣播 stock:updated 至 /itemTransfer 命名空間');
            }
        } catch (socketErr) {
            console.error("InsertPickupData Socket Broadcast Error:", socketErr);
        }

        res.status(200).json({
            success: true,
            data: result,
            message: '電解液領料成功 (Electrolyte pickup successful)'
        });
    } catch (error: any) {
        console.error("InsertPickupData Error:", error);
        res.status(500).json({
            status: 'error',
            message: `領料處理失敗 (Pickup process failed): ${error.message}`
        });
    }
});

// ==========================================
// 匯出庫存 Excel (REST CRUD API)
// ==========================================
const handleDownloadExcel = async (req: any, res: any) => {
    try {
        const searchItem = (req.body?.searchItem || req.query?.searchItem || '').trim();

        // 解析日期範圍字串（支援 "20260616 20260618"、"2026-06-16~2026-06-18"、"2026/06/16 - 2026/06/18" 等）
        const rangeRegex = /^(\d{4}[-/]?\d{2}[-/]?\d{2})\s*(?:~|-|to|\s)\s*(\d{4}[-/]?\d{2}[-/]?\d{2})$/i;
        const match = searchItem.match(rangeRegex);

        let where: any = {
            status: { not: 'delete' }
        };

        if (match) {
            const startStr = match[1].replace(/[-/]/g, '');
            const endStr = match[2].replace(/[-/]/g, '');
            const startFormatted = `${startStr.substring(0, 4)}-${startStr.substring(4, 6)}-${startStr.substring(6, 8)}`;
            const endFormatted = `${endStr.substring(0, 4)}-${endStr.substring(4, 6)}-${endStr.substring(6, 8)}`;
            const startDate = new Date(`${startFormatted}T00:00:00+08:00`);
            const endDate = new Date(`${endFormatted}T23:59:59+08:00`);

            where.createTime = { gte: startDate, lte: endDate };
        } else if (searchItem) {
            where.OR = [
                { electrolyteUniqueCode: { contains: searchItem } },
                { pickUpNumber: { contains: searchItem } },
                { pickUpName: { contains: searchItem } },
                { pickupDepartment: { contains: searchItem } },
                { stock_using: { contains: searchItem } },
                { status: { contains: searchItem } },
            ];
        }

        const rows = await prismaMes.electrolytehandoversystem.findMany({
            where,
            orderBy: { id: 'desc' },
        });

        if (rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: '查無資料，無法下載 (No data found, cannot download)'
            });
        }

        const excelRows = rows.map((row: any) => ({
            '電解液唯一碼': row.electrolyteUniqueCode ?? '',
            '電解液容量': row.electrolyteCapacity ?? '',
            '製作部門': row.createDepartment ?? '',
            '製作人員': row.createName ?? '',
            '製作時間': row.createTime ? moment(row.createTime).format('YYYY-MM-DD HH:mm:ss') : '',
            '領料部門': row.pickupDepartment ?? '',
            '領料人員': row.pickUpName ?? '',
            '領料時間': row.pickupTime ? moment(row.pickupTime).format('YYYY-MM-DD HH:mm:ss') : '',
            '原庫存位置': row.stock_origin ?? row.stockOrigin ?? '',
            '現庫存位置': row.stock_using ?? row.stockUsing ?? '',
            '狀態': row.status ?? ''
        }));

        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(excelRows);

        // 合併第一欄（電解液唯一碼）相同的值
        const merges: any[] = [];
        let startRowIndex = 1;
        while (startRowIndex < excelRows.length + 1) {
            let endRowIndex = startRowIndex;
            const val = excelRows[startRowIndex - 1]['電解液唯一碼'];
            if (val) {
                while (endRowIndex < excelRows.length && excelRows[endRowIndex]['電解液唯一碼'] === val) {
                    endRowIndex++;
                }
                if (endRowIndex > startRowIndex) {
                    merges.push({
                        s: { r: startRowIndex, c: 0 },
                        e: { r: endRowIndex, c: 0 }
                    });
                }
            }
            startRowIndex = endRowIndex + 1;
        }
        worksheet['!merges'] = merges;

        const colWidths = [
            { wpx: 180 }, // 電解液唯一碼
            { wpx: 100 }, // 電解液容量
            { wpx: 100 }, // 製作部門
            { wpx: 100 }, // 製作人員
            { wpx: 150 }, // 製作時間
            { wpx: 100 }, // 領料部門
            { wpx: 100 }, // 領料人員
            { wpx: 150 }, // 領料時間
            { wpx: 120 }, // 原庫存位置
            { wpx: 120 }, // 現庫存位置
            { wpx: 100 }  // 狀態
        ];
        worksheet['!cols'] = colWidths;

        xlsx.utils.book_append_sheet(workbook, worksheet, '庫存記錄');
        const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const filename = `庫存記錄_${moment().format('YYYYMMDD_HHmmss')}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
        return res.status(200).send(excelBuffer);

    } catch (error: any) {
        console.error('[downloadExcel] 錯誤:', error);
        return res.status(500).json({
            status: 'error',
            message: `下載 Excel 失敗 (Download Excel failed): ${error.message}`
        });
    }
};

router.post('/downloadExcel', handleDownloadExcel);
router.get('/downloadExcel', handleDownloadExcel);

// ==========================================
// 研發領料 (RnDPickUp) Redis 快取同步與刪除輔助
// ==========================================
const RND_ZSET_KEY = 'itemTransfer:electrolyte:RnDPickUp:zset';
const RND_HASH_KEY = 'itemTransfer:electrolyte:RnDPickUp:data';

// 將 ErpMaterialPickUpEach 記錄批次推送至 Redis (ZSET + Hash)
const syncRnDPickUpRecordsToRedis = async (records: any[]) => {
    if (!records || records.length === 0) return;
    const redis = redisClient;
    const pipeline = redis.multi();

    for (const item of records) {
        const id = String(item.id);
        const score = new Date(item.pickUp_Time || item.assign_datetime || new Date()).getTime();
        pipeline.zAdd(RND_ZSET_KEY, { score: isNaN(score) ? Date.now() : score, value: id });
        pipeline.hSet(RND_HASH_KEY, id, JSON.stringify(item));
    }

    await pipeline.exec();
};

// 檢查是否有新的更新，若快取不存在或資料庫有新記錄，則自動撈取並推送到 Redis
const checkAndSyncRnDPickUpCache = async () => {
    try {
        const redis = redisClient;
        const cacheExists = await redis.exists(RND_ZSET_KEY);

        if (!cacheExists) {
            // 1. 快取未建立（冷啟動）：將研發部門未結案的資料全數預熱進 Redis
            const allRecords = await prismaMes.ErpMaterialPickUpEach.findMany({
                where: {
                    pickUp_Department: {
                        contains: '研發'
                    },
                    iscostover: 0,
                },
                orderBy: { id: 'desc' },
            });
            console.log(`⚡ [Redis] RnDPickUp 冷啟動預熱，自資料庫撈取到 ${allRecords.length} 筆未結案資料`);
            await syncRnDPickUpRecordsToRedis(allRecords);
            if (allRecords.length > 0) {
                await redis.expire(RND_ZSET_KEY, 86400);
                await redis.expire(RND_HASH_KEY, 86400);
                console.log(`⚡ [Redis] RnDPickUp 預熱成功，已寫入 ${RND_ZSET_KEY} (${allRecords.length} 筆)`);
            }
            return;
        }

        // 2. 快取已存在：比對資料庫總數與 Redis 快取總數，若有新資料則增量同步
        const dbTotalCount = await prismaMes.ErpMaterialPickUpEach.count({
            where: {
                pickUp_Department: {
                    contains: '研發'
                },
                product_name: {
                    contains: '電解液'
                },
                iscostover: 0,
            },
        });
        const cacheTotalCount = await redis.zCount(RND_ZSET_KEY, '-inf', '+inf');

        if (dbTotalCount > cacheTotalCount) {
            const diffCount = dbTotalCount - cacheTotalCount;
            const newRecords = await prismaMes.ErpMaterialPickUpEach.findMany({
                where: {
                    pickUp_Department: {
                        contains: '研發'
                    },
                    product_name: {
                        contains: '電解液'
                    },
                    iscostover: 0,
                },
                orderBy: { id: 'desc' },
                take: diffCount,
            });
            console.log(`⚡ [Redis] RnDPickUp 增量同步 ${newRecords.length} 筆新資料`);
            await syncRnDPickUpRecordsToRedis(newRecords);
        }
    } catch (err: any) {
        console.error("⚡ [Redis] checkAndSyncRnDPickUpCache 執行失敗:", err?.message || err);
    }
};

// 同步自 Redis 快取移除指定資料，並發送 Socket 廣播通知
const syncDeleteRnDPickUpFromRedis = async (id: number | string) => {
    const redis = redisClient;
    const idStr = String(id);
    await redis.hDel(RND_HASH_KEY, idStr);
    await redis.zRem(RND_ZSET_KEY, idStr);

    try {
        const { getSocketServer } = require('../../modules/socketServer');
        const io = getSocketServer();
        if (io) {
            io.of('/itemTransfer').to('electrolyte:RnDPickUp').emit('RnDPickUp:update', { action: 'delete', id: idStr });
        }
    } catch (e) {
        console.error("Socket broadcast error on delete:", e);
    }
};

router.get('/RnDPickUp', async (req: any, res: any) => {
    try {
        const { startDate, endDate, page, pageSize, searchKey } = req.query;

        if (searchKey) {
            try {
                const pageNum = Number(page) || 1;
                const pageSizeNum = Number(pageSize) || 20;

                const result = await prismaMes.ErpMaterialPickUpEach.findMany({
                    where: {
                        pickUp_Department: {
                            contains: '研發'
                        },
                        product_name: {
                            contains: '電解液'
                        },
                        iscostover: 0,
                        allocate_barcode_text: {
                            contains: String(searchKey)
                        }
                    },
                    orderBy: { id: 'desc' },
                    skip: (pageNum - 1) * pageSizeNum,
                    take: pageSizeNum,
                });

                // 搜尋到的資料同步推送/補入 Redis 快取中
                await syncRnDPickUpRecordsToRedis(result);

                return res.status(200).json({
                    status: 'success',
                    data: result,
                    message: 'Get RnDPickUp Data Success'
                });
            } catch (error: any | null) {
                return res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        } else if (searchKey === '' || searchKey === null || !searchKey) {
            try {
                // 檢查是否有新資料更新，若有則自動從 DB 抓取並推送進 Redis
                await checkAndSyncRnDPickUpCache();

                const redis = redisClient;
                const pageNum = Number(page) || 1;
                const pageSizeNum = Number(pageSize) || 20;
                const skip = (pageNum - 1) * pageSizeNum;
                const take = pageSizeNum;

                // 支援日期範圍篩選（依時間戳記 Score 查詢，預設為 -inf ~ +inf）
                let minScore: string | number = '-inf';
                let maxScore: string | number = '+inf';

                if (startDate) {
                    const startTs = moment(startDate).startOf('day').valueOf();
                    if (!isNaN(startTs)) minScore = startTs;
                }
                if (endDate) {
                    const endTs = moment(endDate).endOf('day').valueOf();
                    if (!isNaN(endTs)) maxScore = endTs;
                }

                // 1. 透過 ZSET 依照 Score 倒序 (新到舊) 進行分頁查詢 Member (即 IDs)
                const ids = await redis.sendCommand([
                    'ZREVRANGEBYSCORE',
                    RND_ZSET_KEY,
                    String(maxScore),
                    String(minScore),
                    'LIMIT',
                    String(skip),
                    String(take)
                ]);

                // 2. 取得範圍內符合的總筆數
                const totalCount = await redis.zCount(RND_ZSET_KEY, String(minScore), String(maxScore));
                const totalPage = Math.ceil(totalCount / pageSizeNum);

                // 3. 透過 hmGet 向 Hash 批次撈取詳細 JSON 資料
                let pageData: any[] = [];
                if (ids && ids.length > 0) {
                    const rawRecords = await redis.hmGet(RND_HASH_KEY, ids);
                    pageData = rawRecords
                        .filter(Boolean)
                        .map((raw: string) => JSON.parse(raw));
                }

                return res.status(200).json({
                    status: 'success',
                    data: pageData,
                    totalCount,
                    totalPage,
                    message: 'Get RnDPickUp Data Success'
                });
            } catch (error: any | null) {
                return res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        }
    } catch (error: any) {
        console.error("RnDPickUp Error:", error);
        return res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// 刪除 / 結案研發領料資料，並同步自 Redis 快取中除名與廣播 Socket
router.delete('/RnDPickUp/:id', async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const targetId = Number(id);

        if (!targetId) {
            return res.status(400).json({ status: 'error', message: 'Invalid ID' });
        }

        // 1. 資料庫更新為結案 (iscostover = 1)
        await prismaMes.ErpMaterialPickUpEach.update({
            where: { id: targetId },
            data: {
                iscostover: 1,
                iscostover_Time: new Date()
            }
        });

        // 2. 同步自 Redis 快取移除 (Hash & ZSET) 並廣播通知
        await syncDeleteRnDPickUpFromRedis(targetId);

        return res.status(200).json({
            status: 'success',
            message: `RnDPickUp ID ${targetId} 已成功結案/刪除，並同步自快取移除`
        });
    } catch (error: any) {
        console.error("Delete RnDPickUp Error:", error);
        return res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

router.post('/postSendElectrolyte', async (req: any, res: any) => {
    try {
        const payload = req.body?.payload || req.body || req.query || {};
        console.log('⚡ [PostSendElectrolyte] 收到 payload:', payload);

        const {
            electrolyteUniqueCode,
            electrolyteCapacity,
            electrolyteMemo,
            createDepartment,
            createTime,
            createNumber,
            createName,
            stock_origin,
            status
        } = payload;

        const targetCode = typeof electrolyteUniqueCode === 'string' ? electrolyteUniqueCode.trim() : '';
        if (!targetCode) {
            return res.status(400).json({
                status: 'error',
                message: '缺少電解液唯一碼 (Missing electrolyte unique code)'
            });
        }

        // 1. 檢查是否已存在相同唯一碼
        const existing = await prismaMes.electrolytehandoversystem.findUnique({
            where: { electrolyteUniqueCode: targetCode ?? '' }
        });
        if (existing) {
            return res.status(400).json({
                status: 'error',
                message: `電解液唯一碼 [${targetCode}] 已存在，請勿重複入庫 (Electrolyte code [${targetCode}] already exists, please do not re-stock)`,
                data: existing
            });
        }

        // 2. 嘗試尋找對應的研發領料 (ErpMaterialPickUpEach)，若有匹配則在入庫成功後自動結案
        const matchingRnD = await prismaMes.ErpMaterialPickUpEach.findFirst({
            where: {
                allocate_barcode_text: targetCode,
                pickUp_Department: {
                    contains: '研發'
                },
                iscostover: 0
            }
        });

        try {
            // 3. 指數退避 (Exponential Backoff) 重試機制執行入庫
            const maxRetry = 5;
            const baseDelay = 1000; // 基礎延遲 1 秒
            let retryCount = 0;
            let responseDataInsert: any = await insertIntoData_RnDtoOp(payload);

            while (responseDataInsert?.status === 'error' && retryCount < maxRetry) {
                retryCount++;
                // 指數退避延遲: baseDelay * 2^(retryCount - 1) + 隨機微小抖動 (jitter)
                const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount - 1), 16000) + Math.floor(Math.random() * 200);
                console.warn(`⚠️ [PostSendElectrolyte] 入庫失敗，啟動第 ${retryCount}/${maxRetry} 次重試，退避延遲 ${exponentialDelay}ms... 原因: ${responseDataInsert.message}`);
                await new Promise(resolve => setTimeout(resolve, exponentialDelay));
                responseDataInsert = await insertIntoData_RnDtoOp(payload);
            }

            if (responseDataInsert?.status === 'error') {
                return res.status(500).json({
                    status: 'error',
                    message: `電解液入庫失敗 (已達最大重試次數 ${maxRetry} 次): ${responseDataInsert.message} (Electrolyte stocking failed: max retries reached)`
                });
            }

            const result = responseDataInsert.data;

            // 4. 若有對應的研發領料 (ErpMaterialPickUpEach)，則標記結案並自快取移除
            if (matchingRnD) {
                try {
                    await prismaMes.ErpMaterialPickUpEach.update({
                        where: { id: matchingRnD.id },
                        data: {
                            iscostover: 1,
                            iscostover_Time: new Date()
                        }
                    });
                    await syncDeleteRnDPickUpFromRedis(matchingRnD.id);
                    console.log(`⚡ [ErpMaterialPickUpEach] 料號 ${targetCode} (ID: ${matchingRnD.id}) 已同步結案並移出快取`);
                } catch (rndErr) {
                    console.error("PostSendElectrolyte RnD matching error:", rndErr);
                }
            }

            // 5. 同步寫入 Redis 快取 (ZSET 與 Hash)
            try {
                const zsetKey = 'itemTransfer:electrolyte:zset';
                const hashKey = 'itemTransfer:electrolyte:data';

                const mapped = {
                    id: result.id,
                    electrolyteUniqueCode: result.electrolyteUniqueCode,
                    pickupDepartment: result.pickupDepartment,
                    pickUpNumber: result.pickUpNumber,
                    pickUpName: result.pickUpName,
                    pickupTime: result.pickupTime,
                    pickUpTime: result.pickupTime,
                    stockUsing: result.stock_using,
                    stock_using: result.stock_using,
                    stockOrigin: result.stock_origin,
                    stock_origin: result.stock_origin,
                    status: result.status,
                    createTime: result.createTime,
                    createNumber: result.createNumber,
                    createName: result.createName,
                    electrolyteCapacity: result.electrolyteCapacity,
                    electrolyteMemo: result.electrolyteMemo
                };
                const score = new Date(result.createTime || new Date()).getTime();
                await redisClient.hSet(hashKey, String(result.id), JSON.stringify(mapped));
                await redisClient.zAdd(zsetKey, { score, value: String(result.id) });
                console.log(`⚡ [Redis] 電解液入庫同步快取成功: ID ${result.id}`);
            } catch (redisErr) {
                console.error("PostSendElectrolyte Redis Sync Error:", redisErr);
            }

            // 3. 透過 Socket.IO 廣播更新通知給前端 (materialForPickup:electrolyte)
            try {
                const io = getSocketServer();
                if (io) {
                    io.of('/itemTransfer').to('materialForPickup:electrolyte').emit('stock:updated', {
                        message: '有新電解液已入庫 / New electrolyte stocked',
                        data: result
                    });
                    console.log('⚡ [Socket] 已成功廣播 stock:updated 至 /itemTransfer 命名空間');
                }
            } catch (socketErr) {
                console.error("PostSendElectrolyte Socket Broadcast Error:", socketErr);
            }

            return res.status(200).json({
                status: 'success',
                data: result,
                message: '電解液入庫成功 (Electrolyte stocking successful)'
            });

        } catch (error: any | null) {
            console.log('error message about insert from RnD to OP', error.message);
            return res.status(500).json({
                status: 'error',
                message: `${error.message || '電解液入庫處理失敗'} (Electrolyte stocking process failed)`
            });
        }

    } catch (error: any) {
        console.error("PostSendElectrolyte Error:", error);
        return res.status(500).json({
            status: 'error',
            message: `${error.message || '電解液入庫處理失敗'} (Electrolyte stocking process failed)`
        });
    }
});


module.exports = router;
module.exports.syncDeleteRnDPickUpFromRedis = syncDeleteRnDPickUpFromRedis;
module.exports.syncRnDPickUpRecordsToRedis = syncRnDPickUpRecordsToRedis;
module.exports.checkAndSyncRnDPickUpCache = checkAndSyncRnDPickUpCache;

// 伺服器啟動時自動預熱一次 RnDPickUp 快取至 Redis
setTimeout(() => {
    checkAndSyncRnDPickUpCache().catch(err => {
        console.error("⚡ [Redis] RnDPickUp 模組啟動自動預熱失敗:", err);
    });
}, 1500);