import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Table } from 'react-bootstrap';
import axios from 'axios';
import config from '../../../../config';
import MessagePopup from '../../../../components/MessagePopup';

interface MaterialTransferApplyProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
    selectedItems: any[];
    departmentList?: string[];
    roomName?: string;
    onSuccess?: () => void;
}

type RowState = {
    transferQty: string;
    targetDept: string;
    reason: string;
    targetStore: string;
    targetLocation: string;
};

// 批量調撥 Sub-Modal 元件
interface BatchTransferModalProps {
    show: boolean;
    onHide: () => void;
    userName: string;
    userNumber: string;
    userDept: string;
    departmentList: string[];
    storeOptions: string[];
    locationOptions: any[];
    onConfirm: (batchConfig: {
        targetDept: string;
        targetStore: string;
        targetLocation: string;
        reason: string;
    }) => void;
}

const BatchTransferModal: React.FC<BatchTransferModalProps> = ({
    show,
    onHide,
    userName,
    userNumber,
    userDept,
    departmentList,
    storeOptions,
    locationOptions,
    onConfirm
}) => {
    const [batchDept, setBatchDept] = useState<string>('');
    const [batchStore, setBatchStore] = useState<string>('');
    const [batchLocation, setBatchLocation] = useState<string>('');
    const [batchReason, setBatchReason] = useState<string>('');

    const [modalWarning, setModalWarning] = useState<string>('');

    const availableLocations = locationOptions.filter((loc: any) =>
        loc.storeName === batchStore || loc.store_name === batchStore
    );

    const handleConfirm = () => {
        if (!batchDept) {
            setModalWarning('請選擇預計統一調撥至部門！');
            return;
        }
        onConfirm({
            targetDept: batchDept,
            targetStore: batchStore,
            targetLocation: batchLocation,
            reason: batchReason
        });
        onHide();
    };

    return (
        <Modal show={show} onHide={onHide} centered backdrop="static" size="lg">
            <Modal.Body className="p-4" style={{ borderRadius: '15px' }}>
                <div className="d-flex justify-content-end mb-2">
                    <button type="button" className="btn-close fs-5" onClick={onHide} aria-label="Close"></button>
                </div>

                {modalWarning && (
                    <div className="alert alert-warning py-1 px-2 mb-2 text-center" style={{ fontSize: '0.85rem' }}>
                        {modalWarning}
                    </div>
                )}

                <Form.Group className="mb-3">
                    <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>調撥人名稱(工號):</Form.Label>
                    <Form.Control
                        type="text"
                        readOnly
                        value={`${userName}(${userNumber})`}
                        style={{ backgroundColor: '#d0d5dd', color: '#333', fontWeight: 'bold' }}
                    />
                </Form.Group>

                <Form.Group className="mb-3">
                    <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>調撥人所屬部門</Form.Label>
                    <Form.Control
                        type="text"
                        readOnly
                        value={userDept}
                        style={{ backgroundColor: '#d0d5dd', color: '#333', fontWeight: 'bold' }}
                    />
                </Form.Group>

                <Form.Group className="mb-3">
                    <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>預計統一調撥至部門:</Form.Label>
                    <Form.Select
                        value={batchDept}
                        onChange={(e) => {
                            setBatchDept(e.target.value);
                            setModalWarning('');
                        }}
                    >
                        <option value="">部門選擇 ▼</option>
                        {departmentList.filter(d => d && d !== '部門選擇').map((dept, idx) => (
                            <option key={idx} value={dept}>{dept}</option>
                        ))}
                    </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                    <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>倉庫移至</Form.Label>
                    <Form.Select
                        value={batchStore}
                        onChange={(e) => {
                            setBatchStore(e.target.value);
                            setBatchLocation('');
                        }}
                    >
                        <option value="">預設值為 領料時填入值</option>
                        {storeOptions.map((st, idx) => (
                            <option key={idx} value={st}>{st}</option>
                        ))}
                    </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                    <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>倉位移至</Form.Label>
                    <Form.Select
                        value={batchLocation}
                        disabled={!batchStore}
                        onChange={(e) => setBatchLocation(e.target.value)}
                    >
                        <option value="">預設值為 領料時填入值</option>
                        {availableLocations.map((loc: any, idx: number) => (
                            <option key={idx} value={loc.location}>{loc.location}</option>
                        ))}
                    </Form.Select>
                </Form.Group>

                <Form.Group className="mb-4">
                    <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>調撥原因</Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={3}
                        placeholder="請輸入調撥原因"
                        value={batchReason}
                        onChange={(e) => setBatchReason(e.target.value)}
                    />
                </Form.Group>

                <div className="d-flex justify-content-center gap-3">
                    <Button
                        variant="success"
                        className="rounded-pill px-4 py-2 fw-bold text-white shadow-sm"
                        style={{ backgroundColor: '#00c853', borderColor: '#00c853', minWidth: '110px' }}
                        onClick={handleConfirm}
                    >
                        確認<div style={{ fontSize: '0.7rem', fontWeight: 'normal' }}>[Confirm]</div>
                    </Button>
                    <Button
                        variant="danger"
                        className="rounded-pill px-4 py-2 fw-bold text-white shadow-sm"
                        style={{ backgroundColor: '#ff3d00', borderColor: '#ff3d00', minWidth: '110px' }}
                        onClick={onHide}
                    >
                        取消<div style={{ fontSize: '0.7rem', fontWeight: 'normal' }}>[Cancel]</div>
                    </Button>
                </div>
            </Modal.Body>
        </Modal>
    );
};

const MaterialTransferApply: React.FC<MaterialTransferApplyProps> = ({
    show,
    onHide,
    centered,
    selectedItems,
    departmentList = [],
    onSuccess,
}) => {
    const apiBaseUrl = config.apiBaseUrl;

    // 從 localStorage 抓取使用者資訊
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userName = user.reg_schedulename ?? '抓取資料錯誤';
    const userNumber = user.memberID ?? '抓取資料錯誤';
    const userDept = Array.isArray(user.positionarea)
        ? user.positionarea.join(', ')
        : (user.positionarea || user.department || user.userDept || '');

    const roomKey = 'Ingredients_EachDepartment_management_room';

    // console.log('selectedItems 確認 : ',
    //     typeof selectedItems, " | ",
    //     selectedItems
    // )

    // 倉庫與倉位下拉選單資料
    const [storeOptions, setStoreOptions] = useState<string[]>([]);
    const [locationOptions, setLocationOptions] = useState<any[]>([]);

    // 各資料列獨立狀態
    const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

    // 控制「批量調撥」Sub-Modal 顯示
    const [batchModalShow, setBatchModalShow] = useState<boolean>(false);

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

    const getItemKey = (item: any, idx?: number) => item?.uuid || item?.id || item?.form_id || idx;

    // 從後端抓出倉庫與倉位清單
    useEffect(() => {
        const fetchStoreAndLocations = async () => {
            try {
                const response = await axios.get(`${apiBaseUrl}/ingredients/handleUseStockFindLocation`);
                const rawData = Array.isArray(response.data)
                    ? response.data
                    : (response.data?.data || response.data?.stock_list || []);

                // console.log('確認 倉庫資料回傳是啥  : ', response.data);

                // 取出不重複的倉庫名稱
                const stores = Array.from(new Set(rawData.map((item: any) => item.storeName).filter(Boolean)));

                setStoreOptions(prev => JSON.stringify(prev) === JSON.stringify(stores) ? prev : stores as string[]);
                setLocationOptions(prev => JSON.stringify(prev) === JSON.stringify(rawData) ? prev : rawData);
            } catch (error) {
                console.error('抓取倉庫與倉位失敗:', error);
            }
        };

        if (show) {
            const initialStates: Record<string, RowState> = {};
            selectedItems.forEach((item, idx) => {
                const key = getItemKey(item, idx);
                const balanceVal = getAvailableBalance(item);
                initialStates[key] = {
                    transferQty: String(balanceVal),
                    targetDept: '',
                    reason: '',
                    targetStore: item.warehousetype || '',
                    targetLocation: item.stack_position || ''
                };
            });
            setRowStates(prev => JSON.stringify(prev) === JSON.stringify(initialStates) ? prev : initialStates);
            fetchStoreAndLocations();
        }
    }, [show, apiBaseUrl, selectedItems]);

    // 更新單列欄位值
    const handleRowStateChange = (key: string | number, field: keyof RowState, value: string) => {
        setRowStates(prev => {
            const current = prev[key] || { transferQty: '', targetDept: '', reason: '', targetStore: '', targetLocation: '' };
            const nextRow = { ...current, [field]: value };
            if (field === 'targetStore') {
                nextRow.targetLocation = '';
            }
            return { ...prev, [key]: nextRow };
        });
    };

    const getAvailableBalance = (item: any): number => {
        if (item?.balance !== undefined && item?.balance !== null && !isNaN(Number(item.balance))) {
            return Number(item.balance);
        }
        if (item?.row_measure_val !== undefined && item?.row_measure_val !== null && !isNaN(Number(item.row_measure_val))) {
            return Number(item.row_measure_val);
        }
        if (item?.quantity !== undefined && item?.quantity !== null && !isNaN(Number(item.quantity))) {
            return Number(item.quantity);
        }
        return 0;
    };

    // 批量調撥 Sub-Modal 確認後的套用與直接送出邏輯
    const handleBatchConfirm = (batchConfig: {
        targetDept: string;
        targetStore: string;
        targetLocation: string;
        reason: string;
    }) => {
        const nextStates: Record<string, RowState> = { ...rowStates };
        selectedItems.forEach((item, idx) => {
            const key = getItemKey(item, idx);
            const balanceVal = getAvailableBalance(item);
            const currentQty = parseFloat(nextStates[key]?.transferQty || '');
            const validQty = (!isNaN(currentQty) && currentQty > 0 && currentQty <= balanceVal + 0.00001)
                ? String(currentQty)
                : String(balanceVal);

            nextStates[key] = {
                transferQty: validQty,
                targetDept: batchConfig.targetDept,
                reason: batchConfig.reason || nextStates[key]?.reason || '',
                targetStore: batchConfig.targetStore || nextStates[key]?.targetStore || item.warehousetype || '',
                targetLocation: batchConfig.targetLocation || nextStates[key]?.targetLocation || item.stack_position || ''
            };
        });

        setRowStates(nextStates);
        handleSubmit(nextStates);
    };

    // 依選擇的倉庫過濾可選倉位
    const getLocationsForStore = (storeName: string) => {
        if (!storeName || storeName === '倉庫選擇') return [];
        return locationOptions.filter((loc: any) => loc.storeName === storeName || loc.store_name === storeName);
    };

    // 主畫面按下「確認」送出調撥申請
    const handleSubmit = async (overrideRowStates?: Record<string, RowState> | any) => {
        const effectiveStates = (overrideRowStates && !('nativeEvent' in overrideRowStates) && typeof overrideRowStates === 'object')
            ? overrideRowStates
            : rowStates;

        console.log('確認現在的 rowStates 內容 :', JSON.stringify(rowStates));
        console.log('確認現在的 effectiveStates 內容 :', effectiveStates);


        if (selectedItems.length === 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '未選擇資料',
                message: '請先勾選欲調撥的物料！',
                autoClose: true,
                autoCloseDelay: 3000
            });
            return;
        }

        // 單一調撥檢查：驗證是否有未填寫必填欄位
        const missingErrors: string[] = [];

        selectedItems.forEach((item, idx) => {
            const key = getItemKey(item, idx);
            const balanceVal = getAvailableBalance(item);
            const rState = effectiveStates[key] || { transferQty: String(balanceVal), targetDept: '', reason: '', targetStore: item.warehousetype || '', targetLocation: item.stack_position || '' };
            const qty = parseFloat(rState.transferQty);

            const itemLabel = item.allocate_barcode_text || item.form_id || `第 ${idx + 1} 筆`;
            const validLocations = getLocationsForStore(rState.targetStore);
            const isStoreValid = Boolean(rState.targetStore && rState.targetStore !== '倉庫選擇' && storeOptions.includes(rState.targetStore));
            const isLocationValid = Boolean(rState.targetLocation && rState.targetLocation !== '倉位選擇' && validLocations.some((loc: any) => (loc.location || loc.stack_position) === rState.targetLocation));
            const isDeptValid = Boolean(rState.targetDept && rState.targetDept !== '部門選擇' && rState.targetDept.trim() !== '');

            if (balanceVal <= 0) {
                missingErrors.push(`[${itemLabel}]：剩餘可調撥數量為 0，無法進行調撥申請`);
            } else if (isNaN(qty) || qty <= 0 || qty > balanceVal + 0.00001) {
                missingErrors.push(`[${itemLabel}]：預調撥數量 (${rState.transferQty || 0}) 未輸入、不合法或超過可調撥總數 (${balanceVal})`);
            }
            if (!isDeptValid) {
                missingErrors.push(`[${itemLabel}]：未選擇「調撥至部門」`);
            }
            if (!rState.reason || !rState.reason.trim()) {
                missingErrors.push(`[${itemLabel}]：未輸入「調撥原因」`);
            }
            if (!isStoreValid) {
                missingErrors.push(`[${itemLabel}]：未選擇「倉庫移至」`);
            }
            if (!isLocationValid) {
                missingErrors.push(`[${itemLabel}]：未選擇「倉位移至」`);
            }
        });

        // 若有任意未填欄位，跳出提醒並不給送出
        if (missingErrors.length > 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '調撥資訊未完整填寫',
                message: `無法送出調撥申請！請完整填寫以下項目的調撥欄位：\n\n${missingErrors.slice(0, 5).join('\n')}${missingErrors.length > 5 ? `\n...等共 ${missingErrors.length} 個缺失欄位` : ''}`,
                autoClose: false,
                autoCloseDelay: 3000
            });
            return; // 不給送出
        }

        // 整理傳送的調撥資料
        const transferPayload = selectedItems.map((item, idx) => {
            const key = getItemKey(item, idx);
            const rowState = effectiveStates[key] ?? { transferQty: '0', targetDept: '', reason: '', targetStore: '', targetLocation: '' };
            return {
                ...item,
                transferQuantity: parseFloat(rowState.transferQty),
                targetDepartment: rowState.targetDept,
                reason: rowState.reason,
                targetWarehouse: rowState.targetStore,
                targetLocation: rowState.targetLocation
            };
        });

        console.log('送出物料調撥申請 Payload:', transferPayload);

        try {
            const response = await axios.post(`${apiBaseUrl}/ingredients/requestTransferApply`, {
                payload: transferPayload,
                roomName: roomKey,
                userName: userName,
                userNumber: userNumber,
                userDept: userDept,
            });

            if (
                String(response.data?.status) === '200' ||
                response.data?.status === 'success' ||
                response.data?.success === true ||
                String(response.data?.data?.status) === '200' ||
                response.data?.data?.success === true
            ) {
                setMessagePopup({
                    show: true,
                    type: 'success',
                    title: '申請成功',
                    message: `已成功送出 ${selectedItems.length} 筆物料調撥申請！`,
                    autoClose: true,
                    autoCloseDelay: 3000
                });
                setTimeout(() => {
                    if (onSuccess) onSuccess();
                    onHide();
                }, 1500);
            } else {
                setMessagePopup({
                    show: true,
                    type: 'error',
                    title: '調撥失敗',
                    message: response.data.message || '調撥申請失敗',
                    autoClose: false
                });
            }

        } catch (error: any | unknown) {
            const backendMsg = error?.response?.data?.message || error?.message || '調撥申請失敗';
            console.error('error message about 送出調撥申請 :', backendMsg);
            setMessagePopup({
                show: true,
                type: 'error',
                title: '調撥失敗',
                message: backendMsg,
                autoClose: false
            });
        }
    };

    const isAvailable = (key: string | number, field: keyof RowState, value: string, balanceVal: number, item: any) => {
        if (field === 'transferQty') {
            const qty = parseFloat(value);
            const itemLabel = item?.form_id || item?.allocate_barcode_text || '該物料';

            if (isNaN(qty) || qty <= 0) {
                return;
            }

            if (qty > balanceVal) {
                setMessagePopup({
                    show: true,
                    type: 'warning',
                    title: '數量超限',
                    message: `[${itemLabel}]：預調撥數量 (${qty}) 不能超過可調撥總數 (${balanceVal})`,
                    autoClose: true,
                    autoCloseDelay: 3000
                });
                // 自動將輸入值修正為最大可調撥上限
                handleRowStateChange(key, 'transferQty', String(balanceVal));
            }
        }
    };

    const handleCheckStock = (key: string | number, field: keyof RowState, value: string, balanceVal?: number, item?: any) => {
        const currentRow = rowStates[key];
        if (!currentRow) return;
        if (field === 'targetStore' && currentRow.targetStore === value) return;

    };

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
                !batchModalShow && (
                    <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
                        <Modal.Body className="p-4">
                            {/* Header 抬頭資訊 */}
                            <div className="d-flex justify-content-between align-items-start mb-3">
                                <div className="fw-bold" style={{ fontSize: '2rem', color: '#000' }}>
                                    物料調撥申請
                                </div>
                                <div className="text-start" style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                                    <div><strong>申請調撥人名稱:</strong> {userName}</div>
                                    <div><strong>申請調撥人工號:</strong> {userNumber}</div>
                                    {userDept && <div><strong>申請調撥部門:</strong> {userDept}</div>}
                                </div>
                                <button
                                    type="button"
                                    className="btn-close fs-4"
                                    aria-label="Close"
                                    onClick={onHide}
                                ></button>
                            </div>

                            {/* Action Toolbar 批量調撥按鈕 */}
                            <div className="d-flex align-items-center mb-3">
                                <Button
                                    variant="outline-dark"
                                    className="rounded-pill px-4 py-1 fw-bold me-3"
                                    onClick={() => setBatchModalShow(true)}
                                    style={{ borderColor: '#333' }}
                                >
                                    批量調撥
                                </Button>
                                <span className="fw-bold" style={{ color: 'red', fontSize: '0.9rem' }}>
                                    **全選調撥 調撥數量預設為可調撥數總數
                                </span>
                            </div>

                            {/* 表格頂部提示文字 */}
                            {/* <div className="text-end fw-bold mb-1" style={{ color: 'red', fontSize: '0.85rem' }}>
                                *選完倉庫倉位才依倉庫資訊與開放被選擇
                            </div> */}

                            {/* 資料表格 */}
                            <div className="table-responsive mb-5" style={{ overflow: 'auto', maxHeight: '60vh' }}>
                                <Table bordered hover className="mb-0 text-center align-middle" style={{ whiteSpace: 'nowrap' }}>
                                    <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <th>物料QRcode</th>
                                            <th>物料名稱</th>
                                            <th>產品規格</th>
                                            <th>可調撥數量</th>
                                            <th>預調撥數量</th>
                                            <th>調撥至部門</th>
                                            <th>倉庫移至</th>
                                            <th>倉位移至</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedItems && selectedItems.length > 0 ? (
                                            selectedItems.map((item, index) => {
                                                const key = getItemKey(item, index);
                                                const balanceVal = getAvailableBalance(item);
                                                const rState = rowStates[key] || { transferQty: '', targetDept: '', reason: '', targetStore: '', targetLocation: '' };
                                                const validLocations = getLocationsForStore(rState.targetStore);

                                                return (
                                                    <React.Fragment key={key}>
                                                        {/* 筆與筆之間的 0.8rem 空隙 */}
                                                        {index > 0 && (
                                                            <tr style={{ height: '0.3rem', backgroundColor: 'transparent' }}>
                                                                <td colSpan={8} style={{ border: 'none', padding: 0, backgroundColor: 'transparent' }} />
                                                            </tr>
                                                        )}
                                                        <tr style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa' }}>
                                                            <td >{item.allocate_barcode_text ?? '-'}</td>
                                                            <td >{item.product_name || '-'}</td>
                                                            <td >{item.specification || '-'}</td>
                                                            <td className="fw-bold" >{balanceVal} {item.row_unit || ''}</td>
                                                            {/* 預調撥數量 */}
                                                            <td style={{ width: '110px', }}>
                                                                <Form.Control
                                                                    type="number"
                                                                    size="sm"
                                                                    min="0"
                                                                    max={balanceVal}
                                                                    step="any"
                                                                    className="text-center"
                                                                    placeholder="數量"
                                                                    value={rState.transferQty}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        handleRowStateChange(key, 'transferQty', val);
                                                                        const qty = parseFloat(val);
                                                                        if (!isNaN(qty) && qty > balanceVal) {
                                                                            setMessagePopup({
                                                                                show: true,
                                                                                type: 'warning',
                                                                                title: '數量超限',
                                                                                message: `[${item.allocate_barcode_text || '物料'}]：預調撥數量 (${qty}) 不能超過剩餘可調撥總數 (${balanceVal})`,
                                                                                autoClose: true,
                                                                                autoCloseDelay: 3000
                                                                            });
                                                                            handleRowStateChange(key, 'transferQty', String(balanceVal));
                                                                        }
                                                                    }}
                                                                    onBlur={() => isAvailable(key, 'transferQty', rState.transferQty, balanceVal, item)}
                                                                />
                                                            </td>
                                                            {/* 調撥至部門 */}
                                                            <td style={{ width: '130px' }}>
                                                                <Form.Select
                                                                    size="sm"
                                                                    className="text-center rounded-pill"
                                                                    value={rState.targetDept}
                                                                    onChange={(e) => handleRowStateChange(key, 'targetDept', e.target.value)}
                                                                >
                                                                    <option value="">部門選擇 ▼</option>
                                                                    {departmentList.filter(d => d && d !== '部門選擇').map((dept, dIdx) => (
                                                                        <option key={dIdx} value={dept}>{dept}</option>
                                                                    ))}
                                                                </Form.Select>
                                                            </td>
                                                            {/* 倉庫移至 */}
                                                            <td style={{ width: '130px', }}>
                                                                <Form.Select
                                                                    size="sm"
                                                                    className="text-center rounded-pill"
                                                                    value={rState.targetStore}
                                                                    onChange={(e) => handleRowStateChange(key, 'targetStore', e.target.value)}
                                                                    onBlur={(e) => handleCheckStock(key, 'targetStore', e.target.value, balanceVal, item)}
                                                                >
                                                                    <option value="">倉庫選擇 ▼</option>
                                                                    {storeOptions.map((st, sIdx) => (
                                                                        <option key={sIdx} value={st}>{st}</option>
                                                                    ))}
                                                                </Form.Select>
                                                            </td>
                                                            {/* 倉位移至 (選完倉庫才開放) */}
                                                            <td style={{ width: '130px' }} >
                                                                <Form.Select
                                                                    size="sm"
                                                                    className="text-center rounded-pill"
                                                                    disabled={!rState.targetStore}
                                                                    value={rState.targetLocation}
                                                                    onChange={(e) => handleRowStateChange(key, 'targetLocation', e.target.value)}
                                                                >
                                                                    <option value="">倉位選擇 ▼</option>
                                                                    {validLocations.map((loc: any, lIdx: number) => (
                                                                        <option key={lIdx} value={loc.location}>{loc.location}</option>
                                                                    ))}
                                                                </Form.Select>
                                                            </td>
                                                        </tr>
                                                        {/* 單獨一列：調撥原因 */}
                                                        <tr style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa' }}>
                                                            <td colSpan={2} className="text-end fw-bold align-middle bg-light text-secondary" style={{ fontSize: '0.85rem' }}>
                                                                調撥原因：
                                                            </td>
                                                            <td colSpan={6} className="align-middle">
                                                                <Form.Control
                                                                    as="textarea"
                                                                    size="sm"
                                                                    className="text-start "
                                                                    placeholder="請輸入此筆物料之調撥原因"
                                                                    value={rState.reason}
                                                                    onChange={(e) => handleRowStateChange(key, 'reason', e.target.value)}
                                                                />
                                                            </td>
                                                        </tr>
                                                    </React.Fragment>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={8} className="text-center text-muted">
                                                    查無勾選的調撥物料資料
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </div>

                            {/* 下方紅色說明標註 */}
                            <div className="text-center fw-bold" style={{ color: 'red', fontSize: '0.85rem', lineHeight: '1.8', marginTop: '45px' }}>
                                {/* <div>** 若有任一未填寫 該調撥數量則回到原部門不動</div> */}
                                <div>** 提出申請後該物料 調撥 、 退料 數量會直接先從原數量扣除，待主管審核通過與否在決定是加回還是扣除</div>
                            </div>

                            {/* Footer 大按鈕區 (確認 / 關閉) */}
                            <div className="d-flex justify-content-center gap-4 mt-4 mb-2">
                                <Button
                                    variant="success"
                                    className="rounded-pill px-5 py-2 fw-bold text-white shadow-sm"
                                    style={{ backgroundColor: '#00c853', borderColor: '#00c853', minWidth: '170px', fontSize: '1.25rem' }}
                                    onClick={handleSubmit}
                                >
                                    確認<div style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>[Confirm]</div>
                                </Button>
                                <Button
                                    variant="danger"
                                    className="rounded-pill px-5 py-2 fw-bold text-white shadow-sm"
                                    style={{ backgroundColor: '#ff3d00', borderColor: '#ff3d00', minWidth: '170px', fontSize: '1.25rem' }}
                                    onClick={onHide}
                                >
                                    關閉<div style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>[Cancel]</div>
                                </Button>
                            </div>
                        </Modal.Body>
                    </Modal >
                )
            }

            {/* 批量調撥 Sub-Modal */}
            {
                batchModalShow && (
                    <BatchTransferModal
                        show={batchModalShow}
                        onHide={() => setBatchModalShow(false)}
                        userName={userName}
                        userNumber={userNumber}
                        userDept={userDept}
                        departmentList={departmentList}
                        storeOptions={storeOptions}
                        locationOptions={locationOptions}
                        onConfirm={handleBatchConfirm}
                    />
                )
            }
        </>
    );
};

export default React.memo(MaterialTransferApply);
