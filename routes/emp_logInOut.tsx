export {};

const moment = require('moment-timezone');

const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");
const jwt = require("jsonwebtoken");
// 讀取 .env 檔案
const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });


// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫
const dbcon = require(__dirname + "/../modules/mysql_connect.js");     // hr 資料庫


const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();

const redis = require('../modules/redis_connect.js');



// 確認人員身分與目前狀態，並依據 action 進行登入或登出
interface LogInOutRequest {
    body: {
        userid: any;
        positionArea: any;
        station: any;
        action: any;
        shift: "早班" | "晚班" | "常日A" | "常日B"
    };
}


// 沒token，直接登入，產生新的 token 並存入 Redis
// 有 token，確認是否有效：
//   - 如果 action 是 logIn，且 token 無效，允許登入並更新 Redis；如果 token 有效，拒絕登入（已經登入了）
//   - 如果 action 是 logOut，且 token 有效，允許登出並刪除 Redis；如果 token 無效，拒絕登出（沒有登入）

const generateRedisKey = async (
    userid: any,
    positionArea: any,
    station: any,
    action?: any,
    shift?: "早班" | "晚班" | "常日A" | "常日B"
) => {

    const dateTime = moment().tz("Asia/Taipei").format("YYMMDD");

    let key = `LogInOut:${dateTime}${userid}`;
    const redisClient = redis.getClient();

    const payload = {
        userid: userid,
        message: '',
        finalSend: {}
    }
    try {
        // 先抓到 redis 裡面有沒有這個 key，來確認是否已經登入過
        const existingToken = await redisClient.get(key);
        console.log("existingToken", JSON.parse(JSON.stringify(existingToken)));

        // 確認是否同日期已經有登入紀錄，如果有，則解析出來確認 action 是 logIn 還是 logOut
        const finalDATA = existingToken ? JSON.parse(existingToken) : null;

        if (finalDATA &&
            finalDATA.action === "logIn" &&
            dateTime === finalDATA.dateTime) {
            return payload.message === '已經登入過了，無法重複登入' ? payload : { ...payload, message: '已經登入過了，無法重複登入' };
        }



    } catch (error) {
        console.log("error", error);
    }

}




router.post("/logInOut_Emp", async (req: LogInOutRequest, res: any) => {
    const {
        userid,
        positionArea,
        station,
        action,
        shift
    } = req.body;

    if (!userid) { return res.status(400).json({ error: true, msg: "缺少 userid" }) }

    // 確認 是否有 token 以及現在的時間是否還有效
    const now = moment().tz("Asia/Taipei").format("HH:mm:ss");

    try {

        await generateRedisKey(userid, positionArea, station, action, shift);





    } catch (err) {

    }





})
