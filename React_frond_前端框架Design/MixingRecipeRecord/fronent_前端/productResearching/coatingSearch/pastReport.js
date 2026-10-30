import React,{ useState, useEffect , useCallback, useMemo, useRef} from 'react';
import { Button, Table, Form, InputGroup, DropdownButton, Dropdown } from 'react-bootstrap';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment';
import axios from 'axios';
import 'moment/locale/zh-tw'; 
import config from '../../../config';
import { useNavigate, useLocation } from 'react-router-dom';

import MessagePopup from '../../../components/MessagePopup';



const PastReport = () =>{
     const [data , setData] = useState([]);
     const [pageData, setPageData] = useState({});
     const [nowPage, setNowPage] = useState(1);
     const [loading, setLoading] = useState(false);
     
     const isMountedRef = useRef(true);
     const getDefaultValues = () => {
         const now = moment();
         const currentHour = now.hour();
         
         let defaultDate;
         let defaultShift;
         
         // 如果現在是晚班時間 (20:00 到隔天 8:00)
         if (currentHour >= 20 || currentHour < 8) {
             // 晚班時間顯示早班資訊
             defaultShift = '早班';
             
             // 如果過了午夜12點 (0:00-7:59)，顯示昨天早班
             if (currentHour < 12) {
                 defaultDate = moment().subtract(1, 'day').toDate();
             } else {
                 // 未過12點 (20:00-23:59)，顯示當天早班
                 defaultDate = moment().toDate();
             }
         } else {
             // 早班時間 (8:00-19:59) 顯示晚班資訊
             defaultShift = '晚班';
             defaultDate = moment().subtract(1, 'day').toDate(); // 顯示昨天晚班
         }
         
         return { defaultDate, defaultShift };
     };
     
     const { defaultDate, defaultShift } = getDefaultValues();
     
     const [startDate , setStartDate] = useState(defaultDate);
     const [endDate , setEndDate] = useState(null)
     const [dayShift , setDayShift] = useState(defaultShift)
     const [changeFile , setChangeFile] = useState('accordingShift')

    // MessagePopup 狀態管理
    const [messagePopup, setMessagePopup] = useState({
        show: false,
        type: 'info',
        title: '',
        message: ''
    });
    
    // 顯示訊息的函數
    const showMessage = useCallback((type, message, title = '') => {
        setMessagePopup({
        show: true,
        type,
        title,
        message
        });
    }, []);
      // 關閉訊息的函數
      const hideMessage = useCallback(() => {
        setMessagePopup(prev => ({ ...prev, show: false }));
      }, []);

    const handleChangePage = useCallback((newPage) => {
        if (newPage === nowPage || loading) return;
        if (newPage < 1 || (pageData.totalPages && newPage > pageData.totalPages)) return;
        
        setNowPage(newPage);
    }, [nowPage, loading, pageData.totalPages]);

     const fetchData = useCallback(async () => {
        if (loading) return; // 防止重複請求
        const now = moment().local('zh-tw').toDate();

        // 決定查詢用的 startDate/endDate 變數，避免直接賦值給 state
        let queryStartDate = startDate;
        let queryEndDate = endDate;
        if (!queryEndDate) {
            queryEndDate = queryStartDate;
        }

        setLoading(true);
        try {
            const response = await axios.get(
                `${config.apiBaseUrl}/coatingRecord/pastReport`,
                // `http://localhost:3009/coatingRecord/pastReport`,
                {
                    params: {
                        startDate: queryStartDate instanceof Date && !isNaN(queryStartDate.getTime()) ? moment(queryStartDate).format('YYYY-MM-DD 00:00:00') : "",
                        endDate: queryEndDate instanceof Date && !isNaN(queryEndDate.getTime()) ? moment(queryEndDate).format('YYYY-MM-DD 23:59:59') : moment(now).format('YYYY-MM-DD 23:59:59'),
                        dayShift: dayShift || "",
                    }
                }
            );
            console.log("past report response  : ", response);
            if (isMountedRef.current) {
                // 兼容 coaterCathode/coaterAnode 結構
                let downloadData = response.data.data;
                if (downloadData && (downloadData.coaterAnode || downloadData.coaterCathode)) {
                    downloadData = {
                        coatingAnode: { machines: downloadData.coaterAnode ? { coaterAnode: downloadData.coaterAnode } : {} },
                        coatingCathode: { machines: downloadData.coaterCathode ? { coaterCathode: downloadData.coaterCathode } : {} },
                    };

                    downloadData.coatingCathode.forEach((key)=>{
                        key.station = "cathode";
                        key.mixing_batch = "";
                    })
                    downloadData.coatingAnode.forEach((key)=>{
                        key.station = "anode";
                        key.mixing_batch = "";
                    })
                }
                console.log("downloadData : ", downloadData);
                setData(downloadData);
                setPageData(response.data.pagination || {});
            }

        } catch(error) {
            if (isMountedRef.current) {
                console.error("Error fetching data:", error);
                showMessage('error', '資料載入失敗，請稍後再試', '載入錯誤');
            }
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
     },  [changeFile, startDate, endDate, dayShift]);


    // 當切換 日期班別 或者 時間區間 時觸發 API 調用
    useEffect(() => {
        // console.log('changeFile changed:', changeFile);
        fetchData();

        const intervalId = setInterval(() => {
            fetchData();
        }, 60*1000); // 每60秒更新一次

        return () => clearInterval(intervalId);
    },  [changeFile, startDate, endDate, dayShift]);

    // 組件卸載時清理
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // 使用 useMemo 來優化 flattenMachines 的效能
    const machinesData = useMemo(() => {

        console.log("data in useMemo : ", data);
        if (!data || typeof data !== 'object') return [];
        const result = [];
        // 支援 coaterCathode/coaterAnode 直接顯示
        if (data.coaterCathode || data.coaterAnode) {
            if (data.coaterCathode) result.push({ type: '正極塗佈', ...data.coaterCathode });
            if (data.coaterAnode) result.push({ type: '負極塗佈', ...data.coaterAnode });
            return result;
        }
        // 支援 cathode/anode 直接顯示
        if (data.cathode || data.anode) {
            if (data.cathode) result.push({ type: '正極塗佈', ...data.cathode });
            if (data.anode) result.push({ type: '負極塗佈', ...data.anode });
            return result;
        }
        const sections = [
            { key: 'cathode', label: '正極塗佈' },
            { key: 'anode', label: '負極塗佈' },
        ];

        sections.forEach(section => {
            const machines = data[section.key]?.machines || {};
            console.log(`machines in ${section.key} : `, machines);
            Object.values(machines).forEach(machine => {
                result.push({
                    type: section.label,
                    ...machine
                });
            });
        });
        return result;
    }, [data]);
    

    return (
        <div style={{ backgroundColor: '#17285eff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
            <div style = {{ fontSize: '24px', fontWeight: 'bold', marginBottom: '5px' , display: 'flex', flexDirection: 'row',  alignItems: 'center' }}>
                <div style={{whiteSpace: 'nowrap' , marginRight: '10px' , color: "White"}}>過去戰報</div>
                <Form.Select
                    style={{ width: '200px' }}
                    aria-label="Default select example"
                    value={changeFile}
                    onChange={(e) => setChangeFile(e.target.value)}
                >
                    <option value="accordingShift">依日期班別</option>
                    <option value="accordingTimeRange">依時間區間</option>
                </Form.Select>
            </div>
            {   
                // 依日期班別
                changeFile === "accordingShift" && (
                    <div>
                        <div 
                        style={{ 
                            display: 'flex',
                            padding: '0',
                            margin: '5px 20px 5px 0',
                        }}
                        // 你可以移除上面的 style，直接使用 d-flex 類別
                        className="d-flex align-items-center"
                    >
                        {/* 第一個群組：選定日期 */}
                        <div className="d-flex align-items-center me-3"> 
                            <div className="fw-bold me-3 text-nowrap" style={{ color: "White"}}>選定日期</div>
                            <DatePicker
                                style={{ height: 'full'}}
                                selected={startDate}
                                onChange={(date) => setStartDate(date)}
                            />
                        </div>

                        {/* 第二個群組：班別 */}
                        <div className="d-flex align-items-center">
                            <div className="fw-bold me-3 text-nowrap" style={{ color: "White"}}>班別</div>
                            <Form.Select
                                aria-label="選定班別"
                                value={dayShift}
                                onChange={(e) => setDayShift(e.target.value)}
                            >
                                <option value="">請選擇班別</option>
                                <option value="早班">早班</option>
                                <option value="晚班">晚班</option>
                            </Form.Select>
                        </div>
                         {/* 查詢按鈕 */}
                        <Button
                        style={{ marginLeft: '10px' }}
                        onClick={() => {
                            fetchData();
                        }}
                        >
                            查詢
                        </Button>
                    </div>
                        <Table striped bordered hover></Table>
                        <Table striped bordered hover>
                            <thead>
                                <tr>
                                    <th>站別</th>
                                    <th>混漿批數</th>
                                    <th>塗佈生產米數</th>
                                    <th>廢棄物米數(空箔)</th>
                                    <th>廢棄物米數(廢料)</th>
                                    <th>廢棄物米數(測試料)</th>
                                    <th>漿料利用率(%)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {machinesData.length === 0 ? (
                                    <tr>
                                        <td colSpan={8}>{loading ? '載入中...' : '無資料'}</td>
                                    </tr>
                                ) : (
                                    machinesData.map((item, idx) => (
                                        <tr key = {`${item.type}-${idx}`}>
                                            {/* 站別 */}
                                            <td>{item.type || '-'}</td>
                                            {/* 混漿批數 */}
                                            <td>-</td>
                                            {/* 塗佈生產米數 */}
                                            <td>{item.Count !== undefined && !isNaN(Number(item.Count)) ? Number(item.Count).toFixed(2) : '-'}</td>
                                            {/* 廢棄物米數(空箔) */}
                                            <td>{item.faultyMeter_EmptySolder !== undefined && !isNaN(Number(item.faultyMeter_EmptySolder)) ? Number(item.faultyMeter_EmptySolder).toFixed(2) : '-'}</td>
                                            {/* 廢棄物米數(廢料) */}
                                            <td>{item.faultyMeter_Faulty !== undefined && !isNaN(Number(item.faultyMeter_Faulty)) ? Number(item.faultyMeter_Faulty).toFixed(2) : '-'}</td>
                                            {/* 廢棄物米數(測試料) */}
                                            <td>{item.faultyMeter_test !== undefined && !isNaN(Number(item.faultyMeter_test)) ? Number(item.faultyMeter_test).toFixed(2) : '-'}</td>
                                            {/* 漿料利用率 */}
                                            <td>{item.shiftPercent !== undefined && !isNaN(Number(item.shiftPercent)) ? Number(item.shiftPercent).toFixed(2) + '%' : '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </Table>
                        
                        {/* 分頁控制 */}
                        {/* {pageData.totalPages >= 1 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
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
                        )} */}
                    </div>
                )
            }
            {
                // 依時間區間
                changeFile === "accordingTimeRange" && (
                    <div>
                        <div 
                        style={{ 
                            display: 'flex',
                            padding: '0',
                            margin: '5px 20px 5px 0',
                        }}
                        // 你可以移除上面的 style，直接使用 d-flex 類別
                        className="d-flex align-items-center"
                    >
                        {/* 第一個群組：選定日期 */}
                        <div className="d-flex align-items-center me-3"> 
                            <div className="fw-bold me-3 text-nowrap" style={{ color: "White"}}>起始時間</div>
                            <DatePicker
                                style={{ height: 'full'}}
                                selected={startDate}
                                onChange={(date) => setStartDate(date)}
                            />
                        </div>
                        <div className="d-flex align-items-center me-3"> 
                            <div className="fw-bold me-3 text-nowrap" style={{ color: "White"}}>結束時間</div>
                            <DatePicker
                                style={{ height: 'full'}}
                                selected={endDate}
                                onChange={(date) => {
                                    // 先檢查限制
                                    if (startDate && moment(date).isBefore(moment(startDate.setHours(0,0,0,0)))) {
                                        showMessage('error', '結束時間需大於起始時間！End time must be greater than start time!', '時間錯誤 Time Error');
                                        return;
                                    }
                                    setEndDate(date);
                                }}
                            />
                        </div>


                        {/* 第二個群組：班別 */}
                        <div className="d-flex align-items-center">
                            <div className="fw-bold me-3 text-nowrap" style={{ color: "White"}}>班別</div>
                            <Form.Select
                                aria-label="選定班別"
                                value={dayShift}
                                onChange={(e) => setDayShift(e.target.value)}
                            >
                                <option value="">請選擇班別</option>
                                <option value="早班">早班</option>
                                <option value="晚班">晚班</option>
                            </Form.Select>
                        </div>
                         {/* 查詢按鈕 */}
                        <Button
                        style={{ marginLeft: '10px' }}
                        onClick={() => {
                            setNowPage(1);
                            fetchData(1);
                        }}
                        
                        >
                            查詢
                        </Button>
                    </div>
                        <Table striped bordered hover></Table>
                        <Table striped bordered hover>
                            <thead>
                                <tr>
                                    <th>站別</th>
                                    <th>混漿批數</th>
                                    <th>塗佈生產米數</th>
                                    <th>廢棄物米數(空箔)</th>
                                    <th>廢棄物米數(廢料)</th>
                                    <th>廢棄物米數(測試料)</th>
                                    <th>漿料利用率(%)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {machinesData.length === 0 ? (
                                    <tr>
                                        <td colSpan={8}>{loading ? '載入中...' : '無資料'}</td>
                                    </tr>
                                ) : (
                                    machinesData.map((item, idx) => (
                                        <tr key = {`${item.type}-${idx}`}>
                                            {/* 站別 */}
                                            <td>{item.type || '-'}</td>
                                            {/* 混漿批數 */}
                                            <td>-</td>
                                            {/* 塗佈生產米數 */}
                                            <td>{item.Count !== undefined && !isNaN(Number(item.Count)) ? Number(item.Count).toFixed(2) : '-'}</td>
                                            {/* 廢棄物米數(空箔) */}
                                            <td>{item.faultyMeter_EmptySolder !== undefined && !isNaN(Number(item.faultyMeter_EmptySolder)) ? Number(item.faultyMeter_EmptySolder).toFixed(2) : '-'}</td>
                                            {/* 廢棄物米數(廢料) */}
                                            <td>{item.faultyMeter_Faulty !== undefined && !isNaN(Number(item.faultyMeter_Faulty)) ? Number(item.faultyMeter_Faulty).toFixed(2) : '-'}</td>
                                            {/* 廢棄物米數(測試料) */}
                                            <td>{item.faultyMeter_test !== undefined && !isNaN(Number(item.faultyMeter_test)) ? Number(item.faultyMeter_test).toFixed(2) : '-'}</td>
                                            {/* 漿料利用率 */}
                                            <td>{item.shiftPercent !== undefined && !isNaN(Number(item.shiftPercent)) ? Number(item.shiftPercent).toFixed(2) + '%' : '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </Table>
                        
                        {/* 分頁控制 */}
                        {pageData.totalPages >= 1 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
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
                        )}
                    </div>
                )
            }
            {/* MessagePopup 組件 */}
            <MessagePopup
                show={messagePopup.show}
                type={messagePopup.type}
                title={messagePopup.title}
                message={messagePopup.message}
                onHide={hideMessage}
                autoClose={messagePopup.type === 'success'}
                autoCloseDelay={3000}
            />
        </div>
    )

}

export default PastReport;