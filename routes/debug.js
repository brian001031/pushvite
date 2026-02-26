const express = require('express');
const router = express.Router();
const db_connect = require('../modules/db_connect');
const mysql_connect = require('../modules/mysql_connect');
const mysql_connect_mes = require('../modules/mysql_connect_mes');
const { getMSPool } = require('../modules/mssql_newconnect');

router.get('/db-status', async (req, res) => {
    try {
        const statuses = {};

        // MySQL - coldelectric_main
        try {
            const mainPool = db_connect.pool;
            statuses.coldelectric_main = {
                totalConnections: mainPool.pool._allConnections.length,
                idleConnections: mainPool.pool._freeConnections.length,
                waitingRequests: mainPool.pool._acquiringConnections.length,
                activeConnections: mainPool.pool._allConnections.length - mainPool.pool._freeConnections.length - mainPool.pool._acquiringConnections.length,
            };
        } catch (e) {
            statuses.coldelectric_main = { error: 'Could not retrieve stats', message: e.message };
        }

        // MySQL - hr_db
        try {
            const hrPool = mysql_connect.pool;
            statuses.hr_db = {
                totalConnections: hrPool.pool._allConnections.length,
                idleConnections: hrPool.pool._freeConnections.length,
                waitingRequests: hrPool.pool._acquiringConnections.length,
                activeConnections: hrPool.pool._allConnections.length - hrPool.pool._freeConnections.length - hrPool.pool._acquiringConnections.length,
            };
        } catch (e) {
            statuses.hr_db = { error: 'Could not retrieve stats', message: e.message };
        }

        // MySQL - mes_db
        try {
            const mesPool = mysql_connect_mes.pool;
            statuses.mes_db = {
                totalConnections: mesPool.pool._allConnections.length,
                idleConnections: mesPool.pool._freeConnections.length,
                waitingRequests: mesPool.pool._acquiringConnections.length,
                activeConnections: mesPool.pool._allConnections.length - mesPool.pool._freeConnections.length - mesPool.pool._acquiringConnections.length,
            };
        } catch (e) {
            statuses.mes_db = { error: 'Could not retrieve stats', message: e.message };
        }
        
        // MSSQL - ASRS_HTBI
        try {
            const mssqlPool = await getMSPool();
            statuses.mssql_asrs_htbi = {
                totalConnections: mssqlPool.size,
                idleConnections: mssqlPool.available,
                waitingRequests: mssqlPool.pending,
                activeConnections: mssqlPool.size - mssqlPool.available,
            };
        } catch (e) {
            statuses.mssql_asrs_htbi = { error: 'Could not connect or retrieve stats', message: e.message };
        }

        res.status(200).json({
            message: 'Database connection pool status',
            timestamp: new Date().toISOString(),
            pools: statuses
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve database pool statuses.",
            error: error.message
        });
    }
});

module.exports = router;
