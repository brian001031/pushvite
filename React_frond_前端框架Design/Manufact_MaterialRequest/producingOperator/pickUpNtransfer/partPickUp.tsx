import React, { useCallback, useState, useEffect, useRef } from "react";
import { Modal, Button } from "react-bootstrap";
import { io } from 'socket.io-client'; // 引入 Socket 型別
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment-timezone';
import { Select, MenuItem } from "@mui/material";
import { options } from "@fullcalendar/core/preact.js";
import axios, { AxiosPromise } from "axios";
import config from '../../../../config'


const Loading: React.FC = () => {
    return (
        <div className="loading">
            <div className="loading-spinner">
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
            </div>
            <p>Loading...</p>
        </div>
    )
}


interface PartPickUpProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
    // 新增接收 Socket 相關的 Props
    socket?: ReturnType<typeof io> | null;
    emitWithAck?: <T>(eventName: string, payload: Record<string, unknown>) => Promise<any>;
    // 接收從父元件傳來的資料
    selectedData: any[];
    // 完成操作後的通知回調
    onComplete: () => void;
}

const PartPickUp: React.FC<PartPickUpProps> = ({ show, onHide, centered, socket, emitWithAck, selectedData, onComplete }) => {
    const apiBaseUrl = config.apiBaseUrl
    const [options_stock, setOptions_stock] = useState<string[]>([]) // 倉庫名稱下拉選單
    const [options_location, setOptions_location] = useState<string[]>([]) // 倉位下拉選單
    const [stockMap, setStockMap] = useState<Record<string, string[]>>({}) // 倉庫與倉位對應 Map
    const [dataSelect, setDataSelect] = useState<any[]>([])
    const [userPosition, setuserPosition] = useState<string[]>([]) // 確認position area 
    const [loading, setLoading] = useState<boolean>(false);

    const user = localStorage.getItem('user')
    const userName = user && window.JSON.parse(user) && window.JSON.parse(user).reg_schedulename
    const userNumber = (user && window.JSON.parse(user) && window.JSON.parse(user).memberID) ?? ('' as string)
    const userAuthStatus = user && window.JSON.parse(user) && Number(window.JSON.parse(user).authStatus)


    // 當 Modal 開啟且傳入 selectedData 時，將其拷貝至 local state，作為編輯的資料來源並作為預設值
    useEffect(() => {
        if (show) {
            const nextData = selectedData.map(item => ({
                ...item,
                warehousetype: item.warehousetype ?? "",
                stack_position: item.stack_position ?? ""
            }));

            setDataSelect(prev => {
                if (JSON.stringify(prev) === JSON.stringify(nextData)) {
                    return prev;
                }
                return nextData;
            });
        }
    }, [selectedData, show]);

    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (msg: any) => {
            console.log("子元件收到房間訊息:", msg);
        };

        // 開始監聽事件
        socket.on("some_event_name", handleNewMessage);

        // 元件卸載或關閉時，記得清除監聽器以防重複監聽
        return () => {
            socket.off("some_event_name", handleNewMessage);
        };
    }, [socket]);

    // 確認自己的人員狀態與身分
    const checkMemberIdentify = async () => {
        let part_emp_name = userName ?? ''
        let part_emp_number = Number(userNumber) ?? 0
        let part_emp_position = userPosition ?? ''


        // console.log('check userAuthStatus :', userAuthStatus)
        if (userAuthStatus >= 1) {
            try {
                const response = await axios.get(`${apiBaseUrl}/ingredients/checkMemberIdentify`, {
                    params: {
                        memberID: userNumber,
                    }
                })

                let payload = response.data
                if (payload.success && payload.data) {
                    part_emp_position = payload.data.positionArea
                    part_emp_number = userNumber
                    part_emp_name = userName
                }
            } catch (error: any | null) {
                console.log('確認人員資訊失敗')
            }
        }

        return {
            emp_name: part_emp_name,
            emp_number: part_emp_number,
            emp_position: part_emp_position
        }
    }

    const handleConfirmPickUp = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const { emp_name, emp_number, emp_position } = await checkMemberIdentify()

            const paramsInner = dataSelect.map((item) => ({
                ...item,
                picking_dept: emp_position ?? '',
                picking_name: emp_name ?? '',
                picking_memberid: emp_number ?? ''
            }));

            const response = await axios.post(`${apiBaseUrl}/ingredients/pickUp`, {
                items: paramsInner
            });
            console.log("送出成功：", response.data);
            onComplete();
        } catch (error) {
            console.error("發送失敗：", error);
        } finally {
            setLoading(false);
        }
    };

    // 從後端抓出倉庫及倉位
    const handleTakeStockAndLocation = async () => {

        try {
            const repsonse = await axios.get(
                `${apiBaseUrl}/ingredients/handleTakeStockAndLocation`
            )
            const dataObj = repsonse.data?.stockData || repsonse.data?.data;
            if (dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)) {
                setStockMap(dataObj);
                const stockKeys = Object.keys(dataObj);
                const allLocs = Array.from(new Set(Object.values(dataObj).flat() as string[]));

                setOptions_stock(prev => JSON.stringify(prev) === JSON.stringify(stockKeys) ? prev : stockKeys);
                setOptions_location(prev => JSON.stringify(prev) === JSON.stringify(allLocs) ? prev : allLocs);
            } else {
                const stockResponse = repsonse.data?.stock_list || [];
                const locationResponse = repsonse.data?.location_list || [];

                setOptions_stock(prev => JSON.stringify(prev) === JSON.stringify(stockResponse) ? prev : stockResponse);
                setOptions_location(prev => JSON.stringify(prev) === JSON.stringify(locationResponse) ? prev : locationResponse);
            }
        } catch (error: any | null) {
            console.log('抓不回倉庫 與 倉位 資料')
        }
    }

    // 根據物料項目的倉庫取得對應可選倉位
    const getLocationsForWarehouse = (warehouse: string, currentLoc: string) => {
        let locs = warehouse && stockMap[warehouse] ? stockMap[warehouse] : options_location;
        if (currentLoc && !locs.includes(currentLoc)) {
            locs = [...locs, currentLoc];
        }
        return locs;
    };

    useEffect(() => {
        dataSelect.forEach(item => {
            const { warehousetype, stack_position } = item
            if (warehousetype && !options_stock.includes(warehousetype)) {
                setOptions_stock(prev => [...prev, warehousetype]);
            }
            if (stack_position && !options_location.includes(stack_position)) {
                setOptions_location(prev => [...prev, stack_position]);
            }
        });
    }, [dataSelect])


    // useEffect 抓回 Stock 跟 location
    useEffect(() => {
        if (show) {
            handleTakeStockAndLocation()
        }
    }, [show])

    return (
        <>
            {
                loading && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        flexDirection: 'column'
                    }}>
                        <div className="spinner-border text-primary" role="status">
                            <span className="visually-hidden">Loading...</span>
                        </div>
                    </div>
                )
            }
            {
                <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
                    <Modal.Header closeButton>
                        <Modal.Title className="title_Albert">部門領料申請與確認</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <div>
                            <div className="table-responsive mb-3" style={{ overflow: 'auto', maxHeight: '60vh' }}>
                                <p className="mt-3">總選取:  {selectedData?.length || 0} 筆</p>
                                <table className="table table-striped table-bordered table-hover" style={{ whiteSpace: 'nowrap' }}>
                                    <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <th style={{ width: '150px' }}>物料QRcode</th>
                                            <th style={{ width: '120px' }}>物料代號</th>
                                            <th style={{ width: '200px' }}>物料名稱</th>
                                            <th style={{ width: '150px' }}>產品規格</th>
                                            <th style={{ width: '80px' }}>數量</th>
                                            <th style={{ width: '80px' }}>單位</th>
                                            <th style={{ width: '180px' }}>供應商名稱</th>
                                            <th style={{ width: '180px' }}>倉庫名稱</th>
                                            <th style={{ width: '180px' }}>倉位名稱</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dataSelect && dataSelect.length > 0 ? (
                                            dataSelect.map((item, index) => {
                                                const availableLocations = getLocationsForWarehouse(item.warehousetype, item.stack_position);
                                                return (
                                                    <tr key={item.uuid || index} className='overflowX-scroll'>
                                                        <td>{item.allocate_barcode_text}</td>
                                                        <td>{item.product_itemcode}</td>
                                                        <td>{item.product_name}</td>
                                                        <td>{item.specification}</td>
                                                        <td>{item.row_measure_val}</td>
                                                        <td>{item.row_unit}</td>
                                                        <td>{item.vender_name}</td>
                                                        <td>
                                                            <Select
                                                                value={options_stock.includes(item.warehousetype) ? item.warehousetype : ""}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (dataSelect[index]?.warehousetype === val) return;
                                                                    const newSelectedData = [...dataSelect];
                                                                    newSelectedData[index] = {
                                                                        ...newSelectedData[index],
                                                                        warehousetype: val,
                                                                        stack_position: ""
                                                                    };
                                                                    setDataSelect(newSelectedData);
                                                                }}
                                                                style={{ width: '100%' }}
                                                            >
                                                                {options_stock.map((opt, idx) => (
                                                                    <MenuItem key={idx} value={opt}>
                                                                        {opt}
                                                                    </MenuItem>
                                                                ))}
                                                            </Select>
                                                        </td>
                                                        <td>
                                                            <Select
                                                                value={availableLocations.includes(item.stack_position) ? item.stack_position : ""}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (dataSelect[index]?.stack_position === val) return;
                                                                    const newSelectedData = [...dataSelect];
                                                                    newSelectedData[index] = {
                                                                        ...newSelectedData[index],
                                                                        stack_position: val
                                                                    };
                                                                    setDataSelect(newSelectedData);
                                                                }}
                                                                style={{ width: '100%' }}
                                                            >
                                                                {availableLocations.map((opt, idx) => (
                                                                    <MenuItem key={idx} value={opt}>
                                                                        {opt}
                                                                    </MenuItem>
                                                                ))}
                                                            </Select>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={9} className="text-center">無選取資料</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={onHide} disabled={loading}>
                            關閉
                        </Button>
                        <Button variant="primary" onClick={handleConfirmPickUp} disabled={loading}>
                            {loading ? "處理中..." : "確認領料送出"}
                        </Button>
                    </Modal.Footer>
                </Modal>
            }
        </>
    );
};

export default React.memo(PartPickUp);
