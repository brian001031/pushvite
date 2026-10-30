import React, { useCallback, useState, useEffect, useRef } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import { io } from 'socket.io-client' // 引入 Socket 型別
import moment from 'moment-timezone'
import { Select, MenuItem } from "@mui/material";
import { options } from "@fullcalendar/core/preact.js";
import axios from "axios";
import config from "../../../../config";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import MessagePopup from "../../../../components/MessagePopup";

interface ReceivedMaterialRequestProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
}

type socketAckResponse<T> = {
    status: 'success' | 'error',
    success: boolean,
    message?: string | string[]
    data?: T,
    error?: string,
}

const ReceivedMaterialRequest: React.FC<ReceivedMaterialRequestProps> = ({ show, onHide, centered }) => {

    const apiBaseUrl = config.apiBaseUrl
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const [messagePopup, setMessagePopup] = useState<{
        show: boolean;
        type: string;
        title: string;
        message: string;
        autoClose?: boolean;
        autoCloseDelay?: number;
    }>({
        show: false,
        type: 'info', // 'success', 'error', 'warning', 'info'
        title: '',
        message: '',
        autoClose: false,
        autoCloseDelay: 3000
    });

    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState<number>(10);
    const [totalPage, setTotalPage] = useState(1)
    const [searchKey, setSearchKey] = useState<string>('')

    const [data, setData] = useState() as any // 抓取調料申請
    const [searchStartDate, setSearchStartDate] = useState(moment().subtract(1, 'months').tz("Asia/Taipei").startOf('day').toDate()) as any // 搜尋開始時間
    const [searchEndDate, setSearchEndDate] = useState(moment().tz("Asia/Taipei").endOf('day').toDate()) as any // 搜尋結束時間
    const [selectPositionArea, setSelectPositionArea] = useState<string>('') // 選擇區域

    const userRef = useRef(user)
    const socketRef = React.useRef<ReturnType<typeof io> | null>(null)
    const joinedRoomRef = useRef<boolean>(false)
    userRef.current = user

    useEffect(() => {
        if (!show) return;
        const rawPos = user.positionarea || user.positionArea;
        if (!rawPos) return;

        let areaList: string[] = [];
        if (Array.isArray(rawPos)) {
            areaList = rawPos;
        } else if (typeof rawPos === 'string') {
            try {
                const parsed = JSON.parse(rawPos);
                if (Array.isArray(parsed)) {
                    areaList = parsed;
                } else if (typeof parsed === 'string') {
                    areaList = parsed.split(',');
                }
            } catch {
                areaList = rawPos.replace(/[\[\]'"]/g, '').split(',');
            }
        }

        const cleanedArea = areaList.map(s => String(s).trim()).filter(Boolean).join(',');
        console.log('areaCheck', cleanedArea);
        setSelectPositionArea(cleanedArea);
    }, [show]);

    const roomKey = 'Ingredients_ReceivedRequest_room'


    const userNumber = user.memberID || ''
    userRef.current = userNumber

    const joinRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connect) return
        if (!joinedRoomRef.current) {
            socket.emit('joinRoom', roomKey);
            joinedRoomRef.current = true;
            console.log('加入房間', roomKey)
        }
    }, [roomKey])

    const leaveRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return
        if (joinedRoomRef.current) {
            socket.emit('leaveRoom', roomKey);
            joinedRoomRef.current = false;
            console.log('離開房間', roomKey)
        }
    }, [roomKey])

    const emitWithAck = useCallback(<T,>
        (eventName: string, payload: any)
        : Promise<socketAckResponse<T>> => {

        const socket = socketRef.current;
        if (!socket || !socket.connected) {
            setMessagePopup({
                show: true,
                type: 'error',
                title: '連線錯誤',
                message: '請重新整理頁面。',
                autoClose: true
            })
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


    const fetchDataRef = useRef<Function>();

    // 抓取畫面總資料
    const fetchData = useCallback(async (
        findPage?: number,
    ) => {
        const currentPage = findPage ? findPage : page;
        const memberNo = user.memberID ?? user.memberNo ?? '';

        const findKeyWord = searchKey ?? '';

        const payload = {
            memberNo: memberNo,
            startTime: searchStartDate,
            endTime: searchEndDate,
            page: currentPage ?? 1,
            pageSize: pageSize ?? 10,
            findWord: String(findKeyWord).trim()
        };

        try {
            const response = await emitWithAck<any>(
                'Ingredients:getReceivedMaterialRequest',
                payload
            );

            if (response && response.data) {
                setPage(response.data.page ?? 1);
                setTotalPage(response.data.totalPages ?? 1);

                let finalReceivedData = response.data.data?.data ?? response.data.data;
                const nextData = Array.isArray(finalReceivedData) ? finalReceivedData : [];
                setData(prev => JSON.stringify(prev) === JSON.stringify(nextData) ? prev : nextData);
            } else {
                setData(prev => prev.length === 0 ? prev : []);
            }

        } catch (error: any) {
            if (error?.message?.includes('socket has been disconnected') || error?.message?.includes('Socket is not connected')) {
                console.log('Socket 連線已關閉或中斷，清除畫面資料');
            } else {
                console.error('getReceivedMaterialRequest error:', error);
            }
            setData([]);
        }

    }, [emitWithAck, page, searchKey, searchStartDate, searchEndDate, user.memberID, user.memberNo, pageSize]);

    fetchDataRef.current = fetchData;

    useEffect(() => {

        if (!show || !apiBaseUrl || !roomKey) {
            leaveRoom()
            socketRef.current?.disconnect()
            socketRef.current = null;
            console.log('已關閉Socket')
            return;
        }

        if (show && !socketRef.current) {
            const socket = io(`${apiBaseUrl}/Ingredients`, {
                transports: ['websocket', 'polling'],
                withCredentials: true,
                query: {
                    roomKey
                },
            });
            socketRef.current = socket;


            socket.on('connect', () => {
                console.log('Socket 連線成功');
                joinedRoomRef.current = true;
                joinRoom();
                fetchDataRef.current?.();
            })

            socket.on('disconnect', () => {
                console.log('Socket 已斷線')
                joinedRoomRef.current = false;
                socketRef.current = null;
            })

            socket.on('applyApprove', () => {
                fetchDataRef.current?.();
            })

        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                joinedRoomRef.current = false;
                console.log('組件卸載/狀態變更，已自動清理 Socket 連線');
            }
        }
    }, [show, roomKey, joinRoom, leaveRoom, apiBaseUrl, selectPositionArea])


    const handleSend = async () => {

        let sendToBackend = []

        if (data.length === 0) {
            setMessagePopup({
                show: true,
                type: 'error',
                title: '錯誤',
                message: '沒有資料可以確認。',
                autoClose: true,
                autoCloseDelay: 3000
            })
            return;
        }
        else {
            const filteredData = data.filter((item: any) => item.optionSelect === 'approve' || item.optionSelect === 'reject');
            console.log('filteredData', filteredData)
            sendToBackend = filteredData.map((item: any) => (
                {
                    uuid: item.uuid,
                    decisionStatus: item.optionSelect ?? '',
                    decisionEmpName: user.reg_schedulename ?? '',
                    decisionEmpNo: user.memberID ?? '',
                    decisionEmpTime: moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
                    row_measure_val: item.row_measure_val ?? 0,
                    row_unit: item.row_unit ?? '',
                    uuid_apply: item.uuid_apply ?? '',
                }));

            if (sendToBackend.length === 0) {
                setMessagePopup({
                    show: true,
                    type: 'error',
                    title: '錯誤',
                    message: '沒有資料可以確認。',
                    autoClose: true,
                    autoCloseDelay: 3000
                })
                return;
            }
            else {

                // console.log('確認sendToBackend', sendToBackend)
                const response = await axios.post(`${apiBaseUrl}/ingredients/postForChangeApply`, {
                    payload: sendToBackend,
                    roomName: roomKey
                });

                const resData = response?.data;

                if (resData?.status === '200' || resData?.success === true || resData?.data?.status === '200') {
                    setMessagePopup({
                        show: true,
                        type: 'success',
                        title: '成功',
                        message: '確認成功。',
                        autoClose: true,
                        autoCloseDelay: 3000
                    })
                    onHide();
                    fetchDataRef.current?.();
                } else {
                    setMessagePopup({
                        show: true,
                        type: 'error',
                        title: '錯誤',
                        message: resData?.message || '確認失敗。',
                        autoClose: true,
                        autoCloseDelay: 3000
                    })
                }
            }
        }

        console.log('sendToBackend', sendToBackend);

    }

    const handleSelectChange = (uuid: string, changeType: string) => {
        console.log('handleSelectChange 被按下去摟', uuid, changeType);
        setData((prevData: any) => {
            if (!Array.isArray(prevData)) return prevData;
            return prevData.map((item: any) => {
                const targetKey = item.uuid || item.id_uuid || item.id;
                if (targetKey === uuid) {
                    return { ...item, optionSelect: changeType };
                }
                return item;
            });
        });
    };

    const handleBatchSelectChange = (changeType: string) => {
        console.log('handleBatchSelectChange 切換全部為', changeType);
        setData((prevData: any) => {
            if (!Array.isArray(prevData)) return prevData;
            return prevData.map((item: any) => ({
                ...item,
                optionSelect: changeType
            }));
        });
    };


    return (
        <>
            {
                messagePopup.show && <MessagePopup
                    show={messagePopup.show}
                    type={messagePopup.type}
                    title={messagePopup.title}
                    message={messagePopup.message}
                    autoClose={messagePopup.autoClose}
                    autoCloseDelay={messagePopup.autoCloseDelay}
                    onHide={() => setMessagePopup({ show: false, type: 'info', title: '', message: '', autoClose: false, autoCloseDelay: 3000 })}
                />
            }
            {
                show && !messagePopup.show &&
                (
                    <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static" >
                        <Modal.Header closeButton>
                            <Modal.Title className="title_Albert">收到之調料申請</Modal.Title>
                        </Modal.Header>
                        <Modal.Body>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', flexWrap: 'wrap', position: 'relative', zIndex: 1050 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '180px', position: 'relative', zIndex: 1050 }}>
                                    <label>起始日期</label>
                                    <DatePicker
                                        isClearable
                                        selected={searchStartDate}
                                        onChange={(date: Date | null) => setSearchStartDate(date)}
                                        dateFormat="yyyy/MM/dd"
                                        className="form-control"
                                        popperProps={{ style: { zIndex: 99999 } }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '180px', position: 'relative', zIndex: 1050 }}>
                                    <label>結束日期</label>
                                    <DatePicker
                                        isClearable
                                        selected={searchEndDate}
                                        onChange={(date: Date | null) => setSearchEndDate(date)}
                                        dateFormat="yyyy/MM/dd"
                                        className="form-control"
                                        popperProps={{ style: { zIndex: 99999 } }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', width: '180px' }}>
                                    <label>依產品品名搜索</label>
                                    <input
                                        type="text"
                                        className="form-control" style={{ border: 'solid 1px #aeaeb6ff' }}
                                        onChange={(e) => setSearchKey(e.target.value)}
                                        value={searchKey}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                fetchData();
                                            }
                                        }}
                                        onBlur={(e) => {
                                            if (e.target.value !== '') {
                                                fetchData();
                                            }
                                        }}
                                    ></input>
                                </div>

                                {/* 批次/全選快速操作按鈕區 */}
                                <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 'auto' }}>
                                    <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>批次全選變更</label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <Button
                                            variant="success"
                                            size="sm"
                                            className="fw-bold"
                                            onClick={() => handleBatchSelectChange('approve')}
                                        >
                                            全部同意
                                        </Button>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            className="fw-bold"
                                            onClick={() => handleBatchSelectChange('reject')}
                                        >
                                            全部不同意
                                        </Button>
                                        <Button
                                            variant="outline-secondary"
                                            size="sm"
                                            onClick={() => handleBatchSelectChange('default')}
                                        >
                                            重置(未選擇)
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="table-responsive mb-3" style={{ overflow: 'auto', maxHeight: '60vh' }}>
                                <table className="table table-bordered table-sm text-center align-middle" style={{ width: '100%', whiteSpace: 'nowrap' }}>
                                    <colgroup>
                                        <col style={{ width: '170px' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '5%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                    </colgroup>
                                    <thead className="thead-dark" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <th style={{ minWidth: '170px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                    <span>操作</span>
                                                    <Form.Control
                                                        as="select"
                                                        size="sm"
                                                        style={{ fontSize: '0.75rem', padding: '2px 4px', textAlign: 'center', cursor: 'pointer', border: '1px solid #ced4da', borderRadius: '4px' }}
                                                        onChange={(e) => {
                                                            if (e.target.value) {
                                                                handleBatchSelectChange(e.target.value);
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                        defaultValue=""
                                                    >
                                                        <option value="" disabled hidden>-- 全選切換 --</option>
                                                        <option value="approve">全部同意</option>
                                                        <option value="reject">全部不同意</option>
                                                        <option value="default">全部未選擇</option>
                                                    </Form.Control>
                                                </div>
                                            </th>
                                            <th>物料QRcode</th>
                                            <th>產品品名</th>
                                            <th>產品規格</th>
                                            <th>預計調取數量</th>
                                            <th>單位</th>
                                            <th>申請調料單位</th>
                                            <th>申請調料人</th>
                                            <th>申請調料時間</th>
                                            <th>分配日期與時間</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data && data.length > 0 ? (
                                            data.map((item: any, index: number) => {
                                                const targetKey = item.uuid || item.id_uuid || item.id;
                                                const currentOption = item.optionSelect || 'default';

                                                return (
                                                    <tr key={targetKey || index}>
                                                        <td>
                                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                                                                <button
                                                                    type="button"
                                                                    className={`btn btn-sm rounded-pill px-2 py-1 ${currentOption === 'approve'
                                                                        ? 'btn-success text-white shadow-sm fw-bold'
                                                                        : 'btn-outline-success'
                                                                        }`}
                                                                    style={{
                                                                        fontSize: '0.8rem',
                                                                        transition: 'all 0.15s ease-in-out',
                                                                        borderWidth: '1.5px'
                                                                    }}
                                                                    onClick={() => handleSelectChange(targetKey, currentOption === 'approve' ? 'default' : 'approve')}
                                                                >
                                                                    ✓ 同意
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`btn btn-sm rounded-pill px-2 py-1 ${currentOption === 'reject'
                                                                        ? 'btn-danger text-white shadow-sm fw-bold'
                                                                        : 'btn-outline-danger'
                                                                        }`}
                                                                    style={{
                                                                        fontSize: '0.8rem',
                                                                        transition: 'all 0.15s ease-in-out',
                                                                        borderWidth: '1.5px'
                                                                    }}
                                                                    onClick={() => handleSelectChange(targetKey, currentOption === 'reject' ? 'default' : 'reject')}
                                                                >
                                                                    ✕ 不同意
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td>{item.allocate_barcode_text}</td>
                                                        <td>{item.product_name}</td>
                                                        <td>{item.specification}</td>
                                                        <td>{item.row_measure_val}</td>
                                                        <td>{item.row_unit}</td>
                                                        <td>{item.apply_Department || item.pickUp_Department}</td>
                                                        <td>{item.apply_Name || item.pickUp_Name}</td>
                                                        <td>{item.apply_Time ? moment(item.apply_Time).tz('Asia/Taipei').format('YYYY/MM/DD HH:mm:ss') : (item.pickUp_Time ? moment(item.pickUp_Time).tz('Asia/Taipei').format('YYYY/MM/DD HH:mm:ss') : '')}</td>
                                                        <td>{item.assign_datetime ? moment(item.assign_datetime).tz('Asia/Taipei').format('YYYY/MM/DD HH:mm:ss') : ''}</td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={10} className="text-center">目前沒有收到調料申請</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <div style={{ width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
                                <Button variant='primary' onClick={handleSend}>
                                    申請
                                </Button>
                                <Button variant="secondary" onClick={onHide}>
                                    關閉
                                </Button>
                            </div>

                        </Modal.Footer>
                    </Modal >
                )
            }
        </>
    );
};

export default React.memo(ReceivedMaterialRequest);
