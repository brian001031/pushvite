import { z } from 'zod'
import moment from 'moment-timezone'

import axios from 'axios'
import { Socket } from 'socket.io'

const express = require('express')
const router = express.Router()
const path = require('path')

const envPath = path.resolve(__dirname, "../../.env");
require('dotenv').config({ path: path.envPath })

const { PrismaClient: MesClient } = require('../../generated/mes')
const { PrismaClient: HrClient } = require('../../generated/hr')


type ioSetting = {
    io: any,
    redis: any,
    room?: string
}

export const getPythonApiBaseUrl = () => {
    return process.env.PYTHON_API_BASE_URL ?? process.env.REACT_APP_PYTHON_API_BASE_URL ?? 'http://localhost:8000';
}

export const getPythonApiUrl = (endpoint) => {
    const baseUrl = getPythonApiBaseUrl();
    return `${baseUrl}${endpoint}`;
}


const redisClient = require(__dirname + "/../../modules/redisConnect.js"); // Redis 連線模組
export const prismaMes = new MesClient()
export const prismaHr = new HrClient()

let authPartIo: any = null;
let authPartRoom = 'managementRoom:AuthPart';


// 抓取所有 調撥、退料審核 的資料
export const fetchAuthRequestList = async (dataList: any) => {

    const { page, pageSize, startDate, endDate, searchInput } = dataList ?? {}
    try {
        const prisma = prismaMes;

        const pageNum = Math.max(1, Number(page) || 1);
        const limit = Math.max(1, Number(pageSize) || 10);
        const skip = (pageNum - 1) * limit;

        const whereCondition: any = {};

        if (searchInput && String(searchInput).trim() !== '') {
            const term = String(searchInput).trim();
            whereCondition.OR = [
                { form_id: { contains: term } },
                { allocate_barcode_text: { contains: term } },
                { product_name: { contains: term } },
                { apply_No: { contains: term } },
                { product_itemcode: { contains: term } },
            ];
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
            whereCondition.decisionEmpTime = dateFilter;
        }

        const response = await prisma.erp_eachdepartment_auth.findMany({
            where: {
                id_uuid: {
                    not: ''
                },
                channel: 'finish',
                ...whereCondition
            },
            orderBy: {
                decisionEmpTime: 'desc'
            },
            skip: skip,
            take: limit
        })

        const totalCount = await prisma.erp_eachdepartment_auth.count({
            where: {
                id_uuid: {
                    not: ''
                },
                channel: 'finish',
                ...whereCondition
            }
        })

        const totalPages = Math.ceil(totalCount / limit) || 1;

        let status = ''
        let message = ''


        return {
            success: true,
            status: status,
            message: message,
            data: response,
            totalCount: totalCount,
            totalPages: totalPages,
            page: pageNum,
            pageSize: limit
        }

    } catch (error: any | unknown) {
        console.error('fetchAuthRequestList error:', error);
        return {
            success: false,
            message: error?.message || '抓取紀錄失敗',
            data: [],
            totalCount: 0,
            totalPages: 1,
            page: 1,
            pageSize: 10
        };
    }
}

router.post('/submitAuthTransfer', async (req, res) => {
    const { userNumber, selectApproveData = [], selectRejectData = [], selectData } = req.body || req.query || {};
    console.log('submitAuthTransfer傳入資料:', { userNumber, selectApproveData, selectRejectData, selectData });

    try {

        const resp = await axios.post(`${getPythonApiUrl('/api/ingredients/authPart/submitAuthTransfer')}`, {
            userNumber,
            selectApproveData,
            selectRejectData
        })

        console.log('resp  :', resp)
        // 透過 Socket 廣播通知前端房間刷新資料 (通知轉移頁面、退料頁面、與已用盡紀錄頁面)
        if (authPartIo) {
            console.log(`[authPart API] 送出轉移審核成功，廣播通知全前端刷新`);
            authPartIo.to(authPartRoom).emit('ingredients:renewFetchAuth', {
                userNumber,
                timestamp: Date.now()
            });
            authPartIo.emit('ingredients:renewFetchAuth', {
                userNumber,
                timestamp: Date.now()
            });
            authPartIo.to(authPartRoom).emit('Ingredients:fundTransfer:getData');
            authPartIo.emit('Ingredients:fundTransfer:getData');

            authPartIo.to(authPartRoom).emit('Ingredients:getExhaustData');
            authPartIo.emit('Ingredients:getExhaustData');

            authPartIo.to(authPartRoom).emit('Ingredients:pickUp');
            authPartIo.emit('Ingredients:pickUp');
        }

        return res.status(200).json({
            status: '200',
            success: true,
            data: {
                selectApproveData,
                selectRejectData,
                selectData: selectData || []
            },
            message: '審核資料送出完成'
        });
    } catch (error: any | null) {
        console.error('submitAuthTransfer異常:', error?.message || error);
        return res.status(500).json({
            status: '500',
            success: false,
            message: error?.message || '審核資料送出失敗'
        });
    }
});

export const IngredientsUserPermissionSchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    searchTransferNo: z.string().optional(),
    userNumber: z.string().optional().default(''),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(10)
});

export const bindWarehouseHandlers = ({ io, redis, room = 'managementRoom:AuthPart' }: ioSetting) => {
    authPartIo = io;
    authPartRoom = room;
    console.log(`[authPart Socket] 綁定 authPart Socket 處理器 (房間: ${room})`);

    io.on('connection', (socket: any) => {
        socket.on('ingredients:fetchAuthTransferData', async (payload: any, ack: any) => {
            const {
                startDate,
                endDate,
                pageSize,
                roomKey,
                searchTransferNo,
                userNumber
            } = payload || {};

            const dataInner = IngredientsUserPermissionSchema.safeParse(payload);
            console.log('[authPart Socket] ingredients:fetchAuthTransferData payload:', JSON.stringify(payload));

            if (!dataInner.success) {
                if (typeof ack === 'function') {
                    ack({ success: false, message: '輸入格式錯誤' });
                }
                return;
            }

            const data = dataInner.data;
            const parsedPage = data.page ? parseInt(data.page.toString()) : 1;
            const parsedPageSize = data.pageSize ? parseInt(data.pageSize.toString()) : 10;

            try {
                const response = await axios.get(`${getPythonApiUrl('/api/ingredients/getAuthTransferData')}`, {
                    params: {
                        startDate,
                        endDate,
                        searchTransferNo,
                        userNumber,
                        page: parsedPage,
                        pageSize: parsedPageSize
                    }
                });

                const responseData = response?.data;
                const sendData = {
                    success: true,
                    data: responseData?.data ?? [],
                    total: responseData?.total ?? 0,
                    page: responseData?.page ?? 1
                };

                if (typeof ack === 'function') {
                    ack(sendData);
                }
            } catch (error: any | unknown) {
                console.error('Error fetching auth transfer data in authPart Socket:', error?.message || error);
                if (typeof ack === 'function') {
                    ack({
                        success: false,
                        message: '取得調料核准轉移資料失敗',
                        data: [],
                        total: 0
                    });
                }
            }
        });

        socket.on('Ingredients:fundTransfer:getData', (payload: any, ack: any) => {
            console.log('[authPart Socket] 收到 Ingredients:fundTransfer:getData，廣播通知前端刷新');
            if (authPartIo) {
                authPartIo.to(authPartRoom).emit('Ingredients:fundTransfer:getData', payload);
                authPartIo.emit('Ingredients:fundTransfer:getData', payload);
            }
            if (typeof ack === 'function') {
                ack({ success: true });
            }
        });
    });
};


// 送出退料審核訊息的功能
router.post('/sendFundApproveAction', async (req, res) => {
    const validatedPayload = req.body || req.query || {};
    console.log('validatedPayload  :', validatedPayload)

    try {
        const response = await axios.post(getPythonApiUrl('/api/ingredients/authPart/sendFundApproveAction'), validatedPayload);

        // 送出退料審核成功後，透過 Socket 廣播通知前端刷新資料 (通知退料頁面、轉移頁面、與已用盡紀錄頁面)
        if (authPartIo) {
            console.log(`[authPart API] 審核送出成功，透過 Socket 廣播通知全前端刷新`);
            authPartIo.to(authPartRoom).emit('Ingredients:fundTransfer:getData');
            authPartIo.emit('Ingredients:fundTransfer:getData');
            authPartIo.to(authPartRoom).emit('ingredients:renewFetchAuth', {
                timestamp: Date.now()
            });
            authPartIo.emit('ingredients:renewFetchAuth', {
                timestamp: Date.now()
            });
            authPartIo.to(authPartRoom).emit('Ingredients:getExhaustData');
            authPartIo.emit('Ingredients:getExhaustData');
            authPartIo.to(authPartRoom).emit('Ingredients:pickUp');
            authPartIo.emit('Ingredients:pickUp');
        }

        const responseData = response?.data;
        const sendData = {
            success: true,
            data: responseData?.data ?? [],
            total: responseData?.total ?? 0,
            page: responseData?.page ?? 1
        };

        return res.status(200).json(sendData)

    } catch (error: any | unknown) {
        console.error('sendFundApproveAction異常:', error?.message || error);
        return res.status(500).json({
            status: '500',
            success: false,
            message: error?.message || '送出退料審核失敗'
        });
    }
})

router.get('/getFundApproveData', async (req, res) => {
    const { empNo, page, pageSize } = req.query

    console.log('確認 empNo', empNo)


    const parsedEmpNo = empNo ? String(empNo) : ''
    const parsedPage = page ? Number(page) : 1
    const parsedPageSize = pageSize ? Number(pageSize) : 3


    if (!parsedEmpNo) {
        res.status(400).json({
            status: 'error',
            message: '缺少empNo'
        })
        return
    }
    let EmpNoChange = String(empNo).trim()


    try {

        const response = await axios.get(`${getPythonApiUrl('/api/ingredients/getFundApproveData')}`, {
            params: {
                empNo: EmpNoChange,
                page: parsedPage,
                pageSize: parsedPageSize
            }
        })

        const result = response.data ?? `{"data":{"list":[],"total":0},"message":"成功取得資料","status":"success"}`
        console.log('result.status ', result)

        if (String(result.status) === '200' || result.status === 'success' || result.success) {
            res.status(200).json({
                status: '200',
                success: true,
                data: result.data,
                total: result.total,
                page: result.page,
            })
        } else {
            res.status(500).json(result)
        }

    } catch (error: any | null) {
        console.error('getFundApproveData error type : ', error?.message || error)
        res.status(500).json({
            status: 'error',
            message: error?.message || 'Failed to fetch ingredient data from database'
        })
    }
})

router.get('/departmentCheck', async (req: any, res: any) => {
    try {
        const prisma = prismaHr;
        let department: string[] = [];
        if (prisma) {
            const response = await prisma.scheduleRegInfo.findMany({
                distinct: ['positionArea'],
                select: {
                    positionArea: true
                }
            });
            console.log('departmentCheck response : ', response);
            if (response) {
                response.forEach((item: any) => {
                    if (item.positionArea) {
                        department.push(item.positionArea);
                    }
                });
            }

            const finalDep = department.filter((item: string) => item && item.trim() !== '' && item.trim() !== '[]');

            res.status(200).json({
                status: '200',
                success: true,
                data: finalDep,
                message: '成功取得資料'
            });
        } else {
            res.status(500).json({
                status: 'error',
                message: 'Prisma Client for HR database is not initialized'
            });
        }
    } catch (error: any) {
        console.error('departmentCheck error : ', error?.message || error);
        res.status(500).json({
            status: 'error',
            message: error?.message || 'Failed to fetch department data from database'
        });
    }
})


router.get('/authDataSendBackRecord', async (req: any, res: any) => {
    let dataList = req.query || {};

    console.log('確認一下 dataList :', dataList)

    try {
        const response = await fetchAuthRequestList(dataList ?? {})
        if (response.success) {
            return res.status(200).json({
                status: '200',
                success: true,
                message: '抓取退回調料單紀錄成功',
                data: response.data,
                totalCount: response.totalCount,
                totalPages: response.totalPages,
                page: response.page,
                pageSize: response.pageSize
            });
        } else {
            return res.status(400).json({
                status: 'error',
                success: false,
                message: response.message,
                data: [],
                totalCount: 0,
                totalPages: 1,
                page: 1,
                pageSize: 10
            });
        }


    } catch (error: any | unknown) {
        console.error('authDataSendBackRecord error:', error?.message || error);
        return res.status(500).json({
            status: 'error',
            success: false,
            message: error?.message || '抓取退回調料單紀錄失敗',
            data: [],
            totalCount: 0,
            totalPages: 1,
            page: 1,
            pageSize: 10
        });
    }
})

Object.assign(router, {
    bindWarehouseHandlers,
    prismaMes,
    prismaHr
});

module.exports = router;

