import React, { useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button, Table, Form, Pagination } from "react-bootstrap";
import config from '../../../../config';

import { z } from 'zod'
import MessagePopup from '../../../../components/MessagePopup';
import moment from 'moment-timezone';
import { io, Socket } from "socket.io-client";
import axios from 'axios';

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";


interface RecordProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
}

export type socketAckResponse<T = unknown> = Omit<z.infer<typeof socketAckResponseSchema>, 'data'> & {
    data?: T;
};
export type TSocketAckResponse<T = unknown> = socketAckResponse<T>;

const socketAckResponseSchema = z.object({
    status: z.enum(['success', 'error']).default('success'),
    success: z.boolean(),
    message: z.union([z.string(), z.array(z.string())]).optional().default(''),
    data: z.any().optional(),
    error: z.string().optional().default('')
});

export const MessagePopupStateSchema = z.object({
    show: z.boolean().default(false),
    type: z.enum(["info", "success", "error", "warning"]).default("info"),
    title: z.string().default(""),
    message: z.string().default(""),
    autoClose: z.boolean().optional().default(false),
    autoCloseDelay: z.number().optional().default(3000),
});
export type MessagePopupState = z.infer<typeof MessagePopupStateSchema>;


export const auditItemDataSchema = z.object({
    id: z.coerce.string().default(''),
    id_uuid: z.coerce.string().default(''),
    channel: z.coerce.string().default(''),
    form_id: z.coerce.string().default(''),
    uuid_apply: z.coerce.string().default(''),
    allocate_barcode_text: z.coerce.string().default(''),
    decisionStatus: z.coerce.string().default(''),
    row_measure_val: z.coerce.string().default(''),
    row_unit: z.coerce.string().default(''),
    rejectReason: z.coerce.string().default(''),
    decisionEmpName: z.coerce.string().default(''),
    decisionEmpNo: z.coerce.string().default(''),
    decisionEmpTime: z.coerce.string().default(''),
    apply_No: z.coerce.string().default(''),
    apply_Name: z.coerce.string().default(''),
    apply_Department: z.coerce.string().default(''),
    apply_Time: z.coerce.string().default(''),
    reason: z.coerce.string().default(''),
    product_name: z.coerce.string().default(''),
    specification: z.coerce.string().default(''),
    product_itemcode: z.coerce.string().default(''),
});
export type AuditItemData = z.infer<typeof auditItemDataSchema>;

export const DataSchema = z.preprocess(
    (val) => (Array.isArray(val) ? { data: val } : val),
    z.object({
        data: z.array(auditItemDataSchema)
            .catch([])
            .transform((list) => list.filter((item) => item.channel === 'finish'))
            .default([]),
        message: z.string().optional().default(''),
        page: z.coerce.number().optional().default(1),
        pageSize: z.coerce.number().optional().default(10),
        status: z.union([z.number(), z.string()]).optional().default(200),
        success: z.boolean().optional().default(true),
        totalCount: z.coerce.number().optional().default(0),
        totalPages: z.coerce.number().optional().default(1),
    })
);
export type Data = z.infer<typeof DataSchema>;

export const JoinRoomSchema = z.boolean().default(false);
export type JoinRoomType = z.infer<typeof JoinRoomSchema>;


const now = new Date();
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
export const DateRangeSchema = z.object({
    startDate: z.coerce.date().nullable().optional().default(lastMonth),
    endDate: z.coerce.date().nullable().optional().default(now),
});
export type DateRange = z.infer<typeof DateRangeSchema>;



const Record: React.FC<RecordProps> = ({ show, onHide, centered }) => {
    const apiBaseUrl = config.apiBaseUrl;
    const [saveData, setSaveData] = useState<Data>(DataSchema.parse({})) // 裝取所有 data 資訊於 list 當中
    const [loading, setLoading] = useState<boolean>(false)
    const [page, setPage] = useState<number>(1);
    const [messagePopup, setMessagePopup] = useState<MessagePopupState>(MessagePopupStateSchema.parse({}))
    const socketRef = useRef<Socket | null>(null)
    const joinRoomRef = useRef<JoinRoomType>(JoinRoomSchema.parse(undefined));
    const roomKey = 'Ingredients_authRecord_management';
    const [dateRange, setDateRange] = useState<DateRange>(DateRangeSchema.parse({}))
    const [searchTransferNo, setSearchTransferNo] = useState<string>('');

    const joinRoom = useCallback(() => {
        const socket = socketRef.current;

        if (socket && socket.connected && !joinRoomRef.current) {
            socket.emit('joinRoom', roomKey);
            joinRoomRef.current = true;
        }
    }, [roomKey])

    const leaveRoom = useCallback(() => {
        const socket = socketRef.current;

        if (socket && joinRoomRef.current) {
            socket.emit('leaveRoom', roomKey);
            joinRoomRef.current = false;
        }
    }, [roomKey])

    const emitWithAck = useCallback(<T,>(eventName: string, payload: Record<string, unknown>): Promise<TSocketAckResponse<T>> => {
        return new Promise<TSocketAckResponse<T>>((resolve, reject) => {
            const socket = socketRef.current;

            if (!socket || !socket.connected) {
                return reject(new Error('Socket not connected'));
            }

            const timeOutId = setTimeout(() => {
                reject(new Error(`Socket timeout: ${eventName}`));
            }, 10000);

            socket.emit(eventName, payload, (response: TSocketAckResponse<T>) => {

                try {
                    clearTimeout(timeOutId);
                    const result = socketAckResponseSchema.parse(response);
                    resolve(result);
                } catch (error) {
                    clearTimeout(timeOutId);
                    reject(error);
                    setMessagePopup(MessagePopupStateSchema.parse({
                        show: true,
                        type: 'error',
                        title: 'Error',
                        message: error.message,
                        autoClose: true,
                    }))
                }
            });
        });
    }, []);

    // 抓取資訊
    const fetchData = useCallback(async (page: number = 1, pageSize: number = 10) => {

        let payload = {
            page: page,
            pageSize: pageSize,
            startDate: dateRange.startDate ? moment(dateRange.startDate).format('YYYY-MM-DD') : '',
            endDate: dateRange.endDate ? moment(dateRange.endDate).format('YYYY-MM-DD') : '',
            searchInput: searchTransferNo,
        }

        try {
            setLoading(true)
            const apiResponse = await axios.get(`${apiBaseUrl}/ingredients/authPart/authDataSendBackRecord`, {
                params: payload
            })
            const parsedData = DataSchema.parse(apiResponse.data);
            setSaveData(prev => JSON.stringify(prev) === JSON.stringify(parsedData) ? prev : parsedData);

        }
        catch (error) {
            setMessagePopup(MessagePopupStateSchema.parse({
                show: true,
                type: 'error',
                title: 'Error',
                message: error.message,
                autoClose: true,
            }))
        } finally {
            setLoading(false)
        }
    }, [page, dateRange, searchTransferNo, apiBaseUrl])


    // 當 開啟 Modal 時自動抓取資料
    useEffect(() => {
        if (show) {
            void fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    // 連線For socket 監聽與抓取資訊
    useEffect(() => {
        if (!show || !apiBaseUrl) {
            if (socketRef.current) {
                leaveRoom();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return
        }

        if (!socketRef.current) {
            socketRef.current = io(`${apiBaseUrl}/Ingredients`, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,          // 最多嘗試重連 5 次
                reconnectionDelay: 1000,          // 每次重連間隔 1 秒
                reconnectionDelayMax: 5000,         // 重連間隔上限設為 5 秒
                randomizationFactor: 0.5,
            });

            const socket = socketRef.current;

            socket.on('connect', () => {
                joinRoom();
                void fetchData();
            })

            socket.on('disconnect', () => {
                joinRoomRef.current = false;
            })

            // 當按下 審核/不核准 時，會通知所有連線者重新抓取資料 (物料調撥)
            socket.on('Ingredients:fundTransfer:getData', () => {
                void fetchData();
            })
        }
    }, [show, roomKey, apiBaseUrl])

    const switchApplyStatus = (status: string) => {
        switch (status) {
            case 'approve': return (
                <div style={{ color: 'green' }}>核准</div>
            )
            case 'reject': return (
                <div style={{ color: 'red' }}>不核准</div>
            )
            case 'apply': return (
                <div>尚未完成審核</div>
            )
        }
    }

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        void fetchData(newPage);
    };

    const handleSearch = () => {
        setPage(1);
        void fetchData(1);
    };

    const totalPages = saveData?.totalPages || 1;
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
                onClick={() => handlePageChange(number)}
            >
                {number}
            </Pagination.Item>
        );
    }

    return (
        <>
            {
                messagePopup.show && (
                    <MessagePopup
                        show={messagePopup.show}
                        type={messagePopup.type}
                        title={messagePopup.title}
                        message={messagePopup.message}
                        autoClose={messagePopup.autoClose}
                        autoCloseDelay={messagePopup.autoCloseDelay}
                        onHide={() => setMessagePopup(MessagePopupStateSchema.parse({}))}
                    />
                )
            }
            {
                show && (
                    <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
                        <Modal.Header closeButton>
                            <Modal.Title className="title_Albert">審核紀錄</Modal.Title>
                        </Modal.Header>
                        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <div className="p-3" >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', flexWrap: 'wrap', position: 'relative', zIndex: 1050 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '180px', position: 'relative', zIndex: 1050 }}>
                                        <label>起始日期</label>
                                        <DatePicker
                                            isClearable
                                            selected={dateRange.startDate}
                                            onChange={(date: Date | null) => setDateRange(prev => ({ ...prev, startDate: date }))}
                                            dateFormat="yyyy/MM/dd"
                                            className="form-control form-control-sm"
                                            popperProps={{ strategy: 'fixed', style: { zIndex: 99999 } }}
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
                                            popperProps={{ strategy: 'fixed', style: { zIndex: 99999 } }}
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
                                <Table striped bordered hover responsive
                                    className="text-center align-middle text-nowrap"
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    <thead className="table-light">
                                        <tr>
                                            <th>申請狀態</th>
                                            <th>入倉編碼號</th>
                                            <th>申請部門</th>
                                            <th>物料名稱</th>
                                            <th>產品規格</th>
                                            <th>數量</th>
                                            <th>單位</th>
                                            <th>駁回原因</th>
                                            <th>審核人員</th>
                                            <th>審核時間</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {saveData?.data && saveData.data.length > 0 ? (
                                            saveData.data.map((item, index) => (
                                                <tr key={item.id_uuid || index}>
                                                    <td>{switchApplyStatus(item.decisionStatus ?? '0')}</td>
                                                    <td>{item.allocate_barcode_text}</td>
                                                    <td>{item.apply_Department}</td>
                                                    <td>{item.product_name}</td>
                                                    <td>{item.specification}</td>
                                                    <td>{item.row_measure_val}</td>
                                                    <td>{item.row_unit}</td>
                                                    <td>{item.reason}</td>
                                                    <td>{`${item.decisionEmpNo} (${item.decisionEmpName})`}</td>
                                                    <td>{item.decisionEmpTime ? moment(item.decisionEmpTime).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm') : ''}</td>
                                                </tr>
                                            ))
                                        ) :
                                            (
                                                <tr>
                                                    <td colSpan={10} className="text-center text-muted py-4">
                                                        目前尚無審核紀錄
                                                    </td>
                                                </tr>
                                            )
                                        }
                                    </tbody>
                                </Table>
                            </div>
                        </Modal.Body>
                        <Modal.Footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '14px', color: '#666' }}>
                                共 {saveData?.totalCount || 0} 筆資料 (第 {page} / {totalPages} 頁)
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Pagination size="sm" className="mb-0">
                                    <Pagination.First onClick={() => handlePageChange(1)} disabled={page <= 1} />
                                    <Pagination.Prev onClick={() => handlePageChange(Math.max(1, page - 1))} disabled={page <= 1} />
                                    {pageItems}
                                    <Pagination.Next onClick={() => handlePageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} />
                                    <Pagination.Last onClick={() => handlePageChange(totalPages)} disabled={page >= totalPages} />
                                </Pagination>
                                <Button variant="secondary" onClick={onHide}>
                                    關閉
                                </Button>
                            </div>
                        </Modal.Footer>
                    </Modal>
                )
            }
        </>
    );
};

export default React.memo(Record);
