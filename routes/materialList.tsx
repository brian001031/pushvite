export { };

type RoomKey = string;

type MaterialProperty = {
    founder: string | null | undefined;
    founderId: string | null | undefined;
    foundTime?: Date | null | undefined;
    edit_empName: string | null | undefined;
    edit_empNumber: string | null | undefined;
    edit_time?: Date | null | undefined;
    nowStatus: string | null | undefined;
    productClassify: string | null | undefined;
    itemCode: string | null | undefined;
    itemName: string | null | undefined;
    specification: string;
    Vendor: string | null | undefined;
    otherMemo: string | null | undefined;
};

type MaterialRow = {
    founder?: string | null | undefined,
    founderId?: string | null | undefined,
    foundTime?: Date | null | undefined,
    edit_empName?: string | null | undefined,
    edit_empNumber?: string | null | undefined,
    edit_time?: Date | null | undefined,
    nowStatus?: string | null | undefined,
    productClassify?: string | null | undefined,
    itemCode?: string | null | undefined,
    itemName?: string | null | undefined,
    specification?: string,
    Vendor?: string | null | undefined,
    otherMemo?: string | null | undefined,
};

type MaterialListData = {
    rows: MaterialRow[];
    total: number;
    page: number;
    pageSize: number;
    revision: number;
};

type MaterialSocketDependencies = {
    io: {
        on: (eventName: string, handler: (...args: any[]) => unknown) => unknown;
        to: (roomName: string) => { emit: (eventName: string, payload: unknown) => unknown };
    };
    roomKey?: string;
    redis: any;
};

const axios = require('axios');
const redis = require('../modules/redisConnect.js');
require('dotenv').config();
const redisClient = redis.getClient();
const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();
const moment = require('moment-timezone');

const express = require('express');
const router = express.Router();

function toTaipeiDate(val: any): Date | null {
    if (val === null || val === undefined || val === '') return null;
    if (val instanceof Date) return val;
    const str = String(val).trim();
    // 已帶時區資訊（Z / +HH:MM / -HH:MM）則直接解析
    if (/Z$|\+\d{2}:\d{2}$|-\d{2}:\d{2}$/.test(str)) {
        return new Date(str);
    }
    // 無時區資訊時，視為 Asia/Taipei (UTC+8)
    return new Date(str + '+08:00:00');
}

/** 取得當前台北時間的 Date 物件（適用於需要寫入「現在」的場景） */
function nowTaipei(): Date {
    return toTaipeiDate(new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) + '+08:00:00') as Date;
}

const getPythonApiBaseUrl = () => {
    return process.env.PYTHON_API_BASE_URL ?? process.env.REACT_APP_PYTHON_API_BASE_URL ?? 'http://localhost:8000';
};


const REDIS_PREFIX = 'material:list:';
const getZsetKey = () => `${REDIS_PREFIX}zset`;
const getHashKey = () => `${REDIS_PREFIX}data`;

const normalizeKeyword = (keyword: string | null | undefined) => String(keyword ?? '').trim();

async function fetchMaterialSourceData(keyword: string | null = null): Promise<MaterialRow[]> {
    const fallbackData: MaterialRow[] = [
        { itemCode: 'MAT001', itemName: '螺絲', specification: 'M8x50', productClassify: '五金' },
        { itemCode: 'MAT002', itemName: '鐵板', specification: '2mm', productClassify: '金屬' },
        { itemCode: 'MAT003', itemName: '塑膠管', specification: '1吋', productClassify: '塑膠' },
    ];

    let remoteData: MaterialRow[] = [];
    // console.log(`[DB] 開始從 Python API 獲取資料，keyword=${keyword}`);
    try {
        const response = await axios.get(`${getPythonApiBaseUrl()}/api/v1/material/checkMaterialList`, {
            params: { keyword },
        });

        // console.log(`[DB] 從 Python API 獲取資料成功，原始回應:`, response.data);

        if (Array.isArray(response.data)) {
            remoteData = response.data
                .filter((item: any) => {
                    if (!item?.itemCode || !item?.itemName) {
                        console.warn('[DB] 資料格式異常，缺少 itemCode 或 itemName:', item);
                        return false;
                    }

                    return true;
                })
                .map((item: any) => ({
                    productClassify: item.productClassify ?? null,
                    itemCode: String(item.itemCode),
                    itemName: String(item.itemName),
                    specification: String(item.specification ?? ''),
                    Vendor: item.Vendor ?? null,
                    founder: item.founder ?? null,
                    founderId: item.founderId ?? null,
                    foundTime: item.foundTime ?? null,
                    edit_empName: item.edit_empName ?? null,
                    edit_empNumber: item.edit_empNumber ?? null,
                    edit_time: item.edit_time ?? null,
                    nowStatus: item.nowStatus ?? null,
                    otherMemo: item.otherMemo ?? null,
                }));
        }

        // console.log(`[DB] 從 Python API 獲取資料成功:`, response.data);
    } catch (error) {
        console.error(`[DB] 從 Python API 獲取資料失敗，嘗試直接查詢資料庫:`, error);
    }

    if (remoteData.length > 0) {
        return remoteData;
    }

    // Python API 無回應時，直接從 Prisma DB 撈
    console.warn('[DB] Python API 無資料，fallback 到 Prisma DB');
    try {
        const dbRows = await prismaMes.qualityassurancelist.findMany();
        if (dbRows.length > 0) {
            return dbRows.map((item: any) => ({
                productClassify: item.productClassify ?? null,
                itemCode: item.itemCode ? String(item.itemCode) : null,
                itemName: item.itemName ? String(item.itemName) : null,
                specification: String(item.specification ?? ''),
                Vendor: item.Vendor ?? null,
                founder: item.founder ?? null,
                founderId: item.founderId ?? null,
                foundTime: item.foundTime ?? null,
                edit_empName: item.edit_empName ?? null,
                edit_empNumber: item.edit_empNumber ?? null,
                edit_time: item.edit_time ?? null,
                nowStatus: item.nowStatus ?? null,
                otherMemo: item.otherMemo ?? null,
            }));
        }
    } catch (dbError) {
        console.error('[DB] Prisma fallback 查詢失敗:', dbError);
    }

    return fallbackData;
}

async function populateMaterialCache(redis: any) {
    const zsetKey = getZsetKey();
    const hashKey = getHashKey();

    const records = await fetchMaterialSourceData(null);
    const activeRecords = records.filter(item => item.nowStatus !== 'delete');

    const pipeline = redis.multi();
    pipeline.del(zsetKey);
    pipeline.del(hashKey);

    for (const record of activeRecords) {
        const itemCode = String(record.itemCode);
        const timeVal = record.foundTime || record.edit_time || new Date();
        let score = new Date(timeVal).getTime();
        if (isNaN(score)) {
            score = new Date().getTime();
        }

        pipeline.zAdd(zsetKey, { score, value: itemCode });
        pipeline.hSet(hashKey, itemCode, JSON.stringify(record));
    }

    await pipeline.exec();
    await redis.expire(zsetKey, 86400); // 快取保留 24 小時
    await redis.expire(hashKey, 86400);
    console.log(`⚡ [Redis] ZSET 與 Hash 快取預熱成功 (已過濾 delete): 共 ${activeRecords.length} 筆`);
}

async function buildListData(
    page: number,
    pageSize: number,
    keyword: string,
    cacheKey: string,
): Promise<MaterialListData> {
    return {
        rows: [],
        total: 0,
        page: Number(page),
        pageSize: Number(pageSize),
        revision: 0,
    };
}

function bindMaterialSocketHandlers({ io, redis, roomKey = 'material_management_room' }: MaterialSocketDependencies) {
    io.on('connection', (socket: any) => {
        console.log(`🔌 使用者連線成功: ${socket.id}`);

        socket.on('joinRoom', (incomingRoomKey: RoomKey) => {
            if (incomingRoomKey === roomKey) {
                socket.join(incomingRoomKey);
                console.log(`✅ ${socket.id} 加入房間: ${incomingRoomKey}`);
                socket.emit('roomJoined', incomingRoomKey);
            }
        });

        socket.on('leaveRoom', (incomingRoomKey: RoomKey) => {
            if (incomingRoomKey === roomKey) {
                socket.leave(incomingRoomKey);
                console.log(`❌ ${socket.id} 離開房間: ${incomingRoomKey}`);
                socket.emit('roomLeft', incomingRoomKey);
            }
        });

        socket.on('material:list:request', async (payload: any, ack: any) => {
            try {
                const dbmes = prismaMes;
                const { page = 1, pageSize = 10, keyword = '' } = payload || {};

                if (keyword !== '') {
                    const rows = await dbmes.qualityassurancelist.findMany({
                        where: {
                            OR: [
                                { itemName: { contains: keyword } },
                                { itemCode: { contains: keyword } },
                            ],
                            nowStatus: 'active',
                        },
                        orderBy: { foundTime: 'desc' },
                    });

                    console.log(`[DB] 直接從資料庫查詢關鍵字 "${keyword}"，共 ${rows.length} 筆`);

                    const listData: MaterialListData = {
                        rows,
                        total: rows.length,
                        page: Number(page),
                        pageSize: Number(pageSize),
                        revision: 0,
                    };

                    return ack?.({ status: 'success', data: listData });
                }

                const zsetKey = getZsetKey();
                const hashKey = getHashKey();

                const cacheExists = await redis.exists(zsetKey);
                if (!cacheExists) { await populateMaterialCache(redis) }



                let parsedPage = parseInt(page, 10);
                let parsedPageSize = parseInt(pageSize, 10);
                if (isNaN(parsedPage) || parsedPage < 1) parsedPage = 1;
                if (isNaN(parsedPageSize) || parsedPageSize < 1) parsedPageSize = 10;

                const skip = (parsedPage - 1) * parsedPageSize;
                const take = parsedPageSize;

                const itemCodes = await redis.sendCommand([
                    'ZREVRANGEBYSCORE',
                    zsetKey,
                    '+inf',
                    '-inf',
                    'LIMIT',
                    String(skip),
                    String(take)
                ]);

                const totalCount = await redis.zCount(zsetKey, '-inf', '+inf');

                let rows = [];
                if (itemCodes.length > 0) {
                    const rawRecords = await redis.hmGet(hashKey, itemCodes);
                    rows = rawRecords.map((raw: string) => raw ? JSON.parse(raw) : null).filter(Boolean);
                }

                const listData: MaterialListData = {
                    rows,
                    total: totalCount,
                    page: parsedPage,
                    pageSize: parsedPageSize,
                    revision: 0,
                };

                return ack?.({
                    status: 'success',
                    data: listData
                });

            } catch (error: any) {
                console.error('[material:list:request] 錯誤詳情:', error?.message ?? error);
                ack?.({ status: 'error', message: '取得列表失敗', detail: error?.message });
            }
        });

        socket.on('material:create:request', async (payload: any, ack: any) => {
            console.log(`確認有跑到 material:create:request 事件, payload:`, typeof payload, Object.keys(payload || {}), payload);
            try {
                const { roomKey: targetRoomKey, payload: newMaterial } = payload || {};

                if (!targetRoomKey) {
                    return ack?.({ status: 'error', message: '缺少 roomKey' });
                }

                const checkIfExistsw = await prismaMes.qualityassurancelist.findFirst({
                    where: {
                        itemCode: newMaterial.itemCode,
                        itemName: newMaterial.itemName,
                    },
                });

                if (checkIfExistsw) {
                    return ack?.({ status: 'error', message: '物料已存在' });
                }

                const prisma_FoundTime = moment(newMaterial.foundTime, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DDTHH:mm:ss[Z]');
                const prisma_EditTime = moment(newMaterial.edit_time, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DDTHH:mm:ss[Z]');
                console.log('prisma_FoundTime:', prisma_FoundTime, 'prisma_EditTime:', prisma_EditTime);

                const createNew = await prismaMes.qualityassurancelist.create({
                    data: {
                        productClassify: newMaterial.productClassify ?? '',
                        itemCode: newMaterial.itemCode ?? '',
                        itemName: newMaterial.itemName ?? '',
                        specification: newMaterial.specification ?? '',
                        Vendor: newMaterial.Vendor ?? '',
                        founder: newMaterial.founder ?? '',
                        founderId: newMaterial.founderId ?? '',
                        foundTime: prisma_FoundTime,
                        edit_empName: newMaterial.edit_empName ?? '',
                        edit_empNumber: newMaterial.edit_empNumber ?? '',
                        edit_time: prisma_EditTime,
                        nowStatus: 'active',
                        otherMemo: newMaterial.otherMemo ?? ''
                    }
                });

                const mapped = {
                    productClassify: createNew.productClassify ?? null,
                    itemCode: String(createNew.itemCode),
                    itemName: String(createNew.itemName),
                    specification: String(createNew.specification ?? ''),
                    Vendor: createNew.Vendor ?? null,
                    founder: createNew.founder ?? null,
                    founderId: createNew.founderId ?? null,
                    foundTime: createNew.foundTime ?? null,
                    edit_empName: createNew.edit_empName ?? null,
                    edit_empNumber: createNew.edit_empNumber ?? null,
                    edit_time: createNew.edit_time ?? null,
                    nowStatus: createNew.nowStatus ?? null,
                    otherMemo: createNew.otherMemo ?? null,
                };

                const zsetKey = getZsetKey();
                const hashKey = getHashKey();
                const timeVal = mapped.foundTime || mapped.edit_time || new Date();
                let score = new Date(timeVal).getTime();
                if (isNaN(score)) score = new Date().getTime();

                await redis.hSet(hashKey, mapped.itemCode, JSON.stringify(mapped));
                await redis.zAdd(zsetKey, { score, value: mapped.itemCode });

                ack?.({
                    status: 'success',
                });

                io.to(targetRoomKey).emit('material:updated', {
                    message: '有新物料被新增',
                });
                const roomSize = (io as any).sockets?.adapter?.rooms?.get(targetRoomKey)?.size ?? '?';
                console.log(`📢 廣播 material:updated 到房間 "${targetRoomKey}"，目前房間人數: ${roomSize}`);
            } catch (error) {
                console.error(error);
                ack?.({ status: 'error', message: '新增失敗' });
            }
        });

        socket.on('material:delete:request', async (payload: any, ack: any) => {
            try {
                const { roomKey: targetRoomKey, itemCode } = payload ?? {};
                if (!targetRoomKey || !itemCode) {
                    return ack?.({ status: 'error', message: '缺少必要參數' });
                }

                const itemCodes = Array.isArray(itemCode) ? itemCode : [itemCode];
                await axios.post(`${getPythonApiBaseUrl()}/api/v1/material/deleteMaterial`, itemCodes);

                const zsetKey = getZsetKey();
                const hashKey = getHashKey();

                for (const code of itemCodes) {
                    await redis.hDel(hashKey, String(code));
                    await redis.zRem(zsetKey, String(code));
                }

                ack?.({ status: 'success' });
                io.to(targetRoomKey).emit('material:updated', {
                    message: `物料 ${itemCodes.join(', ')} 已被刪除`,
                });

            } catch (error: any) {
                console.error('[material:delete:request] 錯誤詳情:', error?.message ?? error);

                ack?.({ status: 'error', message: '刪除失敗', detail: error?.message });
            }
        });

        socket.on('material:update:request', async (payload: any, ack: any) => {
            try {
                const { roomKey: targetRoomKey, editPayload } = payload ?? {};
                if (!targetRoomKey || !editPayload) {
                    return ack?.({ status: 'error', message: '缺少必要參數' });
                }
                const itemsToUpdate = Array.isArray(editPayload) ? editPayload : [editPayload];
                const updateResult = await axios.post(`${getPythonApiBaseUrl()}/api/v1/material/updateMaterial`, itemsToUpdate);

                if (updateResult.status >= 200 && updateResult.status < 300) {
                    const itemCodesToUpdate = itemsToUpdate.map(item => String(item.itemCode));

                    const dbRows = await prismaMes.qualityassurancelist.findMany({
                        where: {
                            itemCode: { in: itemCodesToUpdate }
                        }
                    });

                    const zsetKey = getZsetKey();
                    const hashKey = getHashKey();

                    for (const row of dbRows) {
                        const mapped = {
                            productClassify: row.productClassify ?? null,
                            itemCode: row.itemCode ? String(row.itemCode) : null,
                            itemName: row.itemName ? String(row.itemName) : null,
                            specification: String(row.specification ?? ''),
                            Vendor: row.Vendor ?? null,
                            founder: row.founder ?? null,
                            founderId: row.founderId ?? null,
                            foundTime: row.foundTime ?? null,
                            edit_empName: row.edit_empName ?? null,
                            edit_empNumber: row.edit_empNumber ?? null,
                            edit_time: row.edit_time ?? null,
                            nowStatus: row.nowStatus ?? null,
                            otherMemo: row.otherMemo ?? null,
                        };

                        const timeVal = mapped.foundTime || mapped.edit_time || new Date();
                        let score = new Date(timeVal).getTime();
                        if (isNaN(score)) score = new Date().getTime();

                        await redis.hSet(hashKey, mapped.itemCode, JSON.stringify(mapped));
                        await redis.zAdd(zsetKey, { score, value: mapped.itemCode });
                    }

                    ack?.({ status: 'success' });
                    io.to(targetRoomKey).emit('material:updated', {
                        message: `物料已更新`,
                    });
                }

            } catch (error: any) {
                console.error('[material:update:request] 錯誤詳情:', error?.message ?? error);
                ack?.({ status: 'error', message: '更新失敗', detail: error?.message });
            }
        });

        socket.on('disconnect', () => {
            console.log(`🔌 使用者斷線: ${socket.id}`);
        });
    });
}

router.get('/drop_devision', async (req, res) => {
    try {
        const client = redis.getClient();
        await client.del(getZsetKey(), getHashKey());
        console.log(`🧹 已清除 ZSET 與 Hash 快取`);

        return res.json({ success: true, message: "快取已清除" });
    } catch (error) {
        console.error("Error drop_devision:", error);
        return res.status(500).json({ error: "drop_devision cache clear error" });
    }
})

const getListCacheKey = (page: number, pageSize: number, keyword = '') => '';

Object.assign(router, {
    bindMaterialSocketHandlers,
    buildListData,
    getListCacheKey,
});

module.exports = router;