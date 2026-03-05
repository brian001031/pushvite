import React, { useState, useEffect , Suspense ,useMemo } from "react";
import { Button, Table, Form, InputGroup, DropdownButton, Dropdown } from 'react-bootstrap';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from 'moment';
import 'moment/locale/zh-tw'; 
import config from '../../../config';
import axios from "axios";
import { useNavigate } from 'react-router-dom';
import { FormattedMessage, useIntl } from "react-intl";
//成功提示套件
import { toast } from "react-toastify";
import { useAuth } from "../../../context/GlobalProvider";
 const ConfirmSend_Modal = React.lazy(() => import("../../../components/ConfirmSend_Modal")); // 確認按鈕加載組件


const prescription_manerger = [
  { id: "003", name: "陳昱昇" },
  { id: "109", name: "黃之奕" },  
  { id: "349", name: "周柏全" },
  { id: "292", name: "張宇翔" }
];


/* ---------------- CardItem 元件 ---------------- */
const CardItem = ({ data }) => (
  <div
    style={{
    //  width: 150,
      padding: "15px",
      margin: 5,
      padding: 10,
      border: "5px solid #0d4a3b",
      borderRadius: 8,
      background: "#daf6f2",
      minWidth: "180px",        
      borderRadius: "10px",
      boxShadow: "10px 10px 3px rgba(204, 170, 125, 0.69)"
    }}
  >       
    <div style={{fontSize:"20px"}}> <span style={{fontSize:"20px" , background:"hsla(60, 68%, 85%, 0.93)" }}> 編碼:  </span> <b>{data.itemcode}</b></div>
    <div style={{fontSize:"20px"}}><span style={{fontSize:"20px" , background:"hsla(60, 24%, 93%, 0.93)" }}> 項目:  </span><b>{data.itemname}</b></div>
    <div style={{fontSize:"20px"}}><span style={{fontSize:"20px" , background:"hsla(60, 30%, 92%, 0.93)" }}>  單位計量: </span><b>{data.qty} {data.unit}</b></div>    
  </div>
);



/* ---------------- PrescriptionBlock 元件 ---------------- */
const PrescriptionBlock = ({ row }) => {
//   const items = Object.values(row.prescription_info || []);
  const cardsPerPage = 5;
  // 確保 prescription_info 是 JSON
  let items = [];

  const { user } = useAuth();

  try {
    items = typeof row.prescription_info === "string"
      ? JSON.parse(row.prescription_info)
      : row.prescription_info;
  } catch (err) {
    console.error("prescription_info parse error:", err);
  }

  const [modalIsOpen, setmodalIsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // 儲存要刪除的資料

  //卡片區設定以下
  const [cardIndex, setCardIndex] = useState(0);
  const [pie_chartisOpen, setPie_chartlIsOpen] = React.useState(false);
  const totalPages_lastget = Math.ceil(items.length / cardsPerPage);
  const startIndex = cardIndex * cardsPerPage;
  const currentItems = items.slice(
    startIndex,
    startIndex + cardsPerPage
  );

  const handleDeleteOnHide = (meg) => {
    setmodalIsOpen(false);
    setDeleteTarget(null); // 清掉舊資料

    if(meg ==="Yes")
    {
      toast.success("刪除成功!");  
    }else{
      // toast.success("取消刪除作業!");  
    }
    
  };

   const handlePieShow = () => {
    setPie_chartlIsOpen(true);
  };

  const handlePieOnHide = () => {
    setPie_chartlIsOpen(false);
  };

  const Delete_IsVaild_confirmmanerger = (user, work_memid , work_name) => {
        const LoginId = user && typeof user !==null? String(user.memberID).padStart(3, "0") : "";      
        const LoginName = user && typeof user !==null? String(user.reg_schedulename.trim()) :"";

        //當使用者登出狀態下
        if( LoginId ===null  || LoginName === null )
          return false;
        else if( work_memid && work_name) //比對配方過去紀錄提交者與對應當前登入者是否同才予以刪除
        {
            return  String(work_memid).padStart(3, "0") === LoginId &&  String(work_name.trim('')) === LoginName;
        }        
        // else{
        //     return prescription_manerger.some(
        //       (member) => member.id === LoginId && member.name === LoginName
        //   );
        // }                
   };

  const handleDelete = async (id ,mainform_code , memid , name) => {
	
    console.log("收到配方要刪除的ID 為 = "+ Number(id) + " 主單號為: " + String(mainform_code));

    //若登入者不是配方管理員身份者
    if(!Delete_IsVaild_confirmmanerger(user , memid , name)){
        toast.error(`登入者:${user?user.reg_schedulename:"無登入者"} , 沒有權限可刪除此筆混漿配方`);
        return;
    }

    console.log(`此身份:${name} Pass驗證過,可權限刪除配方OK ID為:${Number(id)}!`);


    // 權限通過 → 打開二次確認 Modal
    setDeleteTarget({ id, mainform_code, name });
    setmodalIsOpen(true);

	};

  const taipeiTime = moment.utc(row.create_date).tz("Asia/Taipei");
  const zhPeriod = taipeiTime.hour() < 12 ? "早上" : "下午";

  return (
    <div
      style={{
        border: "6px solid #071d04",
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "30px",
        background: "#fff"
      }}
    >  
      {/* 標題區 */}
      <div style={{ marginBottom: "35px" , background:"#e8fdda" }}>
        <h3>{row.mainform_code}</h3>
        <div>版本: {row.control_version}</div>
        <div>建立(日期/時間): {taipeiTime.format("YYYY-MM-DD")}{" "}{zhPeriod} {taipeiTime.format("hh:mm:ss")}</div> {/* 轉成本地時間（台灣會 +8）*/}
        <div>提交者: {row.submit_name}</div>
        <div>站別: {row.station.includes("Cathode")?"正極混漿Cathode":"負極混漿Anode"}</div>
         {/*圓餅圖區*/}
         <div >
          <button 
            style={{ marginLeft: 'auto'  , marginTop:"10px" , fontSize:"20px" ,borderRadius: '50px' ,padding: '8px 20px',backgroundColor: "#d2d6ba" ,color:"rgb(9, 102, 45)"}}
            
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#29ec64"; // hover 时的背景色变化
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#d2d6ba"; // 恢复原来的背景色
            }}
            onMouseDown={(e) => {
              e.target.style.transform = "scale(0.96)"; // 按下时的缩放效果
            }}
            onMouseUp={(e) => {
              e.target.style.transform = "scale(1)"; // 释放时恢复原始大小
            }}
            onClick={(event) => {
                  event.preventDefault();
                  handlePieShow();
            }}                        
           >分佈圖
          </button>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
      {/*刪除按鈕*/}
        <Button  style={{
          backgroundColor: "#c49ba4",
          padding: "0px 16px",
          color: "white",
          border: "none",
          fontSize: "16px", // 合适的字体大小
          borderRadius: "4px",
          cursor: "pointer",
          transition: "background-color 0.2s ease, transform 0.1s ease",
          position: "absolute", // 相对父元素定位
          right: "10px",
          bottom: "50px",
          margin: "0",
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = "#c21616"; // hover 时的背景色变化
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = "#c49ba4"; // 恢复原来的背景色
        }}
        onMouseDown={(e) => {
          e.target.style.transform = "scale(0.96)"; // 按下时的缩放效果
        }}
        onMouseUp={(e) => {
          e.target.style.transform = "scale(1)"; // 释放时恢复原始大小
        }}
        // 使用箭头函数传递回调函数
        onClick={() => handleDelete(row.ID || row.id , row.mainform_code , row.memberID, row.submit_name)} // 改为箭头函数
        >
              刪除此筆
        </Button>  
       </div>

      {/* 卡片區 */}
      <div
        style={{
          display: "flex",
          gap: "15px",
          alignItems: "center",
         
        }}
      >
        {/* 左箭頭 */}
        {totalPages_lastget > 1 && cardIndex > 0 && (
          <button onClick={() => setCardIndex(cardIndex - 1)} disabled={cardIndex === 0}>◀</button>
        )}

        {/* 卡片群 */}
        <div
          style={{
            display: "flex",
            gap: "15px",
            flexWrap: "nowrap"
          }}
        >
          {currentItems.map((item, index) => (
            <CardItem key={index} data={item} />
          ))}
        </div>

        {/* 右箭頭 */}
        {totalPages_lastget > 1 && cardIndex < totalPages_lastget - 1 && (
          <button onClick={() => setCardIndex(cardIndex + 1) } disabled={cardIndex  >= totalPages_lastget}>▶</button>
        )}
      </div>

      {/* 頁數顯示 */}
      {totalPages_lastget > 1 && (
        <div style={{ marginTop: "10px" }}>
          Page {cardIndex + 1} / {totalPages_lastget}
        </div>
      )}
      {modalIsOpen && deleteTarget ? (
        <Suspense fallback={<div>Loading...</div>}>
          <ConfirmSend_Modal
            show={modalIsOpen}
            onHide={handleDeleteOnHide}
            centered={true}
            deleteTarget={deleteTarget}
          />
        </Suspense>
      ) : null}    
    </div>  
                            
  );
}


export default function IngredientInfo () {    
    const navigate = useNavigate();
    const [option, setOption] = useState('');
    const MIN_DATE =  moment("2026-01-01");  // 2026-01-01 預設
    const defaultStartDate =  moment().locale("zh-tw").startOf("month");
    // 取兩者較早的日期
    const finalStartDate = moment.min(defaultStartDate, MIN_DATE);
    const [startDate, setStartDate] = useState(finalStartDate);
    const [endDay, setEndDay] = useState(moment().locale("zh-tw"));
    const [data, setData] = useState([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);    
    const [pageSize, setPageSize] = useState(3); // 每頁顯示 3 筆
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [inputPage, setInputPage] = useState(""); // 新增輸入頁狀態
    const [mainquery, serMainQuery] = useState({
      keyword: '',
      station: ''
    });

    const fetch_Mixing_Prescriptions = async (page = 1) => {
            setLoading(true);
        try {
            const res = await axios.get(
                // `${config.apiBaseUrl}/mixprocess/recipe_submit_info`,
                "http://localhost:3009/mixprocess/recipe_submit_info",
            {
                params: {
                  page,
                  pageSize,
                  keyword: mainquery.keyword, // 解构 mainquery
                  station: mainquery.station, // 解构 mainquery
                  stDate: moment(startDate).format("YYYY-MM-DD"),
                  edDate: moment(endDay).format("YYYY-MM-DD"),
                  sortOrder: 'desc' 
                }
            });

            // console.log("得到配方單總ROW為 = "+ JSON.stringify(res.data.data,null,2))

            setData(res.data.data);
            setTotalPages(res.data.totalPages);
            setPage(res.data.page);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

  useEffect(() => {
    fetch_Mixing_Prescriptions(page );
  }, [page ,mainquery]);


  const handleSearch = (e) => {
      e.preventDefault();

      // 防止選到開始日期或結束日期不符合順序的卡控
      if (moment(startDate) > moment(endDay)) {
          toast.error(`開始日期:${moment(startDate).format("YYYY-MM-DD")}不能比結束日期晚!`);
          return;              
      }else if (moment(endDay) < moment(startDate)) {
          toast.error(`結束日期:${moment(endDay).format("YYYY-MM-DD")}不能比開始日期早!`);
          return;
      }
      
      const side_option =
        String(option.trim()).includes("正極混漿")
        ? "MixingCathode"
        : String(option.trim()).includes("負極混漿")
        ? "MixingAnode"
        : String(option.trim());

      // 合并 keyword 和 station 更新
      serMainQuery({
          ...mainquery, // 保留之前的值
          keyword: searchTerm, // 更新 keyword
          station: side_option // 更新 station
      });
      setPage(1); // // 搜尋時回到第1頁
  };

  const handleDownload = async () => {
	
	
	};

  const goToPage = (page) => {
 
    // 防止超出範圍
    page > totalPages
      ? setPage(totalPages)
      : page < 1
      ? setPage(1)
      : setPage(page);

    setPage(page);   // Update the page state
    setInputPage(""); // 清空 input
  };

  const prevPage = () => setPage((p) => Math.max(p - 1, 1));
  const nextPage = () => setPage((p) => Math.min(p + 1, totalPages));

  const formatDate_local = (date) => {
	   const mDate = moment.isMoment(date) ? date.toDate() : date;
    const y = mDate.getFullYear();
    const m = String(mDate.getMonth() + 1).padStart(2, "0");
    const d = String(mDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  return (
    <div style={{ padding: 20  , width: "120%", margin: "0 auto"}}>
      <h2 style={{ padding:"2px" , marginTop:"10px", textAlign:"center" , fontStyle:"italic" , fontSize:"2.5em"}}>
        <FormattedMessage id="scrollingResearching.switchBar.RecipeTitle" defaultMessage="混漿配方紀錄" />
      </h2>
     {loading && <p>Loading...</p>}
     <div>      
       <InputGroup className="mb-3">
            <DropdownButton
                variant="outline-secondary"
                title={option || "全部資料"}
                id="input-group-dropdown-1"
            >
                <Dropdown.Item onClick={() => setOption('全部資料')}>全部資料</Dropdown.Item>
                <Dropdown.Item onClick={() => setOption('正極混漿')}>正極混漿</Dropdown.Item>
                <Dropdown.Item onClick={() => setOption('負極混漿')}>負極混漿</Dropdown.Item>
                <Dropdown.Item onClick={() => setOption('已刪除配方資訊')}>已刪除資訊</Dropdown.Item>
            </DropdownButton>
            <Form.Control
                aria-label="Text input with dropdown button"
                placeholder='請輸入欲查詢之工程師工號或配方主編號'
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        handleSearch(e);
                    }
                }}
            />
            <Button variant="primary" onClick={handleSearch}>
                搜尋
            </Button>
       </InputGroup>
       	<Form.Group controlId="change_handler" style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ marginRight: '1rem', display: 'flex', flexDirection: 'row', alignItems: 'center'}}> 
                    <div style={{marginRight: "1rem"}}>起始日期:</div>
                    <DatePicker
                        selected={startDate.toDate()}
                        minDate={MIN_DATE.toDate()}       // ✅ 最小日期限制                       
                        onChange={(date) => setStartDate(moment(date))}
                        dateFormat="yyyy/MM/dd"
                        className="form-control" 
                    />
                </div>
                <div style={{ marginRight: '1rem', display: 'flex', flexDirection: 'row', alignItems: 'center'}}> 
                    <div style={{marginRight: "1rem"}}>結束日期:</div>
                    <DatePicker
                        selected={endDay.toDate()}
                        minDate={MIN_DATE.toDate()}       // ✅ 最小日期限制 
                        onChange={(date) => setEndDay(moment(date))}
                        dateFormat="yyyy/MM/dd"
                        className="form-control"
                    />
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Button 
                        variant="btn btn-outline-primary"
                        onClick={handleDownload}
                    >
                        <i className="bi bi-arrow-left me-1"></i> 轉為Excel
                    </Button>
                
                </div>
                
            
            </Form.Group>
      </div>
      <div>
        {data.map((row) => (
          <PrescriptionBlock key={row.ID} row={row} />
        ))}
      </div>

      {/* ---------------- 分頁按鈕 ---------------- */}
      {/* <div style={{ marginTop: 20 }}> */}
      <div className="flex justify-center items-center gap-4 mt-6 flex-wrap">
        <button onClick={prevPage} disabled={page === 1}>
          ◀ Prev|上一頁
        </button>
        <span style={{ margin: "0 10px" }}>
          Page {page >totalPages?totalPages:page} / {totalPages}
        </span>
        <button onClick={nextPage} disabled={page === totalPages}>
          Next|下一頁 ▶
        </button>
        <input
          type="number"
          placeholder="頁數"
          value={inputPage}
          onChange={(e) => setInputPage(e.target.value)}
          className="w-8 px-1 py-1 border rounded"
          onKeyDown={(e) => e.key === "Enter" && goToPage(Number(inputPage))}
         />
            <button
              onClick={() => goToPage(Number(inputPage))}
              className="px-3 py-1 bg-green-350 text-black rounded"
            >
              跳頁
          </button>
        </div>
    </div>
  );
}




