//資料庫 用mysql2 (promise API)
const mysql = require("mysql2/promise");
const { sendDbErrorNotification, sendDbPressureNotification } = require('./discord_notifier.js');
const dbName = 'coldelectric_main'; // 定義資料庫名稱以供通知使用

// 使用 mysql2/promise 時，createPool 已是 Promise 版
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "coldelectric",
  password: process.env.DB_PASS || "1234",
  database: process.env.DB_NAME || "coldelectric",
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
});

let lastPressureNotifyTimestamp = 0;
const PRESSURE_THRESHOLD = 5; // 等待中的連線數超過此值時觸發警告
const NOTIFY_INTERVAL = 5 * 60 * 1000; // 5分鐘

const getPoolStats = () => {
    return {
        total: pool.pool._allConnections.length,
        idle: pool.pool._freeConnections.length,
        acquired: pool.pool._allConnections.length - pool.pool._freeConnections.length - pool.pool._acquiringConnections.length,
        pending: pool.pool._acquiringConnections.length,
    };
};

// 裝飾 query 方法以攔截錯誤
const query = async (sql, params) => {
    try {
        const [results, fields] = await pool.query(sql, params);
        return [results, fields];
    } catch (error) {
        if (['ENOTFOUND', 'ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) {
            await sendDbErrorNotification(dbName, error, getPoolStats());
        }
        throw error;
    }
};

// 裝飾 execute 方法
const execute = async (sql, params) => {
    try {
        const [results, fields] = await pool.execute(sql, params);
        return [results, fields];
    } catch (error) {
        if (['ENOTFOUND', 'ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) {
            await sendDbErrorNotification(dbName, error, getPoolStats());
        }
        throw error;
    }
};

// 裝飾 getConnection 方法
const getConnection = async () => {
    const stats = getPoolStats();
    const now = Date.now();

    // 檢查壓力並節流
    if (stats.pending > PRESSURE_THRESHOLD && (now - lastPressureNotifyTimestamp > NOTIFY_INTERVAL)) {
        lastPressureNotifyTimestamp = now;
        await sendDbPressureNotification(dbName, stats);
    }

    try {
        const connection = await pool.getConnection();
        return connection;
    } catch (error) {
        if (['ENOTFOUND', 'ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'POOL_CLOSED'].includes(error.code)) {
            await sendDbErrorNotification(dbName, error, getPoolStats());
        }
        throw error;
    }
};


// 導出與原始 pool 相容的物件，但包含我們的錯誤處理邏輯
module.exports = {
    query,
    execute,
    getConnection,
    pool, // 仍然導出原始 pool 以防有其他地方直接使用
};