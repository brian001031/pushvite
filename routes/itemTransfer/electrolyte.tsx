import { json } from "body-parser";
import { group } from "console";
import { create } from "domain";
import moment from 'moment-timezone';


const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");
const jwt = require("jsonwebtoken");

const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });


// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbmes = require(__dirname + "/../../modules/mysql_connect_mes.js"); // mes 資料庫
const dbcon = require(__dirname + "/../../modules/mysql_connect.js");     // hr 資料庫

const { PrismaClient: HrClient } = require('../../generated/hr');
const { PrismaClient: MesClient } = require('../../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();



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
    const mes = prismaMes
    try {
        const result = await mes.electrolyteHandoverSystem.create({
            data: {
                electrolyteUniqueCode: data.qrCode,
                pickupDepartment: data.department,
                pickUpNumber: data.empNo,
                pickUpName: data.empName,
                pickupTime: data.nowTime ? new Date(data.nowTime) : null,
                stockUsing: data.floor,
                status: data.status
            }
        });
        // 1. 同步更新 Redis 中的 ZSET 與 Hash 快取
        try {
            const redis = require('../../modules/redisConnect.js');
            const zsetKey = 'itemTransfer:electrolyte:zset';
            const hashKey = 'itemTransfer:electrolyte:data';

            const cacheExists = await redis.exists(hashKey);
            if (cacheExists) {
                const mapped = {
                    id: result.id,
                    electrolyteUniqueCode: result.electrolyteUniqueCode,
                    pickupDepartment: result.pickupDepartment,
                    pickUpNumber: result.pickUpNumber,
                    pickUpName: result.pickUpName,
                    pickupTime: result.pickupTime,
                    pickUpTime: result.pickupTime,
                    stockUsing: result.stockUsing,
                    stock_using: result.stockUsing, // 蛇形命名對應前端
                    stockOrigin: result.stockOrigin,
                    stock_origin: result.stockOrigin,
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
                console.log(`⚡ [Redis] REST 新增資料同步快取成功: ID ${result.id}`);
            }

        } catch (redisErr) {
            console.error("InsertPickupData Redis Sync Error:", redisErr);
        }

        // 2. 透過 Socket 廣播通知其他在線使用者更新 UI (發送至 /itemTransfer 命名空間)
        try {
            const { getSocketServer } = require('../../modules/socketServer.ts');
            const io = getSocketServer();
            if (io) {
                io.of('/itemTransfer').to('materialForPickup:electrolyte').emit('stock:updated', { message: '有新領料資料已新增' });
                console.log('⚡ [Socket] 已成功廣播 stock:updated 至 /itemTransfer 命名空間');
            }
        } catch (socketErr) {
            console.error("InsertPickupData Socket Broadcast Error:", socketErr);
        }

        res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        console.error("InsertPickupData Error:", error);
        res.status(500).json({
            message: 'network error'
        });
    }
});

module.exports = router;