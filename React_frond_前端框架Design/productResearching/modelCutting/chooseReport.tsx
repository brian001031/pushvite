import { useState, useEffect, useCallback } from 'react';
import { Button, Table, Form, InputGroup, DropdownButton, Dropdown } from 'react-bootstrap';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment-timezone';
import axios from 'axios';
import config from '../../../config';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from './loading';
import { totalChange } from "../../../mes_remak_data"
import { getApiBaseUrl } from '../../../apiChangeConnet.js';
import { Pagination } from 'react-bootstrap';

type ChooseReportProps = {
    id: number;                          // 系統自增主鍵
    uiid: string;                        // 原始產品Key / 介面唯一識別碼
    selectWork: string | null;           // 選擇作業狀態
    incomingLotNo: string | null;        // 來料批號
    incomingMeter: number | null;        // 來料米數 (Decimal)
    incomingRealMeter: number | null;    // 實際米數 (Decimal)
    originalProductKey: string | null;   // 原始產品Key
    reworkProductKey: string | null;     // 後來產品Key
    containBox: string | null;           // 料盒號
    productStatus: string | null;        // 產品狀態
    deviceNo: string | null;             // 設備編號
    productPieces: number | null;        // 產品片數
    empNo: string | null;                // 作業人員工號
    empName: string | null;              // 作業人員名稱
    empShift: string | null;             // 作業人員班別
    modelNo: string | null;              // 模具號
    wo: string | null;                   // 工單製令
    rOrL: string | null;                 // R/L
    speed: number | null;                // 生產速度
    productHaltMaterial: string | null;  // 停機收料
    width: number | null;                // 寬度/厚度 (Decimal)
    errorStatus: string | null;          // 異常狀態
    errorDescription: string | null;     // 異常簡述 (Text)
    inputTime: string | Date | null;     // 輸入時間 (Datetime)
    rank: string | null;                 // 良品等級
    stock: number | null;                // 庫存
    is_received: number | boolean | null;// 是否接收 (對照資料表補上)
    isEditStatus: string | null;         // 修改狀態
    isEditManagerName: string | null;    // 更新主管名稱
    isEditManagerNo: string | null;      // 更新主管工號
    shouldHavePeace: number | null;      // 理論片數
    created_at: string | Date | null;    // 資料庫寫入時間 (Timestamp)
}

type User = {
    absentEnd?: string;
    absentStart?: string;
    authPosition: any[];
    authStatus: string;
    id?: number | string;
    isManager?: string | null;
    memEmail?: string;
    memberID: string;
    positionarea: any[];
    reg_schedulename?: string | null;
    shift?: string | null;
    telephone?: string | null;
};

// 針對 modelCutting 頁面的中文對應
const modelCuttingMapping: Record<string, string> = {
    selectWork: '正負極模切',
    uiid: "唯一識別碼",
    incomingLotNo: "來料批號",
    incomingMeter: "來料米數",
    incomingRealMeter: "實際米數",
    originalProductKey: "原始產品Key",
    reworkProductKey: "後來產品Key",
    containBox: "料盒號",
    productStatus: "產品狀態",
    deviceNo: "設備編號",
    productPieces: "產品片數",
    empNo: "人員工號",
    empName: "人員名稱",
    empShift: "班別",
    modelNo: "模具號",
    wo: "工單製令",
    rOrL: "R/L",
    speed: "生產速度",
    productHaltMaterial: "停機收料",
    width: "寬度/厚度",
    errorStatus: "異常狀態",
    errorDescription: "異常簡述",
    inputTime: "輸入時間",
    rank: "良品等級",
    stock: "庫存",
    is_received: "是否接收",
    isEditStatus: "目前狀態",
    isEditManagerName: "更新主管名稱",
    isEditManagerNo: "更新主管工號",
    shouldHavePeace: "理論片數",
    created_at: "寫入時間"
};

const ChooseReport = () => {
    const apiBaseUrl = getApiBaseUrl() ? getApiBaseUrl() : config.apiBaseUrl;
    const [searchTerm, setSearchTerm] = useState("");
    const [option, setOption] = useState('all');
    const [startDate, setStartDate] = useState(moment().tz("Asia/Taipei").startOf('day'));
    const [endDay, setEndDay] = useState(moment().tz("Asia/Taipei").endOf('day'));
    const [data, setData] = useState<ChooseReportProps[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [pageInput, setPageInput] = useState<string>("1");
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [user, setUser] = useState<User | null>(null);

    const authUserNo = ['349', '292', '264', '3']; // 具備刪除權限的使用者工號列表
    const hasDeletePermission = user && authUserNo.includes(String(user.memberID));

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
        const storedUser = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') as string) : null;
        setUser(storedUser);
    }, []);

    const fetchData = useCallback(async (targetPage = page): Promise<void> => {
        setLoading(true);
        try {
            const response = await axios.get(`${apiBaseUrl}/modelCutting/getSearchPage`, {
                params: {
                    searchTerm: searchTerm.trim(),
                    option: option || 'all',
                    startDate: startDate.format('YYYY-MM-DD 00:00:00'),
                    endDay: endDay.format('YYYY-MM-DD 23:59:59'),
                    page: targetPage,
                    pageSize: pageSize,
                }
            });


            console.log('Fetched data:', response.data.data.status);
            if (response.data.data.status === 200) {
                setData(response.data.data.data || []);
                setTotalPages(response.data.data.pagination?.totalPages || 1);
                setPage(targetPage);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }, [apiBaseUrl, searchTerm, option, startDate, endDay, page, pageSize]);

    // 當 option 或是日期範圍改變時自動重新搜尋
    useEffect(() => {
        fetchData(1);
    }, [option, startDate, endDay]);

    // 當資料更新時重置選擇狀態
    useEffect(() => {
        setSelectedRows(new Set());
    }, [data]);

    const handleSearch = (e: React.FormEvent | React.KeyboardEvent): void => {
        if (e) e.preventDefault();
        fetchData(1);
    }

    const handleDownload = async (): Promise<void> => {
        try {
            let fileName = 'modelCutting_data';
            const response = await axios.get(
                `${apiBaseUrl}/modelCutting/downloadData`,

                {
                    params: {
                        option: String(option).trim() || 'all',
                        searchTerm: String(searchTerm).trim() || '',
                        startDate: startDate.format('YYYY-MM-DD'),
                        endDay: endDay.format('YYYY-MM-DD'),
                    },
                    responseType: 'blob'
                }
            );
            const disposition = response.headers['content-disposition'];
            if (disposition) {
                if (disposition.includes('filename=')) {
                    fileName = disposition.split('filename=')[1].split(';')[0].replace(/"/g, '');
                }
            }

            let now = moment().tz("Asia/Taipei").format('YYYYMMDD_HHmmss');
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName ? `${fileName}_${now}.xlsx` : `modelCutting_data_${now}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);


        } catch (error) {
            console.error('Error downloading data:', error);
        }
    }

    const handleDelete = async () => {
        try {
            const selectedRowsData = data.filter(row => selectedRows.has(`${row.uiid}`));

            if (selectedRowsData.length === 0) return;

            const response = await axios.put(
                `${apiBaseUrl}/modelCutting/deleteData`,
                { selectedRows: selectedRowsData, user: user },
                { headers: { 'Content-Type': 'application/json' } }
            );

            if (response.status === 200) {
                setSelectedRows(new Set());
                fetchData(page);
            }
        } catch (error) {
            console.error('Delete failed:', error);
        }
    };

    const handleSelectRow = (uiid: string) => {
        const newSelectedRows = new Set(selectedRows);
        const rowKey = `${uiid}`;

        if (newSelectedRows.has(rowKey)) {
            newSelectedRows.delete(rowKey);
        } else {
            newSelectedRows.add(rowKey);
        }
        setSelectedRows(newSelectedRows);
    };

    const handleCheckWhichData = (row: ChooseReportProps, isSelected: boolean) => {
        if (["正極模切", "負極模切"].includes(option)) {
            return (
                <Form.Check
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectRow(row.uiid)}
                />
            )
        }
        return null;
    }

    const formatCell = (col: string, value: any) => {
        if (value === null || value === undefined) return '';

        if (col === 'errorStatus') {
            try {
                if (typeof value === 'string') {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        return parsed.map((e, idx) => `#${idx + 1}: ${e?.errorMeter ?? ''}m - ${e?.errorStatus ?? ''}`).join(' | ');
                    }
                }
            } catch (_) { }
        }

        if (Array.isArray(value)) {
            return value.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    };

    const columns = data.length > 0 ? Object.keys(data[0]).filter(col =>
        col !== 'startTime' && col !== 'uiid'
        && (option === '正極模切' || option === '負極模切' ? col !== 'selectWork' : true)
    ) : [];


    useEffect(() => {
        setPageInput(String(page));
    }, [page])



    return (
        <div>
            <InputGroup className="mb-3">
                <DropdownButton
                    variant="outline-secondary"
                    title={option === 'all' ? "全部資料" : option === 'delete' ? "已刪除資訊" : option}
                    id="input-group-dropdown-1"
                >
                    <Dropdown.Item onClick={() => setOption('all')}>全部資料</Dropdown.Item>
                    <Dropdown.Item onClick={() => setOption('正極模切')}>正極模切</Dropdown.Item>
                    <Dropdown.Item onClick={() => setOption('負極模切')}>負極模切</Dropdown.Item>
                    <Dropdown.Item onClick={() => setOption('delete')}>已刪除資訊</Dropdown.Item>
                </DropdownButton>
                <Form.Control
                    placeholder='請輸入欲查詢之人員工號或批號'
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch(e)}
                />
                <Button variant="primary" onClick={handleSearch}>搜尋</Button>
                <Button
                    variant="outline-primary"
                    onClick={handleDownload}
                    style={{ marginLeft: '10px' }}
                >
                    <i className="bi bi-file-earmark-excel me-1"></i> 轉為Excel
                </Button>
            </InputGroup>

            <Form.Group className="mb-3" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: '0.5rem' }}>起始日期:</span>
                    <DatePicker
                        selected={startDate.toDate()}
                        onChange={(date: Date) => setStartDate(moment(date))}
                        dateFormat="yyyy/MM/dd"
                        className="form-control"
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: '0.5rem' }}>結束日期:</span>
                    <DatePicker
                        selected={endDay.toDate()}
                        onChange={(date: Date) => setEndDay(moment(date))}
                        dateFormat="yyyy/MM/dd"
                        className="form-control"
                    />
                </div>
                {hasDeletePermission && !["all", "delete"].includes(option) && (
                    <Button
                        variant="danger"
                        onClick={() => window.confirm('確定要刪除選中的資料嗎？') && handleDelete()}
                        disabled={selectedRows.size === 0}
                    >
                        刪除
                    </Button>
                )}
            </Form.Group>

            <div style={{
                maxHeight: 500,
                display: "block",
                border: "1px solid #ddd",
                overflowX: "auto",
                overflowY: "auto",
                width: "100%",
                maxWidth: "100%"
            }}>
                <Table striped bordered hover style={{ minWidth: 900 }}>
                    <thead style={{ position: "sticky", top: 0, backgroundColor: "#f8f9fa", zIndex: 10 }}>
                        <tr>
                            {!["all", "error"].includes(option) && hasDeletePermission && <th style={{ width: "50px" }}></th>}
                            {columns.map(col => (
                                <th key={col} style={{ minWidth: "150px", textAlign: "center" }}>
                                    {col === 'uuid'
                                        ? null
                                        : modelCuttingMapping[col] || col

                                    }
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <LoadingSpinner />
                        ) : Array.isArray(data) ? (
                            data.map((row, idx) => {
                                const isSelected = selectedRows.has(`${row.uiid}`);
                                return (
                                    <tr key={`${row.uiid}`} style={{ backgroundColor: isSelected ? '#e3f2fd' : 'inherit' }}>
                                        {!["all", "delete"].includes(option) && hasDeletePermission && (
                                            <td style={{ textAlign: "center" }}>
                                                {handleCheckWhichData(row, isSelected)}
                                            </td>
                                        )}

                                        {columns.map(col => (
                                            <td
                                                key={col}
                                                style={{
                                                    textAlign: "center",
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    maxWidth: "200px"
                                                }}
                                            >
                                                {col === 'stock'
                                                    ? (row[col] === 1 || row[col] === null)
                                                        ? '還在庫內'
                                                        : row[col] === 2
                                                            ? '已經送到下站'
                                                            : formatCell(col, row[col as keyof ChooseReportProps])

                                                    : formatCell(col, row[col as keyof ChooseReportProps])}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })
                        ) : null}
                    </tbody>
                </Table>
            </div>

            <div style={{ display: loading ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '0.5rem', marginTop: '1rem' }}>
                <div>
                    共 {totalPages} 筆 / 第

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
        </div>
    );
}

export default ChooseReport;