import React, { useState, useEffect, useRef } from 'react';
import { Table } from 'react-bootstrap';
import { io } from 'socket.io-client';
import axios from 'axios';
import { getApiBaseUrl } from '../../../apiChangeConnet.js';


interface ReportItem {
    selectWork?: string;
    machineNo?: string;
    machineProducingTime?: string;
    dreamPeace?: string | number;
    realPeace?: string | number;
    goodPeace?: string | number;
    ngPieces?: string | number;
    brokePieces?: string | number;
    averageSpeed?: string | number;
    workerEmpNo01?: string;
    workerEmpNo02?: string;
    [key: string]: any; // 容許其他動態欄位
}

const TimeReport = () => {
    // 保持你原本的資料結構定義
    const [data, setData] = React.useState<ReportItem[]>([]);
    const [loading, setLoading] = React.useState(false);
    let apiBaseUrl = getApiBaseUrl();

    const roomKey = 'timelyReport:modelCutting';

    // 🛠️ 修正陷阱 1：使用 useRef 確保全網頁永遠只有唯一一條 Socket 連線實例
    const socketRef = useRef<any>(null);

    const transferName: { [key: string]: string } = {
        'selectWork': '設備類型',
        'deviceNo': '設備編號',
        'incoming_lotNumber': '來料批號',
        'goodPieces': '完成片數',
        'ngPieces': '不良片數',
        'brokePieces': '報廢片數',
        'announceCapacity': '公告產能',
        'yield': '良率'
    };

    const fetchData = async (): Promise<void> => {
        setLoading(true);

        try {

            const repsonse = await axios.get(`${apiBaseUrl}/modelCutting/getTimelyReport`);
            console.log('Fetched timely report data:', repsonse.data);
            setData(repsonse.data.data.reportData);
        } catch (error) {
            console.error('Error fetching timely report data:', error);

        }
    }

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => { fetchData() }, 10000); // 每10秒更新一次數據
        return () => clearInterval(interval); // 清除定時器
    }, []);


    return (
        <div style={{ backgroundColor: '#ad1e61ff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', overflowX: 'scroll' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '5px', color: 'white' }}>
                即時戰報 {loading && <span style={{ fontSize: '16px' }}>載入中...</span>}
            </div>
            <Table striped bordered hover variant="light">
                <thead>
                    <tr style={{ overflowX: 'scroll', whiteSpace: 'nowrap' }}>
                        {Object.keys(transferName).map((colKey) => (
                            <th key={colKey}>{transferName[colKey]}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data && data.map((item, index) => (
                        <tr key={index}>
                            {Object.keys(transferName).map((colKey) => (
                                colKey === 'yield' ?
                                    (
                                        <td key={colKey}>{item[colKey]} %</td>
                                    ) :
                                    (
                                        <td key={colKey}>{item[colKey]}</td>
                                    )
                            ))}
                        </tr>
                    ))}
                </tbody>
            </Table>
        </div>
    );
};

export default TimeReport;