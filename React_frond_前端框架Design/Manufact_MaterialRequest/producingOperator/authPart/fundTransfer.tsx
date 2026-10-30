import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Button, Table, Form, Spinner, Pagination, Col, Row, InputGroup } from "react-bootstrap";
import config from '../../../../config';
import axios from 'axios'
import { z } from 'zod'
import MessagePopup from '../../../../components/MessagePopup';
import moment from 'moment-timezone';
import { io, Socket } from "socket.io-client";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { socketAckResponseSchema } from "./authTransfer";

interface FundTransferProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
}

export const FundTransferItemSchema = z.object({
    id: z.coerce.number().catch(0),
    id_uuid: z.coerce.string().catch(''),
    channel: z.coerce.string().catch(''),
    form_id: z.coerce.string().catch(''),
    uuid_apply: z.coerce.string().catch(''),
    allocate_barcode_text: z.coerce.string().catch(''),
    decisionStatus: z.coerce.number().catch(0),
    row_measure_val: z.coerce.number().catch(0),
    row_unit: z.coerce.string().catch(''),
    rejectReason: z.coerce.string().catch('').optional(),
    decisionEmpName: z.coerce.string().catch('').optional(),
    decisionEmpNo: z.coerce.string().catch('').optional(),
    decisionEmpTime: z.any().optional().nullable().catch(null),
    apply_No: z.coerce.string().catch(''),
    apply_Name: z.coerce.string().catch(''),
    apply_Department: z.coerce.string().catch(''),
    apply_Time: z.any().optional().nullable().catch(null),
    reason: z.coerce.string().catch('').optional(),
    product_name: z.coerce.string().catch('').optional(),
    specification: z.coerce.string().catch('').optional(),
    product_itemcode: z.coerce.string().catch('').optional(),
}).passthrough();
export type FundTransferItem = z.infer<typeof FundTransferItemSchema>;

export const DataSchema = z.object({
    status: z.union([z.number(), z.string()]).optional().default(200),
    success: z.boolean().optional().default(true),
    data: z.any().optional(),
    total: z.coerce.number().optional().default(0),
    page: z.coerce.number().optional().default(1),
});
export type Data = z.infer<typeof DataSchema>;

export const UserDataSchema = z.object({
    absentEnd: z.coerce.date().nullish().catch(null),
    absentStart: z.coerce.date().nullish().catch(null),
    authPosition: z.coerce.string().optional().default(''),
    authStatus: z.coerce.string().optional().default(''),
    code: z.coerce.string().optional().nullish().catch(null),
    id: z.coerce.number().catch(0),
    isManager: z.coerce.number().catch(0),
    memEmail: z.coerce.string().optional().default(''),
    memberID: z.coerce.string().optional().default(''),
    positionarea: z.coerce.string().optional().default(''),
    reg_schedulename: z.coerce.string().optional().default(''),
    shift: z.coerce.string().optional().default(''),
    telephone: z.coerce.string().optional().default(''),
})
export type userData = z.infer<typeof UserDataSchema>

export const DateRangeSchema = z.object({
    startDate: z.coerce.date().nullable().optional().default(null),
    endDate: z.coerce.date().nullable().optional().default(null),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export type socketAckResponse<T = unknown> = Omit<z.infer<typeof socketAckResponseSchema>, 'data'> & {
    data?: T
}
export type TSocketAckResponse<T = unknown> = socketAckResponse<T>;

export const MessagePopupStateSchema = z.object({
    show: z.boolean().default(false),
    type: z.enum(["info", "success", "error", "warning"]).default("info"),
    title: z.string().default(""),
    message: z.string().default(""),
    autoClose: z.boolean().optional().default(false),
    autoCloseDelay: z.number().optional().default(3000),
    onclose: z.function().optional().nullable().catch(null),
});
export type MessagePopupState = z.infer<typeof MessagePopupStateSchema>;

export const JoinRoomSchema = z.boolean().default(false);
export type JoinRoomType = z.infer<typeof JoinRoomSchema>;

export const ApprovePayloadItemSchema = z.object({
    id: z.coerce.number().catch(0),
    id_uuid: z.coerce.string().catch(''),
    uuid_apply: z.coerce.string().catch(''),
    form_id: z.coerce.string().catch(''),
    channel: z.coerce.string().catch(''),
    decisionStatus: z.coerce.number().catch(0),
    decisionEmpNo: z.coerce.string().catch(''),
    decisionEmpName: z.coerce.string().catch(''),
    decisionEmpTime: z.coerce.string().catch(''),
    row_measure_val: z.coerce.number().catch(0).optional(),
    rejectReason: z.coerce.string().catch('').optional(),
});
export type ApprovePayloadItem = z.infer<typeof ApprovePayloadItemSchema>;

export const ApprovePayloadSchema = z.object({
    items: z.array(ApprovePayloadItemSchema).catch([])
});
export type ApprovePayload = z.infer<typeof ApprovePayloadSchema>;

const FundTransfer: React.FC<FundTransferProps> = ({ show, onHide, centered }) => {

    const apiBaseUrl = config.apiBaseUrl;
    const userStr = localStorage.getItem('user') ?? '{}';
    const userObj: userData = UserDataSchema.parse(JSON.parse(userStr));

    const userNumber = userObj.memberID;
    const userName = userObj.reg_schedulename;

    const [data, setData] = useState<FundTransferItem[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const roomKey = 'Ingredients_fundTransfer_management';

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [decisions, setDecisions] = useState<{ [key: string]: string }>({});

    const handleDecisionChange = (id: string, val: string) => {
        setDecisions(prev => ({ ...prev, [id]: val }));
    };

    const [searchTransferNo, setSearchTransferNo] = useState<string>('');
    const now = new Date()
    const [dateRange, setDateRange] = useState<DateRange>({ startDate: moment(now).tz('Asia/Taipei').subtract(1, 'month').toDate(), endDate: moment(now).tz('Asia/Taipei').toDate() });

    const socketRef = useRef<Socket | null>(null);
    const joinRoomRef = useRef<JoinRoomType>(JoinRoomSchema.parse(undefined));
    const pageRef = useRef<number>(1);

    const [messagePopup, setMessagePopup] = useState<MessagePopupState>(
        MessagePopupStateSchema.parse({})
    );

    const Message = (
        type: 'info' | 'success' | 'error' | 'warning',
        title: string,
        message: string
    ) => {
        setMessagePopup({
            show: true,
            type,
            title,
            message,
            autoClose: true,
            autoCloseDelay: 3000
        });
    };

    const [total, setTotal] = useState<number>(0);
    const [page, setPage] = useState<number>(1);
    const [pageInput, setPageInput] = useState<string>('1');
    const pageSize = 3;
    const totalPages = Math.ceil(total / pageSize) || 1;

    useEffect(() => {
        setPageInput(page.toString());
        pageRef.current = page;
        if (show && userNumber) {
            void fetchData();
        }
    }, [page]);

    const handleCloseModal = () => {
        if (socketRef.current) {
            leaveRoom();
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        onHide();
    };

    useEffect(() => {
        const handleBeforeUnload = () => {
            if (socketRef.current) {
                leaveRoom();
                socketRef.current.disconnect();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    const joinRoom = useCallback(() => {
        const socket = socketRef.current;
        if (socket && socket.connected && !joinRoomRef.current) {
            socket.emit('joinRoom', roomKey);
            joinRoomRef.current = true;
        }
    }, [roomKey]);

    const leaveRoom = useCallback(() => {
        const socket = socketRef.current;
        if (socket && socket.connected && joinRoomRef.current) {
            socket.emit('leaveRoom', roomKey);
            joinRoomRef.current = false;
        }
    }, [roomKey]);

    const emitWithAck = useCallback(<T,>(eventName: string, payload: Record<string, unknown>): Promise<TSocketAckResponse<T>> => {
        return new Promise((resolve, reject) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected) {
                reject(new Error('Socket connection is not established.'));
                return;
            }

            const timeoutId = setTimeout(() => {
                reject(new Error('Server response timeout.'));
            }, 10000);

            socket.emit(eventName, payload, (ackData: TSocketAckResponse<T>) => {
                clearTimeout(timeoutId);
                resolve(ackData);
            });
        });
    }, []);

    const fetchData = async (maxRetries = 3, initialDelay = 1000) => {
        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                setLoading(true);
                const response = await axios.get(`${apiBaseUrl}/ingredients/authPart/getFundApproveData`, {
                    params: {
                        empNo: userNumber,
                        page: pageRef.current || page,
                        pageSize: pageSize,
                        startDate: dateRange.startDate ? moment(dateRange.startDate).format('YYYY-MM-DD') : undefined,
                        endDate: dateRange.endDate ? moment(dateRange.endDate).format('YYYY-MM-DD') : undefined,
                        searchTransferNo: searchTransferNo || undefined
                    }
                });
                const resp = DataSchema.parse(response.data);
                const isSuccess = resp.status === 200 || resp.status === 'success' || resp.success;
                const listData = Array.isArray(resp.data)
                    ? resp.data
                    : (resp.data?.list && Array.isArray(resp.data.list) ? resp.data.list : []);

                const parsedList = (Array.isArray(listData) ? listData : []).map((item: any, idx: number) => {
                    try {
                        return FundTransferItemSchema.parse(item);
                    } catch (e) {
                        return {
                            id: Number(item.id || 0),
                            id_uuid: String(item.id_uuid || item.uuid || item.id || `item_${idx}`),
                            channel: String(item.channel || ''),
                            form_id: String(item.form_id || ''),
                            uuid_apply: String(item.uuid_apply || ''),
                            allocate_barcode_text: String(item.allocate_barcode_text || item.product_name || ''),
                            decisionStatus: Number(item.decisionStatus || 0),
                            row_measure_val: Number(item.row_measure_val || item.quantity || 0),
                            row_unit: String(item.row_unit || ''),
                            apply_No: String(item.apply_No || item.apply_no || item.memberID || ''),
                            apply_Name: String(item.apply_Name || item.apply_name || ''),
                            apply_Department: String(item.apply_Department || item.apply_department || ''),
                            apply_Time: item.apply_Time || item.apply_time || null,
                            reason: String(item.reason || ''),
                            product_name: String(item.product_name || item.allocate_barcode_text || ''),
                            specification: String(item.specification || '')
                        } as FundTransferItem;
                    }
                });

                const totalCount = typeof resp.total === 'number' && resp.total > 0
                    ? resp.total
                    : (resp.data?.total ?? parsedList.length);

                if (isSuccess) {
                    setData(prev => JSON.stringify(prev) === JSON.stringify(parsedList) ? prev : parsedList);
                    setTotal(prev => prev === totalCount ? prev : totalCount);
                    return;
                } else {
                    throw new Error('伺服器回傳狀態異常');
                }
            } catch (error: any) {
                attempt++;
                if (attempt > maxRetries) {
                    console.error(`抓取退料審核資料失敗 (已進行 ${maxRetries} 次重試):`, error.message);
                    Message('error', '連線異常', `抓取資料失敗: ${error.message || '網路連線異常'}`);
                    return;
                }

                const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
                console.warn(`抓取資料異常 (${error.message})，將於 ${backoffDelay}ms 後進行重試...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            } finally {
                setLoading(false);
            }
        }
    };

    const handleSearch = () => {
        setPage(1);
        pageRef.current = 1;
        void fetchData();
    };

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
            socketRef.current = io(`${apiBaseUrl}/Ingredients`, {
                transports: ['websocket', 'polling'],
                withCredentials: true,
                query: { roomKey }
            });
        }

        const socket = socketRef.current;

        const handleConnect = () => {
            console.log('已連接到 Ingredients 命名空間 socket', socket.id);
            socket.emit('joinRoom', roomKey);
            joinRoomRef.current = true;
            void fetchData();
        };

        const handleGetData = () => {
            console.log('收到 socket 廣播 Ingredients:fundTransfer:getData，重新載入資料');
            void fetchData();
        };

        const handleDisconnect = () => {
            console.log('socket 已中斷連線');
            joinRoomRef.current = false;
        };

        socket.on('connect', handleConnect);
        socket.on('Ingredients:fundTransfer:getData', handleGetData);
        socket.on('disconnect', handleDisconnect);

        if (socket.connected) {
            handleConnect();
        }

        return () => {
            socket.off('connect', handleConnect);
            socket.off('Ingredients:fundTransfer:getData', handleGetData);
            socket.off('disconnect', handleDisconnect);
        };
    }, [show, apiBaseUrl, roomKey, userNumber]);

    const submitFundApproveItems = async (items: FundTransferItem[], decisionVal: number, maxRetries = 3, initialDelay = 1000) => {
        if (items.length === 0) {
            Message('warning', '提醒', '沒有可執行的審核項目！');
            return;
        }

        if (!userNumber || !userName) {
            Message('warning', '驗證錯誤', '無法抓取當前審核人員工號或姓名，請重新登入系統！');
            return;
        }

        const invalidItems = items.filter(item => !item.id_uuid && !item.id);
        if (invalidItems.length > 0) {
            Message('warning', '資料缺失', `共有 ${invalidItems.length} 筆項目缺失關鍵識別碼 (ID/UUID)，無法送出審核！`);
            return;
        }

        const rawPayload = items.map(item => {
            const itemKey = item.id_uuid || String(item.id);
            const finalDecision = decisions[itemKey] !== undefined ? Number(decisions[itemKey]) : decisionVal;
            return {
                id: item.id,
                id_uuid: item.id_uuid,
                uuid_apply: item.uuid_apply,
                form_id: item.form_id,
                channel: item.channel,
                decisionStatus: finalDecision,
                decisionEmpNo: userNumber,
                decisionEmpName: userName,
                row_measure_val: item.row_measure_val ?? 0,
                decisionEmpTime: moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
                rejectReason: finalDecision === 2 ? (item.reason || '') : ''
            };
        });

        const validatedPayload = {
            roomKey,
            ...ApprovePayloadSchema.parse({ items: rawPayload })
        };

        let attempt = 0;
        while (attempt <= maxRetries) {
            try {
                setLoading(true);
                const response: any = await axios.post(`${apiBaseUrl}/ingredients/authPart/sendFundApproveAction`, validatedPayload);

                let isSuccess = response.status === 200 || response.data?.success || Number(response.data?.status) === 200;

                if (isSuccess) {
                    emitWithAck<void>('Ingredients:fundTransfer:getData', {
                        roomKey,
                        status: 200,
                        data: '',
                        message: '成功'
                    }).catch((err) => console.warn('Socket broadcast 廣播通知警告:', err));

                    Message('success', '成功', `已成功送出 ${items.length} 筆退料審核！`);
                    setDecisions({});
                    setSelectedIds([]);
                    setLoading(false);
                    void fetchData();
                    return;
                } else {
                    throw new Error(response.data?.message || '伺服器回傳狀態失敗');
                }
            } catch (error: any) {
                setLoading(false);
                attempt++;
                if (attempt > maxRetries) {
                    Message('error', '錯誤', `送出失敗: ${error.message || '網路不穩請重新嘗試'}`);
                    return;
                }
                const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }
    };

    const handleSubmit = async () => {
        const decidedItems = data.filter(item => {
            const itemKey = item.id_uuid || String(item.id);
            return decisions[itemKey] === '1' || decisions[itemKey] === '2';
        });
        if (decidedItems.length === 0) {
            Message('warning', '提醒', '請先選擇項目並設定審核結果（同意或駁回）！');
            return;
        }

        if (!userNumber || !userName) {
            Message('warning', '驗證錯誤', '無法抓取當前審核人員工號或姓名，請重新登入系統！');
            return;
        }

        const invalidItems = decidedItems.filter(item => !item.id_uuid && !item.id);
        if (invalidItems.length > 0) {
            Message('warning', '資料缺失', `共有 ${invalidItems.length} 筆待送出項目缺失關鍵識別碼 (ID/UUID)，無法送出審核！`);
            return;
        }

        const rawPayload = decidedItems.map(item => {
            const itemKey = item.id_uuid || String(item.id);
            return {
                id: item.id,
                id_uuid: item.id_uuid,
                uuid_apply: item.uuid_apply,
                form_id: item.form_id,
                channel: item.channel,
                decisionStatus: Number(decisions[itemKey]),
                decisionEmpNo: userNumber,
                decisionEmpName: userName,
                decisionEmpTime: moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
                rejectReason: decisions[itemKey] === '2' ? (item.reason || '') : ''
            };
        });

        const validatedPayload = ApprovePayloadSchema.parse({ items: rawPayload });
        if (!validatedPayload.items || validatedPayload.items.length === 0) {
            Message('error', '驗證失敗', '資料格式驗證失敗，無法組成有效 Payload');
            return;
        }
        await submitFundApproveItems(decidedItems, Number(decisions[decidedItems[0].id_uuid || String(decidedItems[0].id)]));
    };

    const handleClearAllDecisions = () => {
        setDecisions({});
        setSelectedIds([]);
    };

    const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

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

    const agreeCount = Object.values(decisions).filter(v => v === "1").length;
    const rejectCount = Object.values(decisions).filter(v => v === "2").length;
    const totalDecidedCount = agreeCount + rejectCount;

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

    const formatApplyTime = (timeVal: any) => {
        if (!timeVal) return '-';
        const m = moment(timeVal);
        if (!m.isValid()) return String(timeVal);
        return m.tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
    };

    // 同意所有退料
    const agreeAll = async () => {
        if (!data || data.length === 0) return;
        const newDecisions: Record<string, string> = {};
        data.forEach(item => {
            const itemKey = item.id_uuid || String(item.id);
            newDecisions[itemKey] = "1";
        });
        setDecisions(newDecisions);
        setSelectedIds(data.map(item => item.id_uuid || String(item.id)));
        await submitFundApproveItems(data, 1);
    };

    // 不同意所有退料
    const rejectAll = async () => {
        if (!data || data.length === 0) return;
        const newDecisions: Record<string, string> = {};
        data.forEach(item => {
            const itemKey = item.id_uuid || String(item.id);
            newDecisions[itemKey] = "2";
        });
        setDecisions(newDecisions);
        setSelectedIds(data.map(item => item.id_uuid || String(item.id)));
        await submitFundApproveItems(data, 2);
    };
    const clearAll = () => {
        setDecisions({});
        setSelectedIds([]);
    }

    return (
        <>
            {show && (
                <Modal show={show} onHide={handleCloseModal} centered={centered} size="xl" backdrop="static">
                    <Modal.Header closeButton>
                        <Modal.Title className="title_Albert">退料審核</Modal.Title>
                    </Modal.Header>
                    <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                        <div className="p-3">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', position: 'relative', zIndex: 1050 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '180px' }}>
                                    <label>起始日期</label>
                                    <DatePicker
                                        isClearable
                                        selected={dateRange.startDate}
                                        onChange={(date: Date | null) => setDateRange(prev => ({ ...prev, startDate: date }))}
                                        dateFormat="yyyy/MM/dd"
                                        className="form-control form-control-sm"
                                        popperProps={{ style: { zIndex: 99999 } }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '180px' }}>
                                    <label>結束日期</label>
                                    <DatePicker
                                        isClearable
                                        selected={dateRange.endDate}
                                        onChange={(date: Date | null) => setDateRange(prev => ({ ...prev, endDate: date }))}
                                        dateFormat="yyyy/MM/dd"
                                        className="form-control form-control-sm"
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
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '15px',
                                marginBottom: '15px',
                                position: 'relative',
                                zIndex: 1050,
                                justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'row', gap: '5px' }}>
                                    <div style={{ marginRight: '10px', fontWeight: 'bold', color: 'green' }}>
                                        同意：{Object.keys(decisions).filter(key => decisions[key] === "1").length} 筆
                                    </div>
                                    <div style={{ marginRight: '10px', fontWeight: 'bold', color: 'red' }}>
                                        不同意：{Object.keys(decisions).filter(key => decisions[key] === "2").length} 筆
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button onClick={agreeAll} className="btn btn-success btn-sm">同意所有</button>
                                    <button onClick={rejectAll} className="btn btn-danger btn-sm">不同意所有</button>
                                    <button onClick={clearAll} className="btn btn-outline-secondary btn-sm">清除所有</button>
                                </div>
                            </div>

                            {loading ? (
                                <div className="text-center py-5">
                                    <Spinner animation="border" variant="primary" role="status" />
                                    <div className="mt-2 text-muted">資料載入中...</div>
                                </div>
                            ) : data.length === 0 ? (
                                <div className="text-center text-muted py-5 border rounded bg-light">
                                    目前尚無待審核之退料申請
                                </div>
                            ) : (
                                data.map((item: FundTransferItem, idx: number) => {
                                    const itemKey = item.id_uuid || (item.id ? String(item.id) : `fund_${idx}`);
                                    return (
                                        <Table
                                            key={itemKey}
                                            bordered
                                            hover
                                            className="mb-3 text-center align-middle"
                                            style={{ whiteSpace: 'nowrap' }}
                                            responsive
                                        >
                                            <tbody>
                                                <tr>
                                                    <td>退料部門</td>
                                                    <td colSpan={2}>{item.apply_Department || '-'}</td>
                                                    <td>申請人姓名</td>
                                                    <td>{item.apply_Name || '-'}</td>
                                                    <td>申請人工號</td>
                                                    <td>{item.apply_No || '-'}</td>
                                                    <td>物料編號</td>
                                                    <td>{item.allocate_barcode_text || '-'}</td>
                                                </tr>
                                                <tr>
                                                    <td>物料名稱</td>
                                                    <td colSpan={2}>{item.product_name || item.allocate_barcode_text || '-'}</td>
                                                    <td>產品規格</td>
                                                    <td>{item.specification || '-'}</td>
                                                    <td>退料數量</td>
                                                    <td>{item.row_measure_val ?? '-'} ({item.row_unit || ''})</td>
                                                    <td>功能</td>
                                                    <td style={{ width: "120px" }}>
                                                        <Form.Select
                                                            value={decisions[itemKey] || ""}
                                                            onChange={(e) => {
                                                                handleDecisionChange(itemKey, e.target.value);
                                                            }}
                                                            style={{
                                                                width: "100%",
                                                                backgroundColor: decisions[itemKey] === "1" ? "#28a745" : decisions[itemKey] === "2" ? "#dc3545" : "inherit",
                                                                color: decisions[itemKey] ? "#ffffff" : "inherit",
                                                                fontWeight: decisions[itemKey] ? "bold" : "normal"
                                                            }}
                                                        >
                                                            <option value="" style={{ color: "#333", backgroundColor: "#fff" }}>功能</option>
                                                            <option value="1" style={{ color: "#28a745", backgroundColor: "#fff" }}>同意</option>
                                                            <option value="2" style={{ color: "#dc3545", backgroundColor: "#fff" }}>駁回</option>
                                                        </Form.Select>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>退料原因</td>
                                                    <td colSpan={6}>
                                                        <Form.Control
                                                            as="textarea"
                                                            rows={2}
                                                            value={item.reason || ""}
                                                            readOnly
                                                            className="text-start"
                                                            style={{ backgroundColor: "#f8f9fa", border: "1px solid #dee2e6", textAlign: "left" }}
                                                        />
                                                    </td>
                                                    <td>退料申請時間</td>
                                                    <td colSpan={1}>{formatApplyTime(item.apply_Time)}</td>
                                                </tr>
                                            </tbody>
                                        </Table>
                                    );
                                })
                            )}
                        </div>
                    </Modal.Body>
                    <Modal.Footer className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div style={{ display: loading || total === 0 ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: '8px' }}>
                            <div style={{ fontSize: '14px', color: '#555', display: 'flex', alignItems: 'center', gap: '2px' }}>
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

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                <Pagination size="sm" className="mb-0">
                                    <Pagination.First onClick={() => setPage(1)} disabled={page <= 1} />
                                    <Pagination.Prev onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1} />
                                    {pageItems}
                                    <Pagination.Next onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} />
                                    <Pagination.Last onClick={() => setPage(totalPages)} disabled={page >= totalPages} />
                                </Pagination>
                                <Button
                                    variant="primary"
                                    onClick={() => void handleSubmit()}
                                    disabled={loading || totalDecidedCount === 0}
                                    style={{ fontWeight: 'bold' }}
                                >
                                    {loading ? <Spinner animation="border" size="sm" /> : `送出審核 (${totalDecidedCount} 筆)`}
                                </Button>
                                <Button variant="secondary" onClick={handleCloseModal}>
                                    關閉
                                </Button>
                            </div>
                        </div>
                    </Modal.Footer>
                </Modal>
            )}

            <MessagePopup
                show={messagePopup.show}
                type={messagePopup.type}
                title={messagePopup.title}
                message={messagePopup.message}
                autoClose={messagePopup.autoClose}
                autoCloseDelay={messagePopup.autoCloseDelay}
                onHide={() => {
                    setMessagePopup(MessagePopupStateSchema.parse({}));
                }}
            />
        </>
    );
};

export default React.memo(FundTransfer);
