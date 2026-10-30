import express, { Request, Response, NextFunction } from "express";
import axios from "axios";
import { z } from 'zod'

require('dotenv').config();

const router = express.Router();

export interface EcountCredentials {
    COM_CODE?: string;
    USER_ID?: string;
    API_CERT_KEY?: string;
    LAN_TYPE?: string;
}

export const ecountZoneSchema = z.object({
    Status: z.union([z.string(), z.number()]),
    Error: z.any().nullable().optional(),
    Data: z.object({
        ZONE: z.string(),
        DOMAIN: z.string(),
    }),
    timeStamp: z.union([z.number(), z.string()]).optional(),
});
export type EcountZoneResult = z.infer<typeof ecountZoneSchema>;


export const ecountLoginSchema = z.object({
    Data: z.object({
        EXPIRE_DATE: z.string().optional(),
        NOTICE: z.string().optional(),
        Code: z.union([z.string(), z.number()]).optional(),
        Datas: z.object({
            COM_CODE: z.string(),
            USER_ID: z.string(),
            SESSION_ID: z.string(),
        }).optional(),
        RedirectUrl: z.string().optional()
    }).nullable().optional(),
    Status: z.union([z.string(), z.number()]),
    Error: z.any().nullable().optional(),
    Timestamp: z.union([z.number(), z.string()]).optional(),
});
export type EcountLoginResponse = z.infer<typeof ecountLoginSchema>;

const COM_CODE = process.env.COM_CODE as string;
const USER_ID = process.env.USER_ID as string;
const API_CERT_KEY = process.env.API_CERT_KEY as string;
const LAN_TYPE = process.env.LAN_TYPE as string;


/**
 * 1. 通用型指數退避 (Exponential Backoff) 高階函式包裝器
 * 依據傳入的任意非同步函式與參數，在失敗時自動 recall，延遲時間呈指數成長
 */
export function withRetry<Args extends any[], Return>(
    fn: (...args: Args) => Promise<Return>,
    maxRetries = 3,
    baseDelayMs = 500,
    maxDelayMs = 5000
) {
    return async (...args: Args): Promise<Return> => {
        let attempt = 0;
        while (true) {
            try {
                return await fn(...args);
            } catch (error: any) {
                attempt++;
                if (attempt >= maxRetries) {
                    console.error(`[withRetry] 達到最大重試次數 (${maxRetries})，放棄重試。`);
                    throw error;
                }
                const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
                console.warn(`[withRetry] 第 ${attempt} 次失敗，等待 ${delay}ms 後自動 recall... 錯誤:`, error?.message ?? error);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    };
}

/**
 * 2. 通用型搭便車 (Singleflight / Request Coalescing) 包裝器
 * 當同時有多個併發請求呼叫同一個 key 時，只發動一次真實請求，其餘請求直接「搭便車」共用同一個 Promise
 */
const inFlightRequests = new Map<string, Promise<any>>();

export function withSingleflight<T>(
    key: string,
    fn: () => Promise<T>
): Promise<T> {
    const existingPromise = inFlightRequests.get(key);
    if (existingPromise) {
        console.log(`[Singleflight] 偵測到「${key}」已有正在進行的請求，啟動搭便車模式！`);
        return existingPromise;
    }

    const promise = fn().finally(() => {
        inFlightRequests.delete(key);
    });

    inFlightRequests.set(key, promise);
    return promise;
}

// 實際執行登入 Ecount 的邏輯
const executeLogin = async () => {
    // 1. 取得 ZONE 並透過 Zod 驗證解析
    const zoneResponse = await axios.post('https://sboapi.ecount.com/OAPI/V2/Zone', {
        'COM_CODE': COM_CODE,
    });
    console.log('查看是否有收到資料 :', zoneResponse.data);

    const parsedZone = ecountZoneSchema.parse(zoneResponse.data);
    const zone = parsedZone.Data.ZONE as string | undefined;
    console.log('確認 zone內容', zone);

    const loginResponse = await axios.post(`https://sboapi${zone}.ecount.com/OAPI/V2/OAPILogin`, {
        'COM_CODE': COM_CODE,
        'USER_ID': USER_ID,
        'API_CERT_KEY': API_CERT_KEY,
        'LAN_TYPE': LAN_TYPE,
        'ZONE': zone
    });
    // console.log('response about login :', loginResponse.data);

    // 透過 Zod 檢驗登入回傳包裹
    const parsedLogin = ecountLoginSchema.parse(loginResponse.data);

    // 檢查 Ecount 的 Status 是否成功 (200) 以及是否有拿到 SESSION_ID
    if (String(parsedLogin.Status) !== "200" || !parsedLogin.Data?.Datas?.SESSION_ID) {
        throw new Error(`[EcountLogin] 登入失敗: ${JSON.stringify(parsedLogin.Error ?? '查無有效 SESSION_ID')}`);
    }

    const finalSendLoginAuth = parsedLogin.Data.Datas;
    // console.log('✅ Ecount 登入成功，取得 SESSION_ID:', finalSendLoginAuth.SESSION_ID);

    return {
        SESSION_ID: finalSendLoginAuth.SESSION_ID,
        ZONE: zone as string
    };
};

// 透過 withRetry 包裝，產生自動 recall 的函式
const retryableLogin = withRetry(executeLogin, 3, 500);

// 3. 快取結構與儲存 (Memory Cache with TTL)
interface CachedEcountAuth {
    SESSION_ID: string;
    ZONE: string;
    createdAt: number;
    expiresAt: number;
}

let cachedAuth: CachedEcountAuth | null = null;

// Session 快取效期（Ecount 預設 20 分鐘，我們預留 3 分鐘安全緩衝，設為 17 分鐘）
const SESSION_CACHE_TTL_MS = 20 * 60 * 1000;

/**
 * 手動清除快取（若其他 API 發現 Session 被 Ecount 判定失效時可呼叫）
 */
export const clearEcountCache = () => {
    cachedAuth = null;
    console.log('[EcountCache] 快取已手動清除。');
};

/**
 * 對外輸出的 loginEcount：
 * 結合「安全記憶體快取 (Safety Buffer TTL)」+「搭便車 (Singleflight)」+「指數退避 (Retry)」
 * @param forceRefresh 是否強制忽略快取重新向 Ecount 登入
 */
export const loginEcount = async (forceRefresh = false) => {
    const now = Date.now();

    // ① 快取命中 (Cache Hit)：時間在安全效期內且未強制刷新，0ms 直接秒回
    if (!forceRefresh && cachedAuth && now < cachedAuth.expiresAt) {
        return {
            SESSION_ID: cachedAuth.SESSION_ID,
            ZONE: cachedAuth.ZONE,
            expiresAt: cachedAuth.expiresAt,
            expiresInSeconds: Math.max(0, Math.floor((cachedAuth.expiresAt - now) / 1000)),
            fromCache: true,
        };
    }

    // ② 快取失效或強制刷新：啟動「搭便車 (Singleflight)」
    return withSingleflight('ecount-login-request', async () => {
        const doubleCheckNow = Date.now();
        // Double-check 快取（避免同時排隊的人重複請求）
        if (!forceRefresh && cachedAuth && doubleCheckNow < cachedAuth.expiresAt) {
            return {
                SESSION_ID: cachedAuth.SESSION_ID,
                ZONE: cachedAuth.ZONE,
                expiresAt: cachedAuth.expiresAt,
                expiresInSeconds: Math.max(0, Math.floor((cachedAuth.expiresAt - doubleCheckNow) / 1000)),
                fromCache: true,
            };
        }

        // 實際執行登入 (自帶指數退避 recall)
        const result = await retryableLogin();
        const expiresAt = Date.now() + SESSION_CACHE_TTL_MS;

        // 寫入快取
        cachedAuth = {
            SESSION_ID: result.SESSION_ID,
            ZONE: result.ZONE,
            createdAt: Date.now(),
            expiresAt: expiresAt,
        };

        return {
            SESSION_ID: result.SESSION_ID,
            ZONE: result.ZONE,
            expiresAt: cachedAuth.expiresAt,
            expiresInSeconds: Math.floor(SESSION_CACHE_TTL_MS / 1000),
            fromCache: false,
        };
    });
};

// 實際執行抓取 Ecount 採購單邏輯
const executeGetPurchaseOrder = async (
    ZONE: string,
    SESSION_ID: string,
) => {
    if (!ZONE || !SESSION_ID) {
        throw new Error("缺少必要參數");
    }

    const baseApiUrl = `https://sboapi${ZONE}.ecount.com/OAPI/V2/Purchases/GetPurchasesOrderList?SESSION_ID=${SESSION_ID}`;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dayStart = '01';
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const dayEnd = String(lastDay).padStart(2, '0');

    const BASE_DATE_FROM = `${year}${month}${dayStart}`;
    const BASE_DATE_TO = `${year}${month}${dayEnd}`;

    const payload = {
        PROD_CD: "",
        CUST_CD: "",
        ListParam: {
            PAGE_CURRENT: 1,
            PAGE_SIZE: 5,
            BASE_DATE_FROM: BASE_DATE_FROM,
            BASE_DATE_TO: BASE_DATE_TO
        }
    };

    const response = await axios.post(baseApiUrl, payload);

    if (String(response.data?.Status) !== "200") {
        throw new Error(`[EcountPurchaseOrder] 取得資料失敗: ${JSON.stringify(response.data?.Errors ?? response.data?.Error ?? response.data)}`);
    }

    console.log('check response about getEcountPurchaseOrder  :', response.data);
    return response.data;
};

// 透過 withRetry 包裝，產生自動 recall 的函式（最多重試 3 次，初始延遲 500ms）
const retryableGetPurchaseOrder = withRetry(executeGetPurchaseOrder, 3, 500);

// 結合「搭便車 (Singleflight)」+「指數退避 (Retry)」獲取採購單資料
export const getEcountPurchaseOrder = async (
    ZONE: string,
    SESSION_ID: string,
) => {
    const singleflightKey = `ecount-purchase-order-${ZONE}`;
    return withSingleflight(singleflightKey, () => {
        return retryableGetPurchaseOrder(ZONE, SESSION_ID);
    });
};

router.get('/checkEcountLogin', async (req: Request, res: Response) => {
    try {
        const force = req.query.force === 'true' || req.query.force === '1';
        const result = await loginEcount(force);

        console.log('[EcountConnect] 登入資訊:', result);

        const logindataSet = {
            SESSION_ID: result.SESSION_ID,
            ZONE: result.ZONE
        }

        return res.status(200).json({
            success: true,
            data: {
                auth: logindataSet,
            },
            message: force ? '已強制重新向 Ecount 登入！' : 'Ecount 資料取得成功'
        });
    } catch (error: any) {
        console.error('[EcountConnect] 取得資料失敗:', error?.message ?? error);
        return res.status(500).json({
            success: false,
            data: null,
            message: 'Ecount 登入與快取獲取失敗',
            error: error?.message ?? String(error)
        });
    }
});

router.get('/getEcount_purchaseOrder', async (req: Request, res: Response) => {
    try {
        const result = await loginEcount();
        const responseData = await getEcountPurchaseOrder(result.ZONE, result.SESSION_ID);
        return res.status(200).json({
            success: true,
            data: responseData,
            message: 'Ecount 採購單資料取得成功'
        });
    } catch (error: any | undefined) {
        console.error('確認 undefinded 資訊 :', error)
        return res.status(500).json({
            success: false,
            data: null,
            message: 'Ecount 採購單資料取得失敗',
            error: error?.message ?? String(error)
        });
    }
})

module.exports = router;
module.exports.loginEcount = loginEcount;
module.exports.clearEcountCache = clearEcountCache;
module.exports.getEcountPurchaseOrder = getEcountPurchaseOrder;
export default router;


