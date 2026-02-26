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


// JWT Secret (使用 .env 中的設定，與 index.js 一致)
const JWT_SECRET = process.env.JWT_SECRET;


interface userData {
    memberID: string;
    reg_schedulename: string;
}
interface findFormData {
    startDate: Date | null;
    endDate: Date | null;
    findSelect: string | null;
    findInput: string | null;
}

// ============ 認證中間件 ============
const authMiddleware = (req : any, res : any, next : any) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            message: '未提供認證 Token' 
        });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token 無效或已過期' 
        });
    }
};

// ============ 認證 API ============

// POST - 使用者登入工程師頁面並獲取 JWT Token
router.post('/api/authenticate', async (
        req : {body: { userData: userData; }}, 
        res : any
    ) => {
    
    const { userData } = req.body as { userData: userData };
    let dataCollect : any = {};

    // console.log('Received userData for authentication:', userData);
    
    // 驗證邏輯...
    if (!userData) {
        return res.json({
            success: false,
            message: '請先登入帳號後再使用此功能',
            data: undefined,
            token: undefined
        });
    }

    try{
        const prisma = prismaHr;
        const user = await prisma.ScheduleRegInfo.findUnique({
            where: {
                memberID: userData.memberID 
            },
            select: {
                memberID: true,
                regScheduleName: true,
                positionArea : true,
                managerRoster: {
                    select: {
                        positionArea: true,
                        authPosition: true,
                        authStatus: true
                    }
                }
            }
        });
        // console.log ('user data from ScheduleRegInfo db :' , user);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '使用者不存在',
                data: undefined,
                token: undefined
            });
        }

        dataCollect = typeof user === 'object' && user !== null ? user : {};

    }catch (error){
        console.error('認證過程中發生錯誤:', error);
        return res.status(500).json({
            success: false,
            message: '認證失敗 請確認權限已開通，或聯繫管理員 | authentication failed, please check if the permission is granted or contact the administrator',
        })
        
    }

    // console.log('Data collected for authentication:', dataCollect);

    // 檢查 managerRoster 權限
    if (!dataCollect.managerRoster) {
        return res.status(404).json({
            success: false,
            message: '使用者沒有相關權限',
            data: dataCollect,
            token: undefined
        })
    }

    let checkPositionArea = dataCollect.managerRoster.positionArea;
    
    if (!checkPositionArea || !checkPositionArea.includes('電化學區')) {
        return res.status(403).json({
            success: false,
            message: '使用者沒有使用檢點表參數設定相關權限',
            data: dataCollect,
            token: undefined
        })
    }

    // 產生 JWT Token
    const token = jwt.sign(
        { memberID: userData.memberID, username: userData.reg_schedulename },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({
        success: true,
        message: '認證成功',
        data: userData,
        token: token
    });
});

// ============ Engineer Setting REST API ============
const findGroupData = async (datas : findFormData) =>{
    console.log('findGroupData function called with datas:', datas);

    try{
        let dataBack : any = {};

        const prisma = prismaMes;
        if (datas.findInput === ""){
            const response = await prisma.ChecklistMainGroup.findMany({
                include: {
                    formDefinitions: true, 
                },
            })
             console.log('findGroupData function response:', response);
             dataBack = response;
        }
        else if (datas.findInput){
            const response = await prisma.ChecklistMainGroup.findMany({
                where: {
                    groupNo: datas.findInput,
                },
                include: {
                    formDefinitions: true, 
                },
            })
             console.log('findGroupData function response:', response);
             dataBack = response;
        }
        else {
            console.log('findGroupData function: No valid input provided for groupNumber search.');
            return;
        } 

        console.log('final check befor back to api - check-form-data', dataBack);
        return dataBack;

   
        
    }catch (error){
        console.error('findGroupData function error:', error);
    }
    

    
}
const findFormData = async (datas : findFormData) =>{
    console.log('findFormData function called with datas:', datas);
    
}

// GET - 取得所有設定
router.get('/api/check-form-data', authMiddleware, async (
    req : {query: { datas: findFormData; }}, 
    res : any
) => {
    const { datas } = req.query as { datas: findFormData };
    console.log ('typeof datas ' , typeof datas , '|  datas: ' , datas);

    let select = datas.findSelect as string;

    try {
        switch (select){
            case 'groupNumber':
                await findGroupData(datas);
            case 'formNumber': 
                await findFormData(datas);
        }
        
        
    }catch (error) {
        console.error ('occuring error' , error )
    }

    
    
    
    try {
        // const settings = await db.query('SELECT * FROM engineer_settings');
        const settings = []; // 從資料庫取得
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;

