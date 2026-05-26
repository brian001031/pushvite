const mysql = require("mysql2/promise");
const { sendDbErrorNotification, sendDbPressureNotification } = require('./discord_notifier.js');
const dbName = 'mes_db'; // 定義資料庫名稱以供通知使用

const pool = mysql.createPool({
  host: process.env.MES_DB_HOST || "192.168.3.100",
  user: process.env.MES_DB_USER || "root",
  password: process.env.MES_DB_PASS || "Admin0331",
  database: process.env.MES_DB_NAME || "mes",
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  multipleStatements: true,
});


// setInterval(() => {
//   // mysql2/promise 的結構中，底層連線池通常在 .pool 屬性下
//   const poolInternal = pool.pool; 
//   if (poolInternal) {
//     console.log(
//       `MES DB Pool Status:`,
//       {
//          allConnections: poolInternal._allConnections?.length || 0,
//          freeConnections: poolInternal._freeConnections?.length || 0,
//          queuedQueries: poolInternal._connectionQueue?.length || 0,
//       }
//     );
//   } else {
//     console.log("等待資料庫連線池初始化...");
//   }
// }, 5000);




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
    pool,
};
