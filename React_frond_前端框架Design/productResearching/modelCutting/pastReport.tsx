import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Table, Form, InputGroup, DropdownButton, Dropdown } from 'react-bootstrap';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment';
import axios from 'axios';
import 'moment/locale/zh-tw';
import config from '../../../config';
import { useNavigate, useLocation } from 'react-router-dom';
import tz from 'moment-timezone';
import MessagePopup from '../../../components/MessagePopup';



type PastReportItem = Record<string, any>;

const PastReportPage = () => {
    const [data, setData] = useState<PastReportItem[]>([]);
    const [pageData, setPageData] = useState({} as any);
    const [nowPage, setNowPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

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
    const [startDate, setStartDate] = useState(defaultDate);
    const [endDate, setEndDate] = useState(moment().tz('Asia/Taipei').toDate());
    const [dayShift, setDayShift] = useState(defaultShift)
    const [changeFile, setChangeFile] = useState('accordingTimeRange')

    // MessagePopup 狀態管理
    const [messagePopup, setMessagePopup] = useState({
        show: false,
        type: 'info',
        title: '',
        message: ''
    });

    // 顯示訊息的函數
    const showMessage = useCallback((type: 'info' | 'error' | 'success', message: string, title: string = '') => {
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

    const dataColumns: Record<string, string> = {
        'selectWork': '設備類型',
        'deviceNo': '設備編號',
        'goodPieces': '完成片數',
        'ngPieces': '不良片數',
        'yield': '良率',
        'empData': '作業人員'
    };



    const fetchData = useCallback(async () => {
        if (loading) return; // 防止重複請求
        const now = moment().tz('Asia/Taipei').toDate();

        // 決定查詢用的 startDate/endDate 變數，避免直接賦值給 state
        let queryStartDate = startDate;
        let queryEndDate = endDate;
        if (!queryEndDate) { queryEndDate = queryStartDate }

        if (!queryStartDate && !queryEndDate && !dayShift) {
            showMessage('error', '請輸入至少一個查詢條件！Please enter at least one query condition!', '查詢條件錯誤 Query Condition Error');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.get(
                `${config.apiBaseUrl}/modelCutting/pastReport`,
                {
                    params: {
                        startDate: queryStartDate instanceof Date && !isNaN(queryStartDate.getTime()) ? moment(queryStartDate).format('YYYY-MM-DD HH:mm:ss') : "",
                        endDate: queryEndDate instanceof Date && !isNaN(queryEndDate.getTime()) ? moment(queryEndDate).format('YYYY-MM-DD HH:mm:ss') : moment(now).format('YYYY-MM-DD 23:59:59'),
                        dayShift: dayShift || "",
                        select: changeFile ?? '',
                    }
                }
            );


            console.log('Fetched past report data:', response.data.data.reportData);
            setData(response.data.data.reportData || {});
            setPageData(response.data.data.pagination ?? {});

        } catch (error) {
            if (isMountedRef.current) {
                console.error("Error fetching data:", error);
                showMessage('error', '資料載入失敗，請稍後再試', '載入錯誤');
            }
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, [changeFile, startDate, endDate, dayShift]);


    // 當切換 日期班別 或者 時間區間 時觸發 API 調用
    useEffect(() => {
        // console.log('changeFile changed:', changeFile);
        fetchData();

        const intervalId = setInterval(() => {
            fetchData();
        }, 60 * 1000); // 每60秒更新一次

        return () => clearInterval(intervalId);
    }, [changeFile, startDate, endDate, dayShift]);

    // 組件卸載時清理
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);


    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const sizeCheck = () => {
        if (windowWidth < 1000) {
            return {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '0',
                margin: '5px 20px 5px 0',
            };
        }
        return {};
    };

    const sizeInnerChange = () => {
        if (windowWidth < 1000) {
            return {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'flex-start',
                gap: '10px',
                padding: '0',
                margin: '5px 20px 5px 0',
            }
        }
        return {};
    };

    const getAlignStyle = () => {
        if (windowWidth < 1000) {
            return { justifyContent: 'flex-start', alignItems: 'flex-start' };
        }
        return { justifyContent: 'center', alignItems: 'center' };
    };

    return (
        <div style={{ backgroundColor: '#17285eff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '5px', display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                <div style={{ whiteSpace: 'nowrap', marginRight: '10px', color: "White" }}>過去戰報</div>
                <Form.Select
                    style={{ width: '200px' }}
                    aria-label="Default select example"
                    value={changeFile}
                    onChange={(e) => setChangeFile(e.target.value)}
                >
                    <option value="accordingTimeRange">依日期區間</option>
                    <option value="accordingShift">依班別</option>
                </Form.Select>
            </div>
            {
                // 依時間區間
                changeFile === "accordingTimeRange" && (
                    <div style={getAlignStyle() as React.CSSProperties}>
                        <div

                            style={sizeCheck() as React.CSSProperties}
                            // 你可以移除上面的 style，直接使用 d-flex 類別
                            className="d-flex align-items-center"
                        >
                            {/* 第一個群組：選定日期 */}
                            <div className="d-flex align-items-center me-3" style={getAlignStyle() as React.CSSProperties}>
                                <div className="fw-bold me-3 text-nowrap" style={{ color: "White" }}>起始時間</div>
                                <DatePicker
                                    style={{ height: 'full' }}
                                    selected={startDate}
                                    onChange={(date: Date) => setStartDate(date)}
                                />
                            </div>
                            <div className="d-flex align-items-center me-3" style={getAlignStyle() as React.CSSProperties}>
                                <div className="fw-bold me-3 text-nowrap" style={{ color: "White" }}>結束時間</div>
                                <DatePicker
                                    style={{ height: 'full' }}
                                    selected={endDate}
                                    onChange={(date: Date) => {
                                        // 先檢查限制
                                        if (startDate && moment(date).isBefore(moment(startDate.setHours(0, 0, 0, 0)))) {
                                            showMessage('error', '結束時間需大於起始時間！End time must be greater than start time!', '時間錯誤 Time Error');
                                            return;
                                        }
                                        setEndDate(date);
                                    }}
                                />
                            </div>


                            {/* 第二個群組：班別 */}
                            <div className="d-flex align-items-center" style={sizeInnerChange() as React.CSSProperties}>
                                {/* <div className="fw-bold me-3 text-nowrap" style={{ color: "White" }}>班別</div>
                                <Form.Select
                                    aria-label="選定班別"
                                    value={dayShift}
                                    onChange={(e) => setDayShift(e.target.value)}
                                >
                                    <option value="">請選擇班別</option>
                                    <option value="早班">早班</option>
                                    <option value="晚班">晚班</option>
                                </Form.Select> */}

                                <Button
                                    style={{ marginLeft: '10px', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                        setNowPage(1);
                                        fetchData();
                                    }}
                                >
                                    查詢
                                </Button>
                            </div>
                            {/* 查詢按鈕 */}

                        </div>
                        <Table striped bordered hover></Table>
                        <Table striped bordered hover>
                            <thead>
                                <tr>
                                    {Object.keys(dataColumns).map((key) => (
                                        <th key={key}>{dataColumns[key]}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {
                                    data && data.map((item, index) => (
                                        <tr key={index}>
                                            {Object.keys(dataColumns).map((key) => (
                                                key === 'yield' ?
                                                    (
                                                        <td key={key}>{item[key] ?? '暫無資料'}%</td>
                                                    ) :
                                                    (
                                                        <td key={key}>{item[key] ?? '暫無資料'}</td>
                                                    )

                                            ))}
                                        </tr>
                                    ))
                                }
                            </tbody>
                        </Table>
                    </div>
                )
            }
            {
                // 依時間區間
                changeFile === "accordingShift" && (
                    <div style={getAlignStyle() as React.CSSProperties}>
                        <div
                            style={sizeCheck() as React.CSSProperties}

                            className="d-flex align-items-center"
                        >
                            {/* 第一個群組：選定日期 */}
                            <div className="d-flex align-items-center me-3" style={getAlignStyle() as React.CSSProperties}>
                                <div className="fw-bold me-3 text-nowrap" style={{ color: "White" }}>起始時間</div>
                                <DatePicker
                                    style={{ height: 'full' }}
                                    selected={startDate}
                                    onChange={(date: Date) => setStartDate(date)}
                                />
                            </div>
                            {/* 第二個群組：班別 */}
                            <div className="d-flex align-items-center" style={sizeInnerChange() as React.CSSProperties}>
                                <div className="fw-bold me-3 text-nowrap" style={{ color: "White" }}>班別</div>
                                <Form.Select
                                    aria-label="選定班別"
                                    value={dayShift}
                                    onChange={(e) => setDayShift(e.target.value)}
                                >
                                    <option value="">請選擇班別</option>
                                    <option value="早班">早班</option>
                                    <option value="晚班">晚班</option>
                                </Form.Select>

                                <Button
                                    style={{ marginLeft: '10px', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                        setNowPage(1);
                                        fetchData();
                                    }}

                                >
                                    查詢
                                </Button>
                            </div>
                            {/* 查詢按鈕 */}

                        </div>
                        <Table striped bordered hover></Table>
                        <Table striped bordered hover>
                            <thead>
                                <tr>
                                    {Object.keys(dataColumns).map((key) => (
                                        <th key={key}>{dataColumns[key]}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {
                                    data && data.map((item, index) => (
                                        <tr key={index}>
                                            {Object.keys(dataColumns).map((key) => (
                                                key === 'yield' ?
                                                    (
                                                        <td key={key}>{item[key] ?? '暫無資料'}%</td>
                                                    ) :
                                                    (
                                                        <td key={key}>{item[key] ?? '暫無資料'}</td>
                                                    )

                                            ))}
                                        </tr>
                                    ))
                                }
                            </tbody>
                        </Table>
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
export default PastReportPage;