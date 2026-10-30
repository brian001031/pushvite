
import React, { useCallback, useState, useEffect, useRef } from "react";
import { Modal, Button, Form, Pagination } from "react-bootstrap";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment-timezone';
import { Checkbox } from "@mui/material";

import { io } from 'socket.io-client'
import config from "../../../../config"

import MessagePopup from "../../../../components/MessagePopup"
import PartPickUp from './partPickUp' // 以配料之物料領取 畫面

import { v7 as uuidv7 } from 'uuid';
import { boolean } from "zod";


interface AllocatedMaterialCollectionProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
}


type innerEachData = {
    totalCount: number,
    page: number,
    pageSize: number,
    data: eachData[]
}

type eachData = {
    id: number,
    uuid: string, // 產品唯一碼
    vendor_name?: string, // 廠商名稱
    form_id: string, // 請購單號
    allocate_barcode_text?: string, // 物料QRcode
    product_itemcode?: string, // 項目代碼
    product_name?: string, // 物料名稱
    specification?: string, // 產品規格
    row_measure_val?: number, // 批號量
    row_unit?: string, // 單位
    warehousetype?: string, // 倉庫名稱
    stack_position?: string, // 倉位名稱
    // iscostover?: boolean, // 是否已領完
    assign_datetime?: any, //分配日期時間
    // stockname?: string,
    itemCode?: string,
    [key: string]: any,
}

type socketAckResponse<T> = {
    status: 'success' | 'error',
    success: boolean,
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

const AllocatedMaterialCollection: React.FC<AllocatedMaterialCollectionProps> = ({ show, onHide, centered }) => {

    const [startDate, setStartDate] = useState(moment('2025-01-01').tz("Asia/Taipei").startOf('day'));
    const [endDate, setEndDate] = useState(moment().tz("Asia/Taipei").endOf('day'));
    const [searchOption, setSearchOption] = useState("all") // 查詢方式
    const [searchRequestNo, setSearchRequestNo] = useState("") // 依請購單號搜索
    const [data, setData] = useState<eachData[]>([]); // 表單資料
    const [selectData, setSelectData] = useState<string[]>([]); // 選擇進入部門領料的表單
    const [loading, setLoading] = useState<boolean>(false);
    const socketRef = React.useRef<ReturnType<typeof io> | null>(null);

    const [messagePopup, setMessagePopup] = useState({
        show: false,
        type: 'info',// 'success', 'error', 'warning', 'info'
        title: '',
        message: '',
        autoClose: false,
        autoCloseDelay: 3000
    }) // 訊息popup

    const [page, setPage] = useState<number>(1);
    const [totalPage, setTotalPage] = useState<number>(0);
    const [pageSize, setPageSize] = useState<number>(10);
    const [total, setTotal] = useState<number>(0);
    const [pageInput, setPageInput] = useState<string>("1");

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    useEffect(() => {
        setPageInput(page.toString());
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

    const [user, setUser] = useState(localStorage.getItem('user'))

    // socket io 相關 -- start
    const use = React.useRef<ReturnType<typeof io> | null>(null)
    const roomKey = 'Ingredients_management_room' // 配料後物料領取專用
    const apiBaseUrl = config.apiBaseUrl
    const checkAuth = user && window.JSON.parse(user) && window.JSON.parse(user).memberID && Number(window.JSON.parse(user).authStatus) > 0 ? true : false
    const userName = user && window.JSON.parse(user) && window.JSON.parse(user).reg_schedulename
    const userNumber = (user && window.JSON.parse(user) && window.JSON.parse(user).memberID) ?? ('' as string)
    const joinedRoomRef = React.useRef<boolean>(false)
    const pageRef = React.useRef<number>(1)
    const searchForm_idRef = React.useRef<number>(1)
    // socket io 相關 -- end

    const [openModal, setOpenModal] = useState({
        partmentPickup: false
    }) as any
    const [popupOpen, setPopupOpen] = useState(false)

    pageRef.current = page;

    const options = [
        { value: "all", label: "全部" },
        { value: 'stock', label: '依倉庫找物料' },
        { value: 'itemName', label: '依物料名稱' },
        { value: 'spec', label: '依規格找物料' },
        { value: 'vendor', label: '依廠商找物料' },
        { value: 'itemCode', label: '依品號找物料' }
    ]

    // 依照查詢方式渲染 table -- start
    const isAll = {
        "id": "id",
        "allocate_barcode_text": "物料QRcode",
        "product_name": "物料名稱",
        "specification": "產品規格",
        "row_measure_val": "批號量",
        "row_unit": "單位",
        "vender_name": "供應商名稱",
        "product_itemcode": "品號",
        "warehousetype": "倉庫名稱",
        "stack_position": "倉位名稱",
        "assign_datetime": "分配日期時間",
    } // 全部

    const isStock = {
        "assign_datetime": "分配日期時間",
        "stack_position": "倉位名稱",
        "allocate_barcode_text": "物料QRcode",
        "product_name": '物料名稱',
        "specification": '產品規格',
        "row_measure_val": "批號量",
        "row_unit": "單位",
        "vender_name": "供應商名稱",
        "warehousetype": "倉庫名稱",
    } // 依倉庫找物料

    const isItemName = {
        "assign_datetime": "分配日期時間",
        "allocate_barcode_text": "物料QRcode",
        "product_name": '物料名稱',
        "specification": '產品規格',
        "row_measure_val": "批號量",
        "row_unit": "單位",
        "stack_position": "倉位名稱",
    } // 依品名找物料

    const isVendor = {
        "assign_datetime": "分配日期時間",
        "vendor_name": "供應商名稱",
        "allocate_barcode_text": "物料QRcode",
        "product_name": '物料名稱',
        "specification": '產品規格',
        "row_measure_val": "批號量",
        "row_unit": "單位",
        "warehousetype": "倉庫名稱",
        "stack_position": "倉位名稱",

    } // 依廠商找物料

    const isSpec = {
        "assign_datetime": "分配日期時間",
        "allocate_barcode_text": "物料QRcode",
        "specification": '產品規格',
        "product_name": '物料名稱',
        "row_measure_val": "批號量",
        "row_unit": "單位",
        "stack_position": "倉位名稱",
    } // 依規格找物料


    const isItemCode = {
        "assign_datetime": "分配日期時間",
        "allocate_barcode_text": "物料QRcode",
        "itemCode": "項目代碼",
        "specification": '產品規格',
        "product_name": '物料名稱',
        "row_measure_val": "批號量",
        "row_unit": "單位",
        "stack_position": "倉位名稱",
    } // 依料號找物料

    // 依照查詢方式渲染 table -- end


    // 依據選項動態更新使用者看到的畫面
    const getColumnsConfig = (opt: string) => {
        switch (opt) {
            case 'stock': return isStock;
            case 'itemName': return isItemName;
            case 'vendor': return isVendor;
            case 'spec': return isSpec;
            case 'itemCode': return isItemCode;
            case 'all':
            default:
                return isAll;
        }
    }

    const joinRoom = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connect) return

        if (!joinedRoomRef.current) {
            socket.emit('joinRoom', roomKey);
            joinedRoomRef.current = true;
            console.log(`已成功加入${roomKey}房間`)
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


    // 發送包含ack的socket
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

    // 用於蒐集使用者填入的部門領料確認表
    const handlePickUpFormId = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        console.log(selectData)

        setPopupOpen(true)
        setOpenModal((prev: any) => ({
            ...prev,
            partmentPickup: true
        }))
    }

    // 勾選
    const handleChecked = (uuid: string) => {
        setSelectData(prev =>
            prev.includes(uuid)
                ? prev.filter(id => id !== uuid)
                : [...prev, uuid]
        );
    };

    // 是否當前頁面全選
    const isPageAllSelected = Boolean(
        data && data.length > 0 && data.every(item => item.uuid && selectData.includes(item.uuid))
    );

    // 當前頁面全選 / 取消全選
    const handleSelectPageAll = () => {
        if (isPageAllSelected) {
            const currentPageUuids = data.map(item => item.uuid).filter(Boolean);
            setSelectData(prev => prev.filter(uuid => !currentPageUuids.includes(uuid)));
        } else {
            const currentPageUuids = data.map(item => item.uuid).filter(Boolean);
            setSelectData(prev => Array.from(new Set([...prev, ...currentPageUuids])));
        }
    };

    useEffect(() => { if (show) { handleFetch() } }, [show, page])
    const prevAllocatedStartDateRef = useRef(startDate);
    const prevAllocatedEndDateRef = useRef(endDate);

    useEffect(() => {
        if (!show) return;
        if (startDate && endDate && startDate.isValid() && endDate.isValid() && startDate.isAfter(endDate)) {
            setMessagePopup(prev => ({
                ...prev,
                show: true,
                type: "error",
                title: "日期區間錯誤",
                message: "起始日期不可以晚於結束日期！已為您還原成選擇前的日期。",
            }));
            setStartDate(prevAllocatedStartDateRef.current);
            setEndDate(prevAllocatedEndDateRef.current);
            return;
        }
        prevAllocatedStartDateRef.current = startDate;
        prevAllocatedEndDateRef.current = endDate;

        pageRef.current = 1;
        setPage(1);
        setPageInput("1");
        void handleFetch();
    }, [startDate, endDate, show]);

    // 初始抓取data 資料
    const handleFetch = async () => {

        // console.log(`
        //     起始日期: ${startDate} , 
        //     結尾日期: ${endDate} , 
        //     依據請購單號搜索 ${searchRequestNo}
        //     `)

        setLoading(true);
        try {

            const response = await emitWithAck<any>(
                "Ingredient:getPickUpOrigin",
                {
                    userNumber: userNumber,
                    startDate: startDate && startDate.isValid() ? startDate.format('YYYY-MM-DD HH:mm:ss') : null,
                    endDate: endDate && endDate.isValid() ? endDate.format('YYYY-MM-DD HH:mm:ss') : null,
                    searchRequestNo: searchRequestNo,
                    page: pageRef.current,
                    pageSize: pageSize
                } as payloadType
            )

            // console.log('確認初始抓取資料 回傳資訊: ', response.data)

            if (response && response.success && response.data) {
                const resData = response.data;
                let rawList: any[] = [];
                let totalCountVal = 0;

                if (Array.isArray(resData)) {
                    rawList = resData;
                    totalCountVal = resData.length;
                } else if (resData && Array.isArray(resData.data)) {
                    rawList = resData.data;
                    totalCountVal = typeof resData.total === 'number' ? resData.total : (typeof resData.totalCount === 'number' ? resData.totalCount : rawList.length);
                }

                let items: eachData[] = rawList.map((res: any) => {
                    const barcode = res.qr_identifier ?? '';
                    const itemCodeVal = res.item_code ?? '';
                    const prItemId = res.purchase_request_item_id != null ? String(res.purchase_request_item_id) : '';
                    const vendorVal = res.vendor_name || res.vender_name || res.vendor || '';

                    return {
                        ...res,
                        id: res.id ?? res.package_id ?? 0,
                        uuid: res.uuid || uuidv7(),
                        allocate_barcode_text: barcode,
                        product_itemcode: res.product_itemcode ?? '',
                        itemCode: itemCodeVal,
                        product_name: res.product_name ?? res.material ?? '',
                        specification: res.specification ?? '',
                        row_measure_val: res.row_measure_val ?? res.package_quantity ?? 0,
                        row_unit: res.row_unit ?? res.unit ?? '',
                        vendor_name: vendorVal,
                        vender_name: vendorVal,
                        warehousetype: res.warehousetype ?? res.current_store_name ?? '',
                        stack_position: res.stack_position ?? res.current_location ?? '',
                        assign_datetime: res.assign_datetime ?? res.qr_generated_at ?? res.package_generated_at ?? null,
                        pur_pk_number: res.pur_pk_number ?? prItemId,
                        status: 'new',
                        balance: res.balance ?? res.row_measure_val ?? res.package_quantity ?? 0,
                        iscostover: res.iscostover ?? 0,
                    };
                });

                // 若前端有輸入搜索請購單號/條碼/料號/品名，進行過濾
                if (searchRequestNo && searchRequestNo.trim()) {
                    const keyword = searchRequestNo.trim().toLowerCase();
                    items = items.filter(item =>
                        (item.allocate_barcode_text && String(item.allocate_barcode_text).toLowerCase().includes(keyword)) ||
                        (item.form_id && String(item.form_id).toLowerCase().includes(keyword)) ||
                        (item.itemCode && String(item.itemCode).toLowerCase().includes(keyword)) ||
                        (item.product_itemcode && String(item.product_itemcode).toLowerCase().includes(keyword)) ||
                        (item.product_name && String(item.product_name).toLowerCase().includes(keyword))
                    );
                    totalCountVal = items.length;
                }

                setData(prev => JSON.stringify(prev) === JSON.stringify(items) ? prev : items);
                setTotal(prev => prev === totalCountVal ? prev : totalCountVal);
                setTotalPage(prev => prev === Math.ceil(totalCountVal / pageSize) ? prev : Math.ceil(totalCountVal / pageSize));
            }
        } catch (error: any | null) {
            console.log(error)
            if (error.status === 500) {
                alert("伺服器發生未預期的錯誤")
            } else if (error.status === 400) {
                const data = error.response?.data.error
                alert(data)
            }
        } finally {
            setLoading(false);
        }
    }

    const handleSearch = () => {
        pageRef.current = 1;
        setPage(1);
        setPageInput("1");
        void handleFetch();
    };

    const handleFetchRef = useRef(handleFetch);
    handleFetchRef.current = handleFetch;

    useEffect(() => {
        if (!show) {
            leaveMaterialRoom();
            socketRef.current?.disconnect();
            socketRef.current = null;
            console.log("已關閉socket")
            return; // 當 modal 關閉時，直接 return，不要往下進行連線
        }

        if (!socketRef.current) {
            const authKey = `pick_${userNumber}-${userName}`
            const nextSocket = io(`${apiBaseUrl}/Ingredients`, {
                transports: ['websocket', 'polling'],
                withCredentials: true,
                query: {
                    roomKey: roomKey
                },
                auth: {
                    auth: authKey
                }
            });

            socketRef.current = nextSocket;

            const handleConnect = (): void => {
                console.log('Socket 連線成功');
                joinedRoomRef.current = true;
                joinRoom();
                void handleFetchRef.current();
            }

            const handleDisconnect = (): void => {
                console.log('Socket 連線中斷');
                joinedRoomRef.current = false;
            }

            const handlePickUp = (): void => {
                void handleFetchRef.current();
            }

            nextSocket.on('connect', handleConnect)
            nextSocket.on('disconnect', handleDisconnect)
            nextSocket.on('Ingredients:pickUp', handlePickUp)
            nextSocket.on('Ingredient:getPickUpOrigin:sync', (): void => {
                console.log("有人新送出領取單，將進行資料更新")
                void handleFetchRef.current();
            })
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [show, checkAuth, roomKey, joinRoom, leaveMaterialRoom]);

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
                openModal && openModal.partmentPickup && (
                    <PartPickUp
                        show={openModal.partmentPickup}
                        onHide={() => {
                            setOpenModal((prev: any) => ({ ...prev, partmentPickup: false }));
                            setPopupOpen(false);
                        }}
                        centered={centered}
                        socket={socketRef.current}
                        emitWithAck={emitWithAck}
                        selectedData={data.filter(item => selectData.includes(item.uuid))}
                        onComplete={() => {
                            setSelectData([]);
                            setOpenModal((prev: any) => ({ ...prev, partmentPickup: false }));
                            setPopupOpen(false);
                        }}
                    />
                )
            }
            {
                !popupOpen && (
                    <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
                        <Modal.Header closeButton>
                            <Modal.Title className="title_Albert">已配料之物料領取</Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', position: 'relative', zIndex: 1050 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '200px', position: 'relative', zIndex: 1050 }}>
                                        <label>起始日期</label>
                                        <DatePicker
                                            isClearable
                                            selected={startDate && startDate.isValid() ? startDate.toDate() : null}
                                            onChange={(date: Date | null) => setStartDate(date ? moment(date) : null)}
                                            dateFormat="yyyy/MM/dd"
                                            className="form-control"
                                            popperProps={{ style: { zIndex: 99999 } }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '200px', position: 'relative', zIndex: 1050 }}>
                                        <label>結束日期</label>
                                        <DatePicker
                                            isClearable
                                            selected={endDate && endDate.isValid() ? endDate.toDate() : null}
                                            onChange={(date: Date | null) => setEndDate(date ? moment(date) : null)}
                                            dateFormat="yyyy/MM/dd"
                                            className="form-control"
                                            popperProps={{ style: { zIndex: 99999 } }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                                        <label>依物料名稱搜索</label>
                                        <input className="form-control" style={{ border: 'solid 1px #aeaeb6ff' }}
                                            onChange={(e) => setSearchRequestNo(e.target.value)}
                                            value={searchRequestNo}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleSearch();
                                                }
                                            }}
                                            onBlur={(e) => {
                                                if (e.target.value !== '') {
                                                    handleSearch();
                                                }
                                            }}
                                        ></input>
                                    </div>
                                </div>
                                <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'row', gap: '10px' }}>
                                    <Form.Select
                                        aria-label="Default select example"
                                        style={{ width: '200px' }}
                                        value={searchOption}
                                        onChange={(e) => setSearchOption(e.target.value)}
                                    >
                                        {options.map((option, index) => (
                                            <option key={index} value={option.value}>{option.label}</option>
                                        ))}
                                    </Form.Select>
                                    <Button variant="success" className="fw-bold" onClick={handlePickUpFormId}>部門領料</Button>
                                </div>

                                {loading ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '300px', width: '100%' }}>
                                        <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
                                            <span className="visually-hidden">Loading...</span>
                                        </div>
                                        <div className="mt-3 text-primary fw-bold" style={{ fontSize: '1.15rem' }}>資料載入中，請稍候...</div>
                                    </div>
                                ) : (
                                    <div className="table-responsive mb-3" style={{ overflow: 'auto', maxHeight: '60vh' }}>
                                        <table className="table table-striped table-bordered table-hover" style={{ whiteSpace: 'nowrap' }}>
                                            <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                                <tr>
                                                    <th style={{ width: '40px' }}>
                                                        <Form.Check
                                                            type="checkbox"
                                                            checked={isPageAllSelected}
                                                            onChange={handleSelectPageAll}
                                                            disabled={!data || data.length === 0}
                                                        />
                                                    </th>
                                                    {Object.entries(getColumnsConfig(searchOption)).map(([key, label]) => (
                                                        <th key={key}>{label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>{
                                                data && data.length > 0
                                                    ? (
                                                        data.map((item, rowIndex) => {
                                                            const columnsConfig = getColumnsConfig(searchOption);
                                                            return (
                                                                <tr key={item.uuid || rowIndex}>
                                                                    <td>
                                                                        <Form.Check
                                                                            type="checkbox"
                                                                            checked={selectData.includes(item.uuid)}
                                                                            onChange={() => handleChecked(item.uuid)}
                                                                        />
                                                                    </td>
                                                                    {Object.keys(columnsConfig).map((colKey) => {
                                                                        const val = (item as any)[colKey];

                                                                        // Format assign_datetime or other time fields
                                                                        if (colKey === 'assign_datetime' && val) {
                                                                            return <td key={colKey}>{moment(val).tz('Asia/Taipei').format('YYYY/MM/DD HH:mm')}</td>;
                                                                        }
                                                                        // Format boolean fields (e.g. iscostover)
                                                                        if (typeof val === 'boolean') {
                                                                            return <td key={colKey}>{val ? '是' : '否'}</td>;
                                                                        }

                                                                        if (colKey === 'iscostover') {
                                                                            return <td key={colKey}>
                                                                                {val >= 1 ? '已經領完' : '還沒'}
                                                                            </td>
                                                                        }



                                                                        return <td key={colKey}>{val !== undefined && val !== null ? String(val) : ''}</td>;
                                                                    })}
                                                                </tr>
                                                            );
                                                        })
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={Object.keys(getColumnsConfig(searchOption)).length + 1} style={{ textAlign: 'center', width: '100%' }}>沒有資料</td>
                                                        </tr>
                                                    )
                                            }</tbody>
                                        </table>
                                    </div>
                                )}
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
        </>
    );
};

export default React.memo(AllocatedMaterialCollection);
