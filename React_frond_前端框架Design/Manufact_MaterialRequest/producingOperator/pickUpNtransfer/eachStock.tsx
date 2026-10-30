import React, { useState, useCallback, useEffect, useRef } from "react";
import axios, { AxiosResponse } from "axios";
import config from '../../../../config'
import { Modal, Button, Pagination, Col, Row, FormSelect, FormCheck, Form } from "react-bootstrap";
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment-timezone';

import { io } from 'socket.io-client'
import MessagePopup from "../../../../components/MessagePopup"
import MaterialTransferApply from "./materialTransferApply";
import MaterialReturnApply from "./materialReturnApply";

interface EachStockProps {
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

type payloadType = {
    userNumber?: string,
    data?: any,
    date?: {
        startDate: any;
        endDate: any;
    };
    searchRequestNo?: string,
    page: number,
    pageSize: number
}

const EachStock: React.FC<EachStockProps> = ({ show, onHide, centered }) => {


    const [data, setData] = useState<any[]>([]) // 列表資料
    const [selectPositionArea, setSelectPositionArea] = useState<string>('') // 選擇的部門
    const [usedInputMap, setUsedInputMap] = useState<Record<string | number, string>>({}); // 純字串輸入 state (onChange 不計算)
    const [previewBalanceMap, setPreviewBalanceMap] = useState<Record<string | number, number>>({}); // 僅 onBlur 時才計算並存放預覽剩餘數量

    const [selectedItems, setSelectedItems] = useState<any[]>([]); // 多選勾選的物料資料
    const [transferModalShow, setTransferModalShow] = useState<boolean>(false); // 物料調撥申請 Modal
    const [returnModalShow, setReturnModalShow] = useState<boolean>(false); // 物料退料申請 Modal

    const roomKey = 'Ingredients_EachDepartment_management_room'
    const joinedRoomRef = React.useRef<boolean>(false)
    const pageRef = React.useRef<number>(1)
    const socketRef = React.useRef<ReturnType<typeof io> | null>(null);

    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const userDepartment = user.positionarea || [];
    const userAuthStatus = Number(user.authStatus) ?? 0
    const userNumber = user.memberID ?? '';
    const apiBaseUrl = config.apiBaseUrl
    const userDepartmentRef = useRef(userDepartment);

    const [searchMaterialName, setSearchMaterialName] = useState<string>('')
    const searchMaterialNameRef = useRef(searchMaterialName);
    searchMaterialNameRef.current = searchMaterialName;

    const [checkIfAllInDepartment, setCheckIfAllInDepartment] = useState<boolean>(false)
    const checkIfAllInDepartmentRef = useRef<boolean>(false);

    const checkCanEdit = useCallback((item?: any) => {
        if (!item) return false;

        const localUser = JSON.parse(localStorage.getItem('user') || '{}');
        const authStatusStr = String(localUser.authStatus ?? user.authStatus ?? '');
        if (authStatusStr === '0') return true;

        const rawPos = localUser.positionarea || localUser.positionArea || user.positionarea || user.positionArea || userDepartmentRef.current;
        if (!rawPos) return false;

        let userDepts: string[] = [];
        if (Array.isArray(rawPos)) {
            rawPos.forEach((d: any) => {
                if (typeof d === 'string') {
                    const cleaned = d.replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
                    userDepts.push(...cleaned);
                } else if (typeof d === 'object' && d !== null) {
                    Object.values(d).forEach((val: any) => {
                        if (typeof val === 'string') {
                            const cleaned = val.replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
                            userDepts.push(...cleaned);
                        }
                    });
                }
            });
        } else if (typeof rawPos === 'string') {
            userDepts = rawPos.replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
        }

        userDepts = Array.from(new Set(userDepts));
        if (userDepts.length === 0) return false;

        // 1. 檢查物料對應的各個可能部門欄位（精確相等比對）
        const deptValues = [
            item?.pickUp_Department,
            item?.pickUpDepartment,
            item?.picking_dept,
            item?.department,
            item?.apply_Department,
            item?.targetDepartment
        ].filter(Boolean);

        for (const pickUpDept of deptValues) {
            if (typeof pickUpDept === 'string') {
                const itemDepts = pickUpDept.replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
                if (userDepts.some(dept => itemDepts.some(itemDept => itemDept === dept))) return true;
            } else if (Array.isArray(pickUpDept)) {
                const itemDepts = pickUpDept.flatMap((s: any) => String(s).replace(/[\[\]'"]/g, '').split(',')).map((s: string) => s.trim()).filter(Boolean);
                if (userDepts.some(dept => itemDepts.some(itemDept => itemDept === dept))) return true;
            }
        }

        // 2. 檢查目前下拉選單選取的部門 (selectPositionArea) - 僅在物料無指定部門時作為依據
        if (deptValues.length === 0 && selectPositionArea && selectPositionArea !== '部門選擇' && userDepts.includes(selectPositionArea)) {
            return true;
        }

        // 3. 備用檢查：儲位名稱或倉庫名稱（精確相等比對）
        if (item?.stack_position && userDepts.some(dept => dept === String(item.stack_position).trim())) {
            return true;
        }
        if (item?.warehousetype && userDepts.some(dept => dept === String(item.warehousetype).trim())) {
            return true;
        }

        return false;
    }, [user.positionarea, user.positionArea, user.authStatus, selectPositionArea]);

    const [loading, setLoading] = useState<boolean>(false);

    const [page, setPage] = useState<number>(1);
    const [totalPage, setTotalPage] = useState<number>(0);
    const [pageSize, setPageSize] = useState<number>(10);
    const [total, setTotal] = useState<number>(0);
    const [pageInput, setPageInput] = useState<string>("1");
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const [authPositionAreaList, setAuthPositionAreaList] = useState<string[]>([]);
    useEffect(() => {
        setPageInput(page.toString());
    }, [page]);


    const [messagePopup, setMessagePopup] = useState({
        show: false,
        type: 'info',// 'success', 'error', 'warning', 'info'
        title: '',
        message: '',
        autoClose: false,
        autoCloseDelay: 3000
    }) // 訊息popup


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

    useEffect(() => {
        if (!selectedItems || selectedItems.length === 0) {
            setCheckIfAllInDepartment(false);
            checkIfAllInDepartmentRef.current = false;
            return;
        }

        // 系統管理員 (authStatus 0) 不受限制
        const localUser = JSON.parse(localStorage.getItem('user') || '{}');
        const authStatusStr = String(localUser.authStatus ?? user.authStatus ?? '');
        if (authStatusStr === '0') {
            setCheckIfAllInDepartment(true);
            checkIfAllInDepartmentRef.current = true;
            return;
        }

        const allInDept = selectedItems.every((item: any) => checkCanEdit(item));
        setCheckIfAllInDepartment(allInDept);
        checkIfAllInDepartmentRef.current = allInDept;
    }, [selectedItems, selectPositionArea, checkCanEdit, user.authStatus]);

    useEffect(() => {
        if (show) (async () => {
            await checAuth()
            await checkAllAuthPositionArea()
            console.log('checAuth response:', userDepartmentRef.current)

            // 設定預設部門
            let defaultDept = '';
            const rawDept = userDepartmentRef.current;
            let parsedDepts: string[] = [];

            if (typeof rawDept === 'string') {
                parsedDepts = rawDept
                    .replace(/[\[\]'"]/g, '')
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);
            } else if (Array.isArray(rawDept)) {
                parsedDepts = rawDept
                    .flatMap(item => String(item).replace(/[\[\]'"]/g, '').split(','))
                    .map(s => s.trim())
                    .filter(Boolean);
            }

            if (parsedDepts.length > 0) {
                defaultDept = parsedDepts[0];
            }

            if (defaultDept) {
                setSelectPositionArea('部門選擇');
            }
        })()
    }, [show])


    // 發送包含ack的socket
    const emitWithAck = useCallback(<T,>
        (eventName: string, payload: Record<string, unknown>)
        : Promise<socketAckResponse<T>> => {

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

    const joinRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return

        if (!joinedRoomRef.current) {
            socket.emit('joinRoom', roomKey);
            joinedRoomRef.current = true;
            console.log('加入房間', roomKey)
        }
    }, [roomKey])


    const leaveRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected || joinedRoomRef.current) {
            console.log('本來就不在房間不理她')
            return
        }
        socket.emit('leaveRoom', roomKey)
        joinedRoomRef.current = false
        console.log('離開房間', roomKey)
    }, [roomKey])


    const fetchData = useCallback(async (
        overrideSearchName?: string,
        overridePage?: number
    ) => {
        setLoading(true)
        const targetSearchName = overrideSearchName !== undefined ? overrideSearchName : searchMaterialNameRef.current;
        const targetPage = overridePage !== undefined ? overridePage : page;

        console.log('search material name :', targetSearchName, 'target page:', targetPage)
        try {
            const response = await emitWithAck<any>("Ingredients:getData", {
                searchMaterialName: targetSearchName.trim() ?? '',
                department: selectPositionArea,
                userNumber: userNumber,
                userDepartment: userDepartmentRef.current,
                page: targetPage,
                pageSize: pageSize,
            })
            if (response && response.success && response.data) {
                console.log('抓取到最新資料', response.data)
                const count = response.data.totalCount ?? response.data.total ?? 0;
                const calcPageSize = response.data.pageSize || pageSize || 10;
                const calcTotalPage = response.data.totalPage || response.data.totalPages || Math.ceil(count / calcPageSize);
                const newData = response.data.data || [];
                setData(prev => JSON.stringify(prev) === JSON.stringify(newData) ? prev : newData);
                setTotal(prev => prev === count ? prev : count);
                setTotalPage(prev => prev === calcTotalPage ? prev : calcTotalPage);
                if (response.data.page) setPage(response.data.page);
                if (response.data.pageSize) setPageSize(response.data.pageSize);
            }
        } catch (error: any | null) {
            console.log('沒有抓取到最新資料', error)
        } finally {
            setLoading(false)
        }
    }, [selectPositionArea, page, pageSize, userNumber, emitWithAck])

    // 當頁碼、每頁筆數或部門變更時自動抓取該頁資料
    useEffect(() => {
        if (show && socketRef.current) {
            fetchData();
        }
    }, [show, page, pageSize, selectPositionArea]);

    // 僅在 onBlur 焦點離開輸入框時才執行計算與防呆
    const handleInputBlur = (itemKey: string | number, item: any) => {
        const raw = usedInputMap[itemKey];
        if (raw === undefined || raw === '') {
            setPreviewBalanceMap(prev => {
                const next = { ...prev };
                delete next[itemKey];
                return next;
            });
            return;
        }

        const totalVal = Number(item?.row_measure_val ?? item?.quantity ?? 0);
        const balanceVal = Number(item?.balance ?? totalVal);
        let num = parseFloat(raw);

        if (isNaN(num) || num <= 0) {
            setUsedInputMap(prev => ({ ...prev, [itemKey]: '' }));
            setPreviewBalanceMap(prev => {
                const next = { ...prev };
                delete next[itemKey];
                return next;
            });
            return;
        }

        if (num > balanceVal) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '數量過大',
                message: `輸入使用數量 (${num}) 不能超過當前剩餘數量 (${balanceVal})`,
                autoClose: true,
                autoCloseDelay: 3000
            });
            num = balanceVal;
            setUsedInputMap(prev => ({ ...prev, [itemKey]: String(balanceVal) }));
        }

        const calcBalance = Math.max(0, balanceVal - num);
        setPreviewBalanceMap(prev => ({ ...prev, [itemKey]: calcBalance }));
    };

    // 取得單筆資料唯一的 KEY
    const getItemKey = (item: any, idx?: number) => item?.uuid || item?.id || item?.form_id || idx;

    // 是否全選
    const isAllSelected = data && data.length > 0 && selectedItems.length === data.length;

    // 全選 / 取消全選
    const handleSelectAll = () => {
        if (isAllSelected) {
            setSelectedItems([]);
        } else {
            setSelectedItems([...data]);
        }
    };

    // 單筆勾選 / 取消勾選
    const handleSelectItem = (item: any) => {
        const key = getItemKey(item);
        setSelectedItems(prev => {
            const exists = prev.some(i => getItemKey(i) === key);
            if (exists) {
                return prev.filter(i => getItemKey(i) !== key);
            } else {
                return [...prev, item];
            }
        });
    };

    // 開啟「物料調撥申請」Modal 檢查
    const handleOpenTransferModal = () => {
        if (selectedItems.length === 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '未選擇物料',
                message: '請先在表格中勾選至少一筆欲調撥的物料資料！',
                autoClose: true,
                autoCloseDelay: 3000
            });
            return;
        }
        setTransferModalShow(true);
    };

    // 開啟「物料退料申請」Modal 檢查
    const handleOpenReturnModal = () => {
        if (selectedItems.length === 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '未選擇物料',
                message: '請先在表格中勾選至少一筆欲退料的物料資料！',
                autoClose: true,
                autoCloseDelay: 3000
            });
            return;
        }
        setReturnModalShow(true);
    };

    // 處理更新單筆已用數量，並扣除更新剩餘數量 (balance)
    const handleConfirmUseQuantity = async (item: any) => {
        const key = item.uuid || item.id || item.form_id;
        const rawInput = usedInputMap[key];
        const usedVal = parseFloat(rawInput || '');
        let iscostover = '0';
        let iscostover_Time: string | null = null;


        if (isNaN(usedVal) || usedVal <= 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '數量錯誤',
                message: '請輸入大於 0 的有效使用數量',
                autoClose: true,
                autoCloseDelay: 3000
            });
            return;
        }

        const totalVal = Number(item?.row_measure_val ?? item?.quantity ?? 0);
        const currentBalance = Number(item?.balance ?? totalVal);

        if (usedVal > currentBalance) {
            setMessagePopup({
                show: true,
                type: 'error',
                title: '數量超限',
                message: `輸入的使用數量 (${usedVal}) 不能大於剩餘數量 (${currentBalance})`,
                autoClose: true,
                autoCloseDelay: 3000
            });
            return;
        }

        try {
            const response = await axios.post(`${apiBaseUrl}/ingredients/updateStockBalance`, {
                payload: {
                    id: item.id,
                    uuid: item.uuid,
                    form_id: item.form_id,
                    allocate_barcode_text: item?.allocate_barcode_text,
                    used_val: usedVal,
                    iscostover: iscostover || item.iscostover || '0',
                    iscostover_Time: iscostover_Time,
                    expected_balance: currentBalance
                },
                roomName: roomKey
            });

            const resData = response?.data;

            if (resData && (resData.success || resData.status === '200')) {
                setMessagePopup({
                    show: true,
                    type: 'success',
                    title: '送出成功',
                    message: `已成功扣除 ${usedVal} ${item?.row_unit || ''}，剩餘數量更新為 ${resData.data?.data?.new_balance ?? (currentBalance - usedVal)}`,
                    autoClose: true,
                    autoCloseDelay: 3000
                });
                setUsedInputMap(prev => ({ ...prev, [key]: '' }));
                setPreviewBalanceMap(prev => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
                setSelectedItems([]);
                void fetchData();
            } else {
                setMessagePopup({
                    show: true,
                    type: 'error',
                    title: '送出失敗',
                    message: resData?.message || '扣除剩餘數量失敗',
                    autoClose: true,
                    autoCloseDelay: 3000
                });
            }
        } catch (err: any) {
            setMessagePopup({
                show: true,
                type: 'error',
                title: '送出失敗',
                message: err?.response?.data?.message || err?.message || '網路或 API 通訊異常',
                autoClose: true,
                autoCloseDelay: 3000
            });
        }
    };
    const haveNameToFind = (val?: string) => {
        const searchVal = val !== undefined ? val : searchMaterialName;
        console.log("searchMaterialName to find:", searchVal);
        setPage(1);
        fetchData(searchVal, 1);
    }


    useEffect(() => {
        if (!show && roomKey) {
            leaveRoom()
            socketRef.current?.disconnect()
            socketRef.current = null;
            console.log('已關閉socket')
            return
        }

        if (show && !socketRef.current) {
            const socket = io(`${apiBaseUrl}/Ingredients`, {
                transports: ['websocket', 'polling'],
                withCredentials: true,
                query: {
                    roomKey,
                },
            });
            socketRef.current = socket;

            socket.on('connect', () => {
                console.log('Socket 連線成功');
                joinedRoomRef.current = true;
                joinRoom();
                fetchData();
            });

            socket.on('disconnect', () => {
                console.log('Socket 連線中斷');
                joinedRoomRef.current = false;
            });

            socket.on('Ingredients:pickUp', () => {
                console.log('偵測到配料領取更新，重新抓取資料');
                void fetchData();
            });

            setLoading(false)
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                joinedRoomRef.current = false;
                console.log('組件卸載/狀態變更，已自動清理 Socket 連線');
            }
        };
    }, [show, roomKey, joinRoom, leaveRoom, fetchData, apiBaseUrl, user.companyID, selectPositionArea])


    // 確認部門
    const checAuth = useCallback(async () => {
        try {
            if (userAuthStatus >= 1) {
                const rsponse = await axios.get(`${apiBaseUrl}/ingredients/checkMemberIdentify`, {
                    params: {
                        memberID: userNumber ?? '',
                    }
                });

                userDepartmentRef.current = rsponse.data?.data?.positionArea;
            } else {
                userDepartmentRef.current = userDepartment;
            }
        } catch (error: any) {
            console.error('checAuth error:', error?.message || error);
            userDepartmentRef.current = userDepartment;
        }
    }, [userDepartment, userAuthStatus, apiBaseUrl, userNumber])

    // 抓取所有部門
    const checkAllAuthPositionArea = async () => {

        try {
            const response = await axios.get(`${apiBaseUrl}/ingredients/checkAllAuthPositionArea`, {})

            let data = response.data.data || []

            console.log('確認 checkAllAuthPositionArea  :', data)

            const allDepts: string[] = [];
            data.forEach((item: any) => {
                if (typeof item === 'string') {
                    const depts = item.replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
                    allDepts.push(...depts);
                }
            });

            const checkData = Array.from(new Set(allDepts));
            // console.log('確認 checkData :', checkData)
            checkData.unshift('部門選擇')
            setAuthPositionAreaList(checkData)
            console.log('data', checkData)

        } catch (error: any | null) {
            console.log('error', error)
        }
    }
    return (
        <>
            {
                messagePopup.show && (
                    <MessagePopup
                        show={messagePopup.show}
                        onHide={() => setMessagePopup(prev => ({ ...prev, show: false }))}
                        type={messagePopup.type}
                        title={messagePopup.title}
                        message={messagePopup.message}
                        autoClose={messagePopup.autoClose}
                        autoCloseDelay={messagePopup.autoCloseDelay}
                    />
                )
            }
            {
                !transferModalShow &&
                !returnModalShow && (
                    <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
                        <Modal.Header closeButton>
                            <Modal.Title className="title_Albert">部門庫存查詢</Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }} className="mb-3">
                                    {/* 左側：部門選擇與物料名稱搜尋 */}
                                    <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                        <div>
                                            <div style={{ fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap', marginBottom: '0.25rem' }}>部門選擇</div>
                                            <FormSelect
                                                style={{ textAlign: 'center', width: '14rem' }}
                                                value={selectPositionArea}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setSelectPositionArea(val);
                                                    setSearchMaterialName('');
                                                    searchMaterialNameRef.current = '';
                                                    setPage(1);
                                                }}
                                            >
                                                {
                                                    authPositionAreaList?.length > 0 && authPositionAreaList?.map((item, index) => (
                                                        <option key={index} value={item}>{item}</option>
                                                    ))
                                                }
                                            </FormSelect>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap', marginBottom: '0.25rem' }}>物料名稱</div>
                                            <Form.Control
                                                style={{ width: '18rem' }}
                                                placeholder="搜尋物料名稱..."
                                                value={searchMaterialName}
                                                onChange={(e) => setSearchMaterialName(e.target.value)}
                                                onBlur={() => {
                                                    haveNameToFind(searchMaterialName);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        haveNameToFind(searchMaterialName);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* 右側：選擇筆數與操作按鈕 */}
                                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className="me-2 text-muted fw-bold" style={{ fontSize: '0.95rem' }}>
                                            已選擇 <span className="text-primary">{selectedItems.length}</span> 筆物料
                                        </span>
                                        <Button
                                            variant="outline-danger"
                                            className="fw-bold"
                                            onClick={() => setSelectedItems([])}
                                            disabled={selectedItems.length === 0}
                                        >
                                            清除所有選取
                                        </Button>
                                        <Button
                                            variant="primary"
                                            className="fw-bold"
                                            onClick={handleOpenTransferModal}
                                        >
                                            物料調撥申請
                                        </Button>
                                        <Button
                                            variant="warning"
                                            className="fw-bold text-white"
                                            onClick={handleOpenReturnModal}
                                            disabled={!checkIfAllInDepartment}
                                        >
                                            物料退料申請
                                        </Button>
                                    </div>
                                </div>
                                <Row>
                                    <div className="table-responsive mb-3" style={{ overflow: 'auto', maxHeight: '60vh', marginTop: '1rem' }}>
                                        <table className="table table-striped table-bordered table-hover text-center align-middle" style={{ whiteSpace: 'nowrap' }}>
                                            <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                                <tr>
                                                    <th style={{ width: '40px' }}>
                                                        <FormCheck
                                                            type="checkbox"
                                                            checked={isAllSelected}
                                                            onChange={handleSelectAll}
                                                        />
                                                    </th>
                                                    <th>入庫日期</th>
                                                    <th>入庫編號碼</th>
                                                    <th>倉庫名稱</th>
                                                    <th>倉位名稱</th>
                                                    <th>物料名稱</th>
                                                    <th>產品規格</th>
                                                    <th>領取總數量</th>
                                                    <th>已用數量</th>
                                                    <th>剩餘數量</th>
                                                    <th>所在部門</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {
                                                    data && data.length > 0 ? (
                                                        data.map((item, index) => {
                                                            const totalVal = Number(item?.row_measure_val ?? item?.quantity ?? 0);
                                                            const balanceVal = Number(item?.balance ?? totalVal);
                                                            const itemKey = getItemKey(item, index);
                                                            const isChecked = selectedItems.some(i => getItemKey(i) === itemKey);
                                                            const canEdit = checkCanEdit(item)

                                                            return (
                                                                <tr key={itemKey}>
                                                                    <td>
                                                                        <FormCheck
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={() => handleSelectItem(item)}
                                                                        />
                                                                    </td>
                                                                    <td>{item?.pickUp_Time ? moment(item.pickUp_Time).tz('Asia/Taipei').format('YYYY/MM/DD HH:mm') : '-'}</td>
                                                                    <td>{item?.allocate_barcode_text ?? '-'}</td>
                                                                    <td>{item?.warehousetype || '預設抓配料設定'}</td>
                                                                    <td>{item?.stack_position || '預設抓配料設定'}</td>
                                                                    <td>{item?.product_name || '-'}</td>
                                                                    <td>{item?.specification || '-'}</td>
                                                                    <td>{totalVal} {item?.row_unit || ''}</td>
                                                                    <td style={{ minWidth: '180px' }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem', alignItems: 'center', justifyContent: 'center' }}>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                step="any"
                                                                                className="form-control form-control-sm"
                                                                                style={{ width: '80px', textAlign: 'center' }}
                                                                                placeholder="數量"
                                                                                value={usedInputMap[itemKey] || ''}
                                                                                onChange={(e) => {
                                                                                    const val = e.target.value;
                                                                                    setUsedInputMap(prev => ({ ...prev, [itemKey]: val }));
                                                                                }}
                                                                                disabled={!canEdit}
                                                                                onBlur={() => handleInputBlur(itemKey, item)}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter') {
                                                                                        handleConfirmUseQuantity(item);
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <Button
                                                                                variant="success"
                                                                                size="sm"
                                                                                style={{ whiteSpace: 'nowrap' }}
                                                                                onClick={() => handleConfirmUseQuantity(item)}
                                                                                disabled={!canEdit}
                                                                            >
                                                                                送出
                                                                            </Button>
                                                                        </div>
                                                                    </td>
                                                                    {(() => {
                                                                        const hasPreview = previewBalanceMap[itemKey] !== undefined;
                                                                        const displayBalance = hasPreview ? previewBalanceMap[itemKey] : balanceVal;

                                                                        return (
                                                                            <td className="fw-bold text-primary">
                                                                                {displayBalance} {item?.row_unit || ''}
                                                                                {hasPreview && (
                                                                                    <span style={{ fontSize: '0.75rem', color: '#6c757d', display: 'block', fontWeight: 'normal' }}>
                                                                                        (預覽扣除後剩餘)
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                        );
                                                                    })()}
                                                                    <td>
                                                                        {item?.pickUp_Department || '-'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={12} style={{ textAlign: 'center' }}>
                                                                查無任何資料
                                                            </td>
                                                        </tr>
                                                    )
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                </Row>

                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <div style={{ display: loading ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '0.5rem', marginTop: '1rem' }}>
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
                        </Modal.Footer>
                    </Modal>
                )
            }

            {/* 物料調撥申請 Modal */}
            {transferModalShow && (
                <MaterialTransferApply
                    show={transferModalShow}
                    onHide={() => setTransferModalShow(false)}
                    centered={centered}
                    selectedItems={selectedItems}
                    departmentList={authPositionAreaList}
                    onSuccess={() => {
                        setSelectedItems([]);
                        fetchData();
                    }}
                />
            )}

            {/* 物料退料申請 Modal */}
            {returnModalShow && (
                <MaterialReturnApply
                    show={returnModalShow}
                    onHide={() => setReturnModalShow(false)}
                    centered={centered}
                    selectedItems={selectedItems}
                    onSuccess={() => {
                        setSelectedItems([]);
                        fetchData();
                    }}
                />
            )}
        </>
    );
};

export default React.memo(EachStock);
