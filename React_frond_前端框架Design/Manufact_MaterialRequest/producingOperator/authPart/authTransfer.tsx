import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Button, Table, Form, Spinner, Pagination, Col, Row } from "react-bootstrap";
import config from '../../../../config';
import axios from 'axios'
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import { z } from 'zod'
import { io, Socket } from "socket.io-client";
import MessagePopup from '../../../../components/MessagePopup';
import moment from 'moment-timezone';


interface AuthTransferProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
}

export const socketAckResponseSchema = z.object({
    status: z.enum(['success', 'error']).default('success'),
    success: z.boolean(),
    message: z.union([z.string(), z.array(z.string())]).optional().default(''),
    data: z.any().optional(),
    error: z.string().optional().default('')
});

export type socketAckResponse<T = unknown> = Omit<z.infer<typeof socketAckResponseSchema>, 'data'> & {
    data?: T;
};
export type TSocketAckResponse<T = unknown> = socketAckResponse<T>;
export const DateRangeSchema = z.object({
    startDate: z.date().nullable().catch(null),
    endDate: z.date().nullable().catch(null),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export const MessagePopupStateSchema = z.object({
    show: z.boolean().default(false),
    type: z.enum(["info", "success", "error", "warning"]).default("info"),
    title: z.string().default(""),
    message: z.string().default(""),
    autoClose: z.boolean().optional().default(false),
    autoCloseDelay: z.number().optional().default(3000),
});
export type MessagePopupState = z.infer<typeof MessagePopupStateSchema>;

export const ConfirmModalStateSchema = z.object({
    show: z.boolean().default(false),
    type: z.enum(['approveAll', 'rejectAll']).nullable().default(null),
    title: z.string().default(''),
    message: z.string().default(''),
});
export type ConfirmModalState = z.infer<typeof ConfirmModalStateSchema>;

export const AuthTransferItemSchema = z.object({
    id: z.coerce.number().catch(0),
    id_uuid: z.coerce.string().catch(''),
    channel: z.coerce.string().catch('').transform((val) =>
        val === 'rtChannelReturn' || val === 'trChannelApply' ? val : ''
    ),
    form_id: z.coerce.string().catch(''),
    uuid_apply: z.coerce.string().catch(''),
    allocate_barcode_text: z.coerce.string().catch(''),
    decisionStatus: z.coerce.number().catch(0),
    row_measure_val: z.coerce.number().catch(0),
    row_unit: z.coerce.string().catch(''),
    rejectReason: z.coerce.string().catch(''),
    decisionEmpName: z.coerce.string().catch(''),
    decisionEmpNo: z.coerce.string().catch(''),
    decisionEmpTime: z.coerce.date().nullish().catch(null),
    apply_No: z.coerce.string().catch(''),
    apply_Name: z.coerce.string().catch(''),
    apply_Department: z.coerce.string().catch(''),
    pickUp_Department: z.coerce.string().catch(''),
    apply_Time: z.coerce.date().nullish().catch(null),
    reason: z.coerce.string().catch('')
});
export type AuthTransferItem = z.infer<typeof AuthTransferItemSchema>;

export const DataSchema = z.object({
    success: z.boolean().optional().default(true),
    data: z.array(AuthTransferItemSchema).catch([]),
    total: z.coerce.number().optional().default(0),
    page: z.coerce.number().optional().default(1),
});
export type Data = z.infer<typeof DataSchema>;

export const DateSearchSchema = z.object({
    startDate: z.date().nullable().catch(null),
    endDate: z.date().nullable().catch(null),
    searchTransferNo: z.string().trim().catch(''),
});
export type DateSearch = z.infer<typeof DateSearchSchema>;



const AuthTransfer: React.FC<AuthTransferProps> = ({ show, onHide, centered }) => {
    const apiBaseUrl = config.apiBaseUrl;
    const userStr = localStorage.getItem("user");
    const userObj = userStr ? JSON.parse(userStr) : null;
    const userNumber = userObj?.memberID ?? userObj?.memberNo ?? userObj?.userNumber ?? "";
    const userNumberRef = useRef<string>(userNumber);
    userNumberRef.current = userNumber;


    const [data, setData] = useState<Data['data']>([]); // 裝 fetch的所有資料
    const [selectApproveData, setSelectApproveData] = useState<Data['data']>([]); // 裝 要提供給到後台的id 資料 (approve)
    const [selectRejectData, setSelectRejectData] = useState<Data['data']>([]); // 裝 要提供給到後台的id 資料 (reject)

    const [dateRange, setDateRange] = useState<DateRange>({
        startDate: moment().tz('Asia/Taipei').subtract(1, 'month').toDate(),
        endDate: moment().tz('Asia/Taipei').toDate()
    });
    const [searchTransferNo, setSearchTransferNo] = useState<string>('');

    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
        show: false,
        type: null,
        title: '',
        message: ''
    });

    const [messagePopup, setMessagePopup] = useState<MessagePopupState>({
        show: false,
        type: 'info',
        title: '',
        message: '',
        autoClose: false,
        autoCloseDelay: 3000,
    });

    const socketRef = useRef<ReturnType<typeof io> | null>(null);
    const joinRoomRef = useRef<boolean>(false);
    const roomKey = 'managementRoom:AuthPart'

    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(5);
    const [total, setTotal] = useState<number>(0);
    const [pageInput, setPageInput] = useState<string>('1');
    const [loading, setLoading] = useState<boolean>(false);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pageRef = useRef<number>(1);
    pageRef.current = page;

    useEffect(() => {
        setPageInput(page.toString());
    }, [page]);

    useEffect(() => {
        if (show && socketRef.current && socketRef.current.connected) {
            void handleFetchData();
        }
    }, [page]);

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

    const joinRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;
        if (!joinRoomRef.current) {
            socket.emit('joinRoom', roomKey);
            joinRoomRef.current = true;
            console.log('加入 AuthTransfer 房間');
        }
    }, [roomKey]);

    const leaveRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;
        if (joinRoomRef.current) {
            socket.emit('leaveRoom', roomKey);
            joinRoomRef.current = false;
            console.log('離開 AuthTransfer 房間');
        }
    }, [roomKey]);


    const emitWithAck = useCallback(<T,>(eventName: string, payload: Record<string, unknown>): Promise<socketAckResponse<T>> => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
            return Promise.reject(new Error('Socket 未連線'));
        }

        return new Promise<socketAckResponse<T>>((resolve, reject) => {
            socket.timeout(8000).emit(eventName, payload, (error: unknown, response: socketAckResponse<T>) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(response);
            });
        });
    }, []);


    // 抓取待調撥審核資料 (包含指數退避 Exponential Backoff 重試機制)
    const handleFetchData = async (maxRetries = 3, initialDelay = 1000) => {
        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                const response = await emitWithAck<{ data: Data['data'] }>
                    ('ingredients:fetchAuthTransferData', {
                        startDate: dateRange.startDate ?? null,
                        endDate: dateRange.endDate ?? null,
                        searchTransferNo: searchTransferNo ?? '',
                        userNumber: userNumberRef.current || userNumber || '',
                        page: pageRef.current ?? 1,
                        pageSize: pageSize ?? 5,
                        roomKey: roomKey
                    });
                console.log('fetchAuthTransferData response:', response);

                if (response && response.success) {
                    const parsed = DataSchema.parse(response);
                    setData(prev => JSON.stringify(prev) === JSON.stringify(parsed.data) ? prev : parsed.data);
                    setTotal(prev => prev === (parsed.total ?? 0) ? prev : (parsed.total ?? 0));
                    return; // 成功取得並解析資料，結束重試
                } else {
                    const errMsg = response?.message
                        ? (Array.isArray(response.message) ? response.message.join(', ') : response.message)
                        : '回應狀態失敗';
                    throw new Error(errMsg);
                }
            } catch (error: any) {
                // 若為 Zod 欄位結構驗證錯誤，非網路連線問題，不進行無謂重試
                if (error instanceof z.ZodError) {
                    console.error("Zod 驗證欄位錯誤:", error.issues);
                    setMessagePopup(MessagePopupStateSchema.parse({
                        show: true,
                        type: 'error',
                        title: 'Zod 驗證欄位錯誤',
                        message: error.message,
                        autoClose: true,
                        autoCloseDelay: 3000,
                    }));
                    return;
                }

                attempt++;
                if (attempt > maxRetries) {
                    console.error(`抓取資訊失敗 (已進行 ${maxRetries} 次退避重試):`, error.message);
                    setMessagePopup(MessagePopupStateSchema.parse({
                        show: true,
                        type: 'error',
                        title: '連線逾時',
                        message: `抓取資料失敗: ${error.message || '網路連線異常'}`,
                        autoClose: true,
                        autoCloseDelay: 3000,
                    }));
                    return;
                }

                // 指數退避延遲計算 (1000ms -> 2000ms -> 4000ms ...)
                const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
                console.warn(`抓取資料異常 (${error.message})，將於 ${backoffDelay}ms 後進行第 ${attempt}/${maxRetries} 次指數退避重試...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }
    };

    const submitAuthTransferData = async (approveItems: Data['data'], rejectItems: Data['data']) => {
        try {
            setLoading(true);
            const response = await axios.post(`${apiBaseUrl}/ingredients/authPart/submitAuthTransfer`, {
                userNumber: userNumber ?? '',
                selectApproveData: approveItems,
                selectRejectData: rejectItems
            });

            if (response.data && response.data.success) {
                setSelectApproveData([]);
                setSelectRejectData([]);

                // 觸發 Socket 房間廣播通知更新
                if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.emit('ingredients:renewFetchAuth', { roomKey });
                }

                setMessagePopup(MessagePopupStateSchema.parse({
                    show: true,
                    type: 'success',
                    title: '成功',
                    message: response.data.message || '調撥審核資料已成功送出！',
                    autoClose: true,
                    autoCloseDelay: 3000,
                }));
                void handleFetchData();
            } else {
                throw new Error(response.data?.message || '送出審核失敗');
            }
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                console.error("Zod 驗證欄位錯誤:", error.issues);
                setMessagePopup(MessagePopupStateSchema.parse({
                    show: true,
                    type: 'error',
                    title: 'Zod 驗證欄位錯誤',
                    message: error.message,
                    autoClose: true,
                    autoCloseDelay: 3000,
                }));
            } else {
                console.error("送出失敗:", error.message);
                setMessagePopup(MessagePopupStateSchema.parse({
                    show: true,
                    type: 'error',
                    title: '送出失敗',
                    message: error.message || '網路連線異常，請稍後再試',
                    autoClose: true,
                    autoCloseDelay: 3000,
                }));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        await submitAuthTransferData(selectApproveData, selectRejectData);
    };

    const handleSearch = () => {
        setPage(1);
        pageRef.current = 1;
        void handleFetchData();
    };

    useEffect(() => {
        if (!show) {
            if (socketRef.current) {
                leaveRoom();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return;
        }

        if (!socketRef.current) {
            socketRef.current = io(`${config.apiBaseUrl}/Ingredients`, {
                transports: ['websocket', 'polling'],
                withCredentials: true,
                query: { roomKey }
            });
        }

        const socket = socketRef.current;

        const handleConnect = () => {
            console.log('已連接到ingredient命名空間 socket', socket.id);
            joinRoomRef.current = true;
            joinRoom();
            void handleFetchData();
        };

        const handleDisconnect = () => {
            console.log('與 ingredient 命名空間 socket 連線中斷');
            joinRoomRef.current = false;
        };

        const handleRenewFetchAuth = () => {
            void handleFetchData();
        };

        // 若 socket 已是連線狀態則直接執行，否則監聽 connect 事件，避免兩者同時觸發
        if (socket.connected) {
            handleConnect();
        } else {
            socket.on('connect', handleConnect);
        }

        socket.on('disconnect', handleDisconnect);
        socket.on('ingredients:renewFetchAuth', handleRenewFetchAuth);

        const handleBeforeUnload = () => {
            leaveRoom();
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('ingredients:renewFetchAuth', handleRenewFetchAuth);
            leaveRoom();
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [show, joinRoom, leaveRoom, roomKey]);

    const handleCloseModal = () => {
        leaveRoom();
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        onHide();
    };

    const handleOpenApproveAllConfirm = () => {
        if (data.length === 0) return;
        setConfirmModal({
            show: true,
            type: 'approveAll',
            title: '確認全選同意',
            message: `確定要將全部共 ${data.length} 筆待審核申請設定為【已核准】嗎？`
        });
    };

    const handleOpenRejectAllConfirm = () => {
        if (data.length === 0) return;
        setConfirmModal({
            show: true,
            type: 'rejectAll',
            title: '確認全選不同意',
            message: `確定要將全部共 ${data.length} 筆待審核申請設定為【不核准】嗎？`
        });
    };

    const handleConfirmBatchAction = async () => {
        const type = confirmModal.type;
        setConfirmModal({ show: false, type: null, title: '', message: '' });

        if (type === 'approveAll') {
            await submitAuthTransferData([...data], []);
        } else if (type === 'rejectAll') {
            await submitAuthTransferData([], [...data]);
        }
    };

    const handleClearAll = () => {
        setSelectApproveData([]);
        setSelectRejectData([]);
    };

    return (
        <>
            {/* 訊息提示彈窗 */}
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

            {/* 確認彈窗 (全選同意 / 全選不同意) */}
            <Modal
                show={confirmModal.show}
                onHide={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                centered
                backdrop="static"
                style={{ zIndex: 1060 }}
            >
                <Modal.Header
                    closeButton
                    className={confirmModal.type === 'approveAll' ? 'bg-success text-white' : 'bg-danger text-white'}
                >
                    <Modal.Title style={{ fontSize: '1.15rem', fontWeight: 'bold' }}>
                        {confirmModal.type === 'approveAll' ? '✅ ' : '⚠️ '}
                        {confirmModal.title}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="py-4 text-center">
                    <div style={{ fontSize: '16px', color: '#2b2b2b', lineHeight: 1.6 }}>
                        {confirmModal.message}
                    </div>
                </Modal.Body>
                <Modal.Footer className="d-flex justify-content-end gap-2 py-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                        style={{ minWidth: '80px' }}
                    >
                        取消
                    </Button>
                    <Button
                        variant={confirmModal.type === 'approveAll' ? 'success' : 'danger'}
                        size="sm"
                        onClick={handleConfirmBatchAction}
                        style={{ minWidth: '80px', fontWeight: 'bold' }}
                    >
                        確認
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={show} onHide={handleCloseModal} centered={centered} size="xl" backdrop="static">
                <Modal.Header closeButton>
                    <Modal.Title className="title_Albert">調撥審核</Modal.Title>
                </Modal.Header>
                <Modal.Body style={{ maxHeight: '75vh' }}>
                    <div className="p-2">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', position: 'relative', zIndex: 1050 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', width: '180px', position: 'relative', zIndex: 1050 }}>
                                <label>起始日期</label>
                                <DatePicker
                                    isClearable
                                    selected={dateRange.startDate}
                                    onChange={(date: Date | null) => setDateRange(prev => ({ ...prev, startDate: date }))}
                                    dateFormat="yyyy/MM/dd"
                                    className="form-control form-control-sm"
                                    style={{ width: "120px" }}
                                    popperProps={{ style: { zIndex: 99999 } }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', width: '180px', position: 'relative', zIndex: 1050 }}>
                                <label>結束日期</label>
                                <DatePicker
                                    isClearable
                                    selected={dateRange.endDate}
                                    onChange={(date: Date | null) => setDateRange(prev => ({ ...prev, endDate: date }))}
                                    dateFormat="yyyy/MM/dd"
                                    className="form-control form-control-sm"
                                    style={{ width: "120px" }}
                                    popperProps={{ style: { zIndex: 99999 } }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', width: '180px' }}>
                                <label>查詢單號</label>
                                <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    placeholder="請輸入單號"
                                    value={searchTransferNo}
                                    onChange={(e) => setSearchTransferNo(e.target.value)}
                                />
                            </div>
                            <div style={{ alignSelf: 'flex-end', marginBottom: '2px' }}>
                                <Button variant="primary" size="sm" onClick={handleSearch}>查詢</Button>
                            </div>
                        </div>
                        {data.length > 0 && (
                            <div className="d-flex justify-content-between align-items-center mb-3 px-1 flex-wrap gap-2 ">
                                <span style={{ color: "#555", fontSize: "15px" }}>
                                    共 <strong style={{ color: "#000000ff" }}>{data.length}</strong> 筆待審核申請（
                                    已核准: <strong style={{ color: "#198754" }}>{selectApproveData.length}</strong> 筆，
                                    不核准: <strong style={{ color: "#dc3545" }}>{selectRejectData.length}</strong> 筆
                                    ）
                                </span>
                                <div className="d-flex gap-2">
                                    <Button
                                        variant="outline-success"
                                        size="sm"
                                        onClick={handleOpenApproveAllConfirm}
                                        disabled={data.length === 0}
                                        style={{ fontWeight: 600 }}
                                    >
                                        全選同意 ✓
                                    </Button>
                                    <Button
                                        variant="outline-danger"
                                        size="sm"
                                        onClick={handleOpenRejectAllConfirm}
                                        disabled={data.length === 0}
                                        style={{ fontWeight: 600 }}
                                    >
                                        全選不同意 ✗
                                    </Button>
                                    {(selectApproveData.length > 0 || selectRejectData.length > 0) && (
                                        <Button
                                            variant="outline-secondary"
                                            size="sm"
                                            onClick={handleClearAll}
                                            style={{ fontWeight: 600 }}
                                        >
                                            清除選取
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div style={{ maxHeight: '58vh', overflowY: 'auto', paddingRight: '4px' }}>
                            {loading && data.length === 0 ? (
                                <div className="text-center py-5">
                                    <Spinner animation="border" style={{ color: "#000000ff" }} role="status" />
                                    <div className="mt-2 text-muted">資料載入中...</div>
                                </div>
                            ) : data.length === 0 ? (
                                <div className="text-center text-muted py-5 border rounded bg-light">
                                    目前尚無待審核之調撥申請
                                </div>
                            ) : (
                                data.map((item, index) => {
                                    const isApproved = selectApproveData.some(i => i.id === item.id);
                                    const isRejected = selectRejectData.some(i => i.id === item.id);
                                    const currentVal = isApproved ? 'approve' : isRejected ? 'reject' : 'none';

                                    let selectBorderColor = '#000000ff';
                                    let selectBgColor = '#ffffff';
                                    let selectTextColor = '#000000ff';

                                    if (isApproved) {
                                        selectBorderColor = '#198754';
                                        selectBgColor = '#e8f5e9';
                                        selectTextColor = '#198754';
                                    } else if (isRejected) {
                                        selectBorderColor = '#dc3545';
                                        selectBgColor = '#ffebee';
                                        selectTextColor = '#dc3545';
                                    }

                                    return (
                                        <div
                                            key={item.id || index}
                                            className="mb-3 shadow-sm"
                                            style={{
                                                border: isApproved
                                                    ? '2px solid #a3cfbb'
                                                    : isRejected
                                                        ? '2px solid #f1aeb5'
                                                        : '2px solid #e1e1e1ff',
                                                borderRadius: '6px',
                                                overflow: 'hidden',
                                                backgroundColor: '#ffffff'
                                            }}
                                        >
                                            <Table striped bordered hover responsive
                                                className="text-center align-middle text-nowrap"
                                                style={{ whiteSpace: 'nowrap' }}
                                            >
                                                <tbody>
                                                    {/* 第一排: 調撥部門 | [資料] | 調撥至部門 | [資料] | 申請人姓名 | [資料] | 申請人工號 | [資料] */}
                                                    <tr>
                                                        <td style={{ width: '12.5%', backgroundColor: '#ffffff', fontWeight: 'bold' }}>原部門</td>
                                                        <td style={{ width: '12.5%', backgroundColor: '#ffffff' }}>{item.pickUp_Department || '-'}</td>
                                                        <td style={{ width: '12.5%', backgroundColor: '#ffffff', fontWeight: 'bold' }}>調撥至部門</td>
                                                        <td style={{ width: '12.5%', backgroundColor: '#ffffff' }}>{item.apply_Department || '-'}</td>
                                                        <td style={{ width: '12.5%', backgroundColor: '#ffffff', fontWeight: 'bold' }}>申請人姓名</td>
                                                        <td style={{ width: '12.5%', backgroundColor: '#ffffff' }}>{item.apply_Name || '-'}</td>
                                                        <td style={{ width: '12.5%', backgroundColor: '#ffffff', fontWeight: 'bold' }}>申請人工號</td>
                                                        <td style={{ width: '12.5%', backgroundColor: '#ffffff' }}>{item.apply_No || '-'}</td>
                                                    </tr>
                                                    {/* 第二排: 物料名稱 | [資料] | 產品規格 | [資料] | 調撥數量 | [資料] | 功能 | [選取 🔻] */}
                                                    <tr>
                                                        <td style={{ backgroundColor: '#ffffff', fontWeight: 'bold' }}>物料名稱</td>
                                                        <td style={{ backgroundColor: '#ffffff' }}>{item.allocate_barcode_text || '-'}</td>
                                                        <td style={{ backgroundColor: '#ffffff', fontWeight: 'bold' }}>產品規格</td>
                                                        <td style={{ backgroundColor: '#ffffff' }}>
                                                            {item.row_measure_val ? `${item.row_measure_val} ${item.row_unit || ''}` : '-'}
                                                        </td>
                                                        <td style={{ backgroundColor: '#ffffff', fontWeight: 'bold' }}>調撥數量</td>
                                                        <td style={{ backgroundColor: '#ffffff' }}>{item.row_measure_val ?? '-'}</td>
                                                        <td style={{ backgroundColor: '#ffffff', fontWeight: 'bold' }}>功能</td>
                                                        <td style={{ backgroundColor: '#ffffff', padding: '4px 8px' }}>
                                                            <Form.Select
                                                                size="sm"
                                                                className="text-center fw-bold"
                                                                style={{
                                                                    borderRadius: '20px',
                                                                    border: `2px solid ${selectBorderColor}`,
                                                                    color: selectTextColor,
                                                                    backgroundColor: selectBgColor,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-block',
                                                                    width: 'auto',
                                                                    minWidth: '100px'
                                                                }}
                                                                value={currentVal}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (val === 'approve') {
                                                                        setSelectApproveData(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]);
                                                                        setSelectRejectData(prev => prev.filter(i => i.id !== item.id));
                                                                    } else if (val === 'reject') {
                                                                        setSelectRejectData(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]);
                                                                        setSelectApproveData(prev => prev.filter(i => i.id !== item.id));
                                                                    } else {
                                                                        setSelectApproveData(prev => prev.filter(i => i.id !== item.id));
                                                                        setSelectRejectData(prev => prev.filter(i => i.id !== item.id));
                                                                    }
                                                                }}
                                                            >
                                                                <option value="none">選取 🔻</option>
                                                                <option value="approve">已核准 ✓</option>
                                                                <option value="reject">不核准 ✗</option>
                                                            </Form.Select>
                                                        </td>
                                                    </tr>
                                                    {/* 第三排: 調撥原因 | [資料 colSpan=7] */}
                                                    <tr>
                                                        <td style={{ backgroundColor: '#ffffff', fontWeight: 'bold', color: 'black' }}>調撥原因</td>
                                                        <td colSpan={7} style={{ backgroundColor: '#ffffff', textAlign: 'left', paddingLeft: '15px' }}>
                                                            {item.reason || '-'}
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </Table>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div style={{ display: loading || total === 0 ? 'none' : 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flexDirection: 'column', width: '100%', marginLeft: 'auto', marginRight: 'auto' }}>
                        <div style={{ fontSize: '14px', color: '#555', }}>
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
                                style={{ width: '55px', textAlign: 'center', borderRadius: '5px', border: '1px solid #ccc', padding: '2px 5px', margin: '0 5px' }}
                            />
                            頁 / 共 {totalPages} 頁
                        </div>
                        <div style={{ display: loading || total === 0 ? 'none' : 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flexDirection: 'row' }}>
                            <Pagination size="sm" className="mb-0">
                                <Pagination.First onClick={() => setPage(1)} disabled={page <= 1} />
                                <Pagination.Prev onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1} />
                                {pageItems}
                                <Pagination.Next onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} />
                                <Pagination.Last onClick={() => setPage(totalPages)} disabled={page >= totalPages} />
                            </Pagination>
                            <div className="d-flex gap-2 ms-auto">
                                {data.length > 0 && (
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={loading || (selectApproveData.length === 0 && selectRejectData.length === 0)}
                                        style={{ backgroundColor: '#0033ffff', borderColor: '#e1e1e1ff', fontWeight: 'bold' }}
                                    >
                                        {loading ? <Spinner animation="border" size="sm" /> : `送出審核 (${selectApproveData.length + selectRejectData.length} 筆)`}
                                    </Button>
                                )}
                                <Button variant="secondary" onClick={onHide}>
                                    關閉
                                </Button>
                            </div>
                        </div>
                    </div>

                </Modal.Footer>
            </Modal>
        </>
    );
};

export default React.memo(AuthTransfer);
