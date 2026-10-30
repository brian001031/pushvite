import { get } from "http";

export { };

const axios = require('axios');
const xlsx = require("xlsx");
const moment = require("moment");
require('dotenv').config();

const { prismaMes } = require('../../modules/prismaClients');

const room_Electric = `electrolyte:RnDPickUp`;


const getPythonApiBaseUrl = () => {
    return process.env.PYTHON_API_BASE_URL ?? process.env.REACT_APP_PYTHON_API_BASE_URL ?? 'http://localhost:8000';
};

// 從 roomKey 萃取物料名稱（例如 materialForPickup:electrolyte -> electrolyte）
const getMaterialName = (roomKey: string) => {
    if (!roomKey) return 'default';
    const parts = roomKey.split(':');
    return parts[1] || 'default';
};

// 將 roomKey 對應到 Prisma model 實例 (作為備援)
const getModelByRoomKey = (roomKey: string) => {
    if (!roomKey) return null;
    const materialName = getMaterialName(roomKey);

    if (materialName.toLowerCase() === 'electrolyte') {
        return prismaMes.electrolytehandoversystem;
    }
    return null;
};

// 將資料庫的欄位轉換為前端期待的格式 (同時支援蛇形與駝峰命名)
const mapRowToFrontend = (row: any) => {
    if (!row) return row;
    const stockUsingVal = row.stock_using !== undefined ? row.stock_using : row.stockUsing;
    const stockOriginVal = row.stock_origin !== undefined ? row.stock_origin : row.stockOrigin;
    const timeVal = row.pickupTime || row.pickUpTime;
    return {
        ...row,
        stock_using: stockUsingVal,
        stockUsing: stockUsingVal,
        stock_origin: stockOriginVal,
        stockOrigin: stockOriginVal,
        pickUpTime: timeVal,
        pickupTime: timeVal
    };
};

// ==========================================
// 📅 日期範圍解析與 ZSET 快取控制
// ==========================================

// 解析日期範圍字串（支援 "20260616 20260618"、"2026-06-16~2026-06-18"、"2026/06/16 - 2026/06/18" 等）
const parseDateRange = (keyword: string) => {
    if (!keyword) return null;
    const str = keyword.trim();

    // 正則匹配空格、波浪號、減號、或 "to" 連接的兩個日期
    const rangeRegex = /^(\d{4}[-/]?\d{2}[-/]?\d{2})\s*(?:~|-|to|\s)\s*(\d{4}[-/]?\d{2}[-/]?\d{2})$/i;
    const match = str.match(rangeRegex);
    if (match) {
        const start = match[1].replace(/[-/]/g, ''); // 轉成純數字 "20260616"
        const end = match[2].replace(/[-/]/g, '');   // 轉成純數字 "20260618"
        return { start, end };
    }
    return null;
};

// 取得該日期的開始時間戳記 (Asia/Taipei)
const getTimestampStart = (dateStr: string) => {
    const formatted = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    return new Date(`${formatted}T00:00:00+08:00`).getTime();
};

// 取得該日期的結束時間戳記 (Asia/Taipei)
const getTimestampEnd = (dateStr: string) => {
    const formatted = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    return new Date(`${formatted}T23:59:59+08:00`).getTime();
};

// ZSET 快取的 Key 定義
const REDIS_PREFIX = 'itemTransfer:';
const getZsetKey = (materialName: string) => `${REDIS_PREFIX}${materialName}:zset`;
const getHashKey = (materialName: string) => `${REDIS_PREFIX}${materialName}:data`;

// 當快取冷啟動或資料變更時，預熱/同步 ZSET 快取
const populateZsetCache = async (redis: any, roomKey: string, materialName: string) => {
    const zsetKey = getZsetKey(materialName);
    const hashKey = getHashKey(materialName);

    const model = getModelByRoomKey(roomKey);
    if (!model) return;
    const records = await model.findMany({
        where: {
            status: {
                not: 'delete'
            }
        }
    });

    // 2. 寫入 Redis ZSET (索引) 與 Hash (資料本體)
    const pipeline = redis.multi();
    pipeline.del(zsetKey);
    pipeline.del(hashKey);

    for (const record of records) {
        const mapped = mapRowToFrontend(record);
        const id = String(mapped.id);
        const timeVal = mapped.pickupTime || mapped.createTime || new Date();
        let score = new Date(timeVal).getTime();
        if (isNaN(score)) {
            score = new Date().getTime();
        }

        pipeline.zAdd(zsetKey, { score, value: id });
        pipeline.hSet(hashKey, id, JSON.stringify(mapped));
    }

    await pipeline.exec();
    await redis.expire(zsetKey, 86400); // 快取保留 24 小時
    await redis.expire(hashKey, 86400);
    console.log(`⚡ [Redis] ZSET 與 Hash 快取預熱成功 (已過濾 delete): ${materialName}, 共 ${records.length} 筆`);
};

// 狀態更新時，同步更新 Redis 內的 Hash 與 ZSET（避免整包重新預熱）
const updateRedisRecordStatus = async (redis: any, materialName: string, item: any) => {
    const zsetKey = getZsetKey(materialName);
    const hashKey = getHashKey(materialName);

    if (item.status === 'delete') {
        // 從 Hash 和 ZSET 中移除該 ID
        await redis.hDel(hashKey, String(item.id));
        await redis.zRem(zsetKey, String(item.id));
        console.log(`⚡ [Redis] 狀態為 delete，已從 ZSET 與 Hash 中除名: ID ${item.id}`);
        return;
    }

    const exists = await redis.exists(hashKey);
    if (exists) {
        const raw = await redis.hGet(hashKey, String(item.id));
        if (raw) {
            const current = JSON.parse(raw);
            current.status = item.status;
            if (item.stock_using !== undefined) current.stock_using = item.stock_using;

            const timeVal = item.pickupTime || item.pickup_time || current.pickupTime || current.createTime || new Date();
            let score = new Date(timeVal).getTime();
            if (isNaN(score)) {
                score = new Date().getTime();
            }

            await redis.hSet(hashKey, String(item.id), JSON.stringify(current));
            await redis.zAdd(zsetKey, { score, value: String(item.id) });
        }
    }
};

function bindItemTransferSocketHandlers({ io, redis, roomKey: defaultRoomKey }: any) {
    io.on('connection', (socket: any) => {
        console.log(`🔌 [itemTransfer] 使用者連線: ${socket.id}`);

        // 監聽加入房間
        socket.on('joinRoom', (roomKey: any) => {
            if (roomKey && typeof roomKey === 'string' && (roomKey.startsWith('materialForPickup:') || roomKey.startsWith('electrolyte:'))) {
                socket.join(roomKey);
                socket.data.roomKey = roomKey;
                console.log(`✅ [itemTransfer] ${socket.id} 加入房間: ${roomKey}`);
            }
        });

        // 監聽離開房間
        socket.on('leaveRoom', (roomKey: any) => {
            if (roomKey && typeof roomKey === 'string') {
                socket.leave(roomKey);
                if (socket.data.roomKey === roomKey) {
                    delete socket.data.roomKey;
                }
                console.log(`❌ [itemTransfer] ${socket.id} 離開房間: ${roomKey}`);
            }
        });

        // 監聽搜尋庫存事件
        socket.on('call_search_stock_data', async (payload: any, ack: any) => {
            try {
                const roomKey = socket.data.roomKey || (socket.handshake?.query?.roomKey as string);
                if (!roomKey) {
                    return ack?.({ status: 'error', message: '尚未加入任何物料移轉房間' });
                }

                const materialName = getMaterialName(roomKey);
                const { searchItem = '' } = payload || {};

                // 確保 page 與 pageSize 為正整數，防範 NaN, null, undefined 或字串類型
                let parsedPage = parseInt(payload?.page, 10);
                let parsedPageSize = parseInt(payload?.pageSize, 10);
                if (isNaN(parsedPage) || parsedPage < 1) parsedPage = 1;
                if (isNaN(parsedPageSize) || parsedPageSize < 1) parsedPageSize = 10;

                const skip = (parsedPage - 1) * parsedPageSize;
                const take = parsedPageSize;

                // 判斷是否為「日期範圍搜尋」或是「無關鍵字的初始載入」
                const dateRange = parseDateRange(searchItem);
                const isInitialLoad = !searchItem;

                if (dateRange || isInitialLoad) {
                    // 👉 方案一：使用 Redis ZSET 進行高速範圍搜尋與 SQL 般的 Offset/Limit 分頁
                    const zsetKey = getZsetKey(materialName);
                    const hashKey = getHashKey(materialName);

                    const cacheExists = await redis.exists(zsetKey);
                    if (!cacheExists) {
                        await populateZsetCache(redis, roomKey, materialName);
                    }

                    // 設定分數範圍（若為初始載入，則查詢所有區間 -inf ~ +inf）
                    let minScore: string | number = '-inf';
                    let maxScore: string | number = '+inf';

                    if (dateRange) {
                        const startTs = getTimestampStart(dateRange.start);
                        const endTs = getTimestampEnd(dateRange.end);
                        if (!isNaN(startTs) && !isNaN(endTs)) {
                            minScore = startTs;
                            maxScore = endTs;
                        }
                    }

                    console.log(`[call_search_stock_data] Querying ZSET: ${zsetKey}, maxScore: ${maxScore}, minScore: ${minScore}, LIMIT offset: ${skip}, count: ${take}`);

                    // 運用 ZSET 進行分頁查詢（ZREVRANGEBYSCORE 倒序以相容舊版 Redis，新資料在前；帶入 LIMIT offset count）
                    const ids = await redis.sendCommand([
                        'ZREVRANGEBYSCORE',
                        zsetKey,
                        String(maxScore),
                        String(minScore),
                        'LIMIT',
                        String(skip),
                        String(take)
                    ]);

                    // 取得該範圍內符合的總筆數
                    const totalCount = await redis.zCount(zsetKey, String(minScore), String(maxScore));
                    const totalPage = Math.ceil(totalCount / parsedPageSize);

                    let mappedData = [];
                    if (ids.length > 0) {
                        // 從 Hash 中批次撈取詳細 JSON 資料
                        const rawRecords = await redis.hmGet(hashKey, ids);
                        mappedData = rawRecords.map((raw: string) => raw ? JSON.parse(raw) : null).filter(Boolean);
                    }

                    // console.log(`[Redis ZSET] 命中分頁範圍快取, 筆數: ${mappedData.length}, 總頁數: ${totalPage}`);
                    return ack?.({
                        status: 'success',
                        data: {
                            data: mappedData,
                            totalPage
                        }
                    });
                }

                // 👉 方案二：如果是一般文字模糊搜尋 (如員工姓名、工號)，ZSET 無法直接完成，直接使用 Prisma 查詢
                const model = getModelByRoomKey(roomKey);
                if (!model) {
                    return ack?.({ status: 'error', message: `未知的物料類型: ${roomKey}` });
                }

                const where = {
                    status: {
                        not: 'delete'
                    },
                    OR: [
                        { electrolyteUniqueCode: { contains: searchItem } },
                        { pickUpNumber: { contains: searchItem } },
                        { pickUpName: { contains: searchItem } },
                        { pickupDepartment: { contains: searchItem } },
                        { stockUsing: { contains: searchItem } },
                        { status: { contains: searchItem } },
                        { allocate_barcode_text: { contains: searchItem } }
                    ]
                };

                const totalCount = await model.count({ where });
                const rows = await model.findMany({
                    where,
                    skip,
                    take,
                    orderBy: { id: 'desc' },
                });

                const totalPage = Math.ceil(totalCount / parsedPageSize);
                const freshData = {
                    data: rows.map(mapRowToFrontend),
                    totalPage
                };

                ack?.({
                    status: 'success',
                    data: freshData
                });

            } catch (error: any) {
                console.error('[call_search_stock_data] 錯誤:', error);
                ack?.({ status: 'error', message: '查詢庫存失敗', detail: error?.message });
            }
        });

        // 監聽更新狀態事件（支援單筆或批次更新）
        socket.on('request:ChangeStatus', async (payload: any, ack: any) => {
            try {
                const roomKey = socket.data.roomKey || (socket.handshake?.query?.roomKey as string);
                if (!roomKey) {
                    return ack?.({ status: 'error', message: '尚未加入任何物料移轉房間' });
                }

                const materialName = getMaterialName(roomKey);
                const itemsToUpdate = Array.isArray(payload) ? payload : [payload];
                if (itemsToUpdate.length === 0) {
                    return ack?.({ status: 'error', message: '無可更新的資料' });
                }

                // 直接使用 Prisma 寫入資料庫
                const model = getModelByRoomKey(roomKey);
                if (!model) {
                    return ack?.({ status: 'error', message: `未知的物料類型: ${roomKey}` });
                }

                const updatePromises = itemsToUpdate.map((item: any) => {
                    if (!item.id) return Promise.resolve();
                    return model.update({
                        where: { id: Number(item.id) },
                        data: {
                            status: item.status,
                            stock_using: item.stock_using !== undefined ? item.stock_using : item.stockUsing,
                        }
                    });
                });
                await Promise.all(updatePromises);

                // 更新成功後，增量更新 Redis ZSET 與 Hash 中的資料
                for (const item of itemsToUpdate) {
                    await updateRedisRecordStatus(redis, materialName, item);
                }

                ack?.({ status: 'success', data: true });

                // 4. 廣播通知房間內其他使用者
                io.to(roomKey).emit('stock:updated', {
                    message: '庫存狀態已更新'
                });
            } catch (error: any) {
                console.error('[request:ChangeStatus] 錯誤:', error);
                ack?.({ status: 'error', message: '更新狀態失敗', detail: error?.message });
            } finally {

                const roomKey = socket.data.roomKey || (socket.handshake?.query?.roomKey as string);
                io.to(roomKey).emit('stock:updated', {
                    message: '庫存狀態已更新'
                });
            }
        });
        // downloadExcel 已轉為標準 HTTP REST API (GET/POST /itemTransfer/downloadExcel)，不透過 WebSocket 傳輸大型二進制檔案
    });
}

module.exports = {
    bindItemTransferSocketHandlers
};
