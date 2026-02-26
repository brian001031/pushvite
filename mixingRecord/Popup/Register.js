import React, { useState, useEffect, useCallback, useMemo ,Suspense} from 'react';
import { faAlignCenter } from '@fortawesome/free-solid-svg-icons';
import { Form, Modal, Button, Card, Row, Col, Table, FormControl, Toast } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import 'react-confirm-alert/src/react-confirm-alert.css';
import { useAuth } from '../../../context/GlobalProvider';
import moment from 'moment';
import axios from 'axios';
import config from '../../../config';
import api from '../api';
import '../style.scss';
import { confirmAlert } from 'react-confirm-alert';
import ReactDOM from 'react-dom/client';
import { group_prescription_catch_info } from "../../../mes_remak_data";
import { FormattedMessage, useIntl } from "react-intl";



// type definition via JSDoc (純 JS)
 
/**
 * @typedef {Object} SubmitRow
 * @property {string} itemNumber
 * @property {string} itemName
 * @property {string} bomVer
 * @property {string} spec
 * @property {string} unit
 * @property {number|string} qty
 * @property {string} process
 * @property {string} summaryLocation
 * @property {string} summary
 */

//初始化空數據組
const emptyRow = {
  itemcode: '',
  itemname: '',
  bomver: '',
  spec: '',
  unit: '',
  qty: '',
  process: '',
  summarylocation: '',
  summary: ''
};

const unit_map  = [
    "kg","m","l",
];


const prescription_manerger = [
  { id: "003", name: "陳昱昇" },
  { id: "109", name: "黃之奕" },  
  { id: "349", name: "周柏全" },
  { id: "292", name: "張宇翔" }
];

const Register = ({ show, onback, reg_Login, selectMixing ,onShowMessage }) => {
    const [confirmPsw, setConfirmPsw] = useState('');
    const [errorText, setErrorText] = useState('');
    const [dataRows, setDataRows] = useState([ { ...emptyRow } ]); // 儲存多筆表單資料
    const { user } = useAuth();
    const [totalPages , setTotalPages] = useState(1);
    const [itemCodeErrors, setItemCodeErrors] = useState({});    
    const [masterNo, setMasterNo] = useState('');
    const [isOpenMain, setIsOpenMain] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [maincode_list, setMixed_maincode] = useState([]);
    const [itemcode_list , setMixed_itemcode] = useState([]);
    const [itemname_list , setMixed_itemname] = useState([]);
    const [filteredList, setFilteredList] = useState(maincode_list);
    const [submit_ver, setsubmit_ver] = useState('');
    const [filter_manerger, setFilter_manerger] = useState(false);
    
    // if(selectMixing ){
    //     console.log("確認接收站為:"+selectMixing);
    // }else{
    //     console.log("搜無")
    // }
    // console.log("Auth 使用者info 為: "+ JSON.stringify(user,null,2));

    const container = document.getElementById('root');
    const mainform_first_str = selectMixing ==="正極混漿"?"MixingCathode":"MixingAnode";

    // 如果已經存在 root，就不要再 createRoot
    if (!container._reactRoot) {
        const root = ReactDOM.createRoot(container);
        container._reactRoot = root;
    }

    // 接收現在有的動態prescription_mixed 選項
    useEffect(() => {

        try {
        //     async function fetchprescription_list() {            
        //    const { data_maincode , data_itemcodes , data_itemnames} = await group_prescription_catch_info(selectMixing , mainform_first_str);

        //     // console.log(
        //     // "實際接收data_maincode回傳型態為:",
        //     // typeof data_maincode,
        //     //   data_maincode
        //     // );

        //     //目前後段為陣列回傳格式(需要找到item key 轉回各自陣列存取)
        //     if (!Array.isArray(data_maincode)) 
        //         return;

        //     //存入各自存取陣列內後續查詢彈出訊息選單用
        //     setMixed_maincode(data_maincode);
        //     setMixed_itemcode(data_itemcodes);
        //     setMixed_itemname(data_itemnames);   
        // }
       
        // fetchprescription_list();

        get_lastnew_maincode_item_searchcontent();

        //確認登入者身份(是否為配方管理員)
        setFilter_manerger(prescription_Filter_IsAdmin(user));
            
        } catch (error) {
            console.error("API group_prescription_catch_info 請求錯誤:", error);
        }        
    }, []);


    useEffect(() => {

        console.log("maincode_list 結構為= "+ typeof maincode_list +  " 資料為: " + JSON.stringify(maincode_list,null,2));
        console.log("itemcode_list 結構為= "+ typeof itemcode_list +  " 資料為: " + JSON.stringify(itemcode_list,null,2));
        console.log("itemname_list 結構為= "+ typeof itemname_list +  " 資料為: " + JSON.stringify(itemname_list,null,2));
   
    }, [maincode_list,itemcode_list,itemname_list]);


    async function get_lastnew_maincode_item_searchcontent() {

        const { data_maincode , data_itemcodes , data_itemnames} = await group_prescription_catch_info(selectMixing , mainform_first_str);

            // console.log(
            // "實際接收data_maincode回傳型態為:",
            // typeof data_maincode,
            //   data_maincode
            // );

            //目前後段為陣列回傳格式(需要找到item key 轉回各自陣列存取)
            if (!Array.isArray(data_maincode)) 
                return;

            //存入各自存取陣列內後續查詢彈出訊息選單用
            setMixed_maincode(data_maincode);
            setMixed_itemcode(data_itemcodes);
            setMixed_itemname(data_itemnames);
        
    };

    const handleInputFocus = () => setShowDropdown(true);

    const handleMainCode_Click = (item) => {
        setMasterNo(item.label);
        setShowDropdown(false);
    };


    useEffect(() => {
        //當重新keyDown選定主單號,由api 找尋目前版本號(用count(*) 數量訂為)
        const find_maincode_version = async () => {                        
            try {        
                const response = await api.call_mixing_maincode_version(masterNo ,mainform_first_str);
                // console.log("回傳 maincode_version 結果為:"+  JSON.stringify(response.data,null,2));
                const submit_ver = 'v'+String( (Number(response.data.CurrentVersion)+1).toFixed(1));
                setsubmit_ver(submit_ver);
                // console.log("最終要提交新版本號為="+submit_ver);    
                
                console.log(`是否為配方管理員 = ${filter_manerger}`);
            } catch (error) {
            console.error("API find_maincode_version 請求錯誤:", error);
            }  
        
        }
    
        find_maincode_version();  

    }, [masterNo , filter_manerger]);


    function toMySQLDateTime(date) {
        const pad = n => String(n).padStart(2, "0");

        return (
            date.getFullYear() + "-" +
            pad(date.getMonth() + 1) + "-" +
            pad(date.getDate()) + " " +
            pad(date.getHours()) + ":" +
            pad(date.getMinutes()) + ":" +
            pad(date.getSeconds())
        );
    }

    const prescription_Filter_IsAdmin = ( user) => {
        const LoginId = String(user.memberID).padStart(3, "0");      
        const LoginName = String(user.reg_schedulename.trim());

        //只用內碼名稱ID判定ISMANERGER
        return prescription_manerger.some(
        (member) => member.id === LoginId && member.name === LoginName
        );
   };

    // 移除中括號內容（避免干擾主要 / 判斷）
    // 實際字串格式 ex: Cathoderoll003 / 正極極捲 570mm (加入分散劑)[Cell003 / 570mm]
    const removeBracketContent = (str) => {
        return str.replace(/\[.*?\]/g, "");
    };

    // 取得第一個主要 "/" 前的字串
    const getFirstSegment = (str) => {
        const cleaned = removeBracketContent(str);
        const firstSlashIndex = cleaned.indexOf("/");
        if (firstSlashIndex === -1) return "";
        return cleaned.slice(0, firstSlashIndex).trim();
    };

    const open_mainform = async (e) => {              
        setIsOpenMain(true);       
    }

    const add_mainform_code = async (e) => {    
        let filtered;  
        const value = e.target.value; 
        setMasterNo(String(value));


        if (value.trim() === "") {
            // 沒輸入 → 顯示全部
            filtered = maincode_list;
        } else {
            // 動態過濾 list
            filtered = maincode_list.filter((item) =>
                item.label.toLowerCase().includes(value.toLowerCase())
            );
        }

        setFilteredList(filtered);

        // 有輸入就顯示 dropdown
        // setShowDropdown(value.length > 0 && filtered.length > 0);
         // 只要有資料就顯示 
         setShowDropdown(filtered.length > 0);
       
    }

    const checkDuplicateItemCode = (rows) => {
        const map = new Map();
        const errors = {};

        rows.forEach((row, index) => {
            const code = row.itemcode?.trim();
            const name = row.itemname?.trim();
            const qty =  Number(row.qty ?? 0);
            const unit = row.unit?.trim();
            const hasQty = qty !== undefined && qty !== null && String(qty).trim() !== '';
            const hasUnit = unit !== undefined && unit !== null && String(unit).trim() !== '';

            // qty = 0 狀態錯誤記錄
            if (hasQty && hasUnit) {
                if (qty === 0) {
                    errors[index] = {
                        ...(errors[index] || {}),
                        qty: '數量不可等於 0'
                    };
                }
            }
       
            if (hasQty && hasUnit) {
                //當單位無輸入(公斤-kg 或 公尺-m 或 公升-l)
                const isValidUnit = unit_map.includes(
                    String(unit).trim().toLowerCase()
                );

                if(!isValidUnit){                    
                    errors[index] = {
                      ...(errors[index] || {}),
                      unit: `目前無支援->${String(unit).trim()}單位`
                    };
                }
            }

            // 兩個都要有值才檢查
            if (!code || !name ) return;

             // 品項編碼和名稱(複合式確認) , 忽略全形/半形空白
            const normalize = v => v.replace(/\s+/g, '').toUpperCase();
            const key = `${normalize(code)}|${normalize(name)}`;
            

            if (!map.has(key)) {
                map.set(key, [index]);
            } else {
                map.get(key).push(index);
            }
        });

        //處理重複時需要延續之前紀錄
        map.forEach(indices => {
            if (indices.length > 1) {
               indices.forEach(i => {
                errors[i] = {
                    ...(errors[i] || {}),
                    itemcode: '品項編碼與品項名稱重複',
                    itemname: '品項編碼與品項名稱重複',
                };
            });
            }
        });

        setItemCodeErrors(errors);
    };

    //更新欄位
    const updateRow = (index, key, value) => {
    setDataRows(prev => {
        const next = [...prev];
        next[index] = { ...next[index], [key]: value };
        return next;
     });
    };

      // 新增空白列（限制一次只新增一筆）
    const addRow = () => {             
        setDataRows(prev => [...prev, { ...emptyRow }]);
    };

    // 刪除指定列
    const removeRow = (index) => {
        setDataRows(prev => prev.length > 1
            ?prev.filter((_, i) => i !== index)
            : prev
        );
    };

    // 刪除全部sub操作raw
    const removeRow_All = async () => {
       //setDataRows(prev => (prev.length > 0 ? [prev[0]] : prev));
       setDataRows([]);
    };

    const handleChange = (e) => {
        e.preventDefault();
        setDataRows({
            ...dataRows,
            [e.target.name]: String(e.target.value).trim(),
        });
    };

    const getRowErrorMessage = (rowError) => {
        if (!rowError) return '';
        const messages = [];
        if (rowError.itemcode) messages.push('品項編碼不可重複');
        if (rowError.itemname) messages.push('品項名稱不可重複');
        if (rowError.qty) messages.push(rowError.qty); // qty = 0 錯誤訊息
        if(rowError.unit) messages.push(rowError.unit); // unit 無支援單位

        return messages.join('、');
    };

    useEffect(() => {
        checkDuplicateItemCode(dataRows);
    }, [dataRows]);

    const handleBack = () => {
        onback();
    }

    const prepareFormData = () => {
        const formData = new FormData();

        const submitTime = new Date(); // JS Date 物件
       
        //以下為跨時區顯示, toISOString() , 永遠是 UTC,結果台灣時間被 -8 小時寫進 DB(不建議使用)
        // const create_date = submitTime.toISOString().slice(0, 19).replace("T", " ");

         // 將 submitTime 轉 MySQL DATETIME 格式
         const create_date = toMySQLDateTime(submitTime);


        // 1️⃣ 添加主表單號
        // formData.append("mainform_code", masterNo);

         // 2️⃣ 封裝多筆資料到 prescription_info JSON
        // const prescriptionInfo = dataRows.map((row, index) => ({
        //     rowIndex: index + 1,
        //     itemcode: row.itemcode || "",
        //     itemname: row.itemname || "",
        //     bomver: row.bomver || "",
        //     spec: row.spec || "",
        //     unit: row.unit || "",
        //     qty: row.qty ?? 0,
        //     process: row.process || "",
        //     summarylocation: row.summarylocation || "",
        //     summary: row.summary || "",           
        //     // submitTime: create_date,
        //     // uniqueKey: `${masterNo}_${create_date}`, // 組合鍵
        // }));

        // formData.append("prescription_info", JSON.stringify(prescriptionInfo));
        // formData.append("create_date", create_date);             // SQL create_date
        // formData.append("updated_at", "0000-00-00 00:00:00");    // SQL updated_at 提交不傳送

        //以下為 提交人 工號ID , 姓名 , 正負極(混漿)站別名
        // formData.append("memberID", user.memberID.trim()||"109");
        // formData.append("submit_name",user.reg_schedulename.trim()||"未知");
        // formData.append("station",mainform_first_str);
        // formData.append("isdelete", 0); // 預設 0

        const payload = {
            mainform_code:masterNo,
            prescription_info : dataRows.map((row, index) => ({
                rowIndex: index + 1,
                itemcode: row.itemcode || "",
                itemname: row.itemname || "",
                bomver: row.bomver || "",
                spec: row.spec || "",
                unit: row.unit || "",
                qty: row.qty ?? 1,
                process: row.process || "",
                summarylocation: row.summarylocation || "",
                summary: row.summary || "",           
            })),
            create_date,
            memberID: user.memberID.trim() || "109",
            submit_name: user.reg_schedulename.trim() || "未知",
            station: mainform_first_str,
            control_version : submit_ver,
            isdelete: 0
        }

        return payload;
        // return formData;
    };

  
    const handleSubmitWithConfirm = async (e) => {
        e.preventDefault();
        // 收集有空 itemcode 或 itemname 的資料 index
        const invalidRows = [];
        
         if(masterNo===""){
            alert("未填寫主配方單號!");
            return;
        }

        //判斷主單號head 有無異常
        const Standard_search_len = mainform_first_str.length; 
        const firstSegment = getFirstSegment(masterNo).slice(0,Standard_search_len).trim();

        //  if(!firstSegment)
        //  {
        //     alert("格式錯誤：缺少主要 '/'");
        //     return;
        //  }
              
        //  if( !firstSegment.includes(mainform_first_str) )
        //  {
        //      alert(`主單號標頭必須為${mainform_first_str}!,請修正!`);
        //      return;
        //  }

         //檢查主單號後續至少要有料號名稱說明(目前判斷'/' 最少要2組 )
         const cleaned = removeBracketContent(masterNo);
         const parts = cleaned.split("/").map(p => p.trim());

        //  console.log("parts 組態為="+ typeof parts + " 內容為=" +  parts + " 長度為=" +parts.length);

         const validSlash = parts.length >= 2 && parts.every(p => p.length > 0);

        //  if(!validSlash)
        //  {
        //      alert(`${masterNo}目前無正規格式, 反斜/間隔內容不完整!`);
        //      return;
        //  }

        dataRows.forEach((obj, index) => {
            const rowErrors = itemCodeErrors[index];
            //當有空資料做紀錄
           if (!obj.itemcode || !obj.itemname || Number(obj.qty) === 0 || !obj.unit ||  (rowErrors && Object.keys(rowErrors).length > 0)) {
            invalidRows.push(index + 1); // 方便顯示給使用者，從 1 開始計數
          }
        });

        if( invalidRows.length > 0  || Number(dataRows.length) === 0){
            // eslint-disable-next-line no-restricted-globals
            alert(`以下列數據有->"空值或錯誤"，請確認(品項編碼 或 品項名稱 或 單位 或 數量值不能為0) 是否填寫完整:\n第 ${invalidRows.join(
                ", "
            )} 筆資料`)
            return;
        }

        // 原生 confirm 確認視窗
        const ok = window.confirm(
            `您確定要送出主單號: '${masterNo}' 之配方資料？`
        );

        if (!ok) {
            // 使用者按取消
            return;
        }

        // 使用者按確定，呼叫 async handleSubmit
        try {
        
                // console.log("dataRows 最後整理資料為:"+ JSON.stringify(dataRows,null,2));

                const formData_final = prepareFormData();

                // const obj = Object.fromEntries(formData_final.entries());
                // console.log("最後整理formData 資料格式為: \n" );
                // console.log(obj);     
                
                // console.log("開始提交 API，formData:", formData_final);
                 
                const response = await api.call_mixing_prescription_backend(
                  formData_final
                );

                // console.log("response 原始物件:", response);
                // console.log("response.data:", response?.data);
                // console.log("配方提交回傳訊息為:"+ JSON.stringify(response.data,null,2));

                if (response && response?.status === 200) {
                    // 檢查資料結構並正確設定
                    const feedback_message =  mainform_first_str + "-"+response?.data?.msg || "配方提交成功";
                    setMasterNo("");
                    setDataRows([]);                
                    if (onShowMessage) onShowMessage('success', feedback_message );   
                    
                    //成功後再次執行最新單號list重整
                    get_lastnew_maincode_item_searchcontent();
                                                              
                }
        } catch (error) {
            console.error("API 請求錯誤:", error);
            const errorMessage = `配方提交失敗, 錯誤訊息: ${error.message} prescription failed, error message: ${error.message}`;
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
        }
  };


    // if (!filter_manerger) {
    //      return (
    //         <div style={{ fontSize: "3.2rem", padding: "200px 130px", color: "red" }}>
    //             <span>
    //             <FormattedMessage
    //                 id="mixing.prescription_mixed_use"
    //                 defaultMessage="目前此身分無權限使用配方提交系統!"
    //             />
    //             </span>
    //         </div>
    //     );
    // }

    return (
        <Modal show={show} onHide={onback} centered  dialogClassName="adjust-screen">
           <Form.Group className="mb-3">              
            </Form.Group>
            <Row className="g-2 align-items-center mb-3">
                    <Col md={6} sm={6} xs={12}>
                    <Form.Label style={{ fontSize: '2rem', fontWeight: 'bold'  }} className="mb-0">
                        {`${selectMixing}-配方提交頁 | ${mainform_first_str} Mixing formula record`}
                    </Form.Label>
                    </Col>
                    <Col md={6} sm={6} xs={12} className="d-flex justify-content-md-end justify-content-start gap-2">
                        <Button
                            variant="secondary"
                            style={{backgroundColor:"#FF0" , color: "#000"}}
                            size="sm"                     
                            disabled={Number(user?.authStatus ) < 1  }
                            onClick={ open_mainform}                                        
                        >
                            新增主表單號
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleSubmitWithConfirm}                    
                        >
                            送出新增
                        </Button>
                        <Button variant="secondary" onClick={handleBack}>返回 | Return Page</Button>
                    </Col>
            </Row>            
            <div style={{ display: 'grid', gap: '16px'}}>                
                {isOpenMain && 
                 <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        width: "1200px",
                        margin: "0 auto",
                        gap: "12px", // 元素間距
                    }}>
                    <span style={{ whiteSpace: "nowrap", fontSize: "18px" }}>請輸入主表單號:</span>
                    <div style={{ position: "relative", flex: 1 }}>
                    <input
                        style={{ flex: 1, minWidth: "900px" , height:"50px" , fontSize:"20px" }}                     
                        id="maincode-options"
                        type="text"          
                        placeholder={`例: ${mainform_first_str}roll003 / ${selectMixing.slice(0,selectMixing.length-2)}極捲 570mm (加入分散劑)[Cell003 / 570mm])`}
                        value={masterNo}
                        onChange={add_mainform_code}                                                
                        onFocus={() => {
                            if (masterNo.trim() === "") {
                                setFilteredList(maincode_list); // 顯示全部
                            }
                            setShowDropdown(filteredList.length > 0)
                        }}                        
                    />
                    {/* 使用 datalist 彈出選單 */}
                    {/* <datalist id="maincode-options">
                        {maincode_list.map((item) => (
                        <option key={item.value} value={item.label} />
                        ))}
                    </datalist>*/}
                    {/* 自訂下拉選單 */}
                    {showDropdown && filteredList.length > 0 && (
                        <ul
                            className="absolute z-170 overflow-y-auto rounded shadow-md"
                             style={{
                                top: "100%",
                                left: 0,
                                width: "100%", // 跟父容器一樣寬
                                backgroundColor: "#f0f8ff",
                                fontSize: "18px",
                                border: "1px solid #ccc",
                                padding: 0,
                                margin: 0,
                                listStyle: "none",
                                //超過 5 筆才限制高度
                                maxHeight: filteredList.length > 5 ? "300px" : "auto",
                                overflowY: filteredList.length > 5 ? "auto" : "hidden",
                                //避免畫面抖動
                                boxShadow: "0 30px 90px rgba(138, 226, 130, 0.35)",
                            }}
                        >
                            {filteredList.map((item) => (
                            <li
                                    key={item.value}
                                    style={{
                                    padding: "12px",
                                    cursor: "pointer",
                                    }}                                    
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // 阻止 input blur
                                        handleMainCode_Click(item);
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#add8e6")}
                                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                >
                                    {item.label}
                            </li>
                            ))}
                        </ul>
                    )}
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={removeRow_All} 
                        style={{ width: "160px", marginLeft: "10px" }} // 自動向右推           
                    >
                        刪除全操作
                    </Button>      
                </div>           
               }                  
              <Card style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <Card.Header style={{ background: '#7be69e' }}>
                    <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => addRow()}
                        style={{ width: "100%", marginTop: "10px" }}
                    >
                        新增一筆配方資料
                    </Button>
                </Card.Header>
                    <Card.Body>                        
                        <Table responsive bordered>
                            <colgroup>
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '3%' }} />
                                <col style={{ width: '5%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '5%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '9%' }} /> 
                                <col style={{ width: '9%' }} />                               
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>品項編碼</th>
                                    <th>品項名稱</th>
                                    <th>操作</th>
                                    <th>BOM版本</th>
                                    <th>規格</th>
                                    <th>單位</th>
                                    <th>數量</th>
                                    <th>生產流程</th>
                                    <th>摘要(位置)</th>
                                    <th>摘要</th>
                                </tr>
                            </thead>
                            <tbody>
                             {masterNo && (dataRows || []).map((item ,index) => (
                                <React.Fragment key={index}>
                                      <tr
                                        style={{
                                            border: itemCodeErrors[index] ? '2px solid red' : '1px solid transparent',
                                        }}
                                      >
                                        <td>
                                            <Form.Control
                                                list={`${masterNo}-${index}`}                                            
                                                type ="text"
                                                value={item.itemcode}
                                                placeholder='請選擇或輸入品項編號'
                                                onChange={e => updateRow(index, 'itemcode', e.target.value)}
                                                style={{
                                                    border: itemCodeErrors[index] ? '1px solid red' : ''
                                                }}                                                
                                            />
                                            {/* {itemCodeErrors[index] && (
                                                <div style={{ color: 'red', fontSize: '16px' }}>
                                                    {itemCodeErrors[index]}
                                                </div>
                                            )} */}
                                            
                                            <datalist id={`${masterNo}-${index}`}>
                                                {/* <option value="AC-004-01">AC-004-01</option>
                                                <option value="AB-001-01">AB-001-01</option>
                                                <option value="AH-005-01">AH-005-01</option> */}
                                                 {itemcode_list.map((item) => (
                                                    <option key={item.value} value={item.label} />
                                                ))}
                                            </datalist>                                
                                        </td> 
                                        <td>
                                            <Form.Control
                                                type ="text"
                                                value={item.itemname}
                                                list={`itemname-list-${index}`}
                                                onChange={e => updateRow(index, 'itemname', e.target.value)}
                                            />
                                            <datalist id={`itemname-list-${index}`}>                                              
                                                 {itemname_list.map((item) => (
                                                    <option key={item.value} value={item.label} />
                                                ))}
                                            </datalist>    
                                        </td>
                                        <td className="d-flex gap-1">
                                            {(
                                                <Button
                                                    variant="outline-danger"
                                                    size="sm"
                                                    onClick={() => removeRow(index)}
                                                >
                                                    刪除
                                                </Button>
                                            )}
                                        </td>
                                        <td>
                                            <Form.Control
                                                type ="text"
                                                value={item.bomver}
                                                onChange={e => updateRow(index, 'bomver', e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <Form.Control
                                                type ="text"
                                                value={item.spec}
                                                onChange={e => updateRow(index, 'spec', e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <Form.Control
                                                list={`${masterNo}-${index}-unit`}                                            
                                                type ="text"
                                                value={item.unit}
                                                placeholder='請選擇單位|Please select a unit'
                                                onChange={e => updateRow(index, 'unit', e.target.value)}
                                                                                            
                                            >
                                            </Form.Control>
                                            <datalist id={`${masterNo}-${index}-unit`}>
                                                <option value="kg">公斤(KG)</option>
                                                <option value="m">長度(M)</option>
                                                <option value="l">公升(L)</option>
                                            </datalist>
                                        </td> 
                                        <td>
                                           <Form.Control
                                                type="number"
                                                value={item.qty ?? ''}
                                                onChange={e => {
                                                    const value = e.target.value;
                                                    updateRow(index, 'qty', value === '' ? '' : Number(value));
                                                }}
                                                min={-1000}
                                            />                                             
                                        </td>
                                        <td>
                                            <Form.Control
                                                type ="text"
                                                value={item.process}
                                                onChange={e => updateRow(index, 'process', e.target.value)}
                                            />
                                        </td>
                                       <td>
                                            <Form.Control
                                                type ="text"
                                                value={item.summarylocation}
                                                onChange={e => updateRow(index, 'summarylocation', e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <Form.Control
                                                type ="text"
                                                value={item.summary}
                                                onChange={e => updateRow(index, 'summary', e.target.value)}
                                            />
                                        </td>
                                                                           
                                    </tr>
                                    {/* 這裡單獨一列顯示錯誤訊息 */}
                                    {itemCodeErrors[index] && (
                                    <tr key={`error-${index}`}>
                                        <td colSpan={10} style={{ color: 'red', fontSize: '16px', padding: '2px 5px' }}>
                                        {getRowErrorMessage(itemCodeErrors[index])}
                                        </td>
                                    </tr>
                                    )}
                                </React.Fragment>
                            ))}
                            {(dataRows.length === 0 || !isOpenMain) && (
                                <tr>
                                    <td colSpan={8} className="text-center text-muted">
                                        尚無配方資料，請點擊上方「新增一筆配方資料」按鈕
                                    </td>
                                </tr>
                                    
                            )} 
                            </tbody>
                        </Table>
                        {/* <Row>
                            <Col md={1} sm={2} xs={12}>
                                <Form.Label>交接內容</Form.Label>
                            </Col>
                            <Col md={11} sm={10} xs={12}>
                                <Form.Control
                                    value={item.innerText}
                                    //   onChange={(e) => dataForm(index, 'innerText', e.target.value)}
                                    disabled={item.itemcode !== ''} />
                            </Col>
                        </Row>
                        <Row className="mt-2">
                            <Col md={1} sm={12} xs={12}>
                                <Form.Label>創建日期</Form.Label>
                            </Col>
                            <Col md={11} sm={12} xs={12}>
                                <Form.Control
                                    value={item.itemcode && item.itemcode !== ''
                                        ? (() => {
                                            // groupKey: `${managerNumber}|${shift}|${createAtRaw}`
                                            const parts = item.itemcode.split('|');
                                            const createAtStr = parts.length === 3 ? parts[2] : '';
                                            return createAtStr
                                                ? moment(createAtStr).format('YYYY-MM-DD HH:mm:ss')
                                                : '';
                                        })()
                                        : ''}
                                    readOnly
                                    disabled />
                            </Col>
                        </Row> */}
                    </Card.Body>
                     {/* <Card.Footer className="d-flex justify-content-between align-items-center">
                            <span className="badge" style={{ backgroundColor: item.itemcode === '' ? '#dc3545' : '#0d6efd' }}>
                                {item.itemcode === '' ? '新增' : '舊資料'}
                            </span>
                            {item.itemcode === '' && (
                                <Button variant="outline-danger" size="sm" onClick={() => removeRow(index)}>
                                    刪除這筆
                                </Button>
                            )}
                    </Card.Footer></> */}
            </Card>
                     
         </div>
    </Modal>
    );
};

export default Register;