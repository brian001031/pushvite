import React, { useEffect, useCallback, useState } from "react";
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

export const apiBaseUrl = config.apiBaseUrl;



type addNewMaterialProps = {
    show: boolean;
    onHide: () => void;
}

type modelType = {
    add: boolean;
    edit: boolean;
}

type materialProperty = {
    founder: string | null | undefined,
    founderId: string | null | undefined,
    foundTime?: string | Date | null | undefined,
    edit_empName: string | null | undefined,
    edit_empNumber: string | null | undefined,
    edit_time?: string | Date | null | undefined,
    nowStatus: string | null | undefined,
    productClassify: string | null | undefined,
    itemCode: string | null | undefined,
    itemName: string | null | undefined,
    specification: string,
    Vendor?: string | null | undefined,
    otherMemo?: string | null | undefined,
}

type socketAckResponse<T> = {
    status: 'success' | 'error',
    data?: T,
    message?: string,
    revision?: number,
}

type materialListResponse = {
    rows: materialProperty[],
    total: number,
    page: number,
    pageSize: number,
    revision?: number,
}

type materialInnerData = materialProperty[] | null;



export const transferIntoChinese = {
    productClassify: '產品分類',
    itemCode: '物料編號',
    itemName: '物料名稱',
    founder: '創建者',
    founderId: '創建者ID',
    foundTime: '創建時間',
    edit_empName: '編輯者姓名',
    edit_empNumber: '編輯者編號',
    edit_time: '編輯時間',
    nowStatus: '當前狀態',
    specification: '規格',
    Vendor: '供應商',
    otherMemo: '其他備註',
}


const AddNewMaterial: React.FC<addNewMaterialProps> = (
    {
        show,
        onHide,
    }
) => {
    const [openModal, setOpenModal] = React.useState<modelType | null>(null); // 用於控制內部彈窗的開啟與關閉
    const [deleteDataSelect, setDeleteDataSelect] = React.useState<string[]>([]); // 用於存儲被選中的刪除項目

    const [messagePopup, setMessagePopup] = useState<{
        show: boolean,
        type: 'success' | 'error' | 'warning' | 'info',
        title: string,
        message: string
    }>()

    const [materialData, setMaterialData] = React.useState<materialInnerData>([]); // 用於存儲物料編號的數據
    const [page, setPage] = useState<number>(1);
    const [pageInput, setPageInput] = useState<string>('1');
    const [pageSize, setPageSize] = useState<number>(10);
    const [total, setTotal] = useState<number>(0);
    const [searchInput, setSearchInput] = useState<string>('');
    const [searchKeyword, setSearchKeyword] = useState<string>('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
    const [materialSingleCreate, setMaterialSingleCreate] = React.useState<materialProperty>({
        founder: "",
        founderId: "",
        foundTime: new Date(now) || null,
        edit_empName: "",
        edit_empNumber: "",
        edit_time: new Date(now) || null,
        nowStatus: 'active',
        productClassify: "",
        itemCode: "",
        itemName: "",
        specification: '',
        Vendor: "",
        otherMemo: "",
    })


    const [afterEdit, setAfterEdit] = React.useState<materialProperty[]>([]);

    // socket.io 相關 --start
    const socketRef = React.useRef<ReturnType<typeof io> | null>(null);
    const roomKey = 'material_management_room';
    const checkAuth = Number(user?.authStatus) !== 0 ? user?.authStatus : 0;
    const userName = user?.reg_schedulename || null;
    const joinedRoomRef = React.useRef<boolean>(false);
    const latestRevisionRef = React.useRef<number>(0);
    const listRequestIdRef = React.useRef<number>(0);
    const pageRef = React.useRef<number>(1);
    const pageSizeRef = React.useRef<number>(10);
    const searchKeywordRef = React.useRef<string>('');
    // socket.io 相關 --end

    // 同步 ref 與 state，讓 useCallback 不需依賴這些 state
    pageRef.current = page;
    pageSizeRef.current = pageSize;
    searchKeywordRef.current = searchKeyword;

    const isSearchMode = searchKeyword.trim().length > 0;

    const getTaipeiNow = (): string => {
        return moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
    };

    const formatToTaipei = (value: any): string => {
        if (!value) return '-';
        return moment(value).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
    };
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const visibleColumns = Array.isArray(materialData) && materialData.length > 0
        ? Object.keys(transferIntoChinese)
            .filter((key): key is keyof materialProperty => key in materialData[0])
        : [];

    const selectedMaterials = (materialData ?? []).filter((item) =>
        deleteDataSelect.includes(String(item.itemCode ?? ''))
    );

    const joinMaterialRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
            return;
        }
        if (!joinedRoomRef.current) {
            socket.emit('joinRoom', roomKey);
            joinedRoomRef.current = true;
            console.log(`✅ Joined room: ${roomKey}`);
        }
    }, [roomKey])

    const leaveMaterialRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected || !joinedRoomRef.current) {
            return;
        }
        socket.emit('leaveRoom', roomKey);
        joinedRoomRef.current = false;
    }, [roomKey])

    const emitWithAck = useCallback(<T,>(eventName: string, payload: Record<string, unknown>) => {
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
    }, [])

    // 主要抓取物料編號資訊；透過 socket 交由後端 room 管制
    const fetchMaterialData = useCallback(async (params?: { page?: number, keyword?: string }) => {
        const requestId = ++listRequestIdRef.current; // 為每次請求生成一個新的 requestId，並在響應時檢查是否與當前最新的 requestId 匹配，以避免處理過時的響應
        const nextPage = params?.page ?? pageRef.current;
        const nextKeyword = params?.keyword ?? searchKeywordRef.current;

        try {
            const response = await emitWithAck<materialListResponse | materialProperty[]>('material:list:request', {
                roomKey,
                page: nextPage,
                pageSize: pageSizeRef.current,
                keyword: nextKeyword,
            });

            if (requestId !== listRequestIdRef.current) {
                return;
            }

            if (typeof response.revision === 'number' && response.revision < latestRevisionRef.current) {
                return;
            }

            if (response.status === 'success') {
                if (typeof response.revision === 'number') {
                    latestRevisionRef.current = response.revision;
                }

                if (Array.isArray(response.data)) {
                    setMaterialData(response.data);
                    setTotal(response.data.length);
                    setPage(1);
                    return;
                }

                const listData = response.data;
                if (listData && Array.isArray(listData.rows)) {
                    setMaterialData(listData.rows);
                    setTotal(typeof listData.total === 'number' ? listData.total : listData.rows.length);
                    if (typeof listData.page === 'number') {
                        setPage(listData.page);
                    }
                    if (typeof listData.pageSize === 'number') {
                        setPageSize(listData.pageSize);
                    }
                    if (typeof listData.revision === 'number') {
                        latestRevisionRef.current = listData.revision;
                    }
                    return;
                }

                setMaterialData([]);
                setTotal(0);
                return;
            }

            throw new Error(response.message || '獲取物料編號數據失敗');

        } catch (error: any | null) {
            console.error('獲取物料編號數據失敗:', error);
            // setMessagePopup({
            //     show: true,
            //     type: 'error',
            //     title: '錯誤',
            //     message: '獲取物料編號數據失敗，請稍後再試。'
            // })
        }
    }, [emitWithAck, roomKey])

    // 監聽來自後端的更新事件，當有更新時重新抓取數據
    useEffect(() => {
        if (!show) {
            leaveMaterialRoom();
            socketRef.current?.disconnect();
            socketRef.current = null;
            joinedRoomRef.current = false;
            return;
        }
        if (!userName || checkAuth === 0) {
            setMessagePopup({
                show: true,
                type: 'error',
                title: '權限錯誤',
                message: '您的帳號權限不足，無法使用物料編號管理功能。'
            })
            return;
        }
        const authKey = `${checkAuth}-${userName}`;

        const nextSocket = io(`${apiBaseUrl}/material`, {
            transports: ['websocket', 'polling'],
            withCredentials: true,
            query: {
                roomKey: roomKey,
            },
            auth: {
                token: authKey
            }
        })

        socketRef.current = nextSocket;

        setMaterialSingleCreate({
            founder: user?.reg_schedulename || 'Unknown',
            founderId: user?.memberID || 'Unknown',
            foundTime: null,
            edit_empName: user?.reg_schedulename || 'Unknown',
            edit_empNumber: user?.memberID || 'Unknown',
            edit_time: null,
            nowStatus: 'active',
            productClassify: '',
            itemCode: '',
            itemName: '',
            specification: '',
            Vendor: '',
            otherMemo: '',
        })

        const handleConnect = (): void => {
            joinedRoomRef.current = false;
            joinMaterialRoom();
            void fetchMaterialData({ page: pageRef.current });
        }

        const handleDisconnect = (): void => {
            console.log('🔌 Socket disconnected');
            joinedRoomRef.current = false;
        }

        const handleMaterialUpdated = (): void => {
            void fetchMaterialData();
        }

        const handleRoomJoined = (r: string): void => {
            console.log(`✅ [Socket] 成功加入房間: ${r}`);
        }
        const handleRoomLeft = (r: string): void => {
            console.log(`❌ [Socket] 成功離開房間: ${r}`);
        }

        nextSocket.on('connect', handleConnect);
        nextSocket.on('disconnect', handleDisconnect);
        nextSocket.on('roomJoined', handleRoomJoined);
        nextSocket.on('roomLeft', handleRoomLeft);
        nextSocket.on('material:updated', handleMaterialUpdated);
        nextSocket.on('material:refresh', handleMaterialUpdated);

        return () => {
            leaveMaterialRoom();
            nextSocket.off('connect', handleConnect);
            nextSocket.off('disconnect', handleDisconnect);
            nextSocket.off('roomJoined', handleRoomJoined);
            nextSocket.off('roomLeft', handleRoomLeft);
            nextSocket.off('material:updated', handleMaterialUpdated);
            nextSocket.off('material:refresh', handleMaterialUpdated);
            nextSocket.disconnect();
            joinedRoomRef.current = false;
        }

    }, [show, fetchMaterialData, checkAuth, userName, roomKey, joinMaterialRoom, leaveMaterialRoom]);

    useEffect(() => {
        const socket = socketRef.current;
        if (!show || !socket || !socket.connected) {
            return;
        }

        void fetchMaterialData({ page: pageRef.current, keyword: searchKeywordRef.current });
    }, [page, pageSize])

    // 開啟物料編號
    const handleAddNewMaterial: () => void = () => {
        setOpenModal({
            add: true,
            edit: false
        })
    }

    // 開啟更新物料編號的彈窗
    const editData = (): void => {
        if (deleteDataSelect.length === 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '警告',
                message: '請先勾選要修改的物料編號。'
            });
            return;
        }

        const selectedForEdit = (materialData ?? []).filter((item) =>
            deleteDataSelect.includes(String(item.itemCode ?? ''))
        );

        if (selectedForEdit.length === 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '警告',
                message: '找不到勾選的物料資料，請重新選擇。'
            });
            return;
        }

        setAfterEdit(selectedForEdit.map((item) => ({ ...item })));
        setOpenModal({
            edit: true,
            add: false
        })
    }

    const finalEditData = async (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();

        const currentTime = getTaipeiNow();

        if (afterEdit.length === 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '警告',
                message: '沒有可更新的資料。'
            })
            return;
        }

        const editPayload = afterEdit.map((item) => ({
            ...item,
            edit_empName: user?.reg_schedulename ?? 'Unknown',
            edit_empNumber: user?.memberID ?? 'Unknown',
            edit_time: currentTime,
        }));

        try {
            const response = await emitWithAck<materialProperty[] | materialProperty>('material:update:request', {
                roomKey,
                editPayload,
            });

            if (response?.status !== 'success') {
                throw new Error(response?.message || '更新物料編號失敗');
            }

            setMessagePopup({
                show: true,
                type: 'success',
                title: '成功',
                message: '更新物料編號成功！'
            });

            setAfterEdit([]);
            setOpenModal(null);

            if (!isSearchMode) {
                joinMaterialRoom();
            }
            void fetchMaterialData({ page: pageRef.current, keyword: searchKeywordRef.current });
        } catch (error: any | null) {
            console.error('更新物料編號失敗:', error);
            setMessagePopup({
                show: true,
                type: 'error',
                title: '錯誤',
                message: error?.message || '更新物料編號失敗，請稍後再試。'
            });
        }
    }

    const handleEditFieldChange = (
        index: number,
        field: keyof materialProperty,
        value: string,
    ): void => {
        setAfterEdit((prev) => prev.map((item, itemIndex) => (
            itemIndex === index ? { ...item, [field]: value } : item
        )));
    }

    // 將資料送到後端 room；是否更新 Redis 由後端自行判斷與處理
    const finalSendToBackend = async (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();

        console.log('準備送出的物料編號資料:', typeof materialSingleCreate === 'object' ? JSON.stringify(materialSingleCreate) : materialSingleCreate);

        const currentTime = getTaipeiNow();
        const payload: materialProperty = {
            ...materialSingleCreate,
            founder: materialSingleCreate.founder?.trim() || user?.reg_schedulename || 'Unknown',
            founderId: materialSingleCreate.founderId?.trim() || user?.memberID || 'Unknown',
            foundTime: materialSingleCreate.foundTime ?? currentTime,
            edit_empName: user?.reg_schedulename ?? 'Unknown',
            edit_empNumber: user?.memberID ?? 'Unknown',
            edit_time: currentTime,
        };


        try {
            const response = await emitWithAck<materialProperty>('material:create:request', {
                roomKey,
                payload: payload,
            });

            if (response?.status !== 'success') {
                throw new Error(response?.message || '新增物料編號失敗');
            }

            setMessagePopup({
                show: true,
                type: 'success',
                title: '成功',
                message: '新增物料編號成功！'
            })

            setOpenModal(null);
            if (!isSearchMode) {
                joinMaterialRoom();
            }
            fetchMaterialData({ page: pageRef.current, keyword: searchKeywordRef.current });

            setMaterialSingleCreate({
                ...materialSingleCreate,
                itemCode: '',
                itemName: '',
                specification: '',
                productClassify: '',
                Vendor: '',
                otherMemo: '',
            });


        } catch (error: any | null) {
            console.error('新增物料編號失敗:', error);
            setMessagePopup({
                show: true,
                type: 'error',
                title: '錯誤',
                message: error?.message || '新增物料編號失敗，請稍後再試。'
            })
        }
    }

    const pageItems: React.ReactNode[] = [];
    const maxVisiblePages = 3;

    if (totalPages <= maxVisiblePages) {
        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
            pageItems.push(
                <Pagination.Item
                    key={pageNumber}
                    active={pageNumber === page}
                    onClick={() => setPage(pageNumber)}
                >
                    {pageNumber}
                </Pagination.Item>
            );
        }
    } else {
        let startPage = Math.max(1, page - 1);
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        startPage = Math.max(1, endPage - maxVisiblePages + 1);

        if (startPage >= 1) {
            pageItems.push(
                <Pagination.Item key={1} active={page === 1} onClick={() => setPage(1)}>
                    1
                </Pagination.Item>
            );
        }

        if (startPage > 2) {
            pageItems.push(<Pagination.Ellipsis key="ellipsis-start" disabled />);
        }

        for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
            if (pageNumber === 1 || pageNumber === totalPages) {
                continue;
            }

            pageItems.push(
                <Pagination.Item
                    key={pageNumber}
                    active={pageNumber === page}
                    onClick={() => setPage(pageNumber)}
                >
                    {pageNumber}
                </Pagination.Item>
            );
        }

        if (endPage < totalPages - 1) {
            pageItems.push(<Pagination.Ellipsis key="ellipsis-end" disabled />);
        }

        if (endPage < totalPages) {
            pageItems.push(
                <Pagination.Item key={totalPages} active={page === totalPages} onClick={() => setPage(totalPages)}>
                    {totalPages}
                </Pagination.Item>
            );
        }
    }

    // emit 刪除事件給後端 room；實際刪除與否由後端自行判斷與處理
    const deleteData = async (): Promise<void> => {

        if (!joinedRoomRef.current) {
            console.warn('請先加入房間才能刪除物料編號！');
            return;
        }
        else if (deleteDataSelect.length === 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '警告',
                message: '請至少選擇一個物料編號進行刪除！'
            })
            return;
        }

        else {
            try {

                console.log(`確認 ${roomKey} 與準備刪除的物料編號:`, deleteDataSelect);
                const response = await emitWithAck('material:delete:request', {
                    roomKey,
                    itemCodes: deleteDataSelect,
                    itemCode: deleteDataSelect,
                })
                // console.log ('確認有跑 material:delete:request 事件，後端回應:', response);

                if (response?.status !== 'success') {
                    throw new Error(response?.message || '刪除回應失敗');
                }

                if (response.status === 'success') {
                    setMessagePopup({
                        show: true,
                        type: 'success',
                        title: '成功',
                        message: '刪除成功！'
                    })
                    setDeleteDataSelect([]);
                }

            } catch (error) {
                console.error('刪除物料編號失敗:', error);
                setMessagePopup({
                    show: true,
                    type: 'error',
                    title: '錯誤',
                    message: '刪除物料編號失敗，請稍後再試。'
                })
            } finally {
                await fetchMaterialData({ page: pageRef.current, keyword: searchKeywordRef.current });
            }
        }
    }

    const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter') {
            const normalizedKeyword = searchInput.trim();
            setSearchKeyword(normalizedKeyword);
            setPage(1);

            const socket = socketRef.current;
            if (!socket || !socket.connected) {
                return;
            }

            void fetchMaterialData({ page: 1, keyword: normalizedKeyword });
        }
    }

    useEffect(() => {
        setPageInput(String(page));
    }, [page])

    const applyPageInput = (): void => {
        const rawValue = pageInput.trim();

        if (!rawValue) {
            setPageInput(String(page));
            return;
        }

        const parsedPage = Number(rawValue);
        if (!Number.isFinite(parsedPage)) {
            setPageInput(String(page));
            return;
        }

        const normalizedPage = Math.max(1, Math.min(totalPages, Math.trunc(parsedPage)));
        setPage(normalizedPage);
        setPageInput(String(normalizedPage));
    }

    return (
        <>
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
                openModal?.edit && (
                    <Modal
                        show={true}
                        onHide={() => {
                            setAfterEdit([]);
                            setOpenModal(null);
                        }}
                        centered
                        backdrop="static"
                        size="xl"
                        style={{ display: 'flex', flexDirection: 'column' }}
                    >
                        <Modal.Header closeButton >
                            <Modal.Title className="d-flex justify-content-center w-100 text-center" style={{ fontWeight: 'bold', fontSize: '2rem' }}>
                                <div>修改物料編號</div>
                            </Modal.Title>
                        </Modal.Header>
                        <Modal.Body style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2rem', overflow: 'scroll', whiteSpace: 'nowrap'
                        }}>
                            {afterEdit.length === 0 ? (
                                <div>目前沒有可編輯的選擇資料</div>
                            ) : (
                                <Form id='editToBackend' onSubmit={finalEditData} className="w-100">
                                    <Table striped bordered hover className="align-middle w-400" style={{ overflow: 'scroll', maxHeight: '90vh' }}>
                                        <thead>
                                            <tr>
                                                <th>物料編號</th>
                                                <th>產品分類</th>
                                                <th>物料名稱</th>
                                                <th>規格</th>
                                                <th>供應商</th>
                                                <th>其他備註</th>
                                            </tr>
                                        </thead>
                                        <tbody style={{ maxHeight: '70vh', overflowY: 'auto', overflow: 'scroll' }}>
                                            {afterEdit.map((item, index) => (
                                                <tr key={`${String(item.itemCode ?? '')}-${index}`}>
                                                    <td>
                                                        {item.itemCode ?? '-'}
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            style={{ minWidth: '150px' }}
                                                            value={item.productClassify ?? ''}
                                                            onChange={(e) => handleEditFieldChange(index, 'productClassify', e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            value={item.itemName ?? ''}
                                                            style={{ minWidth: '150px' }}
                                                            onChange={(e) => handleEditFieldChange(index, 'itemName', e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            value={item.specification ?? ''}
                                                            style={{ minWidth: '150px' }}
                                                            onChange={(e) => handleEditFieldChange(index, 'specification', e.target.value)}
                                                        />
                                                    </td>

                                                    <td>
                                                        <input
                                                            type="text"
                                                            value={item.Vendor ?? ''}
                                                            style={{ minWidth: '150px' }}
                                                            onChange={(e) => handleEditFieldChange(index, 'Vendor', e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <textarea
                                                            value={item.otherMemo ?? ''}
                                                            style={{ minWidth: '150px' }}
                                                            onChange={(e) => handleEditFieldChange(index, 'otherMemo', e.target.value)}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                </Form>
                            )}
                        </Modal.Body>
                        <Modal.Footer style={{ display: 'flex', justifyContent: 'center' }}>
                            <Button variant="primary" form='editToBackend' type='submit'>
                                確定
                            </Button>
                            <Button variant="secondary" onClick={() => setOpenModal(null)}>
                                取消
                            </Button>
                        </Modal.Footer>
                    </Modal>
                )
            }
            {
                openModal?.add && (
                    <Modal
                        show={true}
                        onHide={() => setOpenModal(null)}
                        centered
                        backdrop="static"
                    >
                        <Modal.Header closeButton >
                            <Modal.Title className="d-flex justify-content-center w-100 text-center" style={{ fontWeight: 'bold', fontSize: '2rem' }}>
                                <div>新增物料編號</div>
                            </Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <Form id='sendToBackend' onSubmit={finalSendToBackend} style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflowY: 'auto', gap: '1rem', alignItems: 'center', justifyContent: 'center', padding: '1rem', width: '100%' }}>
                                <Form.Group style={{ width: '90%', textAlign: 'center' }}>
                                    <Form.Label>品號</Form.Label>
                                    <Form.Control type="text" placeholder="請輸入品號" value={materialSingleCreate?.itemCode || ''} onChange={(e) => setMaterialSingleCreate({ ...materialSingleCreate, itemCode: e?.target?.value ?? '' })} style={{ textAlign: 'center' }} />
                                </Form.Group>
                                <Form.Group style={{ width: '90%', textAlign: 'center' }}>
                                    <Form.Label>品名</Form.Label>
                                    <Form.Control type="text" placeholder="請輸入品名" value={materialSingleCreate?.itemName || ''} onChange={(e) => setMaterialSingleCreate({ ...materialSingleCreate, itemName: e?.target?.value ?? '' })} style={{ textAlign: 'center' }} />
                                </Form.Group>
                                <Form.Group style={{ width: '90%', textAlign: 'center' }}>
                                    <Form.Label>產品規格</Form.Label>
                                    <Form.Control
                                        as="textarea"
                                        placeholder="請輸入產品規格"
                                        value={materialSingleCreate?.specification || ''}
                                        onChange={(e) => setMaterialSingleCreate({ ...materialSingleCreate, specification: e?.target?.value ?? '' })}
                                        style={{ textAlign: 'center', height: '100px', maxHeight: '100px' }}
                                    />
                                </Form.Group>
                                <Form.Group style={{ width: '90%', textAlign: 'center' }}>
                                    <Form.Label>歸類名稱</Form.Label>
                                    <Form.Control type="text" placeholder="請輸入歸類名稱" value={materialSingleCreate?.productClassify || ''} onChange={(e) => setMaterialSingleCreate({ ...materialSingleCreate, productClassify: e?.target?.value ?? '' })} style={{ textAlign: 'center' }} />
                                </Form.Group>
                                <Form.Group style={{ width: '90%', textAlign: 'center' }}>
                                    <Form.Label>供應商</Form.Label>
                                    <Form.Control type="text" placeholder="請輸入供應商名稱" value={materialSingleCreate?.Vendor || ''} onChange={(e) => setMaterialSingleCreate({ ...materialSingleCreate, Vendor: e?.target?.value ?? '' })} style={{ textAlign: 'center' }} />
                                </Form.Group>
                                <Form.Group style={{ width: '90%', textAlign: 'center' }}>
                                    <Form.Label>其餘備註</Form.Label>
                                    <Form.Control
                                        as="textarea"
                                        placeholder="請輸入其餘備註"
                                        value={materialSingleCreate?.otherMemo || ''}
                                        onChange={(e) => setMaterialSingleCreate({ ...materialSingleCreate, otherMemo: e?.target?.value ?? '' })}
                                        style={{ textAlign: 'center', height: '100px', maxHeight: '100px' }} />
                                </Form.Group>
                            </Form>
                        </Modal.Body>
                        <Modal.Footer style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                            <Button variant="primary" form='sendToBackend' type='submit'>
                                保存
                            </Button>
                            <Button variant="danger" onClick={() =>
                                window.confirm('確定要放棄新增物料編號嗎？') ? setOpenModal(null) : null
                            }>
                                關閉
                            </Button>
                        </Modal.Footer>
                    </Modal>
                )
            }
            {
                (!openModal || openModal == null) && (
                    <Modal
                        show={show}
                        onHide={onHide}
                        centered
                        backdrop="static"
                        size="xl"
                        style={{
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    // dialogClassName=".modal-overlay"
                    >
                        <Modal.Header closeButton>
                            <Modal.Title className="w-100">
                                <div className="d-flex flex-column flex-xl-row justify-content-between align-items-start align-items-xl-center gap-3">
                                    <div style={{ fontWeight: 'bold', fontSize: 'calc(1.4rem + 0.8vw)', whiteSpace: 'nowrap' }}>
                                        物料編號管理
                                    </div>
                                    <div className="d-flex flex-column align-items-stretch align-items-md-end gap-2 w-100 w-xl-auto" style={{ marginRight: '1rem' }}>
                                        {/* Search Bar Row */}
                                        <div className="d-flex align-items-center gap-2 justify-content-between justify-content-md-end w-100">
                                            <Form.Label className="mb-0 fw-bold" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap' }}>搜索</Form.Label>
                                            <Form.Control
                                                type="text"
                                                placeholder="搜尋物料編號【Search via material number】"
                                                value={searchInput}
                                                onChange={(e) => setSearchInput(e.target.value)}
                                                onKeyDown={handleSearchInputKeyDown}
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
                                                onClick={handleAddNewMaterial} >
                                                <div>新增物料編號</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>【Add new material】</div>
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
                                                onClick={editData}>
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
                                                onClick={deleteData}>
                                                <div>刪除</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>【Delete】</div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </Modal.Title>
                        </Modal.Header>
                        <Modal.Body
                            style={{
                                display: 'flex',
                                whiteSpace: 'nowrap',
                                overflowX: 'auto',
                                flexDirection: 'column',
                            }}
                        >

                            <Table striped bordered hover className="align-middle">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" /></th>
                                        {
                                            visibleColumns.length > 0
                                                ? visibleColumns.map(key => (
                                                    <th key={key}>{transferIntoChinese[key]}</th>
                                                ))
                                                : null
                                        }
                                    </tr>
                                </thead>
                                <tbody>
                                    {
                                        Array.isArray(materialData) &&
                                        materialData.length > 0 &&
                                        materialData.map((item, index) => {
                                            const materialCode = String(item?.itemCode || '');
                                            return (
                                                <tr key={index}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            checked={deleteDataSelect.includes(materialCode)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setDeleteDataSelect(prev => [...prev, materialCode]);
                                                                } else {
                                                                    setDeleteDataSelect(prev => prev.filter(code => code !== materialCode));
                                                                }
                                                            }}
                                                        />
                                                    </td>
                                                    {
                                                        visibleColumns.map((key) => {
                                                            const rawValue = item[key];
                                                            const displayValue = rawValue instanceof Date
                                                                ? moment(rawValue).add(8, 'hours').format('YYYY-MM-DD HH:mm:ss')
                                                                : (rawValue ?? '-');
                                                            return (
                                                                <td key={key}>
                                                                    {['foundTime', 'edit_time'].includes(key) ? formatToTaipei(displayValue) : (displayValue ?? '-')}
                                                                </td>
                                                            )
                                                        })
                                                    }
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </Table>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexDirection: 'column', gap: '0.5rem' }}>
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
                        </Modal.Body>
                    </Modal>
                )
            }
        </>

    )

}

export default AddNewMaterial;