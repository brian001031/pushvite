import { json } from "body-parser";
import { group } from "console";
import { create } from "domain";
import moment from 'moment-timezone';
const nodemailer = require('nodemailer');

const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");
const jwt = require("jsonwebtoken");
// 讀取 .env 檔案
const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫
const dbcon = require(__dirname + "/../modules/mysql_connect.js");     // hr 資料庫

const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();

const redisClient = require(__dirname + "/../modules/redisConnect.js"); // Redis 連線模組
const {
    LOGIN_SOCKET_EVENT,
    buildLoginStateValue,
    broadcastNowLoginUpdate,
    fetchNowLoginList,
    getNowLoginRoomName,
    readLoginState,
    writeLoginState,
} = require(__dirname + "/../modules/loginState.ts");


// JWT Secret (使用 .env 中的設定，與 index.js 一致)
const JWT_SECRET = process.env.JWT_SECRET;
const ENGINEER_SETTING_CACHE_TTL_SECONDS = 60 * 60 * 24;
const PYTHON_API_TIMEOUT_MS = Number(process.env.PYTHON_API_TIMEOUT_MS ?? 8000);

// 將資料轉進 redis內 的格式
type RedisData = {
    data: any | null,
    option: string | null
}

const redisLine = [] as RedisData[];


const changeFindTime = (
    select: string,
    start: string,
    end: Date,
    shift: string
) => {
    if (select) {
        if (select === 'accordingShift') {


            if (shift && shift === '早班') {
                return {
                    startTime: moment(start).tz('Asia/Taipei').hour(8).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss'),
                    endTime: moment(start).tz('Asia/Taipei').hour(19).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss'),
                    shiftCheck: shift as string
                }
            } else if (shift && shift === '晚班') {
                return {
                    startTime: moment(start).tz('Asia/Taipei').hour(20).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss'),
                    endTime: moment(start).tz('Asia/Taipei').add(1, 'days').hour(7).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss'),
                    shiftCheck: shift as string
                }
            } else {
                return null
            }

        } else if (select === 'accordingTimeRange') {

            return {
                startTime: moment(start).tz('Asia/Taipei').hour(0).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss'),
                endTime: moment(end).tz('Asia/Taipei').hour(23).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss'),
                shiftCheck: ''
            }

        } else {

        }
    } else {
        return {
            status: 400,
            message: '缺少查詢條件'
        }
    }
}


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


// 將資料送進 redis ( timely report )
router.get('/getTimelyReport', async (req, res) => {
    const _ = req.query;

    // 取得台北時間今天的開始與結束，並轉為 Date 物件
    let nowStart, nowEnd = null;

    const checkShift = () => {
        const currentHour = moment().tz('Asia/Taipei').hour();
        if (currentHour >= 8 && currentHour < 20) {
            return 'day';
        } else {
            return 'night';
        }
    }

    if (checkShift() === 'night') {
        nowStart = moment().tz('Asia/Taipei').subtract(1, 'day').hour(20).minute(0).second(0).toDate();
        nowEnd = moment().tz('Asia/Taipei').hour(7).minute(59).second(59).toDate();
    } else {
        nowStart = moment().tz('Asia/Taipei').hour(8).minute(0).second(0).toDate();
        nowEnd = moment().tz('Asia/Taipei').hour(19).minute(59).second(59).toDate();
    }

    try {

        const reponsePython = await axios.get(getPythonApiUrl('/getTimelyReport'), {
            params: {
                nowStart: moment(nowStart).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
                nowEnd: moment(nowEnd).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
            }
        })

        console.log('Python API /getTimelyReport response:', reponsePython.data);

        const finalPayload = reponsePython.data;



        res.status(200).json({
            message: '成功取得即時報表資料',
            data: finalPayload,

        });

    } catch (err) {
        console.error('Error in getTimelyReport while processing response:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// 取得工程師設定
router.get('/getEngineerSetting', async (req, res) => {

    // console.log('Received request for getEngineerSetting with query:', req.query);
    const employeeID = String(req.query.employeeNo || '').trim();

    if (!employeeID) {
        return res.status(400).json({ error: 'employeeID 為必填欄位' });
    }

    try {

        // 先從 Redis 嘗試取得資料，命中就直接回傳以降低後端查詢負擔
        const key = `modelCutting:getEngineerSetting:${employeeID}`;

        // console.log ('getEngineerSetting - Attempting to retrieve from Redis with key:', key);
        let responseRedis = null;
        try {
            responseRedis = await redisClient.get(key);
        } catch (redisError) {
            console.warn('getEngineerSetting - Redis get failed, fallback to Python API:', redisError.message || redisError);
        }

        console.log('getEngineerSetting - Redis response for key:', key, 'is:', responseRedis ? 'HIT' : 'MISS');

        if (responseRedis) {
            // console.log ('getEngineerSetting - Redis cache hit for key:', key);
            try {
                const parsedCache = JSON.parse(responseRedis);

                if (hasUsableCachePayload(parsedCache)) {
                    try {
                        await redisClient.expire(key, ENGINEER_SETTING_CACHE_TTL_SECONDS);
                    } catch (redisError) {
                        console.warn('getEngineerSetting - Redis expire failed:', redisError.message || redisError);
                    }
                    // console.log("Returning cached data from Redis:", parsedCache.data);
                    return res.status(200).json(parsedCache.data);
                }

                console.warn('Redis cache payload invalid, fallback to Python API:', parsedCache);
            } catch (parseError) {
                console.warn('Redis cache parse failed, fallback to Python API:', parseError);
            }
        }


        // Redis 沒有可用快取時，直接從資料庫取得最新資料並寫回快取
        const rows = await prismaHr.cuttingRegister.findMany({
            where: {
                engineerId: employeeID,
                selectWork: {
                    in: ['Cathode', 'Anode']
                }
            },
            include: {
                modelSettings: true
            }
        });

        // 尋找對應的工程師名字
        let engineerName = '';
        if (rows.length > 0) {
            engineerName = rows[0].engineerName;
        } else {
            // 如果沒在設定表，從 scheduleRegInfo 查詢名字
            const memberInfo = await prismaHr.scheduleRegInfo.findFirst({
                where: { memberID: employeeID },
                select: { regScheduleName: true }
            });
            if (memberInfo) {
                engineerName = memberInfo.regScheduleName;
            }
        }

        const CathodeRow = rows.find((r: any) => r.selectWork === 'Cathode');
        const AnodeRow = rows.find((r: any) => r.selectWork === 'Anode');

        const parseItemNoSet = (val: string | null) => {
            if (!val) return [];
            try {
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        };

        const parseEachBatteryForPeace = (val: any) => {
            if (val === null || val === undefined) return [];
            if (Array.isArray(val)) return val;
            return [val];
        };

        const buildItemNoSetWithSpeeds = (row: any) => {
            if (!row) return [];
            if (row.modelSettings && Array.isArray(row.modelSettings) && row.modelSettings.length > 0) {
                return row.modelSettings.map((setting: any) => ({
                    [setting.itemNoSet]: {
                        speed_start: setting.producingSpeed_Start !== null && setting.producingSpeed_Start !== undefined ? String(setting.producingSpeed_Start) : "",
                        speed_end: setting.producingSpeed_End !== null && setting.producingSpeed_End !== undefined ? String(setting.producingSpeed_End) : ""
                    }
                }));
            }

            // 降級處理：若無子表關聯記錄，則解析主表中的 json 字串
            const parsed = parseItemNoSet(row.itemNoSet);
            return parsed.map((item: any) => {
                if (typeof item === 'string') {
                    return {
                        [item]: {
                            speed_start: "",
                            speed_end: ""
                        }
                    };
                }
                return item;
            });
        };

        const resultPayload = {
            employeeID: employeeID,
            engineerName: engineerName,
            Cathode: CathodeRow ? {
                itemNoSet: buildItemNoSetWithSpeeds(CathodeRow),
                eachBatteryForPeace: parseEachBatteryForPeace(CathodeRow.eachBatteryForPeace),
                producingDiscount: CathodeRow.producingDiscount ? String(CathodeRow.producingDiscount) : "",
                wo: CathodeRow.wo ? String(CathodeRow.wo) : "",
                cellCount: CathodeRow.cellCount ? String(CathodeRow.cellCount) : ""
            } : {
                itemNoSet: [],
                eachBatteryForPeace: [],
                producingDiscount: "",
                wo: "",
                cellCount: ""
            },
            Anode: AnodeRow ? {
                itemNoSet: buildItemNoSetWithSpeeds(AnodeRow),
                eachBatteryForPeace: parseEachBatteryForPeace(AnodeRow.eachBatteryForPeace),
                producingDiscount: AnodeRow.producingDiscount ? String(AnodeRow.producingDiscount) : "",
                wo: AnodeRow.wo ? String(AnodeRow.wo) : "",
                cellCount: AnodeRow.cellCount ? String(AnodeRow.cellCount) : ""
            } : {
                itemNoSet: [],
                eachBatteryForPeace: [],
                producingDiscount: "",
                wo: "",
                cellCount: ""
            }
        };

        const cacheValue = {
            status: 'old',
            data: resultPayload,
            updatedAt: moment().tz('Asia/Taipei').format()
        };

        try {
            await redisClient.set(key, JSON.stringify(cacheValue), { EX: ENGINEER_SETTING_CACHE_TTL_SECONDS });
        } catch (redisError) {
            console.warn('getEngineerSetting - Redis set failed:', redisError.message || redisError);
        }

        // 非同步更新資料庫狀態為 'old'
        const needUpdateRows = rows.filter((r: any) => r.recordForRedis_Status !== 'old');
        if (needUpdateRows.length > 0) {
            prismaHr.cuttingRegister.updateMany({
                where: {
                    engineerId: employeeID,
                    selectWork: { in: ['Cathode', 'Anode'] }
                },
                data: {
                    recordForRedis_Status: 'old'
                }
            }).catch((err: any) => console.warn('Async update recordForRedis_Status failed:', err));

            prismaHr.cuttingRegisterModelSetting.updateMany({
                where: {
                    engineerId: employeeID,
                    selectWork: { in: ['Cathode', 'Anode'] }
                },
                data: {
                    status: 'old',
                    recordForRedis_Status: 'old'
                }
            }).catch((err: any) => console.warn('Async update cuttingRegisterModelSetting status failed:', err));
        }

        return res.status(200).json(resultPayload);

    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: '伺服器錯誤', detail: err.message || err });
    }
})

// 更新工程師設定
router.post('/updateEngineerSetting', async (req, res) => {
    const data = req.body;
    let responseData = null

    if (!data || !data.employeeID) {
        return res.status(400).json({ error: 'employeeID 為必填欄位' });
    }

    try {
        let hrDB = prismaHr;

        const employeeID = String(data.employeeID || '').trim();
        let employeeName = String(data.employeeName || data.engineerName || '').trim();

        // 如果前端或 API 沒有提供姓名（例如為空），則自 scheduleRegInfo 查詢該工號對應的官方姓名
        if (!employeeName) {
            const memberInfo = await hrDB.scheduleRegInfo.findFirst({
                where: { memberID: employeeID },
                select: { regScheduleName: true }
            });
            if (memberInfo) {
                employeeName = memberInfo.regScheduleName;
            }
        }

        // 1. 取得資料庫中該工程師目前的附表設定 (cuttingRegisterModelSetting)
        const attachModel = await hrDB.cuttingRegisterModelSetting.findMany({
            where: {
                engineerName: employeeName,
                engineerId: employeeID,
            },
            select: {
                selectWork: true,
                itemNoSet: true,
                producingSpeed_Start: true,
                producingSpeed_End: true,
            }
        });

        // 動態解析多種 payload 結構之輔助函式
        const getWorkDetails = (select: string) => {
            const val = data[select];
            if (!val) return null;
            if (Array.isArray(val)) {
                return val[0] || null;
            }
            return val;
        };

        interface ExtractedMachine {
            name: string;
            producingSpeed_Start: number | null;
            producingSpeed_End: number | null;
        }

        const extractMachinesWithSpeeds = (itemNoSetVal: any): ExtractedMachine[] => {
            if (!itemNoSetVal) return [];
            if (Array.isArray(itemNoSetVal)) {
                const list: ExtractedMachine[] = [];
                for (const item of itemNoSetVal) {
                    if (typeof item === 'string') {
                        list.push({
                            name: item.trim(),
                            producingSpeed_Start: null,
                            producingSpeed_End: null
                        });
                    } else if (item && typeof item === 'object') {
                        const keys = Object.keys(item);
                        for (const k of keys) {
                            const inner = item[k];
                            let speedStart: number | null = null;
                            let speedEnd: number | null = null;
                            if (inner && typeof inner === 'object') {
                                const sStart = inner.speed_start !== undefined ? inner.speed_start : inner.producingSpeed_Start;
                                const sEnd = inner.speed_end !== undefined ? inner.speed_end : inner.producingSpeed_End;
                                if (sStart !== undefined && sStart !== null && sStart !== '') {
                                    speedStart = parseInt(sStart, 10);
                                    if (isNaN(speedStart)) speedStart = null;
                                }
                                if (sEnd !== undefined && sEnd !== null && sEnd !== '') {
                                    speedEnd = parseInt(sEnd, 10);
                                    if (isNaN(speedEnd)) speedEnd = null;
                                }
                            }
                            list.push({
                                name: k.trim(),
                                producingSpeed_Start: speedStart,
                                producingSpeed_End: speedEnd
                            });
                        }
                    }
                }
                return list.filter(m => m.name);
            } else if (typeof itemNoSetVal === 'object') {
                return Object.values(itemNoSetVal)
                    .map((v: any) => {
                        if (typeof v === 'string') {
                            return { name: v.trim(), producingSpeed_Start: null, producingSpeed_End: null };
                        } else if (v && typeof v === 'object') {
                            const keys = Object.keys(v);
                            if (keys.length > 0) {
                                const k = keys[0];
                                const inner = v[k];
                                let speedStart: number | null = null;
                                let speedEnd: number | null = null;
                                if (inner && typeof inner === 'object') {
                                    const sStart = inner.speed_start !== undefined ? inner.speed_start : inner.producingSpeed_Start;
                                    const sEnd = inner.speed_end !== undefined ? inner.speed_end : inner.producingSpeed_End;
                                    if (sStart !== undefined && sStart !== null && sStart !== '') {
                                        speedStart = parseInt(sStart, 10);
                                        if (isNaN(speedStart)) speedStart = null;
                                    }
                                    if (sEnd !== undefined && sEnd !== null && sEnd !== '') {
                                        speedEnd = parseInt(sEnd, 10);
                                        if (isNaN(speedEnd)) speedEnd = null;
                                    }
                                }
                                return { name: k.trim(), producingSpeed_Start: speedStart, producingSpeed_End: speedEnd };
                            }
                        }
                        return null;
                    })
                    .filter((m): m is ExtractedMachine => m !== null && !!m.name);
            }
            return [];
        };

        const CathodeDetails = getWorkDetails('Cathode');
        const AnodeDetails = getWorkDetails('Anode');

        // 2. 整理前端傳入的 Cathode / Anode 機器與速度設定
        const CathodeMachineConfigs = CathodeDetails ? extractMachinesWithSpeeds(CathodeDetails.itemNoSet) : [];
        const AnodeMachineConfigs = AnodeDetails ? extractMachinesWithSpeeds(AnodeDetails.itemNoSet) : [];

        // 3. 整理資料庫中既有的 Cathode / Anode 機器與速度設定
        const cathodeDbConfigs = attachModel
            .filter((item: any) => item.selectWork === 'Cathode' && item.itemNoSet)
            .map((item: any) => ({
                name: item.itemNoSet as string,
                producingSpeed_Start: item.producingSpeed_Start,
                producingSpeed_End: item.producingSpeed_End
            }));
        const anodeDbConfigs = attachModel
            .filter((item: any) => item.selectWork === 'Anode' && item.itemNoSet)
            .map((item: any) => ({
                name: item.itemNoSet as string,
                producingSpeed_Start: item.producingSpeed_Start,
                producingSpeed_End: item.producingSpeed_End
            }));

        // 4. 比對清單與速度設定是否發生改變
        const isCathodeChanged =
            CathodeMachineConfigs.length !== cathodeDbConfigs.length ||
            CathodeMachineConfigs.some(m => {
                const dbMatch = cathodeDbConfigs.find(db => db.name === m.name);
                if (!dbMatch) return true;
                return dbMatch.producingSpeed_Start !== m.producingSpeed_Start ||
                    dbMatch.producingSpeed_End !== m.producingSpeed_End;
            }) ||
            cathodeDbConfigs.some(db => !CathodeMachineConfigs.some(m => m.name === db.name));

        const isAnodeChanged =
            AnodeMachineConfigs.length !== anodeDbConfigs.length ||
            AnodeMachineConfigs.some(m => {
                const dbMatch = anodeDbConfigs.find(db => db.name === m.name);
                if (!dbMatch) return true;
                return dbMatch.producingSpeed_Start !== m.producingSpeed_Start ||
                    dbMatch.producingSpeed_End !== m.producingSpeed_End;
            }) ||
            anodeDbConfigs.some(db => !AnodeMachineConfigs.some(m => m.name === db.name));

        // 決定哪些 SelectWork 需要更新
        let selectWorkList = Array.isArray(data.selectWork)
            ? data.selectWork
            : (typeof data.selectWork === 'string' ? [data.selectWork] : []);

        if (selectWorkList.length === 0) {
            // 如果 payload 缺少 selectWork，動態根據有沒有帶 Cathode/Anode 欄位來決定
            if (CathodeDetails) selectWorkList.push('Cathode');
            if (AnodeDetails) selectWorkList.push('Anode');
        }

        // 5. 在 transaction 中進行同步更新 (支持第一次創建與後續更新)
        await prismaHr.$transaction(async (tx: any) => {
            for (const select of selectWorkList) {
                const workDetails = getWorkDetails(select);
                if (!workDetails) continue;

                const machineConfigs = extractMachinesWithSpeeds(workDetails.itemNoSet);
                const machinesList = machineConfigs.map(m => m.name);
                const hasChanged = select === 'Cathode' ? isCathodeChanged : isAnodeChanged;

                // 5a. 更新或創建主表 (cuttingRegister)
                await tx.cuttingRegister.upsert({
                    where: {
                        selectWork_engineerName_engineerId: {
                            selectWork: select,
                            engineerName: employeeName,
                            engineerId: employeeID
                        }
                    },
                    update: {
                        cellCount: workDetails.cellCount !== undefined ? String(workDetails.cellCount) : undefined,
                        producingDiscount: workDetails.producingDiscount !== undefined ? String(workDetails.producingDiscount) : undefined,
                        itemNoSet: JSON.stringify(machinesList),
                        wo: workDetails.wo !== undefined ? String(workDetails.wo) : undefined,
                        eachBatteryForPeace: workDetails.eachBatteryForPeace !== undefined ? workDetails.eachBatteryForPeace : undefined,
                        recordForRedis_Status: 'new'
                    },
                    create: {
                        selectWork: select,
                        engineerName: employeeName,
                        engineerId: employeeID,
                        cellCount: workDetails.cellCount !== undefined ? String(workDetails.cellCount) : '',
                        producingDiscount: workDetails.producingDiscount !== undefined ? String(workDetails.producingDiscount) : '',
                        itemNoSet: JSON.stringify(machinesList),
                        wo: workDetails.wo !== undefined ? String(workDetails.wo) : '',
                        eachBatteryForPeace: workDetails.eachBatteryForPeace !== undefined ? workDetails.eachBatteryForPeace : null,
                        recordForRedis_Status: 'new'
                    }
                });

                // 5b. 刪除該工序中，已不存在於新設定清單中的機器 (附表 cuttingRegisterModelSetting)
                await tx.cuttingRegisterModelSetting.deleteMany({
                    where: {
                        selectWork: select,
                        engineerName: employeeName,
                        engineerId: employeeID,
                        itemNoSet: {
                            notIn: machinesList
                        }
                    }
                });

                // 5c. 更新或新增新設定清單中的每一台機器 (附表 cuttingRegisterModelSetting)
                for (const machine of machineConfigs) {
                    await tx.cuttingRegisterModelSetting.upsert({
                        where: {
                            selectWork_itemNoSet_engineerName_engineerId: {
                                selectWork: select,
                                itemNoSet: machine.name,
                                engineerName: employeeName,
                                engineerId: employeeID
                            }
                        },
                        update: {
                            lastEdit_Time: new Date(),
                            lastEdit_Name: employeeName,
                            lastEdit_Number: parseInt(employeeID, 10) || null,
                            producingSpeed_Start: machine.producingSpeed_Start,
                            producingSpeed_End: machine.producingSpeed_End,
                            status: hasChanged ? 'new' : undefined,
                            recordForRedis_Status: 'new'
                        },
                        create: {
                            selectWork: select,
                            itemNoSet: machine.name,
                            engineerName: employeeName,
                            engineerId: employeeID,
                            lastEdit_Time: new Date(),
                            lastEdit_Name: employeeName,
                            lastEdit_Number: parseInt(employeeID, 10) || null,
                            producingSpeed_Start: machine.producingSpeed_Start,
                            producingSpeed_End: machine.producingSpeed_End,
                            status: 'new',
                            recordForRedis_Status: 'new'
                        }
                    });
                }
            }
        });

        // 6. 更新快取與回傳給前端
        const pythonResponseData = {
            employeeID: employeeID,
            engineerName: employeeName,
            Cathode: CathodeDetails ? {
                itemNoSet: CathodeMachineConfigs.map(m => ({
                    [m.name]: {
                        speed_start: m.producingSpeed_Start !== null ? String(m.producingSpeed_Start) : "",
                        speed_end: m.producingSpeed_End !== null ? String(m.producingSpeed_End) : ""
                    }
                })),
                eachBatteryForPeace: Array.isArray(CathodeDetails.eachBatteryForPeace)
                    ? CathodeDetails.eachBatteryForPeace
                    : (CathodeDetails.eachBatteryForPeace ? [CathodeDetails.eachBatteryForPeace] : []),
                producingDiscount: CathodeDetails.producingDiscount ? String(CathodeDetails.producingDiscount) : "",
                wo: CathodeDetails.wo ? String(CathodeDetails.wo) : "",
                cellCount: CathodeDetails.cellCount ? String(CathodeDetails.cellCount) : ""
            } : {
                itemNoSet: [],
                eachBatteryForPeace: [],
                producingDiscount: "",
                wo: "",
                cellCount: ""
            },
            Anode: AnodeDetails ? {
                itemNoSet: AnodeMachineConfigs.map(m => ({
                    [m.name]: {
                        speed_start: m.producingSpeed_Start !== null ? String(m.producingSpeed_Start) : "",
                        speed_end: m.producingSpeed_End !== null ? String(m.producingSpeed_End) : ""
                    }
                })),
                eachBatteryForPeace: Array.isArray(AnodeDetails.eachBatteryForPeace)
                    ? AnodeDetails.eachBatteryForPeace
                    : (AnodeDetails.eachBatteryForPeace ? [AnodeDetails.eachBatteryForPeace] : []),
                producingDiscount: AnodeDetails.producingDiscount ? String(AnodeDetails.producingDiscount) : "",
                wo: AnodeDetails.wo ? String(AnodeDetails.wo) : "",
                cellCount: AnodeDetails.cellCount ? String(AnodeDetails.cellCount) : ""
            } : {
                itemNoSet: [],
                eachBatteryForPeace: [],
                producingDiscount: "",
                wo: "",
                cellCount: ""
            }
        };

        const key = `modelCutting:getEngineerSetting:${employeeID}`;
        const cacheValue = {
            status: 'new',
            data: pythonResponseData,
            updatedAt: moment().tz('Asia/Taipei').format(),
            pythonResponse: pythonResponseData
        };

        try {
            await redisClient.set(key, JSON.stringify(cacheValue), { EX: ENGINEER_SETTING_CACHE_TTL_SECONDS });
        } catch (redisError) {
            console.warn('updateEngineerSetting - Redis set failed:', redisError.message || redisError);
        }

        return res.status(200).json({ message: '工程師設定已更新並快取', data: pythonResponseData });

    } catch (error: any) {
        console.error('updateEngineerSetting failed:', error);
        return res.status(500).json({ error: '伺服器錯誤', detail: error.message || error });
    }

})

// 取得工程師資訊
router.get('/getEngineerInfo', async (req, res) => {
    // console.log('Received request for getEngineerInfo with query:', req.query);

    const employeeNo = String(req.query.employeeNo || '').trim();
    if (!employeeNo) {
        return res.status(400).json({ error: 'employeeNo 為必填欄位' });
    }

    try {
        let prisma = prismaHr;

        // 優先從 cuttingRegister 查詢該工號是否有設定記錄，以取得其當前使用的姓名
        const registerRecord = await prisma.cuttingRegister.findFirst({
            where: { engineerId: employeeNo },
            select: { engineerName: true }
        });

        // 同時也查詢 scheduleRegInfo 取得班別 (shift) 與備用姓名
        const regInfo = await prisma.scheduleRegInfo.findFirst({
            select: {
                memberID: true,
                regScheduleName: true,
                shift: true,
            },
            where: {
                memberID: employeeNo
            }
        });

        // 決定姓名：優先使用 cuttingRegister 的姓名，次之為 scheduleRegInfo 的姓名
        const employeeName = (registerRecord?.engineerName || regInfo?.regScheduleName || '').trim();
        const shift = regInfo?.shift || '早班';

        if (!employeeName) {
            return res.status(404).json({ error: `找不到人員資訊【Can't find ${employeeNo} in database】` });
        }

        res.status(200).json({
            employeeNo: employeeNo,
            employeeName: employeeName,
            shift: shift,
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '伺服器錯誤' });
    }
})

// 更新人員操作狀態
router.post('/loginOut', async (req, res) => {
    const {
        memberId,
        memberName,
        action,
        shift,
        selectWork,
        station,
    } = req.body;
    // if (!memberId || !action || !shift || !selectWork || !station) {
    //     return res.status(400).json({ error: '所有欄位為必填' });
    // }

    // console.log ('Received loginOut request with body:', req.body , {
    //     memberId,
    //     memberName,
    //     action,
    //     shift,
    //     selectWork,
    //     station,
    // });

    try {
        const value = buildLoginStateValue({
            memberId,
            memberName,
            action,
            shift,
            selectWork,
            station,
        });

        const { key, responseRedis, parsedRedis } = await readLoginState({ station, memberId, selectWork });

        if (action === 'delete') {
            try {

                await redisClient.del(key);
                // console.log(`Deleted Redis cache for key: ${key} due to delete action`);

                try {
                    await broadcastNowLoginUpdate({ station, selectWork, shift });
                } catch (emitError) {
                    console.warn('delete - socket emit failed:', emitError.message || emitError);
                }

                return res.status(200).json({ message: '人員狀態刪除', data: value });

            } catch (err) {
                console.warn('loginOut - Redis delete failed:', err.message || err);
            }
        }



        // console.log ('loginOut - Redis get response for key:', key, 'is:', responseRedis ? 'HIT' : 'MISS');

        if (parsedRedis && parsedRedis.action === action) {
            console.log('loginOut - Redis cache hit for key:', key);
            parsedRedis.diffTime = moment().tz('Asia/Taipei').diff(moment(parsedRedis.timestamp).tz('Asia/Taipei'), 'seconds');
            return res.status(200).json({ message: '沒有變更', data: parsedRedis });
        }

        // console.log ('loginOut - Redis cache miss or action mismatch for key:', key, 'with response:', parsedRedis || responseRedis);
        // console.log('check value which will sending to Python API:', typeof value ,' | ' ,value);
        try {
            await writeLoginState(value);
            const resp = await axios.post(getPythonApiUrl('/updateLoginOutState'), value, {
                timeout: PYTHON_API_TIMEOUT_MS,
            });
            // console.log("Python API /updateLoginOutState response:", resp.data);


            try {
                await broadcastNowLoginUpdate({ station, selectWork, shift });
            } catch (emitError) {
                console.warn('loginOut - socket emit failed:', emitError.message || emitError);
            }

            return res.status(200).json({ message: '人員狀態變更', data: value });
        } catch (err) {
            const redisState = typeof redisClient.getRedisState === 'function' ? redisClient.getRedisState() : null;
            console.warn('loginOut - Redis set failed, return without cache:', err.message || err, redisState || '');
            return res.status(200).json({ message: '人員狀態變更（未寫入快取）', data: value });
        }

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '伺服器錯誤' });
    }
})

// 接取目前人員操作狀態
const sendNowLoginResponse = async (req, res, defaultStation?: string) => {
    const station = req.query.station || defaultStation;
    const { selectWork } = req.query;
    if (!station || !selectWork) {
        return res.status(400).json({ error: '前端需要傳回 station 和 selectWork' });
    }

    try {
        const stationKey = String(station).trim();
        const selectWorkKey = String(selectWork).trim();
        const response = await fetchNowLoginList(stationKey, selectWorkKey);

        return res.status(200).json({
            message: '成功取得目前人員操作狀態',
            data: response,
            room: getNowLoginRoomName(stationKey, selectWorkKey),
            socketEvent: LOGIN_SOCKET_EVENT
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '伺服器錯誤' });
    }
};


router.get('/getOnlineMembers', async (req, res) => {
    return sendNowLoginResponse(req, res, 'modelCutting');
})

router.get('/getEmpIni', async (req, res) => {
    const selectWork = req.query.selectWork;

    let finalSend = null;
    // console.log('Received getEmpIni request with selectWork:', selectWork);

    if (!selectWork) {
        return res.status(400).json({ error: 'selectWork 為必填欄位' });
    }

    try {
        const response = await axios.get(getPythonApiUrl(`/getOnlineMembers?selectWork=${selectWork}`));
        // console.log('Python API getOnlineMembers response:', response.data);
        if (response.status !== 200) {
            // console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 取得人員狀態失敗', detail: response.data });
        }

        const onlineMemberList = Array.isArray(response.data)
            ? response.data
            : Array.isArray(response.data?.data)
                ? response.data.data
                : [];

        finalSend = onlineMemberList.filter((item: any) => String(item?.action || '').trim() === 'login');
        return res.status(200).json(finalSend);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '伺服器錯誤' });
    }
})



// 抓取來料批號資訊
router.get('/getIncommingLotNo', async (req, res) => {
    const { selectWork } = req.query;

    // console.log('Received getIncommingLotNo request with selectWork:', selectWork);

    if (!selectWork) {
        return res.status(400).json({ error: 'selectWork 為必填欄位' });
    }

    try {

        const response = await axios.get(getPythonApiUrl(`/getIncommingLotNo?selectWork`), {
            params: { selectWork },
            timeout: PYTHON_API_TIMEOUT_MS,
        });
        // console.log('Python API getIncommingLotNo response:', response.data);

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 取得庫存失敗', detail: response.data });
        }
        return res.status(200).json(response.data);

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 取得庫存失敗',
                detail: error.response.data
            });
        }
        return res.status(500).json({ error: '伺服器錯誤' });
    }
})

// 抓取設備編號資訊
router.get('/getEquipmentNo', async (req: any, res: any) => {
    const { selectWork, employeeID } = req.query;
    // console.log('Received getEquipmentNo request with selectWork:', selectWork, 'and employeeID:', employeeID);

    let defaultSelectWork = String(selectWork ?? '').trim();
    let defaultEmployeeID = String(employeeID ?? '').trim();

    try {

        const response = await axios.get(getPythonApiUrl(`/getEquipmentNo?selectWork`), {
            params: { selectWork: defaultSelectWork, employeeID: defaultEmployeeID },
            timeout: PYTHON_API_TIMEOUT_MS,
        });
        // console.log('Python API getEquipmentNo response:', response.data);

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 取得設備編號失敗', detail: response.data });
        }
        return res.status(200).json(response.data);


    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 取得設備編號失敗',
                detail: error.response.data
            });
        }
        return res.status(500).json({ error: '伺服器錯誤' });
    }
})


// 新增模具號資訊
router.post('/postModelNoList', async (req: any, res: any) => {
    const valueForm = req.body;
    // console.log('Received postModelNoList request with valueForm:', valueForm);

    try {

        const response = await axios.post(getPythonApiUrl('/postModelNoList'), valueForm, {
            timeout: PYTHON_API_TIMEOUT_MS,
        });

        // console.log ('Python API postModelNoList response:', response.data);

        if (response.status !== 200) {
            // console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 取得機種列表失敗', detail: response.data });
        }
        return res.status(200).json(response.data);
    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 取得機種列表失敗',
                detail: error.response.data
            });
        }
    }
})



// 抓取 模具號資訊
router.get('/getModelNoList', async (req: any, res: any) => {

    try {
        const response = await axios.get(getPythonApiUrl(`/getModelNoList`), {
            params: {
                selectWork: req.query.selectWork,
                page: req.query.page ?? 1,
                pageSize: req.query.pageSize ?? 10,
            }
        });
        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 取得機種列表失敗', detail: response.data });
        }

        // console.log('Python API getModelNoList response:', response.data);
        return res.status(200).json(response.data);

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 取得機種列表失敗',
                detail: error.response.data
            });
        }
    }
})

router.post('/deleteModelSetting', async (req: any, res: any) => {
    const {
        id,
        uuid,
        deleteEmpNo,
        deleteEmpName,
        deleteTime,
        deleteReason,
    } = req.body;

    // console.log('Received deleteModelSetting request with body:', req.body);

    if (!id || !uuid || !deleteEmpNo || !deleteEmpName || !deleteTime || !deleteReason) {
        return res.status(400).json({ error: '所有欄位為必填' });
    }

    let dataList = {
        id: String(id).trim(),
        uuid: String(uuid).trim(),
        modelStatusNow: String(deleteEmpNo).trim() ? 'deleted' : 'active',
        modelChangeName: String(deleteEmpName).trim(),
        modelStatusChangeTime: String(deleteTime).trim(),
        deleteReason: String(deleteReason).trim(),
    }

    // console.log('Prepared data for Python API deleteModelSetting:', dataList);

    try {

        const response = await axios.post(getPythonApiUrl('/deleteModelSetting'), dataList);

        console.log('Python API deleteModelSetting response:', response.data);

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 刪除機種設定失敗', detail: response.data });
        }

        return res.status(200).json({
            message: '機種設定已刪除',
            data: response.data
        });

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 刪除機種設定失敗',
                detail: error.response.data
            });
        }
        return res.status(500).json({ error: '伺服器錯誤' });
    }
})

// 新增模切紀錄
router.post('/submitCuttingRecord', async (req: any, res: any) => {
    const { data: bodyData } = req.body || {};
    // console.log('Received submitCuttingRecord request with body:', req.body);
    console.log('確認一下 bodyData 和 bodySelectWork:', bodyData);

    try {
        const response = await axios.post(getPythonApiUrl('/submitCuttingRecord'),
            bodyData,
            {
                timeout: PYTHON_API_TIMEOUT_MS,
            });

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 提交切割紀錄失敗', detail: response.data });
        }

        // console.log('Python API submitCuttingRecord response:', response.data);

        let sendData = response.data;
        redisLine.push({ data: sendData, option: 'submitCuttingRecord' });

        return res.status(200).json({ message: '切割紀錄已提交', data: response.data });

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 提交切割紀錄失敗',
                detail: error.response.data
            });
        }
        if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Python API 逾時' });
        }
        return res.status(500).json({ error: '伺服器錯誤' });
    }
}),

    // 抓取 Stock 資訊
    router.get('/getStockData', async (req: any, res: any) => {
        const { selectWork, page, pageSize } = req.query;

        let pageSizeFinal = Number(req.query.pageSize) ?? 10;
        try {

            // console.log('Received getStockData request with selectWork:', selectWork);
            const response = await axios.get(getPythonApiUrl('/getStockData'), {
                params: { selectWork, page, pageSizeFinal }
            });

            // console.log('Python API getStockData response:', response.data);

            if (response.status !== 200) {
                console.log("Python API returned non-200 status code:", response.status);
                return res.status(response.status).json({ error: 'Python API 取得庫存資料失敗', detail: response.data });
            }

            return res.status(200).json(response.data);

        } catch (error: unknown | any) {
            console.log(error);
            if (axios.isAxiosError(error) && error.response) {
                return res.status(error.response.status).json({
                    error: 'Python API 取得庫存資料失敗',
                    detail: error.response.data
                });
            }
            if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
                return res.status(504).json({ error: 'Python API 逾時' });
            }
            return res.status(500).json({ error: '伺服器錯誤' });
        }
    })

router.post('/stockTransfer', async (req: any, res: any) => {
    const { uiids } = req.body || {};
    // console.log('Received sendStockTransfer request with uiids:', Array.isArray(uiids) ? uiids : 'invalid uiids format');


    try {

        const response = await axios.post(getPythonApiUrl('/stockTransfer'), { uiids }, {
            timeout: PYTHON_API_TIMEOUT_MS,
        });
        // console.log('Python API stockTransfer response:', response.data);

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 庫存轉移失敗', detail: response.data });
        }

        res.status(200).json({ message: '庫存轉移指令已發出', data: response.data });

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 庫存轉移失敗',
                detail: error.response.data
            });
        }
        if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Python API 逾時' });
        }
        return res.status(500).json({ error: '伺服器錯誤' });
    }
})

router.post('/deleteStockData', async (req: any, res: any) => {
    const { uiids } = req.body || {};

    console.log('Received deleteStockData request with uiids:', uiids);

    try {
        const response = await axios.post(getPythonApiUrl('/deleteStockData'), { uiids }, {
            timeout: PYTHON_API_TIMEOUT_MS,
        });
        // console.log('Python API deleteStockData response:', response.data);

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 刪除庫存資料失敗', detail: response.data });
        }
        res.status(200).json({ message: '庫存資料刪除指令已發出', data: response.data });

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 刪除資料失敗',
                detail: error.response.data
            });
        }
        if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Python API 逾時' });
        }
        return res.status(500).json({ error: '伺服器錯誤' });
    }
})


router.get('/pastReport', async (req: any, res: any) => {
    const { startDate, endDate, dayShift, select } = req.query;
    let finalSendData = null


    // 確認db查詢參數
    const {
        startTime,
        endTime,
        shiftCheck
    } = changeFindTime(select, startDate, endDate, dayShift)

    console.log('startTime', startTime)
    console.log('endTime', endTime)
    console.log('shiftCheck', shiftCheck)

    if (startTime === null || endTime === null || shiftCheck === null) {
        return res.status(400).json({
            message: '查詢條件有誤',
            status: 400,
            data: []
        });
    }

    try {
        const response = await axios.get(getPythonApiUrl('/pastReport'), {
            params: {
                startDate: startTime,
                endDate: endTime,
                shift: shiftCheck,
                select: select
            },
            timeout: PYTHON_API_TIMEOUT_MS,
        });

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 取得過去報表資料失敗', detail: response.data });
        }
        else {
            finalSendData = response.data
        }
        if (response.status === 400) {
            res.status(404).json({
                message: '查無資料',
                data: null
            })
        }

        res.status(200).json({
            message: '成功取得過去報表資料',
            data: finalSendData
        });

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 取得過去報表失敗',
                detail: error.response.data
            });
        }
    }
})

router.get('/getSearchPage', async (req: any, res: any) => {
    const {
        option,
        searchTerm,
        startDate,
        endDay,
        page,
        pageSize
    } = req.query || {};

    try {
        const response = await axios.get(
            getPythonApiUrl('/getSearchPage'),
            {
                params: {
                    option: String(option ?? '').trim(),
                    searchTerm: String(searchTerm ?? '').trim(),
                    startDate: String(startDate ?? '').trim(),
                    endDay: String(endDay ?? '').trim(),
                    page: String(page ?? '').trim(),
                    pageSize: String(pageSize ?? '').trim(),
                },
                timeout: PYTHON_API_TIMEOUT_MS,
            }
        );

        // console.log ('check Python API /getSearchPage response:', response.data);

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 取得搜尋頁面資料失敗', detail: response.data });
        }

        return res.status(200).json({
            message: '成功取得搜尋頁面資料',
            data: response.data
        });
    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 取得過去報表失敗',
                detail: error.response.data
            });
        }
    }
})

router.get('/downloadData', async (req: any, res: any) => {
    const {
        option,
        searchTerm,
        startDate,
        endDay
    } = req.query || {};

    try {

        const response = await axios.get(getPythonApiUrl('/downloadData'), {
            params: {
                option: String(option ?? '').trim(),
                searchTerm: String(searchTerm ?? '').trim(),
                startDate: String(startDate ?? '').trim(),
                endDay: String(endDay ?? '').trim(),
            },
            timeout: PYTHON_API_TIMEOUT_MS,
            responseType: 'stream',
        });

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 下載資料失敗', detail: response.data });
        }

        res.setHeader('Content-Type', response.headers['content-type']);
        if (response.headers['content-disposition']) {
            res.setHeader('Content-Disposition', response.headers['content-disposition']);
        } else {
            res.setHeader('Content-Disposition', 'attachment; filename="download.xlsx"');
        }

        response.data.pipe(res);

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 下載資料失敗',
                detail: error.response.data
            });
        }
    }
})

router.put('/deleteData', async (req: any, res: any) => {
    const selectedRows = req.body.selectedRows || {};

    // console.log('Received deleteData request with deleteRow:', typeof selectedRows , ' | ', Object.entries(selectedRows).length > 0 ? selectedRows : 'empty or invalid deleteRow format');

    let deleteCheck = typeof selectedRows === 'object' && Object.entries(selectedRows).length > 0 ? selectedRows : {}
    console.log('Prepared deleteCheck for Python API:', deleteCheck);

    try {
        const response = await axios.put(getPythonApiUrl('/deleteData'), {
            deleteCheck
        }, {
            timeout: PYTHON_API_TIMEOUT_MS,
        });

        const responseData = response.data;

        if (response.status !== 200) {
            console.log("Python API returned non-200 status code:", response.status);
            return res.status(response.status).json({ error: 'Python API 刪除資料失敗', detail: responseData });
        }

        return res.status(200).json({
            message: '資料刪除成功',
            data: responseData
        });

    } catch (error: unknown | any) {
        console.error(error);
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 刪除資料失敗',
                detail: error.response.data
            });
        }
    }

})

router.post('/verifyUnlockPassword', async (req, res) => {
    const {
        employeeNo,
        password,
        selectWork,
    } = req.body || {};
    try {

        const prisma = prismaHr

        const user = await prisma.scheduleRegInfo.findUnique({ where: { memberID: employeeNo } });
        if (String(password) === String(user?.originalpasswd)) {
            res.status(200).json({
                message: '密碼驗證成功',
                data: true
            })
        }
        else {
            res.status(401).json({
                message: '密碼驗證失敗',
                data: false
            })
        }

    } catch (error: unknown | any) {
        res.status(500).json({
            error: 'Python API 驗證密碼失敗',
            detail: error.response.data
        })
    }
})

router.get('/getHandOverRecord', async (req: any, res: any) => {
    const {
        startTime,
        endTime,
        page
    } = req.query || {}

    console.log('check getHandOverRecord modelCutting data  :', { startTime, endTime, page })

    try {
        const hr = dbcon;

        let sql = `SELECT * FROM hr.cutting_HandoverRecord WHERE 1=1`;
        const params: any[] = [];

        if (startTime && endTime) {
            sql += ` AND searchTime >= ? AND searchTime <= ?`;
            params.push(String(startTime).trim(), String(endTime).trim());
        }

        sql += ` ORDER BY id DESC`;

        const [rows]: any = await hr.query(sql, params);

        const data = (rows || []).map((row: any) => {
            let cathodeOnshift = row.cathodeOnshift;
            let anodeOnshift = row.anodeOnshift;
            let smallRow = row.smallRow;

            try {
                if (typeof cathodeOnshift === 'string') cathodeOnshift = JSON.parse(cathodeOnshift);
            } catch (e) { }

            try {
                if (typeof anodeOnshift === 'string') anodeOnshift = JSON.parse(anodeOnshift);
            } catch (e) { }

            try {
                if (typeof smallRow === 'string') smallRow = JSON.parse(smallRow);
            } catch (e) { }

            return {
                ...row,
                searchTime: row.searchTime || row.findTime,
                cathodeOnshift,
                anodeOnshift,
                smallRow
            };
        });

        console.log('check getHandOverRecord rows count:', data.length);

        res.status(200).json({
            message: '取得交接班紀錄成功',
            data: data
        });

    } catch (error: any) {
        console.error('getHandOverRecord error:', error.message);
        res.status(500).json({
            message: '取得交接班紀錄失敗',
            error: error.message
        });
    }
})


// 抓回換班交接資訊
router.get('/handoverRecord', async (req: any, res: any) => {

})

// 抓取今天的產出資訊
router.get('/getTodayProducingData', async (req: any, res: any) => {
    const {
        startTime,
        shift
    } = req.query || {}

    let final: any
    // console.log('check getTodayProducingData data req : ', startTime, " | ", shift)

    try {

        const response = await axios.get(
            `${getPythonApiUrl('/getTodayProducingData')}`,
            {
                params: {
                    startTime,
                    shift
                },
                timeout: PYTHON_API_TIMEOUT_MS,
            }
        )
        final = response.data

        // console.log('response  via getTodayProducingData : ', response.data)
        res.status(200).json({
            data: final,
            message: 'success',
        })

    } catch (error: any | undefined) {
        console.error(
            'check getTodayProducingData modelCutting data error : ',
            error
        )
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 取得今日產出資訊失敗',
                detail: error.response.data
            })
        }
        return res.status(500).json({
            error: '取得今日產出資訊失敗',
            detail: error.message
        })
    }
})

router.get('/getEngineerSettings', async (req: any, res: any) => {
    const {
        selectWork
    } = req.query || {}

    try {
        const response = await axios.get(
            `${getPythonApiUrl('/getEngineerSettings')}`,
            {
                params: {
                    selectWork
                },
                timeout: PYTHON_API_TIMEOUT_MS,
            }
        )

        // console.log('response via getEngineerSettings : ', response.data)
        res.status(200).json({
            data: response.data,
            message: 'success',
        })

    } catch (error: unknown | any) {
        console.log('check getEngineerSettings data error : ', error)
        if (axios.isAxiosError(error) && error.response) {
            return res.status(error.response.status).json({
                error: 'Python API 取得工程師設定失敗',
                detail: error.response.data
            })
        }
        return res.status(500).json({
            error: '取得工程師設定失敗',
            detail: error.message
        })
    }
})

router.get('/getAchieveDataPerShift', async (req: any, res: any) => {
    const {
        day,
        dayShift,
        engineerID
    } = req.query

    // console.log('getAchieveDataPerShift day : ', day, ' | ', dayShift, ' | ', engineerID)

    const date = moment(day).tz('Asia/Taipei').format('YYYY-MM-DD')
    const startDate = `${date} 00:00:00`
    const endDate = `${date} 23:59:59`

    console.log('check date :', date)

    let shiftCondition: string = "1=1"

    switch (dayShift) {
        case '早班':
        case '常日A':
        case '常日B':
            shiftCondition = `empShift in ('早班','常日A','常日B')`
            break;
        case '晚班':
            shiftCondition = `empShift = '晚班'`
            break;
    }

    try {
        const mes = dbmes;
        const hr = dbcon

        const targetEngineerId = (engineerID as string) || '349';
        console.log('確認 targetEngineerId : ', targetEngineerId)

        const sql_Text = `
            WITH T AS (
                SELECT 
                    IFNULL(
                        (SELECT producingDiscount 
                         FROM hr.cuttingregister 
                         WHERE engineerId = '${targetEngineerId}' 
                           AND selectWork IN ('Cathode', 'cuttingCathode')
                         ORDER BY id DESC
                         LIMIT 1),
                        1
                    ) AS producingDiscount_Cathode, 
                    IFNULL(
                        (SELECT producingDiscount 
                         FROM hr.cuttingregister 
                         WHERE engineerId = '${targetEngineerId}' 
                           AND selectWork IN ('Anode', 'cuttingAnode')
                         ORDER BY id DESC
                         LIMIT 1),
                        1
                    ) AS producingDiscount_Anode,
                    IFNULL (
                        (SELECT cellCount 
                         FROM hr.cuttingregister
                         WHERE engineerId = '${targetEngineerId}' 
                           AND selectWork IN ('Anode', 'cuttingAnode')
                         ORDER BY id DESC
                         LIMIT 1),
                        0
                    ) AS cellCount_Cathode,
                    IFNULL (
                        (SELECT cellCount 
                         FROM hr.cuttingregister
                         WHERE engineerId = '${targetEngineerId}' 
                           AND selectWork IN ('Cathode', 'cuttingCathode')
                         ORDER BY id DESC
                         LIMIT 1),
                        0
                    ) AS cellCount_Anode
            ),
            Cathode AS (
                SELECT 
                    IFNULL(SUM(CASE WHEN productStatus = '良品' THEN shouldHavePeace ELSE 0 END), 0) AS totalCathode
                FROM mes.modelcutting_cathode_batch
                WHERE inputTime >= '${startDate}' AND inputTime <= '${endDate}' AND ${shiftCondition}
            ),
            Anode AS (
                SELECT 
                    IFNULL(SUM(CASE WHEN productStatus = '良品' THEN shouldHavePeace ELSE 0 END), 0) AS totalAnode
                FROM mes.modelcutting_anode_batch
                WHERE inputTime >= '${startDate}' AND inputTime <= '${endDate}' AND ${shiftCondition}
            )
            SELECT 
                (Cathode.totalCathode * T.producingDiscount_Cathode) AS achieveRateCathode,
                (Anode.totalAnode * T.producingDiscount_Anode) AS achieveRateAnode,
                T.cellCount_Cathode,
                T.cellCount_Anode
            FROM T
            CROSS JOIN Cathode
            CROSS JOIN Anode;
        `

        const sql_stock = `
            SELECT 
                'cuttingCathode' AS selectWork,
                IFNULL(SUM(CASE WHEN Stock IS NULL THEN 1 ELSE 0 END), 0) AS inHouse,
                IFNULL(SUM(CASE WHEN stock = '1' AND sendStockTime >= '${startDate}' AND sendStockTime <= '${endDate}' AND ${shiftCondition} THEN 1 ELSE 0 END), 0) AS send_Stock
            FROM mes.modelcutting_cathode_batch
            WHERE productStatus = '良品'
              AND (Stock IS NULL OR (stock = '1' AND sendStockTime >= '${startDate}' AND sendStockTime <= '${endDate}'))

            UNION ALL

            SELECT 
                'cuttingAnode' AS selectWork, 
                IFNULL(SUM(CASE WHEN Stock IS NULL THEN 1 ELSE 0 END), 0) AS inHouse,
                IFNULL(SUM(CASE WHEN stock = '1' AND sendStockTime >= '${startDate}' AND sendStockTime <= '${endDate}' AND ${shiftCondition} THEN 1 ELSE 0 END), 0) AS send_Stock
            FROM mes.modelcutting_anode_batch 
            WHERE productStatus = '良品'
              AND (Stock IS NULL OR (stock = '1' AND sendStockTime >= '${startDate}' AND sendStockTime <= '${endDate}'))
        `

        const [[rows], [rowsStock]]: [any, any] = await Promise.all([
            mes.query(sql_Text),
            mes.query(sql_stock)
        ])

        const achieveRateCathode = rows && rows.length > 0 ? (rows[0].achieveRateCathode ?? 0) : 0;
        const achieveRateAnode = rows && rows.length > 0 ? (rows[0].achieveRateAnode ?? 0) : 0;

        const cellCount_Cathode = rows && rows.length > 0 ? (rows[0].cellCount_Cathode ?? 0) : 0;
        const cellCount_Anode = rows && rows.length > 0 ? (rows[0].cellCount_Anode ?? 0) : 0;

        const data_stock_Cathode = rowsStock[0].inHouse // 正極
        const stockSendStock_Cathode = rowsStock[0].send_Stock // 正極
        const selectWork_Cathode = rowsStock[0].selectWork

        const data_stock_Anode = rowsStock[1].inHouse // 負極
        const stockSendStock_Anode = rowsStock[1].send_Stock // 負極
        const selectWork_Anode = rowsStock[1].selectWork


        res.status(200).json({
            message: 'success',
            data: {
                cathode: {
                    achieveRate: achieveRateCathode ?? 0,
                    stockSendStock: stockSendStock_Cathode ?? 0,
                    inHouse: data_stock_Cathode ?? 0,
                    selectWork: selectWork_Cathode ?? 'cuttingCathode',
                    cellCount: cellCount_Cathode ?? 0,
                },
                anode: {
                    achieveRate: achieveRateAnode ?? 0,
                    stockSendStock: stockSendStock_Anode ?? 0,
                    inHouse: data_stock_Anode ?? 0,
                    selectWork: selectWork_Anode ?? 'cuttingAnode',
                    cellCount: cellCount_Anode ?? 0,
                }
            },
        })

    } catch (error: any) {
        console.log('getAchieveDataPerShift error ', error.message)
    }
})

router.post('/sendHandOverRecord', async (req: any, res: any) => {
    const { records, startTime, endTime } = req.body;
    if (!records) {
        return res.status(400).json({ message: 'No records provided' });
    }

    console.log('sendHandOverRecord req.body', startTime)

    try {
        const hr = dbcon;

        const managerName = records.managerName || '';
        const shift = records.shift || '';
        const searchTime = records.searchTime || records.findTime || null;

        const managerNumber = String(records.managerNumber || '');
        const pieceCathodeSet = String(records.pieceCathodeSet ?? 0);
        const pieceAnodeSet = String(records.pieceAnodeSet ?? 0);
        const cellPcsPerCathode_shift = Number(records.cellPcsPerCathode_shift ?? 0);
        const cellPcsPerAnode_shift = Number(records.cellPcsPerAnode_shift ?? 0);
        const cathodeOnshift = JSON.stringify(records.cathodeOnshift || {});
        const anodeOnshift = JSON.stringify(records.anodeOnshift || {});
        const smallRow = JSON.stringify(records.smallRow || []);
        const createAt = records.createAt || new Date();
        const uuid = records.id || null;

        // 判斷 managerName, shift, searchTime 是否已經存在
        let existing: any = [];
        if (searchTime) {
            const [checkRows]: any = await hr.query(
                `SELECT id FROM hr.cutting_HandoverRecord WHERE managerName = ? AND shift = ? AND searchTime = ? LIMIT 1`,
                [managerName, shift, searchTime]
            );
            existing = checkRows;
        } else {
            const [checkRows]: any = await hr.query(
                `SELECT id FROM hr.cutting_HandoverRecord WHERE managerName = ? AND shift = ? AND searchTime IS NULL LIMIT 1`,
                [managerName, shift]
            );
            existing = checkRows;
        }

        if (existing && existing.length > 0) {
            // 已存在符合紀錄，執行 UPDATE
            const updateSql = `
                UPDATE hr.cutting_HandoverRecord
                SET managerNumber = ?,
                    uuid = ? , 
                    pieceCathodeSet = ?,
                    pieceAnodeSet = ?,
                    cellPcsPerCathode_shift = ?,
                    cellPcsPerAnode_shift = ?,
                    cathodeOnshift = ?,
                    anodeOnshift = ?,
                    smallRow = ?,
                    createAt = ?,
                    searchTime = ?
                WHERE id = ?
            `;
            const updateValues = [
                managerNumber,
                uuid,
                pieceCathodeSet,
                pieceAnodeSet,
                cellPcsPerCathode_shift,
                cellPcsPerAnode_shift,
                cathodeOnshift,
                anodeOnshift,
                smallRow,
                createAt,
                searchTime,
                existing[0].id
            ];
            await hr.query(updateSql, updateValues);
            return res.status(200).json({ message: 'success', action: 'updated' });
        } else {
            // 不存在，執行 INSERT
            const insertSql = `
                INSERT INTO hr.cutting_HandoverRecord (
                    shift, searchTime, managerName, managerNumber,
                    pieceCathodeSet, pieceAnodeSet,
                    cellPcsPerCathode_shift, cellPcsPerAnode_shift,
                    cathodeOnshift, anodeOnshift, smallRow, createAt, uuid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertValues = [
                shift,
                searchTime,
                managerName,
                managerNumber,
                pieceCathodeSet,
                pieceAnodeSet,
                cellPcsPerCathode_shift,
                cellPcsPerAnode_shift,
                cathodeOnshift,
                anodeOnshift,
                smallRow,
                createAt,
                uuid
            ];
            await hr.query(insertSql, insertValues);
            return res.status(200).json({ message: 'success', action: 'inserted' });
        }
    } catch (error: any) {
        console.error('sendHandOverRecord error:', error.message);
        return res.status(500).json({ message: error.message });
    }
});

module.exports = router;

