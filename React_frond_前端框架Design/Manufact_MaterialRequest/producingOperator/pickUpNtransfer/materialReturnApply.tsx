import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Table } from 'react-bootstrap';
import axios from 'axios';
import config from '../../../../config';
import MessagePopup from '../../../../components/MessagePopup';
import { INITIAL_RETURN_REASON_OPTIONS, ReturnReasonOption } from '../../../../constants/returnReasons';
import moment from 'moment-timezone';


interface MaterialReturnApplyProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
    selectedItems: any[];
    onSuccess?: () => void;
}

type ReturnRowState = {
    returnQty: string;
    reason: string;
    targetStore: string;
    targetLocation: string;
};

// 批量退料 Sub-Modal 元件
interface BatchReturnModalProps {
    show: boolean;
    onHide: () => void;
    userName: string;
    userNumber: string;
    userDept: string;
    storeOptions: string[];
    locationOptions: any[];
    returnReasonOptions: ReturnReasonOption[];
    onAddCustomReason: (newReason: string) => void;
    onConfirm: (batchConfig: {
        reason: string;
        targetStore: string;
        targetLocation: string;
    }) => void;
}

const BatchReturnModal: React.FC<BatchReturnModalProps> = ({
    show,
    onHide,
    userName,
    userNumber,
    userDept,
    storeOptions,
    locationOptions,
    returnReasonOptions,
    onAddCustomReason,
    onConfirm
}) => {
    const [batchReason, setBatchReason] = useState<string>('用剩退料');
    const [batchStore, setBatchStore] = useState<string>('');
    const [batchLocation, setBatchLocation] = useState<string>('');
    const [showBatchCustomModal, setShowBatchCustomModal] = useState<boolean>(false);
    const [customReasonInput, setCustomReasonInput] = useState<string>('');

    const availableLocations = locationOptions.filter((loc: any) =>
        loc.storeName === batchStore || loc.store_name === batchStore
    );

    const handleBatchCustomConfirm = () => {
        const trimmed = customReasonInput.trim();
        if (trimmed) {
            onAddCustomReason(trimmed);
            setBatchReason(trimmed);
        }
        setCustomReasonInput('');
        setShowBatchCustomModal(false);
    };

    const handleConfirm = () => {
        onConfirm({
            reason: batchReason,
            targetStore: batchStore,
            targetLocation: batchLocation
        });
        onHide();
    };

    return (
        <>
            <Modal show={show} onHide={onHide} centered backdrop="static" size="lg">
                <Modal.Body className="p-4" style={{ borderRadius: '15px' }}>
                    <div className="d-flex justify-content-end mb-2">
                        <button type="button" className="btn-close fs-5" onClick={onHide} aria-label="Close"></button>
                    </div>

                    <Form.Group className="mb-3">
                        <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>退料人名稱(工號):</Form.Label>
                        <Form.Control
                            type="text"
                            readOnly
                            value={`${userName}(${userNumber})`}
                            style={{ backgroundColor: '#d0d5dd', color: '#333', fontWeight: 'bold' }}
                        />
                    </Form.Group>

                    {userDept !== '' && (
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>退料人所屬部門</Form.Label>
                            <Form.Control
                                type="text"
                                readOnly
                                value={userDept}
                                style={{ backgroundColor: '#d0d5dd', color: '#333', fontWeight: 'bold' }}
                            />
                        </Form.Group>
                    )}

                    <Form.Group className="mb-3">
                        <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>退料原因</Form.Label>
                        <Form.Select
                            value={batchReason}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '其他原因' || val === '+ 新增退料原因' || val === '其他') {
                                    setCustomReasonInput('');
                                    setShowBatchCustomModal(true);
                                } else {
                                    setBatchReason(val);
                                }
                            }}
                        >
                            {returnReasonOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Form.Select>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>退回倉庫</Form.Label>
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

                    <Form.Group className="mb-4">
                        <Form.Label className="fw-bold mb-1" style={{ fontSize: '0.9rem' }}>退回倉位</Form.Label>
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

            {/* 批量退料自訂原因 Sub-Modal */}
            {showBatchCustomModal && (
                <Modal show={showBatchCustomModal} onHide={() => setShowBatchCustomModal(false)} centered backdrop="static">
                    <Modal.Body className="p-4">
                        <div className="fw-bold" style={{ fontSize: '2rem', color: '#000', textAlign: 'center', marginBottom: '1rem' }}>
                            新增退料原因
                        </div>
                        <div className="d-flex flex-column">
                            <input
                                value={customReasonInput}
                                onChange={(e) => setCustomReasonInput(e.target.value)}
                            />
                        </div>
                    </Modal.Body>
                    <Modal.Footer className="justify-content-center">
                        <div className="d-flex justify-content-center align-items-center gap-2 w-100">
                            <Button variant="primary" onClick={handleBatchCustomConfirm}>確定</Button>
                            <Button variant="secondary" onClick={() => setShowBatchCustomModal(false)}>取消</Button>
                        </div>
                    </Modal.Footer>
                </Modal>
            )}
        </>
    );
};

const MaterialReturnApply: React.FC<MaterialReturnApplyProps> = ({
    show,
    onHide,
    centered,
    selectedItems,
    onSuccess,
}) => {
    const apiBaseUrl = config.apiBaseUrl;

    // 使用者資訊
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userName = user.reg_schedulename ?? '';
    const userNumber = user.memberID || user.empNo || '349';
    const rawAuth = user.authStatus;
    const authStatus = (rawAuth === null || rawAuth === undefined || rawAuth === '') ? 0 : Number(rawAuth);
    const userDept = authStatus > 0
        ? ''
        : (Array.isArray(user.positionArea) ? user.positionArea.join(', ') : (user.positionArea || ''));
    const roomKey = 'Ingredients_EachDepartment_management_room';

    // 倉庫與倉位下拉選單資料
    const [storeOptions, setStoreOptions] = useState<string[]>([]);
    const [locationOptions, setLocationOptions] = useState<any[]>([]);

    // 各資料列獨立狀態
    const [rowStates, setRowStates] = useState<Record<string, ReturnRowState>>({});

    // 控制「批量退料」Sub-Modal 顯示
    const [batchModalShow, setBatchModalShow] = useState<boolean>(false);

    // 定義退料原因下拉選單狀態 (從 constants/returnReasons 載入預設選單)
    const [returnReasonOptions, setReturnReasonOptions] = useState<ReturnReasonOption[]>(INITIAL_RETURN_REASON_OPTIONS);

    // 自訂退料原因模組相關狀態
    const [showCustomReturnModal, setShowCustomReturnModal] = useState<boolean>(false);
    const [targetCustomReasonKey, setTargetCustomReasonKey] = useState<string | number | null>(null);
    const [customReturnModalContent, setCustomReturnModalContent] = useState<{ value: string, label: string }>(
        {
            value: '',
            label: ''
        }
    )

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

    const getItemKey = (item: any, idx?: number) => item?.uuid || item?.id || item?.form_id || item?.allocate_barcode_text || idx;

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

    // 從後端抓出倉庫與倉位清單
    useEffect(() => {
        const fetchStoreAndLocations = async () => {
            try {
                const response = await axios.get(`${apiBaseUrl}/ingredients/handleUseStockFindLocation`);
                const rawData = Array.isArray(response.data)
                    ? response.data
                    : (response.data?.data || response.data?.stock_list || []);

                const stores = Array.from(new Set(rawData.map((item: any) => item.storeName).filter(Boolean)));
                setStoreOptions(prev => JSON.stringify(prev) === JSON.stringify(stores) ? prev : stores as string[]);
                setLocationOptions(prev => JSON.stringify(prev) === JSON.stringify(rawData) ? prev : rawData as any[]);
            } catch (error) {
                console.error('抓取倉庫與倉位失敗:', error);
            }
        };

        if (show) {
            const initialStates: Record<string, ReturnRowState> = {};
            selectedItems.forEach((item, idx) => {
                const key = getItemKey(item, idx);
                const balanceVal = getAvailableBalance(item);
                initialStates[key] = {
                    returnQty: String(balanceVal),
                    reason: '用剩退料',
                    targetStore: item.warehousetype || '',
                    targetLocation: item.stack_position || ''
                };
            });
            setRowStates(prev => JSON.stringify(prev) === JSON.stringify(initialStates) ? prev : initialStates);
            fetchStoreAndLocations();
        }
    }, [show, apiBaseUrl, selectedItems]);

    // 更新單列欄位值
    const handleRowStateChange = (key: string | number, field: keyof ReturnRowState, value: string) => {
        if (field === 'reason' && (value === '其他原因' || value === '+ 新增退料原因')) {
            openCustomReturnModal(key);
        }
        setRowStates(prev => {
            const current = prev[key] || { returnQty: '', reason: '用剩退料', targetStore: '', targetLocation: '' };
            const nextRow = { ...current, [field]: value };
            if (field === 'targetStore') {
                nextRow.targetLocation = '';
            }
            return { ...prev, [key]: nextRow };
        });
    };

    // 批量退料 Sub-Modal 確認後的套用與直接送出邏輯
    const handleBatchConfirm = (batchConfig: {
        reason: string;
        targetStore: string;
        targetLocation: string;
    }) => {
        const nextStates: Record<string, ReturnRowState> = { ...rowStates };
        selectedItems.forEach((item, idx) => {
            const key = getItemKey(item, idx);
            const balanceVal = getAvailableBalance(item);
            const currentQty = parseFloat(nextStates[key]?.returnQty || '');
            const validQty = (!isNaN(currentQty) && currentQty > 0 && currentQty <= balanceVal + 0.00001)
                ? String(currentQty)
                : String(balanceVal);

            nextStates[key] = {
                returnQty: validQty,
                reason: batchConfig.reason || nextStates[key]?.reason || '用剩退料',
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

    // 主畫面按下「確認」送出退料申請
    const handleSubmit = async (overrideRowStates?: Record<string, ReturnRowState>) => {
        const effectiveStates = overrideRowStates || rowStates;

        if (selectedItems.length === 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '未選擇資料',
                message: '請先勾選欲退料的物料！',
                autoClose: true,
                autoCloseDelay: 3000
            });
            return;
        }

        // 驗證是否有未填寫的退料欄位
        const missingErrors: string[] = [];

        selectedItems.forEach((item, idx) => {
            const key = getItemKey(item, idx);
            const balanceVal = getAvailableBalance(item);
            const rState = effectiveStates[key] || { returnQty: String(balanceVal), reason: '用剩退料', targetStore: item.warehousetype || '', targetLocation: item.stack_position || '' };
            const qty = parseFloat(rState.returnQty);

            const itemLabel = item.allocate_barcode_text || item.form_id || `第 ${idx + 1} 筆`;
            const validLocations = getLocationsForStore(rState.targetStore);
            const isStoreValid = Boolean(rState.targetStore && rState.targetStore !== '倉庫選擇' && storeOptions.includes(rState.targetStore));
            const isLocationValid = Boolean(rState.targetLocation && rState.targetLocation !== '倉位選擇' && validLocations.some((loc: any) => (loc.location || loc.stack_position) === rState.targetLocation));

            if (balanceVal <= 0) {
                missingErrors.push(`[${itemLabel}]：剩餘可退料數量為 0，無法進行退料申請`);
            } else if (isNaN(qty) || qty <= 0 || qty > balanceVal + 0.00001) {
                missingErrors.push(`[${itemLabel}]：預退料數量 (${rState.returnQty || 0}) 未輸入或超過可退料總數 (${balanceVal})`);
            }
            if (!rState.reason || !rState.reason.trim()) {
                missingErrors.push(`[${itemLabel}]：未選擇「退料原因」`);
            }
            if (!isStoreValid) {
                missingErrors.push(`[${itemLabel}]：未選擇「退回倉庫」`);
            }
            if (!isLocationValid) {
                missingErrors.push(`[${itemLabel}]：未選擇「退回倉位」`);
            }
        });

        // 若有任意未填欄位，跳出提醒並不給送出
        if (missingErrors.length > 0) {
            setMessagePopup({
                show: true,
                type: 'warning',
                title: '退料資訊未完整填寫',
                message: `無法送出退料申請！請完整填寫以下項目的退料欄位：\n\n${missingErrors.slice(0, 5).join('\n')}${missingErrors.length > 5 ? `\n...等共 ${missingErrors.length} 個缺失欄位` : ''}`,
                autoClose: false,
                autoCloseDelay: 3000
            });
            return; // 不給送出
        }

        // 整理傳送的退料資料
        const returnPayload = selectedItems.map((item, idx) => {
            const key = getItemKey(item, idx);
            const rowState = effectiveStates[key] || { returnQty: '0', reason: '用剩退料', targetStore: '', targetLocation: '' };
            const returnQty = parseFloat(rowState.returnQty) || 0;
            const balanceVal = Number(item.balance !== undefined && item.balance !== null ? item.balance : (item.row_measure_val ?? 0));
            const date = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');

            // 四捨五入處理二進位浮點數計算誤差 (例如 80 - 79.9 = 0.09999999999999432)
            const remainingBalance = Math.round((balanceVal - returnQty) * 10000) / 10000;
            const isCostOver = (remainingBalance <= 0.00001) ? 1 : (item.iscostover || 0);

            return {
                ...item,
                returnQuantity: returnQty,
                reason: rowState.reason,
                targetWarehouse: rowState.targetStore,
                targetLocation: rowState.targetLocation,
                iscostover: isCostOver,
                iscostover_Time: isCostOver === 1 ? date : (item.iscostover_Time || null)
            };
        });

        console.log('送出物料退料申請 Payload:', returnPayload);

        try {
            const response = await axios.post(`${apiBaseUrl}/ingredients/requestReturnApply`, {
                payload: returnPayload,
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

                if (onSuccess) onSuccess();
                setMessagePopup({
                    show: true,
                    type: 'success',
                    title: '申請成功',
                    message: `已成功送出 ${selectedItems.length} 筆物料退料申請！`,
                    autoClose: true,
                    autoCloseDelay: 3000
                });
                setTimeout(() => {
                    onHide();
                }, 1500);
            } else {
                setMessagePopup({
                    show: true,
                    type: 'error',
                    title: '退料失敗',
                    message: response.data.message || '退料申請失敗',
                    autoClose: false
                });
            }

        } catch (error: any | unknown) {
            const backendMsg = error?.response?.data?.message || error?.message || '退料申請失敗';
            console.error('error message about 送出退料申請 :', backendMsg);
            setMessagePopup({
                show: true,
                type: 'error',
                title: '退料失敗',
                message: backendMsg,
                autoClose: false
            });
        }
    };

    const isAvailable = (key: string | number, field: keyof ReturnRowState, value: string, balanceVal: number, item: any) => {
        if (field === 'returnQty') {
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
                    message: `[${itemLabel}]：預退料數量 (${qty}) 不能超過可退料總數 (${balanceVal})`,
                    autoClose: true,
                    autoCloseDelay: 3000
                });
                handleRowStateChange(key, 'returnQty', String(balanceVal));
            }
        }
    };

    const openCustomReturnModal = (rowKey?: string | number) => {
        if (rowKey !== undefined) {
            setTargetCustomReasonKey(rowKey);
        }
        setCustomReturnModalContent({
            value: '',
            label: ''
        });
        setShowCustomReturnModal(true);
    };

    const closeCustomReturnModal = () => {
        setCustomReturnModalContent({
            value: '',
            label: ''
        });
        setTargetCustomReasonKey(null);
        setShowCustomReturnModal(false);
    };

    const handleCustomReturnModalContentChange = (field: 'value' | 'label', value: string) => {
        setCustomReturnModalContent({
            value: value,
            label: value
        });
    };

    const handleAddCustomReason = (newReason: string) => {
        const trimmed = newReason.trim();
        if (!trimmed) return;
        setReturnReasonOptions(prev => {
            if (prev.some(opt => opt.value === trimmed)) return prev;
            const newOpts = [...prev];
            const addIdx = newOpts.findIndex(opt => opt.value === '+ 新增退料原因');
            if (addIdx !== -1) {
                newOpts.splice(addIdx, 0, { value: trimmed, label: trimmed });
                return newOpts;
            }
            return [...prev, { value: trimmed, label: trimmed }];
        });
    };

    const handleCustomReturnModalConfirm = () => {
        const trimmedValue = customReturnModalContent.value.trim();
        if (trimmedValue) {
            handleAddCustomReason(trimmedValue);

            // 若由表格某一列觸發，自動幫該列套用新退料原因
            if (targetCustomReasonKey !== null) {
                setRowStates(prev => {
                    const current = prev[targetCustomReasonKey] || { returnQty: '', reason: '用剩退料', targetStore: '', targetLocation: '' };
                    return { ...prev, [targetCustomReasonKey]: { ...current, reason: trimmedValue } };
                });
            }
        }
        closeCustomReturnModal();
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
                showCustomReturnModal && (
                    <Modal show={showCustomReturnModal} onHide={closeCustomReturnModal} centered backdrop="static">
                        <Modal.Body className="p-4">
                            <div className="fw-bold" style={{ fontSize: '2rem', color: '#000', textAlign: 'center', marginBottom: '1rem' }}>
                                新增退料原因
                            </div>
                            <div className="d-flex flex-column">
                                <input value={customReturnModalContent.value} onChange={(e) => handleCustomReturnModalContentChange('value', e.target.value)}></input>
                            </div>
                        </Modal.Body>
                        <Modal.Footer className="justify-content-center">
                            <div className="d-flex justify-content-center align-items-center gap-2 w-100">
                                <Button variant="primary" onClick={handleCustomReturnModalConfirm}>確定</Button>
                                <Button variant="secondary" onClick={closeCustomReturnModal}>取消</Button>
                            </div>
                        </Modal.Footer>
                    </Modal>
                )
            }

            {
                !batchModalShow && !showCustomReturnModal && (
                    <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
                        <Modal.Body className="p-4">
                            {/* Header 抬頭資訊 */}
                            <div className="d-flex justify-content-between align-items-start mb-3">
                                <div className="fw-bold" style={{ fontSize: '2rem', color: '#000' }}>
                                    物料退料申請
                                </div>
                                <div className="text-start" style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                                    <div><strong>申請退料人名稱:</strong> {userName}</div>
                                    <div><strong>申請退料人工號:</strong> {userNumber}</div>
                                    {userDept && <div><strong>申請退料部門:</strong> {userDept}</div>}
                                </div>
                                <button
                                    type="button"
                                    className="btn-close fs-4"
                                    aria-label="Close"
                                    onClick={onHide}
                                ></button>
                            </div>

                            {/* Action Toolbar 批量退料按鈕 */}
                            <div className="d-flex align-items-center mb-3">
                                <Button
                                    variant="outline-dark"
                                    className="rounded-pill px-4 py-1 fw-bold me-3"
                                    onClick={() => setBatchModalShow(true)}
                                    style={{ borderColor: '#333' }}
                                >
                                    批量退料
                                </Button>
                                <span className="fw-bold" style={{ color: 'red', fontSize: '0.9rem' }}>
                                    **全選退料 退料數量預設為可退料數總數
                                </span>
                            </div>


                            {/* 資料表格 */}
                            <div className="table-responsive mb-5" style={{ overflow: 'auto', maxHeight: '60vh' }}>
                                <Table bordered hover className="mb-0 text-center align-middle" style={{ whiteSpace: 'nowrap' }}>
                                    <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <th>物料QRcode</th>
                                            <th>物料名稱</th>
                                            <th>產品規格</th>
                                            <th>可退料數量</th>
                                            <th>預退料數量</th>
                                            <th>退料原因</th>
                                            <th>退回倉庫</th>
                                            <th>退回倉位</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedItems && selectedItems.length > 0 ? (
                                            selectedItems.map((item, index) => {
                                                const key = getItemKey(item, index);
                                                const balanceVal = Number(item?.balance !== undefined && item?.balance !== null ? item.balance : (item?.row_measure_val ?? 0));
                                                const rState = rowStates[key] || { returnQty: '', reason: '用剩退料', targetStore: '', targetLocation: '' };
                                                const validLocations = getLocationsForStore(rState.targetStore);

                                                return (
                                                    <React.Fragment key={key}>
                                                        {index > 0 && (
                                                            <tr style={{ height: '0.3rem', backgroundColor: 'transparent' }}>
                                                                <td colSpan={8} style={{ border: 'none', padding: 0, backgroundColor: 'transparent' }} />
                                                            </tr>
                                                        )}
                                                        <tr style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa' }}>
                                                            <td>{item.allocate_barcode_text ?? item.form_id ?? '-'}</td>
                                                            <td>{item.product_name || '-'}</td>
                                                            <td>{item.specification || '-'}</td>
                                                            <td className="fw-bold">{balanceVal} {item.row_unit || ''}</td>
                                                            {/* 預退料數量 */}
                                                            <td style={{ width: '110px' }}>
                                                                <Form.Control
                                                                    type="number"
                                                                    size="sm"
                                                                    min="0"
                                                                    max={balanceVal}
                                                                    step="any"
                                                                    className="text-center"
                                                                    placeholder="數量"
                                                                    value={rState.returnQty}
                                                                    onChange={(e) => handleRowStateChange(key, 'returnQty', e.target.value)}
                                                                    onBlur={() => isAvailable(key, 'returnQty', rState.returnQty, balanceVal, item)}
                                                                />
                                                            </td>
                                                            {/* 退料原因 */}
                                                            <td style={{ width: '150px' }}>
                                                                <Form.Select
                                                                    size="sm"
                                                                    className="text-center rounded-pill"
                                                                    value={rState.reason}
                                                                    onChange={(e) => handleRowStateChange(key, 'reason', e.target.value)}
                                                                >
                                                                    {
                                                                        returnReasonOptions.map((option) => (
                                                                            <option key={option.value} value={option.value}>
                                                                                {option.label}
                                                                            </option>
                                                                        ))
                                                                    }
                                                                </Form.Select>
                                                            </td>
                                                            {/* 退回倉庫 */}
                                                            <td style={{ width: '130px' }}>
                                                                <Form.Select
                                                                    size="sm"
                                                                    className="text-center rounded-pill"
                                                                    value={rState.targetStore}
                                                                    onChange={(e) => handleRowStateChange(key, 'targetStore', e.target.value)}
                                                                    required
                                                                >
                                                                    <option value="">倉庫選擇 ▼</option>
                                                                    {storeOptions.map((st, sIdx) => (
                                                                        <option key={sIdx} value={st}>{st}</option>
                                                                    ))}
                                                                </Form.Select>
                                                            </td>
                                                            {/* 退回倉位 */}
                                                            <td style={{ width: '130px' }}>
                                                                <Form.Select
                                                                    size="sm"
                                                                    className="text-center rounded-pill"
                                                                    disabled={!rState.targetStore}
                                                                    value={rState.targetLocation}
                                                                    onChange={(e) => handleRowStateChange(key, 'targetLocation', e.target.value)}
                                                                    required
                                                                >
                                                                    <option value="">倉位選擇 ▼</option>
                                                                    {validLocations.map((loc: any, lIdx: number) => (
                                                                        <option key={lIdx} value={loc.location}>{loc.location}</option>
                                                                    ))}
                                                                </Form.Select>
                                                            </td>
                                                        </tr>
                                                    </React.Fragment>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={8} className="text-center text-muted">
                                                    查無勾選的退料物料資料
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </div>

                            {/* 下方紅色說明標註 */}
                            <div className="text-center fw-bold" style={{ color: 'red', fontSize: '0.85rem', lineHeight: '1.8', marginTop: '45px' }}>
                                <div>** 提出申請後該物料 調撥 、 退料 數量會直接先從原數量扣除，待主管審核通過與否在決定是加回還是扣除</div>
                            </div>

                            {/* Footer 大按鈕區 (確認 / 關閉) */}
                            <div className="d-flex justify-content-center gap-4 mt-4 mb-2">
                                <Button
                                    variant="success"
                                    className="rounded-pill px-5 py-2 fw-bold text-white shadow-sm"
                                    style={{ backgroundColor: '#00c853', borderColor: '#00c853', minWidth: '170px', fontSize: '1.25rem' }}
                                    onClick={() => handleSubmit()}
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
                    </Modal>
                )
            }

            {/* 批量退料 Sub-Modal */}
            {batchModalShow && (
                <BatchReturnModal
                    show={batchModalShow}
                    onHide={() => setBatchModalShow(false)}
                    userName={userName}
                    userNumber={userNumber}
                    userDept={userDept}
                    storeOptions={storeOptions}
                    locationOptions={locationOptions}
                    returnReasonOptions={returnReasonOptions}
                    onAddCustomReason={handleAddCustomReason}
                    onConfirm={handleBatchConfirm}
                />
            )}
        </>
    );
};

export default React.memo(MaterialReturnApply);
