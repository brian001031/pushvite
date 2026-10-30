require('dotenv').config();
const axios = require('axios');
const moment = require('moment-timezone');


/**
 * Sends a database connection error notification to a Discord webhook.
 * @param {string} dbName - The name of the database or connection pool.
 * @param {Error} error - The error object.
 * @param {object} [stats=null] - Optional pool statistics.
 * @param {number} [stats.total] - Total connections.
 * @param {number} [stats.idle] - Idle/available connections.
 * @param {number} [stats.acquired] - Acquired/in-use connections.
 * @param {number} [stats.pending] - Pending connection requests.
 */
const sendDbErrorNotification = async (dbName, error, stats = null) => {
    const webhookUrl = process.env.Albert_ERROR_WEBHOOK_URL
    
    if (!webhookUrl) {
        console.error('DISCORD_DB_ERROR_WEBHOOK or discord_presure_error is not set. Cannot send Discord notification.');
        return;
    }

    const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
    let description = `**時間:** ${now}\n**錯誤:** \`\`\`${error.message}\`\`\``;

    if (stats) {
        description += `\n\n**連線池狀態:**\n`;
        description += `- **總連線數 (Total):** ${stats.total ?? 'N/A'}\n`;
        description += `- **閒置連線 (Idle/Available):** ${stats.idle ?? 'N/A'}\n`;
        description += `- **使用中 (Acquired/In-Use):** ${stats.acquired ?? 'N/A'}\n`;
        description += `- **等待中 (Pending):** ${stats.pending ?? 'N/A'}\n`;
    }


    const embed = {
        title: `🚨 資料庫連線失敗: ${dbName}`,
        description: description,
        color: 15158332, // Red
        timestamp: new Date().toISOString(),
    };

    try {
        await axios.post(webhookUrl, {
            embeds: [embed],
        });
        console.log(`Successfully sent Discord notification for ${dbName} connection error.`);
    } catch (discordError) {
        console.error('Failed to send Discord notification:', discordError.message);
    }
};

/**
 * Sends a database connection pool pressure warning to a Discord webhook.
 * @param {string} dbName - The name of the database or connection pool.
 * @param {object} stats - Pool statistics.
 * @param {number} stats.total - Total connections.
 * @param {number} stats.idle - Idle/available connections.
 * @param {number} stats.acquired - Acquired/in-use connections.
 * @param {number} stats.pending - Pending connection requests.
 */
const sendDbPressureNotification = async (dbName, stats) => {
    const webhookUrl = process.env.Albert_ERROR_WEBHOOK_URL

    if (!webhookUrl) {
        console.error('DISCORD_DB_ERROR_WEBHOOK or discord_presure_error is not set. Cannot send Discord notification.');
        return;
    }

    const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
    const description = `**時間:** ${now}\n\n**連線池狀態:**\n- **總連線數 (Total):** ${stats.total ?? 'N/A'}\n- **閒置連線 (已釋放):** ${stats.idle ?? 'N/A'}\n- **使用中 (未釋放):** ${stats.acquired ?? 'N/A'}\n- **等待中 (等待數量):** ${stats.pending ?? 'N/A'}`;

    const embed = {
        title: `⚠️ 資料庫連線池壓力警告: ${dbName}`,
        description: description,
        color: 16776960, // Yellow
        timestamp: new Date().toISOString(),
    };

    try {
        await axios.post(webhookUrl, {
            embeds: [embed],
        });
        console.log(`Successfully sent Discord notification for ${dbName} high pressure.`);
    } catch (discordError) {
        console.error('Failed to send Discord pressure notification:', discordError.message);
    }
};


module.exports = { sendDbErrorNotification, sendDbPressureNotification };
