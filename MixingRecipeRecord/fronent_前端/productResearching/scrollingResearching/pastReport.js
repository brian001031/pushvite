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
     const [endDate , setEndDate] = useState(moment(defaultDate).add(1, 'day').toDate());
     const [dayShift , setDayShift] = useState(defaultShift)
     const [changeFile , setChangeFile] = useState('accordingTimeRange')

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

    const DateChangeLimit = (date) => {
        setEndDate(date);

        if ( startDate && moment(date).isBefore(moment(startDate), 'day')    
        ) {
            showMessage('error', '結束時間需大於或等於起始時間！End time must be greater than or equal to start time!', '時間錯誤 Time Error');
            return;
        }
    }

    const fetchData = useCallback(async (page = nowPage) => {
        if (loading) return; // 防止重複請求

        let user = JSON.parse(localStorage.getItem('user'));
        
        setLoading(true);
        try {
            console.log("fetchData 執行時的狀態:", {
                startDate: startDate,
                endDate: endDate,
                dayShift: dayShift,
                page: page
            });

            const response = await axios.get(
                `${config.apiBaseUrl}/rollingRecord/nowReport`,
                // `http://localhost:3009/rollingRecord/nowReport`,
                {
                    params: {
                        engineerId: user? user.memberID : '',
                        startTime: startDate ? moment(startDate).format('YYYY-MM-DD 00:00:00') : "",
                        endTime: endDate ? moment(endDate).format('YYYY-MM-DD 23:59:59') : "",
                        dayShift: dayShift || "",
                        page: page,
                        pageSize: 20
                    }
                }
            );
            
            // 只有當組件還存在時才更新狀態
            if (isMountedRef.current) {
                console.log("發送的參數:", {
                    startTime: startDate ? moment(startDate).format('YYYY-MM-DD 00:00:00') : "",
                    endTime: endDate ? moment(endDate).format('YYYY-MM-DD 23:59:59') : "",
                    shift: dayShift || "",
                    page: page,
                    pageSize: 20
                });
                
                console.log("Response data from 依日期班別:", response.data.data);
                console.log("Response pagination:", response.data.pagination);
                
                setData(response.data.data);
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
     }, [startDate, endDate, dayShift, nowPage, loading, showMessage]);

    useEffect(()=>{
        DateChangeLimit(endDate)
        
    },[endDate])

    // 當頁面變更時觸發 API 調用
    useEffect(() => {
        if (nowPage > 1) {
            fetchData(nowPage);
        }
    }, [nowPage, fetchData]);

    // 組件卸載時清理
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // 使用 useMemo 來優化 flattenMachines 的效能
    const machinesData = useMemo(() => {
        if (!data || typeof data !== 'object') return [];
        const result = []
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
                    <option value="accordingTimeRange">依時間區間</option>
                </Form.Select>
            </div>
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
                                onChange={(date) => DateChangeLimit(date)}
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
                                    <th>設備編號</th>
                                    <th>完成米數</th>
                                    <th>損料m</th>
                                    <th>良率%</th>
                                    <th>人員</th>
                                </tr>
                            </thead>
                            <tbody>
                                {machinesData.length === 0 ? (
                                    <tr>
                                        <td colSpan={5}>{loading ? '載入中...' : '無資料'}</td>
                                    </tr>
                                ) : (
                                    machinesData.map((item, idx) => (
                                        <tr key={`${item.machineNo}-${item.type}-${idx}`}>
                                            <td>{item.machineNo || item.lotNumber || '-'}</td>
                                            <td>
                                                {item.rollingLength !== undefined && !isNaN(Number(item.rollingLength))
                                                    ? Number(item.rollingLength).toFixed(2)
                                                    : '-'}
                                                (m)
                                            </td>
                                            <td>
                                                {item.LostLength !== undefined && !isNaN(Number(item.LostLength))
                                                    ? Number(item.LostLength).toFixed(2)
                                                    : '-'}
                                                (m)
                                            </td>
                                            <td>{item.yield !== undefined && !isNaN(Number(item.yield)) ? Number(item.yield).toFixed(2) : '-'} %</td>
                                            <td>{item.memberName !== undefined ? item.memberName : '-'}</td>

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