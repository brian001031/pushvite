import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Table, Form, InputGroup, DropdownButton, Dropdown, Modal, Button } from "react-bootstrap";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from "moment";
import axios from "axios";
import "moment/locale/zh-tw";
import config from "../../config";
import { useNavigate } from "react-router-dom";
import { totalChange } from "../../mes_remak_data";
import { getApiBaseUrl } from "../../apiChangeConnet.js";
import { dataChange_array_rolling, dataChange_array_slitting } from "./scrollingResearching/chooseReport";

import { z } from "zod"
import MessagePopup from "../../components/MessagePopup.js";


const changeField: Record<string, string> = {
    'rollingThickness_EG_S(SV)': 'rollingThickness_EG_S',
    'rollingThickness_EG_E(SV)': 'rollingThickness_EG_E',

    'rollingDensity_EG_S(SV)': 'rollingDensity_EG_S',
    'rollingDensity_EG_E(SV)': 'rollingDensity_EG_E',

    'averageThickness(PV)': 'averageThickness',
    'rollingDensity(PV)': 'rollingDensity',

    'Utilization_L(PV)(%)': 'yield_L',
    'Utilization_R(PV)(%)': 'yield_R',

    'slittingWidth_E(PV)(mm)': 'slittingWidth_E',
    'slittingWidth_S(PV)(mm)': 'slittingWidth_S',

    'slittingWidth_L(mm)': 'slittingWidth_L',
    'slittingWidth_R(mm)': 'slittingWidth_R',

    'widthToMeter(PV)': 'widthToMeter',
    'averageCoatingWeight': 'averageCoatingWidth'
};


const DataChangeMessage = ({ show, onHide, dataBack, option, user, onSuccess }: {
    show: boolean,
    onHide: () => void,
    dataBack: any,
    option: string,
    user: any,
    onSuccess?: (updatedData?: any[], responseData?: any) => void
}) => {

    const [data, setData] = useState<any[]>([]);
    const [messagePopup, setMessagePopup] = React.useState({
        show: false,
        type: "",
        message: "",
        title: ""
    });
    const dataFilter = ['id', 'is_deleted', 'deleted_at', 'delete_operation', 'delete_by', 'selectWork', 'startTime', 'employee_InputTime', 'lotNumber', 'lotNumber_R', 'lotNumber_L', 'workTime', 'yield']

    useEffect(() => {
        if (dataBack && Array.isArray(dataBack) && dataBack.length > 0) {
            try {
                let parsedData: any[] = [];
                if (option === '正極輾壓' || option === '負極輾壓') {
                    parsedData = dataChange_array_rolling.parse(dataBack);
                } else if (option === '正極分切' || option === '負極分切') {
                    parsedData = dataChange_array_slitting.parse(dataBack);
                } else {
                    parsedData = dataBack;
                }
                setData(parsedData);
            } catch (error) {
                if (error instanceof z.ZodError) {
                    const errorMessages = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join("\n");
                    console.log("Error Message:", errorMessages);
                    setMessagePopup({
                        show: true,
                        type: "error",
                        message: errorMessages,
                        title: "驗證錯誤"
                    });
                } else {
                    console.error('Error Message:', error);
                    setMessagePopup({
                        show: true,
                        type: "error",
                        message: String(error),
                        title: "Error"
                    });
                }
            }
        } else {
            setData([]);
        }
    }, [dataBack, option]);

    useEffect(() => {
        if (!show) {
            setIsSubmitting(false);
        }
    }, [show]);

    const handleFieldChange = (rowIndex: number, field: string, value: string) => {
        setData(prev => {
            const updated = [...prev];
            updated[rowIndex] = {
                ...updated[rowIndex],
                [field]: value
            };
            return updated;
        });
    };

    const columnWidths = useMemo(() => {
        if (!Array.isArray(data) || data.length === 0) return {};
        const widths: Record<string, number> = {};
        const keys = Object.keys(data[0]);

        keys.forEach(key => {
            const title = totalChange[0] && totalChange[0][key] ? totalChange[0][key] : key;
            // 標題字串寬度 (中文字約 16px，英數約 9.5px)
            let maxPx = [...String(title)].reduce((acc, c) => acc + (c.charCodeAt(0) > 255 ? 16 : 9.5), 0);

            // 遍歷所有資料找出該欄位最長字串寬度
            data.forEach(row => {
                const valStr = String(row[key] ?? "");
                const lenPx = [...valStr].reduce((acc, c) => acc + (c.charCodeAt(0) > 255 ? 16 : 9.5), 0);
                if (lenPx > maxPx) maxPx = lenPx;
            });

            // 加上 input 左右 padding 與留白緩衝，最大 350px，最小 110px
            widths[key] = Math.max(110, Math.min(350, Math.round(maxPx + 42)));
        });

        return widths;
    }, [data]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    // 送出更新資料至後端 (包含指數退避 Exponential Backoff 重試機制)
    const dataSendToBackEnd = async (retries?: any, delay?: any) => {
        const maxRetries = typeof retries === "number" ? retries : 3;
        const initialDelay = typeof delay === "number" ? delay : 1000;

        if (isSubmitting) return;
        setIsSubmitting(true);

        const optionType = option ?? '未確認';

        // 將每個 item 中的 key 依據 changeField 轉換，value 維持不變
        const formattedData = (data || []).map((item: any) => {
            const newItem: Record<string, any> = {};
            for (const [key, val] of Object.entries(item)) {
                const targetKey = changeField[key] || key;
                newItem[targetKey] = val;
            }
            return newItem;
        });

        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                console.log(`確認更新的資料內容 (轉換後)${attempt > 0 ? ` [第 ${attempt} 次重試]` : ''}:`, formattedData);
                const response = await axios.post(`${getApiBaseUrl()}/rollingRecord/engineerChangeData`, {
                    data: formattedData,
                    user,
                    optionType
                });
                console.log('dataSendToBackEnd response :', response);

                if (response.data?.success) {
                    const returnedData = response.data?.data;
                    const updatedCount = response.data?.updatedCount ?? (Array.isArray(returnedData) ? returnedData.length : 0);
                    const hasUpdated = updatedCount > 0;

                    if (hasUpdated) {
                        setMessagePopup({
                            show: true,
                            type: "success",
                            message: response.data.message || `成功更新 ${updatedCount} 筆資料`,
                            title: "成功"
                        });

                        // 只有當真的有更新且更新成功時才呼叫 onSuccess，並將回傳的資料一併傳出
                        if (typeof onSuccess === "function") {
                            onSuccess(returnedData, response.data);
                        }
                    } else {
                        setMessagePopup({
                            show: true,
                            type: "info",
                            message: response.data.message || "資料無任何變更，已略過更新",
                            title: "提示"
                        });
                    }

                    setTimeout(() => {
                        onHide();
                    }, 3000);
                    setIsSubmitting(false);
                    return;
                } else {
                    throw new Error(response.data?.message || "更新失敗");
                }
            } catch (error: any) {
                console.error(`更新請求異常 (第 ${attempt + 1} 次嘗試失敗):`, error.message);
                attempt++;

                if (attempt > maxRetries) {
                    console.error(`更新失敗 (已完成 ${maxRetries} 次指數退避重試):`, error.message);
                    setMessagePopup({
                        show: true,
                        type: "error",
                        message: error.response?.data?.message || error.message || "網路請求失敗",
                        title: "錯誤"
                    });
                    setIsSubmitting(false);
                    return;
                }

                // 指數退避延遲計算 (1000ms -> 2000ms -> 4000ms ...)
                const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
                console.warn(`更新資料異常 (${error.message})，將於 ${backoffDelay}ms 後進行第 ${attempt}/${maxRetries} 次指數退避重試...`);
                await new Promise((resolve) => setTimeout(resolve, backoffDelay));
            }
        }

        setIsSubmitting(false);
    };



    return (
        <>
            {
                messagePopup.show && (
                    <MessagePopup
                        type={messagePopup.type}
                        message={messagePopup.message}
                        title={messagePopup.title}
                        show={messagePopup.show}
                        onHide={() => {
                            setMessagePopup({
                                show: false,
                                type: "",
                                message: "",
                                title: ""
                            });
                        }}
                    />
                )
            }
            {
                <Modal
                    show={show}
                    onHide={onHide}
                    size="xl"
                    centered
                    backdrop="static"
                    keyboard={false}
                >

                    <Modal.Header closeButton>
                        <Modal.Title>數值更新再確認</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <div style={{ maxHeight: "65vh", overflow: "auto", border: "1px solid #dee2e6" }}>
                            <Table striped bordered hover size="sm" style={{ marginBottom: 0, whiteSpace: "nowrap" }}>
                                <thead>
                                    <tr>
                                        <th style={{ position: "sticky", top: 0, backgroundColor: "#f8f9fa", zIndex: 2, textAlign: "center" }}>#</th>
                                        {
                                            Array.isArray(data) && data.length > 0 && Object.keys(data[0]).map((key: string, index: number) => {
                                                const columnName = totalChange[0] && totalChange[0][key] ? totalChange[0][key] : key;
                                                const colWidth = columnWidths[key] || 150;
                                                return (
                                                    <th
                                                        key={index}
                                                        style={{
                                                            position: "sticky",
                                                            top: 0,
                                                            backgroundColor: "#f8f9fa",
                                                            zIndex: 2,
                                                            textAlign: "center",
                                                            width: `${colWidth}px`,
                                                            minWidth: `${colWidth}px`,
                                                            maxWidth: "350px",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis"
                                                        }}
                                                        title={columnName}
                                                    >
                                                        {columnName}
                                                    </th>
                                                );
                                            })
                                        }
                                    </tr>
                                </thead>
                                <tbody>
                                    {
                                        Array.isArray(data) && data.length > 0 ? (
                                            data.map((item: any, rowIdx: number) => {
                                                return (
                                                    <tr key={rowIdx}>
                                                        <td style={{ textAlign: "center", verticalAlign: "middle", minWidth: "50px" }}>{rowIdx + 1}</td>
                                                        {Object.keys(item).map((key: string, colIdx: number) => {
                                                            const colWidth = columnWidths[key] || 150;
                                                            return (
                                                                <td key={colIdx} style={{ width: `${colWidth}px`, minWidth: `${colWidth}px`, maxWidth: "350px", padding: "4px 6px" }}>
                                                                    <Form.Control
                                                                        size="sm"
                                                                        type="text"
                                                                        style={{
                                                                            width: "100%",
                                                                            maxWidth: "350px"
                                                                        }}
                                                                        value={item[key] ?? ""}
                                                                        onChange={(e) => handleFieldChange(rowIdx, key, e.target.value)}
                                                                        disabled={dataFilter.includes(key)}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={100} style={{ textAlign: "center" }}>無資料</td>
                                            </tr>
                                        )
                                    }
                                </tbody>
                            </Table>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={onHide} disabled={isSubmitting}>
                            取消
                        </Button>
                        <Button variant="primary" onClick={() => dataSendToBackEnd()} disabled={isSubmitting}>
                            {isSubmitting ? "更新中..." : "確認"}
                        </Button>
                    </Modal.Footer>

                </Modal>
            }
        </>
    )
}

export default DataChangeMessage;