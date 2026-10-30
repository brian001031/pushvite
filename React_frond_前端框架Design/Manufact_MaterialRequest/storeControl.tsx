import React, { useState, useEffect, useRef, useMemo, Suspense, useCallback } from "react";
import {
    Modal,
    Button,
    Form,
    Table,
    Pagination
} from 'react-bootstrap';
import moment from "moment";
import 'moment-timezone';
import config from '../../config';

import MessagePopup from '../../components/MessagePopup';

import { io } from 'socket.io-client';

const apiBaseUrl = config.apiBaseUrl;

type storeProperty = {
    id?: number | null;
    founder?: string | null;
    founderId?: string | null;
    foundTime?: string | null;
    edit_empName?: string | null;
    edit_empNumber?: string | null;
    edit_time?: string | null;
    nowStatus?: string | null;
    storeName?: string | null;
    otherMemo?: string | null;
    location?: string | null;
}


type storeControlProps = {
    show: boolean;
    onHide: () => void;
}

type socketAckResponse<T> = {
    status: 'success' | 'error'
    data?: T,
    message?: string,
    total?: number | string
}

type storeListResponse = {
    rows: storeProperty[],
    total: number,
    page: number,
    pageSize: number
}

type storeInnerData = storeProperty[] | null;

const transferIntoChinese = {
    storeName: '倉庫名稱',
    location: '倉位名稱',
    otherMemo: '其他備註',
    // id: 'id',
    // foundTime: '創建時間',
    // founder: '創建者',
    // founderId: '創建者ID',
    // edit_empName: '編輯者姓名',
    // edit_empNumber: '編輯者編號',
    // edit_time: '編輯時間',
    // nowStatus: '當前狀態',



}

const StoreControl: React.FC<storeControlProps> = (
    {
        show,
        onHide
    }
) => {


    const [user, setUser] = React.useState<any>(() => {
        const rawUser = localStorage.getItem('user');
        try {
            return rawUser ? JSON.parse(rawUser) : null;
        } catch (e) {
            return null;
        }
    });
    const [storeData, setStoreData] = React.useState<storeInnerData>([]);
    const [page, setPage] = React.useState<number>(1); // 當前頁籤
    const [searchKey, setSearchKey] = React.useState('');
    const [searchInput, setSearchInput] = React.useState('');
    const [pageInput, setPageInput] = React.useState<string>('1');
    const [pageSize, setPageSize] = React.useState<number>(10);
    const [total, setTotal] = React.useState<number>(0); // 用於紀錄所有頁數
    const [messagePopup, setMessagePopup] = React.useState<{
        show: boolean;
        onHide: () => void;
        type: 'success' | 'error' | 'warning' | 'info';
        title: string;
        message: string;
    }>();

    const [storeCreate, setStoreCreate] = useState<storeProperty | null>(null)
    const [editStoreDataList, setEditStoreDataList] = useState<storeProperty[]>([]);

    const [showPopup, setShowPopup] = useState<{
        add: boolean;
        edit: boolean;
    }>({ add: false, edit: false });

    const [editList, setEditList] = useState<string[]>([]);
    const [allChecked, setAllChecked] = useState(false);

    const handleOpen = (type: string) => {
        if (type === 'add') {
            setStoreCreate({
                founder: null,
                founderId: null,
                foundTime: null,
                edit_empName: null,
                edit_empNumber: null,
                edit_time: null,
                nowStatus: null,
                storeName: '',
                otherMemo: '',
                location: '',
            })
            setShowPopup({ ...showPopup, add: true });
        } else if (type === 'edit') {
            const selectedForEdit = (storeData ?? []).filter(item =>
                Array.isArray(editList) && editList.includes(String(item.id ?? ''))
            ).map(item => ({ ...item }));
            setEditStoreDataList(selectedForEdit);
            setShowPopup({ ...showPopup, edit: true });
        }
    }

    const handleClose = (type: string) => {
        if (type === 'add') {
            setShowPopup({ ...showPopup, add: false });
        } else if (type === 'edit') {
            setEditStoreDataList([]);
            setShowPopup({ ...showPopup, edit: false });
        }
    }

    // socket.io 相關 start

    const roomKey = `wareHouseManageRoom`
    const joinedRoomRef = useRef<boolean>(false);
    const userNo = user?.memberID ?? "0";
    const checkAuth = Number(user?.authStatus) !== 0 ? user?.authStatus : 0;
    const socketRef = React.useRef<ReturnType<typeof io> | null>(null);
    const pageRef = useRef<number>(page);
    const storeDataRef = useRef<storeInnerData>(storeData);
    const searchKeyRef = useRef<string>(searchKey);
    const pageInputRef = useRef<string>(pageInput);
    // socket.io 相關 end


    pageRef.current = page;
    storeDataRef.current = storeData;
    searchKeyRef.current = searchKey;
    pageInputRef.current = pageInput;


    const handleSearch = (e: React.KeyboardEvent<any> | React.FocusEvent<any>): void => {
        if (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') {
            return;
        }
        const normalizedKeyword = searchInput.trim();
        setSearchKey(normalizedKeyword);
        setPage(1);
    }

    const leaveWareHouseRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket) return;

        socket.emit('leaveRoom', roomKey)
        joinedRoomRef.current = false;
        console.log(`Left room: ${roomKey}`);

    }, [roomKey, socketRef])

    const handleAddStore = async (): Promise<void> => {
        if (!storeCreate) return;

        try {
            const data = {
                founder: user?.reg_schedulename,
                founderId: user?.memberID,
                foundTime: getTaipeiNow(),
                edit_empName: user?.reg_schedulename,
                edit_empNumber: user?.memberID,
                edit_time: getTaipeiNow(),
                nowStatus: 'alive',
                storeName: storeCreate?.storeName,
                otherMemo: storeCreate?.otherMemo,
                location: storeCreate?.location,
            } as storeProperty

            const response = await emitWithAck('warehouse:create:request', data);

            if (response.status === 'success') {
                setStoreCreate(null);
                handleClose('add');
                setMessagePopup({
                    type: 'success',
                    title: '成功',
                    message: response?.message || '新增成功',
                    show: true,
                    onHide: () => setMessagePopup(undefined),
                });
                await fetchWarehosData();

            } else {
                setMessagePopup({
                    type: 'error',
                    title: 'Error',
                    message: response?.message || '發生未知錯誤',
                    show: true,
                    onHide: () => setMessagePopup(undefined),
                });
            }


        } catch (error) {
            console.error("handleAddStore error:", error);

        } finally {
            handleClose('add');
            fetchWarehosData();
            setStoreCreate(null);
        }

    }


    // 通用socket回傳
    const emitWithAck = useCallback(<T,>(eventName: string, payload: Record<string, unknown>) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
            setMessagePopup({
                type: 'error',
                title: 'Error',
                message: 'Socket is not connected',
                show: true,
                onHide: () => setMessagePopup(undefined),
            });
            return Promise.reject(new Error('Socket is not connected'));
        }

        return new Promise<socketAckResponse<T>>((resolve, reject) => {
            socket.timeout(8000).emit(eventName, payload, (error: unknown, response: socketAckResponse<T>) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (response?.status === 'error') {
                    reject(new Error(response?.message || '發生未知錯誤'));
                    return;
                }
                resolve(response);
            });
        });
    }, [])

    const getTaipeiNow = () => {
        const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
        return now;
    }

    // 先socket 連接成功後觸發 , 用以省去使用者要手動重新整理畫面的問題
    const joinWareHouseRoom = useCallback(() => {
        const socket = socketRef.current;

        if (!socket) {
            console.error("Socket not connected before trying to join room")
            return;
        }
        if (joinedRoomRef.current) {
            return;
        }
        socket.emit('joinRoom', {
            authKey: `${checkAuth}-${userNo}`,
            room: roomKey
        })
        joinedRoomRef.current = true;
    }, [socketRef, joinedRoomRef, roomKey, checkAuth, userNo])


    // 離開 websocket 並斷開連接
    const disconnectSocket = useCallback(() => {
        leaveWareHouseRoom();
        socketRef?.current?.disconnect();
        socketRef.current = null;
        joinedRoomRef.current = false;
        pageRef.current = 1;
        storeDataRef.current = [];
    }, [leaveWareHouseRoom])


    // 初始抓取畫面資料
    const fetchWarehosData = useCallback(async (params?: { page?: number, keyword?: string }) => {
        const fetchPage = params?.page ?? page
        const fetchKeyword = params?.keyword ?? searchKey

        try {
            const response = await emitWithAck<storeListResponse | storeProperty[]>(
                'warehouse:list:request',
                {
                    roomKey,
                    page: fetchPage,
                    keyword: fetchKeyword,
                    pageSize: pageSize
                }
            )
            if (response.status === 'success' && response.data) {
                const listData = response.data;
                console.log('listData Check : ', listData)
                if (Array.isArray(listData)) {
                    setStoreData(listData);
                    setTotal(Number(response?.total) || listData.length || 0);
                } else {
                    setStoreData(listData.rows || null);
                    setTotal(Number(response.total) || listData.total || 0);
                }
            }
        } catch (error) {
            console.error('獲取倉庫數據失敗:', error);
        }

    }, [emitWithAck, roomKey, page, searchKey, pageSize])

    const totalPages = Math.ceil(total / pageSize) || 1;
    const pageItems: React.ReactNode[] = []
    const maxVisiblePages = 3

    if (totalPages <= maxVisiblePages) {
        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
            pageItems.push(
                <Pagination.Item
                    key={pageNumber}
                    active={page === pageNumber}
                    onClick={() => setPage(pageNumber)}
                >
                    {pageNumber}
                </Pagination.Item>
            )
        }
    } else {
        const lowerBound = Math.max(1, page - 1)
        const upperBound = Math.min(totalPages, page + 1)

        if (lowerBound > 1) {
            pageItems.push(
                <Pagination.Item key={1} active={page === 1} onClick={() => setPage(1)}>
                    1
                </Pagination.Item>
            )
            if (lowerBound > 2) {
                pageItems.push(
                    <Pagination.Ellipsis key="ellipsis-start" disabled />
                )
            }
        }
        for (let pageNumber = lowerBound; pageNumber <= upperBound; pageNumber++) {
            pageItems.push(
                <Pagination.Item key={pageNumber} active={page === pageNumber} onClick={() => setPage(pageNumber)}>
                    {pageNumber}
                </Pagination.Item>
            )
        }
        if (upperBound < totalPages) {
            if (upperBound < totalPages - 1) {
                pageItems.push(
                    <Pagination.Ellipsis key="ellipsis-end" disabled />
                )
            }
            pageItems.push(
                <Pagination.Item key={totalPages} active={page === totalPages} onClick={() => setPage(totalPages)}>
                    {totalPages}
                </Pagination.Item>
            )
        }
    }

    const fetchWarehosDataRef = useRef(fetchWarehosData);
    fetchWarehosDataRef.current = fetchWarehosData;



    const handleWareHouseEdit = async (): Promise<void> => {

        if (!user) {
            setMessagePopup({
                type: 'warning',
                title: '警告',
                message: '請先登入。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            })
            return;
        } else if (Number(user?.authStatus) < 1) {
            setMessagePopup({
                type: 'error',
                title: '錯誤',
                message: '您沒有權限進行此操作。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            })
            return;
        }

        // 1. 比對並篩選出真正有被修改的倉庫資料
        const modifiedItems = editStoreDataList.filter(editedItem => {
            const originalItem = (storeData ?? []).find(s => s.id === editedItem.id);
            if (!originalItem) return false;
            return (
                editedItem.storeName !== originalItem.storeName ||
                editedItem.location !== originalItem.location ||
                editedItem.otherMemo !== originalItem.otherMemo
            );
        });

        if (modifiedItems.length === 0) {
            setMessagePopup({
                type: 'warning',
                title: '提示',
                message: '沒有偵測到任何修改內容。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            });
            return;
        }

        const payload = modifiedItems.map(item => {
            const acc = Object.entries(item).reduce((res: Record<string, string>, [key, value]) => {
                res[key] = value !== null && value !== undefined ? String(value) : '';
                return res;
            }, {} as Record<string, string>);

            acc['edit_time'] = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
            acc['edit_empName'] = user?.reg_schedulename || '';
            acc['edit_empNumber'] = user?.memberID || '';
            acc['emp_id'] = user?.memberID || '';
            acc['emp_name'] = user?.reg_schedulename || '';

            return acc;
        });

        console.log('確認修改後的 payload : ', payload);

        // 2. 送出 Socket 請求到後端
        try {
            const response = await emitWithAck('warehouse:edit:request', { editPayload: payload });
            if (response.status === 'success') {
                setMessagePopup({
                    type: 'success',
                    title: '成功',
                    message: response?.message || '修改成功',
                    show: true,
                    onHide: () => setMessagePopup(undefined),
                });
                setShowPopup({ ...showPopup, edit: false });
                setEditList([]); // 清空選取狀態
                await fetchWarehosData();
            } else {
                setMessagePopup({
                    type: 'error',
                    title: '錯誤',
                    message: response?.message || '修改失敗',
                    show: true,
                    onHide: () => setMessagePopup(undefined),
                });
            }
        } catch (error) {
            console.error("handleWareHouseEdit error:", error);
            setMessagePopup({
                type: 'error',
                title: '錯誤',
                message: '伺服器連線失敗或逾時',
                show: true,
                onHide: () => setMessagePopup(undefined),
            });
        }

    }

    const handleWareHouseDelete = async (): Promise<void> => {


        if (editList.length === 0) {
            setMessagePopup({
                type: 'warning',
                title: '警告',
                message: '沒有選擇任何要刪除的項目。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            })
            return;
        } else if (!user) {
            setMessagePopup({
                type: 'warning',
                title: '警告',
                message: '請先登入。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            })
            return;
        } else if (Number(user?.authStatus) < 1) {
            setMessagePopup({
                type: 'error',
                title: '錯誤',
                message: '您沒有權限進行此操作。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            })
            return;
        }

        console.log('確認要刪除的資訊 與 現在的頁數 : ', editList, page)

        const deletePayload = {
            deleteIds: editList,
            room: roomKey,
            empId: user?.memberID || '',
            empName: user?.reg_schedulename || '',
        }
        const response = await emitWithAck('warehouse:delete:request', deletePayload);
        if (response.status === 'success') {
            setEditList([]);
            setPage(1);
            void fetchWarehosDataRef.current();
            setMessagePopup({
                type: 'success',
                title: '成功',
                message: '刪除成功。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            })
        } else {
            setMessagePopup({
                type: 'error',
                title: '錯誤',
                message: '刪除失敗。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            })
        }
    }

    useEffect(() => {
        if (show && socketRef.current?.connected) {
            void fetchWarehosData();
        }
    }, [page, searchKey, pageSize, show]);

    useEffect(() => {
        if (!show) {
            disconnectSocket();
            return;
        }

        if (!user || user?.authStatus === '0') {
            setMessagePopup({
                type: 'error',
                title: 'Error',
                message: '您沒有權限使用此功能。',
                show: true,
                onHide: () => setMessagePopup(undefined),
            })
            return;
        }

        const authKey = `${checkAuth}-${userNo}`

        const nextSocket = io(`${apiBaseUrl}/stock`, {
            transports: ['websocket', 'polling'],
            withCredentials: true,
            query: {
                room: roomKey
            },
            auth: {
                auth: authKey
            }
        })

        socketRef.current = nextSocket;

        const handleConnect = (): void => {
            void fetchWarehosDataRef.current()
            joinedRoomRef.current = false;
            joinWareHouseRoom()
        }

        const handleDisconnect = (): void => {
            console.log('Socket disconnected');
            joinedRoomRef.current = false;
            disconnectSocket()
        }

        const handleWarehouseUpdate = async (payload: any): Promise<void> => {
            console.log('🔄 Received wareHouseManageRoom:update broadcast:', payload);
            if (
                payload &&
                payload.status === 'success' &&
                payload.data &&
                pageRef.current === 1 &&
                searchKeyRef.current === ''
            ) {
                const listData = payload.data;
                if (Array.isArray(listData)) {
                    setStoreData(listData);
                    setTotal(listData.length);
                } else {
                    setStoreData(listData.rows || null);
                    setTotal(listData.total || 0);
                }
            } else {
                await fetchWarehosDataRef.current();
            }
        }


        setStoreCreate({
            founder: user?.reg_schedulename || '',
            founderId: user?.authId || '',
            foundTime: getTaipeiNow(),
            edit_empName: user?.reg_schedulename || '',
            edit_empNumber: user?.authId || '',
            edit_time: getTaipeiNow(),
            nowStatus: 'active',
            storeName: '',
            otherMemo: '',
            location: '',

        })

        const handleRoomJoined = (r: string): void => {
            console.log(` Socket 成功加入房間: ${r}`);
        }
        const handleRoomLeft = (r: string): void => {
            console.log(` Socket 成功離開房間: ${r}`);
        }

        nextSocket.on('connect', handleConnect);
        nextSocket.on('disconnect', handleDisconnect);
        nextSocket.on('roomJoined', handleRoomJoined);
        nextSocket.on('wareHouseManageRoom:update', handleWarehouseUpdate)
        nextSocket.on('wareHouseManageRoom:refresh', handleWarehouseUpdate)


        return () => {
            leaveWareHouseRoom();
            nextSocket.off('connect', handleConnect);
            nextSocket.off('disconnect', handleDisconnect);
            nextSocket.off('roomJoined', handleRoomJoined);
            nextSocket.off('wareHouseManageRoom:update', handleWarehouseUpdate)
            nextSocket.off('wareHouseManageRoom:refresh', handleWarehouseUpdate)
            nextSocket.disconnect();
            joinedRoomRef.current = false;
        }

    }, [show, roomKey, socketRef, pageRef, checkAuth, userNo, user])

    const handleSelect = (type: string, itemNo?: string | null) => {

        console.log('handleSelect 確認 itemNo :', itemNo)
        console.log('handleSelect 確認 type :', type)
        if (type === 'all') {
            if (allChecked === false) {
                const allIds = storeData?.map(item => String(item.id || '')) || [];
                console.log('確認 allIds 是啥資料  :', typeof allIds, allIds)
                setEditList(allIds);
                setAllChecked(true);
            } else {
                setEditList([]);
                setAllChecked(false);
            }

        } else if (type === 'only') {
            if (itemNo !== undefined && itemNo !== null) {
                if (editList.includes(itemNo)) {
                    setEditList(editList.filter(id => id !== itemNo));
                    setAllChecked(false);
                } else {
                    setEditList([...editList, itemNo]);
                }
            }
        }
    }

    return (
        <>
            <style>{`
                .store-table-container {
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
                    background-color: #ffffff;
                    margin-bottom: 1rem;
                }
                .store-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.9rem;
                    text-align: left;
                }
                .store-table th {
                    background-color: #f8fafc;
                    color: #475569;
                    font-weight: 600;
                    padding: 0.75rem 1rem;
                    border-bottom: 2px solid #e2e8f0;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    white-space: nowrap;
                    vertical-align: middle;
                }
                .store-table td {
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid #f1f5f9;
                    color: #334155;
                    vertical-align: middle;
                    white-space: nowrap;
                }
                .store-table tbody tr:last-child td {
                    border-bottom: none;
                }
                .store-table tbody tr {
                    transition: background-color 0.2s;
                }
                .store-table tbody tr:hover {
                    background-color: #f8fafc;
                }
                .store-table-empty {
                    text-align: center;
                    color: #94a3b8;
                    padding: 2.5rem 1rem !important;
                    font-style: italic;
                }
            `}</style>
            {
                messagePopup && messagePopup.show && (
                    <MessagePopup
                        show={messagePopup.show}
                        onHide={() => setMessagePopup(undefined)}
                        type={messagePopup.type}
                        title={messagePopup.title}
                        message={messagePopup.message}
                        autoClose={true}
                        autoCloseDelay={3000}
                    />
                )
            }
            {
                showPopup.add && (
                    <Modal
                        show={showPopup.add}
                        onHide={() => setShowPopup({ ...showPopup, add: false })}
                        centered
                        backdrop="static"
                        size="lg"
                    >
                        <Modal.Header closeButton>
                            <Modal.Title className="w-100">
                                <div
                                    className="text-center w-100"
                                    style={{ fontWeight: 'bold', fontSize: 'calc(1.3rem + 0.6vw)' }}
                                >
                                    新增倉位【Add Store】
                                </div>
                            </Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="px-2 px-md-4 py-2">
                                <Form id="addStoreForm">
                                    <Form.Group controlId="formStoreName" className="mb-3">
                                        <Form.Label className="fw-semibold">倉庫名稱【Store Name】</Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="請輸入倉位名稱"
                                            className="py-2"
                                            value={storeCreate?.storeName ?? ''}
                                            onChange={(e) => setStoreCreate(prev => prev ? { ...prev, storeName: (e.target as HTMLInputElement).value } : { storeName: (e.target as HTMLInputElement).value })}
                                        />
                                    </Form.Group>
                                    <Form.Group controlId="formLocation" className="mb-3">
                                        <Form.Label className="fw-semibold">倉位名稱【Location】</Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="請輸入倉位名稱"
                                            className="py-2"
                                            value={storeCreate?.location ?? ''}
                                            onChange={(e) => setStoreCreate(prev => prev ? { ...prev, location: (e.target as HTMLInputElement).value } : { location: (e.target as HTMLInputElement).value })}
                                        />
                                    </Form.Group>
                                    <Form.Group controlId="formOtherMemo" className="mb-3">
                                        <Form.Label className="fw-semibold">其他備註【Other Memo】</Form.Label>
                                        <Form.Control
                                            as="textarea"
                                            rows={3}
                                            placeholder="請輸入其他備註"
                                            className="py-2"
                                            value={storeCreate?.otherMemo ?? ''}
                                            onChange={(e) => setStoreCreate(prev => prev ? { ...prev, otherMemo: (e.target as HTMLTextAreaElement).value } : { otherMemo: (e.target as HTMLTextAreaElement).value })}
                                        />
                                    </Form.Group>
                                </Form>
                            </div>
                        </Modal.Body>
                        <Modal.Footer className="justify-content-center gap-2">
                            <Button
                                variant="secondary"
                                onClick={() => setShowPopup({ ...showPopup, add: false })}
                                className="px-4 py-2"
                            >
                                關閉【Close】
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleAddStore}
                                className="px-4 py-2"
                            >
                                新增【Add】
                            </Button>
                        </Modal.Footer>
                    </Modal>
                )
            }
            {
                showPopup.edit && (
                    <Modal
                        show={showPopup.edit}
                        onHide={() => handleClose('edit')}
                        centered
                        backdrop="static"
                        size="lg"
                    >
                        <Modal.Header closeButton>
                            <Modal.Title className="w-100">
                                <div
                                    className="text-center w-100"
                                    style={{ fontWeight: 'bold', fontSize: 'calc(1.3rem + 0.6vw)' }}
                                >
                                    修改倉庫資訊 【Edit Warehouse Info】
                                </div>
                            </Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="py-3">
                                <div className="store-table-container">
                                    <table className="store-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '30%' }}>倉庫名稱【Store Name】</th>
                                                <th style={{ width: '35%' }}>位置【Location】</th>
                                                <th style={{ width: '35%' }}>其他備註【Other Memo】</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {
                                                editStoreDataList.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={3} className="store-table-empty">
                                                            沒有選擇任何項目進行修改
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    editStoreDataList.map((item, index) => (
                                                        <tr key={item.id ?? index}>
                                                            <td>
                                                                <Form.Control
                                                                    type="text"
                                                                    value={item.storeName ?? ''}
                                                                    onChange={(e) => {
                                                                        const newVal = (e.target as HTMLInputElement).value;
                                                                        setEditStoreDataList(prev => prev.map((s, idx) => idx === index ? { ...s, storeName: newVal } : s));
                                                                    }}
                                                                    placeholder="請輸入倉庫名稱"
                                                                />
                                                            </td>
                                                            <td>
                                                                <Form.Control
                                                                    type="text"
                                                                    value={item.location ?? ''}
                                                                    onChange={(e) => {
                                                                        const newVal = (e.target as HTMLInputElement).value;
                                                                        setEditStoreDataList(prev => prev.map((s, idx) => idx === index ? { ...s, location: newVal } : s));
                                                                    }}
                                                                    placeholder="請輸入位置"
                                                                />
                                                            </td>
                                                            <td>
                                                                <Form.Control
                                                                    type="text"
                                                                    value={item.otherMemo ?? ''}
                                                                    onChange={(e) => {
                                                                        const newVal = (e.target as HTMLInputElement).value;
                                                                        setEditStoreDataList(prev => prev.map((s, idx) => idx === index ? { ...s, otherMemo: newVal } : s));
                                                                    }}
                                                                    placeholder="請輸入其他備註"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))
                                                )
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Modal.Body>
                        <Modal.Footer className="justify-content-center">
                            <Button
                                variant="secondary"
                                onClick={() => handleClose('edit')}
                                className="px-4 py-2 me-2"
                            >
                                關閉【Close】
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleWareHouseEdit}
                                className="px-4 py-2"
                            >
                                儲存【Save】
                            </Button>
                        </Modal.Footer>
                    </Modal>
                )
            }
            {
                !showPopup.add && !showPopup.edit && (
                    < Modal
                        show={true}
                        onHide={onHide}
                        centered
                        backdrop="static"
                        size="xl"
                    >
                        <Modal.Header closeButton>
                            <Modal.Title className="w-100">
                                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                                    <div
                                        style={{ fontWeight: 'bold', fontSize: 'calc(1.4rem + 0.8vw)', whiteSpace: 'nowrap' }}
                                    >
                                        倉庫&倉位【Store】
                                    </div>

                                    <div className="d-flex flex-column align-items-stretch align-items-md-end gap-2 w-100 w-md-auto" style={{ marginRight: '1rem' }}>
                                        {/* Search Bar Row */}
                                        <div className="d-flex align-items-center gap-2 justify-content-between justify-content-md-end w-100">
                                            <Form.Label className="mb-0 fw-bold" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap' }}>搜索</Form.Label>
                                            <Form.Control
                                                type="text"
                                                placeholder="依倉庫查詢【Search via store name】"
                                                value={searchInput}
                                                onChange={(e) => setSearchInput((e.target as HTMLInputElement).value)}
                                                onKeyDown={(e) => handleSearch(e)}
                                                onBlur={(e) => handleSearch(e)}
                                                className="w-100"
                                                style={{ maxWidth: '360px', fontSize: '0.9rem' }}
                                            />
                                        </div>
                                        {/* Buttons Row */}
                                        <div className="d-flex flex-wrap gap-2 justify-content-start justify-content-md-end w-100">
                                            <button
                                                style={{
                                                    padding: '5px 10px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 'bold',
                                                    borderRadius: '5px',
                                                    border: 'none',
                                                    backgroundColor: '#007bff',
                                                    color: '#fff',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                }}
                                                className="flex-grow-1 flex-md-grow-0"
                                                onClick={() => handleOpen('add')}
                                            >
                                                <div>新增倉庫&倉位</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>【Add Warehouse】</div>
                                            </button>
                                            <button
                                                style={{
                                                    padding: '5px 10px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 'bold',
                                                    borderRadius: '5px',
                                                    border: 'none',
                                                    backgroundColor: '#ffbb00',
                                                    color: '#000000',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                }}
                                                className="flex-grow-1 flex-md-grow-0"
                                                onClick={() => handleOpen('edit')}
                                            >
                                                <div>修改</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>【Edit】</div>
                                            </button>
                                            <button
                                                style={{
                                                    padding: '5px 10px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 'bold',
                                                    borderRadius: '5px',
                                                    border: 'none',
                                                    backgroundColor: '#dc3545',
                                                    color: '#fff',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                }}
                                                className="flex-grow-1 flex-md-grow-0"
                                                onClick={() => handleWareHouseDelete()}
                                            >
                                                <div>刪除</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>【Delete】</div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="py-3">
                                <div className="store-table-container">
                                    <table className="store-table">
                                        <thead>
                                            <tr>
                                                <th><input
                                                    type='checkBox'
                                                    onChange={() => handleSelect('all')}
                                                    checked={allChecked}
                                                /></th>
                                                {
                                                    typeof transferIntoChinese === 'object' &&
                                                    Object.keys(transferIntoChinese).map(item => (
                                                        <th key={item}>
                                                            {transferIntoChinese[item as keyof typeof transferIntoChinese]}
                                                        </th>
                                                    ))
                                                }
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {
                                                storeData &&
                                                    typeof transferIntoChinese === 'object' &&
                                                    storeData.length > 0 ?
                                                    storeData.map((item, index) => {
                                                        return (
                                                            <tr key={index}>
                                                                <td><input
                                                                    type='checkBox'
                                                                    checked={editList?.includes(String(item.id))}
                                                                    onChange={() => handleSelect('only', String(item.id))}
                                                                /></td>
                                                                {
                                                                    Object.keys(transferIntoChinese).map(key => (
                                                                        <td key={key}>{item[key as keyof typeof item]}</td>
                                                                    ))
                                                                }
                                                            </tr>
                                                        )
                                                    })
                                                    : <tr>
                                                        <td colSpan={Object.keys(transferIntoChinese).length} className="store-table-empty">
                                                            <div>目前沒有資料</div>
                                                        </td>
                                                    </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>

                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <Pagination className="mb-0">
                                <Pagination.First onClick={() => setPage(1)} disabled={page <= 1} />
                                <Pagination.Prev onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1} />
                                {pageItems}
                                <Pagination.Next onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} />
                                <Pagination.Last onClick={() => setPage(totalPages)} disabled={page >= totalPages} />
                            </Pagination>
                            <Button
                                variant="secondary"
                                onClick={onHide}
                            >
                                關閉
                            </Button>
                        </Modal.Footer>
                    </Modal >
                )
            }
        </>

    )

}

export default StoreControl;