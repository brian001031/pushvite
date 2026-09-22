
type RoomKey = string;
import moment from 'moment-timezone';


type storeListData = {
    rows: any[] | any,
    page: number,
    pageSize: number,
    total: number,
}

const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫
const dbcon = require(__dirname + "/../modules/mysql_connect.js");     // hr 資料庫


const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');


const redisClient = require(__dirname + "/../modules/redisConnect.js"); // Redis 連線模組

const ENGINEER_SETTING_CACHE_TTL_SECONDS = 60 * 60 * 24;

type RedisData = {
    data: any | null,
    option: string | null
}

const redisLine = [] as RedisData[];

const getPythonApiBaseUrl = () => {
    return process.env.PYTHON_API_BASE_URL ?? process.env.REACT_APP_PYTHON_API_BASE_URL ?? 'http://localhost:8000';
}

const getPythonApiUrl = (endpoint) => {
    const baseUrl = getPythonApiBaseUrl();
    return `${baseUrl}${endpoint}`;
}

const hasUsableCachePayload = (parsedCache) => {
    return parsedCache && (parsedCache.status === 'old' || parsedCache.status === 'new') && parsedCache.data !== undefined;
}

const REDIS_PREFIX = 'warehouse:list';
const getZsetKey = () => `${REDIS_PREFIX}zset`
const getHashKey = () => `${REDIS_PREFIX}data`



// 預熱緩存資料
const populateMaterialCache = async (redis: any) => {

    const zsetKey = getZsetKey()
    const hashKey = getHashKey()

    const pipeline = redis.multi();
    pipeline.del(zsetKey)
    pipeline.del(hashKey)

    try {
        const response = await axios.get(getPythonApiUrl('/api/v1/stock/populateMaterialCache'))

        let dataSet = typeof response.data === 'string' ? JSON.parse(response.data) : (response.data || {})
        if (dataSet?.status === "success") {
            for (const data of dataSet.data) {

                const itemKey = String(data.id ?? `${data.storeName}_${data.location}`);
                const timeVal = data.edit_time;
                let score = new Date(timeVal).getTime();
                if (isNaN(score)) {
                    score = Date.now();
                }
                if (itemKey) {
                    pipeline.hSet(hashKey, itemKey, JSON.stringify(data));
                    pipeline.zAdd(zsetKey, { score, value: itemKey });
                }
            }
            await pipeline.exec();

            await redis.expire(zsetKey, ENGINEER_SETTING_CACHE_TTL_SECONDS)
            await redis.expire(hashKey, ENGINEER_SETTING_CACHE_TTL_SECONDS)

            console.log('[warehouse:list:preheat] 預熱完成')
            return true;
        }

    } catch (error: unknown | any) {
        console.error(`[warehouse:list:preheat] 預熱失敗:`, error);
        return false;
    }
}

const bindWarehouseHandlers = ({
    io, redis, room = 'wareHouseManageRoom'
}: {
    io: any,
    redis: any,
    room: RoomKey
}) => {
    io.on('connection', (socket: any) => {
        console.log(`使用者連線成功 ${socket.id}`)

        socket.on('joinRoom', (payload: any, ack: any) => {
            const incomingRoomKey = typeof payload === 'string' ? payload : payload?.room;
            if (incomingRoomKey === room) {
                socket.join(room)
                console.log(`使用者 ${socket.id} 加入 ${room}`)
                socket.emit('roomJoined', room)
            }

            if (typeof ack === 'function') {
                ack({ status: 'success', message: `成功加入 ${room} 房間` })
            }
        })
        socket.on('disconnect', () => {
            console.log(`使用者斷線 ${socket.id}`)
        })

        socket.on('warehouse:list:request', async (payload: any, ack: any) => {
            const { page = 1, pageSize = 10, keyword = '' } = payload ?? {}
            try {
                if (keyword !== '') {
                    const rows = await axios.get(getPythonApiUrl('/api/v1/stock/uniqueFind'), {
                        params: {
                            keyword
                        }
                    })
                    console.log('warehouse:list:request 在有輸入keyWork 下的回覆', rows.data)

                    const listData = {
                        data: rows.data.data,
                        total: rows.data.total,
                        page: rows.data.page,
                        pageSize: rows.data.pageSize
                    }

                    return ack({
                        status: 'success',
                        ...listData,
                    })
                }

                const zsetKey = getZsetKey() // 索引 key
                const hashKey = getHashKey() // 資料 key


                const cacheExists = await redis.exists(zsetKey)
                console.log('確認下 cacheExists :', cacheExists)
                if (cacheExists === 0) { await populateMaterialCache(redis) }

                let parsedPage = parseInt(page ?? 1, 10);
                let parsedPageSize = parseInt(pageSize ?? 10, 10);
                if (Number.isNaN(parsedPage)) { parsedPage = 1 }
                if (Number.isNaN(parsedPageSize)) { parsedPageSize = 1 }

                const skip = parsedPage >= 1 ? (parsedPage - 1) * parsedPageSize : 1;
                const take = parsedPageSize

                const itemCodes = await redis.sendCommand([
                    'ZREVRANGEBYSCORE',
                    zsetKey,
                    '+inf',
                    '-inf',
                    'LIMIT',
                    String(skip),
                    String(take)
                ])

                let totalCount = await redis.zCount(zsetKey, '-inf', '+inf')
                if (totalCount < 0) { totalCount = 0 }
                const parsedTotalCount = Number.isNaN(totalCount) ? 0 : totalCount;

                let rows = [];

                if (itemCodes.length > 0) {
                    const rawRecords = await redis.hmGet(hashKey, itemCodes)
                    rows = rawRecords.map((raw: any) => raw ? JSON.parse(raw) : null).filter(Boolean)
                }

                return ack({
                    status: 'success',
                    data: rows,
                    total: parsedTotalCount,
                    page: parsedPage,
                    pageSize: parsedPageSize
                })
            } catch (error: any | undefined) {
                console.error('warehouse:list:request error:', error)
                return ack({
                    status: 'error',
                    message: 'Internal Server Error',
                })
            }
        }),
            socket.on('warehouse:create:request', async (payload: any, ack: any) => {
                console.log('wareHouseManageRoom create:request', typeof payload, Object.keys(payload || {}), payload)

                try {
                    const response = await axios.post(getPythonApiUrl('/api/v1/stock/createStore'), payload)
                    const newData = await populateMaterialCache(redis); // 資料庫異動 -> 更新快取

                    const skip = 0;
                    const take = 10;

                    const zsetKey = getZsetKey()
                    const hashKey = getHashKey()

                    const itemCodes = await redis.sendCommand([
                        'ZREVRANGEBYSCORE',
                        zsetKey,
                        '+inf',
                        '-inf',
                        'LIMIT',
                        String(skip),
                        String(take)
                    ])


                    if (newData) {
                        const rawRecords = await redis.hmGet(hashKey, itemCodes)
                        const rows = rawRecords.map((raw: any) => raw ? JSON.parse(raw) : null).filter(Boolean)

                        let totalCount = await redis.zCount(zsetKey, '-inf', '+inf')
                        if (totalCount < 0) { totalCount = 0 }
                        const parsedTotalCount = Number.isNaN(totalCount) ? 0 : totalCount;

                        // 廣播給同一個房間的所有使用者，並附帶最新資料 payload
                        io.to(room).emit('wareHouseManageRoom:update', {
                            status: 'success',
                            data: {
                                rows: rows,
                                total: parsedTotalCount,
                                page: 1,
                                pageSize: 10
                            }
                        });

                        return ack({
                            status: 'success',
                            message: '新增成功',
                            data: rows
                        })
                    }

                    return ack({
                        status: 'error',
                        message: '新增失敗',
                        data: []
                    })
                } catch (error: unknown | any) {
                    console.log(`warehouse:create:request error:`, error)
                    return ack({
                        status: 'error',
                        message: '新增失敗',
                    })
                }
            }),
            socket.on('warehouse:edit:request', async (payload: any, ack: any) => {
                // console.log('check warehouse request payload  :', typeof payload, Object.keys(payload || {}), payload)

                const checkExistsArray = payload.editPayload || []
                console.log('確認chekExistsArray : ', typeof checkExistsArray, checkExistsArray)


                try {

                    const result = await axios.post(getPythonApiUrl('/api/v1/stock/updateStore'), payload)
                    console.log('result of update warehouse : ', typeof result, result.data)

                    if (result) {
                        await populateMaterialCache(redis)

                        const skip = 0;
                        const take = 10;

                        const zsetKey = getZsetKey();
                        const hashKey = getHashKey();

                        const itemCodes = await redis.sendCommand([
                            'ZREVRANGEBYSCORE',
                            zsetKey,
                            '+inf',
                            '-inf',
                            'LIMIT',
                            String(skip),
                            String(take)
                        ])

                        let totalCount = await redis.zCount(zsetKey, '-inf', '+inf');

                        if (totalCount < 0) { totalCount = 0; }
                        const parsedTotalCount = Number.isNaN(totalCount) ? 0 : totalCount;

                        let rows = [];
                        if (itemCodes.length > 0) {
                            const rawRecords = await redis.hmGet(hashKey, itemCodes)
                            rows = rawRecords.map((raw: any) => raw ? JSON.parse(raw) : null).filter(Boolean)
                        }

                        io.to(room).emit('wareHouseManageRoom:update', {
                            status: 'success',
                            message: '更新成功',
                            data: {
                                rows: rows,
                                total: parsedTotalCount,
                                page: 1,
                                pageSize: 10
                            }
                        })

                        return ack({
                            status: 'success',
                            message: '更新成功',
                            data: payload
                        })

                    } else {
                        return ack({
                            status: 'error',
                            message: '更新失敗',
                            data: payload
                        })
                    }


                } catch (error: any | unknown) {
                    console.log('warehouse:edit:request error:', error)
                    return ack({
                        status: 'error',
                        message: '更新失敗',
                        data: payload
                    })
                }

            })
        socket.on('warehouse:delete:request', async (payload: any, ack: any) => {
            console.log('check Received delete payload : ', typeof payload, Object.keys(payload || {}), payload)

            try {
                const response = await axios.post(getPythonApiUrl('/api/v1/stock/deleteStore'), payload)
                const newData = await populateMaterialCache(redis); // 資料庫異動 -> 更新快取

                const skip = 0;
                const take = 10;

                const zsetKey = getZsetKey()
                const hashKey = getHashKey()

                const itemCodes = await redis.sendCommand([
                    'ZREVRANGEBYSCORE',
                    zsetKey,
                    '+inf',
                    '-inf',
                    'LIMIT',
                    String(skip),
                    String(take)
                ])

                if (newData) {
                    const rawRecords = await redis.hmGet(hashKey, itemCodes)
                    const rows = rawRecords.map((raw: any) => raw ? JSON.parse(raw) : null).filter(Boolean)

                    let totalCount = await redis.zCount(zsetKey, '-inf', '+inf')
                    if (totalCount < 0) { totalCount = 0 }
                    const parsedTotalCount = Number.isNaN(totalCount) ? 0 : totalCount;

                    // 廣播給同一個房間的所有使用者，並附帶最新資料 payload
                    io.to(room).emit('wareHouseManageRoom:update', {
                        status: 'success',
                        data: {
                            rows: rows,
                            total: parsedTotalCount,
                            page: 1,
                            pageSize: 10
                        }
                    });

                    return ack({
                        status: 'success',
                        message: '刪除成功',
                        data: rows
                    })
                }

                return ack({
                    status: 'error',
                    message: '刪除失敗',
                    data: []
                })
            } catch (error: unknown | any) {
                console.log(`warehouse:delete:request error:`, error)
                return ack({
                    status: 'error',
                    message: '刪除失敗',
                })
            }
        })
    })
}

router.post('/requestTransferApply', async (req, res) => {
    const { payload } = req.body

    try {
        const response = await axios.post(getPythonApiUrl('/api/v1/stock/requestTransferApply'), payload)
        if (response) {
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
    } catch (error: unknown | any) {
        console.log(`requestTransferApply error:`, error)
        return res.status(500).json({
            status: 'error',
            message: '調撥申請失敗',
            data: []
        })
    }
})

module.exports = {
    bindWarehouseHandlers
}
