import moment from 'moment-timezone';
import { z } from 'zod'


const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");

const envPath = path.resolve(__dirname, "../../.env");
require("dotenv").config({ path: envPath });

const dbmes = require(__dirname + "/../../modules/mysql_connect_mes.js"); // mes 資料庫
const dbcon = require(__dirname + "/../../modules/mysql_connect.js");     // hr 資料庫

const { PrismaClient: HrClient } = require('../../generated/hr');
const { PrismaClient: MesClient } = require('../../generated/mes');

export const prismaHr = new HrClient();
export const prismaMes = new MesClient();

const redisClient = require(__dirname + "/../../modules/redisConnect.js"); // Redis 連線模組

const ENGINEER_SETTING_CACHE_TTL_SECONDS = 60 * 60 * 24;

export const IngredientsUserPermissionSchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    searchTransferNo: z.string().optional(),
    userNumber: z.string().optional().default(''),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(10)
})

// 快取 Map 與 進行中請求對應 Map (TTL = 5 秒)
interface MaterialRequestCacheItem {
    timestamp: number;
    data: any;
}
const receivedMaterialCache = new Map<string, MaterialRequestCacheItem>();
const pendingMaterialRequests = new Map<string, Promise<any>>();
const MATERIAL_REQUEST_TTL_MS = 5000;

// 輔助函式：Sleep 延遲
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getPythonApiBaseUrl = () => {
    return process.env.PYTHON_API_BASE_URL ?? process.env.REACT_APP_PYTHON_API_BASE_URL ?? 'http://localhost:8000';
}

export const getPythonApiUrl = (endpoint: string) => {
    const baseUrl = getPythonApiBaseUrl();
    return `${baseUrl}${endpoint}`;
}

// 未領取倉庫物料預熱 (Pre-warning / Pre-heat 快取)
const REDIS_PICKUP_PREFIX = 'ingredients:GetPickup:Warehouse:';
export const getPickupZsetKey = () => `${REDIS_PICKUP_PREFIX}zset`;
export const getPickupZdataKey = () => `${REDIS_PICKUP_PREFIX}zdata`;
export const redisHashKey = `${REDIS_PICKUP_PREFIX}zdata`;


// 模組層級的 Single-Flight (搭便車) 與 Debounce (防抖) 狀態控管
let inFlightPreheatPromise: Promise<any[]> | null = null;
let preheatDebounceTimer: NodeJS.Timeout | null = null;

export class PickedIngredientsPreheat {
    /**
     * 執行未領取物料快取預熱 (Pre-warning 機制)
     * 🚀【搭便車 (Single-Flight)】：若當前已有正在執行的同步任務，直接共用 Promise，避免重複擊穿資料庫
     * @param redis node-redis 用戶端實例
     */
    static async pushPreheat(redis: any): Promise<any[]> {
        if (!redis) {
            console.warn('[PickedIngredientsPreheat] Redis 用戶端未傳入，無法執行預熱');
            return [];
        }

        // 若已有任務正在進行，立即「搭便車」共用進行中的 Promise
        if (inFlightPreheatPromise) {
            console.log('[PickedIngredientsPreheat] 偵測到已有進行中的 prewarning 任務，啟動「搭便車 (Single-Flight)」機制共用結果');
            return inFlightPreheatPromise;
        }

        inFlightPreheatPromise = (async () => {
            try {
                return await PickedIngredientsPreheat._executeSync(redis);
            } finally {
                inFlightPreheatPromise = null;
            }
        })();

        return inFlightPreheatPromise;
    }

    /**
     * 🚀【防抖 (Debounce)】：面對高頻領料 (例如多人同時操作或1秒內多次請求) 時，
     * 重置計時器，合併多個請求在 delayMs (預設 800ms) 後只執行 1 次全量對比同步
     */
    static scheduleDebouncedPreheat(redis: any, delayMs: number = 800, onComplete?: () => void): void {
        if (preheatDebounceTimer) {
            clearTimeout(preheatDebounceTimer);
            console.log(`[PickedIngredientsPreheat] 觸發防抖 (Debounce)：重置 ${delayMs}ms 計時器，合併多次高頻領料請求`);
        }

        preheatDebounceTimer = setTimeout(() => {
            preheatDebounceTimer = null;
            PickedIngredientsPreheat.pushPreheat(redis).then(() => {
                if (typeof onComplete === 'function') {
                    onComplete();
                }
            }).catch((err) => {
                console.error('[PickedIngredientsPreheat] 防抖觸發之同步任務失敗:', err);
            });
        }, delayMs);
    }

    /**
     * 實際執行未領取物料對比同步 (支援 1000 筆以上分塊 Bulk 批次處理)
     */
    private static async _executeSync(redis: any): Promise<any[]> {
        const zsetKey = getPickupZsetKey();
        const zdataKey = getPickupZdataKey();

        try {
            console.log('[PickedIngredientsPreheat] 開始執行未領取物料 prewarning 快取比對與同步...');
            let records: any[] = [];
            const pythonBackend = getPythonApiBaseUrl();

            try {
                const response = await axios.get(`${pythonBackend}/api/v1/ingredients/populateUnpickedWarehouseMaterials`, {
                    timeout: 10000
                });
                if (response?.data?.data && Array.isArray(response.data.data)) {
                    records = response.data.data;
                }
            } catch (err: any) {
                console.warn('[PickedIngredientsPreheat] 呼叫 populateUnpickedWarehouseMaterials 失敗，嘗試備援呼叫 getUnpickedWarehouseMaterials:', err?.message || err);
                try {
                    const fallbackRes = await axios.get(`${pythonBackend}/api/v1/ingredients/getUnpickedWarehouseMaterials`, {
                        params: { page: 1, pageSize: 5000 },
                        timeout: 10000
                    });
                    if (fallbackRes?.data?.data && Array.isArray(fallbackRes.data.data)) {
                        records = fallbackRes.data.data;
                    }
                } catch (fallbackErr: any) {
                    console.error('[PickedIngredientsPreheat] 備援呼叫亦失敗:', fallbackErr?.message || fallbackErr);
                }
            }

            // 1. 取得 Redis ZSET 中目前已存在的所有 keys
            let existingKeys: string[] = [];
            try {
                existingKeys = await redis.sendCommand(['ZRANGE', zsetKey, '0', '-1']);
            } catch (rangeErr) {
                console.warn('[PickedIngredientsPreheat] 讀取既有 ZSET keys 失敗，視為冷啟動:', rangeErr);
                existingKeys = [];
            }
            const existingKeySet = new Set(Array.isArray(existingKeys) ? existingKeys.map(String) : []);

            // 2. 對比資料庫最新未領取物料清單
            const currentUnpickedKeySet = new Set<string>();
            const itemsToAdd: any[] = [];

            for (const item of records) {
                const itemKey = String(item.qr_identifier);
                if (!itemKey) continue;
                currentUnpickedKeySet.add(itemKey);

                // 對比現在已有的，只更新現在沒有的 (增量新增)
                if (!existingKeySet.has(itemKey)) {
                    itemsToAdd.push({ itemKey, item });
                }
            }

            // 3. 找出 Redis 原本有、但最新未領取清單中已經沒有的 (即已被領取或已除帳)
            const keysToRemove: string[] = [];
            for (const oldKey of existingKeySet) {
                if (!currentUnpickedKeySet.has(oldKey)) {
                    keysToRemove.push(oldKey);
                }
            }

            // 4. 批次分塊 Bulk 寫入 (Chunking 500 筆一批，高效處理 1000 筆以上資料)
            const pipeline = redis.multi();
            const CHUNK_SIZE = 500;

            // 4.1 批次原生陣列移除已領取/失效條碼 (zRem / hDel 支援多鍵傳入)
            if (keysToRemove.length > 0) {
                for (let i = 0; i < keysToRemove.length; i += CHUNK_SIZE) {
                    const chunk = keysToRemove.slice(i, i + CHUNK_SIZE);
                    pipeline.zRem(zsetKey, chunk);
                    pipeline.hDel(zdataKey, chunk);
                }
            }

            // 4.2 批次原生陣列/物件新增未領取條碼 (zAdd 支援陣列, hSet 支援物件)
            if (itemsToAdd.length > 0) {
                for (let i = 0; i < itemsToAdd.length; i += CHUNK_SIZE) {
                    const chunk = itemsToAdd.slice(i, i + CHUNK_SIZE);

                    const zaddItems = chunk.map(({ itemKey, item }) => {
                        const timeVal = item.package_generated_at || item.qr_generated_at || item.assign_datetime;
                        let score = timeVal ? new Date(timeVal).getTime() : Date.now();
                        if (isNaN(score)) score = Date.now();
                        return { score, value: itemKey };
                    });

                    const hashItems: Record<string, string> = {};
                    for (const { itemKey, item } of chunk) {
                        hashItems[itemKey] = JSON.stringify(item);
                    }

                    pipeline.zAdd(zsetKey, zaddItems);
                    pipeline.hSet(zdataKey, hashItems);
                }
            }

            // 確保設定快取 TTL (24小時)
            pipeline.expire(zsetKey, ENGINEER_SETTING_CACHE_TTL_SECONDS);
            pipeline.expire(zdataKey, ENGINEER_SETTING_CACHE_TTL_SECONDS);

            await pipeline.exec();
            console.log(`⚡ [PickedIngredientsPreheat] 快取同步成功 (zset & zdata): 新增 ${itemsToAdd.length} 筆，移除 ${keysToRemove.length} 筆，未領取總數 ${currentUnpickedKeySet.size} 筆`);
            return records;
        } catch (error: any) {
            console.error('[PickedIngredientsPreheat] 快取預熱同步過程發生錯誤:', error?.message || error);
            return [];
        }
    }

    // 相容原本函式名
    static async pushPrheat(redis?: any): Promise<any[]> {
        return this.pushPreheat(redis || redisClient);
    }
}

/**
 * 指數退避重試機制 (Exponential Backoff Retry)
 * 嚴格檢查 HTTP 狀態碼與業務邏輯 error / success: false
 * 若為 error 則依序等待 1s, 2s, 4s, 8s, 16s 重新打 API，最多嘗試 5 次
 */
const fetchWithExponentialBackoff = async (apiUrl: string, options: { method?: string, data?: any } = {}, maxAttempts = 5) => {
    let lastError: any = null;
    const method = (options.method || 'GET').toUpperCase();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            console.log(`[Exponential Backoff] 第 ${attempt + 1}/${maxAttempts} 次發送 ${method} 請求: ${apiUrl}`);
            const response = await axios({
                method: method,
                url: apiUrl,
                data: options.data,
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            const data = response?.data;

            // 1. HTTP 狀態碼檢查
            const isHttpStatusOk = response && (response.status === 200 || response.status === 201);

            // 2. 業務邏輯內容檢查 (避免 200 OK 內包含 status: 'error' 或 success: false 誤判為成功)
            const isBusinessError = !data ||
                data.status === 'error' ||
                data.status === 'failed' ||
                data.success === false ||
                Boolean(data.error);

            if (isHttpStatusOk && !isBusinessError) {
                console.log(`[Exponential Backoff] 第 ${attempt + 1} 次請求確認成功！`);
                return data;
            }

            // 若為業務錯誤，主動拋出例外以進入 catch 重試
            const errMsg = data?.message || data?.error || `API 回應錯誤 (status: ${response?.status})`;
            throw new Error(errMsg);

        } catch (error: any) {
            lastError = error;
            console.warn(`[Exponential Backoff] 第 ${attempt + 1} 次失敗: ${error?.message || error}`);

            // 如果已達最後一次嘗試 (第 5 次)，不再 sleep，直接 break
            if (attempt === maxAttempts - 1) {
                console.error(`[Exponential Backoff] 連續失敗 ${maxAttempts} 次，停止重試。`);
                break;
            }

            // 數學公式：2^attempt * 1000ms (1s, 2s, 4s, 8s, 16s)
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`[Exponential Backoff] 等待 ${waitTime / 1000} 秒 (${Math.pow(2, attempt)}s) 後進行第 ${attempt + 2} 次重試...`);
            await sleep(waitTime);
        }
    }

    throw new Error(lastError?.message || `API 請求失敗，已重試 ${maxAttempts} 次`);
};


type RedisData = {
    data: any | null,
    option: string | null
}

type ioSetting = {
    io: any,
    redis: any,
    room?: string
}

const redisLine = [] as RedisData[];



const REDIS_PREFIX = 'Ingredients:list';
const getZsetKey = () => `${REDIS_PREFIX}zset`
const getHashKey = () => `${REDIS_PREFIX}data`

export const getExhaustDataFromDB = async ({
    productName,
    startDate,
    endDate,
    page = 1,
    pageSize = 10,
    department
}: {
    productName?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    page?: number;
    pageSize?: number;
    department?: string;
}) => {
    const prisma = prismaMes;
    const pageNum = Math.max(1, Number(page) || 1);
    const limit = Math.max(1, Number(pageSize) || 10);
    const skip = (pageNum - 1) * limit;

    const whereCondition: any = {
        iscostover: 1,
        status: { not: 'return' }
    };

    if (department) {
        whereCondition.pickUp_Department = department;
    }

    if (productName && String(productName).trim() !== '') {
        whereCondition.product_name = {
            contains: String(productName).trim()
        };
    }

    if (startDate || endDate) {
        const dateFilter: any = {};
        if (startDate) {
            const startStr = typeof startDate === 'string' ? startDate.split('T')[0] : startDate;
            const start = new Date(`${startStr}T00:00:00.000Z`);
            if (!isNaN(start.getTime())) {
                dateFilter.gte = start;
            }
        }
        if (endDate) {
            const endStr = typeof endDate === 'string' ? endDate.split('T')[0] : endDate;
            const end = new Date(`${endStr}T23:59:59.999Z`);
            if (!isNaN(end.getTime())) {
                dateFilter.lte = end;
            }
        }
        whereCondition.iscostover_Time = dateFilter;
    }

    // 1. 抓取未完成或被駁回的 uuid_apply (排除申請中或失敗的 uuid)
    const invalidAuthList = await prisma.erp_eachdepartment_auth.findMany({
        where: {
            OR: [
                { channel: { not: 'finish' } },
                { decisionStatus: 'reject' }
            ]
        },
        select: {
            uuid_apply: true
        }
    });

    const invalidUuids = Array.from(
        new Set(invalidAuthList.map((item: any) => item.uuid_apply).filter(Boolean))
    );

    if (invalidUuids.length > 0) {
        whereCondition.uuid = {
            notIn: invalidUuids
        };
    }

    // 2. 抓出所有初步符合 iscostover: 1 的候選紀錄 (使用 Prisma ORM)
    const candidateRows = await prisma.erpMaterialPickUpEach.findMany({
        where: whereCondition,
        orderBy: [
            { iscostover_Time: 'desc' },
            { id: 'desc' }
        ]
    });

    // 3. 找出以這些候選紀錄 uuid 為 originUUID 的所有轉移/退料子單據
    const candidateUuids = candidateRows.map((r: any) => r.uuid).filter(Boolean);
    const childRows = candidateUuids.length > 0
        ? await prisma.erpMaterialPickUpEach.findMany({
            where: {
                originUUID: { in: candidateUuids }
            },
            select: {
                originUUID: true,
                row_measure_val: true
            }
        })
        : [];

    // 計算每個候選單據「轉移/退料出去」的總數量
    const transferredQtyMap = new Map<string, number>();
    for (const child of childRows) {
        const prev = transferredQtyMap.get(child.originUUID) || 0;
        transferredQtyMap.set(child.originUUID, prev + Number(child.row_measure_val || 0));
    }

    // 4. 計算「實際在本部門消耗的數量」= (初始分配量 row_measure_val) - (轉移出去總量 transferredOutQty)
    // 只有實際消耗數量 > 0.0001 的紀錄，才算是真正的「已用盡紀錄」
    const validExhaustData = candidateRows
        .map((row: any) => {
            const initialQty = Number(row.row_measure_val || 0);
            const transferredOutQty = transferredQtyMap.get(row.uuid) || 0;
            const actualConsumedQty = Math.max(0, initialQty - transferredOutQty);

            return {
                ...row,
                actualConsumedQty,
                row_measure_val: actualConsumedQty // 呈現該單據/部門實際消耗的數量
            };
        })
        .filter((row: any) => row.actualConsumedQty > 0.0001);

    const totalCount = validExhaustData.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const exhaustData = validExhaustData.slice(skip, skip + limit);

    return {
        exhaustData,
        totalCount,
        totalPages,
        pageNum,
        limit
    };
};

// 抓取 REDIS 資料
export const handleRedisDataCahch = async (
    page: number,
    pageSize: number,
    redis: any,
    startDate?: string | Date | null,
    endDate?: string | Date | null,
    statusFilter: string = 'empty',
    departmentFilter?: string
) => {
    if (!redis) {
        throw new Error('Redis client is not available');
    }

    try {
        const zsetKey = getZsetKey()
        const hashKey = getHashKey()

        let parsedPage = parseInt(page as unknown as string, 10);
        let parsedPageSize = parseInt(pageSize as unknown as string, 10);
        if (isNaN(parsedPage) || parsedPage < 1) {
            parsedPage = 1;
        }
        if (isNaN(parsedPageSize) || parsedPageSize < 1) {
            parsedPageSize = 10;
        }

        let startScore = '-inf';
        let endScore = '+inf';

        if (startDate && String(startDate).trim() !== '' && startDate !== 'null' && startDate !== 'undefined') {
            const startStr = typeof startDate === 'string' ? startDate.split('T')[0] : startDate;
            const startTs = new Date(`${startStr}T00:00:00.000Z`).getTime();
            if (!isNaN(startTs)) {
                startScore = startTs.toString();
            }
        }

        if (endDate && String(endDate).trim() !== '' && endDate !== 'null' && endDate !== 'undefined') {
            const endStr = typeof endDate === 'string' ? endDate.split('T')[0] : endDate;
            const endTs = new Date(`${endStr}T23:59:59.999Z`).getTime();
            if (!isNaN(endTs)) {
                endScore = endTs.toString();
            }
        }

        const itemCodes = await redis.sendCommand([
            'ZREVRANGEBYSCORE',
            zsetKey,
            endScore,
            startScore,
            'LIMIT',
            ((parsedPage - 1) * parsedPageSize).toString(),
            parsedPageSize.toString()
        ])

        const totalCountVal = await redis.sendCommand([
            'ZCOUNT',
            zsetKey,
            startScore,
            endScore
        ]);
        const totalCount = typeof totalCountVal === 'number' ? totalCountVal : parseInt(totalCountVal, 10) || 0;

        const rows: any[] = [];
        if (Array.isArray(itemCodes) && itemCodes.length > 0) {
            const rowRecords = await Promise.all(itemCodes.map(async (id: any) => {
                const record = await redis.sendCommand(['HGET', hashKey, String(id)]);
                if (!record) return null;
                const parsed = JSON.parse(record);

                // Department Filter (checks picking_dept or assign_dept)
                if (departmentFilter && parsed) {
                    const deptList = typeof departmentFilter === 'string'
                        ? departmentFilter.split(',').map((d: string) => d.trim()).filter(Boolean)
                        : (Array.isArray(departmentFilter) ? departmentFilter : [departmentFilter]);
                    const deptMatch = deptList.includes(parsed.picking_dept) || deptList.includes(parsed.assign_dept);
                    if (!deptMatch) {
                        return null;
                    }
                }

                return parsed;
            }))
            rows.push(...rowRecords.filter(Boolean));
        }

        return {
            totalCount,
            page: parsedPage,
            pageSize: parsedPageSize,
            data: rows
        }
    } catch (error: any | null) {
        console.log('handleRedisDataCahch error type : ', error?.message || error)
        throw error
    }
}

// 抓取 db 最新資訊，未來用於更新 redis 資料 (分頁)
const fetchIngredientDataFromDatabase = async () => {
    try {
        const response = await axios.get(`${getPythonApiUrl('/api/ingredients/handleRenewData')}`);
        const dataArray = response?.data?.data;
        return Array.isArray(dataArray) ? dataArray : [];
    } catch (error: any | null) {
        console.log('fetchIngredientDataFromDatabase error type : ', error?.message || error)
        throw new Error('Failed to fetch ingredient data from database');
    }
}

const findAuthDepartment = async (member: any) => {
    try {
        const memberIdStr = typeof member === 'string'
            ? member
            : (typeof member?.memberNo === 'string'
                ? member.memberNo
                : (typeof member?.memberID === 'string' ? member.memberID : ''));

        if (!memberIdStr) {
            return [''];
        }

        const checkAuthPosition = await prismaHr.scheduleRegInfo.findMany({
            select: {
                positionArea: true,
                memberID: true,
                managerRoster: {
                    select: {
                        positionArea: true
                    }
                }
            },
            where: {
                memberID: memberIdStr
            }
        })

        if (checkAuthPosition.length == 0) {
            return [''];
        } else {
            const parseDept = (raw: any): string[] => {
                if (!raw) return [];
                if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean);
                if (typeof raw === 'string') {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean);
                    } catch {
                        return raw.replace(/[\[\]'"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
                    }
                }
                return [String(raw)];
            };

            const department = parseDept(checkAuthPosition[0].positionArea);
            const rawManager = checkAuthPosition[0].managerRoster;
            const managerDepartment = Array.isArray(rawManager)
                ? rawManager.flatMap((item: any) => parseDept(item?.positionArea))
                : (rawManager && typeof rawManager === 'object' ? parseDept(rawManager.positionArea) : []);

            const resultDepts = Array.from(new Set([...department, ...managerDepartment]));
            return resultDepts;
        }
    } catch (error: any | unknown) {
        console.log('checkAuthPosition error : ', error?.message || error)
        return [''];
    }
}

// 更新最新資訊到 redis
export const handleUpdateRedisData = async (redis: any) => {
    console.log('開始更新 Redis 資料');

    // 先從資料庫撈出最新的全部資料
    const recordsArray = await fetchIngredientDataFromDatabase();

    const zsetKey = getZsetKey();
    const hashKey = getHashKey();

    if (recordsArray.length === 0) {
        console.log('資料庫無資料，清空 Redis');
        await redis.multi().del(zsetKey).del(hashKey).exec();
        return [];
    }

    const tempZsetKey = `${zsetKey}:temp`;
    const tempHashKey = `${hashKey}:temp`;

    try {
        const pipeline = redis.multi();

        // 清除先前可能殘留的 temp keys
        pipeline.del(tempZsetKey);
        pipeline.del(tempHashKey);

        // 重新裝入新資料至臨時 keys
        recordsArray.forEach((record: any) => {
            let score = new Date(record.assign_datetime).getTime();
            if (isNaN(score)) {
                score = Date.now();
            }
            // node-redis v4 的 zAdd 語法為 zAdd(key, { score, value })
            pipeline.zAdd(tempZsetKey, { score, value: String(record.id) });
            pipeline.hSet(tempHashKey, String(record.id), JSON.stringify(record));
        });

        // 原子性覆蓋舊的 keys (Rename)
        pipeline.rename(tempZsetKey, zsetKey);
        pipeline.rename(tempHashKey, hashKey);

        // 執行 pipeline
        await pipeline.exec();
        console.log('Redis 資料已安全重構並更新');
        return recordsArray;
    } catch (error) {
        console.error('更新 Redis 發生錯誤，清理臨時 Keys:', error);
        // 發生錯誤時，將臨時 Key 清理掉以釋放記憶體
        await redis.multi().del(tempZsetKey).del(tempHashKey).exec();
        throw error;
    }
}

export const bindWarehouseHandlers = ({
    io, redis, room
}: ioSetting) => {
    io.on('connection', (socket: any) => {
        const currentRoomKey = socket.handshake?.query?.roomKey as string | undefined;

        // 如果是各部門庫存 (eachStock) 的房間，由 eachStock.tsx 專門處理，跳過以避免事件名稱 (Ingredients:getData) 衝突
        if (currentRoomKey === 'Ingredients_EachDepartment_management_room') return;
        if (room && currentRoomKey && currentRoomKey !== room) return;

        const initialRoom = currentRoomKey || room;
        if (initialRoom) {
            socket.join(initialRoom);
            console.log(`使用者連線成功 ${socket.id}，已加入房間 ${initialRoom}`);
        } else {
            console.log(`使用者連線成功 ${socket.id}`);
        }

        const tryJoinRoom = (incomingRoomKey?: string) => {
            const resolvedRoomKey = typeof incomingRoomKey === 'string' && incomingRoomKey.length > 0
                ? incomingRoomKey
                : (currentRoomKey || room);

            if (resolvedRoomKey) {
                socket.join(resolvedRoomKey);
                console.log(`使用者 ${socket.id} 加入房間 ${resolvedRoomKey}`);
                return true;
            }
            return false;
        };

        socket.on('joinRoom', (payload: any) => {
            const incomingRoomKey = typeof payload === 'string' ? payload : payload?.room;
            tryJoinRoom(incomingRoomKey);
        });

        socket.on('leaveRoom', (payload: any) => {
            const incomingRoomKey = typeof payload === 'string' ? payload : payload?.room;
            if (incomingRoomKey) {
                socket.leave(incomingRoomKey);
                console.log(`使用者 ${socket.id} 離開房間 ${incomingRoomKey}`);
            }
        });

        socket.on('disconnect', () => {
            console.log('使用者斷線 , 斷線ID :', socket.id);
        });

        socket.on('Ingredient:getPickUpOrigin', async (payload: any, ack: any) => {
            const { userNumber, startDate, endDate, searchRequestNo, page, pageSize, status = 'empty' } = payload as any | null

            const pythonBackend = getPythonApiBaseUrl();
            const zsetKey = getPickupZsetKey();
            const zdataKey = getPickupZdataKey();

            try {
                // 如果有輸入關鍵字搜尋 (請購單號、條碼、料號、物料名稱)，直接查詢 Python API 獲取即時精確篩選結果
                if (searchRequestNo && String(searchRequestNo).trim() !== '') {
                    const response = await axios.get(`${pythonBackend}/api/v1/ingredients/getUnpickedWarehouseMaterials`, {
                        params: {
                            searchKeyword: String(searchRequestNo).trim(),
                            startDate: startDate || undefined,
                            endDate: endDate || undefined,
                            page: page || 1,
                            pageSize: pageSize || 10
                        }
                    });

                    console.log('確認Ingredient:getPickUpOrigin (搜尋關鍵字): ', response?.data);
                    if (typeof ack === 'function') {
                        ack({
                            success: true,
                            message: '取得庫存搜尋資料成功',
                            status: 'success',
                            data: response?.data,
                            pagination: {
                                total: response?.data?.total ?? (Array.isArray(response?.data?.data) ? response?.data?.data?.length : 0),
                                page: response?.data?.page ?? Number(page || 1),
                                pageSize: response?.data?.pageSize ?? Number(pageSize || 10)
                            }
                        });
                    }
                    return;
                }

                // 若未輸入搜尋關鍵字，則走 Redis ZSET + ZDATA 的 Pre-warning 快取機制
                const cacheExists = await redis.exists(zsetKey);
                if (cacheExists === 0) {
                    console.log('[Ingredient:getPickUpOrigin] ZSET 快取未命中，執行預熱...');
                    await PickedIngredientsPreheat.pushPreheat(redis);
                }

                let parsedPage = parseInt(page as unknown as string, 10);
                let parsedPageSize = parseInt(pageSize as unknown as string, 10);
                if (isNaN(parsedPage) || parsedPage < 1) parsedPage = 1;
                if (isNaN(parsedPageSize) || parsedPageSize < 1) parsedPageSize = 10;

                const skip = (parsedPage - 1) * parsedPageSize;
                const take = parsedPageSize;

                // 時間範圍過濾
                let startScore = '-inf';
                let endScore = '+inf';

                if (startDate && String(startDate).trim() !== '' && startDate !== 'null' && startDate !== 'undefined') {
                    const startClean = String(startDate).trim().split(' ')[0].split('T')[0];
                    const startTs = new Date(`${startClean}T00:00:00.000Z`).getTime();
                    if (!isNaN(startTs)) {
                        startScore = startTs.toString();
                    }
                }

                if (endDate && String(endDate).trim() !== '' && endDate !== 'null' && endDate !== 'undefined') {
                    const endClean = String(endDate).trim().split(' ')[0].split('T')[0];
                    const endTs = new Date(`${endClean}T23:59:59.999Z`).getTime();
                    if (!isNaN(endTs)) {
                        endScore = endTs.toString();
                    }
                }

                // 從 Redis ZSET 依照時間降序分頁取得 itemKeys
                const itemKeys: string[] = await redis.sendCommand([
                    'ZREVRANGEBYSCORE',
                    zsetKey,
                    endScore,
                    startScore,
                    'LIMIT',
                    skip.toString(),
                    take.toString()
                ]);

                // 取得範圍內的總筆數
                const totalCountVal = await redis.sendCommand([
                    'ZCOUNT',
                    zsetKey,
                    startScore,
                    endScore
                ]);
                const totalCount = typeof totalCountVal === 'number' ? totalCountVal : parseInt(totalCountVal, 10) || 0;

                let rows: any[] = [];
                if (Array.isArray(itemKeys) && itemKeys.length > 0) {
                    // 從 Redis ZDATA (Hash) 批量讀取資料本體
                    const rawRecords: (string | null)[] = await redis.hmGet(zdataKey, itemKeys);
                    rows = rawRecords.filter(Boolean).map((raw: any) => {
                        try {
                            return typeof raw === 'string' ? JSON.parse(raw) : raw;
                        } catch {
                            return null;
                        }
                    }).filter(Boolean);
                }

                console.log(`[Ingredient:getPickUpOrigin] 命中 Redis ZSET/ZDATA 快取: 共 ${totalCount} 筆，當頁 ${rows.length} 筆`);

                if (typeof ack === 'function') {
                    ack({
                        success: true,
                        message: '抓取prewarning 成功',
                        status: 'success',
                        data: {
                            status: 'success',
                            message: '取得未領取物料清單成功',
                            total: totalCount,
                            totalCount: totalCount,
                            page: parsedPage,
                            pageSize: parsedPageSize,
                            data: rows
                        },
                        pagination: {
                            total: totalCount,
                            page: parsedPage,
                            pageSize: parsedPageSize,
                            totalPages: Math.ceil(totalCount / parsedPageSize) || 1
                        }
                    });
                }
            } catch (error: any | unknown) {
                console.error('Ingredient:getPickUpOrigin error : ', error?.message || error);
                if (typeof ack === 'function') {
                    ack({
                        success: false,
                        message: '取得庫存初始資料失敗',
                        data: [] as string[]
                    });
                }
            }
        })

        socket.on('Ingredients:getData', async (payload: any, ack: any) => {
            const { userNumber, startDate, endDate, searchRequestNo, page, pageSize, status = 'empty', department } = payload as any | null
            const authKey = (socket.handshake?.auth?.authKey as string | undefined) || (department ? `dept_${department}` : undefined);
            const member = userNumber ? String(userNumber) : '';


            if (typeof department === 'string' && department.split(',').length > 1) {
                try {
                    const checkAuthPosition = await prismaHr.scheduleRegInfo.findMany({
                        select: {
                            positionArea: true,
                            memberID: true,
                            managerRoster: {
                                select: {
                                    positionArea: true
                                }
                            }
                        },
                        where: {
                            memberID: member
                        }
                    })

                    console.log('確認 checkAuthPosition 內容  :', checkAuthPosition)
                } catch (error: any | unknown) {
                    console.log('checkAuthPosition error : ', error?.message || error)
                }
            }
            if (authKey === 'dept_') {
                if (typeof ack === 'function') {
                    ack({
                        success: false,
                        message: '尚未切換部門'
                    })
                }
                return;
            }

            let parsedPage = parseInt(page as unknown as string, 10);
            let parsedPageSize = parseInt(pageSize as unknown as string, 10);
            if (isNaN(parsedPage) || parsedPage < 1) {
                parsedPage = 1;
            }
            if (isNaN(parsedPageSize) || parsedPageSize < 1) {
                parsedPageSize = 10;
            }

            // console.log(
            //     "userNumber :", userNumber, " | ",
            //     "startDate  :", startDate, " | ",
            //     "endDate    :", endDate, " | ",
            //     "searchRequestNo :", searchRequestNo, " | ",
            //     "page (parsed) :", parsedPage, " | ",
            //     "pageSize (parsed) :", parsedPageSize, " | ",
            //     "status :", status, " | ",
            //     "department :", department
            // )
            let response: any | null = null

            try {

                if (searchRequestNo) {
                    const prisma = prismaMes

                    const checkTotalCount = await prisma.ErpAllocateMaterial.count({
                        where: {
                            iscostover: 0,
                            picking_memberid: status === 'empty' ? '' : (status === 'non-empty' ? { not: '' } : undefined),
                            form_id: {
                                contains: searchRequestNo
                            }
                        }
                    })
                    const checkTotalPage = Math.ceil(checkTotalCount / parsedPageSize)

                    const materials = await prisma.ErpAllocateMaterial.findMany({
                        select: {
                            id: true,
                            assign_datetime: true,
                            form_id: true,
                            allocate_barcode_text: true,
                            total_measure_val: true,
                            row_measure_val: true,
                            row_unit: true,
                            assign_name: true,
                            assign_memberid: true,
                            assign_dept: true,
                            warehousetype: true,
                            stack_position: true,
                            opmode: true,
                            ng_material_photo: true,
                            picking_dept: true,
                            picking_name: true,
                            picking_memberid: true,
                            picking_datetime: true,
                            iscostover: true,
                            specification: true,
                            product_name: true,
                            product_itemcode: true,
                            vender_name: true
                        },
                        where: {
                            iscostover: 0,
                            picking_memberid: status === 'empty' ? '' : (status === 'non-empty' ? { not: '' } : undefined),
                            form_id: {
                                contains: searchRequestNo
                            },
                            assign_datetime: {
                                gte: new Date(`${typeof startDate === 'string' ? startDate.split('T')[0] : startDate}T00:00:00.000Z`),
                                lte: new Date(`${typeof endDate === 'string' ? endDate.split('T')[0] : endDate}T23:59:59.999Z`)
                            }
                        },
                        orderBy: {
                            assign_datetime: 'desc'
                        },
                        skip: (parsedPage - 1) * parsedPageSize,
                        take: parsedPageSize
                    })

                    // Fetch status from ErpMaterialPickUpEach
                    const barcodeTexts = materials.map((r: any) => r.allocate_barcode_text);
                    const pickupRecords = await prisma.ErpMaterialPickUpEach.findMany({
                        where: {
                            allocate_barcode_text: {
                                in: barcodeTexts
                            }
                        },
                        select: {
                            allocate_barcode_text: true,
                            form_id: true,
                            status: true
                        }
                    });

                    const statusMap = new Map();
                    pickupRecords.forEach((rec: any) => {
                        statusMap.set(`${rec.form_id}_${rec.allocate_barcode_text}`, rec.status);
                    });

                    response = materials.map((r: any) => ({
                        ...r,
                        status: statusMap.get(`${r.form_id}_${r.allocate_barcode_text}`) ?? ''
                    })).filter((r: any) => {
                        // Status Filter
                        if (status === 'empty' && r.status !== '') {
                            return false;
                        }
                        if (status === 'non-empty' && r.status === '') {
                            return false;
                        }

                        // Department Filter
                        if (department) {
                            const deptList = typeof department === 'string'
                                ? department.split(',').map((d: string) => d.trim()).filter(Boolean)
                                : (Array.isArray(department) ? department : [department]);
                            const deptMatch = deptList.includes(r.picking_dept) || deptList.includes(r.assign_dept);
                            if (!deptMatch) {
                                return false;
                            }
                        }

                        return true;
                    });

                    console.log('check if have search data : ', response.length > 0, ' | ', response)

                    const result = {
                        totalCount: checkTotalCount,
                        totalPage: checkTotalPage,
                        page: parsedPage,
                        pageSize: parsedPageSize,
                        data: response
                    }

                    if (response.length === 0) {
                        if (typeof ack === 'function') {
                            ack({ success: false, message: '查無資料' })
                        }
                        return
                    }

                    if (typeof ack === 'function') {
                        ack({ success: true, data: result, checkPayload: payload })
                    }
                    return
                }
                try {
                    // 1. 先嘗試從 Redis 快取獲取資料
                    response = await handleRedisDataCahch(parsedPage, parsedPageSize, redis, startDate, endDate, status, department)

                    // 2. 如果快取中沒有資料，才執行資料庫同步並重新獲取快取
                    if (!response || response.totalCount === 0) {
                        console.info('Redis cache miss, updating from database')
                        await handleUpdateRedisData(redis)
                        response = await handleRedisDataCahch(parsedPage, parsedPageSize, redis, startDate, endDate, status, department)
                    }
                } catch (error: any | null) {
                    console.log('Ingredients:getData error type : ', error?.message || error)
                }

                if (typeof ack === 'function') {
                    ack({ success: true, data: response })
                }
            } catch (error: any | null) {
                console.warn('Ingredients:getData 發生錯誤 :', error)
                if (typeof ack === 'function') {
                    ack({ success: false, message: '後端發生錯誤' })
                }
            }
        })

        socket.on('Ingredients:pickUp', async (payload: any, ack: any) => {
            const items = payload?.items;
            let sendToDB = null

            if (!Array.isArray(items) || items.length === 0) {
                if (typeof ack === 'function') {
                    ack({
                        success: false,
                        message: '請先選好你要申請的資料喔!!'
                    })
                }
                return;
            }

            try {
                sendToDB = await axios.post(`${getPythonApiUrl('/api/ingredients/picking')}`, items)
                console.log('Ingredients:pickUp sendToDB : ', JSON.stringify(sendToDB?.data))
            } catch (error: any | null) {
                console.warn('Ingredients:pickUp sendToDB error : ', error?.message || error)
            }

            if (sendToDB && sendToDB.status === 200) {
                console.log(`[Socket debug] Ingredients:pickUp successful. Room: ${room}. Socket rooms:`, Array.from(socket.rooms));
                // Instantly remove picked up items from active Redis cache (fast path)
                try {
                    const zsetKey = getZsetKey();
                    const hashKey = getHashKey();
                    for (const item of items) {
                        console.log(`[Socket debug] Removing item: id=${item.id}, uuid=${item.uuid}`);
                        if (item.id) {
                            const zremResult = await redis.sendCommand(['ZREM', zsetKey, String(item.id)]);
                            const hdelResult = await redis.sendCommand(['HDEL', hashKey, String(item.id)]);
                            console.log(`[Socket debug] Redis ZREM result: ${zremResult}, HDEL result: ${hdelResult}`);
                        } else {
                            console.warn(`[Socket debug] Item is missing ID property:`, item);
                        }
                    }
                } catch (redisError) {
                    console.error('Error removing items from Redis after pickUp:', redisError)
                }

                // 2. 即時自未領取物料 prewarning 快取 (zset & zdata) 中移除本次已領取的項目 (fast path)
                try {
                    const pickupZsetKey = getPickupZsetKey();
                    const pickupZdataKey = getPickupZdataKey();
                    for (const item of items) {
                        const itemKey = String(item.allocate_barcode_text || item.qr_identifier);
                        if (itemKey) {
                            await redis.sendCommand(['ZREM', pickupZsetKey, itemKey]);
                            await redis.sendCommand(['HDEL', pickupZdataKey, itemKey]);
                        }
                    }
                } catch (pickupErr) {
                    console.error('[Ingredients:pickUp] 移除未領取物料 prewarning 快取失敗:', pickupErr);
                }

                // 3. 觸發未領取物料 prewarning 增量對比更新 (透過防抖 Debounce + 搭便車 Single-Flight 合併多次高頻請求)
                PickedIngredientsPreheat.scheduleDebouncedPreheat(redis, 800, () => {
                    console.log('[Socket debug] Debounced PickedIngredientsPreheat (prewarning) 增量對比更新完成');
                    // 廣播給所有連線客戶端，通知未領取資料已同步
                    io.emit('Ingredient:getPickUpOrigin:sync', { success: true, timestamp: Date.now() });
                });

                setTimeout(() => {
                    handleUpdateRedisData(redis).then(() => {
                        console.log('[Socket debug] Background handleUpdateRedisData completed successfully');
                    }).catch((redisError) => {
                        console.error('Error updating Redis in background after pickUp:', redisError);
                    });
                }, 800);

                if (typeof ack === 'function') {
                    ack({ success: true })
                }
                console.log(`[Socket debug] Emitting Ingredients:pickUp to room: ${room}`);
                io.to(room).emit('Ingredients:pickUp', payload);
                io.emit('Ingredients:pickUp', payload);
            } else {
                if (typeof ack === 'function') {
                    ack({ success: false, message: '後端發生錯誤' })
                }
            }
        });

        // 專門用於調料申請的同意與否表單 ( for 被調料部門 )
        socket.on('Ingredients:getReceivedMaterialRequest', async (payload: any, ack: any) => {
            const { memberNo, startTime, endTime, page = 1, pageSize, findWord } = payload || {};
            // console.log('Ingredients:getReceivedMaterialRequest payload : ', payload);
            const memberNumber = typeof memberNo === 'string'
                ? memberNo
                : (typeof memberNo === 'object' && memberNo !== null
                    ? (typeof memberNo.memberNo === 'string' ? memberNo.memberNo : (typeof memberNo.memberID === 'string' ? memberNo.memberID : ''))
                    : '');
            const cacheKey = `received_material_${memberNumber || 'default'}_page_${page}`;
            const now = Date.now();

            try {
                let responseData: any = null;
                let department = await findAuthDepartment(memberNumber)

                // ----------------------------------------------------
                // 第一關：【5 秒快取檢查 (TTL Cache)】
                // ----------------------------------------------------
                const cached = receivedMaterialCache.get(cacheKey);
                if (cached && (now - cached.timestamp < MATERIAL_REQUEST_TTL_MS)) {
                    const remainingSeconds = ((MATERIAL_REQUEST_TTL_MS - (now - cached.timestamp)) / 1000).toFixed(1);
                    console.log(`[快取命中 🎯] 使用 ${cacheKey} 快取資料 (剩餘 ${remainingSeconds} 秒過期)`);
                    responseData = cached.data;
                } else {
                    // ----------------------------------------------------
                    // 第二關：【請求去重 / 共享便車 (In-Flight Deduplication)】
                    // ----------------------------------------------------
                    let fetchPromise = pendingMaterialRequests.get(cacheKey);

                    if (!fetchPromise) {
                        // ----------------------------------------------------
                        // 第三關：【發起請求 + 指數退避重試 (Exponential Backoff)】
                        // ----------------------------------------------------
                        console.log(`[重新請求 🔄] 無快取或已過期，啟動指數退避重試請求 Python API: ${cacheKey}`);
                        const queryParams = new URLSearchParams({
                            startTime: payload?.startTime || '',
                            endTime: payload?.endTime || '',
                            page: String(payload?.page || 1),
                            pageSize: String(payload?.pageSize || 10),
                            findWord: payload?.findWord || '',
                        });

                        if (Array.isArray(department)) {
                            department.forEach((d: string) => queryParams.append('department', d));
                        } else if (department) {
                            queryParams.append('department', String(department));
                        }

                        const baseUrl = getPythonApiUrl('/api/ingredients/getReceivedMaterialRequest');
                        const apiUrl = `${baseUrl}?${queryParams.toString()}`;

                        fetchPromise = fetchWithExponentialBackoff(apiUrl, {
                            method: 'GET',
                        })
                            .then(data => {
                                // 成功後寫入快取與時間戳
                                receivedMaterialCache.set(cacheKey, {
                                    timestamp: Date.now(),
                                    data: data
                                });
                                return data;
                            })
                            .finally(() => {
                                // 完成後釋放 pending 標記
                                pendingMaterialRequests.delete(cacheKey);
                            });

                        pendingMaterialRequests.set(cacheKey, fetchPromise);
                    } else {
                        console.log(`[搭便車 🚗] 共享正在進行中的 API 重試請求: ${cacheKey}`);
                    }

                    // 等待 API 返回（或共享搭便車）
                    responseData = await fetchPromise;
                }

                if (typeof ack === 'function') {
                    ack({
                        success: true,
                        message: '成功收到調料申請',
                        data: {
                            page: payload?.page || 1,
                            totalPages: 1,
                            data: responseData
                        }
                    });
                }
            } catch (error: any | null) {
                console.error('Ingredients:getReceivedMaterialRequest 最終失敗:', error);
                if (typeof ack === 'function') {
                    ack({
                        success: false,
                        message: error?.message || '伺服器連線多次失敗，請稍後再試',
                        data: null
                    });
                }
            }


        });



        // 專門用於抓取已用盡料品紀錄 (for 已用盡料品紀錄 Modal)
        socket.on('Ingredients:getExhaustData', async (payload: any, ack: any) => {
            try {
                const { productName, startDate, endDate, page = 1, pageSize = 10, department } = payload || {};
                const cacheKey = `exhaustData_${productName || ''}_${startDate || ''}_${endDate || ''}_${page}_${pageSize}_${department || ''}`;

                let fetchPromise = pendingMaterialRequests.get(cacheKey);

                if (!fetchPromise) {
                    fetchPromise = getExhaustDataFromDB({
                        productName,
                        startDate,
                        endDate,
                        page,
                        pageSize,
                        department
                    }).finally(() => {
                        pendingMaterialRequests.delete(cacheKey);
                    });

                    pendingMaterialRequests.set(cacheKey, fetchPromise);
                } else {
                    console.log(`[搭便車 🚗] 共享正在進行中的 ExhaustData 請求: ${cacheKey}`);
                }

                const result = await fetchPromise;

                if (typeof ack === 'function') {
                    ack(null, {
                        status: '200',
                        success: true,
                        message: '抓取已用盡料品紀錄成功',
                        data: result.exhaustData,
                        totalCount: result.totalCount,
                        totalPages: result.totalPages,
                        page: result.pageNum,
                        pageSize: result.limit
                    });
                }
            } catch (error: any | unknown) {
                console.error('Ingredients:getExhaustData 失敗:', error?.message || error);
                if (typeof ack === 'function') {
                    ack(error, {
                        status: 'error',
                        success: false,
                        message: error?.message || '抓取已用盡料品紀錄失敗',
                        data: [],
                        totalCount: 0,
                        totalPages: 1,
                        page: 1,
                        pageSize: 10
                    });
                }
            }
        });

        socket.on('Ingredients:postForChangeApply', async (payload: any, ack: any) => {

            console.log('check Ingredients:postForChangeApply payload:', payload)
            const statusChangeEmpNo = payload[0]?.decisionEmpNo

            console.log('check Ingredients:postForChangeApply payload:', payload)
            const uuidForUnique = payload[0]?.uuid
            console.log('確認 uuidForUnique: ', uuidForUnique)

            const cacheKey = `received_postMaterial_${uuidForUnique || 'default'}`
            const now = Date.now()

            // console.log('確認一下 statusChangeEmpNo: ', statusChangeEmpNo)

            try {

                let responseData: any = null;

                const cached = receivedMaterialCache.get(cacheKey);
                if (cached && (now - cached.timestamp < MATERIAL_REQUEST_TTL_MS)) {
                    const remainingSeconds = ((MATERIAL_REQUEST_TTL_MS - (now - cached.timestamp)) / 1000).toFixed(1)
                    console.log(`[快取命中 🎯] 使用 ${cacheKey} 快取資料 (剩餘 ${remainingSeconds} 秒過期)`)
                    responseData = cached.data
                } else {
                    let fetchPromise = pendingMaterialRequests.get(cacheKey)
                    if (!fetchPromise) {
                        console.log(`[重新請求 🔄] 無快取或已過期，啟動指數退避重試請求 Python API: ${cacheKey}`)

                        const queryParams = new URLSearchParams({
                            empNo: statusChangeEmpNo || '',
                            decisionStatus: payload?.decisionStatus || '',
                            decisionEmpName: payload?.decisionEmpName || '',
                            decisionEmpTime: payload?.decisionEmpTime || '',
                        });

                        const baseUrl = getPythonApiUrl('/api/ingredients/postForChangeApply')
                        const apiUrl = `${baseUrl}?${queryParams.toString()}`;

                        fetchPromise = fetchWithExponentialBackoff(apiUrl, {
                            method: 'POST',
                            data: payload
                        })
                            .then(data => {
                                receivedMaterialCache.set(cacheKey, {
                                    timestamp: Date.now(),
                                    data: data
                                })
                                return data
                            })
                            .finally(() => {
                                pendingMaterialRequests.delete(cacheKey)
                            })

                        pendingMaterialRequests.set(cacheKey, fetchPromise)
                    } else {
                        console.log(`[搭便車 🚗] 共享正在進行中的 API 重試請求: ${cacheKey}`)
                    }

                    responseData = await fetchPromise
                }

                if (typeof ack === 'function') {
                    ack({
                        success: true,
                        message: '成功修改調料申請狀態',
                        data: responseData
                    })
                }
            } catch (error: any | null) {
                console.error('Ingredients:postForChangeApply 最終失敗:', error);
                if (typeof ack === 'function') {
                    ack({
                        success: false,
                        message: error?.message || '伺服器連線多次失敗，請稍後再試',
                        data: null
                    });
                }
            }
        });
    })
}


router.get('/handleTakeStockAndLocation', async (req, res) => {
    try {
        const response = await axios.get(`${getPythonApiUrl('/api/ingredients/handleTakeStockAndLocation')}`);

        // console.log('check handleTakeStockAndLocation response :', response.data)
        const result = response.data

        res.status(200).json(result)

    } catch (error: any | null) {
        console.log('handleTakeStockAndLocation error type : ', error?.message || error)
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch ingredient data from database'
        })
    }
})

router.get('/handleUseStockFindLocation', async (req: any, res: any) => {
    try {
        const response = await axios.get(`${getPythonApiUrl('/api/ingredients/handleUseStockFindLocation')}`);
        console.log('check response about handleUseStockFindLocation:', response.data);

        // 直接轉發 Python 回傳的 { message, stock_list, location_list, data } 格式
        res.status(200).json(response.data);

    } catch (error: any) {
        console.error('handleUseStockFindLocation error:', error?.message || error);
        res.status(500).json({
            status: 'error',
            message: error?.message || 'Failed to fetch stock and location data'
        });
    }
});

router.get('/checkMemberIdentify', async (req: any, res: any) => {
    const { memberID } = req.query

    if (!memberID) {
        res.status(400).json({
            status: 'error',
            message: '缺少 memberID'
        })
        return
    }
    const parseStringMember = String(memberID).trim()


    try {
        const prisma = prismaHr

        const response = await prisma.ScheduleRegInfo.findUnique({
            select: {
                memberID: true,
                positionArea: true,
            },
            where: {
                memberID: parseStringMember
            },
        })
        // console.log('確認 checkMemberIdentify 的 response :', response)
        if (!response || !response.memberID || !response.positionArea) {
            res.status(400).json({
                status: 'error',
                message: '查無 memberID'
            })
            return
        }

        res.status(200).json({
            success: true,
            data: response
        })

    } catch (error: any | null) {
        console.log('handleTakeStockAndLocation error type : ', error?.message || error)
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch ingredient data from database'
        })
    }
})

router.get('/checkAllAuthPositionArea', async (req: any, res: any) => {
    try {
        const prisma = prismaHr

        const response = await prisma.scheduleRegInfo.findMany({
            select: {
                positionArea: true
            },
            distinct: ['positionArea']
        })

        const positions = response
            .map((r: any) => r.positionArea)
            .filter(Boolean)
            .flatMap((p: any) => String(p).replace(/[\[\]'"]/g, '').split(','))
            .map((p: any) => p.trim())
            .filter((p: any) => p !== '')

        const response_02 = await prisma.AbsentManagerRoster.findMany({
            select: {
                positionArea: true
            },
            distinct: ['positionArea']
        })


        // console.log('response: ', response)
        // console.log('response_02: ', response_02)

        const managerPositions = response_02
            .map((r: any) => r.positionArea)
            .filter(Boolean)
            .flatMap((p: any) => String(p).replace(/[\[\]'"]/g, '').split(','))
            .map((p: any) => p.trim())
            .filter((p: any) => p !== '')

        const combined = positions.filter(pos => managerPositions.includes(pos))
        const uniquePositions = [...new Set(combined.length > 0 ? combined : positions)]

        if (uniquePositions.length === 0) {
            res.status(400).json({
                status: 'error',
                message: '查無 authPosition 交集資料'
            })
            return
        }

        res.status(200).json({
            success: true,
            data: uniquePositions
        })

    } catch (error: any | null) {
        console.log('checkAllAuthPositionArea error type : ', error?.message || error)
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch ingredient data from database'
        })
    }

})

// 轉移申請
router.post('/requestTransferApply', async (req: any, res: any) => {
    const { payload, roomName } = req.body

    // console.log('確認 roomName :', roomName)
    console.log('確認 requestTransferApply 的 payload :', req.body.payload)

    try {
        const response = await axios.post(`${getPythonApiUrl('/api/ingredients/requestTransferApply')}`, req.body)
        if (response.data) {

            const { getSocketServer } = require('../../modules/socketServer');
            const ioInstance = getSocketServer ? getSocketServer() : null;

            if (ioInstance) {
                const targetRoom = roomName || 'Ingredients_EachDepartment_management_room';
                ioInstance.of('/Ingredients').to(targetRoom).emit('Ingredients:pickUp');
                console.log(`[requestTransferApply] 廣播 Ingredients:pickUp 給房間 ${targetRoom}`);
            }

            return res.status(200).json({
                status: 'success',
                message: '調撥申請成功',
                data: response.data
            })
        }

        return res.status(500).json({
            status: 'error',
            message: '調撥申請失敗',
            data: []
        })
    } catch (error: any) {
        console.error('requestTransferApply error:', error?.message || error)
        return res.status(500).json({
            status: 'error',
            message: error?.response?.data?.message || error?.message || '調撥申請失敗',
            data: []
        })
    }
})


// 退料申請
router.post('/requestReturnApply', async (req: any, res: any) => {
    const { payload, roomName } = req.body

    console.log('確認 roomName :', roomName)

    try {
        const response = await axios.post(`${getPythonApiUrl('/api/ingredients/requestReturnApply')}`, req.body)
        if (response.data) {

            const { getSocketServer } = require('../../modules/socketServer');
            const ioInstance = getSocketServer ? getSocketServer() : null;

            if (ioInstance) {
                const targetRoom = roomName || 'Ingredients_EachDepartment_management_room';
                ioInstance.of('/Ingredients').to(targetRoom).emit('Ingredients:pickUp');
                console.log(`[requestReturnApply] 廣播 Ingredients:pickUp 給房間 ${targetRoom}`);
            }

            return res.status(200).json({
                status: 'success',
                message: '歸還申請成功',
                data: response.data
            })
        }

        return res.status(500).json({
            status: 'error',
            message: '歸還申請失敗',
            data: []
        })
    } catch (error: any) {
        console.error('requestReturnApply error:', error?.message || error)
        return res.status(500).json({
            status: 'error',
            message: error?.response?.data?.message || error?.message || '歸還申請失敗',
            data: []
        })
    }

})


// 物料領取 HTTP API
router.post('/pickUp', async (req: any, res: any) => {
    const { items, roomName } = req.body;
    const sendItems = Array.isArray(items) ? items : (req.body?.items || req.body);

    if (!Array.isArray(sendItems) || sendItems.length === 0) {
        return res.status(400).json({
            status: 'error',
            success: false,
            message: '請先選好要領取的資料'
        });
    }

    try {

        console.log('確認picking_dept 內容: ', sendItems[0]?.picking_dept);
        let dept = sendItems[0]?.picking_dept;
        let numberCheck = sendItems[0]?.assign_memberid;

        let department = '';
        if (typeof dept === 'string' && dept.split(',').length > 1) {
            const checkPosition = await prismaHr.scheduleRegInfo.findFirst({
                select: {
                    positionArea: true,
                },
                where: {
                    memberID: numberCheck
                }
            });
            console.log('positionArea check: ', checkPosition)
            department = checkPosition?.positionArea ?? sendItems[0]?.picking_dept;
        }

        const redis = redisClient;
        const sendToDB = await axios.post(`${getPythonApiUrl('/api/ingredients/picking')}`, {
            sendItems,
            payload: sendItems,
            department
        });
        if (sendToDB && sendToDB.status === 200) {
            try {
                const zsetKey = getZsetKey();
                const hashKey = getHashKey();
                for (const item of sendItems) {
                    if (item.id) {
                        await redis.sendCommand(['ZREM', zsetKey, String(item.id)]);
                        await redis.sendCommand(['HDEL', hashKey, String(item.id)]);
                    }
                }
            } catch (redisError) {
                console.error('Error removing items from Redis after pickUp:', redisError);
            }

            // 快速移除未領取物料 prewarning 快取 (zset & zdata)
            try {
                const pickupZsetKey = getPickupZsetKey();
                const pickupZdataKey = getPickupZdataKey();
                for (const item of sendItems) {
                    const itemKey = String(item.allocate_barcode_text || item.qr_identifier);
                    if (itemKey) {
                        await redis.sendCommand(['ZREM', pickupZsetKey, itemKey]);
                        await redis.sendCommand(['HDEL', pickupZdataKey, itemKey]);
                    }
                }
            } catch (pickupErr) {
                console.error('[HTTP pickUp] 移除未領取物料 prewarning 快取失敗:', pickupErr);
            }

            // 3. 觸發未領取物料 prewarning 增量對比更新 (透過防抖 Debounce + 搭便車 Single-Flight 合併多次高頻請求)
            PickedIngredientsPreheat.scheduleDebouncedPreheat(redis, 800);

            setTimeout(() => {
                handleUpdateRedisData(redis).catch((redisError) => {
                    console.error('Error updating Redis in background after pickUp:', redisError);
                });
            }, 800);

            // 廣播 Socket GET 事件給在線的所有客戶端
            const { getSocketServer } = require('../../modules/socketServer');
            const ioInstance = getSocketServer ? getSocketServer() : null;

            if (ioInstance) {
                const ingredientsNsp = ioInstance.of('/Ingredients');
                if (roomName) {
                    ingredientsNsp.to(roomName).emit('Ingredients:pickUp', { items: sendItems });
                } else {
                    ingredientsNsp.emit('Ingredients:pickUp', { items: sendItems });
                }
                console.log(`[HTTP pickUp] 廣播 Ingredients:pickUp Socket 事件`);
            }

            return res.status(200).json({
                status: '200',
                success: true,
                message: '物料領取成功',
                data: sendToDB.data
            });
        }

        return res.status(500).json({
            status: 'error',
            success: false,
            message: '後端物料領取失敗'
        });
    } catch (error: any) {
        console.error('HTTP pickUp error:', error?.message || error);
        return res.status(500).json({
            status: 'error',
            success: false,
            message: error?.response?.data?.message || error?.message || '物料領取失敗'
        });
    }
});

// 審核同意 / 不同意 HTTP API
router.post('/postForChangeApply', async (req: any, res: any) => {
    const payload = req.body?.payload || req.body;
    const roomName = req.body?.roomName;

    const payloadList = Array.isArray(payload) ? payload : [payload];
    const statusChangeEmpNo = payloadList[0]?.decisionEmpNo;
    const uuidForUnique = payloadList[0]?.uuid;
    const cacheKey = `received_postMaterial_${uuidForUnique || 'default'}`;
    const now = Date.now();

    try {
        let responseData: any = null;

        const cached = receivedMaterialCache.get(cacheKey);
        if (cached && (now - cached.timestamp < MATERIAL_REQUEST_TTL_MS)) {
            responseData = cached.data;
        } else {
            let fetchPromise = pendingMaterialRequests.get(cacheKey);
            if (!fetchPromise) {
                const queryParams = new URLSearchParams({
                    empNo: statusChangeEmpNo || '',
                    decisionStatus: payloadList[0]?.decisionStatus || '',
                    decisionEmpName: payloadList[0]?.decisionEmpName || '',
                    decisionEmpTime: payloadList[0]?.decisionEmpTime || '',
                });

                const baseUrl = getPythonApiUrl('/api/ingredients/postForChangeApply');
                const apiUrl = `${baseUrl}?${queryParams.toString()}`;

                fetchPromise = fetchWithExponentialBackoff(apiUrl, {
                    method: 'POST',
                    data: payloadList
                })
                    .then(data => {
                        receivedMaterialCache.set(cacheKey, {
                            timestamp: Date.now(),
                            data: data
                        });
                        return data;
                    })
                    .finally(() => {
                        pendingMaterialRequests.delete(cacheKey);
                    });

                pendingMaterialRequests.set(cacheKey, fetchPromise);
            }

            responseData = await fetchPromise;
        }

        // 廣播 Socket GET 事件給在線的所有客戶端
        const { getSocketServer } = require('../../modules/socketServer');
        const ioInstance = getSocketServer ? getSocketServer() : null;

        if (ioInstance) {
            const ingredientsNsp = ioInstance.of('/Ingredients');
            if (roomName) {
                ingredientsNsp.to(roomName).emit('applyApprove');
                ingredientsNsp.to(roomName).emit('Ingredients:pickUp');
                ingredientsNsp.to(roomName).emit('Ingredients:getExhaustData');
            } else {
                ingredientsNsp.emit('applyApprove');
                ingredientsNsp.emit('Ingredients:pickUp');
                ingredientsNsp.emit('Ingredients:getExhaustData');
            }
            console.log(`[HTTP postForChangeApply] 廣播 applyApprove / Ingredients:pickUp / Ingredients:getExhaustData Socket 事件`);
        }

        return res.status(200).json({
            status: '200',
            success: true,
            message: '成功修改調料申請狀態',
            data: responseData
        });
    } catch (error: any) {
        console.error('HTTP postForChangeApply error:', error?.message || error);
        return res.status(500).json({
            status: 'error',
            success: false,
            message: error?.response?.data?.message || error?.message || '修改調料申請狀態失敗',
            data: null
        });
    }
});

// 部門庫存調撥更新 HTTP API
router.post('/updateStockBalance', async (req: any, res: any) => {
    const payload = req.body?.payload || req.body;
    const roomName = req.body?.roomName;

    try {
        const updateRes = await axios.post(`${getPythonApiUrl('/api/ingredients/updateDepartmentStockBalance')}`, payload);

        if (updateRes.data?.success) {
            const { getSocketServer } = require('../../modules/socketServer');
            const ioInstance = getSocketServer ? getSocketServer() : null;

            if (ioInstance) {
                const ingredientsNsp = ioInstance.of('/Ingredients');
                if (roomName) {
                    ingredientsNsp.to(roomName).emit('Ingredients:pickUp');
                    ingredientsNsp.to(roomName).emit('Ingredients:getExhaustData');
                }
                // 全域廣播給所有連線客戶端 (包含跨房間的 已用盡料品紀錄 Modal)
                ingredientsNsp.emit('Ingredients:pickUp');
                ingredientsNsp.emit('Ingredients:getExhaustData');
                console.log(`[HTTP updateStockBalance] 廣播 Ingredients:pickUp / Ingredients:getExhaustData Socket 事件`);
            }

            return res.status(200).json({
                status: '200',
                success: true,
                message: '更新部門庫存成功',
                data: updateRes.data
            });
        }

        return res.status(400).json({
            status: 'error',
            success: false,
            message: updateRes.data?.message || '更新部門庫存失敗'
        });
    } catch (error: any) {
        const errorMsg = error?.response?.data?.message || error?.response?.data?.detail || error?.message || '更新部門庫存失敗';
        return res.status(500).json({
            status: 'error',
            success: false,
            message: errorMsg
        });
    }
});

router.get('/exhaustData', async (req: any, res: any) => {
    try {
        const { productName, startDate, endDate, page = 1, pageSize = 10, department } = req.query;
        const result = await getExhaustDataFromDB({
            productName: productName ? String(productName) : undefined,
            startDate: startDate ? String(startDate) : undefined,
            endDate: endDate ? String(endDate) : undefined,
            page: Number(page) || 1,
            pageSize: Number(pageSize) || 10,
            department: department ? String(department) : undefined
        });

        return res.status(200).json({
            status: '200',
            success: true,
            message: '抓取已用盡料品紀錄成功',
            data: result.exhaustData,
            totalCount: result.totalCount,
            totalPages: result.totalPages,
            page: result.pageNum,
            pageSize: result.limit
        });
    } catch (error: any | unknown) {
        console.error('exhaustData error:', error?.message || error);
        return res.status(500).json({
            status: 'error',
            success: false,
            message: error?.message || '抓取已用盡料品紀錄失敗',
            data: [],
            totalCount: 0,
            totalPages: 1,
            page: 1,
            pageSize: 10
        });
    }
});



router.use('/authPart', require('./authPart'));

Object.assign(router, {
    bindWarehouseHandlers,
    handleRedisDataCahch,
    handleUpdateRedisData,
    prismaMes,
    prismaHr,
    getPythonApiBaseUrl,
    getPythonApiUrl,
    getPickupZsetKey,
    getPickupZdataKey,
    PickedIngredientsPreheat
})

module.exports = router;
