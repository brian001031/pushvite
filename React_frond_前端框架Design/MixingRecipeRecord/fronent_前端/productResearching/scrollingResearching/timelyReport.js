import React,{ useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Table, Form, InputGroup, DropdownButton, Dropdown } from 'react-bootstrap';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment';
import axios from 'axios';
import 'moment/locale/zh-tw'; 
import config from '../../../config';
import { useNavigate, useLocation } from 'react-router-dom';



const TimelyReport = () =>{
    const [data, setData] = useState([]);
    const [pageData, setPageData] = useState([]);
    const [nowPage, setNowPage] = useState(1);
    const [loading, setLoading] = useState(false);
    
    // 使用 useRef 來追踪組件是否已卸載
    const isMountedRef = useRef(true);
    
    // 使用 useCallback 來避免不必要的重新創建
    const fetchData = useCallback(async (page = nowPage) => {
        if (loading) return; // 防止重複請求
        
        setLoading(true);
        try{
            const response = await axios.get(
                `${config.apiBaseUrl}/rollingRecord/nowReport`,
                // `http://localhost:3009/rollingRecord/nowReport`,
                {
                    params: {
                        page: page,
                        pageSize: 20
                    }
                }
            );
            
            // 只有當組件還存在時才更新狀態
            if (isMountedRef.current) {
                console.log("Response data:", response.data.data);
                console.log("Response pagination:", response.data.pagination);
                
                setData(response.data.data);
                setPageData(response.data.pagination);
            }
        }catch(error){
            if (isMountedRef.current) {
                console.error("Error fetching data:", error);
            }
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, [nowPage, loading]);

    const handleChangePage = useCallback((newPage) => {
        if (newPage === nowPage || loading) return;
        if (newPage < 1 || (pageData.totalPages && newPage > pageData.totalPages)) return;
        
        setNowPage(newPage);
        fetchData(newPage);
    }, [nowPage, loading, pageData.totalPages, fetchData]);

    useEffect(() => {
        fetchData();
        
        const interval = setInterval(() => {
            fetchData();
        }, 60000); // 1分鐘更新
        
        return () => {
            clearInterval(interval);
            isMountedRef.current = false; // 標記組件已卸載
        };
    }, []); // 移除 nowPage 依賴，避免頁面變更時重複調用

    // 使用 useMemo 來優化 flattenMachines 的效能
    const machinesData = useMemo(() => {
        if (!data || typeof data !== 'object') return [];
        const result = [];
        const sections = [
            { key: 'RollingCathode', label: '正極輾壓' },
            { key: 'RollingAnode', label: '負極輾壓' },
            { key: 'SlittingCathode', label: '正極分切' },
            { key: 'SlittingAnode', label: '負極分切' }
        ];
        sections.forEach(section => {
            const machines = data[section.key]?.machines || {};
            Object.values(machines).forEach(machine => {
                result.push({
                    type: section.label,
                    ...machine
                });
            });
        });
        return result;
    }, [data]); // 只有當 data 改變時才重新計算

    return (
        <div style={{ backgroundColor: '#ad1e61ff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' ,overflowX: 'scroll' }}>
            <div style = {{ fontSize: '24px', fontWeight: 'bold', marginBottom: '5px' , color: 'white' }}>
                即時戰報 {loading && <span style={{ fontSize: '16px' }}>載入中...</span>}
            </div>
            <Table striped bordered hover>
                <thead>
                    <tr>
                        <th>設備類型</th>
                        <th>設備編號</th>
                        <th>完成米數(m)</th>
                        <th>完成時間</th>
                        <th>平均速度 (m/min)</th>
                        <th>目前批號</th>
                        <th>平均厚度(um)</th>
                        <th>損料長度(m)</th>
                        <th>輾壓密度(g/cm³)</th>
                    </tr>
                </thead>
                <tbody>
                    {machinesData.length === 0 ? (
                        <tr>
                            <td colSpan={9}>{loading ? '載入中...' : '無資料'}</td>
                        </tr>
                    ) : (
                        machinesData.map((item, idx) => (
                            <tr key={`${item.machineNo}-${item.type}-${idx}`}>
                                <td>{item.type}</td>
                                <td>{item.machineNo || item.lotNumber || '-'}</td>
                                <td>
                                    {item.rollingLength !== undefined && !isNaN(Number(item.rollingLength))
                                        ? Number(item.rollingLength).toFixed(2)
                                        : '-'}
                                </td>
                                <td>{item.lastSubmitTime ? moment(item.lastSubmitTime).format('YYYY-MM-DD HH:mm:ss') : '-'}</td>
                                <td>
                                    {item.averageRate !== undefined && !isNaN(Number(item.averageRate))
                                        ? Number(item.averageRate)
                                        : '-'}
                                </td>
                                <td>{item.nowLotNo || item.lotNumber || '-'}</td>
                                <td>
                                    {item.averageThickness !== undefined && !isNaN(Number(item.averageThickness))
                                        ? Number(item.averageThickness)
                                        : '-'}
                                </td>
                                <td>
                                    {item.LostLength !== undefined && !isNaN(Number(item.LostLength))
                                        ? Number(item.LostLength).toFixed(2)
                                        : '-'}
                                </td>
                                <td>
                                    {item.rollingDensity !== undefined && !isNaN(Number(item.rollingDensity))
                                        ? Number(item.rollingDensity)
                                        : '-'}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </Table>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button 
                    variant="primary" 
                    onClick={() => handleChangePage(nowPage - 1)} 
                    disabled={pageData.hasPrevPage === false || loading}
                >
                    上一頁
                </Button>
                <div style={{ color: 'white' , fontFamily: '微軟正黑體' , fontWeight: 'bold' }}>
                    目前頁數: {nowPage} / {pageData.totalPages} 總筆數: {pageData.totalItems}
                </div>
                <Button 
                    variant="primary" 
                    onClick={() => handleChangePage(nowPage + 1)} 
                    disabled={pageData.hasNextPage === false || loading}
                >
                    下一頁
                </Button>
            </div>
        </div>
    );

}

export default TimelyReport;