const mssql = require("mssql");
const { sendDbErrorNotification, sendDbPressureNotification } = require('./discord_notifier.js');
const dbName = 'MSSQL_ASRS_HTBI';


// 管理連接池
let pool;
let lastPressureNotifyTimestamp = 0;
const PRESSURE_THRESHOLD = 5; // 等待中的連線數超過此值時觸發警告
const NOTIFY_INTERVAL = 5 * 60 * 1000; // 5分鐘

// 建立資料庫連接配置
const dbConfig = {
    user: "HTBI_MES",
    password: "mes123",
    server: "192.168.200.52",
    database: "ASRS_HTBI",
    port: 1433,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};


setInterval(() => {
  // mysql2/promise 的結構中，底層連線池通常在 .pool 屬性下
  const poolInternal = dbConfig; 
  if (poolInternal) {
    // console.log(
    //   `MSSQL DB Pool Status:`,
    //   {
    //      allConnections: poolInternal._allConnections?.length || 0,
    //      freeConnections: poolInternal._freeConnections?.length || 0,
    //      queuedQueries: poolInternal._connectionQueue?.length || 0,
    //   }
    // );
  } else {
    console.log("等待資料庫連線池初始化...");
  }
}, 5000);

const getPoolStats = (p) => {
    if (!p) return null;
    return {
        total: p.size,
        idle: p.available,
        acquired: p.size - p.available,
        pending: p.pending,
    };
};

async function getMSPool() {
  // 檢查壓力 (即使在 pool 存在的情況下)
  if (pool && pool.connected) {
    const stats = getPoolStats(pool);
    const now = Date.now();
    if (stats.pending > PRESSURE_THRESHOLD && (now - lastPressureNotifyTimestamp > NOTIFY_INTERVAL)) {
        lastPressureNotifyTimestamp = now;
        await sendDbPressureNotification(dbName, stats);
    }
  }

  if (!pool || !pool.connected) {
    try {
      // 初始化連接池
      pool = await mssql.connect(dbConfig);
      console.log("MSSQL 連接池已建立");
    } catch (err) {
      console.error("初始化 MSSQL 連接池失敗:", err);
      // 連線失敗，發送 Discord 通知
      await sendDbErrorNotification(dbName, err);
      throw err;
    }
  }
  return pool;
}

// 導出時把 dbConfig 作為主要匯出（讓現有程式可以直接把此模組傳入 mssql.connect）
// 同時附加 getMSPool 與 mssql 屬性供需要的檔案存取
module.exports = dbConfig;
module.exports.getMSPool = getMSPool;
module.exports.mssql = mssql;
