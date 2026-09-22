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
    nowPage: number | null;
    pageSize: number | null;
    workTypeSetting: string | null;
}

interface check_reviewFormData_find {
    startDate: string | null;
    endDate: string | null;
    groupNo?: string | null;
    formNo?: string | null;
    equipNo?: string | null;
    page?: number | null;
    pageSize?: number | null;
}

type formGroup = {
    formData: checkGroupData[];
}

// 確認 部門權限設定 | Check department authorization settings
interface checkGroupData {
    id: number | null,
    groupNo: string | null,
    isIsoCertified: boolean | null,
    isoCertifiedAt: Date | null,
    isoImgPath: string | null,
    createdAt: Date | null,
    updatedAt: Date | null,
    createBy: string | null,
    updateBy: string | null,
    formDefinitions: formDefinitions[] | null
}

interface formDefinitions {
    id: string | number;
    groupNo: string;
    formNo: string;
    formTitle: string;
    approverSetting: any;
    approveAreaCheck: string;
    area: any;
    task: any;

}

// 確認 檢核設備設定 | Check equipment authorization settings
interface checkEquipmentData { checkEquipmentDataAll: checkEquipmentDataAll[] }
interface checkEquipmentDataAll {
    version: number | null,
    propertyNumber: string | null,
    propertyName: string | null,
}



// ============ 認證中間件 ============
const authMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: '未提供認證 Token'
        });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token 格式錯誤'
        });
    }

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

// 通知長官
const sendToManager = async (
    groupNo: string,
    deleteBy: string

): Promise<void> => {
    let message = ''
    let managerEmail = [] as string[];

    try {

        const prisma = prismaHr;
        const managerData = await prisma.absentManagerRoster.findMany({
            where: {
                authStatus: '1',
                authPosition: {
                    array_contains: '內部資訊與MIS'
                }
            },
            select: {
                regInfo: {
                    select: {
                        memEmail: true
                    }
                }
            }
        })

        managerEmail = managerData
            .map((item: any) => item.regInfo?.memEmail)
            .filter((email: string | null | undefined): email is string => !!email);

        console.log('取得的收件人名單:', managerEmail);

        if (managerEmail.length === 0) {
            console.log('未找到符合條件的主管 Email，取消寄信');
            return;
        }


        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.office365.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
        const now = new Date();
        const nowTime = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

        for (let email of managerEmail) {
            const mailOptions = {
                from: `"公司檢點表系統" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `檢點表ISO單號 ${groupNo} 已被${deleteBy}刪除通知`,
                html: `
                    <h3> 主管您好，</h3>
                    <p>檢點表的ISO單號： ${groupNo} 已被${deleteBy}於 ${nowTime} 刪除。</p>
                    <br/>
                    <p>若此刪除操作有誤，請聯繫系統管理員可協助回復資訊。</p>
                    <hr>
                    <p>此為系統自動發送的通知信，請勿直接回覆。</p>
                `
            };
            try {
                await transporter.sendMail(mailOptions);
            } catch (error) {
                console.error('Error sending email to manager:', error);
                throw new Error('發送郵件失敗，請稍後再試 | Failed to send email, please try again later');
            }
        }



    } catch (error: any) {
        if (axios.isAxiosError(error as any) && error.response?.status === 500) {
            console.error('sendToManager network error:', error.message);
        } else {
            console.error('sendToManager unexpected error:', error);
        }
    }
}
// POST - 使用者登入工程師頁面並獲取 JWT Token
router.post('/api/authenticate', async (
    req: { body: { userData: userData; } },
    res: any
) => {

    const { userData } = req.body as { userData: userData };
    let dataCollect: any = {};

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

    try {
        const prisma = prismaHr;
        const user = await prisma.ScheduleRegInfo.findUnique({
            where: {
                memberID: userData.memberID
            },
            select: {
                memberID: true,
                regScheduleName: true,
                positionArea: true,
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

    } catch (error) {
        console.error('認證過程中發生錯誤:', error);
        return res.status(500).json({
            success: false,
            message: '認證失敗 請確認權限已開通，或聯繫管理員 | authentication failed, please check if the permission is granted or contact the administrator',
        })

    }

    // console.log('Data collected for authentication:', dataCollect);

    // 檢查 managerRoster 權限（安全處理：支援 array 或 object 並以數字比較 authStatus）
    const roster = Array.isArray(dataCollect.managerRoster)
        ? dataCollect.managerRoster[0]
        : dataCollect.managerRoster;

    // 確認 roster 存在且 authStatus 為可比較的數值，若沒有則回傳無權限
    const authStatus = roster && roster.authStatus !== undefined
        ? Number(roster.authStatus)
        : 0;

    if (!roster || Number.isNaN(authStatus) || authStatus <= 0) {
        return res.status(403).json({
            success: false,
            message: '使用者沒有相關權限',
            data: dataCollect,
            token: undefined
        });
    }

    let checkPositionArea = roster.positionArea;
    console.log('Position area from managerRoster:', checkPositionArea);

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

// 抓取GroupData 資料｜Fetch GroupData
const findGroupData = async (datas: findFormData) => {
    console.log('findGroupData function called with datas:', datas);


    try {
        let dataBack: checkGroupData[] = []

        const prisma = prismaMes;
        const pageSize = datas.pageSize ? parseInt(String(datas.pageSize)) : 10;
        const nowPage = datas.nowPage ? parseInt(String(datas.nowPage)) : 1;
        const workTypeSetting = datas.workTypeSetting ? String(datas.workTypeSetting).trim() : '';
        const startDate = datas.startDate ? new Date(String(datas.startDate)) : null;
        const endDate = datas.endDate ? new Date(String(datas.endDate)) : null;
        const baseWhere: any = {
            workTypeSetting: {
                contains: workTypeSetting,
            },
            OR: [
                { isDelete: false },
                { isDelete: true, isIsoCertified: true },
            ],
            // createBy :{ not: '周柏全 ( 349 ) '}



        };

        if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
            baseWhere.createdAt = {
                gte: startDate,
                lte: endDate,
            }
        }

        if (datas.findInput === "") {
            const response = await prisma.ChecklistMainGroup.findMany({
                where: baseWhere,
                take: pageSize, // 預設每頁 10 筆
                skip: (nowPage - 1) * pageSize,
                orderBy: {
                    createdAt: 'desc'
                },
                include: {
                    formDefinitions: true,
                },
            })
            //  console.log('findGroupData function response:', typeof response ,  " | "  , response);
            dataBack = response;
        }
        else if (datas.findInput) {
            const findInput = String(datas.findInput).trim();
            const response = await prisma.ChecklistMainGroup.findMany({
                where: {
                    ...baseWhere,
                    groupNo: {
                        contains: findInput,
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                include: {
                    formDefinitions: true,
                },
            })
            console.log('findGroupData function response:', response, " | ", typeof response);
            dataBack = response;
        }
        else {
            console.log('findGroupData function: No valid input provided for groupNumber search.');
            return;
        }

        // console.log('final check befor back to api - check-form-data', dataBack);
        return dataBack;



    } catch (error) {
        console.error('findGroupData function error:', error);
    }
}


const findFormData = async (datas: findFormData) => {
    console.log('findFormData function called with datas:', datas);
    // TODO: Implement actual logic here
    return [];
}


// POST - 新增或更新設定 | Create or update settings
const groupDataUpsert = async (data: any) => {
    console.log('groupDataUpsert function called with data:', data);
    const prisma = prismaMes;
    if (!Array.isArray(data)) {
        throw new TypeError('Input data must be an array');
    }
    const allFormDefResults: any[] = [];

    for (let item of data) {
        let deletePromises = [];
        let formDefPromises = [];

        if (Array.isArray(item.formDefinitions)) {
            // 1. 查詢 db 內所有該 groupNo 的 formNo
            const groupNo = item.groupNo || (item.formDefinitions[0] && item.formDefinitions[0].groupNo);
            if (groupNo) {
                const dbFormDefs = await prisma.checklistFormDefinition.findMany({
                    where: { groupNo },
                    select: { formNo: true }
                });
                console.log('確認 db 內現有的 groupNo', groupNo, ':', dbFormDefs);
                const dbFormNos = dbFormDefs.map((fd: any) => fd.formNo);
                const reqFormNos = item.formDefinitions.map((fd: any) => fd.formNo);
                // 2. 找出 db 多餘的 formNo
                const toDelete = dbFormNos.filter((formNo: any) => !reqFormNos.includes(formNo));
                console.log('需要刪除的 formNo:', toDelete);
                // 3. 刪除多餘的 ChecklistFormDefinition    
                for (const delFormNo of toDelete) {
                    deletePromises.push(
                        prisma.ChecklistFormDefinition.deleteMany({
                            where: { groupNo, formNo: delFormNo }
                        })
                    );
                }
            }

            // 處理 isoCertifiedAt 空字串/無效值為 null
            const safeIsoCertifiedAt = (val: any) => {
                if (!val) {
                    return null;
                }
                const parsed = new Date(val);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            };

            const normalizedWorkTypeSetting = item.workTypeSetting
                ? String(item.workTypeSetting).trim()
                : '';

            const safeWorkTypeSetting = normalizedWorkTypeSetting || '未設定';

            if (groupNo) {
                await prisma.ChecklistMainGroup.upsert({
                    where: {
                        groupNo: groupNo,
                    },
                    update: {
                        isIsoCertified: item.isIsoCertified ? item.isIsoCertified : false,
                        isoCertifiedAt: safeIsoCertifiedAt(item.isoCertifiedAt),
                        workTypeSetting: safeWorkTypeSetting,
                        updateBy: item.updateBy ? item.updateBy : (item.createBy || ''),
                    },
                    create: {
                        groupNo: groupNo,
                        isIsoCertified: item.isIsoCertified ? item.isIsoCertified : false,
                        isoCertifiedAt: safeIsoCertifiedAt(item.isoCertifiedAt),
                        workTypeSetting: safeWorkTypeSetting,
                        createBy: item.createBy ? item.createBy : (item.updateBy || ''),

                        updateBy: item.updateBy || '',
                    },
                });
            }

            // 再 upsert ChecklistFormDefinition
            for (let item2 of item.formDefinitions) {
                console.log('formDefinitions item:', item['groupNo'], item2);
                const normalizedFormWorkTypeSetting = item2.workTypeSetting
                    ? String(item2.workTypeSetting).trim()
                    : '';

                const safeFormWorkTypeSetting = normalizedFormWorkTypeSetting || safeWorkTypeSetting;

                formDefPromises.push(
                    prisma.ChecklistFormDefinition.upsert({
                        where: {
                            groupNo_formNo: {
                                groupNo: item2.groupNo,
                                formNo: item2.formNo,
                            }
                        },
                        update: {
                            formTitle: item2.formTitle,
                            approverSetting: Array.isArray(item2.approverSetting)
                                ? item2.approverSetting
                                : (item2.approverSetting ? [item2.approverSetting] : []),
                            approveAreaCheck: Array.isArray(item2.approveAreaCheck)
                                ? item2.approveAreaCheck
                                : (item2.approveAreaCheck ? [item2.approveAreaCheck] : []),
                            area: item2.area ? item2.area : [],
                            task: item2.task ? item2.task : [],
                            workTypeSetting: safeFormWorkTypeSetting,
                        },
                        create: {
                            groupNo: item2.groupNo,
                            formNo: item2.formNo,
                            formTitle: item2.formTitle,
                            approverSetting: Array.isArray(item2.approverSetting)
                                ? item2.approverSetting
                                : (item2.approverSetting ? [item2.approverSetting] : []),
                            area: item2.area ? item2.area : [],
                            approveAreaCheck: Array.isArray(item2.approveAreaCheck)
                                ? item2.approveAreaCheck
                                : (item2.approveAreaCheck ? [item2.approveAreaCheck] : []),
                            task: item2.task ? item2.task : [],
                            workTypeSetting: safeFormWorkTypeSetting,
                        },
                        select: {
                            id: true,
                            groupNo: true,
                            formNo: true,
                            formTitle: true,
                            workTypeSetting: true,
                            approverSetting: true,
                            area: true,
                            approveAreaCheck: true,
                            task: true,
                        }
                    })
                );
            }
        }

        try {
            // 先刪除多餘的，再 upsert ChecklistFormDefinition
            await Promise.all(deletePromises);
            const formDefResults = await Promise.all(formDefPromises);
            allFormDefResults.push(...formDefResults);
        } catch (error) {
            console.error('Error in groupDataUpsert function:', error);
            throw new Error('伺服器錯誤，請稍後再試 | Server error, please try again later');
        }
    }

    return allFormDefResults;
}


// 抓取auth position | Fetch authorized positions
router.get('/api/check-all-auth', authMiddleware, async (req: any, res: any) => {


    try {
        const prisma = prismaHr;
        const authData = await prisma.absentManagerRoster.findMany({
            distinct: ['positionArea'],
            select: { positionArea: true }
        });
        const uqique = Array.from(new Set(authData.flatMap((item: any) => item.positionArea)));
        console.log('Unique position areas:', uqique);
        res.json({
            success: true,
            message: '查詢成功',
            data: uqique
        })
    } catch (error) {
        console.error('Error in GET / route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})

// 取得機台編號列表 | Get equipment number list
router.get('/api/check-equipment', authMiddleware, async (req: any, res: any) => {


    const prisma = prismaMes;
    let dataSend = [] as checkEquipmentData[];


    try {
        const equipmentData = await prisma.PropertyNumberForm.findMany({
            distinct: ['propertyNumber'],
            select: {
                version: true,
                propertyNumber: true,
                propertyName: true,
                createDate: true,
                updateDate: true
            },
            take: 2
        })

        console.log('Unique equipment numbers:', typeof equipmentData, " | ", equipmentData);

        if (Array.isArray(equipmentData) && equipmentData.length > 0) {
            for (let item of equipmentData) {
                dataSend.push(item);
            }
        }

        console.log('Data to be sent for equipment numbers:', typeof dataSend, " | ", dataSend);

        res.status(200).json({
            success: true,
            message: '查詢成功',
            data: dataSend
        })

    } catch (error) {
        console.error('Error in GET /api/check-equipment route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})

router.get('/api/fetch-properties', authMiddleware, async (req: any, res: any) => {
    const prisma = prismaMes;

    let allData = [] as checkEquipmentDataAll[];


    try {
        const propertiesData = await prisma.PropertyNumberForm.findMany({
            select: {
                version: true,
                propertyNumber: true,
                propertyName: true,
            }
        })

        allData.push(
            propertiesData.map((item: any) => ({
                version: item.version,
                propertyNumber: item.propertyNumber,
                propertyName: item.propertyName,
            }))
        )

        // console.log('Data to be sent for all properties:', typeof allData , " | " , allData);

        res.status(200).json({
            success: true,
            message: '查詢成功',
            data: allData
        })

    } catch (error) {
        console.error('Error in GET /api/fetch-properties route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})

router.post('/api/updateGroupForm', authMiddleware, async (req: any, res: any) => {

    const data: formGroup = req.body;
    const user = req.user;

    let finalSend = [] as checkGroupData[];
    console.log('Received request body for updating group form:', data);

    // console.log('Received data for updating group form:', data);
    // console.log('Authenticated user info:', user);

    let dataBack = data.formData as checkGroupData[];
    // console.log('Extracted formData from request body:', dataBack);

    if (Array.isArray(dataBack) && dataBack.length > 0) {
        for (let item of dataBack) {
            if (item.createBy === null || item.createBy === undefined || item.createBy === '') {
                item.createBy = user.username + ' ( ' + user.memberID + ' ) ';
            } else {
                item.updateBy = user.username + ' ( ' + user.memberID + ' ) ';
            }
        }
        finalSend = dataBack;
    }
    // console.log('Final data to be sent for updating group form:', finalSend);

    try {
        const response = await groupDataUpsert(finalSend as any);
        res.status(200).json({
            success: true,
            message: '更新成功',
            data: response
        })

    } catch (error) {
        console.error('Error in POST /api/updateGroupForm route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})

router.get('/api/checkDataForm', authMiddleware, async (req: any, res: any) => {
    const page = req.query.page;
    const queryData = req.query.datas || req.query.data;
    console.log('Received query parameters for checking form data:', queryData, "| ", Number(page));

    try {
        const response = await findGroupData(queryData);
        // console.log('Response from findGroupData in /api/check-form-data route:', typeof response , " | " , response);  


        res.status(200).json({
            success: true,
            message: '查詢成功',
            data: response
        })

    } catch (error) {
        console.error('Error in GET /api/check-form-data route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})


// 單一查詢 formNo 的表單
router.get('/api/checkUniqueFormData', authMiddleware, async (req: any, res: any) => {
    const page = req.query.page;
    const queryData = req.query.datas || req.query.data;

    // console.log('Received query parameters for checking unique form data:', queryData, '|', page);
    // console.log('Received query parameters for checking unique form data:', queryData.findInput, '|', page);


    try {
        const prisma = prismaMes;
        // console.log('確認checkUniqueFormData 是否有被打到並查看queryData內容:', queryData);

        if (queryData.findInput === "") {
            const response = await prisma.ChecklistMainGroup.findMany({
                where: {
                    workTypeSetting: {
                        contains: queryData.workTypeSetting ? String(queryData.workTypeSetting).trim() : '',
                    },
                },
                take: 10,
                skip: 0,
                orderBy: {
                    groupNo: 'desc'
                },
                include: {
                    formDefinitions: true
                }
            })
            // console.log('checkUniqueFormData function response for empty input:', typeof response , " | " , response);
            res.status(200).json({
                success: true,
                message: '查詢成功',
                data: response
            });
        }

        else if (queryData.findInput) {

            const response = await prisma.ChecklistFormDefinition.findMany({
                where: {
                    formNo: {
                        contains: queryData.findInput
                    },
                    workTypeSetting: {
                        contains: queryData.workTypeSetting ? String(queryData.workTypeSetting).trim() : '',
                    },
                },
                include: {
                    mainGroup: {
                        select: {
                            groupNo: true,
                            isIsoCertified: true,
                            isoCertifiedAt: true,
                            isoImgPath: true,
                            createdAt: true,
                            updatedAt: true,
                            createBy: true,
                            updateBy: true,
                        },
                    }
                }
            })
            console.log('checkUniqueFormData function response for input:', typeof response, " | ", response);
            const grouped = new Map<string, any>();

            response.forEach((item: any) => {
                const mg = item.mainGroup;
                if (!mg) {
                    return;
                }

                if (!grouped.has(mg.groupNo)) {
                    grouped.set(mg.groupNo, {
                        groupNo: mg.groupNo,
                        isIsoCertified: mg.isIsoCertified,
                        isoCertifiedAt: mg.isoCertifiedAt,
                        isoImgPath: mg.isoImgPath,
                        createdAt: mg.createdAt,
                        updatedAt: mg.updatedAt,
                        createBy: mg.createBy,
                        updateBy: mg.updateBy,
                        formDefinitions: []
                    });
                }

                grouped.get(mg.groupNo).formDefinitions.push({
                    approveAreaCheck: item.approveAreaCheck,
                    approverSetting: item.approverSetting,
                    area: item.area,
                    task: item.task,
                    formNo: item.formNo,
                    formTitle: item.formTitle,
                    groupNo: item.groupNo,
                    id: item.id,
                });
            });

            const dataSend = Array.from(grouped.values());
            res.status(200).json({
                success: true,
                message: '查詢成功',
                data: dataSend
            });
        }


    } catch (error) {
        console.error('Error in GET /api/checkUniqueFormData route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})


router.post('/api/updateUniqueForm', authMiddleware, async (req: any, res: any) => {
    // Accept data from body, not query
    const formData = req.body.formData;
    console.log('Received formData for updating unique form:', formData);
    try {
        const response = await groupDataUpsert(formData);
        console.log('Response from groupDataUpsert in /api/updateUniqueForm route:', typeof response, ' | ', response);
        res.status(200).json({
            success: true,
            message: '更新成功',
            data: response
        });
    } catch (error) {
        console.error('Error in POST /api/updateUniqueForm route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
});

router.get('/api/searchChecklist', authMiddleware, async (req: any, res: any) => {
    const condition = req.params.condition;
    const tokem = req.headers.authorization.split(' ')[1];
    console.log('Received search condition for checklist:', condition);
    console.log('Received token for checklist search:', tokem);

    try {

        res.status(200).json({
            success: true,
            message: '查詢成功',
            // data : dataSend
        })
    } catch (error) {
        console.error('Error in GET /api/searchChecklist route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})


// review checklist find all data
router.get('/api/checkreview_Found', authMiddleware, async (req: any, res: any) => {

    const queryData = req.query?.data ? req.query?.data : {}
    let dataSend = [] as any;
    const newDate = new Date();

    console.log(`queryData from request:`, typeof queryData, '|', queryData && typeof queryData === 'object' ? JSON.stringify(queryData) : queryData);

    const startDateCheck = moment(req.query?.['data[startDate]']).tz('Asia/Taipei').format('YYYY-MM-DD 00:00:00')
    const endDateCheck = moment(req.query?.['data[endDate]']).tz('Asia/Taipei').format('YYYY-MM-DD 23:59:59')
    console.log('Parsed endDate with timezone adjustment:', endDateCheck);



    const data = (queryData && typeof queryData === 'object')
        ? queryData as check_reviewFormData_find
        : {
            startDate: startDateCheck ?? newDate,
            endDate: endDateCheck ?? newDate,
            groupNo: req.query?.['data[groupNo]'] || null,
            formNo: req.query?.['data[formNo]'] || null,
            equipNo: req.query?.['data[equipNo]'] || null,
            page: req.query?.['data[page]'] || null,
            pageSize: req.query?.['data[pageSize]'] || null,
        } as check_reviewFormData_find;


    try {
        if (!data?.startDate || !data?.endDate) {
            return res.status(400).json({
                success: false,
                message: '缺少必要查詢參數: startDate 和 endDate 為必填項'
            });
        }

        const prisma = prismaMes;
        const whereClause: any = {
            inspectDate: {
                gte: new Date(String(data.startDate)),
                lte: new Date(String(data.endDate)),
            }
        };

        // 預設 all 搜索：只有提供條件時才加上篩選
        if (data.groupNo) {
            whereClause.groupNo = String(data.groupNo) ?? null;
        }
        if (data.formNo) {
            whereClause.formNo = String(data.formNo) ?? null;
        }
        if (data.equipNo) {
            whereClause.machineId = {
                in: [String(data.equipNo) ?? null]
            };
        }

        const response = await prisma.ChecklistOpInputData.findMany({
            where: whereClause,
            select: {
                id: true,
                groupNo: true,
                formNo: true,
                machineId: true,
                title: true,
                opId: true,
                opName: true,
                task: true,
                area: true,
                createdAt: true,
                updatedAt: true,
                isDelete: true,
                approverName: true,
                approverId: true,
                approvedAt: true,
                approveSelect: true,
                isApproved: true,
                mainGroup: {
                    select: {
                        isoCertifiedAt: true,
                    }
                },
                formDefinition: {
                    select: {
                        approverSetting: true,
                        approveAreaCheck: true,
                    }
                },
                rejectReason: true,

            },
            orderBy: {
                inspectDate: 'desc'
            },
            take: data.pageSize ? parseInt(String(data.pageSize)) : 10,
            skip: data.page && data.pageSize ? (parseInt(String(data.page)) - 1) * parseInt(String(data.pageSize)) : 0,
        })

        const countTotal = await prisma.ChecklistOpInputData.count({
            where: whereClause
        });

        dataSend = response && response.length > 0 ? response : [];
        console.log('Response from database for checklist review search:', typeof response, ' | ', response);

        res.status(200).json({
            success: true,
            message: '查詢成功',
            data: dataSend,
            pagination: {
                total: countTotal,
                page: data.page ? parseInt(String(data.page)) : 1,
                pageSize: data.pageSize ? parseInt(String(data.pageSize)) : 10
            }
        })
    } catch (error) {
        console.error('Error in GET /api/checkreview_Found route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        })
    }
})

router.post('/api/sendApprovedData', authMiddleware, async (req: any, res: any) => {
    const finalSelect = req?.body
    // console.log('Received data for sending approved data:', finalSelect);
    const uploadData = JSON.stringify(finalSelect) as any;
    const dataFinal = JSON.parse(uploadData); // 確保上傳的資料是有效的 JSON 格式
    // console.log('Data to be sent for approved data:', typeof dataFinal, ' | ', dataFinal);


    let boolean_approveSelect: boolean;
    console.log('Processing approveSelect value:', dataFinal?.finalSelect?.approveSelect);
    switch (String(dataFinal?.finalSelect?.approveSelect).toLowerCase()) {
        case 'approve':
            boolean_approveSelect = true;
            break;
        case 'denied':
            boolean_approveSelect = false;
            break;
        default:
            console.warn('Unexpected approveSelect value:', dataFinal?.finalSelect?.approveSelect);
            res.status(500).json({
                success: false,
                message: '傳送給伺服器的 approveSelect 值無效 | Invalid approveSelect value'
            });
            return;

    }



    try {

        const prisma = prismaMes;
        await prisma.ChecklistOpInputData.updateMany({
            where: {
                id: Number(dataFinal?.finalSelect?.id),
                opId: String(dataFinal?.finalSelect?.opId),
                groupNo: String(dataFinal?.finalSelect?.groupNo),
                formNo: String(dataFinal?.finalSelect?.formNo),
                createdAt: new Date(String(dataFinal?.finalSelect?.createdAt)),
            },
            data: {
                approverId: String(dataFinal?.finalSelect?.approverId),
                approverName: String(dataFinal?.finalSelect?.approverName),
                approvedAt: new Date(String(dataFinal?.finalSelect?.approvedAt)),
                approveSelect: boolean_approveSelect,
                rejectReason: String(dataFinal?.finalSelect?.rejectReason) || null,
            }
        })

        res.status(200).json({
            success: true,
            message: '資料接收成功',
            data: finalSelect
        })
    } catch (error) {
        console.error('Error in POST /api/sendApprovedData route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})

router.get('/api/findAllFormNumber', authMiddleware, async (req: any, res: any) => {
    const workTypeSetting = req.query.workTypeSetting ? String(req.query.workTypeSetting).trim() : '';
    console.log('Received workTypeSetting for finding all form numbers:', workTypeSetting);

    try {
        const prisma = prismaMes;

        // 抓到群單號 與 表單號 
        const formData = await prisma.ChecklistFormDefinition.findMany({
            where: {
                workTypeSetting: {
                    contains: workTypeSetting,
                },
            },
            select: {
                groupNo: true,
                formNo: true,
                workTypeSetting: true,

            },
            distinct: ['formNo', 'groupNo']
        });

        let form = [] as any;
        let group = [] as any;
        typeof formData === 'object' && formData.length > 0 && formData.forEach((item: any) => {
            item.formNo = item.formNo ?? '';
            item.groupNo = item.groupNo ?? '';

            form.push(item.formNo)
            group.push(item.groupNo)

        })



        // 抓到 設備編號列表，並且處理成前端需要的格式
        const equipmentSet = await prisma.PropertyNumberForm.findMany({
            select: {
                propertyNumber: true,
                propertyName: true,
            },
            distinct: ['propertyNumber']
        }
        )

        let equip = [] as any;
        typeof equipmentSet === 'object' &&
            equipmentSet.length > 0 &&
            equipmentSet.forEach((item: any) => {
                item.formNo = item.formNo ?? '';
                item.groupNo = item.groupNo ?? '';
                item.equip = item.formNo && item.groupNo ? `${item.groupNo} - ${item.formNo}` : '';
                equip.push(item.equip)
            })



        const finalResult = {
            form: [...new Set(form)],
            group: [...new Set(group)],
            equip: [...new Set(equip)]
        } as any;

        res.status(200).json({
            success: true,
            message: '查詢成功',
            data: finalResult
        })

    } catch (error) {
        console.error('Error in GET /api/findAllFormNumber route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})

// 刪除群單號
router.put('/deleteGroupForm', authMiddleware, async (req: any, res: any) => {
    const { groupNo } = req.body;

    console.log('Received groupNo for deletion:', groupNo);

    if (!groupNo) {
        return res.status(400).json({
            success: false,
            message: 'groupNo 為必填',
        });
    }

    try {

        const prisma = prismaMes;
        const checkIso = await prisma.ChecklistMainGroup.findUnique({
            where: {
                groupNo: String(groupNo)
            },
            select: {
                isIsoCertified: true
            }
        })


        const nowDate = new Date();

        const deleteResult = await prisma.ChecklistMainGroup.update({
            where: {
                groupNo
            },
            data: {
                isDelete: true,
                deleteAt: nowDate,
                deleteBy: String(req.user?.username ?? 'system Delete') + ' ( ' + String(req.user?.memberID || 'system Delete') + ' ) '

            }
        });

        if (checkIso?.isIsoCertified === true) {
            try {
                await sendToManager(
                    groupNo as string,
                    String(req.user?.username ?? 'system Delete') + ' ( ' + String(req.user?.memberID || 'system Delete') + ' ) '
                );
            } catch (error) {
                console.error('Error in sending to manager:', error);
            }
        }

        console.log('Soft delete result for groupNo', groupNo, ':', deleteResult);

        res.status(200).json({
            success: true,
            message: checkIso?.isIsoCertified === true ? '已更改為作廢' : '刪除成功',
        })

    } catch (error) {
        console.error('Error in PUT /deleteGroupForm route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})

router.get('/getReferenceData', authMiddleware, async (req: any, res: any) => {

    const finalSend = [] as string[];
    try {
        const prisma = prismaMes
        const response = await prisma.ChecklistFormDefinition.findMany({
            distinct: ['formTitle'],
            select: {
                formTitle: true,
            },
        })
        console.log('check getReferenceData resp :', response)

        response.forEach((item: any) => {
            finalSend.push(item.formTitle);
        });

        res.status(200).json({
            success: true,
            message: '查詢成功',
            data: finalSend
        })

    } catch (error: unknown) {
        console.error('Error in GET /getReferenceData route:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤，請稍後再試 | Server error, please try again later'
        });
    }
})

router.get('/getReferenceSmallItem', authMiddleware, async (req: any, res: any) => {
    const { formTitle } = req.query;

    console.log('有進入到 getReferenceSmallItem function , 收回 : ', formTitle);

    if (!formTitle || typeof formTitle !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'formTitle 為必填且必須是字串',
        });
    }

    try {

        const prisma = prismaMes;
        const task = await prisma.ChecklistFormDefinition.findMany({
            select: {
                formTitle: true,
                task: true,
            },
            where: {
                formTitle: String(formTitle).trim()
            }
        })
        console.log('getReferenceSmallItem function response :', typeof task, " | ", task);



        res.status(200).json({
            success: true,
            message: '找尋題目成功',
            data: task
        })

    } catch (error: any) {
        console.log('error for getReferenceSmallItem:', error);
        throw error;
    }
})

module.exports = router;