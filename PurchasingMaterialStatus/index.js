 
import { BrowserRouter, Routes, Route  } from "react-router-dom";
import { Suspense } from "react";
import React, { useState, useEffect, useCallback  } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import { useNavigate, Form } from "react-router-dom";
import axios from "axios";
import config from "../../config";
import dayjs from "dayjs";
import './index.scss';
import moment from 'moment';
import 'moment/locale/zh-tw';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-toastify";
// 導入 MessagePopup 組件
import MessagePopup from '../../components/MessagePopup';

const AllocatPopup = React.lazy(() => import("../../pages/PurchasingMaterialStatus/allocatpopup")); //分配料彈出視窗


const PurchasingStatusView = () => {
const [request_materialitems, setMaterialItems] = useState([]);  //採購入庫物料類清單(可領區 和待入庫不可領區)
const [open, setOpen] = useState(false);
const [OpenColumn_div, setOpenColumn_div] = useState(false);
const [Loading, setLoading] = useState(false);
const [currentLink, setCurrentLink] = useState("");
const [openGroup, setOpenGroup] = useState({});
const [purchaseItemDetail, setPurchaseItemDetail] = useState({});  //存取當前物料細節data暫存區
const [open_allocate_popup, setOpenAllocatePopup] = useState(false);  //開啟物料分配彈出視窗控制
const [puchaes_allocatedata, setPuchaes_AllocateData] = useState([]);  // promp 引入popup 分配參考

const MIN_DATE =  moment("2026-01-01");  // 2026-01-01 預設
const defaultStartDate =  moment().locale("zh-tw").startOf("month");
// 取兩者較早的日期
const finalStartDate = moment.min(defaultStartDate, MIN_DATE);
const [startDate, setStartDate] = useState(finalStartDate);
const [endDay, setEndDay] = useState(moment().locale("zh-tw"));

//選擇模式
const [view_purchstatus, setViewPurchStatus] = useState("");
const [pageSize, setPageSize] = useState(3); //每頁顯示筆數限制

//待配料入倉
const [purchase_OKItems, set_purchaseOKItems] = useState([]);
const [allocatePage, setAllocatePage] = useState(1);
const [allocate_totalpage, setAllocateTotalPage] = useState(1);

//尚未進料
const [purchase_WaitItems, set_purchaseWaitItems] = useState([]);
const [waitfixPage, setWaitfixPage] = useState(1);
const [waitFix_totalpage, setWaitFixTotalPage] = useState(1);

// MessagePopup 狀態管理
const [messagePopup, setMessagePopup] = useState({
      show: false,
      type: '',
      title: '',
      message: ''
  });

  // 顯示訊息
  const showMessage = useCallback((type, message, title = '') => {
    setMessagePopup({
      show: true,
      type,
      title,
      message
    });
  }, []);

  // 關閉訊息
  const hideMessage = useCallback(() => {
    setMessagePopup(prev => ({ ...prev, show: false }));
  }, []);


  const handleOpen = (link) => {
    setCurrentLink(link);
    setOpen(true);
  };

  const fetch_PurchaseItemData = async (purchstatus ,page) => {

      setLoading(true);

      try {        
          const response = await axios.get(
            `${config.apiBaseUrl}/purchsaleinvtory/getPurchase_LastnewData`,
             // "http://localhost:3009/purchsaleinvtory/getPurchase_LastnewData",
            {
                    params: {                      
                      mode: purchstatus?.trim() || "ALL",
                      page,
                      stDate: moment(startDate).format("YYYY-MM-DD"),
                      edDate: moment(endDay).format("YYYY-MM-DD"),
                      sortOrder: 'desc' 
                    }
              }
        );

        const res_info = response.data;        
        console.log("擷取fetch_PurchaseItemData 回傳為:" + JSON.stringify(res_info.pickpurchase_info,null,2));
        setMaterialItems(res_info.pickpurchase_info);
        
    } catch (error) {
        console.error("取得資料錯誤", error);
    } finally {
            setLoading(false);
    }

  };

  //日期變更觸發
  // useEffect(() => {
  //   setAllocatePage(1);
  //   setWaitfixPage(1);
  // }, [startDate, endDay]);

  //負責真正查詢
  useEffect(() => {
    const page =
      view_purchstatus === "OK"
      ? allocatePage
      : view_purchstatus === "WAIT"
      ? waitfixPage
      : 1;
    
    //當起始日期與結束日期不是無效日期則取擷取目前最因採購單狀態,第一次兩邊都擷取
    fetch_PurchaseItemData(view_purchstatus,page);
      
  }, [startDate, endDay ,view_purchstatus, allocatePage, waitfixPage]);


useEffect(() => {
    const purchaseOKItems_get =
      request_materialitems.filter(
        (x) => x.source === "purchase_OK"
    );

    const purchaseWaitItems_get =
      request_materialitems.filter(
        (x) => x.source === "purchase_Wait"
    );

    const purch_ok_total = purchaseOKItems_get.find(x => x.source === "purchase_OK")?.total ?? 0;
    const purch_wait_total = purchaseWaitItems_get.find(x => x.source === "purchase_Wait")?.total ?? 0; 

    // console.log("purch_ok_total 回傳筆數為:"+  purch_ok_total);
    // console.log("purch_wait_total 回傳筆數為:"+  purch_wait_total);

    //待配料入倉(頁調整)
    set_purchaseOKItems(purchaseOKItems_get);
    setAllocateTotalPage( Math.ceil(purch_ok_total / pageSize));
    

    //尚未進料(頁調整)
    set_purchaseWaitItems(purchaseWaitItems_get);
    setWaitFixTotalPage(Math.ceil(purch_wait_total / pageSize))
    

   }, [request_materialitems]);

const OpenAllocate_Enable = () => {
  setOpenAllocatePopup(true);
};

const handleAllocateOnHide = () => {
  setOpenAllocatePopup(false);
};

const createCacheKey = (
  order_str,
  purchase_str,
  status
) => {

  return `${order_str}_${purchase_str}_${status}`;
};

const toggleGroup = async (formId,  purch_case ,delivery_status) => {

  const cacheKey = createCacheKey(formId, purch_case , delivery_status);

  const isOpen = openGroup[cacheKey];

  setOpenGroup(prev => ({
    ...prev,
    [cacheKey]: !isOpen
  }));

  // 當擷取到單號在當下未審閱過,需要api 新get fetch render 前端呈現
  if (!purchaseItemDetail[cacheKey]) {    
    try {
      const response = await axios.get(
          `${config.apiBaseUrl}/purchsaleinvtory/Purchase_Index_Detail`
         //   "http://localhost:3009/purchsaleinvtory/Purchase_Index_Detail"
           ,
           {
              params: {
                form_order: formId,
                check_status:delivery_status
              }
           }
        );

        const res = response.data;

      console.log("回傳detial 物料 狀態結果info : "+ JSON.stringify(res?.get_info??[""],null,2))        

      setPurchaseItemDetail(prev => ({
        ...prev,
        [cacheKey]: res?.get_info??[""]
      }));
    } catch (err) {
      console.error(err);
    }
  }
};


const check_if_allocate_barcode = async (form_id, pk_idnum) =>{

  try {
      const res = await axios.get(
          `${config.apiBaseUrl}/purchsaleinvtory/check_erp_allocate_barcode`
         //   "http://localhost:3009/purchsaleinvtory/check_erp_allocate_barcode"
           ,
           {
              params: {
                purch_orderform: form_id,
                pk_number:pk_idnum
              }
           }
        );

      const result_count = res.data?.get_allocate_num;

      // console.log("回傳建立入倉數量為: "+ result_count)   

      return result_count > 0;
          
    } catch (err) {
      console.error(err);
    }
}

const handle_allocate_popup = async (  e , order_str, all_record ) =>{

  e.preventDefault(); //  防止 form / input 重送

  //先行確認是否有分配好入倉編碼(allocate_barcode_text)  
  const check_have = await check_if_allocate_barcode(order_str, all_record.id);
  
  // console.log("確認是否有建立入倉編碼: "+ check_have)   

  if(check_have){
    // toast.success(`此採購單/工序:${order_str}-${all_record.id},目前已經分配入倉完畢!`);
    showMessage('',`此工序:${all_record.id} \r\n 採購單號:${order_str} \r\n 目前已經分配入倉完畢!`);
    return ;
  }

  OpenAllocate_Enable();

  const allocat_value = all_record.quantity;
  const allocat_unit =  all_record.unit;
  const allocat_pkid = all_record.id;
  const allocat_itemcode = all_record.item_code;
  const allocat_spec = all_record.specification;
  const allocat_venderid = all_record.vendor_id;
  const allocat_itemname = all_record.product_name;


  const all_allocat_info = [  order_str , allocat_pkid , allocat_itemname ,allocat_spec , allocat_itemcode , allocat_value , allocat_unit ,allocat_venderid];

  setPuchaes_AllocateData(all_allocat_info);
}

 const goToPage = ( status, page) => {
 
    //辨識模式
    setViewPurchStatus(status);
    let newPage;
 
    // Update the page state
     if( status.includes("OK")){	    			      
       newPage = Math.max(1, Math.min(page , allocate_totalpage))      
       setAllocatePage(newPage);         
	   }else if( status.includes("WAIT")){	    			      
       newPage = Math.max(1, Math.min(page , waitFix_totalpage ))      
       setWaitfixPage(newPage);         
	   }
  };

const prevPage = ( status) => {   
    //辨識模式
    setViewPurchStatus(status);

		if(status === "OK"){
		  setAllocatePage((p) => Math.max(p - 1, 1));
		}else if(status === "WAIT"){
		  setWaitfixPage((p) => Math.max(p - 1, 1));
		}		 
}
    
const nextPage = (status) => {
    //辨識模式
    setViewPurchStatus(status);

		if(status === "OK"){			
		   setAllocatePage((p) => Math.min(p + 1, allocate_totalpage));
		}else if(status === "WAIT"){
		   setWaitfixPage((p) => Math.min(p + 1, waitFix_totalpage));
		}				
}



//先取得字串，再轉成陣列：
const purchOk_formids = (purchase_OKItems[0]?.form_ids ?? "")
  .split(",")
  .slice(
  (allocatePage - 1) * pageSize,
  allocatePage * pageSize
);

const purchWAIT_formids = (purchase_WaitItems[0]?.form_ids ?? "")
  .split(",")
  .slice(
  (waitfixPage - 1) * pageSize,
  waitfixPage * pageSize
);


return (
     <div className="purchasing_material_view"> 
        <div style={{ padding: 24}}>
            <h1 style={{ fontSize:"3rem" , paddingLeft:"260px" , fontStyle:"italic" , columnGap:50}}> 物料採購資訊版</h1>
            <br></br>
               <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px", // 起始日期與結束日期兩組之間距離
                    marginBottom: "38px", // 與下面 div 的距離  
                    paddingLeft:"13rem"                 
                  }}
                >          
                <div style={{
                    display: "flex",
                    alignItems: "center",                       
                    marginBottom: "18px", // 與下面 div 的距離                                   
                  }}> 
                  <div style={{paddingRight:"12px"}}>起始日期:</div>
                  <DatePicker
                    selected={startDate.toDate()}
                    minDate={MIN_DATE.toDate()}       // ✅ 最小日期限制                       
                    onChange={(date) => setStartDate(moment(date))}
                    dateFormat="yyyy-MM-dd"
                    className="form-control" 
                  />
                </div>
                <div  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "18px", // 與下面 div 的距離         
                  }}> 
                  <div style={{paddingRight:"12px"}}>結束日期:</div>
                  <DatePicker
                    selected={endDay.toDate()}
                    minDate={MIN_DATE.toDate()}       // ✅ 最小日期限制 
                    onChange={(date) => setEndDay(moment(date))}
                    dateFormat="yyyy-MM-dd"
                    className="form-control"
                  />
                </div>
              </div>                    
              <div
                style={{
                  display: "grid",
                  height: 500,
                  gridTemplateColumns: "1fr 1fr ",
                  rowGap: 100,
                  columnGap: 30,          
                  width: "100%"              
                }}
               >  
                               
              {/*分成兩區塊*/}
               {OpenColumn_div &&                       
                  <div
                        style={{
                            border: "5px solid #110ebb",
                            borderRadius: 12,                             
                            padding: 30,
                            background: "rgb(247, 189, 32)"
                        }}
                    >
                      { 
                      // request_materialitems.length !==0 &&
                      //   request_materialitems.map((item, index) => {
                      //     const isPurchaseOK = item.source === "purchase_OK";			
                      //       return (
                      //               <div
                      //                   key={index}
                      //                   style={{
                      //                     border: "1px solid #110ebb",
                      //                     borderRadius: 12,
                      //                     padding: 20,
                      //                     background: isPurchaseOK
                      //                       ? "#8BC34A"
                      //                       : "#ecca62",
                      //                     color: "#000",
                      //                     boxShadow:
                      //                       "0 2px 8px rgba(0,0,0,0.2)"
                      //                   }}
                      //                 >
                      //                 {/* 標題 */}
                      //                   <h2>
                      //                     {
                      //                       isPurchaseOK
                      //                         ? "已完成收發料"
                      //                         : "待收發料"
                      //                     }  {`共 ${item.total} 筆單`}
                      //                   </h2>
                      //                   {/* source */}
                      //                   <div
                      //                     style={{
                      //                       marginBottom: 12
                      //                     }}
                      //                   >
                      //                     <strong>Source：</strong>
                      //                     {item.source}
                      //                   </div>
                            
                      //                 <div
                      //                     style={{
                      //                       marginBottom: 12
                      //                     }}
                      //                   >
                      //                     <strong>總數：</strong>
                      //                     {item.total}
                      //                   </div>
                      //                 <div>
                      //                     <strong>Form ID：</strong>
                      //                     <ul
                      //                       style={{
                      //                         marginTop: 10
                      //                       }}
                      //                     >
                      //                       {
                      //                         item.form_ids
                      //                           ?.split(",")
                      //                           .map((id, idx) => (

                      //                             <li
                      //                               key={idx}
                      //                               style={{
                      //                                 marginBottom: 6
                      //                               }}
                      //                             >
                      //                               {id}
                      //                             </li>
                      //                           ))
                      //                       }
                      //                     </ul>
                      //                   </div>
                      //               </div>
                      //             );
                      //         })
                            }
                      </div>                                 
                    }
                    {/* 左邊 */}
                    <div
                      style={{
                        border: "5px solid #0c0c0f",
                        borderRadius: 12,
                        padding: 30,
                        background: "#cbddb7",   
                        minWidth: "210px",        
                        borderRadius: "10px",
                        boxShadow: "10px 10px 3px rgba(204, 170, 125, 0.69)"
                      }}
                    >
                      {
                        purchase_OKItems.map((item, index) => (
                          <div key={index}>
                            <h2 
                               style={{
                                fontSize: "28px",
                                marginBottom: 30,
                                color: "#0b044b",
                                borderBottom: "5px solid #555",
                                paddingBottom: 30,
                                width: 290
                              }}
                            >
                              已完成收發料
                              {` 共 ${item.total} 筆單`}
                            </h2>
                            <div>
                              <strong>狀態:</strong>
                              {item.source} {` - 可領料`}
                            </div>
                            {/* <div>
                              <strong>總數：</strong>
                              {item.total}
                            </div> */}
                            <div>
                              <strong>採購單號：</strong>
                              <ul>
                                {
                                  purchOk_formids                                 
                                    .map((id, idx) => {                                       
                                      const catchkey =  `${id}_${item.source}_1`;
                                      return (
                                         <li key={idx}>
                                          <div onClick={() => toggleGroup(id, item.source ,1)}
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "3px",                                                                                                
                                                cursor: "pointer"
                                             }}
                                          >
                                            <span                                                
                                                style={{
                                                  marginBottom: 12,
                                                  cursor: "pointer",
                                                  fontSize: "18px",
                                                  color: "#071553",                                                
                                                  fontWeight: "bold",
                                                  backgroundColor:"#0FFE"
                                                }}                                               
                                            >{id}
                                            </span>                                             
                                            <span
                                              style={{background:"#54f06e" ,transition:"1.3s" , transform: "translate(3px, -5px)",}}
                                               onMouseEnter={(e) => {
                                                  e.target.style.backgroundColor = "#eaebd7dc"; // hover 时的背景色变化
                                                }}
                                                onMouseLeave={(e) => {
                                                  e.target.style.backgroundColor = "#54f06e"; // 恢复原来的背景色
                                                }}
                                            >
                                              {
                                                openGroup[catchkey]
                                                  ? "▼"
                                                  : "▲"
                                              }
                                            </span>                                         
                                          </div> 
                                           {
                                                <div
                                                  style={{
                                                      maxHeight:
                                                        openGroup[catchkey]
                                                          ? "1550px"
                                                          : "0px",
                                                      opacity:
                                                        openGroup[catchkey]
                                                          ? 1
                                                          : 0,
                                                      overflow: "hidden",
                                                      transition:
                                                        "max-height 0.8s ease, opacity 0.5s ease",

                                                      marginTop:
                                                        openGroup[catchkey]
                                                          ? 10
                                                          : 0
                                                    }}
                                                >
                                                  {
                                                    purchaseItemDetail[catchkey]?.map((detail, detailIndex) => (
                                                      <div
                                                        key={detailIndex}
                                                        style={{
                                                          marginTop: 3,
                                                          padding: 10,
                                                          background: "#fff",
                                                          borderRadius: 8,
                                                          border: "1px solid #999"
                                                        }}
                                                      >
                                                       {/* Grid 區塊 */}
                                                    <div
                                                      style={{
                                                        display: "grid",                                                       
                                                        gap: "6px",
                                                        fontSize:"16px",
                                                        marginTop: 10,
                                                        background:"rgb(240, 240, 239)"
                                                      }}
                                                    >
                                                        <div>
                                                          採購工序：
                                                          {detail.id}
                                                        </div>
                                                        <div>
                                                          品名：
                                                          {detail.product_name}
                                                        </div>
                                                         <div>
                                                          編碼：
                                                          {detail.item_code}
                                                        </div>
                                                        <div>
                                                          規格：
                                                          {detail.specification}
                                                        </div>

                                                         {/* Grid 區塊 */}
                                                        <div
                                                          style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr 1fr",
                                                            gap: "6px",
                                                            fontSize:"15px",
                                                            marginTop: 10,
                                                            background:"#FF0"
                                                          }}
                                                        >                                                          
                                                          <div>
                                                            數量：
                                                            {detail.quantity}
                                                          </div>                                                        
                                                          <div>
                                                            單位：
                                                            {detail.unit}
                                                          </div>
                                                          <div> 
                                                              供應商號:{detail.vendor_id}
                                                          </div>
                                                       </div>
                                                      
                                                        {/* 新增內部紅色區塊 */}
                                                        <div
                                                          style={{
                                                            background: "#52a522",
                                                            color: "#fff",
                                                            padding: "10px 12px",
                                                            borderRadius: 6,
                                                            marginBottom: 5,                                                             
                                                            marginLeft: "auto", // 推到右側
                                                            marginBottom: 5,
                                                            maxWidth:90,
                                                            transform: "translate(5px, 5px)",
                                                            transitionDuration: "0.5s",                                                            
                                                            fontWeight: "bold",
                                                            cursor: "pointer",
                                                            boxShadow: "0 4px 10px rgba(24, 203, 216, 0.92)",                                             
                                                          }}
                                                          onMouseEnter={(e) => {
                                                            e.currentTarget.style.background =
                                                              "#1e5aca";
                                                            e.currentTarget.style.transform =
                                                              "scale(1.08) translateY(-3px)";
                                                            e.currentTarget.style.boxShadow =
                                                              "0 8px 18px rgba(0,0,0,0.35)";
                                                          }}

                                                          onMouseLeave={(e) => {
                                                            e.currentTarget.style.background =
                                                              "#52a522";
                                                            e.currentTarget.style.transform =
                                                              "scale(1) translateY(0px)";
                                                            e.currentTarget.style.boxShadow =
                                                              "0 4px 10px rgba(0,0,0,0.25)";
                                                          }}
                                                           onClick={(e) => handle_allocate_popup( e, id, detail )}
                                                        >
                                                          執行分配
                                                        </div>
                                                      </div>
                                                      </div>
                                                    ))
                                                  }
                                                </div>
                                            }
                                        </li>                                                                           
                                       );
                                   })
                                }
                              </ul>
                            </div>
                          </div>  
                                    
                        ))                                                                        
                      }
                      {/* ---------------- 分頁按鈕 ---------------- */}
                      <div style={{ marginTop: 20 }}> 
                        <div className="flex justify-center items-center gap-4 mt-6 flex-wrap">
                          <button onClick={ () => prevPage("OK")} disabled={allocatePage === 1} style={{
                              backgroundColor: "#4CAF50",
                              color: "#fff",
                              border: "none",
                              padding: "6px 12px",
                              borderRadius: "5px",
                              cursor: "pointer"
                            }}>
                            ◀ Prev|上一頁
                          </button>
                          <span style={{ margin: "0 10px" }}>
                            Page {allocatePage >allocate_totalpage?allocate_totalpage:allocatePage} / {allocate_totalpage}                             
                          </span>
                          <button onClick={ ()=> nextPage("OK")} disabled={allocatePage === allocate_totalpage} style={{
                              backgroundColor: "#4CAF50",
                              color: "#fff",
                              border: "none",
                              padding: "6px 12px",
                              borderRadius: "5px",
                              cursor: "pointer"
                            }}>
                            Next|下一頁 ▶
                          </button>
                          <input
                            type="number"
                            placeholder="頁數"
                            value={allocatePage}
                            min={1}
                            onChange={(e) => setAllocatePage(e.target.value)}
                            className="w-8 px-1 py-1 border rounded"                             
                            onKeyDown={(e) => e.key === "Enter" && goToPage( "OK", Number(allocatePage))}
                          />
                              <button
                                onClick={() => goToPage( "OK", Number(allocatePage))}
                                className="px-3 py-1 bg-green-350 text-black rounded"
                              >
                                跳頁
                            </button>
                          </div>  
                       </div>
                      </div>
                      {/* 右邊 */}
                      <div
                        style={{
                          border: "5px solid #0e0e13",
                          borderRadius: 30,                          
                          padding: 20,
                          background: "#d48d8b",
                          minWidth: "180px",        
                          borderRadius: "10px",
                          boxShadow: "10px 10px 3px rgba(204, 170, 125, 0.69)"
                        }}
                      >
                      {
                        purchase_WaitItems.map((item, index) => (
                          <div key={index}>
                            <h2
                                style={{
                                fontSize: "30px",                                
                                marginBottom: 30,
                                color: "#0b044b",
                                borderBottom: "5px solid #555",
                                paddingBottom: 10,
                                width: 280
                              }}
                            >
                              待處理
                              {` 共 ${item.total} 筆單`}
                            </h2>
                            <div>                                                             
                               <strong>狀態:</strong>
                                {item.source} {` - 尚未交料`}
                            </div>
                            <div>
                                <strong>採購單號：</strong>
                                 <ul>
                                  {
                                    // item.form_ids
                                    //   ?.split(",")
                                    purchWAIT_formids
                                      .map((id, idx) => {
                                        const catchkey =  `${id}_${item.source}_0`;
                                        return (
                                          <li key={idx}>
                                            <div onClick={() => toggleGroup(id, item.source , 0)}
                                               style={{
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: "3px",                                                                                                
                                                  cursor: "pointer"
                                              }}
                                              >
                                            <span
                                              key={idx}
                                              style={{
                                                  marginBottom: 12,
                                                  fontSize: "18px",
                                                  color: "#071553",                                                
                                                  fontWeight: "bold",
                                                  backgroundColor:"#0FFE"
                                              }}                                               
                                            >{id}</span>
                                            <span
                                              style={{background:"#54f06e" ,transition:"1.3s" , transform: "translate(2px, -7px)",}}
                                              onMouseEnter={(e) => {
                                                    e.target.style.backgroundColor = "#eaebd7dc"; // hover 时的背景色变化
                                                  }}
                                                  onMouseLeave={(e) => {
                                                    e.target.style.backgroundColor = "#54f06e"; // 恢复原来的背景色
                                                  }}
                                            >
                                              {
                                              openGroup[catchkey]
                                                ? "▼"
                                                : "▲"
                                              }
                                            </span>                                         
                                            </div> 
                                            {
                                              <div
                                                style={{
                                                  maxHeight:
                                                  openGroup[catchkey]
                                                    ? "1550px"
                                                    : "0px",
                                                  opacity:
                                                  openGroup[catchkey]
                                                    ? 1
                                                    : 0,
                                                  overflow: "hidden",
                                                  transition:
                                                  "max-height 0.8s ease, opacity 0.5s ease",

                                                  marginTop:
                                                  openGroup[catchkey]
                                                    ? 10
                                                    : 0
                                                }}
                                              >
                                                {
                                                purchaseItemDetail[catchkey]?.map((detail, detailIndex) => (
                                                  <div
                                                    key={detailIndex}
                                                    style={{
                                                      marginTop: 3,
                                                      padding: 5,
                                                      background:"rgb(240, 240, 239)",
                                                      borderRadius: 8,
                                                      border: "1px solid #0e0202"
                                                    }}
                                                  >  
                                                      <div>
                                                          採購工序：
                                                          {detail.id}
                                                      </div>
                                                      <div>
                                                        品名：{detail.product_name}
                                                      </div>
                                                      <div>
                                                        編碼：{detail.item_code}
                                                        </div>
                                                      <div> 
                                                        規格：{detail.specification}                                                      
                                                      </div>                                                      
                                                        {/* Grid 區塊 */}
                                                        <div
                                                          style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr 1fr",
                                                            gap: "6px",
                                                            fontSize:"16px",
                                                            marginTop: 10,
                                                            background:"#FF0"
                                                          }}
                                                        >
                                                        <div>
                                                          數量：{detail.quantity}
                                                        </div>
                                                        <div>
                                                          單位：{detail.unit}
                                                        </div>
                                                        <div> 
                                                        供應商號:{detail.vendor_id}
                                                      </div>
                                                       </div>
                                                        {/* 新增內部紅色區塊 */}
                                                        <div
                                                          style={{
                                                            background: "#ff4d4f",
                                                            color: "#fff",
                                                            padding: "10px 12px",
                                                            borderRadius: 6,
                                                            marginBottom: 5,                                                             
                                                            marginLeft: "auto", // 推到右側
                                                            marginBottom: 5,
                                                            maxWidth:80,
                                                            transform: "translate(2px, 5px)",
                                                            transitionDuration: "0.5s",
                                                            // cursor: "pointer",
                                                            fontWeight: "bold"                                                    
                                                          }}
                                                        >
                                                          待處理
                                                        </div>                                                     
                                                  </div>
                                                  ))                                                  
                                                }
                                              </div>				  
                                            }
                                          </li>                                                                           
                                          );
                                        })
                                    }
                                  </ul>
                               </div>
                           </div>
                          ))
                          }
                          {/* ---------------- 分頁按鈕 ---------------- */}
                          <div style={{ marginTop: 20 }}> 
                            <div className="flex justify-center items-center gap-4 mt-6 flex-wrap">
                              <button onClick={ () => prevPage("WAIT")} disabled={waitfixPage === 1} style={{
                                  backgroundColor: "#df0517",
                                  color: "#fff",
                                  border: "none",
                                  padding: "6px 12px",
                                  borderRadius: "5px",
                                  cursor: "pointer"
                                }}>
                                ◀ Prev|上一頁
                              </button>
                              <span style={{ margin: "0 10px" }}>
                                Page {waitfixPage >waitFix_totalpage?waitFix_totalpage:waitfixPage} / {waitFix_totalpage}                             
                              </span>
                              <button onClick={ ()=> nextPage("WAIT")} disabled={waitfixPage === waitFix_totalpage} style={{
                                  backgroundColor: "#df0517",
                                  color: "#fff",
                                  border: "none",
                                  padding: "6px 12px",
                                  borderRadius: "5px",
                                  cursor: "pointer"
                                }}>
                                Next|下一頁 ▶
                              </button>
                              <input
                                type="number"
                                placeholder="頁數"
                                value={waitfixPage}
                                min={1}
                                onChange={(e) => setWaitfixPage(e.target.value)}
                                className="w-8 px-1 py-1 border rounded"                             
                                onKeyDown={(e) => e.key === "Enter" && goToPage( "WAIT", Number(waitfixPage))}
                              />
                                  <button
                                    onClick={() => goToPage( "WAIT", Number(waitfixPage))}
                                    className="px-3 py-1 bg-green-350 text-black rounded"
                                  >
                                    跳頁
                                </button>
                              </div>  
                           </div>                                          
                       </div>                        
                    </div>
                  </div>
                   {
                      open_allocate_popup &&  puchaes_allocatedata !== null && (
                        <Suspense fallback={<div>Loading...</div>}>                          
                          <AllocatPopup
                            show={open_allocate_popup}
                            onHide={handleAllocateOnHide}
                            centered={true}
                            allocat_data={puchaes_allocatedata}
                          />

                        </Suspense>
                      )
                   }
                   {/* MessagePopup 組件 */}
                    <MessagePopup
                      show={messagePopup.show}
                      type={messagePopup.type}
                      title={messagePopup.title}
                      message={messagePopup.message}
                      onHide={hideMessage}
                      autoClose={messagePopup.type === 'success'}
                      autoCloseDelay={3000}
                    />     
            </div>
     );
};


export default PurchasingStatusView;