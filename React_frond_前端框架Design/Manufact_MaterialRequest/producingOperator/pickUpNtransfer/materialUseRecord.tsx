import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Button, Form, Table, Pagination } from "react-bootstrap";
import MessagePopup from '../../../../components/MessagePopup';
import axios from 'axios';
import config from '../../../../config';
import moment from 'moment-timezone';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { io } from 'socket.io-client';
import { FormattedDate } from "react-intl";
import tz from "moment-timezone";

interface MaterialUseRecordProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
}
// 用於記錄用盡的 DataInner
type DataInner = exhaustData[]

interface exhaustData {
    id: number;
    uuid: string;
    originUUID: string;
    form_id: string;
    allocate_barcode_text: string;
    product_name: string;
    specification: string;
    product_itemcode: string;
    status: string;
    row_measure_val: number;
    row_unit: string;
    balance: number;
    warehousetype: string;
    stack_position: string;
    pickUp_emp: string;
    pickUp_Name: string;
    pickUp_Department: string;
    pickUp_Time: Date | string;
    vender_name: string;
    assign_datetime: Date | string;
    iscostover: string | number;
    iscostover_Time: Date | string;
}

const formatDate = (dateVal?: any, formatTime: boolean = false) => {
    if (!dateVal) return '-';
    // 資料庫寫入時即為台灣時間(例如 16:03:49)，Node/Prisma 轉成 JSON 時會補上 Z。
    // 若再做 .tz("Asia/Taipei") 會重複 +8 小時變成 00:03:49。使用 moment.utc 即可呈現 DB 實際時間。
    const m = typeof dateVal === 'string' && dateVal.includes('Z')
        ? moment.utc(dateVal)
        : moment(dateVal);
    if (!m.isValid()) return String(dateVal);
    return m.format(formatTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD');
};


const MaterialUseRecord: React.FC<MaterialUseRecordProps> = ({ show, onHide, centered }) => {

    const [messagePopup, setMessagePopup] = useState<{
        show: boolean;
        type: string;
        title: string;
        message: string;
        autoClose?: boolean;
        autoCloseDelay?: number;
    }>({
        show: false,
        type: 'info',
        title: '',
        message: '',
        autoClose: false,
        autoCloseDelay: 3000
    });
    const [data, setData] = useState<DataInner>([]);
    const [searchProductName, setSearchProductName] = useState<string>('');
    const [startDate, setStartDate] = useState<Date | null>(() =>
        moment().tz("Asia/Taipei").subtract(1, 'months').startOf('month').toDate()
    );
    const [endDate, setEndDate] = useState<Date | null>(() =>
        moment().tz("Asia/Taipei").endOf('day').toDate()
    );
    const [loading, setLoading] = useState<boolean>(false);

    // 頁碼相關狀態 (參考 allocatedMaterialCollection.tsx 結構)
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [total, setTotal] = useState<number>(0);
    const [pageInput, setPageInput] = useState<string>('1');
    const [searchDepartment, setSearchDepartment] = useState<string>('');
    const [searchDepartmentArray, setSearchDepartmentArray] = useState<string[]>([])

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pageRef = useRef<number>(1);
    pageRef.current = page;

    const apiBaseUrl = config.apiBaseUrl;
    const roomKey = 'Ingredients_management_room';
    const socketRef = useRef<ReturnType<typeof io> | null>(null);
    const joinedRoomRef = useRef<boolean>(false);
    const dataRef = useRef<DataInner>([]);
    dataRef.current = data;

    useEffect(() => {
        setPageInput(page.toString());
    }, [page]);

    const joinRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;
        if (!joinedRoomRef.current) {
            socket.emit('joinRoom', roomKey);
            joinedRoomRef.current = true;
            console.log('MaterialUseRecord 加入房間:', roomKey);
        }
    }, [roomKey]);

    const leaveRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;
        if (joinedRoomRef.current) {
            socket.emit('leaveRoom', roomKey);
            joinedRoomRef.current = false;
            console.log('MaterialUseRecord 離開房間:', roomKey);
        }
    }, [roomKey]);

    const emitWithAck = useCallback((eventName: string, payload: any): Promise<any> => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
            return axios.get(`${apiBaseUrl}/ingredients/exhaustData`, { params: payload }).then(res => res.data);
        }
        payload.department = payload.department;

        return new Promise((resolve) => {
            const timeoutId = setTimeout(async () => {
                console.warn('Socket emitWithAck 逾時，自動備援切換至 HTTP GET 抓取資料');
                try {
                    const res = await axios.get(`${apiBaseUrl}/ingredients/exhaustData`, { params: payload });
                    resolve(res.data);
                } catch (err) {
                    resolve(null);
                }
            }, 4000);

            socket.emit(eventName, payload, (arg1: any, arg2: any) => {
                clearTimeout(timeoutId);
                if (arg1 && !arg2 && typeof arg1 === 'object' && (arg1.status || arg1.success || arg1.data)) {
                    resolve(arg1);
                } else {
                    resolve(arg2 || arg1);
                }
            });
        });
    }, [apiBaseUrl]);

    // 抓取已用盡料品紀錄資料 (參考 allocatedMaterialCollection.tsx 抓取邏輯)
    const handleFetch = useCallback(async () => {
        setLoading(true);
        try {
            const currentPage = pageRef.current || page;
            const params: any = {
                page: currentPage,
                pageSize: pageSize
            };
            if (searchProductName.trim()) {
                params.productName = searchProductName.trim();
            }
            if (searchDepartment.trim()) {
                params.department = searchDepartment.trim();
            }
            if (startDate) {
                params.startDate = moment(startDate).tz("Asia/Taipei").format('YYYY-MM-DD');
            }
            if (endDate) {
                params.endDate = moment(endDate).tz("Asia/Taipei").format('YYYY-MM-DD');
            }
            if (searchDepartment) {
                params.department = searchDepartment ?? 'all';
            }

            const socket = socketRef.current;
            let responseData: any = null;

            if (socket && socket.connected) {
                responseData = await emitWithAck('Ingredients:getExhaustData', params);
            }
            // else {
            //     const response = await axios.get(`${apiBaseUrl}/ingredients/exhaustData`, { params });
            //     responseData = response.data;
            // }

            if (responseData && (responseData.success || String(responseData.status) === '200')) {
                const items: exhaustData[] = Array.isArray(responseData.data)
                    ? responseData.data
                    : (responseData.data && Array.isArray(responseData.data.data) ? responseData.data.data : []);

                const totalCountVal = typeof responseData.totalCount === 'number'
                    ? responseData.totalCount
                    : (typeof responseData.total === 'number' ? responseData.total : items.length);

                setData(prev => JSON.stringify(prev) === JSON.stringify(items) ? prev : items);
                setTotal(prev => prev === totalCountVal ? prev : totalCountVal);
            }
        } catch (error: any | null) {
            console.error('handleFetch error : ', error?.message || error);
        } finally {
            setLoading(false);
        }
    }, [page, searchProductName, searchDepartment, startDate, endDate, pageSize, emitWithAck, apiBaseUrl]);

    const validateDepartmentInput = (val: string): boolean => {
        const trimmed = val.trim();
        if (!trimmed) {
            setSearchDepartment('');
            return true;
        }
        // 使用正則表達式去除特殊怪異字元 (僅保留中英文、數字、底線、連字號、空格與常見括號)
        const sanitized = trimmed.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_\-\s\(\)（）]/g, '').trim();

        if (searchDepartmentArray.length > 0 && !searchDepartmentArray.includes(sanitized)) {
            setMessagePopup({
                show: true,
                type: "warning",
                title: "輸入單位不符",
                message: `「${val}」不在可選擇的申請單位列表中，請重新選擇！`,
            });
            setSearchDepartment('');
            return false;
        }

        setSearchDepartment(sanitized);
        return true;
    };

    const handleSearch = () => {
        if (searchDepartment.trim()) {
            const isValid = validateDepartmentInput(searchDepartment);
            if (!isValid) return;
        }
        pageRef.current = 1;
        setPage(1);
        setPageInput('1');
        void handleFetch();
    };

    const handleReset = () => {
        const defaultStart = moment().tz("Asia/Taipei").subtract(1, 'months').startOf('month').toDate();
        const defaultEnd = moment().tz("Asia/Taipei").endOf('day').toDate();
        setSearchProductName('');
        setSearchDepartment('');
        setStartDate(defaultStart);
        setEndDate(defaultEnd);
        setSearchDepartment('');
        pageRef.current = 1;
        setPage(1);
        setPageInput('1');
    };

    const applyPageInput = () => {
        let targetPage = parseInt(pageInput, 10);
        if (isNaN(targetPage) || targetPage < 1) {
            targetPage = 1;
        } else if (targetPage > totalPages) {
            targetPage = totalPages;
        }
        setPage(targetPage);
        setPageInput(targetPage.toString());
    };

    const handleFetchDepartment = async () => {
        setLoading(true);

        try {
            const response = await axios.get(`${apiBaseUrl}/ingredients/authPart/departmentCheck`);
            const rawData = response.data?.data || [];

            const allDepts: string[] = [];
            rawData.forEach((item: any) => {
                if (typeof item === 'string') {
                    const depts = item.replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
                    allDepts.push(...depts);
                }
            });
            const uniqueDepts = Array.from(new Set(allDepts));
            console.log('確認 handleFetchDepartment 取得部門列表: ', uniqueDepts);
            setSearchDepartmentArray(uniqueDepts);

        } catch (error: any | null) {
            console.error('handleFetchDepartment error : ', error?.message || error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!show) return;
        handleFetchDepartment();
    }, [show])

    // 當切換頁碼時自動觸發抓取資料
    useEffect(() => {
        if (!show) return;
        void handleFetch();
    }, [page]);

    const prevStartDateRef = useRef<Date | null>(startDate);
    const prevEndDateRef = useRef<Date | null>(endDate);

    // 當日期變更時自動重置頁碼並觸發抓取資料 (限定 Asia/Taipei 台灣時間)
    useEffect(() => {
        if (!show) return;
        if (startDate && endDate) {
            const startM = moment(startDate).tz("Asia/Taipei").startOf('day');
            const endM = moment(endDate).tz("Asia/Taipei").startOf('day');
            if (startM.isAfter(endM)) {
                setMessagePopup(prev => ({
                    ...prev,
                    show: true,
                    type: "error",
                    title: "日期區間錯誤",
                    message: "起始日期不可以晚於結束日期！已為您還原成選擇前的日期。",
                }));
                // 還原選擇前的有效日期
                setStartDate(prevStartDateRef.current);
                setEndDate(prevEndDateRef.current);
                return;
            }
        }
        // 更新有效日期紀錄
        prevStartDateRef.current = startDate;
        prevEndDateRef.current = endDate;

        pageRef.current = 1;
        setPage(1);
        setPageInput('1');
        void handleFetch();
    }, [startDate, endDate, show]);

    const handleFetchRef = useRef(handleFetch);
    handleFetchRef.current = handleFetch;

    useEffect(() => {
        if (!show || !apiBaseUrl) {
            if (socketRef.current) {
                leaveRoom();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return;
        }
        if (!socketRef.current) {
            const socket = io(`${apiBaseUrl}/Ingredients`, {
                transports: ['websocket', 'polling'],
                withCredentials: true,
                query: { roomKey }
            });

            socketRef.current = socket;

            socket.on('connect', () => {
                console.log('MaterialUseRecord Socket 連線成功');
                joinedRoomRef.current = true;
                joinRoom();
                void handleFetchRef.current();
            });

            socket.on('disconnect', () => {
                console.log('MaterialUseRecord Socket 斷線');
                joinedRoomRef.current = false;
            });

            socket.on('Ingredients:pickUp', () => {
                void handleFetchRef.current();
            });

            socket.on('Ingredients:getExhaustData', () => {
                void handleFetchRef.current();
            });
        }

        return () => {
            if (socketRef.current) {
                leaveRoom();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [show, apiBaseUrl, roomKey, joinRoom, leaveRoom]);

    // 分頁數字按鈕生成 (參考 allocatedMaterialCollection.tsx)
    const pageItems = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let number = startPage; number <= endPage; number++) {
        pageItems.push(
            <Pagination.Item
                key={number}
                active={number === page}
                onClick={() => setPage(number)}
            >
                {number}
            </Pagination.Item>
        );
    }

    const statusChange = (status: string) => {
        switch (status) {
            case 'new':
                return <div style={{ backgroundColor: "#4D99BA", color: "white", padding: "5px", borderRadius: "5px" }}>原領取部門</div>;
            case 'transfer':
                return <div style={{ backgroundColor: "#FF9C07", color: "white", padding: "5px", borderRadius: "5px" }}>轉讓</div>;
            case 'return':
                return <div style={{ backgroundColor: "#C01A1A", color: "white", padding: "5px", borderRadius: "5px" }}>退料</div>;
            default:
                return status;
        }
    }

    return (
        <>
            {messagePopup.show && (
                <MessagePopup
                    show={messagePopup.show}
                    onHide={() => setMessagePopup(prev => ({ ...prev, show: false }))}
                    type={messagePopup.type}
                    title={messagePopup.title}
                    message={messagePopup.message}
                    autoClose={messagePopup.autoClose}
                    autoCloseDelay={messagePopup.autoCloseDelay}
                />
            )}

            {
                show && (
                    <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
                        <Modal.Header closeButton>
                            <Modal.Title className="title_Albert">已用盡料品紀錄</Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            {/* 搜尋過濾條件列 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', flexWrap: 'wrap', position: 'relative', zIndex: 1050 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '180px', position: 'relative', zIndex: 1050 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '4px' }}>起始日期</label>
                                    <DatePicker
                                        selected={startDate}
                                        onChange={(date: Date | null) => setStartDate(date)}
                                        dateFormat="yyyy/MM/dd"
                                        className="form-control"
                                        isClearable
                                        placeholderText="選擇起始日期"
                                        popperProps={{ style: { zIndex: 99999 } }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '180px', position: 'relative', zIndex: 1050 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '4px' }}>結束日期</label>
                                    <DatePicker
                                        selected={endDate}
                                        onChange={(date: Date | null) => setEndDate(date)}
                                        dateFormat="yyyy/MM/dd"
                                        className="form-control"
                                        isClearable
                                        placeholderText="選擇結束日期"
                                        popperProps={{ style: { zIndex: 99999 } }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '220px' }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '4px' }}>產品品名搜索</label>
                                    <Form.Control
                                        type="text"
                                        placeholder="請輸入產品品名..."
                                        value={searchProductName}
                                        onChange={(e) => setSearchProductName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleSearch();
                                            }
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '220px' }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '4px' }}>申請單位</label>
                                    <Form.Control
                                        type="text"
                                        list="searchDepartmentDatalist"
                                        placeholder="請選擇或輸入申請單位..."
                                        value={searchDepartment}
                                        onChange={(e) => setSearchDepartment(e.target.value)}
                                        onBlur={(e) => {
                                            if (e.target.value.trim()) {
                                                validateDepartmentInput(e.target.value);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleSearch();
                                            }
                                        }}
                                    />
                                    <datalist id="searchDepartmentDatalist">
                                        {searchDepartmentArray.map((item, idx) => (
                                            <option key={`${item}-${idx}`} value={item} />
                                        ))}
                                    </datalist>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginTop: 'auto' }}>
                                    <Button variant="primary" onClick={handleSearch}>
                                        搜尋
                                    </Button>
                                    <Button variant="outline-secondary" onClick={handleReset}>
                                        重置
                                    </Button>
                                </div>
                            </div>
                            <div className="table-responsive mb-3" style={{ overflow: 'auto', maxHeight: '60vh' }}>
                                <Table bordered hover className="mb-0 text-center align-middle" style={{ whiteSpace: 'nowrap' }}>
                                    <colgroup>
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '20%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                    </colgroup>
                                    <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            {/* <th>用完位置</th> */}
                                            <th>QRCODE 產生日期</th>
                                            <th>用完時間</th>
                                            <th>物料QRcode</th>
                                            <th>產品品名</th>
                                            <th>產品規格</th>
                                            <th>數量</th>
                                            <th>單位</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.length > 0 ? (
                                            data.map((item: exhaustData, idx) => (
                                                <tr key={idx}>
                                                    {/* <td>{statusChange(item.status)}</td> */}
                                                    <td>{formatDate(item.assign_datetime)}</td>
                                                    <td>{formatDate(item.iscostover_Time, true)}</td>
                                                    <td>{item.allocate_barcode_text}</td>
                                                    <td>{item.product_name}</td>
                                                    <td>{item.specification}</td>
                                                    <td>{item.row_measure_val}</td>
                                                    <td>{item.row_unit}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={7}>目前沒有資料</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </div>
                        </Modal.Body>

                        {/* Modal.Footer 完全參照 allocatedMaterialCollection.tsx 結構與樣式 */}
                        <Modal.Footer>
                            <div style={{ display: loading ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <div>
                                    共 {total} 筆 / 第
                                    <input
                                        type="text"
                                        value={pageInput}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (/[\u4e00-\u9fa5]/.test(value)) return;
                                            if (!/^\d*$/.test(value)) return;
                                            setPageInput(value);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                applyPageInput();
                                            }
                                        }}
                                        onBlur={applyPageInput}
                                        inputMode="numeric"
                                        style={{ width: '60px', textAlign: 'center', borderRadius: '5px', border: '1px solid #ccc', padding: '2px 5px', margin: '0 5px' }}
                                    />
                                    頁 / 共 {totalPages} 頁
                                </div>
                                <Pagination className="mb-0">
                                    <Pagination.First onClick={() => setPage(1)} disabled={page <= 1} />
                                    <Pagination.Prev onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1} />
                                    {pageItems}
                                    <Pagination.Next onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} />
                                    <Pagination.Last onClick={() => setPage(totalPages)} disabled={page >= totalPages} />
                                </Pagination>
                            </div>
                            <Button variant="secondary" onClick={onHide} style={{ marginTop: '0.5rem' }}>
                                關閉
                            </Button>
                        </Modal.Footer>
                    </Modal>
                )
            }
        </>
    );
};

export default React.memo(MaterialUseRecord);
