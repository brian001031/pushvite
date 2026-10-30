const express = require('express');
const router = express.Router();
const db_connect = require('../modules/db_connect');
const mysql_connect = require('../modules/mysql_connect');
const mysql_connect_mes = require('../modules/mysql_connect_mes');
const { getMSPool } = require('../modules/mssql_newconnect');


// SSE stream for continuous db status
router.get('/debug', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let stopped = false;
    req.on('close', () => { stopped = true; });

    async function sendStatus() {
        while (!stopped) {
            try {
                const statuses = await getPoolStats()
                const payload = {
                    message: 'Database connection pool status',
                    timestamp: new Date().toISOString(),
                    pools: statuses
                };
                res.write(`data: ${JSON.stringify(payload)}\n\n`);
            } catch (error) {
                res.write(`data: {\"error\":\"${error.message}\"}\n\n`);
            }
            await new Promise(r => setTimeout(r, 2000)); // 每2秒推送一次
        }
        res.end();
    }
    sendStatus();
});

module.exports = router;
