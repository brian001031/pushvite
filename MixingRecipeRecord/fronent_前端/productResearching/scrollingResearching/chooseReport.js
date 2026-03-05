import { useState, useEffect } from 'react';
import { Button, Table, Form, InputGroup, DropdownButton, Dropdown } from 'react-bootstrap';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment';
import axios from 'axios';
import 'moment/locale/zh-tw'; 
import config from '../../../config';
import { useNavigate } from 'react-router-dom';
import { totalChange } from "../../../mes_remak_data"



const ChooseReport = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [option, setOption] = useState('');
    const [startDate, setStartDate] = useState(moment().locale("zh-tw"));
    const [endDay, setEndDay] = useState(moment().locale("zh-tw"));
    const [totalCount, setTotalCount] = useState(0);
    const [loading , setLoading] = useState(false);

    const [data, setData] = useState([]);
    const [slittingData, setSlittingData] = useState([]);


    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPage, setTotalPage] = useState(1);
    const navigate = useNavigate();

    const [selectedRows, setSelectedRows] = useState(new Set());
    const [selectAll, setSelectAll] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const user = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null;
        setUser(user);
        console.log('user in localStorage : ', user);
    }, []);

    // 清理 selectedRows，確保只包含字串格式
    useEffect(() => {
        setSelectedRows(new Set()); // 重置選擇狀態
    }, [data]); // 當數據變化時清空選擇
    
    // 處理單行選擇
    const handleSelectRow = (rowId, rowWorkTable , lotNumber) => {
        // 確保創建新的 Set，避免混合格式
        const newSelectedRows = new Set();
        
        // 只保留字串格式的項目
        selectedRows.forEach(item => {
            if (typeof item === 'string') {
                newSelectedRows.add(item);
            }
        });
        
        const rowKey = `${rowId}-${rowWorkTable}-${lotNumber}`;
        
        if (newSelectedRows.has(rowKey)) {
            newSelectedRows.delete(rowKey);
        } else {
            newSelectedRows.add(rowKey);
        }

        console.log('newSelectedRows:', newSelectedRows);
        console.log('Selected Rows Array:', Array.from(newSelectedRows));

        setSelectedRows(newSelectedRows);
        setSelectAll(newSelectedRows.size === data.length);
    };


    const handleDelete = async () => {
        try {
            // 只處理字串格式的選中項目
            const stringSelectedRows = Array.from(selectedRows).filter(item => typeof item === 'string');

            console.log('Selected Rows Set:', selectedRows);
            console.log('String Selected Rows:', stringSelectedRows);

            // 將 rowKey 轉換回完整的資料格式，包含 rowKey 和 row 資訊
            const selectedRowsData = stringSelectedRows.map(rowKey => {
                const [rowId, rowWorkTable , lotNumber] = rowKey.split('-');
                
                // 找到對應的 row 資料
                const rowData = data.find(row => row.id === parseInt(rowId));
                
                return rowData;
            });

            console.log('Sending delete request with:', selectedRowsData);

            if (selectedRowsData.length === 0) {
                console.log('沒有選中任何行');
                return;
            }

            const response = await axios.put(
                `${config.apiBaseUrl}/rollingRecord/deleteData`,
                // "http://localhost:3009/rollingRecord/deleteData",
                {
                    selectedRows: selectedRowsData
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }
            );

            console.log('Delete response:', response.data);
            
            // 刪除成功後清空選中狀態並重新獲取數據
            setSelectedRows(new Set());
            setSelectAll(false);
            fetchDate(page);

        } catch (error) {
            console.log('沒有成功激活刪除功能', error);
        }
    };
    
    const handleSearch = (e) => {
        e.preventDefault();
        fetchDate(1);
    };

    // fetchDate 支援傳入目標頁碼
    const fetchDate = async (targetPage = page) => {
        
        try {
            const response = await axios.get(
                `${config.apiBaseUrl}/rollingRecord/getSearchPage`,
                // "http://localhost:3009/rollingRecord/getSearchPage",
                {
                    params: {
                        option: String(option).trim() || 'all',
                        searchTerm: String(searchTerm).trim() || '',
                        startDate: startDate.locale("zh-tw").format('YYYY-MM-DD 00:00:00'),
                        endDay: endDay.locale("zh-tw").format('YYYY-MM-DD 23:59:59'),
                        page: targetPage,
                        pageSize: pageSize,
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            if (response?.status !== 200) {
                setLoading(true);
            }


            const fliteredData = response?.data?.data || [];
            

            setData(fliteredData);
            if (["正極分切", "負極分切"].includes(option)) {
                setSlittingData(fliteredData);
            }

            setPage(targetPage);
            setTotalPage(response?.data?.pagination.totalPages || 1);
            // console.log('Response data:', response?.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };
    // useEffect(() => {
    //     const interval = setInterval(() => {
    //         fetchDate(page);
    //     }, 20000);
    //     return () => clearInterval(interval);
    // }, [option, searchTerm, startDate, endDay, page, pageSize]);
    
    const columns = data.length > 0 ? Object.keys(data[0]) : [];

    

    const handleDownload = async () => {
        try {
            let fileName = 'rollingNslitting_allData';
            if (option === "all") {
                fileName = 'rollingNslitting_allData';
            } 
            else if (option === "正極輾壓") {
                fileName = 'rolling_cathode';
            } 
            else if (option === "負極輾壓") {
                fileName = 'rolling_anode';
            } 
            else if (option === "正極分切"){
                fileName = 'slitting_cathode';
            }
            else if (option === "負極分切"){
                fileName = 'slitting_anode';
            }
            else if (option === "已刪除資訊"){
                fileName = "deleted"
            }

            const response = await axios.get(
                `${config.apiBaseUrl}/rollingRecord/downloadData`,
                // "http://localhost:3009/rollingRecord/downloadData",
                {
                    params: {
                        option: String(option).trim() || 'all',
                        searchTerm: String(searchTerm).trim() || '',
                        startDate: startDate.locale("zh-tw").format('YYYY-MM-DD'),
                        endDay: endDay.locale("zh-tw").format('YYYY-MM-DD'),
                    },
                    responseType: 'blob', 
                }
            );

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${fileName}-${startDate.format('YYYYMMDD')}-${endDay.format('YYYYMMDD')}.xlsx`); 
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
        } catch (error) {
            console.error('Error downloading data:', error);
        }
    };

    const handleCheckWhichData = (row , isSelected) =>{
        if (["正極輾壓", "負極輾壓"].includes(option)) {
            return (
                <Form.Check
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectRow(row.id, row.selectWork , row.lotNumber)}
                />
            )
        }
        else if (["正極分切", "負極分切"].includes(option)) {
            return (
                <Form.Check
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectRow(row.id, row.selectWork , row.lotNumber_R)}
                />
            )
        }
        else {
            return null;
        }
    }
    
    const formatCell = (col, value) => {
        if (value === null || value === undefined) return '';

        // 專門處理異常狀況欄位
        if (col === 'errorStatus') {
            try {
                if (typeof value === 'string') {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        return parsed.map((e, idx) => `#${idx + 1}: ${e?.errorMeter ?? ''}m - ${e?.errorStatus ?? ''}`).join(' | ');
                    }
                    return typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
                }
            } catch (_) {
                // 非 JSON 字串，直接顯示原字串
                return String(value);
            }
            if (Array.isArray(value)) {
                return value.map((e, idx) => `#${idx + 1}: ${e?.errorMeter ?? ''}m - ${e?.errorStatus ?? ''}`).join(' | ');
            }
            return typeof value === 'object' ? JSON.stringify(value) : String(value);
        }

        // 一般陣列：以逗號串接；物件則 JSON 字串化
        if (Array.isArray(value)) {
            return value.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    };

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: '1rem' }}></div>
                <InputGroup className="mb-3">
                    <DropdownButton
                        variant="outline-secondary"
                        title={option || "all"}
                        id="input-group-dropdown-1"
                    >
                        <Dropdown.Item onClick={() => setOption('all')}>全部資料</Dropdown.Item>
                        <Dropdown.Item onClick={() => setOption('正極輾壓')}>正極輾壓</Dropdown.Item>
                        <Dropdown.Item onClick={() => setOption('負極輾壓')}>負極輾壓</Dropdown.Item>
                        <Dropdown.Item onClick={() => setOption('正極分切')}>正極分切</Dropdown.Item>
                        <Dropdown.Item onClick={() => setOption('負極分切')}>負極分切</Dropdown.Item>
                        <Dropdown.Item onClick={() => setOption('error')}>已刪除資訊</Dropdown.Item>
                    </DropdownButton>
                    <Form.Control
                        aria-label="Text input with dropdown button"
                        placeholder='請輸入欲查詢之工程師工號或Lot編號'
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                handleSearch(e);
                            }}
                            }
                        />
                        <Button variant="primary" onClick={handleSearch}>
                            搜尋
                        </Button>

                        <div>
                        <Button 
                            variant="btn btn-outline-primary " 
                            onClick={handleDownload}
                            style={{ marginLeft:'10px', height: "auto" }}
                        >
                        <i className="bi bi-arrow-left me-1"></i> 轉為Excel
                        </Button>

                        {/* <Button 
                            variant="outline-secondary"
                            style={{ marginLeft:'10px' }}
                            onClick={() => {
                                navigate('/productResearching');
                            }}
                        >
                            <i className="bi bi-arrow-left me-1"></i> 選擇其他查詢表
                        </Button> */}
                        </div>
                    </InputGroup>
                    <Form.Group controlId="change_handler" style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', position: 'relative', zIndex: 100 }}>
                        <div style={{ marginRight: '1rem', display: 'flex', flexDirection: 'row', position: 'relative', zIndex: 101}}> 
                            <div style={{marginRight: "1rem"}}>起始日期:</div>
                            <DatePicker
                                selected={startDate.toDate()}
                                onChange={(date) => setStartDate(moment(date))}
                                dateFormat="yyyy/MM/dd"
                                className="form-control"
                                popperProps={{
                                    positionFixed: true
                                }}
                                popperPlacement="bottom-start"
                            />
                        </div>
                        <div style={{ marginRight: '1rem', display: 'flex', flexDirection: 'row', position: 'relative', zIndex: 101}}> 
                            <div style={{marginRight: "1rem"}}>結束日期:</div>
                            <DatePicker
                                selected={endDay.toDate()}
                                onChange={(date) => setEndDay(moment(date))}
                                dateFormat="yyyy/MM/dd"
                                className="form-control"
                                popperProps={{
                                    positionFixed: true
                                }}
                                popperPlacement="bottom-start"
                            />
                        </div>
                    </Form.Group>
                    {
                        user && (user.memberID === 349 || user.memberID === 264) ? (
                            <>
                            {loading && <div>Loading...</div>}
                                <div style={{ maxHeight: 500 , overflow: "auto" , border: "1px solid #ddd"}}>
                                    <Table striped bordered hover style={{ 
                                        width: "100%",
                                        marginBottom: 0,
                                        borderCollapse: "collapse",
                                    }}>
                                       
                                        <thead style={{ 
                                            position: "sticky", 
                                            top: 0, 
                                            backgroundColor: "#f8f9fa",
                                            zIndex: 10
                                        }}>
                                            
                                            <tr>
                                                {
                                                    !["all", "error"].includes(option) ? (
                                                        <th style={{ 
                                                            minWidth: "50px",
                                                            padding: "8px",
                                                            textAlign: "center",
                                                            backgroundColor: "#f8f9fa",
                                                            borderBottom: "2px solid #ddd"
                                                        }}>
                                                        </th>
                                                    ) : null
                                                }
                                                
                                                {columns
                                                    .filter(item => item !== 'startTime') 
                                                    .map((col, index) => {
                                                    const chineseName = totalChange[0] && totalChange[0][col] ? totalChange[0][col] : col;
                                                            return (
                                                                <th key={col}
                                                                    style={{ 
                                                                        minWidth: "150px",
                                                                        maxWidth: "200px",
                                                                        padding: "8px",
                                                                        textAlign: "center",
                                                                        whiteSpace: "nowrap",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        backgroundColor: "#f8f9fa",
                                                                        borderBottom: "2px solid #ddd"
                                                                        }}>
                                                                    {chineseName}
                                                                </th>
                                                            )
                                                        })
                                                }
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data
                                            .filter(item => item !== 'startTime') 
                                            .map((row, idx) => {
                                                let rowKey = "";

                                                if (["正極輾壓", "負極輾壓"].includes(option)) {
                                                    rowKey = `${row.id}-${row.selectWork}-${row.lotNumber}`;
                                                }
                                                else if (["正極分切", "負極分切"].includes(option)) {
                                                    rowKey = `${row.id}-${row.selectWork}-${row.lotNumber_R}`;
                                                }
                                                const isSelected = selectedRows.has(rowKey);
                                                
                                                return (
                                                    <tr key={row.id + '-' + idx} style={{
                                                        backgroundColor: isSelected ? '#e3f2fd' : 'inherit'
                                                    }}>
                                                        {
                                                            !["all", "error"].includes(option) ? (
                                                                <td style={{ 
                                                                    minWidth: "50px", 
                                                                    padding: "8px",
                                                                    textAlign: "center"
                                                                }}>
                                                                    {handleCheckWhichData(row , isSelected)}
                                                                </td>
                                                            ) : null
                                                        }
                                                        {columns
                                                        .filter(item => item !== 'startTime') 
                                                        .map(col => (
                                                            <td key={col} style={{ 
                                                                minWidth: "150px", 
                                                                maxWidth: "fit-content", 
                                                                width: "auto", padding: "8px",
                                                                textAlign: "center",
                                                                whiteSpace: "nowrap",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                            }}>
                                                                {formatCell(col, row[col])}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </Table>
                                </div>
                            </>
                        ):(
                            <>
                                <div style={{ maxHeight: 500 , overflow: "auto" , border: "1px solid #ddd"}}>
                                    <Table striped bordered hover style={{ 
                                        width: "100%",
                                        marginBottom: 0,
                                        borderCollapse: "collapse",
                                    }}>
                                       
                                        <thead style={{ 
                                            position: "sticky", 
                                            top: 0, 
                                            backgroundColor: "#f8f9fa",
                                            zIndex: 10
                                        }}>
                                            
                                            <tr>
                                                
                                                {
                                                    !["all", "error"].includes(option) ? (
                                                        columns.map((col, index) => {
                                                            const chineseName = totalChange[0] && totalChange[0][col] ? totalChange[0][col] : col;
                                                            return (
                                                                <th key={col}
                                                                    style={{
                                                                        minWidth: "150px",
                                                                        maxWidth: "200px",
                                                                        padding: "8px",
                                                                        textAlign: "center",
                                                                        whiteSpace: "nowrap",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        backgroundColor: "#f8f9fa",
                                                                        borderBottom: "2px solid #ddd"
                                                                    }}>
                                                                    {chineseName}
                                                                </th>
                                                            )
                                                        })
                                                    ) : null
                                                }
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.map((row, idx) => (
                                                <tr key={row.id + '-' + idx}>
                                                    {columns.map(col => (
                                                        <td key={col} style={{ 
                                                            minWidth: "150px", 
                                                            maxWidth: "fit-content", 
                                                            width: "auto", padding: "8px",
                                                            textAlign: "center",
                                                            whiteSpace: "nowrap",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                        }}>
                                                            {formatCell(col, row[col])}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                </div>
                            </>
                        )
                    }
                <div style={{ margin: '1rem 0', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <Button
                        variant="secondary"
                        onClick={() => fetchDate(page > 1 ? page - 1 : 1)}
                        disabled={page === 1}
                    >
                        上一頁
                    </Button>
                    <span>第 {page} 頁</span>
                    
                    <Button
                        variant="secondary"
                        onClick={() => fetchDate(page + 1)}
                        disabled={data.length < pageSize}
                    >
                        下一頁
                    </Button>
                    <Form.Control
                        type="number"
                        min={1}
                        value={page || ""}
                        onChange={e => {
                            const val = Math.max("", Number(e.target.value));
                            setPage(val);
                        }}
                        onBlur={() => fetchDate(page)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                fetchDate(page);
                            }
                        }}
                        style={{ width: 80, display: 'inline-block' }}
                    />
                    <span>
                        跳頁 | 共 {totalPage} 頁 
                    </span>
                    {
                        user && (user.memberID === 349 || user.memberID === 264) && !["all", "error"].includes(option) ? (
                            <Button variant="danger" onClick={handleDelete} disabled={selectedRows.size === 0}>刪除</Button>
                        ) : null
                    }
                </div>
            </div>
    )
}


export default ChooseReport;